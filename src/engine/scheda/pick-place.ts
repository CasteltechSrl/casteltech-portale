/**
 * Lettura dei file di posizionamento (pick and place) dei clienti.
 * Formati provati con i pacchetti veri (Adriano, 27/10/2026): Altium (.csv e .txt), KiCad (.pos), Allegro ("!" come separatore),
 * PADS/Xpedition ($PART_SECTION_BEGIN$), file con intestazione qualsiasi (csv, ; o tabulazioni) e file senza intestazione
 * del tipo "C6; 0.1uF 0402_CC;58.7756;55.7022;270.000;CODICE" (il lato si prende dal nome del file: _top_, _bot_, _TH_).
 * Nessun accesso al database.
 */

export type Lato = 'TOP' | 'BOT';

export interface Posizione {
  ref: string;
  valore: string;          // valore / commento / nome del componente (come lo scrive il CAD)
  footprint: string;
  x: number;               // mm
  y: number;               // mm
  rot: number;             // gradi, 0–360, come nel file del cliente (le rotazioni per macchina arriveranno dopo)
  lato: Lato | null;       // null = il file non lo dice
  codice?: string;         // codice scritto dal cliente nel file (es. Selea), se c'è
  tht?: boolean;           // il file stesso dice che è THT (file "_TH_")
}

export interface LetturaPickPlace {
  formato: string;
  unita: 'mm' | 'mil' | 'inch';
  posizioni: Posizione[];
  fiducial: { x: number; y: number; lato: Lato | null }[];
  avvisi: string[];
}

const RE_FIDUCIAL = /^(FID|FD|FM|FIDUCIAL)\d*$/i;
const FATTORE = { mm: 1, mil: 0.0254, inch: 25.4 } as const;

/** Lato dal testo del file: TopLayer, T, top, F (KiCad "front"), mirror YES = sotto. */
export function leggiLato(testo: string | undefined): Lato | null {
  const t = String(testo ?? '').trim().toUpperCase();
  if (!t) return null;
  if (/^(T|TOP|TOPLAYER|TOP LAYER|F|FRONT|F\.CU|COMPONENT|COMP|LATO A|A)$/.test(t)) return 'TOP';
  if (/^(B|BOT|BOTTOM|BOTTOMLAYER|BOTTOM LAYER|BACK|B\.CU|SOLDER|LATO B)$/.test(t)) return 'BOT';
  if (t.startsWith('TOP')) return 'TOP';
  if (t.startsWith('BOT')) return 'BOT';
  return null;
}

/** Lato dal nome del file (Selea, file separati per lato). */
function latoDaNome(nome: string): { lato: Lato | null; tht: boolean } {
  const n = nome.toUpperCase().replace(/\.[^.]+$/, '');
  const tht = /(^|[_\-\s.])(TH|THT|PTH)([_\-\s.]|$)/.test(n);
  if (/(^|[_\-\s.(])(BOT|BOTTOM|BOTTOMLAYER|LATO ?B)([_\-\s.)]|$)/.test(n)) return { lato: 'BOT', tht };
  if (/(^|[_\-\s.(])(TOP|TOPLAYER|LATO ?A)([_\-\s.)]|$)/.test(n)) return { lato: 'TOP', tht };
  return { lato: null, tht };
}

const num = (s: string | undefined) => {
  const t = String(s ?? '').trim().replace(/^"|"$/g, '').replace(/(mm|mil|in)$/i, '');
  if (!/^[-+]?\d+([.,]\d+)?$/.test(t)) return NaN;
  return Number(t.replace(',', '.'));
};
const normRot = (r: number) => { const x = ((Math.round(r * 1000) / 1000) % 360 + 360) % 360; return x === 360 ? 0 : x; };

/** Divide una riga rispettando le virgolette ("Exposed PAD" resta un pezzo solo). */
export function dividiRiga(riga: string, sep: ',' | ';' | '\t' | ' ' | '!'): string[] {
  if (sep === ' ') {
    const out: string[] = [];
    const re = /"([^"]*)"|(\S+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(riga))) out.push(m[1] ?? m[2]);
    return out;
  }
  const out: string[] = [];
  let cur = '', dentro = false;
  for (let i = 0; i < riga.length; i++) {
    const c = riga[i];
    if (c === '"') { if (dentro && riga[i + 1] === '"') { cur += '"'; i++; } else dentro = !dentro; }
    else if (c === sep && !dentro) { out.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  out.push(cur.trim());
  return out;
}

// nomi delle colonne (maiuscolo, senza unità tra parentesi)
const COLONNE: Record<'ref' | 'valore' | 'footprint' | 'x' | 'y' | 'rot' | 'lato' | 'codice' | 'mirror', string[]> = {
  ref: ['DESIGNATOR', 'REF', 'REFDES', 'REFERENCE', 'PART', 'COMPONENT', 'RIFERIMENTO', 'NAME', 'NOME', 'DESIGNATORE'],
  valore: ['COMMENT', 'VALUE', 'VAL', 'VALORE', 'PART NAME', 'PARTNAME', 'PART NUMBER', 'DEVICE'],
  footprint: ['FOOTPRINT', 'PACKAGE', 'PATTERN', 'SYMBOL_NAME', 'SHAPE', 'CASE', 'DECAL', 'PCB DECAL'],
  x: ['CENTER-X', 'CENTER X', 'MID X', 'POSX', 'POS X', 'X', 'SYMBOL_X', 'LOCATION X', 'X COORD', 'COORD X', 'REF X', 'XPOS'],
  y: ['CENTER-Y', 'CENTER Y', 'MID Y', 'POSY', 'POS Y', 'Y', 'SYMBOL_Y', 'LOCATION Y', 'Y COORD', 'COORD Y', 'REF Y', 'YPOS'],
  rot: ['ROTATION', 'ROT', 'ANGLE', 'ROTAZIONE', 'ANGOLO', 'ORIENTATION', 'THETA'],
  lato: ['LAYER', 'SIDE', 'LATO', 'TB', 'T/B', 'MOUNT SIDE', 'PLACEMENT SIDE'],
  codice: ['CODICE', 'CODE', 'CODICE INTERNO', 'ITEM CODE', 'PART CODE'],
  mirror: ['MIRROR'],
};
const normCol = (s: string) => s.toUpperCase().replace(/\(.*?\)/g, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
const unitaDaCol = (s: string): 'mm' | 'mil' | 'inch' | null => {
  const m = s.toLowerCase().match(/\((mm|mil|mils|in|inch)\)/);
  return m ? (m[1].startsWith('mil') ? 'mil' : m[1] === 'mm' ? 'mm' : 'inch') : null;
};

function indiciColonne(intest: string[]) {
  const n = intest.map(c => normCol(c.replace(/_/g, ' ')));
  const nr = intest.map(c => normCol(c));
  const trova = (chiavi: string[]) => {
    for (const k of chiavi.map(normCol)) { const i = n.findIndex((c, j) => c === k || nr[j] === k); if (i >= 0) return i; }
    return -1;
  };
  return {
    ref: trova(COLONNE.ref), valore: trova(COLONNE.valore), footprint: trova(COLONNE.footprint), x: trova(COLONNE.x), y: trova(COLONNE.y),
    rot: trova(COLONNE.rot), lato: trova(COLONNE.lato), codice: trova(COLONNE.codice), mirror: trova(COLONNE.mirror),
  };
}

/** Il testo sembra un pick and place? (serve per riconoscere i .txt e i .csv). */
export function sembraPickPlace(testo: string): boolean {
  if (/\$PART_SECTION_BEGIN\$/.test(testo) || /Pick and Place|Footprint positions|refdes\s*!/i.test(testo)) return true;
  try { return leggiPickPlace('x.txt', testo).posizioni.length >= 2; } catch { return false; }
}

export function leggiPickPlace(nomeFile: string, testoGrezzo: string): LetturaPickPlace {
  const testo = testoGrezzo.replace(/^﻿/, '');
  const righe = testo.split(/\r?\n/);
  const avvisi: string[] = [];
  const daNome = latoDaNome(nomeFile);

  // ── PADS / Xpedition (vb_ais): "REF PARTNAME ROT X Y SIDE YES" ──
  if (/\$PART_SECTION_BEGIN\$/.test(testo)) {
    const unita = /UNITS\s+(INCH|INCHES)/i.test(testo) ? 'inch' : /UNITS\s+MIL/i.test(testo) ? 'mil' : 'mm';
    const f = FATTORE[unita];
    const posizioni: Posizione[] = [], fiducial: LetturaPickPlace['fiducial'] = [];
    let sez = '';
    for (const r of righe) {
      const t = r.trim();
      if (/^\$\w+_SECTION_BEGIN\$/.test(t)) { sez = t; continue; }
      if (/_SECTION_END\$/.test(t)) { sez = ''; continue; }
      const p = t.split(/\s+/);
      if (sez.startsWith('$PART') && p.length >= 6) {
        const [ref, nome, rot, x, y, lato] = p;
        if (!Number.isFinite(num(x)) || !Number.isFinite(num(y))) continue;
        posizioni.push({ ref: ref.toUpperCase(), valore: nome, footprint: '', x: num(x) * f, y: num(y) * f, rot: normRot(num(rot) || 0), lato: leggiLato(lato) });
      } else if (sez.startsWith('$FIDUCIAL') && p.length >= 3) {
        fiducial.push({ x: num(p[1]) * f, y: num(p[2]) * f, lato: leggiLato(p[3]) });
      }
    }
    return separaFiducial({ formato: 'PADS / Xpedition', unita, posizioni, fiducial, avvisi });
  }

  // ── Allegro: colonne separate da "!" ──
  if (/^\s*#\s*refdes\s*!/im.test(testo)) {
    const unita = /UUNITS\s*=\s*(INCHES|INCH)/i.test(testo) ? 'inch' : /UUNITS\s*=\s*MILS/i.test(testo) ? 'mil' : 'mm';
    const intest = righe.find(r => /^\s*#\s*refdes\s*!/i.test(r))!.replace(/^\s*#/, '').split('!').map(s => s.trim());
    const ix = indiciColonne(intest);
    const posizioni: Posizione[] = [];
    for (const r of righe) {
      if (/^\s*#/.test(r) || !r.includes('!')) continue;
      const c = r.split('!').map(s => s.trim());
      const x = num(c[ix.x]), y = num(c[ix.y]);
      if (!c[ix.ref] || !Number.isFinite(x) || !Number.isFinite(y)) continue;
      const mir = ix.mirror >= 0 ? c[ix.mirror].toUpperCase() : '';
      posizioni.push({ ref: c[ix.ref].toUpperCase(), valore: '', footprint: ix.footprint >= 0 ? c[ix.footprint] : '', x: x * FATTORE[unita], y: y * FATTORE[unita],
        rot: normRot(num(c[ix.rot]) || 0), lato: mir === 'YES' || mir === 'MIRROR' ? 'BOT' : 'TOP' });
    }
    return separaFiducial({ formato: 'Allegro', unita, posizioni, fiducial: [], avvisi });
  }

  // ── Allegro vecchio, senza "!": "UUNITS = MILLIMETERS" poi "R1  -30.4083  -2.3717  180  m RES_0603" ("m" = mirror = BOT;
  //    LPS VariBase Top P06, 30/10/2026) ──
  if (/^\s*UUNITS\s*=/im.test(testo)) {
    const RE_RIGA = /^\s*([A-Z][A-Z0-9_+\-]{0,15})\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(?:(m)\s+)?(\S+)\s*$/i;
    const trovate = righe.map(r => RE_RIGA.exec(r)).filter((m): m is RegExpExecArray => !!m);
    if (trovate.length >= 2 && trovate.length * 3 >= righe.filter(r => r.trim() && !/UUNITS/i.test(r)).length * 2) {
      const unita = /UUNITS\s*=\s*(INCHES|INCH)/i.test(testo) ? 'inch' : /UUNITS\s*=\s*MILS/i.test(testo) ? 'mil' : 'mm';
      const f = FATTORE[unita];
      return separaFiducial({ formato: 'Allegro (senza separatori)', unita, fiducial: [], avvisi,
        posizioni: trovate.map(m => ({ ref: m[1].toUpperCase(), valore: '', footprint: m[6], x: num(m[2]) * f, y: num(m[3]) * f, rot: normRot(num(m[4]) || 0),
          lato: m[5] ? 'BOT' as const : 'TOP' as const })) });
    }
  }

  // ── con intestazione (Altium, KiCad, generici) ──
  const sepDi = (r: string): ',' | ';' | '\t' | ' ' => {
    const conta = (c: string) => dividiRiga(r, c as any).length;
    if (r.includes('\t') && conta('\t') >= 4) return '\t';
    if (r.includes(';') && conta(';') >= 4) return ';';
    if (r.includes(',') && conta(',') >= 4) return ',';
    return ' ';
  };
  let unitaFile: 'mm' | 'mil' | 'inch' = /Units used:\s*mil/i.test(testo) ? 'mil' : /Unit\s*=\s*inch/i.test(testo) ? 'inch' : 'mm';
  for (let i = 0; i < Math.min(righe.length, 60); i++) {
    const grezza = righe[i].replace(/^\s*#+\s*/, '');
    if (!grezza.trim()) continue;
    const sep = sepDi(grezza);
    const intest = dividiRiga(grezza, sep);
    const ix = indiciColonne(intest);
    if (ix.ref < 0 || ix.x < 0 || ix.y < 0) continue;
    const unitaCol = unitaDaCol(intest[ix.x]);
    const unita = unitaCol ?? unitaFile;
    const f = FATTORE[unita];
    const posizioni: Posizione[] = [];
    for (const r of righe.slice(i + 1)) {
      if (!r.trim() || /^\s*#/.test(r)) continue;
      const c = dividiRiga(r, sepDi(r) === sep ? sep : sep);
      const x = num(c[ix.x]), y = num(c[ix.y]);
      if (!c[ix.ref] || !Number.isFinite(x) || !Number.isFinite(y)) continue;
      const latoTesto = ix.lato >= 0 ? c[ix.lato] : undefined;
      const mir = ix.mirror >= 0 ? String(c[ix.mirror]).toUpperCase() : '';
      posizioni.push({
        ref: c[ix.ref].toUpperCase(), valore: ix.valore >= 0 ? c[ix.valore] ?? '' : '', footprint: ix.footprint >= 0 ? c[ix.footprint] ?? '' : '',
        x: x * f, y: y * f, rot: normRot(num(c[ix.rot]) || 0),
        lato: leggiLato(latoTesto) ?? (mir ? (mir === 'YES' ? 'BOT' : 'TOP') : daNome.lato),
        ...(ix.codice >= 0 && c[ix.codice] ? { codice: c[ix.codice] } : {}),
        ...(daNome.tht ? { tht: true } : {}),
      });
    }
    if (!posizioni.length) continue;
    const formato = /Altium/i.test(testo) ? 'Altium' : /KiCad/i.test(testo) ? 'KiCad' : 'Tabella con intestazione';
    if (posizioni.some(p => p.lato == null)) avvisi.push('Il file non dice il lato di alcuni componenti: considerati sul lato del nome del file o TOP.');
    return separaFiducial({ formato, unita, posizioni: posizioni.map(p => ({ ...p, lato: p.lato ?? daNome.lato ?? 'TOP' })), fiducial: [], avvisi });
  }

  // ── file "centri" con lato e unità su ogni riga: "U23 0.7875 0.625 1 270 IN 2000250 1587500" (Control Systems, M0929-C 29/10/2026):
  //    X, Y, lato (1 = TOP, 2 = BOT), rotazione, unità (IN, MM, MIL), poi le stesse coordinate in centomillesimi di mm ──
  const RE_CENTRI = /^\s*([A-Z]{1,6}_?\d+[A-Z]?)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+([12])\s+(-?[\d.]+)\s+(IN|INCH|MM|MIL|MILS)\b/i;
  const centri = righe.map(r => RE_CENTRI.exec(r)).filter((m): m is RegExpExecArray => !!m);
  if (centri.length >= 2 && centri.length * 3 >= righe.filter(r => r.trim()).length * 2) {
    const u = centri[0][6].toUpperCase();
    const unitaC: 'mm' | 'mil' | 'inch' = u.startsWith('IN') ? 'inch' : u.startsWith('MIL') ? 'mil' : 'mm';
    const fc = FATTORE[unitaC];
    return separaFiducial({ formato: 'Centri (riferimento, X, Y, lato, rotazione, unità)', unita: unitaC, fiducial: [], avvisi,
      posizioni: centri.map(m => ({ ref: m[1].toUpperCase(), valore: '', footprint: '', x: num(m[2]) * fc, y: num(m[3]) * fc, rot: normRot(num(m[5])),
        lato: m[4] === '2' ? 'BOT' as const : 'TOP' as const, ...(daNome.tht ? { tht: true } : {}) })) });
  }

  // ── senza intestazione: "REF; testo; X; Y; ROT; [codice]" (es. Selea) ──
  const posizioni: Posizione[] = [];
  for (const r of righe) {
    if (!r.trim()) continue;
    const sep = r.includes(';') ? ';' : r.includes('\t') ? '\t' : r.includes(',') ? ',' : ' ';
    const c = dividiRiga(r, sep);
    const iNum = c.map((v, k) => Number.isFinite(num(v)) ? k : -1).filter(k => k > 0);
    if (c.length < 4 || iNum.length < 3 || !/^[A-Z]{1,6}_?\d+[A-Z]?$/i.test(c[0])) continue;
    // le prime tre colonne numeriche consecutive: X, Y, rotazione
    const k = iNum.find((v, j) => iNum[j + 1] === v + 1 && iNum[j + 2] === v + 2);
    if (k == null) continue;
    const testoMezzo = c.slice(1, k).join(' ').trim();
    const [valore, ...resto] = testoMezzo.split(/\s+/);
    const codice = c.slice(k + 3).join(' ').trim();
    posizioni.push({ ref: c[0].toUpperCase(), valore: resto.length ? testoMezzo.slice(0, testoMezzo.lastIndexOf(' ')).trim() : valore ?? '',
      footprint: resto.length ? resto[resto.length - 1] : '', x: num(c[k]), y: num(c[k + 1]), rot: normRot(num(c[k + 2])),
      lato: daNome.lato ?? 'TOP', ...(codice ? { codice } : {}), ...(daNome.tht ? { tht: true } : {}) });
  }
  if (!posizioni.length) throw new Error('Non riconosco il formato del pick and place.');
  if (!daNome.lato && !daNome.tht) avvisi.push('Il file non ha il lato: componenti considerati sul TOP (il nome del file non dice top/bot).');
  return separaFiducial({ formato: 'Senza intestazione (lato dal nome del file)', unita: 'mm', posizioni, fiducial: [], avvisi });
}

/** I fiducial scritti come componenti (FID1, FD2…) vanno nell'elenco dei fiducial, non tra i componenti. */
function separaFiducial(l: LetturaPickPlace): LetturaPickPlace {
  // ponticelli a stagno e net tie (KiCad "SolderJumper", "NetTie"): solo rame, non si montano; si avvisa perché a volte vanno chiusi
  const ponticelli = l.posizioni.filter(p => /SOLDER_?JUMPER|NET_?TIE/i.test(p.footprint));
  if (ponticelli.length) l = { ...l, posizioni: l.posizioni.filter(p => !ponticelli.includes(p)),
    avvisi: [...l.avvisi, `Ponticelli a stagno (solo rame, non sono componenti): ${ponticelli.map(p => `${p.ref}${p.valore ? ` ${p.valore}` : ''}`).join(', ')}. Controllare se vanno chiusi.`] };
  const fid = l.posizioni.filter(p => RE_FIDUCIAL.test(p.ref) || /^FIDUCIAL/i.test(p.valore) || /^FIDUCIAL/i.test(p.footprint));
  if (!fid.length) return l;
  return { ...l, posizioni: l.posizioni.filter(p => !fid.includes(p)), fiducial: [...l.fiducial, ...fid.map(p => ({ x: p.x, y: p.y, lato: p.lato }))] };
}
