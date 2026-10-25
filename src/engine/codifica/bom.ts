/**
 * Lettura delle colonne di una BOM (portata da core/bom.py) e regole d'acquisto Casteltech sulla codifica.
 * Nessun accesso al database: l'elaborazione completa è in src/server/codifica-servizio.ts.
 */
import { FAMIGLIE, type Attributi } from './regole.js';
import { POWER_BY_SIZE } from './decoder.js';

export type Ruolo = 'pn' | 'produttore' | 'valore' | 'footprint' | 'descrizione' | 'designatori' | 'quantita' | 'famiglia';

export const RUOLI: Record<Ruolo, string[]> = {
  pn: ['MPN', 'P/N', 'PN', 'MANUFACTURER PART NUMBER', 'MANUFACTURER PART', 'MFR PART', 'MFG PART', 'PART NUMBER',
    'PARTNUMBER', 'PART NO', 'CODICE PRODUTTORE', 'CODICE COSTRUTTORE', 'MFR. #', 'MFR #', 'ARTICOLO', 'COMPONENTE'],
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

