/**
 * Data di consegna stimata nel preventivo (suggerimento di Federico, 27/10/2026): date di arrivo di componenti e PCB,
 * ore di lavoro del preventivo, capacità produttiva del Gantt (ore libere giorno per giorno), poi + 5 giorni lavorativi;
 * "lavoriamo per settimane": si propone il venerdì della settimana di consegna.
 * Qui solo i conti, senza database: i test li controllano.
 */
import { GIORNI_ARRIVO_LAVORAZIONE, lavorativo, lavorativoVicino, piuGiorni, piuLavorativi } from './ordini.js';

/** Giorni lavorativi tra la fine della produzione e la consegna (Federico: "aumentata di 5 gg lavorativi"). */
export const GIORNI_DOPO_PRODUZIONE = 5;

export interface StimaConsegna {
  materialeDal: string | null;  // ultimo arrivo tra componenti e PCB (null = materiale già in casa)
  inizio: string; fine: string; consegna: string;
  venerdi: string; settimana: number; anno: number;
  oreLavoro: number; giorniLavoro: number; giorniConAltroLavoro: number;
}

const valida = (d: unknown): string | null => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d)) ? d : null;

/** Settimana ISO (lunedì–domenica, la prima contiene il giovedì dell'anno). */
export function settimanaIso(d: string): { settimana: number; anno: number } {
  const x = new Date(d + 'T12:00:00Z');
  const giovedi = new Date(x); giovedi.setUTCDate(x.getUTCDate() + 3 - ((x.getUTCDay() + 6) % 7));
  const inizioAnno = new Date(Date.UTC(giovedi.getUTCFullYear(), 0, 1, 12));
  return { settimana: 1 + Math.floor(Math.round((giovedi.getTime() - inizioAnno.getTime()) / 86400000) / 7), anno: giovedi.getUTCFullYear() };
}

export function stimaConsegna(dati: {
  oggi: string; arrivoComponenti?: string | null; arrivoPcb?: string | null;
  oreLavoro: number; carico: Record<string, number>; oreGiorno: number;
}): StimaConsegna {
  const { oggi, carico, oreGiorno } = dati;
  const arrivi = [valida(dati.arrivoComponenti), valida(dati.arrivoPcb)].filter((x): x is string => !!x).sort();
  const materialeDal = arrivi.length ? arrivi[arrivi.length - 1] : null;
  // regola del foglio di schedulazione: lavorazione = arrivo materiale + 3 giorni; senza date il materiale c'è già: si parte il primo giorno lavorativo dopo oggi
  const base = materialeDal && materialeDal > oggi ? materialeDal : oggi;
  const inizio = materialeDal ? piuLavorativi(lavorativoVicino(base), GIORNI_ARRIVO_LAVORAZIONE) : piuLavorativi(oggi, 1);
  const oreLavoro = Math.max(0, Number(dati.oreLavoro) || 0);
  let restano = oreLavoro, d = inizio, fine = inizio, giorni = 0, conAltro = 0;
  for (let i = 0; i < 730 && restano > 1e-9; i++, d = piuGiorni(d, 1)) {
    if (!lavorativo(d)) continue;
    const occupate = carico[d] ?? 0;
    const libere = Math.max(0, oreGiorno - occupate);
    if (occupate > 0) conAltro++;
    if (libere <= 0) continue;
    restano -= Math.min(libere, restano);
    giorni++; fine = d;
  }
  const consegna = piuLavorativi(fine, GIORNI_DOPO_PRODUZIONE);
  const venerdi = piuGiorni(consegna, 4 - ((new Date(consegna + 'T12:00:00Z').getUTCDay() + 6) % 7));
  return { materialeDal, inizio, fine, consegna, venerdi, ...settimanaIso(consegna), oreLavoro, giorniLavoro: Math.max(1, giorni), giorniConAltroLavoro: conAltro };
}
