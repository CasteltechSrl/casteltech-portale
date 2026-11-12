/**
 * Sicurezza: letture e scritture delle schede di sicurezza (tabella sicurezza_schede), controllo delle righe di ordini a fornitore e DDT ricevuti,
 * ricerca su internet delle schede che mancano (Adriano 12/11/2026). Regole in src/engine/sicurezza.ts.
 */
import { q, q1 } from './db.js';
import { testoPdf } from './testo-pdf.js';
import { chiediTestoIa, iaConfigurata, strumentoRicercaWeb } from './ia.js';
import {
  categoriaSostanza, trovaScheda, normalizzaChiave, paroleDaDescrizione, pericoliDaTesto, eSchedaSicurezza, dataRevisioneDaTesto,
  eCategoriaSostanza, type CategoriaSostanza,
} from '../engine/sicurezza.js';

/** PDF più grandi restano sul Drive (database Neon da 500 MB). */
export const MAX_PDF = 4 * 1024 * 1024;

export interface SchedaDb {
  id: number; prodotto: string; produttore: string | null; fornitore: string | null; categoria: string; tipo: string;
  revisione: string | null; data_revisione: string | null; lingua: string | null; pericoli: string[]; parole: string | null;
  nome_file: string | null; dimensione: number | null; ha_file: boolean; fonte: string; url: string | null; percorso_drive: string | null;
  note: string | null; attiva: boolean; creato_da: string | null; creato_il: string; aggiornato_il: string;
}
const CAMPI = `id, prodotto, produttore, fornitore, categoria, tipo, revisione, to_char(data_revisione, 'YYYY-MM-DD') AS data_revisione, lingua, pericoli, parole,
  nome_file, dimensione, file IS NOT NULL AS ha_file, fonte, url, percorso_drive, note, attiva, creato_da, creato_il, aggiornato_il`;

export const elencoSchede = () => q<SchedaDb>(`SELECT ${CAMPI} FROM sicurezza_schede ORDER BY attiva DESC, categoria, prodotto`);
export const leggiScheda = (id: number) => q1<SchedaDb>(`SELECT ${CAMPI} FROM sicurezza_schede WHERE id = $1`, [id]);
export const fileScheda = (id: number) => q1<{ nome_file: string | null; file: Buffer | null }>(`SELECT nome_file, file FROM sicurezza_schede WHERE id = $1`, [id]);

export interface DatiScheda {
  prodotto: string; produttore?: string | null; fornitore?: string | null; categoria?: string; tipo?: string; revisione?: string | null;
  data_revisione?: string | null; lingua?: string | null; pericoli?: string[]; parole?: string | null; url?: string | null;
  percorso_drive?: string | null; note?: string | null; attiva?: boolean;
}
const testo = (x: unknown, max = 500) => { const t = String(x ?? '').trim(); return t ? t.slice(0, max) : null; };
const dataOk = (x: unknown) => (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && !isNaN(Date.parse(x)) ? x : null);

/** Dati del modulo o dell'API ripuliti: prodotto obbligatorio, categoria e tipo tra quelli ammessi, frasi H in maiuscolo. */
export function ripulisciScheda(b: Record<string, unknown>): DatiScheda | string {
  const prodotto = testo(b.prodotto, 200);
  if (!prodotto) return 'Manca il nome del prodotto.';
  const pericoli = (Array.isArray(b.pericoli) ? b.pericoli.map(String) : String(b.pericoli ?? '').split(/[\s,;]+/))
    .map(h => h.trim().replace(/^h/i, 'H').replace(/^euh/i, 'EUH')).filter(h => /^(EUH\d{3}|H\d{3}[A-Za-z]{0,2})$/.test(h));
  return {
    prodotto: prodotto.toUpperCase(), produttore: testo(b.produttore, 120)?.toUpperCase() ?? null, fornitore: testo(b.fornitore, 120)?.toUpperCase() ?? null,
    categoria: eCategoriaSostanza(b.categoria) ? b.categoria : 'altro', tipo: ['sds', 'tds', 'altro'].includes(String(b.tipo)) ? String(b.tipo) : 'sds',
    revisione: testo(b.revisione, 40), data_revisione: dataOk(b.data_revisione), lingua: testo(b.lingua, 20), pericoli: [...new Set(pericoli)].sort(),
    parole: testo(b.parole, 1000), url: testo(b.url, 1000), percorso_drive: testo(b.percorso_drive, 500), note: testo(b.note, 2000),
    attiva: b.attiva === undefined ? true : b.attiva === true || b.attiva === '1' || b.attiva === 'on',
  };
}

export async function nuovaScheda(d: DatiScheda, file: { nome: string; dati: Buffer } | null, fonte: 'drive' | 'internet' | 'caricata', da: string): Promise<number> {
  const f = file && file.dati.length <= MAX_PDF ? file : null;
  const r = await q1<{ id: number }>(`INSERT INTO sicurezza_schede (prodotto, produttore, fornitore, categoria, tipo, revisione, data_revisione, lingua, pericoli, parole,
      nome_file, file, dimensione, fonte, url, percorso_drive, note, attiva, creato_da)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id`,
    [d.prodotto, d.produttore ?? null, d.fornitore ?? null, d.categoria ?? 'altro', d.tipo ?? 'sds', d.revisione ?? null, d.data_revisione ?? null, d.lingua ?? null,
      d.pericoli ?? [], d.parole ?? null, f?.nome ?? file?.nome ?? null, f?.dati ?? null, f?.dati.length ?? null, fonte, d.url ?? null, d.percorso_drive ?? null,
      d.note ?? null, d.attiva ?? true, da]);
  return r!.id;
}

export async function salvaScheda(id: number, d: DatiScheda): Promise<boolean> {
  return !!(await q1(`UPDATE sicurezza_schede SET prodotto=$2, produttore=$3, fornitore=$4, categoria=$5, tipo=$6, revisione=$7, data_revisione=$8, lingua=$9,
      pericoli=$10, parole=$11, url=$12, percorso_drive=$13, note=$14, attiva=$15, aggiornato_il=now() WHERE id=$1 RETURNING id`,
    [id, d.prodotto, d.produttore ?? null, d.fornitore ?? null, d.categoria ?? 'altro', d.tipo ?? 'sds', d.revisione ?? null, d.data_revisione ?? null, d.lingua ?? null,
      d.pericoli ?? [], d.parole ?? null, d.url ?? null, d.percorso_drive ?? null, d.note ?? null, d.attiva ?? true]));
}

export async function sostituisciFile(id: number, nome: string, dati: Buffer): Promise<boolean> {
  if (dati.length > MAX_PDF) return false;
  return !!(await q1(`UPDATE sicurezza_schede SET nome_file=$2, file=$3, dimensione=$4, aggiornato_il=now() WHERE id=$1 RETURNING id`, [id, nome, dati, dati.length]));
}

export const eliminaScheda = async (id: number) => !!(await q1(`DELETE FROM sicurezza_schede WHERE id = $1 RETURNING id`, [id]));

/** Cosa si legge da solo nel PDF: è una scheda di sicurezza?, frasi H della sezione 2, data di revisione. */
export async function leggiPdf(dati: Buffer): Promise<{ sds: boolean; pericoli: string[]; dataRevisione: string | null; testo: string }> {
  try {
    const t = await testoPdf(dati);
    return { sds: eSchedaSicurezza(t), pericoli: pericoliDaTesto(t), dataRevisione: dataRevisioneDaTesto(t), testo: t };
  } catch { return { sds: false, pericoli: [], dataRevisione: null, testo: '' }; }
}

// ─────────────────────────────── Controllo delle righe ───────────────────────────────

export interface RigaDaControllare { codice: string | null; descrizione: string }
export interface RigaControllata extends RigaDaControllare { categoria: CategoriaSostanza; scheda: SchedaDb | null; ricerca?: { esito: string; nota: string | null; cercata_il: string } | null }

export const chiaveRicerca = (descrizione: string) => normalizzaChiave(descrizione).slice(0, 120);

/** Le righe con sostanze, ognuna con la sua scheda (o null) e l'ultima ricerca su internet fatta. */
export async function controllaRighe(righe: RigaDaControllare[], schede?: SchedaDb[]): Promise<RigaControllata[]> {
  const sostanze = righe.map(r => ({ ...r, categoria: categoriaSostanza(r.codice, r.descrizione) })).filter(r => r.categoria) as (RigaDaControllare & { categoria: CategoriaSostanza })[];
  if (!sostanze.length) return [];
  const tutte = schede ?? await elencoSchede();
  const senza = sostanze.filter(r => !trovaScheda(r.codice, r.descrizione, tutte)).map(r => chiaveRicerca(r.descrizione));
  const ricerche = senza.length ? await q<{ chiave: string; esito: string; nota: string | null; cercata_il: string }>(
    `SELECT chiave, esito, nota, cercata_il FROM sicurezza_ricerche WHERE chiave = ANY($1)`, [senza]) : [];
  return sostanze.map(r => {
    const s = trovaScheda(r.codice, r.descrizione, tutte) ?? null;
    return { ...r, scheda: s, ricerca: s ? null : ricerche.find(x => x.chiave === chiaveRicerca(r.descrizione)) ?? null };
  });
}

export interface RigaDocumento extends RigaDaControllare { origine: 'ordine' | 'ddt'; documentoId: number; documento: string; data: string | null; fornitore: string | null; link: string }

/** Righe degli ordini a fornitore (non annullati) e dei DDT ricevuti dai fornitori degli ultimi `giorni` giorni. */
export async function righeDocumentiRecenti(giorni = 365): Promise<RigaDocumento[]> {
  const ordini = await q<{ id: number; numero: number | null; anno: number; data: string; fornitore: string | null; codice: string | null; descrizione: string }>(
    `SELECT d.id, d.numero, d.anno, to_char(d.data, 'YYYY-MM-DD') AS data, coalesce(d.intestatario->>'ragione_sociale', f.ragione_sociale) AS fornitore, r.codice, r.descrizione
     FROM documenti d JOIN documenti_righe r ON r.documento_id = d.id LEFT JOIN fornitori_anagrafica f ON f.id = d.fornitore_id
     WHERE d.tipo = 'ordine_fornitore' AND d.stato <> 'annullato' AND d.data >= current_date - $1::int AND NOT r.solo_descrizione
     ORDER BY d.data DESC, d.id DESC, r.posizione`, [giorni]);
  const ddt = await q<{ id: number; numero: string | null; data: string | null; mittente_nome: string; acquisizione_id: number | null; righe: { codice?: string; descrizione?: string }[] }>(
    `SELECT id, numero, to_char(data, 'YYYY-MM-DD') AS data, mittente_nome, acquisizione_id, righe FROM ddt_ricevuti
     WHERE mittente = 'fornitore' AND coalesce(data, creato_il::date) >= current_date - $1::int ORDER BY data DESC NULLS LAST, id DESC`, [giorni]);
  return [
    ...ordini.map(o => ({ origine: 'ordine' as const, documentoId: o.id, documento: o.numero ? `ordine ${o.numero}/${o.anno}` : 'ordine (bozza)', data: o.data,
      fornitore: o.fornitore, codice: o.codice, descrizione: o.descrizione, link: `/ordini/fornitori/${o.id}` })),
    ...ddt.flatMap(d => (d.righe ?? []).map(r => ({ origine: 'ddt' as const, documentoId: d.id, documento: `DDT ${d.numero ?? ''}`.trim(), data: d.data,
      fornitore: d.mittente_nome, codice: r.codice ?? null, descrizione: r.descrizione ?? '', link: d.acquisizione_id ? `/ordini/acquisire/${d.acquisizione_id}` : '/acquisti/ddt' }))),
  ];
}

/** Materiali di consumo (Anagrafiche → Materiali) che sono sostanze: per vedere subito quali prodotti usati non hanno la scheda. */
export const materialiSostanze = async () => (await q<{ id: number; codice: string; descrizione: string; attivo: boolean }>(
  `SELECT id, codice, descrizione, attivo FROM materiali_consumo ORDER BY codice`)).filter(m => categoriaSostanza(m.codice, m.descrizione));

// ─────────────────────────────── Ricerca su internet ───────────────────────────────

const ISTRUZIONI_SDS = `Sei l'ufficio sicurezza di Casteltech, assemblaggio di schede elettroniche in Italia. Ti do la riga di un ordine o di un DDT di un prodotto chimico
(pasta saldante, filo o barre di stagno, flussante, solvente, coating, colla…). Cerca su internet la SCHEDA DI DATI DI SICUREZZA (SDS, Reg. CE 1907/2006),
preferibilmente in italiano e nella versione più recente, sul sito del produttore o di un distributore (Henkel/Loctite mysds, MacDermid Alpha, Heraeus, Felder,
Indium, Kester, Stannol, Dow, Electrolube, Kyzen, Zestron, GEA, I-TRONIK, RS, Farnell, Mouser, DigiKey…). Il codice tra parentesi è spesso quello del fornitore.
Rispondi SOLO con un oggetto JSON:
{"trovata": <true se hai trovato la scheda di sicurezza di QUESTO prodotto>, "prodotto": "<nome commerciale come sulla scheda>", "produttore": "<nome>",
"urlPdf": "<link diretto al file PDF della scheda, o null>", "pagina": "<pagina dove si scarica, se il PDF non ha un link diretto, o null>",
"lingua": "<it, en…>", "dataRevisione": "<aaaa-mm-gg se la leggi, o null>", "nota": "<in italiano, 1-2 frasi: cosa hai trovato e con quale certezza>"}.
Solo link reali trovati nelle pagine lette; se trovi solo la scheda tecnica (TDS) o un prodotto simile, "trovata" false e spiegalo nella nota.`;

function leggiOggetto(t: string): any {
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch { return null; }
}

/** Scarica il PDF (massimo 4 MB, 20 secondi): null se non è un PDF. */
async function scaricaPdf(url: string): Promise<Buffer | null> {
  if (!/^https?:\/\//i.test(url)) return null;
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (portale)', accept: 'application/pdf,*/*' } });
    if (!r.ok) return null;
    const lunghezza = Number(r.headers.get('content-length') ?? 0);
    if (lunghezza > MAX_PDF) return null;
    const b = Buffer.from(await r.arrayBuffer());
    return b.length <= MAX_PDF && b.subarray(0, 5).toString('latin1') === '%PDF-' ? b : null;
  } catch { return null; } finally { clearTimeout(t); }
}

export interface EsitoRicerca { esito: 'trovata' | 'link' | 'non_trovata' | 'errore' | 'gia_fatta' | 'senza_ia'; schedaId?: number; nota: string }

const inCorso = new Set<string>();

/**
 * Cerca su internet la scheda di sicurezza della riga e la mette tra le schede (fonte 'internet', con il PDF se si scarica, altrimenti il link).
 * Una ricerca per descrizione: non si ripete prima di 30 giorni, salvo `forza` (pulsante "Cerca su internet").
 */
export async function cercaSchedaOnline(riga: RigaDaControllare, opz: { forza?: boolean; da?: string } = {}): Promise<EsitoRicerca> {
  const chiave = chiaveRicerca(riga.descrizione || riga.codice || '');
  if (!chiave) return { esito: 'non_trovata', nota: 'Riga vuota.' };
  if (!iaConfigurata()) return { esito: 'senza_ia', nota: "Manca la chiave dell'IA: la scheda va cercata e caricata a mano." };
  if (inCorso.has(chiave)) return { esito: 'gia_fatta', nota: 'Ricerca già in corso.' };
  if (!opz.forza) {
    const prima = await q1<{ esito: string; nota: string | null }>(`SELECT esito, nota FROM sicurezza_ricerche WHERE chiave = $1 AND cercata_il > now() - interval '30 days'`, [chiave]);
    if (prima) return { esito: 'gia_fatta', nota: prima.nota ?? '' };
  }
  inCorso.add(chiave);
  const registra = (esito: string, nota: string, schedaId: number | null = null) =>
    q(`INSERT INTO sicurezza_ricerche (chiave, descrizione, esito, scheda_id, nota) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (chiave) DO UPDATE SET esito = $3, scheda_id = $4, nota = $5, cercata_il = now(), descrizione = $2`,
      [chiave, `${riga.codice ?? ''} ${riga.descrizione}`.trim().slice(0, 300), esito, schedaId, nota.slice(0, 500)]);
  try {
    const risposta = await chiediTestoIa('schede di sicurezza su internet', { max_tokens: 1500, system: ISTRUZIONI_SDS,
      messages: [{ role: 'user', content: `Riga: ${riga.codice ? `codice ${riga.codice} – ` : ''}${riga.descrizione}` }], strumenti: [strumentoRicercaWeb(4)] }, 150_000);
    const x = leggiOggetto(risposta);
    if (!x || x.trovata !== true) {
      const nota = `Non trovata su internet${x?.nota ? `: ${String(x.nota).slice(0, 300)}` : '.'}`;
      await registra('non_trovata', nota);
      return { esito: 'non_trovata', nota };
    }
    const pdf = x.urlPdf ? await scaricaPdf(String(x.urlPdf)) : null;
    const letto = pdf ? await leggiPdf(pdf) : null;
    const cat = categoriaSostanza(riga.codice, riga.descrizione) ?? 'altro';
    const parole = [riga.codice && /^MC-/i.test(riga.codice) ? riga.codice.toUpperCase() : null, ...paroleDaDescrizione(riga.descrizione)].filter(Boolean).join('\n');
    const prodotto = String(x.prodotto ?? '').trim() || riga.descrizione;
    const d = ripulisciScheda({
      prodotto, produttore: x.produttore, categoria: cat, tipo: letto && !letto.sds ? 'altro' : 'sds', lingua: x.lingua,
      data_revisione: letto?.dataRevisione ?? x.dataRevisione, pericoli: letto?.pericoli ?? [], parole: parole || prodotto,
      url: String(x.urlPdf ?? x.pagina ?? '') || null,
      note: `Trovata su internet il ${new Date().toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' })} per la riga «${riga.descrizione.slice(0, 150)}». ${String(x.nota ?? '').slice(0, 300)}`
        + (pdf ? '' : ' Il PDF non si è potuto scaricare: aprilo dal link e caricalo.'),
    }) as DatiScheda;
    const id = await nuovaScheda(d, pdf ? { nome: `${normalizzaChiave(prodotto).slice(0, 40) || 'scheda'}.pdf`, dati: pdf } : null, 'internet', opz.da ?? 'ricerca automatica');
    const esito = pdf ? 'trovata' : 'link';
    const nota = pdf ? `Scheda trovata e salvata (${prodotto}).` : `Trovato il link della scheda (${prodotto}), il PDF va scaricato a mano.`;
    await registra(esito, nota, id);
    return { esito, schedaId: id, nota };
  } catch (e: any) {
    const nota = `Ricerca non riuscita: ${e?.message ?? e}`;
    await registra('errore', nota).catch(() => undefined);
    return { esito: 'errore', nota };
  } finally { inCorso.delete(chiave); }
}

/**
 * Dopo l'emissione di un ordine a fornitore o la conferma di un DDT ricevuto: le sostanze senza scheda si cercano su internet da sole,
 * dopo la risposta alla pagina e una per volta (massimo 3 per documento, per non spendere troppo).
 */
export function cercaMancantiDopo(righe: RigaDaControllare[], da: string): void {
  setImmediate(async () => {
    try {
      const mancanti = (await controllaRighe(righe)).filter(r => !r.scheda);
      const viste = new Set<string>();
      for (const r of mancanti) {
        const k = chiaveRicerca(r.descrizione);
        if (viste.has(k)) continue;
        viste.add(k);
        if (viste.size > 3) break;
        await cercaSchedaOnline(r, { da });
      }
    } catch (e) { console.warn('Sicurezza: ricerca automatica delle schede non riuscita', e); }
  });
}
