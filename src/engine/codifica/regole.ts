/**
 * Regole di codifica dei componenti Casteltech (portate dal programma "Codifica componenti", core/regole.py).
 *  - Codice di PRODUZIONE (armadio Essegi): formule del file CODICI_COMPONENTI_CASTELTECH.xlsx
 *    (SIGLA-campo-campo-..., massimo 30 caratteri), es. RS-0603-2K2-1-100MW.
 *  - Codice GESTIONALE (Moka): codifica A, T FF-CCCC-VVVVV-PPP, 18 caratteri, es. SRS-0603-2K20F-001.
 * Traduzione fedele del Python: tools/verifica-codifica.ts confronta i risultati sul database dei componenti.
 * Nessun accesso al database: il progressivo finale lo assegna il database (src/server/codifica-servizio.ts).
 */

export const OK = 'OK', VER = 'DA VERIFICARE', MAN = 'MANUALE';
export type Stato = typeof OK | typeof VER | typeof MAN;

// ───────────────────────────── utilità "alla Python" ─────────────────────────────
/** round() di Python: metà verso il pari quando il valore è esattamente a metà. */
export function pyRound(x: number, nd = 0): number {
  const p = 10 ** nd;
  const y = x * p;
  const f = Math.floor(y);
  const r = y - f === 0.5 ? (f % 2 === 0 ? f : f + 1) : Math.round(y);
  return r / p;
}
/** formato '%g' di Python (6 cifre significative, senza zeri finali). */
export function fmtG(x: number): string {
  if (x === 0) return '0';
  if (!Number.isFinite(x)) return String(x);
  const e = Math.floor(Math.log10(Math.abs(x)));
  let s: string;
  if (e < -4 || e >= 6) {
    s = x.toExponential(5).replace(/\.?0+e/, 'e');
    const m = s.match(/e([+-])(\d+)$/)!;
    s = s.replace(/e[+-]\d+$/, `e${m[1]}${m[2].padStart(2, '0')}`);
    return s;
  }
  s = x.toPrecision(6);
  if (s.includes('e')) s = Number(s).toString();
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}
const toFixed = (x: number, d: number) => {
  // come f'{x:.{d}f}' di Python (che arrotonda il valore binario esatto: toFixed di JS fa lo stesso tranne i pareggi esatti)
  const r = pyRound(x, d);
  return r.toFixed(d);
};
const soloCifre = (s: string) => /^\d+$/.test(s);
const zfill = (s: string, n: number) => s.padStart(n, '0');

// ───────────────────────────── tabelle ─────────────────────────────
export const TOL: Record<string, string> = { '0.1': 'B', '0.25': 'C', '025': 'C', '0.5': 'D', '1': 'F', '2': 'G', '5': 'J', '10': 'K', '20': 'M' };
const VOLT: [number, string][] = [[2.5, 'A'], [4, 'B'], [6.3, 'C'], [10, 'D'], [16, 'E'], [25, 'F'], [35, 'G'], [50, 'H'], [63, 'J'], [100, 'K'],
  [200, 'L'], [250, 'M'], [400, 'N'], [450, 'P'], [500, 'R'], [630, 'S'], [1000, 'T'], [2000, 'U'], [3000, 'V']];
export const COLORI: Record<string, string> = { ROSSO: 'ROS', VERDE: 'VER', BLU: 'BLU', GIALLO: 'GIA', ARANCIONE: 'ARA', BIANCO: 'BIA',
  NERO: 'NER', GRIGIO: 'GRI', IR: 'IRR', RGB: 'RGB' };
const COLORI_NUOVI: Record<string, string> = { AMBRA: 'AMB', 'ROSSO-VERDE': 'BIC', 'ROSSO-VERDE-B.': 'TRI' };

const CASE_FIX: Record<string, string> = {
  // chip
  '01005': '1005', '0201': '0201', '0402': '0402', '0603': '0603', '603': '0603', '0805': '0805', '1206': '1206',
  '1210': '1210', '1812': '1812', '2010': '2010', '2512': '2512', '2917': '2917', '2312': '2312', '1020': '1020',
  '3521': '3521', '1206L': '1206',
  // SOT / SC
  SOT23: 'T023', SOT233: 'T023', SOT23A: 'T023', TO236AB: 'T023', SOT3233: 'T323',
  SOT235: 'T235', SOT25: 'T235', SOT753: 'T235', '5TSOT': 'T235',
  SOT236: 'T236', TSOT236: 'T236', TSOP6: 'T236',
  SOT223: 'T223', SOT2234: 'T223', SC73: 'T223',
  SOT323: 'T323', SOT363: 'T363', '6TSSOP': 'T363', SC705: 'T353', '5TSSOP': 'T353',
  SOT89: 'T089', SOT893: 'T089', TO243AA: 'T089', SOT523: 'T523', SOT665: 'T665', SOT143B: 'T143',
  // SOD
  SOD123: 'D123', SOD1232: 'D123', SOD123F: 'D12F', SOD123HE: 'D12H', SOD323: 'D323', SOD523: 'D523',
  SOD80: 'D080', SOD80C: 'D080', SOD923: 'D923', SOD128: 'D128', SOD106: 'D106', SOD882: 'D882',
  // diodi potenza
  SMA: 'SMA0', DO214AC: 'SMA0', SMB: 'SMB0', DO214AA: 'SMB0', SMC: 'SMC0', DO214AB: 'SMC0',
  SMAF: 'SMAF', SMAFLAT: 'SMAF', DO213AB: 'MELF', DO220AA: 'SMP0', MICROSMP: 'MSMP',
  // potenza
  DPAK: 'DPAK', DPACK: 'DPAK', D2PAK: 'D2PK', D2PACK: 'D2PK', TO263: 'D2PK', TO2633: 'D2PK',
  TO2635: 'D2P5', TO2637: 'D2P7', D2PAK7: 'D2P7', TO2638: 'D2P8', TO2525: 'DPK5',
  SO8: 'SO08', SOIC8: 'SO08', '8SO': 'SO08', '16SO': 'SO16', SO4: 'SO04', '4SOP': 'SO04',
  DFN8: 'DN08', TSSOP16: 'TS16',
  SC70: 'T323', SOT26: 'T236', TSOT26: 'T236', SOT353: 'T353', SOT238: 'T238', SOT666: 'T666',
  SOT143: 'T143', TSOP5: 'T235', '2220': '2220', '0612': '0612', '0804': '0804',
};
const CASE_VER: Record<string, [string, string]> = { // mappati ma da confermare
  QFP100: ['L100', 'QFP-100 generico trattato come LQFP-100'],
  SSOT3: ['T023', 'SuperSOT-3 trattato come SOT-23'],
  '2012': ['0805', '2012 interpretato come metrico (= 0805 pollici)'],
  '10USON': ['DN10', 'USON-10 trattato come famiglia DFN'],
  '4DSBGA': ['BG04', 'DSBGA-4 trattato come BGA'],
  '20WLCSP': ['WL20', 'WLCSP-20: nuova famiglia WL'],
  VFBGA98: ['BG98', 'VFBGA-98 trattato come BGA'],
  '24TFSOP': ['MS24', 'TFSOP trattato come famiglia MSOP'],
  '10TFSOP': ['MS10', 'TFSOP trattato come famiglia MSOP'],
  '3535L': ['3535', 'dimensione metrica 3,5x3,5 mm'],
  '0404': ['0404', 'dimensione LED da confermare'], '0606': ['0606', 'dimensione LED da confermare'],
  '1411': ['1411', 'dimensione LED da confermare'], '1410': ['1410', 'dimensione LED da confermare'],
  SMD3215: ['3215', 'dimensione metrica 3,2x1,5 mm'],
  '1050': ['1050', 'serie/dimensione induttanza da confermare'], '5050': ['5050', 'serie/dimensione induttanza da confermare'],
  '2321': ['2321', 'serie/dimensione induttanza da confermare'], '6045': ['6045', 'serie/dimensione induttanza da confermare'],
  '1616': ['1616', 'serie/dimensione induttanza da confermare'], '5353': ['5353', 'serie/dimensione induttanza da confermare'],
  '2323': ['2323', 'serie/dimensione induttanza da confermare'], '1212': ['1212', 'serie/dimensione induttanza da confermare'],
  '0504': ['0504', 'serie/dimensione induttanza da confermare'],
  SO8L: ['SO08', 'SO-8L (potenza) trattato come SO-8'], SO16W: ['SO16', 'SO-16 wide trattato come SO-16'],
  '8MOSP': ['MS08', 'letto come MSOP-8'], SOCI14: ['SO14', 'letto come SOIC-14'], '24FTSOP': ['MS24', 'TFSOP trattato come MSOP'],
  SOT65: ['T665', 'letto come SOT-665'], '1611': ['1611', 'dimensione LED da confermare'],
};
const THT_CASE: Record<string, string> = { TO92: 'TO92', DO41: 'DO41', '6DIP': 'DP06', TO220: 'T220', TO220AB: 'T220', TO220A: 'T220' };
export const CNT: Record<string, string> = { BASETTA: 'BASE', PIN: 'PINS', PRESA: 'PRES', PRESO: 'PRES', MORSETTO: 'MORS', AUDIOJ: 'AUDJ', FCP: 'FCC0', FFC: 'FCC0',
  MICROUSB: 'USBM', USBMICRO: 'USBM', USBMINI: 'USBN', USBC: 'USBC', USBTYC: 'USBC', MODULAR: 'MODU', PCIEXP: 'PCIE', MINIPCI: 'MPCI',
  SDCARD: 'SDCD', PC104: 'P104', PWJACK: 'PWJK', SPINAF: 'SPIN', PONTE: 'PONT', VITE: 'VITE', COASSIALE: 'COAX', HDMI: 'HDMI',
  VERTICALE: 'BASE', MOSET: 'MORS', SMD: 'BASE', STRIP: 'PINS', RJ45: 'RJ45', RJ11: 'RJ11', ZOCCOLO: 'ZOCC', FCC: 'FCC0', FPC: 'FCC0',
  RCPT: 'PRES', USBA: 'USBA', USBB: 'USBB', USBAB: 'USAB', BAS: 'BASE' };
const IC_FAM: Record<string, string> = { SOIC: 'SO', SO: 'SO', TSSOP: 'TS', SSOP: 'SS', QSOP: 'QS', MSOP: 'MS', QFN: 'QN', VFQFN: 'QN',
  SQFN: 'QN', XQFN: 'QN', STQFN: 'QN', DFN: 'DN', WFDFN: 'DN', WDFN: 'DN', XFDFN: 'DN', UDFN: 'DN',
  LQFP: 'LQ', TQFP: 'TQ',
  WQFN: 'QN', VQFN: 'QN', UQFN: 'QN', TFQFN: 'QN', TQFN: 'QN', VFQFPN: 'QN', UFQFN: 'QN',
  VSSOP: 'MS', SOP: 'SO', LGA: 'LG', VFDFN: 'DN', TDFN: 'DN', XDFN: 'DN', UFDN: 'DN',
  BGA: 'BG', HTSSOP: 'TS', TSOP: 'TP' };
const IC_BIG: Record<string, string> = { LQ: 'L', TQ: 'Q', SO: 'S', QN: 'N', BG: 'B', LG: 'G', TP: 'P', DN: 'D', TS: 'T', MS: 'M', SS: 'S', QS: 'Q' };

type Case = [codice: string | null, tecnologia: string | null, stato: Stato, nota: string];

export function caseLookup(raw: unknown): Case {
  if (raw == null) return [null, null, MAN, 'formato/case non indicato'];
  const c = String(raw).replace(/[\s\-]/g, '').toUpperCase().replace(/ /g, '');
  if (c === '' || c === 'NONE') return [null, null, MAN, 'formato/case non indicato'];
  if (c in CASE_FIX) return [CASE_FIX[c], 'S', OK, ''];
  if (c in THT_CASE) return [THT_CASE[c], 'T', OK, ''];
  if (c in CASE_VER) return [CASE_VER[c][0], 'S', VER, CASE_VER[c][1]];
  const m = c.match(/^(\d+)([A-Z]+)$/) ?? c.match(/^([A-Z]+)(\d+)$/);
  if (m) {
    const [a, b] = [m[1], m[2]];
    const [n, f] = soloCifre(a) ? [a, b] : [b, a];
    if (f in IC_FAM) {
      const fam = IC_FAM[f], k = parseInt(n, 10);
      if (k < 100) return [`${fam}${zfill(String(k), 2)}`, 'S', OK, ''];
      return [`${IC_BIG[fam]}${k}`, 'S', OK, ''];
    }
  }
  return [null, null, MAN, `case "${raw}" non in tabella: da definire`];
}

// ───────────────────────────── valori ─────────────────────────────
const num = (s: string) => Number(s.replace(',', '.'));
type Tipo = 'R' | 'C' | 'H' | 'HZ' | 'V' | 'A';

/** Valore in unità base (ohm, farad, henry, hertz, volt, ampere) oppure null. */
export function parseValue(raw: unknown, kind: Tipo | string): number | null {
  if (raw == null) return null;
  let s = String(raw).trim().replace(/ /g, '').replace(/ /g, '');
  if (!s) return null;
  let mult: Record<string, number>;
  if (kind === 'R') {
    s = s.replace(/ohm/gi, 'R');
    mult = { m: 1e-3, R: 1, r: 1, K: 1e3, k: 1e3, M: 1e6, G: 1e9 };
    if (/[KkM]/.test(s) && 'Rr'.includes(s[s.length - 1]) && s.length > 1 && !'mM'.includes(s[s.length - 2])) s = s.slice(0, -1);
    if (/^\d+m[Rr]?$/.test(s) || /^\d+m\d+[Rr]?$/.test(s)) s = s.replace(/[Rr]+$/, '');
    s = /^[\d.,]+[Rr]$/.test(s) ? s.replace(/[Rr]+$/, '') : s;
  } else if (kind === 'C') {
    s = s.replace(/[Ff]/g, '');
    mult = { p: 1e-12, P: 1e-12, n: 1e-9, N: 1e-9, u: 1e-6, U: 1e-6, m: 1e-3, M: 1e-3 };
  } else if (kind === 'H') {
    s = s.replace(/[Hh]/g, '');
    mult = { n: 1e-9, N: 1e-9, u: 1e-6, U: 1e-6, m: 1e-3, M: 1e-3 };
  } else if (kind === 'HZ') {
    s = s.replace(/hz|z/gi, '');
    mult = { k: 1e3, K: 1e3, M: 1e6, m: 1e6, G: 1e9 };
  } else if (kind === 'V') {
    s = s.replace(/dc/gi, '');
    mult = { V: 1, v: 1, K: 1e3, k: 1e3 };
    if (/^[\d.,]+$/.test(s)) return pyNum(s);
    if (/^[\d.,]+[Vv]$/.test(s)) return pyNum(s.slice(0, -1));
    if (/^\d+[Kk][Vv]$/.test(s)) return pyNum(s.slice(0, -2)) * 1e3;
  } else if (kind === 'A') {
    if (/^[\d.,]+[mM][Aa]$/.test(s)) return pyNum(s.slice(0, -2)) * 1e-3;
    mult = { A: 1, a: 1 };
  } else return null;
  if (/^[\d.,]+$/.test(s)) return pyNum(s);
  let m = s.match(/^(\d*)([A-Za-z])(\d*)$/);
  if (m && m[2] in mult && (m[1] || m[3])) return pyNum((m[1] || '0') + (m[3] ? '.' + m[3] : '')) * mult[m[2]];
  m = s.match(/^([\d.,]+)([A-Za-z])$/);
  if (m && m[2] in mult) return pyNum(m[1]) * mult[m[2]];
  return null;
}
/** float() di Python: un testo non numerico (es. "1.2.3") fa fallire la conversione. */
function pyNum(s: string): number {
  const t = s.replace(',', '.');
  if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) throw new ErroreValore(s);
  return Number(t);
}
export class ErroreValore extends Error {}

/** Valore → 4 caratteri RKM; [testo, arrotondato]. */
export function rkm(v: number, prefissi: [number, string][]): [string, boolean] {
  if (v === 0) return ['0' + (prefissi.find(p => p[0] === 1) ?? prefissi[0])[1] + '00', false];
  let base = prefissi[prefissi.length - 1][0], lettera = prefissi[prefissi.length - 1][1], m = v / base;
  for (const [b, l] of prefissi) {
    const mm = v / b;
    if ((1 - 1e-9 <= mm && mm < 1000 - 1e-6) || (b === prefissi[0][0] && mm < 1)) { base = b; lettera = l; m = mm; break; }
  }
  let arrotondato = false, out: string;
  if (m < 1) {
    const txt = toFixed(m, 2);
    out = '0' + lettera + txt.slice(2, 4);
    arrotondato = Math.abs(Number(txt) - m) > 1e-9;
  } else {
    let ip = Math.trunc(m + 1e-9), cifre = String(ip).length;
    let dec = 3 - cifre;
    const r = pyRound(m, dec);
    if (r >= 10 ** cifre) { ip = Math.trunc(r); cifre = String(ip).length; dec = 3 - cifre; }
    arrotondato = Math.abs(r - m) > 1e-9 * Math.max(1, m);
    ip = Math.trunc(r + 1e-9);
    const frac = dec > 0 ? pyRound((r - ip) * 10 ** dec) : 0;
    out = String(ip) + lettera + (dec > 0 ? zfill(String(frac), dec) : '');
  }
  return [out.slice(0, 4).padEnd(4, '0'), arrotondato];
}

export const P_R: [number, string][] = [[1e-3, 'L'], [1, 'R'], [1e3, 'K'], [1e6, 'M'], [1e9, 'G']];
export const P_C: [number, string][] = [[1e-12, 'P'], [1e-9, 'N'], [1e-6, 'U'], [1e-3, 'M']];
export const P_H: [number, string][] = [[1e-9, 'N'], [1e-6, 'U'], [1e-3, 'M']];
export const P_HZ: [number, string][] = [[1, 'H'], [1e3, 'K'], [1e6, 'M'], [1e9, 'G']];

export function fmtRes(v: number): [string, boolean] {
  if (v >= 0.1 && v < 1) return ['0R' + toFixed(v, 2).slice(2, 4), Math.abs(pyRound(v, 2) - v) > 1e-12];
  return rkm(v, P_R);
}

/** V o A con una sola lettera. */
export function fmtSimple(v: number, lettera: string): [string | null, boolean] {
  if (v < 1) { const t = toFixed(v, 2); return ['0' + lettera + t.slice(2, 4), Math.abs(Number(t) - v) > 1e-12]; }
  let ip = Math.trunc(v + 1e-9); const d = String(ip).length;
  if (d >= 4) return [null, false];
  if (d === 3) return [`${ip}${lettera}`, Math.abs(ip - v) > 1e-9];
  const dec = 3 - d, r = pyRound(v, dec); ip = Math.trunc(r + 1e-9);
  const frac = pyRound((r - ip) * 10 ** dec);
  return [`${ip}${lettera}${zfill(String(frac), dec)}`, Math.abs(r - v) > 1e-9];
}

export function voltLetter(raw: unknown): [string | null, number | null] {
  const v = parseValue(raw, 'V');
  if (v == null) return [null, null];
  for (const [k, l] of VOLT) if (Math.abs(k - v) < 1e-6) return [l, v];
  return [null, v];
}

export function mpnRoot(pn: unknown): [string | null, boolean] {
  const s = String(pn).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!s) return [null, false];
  return [(s + 'XXXXX').slice(0, 5), s.length < 5];
}

// ───────────────────────────── famiglie ─────────────────────────────
export const ATTR = ['case', 'valore', 'tolleranza', 'tensione', 'dielettrico', 'potenza', 'corrente', 'dcr', 'colore', 'tipo', 'passo', 'poli', 'extra'] as const;
export type Attr = typeof ATTR[number];
export type Attributi = Partial<Record<Attr | 'tecnologia', string | null>>;

interface Famiglia { nome: string; breve: string; prod: (Attr | 'RID' | 'PN')[]; kind: Tipo | null }
/** 'RID' = codice ridotto dal P/N ; 'PN' = P/N così com'è (senza spazi) */
export const FAMIGLIE: Record<string, Famiglia> = {
  RS: { nome: 'Resistenze', breve: 'RES', prod: ['case', 'valore', 'tolleranza', 'potenza'], kind: 'R' },
  RR: { nome: 'Reti resistive', breve: 'RETE RES', prod: ['case', 'valore', 'tolleranza', 'potenza'], kind: 'R' },
  CC: { nome: 'Condensatori ceramici', breve: 'CAP CER', prod: ['case', 'valore', 'tolleranza', 'dielettrico', 'tensione'], kind: 'C' },
  CE: { nome: 'Condensatori elettrolitici', breve: 'CAP ELE', prod: ['case', 'valore', 'tolleranza', 'tensione'], kind: 'C' },
  CT: { nome: 'Condensatori tantalio', breve: 'CAP TANT', prod: ['case', 'valore', 'tolleranza', 'tensione'], kind: 'C' },
  ID: { nome: 'Induttanze', breve: 'IND', prod: ['case', 'valore', 'corrente', 'dcr'], kind: 'H' },
  FR: { nome: 'Ferriti', breve: 'FERRITE', prod: ['case', 'dcr', 'corrente', 'tolleranza', 'valore'], kind: 'R' },
  FS: { nome: 'Fusibili', breve: 'FUSIBILE', prod: ['case', 'corrente', 'tensione'], kind: null },
  DI: { nome: 'Diodi', breve: 'DIODO', prod: ['case', 'corrente', 'tensione', 'RID'], kind: null },
  DS: { nome: 'Diodi Schottky', breve: 'DIODO SCHOTTKY', prod: ['case', 'tensione', 'corrente', 'RID'], kind: null },
  DZ: { nome: 'Diodi zener', breve: 'ZENER', prod: ['case', 'potenza', 'valore'], kind: 'V' },
  DL: { nome: 'Diodi LED', breve: 'LED', prod: ['case', 'corrente', 'tensione', 'colore'], kind: null },
  IC: { nome: 'Circuiti integrati', breve: 'IC', prod: ['case', 'RID'], kind: null },
  TR: { nome: 'Transistor', breve: 'TRANSISTOR', prod: ['case', 'corrente', 'potenza', 'tensione', 'RID'], kind: null },
  TB: { nome: 'Transistor bipolari', breve: 'BJT', prod: ['case', 'corrente', 'tensione', 'tipo', 'RID'], kind: null },
  TM: { nome: 'Transistor MOSFET', breve: 'MOSFET', prod: ['case', 'corrente', 'tensione', 'tipo', 'RID'], kind: null },
  TS: { nome: 'Tiristori', breve: 'TIRISTORE', prod: ['case', 'tensione', 'corrente'], kind: null },
  SP: { nome: 'Soppressori', breve: 'TVS', prod: ['case', 'corrente', 'potenza', 'tensione'], kind: null },
  VR: { nome: 'Varistori', breve: 'VARISTORE', prod: ['case', 'tensione', 'RID'], kind: null },
  RL: { nome: 'Relè', breve: 'RELE', prod: ['case', 'tipo', 'PN'], kind: null },
  QZ: { nome: 'Quarzi', breve: 'QUARZO', prod: ['case', 'tolleranza', 'valore', 'tipo'], kind: 'HZ' },
  OS: { nome: 'Oscillatori', breve: 'OSCILLATORE', prod: ['case', 'tensione', 'valore'], kind: 'HZ' },
  RI: { nome: 'Risonatori', breve: 'RISONATORE', prod: ['case', 'extra', 'valore'], kind: 'HZ' },
  CN: { nome: 'Connettori', breve: 'CONN', prod: ['tipo', 'passo', 'poli', 'RID'], kind: null },
  TI: { nome: 'Terminali THT', breve: 'TERM THT', prod: ['tipo', 'passo', 'poli', 'RID'], kind: null },
  IT: { nome: 'Interruttori', breve: 'INTERRUTTORE', prod: ['tensione', 'RID'], kind: null },
  DW: { nome: 'Dip switch', breve: 'DIP SWITCH', prod: ['PN', 'corrente', 'tensione'], kind: null },
  MI: { nome: 'Miscellaneus', breve: 'MISC', prod: ['RID', 'tipo'], kind: null },
  TP: { nome: 'Transponder', breve: 'TRANSPONDER', prod: ['case', 'extra', 'valore', 'tipo', 'RID'], kind: 'HZ' },
  CV: { nome: 'Convertitori', breve: 'CONVERTITORE', prod: ['case', 'RID'], kind: null },
  PO: { nome: 'Potenziometri', breve: 'POT', prod: ['case', 'valore', 'RID'], kind: 'R' },
  FE: { nome: 'Filtri EMI', breve: 'FILTRO EMI', prod: ['case', 'RID'], kind: null },
  TF: { nome: 'Trasformatori', breve: 'TRASF', prod: ['case', 'RID'], kind: null },
};
export const ETICHETTE: Record<Attr, string> = { case: 'Case/Formato', valore: 'Valore', tolleranza: 'Tolleranza %', tensione: 'Tensione',
  dielettrico: 'Dielettrico', potenza: 'Potenza', corrente: 'Corrente', dcr: 'R serie (DCR)', colore: 'Colore', tipo: 'Tipo',
  passo: 'Passo', poli: 'Poli', extra: 'Altro parametro' };
export const PROD_MAX = 30;

// ───────────────────────────── formattazione stile codici di produzione (10K, 100NF, 6V3, 63MW...) ─────────────────────────────
function lf(m: number, lettera: string): string {
  const s = toFixed(m, 3).replace(/0+$/, '').replace(/\.$/, '');
  if (s.includes('.')) { const [a, b] = s.split('.'); return `${a}${lettera}${b}`; }
  return `${s}${lettera}`;
}

export function fmtProd(v: number | null, kind: string): string | null {
  if (v == null) return null;
  if (kind === 'R') {
    if (v === 0) return '0R';
    if (v < 1) return '0R' + toFixed(v, 3).split('.')[1].replace(/0+$/, '');
    for (const [b, l] of [[1e6, 'M'], [1e3, 'K'], [1, 'R']] as [number, string][]) if (v >= b) return lf(v / b, l);
  }
  if (kind === 'C' || kind === 'H') {
    const unita = kind === 'C' ? 'F' : 'H';
    for (const [b, l] of [[1e-3, 'M'], [1e-6, 'U'], [1e-9, 'N'], [1e-12, 'P']] as [number, string][]) if (v >= b * 0.9999) return lf(v / b, l) + unita;
    return lf(v / 1e-12, 'P') + unita;
  }
  if (kind === 'HZ') {
    for (const [b, l] of [[1e9, 'G'], [1e6, 'M'], [1e3, 'K'], [1, '']] as [number, string][]) if (v >= b) return lf(v / b, l || 'H') + (l ? 'HZ' : 'Z');
  }
  if (kind === 'V') {
    if (v >= 1000) return lf(v / 1000, 'K') + 'V';
    return lf(v, 'V');
  }
  if (kind === 'A') {
    if (v >= 1) return lf(v, 'A');
    return (v * 1000) % 1 ? lf(v * 1000, 'M') + 'A' : `${Math.trunc(pyRound(v * 1000))}MA`;
  }
  if (kind === 'W') {
    if (v >= 1) return lf(v, 'W');
    const mw = v * 1000;
    return Math.abs(mw - pyRound(mw)) < 1e-6 ? `${Math.trunc(pyRound(mw))}MW` : lf(mw, 'M').replace('M', 'MW');
  }
  return null;
}

export function parsePower(raw: unknown): number | null {
  if (raw == null) return null;
  const s = String(raw).trim().toUpperCase().replace(/ /g, '');
  let m = s.match(/^([\d.,]+)MW(\d*)$/);
  if (m) return pyNum(m[1].replace(',', '.') + (m[2] ? '.' + m[2] : '')) / 1000;
  m = s.match(/^(\d*)W(\d+)$/);
  if (m) return pyNum((m[1] || '0') + '.' + m[2]);
  m = s.match(/^([\d.,]+)W$/);
  if (m) return pyNum(m[1].replace(',', '.'));
  m = s.match(/^(\d+)\/(\d+)W$/);
  if (m) return parseInt(m[1], 10) / parseInt(m[2], 10);
  return null;
}

/** Porta un valore digitato/decodificato nello stile dei codici di produzione. */
export function normAttr(chiave: Attr, raw: unknown, fam: string): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s === '' || ['nan', 'none'].includes(s.toLowerCase())) return null;
  const up = s.toUpperCase().replace(/ /g, '');
  const kind = FAMIGLIE[fam]?.kind;
  const prova = <T>(f: () => T, altrimenti: T): T => { try { return f(); } catch (e) { if (e instanceof ErroreValore) return altrimenti; throw e; } };
  if (chiave === 'valore' && kind) {
    const v = prova(() => parseValue(kind !== 'V' ? s : up, kind), null);
    return v != null ? fmtProd(v, kind) : up;
  }
  if (chiave === 'tensione') {
    if (up.includes('@')) return up;
    const v = prova(() => parseValue(up, 'V'), null);
    return v != null ? fmtProd(v, 'V') : up;
  }
  if (chiave === 'corrente') {
    const v = prova(() => parseValue(up, 'A'), null);
    return v != null ? fmtProd(v, 'A') : up;
  }
  if (chiave === 'potenza') {
    const v = prova(() => parsePower(up), null);
    return v != null ? fmtProd(v, 'W') : up;
  }
  if (chiave === 'tolleranza') {
    const t = up.replace(/%/g, '').replace(/±/g, '').replace(/\+\/-/g, '').replace(',', '.');
    return /^[+-]?(\d+\.?\d*|\.\d+)(E[+-]?\d+)?$/.test(t) ? fmtG(Number(t)) : up;
  }
  if (chiave === 'dielettrico') return ({ NP0: 'C0G', COG: 'C0G', NPO: 'C0G', C0GNP0: 'C0G' } as Record<string, string>)[up] ?? up;
  if (chiave === 'case') {
    const c = up.replace(/[\s\-_]/g, '');
    const m = c.match(/^([A-Z]+)(\d+)$/);
    if (m && m[1] in IC_FAM && m[1] !== 'SO') return `${m[2]}${m[1]}`; // stile archivio: 14TSSOP, 16VQFN
    return c;
  }
  if (chiave === 'passo') { const p = passoCentesimi(up); return p ? zfill(String(p), 3) : up; }
  if (chiave === 'poli') { const m = up.match(/^0*(\d+)(\.0)?$/); return m ? m[1] : up; }
  return up;
}

/** '2.54' / '2,54mm' / '254' / '3M5' / '2' / '05' → centesimi di mm, oppure null */
export function passoCentesimi(raw: unknown): number | null {
  const s = String(raw ?? '').replace(/\s/g, '').toUpperCase().replace(/,/g, '.').replace(/MM/g, '');
  const f = (t: string) => { if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) throw new ErroreValore(t); return Number(t); };
  try {
    if (!s) return null;
    if (s.includes('M')) { const i = s.indexOf('M'); const x = s.slice(0, i), y = s.slice(i + 1); return pyRound(f(`${x || 0}.${y || 0}`) * 100); }
    if (s.includes('.')) return pyRound(f(s) * 100);
    if (!soloCifre(s)) return null;
    if (s.length === 3) return parseInt(s, 10);
    if (s.length === 1) return parseInt(s, 10) * 100;
    if (s.length === 2 && s[0] === '0') return parseInt(s[1], 10) * 10;
  } catch (e) { if (e instanceof ErroreValore) return null; throw e; }
  return null;
}

export function codiceRidotto(pn: unknown): string | null {
  if (!pn) return null;
  const s = String(pn).toUpperCase().split('/')[0].replace(/[^A-Z0-9.]/g, '');
  return s || null;
}

// ───────────────────────────── codice di produzione ─────────────────────────────
export function codiceProduzione(fam: string, a: Attributi, pn: unknown): [string | null, string[]] {
  const spec = FAMIGLIE[fam];
  if (!spec) return [null, [`famiglia ${fam} non prevista`]];
  const parti = [fam], mancanti: string[] = [];
  for (const k of spec.prod) {
    let v: string | null | undefined;
    if (k === 'RID') v = codiceRidotto(pn);
    else if (k === 'PN') v = pn ? String(pn).replace(/\s/g, '').toUpperCase() : null;
    else v = a[k];
    if (!v) { mancanti.push(k === 'RID' || k === 'PN' ? 'P/N' : ETICHETTE[k]); v = ''; }
    parti.push(String(v));
  }
  let codice = parti.join('-');
  if (codice.length > PROD_MAX) {
    const ultimo = spec.prod[spec.prod.length - 1];
    if (ultimo === 'RID' || ultimo === 'PN') codice = codice.slice(0, PROD_MAX - 1) + '.';
    else mancanti.push(`codice oltre ${PROD_MAX} caratteri`);
  }
  return [codice, mancanti];
}

// ───────────────────────────── codice gestionale (codifica A) ─────────────────────────────
function caseGest(fam: string, a: Attributi): Case {
  const cas = a.case; const cr = String(cas ?? '').replace(/[\s\-]/g, '').toUpperCase();
  if (fam === 'CN' || fam === 'TI') {
    const tipo = String(a.tipo ?? '').replace(/\s/g, '').toUpperCase();
    const tech = fam === 'TI' || cr === 'THT' ? 'T' : 'S';
    if (tipo in CNT) return [CNT[tipo], tech, OK, ''];
    return [null, tech, MAN, `tipo connettore "${a.tipo ?? 'None'}" non in tabella`];
  }
  if (!cr) return [null, null, MAN, 'case non indicato'];
  if (['THT', 'ASS', 'RAD'].includes(cr) && fam !== 'DL') return [null, 'T', MAN, 'componente THT: indicare il formato (passo/dimensione)'];
  if (fam === 'CE') {
    const m = cr.match(/^D?(\d+)(?:[.,](\d))?(?:X[\d.,]+)?$/);
    if (m) return [`E${zfill(String(parseInt(m[1], 10)), 2)}${m[2] || 0}`, 'S', OK, ''];
  }
  if (fam === 'ID') {
    const m = cr.match(/^(\d+)X(\d+)$/);
    if (m) return [`${zfill(String(parseInt(m[1], 10)), 2)}${zfill(String(parseInt(m[2], 10)), 2)}`, 'S', VER, 'induttanza in mm (LLWW)'];
  }
  if (fam === 'DL') {
    const m = cr.match(/^(?:RAD|T1|THT)?(?:D)?(\d)(?:MM)?$/);
    if (['RAD', 'T1', 'THT'].includes(cr) || (m && (cr.startsWith('RAD') || cr.startsWith('D')))) {
      const d = a.extra || (cr === 'T1' ? '3' : (m ? m[1] : null));
      if (d) return [`R${zfill(String(Math.trunc(Number(String(d).replace(',', '.')) * 10)), 3)}`, 'T', OK, ''];
      return [null, 'T', MAN, 'LED radiale: indicare il diametro in "Altro parametro"'];
    }
  }
  const r = caseLookup(cas);
  if (r[0] == null && /^\d{4}$/.test(cr)) return [cr, 'S', VER, `dimensione ${cr} non in tabella: usata così com'è`];
  return r;
}

export interface Radice { T: string; C: string | null; V: string | null; stato: Stato; note: string[] }

export function codiceGestionaleRadice(fam: string, a: Attributi, pn: unknown): Radice {
  const note: string[] = []; let stato: Stato = OK;
  const ordine: Record<Stato, number> = { [OK]: 0, [VER]: 1, [MAN]: 2 } as any;
  const flag = (st: Stato, n: string) => { if (n) note.push(n); if (ordine[st] > ordine[stato]) stato = st; };
  const [C, techCase, st, n] = caseGest(fam, a);
  flag(st, n);
  const tech = a.tecnologia || techCase || 'S';
  let V: string | null = null;
  const val = a.valore;
  const pv = (x: unknown, k: Tipo) => { try { return parseValue(x, k); } catch (e) { if (e instanceof ErroreValore) throw new ErroreValore(String(x)); throw e; } };
  if (['RS', 'RR', 'PO'].includes(fam)) {
    const v = pv(val, 'R');
    if (v == null) flag(MAN, 'valore mancante');
    else {
      const [s, rnd] = fmtRes(v);
      let t = TOL[String(a.tolleranza ?? '')];
      if (rnd) flag(VER, 'valore arrotondato a 3 cifre');
      if (!t) { t = 'X'; note.push('tolleranza non indicata: X'); }
      V = s + t;
    }
  } else if (['CC', 'CE', 'CT'].includes(fam)) {
    const v = pv(val, 'C');
    let [vl] = voltLetter(a.tensione);
    if (v == null) flag(MAN, 'capacità mancante');
    else {
      const [s, rnd] = rkm(v, P_C);
      if (rnd) flag(VER, 'valore arrotondato a 3 cifre');
      if (!vl) { vl = 'X'; flag(VER, 'tensione mancante o non in tabella: X'); }
      V = s + vl;
    }
  } else if (fam === 'ID') {
    const v = pv(val, 'H');
    if (v == null) flag(MAN, 'induttanza mancante'); else V = rkm(v, P_H)[0] + 'X';
  } else if (fam === 'FR') {
    const v = pv(val, 'R');
    if (v == null) flag(MAN, 'impedenza mancante'); else V = rkm(v, P_R)[0] + (String(a.tolleranza ?? '') === '20' ? 'M' : 'X');
  } else if (fam === 'DZ') {
    const v = pv(val, 'V');
    const s = v != null ? fmtSimple(v, 'V')[0] : null;
    if (!s) flag(MAN, 'tensione zener mancante'); else V = s + 'X';
  } else if (fam === 'FS') {
    const v = pv(a.corrente, 'A');
    const s = v != null ? fmtSimple(v, 'A')[0] : null;
    if (!s) flag(MAN, 'corrente mancante'); else V = s + 'X';
  } else if (fam === 'DL') {
    const col = String(a.colore ?? '').replace(/\s/g, '').toUpperCase();
    const cc = COLORI[col] || COLORI_NUOVI[col] || (Object.values(COLORI).includes(col) ? col : null);
    const mm = String(a.corrente ?? '').replace(/\s/g, '').toUpperCase().match(/^([\d.]+)MA$/);
    if (!cc) flag(MAN, 'colore mancante o non in tabella');
    else if (!mm || Number(mm[1]) > 99) flag(MAN, 'corrente LED (mA) mancante');
    else V = `${cc}${zfill(String(Math.trunc(Number(mm[1]))), 2)}`;
  } else if (['QZ', 'OS', 'RI'].includes(fam)) {
    const v = pv(val, 'HZ');
    if (v == null) flag(MAN, 'frequenza mancante');
    else {
      let [s, rnd] = rkm(v, P_HZ);
      if (rnd) {
        const [b, l] = P_HZ.find(([b]) => 1 <= v / b && v / b < 1000) ?? P_HZ[P_HZ.length - 1];
        const m = v / b, ip = Math.trunc(m), dec = 3 - String(ip).length;
        s = dec > 0 ? (String(ip) + l + zfill(String(Math.trunc((m - ip) * 10 ** dec)), dec)).slice(0, 4) : `${ip}${l}`;
      }
      V = s + 'X';
    }
  } else if (fam === 'CN' || fam === 'TI') {
    const p = passoCentesimi(a.passo);
    const poli = String(a.poli ?? '').replace(/\D/g, '');
    if (!p || p > 999) flag(MAN, 'passo mancante (mm, es. 2.54)');
    else if (!poli || parseInt(poli, 10) > 99) flag(MAN, 'numero poli mancante');
    else V = `${zfill(String(p), 3)}${zfill(String(parseInt(poli, 10)), 2)}`;
  } else {
    const [root] = pn ? mpnRoot(pn) : [null];
    if (root) V = root; else flag(MAN, 'P/N mancante');
  }
  return { T: tech, C, V, stato, note };
}

export function descrizione(fam: string, a: Attributi, pn: unknown): string {
  const spec = FAMIGLIE[fam];
  const bits = [spec?.breve ?? fam];
  for (const k of spec?.prod ?? []) {
    if (k === 'RID' || k === 'PN') continue;
    const v = a[k];
    if (v) bits.push(k === 'tolleranza' && !String(v).toUpperCase().endsWith('PPM') ? `${v}%` : String(v));
  }
  if (pn) bits.push(String(pn));
  return bits.join(' ');
}

export interface Calcolo {
  prod: string | null; prodBozza?: string | null; root: string | null; stato: Stato; note: string[]; descr: string | null;
  attrs?: Attributi; T?: string; C?: string | null; V?: string | null;
}

/** Calcola i due codici (radice per il gestionale: il progressivo lo dà il database). */
export function calcola(famiglia: string | null | undefined, attributi: Attributi, pn: unknown): Calcolo {
  const fam = String(famiglia ?? '').toUpperCase().trim();
  if (!(fam in FAMIGLIE)) return { prod: null, root: null, stato: MAN, note: ['scegliere la famiglia'], descr: null };
  const a: Attributi = {};
  for (const k of ATTR) a[k] = normAttr(k, attributi[k], fam);
  a.tecnologia = String(attributi.tecnologia ?? '').trim().toUpperCase() || null;
  const [prod, manc] = codiceProduzione(fam, a, pn);
  let g: Radice;
  try { g = codiceGestionaleRadice(fam, a, pn); }
  catch (e) { if (!(e instanceof ErroreValore)) throw e; g = { T: a.tecnologia || 'S', C: null, V: null, stato: MAN, note: [`valore non leggibile: ${e.message}`] }; }
  const root = g.C && g.V ? `${g.T}${fam}-${g.C}-${g.V}` : null;
  let stato = g.stato; const note = [...g.note];
  if (manc.length) { note.unshift('produzione: manca ' + manc.join(', ')); stato = MAN; }
  if (!root && stato !== MAN) stato = MAN;
  return { prod: manc.length ? null : prod, prodBozza: prod, root, stato, note, descr: descrizione(fam, a, pn), attrs: a, T: g.T, C: g.C, V: g.V };
}

// ───────────────────────────── progressivo (3 caratteri, senza I e O) ─────────────────────────────
export const ALFABETO = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export function progStr(n: number): string {
  let s = '';
  for (let i = 0; i < 3; i++) { s = ALFABETO[n % 34] + s; n = Math.floor(n / 34); }
  return s;
}
export function progNum(p: string): number {
  let n = 0;
  for (const ch of p) n = n * 34 + ALFABETO.indexOf(ch);
  return n;
}
