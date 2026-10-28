/**
 * Documentazione di produzione dai documenti del cliente (Adriano 28/10/2026): per ogni foglio (SMD TOP, SMD BOT, THT, protezioni
 * per l'onda) i componenti da mostrare, raggruppati per codice, con le note del cliente e le segnalazioni (componenti critici).
 * Nel foglio THT i componenti uguali hanno lo stesso colore. Nessun accesso al database.
 */
import { chiaveCodice, ordinaRef, type AnalisiScheda, type Componente } from './analisi.js';
import type { Lato } from './pick-place.js';

export type Foglio = 'TOP' | 'BOT' | 'THT' | 'protezioni';
export const TITOLI_FOGLIO: Record<Foglio, string> = { TOP: 'Montaggio SMD lato TOP', BOT: 'Montaggio SMD lato BOT', THT: 'Montaggio THT', protezioni: 'Protezioni per la saldatura a onda' };

/** Colori ben distinguibili anche stampati (i THT di solito sono pochi codici; oltre si ripetono). */
export const COLORI_THT = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#42d4f4', '#f032e6', '#9a6324', '#808000', '#000075', '#469990', '#bfef45', '#800000', '#fabed4', '#ffd8b1', '#a9a9a9'];

export interface RigaMontaggio {
  item: number; quantita: number; refs: string[];
  valore: string; codice: string; impronta: string; descrizione: string;
  note: string[];          // note del cliente (BOM e note di montaggio)
  segnalazioni: string[];  // incongruenze trovate dal portale
  critico: boolean;
  colore?: string;         // solo foglio THT
  componenti: Componente[];
}

/** Lato dei corpi per un foglio: SMD del lato, THT dal lato dei corpi; le protezioni si guardano dal lato saldature. */
export function latoFoglio(a: AnalisiScheda, f: Foglio): Lato {
  if (f === 'TOP' || f === 'BOT') return f;
  const corpi = a.lavorazione.latoCorpiTht ?? 'TOP';
  return f === 'THT' ? corpi : (corpi === 'TOP' ? 'BOT' : 'TOP');
}

export function righeFoglio(a: AnalisiScheda, f: Foglio): RigaMontaggio[] {
  const montati = a.componenti.filter(c => c.montato);
  const scelti = f === 'THT' || f === 'protezioni' ? montati.filter(c => c.tipo === 'THT')
    : montati.filter(c => c.tipo === 'SMD' && (c.lato ?? 'TOP') === f);
  const noteCliente = new Map<string, string[]>();
  for (const n of a.noteCliente) for (const r of n.refs) noteCliente.set(r, [...(noteCliente.get(r) ?? []), n.nota]);
  const gruppi = new Map<string, Componente[]>();
  for (const c of scelti) { const k = chiaveCodice(c); gruppi.set(k, [...(gruppi.get(k) ?? []), c]); }
  const righe = [...gruppi.values()].map(cc => {
    cc.sort((x, y) => ordinaRef(x.ref, y.ref));
    const primo = cc[0];
    const note = [...new Set(cc.flatMap(c => [...(noteCliente.get(c.ref) ?? []), ...(c.bom?.note && !noteCliente.has(c.ref) ? [c.bom.note] : [])]))].filter(Boolean);
    const segnalazioni = [...new Set(cc.flatMap(c => c.segnalazioni.map(s => `${c.ref}: ${s}`)))];
    return {
      item: 0, quantita: cc.length, refs: cc.map(c => c.ref),
      valore: primo.bom?.valore || primo.pp?.valore || '', codice: primo.codiceCliente, impronta: primo.bom?.footprint || primo.pp?.footprint || '',
      descrizione: primo.bom?.descrizione ?? '', note, segnalazioni, critico: note.length > 0 || segnalazioni.length > 0, componenti: cc,
    } as RigaMontaggio;
  });
  // ordine: come nei fogli di montaggio, per riferimento (C, D, J, L, Q, R, U…)
  righe.sort((x, y) => ordinaRef(x.refs[0], y.refs[0]));
  righe.forEach((r, i) => { r.item = i + 1; if (f === 'THT') r.colore = COLORI_THT[i % COLORI_THT.length]; });
  return righe;
}
