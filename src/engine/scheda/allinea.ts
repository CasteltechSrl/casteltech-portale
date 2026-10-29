/**
 * Pick and place con un'origine diversa dai Gerber (Control Systems, M0929-C 29/10/2026: componenti misurati dall'angolo della scheda,
 * Gerber con la scheda a 103;205 mm). Senza allineamento i componenti cadono fuori dal disegno e il controllo piazzole non trova niente.
 * Si cerca lo spostamento che porta più componenti sopra le piazzole del rame (voto a griglia di 1 mm, poi affinato con la mediana).
 * Nessun accesso al database.
 */
import type { Piazzola } from './gerber.js';

export interface Spostamento { dx: number; dy: number; prima: number; dopo: number }

const MAX_COMPONENTI = 80;
/** Un componente "cade sul rame" se c'è una piazzola entro questa distanza dal suo centro (mm). */
const VICINO = 2.5;

function quota(pos: { x: number; y: number }[], piazzole: Piazzola[], dx: number, dy: number): number {
  if (!pos.length) return 0;
  let n = 0;
  for (const p of pos) if (piazzole.some(q => Math.abs(q.x - p.x - dx) <= VICINO && Math.abs(q.y - p.y - dy) <= VICINO)) n++;
  return n / pos.length;
}

/**
 * Lo spostamento da dare alle posizioni del pick and place, o null se non serve (già allineate) o se non se ne trova uno sicuro.
 * `pos`: componenti di un lato; `piazzole`: piazzole del rame (o della pasta) dello stesso lato.
 */
export function allineaAlRame(pos: { x: number; y: number }[], piazzole: Piazzola[]): Spostamento | null {
  if (pos.length < 5 || piazzole.length < 10) return null;
  const campione = pos.length > MAX_COMPONENTI ? pos.filter((_, i) => i % Math.ceil(pos.length / MAX_COMPONENTI) === 0) : pos;
  const prima = quota(campione, piazzole, 0, 0);
  if (prima >= 0.6) return null;
  // voto: ogni coppia componente–piazzola propone uno spostamento; quello giusto lo propongono quasi tutti i componenti
  const voti = new Map<string, number>();
  for (const p of campione) {
    const visti = new Set<string>();
    for (const q of piazzole) {
      const k = `${Math.round(q.x - p.x)};${Math.round(q.y - p.y)}`;
      if (visti.has(k)) continue;
      visti.add(k);
      voti.set(k, (voti.get(k) ?? 0) + 1);
    }
  }
  const migliori = [...voti.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k.split(';').map(Number));
  let scelta: { dx: number; dy: number; q: number } | null = null;
  for (const [gx, gy] of migliori) {
    // affinamento: per ogni componente il centro delle piazzole vicine, poi la mediana delle differenze; si ripete stringendo il raggio
    // (con 2,5 mm entrano anche piazzole dei vicini e lo spostamento resta impreciso di mezzo millimetro)
    const mediana = (v: number[]) => { const o = [...v].sort((a, b) => a - b); return o[Math.floor(o.length / 2)]; };
    let dx = gx, dy = gy, trovato = false;
    for (const raggio of [VICINO, 1.5, 1, 0.8]) {
      const ddx: number[] = [], ddy: number[] = [];
      for (const p of campione) {
        const vicine = piazzole.filter(q => Math.abs(q.x - p.x - dx) <= raggio && Math.abs(q.y - p.y - dy) <= raggio);
        if (!vicine.length) continue;
        ddx.push(vicine.reduce((t, q) => t + q.x, 0) / vicine.length - p.x);
        ddy.push(vicine.reduce((t, q) => t + q.y, 0) / vicine.length - p.y);
      }
      if (ddx.length < campione.length / 3) break;
      dx = mediana(ddx); dy = mediana(ddy); trovato = true;
    }
    if (!trovato) continue;
    // ultimo passo, al ventesimo di millimetro: i chip a due piazzole hanno il centro esattamente a metà della coppia. Ogni coppia
    // vicina propone uno spostamento; vince quello proposto da più componenti (le coppie dei vicini propongono valori sparsi;
    // M0929-C: la più vicina era quella del componente accanto, 1,27 mm sopra)
    const proposte = new Map<string, { n: Set<number>; x: number[]; y: number[] }>();
    campione.forEach((p, k) => {
      const vicine = piazzole.filter(q => !q.tonda && Math.abs(q.x - p.x - dx) <= 2.5 && Math.abs(q.y - p.y - dy) <= 2.5);
      for (let i = 0; i < vicine.length; i++) for (let j = i + 1; j < vicine.length; j++) {
        const a = vicine[i], b = vicine[j];
        if (Math.abs(a.w - b.w) > 0.05 + a.w * 0.2 || Math.abs(a.h - b.h) > 0.05 + a.h * 0.2 || Math.hypot(a.x - b.x, a.y - b.y) > 4) continue;
        const px = (a.x + b.x) / 2 - p.x, py = (a.y + b.y) / 2 - p.y;
        const chiave = `${Math.round(px * 20)};${Math.round(py * 20)}`;
        const v = proposte.get(chiave) ?? { n: new Set<number>(), x: [], y: [] };
        v.n.add(k); v.x.push(px); v.y.push(py); proposte.set(chiave, v);
      }
    });
    const piuVotata = [...proposte.values()].sort((a, b) => b.n.size - a.n.size)[0];
    if (piuVotata && piuVotata.n.size >= 5) { dx = mediana(piuVotata.x); dy = mediana(piuVotata.y); }
    dx = Math.round(dx * 1000) / 1000; dy = Math.round(dy * 1000) / 1000;
    const q = quota(campione, piazzole, dx, dy);
    if (!scelta || q > scelta.q) scelta = { dx, dy, q };
  }
  if (!scelta || scelta.q < 0.6 || scelta.q < prima + 0.3) return null;
  return { dx: scelta.dx, dy: scelta.dy, prima, dopo: scelta.q };
}
