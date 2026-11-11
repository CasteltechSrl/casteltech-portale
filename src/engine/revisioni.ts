/**
 * Revisioni dei documenti inviati (Adriano 11/11/2026): preventivo, conferma d'ordine, DDT, ordine a fornitore.
 * Il primo invio al cliente è la revisione 0 (senza scritta); ogni invio dopo il primo è una revisione nuova (1, 2, …):
 * il PDF porta "Rev. N" accanto al numero, il nome del file finisce con "_rev1", l'oggetto dell'email con "- Rev. 1" e il testo
 * comincia con la frase "annulla e sostituisce l'invio precedente". Ogni PDF partito resta salvato (tabella `revisioni_invio`):
 * nel portale si lavora sempre e solo sull'ultima versione del documento.
 * Fatture, note di credito e autofatture sono escluse: dopo lo SdI non si rimandano corrette, si fa la nota di credito.
 * Solo regole, niente database (letture in server/revisioni-servizio.ts).
 */

/** Tipi di documento che hanno le revisioni. */
export const TIPI_CON_REVISIONI = ['preventivo', 'conferma_ordine', 'ddt', 'ordine_fornitore'];

/** Frase che deve esserci nell'email di ogni revisione dopo la prima. */
export const FRASE_SOSTITUISCE = 'annulla e sostituisce';

/**
 * Numero di revisione del prossimo invio. `ultima` = revisione più alta già salvata (null = nessuna);
 * `giaInviato` = il documento risulta già inviato (anche prima delle revisioni o segnato a mano): allora il prossimo è almeno la 1.
 */
export function prossimaRevisione(ultima: number | null | undefined, giaInviato: boolean): number {
  if (ultima != null && Number.isFinite(Number(ultima))) return Number(ultima) + 1;
  return giaInviato ? 1 : 0;
}

/** "Rev. 2" (vuoto per la revisione 0). */
export const etichettaRevisione = (n: number | null | undefined): string => (n && n > 0 ? `Rev. ${n}` : '');

/** Nome del file con la revisione: "Preventivo_P2026-1_X.pdf" → "Preventivo_P2026-1_X_rev2.pdf" (revisione 0: invariato). */
export function nomeFileRevisione(nome: string, n: number): string {
  if (!n || n <= 0) return nome;
  const m = /^(.*?)(\.[a-z0-9]+)$/i.exec(nome);
  return m ? `${m[1]}_rev${n}${m[2]}` : `${nome}_rev${n}`;
}

const dataIt = (d: Date | string | null | undefined): string => {
  if (!d) return '';
  const x = d instanceof Date ? d : new Date(String(d));
  return Number.isNaN(x.getTime()) ? '' : x.toLocaleDateString('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric' });
};

/** Prima riga dell'email di una revisione. */
export function fraseRevisione(n: number, precedente?: Date | string | null): string {
  const il = dataIt(precedente);
  return `ATTENZIONE: questo invio (revisione ${n}) annulla e sostituisce l'invio precedente${il ? ` del ${il}` : ''}. ` +
    'Fa fede solo il documento allegato a questa email.';
}

/**
 * Oggetto e testo dell'email con la revisione: per la revisione 0 non cambia nulla; dopo, "- Rev. N" in fondo all'oggetto e la frase
 * "annulla e sostituisce" in cima al testo. Si può chiamare più volte (proposta e invio): non ripete nulla.
 */
export function emailConRevisione(o: { oggetto: string; testo: string }, n: number, precedente?: Date | string | null): { oggetto: string; testo: string } {
  if (!n || n <= 0) return { oggetto: o.oggetto, testo: o.testo };
  const et = etichettaRevisione(n);
  const oggetto = new RegExp(`\\brev\\.?\\s*${n}\\b`, 'i').test(o.oggetto) ? o.oggetto : `${o.oggetto.trim()} - ${et}`;
  const testo = o.testo.toLowerCase().includes(FRASE_SOSTITUISCE) ? o.testo : `${fraseRevisione(n, precedente)}\n\n${o.testo}`;
  return { oggetto, testo };
}
