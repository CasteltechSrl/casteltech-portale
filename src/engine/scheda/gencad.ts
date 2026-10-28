/**
 * Lettura del file GenCAD (.cad): per ogni componente lato, impronta, se è THT (impronta con fori) e quanti piedini passanti ha.
 * È la fonte più sicura per SMD/THT: sull'esempio Univac EA1002-0 la BOM diceva SMT per tre relè che hanno 5 fori ciascuno.
 * Nessun accesso al database.
 */
import type { Lato } from './pick-place.js';

export interface ComponenteCad {
  ref: string;
  lato: Lato;
  x: number; y: number; rot: number;
  impronta: string;
  tht: boolean;
  piediniTht: number;
  piedini: number;
  montaggioDichiarato?: string; // attributo Mounting_Type del CAD (es. SMT), se c'è
}

export const sembraGenCad = (testo: string) => /^\$HEADER/m.test(testo.slice(0, 2000)) && /GENCAD/i.test(testo.slice(0, 2000));

export function leggiGenCad(testo: string): { componenti: ComponenteCad[]; unita: string } {
  const righe = testo.replace(/\r/g, '').split('\n');
  const unita = /^UNITS\s+(\S+)/m.exec(testo)?.[1]?.toUpperCase() ?? 'MM';
  const fattore = unita.startsWith('INCH') ? 25.4 : unita.startsWith('MIL') || unita.startsWith('THOU') ? 0.0254 : unita === 'USER' ? 1 : 1;
  const forme = new Map<string, { tht: boolean; piedini: number; piediniTht: number }>();
  const padstackForati = new Set<string>();
  const componenti: ComponenteCad[] = [];
  let sez = '', forma = '', pad = '';
  let c: ComponenteCad | null = null;
  const nome = (r: string) => (/"([^"]*)"/.exec(r)?.[1] ?? r.split(/\s+/)[1] ?? '').trim();
  for (const r of righe) {
    const t = r.trim();
    if (t.startsWith('$')) { sez = t.toUpperCase(); continue; }
    if (sez === '$PADS' || sez === '$PADSTACKS') {
      if (/^(PAD|PADSTACK)\s/.test(t)) {
        pad = nome(t);
        // "PADSTACK nome foro": il secondo numero è il diametro del foro
        const m = /^PADSTACK\s+(?:"[^"]*"|\S+)\s+([\d.]+)/.exec(t);
        if (m && Number(m[1]) > 0) padstackForati.add(pad);
        if (/Hole/i.test(pad)) padstackForati.add(pad);
      } else if (/^DRILL\s+([\d.]+)/.test(t) && Number(/^DRILL\s+([\d.]+)/.exec(t)![1]) > 0) padstackForati.add(pad);
    } else if (sez === '$SHAPES') {
      if (t.startsWith('SHAPE ')) { forma = nome(t); forme.set(forma, { tht: false, piedini: 0, piediniTht: 0 }); }
      else if (t.startsWith('INSERT ')) { const s = forme.get(forma); if (s) s.tht = /^(TH|PTH|THT)$/i.test(t.split(/\s+/)[1]); }
      else if (t.startsWith('PIN ')) {
        const s = forme.get(forma); if (!s) continue;
        s.piedini++;
        const padNome = /"([^"]*)"/.exec(t)?.[1] ?? t.split(/\s+/)[2] ?? '';
        if (padstackForati.has(padNome) || /Hole/i.test(padNome)) s.piediniTht++;
      }
    } else if (sez === '$COMPONENTS') {
      if (t.startsWith('COMPONENT ')) { c = { ref: t.split(/\s+/)[1].toUpperCase(), lato: 'TOP', x: 0, y: 0, rot: 0, impronta: '', tht: false, piediniTht: 0, piedini: 0 }; componenti.push(c); }
      else if (!c) continue;
      else if (t.startsWith('PLACE ')) { const [, x, y] = t.split(/\s+/); c.x = Number(x) * fattore; c.y = Number(y) * fattore; }
      else if (t.startsWith('LAYER ')) c.lato = /BOT/i.test(t) ? 'BOT' : 'TOP';
      else if (t.startsWith('ROTATION ')) c.rot = Number(t.split(/\s+/)[1]) || 0;
      else if (t.startsWith('SHAPE ')) c.impronta = nome(t);
      else if (/ATTRIBUTE\s+\S+\s+Mounting_Type\s+/i.test(t)) c.montaggioDichiarato = t.split(/\s+/).pop()!.replace(/"/g, '');
    }
  }
  for (const k of componenti) {
    const s = forme.get(k.impronta);
    if (!s) continue;
    k.piedini = s.piedini;
    k.piediniTht = s.tht ? Math.max(s.piediniTht, s.piedini) : s.piediniTht;
    k.tht = s.tht || s.piediniTht > 0;
  }
  return { componenti, unita };
}
