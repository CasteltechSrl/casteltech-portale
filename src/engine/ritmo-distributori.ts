/**
 * Ritmo massimo delle richieste per distributore (limiti dei piani gratuiti). Oltre il limite rispondono 429 o 403 e il portale
 * smetteva di chiedere i prezzi a quel distributore per tutta la BOM. Ogni chiamata (codici, varianti, sostituti, accesso) passa da
 * turno() in server/fornitori.ts: parte almeno N millisecondi dopo la precedente dello stesso distributore.
 *   DigiKey 120 al minuto → 0,55 s · Mouser 30 al minuto → 2,1 s · Farnell 2 al secondo → 0,6 s · Arrow (limite non scritto) 0,3 s · TME 0,15 s
 */
export const RITMO_MS: Record<string, number> = { digikey: 550, mouser: 2100, farnell: 600, arrow: 300, tme: 150 };
const prossima = new Map<string, number>();
export function attesaTurno(servizio: string, ora = Date.now()): number {
  const quando = Math.max(ora, prossima.get(servizio) ?? 0);
  prossima.set(servizio, quando + (RITMO_MS[servizio] ?? 0));
  return quando - ora;
}
