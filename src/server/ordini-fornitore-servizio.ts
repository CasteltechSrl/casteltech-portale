/**
 * Ordini a fornitore (Adriano, 31/10/2026): documento 'ordine_fornitore' con il fornitore SOLO dall'anagrafica.
 * Bozza → Emetti (numero della serie "ordine_fornitore", PDF salvato) → Invia con Gmail → arrivo della merce riga per riga
 * → fattura del fornitore collegata. Dalla BOM quotata si preparano le bozze per ogni distributore scelto.
 * Come la conferma d'ordine, un ordine emesso si corregge ancora (il PDF si rifà con lo stesso numero: non è fiscale).
 */
import { q, q1, transazione } from './db.js';
import { assegnaNumero, caricaAzienda } from './amministrazione-servizio.js';
import { pdfConfermaOrdine, MODELLO_ORDINE_FORNITORE, type DatiPdfConferma } from './pdf-conferma-ordine.js';
import { gmailConfigurato, inviaGmail, mittenteGmail } from './gmail.js';
import { AZIENDA_PREDEFINITA } from './views/stampa-preventivo.js';
import { elencoIndirizzi, indirizzoEmail, messaggioEmail, righeConfermaDaModulo, totaleConferma } from '../engine/conferme-ordine.js';
import {
  arriviDaModulo, controlliEmissioneOrdine, csvCarrello, emailOrdineFornitore, fornitorePerDistributore, nomeFilePdfOrdine, righeOrdineDaBom, statoArrivo,
  type RigaOrdineFornitore, type StatoArrivo,
} from '../engine/ordini-fornitore.js';

const oggiRoma = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
const CAMPI_FORNITORE = `f.ragione_sociale, f.partita_iva, f.codice_fiscale, f.indirizzo, f.cap, f.comune, f.provincia, f.paese, f.email, f.pec, f.codice_sdi`;
type Db = { query: (s: string, v?: unknown[]) => Promise<any> };

export interface OrdineFornitoreElenco {
  id: number; numero: number | null; anno: number; data: string; stato: string; totale: number; fornitore: string | null; fornitore_id: number | null;
  riferimento_esterno: string | null; commessa: string | null; prima_consegna: string | null; arrivo: StatoArrivo; fattura: string | null; email_inviata_il: Date | null;
}

/** Elenco degli ordini a fornitore (più recenti in cima), con lo stato dell'arrivo calcolato dalle righe. */
export async function elencoOrdiniFornitore(): Promise<OrdineFornitoreElenco[]> {
  const righe = await q<any>(`SELECT d.id, d.numero, d.anno, d.data, d.stato, d.imponibile AS totale, d.fornitore_id, d.riferimento_esterno, d.email_inviata_il,
      coalesce(d.intestatario->>'ragione_sociale', f.ragione_sociale) AS fornitore, c.numero AS commessa,
      CASE WHEN r.id IS NULL THEN NULL ELSE coalesce(nullif(r.numero, ''), '?') || ' del ' || to_char(r.data, 'DD/MM/YYYY') END AS fattura,
      (SELECT min(consegna) FROM documenti_righe x WHERE x.documento_id = d.id) AS prima_consegna,
      (SELECT coalesce(json_agg(json_build_object('quantita', x.quantita, 'arrivati', x.arrivati)), '[]') FROM documenti_righe x WHERE x.documento_id = d.id AND NOT x.solo_descrizione) AS righe
    FROM documenti d LEFT JOIN fornitori_anagrafica f ON f.id = d.fornitore_id LEFT JOIN commesse c ON c.id = d.commessa_id
      LEFT JOIN documenti_ricevuti r ON r.id = d.ricevuto_id
    WHERE d.tipo = 'ordine_fornitore' ORDER BY d.data DESC, d.numero DESC NULLS FIRST, d.id DESC`);
  return righe.map(({ righe: rr, ...x }) => ({ ...x, totale: Number(x.totale), arrivo: statoArrivo(rr.map((k: any) => ({ quantita: Number(k.quantita), arrivati: Number(k.arrivati) }))) }));
}

/** Fornitori dell'anagrafica, prima quelli usati più spesso negli ordini (per il menu e per abbinare i distributori). */
export const fornitoriPerOrdini = () => q<{ id: number; ragione_sociale: string; email: string | null }>(
  `SELECT f.id, f.ragione_sociale, f.email FROM fornitori_anagrafica f
   LEFT JOIN (SELECT fornitore_id, count(*) AS n FROM documenti WHERE tipo = 'ordine_fornitore' GROUP BY fornitore_id) u ON u.fornitore_id = f.id
   ORDER BY coalesce(u.n, 0) DESC, f.ragione_sociale`);

/** Commesse aperte (per scrivere per quale lavoro si compra). */
export const commessePerOrdini = () => q<{ id: number; numero: string; cliente: string }>(
  `SELECT co.id, co.numero, cl.ragione_sociale AS cliente FROM commesse co JOIN clienti cl ON cl.id = co.cliente_id
   WHERE co.stato IN ('aperta', 'in_produzione') ORDER BY co.creato_il DESC LIMIT 200`);

async function scriviRighe(c: Db, id: number, righe: RigaOrdineFornitore[]) {
  await c.query(`DELETE FROM documenti_righe WHERE documento_id = $1`, [id]);
  if (righe.length) await c.query(
    `INSERT INTO documenti_righe (documento_id, posizione, codice, descrizione, quantita, prezzo, consegna, arrivati, arrivati_il)
     SELECT $1, r.posizione, r.codice, r.descrizione, r.quantita, r.prezzo, r.consegna, coalesce(r.arrivati, 0), r.arrivati_il
     FROM jsonb_to_recordset($2::jsonb) AS r(posizione int, codice text, descrizione text, quantita numeric, prezzo numeric, consegna date, arrivati numeric, arrivati_il date)`,
    [id, JSON.stringify(righe)]);
}

async function nuovaBozza(c: Db, o: { fornitoreId: number | null; utenteId: number | null; bomId?: number | null; commessaId?: number | null; note?: string | null }, righe: RigaOrdineFornitore[]) {
  const data = oggiRoma();
  const id = (await c.query(`INSERT INTO documenti (tipo, anno, data, fornitore_id, bom_id, commessa_id, note, imponibile, totale, creato_da)
    VALUES ('ordine_fornitore', $1, $2, $3, $4, $5, $6, $7, $7, $8) RETURNING id`,
    [Number(data.slice(0, 4)), data, o.fornitoreId, o.bomId ?? null, o.commessaId ?? null, o.note ?? null, totaleConferma(righe), o.utenteId])).rows[0].id as number;
  await scriviRighe(c, id, righe);
  return id;
}

/** Nuovo ordine vuoto (bozza), con il fornitore se già scelto. */
export async function creaOrdineFornitore(fornitoreId: number | null, utenteId: number | null): Promise<number> {
  const f = fornitoreId ? await q1(`SELECT id FROM fornitori_anagrafica WHERE id = $1`, [fornitoreId]) : null;
  return transazione(c => nuovaBozza(c, { fornitoreId: f?.id ?? null, utenteId }, []));
}

export async function leggiOrdineFornitore(id: number) {
  const d = await q1<any>(`SELECT d.*, cp.descrizione AS pagamento, ${CAMPI_FORNITORE}, co.numero AS commessa, b.nome AS bom_nome,
      r.numero AS fattura_numero, r.data AS fattura_data, r.imponibile AS fattura_imponibile
    FROM documenti d LEFT JOIN fornitori_anagrafica f ON f.id = d.fornitore_id LEFT JOIN condizioni_pagamento cp ON cp.codice = d.condizione_pagamento
      LEFT JOIN commesse co ON co.id = d.commessa_id LEFT JOIN bom_analisi b ON b.id = d.bom_id LEFT JOIN documenti_ricevuti r ON r.id = d.ricevuto_id
    WHERE d.id = $1 AND d.tipo = 'ordine_fornitore'`, [id]);
  if (!d) return null;
  const righe = (await q<any>(`SELECT posizione, codice, descrizione, quantita, prezzo, consegna, arrivati, arrivati_il, NULL::int AS prodotto_id, NULL::int AS riga_ordine_id
    FROM documenti_righe WHERE documento_id = $1 ORDER BY posizione, id`, [id]))
    .map(r => ({ ...r, quantita: Number(r.quantita), prezzo: Number(r.prezzo), arrivati: Number(r.arrivati) })) as RigaOrdineFornitore[];
  return { d, righe, arrivo: statoArrivo(righe) };
}

/** Salva intestazione e righe; i pezzi già arrivati restano sulla riga con lo stesso codice (o la stessa posizione). Emesso: PDF rifatto. */
export async function salvaOrdineFornitore(id: number, b: any): Promise<string[]> {
  const { righe, errori } = righeConfermaDaModulo(b.righe ?? []);
  const data = String(b.data ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) errori.push("Data dell'ordine non valida.");
  const dataRif = String(b.data_riferimento ?? '');
  if (dataRif && !/^\d{4}-\d{2}-\d{2}$/.test(dataRif)) errori.push("Data dell'offerta del fornitore non valida.");
  if (errori.length) return errori;
  const emesso = await transazione(async c => {
    const d = (await c.query(`SELECT stato, numero, anno, fornitore_id FROM documenti WHERE id = $1 AND tipo = 'ordine_fornitore' FOR UPDATE`, [id])).rows[0];
    if (!d) throw new Error('Ordine non trovato.');
    if (d.numero && Number(data.slice(0, 4)) !== d.anno) throw new Error(`L'ordine n. ${d.numero}/${d.anno} è già emesso: la data deve restare nel ${d.anno}.`);
    // il fornitore si sceglie SOLO dall'anagrafica e si cambia solo in bozza (l'ordine emesso è già partito a quel fornitore)
    let fornitore = d.fornitore_id;
    if (!d.numero) fornitore = (await c.query(`SELECT id FROM fornitori_anagrafica WHERE id = $1`, [Number(b.fornitore_id) || 0])).rows[0]?.id ?? null;
    const commessa = (await c.query(`SELECT id FROM commesse WHERE id = $1`, [Number(b.commessa_id) || 0])).rows[0]?.id ?? null;
    const prima = (await c.query(`SELECT posizione, codice, arrivati, arrivati_il FROM documenti_righe WHERE documento_id = $1`, [id])).rows;
    // gli arrivi già segnati seguono la loro riga: prima stessa posizione e stesso codice, poi stesso codice tra le righe non ancora
    // abbinate (due righe con lo stesso codice, es. due consegne, non si copiano gli arrivi a vicenda)
    const libere = [...prima];
    const prendi = (r: RigaOrdineFornitore) => {
      const i = libere.findIndex((x: any) => x.posizione === r.posizione && (x.codice ?? '') === (r.codice ?? ''));
      const j = i >= 0 ? i : libere.findIndex((x: any) => x.codice && x.codice === r.codice);
      return j >= 0 ? libere.splice(j, 1)[0] : undefined;
    };
    const conArrivi: RigaOrdineFornitore[] = righe.map(r => {
      const v = prendi(r);
      return { ...r, arrivati: Number(v?.arrivati ?? 0), arrivati_il: v?.arrivati_il ?? null };
    });
    await c.query(`UPDATE documenti SET data = $2, anno = $3, fornitore_id = $4, condizione_pagamento = (SELECT codice FROM condizioni_pagamento WHERE codice = $5),
        riferimento_esterno = $6, data_riferimento = $7, note = $8, commessa_id = $9, imponibile = $10, totale = $10, aggiornato_il = now() WHERE id = $1`,
      [id, data, Number(data.slice(0, 4)), fornitore, String(b.condizione_pagamento ?? ''), String(b.riferimento_esterno ?? '').trim().toUpperCase() || null,
        dataRif || null, String(b.note ?? '').trim() || null, commessa, totaleConferma(righe)]);
    await scriviRighe(c, id, conArrivi);
    return !!d.numero;
  }).catch((e: Error) => { errori.push(e.message); return false; });
  if (errori.length) return errori;
  if (emesso) await q(`UPDATE documenti SET pdf = $2 WHERE id = $1`, [id, (await creaPdf(id)).dati]);
  return [];
}

async function datiPdf(id: number): Promise<{ dati: DatiPdfConferma; nome: string }> {
  const x = await leggiOrdineFornitore(id);
  if (!x) throw new Error('Ordine non trovato.');
  const { d, righe } = x;
  const a = await caricaAzienda(), P = AZIENDA_PREDEFINITA;
  const fornitore = d.intestatario ?? { ragione_sociale: d.ragione_sociale ?? 'FORNITORE DA SCEGLIERE', partita_iva: d.partita_iva, codice_fiscale: d.codice_fiscale,
    indirizzo: d.indirizzo, cap: d.cap, comune: d.comune, provincia: d.provincia, nazione: d.paese, pec: d.pec };
  const note = [d.commessa ? `Rif. nostra commessa ${d.commessa}` : '', d.note ?? ''].filter(Boolean).join('\n');
  const dati: DatiPdfConferma = {
    numero: d.numero, anno: d.anno, data: d.data, modello: MODELLO_ORDINE_FORNITORE,
    azienda: {
      nome: a.ragione_sociale || P.ragione_sociale,
      indirizzo: `${a.indirizzo || P.indirizzo} · ${a.cap || P.cap} ${a.comune || P.comune} (${a.provincia || P.provincia})`,
      piva: a.partita_iva || P.partita_iva, rea: a.rea_ufficio && a.rea_numero ? `${a.rea_ufficio}-${a.rea_numero}` : P.rea,
      tel: a.telefono || P.telefono, email: a.email || P.email, pec: a.pec || P.pec,
    },
    cliente: fornitore, rifCliente: d.riferimento_esterno, dataRif: d.data_riferimento, pagamento: d.pagamento, note: note || null, righe,
  };
  return { dati, nome: nomeFilePdfOrdine(d.numero, d.anno, fornitore.ragione_sociale ?? '') };
}

async function creaPdf(id: number) {
  const { dati, nome } = await datiPdf(id);
  return { nome, dati: await pdfConfermaOrdine(dati) };
}

/** PDF salvato all'emissione, o anteprima con la scritta BOZZA. */
export async function pdfOrdineFornitore(id: number): Promise<{ nome: string; dati: Buffer }> {
  const d = await q1<{ pdf: Buffer | null; numero: number | null; anno: number; nome: string }>(
    `SELECT d.pdf, d.numero, d.anno, coalesce(d.intestatario->>'ragione_sociale', f.ragione_sociale, '') AS nome
     FROM documenti d LEFT JOIN fornitori_anagrafica f ON f.id = d.fornitore_id WHERE d.id = $1 AND d.tipo = 'ordine_fornitore'`, [id]);
  if (!d) throw new Error('Ordine non trovato.');
  return d.pdf ? { nome: nomeFilePdfOrdine(d.numero, d.anno, d.nome), dati: d.pdf } : creaPdf(id);
}

/** Emissione: numero della serie "ordine_fornitore" (in transazione), fotografia del fornitore, PDF salvato. */
export async function emettiOrdineFornitore(id: number): Promise<{ numero: string } | { errori: string[] }> {
  const x = await leggiOrdineFornitore(id);
  if (!x) return { errori: ['Ordine non trovato.'] };
  if (x.d.stato !== 'bozza') return { errori: ["L'ordine è già emesso."] };
  const errori = controlliEmissioneOrdine({ fornitoreId: x.d.fornitore_id }, x.righe);
  if (errori.length) return { errori };
  try {
    const numero = await transazione(async c => {
      const d = (await c.query(`SELECT stato, data FROM documenti WHERE id = $1 FOR UPDATE`, [id])).rows[0];
      if (d.stato !== 'bozza') throw new Error("L'ordine è già emesso.");
      const n = await assegnaNumero(c as any, 'ordine_fornitore', '', d.data);
      const intestatario = { ragione_sociale: x.d.ragione_sociale, partita_iva: x.d.partita_iva, codice_fiscale: x.d.codice_fiscale, indirizzo: x.d.indirizzo,
        cap: x.d.cap, comune: x.d.comune, provincia: x.d.provincia, nazione: x.d.paese, pec: x.d.pec };
      await c.query(`UPDATE documenti SET numero = $2, stato = 'emesso', intestatario = $3, aggiornato_il = now() WHERE id = $1`, [id, n, JSON.stringify(intestatario)]);
      return n;
    });
    await q(`UPDATE documenti SET pdf = $2 WHERE id = $1`, [id, (await creaPdf(id)).dati]);
    return { numero: `${numero}/${x.d.anno}` };
  } catch (e: any) { return { errori: [e?.message ?? String(e)] }; }
}

/** Bozza: si elimina. Emesso: si annulla (resta nell'elenco, il numero non si riusa). */
export async function eliminaOAnnullaOrdine(id: number): Promise<'eliminato' | 'annullato' | null> {
  const d = await q1<{ stato: string }>(`SELECT stato FROM documenti WHERE id = $1 AND tipo = 'ordine_fornitore'`, [id]);
  if (!d) return null;
  if (d.stato === 'bozza') { await q(`DELETE FROM documenti WHERE id = $1`, [id]); return 'eliminato'; }
  await q(`UPDATE documenti SET stato = 'annullato', aggiornato_il = now() WHERE id = $1`, [id]);
  return 'annullato';
}

/** Copia di un ordine come nuova bozza con la data di oggi (stesso fornitore e righe, niente arrivi). */
export async function duplicaOrdineFornitore(id: number, utenteId: number | null): Promise<number | null> {
  const x = await leggiOrdineFornitore(id);
  if (!x) return null;
  return transazione(c => nuovaBozza(c, { fornitoreId: x.d.fornitore_id, utenteId, commessaId: x.d.commessa_id, note: x.d.note },
    x.righe.map(r => ({ ...r, consegna: null, arrivati: 0, arrivati_il: null }))));
}

// ───────────────────────────── arrivo della merce e fattura ─────────────────────────────

/** Pezzi arrivati per riga (modulo "arrivati[posizione]"), con la data dell'arrivo. "tutto" = tutte le righe complete. */
export async function segnaArrivi(id: number, b: any): Promise<{ errori: string[]; avvisi: string[] }> {
  const x = await leggiOrdineFornitore(id);
  if (!x) return { errori: ['Ordine non trovato.'], avvisi: [] };
  if (!x.d.numero || x.d.stato === 'annullato') return { errori: ["Gli arrivi si segnano sugli ordini emessi (e non annullati)."], avvisi: [] };
  const data = /^\d{4}-\d{2}-\d{2}$/.test(String(b.data_arrivo ?? '')) ? String(b.data_arrivo) : oggiRoma();
  const input: Record<string, unknown> = b.tutto ? Object.fromEntries(x.righe.map(r => [r.posizione, r.quantita])) : (b.arrivati ?? {});
  const { arrivi, errori, avvisi } = arriviDaModulo(input, x.righe);
  if (errori.length) return { errori, avvisi };
  await transazione(async c => {
    for (const [posizione, n] of arrivi) {
      const prima = x.righe.find(r => r.posizione === posizione);
      if (prima && Number(prima.arrivati ?? 0) === n) continue;
      await c.query(`UPDATE documenti_righe SET arrivati = $3, arrivati_il = $4 WHERE documento_id = $1 AND posizione = $2`, [id, posizione, n, n > 0 ? data : null]);
    }
    await c.query(`UPDATE documenti SET aggiornato_il = now() WHERE id = $1`, [id]);
  });
  return { errori: [], avvisi };
}

/** Fatture del fornitore che si possono collegare: le sue, dalla data dell'ordine meno 30 giorni, non già collegate ad altri ordini. */
export const fattureCollegabili = (fornitoreId: number, dataOrdine: string, ordineId: number) => q<{ id: number; numero: string; data: string; imponibile: number }>(
  `SELECT r.id, r.numero, r.data, r.imponibile FROM documenti_ricevuti r
   WHERE r.fornitore_id = $1 AND r.tipo = 'fattura' AND r.data >= $2::date - 30
     AND NOT EXISTS (SELECT 1 FROM documenti d WHERE d.ricevuto_id = r.id AND d.id <> $3)
   ORDER BY r.data DESC LIMIT 50`, [fornitoreId, dataOrdine, ordineId]);

export async function collegaFattura(id: number, ricevutoId: number | null): Promise<string | null> {
  const x = await leggiOrdineFornitore(id);
  if (!x) return 'Ordine non trovato.';
  if (ricevutoId) {
    const r = await q1(`SELECT id FROM documenti_ricevuti WHERE id = $1 AND fornitore_id = $2`, [ricevutoId, x.d.fornitore_id]);
    if (!r) return "La fattura non è di questo fornitore.";
  }
  await q(`UPDATE documenti SET ricevuto_id = $2, aggiornato_il = now() WHERE id = $1`, [id, ricevutoId]);
  return null;
}

// ───────────────────────────── dalla BOM quotata ─────────────────────────────

/** Anteprima degli ordini dalla BOM per una quantità di schede: righe per distributore e fornitore dell'anagrafica abbinato. */
export async function anteprimaOrdiniDaBom(bomId: number, schede: number) {
  const a = await q1<any>(`SELECT id, nome, quantita, righe FROM bom_analisi WHERE id = $1`, [bomId]);
  if (!a) return null;
  const quantita: number[] = a.quantita ?? [];
  const scelte = quantita.includes(schede) ? schede : quantita[0];
  const { gruppi, senzaPrezzo } = righeOrdineDaBom(a.righe ?? [], scelte);
  const fornitori = await fornitoriPerOrdini();
  return { bom: { id: a.id as number, nome: a.nome as string, quantita }, schede: scelte, senzaPrezzo,
    gruppi: gruppi.map(g => ({ ...g, fornitore: fornitorePerDistributore(g.distributore, fornitori) })), fornitori };
}

/** Crea le bozze degli ordini dalla BOM (una per distributore spuntato, con il fornitore scelto dall'anagrafica). */
export async function ordiniDaBom(bomId: number, b: any, utenteId: number | null): Promise<{ ids: number[]; errori: string[] }> {
  const x = await anteprimaOrdiniDaBom(bomId, Number(b.schede) || 0);
  if (!x) return { ids: [], errori: ['BOM non trovata.'] };
  const scelti = [b.distributore ?? []].flat().map(String);
  const errori: string[] = [];
  const daFare = x.gruppi.filter(g => scelti.includes(g.distributore)).map(g => {
    const id = Number(b[`fornitore_${g.distributore}`]) || 0;
    const f = x.fornitori.find(k => k.id === id) ?? null;
    if (!f) errori.push(`Scegli il fornitore dell'anagrafica per ${g.distributore === 'manuale' ? 'le righe con il prezzo scritto a mano' : g.distributore}.`);
    return { g, f };
  });
  if (!daFare.length) errori.push('Spunta almeno un distributore.');
  if (errori.length) return { ids: [], errori };
  const ids = await transazione(async c => {
    const out: number[] = [];
    for (const { g, f } of daFare)
      out.push(await nuovaBozza(c, { fornitoreId: f!.id, utenteId, bomId: x.bom.id, note: `Componenti della BOM ${x.bom.nome} per ${x.schede} schede.` }, g.righe));
    return out;
  });
  return { ids, errori: [] };
}

/** File CSV per il carrello del distributore (codice del distributore e quantità). */
export async function csvOrdine(id: number): Promise<{ nome: string; testo: string } | null> {
  const x = await leggiOrdineFornitore(id);
  if (!x) return null;
  const rif = x.d.numero ? `ORDINE ${x.d.numero}/${x.d.anno}` : `BOZZA ${x.d.id}`;
  return { nome: `Carrello_${x.d.numero ?? 'bozza'}_${x.d.anno}.csv`, testo: csvCarrello(x.righe, rif) };
}

// ───────────────────────────── email ─────────────────────────────

export async function propostaEmailOrdine(id: number) {
  const x = await leggiOrdineFornitore(id);
  if (!x) return null;
  const azienda = (await caricaAzienda()).ragione_sociale || AZIENDA_PREDEFINITA.ragione_sociale;
  const consegne = x.righe.map(r => r.consegna).filter((k): k is string => !!k).sort();
  const t = emailOrdineFornitore({ numero: x.d.numero ? `${x.d.numero}/${x.d.anno}` : 'bozza', data: x.d.data, rifFornitore: x.d.riferimento_esterno, azienda, consegna: consegne[0] });
  return { a: indirizzoEmail(x.d.email) || indirizzoEmail(x.d.pec) || '', ...t, attivo: gmailConfigurato(), mittente: mittenteGmail() };
}

export async function inviaOrdineFornitore(id: number, b: { a?: string; cc?: string; oggetto?: string; testo?: string }): Promise<string> {
  const x = await leggiOrdineFornitore(id);
  if (!x) throw new Error('Ordine non trovato.');
  if (!x.d.numero || x.d.stato === 'annullato') throw new Error('Si invia solo un ordine emesso (e non annullato).');
  const a = elencoIndirizzi(b.a), cc = elencoIndirizzi(b.cc);
  if (!a.indirizzi.length) throw new Error('Scrivi a chi mandarlo.');
  if (a.errati.length || cc.errati.length) throw new Error(`Indirizzi non validi: ${[...a.errati, ...cc.errati].join(', ')}.`);
  const oggetto = String(b.oggetto ?? '').trim(), testo = String(b.testo ?? '').trim();
  if (!oggetto || !testo) throw new Error("Servono l'oggetto e il testo dell'email.");
  const pdf = await pdfOrdineFornitore(id);
  const azienda = (await caricaAzienda()).ragione_sociale || AZIENDA_PREDEFINITA.ragione_sociale;
  const messaggio = messaggioEmail({ da: `"${azienda.replace(/"/g, '')}" <${mittenteGmail()}>`, a: a.indirizzi, cc: cc.indirizzi, oggetto, testo,
    allegato: { nome: pdf.nome, mime: 'application/pdf', dati: pdf.dati } });
  const inviato = await inviaGmail(messaggio);
  await q(`UPDATE documenti SET stato = 'inviato', email_a = $2, email_inviata_il = now(), email_id = $3, aggiornato_il = now() WHERE id = $1`,
    [id, [...a.indirizzi, ...cc.indirizzi].join(', '), inviato.id]);
  return a.indirizzi.join(', ');
}

/** Ultimo numero della serie per l'anno (per l'avviso di allineamento con Fatture in Cloud). */
export const ultimoNumeroOrdini = async (anno: number) =>
  (await q1<{ ultimo_numero: number }>(`SELECT ultimo_numero FROM numerazioni WHERE tipo = 'ordine_fornitore' AND sezionale = '' AND anno = $1`, [anno]))?.ultimo_numero ?? 0;
