/**
 * Controllo piazzole / case dei componenti chip (Adriano 28/10/2026: "piazzole per uno 0603 e componente 0805"):
 * si misurano sul Gerber del rame le due piazzole sotto il componente (passo, larghezza, lunghezza) e si confrontano con le
 * piazzole standard IPC-7351 (densità nominale, come le impronte di KiCad) di ogni case. Se le piazzole somigliano a un altro
 * case e non a quello della BOM, si segnala prima di andare in macchina.
 * Nessun accesso al database.
 */
import type { Piazzola } from './gerber.js';
import type { Lato } from './pick-place.js';

/** Piazzole IPC-7351 nominali: passo tra i centri, larghezza (lato corto del componente), lunghezza della piazzola; mm. */
export const PIAZZOLE_IPC: Record<string, { passo: number; larghezza: number; lunghezza: number; corpo: string }> = {
  '0201': { passo: 0.64, larghezza: 0.36, lunghezza: 0.32, corpo: '0,6 × 0,3' },
  '0402': { passo: 0.97, larghezza: 0.64, lunghezza: 0.59, corpo: '1,0 × 0,5' },
  '0603': { passo: 1.65, larghezza: 0.95, lunghezza: 0.80, corpo: '1,6 × 0,8' },
  '0805': { passo: 1.83, larghezza: 1.40, lunghezza: 1.03, corpo: '2,0 × 1,25' },
  '1206': { passo: 2.93, larghezza: 1.75, lunghezza: 1.13, corpo: '3,2 × 1,6' },
  '1210': { passo: 2.93, larghezza: 2.65, lunghezza: 1.13, corpo: '3,2 × 2,5' },
  '1812': { passo: 4.20, larghezza: 3.40, lunghezza: 1.30, corpo: '4,5 × 3,2' },
  '2010': { passo: 4.60, larghezza: 2.65, lunghezza: 1.25, corpo: '5,0 × 2,5' },
  '2512': { passo: 6.10, larghezza: 3.40, lunghezza: 1.25, corpo: '6,4 × 3,2' },
};

export interface MisuraPiazzole { passo: number; larghezza: number; lunghezza: number }
export interface EsitoPiazzole { ref: string; caseAtteso: string; misura: MisuraPiazzole | null; caseSimile: string | null; ok: boolean | null }

/** Quanto le piazzole misurate sono lontane da quelle standard del case (0 = uguali; il passo pesa di più). */
export function distanzaCase(m: MisuraPiazzole, k: string): number {
  const n = PIAZZOLE_IPC[k];
  return Math.abs(m.passo - n.passo) / n.passo + 0.7 * Math.abs(m.larghezza - n.larghezza) / n.larghezza + 0.4 * Math.abs(m.lunghezza - n.lunghezza) / n.lunghezza;
}

/** Le due piazzole del componente: coppia di piazzole simili, con il punto di mezzo sul centro del componente. */
export function misuraPiazzole(x: number, y: number, piazzole: Piazzola[], caseAtteso: string): MisuraPiazzole | null {
  const n = PIAZZOLE_IPC[caseAtteso];
  const raggio = Math.max(2.5, n.passo * 1.6);
  // le piazzole tonde sono vias o piazzole THT: i chip hanno piazzole rettangolari
  const vicine = piazzole.filter(p => !p.stimata && !p.tonda && Math.abs(p.x - x) < raggio && Math.abs(p.y - y) < raggio && p.w < 5 && p.h < 5);
  let migliore: { m: MisuraPiazzole; scarto: number; orizzontale: boolean } | null = null;
  const coppie: { passo: number; orizzontale: boolean }[] = [];
  for (let i = 0; i < vicine.length; i++) for (let j = i + 1; j < vicine.length; j++) {
    const a = vicine[i], b = vicine[j];
    const passo = Math.hypot(a.x - b.x, a.y - b.y);
    if (passo < 0.3) continue;
    const scarto = Math.hypot((a.x + b.x) / 2 - x, (a.y + b.y) / 2 - y);
    if (scarto > Math.max(0.15, passo * 0.2)) continue;
    if (Math.abs(a.w - b.w) > 0.05 + a.w * 0.2 || Math.abs(a.h - b.h) > 0.05 + a.h * 0.2) continue;
    const orizzontale = Math.abs(a.x - b.x) >= Math.abs(a.y - b.y);
    const m = { passo, larghezza: orizzontale ? a.h : a.w, lunghezza: orizzontale ? a.w : a.h };
    // le piazzole del componente sono le più vicine al centro: a parità di simmetria vince la coppia più stretta
    const punti = scarto + 0.3 * passo;
    coppie.push({ passo, orizzontale });
    if (!migliore || punti < migliore.scarto - 1e-6) migliore = { m, scarto: punti, orizzontale };
  }
  if (!migliore) return null;
  // una piazzola anche al centro: componente a 3 terminali (es. filtri EMI "CCE1206"), non è un chip a due piazzole
  if (vicine.some(p => Math.hypot(p.x - x, p.y - y) < migliore!.m.passo * 0.25)) return null;
  // …oppure un'altra coppia simmetrica vicina nell'altra direzione (terminale centrale diviso in due piazzole)
  const best = migliore;
  if (coppie.some(c => c.orizzontale !== best.orizzontale && c.passo < Math.max(best.m.passo * 2.5, best.m.passo + 2))) return null;
  return migliore.m;
}

/** Per ogni componente chip con case noto: misura e confronto. ok = null se le piazzole non si trovano. */
export function controllaPiazzole(
  componenti: { ref: string; lato: Lato; x: number; y: number; caseAtteso: string }[],
  piazzole: Partial<Record<Lato, Piazzola[]>>,
): EsitoPiazzole[] {
  return componenti.filter(c => PIAZZOLE_IPC[c.caseAtteso]).map(c => {
    const misura = misuraPiazzole(c.x, c.y, piazzole[c.lato] ?? [], c.caseAtteso);
    if (!misura) return { ref: c.ref, caseAtteso: c.caseAtteso, misura: null, caseSimile: null, ok: null };
    const ordine = Object.keys(PIAZZOLE_IPC).map(k => ({ k, d: distanzaCase(misura, k) })).sort((a, b) => a.d - b.d);
    const atteso = distanzaCase(misura, c.caseAtteso);
    // diverso solo se un altro case è chiaramente più simile e quello della BOM è lontano (le impronte dei CAD variano un po')
    const ok = !(ordine[0].k !== c.caseAtteso && atteso > 0.45 && atteso - ordine[0].d > 0.2);
    return { ref: c.ref, caseAtteso: c.caseAtteso, misura, caseSimile: ordine[0].k, ok };
  });
}
