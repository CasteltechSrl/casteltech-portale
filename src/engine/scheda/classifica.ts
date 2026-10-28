/**
 * Riconoscimento dei file di un pacchetto del cliente: BOM, pick and place, Gerber (e che strato è), foratura, GenCAD, ODB++, PDF…
 * Prima il nome, poi il contenuto (molti CAD scrivono file senza estensione o con estensioni proprie: .gdo, .art, .274x).
 * Nessun accesso al database.
 */
import { sembraForatura } from './foratura.js';
import { sembraGenCad } from './gencad.js';
import { sembraGerber } from './gerber.js';
import { sembraPickPlace, type Lato } from './pick-place.js';
import type { RuoloStrato } from './analisi.js';

export type TipoFile = 'bom' | 'pick-place' | 'gerber' | 'foratura' | 'gencad' | 'odb' | 'pdf' | 'disegno-3d' | 'immagine' | 'archivio' | 'altro';
export const ETICHETTE_TIPO: Record<TipoFile, string> = {
  bom: 'BOM', 'pick-place': 'Pick and place', gerber: 'Gerber', foratura: 'Foratura', gencad: 'CAD (GenCAD)', odb: 'ODB++',
  pdf: 'PDF', 'disegno-3d': 'Disegno 3D', immagine: 'Immagine', archivio: 'Archivio', altro: 'Altro',
};

const est = (nome: string) => (/\.([^./\\]+)$/.exec(nome)?.[1] ?? '').toLowerCase();
const ESTENSIONI_GERBER = new Set(['gbr', 'ger', 'gtl', 'gbl', 'gto', 'gbo', 'gtp', 'gbp', 'gts', 'gbs', 'gko', 'gm1', 'gm2', 'gm3', 'gm4', 'gm5',
  'gm6', 'gm7', 'gm13', 'gm14', 'gm15', 'g1', 'g2', 'g3', 'g4', 'gp1', 'gp2', 'gp3', 'gp4', 'gd1', 'gg1', 'art', 'gdo', 'pho', '274x', 'gbx', 'cmp', 'sol', 'stc', 'sts', 'plc', 'pls', 'crc', 'crs']);

/** Tipo del file dal nome e (se serve) dal testo. Il testo può mancare per i file binari. */
export function tipoFile(nome: string, testo: string | null): TipoFile {
  const e = est(nome), n = nome.toLowerCase();
  if (['pdf'].includes(e)) return 'pdf';
  if (['step', 'stp', 'igs', 'iges', 'wrl', 'stl'].includes(e)) return 'disegno-3d';
  if (['png', 'jpg', 'jpeg', 'bmp', 'tif', 'tiff', 'gif', 'svg'].includes(e)) return 'immagine';
  if (['zip', '7z', 'rar'].includes(e)) return 'archivio';
  if (['tgz'].includes(e) || /odb/.test(n) && ['tgz', 'gz', 'tar'].includes(e)) return 'odb';
  if (['xlsx', 'xlsm'].includes(e)) return /pick|place|p&p|pnp|posiz|centroid|xy/i.test(nome) ? 'pick-place' : 'bom';
  if (['xls', 'doc', 'docx', 'ini', 'log', 'rep', 'drr', 'ldp', 'apr', 'rul', 'extrep', 'jrl', 'dsn', 'gpf', 'gbrjob', 'cam', 'rou'].includes(e)) return 'altro';
  if (testo == null) return 'altro';
  if (sembraGenCad(testo)) return 'gencad';
  if (sembraGerber(testo)) return 'gerber';
  if (sembraForatura(testo)) return 'foratura';
  if (e === 'pos' || sembraPickPlace(testo)) return 'pick-place';
  if (ESTENSIONI_GERBER.has(e)) return 'altro';
  if (['csv', 'txt', 'bom', 'tsv'].includes(e) && /designator|reference|refdes|riferiment|qty|quantit/i.test(testo.slice(0, 5000))) return 'bom';
  return 'altro';
}

/** Ruolo e lato di uno strato Gerber dal nome del file e dai commenti (KiCad e Altium li scrivono). */
export function ruoloStrato(nome: string, testo = ''): { ruolo: RuoloStrato; lato: Lato | null } {
  const base = nome.split(/[\\/]/).pop()!;
  const e = est(base), n = base.toUpperCase().replace(/\.[^.]+$/, '');
  // funzione dichiarata nel file (Gerber X2: %TF.FileFunction,Copper,L1,Top*%)
  const ff = /TF\.FileFunction,([^*%]+)/.exec(testo.slice(0, 3000))?.[1] ?? '';
  if (ff) {
    const lato: Lato | null = /,Top\b/i.test(ff) ? 'TOP' : /,Bot/i.test(ff) ? 'BOT' : null;
    if (/^Copper/i.test(ff)) return { ruolo: /,Inr/i.test(ff) ? 'interno' : 'rame', lato };
    if (/^Soldermask/i.test(ff)) return { ruolo: 'maschera', lato };
    if (/^Paste/i.test(ff)) return { ruolo: 'pasta', lato };
    if (/^Legend/i.test(ff)) return { ruolo: 'serigrafia', lato };
    if (/^Profile/i.test(ff)) return { ruolo: 'contorno', lato: null };
  }
  const perEst: Record<string, [RuoloStrato, Lato | null]> = {
    gtl: ['rame', 'TOP'], gbl: ['rame', 'BOT'], gto: ['serigrafia', 'TOP'], gbo: ['serigrafia', 'BOT'], gtp: ['pasta', 'TOP'], gbp: ['pasta', 'BOT'],
    gts: ['maschera', 'TOP'], gbs: ['maschera', 'BOT'], gko: ['contorno', null], gm1: ['contorno', null], g1: ['interno', null], g2: ['interno', null],
    g3: ['interno', null], g4: ['interno', null], gd1: ['foratura', null], gg1: ['foratura', null], gp1: ['interno', null], gp2: ['interno', null], gp3: ['interno', null], gp4: ['interno', null],
    cmp: ['rame', 'TOP'], sol: ['rame', 'BOT'], plc: ['serigrafia', 'TOP'], pls: ['serigrafia', 'BOT'], stc: ['maschera', 'TOP'], sts: ['maschera', 'BOT'], crc: ['pasta', 'TOP'], crs: ['pasta', 'BOT'],
  };
  if (perEst[e]) return { ruolo: perEst[e][0], lato: perEst[e][1] };
  const lato: Lato | null = /(^|[^A-Z])(TOP|F)([^A-Z]|$)|_TOP|TOP_|^T[A-Z]{1,2}$|[_-]F[_.]|^F_|SST|SMT|SPT|PASTA_TOP|LATO_?A/.test(n) || /^[A-Z]{0,3}CP?Z$/.test(n) ? 'TOP'
    : /(^|[^A-Z])(BOT|BOTTOM|B)([^A-Z]|$)|_BOT|BOTTOM|[_-]B[_.]|^B_|SSB|SMB|SPB|PASTA_BOT|LATO_?B/.test(n) || /^[A-Z]{0,3}SP?Z$/.test(n) ? 'BOT' : null;
  // (file dei fornitori italiani: lcz/lsz rame lato componenti/saldature, mcz/msz maschere, palcz/palsz pasta, scz/ssz serigrafie)
  if (/OUTLINE|EDGE[_ ]?CUTS|BOARD[_ ]?SHAPE|PROFILE|CONTORNO|ROUT|KEEP-?OUT|BORDO|MECHANICAL ?1\b/.test(n)) return { ruolo: 'contorno', lato: null };
  if (/DRILL|FORAT|NCDRILL|DRL|DRILL_?DRAWING|FAB/.test(n)) return { ruolo: 'foratura', lato: null };
  if (/PASTE|PASTA|SOLDERPASTE|SP[TB]$|^SP[TB]|CREAM|STENCIL|LAMINA|PAL[CS]Z/.test(n)) return { ruolo: 'pasta', lato };
  if (/MASK|SOLDER|MASCHERA|^SM[TB]$|SM[TB]$|^M[CS]Z$/.test(n)) return { ruolo: 'maschera', lato };
  if (/SILK|SERIGRAF|OVERLAY|LEGEND|^SS[TB]$|SS[TB]$|^S[CS]Z$|ASSEMBLY/.test(n)) return { ruolo: 'serigrafia', lato };
  if (/INNER|INTERN|NEGATIVE|PLANE|^L\d+|IN\d|_L[2-9]|^L[2-9]PZ/.test(n)) return { ruolo: 'interno', lato: null };
  if (/COPPER|RAME|ETCH|SIGNAL|^TOP$|^BOTTOM$|_TOP$|_BOTTOM$|_TOP_|_BOTTOM_|F_CU|B_CU|^L[CS]Z$/.test(n)) return { ruolo: 'rame', lato };
  return { ruolo: 'altro', lato };
}
