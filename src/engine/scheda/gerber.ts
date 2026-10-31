/**
 * Lettore Gerber (RS-274X, anche i file vecchi in coordinate incrementali e archi G74 come quelli PADS di Univac) → disegno SVG.
 * Fatto in casa perché le librerie gratuite sbagliano proprio i file più vecchi (provato il 27/10/2026).
 * Il disegno è in mm con l'asse Y verso l'alto (come nel CAD): chi lo mostra lo capovolge (scale(1,-1)).
 * I colori non sono nel disegno: gli oggetti usano "currentColor" e lo strato prende il colore dal foglio di stile;
 * le parti "in negativo" (polarità clear) hanno la classe "cancella" (colore del fondo scheda).
 * Nessun accesso al database.
 */
import { calcolaEspressione } from './espressioni-gerber.js';

export interface Riquadro { x0: number; y0: number; x1: number; y1: number }
export interface DisegnoGerber {
  defs: string;            // forme delle aperture (<g id="…">), da mettere dentro <defs>
  corpo: string;           // il disegno vero e proprio
  riquadro: Riquadro | null;
  oggetti: number;         // flash + tratti + regioni
  avvisi: string[];
  piazzole: Piazzola[];    // flash e piccole regioni in positivo: servono al controllo piazzole/case dei componenti
}
/** Piazzola: centro e misure (mm). "stimata" = forma di una macro, misurata con il cerchio che la contiene. */
export interface Piazzola { x: number; y: number; w: number; h: number; stimata?: boolean; tonda?: boolean }

interface Apertura { forma: string; raggio: number; tratto: number; quadrato: boolean; w: number; h: number; stimata?: boolean; tonda?: boolean } // forma = contenuto SVG centrato in 0,0

const f = (n: number) => String(Math.round(n * 1000) / 1000);
const pt = (x: number, y: number) => `${f(x)} ${f(y)}`;
const ruota = (x: number, y: number, gradi: number): [number, number] => {
  if (!gradi) return [x, y];
  const a = gradi * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return [x * c - y * s, x * s + y * c];
};
const poligono = (punti: [number, number][], clear: boolean) =>
  `<polygon points="${punti.map(([x, y]) => `${f(x)},${f(y)}`).join(' ')}"${clear ? ' class="cancella"' : ''}/>`;

/** Il testo è un Gerber? (formato e almeno un'apertura o un comando di disegno). */
export function sembraGerber(testo: string): boolean {
  // le aperture possono arrivare dopo molte macro (CAM350, maschera LPS 30/10/2026: oltre 20.000 caratteri di %AM)
  const t = testo.slice(0, 20000);
  return /%FS[LTD]?[AI]?X\d\dY\d\d/i.test(t) && (/%ADD\d+/.test(testo.slice(0, 1_000_000)) || /D0?[123]\*/.test(t));
}

/** Forma di una macro (%AM) con i parametri dell'apertura. */
function formaMacro(corpo: string[], parametri: number[], avvisi: Set<string>): { svg: string; raggio: number; w: number; h: number } {
  const v: Record<number, number> = {};
  parametri.forEach((p, k) => { v[k + 1] = p; });
  const parti: string[] = [];
  let raggio = 0;
  const misura = (x: number, y: number) => { raggio = Math.max(raggio, Math.hypot(x, y)); };
  // ingombro vero (solo le parti in positivo): serve a misurare le piazzole disegnate con le macro (es. PADS, rettangoli ruotati)
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  const ingombro = (x: number, y: number, r = 0) => { bx0 = Math.min(bx0, x - r); by0 = Math.min(by0, y - r); bx1 = Math.max(bx1, x + r); by1 = Math.max(by1, y + r); };
  for (const istr of corpo) {
    const t = istr.trim();
    if (!t || /^0(\s|$)/.test(t)) continue; // commento della macro
    const def = /^\$(\d+)\s*=\s*(.+)$/.exec(t);
    if (def) { v[Number(def[1])] = calcolaEspressione(def[2], v); continue; }
    const a = t.split(',').map(x => x.trim()).filter(x => x !== '');
    if (!a.length) continue;
    const codice = Number(a[0]);
    const n = (k: number) => calcolaEspressione(a[k] ?? '0', v);
    try {
      if (codice === 1) { // cerchio: esposizione, diametro, x, y [, rotazione]
        const clear = n(1) === 0, d = n(2), [cx, cy] = ruota(n(3), n(4), a.length > 5 ? n(5) : 0);
        parti.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(d / 2)}"${clear ? ' class="cancella"' : ''}/>`); misura(Math.abs(cx) + d / 2, Math.abs(cy) + d / 2);
        if (!clear) ingombro(cx, cy, d / 2);
      } else if (codice === 20 || codice === 2) { // linea: esposizione, larghezza, x1, y1, x2, y2, rotazione
        const clear = n(1) === 0, w = n(2), x1 = n(3), y1 = n(4), x2 = n(5), y2 = n(6), rot = n(7);
        const lung = Math.hypot(x2 - x1, y2 - y1) || 1e-9, nx = -(y2 - y1) / lung * w / 2, ny = (x2 - x1) / lung * w / 2;
        const pp = ([[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x1 - nx, y1 - ny]] as [number, number][]).map(([x, y]) => ruota(x, y, rot));
        pp.forEach(([x, y]) => { misura(x, y); if (!clear) ingombro(x, y); }); parti.push(poligono(pp, clear));
      } else if (codice === 21 || codice === 22) { // rettangolo dal centro (21) o dall'angolo in basso a sinistra (22)
        const clear = n(1) === 0, w = n(2), h = n(3), x = n(4), y = n(5), rot = n(6);
        const [cx, cy] = codice === 21 ? [x, y] : [x + w / 2, y + h / 2];
        const pp = ([[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]] as [number, number][]).map(([px, py]) => ruota(px, py, rot));
        pp.forEach(([px, py]) => { misura(px, py); if (!clear) ingombro(px, py); }); parti.push(poligono(pp, clear));
      } else if (codice === 4) { // contorno: esposizione, n vertici, x0, y0, … , rotazione
        const clear = n(1) === 0, k = Math.round(n(2)), pp: [number, number][] = [];
        const rot = n(3 + 2 * (k + 1));
        for (let j = 0; j <= k; j++) pp.push(ruota(n(3 + 2 * j), n(4 + 2 * j), rot));
        pp.forEach(([x, y]) => { misura(x, y); if (!clear) ingombro(x, y); }); parti.push(poligono(pp, clear));
      } else if (codice === 5) { // poligono regolare: esposizione, vertici, x, y, diametro, rotazione
        const clear = n(1) === 0, k = Math.max(3, Math.round(n(2))), cx = n(3), cy = n(4), d = n(5), rot = n(6), pp: [number, number][] = [];
        for (let j = 0; j < k; j++) { const ang = 2 * Math.PI * j / k; pp.push(ruota(cx + Math.cos(ang) * d / 2, cy + Math.sin(ang) * d / 2, rot)); }
        pp.forEach(([x, y]) => { misura(x, y); if (!clear) ingombro(x, y); }); parti.push(poligono(pp, clear));
      } else if (codice === 6 || codice === 7) { // moiré e termico: disegnati come anello pieno (basta per vedere la piazzola)
        const [cx, cy] = ruota(n(1), n(2), 0), d = n(3);
        parti.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(d / 2)}"/>`); misura(Math.abs(cx) + d / 2, Math.abs(cy) + d / 2);
      } else if (codice !== 0) avvisi.add(`Primitiva di macro ${codice} non disegnata.`);
    } catch { avvisi.add('Una macro ha un\'espressione non leggibile: forma saltata.'); }
  }
  return { svg: parti.join(''), raggio, w: Number.isFinite(bx0) ? bx1 - bx0 : 0, h: Number.isFinite(by0) ? by1 - by0 : 0 };
}

export function leggiGerber(testo: string, prefisso = 'g'): DisegnoGerber {
  const avvisi = new Set<string>();
  // formato numeri
  let intere = 2, decimali = 4, zeriIniziali = true /* L: si omettono gli zeri iniziali */, incrementale = false;
  let fattore = 25.4; // pollici finché il file non dice MOMM
  const macro = new Map<string, string[]>();
  const aperture = new Map<string, Apertura>();
  const defs: string[] = [], corpo: string[] = [];
  let riq: Riquadro | null = null;
  const allarga = (x: number, y: number, r = 0) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    riq = riq ? { x0: Math.min(riq.x0, x - r), y0: Math.min(riq.y0, y - r), x1: Math.max(riq.x1, x + r), y1: Math.max(riq.y1, y + r) } : { x0: x - r, y0: y - r, x1: x + r, y1: y + r };
  };
  let x = 0, y = 0, ap: Apertura | null = null, apId = '', interp = 1, quadranteSingolo = true, op = 2, clear = false, regione = false;
  let contorni: string[] = [], contorno = '';
  const piazzole: Piazzola[] = [];
  let rr: Riquadro | null = null; // riquadro della regione in corso (le regioni piccole sono piazzole, es. Altium)
  const allargaRegione = (px: number, py: number) => { rr = rr ? { x0: Math.min(rr.x0, px), y0: Math.min(rr.y0, py), x1: Math.max(rr.x1, px), y1: Math.max(rr.y1, py) } : { x0: px, y0: py, x1: px, y1: py }; };
  let tratto = { id: '', clear: false, d: '' }; // tratti consecutivi con la stessa apertura in un unico <path>
  let oggetti = 0;

  const chiudiTratto = () => {
    if (tratto.d) {
      const a = aperture.get(tratto.id);
      corpo.push(`<path d="${tratto.d}" fill="none" stroke="currentColor" stroke-width="${f(Math.max(a?.tratto ?? 0.1, 0.02))}" stroke-linecap="${a?.quadrato ? 'square' : 'round'}" stroke-linejoin="round"${tratto.clear ? ' class="cancella"' : ''}/>`);
    }
    tratto = { id: '', clear: false, d: '' };
  };
  const valore = (s: string) => {
    if (s.includes('.')) return Number(s) * fattore;
    const segno = s.startsWith('-') ? -1 : 1, cifre = s.replace(/^[+-]/, '');
    const tutte = zeriIniziali ? cifre : cifre.padEnd(intere + decimali, '0');
    return segno * Number(tutte) / 10 ** decimali * fattore;
  };
  /** Comando SVG dell'arco da (x0,y0) a (x1,y1) con centro relativo i,j. */
  const arco = (x0: number, y0: number, x1: number, y1: number, i: number, j: number, orario: boolean): string => {
    let cx: number, cy: number;
    if (quadranteSingolo) { // G74: segni di I e J da indovinare, arco al massimo di 90°
      let migliore = Infinity; cx = x0 + i; cy = y0 + j;
      for (const [si, sj] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const ccx = x0 + si * Math.abs(i), ccy = y0 + sj * Math.abs(j);
        const err = Math.abs(Math.hypot(x0 - ccx, y0 - ccy) - Math.hypot(x1 - ccx, y1 - ccy));
        let span = Math.atan2(y1 - ccy, x1 - ccx) - Math.atan2(y0 - ccy, x0 - ccx);
        if (orario) span = -span;
        span = (span % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
        const pen = err + (span > Math.PI / 2 + 1e-3 ? 1000 : 0);
        if (pen < migliore) { migliore = pen; cx = ccx; cy = ccy; }
      }
    } else { cx = x0 + i; cy = y0 + j; }
    const r = Math.hypot(x0 - cx, y0 - cy);
    { // ingombro: punti lungo l'arco (non tutto il cerchio: gli archi quasi dritti hanno raggi enormi)
      const a0 = Math.atan2(y0 - cy, x0 - cx);
      let sp = Math.atan2(y1 - cy, x1 - cx) - a0;
      if (orario) sp = -sp;
      sp = (sp % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) || 2 * Math.PI;
      for (let k = 1; k <= 8; k++) { const a = a0 + (orario ? -1 : 1) * sp * k / 8; allarga(cx + r * Math.cos(a), cy + r * Math.sin(a)); }
    }
    const sweep = orario ? 0 : 1;
    if (Math.hypot(x1 - x0, y1 - y0) < 1e-6) { // cerchio intero (solo G75): due mezzi archi
      if (quadranteSingolo || r < 1e-9) return '';
      const mx = 2 * cx - x0, my = 2 * cy - y0;
      return `A${f(r)} ${f(r)} 0 0 ${sweep} ${pt(mx, my)}A${f(r)} ${f(r)} 0 0 ${sweep} ${pt(x1, y1)}`;
    }
    let span = Math.atan2(y1 - cy, x1 - cx) - Math.atan2(y0 - cy, x0 - cx);
    if (orario) span = -span;
    span = (span % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    return `A${f(r)} ${f(r)} 0 ${span > Math.PI ? 1 : 0} ${sweep} ${pt(x1, y1)}`;
  };

  const comandoEsteso = (c: string) => {
    let m: RegExpExecArray | null;
    if ((m = /^FS([LTD]?)([AI]?)N?\d*G?\d*X(\d)(\d)Y(\d)(\d)/.exec(c))) {
      zeriIniziali = m[1] !== 'T'; incrementale = m[2] === 'I'; intere = Number(m[3]); decimali = Number(m[4]);
    } else if (c.startsWith('MOMM')) fattore = 1;
    else if (c.startsWith('MOIN')) fattore = 25.4;
    else if (c.startsWith('LPC')) { chiudiTratto(); clear = true; }
    else if (c.startsWith('LPD')) { chiudiTratto(); clear = false; }
    else if ((m = /^ADD(\d+)([A-Za-z_$.][\w.$\-]*)(?:,(.*))?$/.exec(c))) {
      const [, id, tipo, resto] = m;
      const p = (resto ?? '').split('X').map(s => Number(s)).filter(Number.isFinite).map(n => n * fattore);
      const nomeDef = `${prefisso}-a${id}`;
      let forma = '', raggio = 0, trattoW = 0.1, quadrato = false, w = 0, h = 0, stimata = false;
      if (tipo === 'C') { forma = `<circle r="${f((p[0] ?? 0) / 2)}"/>`; raggio = (p[0] ?? 0) / 2; trattoW = p[0] ?? 0; w = h = p[0] ?? 0; }
      else if (tipo === 'R') { [w = 0, h = 0] = p; forma = `<rect x="${f(-w / 2)}" y="${f(-h / 2)}" width="${f(w)}" height="${f(h)}"/>`; raggio = Math.hypot(w, h) / 2; trattoW = Math.min(w, h); quadrato = true; }
      else if (tipo === 'O') { [w = 0, h = 0] = p; forma = `<rect x="${f(-w / 2)}" y="${f(-h / 2)}" width="${f(w)}" height="${f(h)}" rx="${f(Math.min(w, h) / 2)}"/>`; raggio = Math.max(w, h) / 2; trattoW = Math.min(w, h); }
      else if (tipo === 'P') {
        const d = p[0] ?? 0, k = Math.max(3, Math.round((p[1] ?? 3 * fattore) / fattore)), rot = (p[2] ?? 0) / fattore, pp: [number, number][] = [];
        for (let j = 0; j < k; j++) { const a = 2 * Math.PI * j / k + rot * Math.PI / 180; pp.push([Math.cos(a) * d / 2, Math.sin(a) * d / 2]); }
        forma = poligono(pp, false); raggio = d / 2; trattoW = d; w = h = d;
      } else if (macro.has(tipo)) {
        // i parametri delle macro sono nelle unità del file: si scala la forma intera
        const grezzi = (resto ?? '').split('X').map(s => Number(s)).filter(Number.isFinite);
        const r = formaMacro(macro.get(tipo)!, grezzi, avvisi);
        forma = fattore === 1 ? r.svg : `<g transform="scale(${fattore})">${r.svg}</g>`; raggio = r.raggio * fattore; trattoW = raggio; w = r.w * fattore; h = r.h * fattore;
        // con moiré/termici o forme non centrate la misura è solo indicativa
        stimata = !r.w || macro.get(tipo)!.some(x => /^[67],/.test(x.trim()));
      } else avvisi.add(`Apertura ${tipo} sconosciuta: disegnata come punto.`);
      defs.push(`<g id="${nomeDef}">${forma}</g>`);
      aperture.set(id, { forma: nomeDef, raggio, tratto: trattoW, quadrato, w, h, ...(stimata ? { stimata } : {}), ...(tipo === 'C' || tipo === 'P' ? { tonda: true } : {}) });
    } else if (c.startsWith('SR') && c !== 'SR' && !/^SRX1Y1/.test(c)) avvisi.add('Il file ha una ripetizione (step & repeat): disegnata una volta sola.');
  };

  const comando = (cmd: string) => {
    let c = cmd.trim();
    if (!c || c.startsWith('G04') || c.startsWith('G4 ')) return;
    if (/^M0?2$/.test(c)) return;
    // vecchio stile: G54D10, G70/G71 (pollici / mm), G90/G91
    c = c.replace(/^G54/, '').replace(/^G55/, '');
    if (/^G70/.test(c)) { fattore = 25.4; c = c.slice(3); }
    if (/^G71/.test(c)) { fattore = 1; c = c.slice(3); }
    if (/^G90/.test(c)) { incrementale = false; c = c.slice(3); }
    if (/^G91/.test(c)) { incrementale = true; c = c.slice(3); }
    let m: RegExpExecArray | null;
    while ((m = /^G0?(\d+)/.exec(c))) {
      const g = Number(m[1]);
      if (g === 1 || g === 2 || g === 3) interp = g;
      else if (g === 74) quadranteSingolo = true;
      else if (g === 75) quadranteSingolo = false;
      else if (g === 36) { chiudiTratto(); regione = true; contorni = []; contorno = ''; rr = null; }
      else if (g === 37) {
        if (contorno) contorni.push(contorno);
        if (contorni.length) { corpo.push(`<path d="${contorni.join('')}" fill="currentColor"${clear ? ' class="cancella"' : ''}/>`); oggetti++; }
        const q = rr as Riquadro | null;
        if (q && !clear && contorni.length === 1 && q.x1 - q.x0 < 8 && q.y1 - q.y0 < 8)
          piazzole.push({ x: (q.x0 + q.x1) / 2, y: (q.y0 + q.y1) / 2, w: q.x1 - q.x0, h: q.y1 - q.y0 });
        regione = false; contorni = []; contorno = '';
      }
      c = c.slice(m[0].length);
    }
    if (!c) return;
    const sel = /^D(\d+)$/.exec(c);
    if (sel && Number(sel[1]) >= 10) { apId = sel[1]; ap = aperture.get(apId) ?? null; return; }
    const cx = /X([+-]?[\d.]+)/.exec(c), cy = /Y([+-]?[\d.]+)/.exec(c), ci = /I([+-]?[\d.]+)/.exec(c), cj = /J([+-]?[\d.]+)/.exec(c), cd = /D0?([123])\b/.exec(c);
    if (cd) op = Number(cd[1]);
    if (!cx && !cy && !cd) return;
    const nx = cx ? (incrementale ? x + valore(cx[1]) : valore(cx[1])) : x;
    const ny = cy ? (incrementale ? y + valore(cy[1]) : valore(cy[1])) : y;
    const i = ci ? valore(ci[1]) : 0, j = cj ? valore(cj[1]) : 0;
    if (regione) {
      if (op === 2) { if (contorno) contorni.push(contorno); contorno = `M${pt(nx, ny)}`; allargaRegione(nx, ny); }
      else if (op === 1) {
        if (!contorno) { contorno = `M${pt(x, y)}`; allargaRegione(x, y); }
        allargaRegione(nx, ny);
        contorno += interp === 1 ? `L${pt(nx, ny)}` : arco(x, y, nx, ny, i, j, interp === 2);
        allarga(nx, ny);
      }
    } else if (op === 1) {
      if (!ap && !apId) { /* tratto senza apertura: si ignora */ }
      else {
        if (tratto.id !== apId || tratto.clear !== clear) { chiudiTratto(); tratto = { id: apId, clear, d: '' }; }
        tratto.d += `M${pt(x, y)}` + (interp === 1 ? `L${pt(nx, ny)}` : arco(x, y, nx, ny, i, j, interp === 2));
        const r = (ap?.tratto ?? 0) / 2;
        allarga(x, y, r); allarga(nx, ny, r); oggetti++;
      }
    } else if (op === 3 && ap) {
      chiudiTratto();
      corpo.push(`<use href="#${ap.forma}" x="${f(nx)}" y="${f(ny)}"${clear ? ' class="cancella"' : ''}/>`);
      allarga(nx, ny, ap.raggio); oggetti++;
      if (!clear && ap.w > 0) piazzole.push({ x: nx, y: ny, w: ap.w, h: ap.h, ...(ap.stimata ? { stimata: true } : {}), ...(ap.tonda ? { tonda: true } : {}) });
    }
    x = nx; y = ny;
  };

  // lettura: blocchi %…% (comandi estesi, anche più di uno) e comandi normali chiusi da "*"
  const t = testo.replace(/\r/g, '');
  let k = 0;
  while (k < t.length) {
    if (t[k] === '%') {
      const fine = t.indexOf('%', k + 1);
      const blocco = t.slice(k + 1, fine < 0 ? t.length : fine).replace(/\n/g, '');
      k = fine < 0 ? t.length : fine + 1;
      if (blocco.startsWith('AM')) { // macro: nome e istruzioni separate da "*"
        const [testa, ...istr] = blocco.split('*');
        macro.set(testa.slice(2).trim(), istr.map(s => s.trim()).filter(Boolean));
        continue;
      }
      for (const c of blocco.split('*')) if (c.trim()) comandoEsteso(c.trim());
    } else {
      const stella = t.indexOf('*', k), perc = t.indexOf('%', k);
      if (perc >= 0 && (stella < 0 || perc < stella)) { k = perc; continue; } // inizia un blocco esteso
      const fine = stella < 0 ? t.length : stella;
      comando(t.slice(k, fine).replace(/\n/g, ''));
      k = fine + 1;
    }
  }
  chiudiTratto();
  if (regione && contorno) corpo.push(`<path d="${[...contorni, contorno].join('')}" fill="currentColor"/>`);
  return { defs: defs.join(''), corpo: corpo.join(''), riquadro: riq, oggetti, avvisi: [...avvisi], piazzole };
}
