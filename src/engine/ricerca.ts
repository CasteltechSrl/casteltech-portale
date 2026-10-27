/**
 * Ricerca veloce negli elenchi delle Anagrafiche (Adriano, 27/10/2026): si filtra mentre si scrive.
 * Stessa regola in public/ricerca.js (il browser non può importare questo file): se cambi qui, cambia anche lì.
 *
 * - maiuscole/minuscole e accenti non contano ("citta" trova "CITTÀ");
 * - più parole: devono esserci tutte, in qualsiasi ordine ("rossi milano");
 * - trattini, punti e spazi nei codici non contano ("rs0603" trova "RS-0603-2K2").
 */
export const normalizzaRicerca = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const compatto = (s: string) => s.replace(/[^a-z0-9]/g, '');

export function corrispondeRicerca(testoRiga: string, cerca: string): boolean {
  const riga = normalizzaRicerca(testoRiga), rigaCompatta = compatto(riga);
  return normalizzaRicerca(cerca).split(/\s+/).filter(Boolean)
    .every(p => riga.includes(p) || (compatto(p) !== '' && rigaCompatta.includes(compatto(p))));
}
