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

/** Colonna della BOM per ogni ruolo (P/N, quantità, designatori…). */
export function rilevaColonne(colonne: string[]): Partial<Record<Ruolo, string>> {
  const mappa: Partial<Record<Ruolo, string>> = {}, usate = new Set<string>();
  const norm = Object.fromEntries(colonne.map(c => [c, normH(c)]));
  for (const ruolo of ['pn', 'designatori', 'quantita', 'valore', 'footprint', 'descrizione', 'famiglia', 'produttore'] as Ruolo[]) {
    let scelta: string | undefined;
    for (const kw of RUOLI[ruolo]) { scelta = colonne.find(c => !usate.has(c) && norm[c] === kw); if (scelta) break; }
    if (!scelta && ['pn', 'descrizione', 'footprint', 'designatori'].includes(ruolo)) {
      for (const kw of RUOLI[ruolo]) {
        if (kw.length < 4) continue;
        scelta = colonne.find(c => !usate.has(c) && norm[c].includes(kw));
        if (scelta) break;
      }
    }
    if (scelta) { mappa[ruolo] = scelta; usate.add(scelta); }
  }
  return mappa;
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

