// Larghezza delle caselle di codice e descrizione negli elenchi delle anagrafiche (Adriano 9/11/2026, Anagrafiche → Prodotti:
// "si fa fatica a vedere codice e descrizione"). La casella si allarga sul testo più lungo dell'elenco, in caratteri (attributo
// `size` dell'input): il codice si vede sempre tutto, la descrizione fino a un massimo (oltre si taglia, il testo intero resta
// nella casella e nel suggerimento al passaggio del mouse).

/** Caratteri da dare alla casella: il testo più lungo, con un margine per le lettere maiuscole (più larghe della media), tra `minimo` e `massimo`. */
export function caratteriCasella(testi: Iterable<string | null | undefined>, minimo: number, massimo = Infinity): number {
  let lungo = 0;
  for (const t of testi) lungo = Math.max(lungo, (t ?? '').trim().length);
  const conMargine = Math.ceil(lungo * 1.12) + 1;
  return Math.max(minimo, Math.min(massimo, conMargine));
}

/** Codice dei prodotti: sempre intero (nessun massimo pratico). */
export const MINIMO_CODICE = 10;
export const MASSIMO_CODICE = 60;
/** Descrizione: si allarga fino a 60 caratteri, oltre si taglia. */
export const MINIMO_DESCRIZIONE = 20;
export const MASSIMO_DESCRIZIONE = 60;
