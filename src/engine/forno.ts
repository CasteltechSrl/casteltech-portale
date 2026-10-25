/** Programma forno della scheda di produzione (nessun accesso al database). */
/**
 * Programma forno da stampare (Adriano, 25/10/2026): se non è scritto nella commessa,
 * solo TOP → TOP: "TOP STD"; TOP e BOT → TOP: "TOP+BOT STD", BOT: "TOP STD".
 */
export function programmaForno(st: { programmi: Record<string, { top: string; bot: string }>; forno?: string }, doppia: boolean): { top: string; bot: string } {
  const scritto = st.programmi.progForno ?? { top: '', bot: '' };
  return {
    top: scritto.top || st.forno || (doppia ? 'TOP+BOT STD' : 'TOP STD'),
    bot: doppia ? (scritto.bot || 'TOP STD') : '',
  };
}
