/**
 * Fila degli anni sopra gli elenchi (Adriano 11/11/2026): "Tutti · 2026 (45) · 2025 (120)…"; clic = solo quell'anno.
 */
import { html, type Raw } from './html.js';
import { indirizzoAnno } from '../../engine/anni-elenco.js';

export function barraAnni(anni: { anno: number; n: number }[], scelto: number | null, percorso: string, query: Record<string, unknown>): Raw {
  if (anni.length < 2 && scelto == null) return html``;
  const tot = anni.reduce((s, a) => s + a.n, 0);
  return html`<nav class="pagine anni non-stampare" aria-label="Anno">
    <span class="nota">Anno:</span>
    ${scelto == null ? html`<b aria-current="page">Tutti (${tot})</b>` : html`<a href="${indirizzoAnno(percorso, query, null)}">Tutti (${tot})</a>`}
    ${anni.map(a => a.anno === scelto ? html`<b aria-current="page">${a.anno} (${a.n})</b>` : html`<a href="${indirizzoAnno(percorso, query, a.anno)}">${a.anno} (${a.n})</a>`)}
  </nav>`;
}
