/**
 * Alternative scritte dal cliente nella BOM (Adriano 29/10/2026, BOM Elemaster "BOM_Report"): sotto ogni componente ci sono
 * le righe dei produttori alternativi, segnate con la colonna Pref/Alt ("Alt") o con un livello LLC più basso (2 sotto 1).
 * Non sono altri componenti da montare né da comprare: si tolgono, la riga principale prende il codice della prima alternativa
 * se non ne ha uno suo, e tutte finiscono nella colonna "Alternative del cliente" (da usare se il codice non si trova).
 * Nessun accesso al database.
 */
import { elencoDesignatori, nomiColonne, rigaIntestazione, rilevaColonne } from './bom.js';

export const COLONNA_ALTERNATIVE = 'Alternative del cliente';
const RE_COL_ALT = /^(PREF\.? ?\/? ?ALT\.?|ALT\.?|ALTERNATIV[AE]|PREFERRED ?\/ ?ALTERNATE)$/;
const RE_COL_LIVELLO = /^(LLC|LIVELLO|LEVEL|LVL|BOM LEVEL)$/;
const norm = (c: string) => c.toUpperCase().replace(/\s+/g, ' ').trim();

/** Righe della BOM senza le alternative (le righe sopra l'intestazione restano com'erano). Senza alternative: le righe di prima. */
export function unisciAlternative(righe: string[][]): string[][] {
  const h = rigaIntestazione(righe);
  const intestazione = righe[h] ?? [];
  const colonne = nomiColonne(intestazione);
  const iAlt = colonne.findIndex(c => RE_COL_ALT.test(norm(c)));
  const iLivello = colonne.findIndex(c => RE_COL_LIVELLO.test(norm(c)));
  if (iAlt < 0 && iLivello < 0) return righe;
  const dati = righe.slice(h + 1);
  const mappa = rilevaColonne(colonne, dati.filter(r => r.some(c => String(c ?? '').trim())));
  const i = (nome?: string) => nome ? colonne.indexOf(nome) : -1;
  const iPn = i(mappa.pn), iProd = i(mappa.produttore), iRef = i(mappa.designatori);
  const cella = (r: string[], k: number) => k >= 0 ? String(r[k] ?? '').trim() : '';
  const livelli = iLivello >= 0 ? dati.map(r => Number(cella(r, iLivello))).filter(n => Number.isInteger(n) && n > 0) : [];
  const base = livelli.length ? Math.min(...livelli) : null;
  const refs = (r: string[]) => elencoDesignatori(cella(r, iRef)).join(',');

  const out: string[][] = [];
  const alternative = new Map<string[], string[]>();
  let principale: string[] | null = null, tolte = 0;
  for (const r of dati) {
    const livello = Number(cella(r, iLivello));
    const eAlt = /^ALT/i.test(cella(r, iAlt)) || (base != null && Number.isInteger(livello) && livello > base);
    if (eAlt && principale && (!cella(r, iRef) || refs(r) === refs(principale))) {
      tolte++;
      const pn = cella(r, iPn);
      if (iPn >= 0 && !cella(principale, iPn) && pn) { principale[iPn] = pn; if (iProd >= 0) principale[iProd] = cella(r, iProd); }
      else if (pn) alternative.get(principale)!.push([cella(r, iProd), pn].filter(Boolean).join(' '));
      continue;
    }
    const copia = [...r];
    out.push(copia);
    if (r.some(c => String(c ?? '').trim())) { principale = copia; alternative.set(copia, []); }
  }
  if (!tolte) return righe;
  const n = intestazione.length;
  const conColonna = (r: string[], v: string) => [...r, ...Array(Math.max(0, n - r.length)).fill(''), v];
  return [...righe.slice(0, h), conColonna(intestazione, COLONNA_ALTERNATIVE), ...out.map(r => conColonna(r, (alternative.get(r) ?? []).join(' | ')))];
}
