/**
 * Conversione dei dati di un prodotto DigiKey (Product Information API v4) nei campi Casteltech
 * (portata da core/digikey.py: famiglia, case, valore, tolleranza, tensione...). Nessun accesso alla rete.
 */
import type { Attributi } from './regole.js';

export interface ProdottoDigiKey {
  ManufacturerProductNumber?: string; Manufacturer?: { Name?: string };
  Description?: { ProductDescription?: string; DetailedDescription?: string };
  Category?: { Name?: string; ChildCategories?: any[] }; Parameters?: { ParameterText?: string; ValueText?: string }[];
  [k: string]: any;
}

export const descrizioneDk = (p: ProdottoDigiKey) => p.Description?.ProductDescription || p.Description?.DetailedDescription || '';

/** Nomi della categoria dalla radice alla foglia. */
export function categorieDk(p: ProdottoDigiKey): string[] {
  const out: string[] = []; let c: any = p.Category ?? {};
  while (c) {
    if (c.Name) out.push(c.Name);
    const figli = c.ChildCategories ?? [];
    c = figli.length ? figli[0] : null;
  }
  return out;
}

export function parametriDk(p: ProdottoDigiKey): Record<string, string> {
  const out: Record<string, string> = {};
  for (const x of p.Parameters ?? []) if (x.ParameterText) out[String(x.ParameterText).trim()] = String(x.ValueText ?? '').trim();
  return out;
}

/**
 * Famiglia dalla categoria DigiKey. Si guarda prima la categoria più specifica (foglia), poi le madri:
 * la madre "Crystals, Oscillators, Resonators" contiene tutte e tre le parole, "TVS" contiene i varistori,
 * "Potentiometers, Variable Resistors" contiene "Resistors" (correzione 1/11/2026, registro in aggiunte.ts).
 */
export const REGOLE_CATEGORIE: [string, string][] = [
  ['RESISTOR NETWORKS', 'RR'], ['POTENTIOMETER', 'PO'], ['TRIMMER', 'PO'], ['THERMISTOR', 'NT'], ['INRUSH CURRENT LIMITER', 'NT'],
  ['CHIP RESISTOR', 'RS'], ['THROUGH HOLE RESISTORS', 'RS'], ['RESISTORS', 'RS'],
  ['CERAMIC CAPACITORS', 'CC'], ['ALUMINUM ELECTROLYTIC', 'CE'], ['ALUMINUM - POLYMER', 'CE'], ['ELECTRIC DOUBLE LAYER', 'CE'], ['SUPERCAPACITOR', 'CE'],
  ['TANTALUM', 'CT'], ['FILM CAPACITORS', 'CF'], ['FERRITE BEADS', 'FR'], ['COMMON MODE CHOKES', 'FE'], ['FIXED INDUCTORS', 'ID'], ['INDUCTORS', 'ID'],
  ['PTC RESETTABLE FUSES', 'FS'], ['FUSES', 'FS'], ['ZENER', 'DZ'], ['VARISTORS', 'VR'], ['TVS', 'SP'],
  ['OPTOISOLATORS', 'IC'], ['DIGITAL ISOLATORS', 'IC'], ['ISOLATORS', 'IC'],
  ['LED INDICATION', 'DL'], ['LED ', 'DL'], ['FETS, MOSFETS', 'TM'], ['BIPOLAR (BJT)', 'TB'],
  ['THYRISTORS', 'TS'], ['SCRS', 'TS'], ['TRIACS', 'TS'], ['OSCILLATORS', 'OS'], ['RESONATORS', 'RI'], ['CRYSTALS', 'QZ'],
  ['RELAYS', 'RL'], ['DIP SWITCHES', 'DW'], ['SWITCHES', 'IT'],
  ['BATTERY HOLDERS', 'BT'], ['BATTERIES', 'BT'], ['BATTERY PRODUCTS', 'BT'], ['RF ANTENNAS', 'AN'], ['ANTENNAS', 'AN'],
  ['DC DC CONVERTERS', 'CV'], ['AC DC CONVERTERS', 'CV'], ['TRANSFORMERS', 'TF'], ['EMI/RFI FILTERS', 'FE'],
  ['TERMINAL BLOCKS', 'CN'], ['CONNECTORS', 'CN'], ['INTEGRATED CIRCUITS', 'IC'], ['RF TRANSCEIVER', 'IC'],
  ['SENSORS', 'MI'], ['BUZZERS', 'MI'], ['AUDIO PRODUCTS', 'MI'],
];

export function famigliaDaDk(cats: string[], par: Record<string, string>, descr: string): string | null {
  const t = cats.join(' | ').toUpperCase(), d = descr.toUpperCase();
  const tipoDiodo = `${par['Diode Type'] ?? ''} ${par['Technology'] ?? ''}`.toUpperCase();
  if (t.includes('DIODES') || t.includes('RECTIFIERS')) {
    if (t.includes('ZENER')) return 'DZ';
    if (t.includes('TVS')) return 'SP';
    if (tipoDiodo.includes('SCHOTTKY') || d.includes('SCHOTTKY')) return 'DS';
    return 'DI';
  }
  for (const c of [...cats].reverse().map(x => x.toUpperCase())) {
    if (c.includes('RESISTOR') && c.includes('ARRAYS')) return 'RR';
    for (const [chiave, fam] of REGOLE_CATEGORIE) if (c.includes(chiave)) return fam;
  }
  return null;
}

/** '0.063W, 1/16W' → '0.063W' ; '200mA (Ta)' → '200mA' */
const primo = (v: unknown) => String(v ?? '').replace(/\(.*?\)/g, '').split(',')[0].replace(/±/g, '').replace(/Max/g, '').replace(/Typ/g, '').trim();
function ohm(v: unknown): string | null {
  const m = primo(v).match(/^([\d.]+)\s*([kKmM]?)\s*Ohms?$/);
  if (!m) return null;
  return m[1] + ({ k: 'K', K: 'K', M: 'M', m: 'm', '': 'R' } as Record<string, string>)[m[2]];
}
/** '100 nF' → '100n' ; '0.1 µF' → '0.1u' ; '24 MHz' → '24MHz' */
function unita(v: unknown, u: string): string | null {
  const s = primo(v).replace(/µ/g, 'u').replace(/μ/g, 'u');
  const m = s.match(new RegExp(`^([\\d.]+)\\s*([pnumkMG]?)\\s*${u}$`));
  if (!m) return null;
  return m[1] + m[2] + (u === 'Hz' ? 'Hz' : '');
}
/** '0.276" L x 0.276" W (7.00mm x 7.00mm)' → [7, 7] */
function mm(v: unknown): number[] | null {
  const m = String(v ?? '').match(/\(([\d.]+)mm(?:\s*x\s*([\d.]+)mm)?/);
  if (!m) return null;
  return [m[1], m[2]].filter(Boolean).map(Number);
}
const g = (x: number) => String(Number(x.toPrecision(6)));

function caseDk(par: Record<string, string>, fam: string): string | null {
  const sdp = par['Supplier Device Package'] ?? '', pc = par['Package / Case'] ?? '';
  if (fam === 'CF') { // film THT: passo dei piedini (P150 = 15 mm); SMD: case chip come i ceramici
    const p = (par['Lead Spacing'] ?? '').match(/\(([\d.]+)mm\)/);
    if (p) return `P${String(Math.round(Number(p[1]) * 10)).padStart(3, '0')}`;
  }
  if (['RS', 'RR', 'CC', 'CT', 'FR', 'FS', 'ID', 'DL', 'VR', 'NT', 'CF'].includes(fam)) { const m = pc.match(/^\s*(\d{4,5})\s*\(/); if (m) return m[1]; }
  if (fam === 'CE') { const d = mm(par['Size / Dimension']); if (d) return `D${g(d[0])}`; }
  if (['ID', 'QZ', 'OS', 'RI'].includes(fam) && (!pc || pc.toUpperCase().includes('NONSTANDARD') || pc.toUpperCase().includes('SMD'))) {
    const d = mm(par['Size / Dimension']);
    if (d && d.length === 2) {
      if (fam === 'ID') return `${g(d[0])}X${g(d[1])}`;
      return `${String(Math.round(d[0] * 10)).padStart(2, '0')}${String(Math.round(d[1] * 10)).padStart(2, '0')}`;
    }
  }
  let s = sdp || pc;
  if (!s) return null;
  s = s.replace(/\(.*?\)/g, '').split(',')[0].trim().toUpperCase();
  return s.replace(/^(SOT-23|TO-220|TO-92|TO-252|TO-263)-3$/, '$1');
}

const CONN_TIPO: [string, string][] = [['HEADER', 'BASETTA'], ['RECEPTACLE', 'PRESA'], ['SOCKET', 'PRESA'], ['USB - C', 'USBC'], ['USB-C', 'USBC'],
  ['USB - MICRO', 'MICROUSB'], ['MICRO USB', 'MICROUSB'], ['USB - MINI', 'USBMINI'], ['RJ45', 'RJ45'], ['8P8C', 'RJ45'], ['FFC', 'FFC'], ['FPC', 'FFC'],
  ['TERMINAL BLOCK', 'MORSETTO'], ['MICROSD', 'SDCARD'], ['SD', 'SDCARD'], ['HDMI', 'HDMI'], ['COAXIAL', 'COASSIALE'], ['U.FL', 'COASSIALE'], ['JACK', 'PWJACK']];
const COLORI_DK: Record<string, string> = { RED: 'ROSSO', GREEN: 'VERDE', BLUE: 'BLU', YELLOW: 'GIALLO', ORANGE: 'ARANCIONE', WHITE: 'BIANCO',
  AMBER: 'AMBRA', INFRARED: 'IR', RGB: 'RGB', 'RED, GREEN, BLUE (RGB)': 'RGB' };
const CONTATTI: Record<string, string> = { 'SPST-NO': 'SPSTNA', 'SPST-NC': 'SPSTNC', SPDT: 'SPDT', DPDT: 'DPDT', 'DPST-NO': 'DPSTNA' };

/** Prodotto DigiKey → famiglia, attributi, produttore, descrizione DigiKey. */
export function daDigikey(p: ProdottoDigiKey): { famiglia: string | null; attributi: Attributi; produttore: string | null; descrizione: string } {
  const cats = categorieDk(p), par = parametriDk(p), descr = descrizioneDk(p);
  const fam = famigliaDaDk(cats, par, descr);
  const a: Attributi = {};
  const x = (k: string) => par[k];
  if (fam) a.case = caseDk(par, fam);
  const mt = (x('Mounting Type') ?? '').toUpperCase();
  if (mt.includes('THROUGH HOLE')) a.tecnologia = 'T'; else if (mt.includes('SURFACE MOUNT')) a.tecnologia = 'S';
  const tol = primo(x('Tolerance')).replace(/%/g, '').trim();
  if (fam === 'RS' || fam === 'RR') {
    a.valore = ohm(x('Resistance') || x('Resistance (Ohms)')); a.tolleranza = tol || null;
    a.potenza = primo(x('Power (Watts)') || x('Power Per Element'));
  } else if (fam === 'CC' || fam === 'CE' || fam === 'CT') {
    a.valore = unita(x('Capacitance'), 'F'); a.tolleranza = tol || null; a.tensione = primo(x('Voltage - Rated'));
    if (fam === 'CC') a.dielettrico = primo(x('Temperature Coefficient'));
  } else if (fam === 'ID') {
    a.valore = unita(x('Inductance'), 'H'); a.corrente = primo(x('Current Rating (Amps)'));
    a.dcr = x('DC Resistance (DCR)') ? (ohm(x('DC Resistance (DCR)')) ?? '').toUpperCase().replace('M', 'MR') : null;
  } else if (fam === 'FR') {
    const z = (x('Impedance @ Frequency') ?? '').match(/^\s*([\d.]+)\s*Ohms/);
    a.valore = z ? z[1] + 'R' : null; a.corrente = primo(x('Current Rating (Max)'));
    a.dcr = x('DC Resistance (DCR) (Max)') ? (ohm(x('DC Resistance (DCR) (Max)')) ?? '').toUpperCase().replace('M', 'MR') : null;
    a.tolleranza = tol || null;
  } else if (fam === 'FS') {
    a.corrente = primo(x('Current Rating (Amps)') || x('Current - Hold (Ih) (Max)')); a.tensione = primo(x('Voltage Rating - DC') || x('Voltage - Max'));
  } else if (fam === 'DI' || fam === 'DS') {
    a.corrente = primo(x('Current - Average Rectified (Io)') || x('Current - Average Rectified (Io) (per Diode)'));
    a.tensione = primo(x('Voltage - DC Reverse (Vr) (Max)'));
  } else if (fam === 'DZ') {
    a.valore = primo(x('Voltage - Zener (Nom) (Vz)')); a.potenza = primo(x('Power - Max'));
  } else if (fam === 'SP') {
    a.tensione = primo(x('Voltage - Reverse Standoff (Typ)')); a.potenza = primo(x('Power - Peak Pulse')); a.corrente = primo(x('Current - Peak Pulse (10/1000µs)'));
  } else if (fam === 'DL') {
    const col = (x('Color') ?? '').toUpperCase();
    a.colore = COLORI_DK[col] ?? COLORI_DK[col.split(',')[0].trim()] ?? null;
    a.corrente = primo(x('Current - Test')); a.tensione = primo(x('Voltage - Forward (Vf) (Typ)'));
  } else if (fam === 'TM') {
    a.tensione = primo(x('Drain to Source Voltage (Vdss)')); a.corrente = primo(x('Current - Continuous Drain (Id) @ 25°C'));
    const ft = (x('FET Type') ?? '').toUpperCase(); a.tipo = ft.startsWith('N') ? 'N' : ft.startsWith('P') ? 'P' : null;
  } else if (fam === 'TB') {
    a.tensione = primo(x('Voltage - Collector Emitter Breakdown (Max)')); a.corrente = primo(x('Current - Collector (Ic) (Max)'));
    const tt = (x('Transistor Type') ?? '').toUpperCase(); a.tipo = tt.includes('NPN') ? 'NPN' : tt.includes('PNP') ? 'PNP' : null;
  } else if (fam === 'TS') {
    a.tensione = primo(x('Voltage - Off State')); a.corrente = primo(x('Current - On State (It (RMS)) (Max)'));
  } else if (fam === 'QZ' || fam === 'OS' || fam === 'RI') {
    a.valore = unita(x('Frequency'), 'Hz');
    if (fam === 'QZ') { const ppm = (x('Frequency Tolerance') ?? '').match(/(\d+)\s*ppm/); a.tolleranza = ppm ? ppm[1] + 'PPM' : null; a.tipo = 'CRYST.'; }
    if (fam === 'OS') a.tensione = primo(x('Voltage - Supply'));
    if (fam === 'RI') a.extra = unita(x('Capacitance'), 'F');
  } else if (fam === 'VR') {
    a.tensione = primo(x('Varistor Voltage (Typ)') || x('Maximum DC Volts'));
  } else if (fam === 'RL') {
    const cf = (x('Contact Form') ?? '').replace(/\(.*?\)/g, '').trim().toUpperCase();
    a.tipo = CONTATTI[cf] ?? (cf.replace(/-/g, '') || null);
  } else if (fam === 'CN') {
    const ct = [x('Connector Type') ?? '', x('Contact Type') ?? '', cats.join(' ')].join(' ').toUpperCase();
    a.tipo = CONN_TIPO.find(([k]) => ct.includes(k))?.[1] ?? null;
    const pm = (x('Pitch - Mating') || x('Pitch') || '').match(/\(([\d.]+)mm\)/);
    if (pm) a.passo = pm[1];
    const np = (x('Number of Positions') || x('Number of Positions Loaded') || '').match(/^\s*(\d+)/);
    if (np) a.poli = np[1];
    if (mt.includes('THROUGH HOLE')) a.case = 'THT';
  } else if (fam === 'IT') {
    a.tensione = (x('Contact Rating @ Voltage') ?? '').replace(/ /g, '').toUpperCase() || null;
  } else if (fam === 'CF') {
    a.valore = unita(x('Capacitance'), 'F'); a.tolleranza = tol || null; a.tensione = primo(x('Voltage Rating - DC') || x('Voltage - Rated'));
  } else if (fam === 'NT') {
    a.valore = ohm(x('Resistance @ 25°C') || x('Resistance in Ohms @ 25°C') || x('Resistance'));
    a.tolleranza = primo(x('Resistance Tolerance') || x('Tolerance')).replace(/%/g, '').trim() || null;
  } else if (fam === 'BT') {
    const c = cats.join(' ').toUpperCase();
    a.tipo = c.includes('HOLDER') ? 'PORTABATTERIA' : c.includes('CONTACT') ? 'CONTATTO' : 'BATTERIA';
  } else if (fam === 'AN') {
    const tipo = `${x('Antenna Type') ?? ''} ${x('Mounting Type') ?? ''}`.toUpperCase();
    a.tipo = tipo.includes('CHIP') ? 'CHIP' : tipo.includes('PCB') || tipo.includes('FLEX') ? 'PCB' : tipo.includes('WHIP') || tipo.includes('CONNECTOR') ? 'ESTERNA' : null;
  } else if (fam === 'MI') {
    a.tipo = (cats.length ? cats[cats.length - 1] : '').toUpperCase().replace(/ /g, '').slice(0, 14) || null;
  }
  return { famiglia: fam, attributi: Object.fromEntries(Object.entries(a).filter(([, v]) => v)) as Attributi, produttore: p.Manufacturer?.Name ?? null, descrizione: descr };
}
