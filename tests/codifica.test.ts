import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcola, progNum, progStr } from '../src/engine/codifica/regole.js';
import { daColonneBom, decodificaMpn } from '../src/engine/codifica/decoder.js';
import { elencoDesignatori, leggiCsv, pnKey, quantitaRiga, regolaResistenze, rigaIntestazione, rilevaColonne } from '../src/engine/codifica/bom.js';
import { acquisto, confrontaOfferte, leggiPrezzo, pezziScarto, reperibilita, sceltaMigliore, type Offerta } from '../src/engine/acquisti.js';
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

test('miglior prezzo di un P/N: la migliore in cima, poi per totale, chi non ne ha abbastanza in fondo (Adriano 28/10/2026)', () => {
  const righe = confrontaOfferte([
    offerta({ fornitore: 'mouser', stock: 10 }),                                      // costa meno ma non ne ha abbastanza
    offerta({ fornitore: 'tme', scaglioni: [{ qta: 1, prezzo: 0.05 }] }),
    offerta({ fornitore: 'farnell', scaglioni: [{ qta: 1, prezzo: 0.03 }] }),
    offerta({ fornitore: 'digikey', scaglioni: [] }),                                 // senza prezzo
  ], 50);
  assert.deepEqual(righe.map(r => r.offerta.fornitore), ['farnell', 'tme', 'mouser', 'digikey']);
  assert.equal(righe[0].migliore, true);
  assert.equal(righe[1].differenza!.toFixed(2), '1.00');                             // 50 × 0,05 − 50 × 0,03
  assert.equal(righe[2].disponibile, false);
  assert.equal(righe[3].acquisto, null);
  assert.deepEqual(confrontaOfferte([], 10), []);
});

test('acquisti: reperibilità, critico solo se non si trova da nessuna parte (Adriano 28/10/2026)', () => {
  assert.equal(reperibilita([], 10).livello, 'critico');
  assert.equal(reperibilita([offerta({ stock: 5 })], 10).livello, 'critico');
  assert.equal(reperibilita([offerta({ stock: 0, ciclo: 'Obsolete', obsoleto: true })], 10).livello, 'critico');
  // trovato da un altro distributore: nessuna segnalazione, le informazioni restano tra i motivi
  assert.equal(reperibilita([offerta({ fornitore: 'mouser', stock: 0 }), offerta({ fornitore: 'tme', stock: 500 })], 10).livello, 'ok');
  assert.equal(reperibilita([offerta({ ciclo: 'Last Time Buy' })], 10).livello, 'ok');
  assert.equal(reperibilita([offerta({ ciclo: 'Obsolete', obsoleto: true })], 10).livello, 'ok');   // obsoleto ma in magazzino: si compra
  const basse = reperibilita([offerta({ stock: 20 })], 10);
  assert.equal(basse.livello, 'ok'); assert.ok(basse.motivi.some(m => m.includes('scorte basse')));
  assert.equal(reperibilita([offerta({}), offerta({ fornitore: 'mouser' })], 10).livello, 'ok');
  // la quantità c'è solo sommando più distributori
  assert.equal(reperibilita([offerta({ stock: 6 }), offerta({ fornitore: 'mouser', stock: 6 })], 10).livello, 'attenzione');
  // non trovato, ma un distributore non ha risposto: non è critico, va riprovato
  const nr = reperibilita([], 10, ['mouser']);
  assert.equal(nr.livello, 'attenzione'); assert.match(nr.motivi[0], /Mouser non ha risposto/);
  // obsoleto e attivo con la quantità: si sceglie l'attivo anche se costa un po' di più
  const s = sceltaMigliore([offerta({ fornitore: 'mouser', obsoleto: true, scaglioni: [{ qta: 1, prezzo: 0.01 }] }), offerta({ fornitore: 'tme', scaglioni: [{ qta: 1, prezzo: 0.02 }] })], 10);
  assert.equal(s!.offerta.fornitore, 'tme');
});

test('alternative: stesse caratteristiche = stesso codice di produzione, scelta dell\'operatore negli acquisti', async () => {
  process.env.DATABASE_URL ??= 'postgres://solo-per-i-test@localhost/nessuno'; // il modulo db non si collega finché non si fanno query
  const { stesseCaratteristiche, ordinaAlternative, calcolaAcquistiCon, ESITI, FONTI_ALTERNATIVA } = await import('../src/server/codifica-servizio.js');
  const { REGOLE_SCARTO_DEFAULT } = await import('../src/engine/acquisti.js');
  const riga = { famiglia: 'RS', codiceProduzione: 'RS-0603-2K2-1-100MW', codiceGestionale: 'SRS-0603-2K20F-001' };
  const [f1, a1] = decodificaMpn('ERJ-3EKF2201V');      // Panasonic 2,2k 1% 0603
  assert.equal(stesseCaratteristiche(riga, f1, a1, 'ERJ-3EKF2201V'), true);
  const [f2, a2] = decodificaMpn('RC0603FR-072K7L');    // 2,7k: diversa
  assert.equal(stesseCaratteristiche(riga, f2, a2, 'RC0603FR-072K7L'), false);
  assert.equal(stesseCaratteristiche(riga, 'CC', {}, 'X'), false);
  assert.equal(stesseCaratteristiche(riga, null, {}, 'X'), null);
  // prima le disponibili con le stesse caratteristiche, poi le più economiche
  const alt = (mpn: string, identica: boolean | null, x: Partial<Offerta>) => ({ mpn, produttore: '', descrizione: '', fonte: FONTI_ALTERNATIVA.STESSE, identica, offerte: [offerta({ mpn, ...x })] });
  const ordinate = ordinaAlternative([alt('A', true, { stock: 5 }), alt('B', null, { scaglioni: [{ qta: 1, prezzo: 0.001 }] }), alt('C', true, {})], 100);
  assert.deepEqual(ordinate.map(a => a.mpn), ['C', 'B', 'A']);
  // riga non trovata: con l'alternativa scelta si compra quella e non è più critica
  const r: any = { n: 1, pn: 'INTROVABILE-1', esito: ESITI.NUOVO, famiglia: 'RS', attributi: {}, qtaScheda: 2, note: [], fonti: [], offerte: [], acquisti: [],
    alternative: [alt('ERJ-3EKF2201V', true, { fornitore: 'tme' })], alternativaScelta: null };
  const prima = process.env.MOUSER_API_KEY;
  process.env.MOUSER_API_KEY = 'x';                    // un distributore collegato, altrimenti niente giudizio di reperibilità
  try {
    calcolaAcquistiCon([r], [100], REGOLE_SCARTO_DEFAULT, new Map([[pnKey('INTROVABILE-1')!, { mouser: { offerte: [] } }]]));
    assert.equal(r.reperibilita.livello, 'critico');
    calcolaAcquistiCon([r], [100], REGOLE_SCARTO_DEFAULT, new Map());   // Mouser non ha risposto: da riprovare, non critico
    assert.equal(r.reperibilita.livello, 'attenzione');
    r.alternativaScelta = 'ERJ-3EKF2201V';
    calcolaAcquistiCon([r], [100], REGOLE_SCARTO_DEFAULT, new Map());
    assert.equal(r.reperibilita.livello, 'ok');
    assert.equal(r.acquisti[0].scelta.mpn, 'ERJ-3EKF2201V');
    assert.equal(r.acquisti[0].scelta.fornitore, 'tme');
    // prezzo scritto a mano: vale al posto di quello proposto, anche per un componente non trovato
    r.alternativaScelta = null; r.prezzoManuale = 0.5;
    calcolaAcquistiCon([r], [100], REGOLE_SCARTO_DEFAULT, new Map([[pnKey('INTROVABILE-1')!, { mouser: { offerte: [] } }]]));
    assert.equal(r.acquisti[0].scelta.fornitore, 'manuale');
    assert.equal(r.acquisti[0].scelta.prezzo, 0.5);
    assert.equal(r.acquisti[0].scelta.qta, 210);             // 200 + 5% di scarto (sotto 1 €)
    assert.equal(r.acquisti[0].scelta.totale, 105);
    assert.equal(r.reperibilita.livello, 'ok');
  } finally { if (prima === undefined) delete process.env.MOUSER_API_KEY; else process.env.MOUSER_API_KEY = prima; }
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

test('BOM: colonne riconosciute anche con titoli diversi o dal contenuto', () => {
  const dati = [
    ['1', '8', 'C1,C4,C7,C10,C13,C16,C19,C21', '1n', '', '', '0603', ''],
    ['2', '3', 'R46,R63,R71', '49.9k - 1%', '', '', '0603', ''],
    ['3', '1', 'U3', 'DS90CR285', 'DS90CR285MTD/NOPB', 'Texas Instruments', 'TSSOP56', ''],
    ['4', '2', 'J5,J6', 'MTLW-108-05-T-S-190', '90120-0768', 'Molex', 'MTLW-108-05-T-S-190', 'verificare'],
    ['5', '1', 'R70', '1', '', '', '0603', ''],
    ['6', '4', 'C215,C218,C230,C237', '1u', '', '', '0603', ''],
  ];
  // titolo che contiene "Valore"
  const m = rilevaColonne(['Item', 'Q.tà', 'Riferimenti', 'Part / Valore', 'Codice produttore', 'Produttore', 'Footprint', 'Note'], dati);
  assert.equal(m.valore, 'Part / Valore'); assert.equal(m.pn, 'Codice produttore'); assert.equal(m.descrizione, undefined); // "Note" quasi vuota
  // titoli senza significato: si guarda il contenuto
  const x = rilevaColonne(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], dati);
  assert.equal(x.designatori, 'C'); assert.equal(x.quantita, 'B'); // non "A", che è il numero di riga
  assert.equal(x.valore, 'D'); assert.equal(x.footprint, 'G');
  // "Commento" resta una descrizione, non un valore
  assert.equal(rilevaColonne(['Commento', 'Designator']).descrizione, 'Commento');
});

test('condensatori ceramici: senza dielettrico, tolleranza e tensione si usano X5R, 20%, 25V e il codice è da validare', async () => {
  const { regolaCondensatori, NOTA_DA_VALIDARE } = await import('../src/engine/codifica/bom.js');
  const [fam, a] = daColonneBom(null, '100n', '0603', null, 'C5');
  assert.equal(fam, 'CC');
  const x = regolaCondensatori(fam, a);
  assert.equal(x.attributi.dielettrico, 'X5R'); assert.equal(x.attributi.tolleranza, '20'); assert.equal(x.attributi.tensione, '25V');
  assert.ok(x.note[0].startsWith(NOTA_DA_VALIDARE));
  const c = calcola(fam, x.attributi, null);
  assert.ok(c.prod && c.root, 'codici completi');
  // dati già presenti: non si toccano e il codice non è da validare
  const y = regolaCondensatori('CC', { case: '0603', valore: '100NF', dielettrico: 'X7R', tolleranza: '10', tensione: '50V' });
  assert.equal(y.attributi.dielettrico, 'X7R'); assert.deepEqual(y.note, []);
  assert.deepEqual(regolaCondensatori('RS', {}).note, []);
});

test('numeri: il punto delle migliaia c\'è anche con 4 cifre (1.000)', async () => {
  const { euro, num } = await import('../src/server/views/html.js');
  assert.equal(euro(1000), '1.000,00 €');
  assert.equal(euro(10000.5), '10.000,50 €');
  assert.equal(num(1234), '1.234');
  assert.equal(euro(999), '999,00 €');
});

test('BOM collegata al preventivo: costo a scheda per le schede del preventivo, con le offerte già lette', async () => {
  process.env.DATABASE_URL ??= 'postgres://solo-per-i-test@localhost/nessuno'; // il modulo db non si collega finché non si fanno query
  const { costoMaterialiPer, ESITI } = await import('../src/server/codifica-servizio.js');
  const { REGOLE_SCARTO_DEFAULT } = await import('../src/engine/acquisti.js');
  const riga = (n: number, qtaScheda: number, offerte: Offerta[], extra: object = {}) => ({ n, pn: 'P' + n, produttore: null, designatori: null, valore: null, footprint: null,
    descrizioneBom: null, qtaScheda, esito: ESITI.DB, famiglia: 'IC', attributi: {}, codiceProduzione: null, codiceGestionale: null, descrizione: null,
    fonti: [], note: [], offerte, acquisti: [], ...extra });
  const off = offerta({ scaglioni: [{ qta: 1, prezzo: 5 }, { qta: 500, prezzo: 4 }] });
  const righe = [riga(1, 2, [off]), riga(2, 1, [off], { clienteFornisce: true }), riga(3, 1, [])];
  // 300 schede (non tra le quantità della BOM): 600 pz a 4 € (oltre 3 € niente scarto) = 2400 € → 8 € a scheda
  const x = costoMaterialiPer(righe as any, 300, REGOLE_SCARTO_DEFAULT);
  assert.equal(x.schede, 300);
  assert.equal(x.totale, 2400);
  assert.equal(x.aScheda, 8);
  assert.equal(x.senzaPrezzo, 1);            // la riga 3 non ha offerte; quella fornita dal cliente non conta
  // 100 schede: 200 pz a 5 € → 10 € a scheda; le righe della BOM non cambiano
  assert.equal(costoMaterialiPer(righe as any, 100, REGOLE_SCARTO_DEFAULT).aScheda, 10);
  assert.deepEqual(righe[0].acquisti, []);
});

// ── BOM senza colonna P/N: codice in Valore o Descrizione (Adriano 29/10/2026) ──
import { candidatiPn, differenzeBomCodice, notaDueCodici, pnDaCella, scegliCandidato, stessoComponente } from '../src/engine/codifica/candidati-pn.js';
import { caseDaTesto } from '../src/engine/codifica/decoder.js';

test('codifica: codici del produttore nelle celle Valore / Descrizione', () => {
  assert.equal(pnDaCella('1N5819S4/SOD123'), '1N5819S4');
  assert.equal(pnDaCella('BAT54C(SOT23-3)'), 'BAT54C');
  assert.equal(pnDaCella('MAX3485CSA+CT-ND'), 'MAX3485CSA+CT');
  for (const no of ['100nF/10V/10%/X7R/C0603', '470k/R0402', '49.9R', '68Ω', '12.4k', 'Conn_01x02', 'Fiducial', 'GREEN', 'SOT-23',
    'Capacitor Ceramic 0.1 µF ±10% 25V X7R 0805', 'Diode_SMD:D_SOD-123']) assert.equal(pnDaCella(no), null, no);
  const c = candidatiPn({ valore: '1N5819S4/SOD123', descrizione: '1N5819HW-7-F' });
  assert.deepEqual(c.map(x => x.pn), ['1N5819HW-7-F', '1N5819S4']);
});

test('codifica: case dai footprint di KiCad con il trattino basso', () => {
  assert.equal(caseDaTesto('Diode_SMD:D_SOD-123'), 'SOD123');
  assert.equal(caseDaTesto('Package_SO:SOIC-16_3.9x9.9mm_P1.27mm'), 'SOIC16');
  assert.equal(daColonneBom(null, '1N5819S4/SOD123', 'Diode_SMD:D_SOD-123', '1N5819HW-7-F', 'D1,D4,D5')[1].case, 'SOD123');
});

test('codifica: due codici nella stessa riga, equivalenti o da validare', () => {
  assert.equal(stessoComponente('1N5819S4', '1N5819HW-7-F')?.tipo, 'jedec');
  assert.equal(stessoComponente('BAT54C', 'BAT54C,215')?.tipo, 'contenuto');
  assert.equal(stessoComponente('BLM18PG121SN1D', 'BLM18AG121SN1D'), null);
  const off = (pn: string): Offerta[] => pn === '1N5819S4' ? [] : [{ fornitore: 'mouser', codiceFornitore: 'x', mpn: pn, produttore: '', descrizione: '', stock: 5000, moq: 1, multiplo: 1, scaglioni: [{ qta: 1, prezzo: 0.2 }], valuta: 'EUR' }];
  const c = candidatiPn({ valore: '1N5819S4/SOD123', descrizione: '1N5819HW-7-F' }, ['valore', 'descrizione']);
  const s = scegliCandidato(c, off, 300)!;
  assert.equal(s.scelto.pn, '1N5819HW-7-F'); // si compra quello che si trova, anche se nella colonna guardata dopo
  assert.match(notaDueCodici(c, s.scelto, s)!, /equivalenti.*si compra 1N5819HW-7-F \(disponibile\)/);
  const b = candidatiPn({ valore: 'BLM18PG121SN1D', descrizione: 'BLM18AG121SN1D' });
  assert.match(notaDueCodici(b, b[0], { trovato: true, disponibile: true })!, /^CODICE DA VALIDARE: nella BOM ci sono codici diversi/);
});

test('codifica: dati della BOM diversi da quelli del codice', () => {
  const [, aBom] = daColonneBom('RS', '168K', 'Resistor_SMD:R_0805_2012Metric', 'RC0805FR-07162KL', 'R_FBT1');
  assert.deepEqual(differenzeBomCodice('RS', aBom, decodificaMpn('RC0805FR-07162KL')[1]), ['valore 168K nella BOM, 162K nel codice']);
  const [, aC] = daColonneBom('CC', '1nF/630V/5%/C0G/C1206', 'Capacitor_SMD:C_1206_3216Metric', 'GRM32ER71H475KA88L', 'C1');
  assert.equal(differenzeBomCodice('CC', aC, decodificaMpn('GRM32ER71H475KA88L')[1]).length, 4);
  // tensione più alta e tolleranza più stretta del codice vanno bene
  const [, aOk] = daColonneBom('CC', '100nF/10V/10%/X7R/C0603', 'Capacitor_SMD:C_0603_1608Metric', 'CC0603JRX7R9BB104', 'C1');
  assert.deepEqual(differenzeBomCodice('CC', aOk, decodificaMpn('CC0603JRX7R9BB104')[1]), []);
});

test('codifica: tra due codici uno dentro l\'altro si prova prima quello completo', () => {
  assert.deepEqual(candidatiPn({ valore: 'LMR51430YDDCR', descrizione: 'LMR51430Y' }).map(c => c.pn), ['LMR51430YDDCR', 'LMR51430Y']);
});

test('BOM: intestazioni ripetute e righe di solo testo non si analizzano (Adriano Croci)', async () => {
  const { pulisciRigheBom } = await import('../src/engine/codifica/bom.js');
  const intest = ['Item', 'Qty', 'Reference', 'Value', 'Part Number'];
  const dati = [
    { n: 2, celle: ['1', '2', 'R1,R2', '10K', 'RC0603FR-0710KL'] },
    { n: 3, celle: ['', '', 'Pagina 2', '', ''] },
    { n: 4, celle: ['Item', 'Qty', 'Reference', 'Value', 'Part Number'] },
    { n: 5, celle: ['2', '1', 'C1', '100n', 'GRM188R71H104KA93D'] },
    { n: 6, celle: ['', '', '', '', 'RC0603FR-071KL'] }, // un P/N da solo: anche questa è solo testo
  ];
  const { tenute, tolte } = pulisciRigheBom(intest, dati);
  assert.deepEqual(tenute.map(r => r.n), [2, 5]);
  assert.deepEqual(tolte, [{ n: 3, motivo: 'riga di solo testo' }, { n: 4, motivo: 'intestazione ripetuta' }, { n: 6, motivo: 'riga di solo testo' }]);
});

test('BOM: la riga del circuito stampato (PCB) non è un componente; "PCB mount" con designatore sì', async () => {
  const { rigaPcb } = await import('../src/engine/codifica/bom.js');
  assert.equal(rigaPcb({ designatori: 'PCB1', descrizioneBom: 'Scheda' }), true);
  assert.equal(rigaPcb({ designatori: '', descrizioneBom: 'PCB EA1002 rev.0 FR4 1.6mm' }), true);
  assert.equal(rigaPcb({ designatori: null, valore: 'Circuito stampato' }), true);
  assert.equal(rigaPcb({ designatori: 'J1', descrizioneBom: 'Terminal block PCB mount' }), false);
  assert.equal(rigaPcb({ designatori: 'R1', valore: '10K' }), false);
});
