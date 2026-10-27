/**
 * Tempi scritti a mano dagli operatori e dall'ufficio (Adriano, 27/10/2026).
 * Il tempo si pensa come sull'orologio, in base 60, non in decimali:
 *  - "1.30", "1,30" e "1:30" valgono tutti 1h 30' (il tastierino del telefono non ha i due punti);
 *  - un numero intero senza separatore vale minuti ("90" = 1h 30'), o secondi se la base della casella è in secondi;
 *  - dopo il separatore servono 2 cifre da 00 a 59: "1.5" o "1.75" non si accettano (1h 05' o 1h 30'?);
 *  - con la base in secondi "1.30" = 1' 30''; "1.02.30" = 1h 02' 30'' in tutte e due le basi;
 *  - si possono scrivere anche le unità: "1h30", "1h 30'", "45'", "45 min", "30''".
 * Uscendo dalla casella il tempo si riscrive leggibile (`scriviTempo`) così l'operatore vede se è quello che voleva.
 * La stessa regola è copiata in public/tempi.js (il test controlla che diano gli stessi risultati).
 */

export type BaseTempo = 'minuti' | 'secondi';

/** Tempo scritto → secondi; null se vuoto o non si capisce. */
export function secondiDaTempo(x: unknown, base: BaseTempo = 'minuti'): number | null {
  const t = String(x ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!t) return null;
  // solo numero: minuti (o secondi)
  if (/^\d+$/.test(t)) return Number(t) * (base === 'secondi' ? 1 : 60);
  // con i separatori . , :
  let m = /^(\d*)[.,:](\d{1,2})(?:[.,:](\d{1,2}))?$/.exec(t);
  if (m) {
    if (m[2].length < 2 || (m[3] != null && m[3].length < 2)) return null;
    const a = Number(m[1] || 0), b = Number(m[2]), c = m[3] != null ? Number(m[3]) : null;
    if (b > 59 || (c != null && c > 59)) return null;
    if (c != null) return a * 3600 + b * 60 + c;
    return base === 'secondi' ? a * 60 + b : a * 3600 + b * 60;
  }
  // "1h30" (minuti senza segno dopo le ore)
  m = /^(\d+) ?h ?(\d{1,2})$/.exec(t);
  if (m) return Number(m[2]) > 59 ? null : Number(m[1]) * 3600 + Number(m[2]) * 60;
  // con le unità: h, ' / m / min, '' / " / s / sec
  m = /^(?:(\d+) ?(?:h|ore|ora))? ?(?:(\d+) ?(?:min|m|'(?!')))? ?(?:(\d+) ?(?:''|"|sec|s))?$/.exec(t);
  if (m && (m[1] || m[2] || m[3])) return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return null;
}

/** Secondi → "1h 30'" (base minuti) o "1' 30''" (base secondi). */
export function scriviTempo(sec: number, base: BaseTempo = 'minuti'): string {
  const due = (n: number) => String(n).padStart(2, '0');
  if (base === 'secondi') {
    const s = Math.max(0, Math.round(sec)), h = Math.floor(s / 3600), min = Math.floor((s % 3600) / 60), ss = s % 60;
    if (h) return `${h}h ${due(min)}' ${due(ss)}''`;
    return min ? `${min}' ${due(ss)}''` : `${ss}''`;
  }
  const t = Math.max(0, Math.round(sec / 60)), h = Math.floor(t / 60), min = t % 60;
  return h ? `${h}h ${due(min)}'` : `${min}'`;
}

/** Scritta per la casella: come si scrive il tempo. */
export const AIUTO_TEMPO: Record<BaseTempo, string> = {
  minuti: "ore.minuti: 1.30 = 1h 30' · solo numero = minuti: 90 = 1h 30'",
  secondi: "minuti.secondi: 1.30 = 1' 30'' · solo numero = secondi: 90 = 1' 30''",
};
