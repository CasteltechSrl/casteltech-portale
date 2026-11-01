/** Barra delle pagine sotto un elenco lungo (regole in engine/paginazione.ts). Gli altri parametri dell'indirizzo restano. */
import { html, type Raw } from './html.js';
import { calcolaPagina, righePagina, PER_PAGINA, type Pagina } from '../../engine/paginazione.js';

export function paginata<T>(righe: T[], query: Record<string, unknown>, perPagina = PER_PAGINA): { righe: T[]; info: Pagina; barra: Raw } {
  const info = calcolaPagina(righe.length, query.pagina, perPagina);
  return { righe: righePagina(righe, info, perPagina), info, barra: barraPagine(info, query) };
}

export function barraPagine(p: Pagina, query: Record<string, unknown>): Raw {
  if (p.pagine <= 1) return html``;
  const link = (n: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (k !== 'pagina' && k !== 'msg' && v != null && v !== '') qs.set(k, String(v));
    qs.set('pagina', String(n));
    return `?${qs}`;
  };
  const voci: Raw[] = [];
  let prec = 0;
  for (const n of p.numeri) {
    if (prec && n - prec > 1) voci.push(html`<span class="puntini">…</span>`);
    voci.push(n === p.pagina ? html`<b aria-current="page">${n}</b>` : html`<a href="${link(n)}">${n}</a>`);
    prec = n;
  }
  return html`<nav class="pagine" aria-label="Pagine dell'elenco">
    ${p.pagina > 1 ? html`<a href="${link(p.pagina - 1)}" rel="prev">‹ Precedente</a>` : ''}
    ${voci}
    ${p.pagina < p.pagine ? html`<a href="${link(p.pagina + 1)}" rel="next">Successiva ›</a>` : ''}
    <span class="nota">righe ${p.da}–${p.a} di ${p.totale}</span>
  </nav>`;
}
