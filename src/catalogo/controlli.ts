/** Controlli sulle formule del catalogo (usati dal pannello Impostazioni e dai test). */
import { analizza, variabiliUsate } from '../engine/espressioni.js';
import type { FaseDef } from '../engine/calcolo.js';
import type { ParametroDef, MaterialeDef } from './iniziale.js';

/** Variabili disponibili nelle formule oltre ai parametri. */
export const VARIABILI_SISTEMA = ['nSchede', 'nSchedeInPCB'];

/** Controlla una formula: sintassi e nomi usati. Restituisce l'errore in italiano o null. */
export function controllaFormula(formula: string, cat: { parametri: ParametroDef[]; materiali: MaterialeDef[]; fasi: FaseDef[] }, ancheTempiFasi = false): string | null {
  try { analizza(formula); } catch (e: any) { return e.message; }
  const noti = new Set([
    ...VARIABILI_SISTEMA, ...cat.parametri.map(p => p.codice),
    ...(ancheTempiFasi ? cat.fasi.map(f => 'ore_' + f.codice) : []),
    ...cat.materiali.flatMap(m => ['prezzo_' + m.codice, 'qta_' + m.codice]),
  ]);
  const ignoti = variabiliUsate(formula).filter(v => !noti.has(v));
  return ignoti.length ? `Nomi sconosciuti nella formula: ${ignoti.join(', ')}` : null;
}

