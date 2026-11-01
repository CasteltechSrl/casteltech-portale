/**
 * Errori accanto al campo (proposta della revisione, Adriano 1/11/2026 "applica i suggerimenti").
 *
 * Quando un modulo classico (POST + redirect con ?msg=) viene rifiutato, il messaggio finiva solo in cima alla pagina
 * e i valori scritti si perdevano. Ora il redirect porta anche il nome del campo sbagliato (`campo=`) e, se nella pagina
 * ci sono più moduli con gli stessi campi (elenchi con una riga per utente/prodotto), l'id del modulo (`modulo=`).
 * `public/errori-campo.js` salva i valori del modulo al momento dell'invio e, quando torna la pagina con `campo=`,
 * li rimette al loro posto, scrive il messaggio sotto il campo e ci porta il cursore.
 */

/** Aggiunge `campo` (e `modulo`) a un indirizzo che ha già `?msg=`. */
export function conCampo(indirizzo: string, campo: string, modulo?: string): string {
  const sep = indirizzo.includes('?') ? '&' : '?';
  let r = `${indirizzo}${sep}campo=${encodeURIComponent(campo)}`;
  if (modulo) r += `&modulo=${encodeURIComponent(modulo)}`;
  return r;
}

/** Legge da `req.query` cosa evidenziare (per i test e per chi volesse farlo lato server). */
export function campoDaEvidenziare(query: Record<string, unknown>): { campo: string; modulo?: string } | null {
  const campo = typeof query.campo === 'string' ? query.campo.trim() : '';
  if (!campo || !/^[\w.-]{1,60}$/.test(campo)) return null;
  const modulo = typeof query.modulo === 'string' && /^[\w.-]{1,80}$/.test(query.modulo) ? query.modulo : undefined;
  return { campo, modulo };
}
