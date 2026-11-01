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
  da_valutare: 'Da valutare', da_chiarire: 'Da chiarire', in_programma: 'In programma', in_sviluppo: 'In sviluppo', fatto: 'Fatto', scartato: 'Scartato',
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

const PESO_STATO: Record<string, number> = { da_chiarire: 0, in_sviluppo: 1, in_programma: 2, da_valutare: 3, fatto: 4, scartato: 5 };
const PESO_PRIORITA: Record<string, number> = { alta: 0, media: 1, bassa: 2 };

/** Ordine dell'elenco: prima quelli da chiarire (aspettano una risposta), poi in sviluppo, poi in programma, poi da valutare; dentro, per priorità e dal più vecchio. */
export function ordinaSuggerimenti<T extends { stato: string; priorita: string; proposto_il: string; id: number }>(righe: T[]): T[] {
  return [...righe].sort((a, b) =>
    (PESO_STATO[a.stato] ?? 9) - (PESO_STATO[b.stato] ?? 9)
    || (PESO_PRIORITA[a.priorita] ?? 9) - (PESO_PRIORITA[b.priorita] ?? 9)
    || a.proposto_il.localeCompare(b.proposto_il) || a.id - b.id);
}

/**
 * Aggiornamento mandato da Claude (controllo settimanale, Adriano 1/11/2026) con la chiave del portale:
 * può cambiare lo stato, scrivere la domanda/risposta per chi ha proposto l'idea e aggiungere una riga alle note.
 * Le note si aggiungono in fondo con la data, non si cancellano.
 */
export function aggiornamentoDaClaude(campi: Record<string, unknown>, oggiIt: string):
  { stato: StatoSuggerimento | null; risposta: string | null; nota: string | null; errore: string | null } {
  const statoScritto = testo(campi.stato);
  const stato = statoScritto ? (statoScritto in STATI_SUGGERIMENTI ? statoScritto as StatoSuggerimento : null) : null;
  if (statoScritto && !stato) return { stato: null, risposta: null, nota: null, errore: `Stato non previsto: ${statoScritto}` };
  const risposta = testo(campi.risposta).slice(0, 4000) || null;
  const riga = testo(campi.nota).slice(0, 2000);
  const nota = riga ? `${oggiIt} Claude: ${riga}` : null;
  if (!stato && !risposta && !nota) return { stato, risposta, nota, errore: 'Niente da aggiornare: servono stato, risposta o nota.' };
  return { stato, risposta, nota, errore: null };
}

/** Note esistenti + riga nuova in fondo. */
export const aggiungiNota = (note: string | null, riga: string | null) => !riga ? note : note ? `${note}\n${riga}` : riga;
