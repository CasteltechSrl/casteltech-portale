/**
 * Preventivo per email dalla stampa (Adriano 4/11/2026): parte da preventivi@ (alias di info@, `mittentePer('preventivo')`)
 * con il PDF uguale alla stampa. Qui solo le regole del destinatario, dell'oggetto e del testo proposti.
 */

const dataIt = (d: string | Date | null | undefined) => {
  if (!d) return '';
  const x = d instanceof Date ? d : new Date(String(d).length === 10 ? `${d}T12:00:00` : String(d));
  return Number.isNaN(x.getTime()) ? '' : x.toLocaleDateString('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric' });
};

/**
 * Indirizzo proposto, nell'ordine: chi ha mandato la richiesta (email letta dal pulsante in Gmail), l'email per i preventivi
 * dell'anagrafica del cliente (Adriano 4/11/2026, anche più indirizzi), l'ultimo preventivo
 * mandato allo stesso cliente, l'email del CRM (referente o azienda), l'email amministrativa del cliente. Vuoto = da scrivere.
 */
export function destinatarioPreventivo(c: { richiesta?: string | null; anagrafica?: string | null; ultimoPreventivo?: string | null; crm?: string | null; amministrazione?: string | null }): string {
  for (const x of [c.richiesta, c.anagrafica, c.ultimoPreventivo, c.crm, c.amministrazione]) if (x && /@/.test(x)) return x.trim();
  return '';
}

/** Oggetto e testo proposti. Con l'email della richiesta l'oggetto è "Re: …" (stessa conversazione per il cliente). */
export function emailPreventivo(o: { numero: string; data: string | Date; codice?: string | null; descrizione?: string | null; revisione?: string | null;
  nSchede: number; azienda: string; oggettoRichiesta?: string | null }) {
  const cosa = [o.codice, o.descrizione].map(x => String(x ?? '').trim()).filter(Boolean).join(' - ');
  const rev = o.revisione && String(o.revisione).trim() && String(o.revisione).trim() !== '0' ? ` rev. ${String(o.revisione).trim()}` : '';
  const richiesta = String(o.oggettoRichiesta ?? '').trim();
  const oggetto = richiesta ? (/^re:/i.test(richiesta) ? richiesta : `Re: ${richiesta}`)
    : `Preventivo n. ${o.numero}${cosa ? ` - ${cosa}` : ''} - ${o.azienda}`;
  const qta = o.nSchede > 0 ? ` (${o.nSchede} ${o.nSchede === 1 ? 'scheda' : 'schede'})` : '';
  return {
    oggetto,
    testo: `Buongiorno,\n\nin allegato il nostro preventivo n. ${o.numero} del ${dataIt(o.data)}${cosa ? ` per ${cosa}${rev}` : ''}${qta}.\n`
      + `Restiamo a disposizione per qualsiasi chiarimento.\n\nCordiali saluti\n\n${o.azienda}`,
  };
}
