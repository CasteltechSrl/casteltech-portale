/**
 * Regole aggiunte alla codifica e ricerca dei compatibili (Adriano 1/11/2026): famiglie nuove, case nuovi, categorie DigiKey lette
 * dalla più specifica, Arrow, compatibile "da verificare" che dà il prezzo quando il P/N non si trova.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcola, caseLookup, FAMIGLIE, VER, OK } from '../src/engine/codifica/regole.js';
import { famigliaDaDk, daDigikey } from '../src/engine/codifica/digikey-dati.js';
import { daColonneBom, famigliaDa } from '../src/engine/codifica/decoder.js';
import { REGISTRO_AGGIUNTE } from '../src/engine/codifica/aggiunte.js';
import { offerteArrow } from '../src/engine/arrow.js';
import { pnKey } from '../src/engine/codifica/bom.js';
import { NOMI_FORNITORI, type Offerta } from '../src/engine/acquisti.js';

const offerta = (x: Partial<Offerta>): Offerta => ({ fornitore: 'digikey', codiceFornitore: 'X', mpn: 'P', produttore: '', descrizione: '', stock: 100000, moq: 1, multiplo: 1,
  scaglioni: [{ qta: 1, prezzo: 0.1 }], valuta: 'EUR', ...x });

test('categorie DigiKey: si legge prima la più specifica', () => {
  assert.equal(famigliaDaDk(['Crystals, Oscillators, Resonators', 'Oscillators'], {}, ''), 'OS');
  assert.equal(famigliaDaDk(['Crystals, Oscillators, Resonators', 'Crystals'], {}, ''), 'QZ');
  assert.equal(famigliaDaDk(['Crystals, Oscillators, Resonators', 'Resonators'], {}, ''), 'RI');
  assert.equal(famigliaDaDk(['Circuit Protection', 'TVS', 'Varistors, MOVs'], {}, ''), 'VR');
  assert.equal(famigliaDaDk(['Circuit Protection', 'TVS', 'TVS Diodes'], {}, ''), 'SP');
  assert.equal(famigliaDaDk(['Potentiometers, Variable Resistors', 'Trimmer Potentiometers'], {}, ''), 'PO');
  assert.equal(famigliaDaDk(['Resistors', 'Chip Resistor - Surface Mount'], {}, ''), 'RS');
  assert.equal(famigliaDaDk(['Resistors', 'Resistor Networks, Arrays'], {}, ''), 'RR');
  assert.equal(famigliaDaDk(['Sensors, Transducers', 'Temperature Sensors', 'NTC Thermistors'], {}, ''), 'NT');
  assert.equal(famigliaDaDk(['Capacitors', 'Film Capacitors'], {}, ''), 'CF');
  assert.equal(famigliaDaDk(['Isolators', 'Optoisolators - Transistor, Photovoltaic Output'], {}, ''), 'IC');
  assert.equal(famigliaDaDk(['Battery Products', 'Battery Holders, Clips, Contacts'], {}, ''), 'BT');
  assert.equal(famigliaDaDk(['RF and Wireless', 'RF Antennas'], {}, ''), 'AN');
  assert.equal(famigliaDaDk(['Power Supplies - Board Mount', 'DC DC Converters'], {}, ''), 'CV');
  assert.equal(famigliaDaDk(['Filters', 'Common Mode Chokes'], {}, ''), 'FE');
  assert.equal(famigliaDaDk(['Filters', 'Ferrite Beads and Chips'], {}, ''), 'FR');
  assert.equal(famigliaDaDk(['Discrete Semiconductor Products', 'Diodes', 'Rectifiers', 'Single Diodes'], { 'Technology': 'Schottky' }, ''), 'DS');
  assert.equal(famigliaDaDk(['Sensors, Transducers', 'Accelerometers'], {}, ''), 'MI'); // come prima
});

test('famiglie nuove: film, termistori, batterie, antenne con codici come le famiglie vicine', () => {
  for (const f of ['CF', 'NT', 'BT', 'AN']) assert.ok(FAMIGLIE[f], f);
  const film = daDigikey({ Category: { Name: 'Capacitors', ChildCategories: [{ Name: 'Film Capacitors' }] },
    Parameters: [{ ParameterText: 'Capacitance', ValueText: '100 nF' }, { ParameterText: 'Tolerance', ValueText: '±10%' },
      { ParameterText: 'Voltage Rating - DC', ValueText: '275V' }, { ParameterText: 'Lead Spacing', ValueText: '0.591" (15.00mm)' },
      { ParameterText: 'Mounting Type', ValueText: 'Through Hole' }] });
  assert.equal(film.famiglia, 'CF');
  assert.equal(film.attributi.case, 'P150');
  const cf = calcola('CF', film.attributi, 'B32922C3104K');
  assert.equal(cf.prod, 'CF-P150-100NF-10-275V');
  assert.equal(cf.root, 'TCF-P150-100NX'); // 275 V non è nella tabella delle tensioni: X, come per i ceramici
  const nt = calcola('NT', { case: '0603', valore: '10K', tolleranza: '1' }, 'NCP18XH103F03RB');
  assert.equal(nt.prod, 'NT-0603-10K-1');
  assert.equal(nt.root, 'SNT-0603-10K0F');
  const bt = calcola('BT', { tipo: 'PORTABATTERIA', tecnologia: 'T' }, 'BK-912');
  assert.equal(bt.prod, 'BT-PORTABATTERIA-BK-912');
  assert.equal(bt.root, 'TBT-PBAT-BK912');
  assert.equal(calcola('AN', { tipo: 'CHIP' }, '2450AT18A100E').root, 'SAN-ANTC-2450A');
  assert.ok(REGISTRO_AGGIUNTE.some(v => v.cosa.startsWith('CF')), 'ogni aggiunta è nel registro');
});

test('case aggiunti: sinonimi esatti OK, simili da verificare, nuovi con codice nuovo', () => {
  assert.deepEqual(caseLookup('TO-252').slice(0, 3), ['DPAK', 'S', OK]);
  assert.deepEqual(caseLookup('SC-70-3').slice(0, 3), ['T323', 'S', OK]);
  assert.deepEqual(caseLookup('TSOT-23-5').slice(0, 3), ['T235', 'S', VER]);
  assert.deepEqual(caseLookup('TO-247').slice(0, 3), ['T247', 'T', OK]);
  assert.deepEqual(caseLookup('8-WSON').slice(0, 3), ['DN08', 'S', VER]);
  assert.deepEqual(caseLookup('100-TFBGA').slice(0, 3), ['B100', 'S', VER]);
  assert.deepEqual(caseLookup('16-DIP').slice(0, 3), ['DP16', 'T', VER]);
  assert.deepEqual(caseLookup('SOIC-8').slice(0, 3), ['SO08', 'S', OK]); // invariato
});

test('parole e riferimenti della BOM per le famiglie nuove', () => {
  assert.equal(famigliaDa(null, 'NTC 10K 1% 0603'), 'NT');
  assert.equal(famigliaDa(null, 'Trimmer 10k'), 'PO');
  assert.equal(famigliaDa(null, 'Battery holder CR2032'), 'BT');
  assert.equal(famigliaDa(null, 'CAP FILM 100nF 275VAC X2'), 'CF');
  assert.equal(famigliaDa(null, 'MKP 1uF 400V'), 'CF');
  assert.equal(famigliaDa(null, 'Optocoupler PC817'), 'IC');
  assert.equal(famigliaDa(null, 'RES 10K 0603'), 'RS'); // come prima
  assert.equal(famigliaDa('BT1', null), 'BT');
  assert.equal(famigliaDa('RT1', null), 'NT');
  assert.equal(famigliaDa('R1', null), 'RS');
  const [f, a] = daColonneBom(null, '10K', '0603', 'NTC thermistor 1%', 'RT2');
  assert.equal(f, 'NT'); assert.equal(a.valore, '10K'); assert.equal(a.case, '0603');
});

test('Arrow: lettura tollerante della risposta ItemService v4', () => {
  assert.equal(NOMI_FORNITORI.arrow, 'Arrow');
  const risposta = { itemserviceresult: { data: [{ PartList: [
    { partNum: 'BAV99', manufacturer: { mfrName: 'Nexperia' }, desc: 'Diode Switching', status: 'Active', InvOrg: { webSites: [
      { code: 'Verical.com', sources: [{ currency: 'USD', sourceParts: [{ sourcePartNumber: 'V1', Prices: { resaleList: [{ price: 0.5, minQty: 1 }] }, Availability: [{ fohQty: 5 }] }] }] },
      { code: 'arrow.com', sources: [
        { currency: 'USD', sourceParts: [{ sourcePartNumber: 'A-US', minimumOrderQuantity: 10, Prices: { resaleList: [{ price: 0.02, minQty: 10 }, { price: 0.015, minQty: 3000 }] }, Availability: [{ fohQty: 12000 }], mfrLeadTime: 8 }] },
        { currency: 'EUR', sourceParts: [{ sourcePartNumber: 'A-EU', containerType: 'Reel', packSize: 3000, minimumOrderQuantity: 3000, Prices: { resaleList: [{ price: '0.018', minQty: 3000 }] }, Availability: [{ fohQty: 30000 }] }] }] }] } },
    { partNum: 'BAV99W', manufacturer: { mfrName: 'Nexperia' }, InvOrg: { webSites: [{ code: 'arrow.com', sources: [{ currency: 'EUR', sourceParts: [{ Prices: { resaleList: [{ price: 0.03, minQty: 1 }] } }] }] }] } },
  ] }] } };
  const o = offerteArrow('BAV99', risposta);
  assert.equal(o.length, 2, 'solo arrow.com (Verical solo se manca), solo lo stesso P/N');
  assert.equal(o[0].valuta, 'EUR');
  assert.equal(o[0].multiplo, 3000);
  assert.equal(o[1].moq, 10);
  assert.equal(o[1].stock, 12000);
  assert.equal(o[1].scaglioni[1].prezzo, 0.015);
  assert.equal(offerteArrow('BAV99', risposta, { varianti: true }).length, 3);
  assert.deepEqual(offerteArrow('BAV99', {}), []);
});

test('compatibile da verificare: dà il prezzo quando il P/N non si trova, mai un "simile" o con caratteristiche diverse', async () => {
  process.env.DATABASE_URL ??= 'postgres://solo-per-i-test@localhost/nessuno';
  const { compatibileProposto, calcolaAcquistiCon, problemiBom, ESITI, FONTI_ALTERNATIVA, SOSTITUTO_DIRETTO } = await import('../src/server/codifica-servizio.js');
  const { REGOLE_SCARTO_DEFAULT } = await import('../src/engine/acquisti.js');
  const alt = (mpn: string, fonte: string, x: any = {}, prezzo = 0.1) => ({ mpn, produttore: '', descrizione: '', fonte, identica: null, offerte: [offerta({ mpn, scaglioni: [{ qta: 1, prezzo }] })], ...x });
  assert.ok(SOSTITUTO_DIRETTO.test('Direct') && SOSTITUTO_DIRETTO.test('Parametric Equivalent') && !SOSTITUTO_DIRETTO.test('Similar') && !SOSTITUTO_DIRETTO.test('Upgrade'));
  // il sostituto solo "simile" e quella con caratteristiche diverse non si propongono mai
  assert.equal(compatibileProposto([alt('S', FONTI_ALTERNATIVA.SOSTITUTO, { diretto: false }, 0.01), alt('D', FONTI_ALTERNATIVA.STESSE, { identica: false }, 0.01)], 10), null);
  // ordine: variante dello stesso P/N, stesse caratteristiche, sostituto diretto, IA
  const lista = [alt('IA1', FONTI_ALTERNATIVA.IA, {}, 0.01), alt('SOS', FONTI_ALTERNATIVA.SOSTITUTO, { diretto: true }, 0.02), alt('VAR', FONTI_ALTERNATIVA.VARIANTE, {}, 0.5)];
  assert.equal(compatibileProposto(lista, 10)?.mpn, 'VAR');
  assert.equal(compatibileProposto(lista.slice(0, 2), 10)?.mpn, 'SOS');
  // prima quelle disponibili nella quantità
  assert.equal(compatibileProposto([alt('VAR', FONTI_ALTERNATIVA.VARIANTE, { offerte: [offerta({ mpn: 'VAR', stock: 1 })] }), alt('IA1', FONTI_ALTERNATIVA.IA)], 100)?.mpn, 'IA1');
  // negli acquisti: si prezza il compatibile ma la riga resta "attenzione" e lo dice
  const r: any = { n: 1, pn: 'INTROVABILE-2', esito: ESITI.NUOVO, famiglia: 'IC', attributi: {}, qtaScheda: 1, note: [], fonti: [], offerte: [], acquisti: [],
    alternative: [alt('SOS', FONTI_ALTERNATIVA.SOSTITUTO, { diretto: true })], alternativaScelta: null, alternativaProposta: 'SOS' };
  const prima = process.env.MOUSER_API_KEY;
  process.env.MOUSER_API_KEY = 'x';
  try {
    calcolaAcquistiCon([r], [100], REGOLE_SCARTO_DEFAULT, new Map([[pnKey('INTROVABILE-2')!, { mouser: { offerte: [] } }]]));
    assert.equal(r.acquisti[0].scelta.mpn, 'SOS');
    assert.equal(r.reperibilita.livello, 'attenzione');
    assert.match(r.reperibilita.motivi[0], /compatibile SOS.*DA VERIFICARE/);
    assert.ok(problemiBom([r], { senzaPrezzo: 0, nonDisponibili: 0 }).includes('1 codice compatibile da verificare'));
    // confermato dall'operatore: non è più da verificare
    r.alternativaScelta = 'SOS'; r.alternativaProposta = null;
    calcolaAcquistiCon([r], [100], REGOLE_SCARTO_DEFAULT, new Map());
    assert.equal(r.reperibilita.livello, 'ok');
  } finally { if (prima === undefined) delete process.env.MOUSER_API_KEY; else process.env.MOUSER_API_KEY = prima; }
});
