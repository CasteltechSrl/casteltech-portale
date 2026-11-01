/**
 * Mini-sistema di pagine HTML: html`...` protegge automaticamente i valori inseriti
 * (niente codice malevolo da nomi clienti, note, ecc.). Per inserire HTML già pronto usare raw().
 */
export class Raw { constructor(public s: string) {} toString() { return this.s; } }
export const raw = (s: string) => new Raw(s);

export const esc = (v: unknown): string =>
  String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function val(v: unknown): string {
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(val).join('');
  if (v === false || v == null) return '';
  return esc(v);
}

export function html(str: TemplateStringsArray, ...vals: unknown[]): Raw {
  let out = str[0];
  vals.forEach((v, i) => { out += val(v) + str[i + 1]; });
  return new Raw(out);
}

const nf2 = new Intl.NumberFormat('it-IT', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const euro = (n: number | null | undefined) => (n == null ? '' : nf2.format(n) + ' €');
export const num = (n: number | null | undefined, dec = 2) =>
  n == null ? '' : new Intl.NumberFormat('it-IT', { useGrouping: 'always', maximumFractionDigits: dec }).format(n);
/** Numero dentro una casella di modulo: virgola decimale e niente separatore delle migliaia (che il modulo leggerebbe come decimale). */
export const numCampo = (n: number | string | null | undefined, dec = 4) =>
  n == null || n === '' ? '' : new Intl.NumberFormat('it-IT', { useGrouping: false, maximumFractionDigits: dec }).format(Number(n));
export const data = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' }) : '';
/** secondi → "h:mm" */
export const ore = (sec: number) => {
  const m = Math.round(sec / 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
};
/** ore decimali → "h:mm" (0,5 → "0:30") */
export const durata = (h: number) => {
  const m = Math.round((Number(h) || 0) * 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
};
