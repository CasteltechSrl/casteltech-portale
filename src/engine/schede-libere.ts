/**
 * Schede di produzione senza preventivo (Adriano 13/11/2026): "devo andare subito in produzione" o "lavoro a consuntivo
 * per fare il prezzo la prima volta". La commessa ha cliente e prodotto dall'anagrafica come sempre, ma le fasi
 * non vengono dal preventivo:
 * - urgente: l'ufficio spunta le poche fasi che servono (tempo previsto facoltativo);
 * - a consuntivo: sulla scheda si stampano TUTTE le fasi del catalogo senza tempi previsti e l'operatore
 *   scrive solo quelle che fa (il rientro registra i tempi veri, base per il primo preventivo).
 * Qui solo regole, niente database.
 */
import { secondiDaTempo } from './tempi-scritti.js';

export type ModoScheda = 'urgente' | 'consuntivo';

export const MODI_SCHEDA: Record<ModoScheda, { nome: string; spiegazione: string }> = {
  urgente: {
    nome: 'Scheda urgente',
    spiegazione: 'Senza preventivo, per andare subito in produzione: spunta le fasi da fare (il tempo previsto è facoltativo).',
  },
  consuntivo: {
    nome: 'Scheda a consuntivo',
    spiegazione: 'Senza preventivo, per fare il prezzo la prima volta: sulla scheda si stampano tutte le fasi senza tempi previsti, l\'operatore scrive i tempi solo di quelle che fa.',
  },
};

export const modoScheda = (x: unknown): ModoScheda | null => (x === 'urgente' || x === 'consuntivo' ? x : null);

/** Dati della commessa senza preventivo (colonna `commesse.senza_preventivo`). */
export interface SenzaPreventivo { modo: ModoScheda; doppiaFaccia: boolean; schedePannello: number }

export function leggiSenzaPreventivo(x: any): SenzaPreventivo | null {
  const modo = modoScheda(x?.modo);
  if (!modo) return null;
  const pannello = Math.round(Number(x?.schedePannello));
  return { modo, doppiaFaccia: !!x?.doppiaFaccia, schedePannello: pannello > 0 ? Math.min(pannello, 500) : 1 };
}

/** Fase del catalogo (Impostazioni → Fasi) come serve qui. */
export interface FaseCatalogo { codice: string; numero: string; nome: string; gruppo: string; unaTantum: boolean; tariffa: string; persone: number }

/** Fase sulla scheda (stessa forma di `FaseScheda` di commesse-servizio). */
export interface FaseLibera { codice: string; numero: string; nome: string; gruppo: string; unaTantum: boolean; tariffa: string; persone: number; cicloSec: number; uomoSec: number }

/** Scelta di una fase nel modulo: spuntata, tempo previsto del lotto (come sull'orologio) e persone. */
export interface SceltaFase { si: boolean; tempo: string; persone: string }

/**
 * Fasi proposte nel modulo: quelle già salvate restano come sono; per una scheda nuova a consuntivo tutte spuntate,
 * per una urgente nessuna (le sceglie l'ufficio).
 */
export function fasiProposte(catalogo: FaseCatalogo[], modo: ModoScheda, salvate?: { codice: string; persone: number; cicloSec: number }[]): Record<string, SceltaFase> {
  const out: Record<string, SceltaFase> = {};
  for (const f of catalogo) {
    const s = salvate?.find(x => x.codice === f.codice);
    out[f.codice] = salvate
      ? { si: !!s, tempo: s && s.cicloSec > 0 ? tempoScritto(s.cicloSec) : '', persone: s && s.persone !== f.persone ? String(s.persone).replace('.', ',') : '' }
      : { si: modo === 'consuntivo', tempo: '', persone: '' };
  }
  return out;
}

/** Fasi spuntate nel modulo, nell'ordine del catalogo: tempo vuoto = nessun tempo previsto (0). */
export function fasiScelte(catalogo: FaseCatalogo[], modulo: Record<string, any> | undefined): FaseLibera[] {
  return catalogo.flatMap(f => {
    const x = modulo?.[f.codice];
    if (!x?.si) return [];
    const pers = Number(String(x.persone ?? '').replace(',', '.'));
    const persone = String(x.persone ?? '').trim() !== '' && pers > 0 && pers <= 50 ? pers : (f.persone > 0 ? f.persone : 1);
    const cicloSec = Math.max(0, secondiDaTempo(x.tempo) ?? 0);
    return [{ codice: f.codice, numero: f.numero, nome: f.nome, gruppo: f.gruppo, unaTantum: f.unaTantum, tariffa: f.tariffa,
      persone, cicloSec, uomoSec: cicloSec * persone }];
  });
}

/** Tempo in secondi scritto come sull'orologio (1:30). */
export function tempoScritto(sec: number): string {
  const m = Math.round(sec / 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Dati della scheda di produzione che mancano ancora (elenco Commesse, colonna "Da completare"): si possono scrivere
 * dopo, anche a commessa già stampata o in produzione.
 */
export function datiDaCompletare(c: {
  referente?: string | null; ordineCliente?: string | null; consegna?: string | Date | null;
  scheda?: { programmi?: Record<string, { top?: string; bot?: string }>; pasta?: string } | null; senzaFasi?: boolean;
}): string[] {
  const vuoto = (x: unknown) => !String(x ?? '').trim();
  const programmi = Object.values(c.scheda?.programmi ?? {});
  const out: string[] = [];
  if (vuoto(c.referente)) out.push('referente');
  if (vuoto(c.ordineCliente)) out.push('ordine cliente');
  if (!c.consegna) out.push('consegna');
  if (programmi.every(p => vuoto(p?.top) && vuoto(p?.bot)) && vuoto(c.scheda?.pasta)) out.push('programmi');
  if (c.senzaFasi) out.push('fasi');
  return out;
}
