/**
 * Conferme d'ordine (Adriano, 28/10/2026): documento 'conferma_ordine' nato dall'ordine del cliente.
 * Bozza con le righe e le date di consegna dell'ordine (modificabili) → Emetti: numero della serie "conferma_ordine",
 * PDF salvato nel documento → Invia: con Gmail, in risposta all'email da cui è arrivato l'ordine (se c'è).
 * Una conferma emessa si può ancora correggere: il PDF si rifà con lo stesso numero (non è un documento fiscale).
 */
import { completaDaListino } from './prezzi-servizio.js';
import { q, q1, transazione } from './db.js';
import { assegnaNumero, caricaAzienda } from './amministrazione-servizio.js';
import { righeOrdini } from './ordini-servizio.js';
import { pdfConfermaOrdine, type DatiPdfConferma } from './pdf-conferma-ordine.js';
import { gmailConfigurato, inviaGmail, mittenteGmail } from './gmail.js';
import { AZIENDA_PREDEFINITA } from './views/stampa-preventivo.js';
import { leggiEmail } from '../engine/acquisizioni.js';
import {
  controlliEmissione, elencoIndirizzi, indirizzoEmail, messaggioEmail, nomeFilePdf, oggettoRisposta, righeConfermaDaModulo, righeConfermaDaOrdine,
  testoEmailConferma, totaleConferma, type EmailOrigine, type RigaConferma,
} from '../engine/conferme-ordine.js';

const oggiRoma = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
const CAMPI_CLIENTE = `c.ragione_sociale, c.partita_iva, c.codice_fiscale, c.indirizzo, c.cap, c.comune, c.provincia, c.nazione, c.codice_sdi, c.pec`;

export interface ConfermaElenco { id: number; numero: number | null; anno: number; data: string; stato: string; totale: number; email_a: string | null; email_inviata_il: Date | null }

export const confermeDellOrdine = (ordineId: number) => q<ConfermaElenco>(
  `SELECT id, numero, anno, data, stato, imponibile AS totale, email_a, email_inviata_il FROM documenti
   WHERE tipo = 'conferma_ordine' AND ordine_id = $1 ORDER BY creato_il DESC`, [ordineId]);

/**
 * Prepara la conferma (bozza) con tutte le righe dell'ordine e le date di consegna. Se c'è già una bozza per
 * l'ordine si riapre quella, così non nascono doppioni.
 */
export async function creaConferma(ordineId: number, utenteId: number | null): Promise<number> {
  const o = await q1(`SELECT o.*, c.condizione_pagamento FROM ordini o LEFT JOIN clienti c ON c.id = o.cliente_id WHERE o.id = $1`, [ordineId]);
  if (!o) throw new Error('Ordine non trovato.');
  if (!o.cliente_id) throw new Error("Il cliente dell'ordine non è in anagrafica: collegalo prima di preparare la conferma.");
  const bozza = await q1<{ id: number }>(`SELECT id FROM documenti WHERE tipo = 'conferma_ordine' AND ordine_id = $1 AND stato = 'bozza' ORDER BY id DESC LIMIT 1`, [ordineId]);
  if (bozza) return bozza.id;
  const righe = righeConfermaDaOrdine((await righeOrdini(ordineId)).map(r => ({
    id: r.id, codice: r.codice, descrizione: r.descrizione, codiceCliente: r.codiceCliente, quantita: r.quantita, prezzo: r.prezzo,
    consegnaRichiesta: r.consegnaRichiesta, consegnaPrevista: r.consegnaPrevista, statoManuale: r.statoManuale, prodottoId: r.prodottoId, consegne: r.consegne,
  })));
  const data = oggiRoma();
  return transazione(async c => {
    const id = (await c.query(`INSERT INTO documenti (tipo, anno, data, cliente_id, ordine_id, riferimento_esterno, data_riferimento, condizione_pagamento, creato_da)
      VALUES ('conferma_ordine', $1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [Number(data.slice(0, 4)), data, o.cliente_id, ordineId, o.rif_cliente, o.data_ordine_cliente, o.condizione_pagamento, utenteId])).rows[0].id;
    await scriviRighe(c, id, righe);
    return id;
  });
}

async function scriviRighe(c: { query: (s: string, v?: unknown[]) => Promise<unknown> }, id: number, righe: RigaConferma[]) {
  await c.query(`DELETE FROM documenti_righe WHERE documento_id = $1`, [id]);
  if (righe.length) await c.query(
    `INSERT INTO documenti_righe (documento_id, posizione, codice, descrizione, quantita, prezzo, consegna, prodotto_id, riga_ordine_id)
     SELECT $1, r.posizione, r.codice, r.descrizione, r.quantita, r.prezzo, r.consegna, (SELECT id FROM prodotti WHERE id = r.prodotto_id),
       (SELECT id FROM ordini_righe WHERE id = r.riga_ordine_id)
     FROM jsonb_to_recordset($2::jsonb) AS r(posizione int, codice text, descrizione text, quantita numeric, prezzo numeric, consegna date, prodotto_id int, riga_ordine_id int)`,
    [id, JSON.stringify(righe)]);
}

export async function leggiConferma(id: number) {
  const d = await q1(`SELECT d.*, cp.descrizione AS pagamento, ${CAMPI_CLIENTE}, c.email_amministrazione
    FROM documenti d LEFT JOIN clienti c ON c.id = d.cliente_id LEFT JOIN condizioni_pagamento cp ON cp.codice = d.condizione_pagamento
    WHERE d.id = $1 AND d.tipo = 'conferma_ordine'`, [id]);
  if (!d) return null;
  const righe = await q<RigaConferma>(`SELECT posizione, codice, descrizione, quantita, prezzo, consegna, prodotto_id, riga_ordine_id
    FROM documenti_righe WHERE documento_id = $1 ORDER BY posizione, id`, [id]);
  return { d, righe };
}

/** Salva intestazione e righe. Se la conferma è già emessa il PDF si rifà subito (stesso numero). */
export async function salvaConferma(id: number, b: any): Promise<string[]> {
  // codice dal prodotto scelto (solo del cliente) e, se manca il prezzo, quello del listino per la quantità (Adriano 31/10/2026)
  const cliente = (await q1<{ cliente_id: number | null }>(`SELECT cliente_id FROM documenti WHERE id = $1`, [id]))?.cliente_id ?? null;
  const { righe, errori } = righeConfermaDaModulo(await completaDaListino(cliente, b.righe ?? []));
  const data = String(b.data ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) errori.push('Data della conferma non valida.');
  const dataRif = String(b.data_riferimento ?? '');
  if (dataRif && !/^\d{4}-\d{2}-\d{2}$/.test(dataRif)) errori.push("Data dell'ordine del cliente non valida.");
  if (errori.length) return errori;
  const emessa = await transazione(async c => {
    const d = (await c.query(`SELECT stato, numero, anno FROM documenti WHERE id = $1 AND tipo = 'conferma_ordine' FOR UPDATE`, [id])).rows[0];
    if (!d) throw new Error('Conferma non trovata.');
    if (d.numero && Number(data.slice(0, 4)) !== d.anno) throw new Error(`La conferma n. ${d.numero}/${d.anno} è già emessa: la data deve restare nel ${d.anno}.`);
    await c.query(`UPDATE documenti SET data = $2, anno = $3, condizione_pagamento = (SELECT codice FROM condizioni_pagamento WHERE codice = $4),
        riferimento_esterno = $5, data_riferimento = $6, note = $7, imponibile = $8, totale = $8, aggiornato_il = now() WHERE id = $1`,
      [id, data, Number(data.slice(0, 4)), String(b.condizione_pagamento ?? ''), String(b.riferimento_esterno ?? '').trim().toUpperCase() || null,
        dataRif || null, String(b.note ?? '').trim() || null, totaleConferma(righe)]);
    await scriviRighe(c, id, righe);
    return !!d.numero;
  }).catch((e: Error) => { errori.push(e.message); return false; });
  if (errori.length) return errori;
  if (emessa) await q(`UPDATE documenti SET pdf = $2 WHERE id = $1`, [id, (await creaPdf(id)).dati]);
  return [];
}

/** Dati per il PDF: azienda da Impostazioni → Amministrazione, cliente fotografato all'emissione (o attuale per la bozza). */
async function datiPdf(id: number): Promise<{ dati: DatiPdfConferma; nome: string }> {
  const x = await leggiConferma(id);
  if (!x) throw new Error('Conferma non trovata.');
  const { d, righe } = x;
  const a = await caricaAzienda(), P = AZIENDA_PREDEFINITA;
  const cliente = d.intestatario ?? { ragione_sociale: d.ragione_sociale, partita_iva: d.partita_iva, codice_fiscale: d.codice_fiscale, indirizzo: d.indirizzo,
    cap: d.cap, comune: d.comune, provincia: d.provincia, nazione: d.nazione, codice_sdi: d.codice_sdi, pec: d.pec };
  const dati: DatiPdfConferma = {
    numero: d.numero, anno: d.anno, data: d.data,
    azienda: {
      nome: a.ragione_sociale || P.ragione_sociale,
      indirizzo: `${a.indirizzo || P.indirizzo} · ${a.cap || P.cap} ${a.comune || P.comune} (${a.provincia || P.provincia})`,
      piva: a.partita_iva || P.partita_iva, rea: a.rea_ufficio && a.rea_numero ? `${a.rea_ufficio}-${a.rea_numero}` : P.rea,
      tel: a.telefono || P.telefono, email: a.email || P.email, pec: a.pec || P.pec, iban: a.iban || undefined, banca: a.banca || undefined,
    },
    cliente, rifCliente: d.riferimento_esterno, dataRif: d.data_riferimento, pagamento: d.pagamento, note: d.note, righe,
  };
  return { dati, nome: nomeFilePdf(d.numero, d.anno, cliente.ragione_sociale ?? '') };
}

async function creaPdf(id: number) {
  const { dati, nome } = await datiPdf(id);
  return { nome, dati: await pdfConfermaOrdine(dati) };
}

/** PDF da scaricare: quello salvato all'emissione, o un'anteprima con la scritta BOZZA. */
export async function pdfConferma(id: number): Promise<{ nome: string; dati: Buffer }> {
  const d = await q1<{ pdf: Buffer | null; numero: number | null; anno: number; nome: string }>(
    `SELECT d.pdf, d.numero, d.anno, coalesce(d.intestatario->>'ragione_sociale', c.ragione_sociale, '') AS nome
     FROM documenti d LEFT JOIN clienti c ON c.id = d.cliente_id WHERE d.id = $1 AND d.tipo = 'conferma_ordine'`, [id]);
  if (!d) throw new Error('Conferma non trovata.');
  return d.pdf ? { nome: nomeFilePdf(d.numero, d.anno, d.nome), dati: d.pdf } : creaPdf(id);
}

/** Emissione: numero della serie "conferma_ordine" (in transazione), fotografia del cliente, PDF salvato. */
export async function emettiConferma(id: number): Promise<{ numero: string } | { errori: string[] }> {
  const x = await leggiConferma(id);
  if (!x) return { errori: ['Conferma non trovata.'] };
  if (x.d.stato !== 'bozza') return { errori: ['La conferma è già emessa.'] };
  const errori = controlliEmissione(x.righe);
  if (errori.length) return { errori };
  try {
    const numero = await transazione(async c => {
      const d = (await c.query(`SELECT stato, data FROM documenti WHERE id = $1 FOR UPDATE`, [id])).rows[0];
      if (d.stato !== 'bozza') throw new Error('La conferma è già emessa.');
      const n = await assegnaNumero(c, 'conferma_ordine', '', d.data);
      const intestatario = Object.fromEntries(['ragione_sociale', 'partita_iva', 'codice_fiscale', 'indirizzo', 'cap', 'comune', 'provincia', 'nazione', 'codice_sdi', 'pec']
        .map(k => [k, x.d[k] ?? null]));
      await c.query(`UPDATE documenti SET numero = $2, stato = 'emesso', intestatario = $3, aggiornato_il = now() WHERE id = $1`, [id, n, JSON.stringify(intestatario)]);
      return n;
    });
    await q(`UPDATE documenti SET pdf = $2 WHERE id = $1`, [id, (await creaPdf(id)).dati]);
    return { numero: `${numero}/${x.d.anno}` };
  } catch (e: any) { return { errori: [e?.message ?? String(e)] }; }
}

/** Le bozze si eliminano; una conferma emessa si annulla (resta nell'elenco, il numero non si riusa). */
export async function eliminaOAnnulla(id: number): Promise<'eliminata' | 'annullata' | null> {
  const d = await q1<{ stato: string }>(`SELECT stato FROM documenti WHERE id = $1 AND tipo = 'conferma_ordine'`, [id]);
  if (!d) return null;
  if (d.stato === 'bozza') { await q(`DELETE FROM documenti WHERE id = $1`, [id]); return 'eliminata'; }
  await q(`UPDATE documenti SET stato = 'annullato', aggiornato_il = now() WHERE id = $1`, [id]);
  return 'annullata';
}

/** Duplica (Adriano 1/11/2026, elenco Conferme d'ordine): nuova bozza sullo stesso ordine con le stesse righe e note; data di oggi, senza numero. */
export async function duplicaConferma(id: number, utenteId: number | null): Promise<number | null> {
  const d = await q1(`SELECT * FROM documenti WHERE id = $1 AND tipo = 'conferma_ordine'`, [id]);
  if (!d) return null;
  const data = oggiRoma();
  return transazione(async c => {
    const nuovo = (await c.query(`INSERT INTO documenti (tipo, anno, data, cliente_id, ordine_id, riferimento_esterno, data_riferimento, condizione_pagamento, note, imponibile, totale, creato_da)
      VALUES ('conferma_ordine', $1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10) RETURNING id`,
      [Number(data.slice(0, 4)), data, d.cliente_id, d.ordine_id, d.riferimento_esterno, d.data_riferimento, d.condizione_pagamento, d.note, d.imponibile, utenteId])).rows[0].id;
    await c.query(`INSERT INTO documenti_righe (documento_id, posizione, codice, descrizione, quantita, prezzo, consegna, prodotto_id, riga_ordine_id)
      SELECT $2, posizione, codice, descrizione, quantita, prezzo, consegna, prodotto_id, riga_ordine_id FROM documenti_righe WHERE documento_id = $1 ORDER BY posizione, id`, [id, nuovo]);
    return nuovo;
  });
}

// ───────────────────────────── email ─────────────────────────────

/** L'email da cui è arrivato l'ordine (Ordini → Da acquisire, file .eml): serve per rispondere nella stessa conversazione. */
export async function emailOrigine(ordineId: number): Promise<EmailOrigine | null> {
  const a = await q1<{ contenuto: Buffer }>(`SELECT contenuto FROM acquisizioni WHERE ordine_id = $1 AND contenuto IS NOT NULL
    AND (tipo = 'email' OR lower(nome_file) ~ '\\.(eml|msg)$') ORDER BY id LIMIT 1`, [ordineId]);
  if (!a) return null;
  const e = leggiEmail(a.contenuto);
  return { messaggioId: e.messaggioId ?? null, riferimenti: e.riferimenti ?? null, oggetto: e.oggetto, mittente: e.mittente, rispondiA: e.rispondiA ?? '' };
}

export interface PropostaEmail { a: string; oggetto: string; testo: string; origine: EmailOrigine | null; attivo: boolean; mittente: string }

/** Destinatario, oggetto e testo proposti: risposta a chi ha mandato l'ordine; senza email d'origine, l'email amministrativa del cliente. */
export async function propostaEmail(id: number): Promise<PropostaEmail | null> {
  const x = await leggiConferma(id);
  if (!x) return null;
  const { d } = x;
  const origine = d.ordine_id ? await emailOrigine(d.ordine_id) : null;
  const a = indirizzoEmail(origine?.rispondiA || origine?.mittente) || indirizzoEmail(d.email_amministrazione) || '';
  const azienda = (await caricaAzienda()).ragione_sociale || AZIENDA_PREDEFINITA.ragione_sociale;
  const numero = d.numero ? `${d.numero}/${d.anno}` : 'bozza';
  return {
    a, origine, attivo: gmailConfigurato(), mittente: mittenteGmail(),
    oggetto: oggettoRisposta(origine?.oggetto, numero, d.riferimento_esterno),
    testo: testoEmailConferma({ numero, data: d.data, rifCliente: d.riferimento_esterno, dataRif: d.data_riferimento, azienda }),
  };
}

/** Invia la conferma emessa con Gmail (PDF allegato), in risposta all'email dell'ordine se c'è. */
export async function inviaConferma(id: number, b: { a?: string; cc?: string; oggetto?: string; testo?: string }): Promise<string> {
  const x = await leggiConferma(id);
  if (!x) throw new Error('Conferma non trovata.');
  if (!x.d.numero || x.d.stato === 'annullato') throw new Error('Si invia solo una conferma emessa (e non annullata).');
  const a = elencoIndirizzi(b.a), cc = elencoIndirizzi(b.cc);
  if (!a.indirizzi.length) throw new Error('Scrivi a chi mandarla.');
  if (a.errati.length || cc.errati.length) throw new Error(`Indirizzi non validi: ${[...a.errati, ...cc.errati].join(', ')}.`);
  const oggetto = String(b.oggetto ?? '').trim(), testo = String(b.testo ?? '').trim();
  if (!oggetto || !testo) throw new Error("Servono l'oggetto e il testo dell'email.");
  const origine = x.d.ordine_id ? await emailOrigine(x.d.ordine_id) : null;
  const pdf = await pdfConferma(id);
  const azienda = (await caricaAzienda()).ragione_sociale || AZIENDA_PREDEFINITA.ragione_sociale;
  const messaggio = messaggioEmail({
    da: `"${azienda.replace(/"/g, '')}" <${mittenteGmail()}>`, a: a.indirizzi, cc: cc.indirizzi, oggetto, testo,
    allegato: { nome: pdf.nome, mime: 'application/pdf', dati: pdf.dati }, inRispostaA: origine?.messaggioId, riferimenti: origine?.riferimenti,
  });
  const inviato = await inviaGmail(messaggio, origine?.messaggioId);
  await q(`UPDATE documenti SET stato = 'inviato', email_a = $2, email_inviata_il = now(), email_id = $3, aggiornato_il = now() WHERE id = $1`,
    [id, [...a.indirizzi, ...cc.indirizzi].join(', '), inviato.id]);
  return a.indirizzi.join(', ');
}
