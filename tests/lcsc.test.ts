/**
 * Codici LCSC nelle BOM (Adriano 13/11/2026, DIGIFLY DGFAMv3 "tutta su LCSC"): dal codice C… il P/N del produttore, case,
 * caratteristiche e alternative di LCSC; prezzi in dollari; LCSC si sceglie solo se nessun altro distributore ha i pezzi.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codiceLcsc, colonnaLcsc, descrizioneLcsc, notaLcsc, offertaLcsc, prodottoDkDaLcsc, prodottoLcsc } from '../src/engine/lcsc.js';
import { sceltaMigliore, type Offerta } from '../src/engine/acquisti.js';

// risposta vera del sito (ridotta) per C25744
const RISPOSTA = { code: 200, ok: true, result: {
  productCode: 'C25744', productModel: '0402WGF1002TCE', brandNameEn: 'UNI-ROYAL', encapStandard: '0402',
  parentCatalogName: 'Resistors', catalogName: 'Chip Resistor - Surface Mount', productDescEn: '10kΩ ±1% 62.5mW 0402 Thick Film Resistor',
  paramVOList: [{ paramNameEn: 'Resistance', paramValueEn: '10kΩ' }, { paramNameEn: 'Tolerance', paramValueEn: '±1%' },
    { paramNameEn: 'Operating Temperature', paramValueEn: '-55℃~+155℃' }],
  productPriceList: [{ ladder: 1000, usdPrice: 0.0008 }, { ladder: 100, usdPrice: 0.0011 }],
  stockNumber: 2500, minBuyNumber: 100, split: 100, currencyType: 'USD', productCycle: 'normal',
  pdfUrl: 'https://datasheet.lcsc.com/x.pdf',
  alternatePartList: [{ productCode: 'C2759535', productModel: 'HP02WAF1002TCE', brandNameEn: 'UNI-ROYAL', encapStandard: '0402',
    productDescEn: '10kΩ ±1% 100mW 0402 Thick Film Resistor AEC-Q200', stockNumber: 6300 }],
} };

test('LCSC: riconosce i codici C… e la colonna della BOM', () => {
  for (const c of ['C25744', 'c2913206', ' C307331 ', 'LCSC: C96446']) assert.ok(codiceLcsc(c), c);
  for (const c of ['0402WGF1002TCE', 'C1', 'CAP-100N', 'C25744A', '', null]) assert.equal(codiceLcsc(c), null, String(c));
  assert.equal(colonnaLcsc(['Designator', 'Footprint', 'Quantity', 'Value', 'LCSC Part #']), 4);
  assert.equal(colonnaLcsc(['Designator', 'JLCPCB Part']), 1);
  assert.equal(colonnaLcsc(['Designator', 'MPN']), -1);
});

test('LCSC: P/N del produttore, case, caratteristiche e alternative dalla pagina del prodotto', () => {
  const p = prodottoLcsc(RISPOSTA)!;
  assert.equal(p.mpn, '0402WGF1002TCE');
  assert.equal(p.produttore, 'UNI-ROYAL');
  assert.equal(p.case, '0402');
  assert.deepEqual(p.scaglioni.map(s => s.qta), [100, 1000]);
  assert.equal(p.ciclo, null);
  assert.equal(p.alternative[0].mpn, 'HP02WAF1002TCE');
  const d = descrizioneLcsc(p);
  assert.match(d, /10kΩ ±1% 62\.5mW 0402/);
  assert.match(d, /Tolerance ±1%/);
  assert.doesNotMatch(d, /Temperature/);
  assert.match(notaLcsc(p), /LCSC C25744 = UNI-ROYAL 0402WGF1002TCE.*propone anche: HP02WAF1002TCE/);
  // codice inesistente: il sito risponde 200 con result null
  assert.equal(prodottoLcsc({ code: 200, ok: true, result: null }), null);
  // modulo con case "SMD": non è un case
  assert.equal(prodottoLcsc({ result: { ...RISPOSTA.result, encapStandard: 'SMD' } })!.case, null);
});

test('LCSC: offerta in dollari, scelta solo se nessun altro distributore ha i pezzi', () => {
  const o = offertaLcsc(prodottoLcsc(RISPOSTA)!)!;
  assert.equal(o.fornitore, 'lcsc');
  assert.equal(o.codiceFornitore, 'C25744');
  assert.equal(o.valuta, 'USD');
  assert.match(o.ciclo!, /Cina/);
  const lcsc: Offerta = { ...o, valuta: 'EUR', scaglioni: [{ qta: 1, prezzo: 0.001 }], moq: 1, multiplo: 1 };
  const mouser: Offerta = { fornitore: 'mouser', codiceFornitore: '603-X', mpn: o.mpn, produttore: 'UNI-ROYAL', descrizione: '', stock: 10000,
    moq: 1, multiplo: 1, scaglioni: [{ qta: 1, prezzo: 0.05 }], valuta: 'EUR' };
  assert.equal(sceltaMigliore([lcsc, mouser], 100)!.offerta.fornitore, 'mouser');
  assert.equal(sceltaMigliore([lcsc, { ...mouser, stock: 0 }], 100)!.offerta.fornitore, 'lcsc');
});

test('LCSC: la codifica legge categoria e dati di LCSC come quelli di DigiKey (componenti che DigiKey non ha)', async () => {
  const { daDigikey } = await import('../src/engine/codifica/digikey-dati.js');
  const base = RISPOSTA.result;
  const fam = (categoria: [string, string], parametri: [string, string][] = [], descr = '', encap = '') => daDigikey(prodottoDkDaLcsc(prodottoLcsc({ result: {
    ...base, parentCatalogName: categoria[0], catalogName: categoria[1], productDescEn: descr, encapStandard: encap,
    paramVOList: parametri.map(([n, v]) => ({ paramNameEn: n, paramValueEn: v })) } })!));
  assert.equal(fam(['Switches', 'Tactile Switches'], [], 'Tactile Switch SPST Through Hole').famiglia, 'IT');
  assert.equal(fam(['Transistors/Thyristors', 'Single Bipolar Transistors'], [], '', 'SOT-523').famiglia, 'TB');
  assert.equal(fam(['Power Management (PMIC)', 'Battery Chargers']).famiglia, 'IC');
  assert.equal(fam(['Amplifiers/Comparators', 'Audio Amplifiers']).famiglia, 'IC');
  const usb = fam(['Connectors', 'USB, DVI, HDMI Connector Assemblies'], [['Connector Type', 'Type-C'], ['Number of Contacts', '16P']], 'USB-C Receptacle Surface Mount');
  assert.equal(usb.famiglia, 'CN');
  assert.equal(usb.attributi.tipo, 'USBC');
  assert.equal(usb.attributi.poli, '16');
  const r = fam(['Resistors', 'Chip Resistor - Surface Mount'], [['Resistance', '10kΩ'], ['Tolerance', '±1%']], '10kΩ ±1% 0402', '0402');
  assert.equal(r.famiglia, 'RS');
  assert.equal(r.attributi.case, '0402');
});
