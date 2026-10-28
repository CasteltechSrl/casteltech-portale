/**
 * Segnalazioni "Va bene" (Adriano 28/10/2026): l'ufficio controlla una segnalazione dei documenti del cliente (es. simbolo
 * scritto in modo diverso, componente giusto) e la segna come controllata. Non conta più tra gli errori, non va nel
 * "Da controllare" del preventivo e i componenti che aveva segnalato non sono più critici nelle stampe (se non hanno
 * altre segnalazioni aperte). Si applica in lettura: l'analisi salvata non cambia e "Rianalizza" la ritrova.
 * Nessun accesso al database.
 */
import type { AnalisiScheda, Segnalazione } from './analisi.js';

export interface Accettazione { da: string; il: string }
export type Accettate = Record<string, Accettazione>;

/** Chiave della segnalazione: stesso livello e stesso testo (se cambia il numero di componenti è un'altra segnalazione). */
export const chiaveSegnalazione = (s: Pick<Segnalazione, 'livello' | 'testo'>) => `${s.livello}|${s.testo}`;

export function conAccettate(a: AnalisiScheda, accettate: Accettate | null | undefined): AnalisiScheda {
  if (!accettate || !Object.keys(accettate).length) return a;
  const segnalazioni = a.segnalazioni.map(s => accettate[chiaveSegnalazione(s)] ? { ...s, accettata: accettate[chiaveSegnalazione(s)] } : s);
  // un componente resta segnalato se almeno una segnalazione aperta (non "info") lo nomina
  const aperti = new Set(segnalazioni.filter(s => !s.accettata && s.livello !== 'info').flatMap(s => s.refs ?? []));
  const chiusi = new Set(segnalazioni.filter(s => s.accettata).flatMap(s => s.refs ?? []));
  const componenti = a.componenti.map(c => chiusi.has(c.ref) && !aperti.has(c.ref) && c.segnalazioni.length
    ? { ...c, segnalazioni: [], segnalazioniAccettate: c.segnalazioni } : c);
  return { ...a, segnalazioni, componenti };
}
