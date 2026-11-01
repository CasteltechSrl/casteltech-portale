/**
 * Elenchi lunghi a pagine (proposta della revisione, Adriano 1/11/2026): 100 righe per pagina, `?pagina=N` nell'indirizzo,
 * gli altri filtri restano. Qui il conto senza HTML; la barra con i collegamenti è in server/views/paginazione.ts.
 */
export const PER_PAGINA = 100;

export interface Pagina { pagina: number; pagine: number; totale: number; da: number; a: number; numeri: number[] }

/** Pagina valida (1…pagine) dal valore scritto nell'indirizzo; `numeri` = pagine da mostrare nella barra (prima, intorno, ultima). */
export function calcolaPagina(totale: number, paginaQs: unknown, perPagina = PER_PAGINA): Pagina {
  const pagine = Math.max(1, Math.ceil(totale / perPagina));
  const chiesta = Number(paginaQs) || 1;
  const pagina = Math.min(pagine, Math.max(1, Math.floor(chiesta)));
  const da = totale === 0 ? 0 : (pagina - 1) * perPagina + 1;
  const a = Math.min(totale, pagina * perPagina);
  const numeri = [...new Set([1, pagina - 2, pagina - 1, pagina, pagina + 1, pagina + 2, pagine].filter(n => n >= 1 && n <= pagine))].sort((x, y) => x - y);
  return { pagina, pagine, totale, da, a, numeri };
}

/** Le righe della pagina. */
export function righePagina<T>(righe: T[], p: Pagina, perPagina = PER_PAGINA): T[] {
  return righe.slice((p.pagina - 1) * perPagina, p.pagina * perPagina);
}
