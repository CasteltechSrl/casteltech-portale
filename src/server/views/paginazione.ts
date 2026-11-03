/** Barra delle pagine sotto un elenco lungo (regole in engine/paginazione.ts). Gli altri parametri dell'indirizzo restano. */
import { html, type Raw } from './html.js';
import { calcolaPagina, righePagina, PER_PAGINA, type Pagina } from '../../engine/paginazione.js';

export function paginata<T>(righe: T[], query: Record<string, unknown>, perPagina = PER_PAGINA): { righe: T[]; info: Pagina; barra: Raw } {
  // "Mostra tutte" (Adriano 3/11/2026): ?pagina=tutte = un'unica pagina, così cliccando le colonne si ordina tutto l'elenco
  if (query.pagina === 'tutte' && righe.length > perPagina) {
    const info = calcolaPagina(righe.length, 1, righe.length);
    return { righe, info, barra: barraTutte(info, query, perPagina) };
  }
  const info = calcolaPagina(righe.length, query.pagina, perPagina);
  return { righe: righePagina(righe, info, perPagina), info, barra: barraPagine(info, query, true) };
}

function indirizzo(query: Record<string, unknown>, pagina: number | string): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (k !== 'pagina' && k !== 'msg' && v != null && v !== '') qs.set(k, String(v));
  qs.set('pagina', String(pagina));
  return `?${qs}`;
}

function barraTutte(p: Pagina, query: Record<string, unknown>, perPagina: number): Raw {
  return html`<nav class="pagine" aria-label="Pagine dell'elenco">
    <a href="${indirizzo(query, 1)}">A pagine da ${perPagina}</a>
    <span class="nota">tutte le ${p.totale} righe</span>
  </nav>`;
}

/** `conTutte` = c'è il collegamento "Mostra tutte" (solo per gli elenchi già letti per intero, non per l'archivio Componenti). */
export function barraPagine(p: Pagina, query: Record<string, unknown>, conTutte = false): Raw {
  if (p.pagine <= 1) return html``;
  const link = (n: number) => indirizzo(query, n);
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
    ${conTutte ? html`<a href="${indirizzo(query, 'tutte')}" title="Tutto l'elenco in una pagina: cliccando le colonne si ordinano tutte le righe, non solo questa pagina">Mostra tutte</a>` : ''}
  </nav>`;
}
