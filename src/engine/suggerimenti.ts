/**
 * Suggerimenti del team: idee da sviluppare nel portale più avanti (Adriano, 27/10/2026).
 * Non tutte vanno fatte subito: si annotano con chi le ha proposte, l'area, la priorità e lo stato.
 * Qui solo controlli e ordine dell'elenco, senza database: le pagine li usano e i test li controllano.
 */
import { iniziali } from './crm.js';

export const AREE_SUGGERIMENTI = {
  preventivi: 'Preventivi', ordini: 'Ordini', commesse: 'Commesse e produzione', reparto: 'Reparto (telefono)',
  componenti: 'Quotazioni e acquisti', crm: 'CRM', amministrazione: 'Amministrazione', avvisi: 'Avvisi e calendario', generale: 'Generale',
} as const;
export type AreaSuggerimento = keyof typeof AREE_SUGGERIMENTI;

export const STATI_SUGGERIMENTI = {
  da_valutare: 'Da valutare', in_programma: 'In programma', in_sviluppo: 'In sviluppo', fatto: 'Fatto', scartato: 'Scartato',
} as const;
export type StatoSuggerimento = keyof typeof STATI_SUGGERIMENTI;

export const PRIORITA_SUGGERIMENTI = { alta: 'Alta', media: 'Media', bassa: 'Bassa' } as const;
export type PrioritaSuggerimento = keyof typeof PRIORITA_SUGGERIMENTI;

export interface Suggerimento {
  titolo: string; descrizione: string | null; area: AreaSuggerimento; proposto_da: string | null;
  proposto_il: string; priorita: PrioritaSuggerimento; stato: StatoSuggerimento; note: string | null;
}

const testo = (v: unknown) => String(v ?? '').replace(/\r\n/g, '\n').trim();
const scelta = <T extends string>(v: unknown, ammessi: Record<T, string>, base: T): T =>
  (Object.keys(ammessi) as T[]).includes(testo(v) as T) ? testo(v) as T : base;

/**
 * Controlla e ripulisce il modulo. Serve almeno il titolo; la data, se manca o è sbagliata, è oggi.
 * Chi propone si scrive con le iniziali maiuscole ("federico" → "Federico"); i testi restano come scritti.
 */
export function preparaSuggerimento(campi: Record<string, unknown>, oggi: string): { suggerimento: Suggerimento; errore: string | null } {
  const data = testo(campi.proposto_il);
  const s: Suggerimento = {
    titolo: testo(campi.titolo).replace(/\s+/g, ' '),
    descrizione: testo(campi.descrizione) || null,
    area: scelta(campi.area, AREE_SUGGERIMENTI, 'generale'),
    proposto_da: iniziali(testo(campi.proposto_da).replace(/\s+/g, ' ')) || null,
    proposto_il: /^\d{4}-\d{2}-\d{2}$/.test(data) && !isNaN(Date.parse(data)) ? data : oggi,
    priorita: scelta(campi.priorita, PRIORITA_SUGGERIMENTI, 'media'),
    stato: scelta(campi.stato, STATI_SUGGERIMENTI, 'da_valutare'),
    note: testo(campi.note) || null,
  };
  return { suggerimento: s, errore: s.titolo ? null : 'Scrivi almeno il titolo del suggerimento.' };
}

/** I suggerimenti chiusi (fatti o scartati) vanno in fondo all'elenco. */
export const chiuso = (stato: string) => stato === 'fatto' || stato === 'scartato';

const PESO_STATO: Record<string, number> = { in_sviluppo: 0, in_programma: 1, da_valutare: 2, fatto: 3, scartato: 4 };
const PESO_PRIORITA: Record<string, number> = { alta: 0, media: 1, bassa: 2 };

/** Ordine dell'elenco: prima quelli in sviluppo, poi in programma, poi da valutare; dentro, per priorità e dal più vecchio. */
export function ordinaSuggerimenti<T extends { stato: string; priorita: string; proposto_il: string; id: number }>(righe: T[]): T[] {
  return [...righe].sort((a, b) =>
    (PESO_STATO[a.stato] ?? 9) - (PESO_STATO[b.stato] ?? 9)
    || (PESO_PRIORITA[a.priorita] ?? 9) - (PESO_PRIORITA[b.priorita] ?? 9)
    || a.proposto_il.localeCompare(b.proposto_il) || a.id - b.id);
}
