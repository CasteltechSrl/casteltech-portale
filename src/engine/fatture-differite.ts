/**
 * Promemoria delle fatture differite (proposta della revisione, Adriano 1/11/2026): i DDT di vendita emessi in un mese vanno
 * fatturati entro il 15 del mese dopo (TD24). Qui i conti senza database: quali DDT hanno il termine in corso o superato,
 * il raggruppamento per cliente per il pulsante "Fattura tutti i DDT" (una fattura per cliente), il testo dell'avviso.
 * Le letture stanno in server/documenti-servizio.ts (ddtDaFatturareTutti), la pagina in rotte/amministrazione.ts (/amministrazione/differite).
 */
import { termineDifferita } from './tipi-fattura.js';

export interface DdtAperto { id: number; numero: number; sezionale?: string | null; data: string; clienteId: number; cliente: string; righe?: number; totale?: number }

export interface GruppoDifferite {
  clienteId: number; cliente: string; ddt: DdtAperto[];
  /** entro quando va fatta la fattura (15 del mese dopo il DDT più vecchio) */
  termine: string;
  /** il termine è già passato */
  scaduto: boolean;
  /** termine nel mese in corso (DDT del mese prima): da fare adesso */
  inScadenza: boolean;
}

const meseDi = (d: string) => d.slice(0, 7);

/** Per ogni cliente i DDT ancora da fatturare, i più urgenti prima (termine già passato, poi in scadenza, poi gli altri). */
export function differitePerCliente(ddt: DdtAperto[], oggi: string): GruppoDifferite[] {
  const perCliente = new Map<number, DdtAperto[]>();
  for (const d of ddt) (perCliente.get(d.clienteId) ?? perCliente.set(d.clienteId, []).get(d.clienteId)!).push(d);
  const gruppi: GruppoDifferite[] = [];
  for (const [clienteId, lista] of perCliente) {
    lista.sort((a, b) => a.data.localeCompare(b.data) || a.numero - b.numero);
    const termine = termineDifferita(lista.map(x => x.data))!;
    gruppi.push({ clienteId, cliente: lista[0].cliente, ddt: lista, termine, scaduto: termine < oggi, inScadenza: termine >= oggi && meseDi(termine) === meseDi(oggi) });
  }
  const peso = (g: GruppoDifferite) => (g.scaduto ? 0 : g.inScadenza ? 1 : 2);
  return gruppi.sort((a, b) => peso(a) - peso(b) || a.termine.localeCompare(b.termine) || a.cliente.localeCompare(b.cliente));
}

/** Quanti DDT hanno il termine passato e quanti ce l'hanno nel mese in corso (per il "Da fare oggi" del cruscotto). */
export function contaDifferite(ddt: { data: string }[], oggi: string): { scaduti: number; inScadenza: number; termine: string } {
  const inizioMese = `${oggi.slice(0, 7)}-01`;
  const termineMese = `${oggi.slice(0, 7)}-15`;
  let scaduti = 0, inScadenza = 0;
  for (const d of ddt) {
    if (d.data >= inizioMese) continue;                        // DDT del mese in corso: termine il mese prossimo
    const t = termineDifferita([d.data])!;
    if (t < oggi) scaduti++; else inScadenza++;
  }
  return { scaduti, inScadenza, termine: termineMese };
}

/** Frase per il cruscotto: "3 DDT del mese scorso da fatturare entro il 15/11" oppure "2 DDT da fatturare oltre il termine del 15". */
export function testoDifferite(c: { scaduti: number; inScadenza: number; termine: string }): string | null {
  const g = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  if (c.scaduti > 0) return `${c.scaduti} DDT da fatturare oltre il termine (il 15 del mese dopo il DDT)`;
  if (c.inScadenza > 0) return `${c.inScadenza} DDT del mese scorso da fatturare entro il ${g(c.termine)}`;
  return null;
}
