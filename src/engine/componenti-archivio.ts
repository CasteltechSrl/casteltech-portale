/**
 * Anagrafiche → Componenti (Adriano 2/11/2026): elenco di tutto l'archivio a pagine, filtro per famiglia,
 * e "+ Aggiungi componente" quando la ricerca non lo trova (si codifica come in Quotazioni → Codifica un P/N).
 */

/** Cosa si è scritto nella ricerca: una parola sola = P/N del produttore, più parole = descrizione (es. "resistenza 2,2k 0603"). */
export function datiNuovoComponente(testo: string): { pn: string; descrizione: string } {
  const t = String(testo ?? '').trim().replace(/\s+/g, ' ');
  if (!t) return { pn: '', descrizione: '' };
  return t.includes(' ') ? { pn: '', descrizione: t } : { pn: t.toUpperCase(), descrizione: '' };
}

/** Famiglia del filtro: solo una sigla conosciuta (es. RS, CC), altrimenti tutte. "-" = componenti senza famiglia. */
export function famigliaFiltro(valore: unknown, conosciute: string[]): string {
  const f = String(valore ?? '').trim().toUpperCase();
  if (f === '-') return '-';
  return conosciute.includes(f) ? f : '';
}
