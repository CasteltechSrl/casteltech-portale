/**
 * Lettura delle colonne di una BOM (portata da core/bom.py) e regole d'acquisto Casteltech sulla codifica.
 * Nessun accesso al database: l'elaborazione completa è in src/server/codifica-servizio.ts.
 */
import { FAMIGLIE, type Attributi } from './regole.js';
import { POWER_BY_SIZE } from './decoder.js';

export type Ruolo = 'pn' | 'produttore' | 'valore' | 'footprint' | 'descrizione' | 'designatori' | 'quantita' | 'famiglia';

export const RUOLI: Record<Ruolo, string[]> = {
  pn: ['MPN', 'P/N', 'PN', 'MANUFACTURER PART NUMBER', 'MANUFACTURER PART', 'MFR PART', 'MFG PART', 'PART NUMBER',
    'PARTNUMBER', 'PART NO', 'MANUFACTURER P/N', 'MANUFACTURER PN', 'MFR P/N', 'MFG P/N', 'CODICE PRODUTTORE', 'CODICE COSTRUTTORE', 'MFR. #', 'MFR #', 'ARTICOLO', 'COMPONENTE'],
  produttore: ['MANUFACTURER', 'PRODUTTORE', 'MFR', 'MFG', 'COSTRUTTORE', 'BRAND', 'MARCA'],
  valore: ['VALUE', 'VALORE', 'VAL', 'COMMENT'],
  footprint: ['FOOTPRINT', 'PACKAGE', 'CASE', 'PCB DECAL', 'FORMATO', 'CONTENITORE', 'PATTERN'],
  descrizione: ['DESCRIPTION', 'DESCRIZIONE', 'DESC', 'COMMENT', 'COMMENTO'],
  designatori: ['DESIGNATOR', 'DESIGNATORS', 'REFERENCE', 'REFERENCES', 'REF', 'REFDES', 'RIFERIMENTI', 'RIFERIMENTO',
    'DESIGNATORI', 'PART REFERENCE'],
  quantita: ['QTY', 'QUANTITY', 'QTA', 'QTÀ', "QTA'", 'QUANTITÀ', 'QUANTITA', 'Q.TA', 'QT', 'Q.TÀ'],
  famiglia: ['FAMIGLIA', 'SIGLA'],
};
export const ETICHETTE_RUOLI: Record<Ruolo, string> = { pn: 'P/N', produttore: 'Produttore', valore: 'Valore', footprint: 'Footprint / Package',
  descrizione: 'Descrizione', designatori: 'Designatori', quantita: 'Quantità a scheda', famiglia: 'Famiglia (sigla)' };

const normH = (h: unknown) => String(h ?? '').replace(/\s+/g, ' ').trim().toUpperCase();

/** Riga di intestazione: la prima (entro 25) con la colonna del P/N o almeno due nomi di colonna noti. */
export function rigaIntestazione(righe: string[][]): number {
  const tutte = new Set(Object.values(RUOLI).flat());
  for (let i = 0; i < Math.min(25, righe.length); i++) {
    const celle = righe[i].map(normH);
    if (celle.some(c => RUOLI.pn.includes(c)) || celle.filter(c => tutte.has(c)).length >= 2) return i;
  }
  return 0;
}

/**
 * Righe da non analizzare (suggerimento di Adriano Croci, 27/10/2026: "non deve tenere conto delle intestazioni"):
 * l'intestazione ripetuta a ogni pagina (almeno 2 celle uguali ai nomi di colonna, nella stessa posizione) e le righe di solo testo
 * (una sola cella scritta: titolo, "Totale", "Pagina 2", note in fondo) quando la BOM ha almeno 3 colonne.
 */
export function pulisciRigheBom<T extends { n: number; celle: unknown[] }>(intestazione: unknown[], dati: T[]): { tenute: T[]; tolte: { n: number; motivo: string }[] } {
  const nomi = intestazione.map(normH);
  const colonneScritte = nomi.filter(Boolean).length;
  const tenute: T[] = [], tolte: { n: number; motivo: string }[] = [];
  for (const r of dati) {
    const celle = r.celle.map(normH);
    const uguali = celle.filter((c, i) => c && c === nomi[i]).length;
    const scritte = celle.filter(Boolean).length;
    if (uguali >= 2 && uguali >= scritte / 2) tolte.push({ n: r.n, motivo: 'intestazione ripetuta' });
    else if (colonneScritte >= 3 && scritte === 1) tolte.push({ n: r.n, motivo: 'riga di solo testo' });
    else tenute.push(r);
  }
  return { tenute, tolte };
}

/** Circuito stampato nella BOM (suggerimento di Adriano Croci): non è un componente da montare, il PCB si quota a parte. */
export function rigaPcb(r: { designatori?: string | null; valore?: string | null; descrizioneBom?: string | null; pn?: string | null }): boolean {
  const des = String(r.designatori ?? '').trim();
  if (/^(PCB|PWB|CS)\d*$/i.test(des)) return true;
  if (des && !/^(PCB|PWB)/i.test(des)) return false; // un componente con designatore (es. J1 "PCB mount") resta
  return /\b(PCB|PWB|CIRCUITO STAMPATO|BARE BOARD|SCHEDA NUDA|PRINTED CIRCUIT BOARD)\b/i.test(`${r.valore ?? ''} ${r.descrizioneBom ?? ''} ${r.pn ?? ''}`);
}

/** Nomi di colonna unici ("Valore", "Valore (2)"). */
export function nomiColonne(intestazione: string[]): string[] {
  const visti: Record<string, number> = {};
  return intestazione.map(c => {
    const n = String(c ?? '').trim() || 'Colonna';
    visti[n] = (visti[n] ?? 0) + 1;
    return visti[n] === 1 ? n : `${n} (${visti[n]})`;
  });
}

/**
 * Colonna della BOM per ogni ruolo (P/N, quantità, designatori…).
 * 1. titolo uguale a un nome noto; 2. titolo che contiene un nome noto (es. "Part / Valore");
 * 3. con le righe della BOM (dati), per i ruoli ancora senza colonna: si guarda cosa c'è dentro
 *    (designatori "R1,R2", quantità che tornano con i designatori, case "0603", valori "10k"/"100n", P/N, descrizioni).
 */
export function rilevaColonne(colonne: string[], dati: string[][] = []): Partial<Record<Ruolo, string>> {
  const mappa: Partial<Record<Ruolo, string>> = {}, usate = new Set<string>();
  const norm = Object.fromEntries(colonne.map(c => [c, normH(c)]));
  const ordine: Ruolo[] = ['pn', 'designatori', 'quantita', 'valore', 'footprint', 'descrizione', 'famiglia', 'produttore'];
  for (const ruolo of ordine) {
    for (const kw of RUOLI[ruolo]) {
      const scelta = colonne.find(c => !usate.has(c) && norm[c] === kw);
      if (scelta) { mappa[ruolo] = scelta; usate.add(scelta); break; }
    }
  }
  for (const ruolo of ordine) {
    if (mappa[ruolo]) continue;
    for (const kw of RUOLI[ruolo]) {
      if (kw.length < 4 || (ruolo === 'valore' && kw === 'COMMENT')) continue; // "Commento" è una descrizione
      const scelta = colonne.find(c => !usate.has(c) && norm[c].includes(kw));
      if (scelta) { mappa[ruolo] = scelta; usate.add(scelta); break; }
    }
  }
  if (dati.length) perContenuto(colonne, dati, mappa, usate);
  return mappa;
}

// ── riconoscimento dal contenuto ──
const RE_DESIGNATORI = /^[A-Z]{1,8}_?\d+[A-Z]?(?:\s*[-,;\s]\s*[A-Z]{0,8}_?\d+[A-Z]?)*$/i;
const RE_INTERO = /^\d+$/;
const RE_CASE = /\b(?:01005|0201|0402|0603|0805|1206|1210|1806|1812|2010|2220|2512|SOT-?\d*|SOD-?\d*|SOIC|SOP|SSOP|TSSOP|MSOP|QFN|DFN|LFCSP|QFP|LQFP|TQFP|BGA|DPAK|D2PAK|TO-?\d+|SMA|SMB|SMC|MELF|DO-?\d+|THT|SMD|PINHEADER|TESTPOINT)/i;
/** Valore di un passivo all'inizio della cella: 10k, 4K7, 100n, 4.7u, 2,2uF, 49.9k - 1%, 100nF 50V X7R, 10uH, 50 (max 4 cifre senza unità). */
const RE_VALORE = /^\d{1,4}(?:[.,]\d+)?\s*(?:[pnuµμmkKMGR]\d*)?\s*(?:F|H|Ω|OHMS?)?(?:$|[\s\-/_,;%]+)/i;
const RE_PN = /^(?=.*\d)(?=.*[A-Z])[A-Z0-9][A-Z0-9\-+/.#_]{4,}$/i;

function perContenuto(colonne: string[], dati: string[][], mappa: Partial<Record<Ruolo, string>>, usate: Set<string>) {
  const campione = dati.slice(0, 300);
  const celle = (c: string) => campione.map(r => String(r[colonne.indexOf(c)] ?? '').trim()).filter(x => x && x.toLowerCase() !== 'nan');
  const quota = (c: string, prova: (x: string) => boolean) => { const v = celle(c); return v.length ? v.filter(prova).length / v.length : 0; };
  // solo colonne piene almeno per un terzo (una colonna "Note" con poche righe scritte non è una descrizione)
  const libere = () => colonne.filter(c => !usate.has(c) && celle(c).length >= Math.max(Math.min(3, campione.length), campione.length / 3));
  const scegli = (ruolo: Ruolo, punteggio: (c: string) => number, soglia: number) => {
    if (mappa[ruolo]) return;
    let migliore: string | undefined, max = soglia;
    for (const c of libere()) { const p = punteggio(c); if (p >= max) { max = p; migliore = c; } }
    if (migliore) { mappa[ruolo] = migliore; usate.add(migliore); }
  };
  const tuttiInteri = (c: string) => quota(c, x => RE_INTERO.test(x)) >= 0.8;
  scegli('designatori', c => tuttiInteri(c) ? 0 : quota(c, x => RE_DESIGNATORI.test(x)), 0.6);
  // quantità: la colonna di numeri interi che torna con il numero di designatori (non il numero di riga)
  if (mappa.designatori) {
    const iD = colonne.indexOf(mappa.designatori);
    scegli('quantita', c => {
      if (!tuttiInteri(c)) return 0;
      const i = colonne.indexOf(c);
      const coppie = campione.filter(r => String(r[i] ?? '').trim() && String(r[iD] ?? '').trim());
      return coppie.length ? coppie.filter(r => Number(r[i]) === elencoDesignatori(r[iD]).length).length / coppie.length : 0;
    }, 0.6);
  }
  scegli('footprint', c => quota(c, x => RE_CASE.test(x) && x.length <= 40 && x.split(/\s+/).length <= 2), 0.5); // non una descrizione "RES 10K 0402"
  scegli('valore', c => tuttiInteri(c) ? 0 : quota(c, x => RE_VALORE.test(x)), 0.35);
  scegli('pn', c => quota(c, x => RE_PN.test(x) && !RE_CASE.test(x) && !RE_VALORE.test(x)), 0.5);
  // descrizione: testo lungo con spazi
  scegli('descrizione', c => quota(c, x => x.length >= 12 && /\s/.test(x) && /[A-Z]{2}/i.test(x)), 0.5);
}

/** Designatori → elenco (R1-R4 → R1, R2, R3, R4). */
export function elencoDesignatori(testo: unknown): string[] {
  const out: string[] = [];
  for (const parte of String(testo ?? '').toUpperCase().split(/[,;\s]+/).filter(Boolean)) {
    const m = parte.match(/^([A-Z]+)(\d+)-(?:[A-Z]+)?(\d+)$/);
    if (m && Number(m[3]) >= Number(m[2]) && Number(m[3]) - Number(m[2]) < 500) {
      for (let k = Number(m[2]); k <= Number(m[3]); k++) out.push(`${m[1]}${k}`);
    } else out.push(parte);
  }
  return out;
}

/** Quantità a scheda: colonna quantità, altrimenti il numero di designatori. */
export function quantitaRiga(qta: unknown, designatori: unknown): { qta: number; nota?: string } {
  const n = Number(String(qta ?? '').replace(',', '.').trim());
  const d = elencoDesignatori(designatori).length;
  if (String(qta ?? '').trim() && Number.isFinite(n) && n >= 0) {
    return d && d !== n ? { qta: n, nota: `quantità ${n} ma ${d} designatori` } : { qta: n };
  }
  return d ? { qta: d, nota: 'quantità contata dai designatori' } : { qta: 0, nota: 'quantità mancante' };
}

/** Valori standard Casteltech dei condensatori ceramici quando la BOM non li indica. */
export const STANDARD_CONDENSATORI = { dielettrico: 'X5R', tolleranza: '20', tensione: '25V' } as const;
/** Inizio della nota che rende il codice "DA VERIFICARE" (si toglie quando la riga viene corretta a mano). */
export const NOTA_DA_VALIDARE = 'CODICE DA VALIDARE';

/**
 * Condensatori ceramici: dielettrico, tolleranza e tensione mancanti si completano con i valori standard
 * (X5R, 20%, 25V) e la nota rende il codice da validare. Si applica ai componenti nuovi, dopo l'eventuale lettura con l'IA.
 */
export function regolaCondensatori(famiglia: string | null, a: Attributi): { attributi: Attributi; note: string[] } {
  if (famiglia !== 'CC') return { attributi: a, note: [] };
  const out: Attributi = { ...a }, messi: string[] = [];
  if (!String(a.dielettrico ?? '').trim()) { out.dielettrico = STANDARD_CONDENSATORI.dielettrico; messi.push('dielettrico X5R'); }
  if (!String(a.tolleranza ?? '').trim()) { out.tolleranza = STANDARD_CONDENSATORI.tolleranza; messi.push('tolleranza 20%'); }
  if (!String(a.tensione ?? '').trim()) { out.tensione = STANDARD_CONDENSATORI.tensione; messi.push('tensione 25V'); }
  return { attributi: out, note: messi.length ? [`${NOTA_DA_VALIDARE}: mancavano dei dati, usati i valori standard (${messi.join(', ')})`] : [] };
}

/**
 * Resistenze: Casteltech compra solo all'1% (o meglio, se la BOM chiede meno dell'1%); le 5% non si comprano.
 * Si applica prima di calcolare i codici quando il componente è nuovo.
 */
export function regolaResistenze(famiglia: string | null, a: Attributi): { attributi: Attributi; note: string[] } {
  if (famiglia !== 'RS') return { attributi: a, note: [] };
  const out: Attributi = { ...a }, note: string[] = [];
  const t = String(a.tolleranza ?? '').replace('%', '').replace(',', '.').replace('±', '').trim();
  const n = Number(t);
  if (!t || !Number.isFinite(n)) { out.tolleranza = '1'; note.push('tolleranza non indicata: 1% (acquistiamo solo all\'1%)'); }
  else if (n > 1) { out.tolleranza = '1'; note.push(`tolleranza ${t}% → 1% (le ${t}% non si acquistano)`); }
  // senza potenza (es. "2K2 0603" in BOM): potenza standard del case
  const cs = String(a.case ?? '').replace(/\s/g, '');
  if (!a.potenza && POTENZA_STANDARD[cs]) { out.potenza = POTENZA_STANDARD[cs]; note.push(`potenza non indicata: ${POTENZA_STANDARD[cs]} (standard del case ${cs})`); }
  return { attributi: out, note };
}
/** Potenza standard delle resistenze chip per case (come la decodifica dei P/N). */
export const POTENZA_STANDARD: Record<string, string> = { ...POWER_BY_SIZE };

/** Tutti i dati per il codice di produzione ci sono? */
export function completo(fam: string | null, a: Attributi): boolean {
  const spec = fam ? FAMIGLIE[fam] : null;
  return !!spec && spec.prod.every(k => k === 'RID' || k === 'PN' || !!a[k]);
}

/** Chiave di confronto del P/N: maiuscolo, solo lettere e cifre, senza prefissi da barcode/catalogo. */
export function pnKey(pn: unknown): string | null {
  if (pn == null) return null;
  let s = String(pn).trim().toUpperCase();
  if (['', 'NAN', 'NONE'].includes(s)) return null;
  s = s.replace(/^(1P|30P)(?=[A-Z])/, '').replace(/^\d{2,3}-(?=[A-Z])/, '').replace(/[^A-Z0-9]/g, '');
  return s || null;
}

/** CSV con virgolette (separatore ; , o tabulazione). */
export function leggiCsv(testo: string, sep: string): string[][] {
  const righe: string[][] = []; let riga: string[] = [], cella = '', tra = false;
  for (let i = 0; i < testo.length; i++) {
    const c = testo[i];
    if (tra) { if (c === '"' && testo[i + 1] === '"') { cella += '"'; i++; } else if (c === '"') tra = false; else cella += c; }
    else if (c === '"') tra = true;
    else if (c === sep) { riga.push(cella.trim()); cella = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && testo[i + 1] === '\n') i++; riga.push(cella.trim()); righe.push(riga); riga = []; cella = ''; }
    else cella += c;
  }
  if (cella || riga.length) { riga.push(cella.trim()); righe.push(riga); }
  return righe;
}


/**
 * BOM stampata come report a colonne fisse (Control Systems, M0929-C 29/10/2026: "Reference  NxU.M.  Componente....  Costruttore....
 * Descrizione componente", valori riempiti con puntini, intestazione ripetuta a ogni pagina). Le colonne si prendono dalla riga di
 * intestazione: ogni titolo inizia una colonna. Ritorna null se il testo non ha un'intestazione così.
 */
export function leggiBomColonneFisse(testo: string): string[][] | null {
  const righe = testo.replace(/\f/g, '\n').split(/\r?\n/);
  const eIntestazione = (r: string) => /^\s*(Reference|Riferiment[oi]|Designator|Ref\.?)\s{2,}\S/i.test(r) && r.trim().split(/\s{2,}/).length >= 3;
  const i = righe.findIndex(eIntestazione);
  if (i < 0) return null;
  // le altre righe devono usare spazi, non separatori (altrimenti è un CSV normale)
  const dati = righe.slice(i + 1).filter(r => r.trim());
  if (!dati.length || dati.filter(r => /[;\t]/.test(r)).length * 2 > dati.length) return null;
  const inizi: number[] = [];
  const re = /\S+(?: \S+)*/g;
  for (let m; (m = re.exec(righe[i]));) inizi.push(m.index);
  const taglia = (r: string) => inizi.map((da, k) => r.slice(da, inizi[k + 1] ?? undefined).replace(/\.{3,}\s*$/, '').trim());
  const out = [taglia(righe[i])];
  for (const r of righe.slice(i + 1)) {
    if (!r.trim() || eIntestazione(r)) continue;
    // la prima colonna deve essere un riferimento; le righe di pagina, data, titolo restano fuori
    if (!/^[A-Z][A-Z0-9_]{0,15}$/i.test(r.slice(inizi[0], inizi[1]).trim())) continue;
    out.push(taglia(r));
  }
  return out.length > 1 ? out : null;
}
