/**
 * Divisione per anno degli elenchi (Adriano 11/11/2026: "la divisione per anno è sempre una cosa importante").
 * Sopra gli elenchi (preventivi, commesse, ordini a fornitore, DDT ricevuti) una fila "Tutti · 2026 (45) · 2025 (120) …":
 * clic = solo quell'anno (`?anno=2025`), anche nell'Excel. Solo calcoli: niente database.
 */

/** Anno di una data (testo AAAA-MM-GG, Date o null). */
export function annoDi(d: unknown): number | null {
  if (d == null || d === '') return null;
  const t = d instanceof Date ? (Number.isNaN(d.getTime()) ? '' : d.toISOString()) : String(d);
  const a = Number(t.slice(0, 4));
  return a >= 1990 && a <= 2200 ? a : null;
}

/** Anno scelto nell'indirizzo (?anno=2025), null = tutti. */
export function annoScelto(query: Record<string, unknown>): number | null {
  const a = Number(query.anno);
  return Number.isInteger(a) && a >= 1990 && a <= 2200 ? a : null;
}

/** Quante righe per anno, dal più recente; le righe senza data non contano. */
export function contaPerAnno<T>(righe: T[], data: (r: T) => unknown): { anno: number; n: number }[] {
  const m = new Map<number, number>();
  for (const r of righe) {
    const a = annoDi(data(r));
    if (a != null) m.set(a, (m.get(a) ?? 0) + 1);
  }
  return [...m.entries()].sort((x, y) => y[0] - x[0]).map(([anno, n]) => ({ anno, n }));
}

/** Solo le righe dell'anno scelto (null = tutte). */
export const filtraPerAnno = <T>(righe: T[], data: (r: T) => unknown, anno: number | null): T[] =>
  anno == null ? righe : righe.filter(r => annoDi(data(r)) === anno);

/** Indirizzo con l'anno cambiato (e senza pagina né messaggio), mantenendo gli altri filtri. */
export function indirizzoAnno(percorso: string, query: Record<string, unknown>, anno: number | null): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (!['anno', 'pagina', 'msg', 'campo', 'modulo'].includes(k) && v != null && v !== '') qs.set(k, String(v));
  if (anno != null) qs.set('anno', String(anno));
  const s = qs.toString();
  return s ? `${percorso}?${s}` : percorso;
}

// ── Scheda del cliente: anno per anno ──
export interface DocumentoAnno { tipo: string; anno: number; stato: string; imponibile: number | null }
export interface AnnoCliente {
  anno: number; fatturato: number; variazione: number | null; fatture: number; noteCredito: number; ddt: number; preventivi: number; ordini: number;
}

/** Il cliente anno per anno: fatturato (NC in negativo, fuori bozze/annullati/scartati), fatture, NC, DDT, preventivi, ordini. Anni dal più recente. */
export function clienteAnnoPerAnno(documenti: DocumentoAnno[], preventivi: { creato_il: unknown }[], ordini: { data: unknown }[]): AnnoCliente[] {
  const m = new Map<number, AnnoCliente>();
  const di = (anno: number) => {
    let a = m.get(anno);
    if (!a) { a = { anno, fatturato: 0, variazione: null, fatture: 0, noteCredito: 0, ddt: 0, preventivi: 0, ordini: 0 }; m.set(anno, a); }
    return a;
  };
  for (const d of documenti) {
    if (['bozza', 'annullato', 'scartato'].includes(d.stato) || !d.anno) continue;
    const a = di(d.anno);
    if (d.tipo === 'fattura') { a.fatture++; a.fatturato += Number(d.imponibile || 0); }
    else if (d.tipo === 'nota_credito') { a.noteCredito++; a.fatturato -= Number(d.imponibile || 0); }
    else if (d.tipo === 'ddt') a.ddt++;
  }
  for (const p of preventivi) { const x = annoDi(p.creato_il); if (x != null) di(x).preventivi++; }
  for (const o of ordini) { const x = annoDi(o.data); if (x != null) di(x).ordini++; }
  const anni = [...m.values()].sort((x, y) => y.anno - x.anno);
  for (const a of anni) {
    a.fatturato = Math.round(a.fatturato * 100) / 100;
    const prima = m.get(a.anno - 1);
    a.variazione = prima && prima.fatturato > 0 ? Math.round(((a.fatturato - prima.fatturato) / prima.fatturato) * 1000) / 10 : null;
  }
  return anni;
}
