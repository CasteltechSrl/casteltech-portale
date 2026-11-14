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
  assert.equal(cf.prod, 'CF-THT-P150-100NF-10-275V');
  assert.equal(cf.root, 'TCF-P150-100NX'); // 275 V non è nella tabella delle tensioni: X, come per i ceramici
  const nt = calcola('NT', { case: '0603', valore: '10K', tolleranza: '1' }, 'NCP18XH103F03RB');
  assert.equal(nt.prod, 'NT-0603-10K-1');
  assert.equal(nt.root, 'SNT-0603-10K0F');
  const bt = calcola('BT', { tipo: 'PORTABATTERIA', tecnologia: 'T' }, 'BK-912');
  assert.equal(bt.prod, 'BT-THT-PORTABATTERIA-BK-912');
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

test('codifica Croci (4/11/2026): THT dopo la famiglia, case IC come SOIC8, morsetti in TI con poli prima del passo', () => {
  assert.equal(calcola('IC', { case: '8SOIC', tecnologia: 'S' }, 'LM358DR').prod, 'IC-SOIC8-LM358DR');
  const dip = calcola('IC', { case: '8DIP', tecnologia: 'T' }, 'NE555P');
  assert.equal(dip.prod, 'IC-THT-DIP8-NE555P');
  assert.equal(dip.prodPrima, 'IC-DIP8-NE555P', 'il codice di prima serve a ritrovare i componenti già in archivio');
  const mors = calcola('CN', { tipo: 'MORSETTO', passo: '5.08', poli: '2', tecnologia: 'T' }, '1729128');
  assert.equal(mors.famiglia, 'TI');
  assert.equal(mors.prod, 'TI-THT-MORSETTO-2-508-1729128');
  // il case "THT" già scritto non si ripete
  assert.equal(calcola('CN', { tipo: 'RJ45', passo: '1.02', poli: '8', case: 'THT', tecnologia: 'T' }, 'HR911105A').prod, 'CN-THT-RJ45-102-8-HR911105A');
});

test('righe da completare del 4/11/2026: categorie DigiKey, SOT-23-THIN, induttanze con decimali, quarzi Abracon, USB-B', async () => {
  const { decodificaMpn } = await import('../src/engine/codifica/decoder.js');
  const { connettoreStandard } = await import('../src/engine/codifica/famiglia-proposta.js');
  // AP22913 / MIC2981: "Power Distribution Switches, Load Drivers" sono integrati, non interruttori
  assert.equal(famigliaDaDk(['Integrated Circuits (ICs)', 'Power Management (PMIC)', 'Power Distribution Switches, Load Drivers'], {}, ''), 'IC');
  assert.equal(famigliaDaDk(['Integrated Circuits (ICs)', 'Power Management (PMIC)', 'LED Drivers'], {}, ''), 'IC');
  assert.equal(famigliaDaDk(['Switches', 'Tactile Switches'], {}, ''), 'IT');
  // LMR51430YDDCR
  assert.equal(calcola('IC', { case: 'SOT-23-6 THIN' }, 'LMR51430YDDCR').root, 'SIC-T236-LMR51');
  assert.equal(caseLookup('SOT-23-THIN')[2], VER);
  // SRP5030T-3R3M: DigiKey dà 5.7X5.2
  assert.equal(calcola('ID', { case: '5.7X5.2', valore: '3.3uH' }, 'SRP5030T-3R3M').root, 'SID-0505-3U30X');
  // ABM8G: case dalla serie, frequenza dal P/N
  const [fam, a] = decodificaMpn('ABM8G-25.000MHZ-18-D2Y-T');
  assert.equal(fam, 'QZ'); assert.equal(a.case, '3225'); assert.equal(a.valore, '25MHz');
  assert.equal(calcola('QZ', a, 'ABM8G-25.000MHZ-18-D2Y-T').root, 'SQZ-3225-25M0X');
  assert.equal(decodificaMpn('ABM8G-12.000MHZ-D2Y-T')[1].case, '3225');
  // presa USB-B senza passo: valori standard (4 poli, 2,5 mm), solo quelli che mancano
  const std = connettoreStandard('CN', { tipo: 'USBB', case: 'THT', tecnologia: 'T' })!;
  assert.equal(std.attributi.passo, '2.5'); assert.equal(std.attributi.poli, '4');
  assert.equal(calcola('CN', std.attributi, '5787834-1').root, 'TCN-USBB-25004');
  assert.equal(connettoreStandard('CN', { tipo: 'USBB', passo: '2.0', poli: '4' }), null);
  assert.equal(connettoreStandard('MI', { tipo: 'USBB' }), null);
  // DigiKey: tipo USB prima di "Receptacle"
  const dk = daDigikey({ ManufacturerProductNumber: '5787834-1', Description: { ProductDescription: 'CONN RCPT USB-B 4POS' },
    Category: { Name: 'Connectors, Interconnects', ChildCategories: [{ Name: 'USB, DVI, HDMI Connectors' }] },
    Parameters: [{ ParameterText: 'Connector Type', ValueText: 'USB-B' }, { ParameterText: 'Mounting Type', ValueText: 'Through Hole' }] } as any);
  assert.equal(dk.attributi.tipo, 'USBB');
  // tipo B scritto solo nella descrizione: prima diventava HDMI dalla categoria "USB, DVI, HDMI Connectors"
  const dk2 = daDigikey({ ManufacturerProductNumber: '5787834-1', Description: { ProductDescription: 'CONN RCPT USB2.0 TYPE B 4POS R/A' },
    Category: { Name: 'Connectors, Interconnects', ChildCategories: [{ Name: 'USB, DVI, HDMI Connectors' }] },
    Parameters: [{ ParameterText: 'Number of Positions', ValueText: '4' }] } as any);
  assert.equal(dk2.attributi.tipo, 'USBB');
  const dk3 = daDigikey({ ManufacturerProductNumber: 'X', Description: { ProductDescription: 'CONN RCPT USB-C 24POS' },
    Category: { Name: 'Connectors, Interconnects', ChildCategories: [{ Name: 'USB, DVI, HDMI Connectors' }] },
    Parameters: [{ ParameterText: 'Connector Type', ValueText: 'USB - C' }] } as any);
  assert.equal(dk3.attributi.tipo, 'USBC');
});

test('formato THT a misura (Adriano 5/11/2026): fusibili 5X20, clip CLIP5X20 dalla descrizione, altri THT a misura con tecnologia T', () => {
  const [fam, a] = daColonneBom('FS', null, 'Fuse:Fuseholder_Clip-5x20mm_Littelfuse_520_Inline_P20.50x5.80mm_D1.30mm_Horizontal', 'Clip portafusibile 5x20 mm 250V 6.3A');
  assert.equal(fam, 'FS');
  assert.equal(a.case, 'CLIP5X20');
  const clip = calcola('FS', { ...a, corrente: '6A3', tensione: '250V' }, '52000001009');
  assert.equal(clip.prod, 'FS-THT-CLIP5X20-6A3-250V');
  assert.equal(clip.root, 'TFS-C520-6A30X');
  assert.equal(clip.stato, OK);
  const fus = calcola('FS', { case: '5x20', corrente: '1.6A', tensione: '250V', tecnologia: 'T' }, 'BK1-S505H-1.6-R');
  assert.equal(fus.prod, 'FS-THT-5X20-1A6-250V');
  assert.equal(fus.root, 'TFS-5X20-1A60X');
  assert.equal(calcola('FS', { case: '6.3X32', corrente: '10A', tensione: '250V' }, 'X').root, 'TFS-6X32-10A0X');
  assert.equal(calcola('FS', { case: '10X38', corrente: '10A', tensione: '500V' }, 'X').root, 'TFS-1038-10A0X');
  assert.equal(calcola('IT', { case: '12X12', tecnologia: 'T' }, 'X').root, 'TIT-1212-XXXXX', 'altro THT a misura con tecnologia T');
  assert.equal(calcola('IT', { case: '12X12' }, 'X', { ripiego: false }).stato, 'MANUALE', 'senza tecnologia T la misura non basta');
  assert.equal(calcola('FS', { case: '1206', corrente: '500MA', tensione: '32V' }, 'X').root, 'SFS-1206-0A50X', 'i fusibili SMD non cambiano');
  assert.equal(famigliaDaDk(['Circuit Protection', 'Fuse Holders'], {}, 'FUSE CLIP CART 250V 6.3A PCB'), 'FS');
  assert.ok(REGISTRO_AGGIUNTE.some(v => /CLIP5X20/.test(v.cosa)));
});

test('campi facoltativi (Adriano 14/11/2026): con il P/N il codice esce sempre, i dati che mancano li sostituisce il P/N', () => {
  // coassiale U.FL senza passo né poli (BWU.FL-IPEX1, LCSC C5137195)
  const ufl = calcola('CN', { tipo: 'COASSIALE', tecnologia: 'S' }, 'BWU.FL-IPEX1');
  assert.equal(ufl.prod, 'CN-COASSIALE-BWU.FLIPEX1');
  assert.equal(ufl.root, 'SCN-COAX-BWUFL');
  assert.equal(ufl.stato, 'OK');
  assert.match(ufl.note.join(' '), /^codice ricavato dal P\/N \(manca Passo, Poli/);
  // stessa logica sempre: stessi dati = stesso codice
  assert.deepEqual(calcola('CN', { tipo: 'COASSIALE', tecnologia: 'S' }, 'BWU.FL-IPEX1'), ufl);
  // tipo non in tabella: XXXX al posto del tipo; con passo e poli il valore resta quello di sempre
  assert.equal(calcola('CN', { tipo: 'STRANO', passo: '2.54', poli: '4' }, 'ABC-123').root, 'SCN-XXXX-25404');
  assert.equal(calcola('CN', {}, 'ABC-123').prod, 'CN-ABC123');
  // un connettore completo non cambia
  const rj = calcola('CN', { tipo: 'RJ45', passo: '1.02', poli: '8', tecnologia: 'T' }, 'HR911105A');
  assert.equal(rj.root, 'TCN-RJ45-10208');
  assert.ok(!rj.note.some(n => n.startsWith('codice ricavato')));
  // altre famiglie: case non in tabella, valore mancante, famiglia non riconosciuta
  assert.equal(calcola('IC', { case: 'MODULO-STRANO' }, 'ESP32-WROOM-32E').root, 'SIC-XXXX-ESP32');
  const res = calcola('RS', { case: '0603' }, 'RC0603FR-07XXX');
  assert.equal(res.root, 'SRS-0603-RC060');
  assert.equal(res.prod, 'RS-0603-RC0603FR07XXX');
  const ignoto = calcola(null, { tecnologia: 'T' }, 'XYZ 99');
  assert.equal(ignoto.famiglia, 'MI');
  assert.equal(ignoto.root, 'TMI-XXXX-XYZ99');
  assert.equal(ignoto.prod, 'MI-THT-XYZ99');
  // codice lungo: accorciato a 30 caratteri con il punto finale
  const lungo = calcola('CN', { tipo: 'COASSIALE' }, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789').prod!;
  assert.equal(lungo.length, 30); assert.ok(lungo.endsWith('.'));
  // senza P/N non c'è niente con cui costruire il codice: resta da completare
  assert.equal(calcola('CN', { tipo: 'COASSIALE' }, null).stato, 'MANUALE');
  assert.equal(calcola(null, {}, '').stato, 'MANUALE');
  // chi confronta i codici chiede solo la codifica piena
  assert.equal(calcola('CN', { tipo: 'COASSIALE' }, 'BWU.FL-IPEX1', { ripiego: false }).root, null);
});

test('connettori (14/11/2026): U.FL "Receptacle" = COASSIALE, e da MI passa a CN anche senza passo e poli', async () => {
  const { daColonneBom } = await import('../src/engine/codifica/decoder.js');
  const { famigliaProposta } = await import('../src/engine/codifica/famiglia-proposta.js');
  const [, a] = daColonneBom('CN', 'BWU.FL-IPEX1', 'U.FL_Hirose_U.FL-R-SMT-1_Vertical', 'Connector Receptacle IPEX Male Pin 50Ω Surface Mount');
  assert.equal(a.tipo, 'COASSIALE');
  const p = famigliaProposta({ famiglia: 'MI', pn: 'BWU.FL-IPEX1', attributi: {}, footprint: 'U.FL_Hirose_U.FL-R-SMT-1_Vertical', descrizioneBom: 'Connector Receptacle IPEX Male Pin 50Ω' });
  assert.equal(p?.famiglia, 'CN'); assert.equal(p?.sicura, true); assert.equal(p?.attributi.tipo, 'COASSIALE');
  // un integrato con la parola USB non diventa un connettore
  assert.equal(famigliaProposta({ famiglia: 'IC', pn: 'FT232RL', attributi: {}, descrizioneBom: 'USB UART IC' }), null);
});
