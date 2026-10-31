/**
 * Quale codice comprare quando la BOM non ha la colonna del P/N (o la cella è vuota) — Adriano 29/10/2026.
 * Le BOM di KiCad spesso hanno il codice del produttore in "Value" o in "Description" (es. Value "1N5819S4/SOD123",
 * Description "1N5819HW-7-F"): si raccolgono i codici possibili delle due colonne, si cercano tutti dai distributori
 * e si compra quello che si trova (prima quello disponibile nella quantità che serve, poi quello con più pezzi).
 * Se i codici sono due diversi si controlla se sono lo stesso componente (uno contiene l'altro, stessa sigla JEDEC 1N/2N)
 * o se c'è una criticità da far validare all'ufficio. Si confrontano anche i dati scritti nella BOM con quelli letti dal codice
 * (es. BOM 168K, codice RC0805FR-07162KL = 162K). Nessun accesso al database.
 */
import { caseDaTesto } from './decoder.js';
import { parseValue, FAMIGLIE, type Attributi } from './regole.js';
import { NOTA_DA_VALIDARE, pnKey } from './bom.js';
import { sceltaMigliore, type Offerta } from '../acquisti.js';

export type ColonnaPn = 'valore' | 'descrizione';
export interface CandidatoPn { pn: string; da: ColonnaPn }

/** Valore di un passivo (10k, 4K7, 100nF, 49.9R, 68Ω, 470k/R0402, 100nF/10V/10%/X7R/C0603). */
const RE_VALORE = /^\d{1,4}(?:[.,]\d+)?\s*(?:[pnuµμmkKMGR]\d*)?\s*(?:F|H|Ω|OHMS?|R)?$/i;
const RE_PN = /^(?=.*\d)(?=.*[A-Z])[A-Z0-9][A-Z0-9\-+/.#,]{3,}$/i;

/** Il codice del produttore contenuto in una cella, o null (descrizioni, valori, nomi generici di KiCad). */
export function pnDaCella(cella: unknown): string | null {
  let s = String(cella ?? '').trim();
  if (!s || /\s/.test(s) || /[_:]/.test(s)) return null; // più parole = descrizione; "Conn_01x02", "Diode_SMD:D_SOD-123" = nomi di libreria
  s = s.replace(/\([^)]*\)$/, '');                         // BAT54C(SOT23-3) → BAT54C
  const parti = s.split('/');
  if (parti.length > 1 && RE_VALORE.test(parti[0])) return null; // 100nF/10V/10%… è un valore
  if (parti.length === 2 && eCase(parti[1])) s = parti[0];  // 1N5819S4/SOD123 → 1N5819S4
  s = s.replace(/-ND$/i, '');                              // codice DigiKey (MAX3485CSA+CT-ND)
  if (RE_VALORE.test(s) || eCase(s) || !RE_PN.test(s)) return null;
  return s.toUpperCase();
}
const eCase = (x: string) => { const c = caseDaTesto(x); return !!c && c === x.toUpperCase().replace(/^[RC](?=\d{4}$)/, '').replace(/-/g, ''); };

/** Quanto una colonna sembra quella dei codici (quota delle celle con un codice): serve a decidere quale guardare prima. */
export function quotaPn(celle: (string | null)[]): number {
  const piene = celle.filter(c => c && c.trim());
  return piene.length ? piene.filter(c => pnDaCella(c)).length / piene.length : 0;
}

/** Codici possibili di una riga, nell'ordine delle colonne (prima quella che nella BOM ha più codici). Senza doppioni. */
export function candidatiPn(celle: Partial<Record<ColonnaPn, string | null>>, ordine: ColonnaPn[] = ['descrizione', 'valore']): CandidatoPn[] {
  const out: CandidatoPn[] = [];
  for (const da of ordine) {
    const pn = pnDaCella(celle[da]);
    if (!pn || out.some(c => pnKey(c.pn) === pnKey(pn))) continue;
    // uno contiene l'altro (LMR51430Y e LMR51430YDDCR): prima quello completo, è quello che si ordina
    const corto = out.findIndex(c => (pnKey(pn) ?? '').startsWith(pnKey(c.pn) ?? '-'));
    if (corto >= 0) out.splice(corto, 0, { pn, da }); else out.push({ pn, da });
  }
  return out;
}

/** Sigla JEDEC (1N5819, 2N7002): la fanno molti produttori con suffissi diversi. */
const JEDEC = /^[1-3]N\d{3,5}/;
/**
 * Due codici della stessa riga sono lo stesso componente? 'contenuto' = uno è l'altro con il suffisso d'imballo o di variante
 * (BAT54C e BAT54C,215; LMR51430Y e LMR51430YDDCR); 'jedec' = stessa sigla 1N/2N di produttori diversi; null = diversi, da controllare.
 */
export function stessoComponente(a: string, b: string): { tipo: 'contenuto' | 'jedec'; base: string } | null {
  const A = pnKey(a) ?? '', B = pnKey(b) ?? '';
  if (!A || !B) return null;
  if (A === B || (Math.min(A.length, B.length) >= 4 && (A.startsWith(B) || B.startsWith(A)))) return { tipo: 'contenuto', base: A.length <= B.length ? a : b };
  const ja = JEDEC.exec(A)?.[0], jb = JEDEC.exec(B)?.[0];
  if (ja && ja === jb) return { tipo: 'jedec', base: ja };
  return null;
}

/** Il codice da comprare: quello disponibile nella quantità che serve (nell'ordine delle colonne), poi quello con più pezzi, poi il primo. */
export function scegliCandidato(candidati: CandidatoPn[], offerte: (pn: string) => Offerta[], qta: number): { scelto: CandidatoPn; trovato: boolean; disponibile: boolean } | null {
  if (!candidati.length) return null;
  const valutati = candidati.map(c => { const o = offerte(c.pn); const s = sceltaMigliore(o, Math.max(1, qta)); return { c, trovato: o.length > 0, disponibile: !!s?.disponibile, pezzi: Math.max(0, ...o.map(x => x.stock)) }; });
  const best = valutati.find(v => v.disponibile) ?? [...valutati].filter(v => v.trovato).sort((x, y) => y.pezzi - x.pezzi)[0] ?? valutati[0];
  return { scelto: best.c, trovato: best.trovato, disponibile: best.disponibile };
}

const NOMI_COLONNA: Record<ColonnaPn, string> = { valore: 'Valore', descrizione: 'Descrizione' };
/** Nota sulla riga quando la BOM porta due codici diversi (Adriano: equivalenti o criticità?). */
export function notaDueCodici(candidati: CandidatoPn[], scelto: CandidatoPn, esito: { trovato: boolean; disponibile: boolean }): string | null {
  const altri = candidati.filter(c => c !== scelto);
  if (!altri.length) return null;
  const perche = esito.disponibile ? 'disponibile' : esito.trovato ? 'quello con più pezzi' : 'nessuno si trova dai distributori';
  const note = altri.map(o => {
    const s = stessoComponente(scelto.pn, o.pn);
    if (s?.tipo === 'contenuto') return `${o.pn} (${NOMI_COLONNA[o.da]}) e ${scelto.pn} (${NOMI_COLONNA[scelto.da]}) sono lo stesso codice`;
    if (s?.tipo === 'jedec') return `${o.pn} e ${scelto.pn}: stesso componente ${s.base} di produttori diversi, codici alternativi equivalenti`;
    return null;
  });
  if (note.every(Boolean)) return `${note.join('; ')}: si compra ${scelto.pn} (${perche})`;
  const diversi = altri.filter((_, i) => !note[i]).map(o => `${o.pn} (colonna ${NOMI_COLONNA[o.da]})`).join(', ');
  return `${NOTA_DA_VALIDARE}: nella BOM ci sono codici diversi, ${scelto.pn} (colonna ${NOMI_COLONNA[scelto.da]}) e ${diversi}: controlla quale montare (si compra ${scelto.pn}, ${perche})`;
}

const KIND: Record<string, string> = { R: 'R', C: 'C', H: 'H', HZ: 'HZ', V: 'V' };
const numero = (x: unknown) => { const n = Number(String(x ?? '').replace('%', '').replace(',', '.').replace('±', '').trim()); return Number.isFinite(n) && String(x ?? '').trim() ? n : null; };
const soloCase = (x: unknown) => String(x ?? '').toUpperCase().replace(/[\s-]/g, '').replace(/^[RC](?=\d{4}$)/, '');

/**
 * Dati scritti nella BOM diversi da quelli letti dal codice del produttore (Adriano: "se c'è una criticità da segnalare").
 * Case e valore diversi, tensione del codice più bassa, tolleranza del codice più larga. Una tensione più alta o una
 * tolleranza più stretta vanno bene (es. BOM 10V, codice 50V).
 */
export function differenzeBomCodice(famiglia: string | null, bom: Attributi, codice: Attributi): string[] {
  const out: string[] = [];
  if (bom.case && codice.case && soloCase(bom.case) !== soloCase(codice.case)) out.push(`case ${bom.case} nella BOM, ${codice.case} nel codice`);
  const kind = famiglia ? FAMIGLIE[famiglia]?.kind : null;
  if (kind && KIND[kind] && bom.valore && codice.valore) {
    const vb = parseValue(bom.valore, kind), vc = parseValue(codice.valore, kind);
    if (vb != null && vc != null && Math.abs(vb - vc) > Math.max(vb, vc) * 1e-3) out.push(`valore ${bom.valore} nella BOM, ${codice.valore} nel codice`);
  }
  const tb = parseValue(bom.tensione, 'V'), tc = parseValue(codice.tensione, 'V');
  if (tb != null && tc != null && tc < tb) out.push(`tensione ${bom.tensione} nella BOM, solo ${codice.tensione} nel codice`);
  const ob = numero(bom.tolleranza), oc = numero(codice.tolleranza);
  if (ob != null && oc != null && oc > ob) out.push(`tolleranza ${ob}% nella BOM, ${oc}% nel codice`);
  return out;
}
