import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcola, progNum, progStr } from '../src/engine/codifica/regole.js';
import { daColonneBom, decodificaMpn } from '../src/engine/codifica/decoder.js';
import { elencoDesignatori, leggiCsv, pnKey, quantitaRiga, regolaResistenze, rigaIntestazione, rilevaColonne } from '../src/engine/codifica/bom.js';
import { acquisto, leggiPrezzo, pezziScarto, reperibilita, sceltaMigliore, type Offerta } from '../src/engine/acquisti.js';
import { leggiJson } from '../src/server/lettura-ia.js';

test('codifica: resistenza 2,2k 0603 senza P/N → 1% e potenza standard', () => {
  const [fam, a] = daColonneBom(null, '2,2k', 'R_0603_1608Metric', 'Resistenza', 'R10');
  assert.equal(fam, 'RS');
  const r = regolaResistenze(fam, a);
  const c = calcola(fam, r.attributi, null);
  assert.equal(c.prod, 'RS-0603-2K2-1-100MW');
  assert.equal(c.root, 'SRS-0603-2K20F');
});

test('codifica: le resistenze si comprano solo all\'1% (le 5% no), sotto l\'1% si tiene la tolleranza', () => {
  assert.equal(regolaResistenze('RS', { tolleranza: '5' }).attributi.tolleranza, '1');
  assert.equal(regolaResistenze('RS', { tolleranza: '5%' }).attributi.tolleranza, '1');
  assert.equal(regolaResistenze('RS', {}).attributi.tolleranza, '1');
  assert.equal(regolaResistenze('RS', { tolleranza: '0.1' }).attributi.tolleranza, '0.1');
  assert.equal(regolaResistenze('CC', { tolleranza: '10' }).attributi.tolleranza, '10');
});

test('codifica: P/N noti (come il programma Codifica componenti)', () => {
  const [fam, a] = decodificaMpn('RC0402FR-0710KL');
  assert.equal(fam, 'RS');
  const c = calcola(fam, a, 'RC0402FR-0710KL');
  assert.equal(c.prod, 'RS-0402-10K-1-63MW');
  assert.equal(c.root, 'SRS-0402-10K0F');
  const cc = calcola(...decodificaMpn('GRM188R71H104KA93D'), 'GRM188R71H104KA93D');
  assert.equal(cc.prod, 'CC-0603-100NF-10-X7R-50V');
  assert.equal(cc.root, 'SCC-0603-100NH');
  assert.equal(calcola('IC', { case: 'TSSOP-14' }, 'MCP2221AI/ST').root, 'SIC-TS14-MCP22');
  assert.deepEqual([0, 1, 33, 34].map(progStr), ['000', '001', '00Z', '010']);
  assert.equal(progNum('00Z'), 33);
});

test('BOM: intestazione, colonne, quantità dai designatori', () => {
  const righe = [['BOM scheda'], [], ['Comment', 'Description', 'Designator', 'Footprint', 'Manufacturer Part Number', 'Quantity'], ['10k', 'RES', 'R1,R2', '0402', 'X', '2']];
  assert.equal(rigaIntestazione(righe), 2);
  const m = rilevaColonne(righe[2]);
  assert.equal(m.pn, 'Manufacturer Part Number'); assert.equal(m.quantita, 'Quantity'); assert.equal(m.designatori, 'Designator');
  assert.deepEqual(elencoDesignatori('R1-R4, C1'), ['R1', 'R2', 'R3', 'R4', 'C1']);
  assert.equal(quantitaRiga('', 'R1, R2, R3').qta, 3);
  assert.equal(quantitaRiga('2', 'R1').nota, 'quantità 2 ma 1 designatori');
  assert.equal(pnKey('1PRC0402FR-0710KL'), 'RC0402FR0710KL');
  assert.deepEqual(leggiCsv('a;b\n"x;y";2\n', ';'), [['a', 'b'], ['x;y', '2']]);
});

test('acquisti: scarto 10% passivi economici, 5% sotto 1 €, +1 tra 1 e 3 €, niente oltre 3 €', () => {
  assert.deepEqual(pezziScarto('RS', 0.004, 300).pezzi, 30);
  assert.deepEqual(pezziScarto('CC', 0.5, 100).pezzi, 5);    // passivo non economico: regola dei 5%
  assert.deepEqual(pezziScarto('IC', 0.8, 101).pezzi, 6);    // arrotondato per eccesso
  assert.deepEqual(pezziScarto('IC', 2, 100).pezzi, 1);
  assert.deepEqual(pezziScarto('IC', 3.5, 100).pezzi, 0);
  assert.deepEqual(pezziScarto('RS', null, 100).pezzi, 10);  // senza prezzo un passivo è economico
});

const offerta = (x: Partial<Offerta>): Offerta => ({ fornitore: 'digikey', codiceFornitore: 'X', mpn: 'P', produttore: '', descrizione: '', stock: 100000, moq: 1, multiplo: 1,
  scaglioni: [{ qta: 1, prezzo: 0.1 }, { qta: 100, prezzo: 0.02 }, { qta: 1000, prezzo: 0.005 }], valuta: 'EUR', ...x });

test('acquisti: minimo d\'ordine, multipli e scaglione superiore più conveniente', () => {
  assert.deepEqual(acquisto(offerta({}), 80), { qta: 100, prezzo: 0.02, totale: 2, nota: '100 pz costano meno di 80' });
  assert.equal(acquisto(offerta({}), 900)!.qta, 1000);       // 1000 × 0,005 = 5 € < 900 × 0,02 = 18 €
  assert.equal(acquisto(offerta({ moq: 4000, multiplo: 4000, scaglioni: [{ qta: 4000, prezzo: 0.001 }] }), 220)!.qta, 4000);
  const s = sceltaMigliore([offerta({ fornitore: 'mouser', stock: 10 }), offerta({ fornitore: 'farnell', scaglioni: [{ qta: 1, prezzo: 0.03 }] })], 50);
  assert.equal(s!.offerta.fornitore, 'farnell');             // mouser costa meno ma non ne ha abbastanza
  assert.equal(leggiPrezzo('0,38 €'), 0.38); assert.equal(leggiPrezzo('€1.234,50'), 1234.5); assert.equal(leggiPrezzo('0.1'), 0.1);
});

test('acquisti: reperibilità', () => {
  assert.equal(reperibilita([], 10).livello, 'critico');
  assert.equal(reperibilita([offerta({ stock: 5 })], 10).livello, 'critico');
  assert.equal(reperibilita([offerta({ ciclo: 'Obsolete', obsoleto: true })], 10).livello, 'critico');
  assert.equal(reperibilita([offerta({ ciclo: 'Last Time Buy' })], 10).livello, 'attenzione');
  assert.equal(reperibilita([offerta({ stock: 20 })], 10).livello, 'attenzione');           // scorte basse
  assert.equal(reperibilita([offerta({}), offerta({ fornitore: 'mouser' })], 10).livello, 'ok');
});

test('IA: risposta JSON anche con testo intorno', () => {
  assert.deepEqual(leggiJson('Ecco:\n```json\n[{"riga": 3, "famiglia": "RS"}]\n```'), [{ riga: 3, famiglia: 'RS' }]);
  assert.deepEqual(leggiJson('niente'), []);
});

test('TME v2: prodotti e prezzi letti con i nomi dei campi della documentazione ufficiale', async () => {
  const { offerteTme, elementiTme } = await import('../src/engine/tme.js');
  const prodotti = elementiTme({ data: { elements: [
    { symbol: 'RC0603FR-072K2L', manufacturer_symbols: ['RC0603FR-072K2L'], manufacturer: { id: 1, name: 'YAGEO' },
      description: 'Resistore 2,2kΩ 0603', minimal_amount: 100, multiples: 100, product_status: ['AVAILABLE_WHILE_STOCKS_LAST'] },
    { symbol: 'ALTRO', manufacturer_symbols: ['ALTRO-PN'], manufacturer: { name: 'X' }, minimal_amount: 1, multiples: 1, product_status: [] },
  ] } });
  const dati = elementiTme({ data: { elements: [
    { symbol: 'RC0603FR-072K2L', stock_quantity: 25000, prices: { currency: 'EUR', type: 'NET', elements: [{ amount: 1000, price: 0.0021 }, { amount: 100, price: 0.004 }] } },
  ] } });
  const r = offerteTme(['rc0603fr-072k2l', 'ALTRO-PN'], prodotti, dati);
  const [o] = r.get('rc0603fr-072k2l')!;
  assert.equal(o.codiceFornitore, 'RC0603FR-072K2L');
  assert.equal(o.produttore, 'YAGEO');
  assert.equal(o.stock, 25000);
  assert.equal(o.moq, 100);
  assert.deepEqual(o.scaglioni, [{ qta: 100, prezzo: 0.004 }, { qta: 1000, prezzo: 0.0021 }]);
  assert.equal(o.fineVita, true);
  assert.equal(o.obsoleto, false);
  assert.deepEqual(r.get('ALTRO-PN'), []); // senza prezzi non è un'offerta
});
