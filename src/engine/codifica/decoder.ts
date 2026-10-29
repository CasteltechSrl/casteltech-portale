/**
 * Riconoscimento automatico dei dati di un componente (portato da core/decoder.py).
 *  1. decodificaMpn(): legge case, valore, tolleranza, tensione dai P/N delle serie di passivi più comuni;
 *  2. daColonneBom(): ricava famiglia e dati dalle colonne della BOM (valore, footprint, descrizione, designatore).
 * Ogni funzione restituisce [famiglia, {attributi}] oppure [null, {}].
 */
import { fmtG, type Attributi } from './regole.js';

type Risultato = [string, Attributi] | null;

// ───────────────────────────── utilità ─────────────────────────────
export const SIZE_INCH = ['01005', '0201', '0402', '0603', '0805', '1206', '1210', '1806', '1812', '2010', '2220', '2512'];
export const METRIC_TO_INCH: Record<string, string> = { '0402': '01005', '0603': '0201', '1005': '0402', '1608': '0603', '2012': '0805', '3216': '1206',
  '3225': '1210', '4532': '1812', '5025': '2010', '5750': '2220', '6332': '2512' };
export const POWER_BY_SIZE: Record<string, string> = { '0201': '50mW', '0402': '63mW', '0603': '100mW', '0805': '125mW', '1206': '250mW',
  '1210': '500mW', '2010': '750mW', '2512': '1W' };
export const TOL_LETTER: Record<string, string> = { A: '0.05', B: '0.1', C: '0.25', D: '0.5', F: '1', G: '2', J: '5', K: '10', M: '20', Z: '80' };
const EIA_VOLT: Record<string, string> = { '0G': '4V', '0J': '6V3', '1A': '10V', '1C': '16V', '1E': '25V', YA: '35V', '1V': '35V', '1H': '50V',
  '1J': '63V', '2A': '100V', '2D': '200V', '2E': '250V', '2W': '450V', '2J': '630V', '3A': '1KV', '3D': '2KV' };
const tutto = (re: RegExp, s: string) => s.match(new RegExp(`^(?:${re.source})$`, re.flags));

/** '104' → 100nF ; '4R7' → 4.7pF ; '1R0' → 1pF (in pF) */
export function capCode(code: string): number | null {
  code = code.toUpperCase();
  if (code.includes('R')) return Number(code.replace('R', '.'));
  if (!/^\d+$/.test(code) || code.length < 3) return null;
  return parseInt(code.slice(0, -1), 10) * 10 ** parseInt(code.slice(-1), 10);
}
/** '1002' → 10000 ; '103' → 10000 ; '4R70' → 4.7 ; '0R00' → 0 */
export function resCode(code: string): number | null {
  code = code.toUpperCase();
  if (/^\d*R\d*$/.test(code)) return Number(code.replace('R', '.') || 0) || 0;
  if (/^\d+$/.test(code) && (code.length === 3 || code.length === 4)) return parseInt(code.slice(0, -1), 10) * 10 ** parseInt(code.slice(-1), 10);
  return null;
}
/** valore in pF → '100n', '4.7u', '22p' */
export function pfStr(pf: number | null): string | null {
  if (pf == null) return null;
  if (pf >= 1e6) return `${fmtG(pf / 1e6)}u`;
  if (pf >= 1e3) return `${fmtG(pf / 1e3)}n`;
  return `${fmtG(pf)}p`;
}
export function ohmStr(v: number | null): string | null {
  if (v == null) return null;
  if (v >= 1e6) return `${fmtG(v / 1e6)}M`;
  if (v >= 1e3) return `${fmtG(v / 1e3)}K`;
  return `${fmtG(v)}R`;
}
const rkmOhm = (val: string) => {
  const m = val.match(/^(\d*)([RKM])(\d*)$/);
  if (!m) return null;
  return Number(`${m[1] || 0}.${m[3] || 0}`) * ({ R: 1, K: 1e3, M: 1e6 } as Record<string, number>)[m[2]];
};
const tol = (l: string) => TOL_LETTER[l] ?? null;

// ───────────────────────────── resistenze ─────────────────────────────
function yageoRc(pn: string): Risultato {
  const m = tutto(/(?:RC|AC|RT|RL|AF)(\d{4})([A-Z])[A-Z]-?\d{2}(\d*[RKM]\d*)L/, pn);
  if (!m) return null;
  const [, size, t, val] = m; const n = rkmOhm(val);
  if (n == null) return null;
  return ['RS', { case: size, valore: ohmStr(n), tolleranza: t !== 'Z' ? tol(t) : null, potenza: POWER_BY_SIZE[size] }];
}
function vishayCrcw(pn: string): Risultato {
  const m = tutto(/CRCW(\d{4})(\d*[RKM]\d*)([BDFGJ])\w*/, pn);
  if (!m) return null;
  const [, size, val, t] = m;
  return ['RS', { case: size, valore: ohmStr(rkmOhm(val)), tolleranza: tol(t), potenza: POWER_BY_SIZE[size] }];
}
const ERJ: Record<string, string> = { '1G': '0201', '2': '0402', '3': '0603', '6': '0805', '8': '1206', '14': '1210', '12': '1812', '1T': '2512',
  P03: '0603', P06: '0805', P08: '1206', T06: '0805', T08: '1206', U03: '0603', U06: '0805' };
function panasonicErj(pn: string): Risultato {
  const m = tutto(/ERJ-?(1G|2|3|6|8|14|12|1T|P03|P06|P08|T06|T08|U03|U06)([A-Z]{2,3}?)([FJDBG])(\d{3,4}|\d*R\d{1,2})[A-Z]?/, pn);
  if (!m) {
    const m2 = tutto(/ERJ-?(1G|2|3|6|8|14|12|1T)GEY?(0R00)[A-Z]?/, pn);
    if (m2) { const size = ERJ[m2[1]]; return ['RS', { case: size, valore: '0R', tolleranza: null, potenza: POWER_BY_SIZE[size] }]; }
    return null;
  }
  const size = ERJ[m[1]]; const v = resCode(m[4]);
  if (v == null) return null;
  return ['RS', { case: size, valore: ohmStr(v), tolleranza: tol(m[3]), potenza: POWER_BY_SIZE[size] }];
}
function uniohm(pn: string): Risultato {
  // 0603WAF1002T5E, 0402WGF1001TCE, 1206W4F100JT5E
  const m = tutto(/(\d{4})[A-Z0-9]{1,2}([FJD])(\d{3,4}|\d+R\d*)[TJ]\w+/, pn);
  if (!m) return null;
  const [, size, t, val] = m; const v = resCode(val);
  if (v == null || !(size in POWER_BY_SIZE)) return null;
  return ['RS', { case: size, valore: ohmStr(v), tolleranza: tol(t), potenza: POWER_BY_SIZE[size] }];
}

// ───────────────────────────── condensatori ceramici ─────────────────────────────
function samsungCl(pn: string): Risultato {
  const m = tutto(/CL(\d{2})([A-Z])(\d{2}[0-9R])([BCDFGJKMZ])([A-Z])\w+/, pn);
  if (!m) return null;
  const [, sz, diel, cap, t, volt] = m;
  const size = ({ '03': '0201', '05': '0402', '10': '0603', '21': '0805', '31': '1206', '32': '1210', '43': '1812', '55': '2220' } as Record<string, string>)[sz];
  const d = ({ A: 'X5R', B: 'X7R', C: 'C0G', F: 'Y5V', X: 'X6S', Y: 'X7S', Z: 'X7T' } as Record<string, string>)[diel];
  const v = ({ R: '4V', Q: '6V3', P: '10V', O: '16V', A: '25V', L: '35V', B: '50V', C: '100V', D: '200V', E: '250V', G: '500V', H: '630V', I: '1KV', J: '2KV', K: '3KV' } as Record<string, string>)[volt];
  if (!size) return null;
  return ['CC', { case: size, valore: pfStr(capCode(cap)), tolleranza: tol(t), dielettrico: d, tensione: v }];
}
function murata(pn: string): Risultato {
  const m = tutto(/G(?:RM|CM|CJ|JM|RT|CQ)(\d{2})\w([A-Z0-9]{2})([0-9A-Z]{2})(\d{2}[0-9R]|R\d{2}|\dR\d)([A-Z])\w*/, pn);
  if (!m) return null;
  const [, sz, diel, volt, cap, t] = m;
  const size = ({ '03': '0201', '15': '0402', '18': '0603', '21': '0805', '31': '1206', '32': '1210', '43': '1812', '55': '2220' } as Record<string, string>)[sz];
  const d = ({ '5C': 'C0G', R7: 'X7R', R6: 'X5R', C7: 'X7S', C8: 'X6S', F5: 'Y5V', D7: 'X7T', Z7: 'X7R' } as Record<string, string>)[diel];
  if (!size || !d) return null;
  return ['CC', { case: size, valore: pfStr(capCode(cap)), tolleranza: tol(t), dielettrico: d, tensione: EIA_VOLT[volt] }];
}
function tdk(pn: string): Risultato {
  const m = tutto(/C(?:GA\d)?(\d{4})(C0G|X7R|X5R|X7S|X6S|X7T|NP0|JB|CH)(\d[A-Z])(\d{2}[0-9R]|\dR\d)([A-Z])\w*/, pn);
  if (!m) return null;
  const [, sz, diel, volt, cap, t] = m;
  const size = METRIC_TO_INCH[sz];
  if (!size) return null;
  return ['CC', { case: size, valore: pfStr(capCode(cap)), tolleranza: tol(t),
    dielettrico: ({ NP0: 'C0G', CH: 'C0G', JB: 'X5R' } as Record<string, string>)[diel] ?? diel, tensione: EIA_VOLT[volt] }];
}
function kemet(pn: string): Risultato {
  const m = tutto(/C(\d{4})C(\d{2}[0-9R]|\dR\d)([A-Z])([0-9A-Z])([A-Z])\w*/, pn);
  if (!m) return null;
  const [, size, cap, t, volt, diel] = m;
  if (!SIZE_INCH.includes(size)) return null;
  const v = ({ 9: '6V3', 8: '10V', 4: '16V', 3: '25V', 6: '35V', 5: '50V', 1: '100V', 2: '200V', A: '250V', C: '500V' } as Record<string, string>)[volt];
  const d = ({ G: 'C0G', R: 'X7R', P: 'X5R', U: 'Z5U', V: 'Y5V', Q: 'X5S' } as Record<string, string>)[diel];
  return ['CC', { case: size, valore: pfStr(capCode(cap)), tolleranza: tol(t), dielettrico: d, tensione: v }];
}
function yageoCc(pn: string): Risultato {
  const m = tutto(/CC(\d{4})([BCDFGJKMZ])[A-Z](NPO|NP0|X7R|X5R|Y5V|X7S)(\d)BB(\d{1,2}[0-9R]|\dR\d)/, pn);
  if (!m) return null;
  const [, size, t, diel, volt, cap] = m;
  const v = ({ 5: '6V3', 6: '10V', 7: '16V', 8: '25V', 9: '50V', 0: '100V', 1: '200V', 2: '500V', 3: '1KV' } as Record<string, string>)[volt];
  return ['CC', { case: size, valore: pfStr(capCode(cap)), tolleranza: tol(t), dielettrico: ({ NPO: 'C0G', NP0: 'C0G' } as Record<string, string>)[diel] ?? diel, tensione: v }];
}
function walsinStyle(pn: string): Risultato {
  // 0603B104K500CT / 0805X106K160CT / 0402N180J500CT (Walsin, Fenghua, Hongda...)
  const m = tutto(/(?:MC)?(\d{4})([BNXFY])(\d{2}[0-9R]|\dR\d)([BCDFGJKMZ])(\d{2}[0-9R]|\dR\d)[A-Z]{1,3}/, pn);
  if (!m) return null;
  const [, size, diel, cap, t, volt] = m;
  if (!SIZE_INCH.includes(size)) return null;
  const vv = capCode(volt);
  return ['CC', { case: size, valore: pfStr(capCode(cap)), tolleranza: tol(t),
    dielettrico: ({ B: 'X7R', N: 'C0G', X: 'X5R', F: 'Y5V', Y: 'Y5V' } as Record<string, string>)[diel], tensione: vv ? `${fmtG(vv)}V` : null }];
}
function avx(pn: string): Risultato {
  // 0603YC104KAT2A (taglia, tensione, dielettrico, capacità, tolleranza)
  const m = tutto(/(\d{4})([0-9A-Z])([ACDG])(\d{2}[0-9R]|\dR\d)([BCDFGJKMZ])AT\w*/, pn);
  if (!m) return null;
  const [, size, volt, diel, cap, t] = m;
  if (!SIZE_INCH.includes(size)) return null;
  const v = ({ 4: '4V', 6: '6V3', Z: '10V', Y: '16V', 3: '25V', D: '35V', 5: '50V', 1: '100V', 2: '200V', 7: '500V' } as Record<string, string>)[volt];
  const d = ({ C: 'X7R', D: 'X5R', A: 'C0G', G: 'Y5V' } as Record<string, string>)[diel];
  return ['CC', { case: size, valore: pfStr(capCode(cap)), tolleranza: tol(t), dielettrico: d, tensione: v }];
}

// ───────────────────────────── altre serie ─────────────────────────────
function stackpole(pn: string): Risultato {
  let m = tutto(/RMC(1\/20|1\/16|1\/10|1\/8|1\/4)K(\d{3,4}|\d+R\d*)([FJD])\w*/, pn);
  if (m) {
    const size = ({ '1/20': '0402', '1/16': '0603', '1/10': '0805', '1/8': '1206', '1/4': '1210' } as Record<string, string>)[m[1]];
    const v = resCode(m[2]);
    if (v == null) return null;
    return ['RS', { case: size, valore: ohmStr(v), tolleranza: tol(m[3]), potenza: POWER_BY_SIZE[size] }];
  }
  m = tutto(/RMCF(\d{4})([FJZ])T(\d*[RKM]\d*)/, pn);
  if (m) return ['RS', { case: m[1], valore: ohmStr(rkmOhm(m[3])), tolleranza: m[2] !== 'Z' ? tol(m[2]) : null, potenza: POWER_BY_SIZE[m[1]] }];
  return null;
}
function walsinWr(pn: string): Risultato {
  const m = tutto(/WR(04|06|08|12|25)[A-Z](\d{3,4}|\d+R\d*)([FJD])T\w*/, pn);
  if (!m) return null;
  const size = ({ '04': '0402', '06': '0603', '08': '0805', '12': '1206', '25': '2512' } as Record<string, string>)[m[1]];
  return ['RS', { case: size, valore: ohmStr(resCode(m[2])), tolleranza: tol(m[3]), potenza: POWER_BY_SIZE[size] }];
}
function teCrg(pn: string): Risultato {
  const m = tutto(/CRG(P|CQ)?(\d{4})([FJ])(\d*[RKM]\d*)/, pn);
  if (!m) return null;
  return ['RS', { case: m[2], valore: ohmStr(rkmOhm(m[4])), tolleranza: tol(m[3]), potenza: m[1] ? null : POWER_BY_SIZE[m[2]] }];
}
function bournsCr(pn: string): Risultato {
  const m = tutto(/CR(M)?(\d{4})-([FJ])X-(\d{3,4}|\d+R\d+)E?LF/, pn);
  if (!m) return null;
  return ['RS', { case: m[2], valore: ohmStr(resCode(m[4])), tolleranza: tol(m[3]), potenza: m[1] ? null : POWER_BY_SIZE[m[2]] }];
}
function vishayWsl(pn: string): Risultato {
  const m = tutto(/WSL(\d{4})(R\d{3,4}|\d+R\d+)([FDJ])\w*/, pn);
  if (!m) return null;
  return ['RS', { case: m[1], valore: ohmStr(Number(m[2].replace('R', '.'))), tolleranza: tol(m[3]) }];
}
function yageoArray(pn: string): Risultato {
  const m = tutto(/(?:YC|TC)(\d)(\d)4-?([FJ])R-?\d{2}(\d*[RKM]\d*)L?/, pn);
  if (!m) return null;
  const size = m[1] + m[2] === '16' ? '1206' : ({ 12: '0603', 15: '0805', 10: '0402' } as Record<string, string>)[m[1] + m[2]] ?? null;
  return ['RR', { case: size, valore: ohmStr(rkmOhm(m[4])), tolleranza: tol(m[3]), potenza: size === '1206' ? '62.5mW' : null }];
}
function taiyo(pn: string): Risultato {
  const m = tutto(/([AJLETGUHQ])[MCG]K(\d{3})A?(BJ|B7|C6|C7|CG|CH|SD)(\d{2}[0-9R]|\dR\d)([BCDFGJKMZ])\w*/, pn);
  if (!m) return null;
  const v = ({ A: '4V', J: '6V3', L: '10V', E: '16V', T: '25V', G: '35V', U: '50V', H: '100V', Q: '250V' } as Record<string, string>)[m[1]];
  const size = ({ '063': '0201', 105: '0402', 107: '0603', 212: '0805', 316: '1206', 325: '1210', 432: '1812' } as Record<string, string>)[m[2]];
  const d = ({ BJ: 'X5R', B7: 'X7R', C6: 'X6S', C7: 'X7S', CG: 'C0G', CH: 'C0G', SD: 'X5R' } as Record<string, string>)[m[3]];
  if (!size) return null;
  return ['CC', { case: size, valore: pfStr(capCode(m[4])), tolleranza: tol(m[5]), dielettrico: d, tensione: v }];
}
function vishayVj(pn: string): Risultato {
  const m = tutto(/VJ(\d{4})([AYGQX])(\d{2}[0-9R]|\dR\d)([BCDFGJKMZ])[A-Z]([QJXABC])\w*/, pn);
  if (!m) return null;
  const d = ({ A: 'C0G', Y: 'X7R', G: 'C0G', Q: 'C0G', X: 'X7R' } as Record<string, string>)[m[2]];
  const v = ({ Q: '10V', J: '16V', X: '25V', A: '50V', B: '100V', C: '200V' } as Record<string, string>)[m[5]];
  return ['CC', { case: m[1], valore: pfStr(capCode(m[3])), tolleranza: tol(m[4]), dielettrico: d, tensione: v }];
}
function tdkCga(pn: string): Risultato {
  const m = tutto(/C(?:GA|GJ)(\d)[A-Z]\d(C0G|X7R|X5R|X7S|X6S|X7T|NP0)(\d[A-Z])(\d{2}[0-9R]|\dR\d)([A-Z])\w*/, pn);
  if (!m) return null;
  const size = ({ 2: '0402', 3: '0603', 4: '0805', 5: '1206', 6: '1210', 8: '1812' } as Record<string, string>)[m[1]];
  if (!size) return null;
  return ['CC', { case: size, valore: pfStr(capCode(m[4])), tolleranza: tol(m[5]), dielettrico: m[2] === 'NP0' ? 'C0G' : m[2], tensione: EIA_VOLT[m[3]] }];
}
const TANT_CASE: Record<string, string> = { A: '1206', B: '1210', C: '2312', D: '2917', E: '2917', V: '2924', X: '2917', Y: '2917' };
function tantalio(pn: string): Risultato {
  const m = tutto(/T49[0-9]([A-EVXY])(\d{3})([KMJ])(\d{3})\w*/, pn) // Kemet T491
    ?? tutto(/T(?:AJ|PS|PM|CJ)([A-EVXY])(\d{3})([KMJ])(\d{3})\w*/, pn) // AVX TAJ/TPS
    ?? tutto(/TR3([A-EVXY])(\d{3})([KMJ])(\d{3})\w*/, pn); // Vishay TR3
  if (m) {
    const [, cs, cap, t, volt] = m;
    return ['CT', { case: TANT_CASE[cs] ?? null, valore: pfStr(capCode(cap)), tolleranza: tol(t), tensione: volt !== '006' ? `${parseInt(volt, 10)}V` : '6.3V' }];
  }
  const m2 = tutto(/293D(\d{3})X([09])(\d{3,4})([A-EVXY])\w*/, pn); // Vishay 293D
  if (m2) {
    const [, cap, t, volt, cs] = m2;
    const vv = ({ '0063': 6.3, '6R3': 6.3 } as Record<string, number>)[volt] ?? parseInt(volt, 10);
    return ['CT', { case: TANT_CASE[cs] ?? null, valore: pfStr(capCode(cap)), tolleranza: t === '0' ? '20' : '10', tensione: `${fmtG(vv)}V` }];
  }
  return null;
}
function murataBlm(pn: string): Risultato {
  const m = tutto(/BLM(03|15|18|21|31|41)[A-Z]{2}(\d{3})[A-Z]{2}\d[A-Z]?/, pn);
  if (!m) return null;
  const size = ({ '03': '0201', 15: '0402', 18: '0603', 21: '0805', 31: '1206', 41: '1806' } as Record<string, string>)[m[1]];
  const z = parseInt(m[2].slice(0, 2), 10) * 10 ** parseInt(m[2][2], 10);
  return ['FR', { case: size, valore: `${z}R`, tolleranza: '25' }];
}

const DECODERS = [yageoRc, vishayCrcw, panasonicErj, uniohm, samsungCl, murata, tdk, kemet, yageoCc, walsinStyle, avx,
  stackpole, walsinWr, teCrg, bournsCr, vishayWsl, yageoArray, taiyo, vishayVj, tdkCga, tantalio, murataBlm];

/** Pulisce il P/N da spazi e prefissi da barcode/catalogo (1P, 30P, Mouser 71-, 279-…). */
export function pulisciPn(pn: unknown): string {
  let p = String(pn ?? '').replace(/\s/g, '').toUpperCase();
  p = p.replace(/^(1P|30P)(?=[A-Z])/, '');
  p = p.replace(/^\d{2,3}-(?=[A-Z])/, '');
  return p;
}

export function decodificaMpn(pn: unknown): [string | null, Attributi] {
  if (!pn) return [null, {}];
  const p = pulisciPn(pn);
  for (const fn of DECODERS) {
    let r: Risultato = null;
    try { r = fn(p); } catch { r = null; }
    if (r) {
      const [fam, attrs] = r;
      return [fam, Object.fromEntries(Object.entries(attrs).filter(([, v]) => v)) as Attributi];
    }
  }
  return [null, {}];
}

// ───────────────────────────── colonne della BOM ─────────────────────────────
const DESIGNATORE: [RegExp, string][] = [[/^(RN|RA)\d/, 'RR'], [/^FB\d/, 'FR'], [/^(LED|DL)\d/, 'DL'], [/^(R)\d/, 'RS'], [/^(C)\d/, 'CC'],
  [/^(L)\d/, 'ID'], [/^(D|CR|DZ|TVS)\d/, 'DI'], [/^(U|IC)\d/, 'IC'], [/^(Q|T)\d/, 'TR'],
  [/^(J|P|X|CN|CON)\d/, 'CN'], [/^(Y|XTAL)\d/, 'QZ'], [/^(F)\d/, 'FS'], [/^(K|RL)\d/, 'RL'], [/^(SW|S)\d/, 'IT']];
const PAROLE: [RegExp, string][] = [[/\bRES(ISTOR|ISTENZA)?\b/, 'RS'], [/\bCAP(ACITOR|ACITORE)?\b.*\b(ALUM|ELECTROLYTIC|ELETTROL)/, 'CE'],
  [/\bTANTAL/, 'CT'], [/\bCAP(ACITOR|ACITORE)?\b|\bMLCC\b/, 'CC'], [/\bFERRITE|\bBEAD\b/, 'FR'],
  [/\bINDUCTOR|\bINDUTT/, 'ID'], [/\bLED\b/, 'DL'], [/\bZENER/, 'DZ'], [/\bSCHOTTKY/, 'DS'],
  [/\bTVS\b|\bSUPPRESS/, 'SP'], [/\bDIOD/, 'DI'], [/\bMOSFET/, 'TM'], [/\b(NPN|PNP|BJT)\b/, 'TB'],
  [/\bTRANSISTOR/, 'TR'], [/\bCRYSTAL|\bQUARZ/, 'QZ'], [/\bOSCILLATOR/, 'OS'], [/\bFUSE|\bFUSIBIL/, 'FS'],
  [/\bRELAY|\bREL[EÈ](?![A-Z0-9_])/, 'RL'], [/\bCONN|\bHEADER|\bSOCKET|\bTERMINAL/, 'CN'], [/\bSWITCH|\bPULSANT/, 'IT'],
  [/\bVARISTOR/, 'VR'], [/\bIC\b|\bMCU\b|\bREGULATOR|\bAMPLIFIER|\bOPAMP|\bLDO\b/, 'IC']];
const CASE_RE = /(?<![\d.])(01005|0201|0402|0603|0805|1206|1210|1812|2010|2220|2512)(?![\d.])/;
// confini senza \b: nei footprint di KiCad il case segue un trattino basso (D_SOD-123, SOIC-16_3.9x9.9mm)
const PKG_RE = new RegExp('(?<![A-Z0-9])(SOT-?\\d{2,3}(?:-\\d)?|SOD-?\\d{2,3}[A-Z]?|SC-?\\d{2}(?:-\\d)?|TSOT-?\\d{2}(?:-\\d)?|'
  + '(?:SOIC|SO|TSSOP|SSOP|MSOP|VSSOP|QFN|VQFN|WQFN|UQFN|DFN|WDFN|LQFP|TQFP|BGA|LGA)-?\\d{1,3}|'
  + 'DO-?214A[ABC]|SM[ABC]|SMAF|D2PAK|DPAK|TO-?\\d{2,3}(?:AB)?|MELF)(?![A-Z0-9])', 'i');

export function famigliaDa(designatori?: unknown, descr?: unknown): string | null {
  if (descr) {
    const d = String(descr).toUpperCase();
    for (const [pat, fam] of PAROLE) if (pat.test(d)) return fam;
  }
  if (designatori) {
    const primo = String(designatori).trim().toUpperCase().split(/[,;\s]+/)[0];
    for (const [pat, fam] of DESIGNATORE) if (pat.test(primo)) return fam;
  }
  return null;
}

export function caseDaTesto(...testi: unknown[]): string | null {
  for (const t of testi) {
    if (!t) continue;
    const s = String(t).toUpperCase();
    const km = s.match(/_(\d{4})_(\d{4})METRIC/); // KiCad R_0603_1608Metric
    if (km) return km[1];
    const kx = s.match(/(?:SMD|CRYSTAL|OSC)\w*?[_-](\d{4})(?:[_-]\d+PIN)?/); // Crystal_SMD_3225-4Pin
    if (kx) return kx[1];
    let m = s.match(CASE_RE);
    if (m) return m[1];
    m = s.match(PKG_RE);
    if (m) return m[1].toUpperCase().replace(/-/g, '');
  }
  return null;
}

export function daColonneBom(fam: string | null, valore?: unknown, footprint?: unknown, descr?: unknown, designatori?: unknown): [string | null, Attributi] {
  fam = fam || famigliaDa(designatori, descr);
  const a: Attributi = {};
  a.case = caseDaTesto(footprint, descr, valore); // anche dal valore: "1N5819S4/SOD123"
  const T = [valore, descr].filter(x => x).map(String).join(' ').toUpperCase();
  const V = String(valore ?? '').toUpperCase();
  if (fam === 'RS' || fam === 'RR') {
    const m = V.match(/(?<![\w.])(\d+(?:[.,]\d+)?\s?[KM]?|\d+[RKM]\d+)\s?(?:OHM|Ω|R)?(?![\w])/);
    if (m) a.valore = m[1].replace(/ /g, '');
    const t = T.match(/(\d+(?:[.,]\d+)?)\s?%/);
    if (t) a.tolleranza = t[1];
    const w = T.match(/(\d+(?:[.,]\d+)?\s?M?W|\d+\/\d+\s?W)\b/);
    if (w) a.potenza = w[1].replace(/ /g, '');
  }
  if (fam === 'CC' || fam === 'CE' || fam === 'CT') {
    const m = T.match(/(\d+(?:[.,]\d+)?\s?[PNUΜµ]F?|\d+[PNU]\d+F?)(?![\w])/);
    if (m) a.valore = m[1].replace(/ /g, '').replace(/µ/g, 'U').replace(/Μ/g, 'U');
    const v = T.match(/(\d+(?:[.,]\d+)?)\s?V(?:DC)?\b/);
    if (v) a.tensione = v[1] + 'V';
    const d = T.match(/\b(X7R|X5R|C0G|NP0|COG|NPO|Y5V|X7S|X6S)\b/);
    if (d) a.dielettrico = d[1];
    const t = T.match(/(\d+(?:[.,]\d+)?)\s?%/);
    if (t) a.tolleranza = t[1];
  }
  if (fam === 'ID') { const m = T.match(/(\d+(?:[.,]\d+)?\s?[NUM]H|\d+[NU]\d+H?)\b/); if (m) a.valore = m[1].replace(/ /g, ''); }
  if (fam === 'FR') { const m = T.match(/(\d+)\s?(?:OHM|Ω|R)(?![\w])/); if (m) a.valore = m[1] + 'R'; }
  if (fam === 'QZ' || fam === 'OS') { const m = T.match(/(\d+(?:[.,]\d+)?\s?[KM]HZ)/); if (m) a.valore = m[1].replace(/ /g, ''); }
  if (fam === 'DZ') { const m = T.match(/(\d+(?:[.,]\d+)?)\s?V\b/); if (m) a.valore = m[1] + 'V'; }
  if (fam === 'QZ') { const p = T.match(/(\d+)\s?PPM/); if (p) a.tolleranza = p[1] + 'PPM'; a.tipo = 'CRYST.'; }
  if (fam && ['TM', 'TB', 'TR', 'DI', 'DS', 'SP', 'FS', 'DL'].includes(fam)) {
    const v = T.match(/(\d+(?:[.,]\d+)?)\s?V\b/);
    if (v && fam !== 'DL') a.tensione = v[1].replace(',', '.') + 'V';
    const i = T.match(/(\d+(?:[.,]\d+)?)\s?(M?A)\b/);
    if (i) a.corrente = i[1].replace(',', '.') + i[2];
    if (fam === 'TM') { const ch = T.match(/\b(N|P)(?:-?CH(?:ANNEL)?)?\b/); if (ch) a.tipo = ch[1]; }
    if (fam === 'TB') { const ch = T.match(/\b(NPN|PNP)\b/); if (ch) a.tipo = ch[1]; }
    if (fam === 'DL') {
      const col = T.match(/\b(RED|ROSSO|GREEN|VERDE|BLUE|BLU|YELLOW|GIALLO|ORANGE|ARANCIONE|WHITE|BIANCO|AMBER|AMBRA|RGB|IR)\b/);
      if (col) a.colore = ({ RED: 'ROSSO', GREEN: 'VERDE', BLUE: 'BLU', YELLOW: 'GIALLO', ORANGE: 'ARANCIONE', WHITE: 'BIANCO', AMBER: 'AMBRA' } as Record<string, string>)[col[1]] ?? col[1];
    }
  }
  if (fam === 'CN' || fam === 'TI') {
    const F = [footprint, descr, valore].filter(x => x).map(String).join(' ').toUpperCase();
    for (const [pat, tipo] of [[/PIN\s?HEADER|PINHEADER|\bHEADER\b|\bSTRIP\b/, 'BASETTA'], [/SOCKET|RECEPTACLE|FEMALE|PINSOCKET/, 'PRESA'],
      [/TERMINAL\s?BLOCK|MORSETT/, 'MORSETTO'], [/USB[\s_-]?C\b|TYPE[\s_-]?C/, 'USBC'], [/MICRO[\s_-]?USB|USB[\s_-]?MICRO/, 'MICROUSB'],
      [/RJ45/, 'RJ45'], [/\bFFC\b|\bFPC\b/, 'FFC'], [/MICRO\s?SD|SD\s?CARD/, 'SDCARD'], [/\bHDMI\b/, 'HDMI'], [/COAX|U\.FL|\bSMA\b/, 'COASSIALE']] as [RegExp, string][]) {
      if (pat.test(F)) { a.tipo = tipo; break; }
    }
    const p = F.match(/P(\d+[.,]\d+)\s?MM/) ?? F.match(/(\d+[.,]\d+)\s?MM/);
    if (p) a.passo = p[1].replace(',', '.');
    const n = F.match(/(\d+)X(\d+)/);
    if (n) a.poli = String(parseInt(n[1], 10) * parseInt(n[2], 10));
    else { const n2 = F.match(/(\d+)\s?(?:POS|PIN|POLI|WAY|P\b)/); if (n2) a.poli = n2[1]; }
    if (/\bSMD\b|\bSMT\b|SURFACE/.test(F)) a.tecnologia = 'S';
    else if (/\bTHT\b|THROUGH|\bTH\b|VERTICAL/.test(F)) a.tecnologia = 'T';
  }
  return [fam, Object.fromEntries(Object.entries(a).filter(([, v]) => v)) as Attributi];
}
