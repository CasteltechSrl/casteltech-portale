/**
 * Autofatture dalle fatture dei fornitori esteri (Adriano, 28/10/2026). La fattura (PDF) è un'acquisizione di tipo
 * 'fattura_estera' (cartella Drive / Da acquisire, o caricata in Amministrazione → Autofatture): l'IA la legge
 * (acquisizioni-servizio), qui si collega il fornitore all'anagrafica e, alla conferma dell'ufficio:
 * - il fornitore nuovo entra in anagrafica (stesse regole: P.IVA valida, MAIUSCOLO);
 * - la fattura del fornitore si registra tra le fatture fornitori (documenti_ricevuti, origine 'acquisito');
 * - nasce la bozza dell'autofattura (TD17/18/19, sezionale AF) con tutte le righe in euro: si controlla e si emette.
 */
import { q, q1, transazione } from './db.js';
import { controllaPartitaIva, preparaFornitore } from '../engine/anagrafica-fornitori.js';
import { nomeNazione, siglaNazione } from '../engine/amministrazione.js';
import {
  SEZIONALE_AUTOFATTURE, cambioDaCsv, causaleAutofattura, controllaFatturaEstera, paeseFiscale, righeInEuro, sommaRighe, tipoAutofattura,
  type FatturaEstera,
} from '../engine/autofatture.js';

/** Quello che si salva in acquisizioni.proposta per una fattura estera. */
export interface FatturaEsteraDb extends FatturaEstera {
  tipoDocumento: 'fattura_estera'; fornitoreId: number | null; ricevutoId?: number; autofatturaId?: number;
  doppione?: string | null;   // autofattura già fatta per questa fattura (anche in Fatture in Cloud)
}

/** Autofattura già emessa (anche nello storico di FIC) che cita lo stesso numero di fattura del fornitore. */
export async function autofatturaGiaFatta(numero: string, escluso = 0): Promise<string | null> {
  if (!numero) return null;
  const esatto = numero.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const r = await q1(`SELECT numero, sezionale, anno, data FROM documenti WHERE tipo = 'autofattura' AND id <> $3 AND stato <> 'annullato'
      AND (upper(riferimento_esterno) = upper($1) OR causale ~* $2) ORDER BY data DESC LIMIT 1`,
    [numero, `(^|[^0-9A-Z])${esatto}([^0-9A-Z]|$)`, escluso]);
  if (!r) return null;
  return `Esiste già ${r.numero ? `l'autofattura n. ${r.numero}${r.sezionale ? `/${r.sezionale}` : ''} del ${r.data.split('-').reverse().join('/')}` : 'una bozza di autofattura'} per la fattura n. ${numero}.`;
}

const oggiRoma = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });

/** Fornitore in anagrafica con la stessa P.IVA (scritta con o senza prefisso) o, se manca, con lo stesso nome. */
async function cercaFornitore(f: FatturaEstera): Promise<number | null> {
  const piva = f.fornitore.partita_iva;
  if (piva) {
    const uniforme = controllaPartitaIva(piva, nomeNazione(f.fornitore.paese)).partitaIva;
    const r = await q1<{ id: number }>(`SELECT id FROM fornitori_anagrafica WHERE upper(regexp_replace(partita_iva, '[\\s.\\-]', '', 'g')) = ANY($1) LIMIT 1`,
      [[...new Set([piva, uniforme, piva.replace(/^[A-Z]{2}/, '')])].filter(Boolean)]);
    if (r) return r.id;
  }
  if (!f.fornitore.ragione_sociale) return null;
  const r = await q(`SELECT id FROM fornitori_anagrafica WHERE upper(ragione_sociale) = $1 LIMIT 2`, [f.fornitore.ragione_sociale]);
  return r.length === 1 ? r[0].id : null;
}

/** Cambio BCE (unità di valuta per 1 euro) alla data, o l'ultimo dei 10 giorni prima (fine settimana, festivi). Null se la BCE non risponde. */
export async function cambioBce(valuta: string, data: string): Promise<number | null> {
  if (!/^[A-Z]{3}$/.test(valuta) || valuta === 'EUR') return null;
  const da = new Date(Date.parse(data) - 10 * 86_400_000).toISOString().slice(0, 10);
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const r = await fetch(`https://data-api.ecb.europa.eu/service/data/EXR/D.${valuta}.EUR.SP00.A?startPeriod=${da}&endPeriod=${data}&format=csvdata`, { signal: ctrl.signal });
    return r.ok ? cambioDaCsv(await r.text(), data) : null;
  } catch { return null; } finally { clearTimeout(t); }
}

/**
 * Collega la fattura letta (o corretta dall'ufficio) all'anagrafica: fornitore scelto o trovato, tipo proposto se manca,
 * cambio BCE se la valuta non è l'euro e il cambio non è stato scritto. Il fornitore in anagrafica completa i dati mancanti.
 */
export async function collegaFatturaEstera(f: FatturaEstera, fornitoreScelto?: number | null): Promise<FatturaEsteraDb> {
  let fornitoreId = fornitoreScelto ? (await q1<{ id: number }>(`SELECT id FROM fornitori_anagrafica WHERE id = $1`, [fornitoreScelto]))?.id ?? null : null;
  if (!fornitoreId && fornitoreScelto === undefined) fornitoreId = await cercaFornitore(f);
  const fornitore = { ...f.fornitore };
  if (fornitoreId) {
    const a = await q1(`SELECT * FROM fornitori_anagrafica WHERE id = $1`, [fornitoreId]);
    fornitore.ragione_sociale = a.ragione_sociale;
    fornitore.partita_iva = a.partita_iva;
    for (const k of ['indirizzo', 'cap', 'comune', 'provincia'] as const) fornitore[k] = fornitore[k] || a[k] || '';
    fornitore.paese = fornitore.paese || siglaNazione(a.paese) || '';
  }
  const paese = paeseFiscale(fornitore.partita_iva, fornitore.paese);
  const tipo = f.tipo ?? (paese ? tipoAutofattura(paese, f.servizi) : null);
  const cambio = f.valuta !== 'EUR' && !f.cambio && f.data ? await cambioBce(f.valuta, f.data) : f.cambio;
  return { ...f, tipoDocumento: 'fattura_estera', fornitore, fornitoreId, tipo, cambio, doppione: await autofatturaGiaFatta(f.numero) };
}

/** Salva le correzioni dell'ufficio (senza registrare nulla). */
export async function salvaFatturaEstera(id: number, f: FatturaEstera, fornitoreScelto: number | null): Promise<FatturaEsteraDb> {
  const nuova = await collegaFatturaEstera(f, fornitoreScelto);
  await q(`UPDATE acquisizioni SET proposta = $2, tipo = 'fattura_estera' WHERE id = $1 AND stato IN ('da_confermare', 'errore')`, [id, JSON.stringify(nuova)]);
  return nuova;
}

/** Breve descrizione della fattura per l'elenco delle fatture fornitori: le prime righe. */
const descrizioneDa = (f: FatturaEstera) => {
  const voci = f.righe.slice(0, 3).map(r => r.codice || r.descrizione).filter(Boolean).join(', ');
  return `${voci}${f.righe.length > 3 ? ` e altre ${f.righe.length - 3} righe` : ''}`.slice(0, 300);
};

/**
 * Conferma: fornitore (aggiunto se nuovo), fattura del fornitore tra le fatture fornitori, bozza dell'autofattura con le righe in euro.
 * Restituisce l'id della bozza, da controllare ed emettere in Amministrazione.
 */
export async function confermaFatturaEstera(id: number, input: FatturaEstera, fornitoreScelto: number | null, utenteId: number | null): Promise<number> {
  const f = await collegaFatturaEstera(input, fornitoreScelto);
  const { errori } = controllaFatturaEstera(f);
  if (f.doppione) errori.push(f.doppione);
  if (errori.length) throw new Error(errori.join(' '));
  const righeEuro = righeInEuro(f.righe, f.valuta, f.cambio);
  const imponibile = sommaRighe(righeEuro);
  const oggi = oggiRoma();
  return transazione(async c => {
    const a = (await c.query(`SELECT stato FROM acquisizioni WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!a) throw new Error('Documento non trovato.');
    if (a.stato === 'confermato') throw new Error("L'autofattura di questa fattura è già stata preparata.");

    // fornitore: quello scelto/trovato, altrimenti si aggiunge all'anagrafica con le regole di sempre
    let fornitoreId = f.fornitoreId;
    if (!fornitoreId) {
      const { fornitore, errore } = preparaFornitore({ ...f.fornitore, paese: nomeNazione(f.fornitore.paese),
        note: `Aggiunto dalla fattura n. ${f.numero} del ${f.data!.split('-').reverse().join('/')}` });
      if (errore) throw new Error(`Fornitore: ${errore}`);
      const gia = (await c.query(`SELECT id FROM fornitori_anagrafica WHERE partita_iva = $1`, [fornitore.partita_iva])).rows[0];
      fornitoreId = gia?.id ?? (await c.query(`INSERT INTO fornitori_anagrafica (ragione_sociale, partita_iva, codice_fiscale, indirizzo, cap, comune, provincia, paese, note)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`, [fornitore.ragione_sociale, fornitore.partita_iva, fornitore.codice_fiscale, fornitore.indirizzo,
        fornitore.cap, fornitore.comune, fornitore.provincia, fornitore.paese, fornitore.note])).rows[0].id;
    }
    if ((await c.query(`SELECT 1 FROM documenti_ricevuti WHERE fornitore_id = $1 AND tipo = 'fattura' AND upper(numero) = upper($2)`, [fornitoreId, f.numero])).rowCount)
      throw new Error(`La fattura n. ${f.numero} di questo fornitore è già registrata tra le fatture fornitori.`);

    // fattura del fornitore (in euro; valuta e cambio restano scritti)
    const ricevutoId = (await c.query(`INSERT INTO documenti_ricevuti (tipo, numero, data, fornitore_id, intestatario, descrizione, imponibile, imposta, totale,
        elettronica, origine, valuta, cambio, acquisizione_id)
      VALUES ('fattura', $1, $2, $3, $4, $5, $6, 0, $6, false, 'acquisito', $7, $8, $9) RETURNING id`,
      [f.numero, f.data, fornitoreId, JSON.stringify({ nome: f.fornitore.ragione_sociale, partita_iva: f.fornitore.partita_iva, indirizzo: f.fornitore.indirizzo,
        cap: f.fornitore.cap, comune: f.fornitore.comune, provincia: f.fornitore.provincia, paese: f.fornitore.paese }),
       descrizioneDa(f), imponibile, f.valuta, f.valuta === 'EUR' ? null : f.cambio, id])).rows[0].id;
    await c.query(`INSERT INTO documenti_ricevuti_scadenze (documento_id, data, importo, pagata_il) VALUES ($1, $2, $3, $4)`,
      [ricevutoId, f.data, imponibile, f.pagata ? f.data : null]);

    // bozza dell'autofattura: data di oggi (si può cambiare prima di emettere), righe in euro con IVA 22 %
    const autofatturaId = (await c.query(`INSERT INTO documenti (tipo, tipo_sdi, sezionale, anno, data, fornitore_id, ricevuto_id, causale, riferimento_esterno, creato_da)
      VALUES ('autofattura', $1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [f.tipo, SEZIONALE_AUTOFATTURE, Number(oggi.slice(0, 4)), oggi, fornitoreId, ricevutoId, causaleAutofattura(f.numero, f.data!), f.numero.slice(0, 60), utenteId])).rows[0].id;
    await c.query(`INSERT INTO documenti_righe (documento_id, posizione, codice, descrizione, quantita, prezzo, aliquota_iva)
      SELECT $1, r.posizione, r.codice, r.descrizione, r.quantita, r.prezzo, 'IVA22'
      FROM jsonb_to_recordset($2::jsonb) AS r(posizione int, codice text, descrizione text, quantita numeric, prezzo numeric)`,
      [autofatturaId, JSON.stringify(righeEuro.map((r, i) => ({ posizione: i + 1, codice: r.codice || null, descrizione: r.descrizione || r.codice, quantita: r.quantita, prezzo: r.prezzo })))]);

    await c.query(`UPDATE acquisizioni SET stato = 'confermato', confermato_da = $2, proposta = $3 WHERE id = $1`,
      [id, utenteId, JSON.stringify({ ...f, fornitoreId, ricevutoId, autofatturaId })]);
    return autofatturaId;
  });
}
