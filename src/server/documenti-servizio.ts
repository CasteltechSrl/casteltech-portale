/**
 * Fatture e note di credito emesse dal portale: bozza → emissione (numero, scadenze, XML FatturaPA).
 * Il numero si prende solo all'emissione, nella stessa transazione che genera l'XML: se l'XML ha errori
 * la transazione si annulla e il numero non si consuma.
 */
import type pg from 'pg';
import { q, q1, transazione } from './db.js';
import { assegnaNumero, caricaAliquote, caricaAzienda } from './amministrazione-servizio.js';
import { calcolaScadenza, calcolaTotali, numeroCompleto, siglaNazione, type Aliquota } from '../engine/amministrazione.js';
import { generaAutofatturaXml, generaFatturaXml, type ClienteXml, type DocumentoXml, type EsitoXml } from '../engine/fatturapa.js';
import { righeDaModulo } from '../engine/documenti.js';

export const TIPI_EMISSIBILI = ['fattura', 'nota_credito'] as const;
export type TipoEmissibile = typeof TIPI_EMISSIBILI[number];

const oggiRoma = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });

/** Nuova bozza per un cliente in anagrafica, con condizione di pagamento del cliente. */
export async function creaBozza(tipo: TipoEmissibile, clienteId: number, creatoDa: number | null, data = oggiRoma()): Promise<number> {
  const c = await q1(`SELECT id, condizione_pagamento FROM clienti WHERE id = $1`, [clienteId]);
  if (!c) throw new Error('Cliente non trovato');
  const r = await q1<{ id: number }>(`INSERT INTO documenti (tipo, tipo_sdi, anno, data, cliente_id, condizione_pagamento, creato_da)
    VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [tipo, tipo === 'nota_credito' ? 'TD04' : 'TD01', Number(data.slice(0, 4)), data, clienteId, c.condizione_pagamento, creatoDa]);
  return r!.id;
}

/** Nota di credito (bozza) che storna una fattura emessa: stesse righe, collegata alla fattura. */
export async function creaNotaCredito(fatturaId: number, creatoDa: number | null): Promise<number> {
  return transazione(async c => {
    const f = (await c.query(`SELECT * FROM documenti WHERE id = $1 AND tipo = 'fattura' AND numero IS NOT NULL`, [fatturaId])).rows[0];
    if (!f) throw new Error('Si può stornare solo una fattura emessa.');
    if (!f.cliente_id) throw new Error('La fattura non è collegata a un cliente in anagrafica.');
    const data = oggiRoma();
    const id = (await c.query(`INSERT INTO documenti (tipo, tipo_sdi, anno, data, cliente_id, condizione_pagamento, documento_origine_id, causale, creato_da)
      VALUES ('nota_credito', 'TD04', $1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [Number(data.slice(0, 4)), data, f.cliente_id, f.condizione_pagamento, f.id,
       `Nota di credito relativa alla fattura n. ${numeroCompleto(f.numero, f.sezionale)} del ${f.data.split('-').reverse().join('/')}`, creatoDa])).rows[0].id;
    await c.query(`INSERT INTO documenti_righe (documento_id, posizione, solo_descrizione, prodotto_id, codice, descrizione, quantita, um, prezzo, sconto, aliquota_iva)
      SELECT $1, posizione, solo_descrizione, prodotto_id, codice, descrizione, quantita, um, prezzo, sconto, aliquota_iva
      FROM documenti_righe WHERE documento_id = $2 AND NOT (solo_descrizione AND descrizione ILIKE 'DDT%')`, [id, f.id]);
    return id;
  });
}

/** Salva intestazione e righe di una bozza. */
export async function salvaBozza(id: number, b: any): Promise<string[]> {
  const { righe, errori } = righeDaModulo(b.righe ?? []);
  const data = String(b.data ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) errori.push('Data non valida.');
  if (errori.length) return errori;
  await transazione(async c => {
    const d = (await c.query(`SELECT stato FROM documenti WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (d?.stato !== 'bozza') throw new Error('Il documento è già emesso: non si modifica.');
    // un documento scartato dallo SdI e riaperto tiene numero e data (si rimanda con gli stessi)
    await c.query(`UPDATE documenti SET data = CASE WHEN numero IS NULL THEN $2::date ELSE data END,
      anno = CASE WHEN numero IS NULL THEN $3 ELSE anno END, condizione_pagamento = $4, causale = $5, riferimento_esterno = $6, note = $7, aggiornato_il = now()
      WHERE id = $1`, [id, data, Number(data.slice(0, 4)), String(b.condizione_pagamento ?? '') || null, String(b.causale ?? '').trim() || null,
      String(b.riferimento_esterno ?? '').trim() || null, String(b.note ?? '').trim() || null]);
    await c.query(`DELETE FROM documenti_righe WHERE documento_id = $1`, [id]);
    if (righe.length) await c.query(
      `INSERT INTO documenti_righe (documento_id, posizione, solo_descrizione, prodotto_id, codice, descrizione, quantita, um, prezzo, sconto, aliquota_iva, ddt_id)
       SELECT $1, r.posizione, r.solo_descrizione, r.prodotto_id, r.codice, r.descrizione, r.quantita, r.um, r.prezzo, r.sconto,
         (SELECT codice FROM aliquote_iva WHERE codice = r.aliquota_iva), (SELECT id FROM documenti WHERE id = r.ddt_id AND tipo = 'ddt')
       FROM jsonb_to_recordset($2::jsonb) AS r(posizione int, solo_descrizione boolean, prodotto_id int, codice text, descrizione text, quantita numeric,
         um text, prezzo numeric, sconto numeric, aliquota_iva text, ddt_id int)`, [id, JSON.stringify(righe)]);
  });
  return [];
}

/** DDT del cliente non ancora fatturati (né già messi in un'altra bozza). */
export const ddtDaFatturare = (clienteId: number, esclusoDocumento: number) => q<{ id: number; numero: number; data: string; righe: number; causale: string | null }>(
  `SELECT d.id, d.numero, d.data, (SELECT count(*)::int FROM documenti_righe r WHERE r.documento_id = d.id) AS righe, d.dati_trasporto->>'causale' AS causale
   FROM documenti d WHERE d.tipo = 'ddt' AND d.cliente_id = $1 AND d.fattura_id IS NULL AND d.stato <> 'annullato'
     AND NOT EXISTS (SELECT 1 FROM documenti_righe r JOIN documenti x ON x.id = r.documento_id
                     WHERE r.ddt_id = d.id AND x.id <> $2 AND x.stato <> 'annullato')
   ORDER BY d.data, d.numero`, [clienteId, esclusoDocumento]);

/** Aggiunge in fondo alla bozza le righe dei DDT scelti, ciascuno preceduto dalla riga "DDT n. X del gg/mm/aaaa". */
export async function aggiungiDdt(id: number, ddtIds: number[]): Promise<number> {
  return transazione(async c => {
    const d = (await c.query(`SELECT stato, cliente_id FROM documenti WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (d?.stato !== 'bozza') throw new Error('Il documento è già emesso: non si modifica.');
    let pos = Number((await c.query(`SELECT coalesce(max(posizione), 0) AS p FROM documenti_righe WHERE documento_id = $1`, [id])).rows[0].p);
    let aggiunti = 0;
    for (const ddtId of ddtIds) {
      const t = (await c.query(`SELECT id, numero, data FROM documenti WHERE id = $1 AND tipo = 'ddt' AND cliente_id = $2 AND fattura_id IS NULL`, [ddtId, d.cliente_id])).rows[0];
      if (!t) continue;
      await c.query(`INSERT INTO documenti_righe (documento_id, posizione, solo_descrizione, descrizione, quantita, prezzo, ddt_id)
        VALUES ($1, $2, true, $3, 1, 0, $4)`, [id, ++pos, `DDT n. ${t.numero} del ${t.data.split('-').reverse().join('/')}`, t.id]);
      const r = await c.query(`INSERT INTO documenti_righe (documento_id, posizione, solo_descrizione, prodotto_id, codice, descrizione, quantita, um, prezzo, sconto, aliquota_iva, riga_ordine_id, commessa_id, ddt_id)
        SELECT $1, $2 + row_number() OVER (ORDER BY posizione), solo_descrizione, prodotto_id, codice, descrizione, quantita, um, prezzo, sconto, aliquota_iva, riga_ordine_id, commessa_id, $3
        FROM documenti_righe WHERE documento_id = $3 ORDER BY posizione`, [id, pos, t.id]);
      pos += r.rowCount ?? 0;
      aggiunti++;
    }
    return aggiunti;
  });
}

/** Tutto quello che serve per l'XML di un documento (bozza o emesso). */
async function datiXml(c: pg.PoolClient | null, id: number, numero?: number) {
  const query = (sql: string, p: unknown[]) => (c ? c.query(sql, p).then(r => r.rows) : q(sql, p));
  const [d] = await query(`SELECT d.*, cp.giorni, cp.fine_mese, cp.modalita FROM documenti d
    LEFT JOIN condizioni_pagamento cp ON cp.codice = d.condizione_pagamento WHERE d.id = $1`, [id]);
  if (!d) throw new Error('Documento non trovato');
  const [cliente] = await query(`SELECT * FROM clienti WHERE id = $1`, [d.cliente_id]);
  const righe = await query(`SELECT r.*, t.numero AS ddt_numero, t.data AS ddt_data FROM documenti_righe r
    LEFT JOIN documenti t ON t.id = r.ddt_id WHERE r.documento_id = $1 ORDER BY r.posizione`, [id]);
  const [origine] = d.documento_origine_id ? await query(`SELECT numero, sezionale, data FROM documenti WHERE id = $1`, [d.documento_origine_id]) : [];
  const anno = Number(String(d.data).slice(0, 4));
  const [intento] = cliente ? await query(`SELECT id, protocollo, data_protocollo FROM dichiarazioni_intento WHERE cliente_id = $1 AND anno = $2
    ORDER BY data_protocollo DESC LIMIT 1`, [cliente.id, anno]) : [];
  const aliquote: Aliquota[] = await caricaAliquote();
  const azienda = await caricaAzienda();
  const predefinita = cliente?.aliquota_iva || 'IVA22';
  const totali = calcolaTotali(righe.map((r: any) => ({ ...r, aliquota_iva: r.aliquota_iva })), aliquote, predefinita);
  const scadenze = d.condizione_pagamento && totali.totale > 0
    ? [{ data: calcolaScadenza(d.data, { giorni: d.giorni, fine_mese: d.fine_mese }), importo: totali.totale, modalita: d.modalita }] : [];
  const documento: DocumentoXml = {
    id: d.id, tipo: d.tipo, numero: numero ?? d.numero, sezionale: d.sezionale, data: d.data, causale: d.causale, riferimento_esterno: d.riferimento_esterno,
    righe: righe.map((r: any) => ({ codice: r.codice, descrizione: r.descrizione, quantita: r.quantita, um: r.um, prezzo: r.prezzo, sconto: r.sconto,
      aliquota_iva: r.aliquota_iva, solo_descrizione: r.solo_descrizione,
      ddt: r.ddt_id && !r.solo_descrizione ? { numero: String(r.ddt_numero), data: r.ddt_data } : null })),
    scadenze, origine: origine ? { numero: numeroCompleto(origine.numero, origine.sezionale), data: origine.data } : null,
    intento: intento ? { protocollo: intento.protocollo, data: intento.data_protocollo } : null, aliquota_predefinita: predefinita,
  };
  const clienteXml: ClienteXml = cliente ? { ...cliente, nazione: cliente.nazione || 'IT' } : { ragione_sociale: '' };
  if (!d.condizione_pagamento) totali.errori.push('Manca la condizione di pagamento.');
  return { d, cliente, documento, clienteXml, azienda, aliquote, intento, totali };
}

/** XML del documento (fattura / nota di credito al cliente, autofattura sul fornitore estero) con quello che si salva all'emissione. */
async function preparaXml(c: pg.PoolClient | null, id: number, numero: number) {
  const query = (sql: string, p: unknown[]) => (c ? c.query(sql, p).then(r => r.rows) : q(sql, p));
  const [t] = await query(`SELECT tipo FROM documenti WHERE id = $1`, [id]);
  if (t?.tipo === 'autofattura') {
    const [d] = await query(`SELECT * FROM documenti WHERE id = $1`, [id]);
    const [f] = await query(`SELECT * FROM fornitori_anagrafica WHERE id = $1`, [d.fornitore_id]);
    const [ricevuto] = d.ricevuto_id ? await query(`SELECT numero, data FROM documenti_ricevuti WHERE id = $1`, [d.ricevuto_id]) : [];
    const righe = await query(`SELECT * FROM documenti_righe WHERE documento_id = $1 ORDER BY posizione`, [id]);
    const [aliquote, azienda] = [await caricaAliquote(), await caricaAzienda()];
    const fornitore = f ? { ...f, nazione: siglaNazione(f.paese) ?? '' } : { ragione_sociale: '', nazione: '' };
    const esito = generaAutofatturaXml({ id, tipo_sdi: d.tipo_sdi, numero, sezionale: d.sezionale, data: d.data, causale: d.causale,
      righe: righe.map((r: any) => ({ codice: r.codice, descrizione: r.descrizione, quantita: r.quantita, um: r.um, prezzo: r.prezzo, sconto: r.sconto,
        aliquota_iva: r.aliquota_iva, solo_descrizione: r.solo_descrizione })),
      fattura: ricevuto ? { numero: ricevuto.numero, data: ricevuto.data } : null }, fornitore, azienda, aliquote);
    if (!f) esito.errori.push('Manca il fornitore.');
    const intestatario = Object.fromEntries(['ragione_sociale', 'partita_iva', 'codice_fiscale', 'indirizzo', 'cap', 'comune', 'provincia', 'nazione']
      .map(k => [k, (fornitore as any)[k] ?? null]).filter(([, v]) => v));
    return { esito, erroriExtra: [] as string[], intestatario, scadenze: [] as DocumentoXml['scadenze'], intentoId: null };
  }
  const x = await datiXml(c, id, numero);
  const esito = generaFatturaXml(x.documento, x.clienteXml, x.azienda, x.aliquote);
  const intestatario = Object.fromEntries(['ragione_sociale', 'partita_iva', 'codice_fiscale', 'indirizzo', 'cap', 'comune', 'provincia', 'nazione', 'codice_sdi', 'pec']
    .map(k => [k, x.cliente?.[k] ?? null]).filter(([, v]) => v));
  return { esito, erroriExtra: x.totali.errori.filter(e => /condizione di pagamento/.test(e)), intestatario, scadenze: x.documento.scadenze,
    intentoId: esito.totali.riepilogo.some(g => g.natura === 'N3.5') ? x.intento?.id ?? null : null };
}

/** Anteprima: totali ed errori dell'XML (senza numero, che si prende all'emissione). */
export async function anteprimaDocumento(id: number): Promise<{ esito: EsitoXml; erroriExtra: string[] }> {
  const { esito, erroriExtra } = await preparaXml(null, id, 0);
  return { esito: { ...esito, errori: esito.errori.filter(e => !/numero/.test(e)) }, erroriExtra };
}

/**
 * Emissione: numero (in transazione), scadenze, XML, fotografia dell'intestatario, DDT segnati come fatturati.
 * Se l'XML ha errori non si emette nulla e il numero resta libero.
 */
export async function emettiDocumento(id: number): Promise<{ numero: string } | { errori: string[] }> {
  try {
    return await transazione(async c => {
      const d = (await c.query(`SELECT tipo, sezionale, data, stato, numero FROM documenti WHERE id = $1 FOR UPDATE`, [id])).rows[0];
      if (!d) throw new ErroreEmissione(['Documento non trovato.']);
      if (d.stato !== 'bozza') throw new ErroreEmissione(['Il documento è già emesso.']);
      // scartato dallo SdI e corretto: stesso numero (non se ne prende uno nuovo)
      const numero: number = d.numero ?? await assegnaNumero(c, d.tipo, d.sezionale, d.data).catch((e: Error) => { throw new ErroreEmissione([e.message]); });
      const x = await preparaXml(c, id, numero);
      const esito = x.esito;
      const errori = [...esito.errori, ...x.erroriExtra];
      if (errori.length) throw new ErroreEmissione(errori);
      const intestatario = x.intestatario;
      await c.query(`UPDATE documenti SET numero = $2, stato = 'emesso', intestatario = $3, imponibile = $4, imposta = $5, bollo = $6, totale = $7,
        xml = $8, dichiarazione_intento_id = $9, aggiornato_il = now() WHERE id = $1`,
        [id, numero, JSON.stringify(intestatario), esito.totali.imponibile, esito.totali.imposta, esito.totali.bollo, esito.totali.totale, esito.xml,
         x.intentoId]);
      await c.query(`DELETE FROM documenti_scadenze WHERE documento_id = $1`, [id]);
      for (const s of x.scadenze)
        await c.query(`INSERT INTO documenti_scadenze (documento_id, data, importo, modalita) VALUES ($1, $2, $3, $4)`, [id, s.data, s.importo, s.modalita]);
      await c.query(`UPDATE documenti SET fattura_id = $1 WHERE id IN (SELECT ddt_id FROM documenti_righe WHERE documento_id = $1 AND ddt_id IS NOT NULL)
        AND tipo = 'ddt' AND $2 = 'fattura'`, [id, d.tipo]);
      return { numero: numeroCompleto(numero, d.sezionale) };
    });
  } catch (e) {
    if (e instanceof ErroreEmissione) return { errori: e.errori };
    throw e;
  }
}
class ErroreEmissione extends Error { constructor(public errori: string[]) { super(errori.join(' ')); } }

/** Elimina una bozza (i documenti emessi non si eliminano: si storna con una nota di credito; uno scartato riaperto ha già il numero). */
export async function eliminaBozza(id: number): Promise<boolean> {
  const r = await q(`DELETE FROM documenti WHERE id = $1 AND stato = 'bozza' AND numero IS NULL RETURNING id`, [id]);
  return r.length > 0;
}

/**
 * Documento scartato dallo SdI: per lo SdI non è mai stato emesso. Torna modificabile (bozza) con lo stesso numero e la stessa data,
 * si corregge (righe, o i dati del cliente in anagrafica) e si riemette: nuovo XML, poi "Rimanda allo SdI".
 */
export async function riapriScartato(id: number): Promise<boolean> {
  const r = await q(`UPDATE documenti SET stato = 'bozza', aggiornato_il = now() WHERE id = $1 AND stato = 'scartato' RETURNING id`, [id]);
  return r.length > 0;
}
