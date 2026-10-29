/**
 * BOM divisa in più file (Adriano 29/10/2026: BOM_HELIOS_V2.0 e BOM_HELIOS_V2.0_PTH, cioè SMD e THT a parte):
 * dopo la BOM principale si uniscono le altre con riferimenti diversi; se i riferimenti sono gli stessi (al massimo il 5% diversi)
 * è un'altra BOM della stessa scheda (altra versione o revisione) e non si usa.
 */
import type { RigaBomScheda } from './analisi.js';

export interface BomCandidata { nome: string; righe: RigaBomScheda[] }

/** `candidate` già in ordine (la prima è la principale). Ritorna le BOM unite (la principale per prima) e quelle lasciate fuori. */
export function unisciBomDivise<T extends BomCandidata>(candidate: T[]): { unite: T[]; scartate: T[] } {
  if (!candidate.length) return { unite: [], scartate: [] };
  const unite = [candidate[0]], scartate: T[] = [];
  const refsUniti = new Set(candidate[0].righe.flatMap(r => r.designatori));
  for (const b of candidate.slice(1)) {
    const refs = b.righe.flatMap(r => r.designatori);
    const comuni = refs.filter(r => refsUniti.has(r)).length;
    if (refs.length && comuni <= Math.max(1, refs.length * 0.05)) { unite.push(b); refs.forEach(r => refsUniti.add(r)); }
    else scartate.push(b);
  }
  return { unite, scartate };
}
