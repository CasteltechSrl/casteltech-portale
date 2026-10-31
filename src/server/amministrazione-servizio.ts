/**
 * Amministrazione: lettura e salvataggio di dati dell'azienda, numerazioni, aliquote e condizioni di pagamento.
 * Il numero di un documento si prende SOLO qui (assegnaNumero), dentro una transazione: due persone che emettono
 * insieme non possono avere lo stesso numero e, se l'emissione fallisce, il numero non viene consumato.
 */
import type pg from 'pg';
import { q, q1 } from './db.js';
import { annoLetteraIntento, controllaDataNumerazione, preparaAzienda, preparaClienteFiscale, preparaDocumentoFic, preparaRicevutoFic, CAMPI_AZIENDA,
  type Aliquota, type DatiAzienda } from '../engine/amministrazione.js';
import { transazione } from './db.js';
import { Anteprima } from './anagrafiche-servizio.js';
import { INIZIO_DDT_DA_FATTURARE } from '../engine/ddt.js';

export async function caricaAzienda(): Promise<DatiAzienda> {
  const r = await q1<{ valore: Partial<DatiAzienda> }>(`SELECT valore FROM impostazioni WHERE chiave = 'azienda'`);
  return Object.fromEntries(CAMPI_AZIENDA.map(c => [c, String(r?.valore?.[c] ?? '')])) as DatiAzienda;
}

export async function salvaAzienda(input: Record<string, unknown>): Promise<string[]> {
  const { azienda, errori } = preparaAzienda(input);
  if (errori.length) return errori;
  await q(`INSERT INTO impostazioni (chiave, valore) VALUES ('azienda', $1) ON CONFLICT (chiave) DO UPDATE SET valore = $1, aggiornato_il = now()`, [JSON.stringify(azienda)]);
  return [];
}

export async function caricaAliquote(soloAttive = false): Promise<(Aliquota & { descrizione: string; ordine: number; attiva: boolean })[]> {
  return q(`SELECT * FROM aliquote_iva ${soloAttive ? 'WHERE attiva' : ''} ORDER BY ordine, codice`);
}

export const caricaCondizioniPagamento = (soloAttive = false) =>
  q<{ codice: string; descrizione: string; modalita: string; giorni: number; fine_mese: boolean; ordine: number; attiva: boolean }>(
    `SELECT * FROM condizioni_pagamento ${soloAttive ? 'WHERE attiva' : ''} ORDER BY ordine, codice`);

export const caricaNumerazioni = () =>
  q<{ tipo: string; sezionale: string; anno: number; ultimo_numero: number; ultima_data: string | null }>(
    `SELECT * FROM numerazioni ORDER BY anno DESC, tipo, sezionale`);

/**
 * Prende il numero successivo della serie (tipo + sezionale + anno) dentro la transazione del chiamante.
 * La riga della numerazione resta bloccata fino alla fine della transazione.
 */
export async function assegnaNumero(c: pg.PoolClient, tipo: string, sezionale: string, data: string): Promise<number> {
  const anno = Number(data.slice(0, 4));
  await c.query(`INSERT INTO numerazioni (tipo, sezionale, anno) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [tipo, sezionale, anno]);
  const n = (await c.query(`SELECT ultimo_numero, ultima_data FROM numerazioni WHERE tipo = $1 AND sezionale = $2 AND anno = $3 FOR UPDATE`,
    [tipo, sezionale, anno])).rows[0];
  const errore = controllaDataNumerazione(data, anno, n.ultima_data);
  if (errore) throw new Error(errore);
  const numero = n.ultimo_numero + 1;
  await c.query(`UPDATE numerazioni SET ultimo_numero = $4, ultima_data = $5 WHERE tipo = $1 AND sezionale = $2 AND anno = $3`,
    [tipo, sezionale, anno, numero, data]);
  return numero;
}

// ── Dati fiscali dei clienti da Fatture in Cloud ──

/** Campi fiscali del cliente aggiornati dal file (quelli vuoti nel file non cancellano i dati del portale). */
const CAMPI_FISCALI = ['partita_iva', 'codice_fiscale', 'indirizzo', 'cap', 'comune', 'provincia', 'nazione', 'codice_sdi', 'pec',
  'email_amministrazione', 'banca_appoggio', 'aliquota_iva', 'pubblica_amministrazione'] as const;

export interface EsitoClientiFiscali {
  aggiornati: number; uguali: number; nonInAnagrafica: string[]; avvisi: { nome: string; avviso: string }[];
  condizioniNuove: string[]; lettereNuove: number; anteprima: boolean;
}

/**
 * Carica indirizzo, P.IVA, codice SDI, PEC, pagamento, aliquota e lettere d'intento dei clienti dall'export di FIC
 * (file clienti_fiscali_fic.json.gz preparato da Claude). Solo i clienti GIÀ in anagrafica (stessa P.IVA, stesso nome
 * o nome alias): gli altri si elencano e non si aggiungono (regola delle anagrafiche).
 */
export async function caricaClientiFiscali(righe: unknown[], opz: { anteprima?: boolean } = {}): Promise<EsitoClientiFiscali> {
  try {
    return await transazione(async c => {
      const esito: EsitoClientiFiscali = { aggiornati: 0, uguali: 0, nonInAnagrafica: [], avvisi: [], condizioniNuove: [], lettereNuove: 0, anteprima: false };
      for (const r of righe) {
        const { cliente: f, avvisi } = preparaClienteFiscale(r ?? {});
        if (!f.ragione_sociale) continue;
        const trovato = (await c.query(
          `SELECT id, 1 AS ordine FROM clienti WHERE $1::text IS NOT NULL AND regexp_replace(upper(coalesce(partita_iva, '')), '^IT|[^A-Z0-9]', '', 'g') = $1
           UNION ALL SELECT id, 2 FROM clienti WHERE upper(ragione_sociale) = $2
           UNION ALL SELECT cliente_id, 3 FROM alias_clienti WHERE nome = $2
           ORDER BY ordine LIMIT 1`, [f.partita_iva, f.ragione_sociale])).rows[0];
        if (!trovato) { esito.nonInAnagrafica.push(f.ragione_sociale); continue; }
        avvisi.forEach(a => esito.avvisi.push({ nome: f.ragione_sociale, avviso: a }));
        if (f.condizione) {
          const nuova = await c.query(`INSERT INTO condizioni_pagamento (codice, descrizione, modalita, giorni, fine_mese, ordine)
            VALUES ($1, $2, $3, $4, $5, 50) ON CONFLICT (codice) DO NOTHING`,
            [f.condizione.codice, f.condizione.descrizione, f.condizione.modalita, f.condizione.giorni, f.condizione.fine_mese]);
          if (nuova.rowCount) esito.condizioniNuove.push(f.condizione.descrizione);
        }
        const prima = (await c.query(`SELECT * FROM clienti WHERE id = $1`, [trovato.id])).rows[0];
        const valori: Record<string, unknown> = { ...Object.fromEntries(CAMPI_FISCALI.map(k => [k, f[k] ?? prima[k]])),
          condizione_pagamento: f.condizione?.codice ?? prima.condizione_pagamento };
        // la P.IVA del portale non si sovrascrive se c'è già (è quella usata per riconoscere il cliente)
        if (prima.partita_iva) valori.partita_iva = prima.partita_iva;
        const chiavi = Object.keys(valori);
        if (chiavi.some(k => (prima[k] ?? null) !== (valori[k] ?? null))) {
          await c.query(`UPDATE clienti SET ${chiavi.map((k, i) => `${k} = $${i + 2}`).join(', ')}, aggiornato_il = now() WHERE id = $1`,
            [trovato.id, ...chiavi.map(k => valori[k])]);
          esito.aggiornati++;
        } else esito.uguali++;
        if (f.intento) {
          const l = await c.query(`INSERT INTO dichiarazioni_intento (cliente_id, protocollo, data_protocollo, anno, note)
            VALUES ($1, $2, $3, $4, 'Da Fatture in Cloud: plafond da inserire') ON CONFLICT (protocollo) DO NOTHING`,
            [trovato.id, f.intento.protocollo, f.intento.data, annoLetteraIntento(f.intento.data)]);
          esito.lettereNuove += l.rowCount ?? 0;
        }
      }
      if (opz.anteprima) throw new Anteprima(esito);
      return esito;
    });
  } catch (e) {
    if (e instanceof Anteprima) return { ...e.esito, anteprima: true };
    throw e;
  }
}

// ── Storico dei documenti da Fatture in Cloud ──

export interface EsitoStorico {
  documenti: Record<string, { nuovi: number; aggiornati: number }>; ricevuti: { nuovi: number; aggiornati: number };
  senzaAnagrafica: string[]; fornitoriSenzaAnagrafica: number; ddtDaFatturare: number;
  daIncassare: { numero: number; importo: number }; daPagare: { numero: number; importo: number };
  numerazioni: string[]; errori: string[]; anteprima: boolean;
}

const NOMI_STORICO: Record<string, string> = { fattura: 'fatture', nota_credito: 'note di credito', autofattura: 'autofatture', ddt: 'DDT' };

/**
 * Carica fatture, note di credito, autofatture, DDT e documenti ricevuti esportati da FIC (file storico_fic.json.gz).
 * Ricaricare il file aggiorna i documenti già presenti (stesso id di FIC) senza duplicarli. I clienti si collegano solo
 * se sono in anagrafica (P.IVA, nome o alias); altrimenti il documento resta con i dati dell'intestatario e basta.
 * Alla fine le numerazioni salgono all'ultimo numero di FIC (mai scendono).
 */
export async function caricaStoricoFic(dati: { documenti?: unknown[]; ricevuti?: unknown[] }, opz: { anteprima?: boolean } = {}): Promise<EsitoStorico> {
  try {
    return await transazione(async c => {
      const esito: EsitoStorico = { documenti: {}, ricevuti: { nuovi: 0, aggiornati: 0 }, senzaAnagrafica: [], fornitoriSenzaAnagrafica: 0,
        ddtDaFatturare: 0, daIncassare: { numero: 0, importo: 0 }, daPagare: { numero: 0, importo: 0 }, numerazioni: [], errori: [], anteprima: false };
      const senza = new Set<string>();
      const clienti = new Map<string, number | null>();
      const cliente = async (i: Record<string, string>): Promise<number | null> => {
        const piva = (i.partita_iva ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^IT(?=\d{11}$)/, '') || null;
        const nome = (i.ragione_sociale ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
        const chiave = `${piva}|${nome}`;
        if (!clienti.has(chiave)) {
          const t = (await c.query(
            `SELECT id, 1 AS ordine FROM clienti WHERE $1::text IS NOT NULL AND regexp_replace(upper(coalesce(partita_iva, '')), '^IT|[^A-Z0-9]', '', 'g') = $1
             UNION ALL SELECT id, 2 FROM clienti WHERE upper(ragione_sociale) = $2
             UNION ALL SELECT cliente_id, 3 FROM alias_clienti WHERE nome = $2
             ORDER BY ordine LIMIT 1`, [piva, nome])).rows[0];
          clienti.set(chiave, t?.id ?? null);
          if (!t && nome) senza.add(nome);
        }
        return clienti.get(chiave)!;
      };
      const fornitori = new Map<string, number | null>();
      const fornitore = async (piva: string | null): Promise<number | null> => {
        if (!piva) return null;
        if (!fornitori.has(piva)) fornitori.set(piva, (await c.query(
          `SELECT id FROM fornitori_anagrafica WHERE regexp_replace(upper(partita_iva), '^IT(?=[0-9]{11}$)|[^A-Z0-9]', '', 'g') = $1 LIMIT 1`, [piva])).rows[0]?.id ?? null);
        return fornitori.get(piva)!;
      };
      const pivaDi = (i: Record<string, string>) => (i.partita_iva ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^IT(?=\d{11}$)/, '') || null;

      const collegamenti: { id: number; fattura_fic_id: number | null; citata: { numero: number; anno: number } | null }[] = [];
      for (const x of dati.documenti ?? []) {
        const { documento: d, errore } = preparaDocumentoFic(x);
        if (!d) { esito.errori.push(errore!); continue; }
        const cliente_id = d.tipo === 'autofattura' ? null : await cliente(d.intestatario);
        const fornitore_id = d.tipo === 'autofattura' ? await fornitore(pivaDi(d.intestatario)) : null;
        // un documento del portale con lo stesso numero non si tocca
        const doppio = (await c.query(`SELECT 1 FROM documenti WHERE tipo = $1 AND sezionale = $2 AND anno = $3 AND numero = $4 AND fic_id IS DISTINCT FROM $5`,
          [d.tipo, d.sezionale, d.anno, d.numero, d.fic_id])).rowCount;
        if (doppio) { esito.errori.push(`${NOMI_STORICO[d.tipo]} n. ${d.numero}/${d.anno}: numero già usato da un documento del portale, saltato`); continue; }
        const r = (await c.query(
          `INSERT INTO documenti (tipo, tipo_sdi, sezionale, anno, numero, data, stato, cliente_id, fornitore_id, intestatario, causale, note,
             imponibile, imposta, bollo, totale, dati_trasporto, origine, fic_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'fic', $18)
           ON CONFLICT (fic_id) DO UPDATE SET tipo_sdi = $2, sezionale = $3, anno = $4, numero = $5, data = $6, stato = $7, cliente_id = $8,
             fornitore_id = $9, intestatario = $10, causale = $11, note = $12, imponibile = $13, imposta = $14, bollo = $15, totale = $16,
             dati_trasporto = $17, aggiornato_il = now()
           RETURNING id, (xmax = 0) AS nuovo`,
          [d.tipo, d.tipo_sdi, d.sezionale, d.anno, d.numero, d.data, d.stato, cliente_id, fornitore_id, JSON.stringify(d.intestatario), d.causale, d.note,
           d.imponibile, d.imposta, d.bollo, d.totale, d.dati_trasporto && JSON.stringify(d.dati_trasporto), d.fic_id])).rows[0];
        const conta = (esito.documenti[NOMI_STORICO[d.tipo]] ??= { nuovi: 0, aggiornati: 0 });
        if (r.nuovo) conta.nuovi++;
        else {
          conta.aggiornati++;
          await c.query(`DELETE FROM documenti_righe WHERE documento_id = $1`, [r.id]);
          await c.query(`DELETE FROM documenti_scadenze WHERE documento_id = $1`, [r.id]);
        }
        if (d.righe.length) await c.query(
          `INSERT INTO documenti_righe (documento_id, posizione, solo_descrizione, prodotto_id, codice, descrizione, quantita, um, prezzo, sconto, aliquota_iva)
           SELECT $1, r.posizione, r.solo_descrizione,
             (SELECT p.id FROM prodotti p WHERE p.cliente_id = $2 AND upper(p.codice) = upper(r.codice) LIMIT 1),
             r.codice, r.descrizione, r.quantita, r.um, r.prezzo, r.sconto, (SELECT a.codice FROM aliquote_iva a WHERE a.codice = r.aliquota_iva)
           FROM jsonb_to_recordset($3::jsonb) AS r(posizione int, solo_descrizione boolean, codice text, descrizione text, quantita numeric,
             um text, prezzo numeric, sconto numeric, aliquota_iva text)`, [r.id, cliente_id, JSON.stringify(d.righe)]);
        if (d.scadenze.length) await c.query(
          `INSERT INTO documenti_scadenze (documento_id, data, importo, modalita, pagata_il, conto)
           SELECT $1, s.data, s.importo, $2, s.pagata_il, s.conto FROM jsonb_to_recordset($3::jsonb) AS s(data date, importo numeric, pagata_il date, conto text)`,
          [r.id, d.modalita ?? 'MP05', JSON.stringify(d.scadenze)]);
        if (d.fattura_fic_id || d.fattura_citata) collegamenti.push({ id: r.id, fattura_fic_id: d.fattura_fic_id, citata: d.fattura_citata });
      }
      // DDT → fattura in cui è stato unito; nota di credito → fattura citata nell'oggetto
      for (const k of collegamenti) {
        if (k.fattura_fic_id) await c.query(`UPDATE documenti SET fattura_id = (SELECT id FROM documenti WHERE fic_id = $2) WHERE id = $1`, [k.id, k.fattura_fic_id]);
        if (k.citata) await c.query(`UPDATE documenti SET documento_origine_id = (SELECT id FROM documenti WHERE tipo = 'fattura' AND sezionale = '' AND anno = $2 AND numero = $3)
          WHERE id = $1`, [k.id, k.citata.anno, k.citata.numero]);
      }
      // DDT fatturati scrivendo nella fattura la riga "DDT n. 86 del 27/04/2026" invece di unirli
      await c.query(
        `UPDATE documenti d SET fattura_id = f.id
         FROM documenti_righe r JOIN documenti f ON f.id = r.documento_id AND f.tipo = 'fattura',
           LATERAL regexp_match(r.descrizione, 'DDT\\s+n\\.?\\s*(\\d+)\\s+del\\s+(\\d{1,2})/(\\d{1,2})/(\\d{4})', 'i') m
         WHERE d.tipo = 'ddt' AND d.fattura_id IS NULL AND m IS NOT NULL AND r.descrizione ILIKE 'DDT%'
           AND d.numero = m[1]::int AND d.data = make_date(m[4]::int, m[3]::int, m[2]::int)`);

      for (const x of dati.ricevuti ?? []) {
        const { documento: d, errore } = preparaRicevutoFic(x);
        if (!d) { esito.errori.push(errore!); continue; }
        const fornitore_id = await fornitore(d.partita_iva);
        if (!fornitore_id) esito.fornitoriSenzaAnagrafica++;
        const r = (await c.query(
          `INSERT INTO documenti_ricevuti (tipo, numero, data, fornitore_id, intestatario, descrizione, categoria, imponibile, imposta, totale, elettronica, origine, fic_id,
             ritenuta, netto_a_pagare)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'fic', $12, $13, $14)
           ON CONFLICT (fic_id) DO UPDATE SET tipo = $1, numero = $2, data = $3, fornitore_id = $4, intestatario = $5, descrizione = $6, categoria = $7,
             imponibile = $8, imposta = $9, totale = $10, elettronica = $11, ritenuta = $13, netto_a_pagare = $14, aggiornato_il = now()
           RETURNING id, (xmax = 0) AS nuovo`,
          [d.tipo, d.numero, d.data, fornitore_id, JSON.stringify(d.intestatario), d.descrizione, d.categoria, d.imponibile, d.imposta, d.totale, d.elettronica, d.fic_id,
           d.ritenuta, d.netto_a_pagare])).rows[0];
        if (r.nuovo) esito.ricevuti.nuovi++;
        else { esito.ricevuti.aggiornati++; await c.query(`DELETE FROM documenti_ricevuti_scadenze WHERE documento_id = $1`, [r.id]); }
        if (d.scadenze.length) await c.query(
          `INSERT INTO documenti_ricevuti_scadenze (documento_id, data, importo, pagata_il, conto)
           SELECT $1, s.data, s.importo, s.pagata_il, s.conto FROM jsonb_to_recordset($2::jsonb) AS s(data date, importo numeric, pagata_il date, conto text)`,
          [r.id, JSON.stringify(d.scadenze)]);
      }

      // numerazioni: salgono all'ultimo numero (e data) di FIC per ogni serie, mai scendono
      const serie = (await c.query(
        `SELECT DISTINCT ON (tipo, sezionale, anno) tipo, sezionale, anno, numero, data::text AS data FROM documenti
         WHERE origine = 'fic' ORDER BY tipo, sezionale, anno, numero DESC`)).rows;
      for (const s of serie) {
        const n = await c.query(
          `INSERT INTO numerazioni (tipo, sezionale, anno, ultimo_numero, ultima_data) VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (tipo, sezionale, anno) DO UPDATE SET ultimo_numero = $4, ultima_data = $5 WHERE numerazioni.ultimo_numero < $4`,
          [s.tipo, s.sezionale, s.anno, s.numero, s.data]);
        if (n.rowCount) esito.numerazioni.push(`${NOMI_STORICO[s.tipo]} ${s.anno}${s.sezionale ? ' ' + s.sezionale : ''}: ultimo n. ${s.numero}`);
      }
      esito.ddtDaFatturare = Number((await c.query(`SELECT count(*) FROM documenti WHERE tipo = 'ddt' AND fattura_id IS NULL AND origine = 'fic' AND data >= '${INIZIO_DDT_DA_FATTURARE}'`)).rows[0].count);
      const aperte = (await c.query(
        `SELECT count(*)::int AS numero, coalesce(sum(CASE WHEN d.tipo = 'nota_credito' THEN -s.importo ELSE s.importo END), 0)::float AS importo
         FROM documenti_scadenze s JOIN documenti d ON d.id = s.documento_id WHERE s.pagata_il IS NULL`)).rows[0];
      esito.daIncassare = { numero: aperte.numero, importo: Math.round(aperte.importo * 100) / 100 };
      const dapagare = (await c.query(
        `SELECT count(*)::int AS numero, coalesce(sum(CASE WHEN d.tipo = 'nota_credito' THEN -s.importo ELSE s.importo END), 0)::float AS importo
         FROM documenti_ricevuti_scadenze s JOIN documenti_ricevuti d ON d.id = s.documento_id WHERE s.pagata_il IS NULL`)).rows[0];
      esito.daPagare = { numero: dapagare.numero, importo: Math.round(dapagare.importo * 100) / 100 };
      esito.senzaAnagrafica = [...senza].sort();
      if (opz.anteprima) throw new Anteprima(esito);
      return esito;
    });
  } catch (e) {
    if (e instanceof Anteprima) return { ...e.esito, anteprima: true };
    throw e;
  }
}
