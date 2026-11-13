/**
 * Codici LCSC nelle BOM (Adriano 13/11/2026, DIGIFLY DGFAMv3: "molti utilizzano i loro codici nelle BOM … anche se non riesce a leggere
 * i prezzi andrebbe bene che capisse le caratteristiche per trovare delle alternative").
 * Le BOM fatte per JLCPCB/EasyEDA/KiCad hanno spesso solo il codice LCSC (C25744) al posto del P/N del produttore. La chiave ufficiale
 * delle API di LCSC non è ancora arrivata; la pagina del prodotto del sito legge però i dati da un indirizzo pubblico, senza chiave:
 *   GET https://wmsc.lcsc.com/ftps/wm/product/detail?productCode=C25744
 *   → result: productModel (P/N del produttore), brandNameEn, encapStandard (case), catalogName, productDescEn/productIntroEn,
 *     paramVOList[]{paramNameEn, paramValueEn}, productPriceList[]{ladder, usdPrice}, stockNumber, minBuyNumber, pdfUrl, alternatePartList[]
 *   Codice inesistente = result null. La ricerca per P/N del sito invece è bloccata (Access Denied): si cercano SOLO i codici LCSC.
 * Con il P/N del produttore la riga della BOM si codifica come le altre e gli altri distributori si interrogano con quello.
 * Separata dalle chiamate di rete per poterla provare nei test.
 */
import { leggiPrezzo, type Offerta } from './acquisti.js';

/** Codice LCSC ("C" + cifre, es. C25744) o null. */
export function codiceLcsc(x: unknown): string | null {
  const s = String(x ?? '').trim().toUpperCase().replace(/^LCSC[:\s#-]*/, '');
  return /^C\d{3,9}$/.test(s) ? s : null;
}

/** Colonna della BOM con i codici LCSC / JLCPCB ("LCSC Part #", "LCSC", "JLCPCB Part"). */
export const colonnaLcsc = (colonne: string[]) => colonne.findIndex(c => /LCSC|JLC/i.test(String(c ?? '')));

export interface AlternativaLcsc { codice: string; mpn: string; produttore: string; case: string | null; descrizione: string; stock: number }
export interface ProdottoLcsc {
  codice: string; mpn: string; produttore: string; case: string | null; categoria: string; descrizione: string;
  parametri: [string, string][]; stock: number; minimo: number; multiplo: number; scaglioni: { qta: number; prezzo: number }[];
  valuta: string; datasheet: string | null; url: string; ciclo: string | null; alternative: AlternativaLcsc[];
}

const testo = (x: unknown) => String(x ?? '').replace(/\s+/g, ' ').trim();
/** "SMD", "-" e simili non sono un case. */
const caseVero = (x: unknown) => { const s = testo(x); return s && !/^(SMD|SMT|THT|DIP|PLUGIN|-|N\/A)$/i.test(s) ? s : null; };
export const urlLcsc = (codice: string) => `https://www.lcsc.com/product-detail/${encodeURIComponent(codice)}.html`;

/** Dati del prodotto dalla risposta del sito (null se il codice non esiste). */
export function prodottoLcsc(risposta: any): ProdottoLcsc | null {
  const r = risposta?.result ?? null;
  const codice = codiceLcsc(r?.productCode);
  const mpn = testo(r?.productModel);
  if (!r || !codice || !mpn) return null;
  const scaglioni = (Array.isArray(r.productPriceList) ? r.productPriceList : [])
    .map((p: any) => ({ qta: Number(p?.ladder) || 0, prezzo: Number(p?.usdPrice) || leggiPrezzo(p?.productPrice) || 0 }))
    .filter((p: { qta: number; prezzo: number }) => p.qta > 0 && p.prezzo > 0).sort((a: any, b: any) => a.qta - b.qta);
  const alternative = (Array.isArray(r.alternatePartList) ? r.alternatePartList : []).map((a: any): AlternativaLcsc | null => {
    const c = codiceLcsc(a?.productCode), m = testo(a?.productModel);
    return c && m ? { codice: c, mpn: m, produttore: testo(a?.brandNameEn), case: caseVero(a?.encapStandard),
      descrizione: testo(a?.productDescEn ?? a?.productIntroEn), stock: Number(a?.stockNumber) || 0 } : null;
  }).filter((a: AlternativaLcsc | null): a is AlternativaLcsc => !!a);
  const ciclo = testo(r.productCycle);
  return {
    codice, mpn, produttore: testo(r.brandNameEn), case: caseVero(r.encapStandard),
    categoria: [testo(r.parentCatalogName), testo(r.catalogName)].filter(Boolean).join(' / '),
    descrizione: testo(r.productDescEn ?? r.productIntroEn ?? r.productNameEn),
    parametri: (Array.isArray(r.paramVOList) ? r.paramVOList : []).map((p: any) => [testo(p?.paramNameEn), testo(p?.paramValueEn)] as [string, string])
      .filter(([n, v]: [string, string]) => n && v && v !== '-'),
    stock: Number(r.stockNumber) || 0, minimo: Number(r.minBuyNumber) || 1, multiplo: Number(r.split) || 1,
    scaglioni, valuta: testo(r.currencyType || 'USD').toUpperCase(), datasheet: testo(r.pdfUrl) || null, url: urlLcsc(codice),
    ciclo: ciclo && ciclo !== 'normal' ? ciclo : (r.isDiscontinued ? 'discontinued' : null), alternative,
  };
}

/** Descrizione per la codifica: descrizione di LCSC + case + parametri (resistenza, tolleranza, tensione…). */
export function descrizioneLcsc(p: ProdottoLcsc): string {
  const par = p.parametri.filter(([n]) => !/temperature|temperatura/i.test(n)).map(([n, v]) => `${n} ${v}`);
  return [p.descrizione || p.categoria, p.case && !p.descrizione.includes(p.case) ? p.case : '', ...par].filter(Boolean).join(', ').slice(0, 400);
}

/**
 * Offerta LCSC (prezzi in dollari, il servizio li porta in euro). LCSC spedisce dalla Cina con spese e dogana: nella scelta del
 * fornitore viene DOPO gli altri distributori (`sceltaMigliore`), si compra lì solo se nessun altro ha i pezzi.
 */
export function offertaLcsc(p: ProdottoLcsc): Offerta | null {
  if (!p.scaglioni.length) return null;
  return {
    fornitore: 'lcsc', codiceFornitore: p.codice, mpn: p.mpn, produttore: p.produttore, descrizione: p.descrizione,
    stock: p.stock, moq: p.minimo, multiplo: p.multiplo, scaglioni: p.scaglioni, valuta: p.valuta,
    ciclo: [p.ciclo, 'dalla Cina: spedizione e dogana escluse'].filter(Boolean).join(' · '),
    obsoleto: /discontinu|obsolete|eol/i.test(p.ciclo ?? ''), url: p.url,
  };
}

/** Nota per la riga della BOM: cosa è il codice LCSC e le alternative che propone LCSC (stesse caratteristiche secondo LCSC). */
export function notaLcsc(p: ProdottoLcsc): string {
  const alt = p.alternative.slice(0, 3).map(a => `${a.mpn}${a.produttore ? ` (${a.produttore})` : ''}`);
  return `LCSC ${p.codice} = ${[p.produttore, p.mpn].filter(Boolean).join(' ')}: ${p.descrizione || p.categoria}`
    + (alt.length ? `. LCSC propone anche: ${alt.join(', ')}` : '');
}

/** Nomi dei parametri LCSC (senza spazi e segni) → nomi DigiKey che legge `daDigikey`. */
const PARAMETRI_DK: Record<string, string[]> = {
  resistance: ['Resistance'], tolerance: ['Tolerance'], powerwatts: ['Power (Watts)'], capacitance: ['Capacitance'],
  voltagerating: ['Voltage - Rated', 'Voltage Rating - DC'], ratedvoltage: ['Voltage - Rated', 'Voltage Rating - DC'],
  temperaturecoefficient: ['Temperature Coefficient'], inductance: ['Inductance'], currentrating: ['Current Rating (Amps)'],
  ratedcurrent: ['Current Rating (Amps)'], dcresistancedcr: ['DC Resistance (DCR)'], frequency: ['Frequency'],
  numberofcontacts: ['Number of Positions'], numberofpins: ['Number of Positions'], pitch: ['Pitch - Mating'],
};
const chiaveParametro = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
/** Valore LCSC nel formato DigiKey: Ω → Ohms, "16P" → "16", passo "1.27mm" → "(1.27mm)", USB "Type-C" → "USB-C". */
function valoreDk(dk: string, v: string): string {
  if (dk === 'Number of Positions') return v.replace(/P$/i, '');
  if (dk === 'Pitch - Mating') { const m = v.match(/([\d.]+)\s*mm/i); return m ? `(${m[1]}mm)` : v; }
  if (dk === 'Connector Type' && /^type-?c$/i.test(v.trim())) return 'USB-C';
  return v.replace(/Ω/g, ' Ohms');
}
/** Categorie LCSC con nomi diversi da DigiKey (il resto si legge uguale). */
const categoriaDk = (c: string) => c.replace(/^Transistors\/Thyristors$/i, 'Transistors').replace(/Bipolar Transistors?/i, 'Bipolar (BJT)')
  .replace(/MOSFETs?/i, 'FETs, MOSFETs')
  // gruppi di integrati di LCSC (DigiKey li ha tutti sotto "Integrated Circuits")
  .replace(/^.*(Amplifiers|Comparators|Processors|Controllers|Memory|Interface|Logic|Clock|Timing|Data Acquisition|Driver ICs).*$/i, 'Integrated Circuits');
/** Case che dice davvero il formato: "SMD3215-2P", "SMD,P=1.27mm" e simili non servono (meglio l'impronta della BOM). */
const caseUtile = (c: string | null) => !!c && !/^(SMD|SMT|TH|PLUG)/i.test(c);

/**
 * Il prodotto LCSC nella forma dei dati DigiKey (categoria, descrizione, parametri, case, montaggio), così la codifica ricava la famiglia
 * e i dati come fa con DigiKey quando DigiKey non ha il componente (marche cinesi che si trovano solo su LCSC).
 */
export function prodottoDkDaLcsc(p: ProdottoLcsc) {
  const [madre, figlia] = p.categoria.split(' / ').map(categoriaDk);
  const testoMontaggio = `${p.descrizione} ${p.categoria}`;
  const montaggio = /through hole|plugin|\bTHT\b|\bDIP\b/i.test(testoMontaggio) ? 'Through Hole' : /surface mount|\bSMD\b|\bSMT\b/i.test(testoMontaggio) ? 'Surface Mount' : '';
  const par: { ParameterText: string; ValueText: string }[] = [];
  for (const [n, v] of p.parametri) for (const dk of PARAMETRI_DK[chiaveParametro(n)] ?? [n]) par.push({ ParameterText: dk, ValueText: valoreDk(dk, v) });
  if (caseUtile(p.case)) {
    // chip "0402" come DigiKey "0402 (1005 Metric)"; gli altri (SOT-523, WQFN-18(2.5x3)) come "Supplier Device Package"
    if (/^\d{4,5}$/.test(p.case!)) par.push({ ParameterText: 'Package / Case', ValueText: `${p.case} (pollici)` });
    else par.push({ ParameterText: 'Supplier Device Package', ValueText: p.case! });
  }
  if (montaggio && !par.some(x => x.ParameterText === 'Mounting Type')) par.push({ ParameterText: 'Mounting Type', ValueText: montaggio });
  return {
    ManufacturerProductNumber: p.mpn, Manufacturer: { Name: p.produttore },
    Description: { ProductDescription: p.descrizione, DetailedDescription: p.descrizione },
    Category: { Name: madre ?? '', ChildCategories: figlia ? [{ Name: figlia, ChildCategories: [] }] : [] },
    Parameters: par,
  };
}
