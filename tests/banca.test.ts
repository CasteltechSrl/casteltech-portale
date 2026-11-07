import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abiCabDaIban, categoriaProposta, chiaviMovimenti, citaNumero, controlliCreditore, controlliEffetto, dataDa, generaRiba, ibanValido, importoDa,
  leggiCbi, movimentiDaTabella, proponiAbbinamento, SOGLIA_SICURA, type Movimento, type RataAperta } from '../src/engine/banca.js';
import { cercaGuida } from '../src/engine/guida.js';
import { MENU_GRUPPI } from '../src/server/views/layout.js';

test('banca: date e importi dei file della banca', () => {
  assert.equal(dataDa('07/11/2026'), '2026-11-07');
  assert.equal(dataDa('7.11.26'), '2026-11-07');
  assert.equal(dataDa('071126'), '2026-11-07');
  assert.equal(dataDa('2026-11-07'), '2026-11-07');
  assert.equal(dataDa('31/02/2026'), null);
  assert.equal(dataDa('Saldo iniziale'), null);
  assert.equal(importoDa('1.234,56'), 1234.56);
  assert.equal(importoDa('-50,00'), -50);
  assert.equal(importoDa('50,00-'), -50);
  assert.equal(importoDa('€ 1.500'), 1500);
  assert.equal(importoDa('1234.56', false), 1234.56);
  assert.equal(importoDa('1.5', false), 1.5);
  assert.equal(importoDa('abc'), null);
});

const cbi = (tipo: string, corpo: string) => ` ${tipo}${corpo}`.padEnd(120).slice(0, 120);

test('banca: file CBI RH (movimenti 62 con descrizione che continua in 63)', () => {
  const r62 = (prog: string, valuta: string, contab: string, segno: string, importo: string, causale: string, descr: string) =>
    cbi('62', `0000001${prog}${valuta}${contab}${segno}${importo}${causale}0000${' '.repeat(16)}${' '.repeat(16)}${' '.repeat(9)}${descr}`);
  const testo = [
    cbi('RH', '05387XXXXX071126'),
    cbi('61', '0000001'),
    r62('001', '051126', '051126', 'C', '000000001220,00', '48', 'BONIFICO DA LPS SRL'),
    cbi('63', '0000001001' + 'FATT. N. 127 DEL 15/10/2026'),
    r62('002', '061126', '061126', 'D', '000000000012,50', '66', 'COMMISSIONI'),
    cbi('64', '0000001'),
    cbi('EF', ''),
  ].join('\r\n');
  const m = leggiCbi(testo)!;
  assert.equal(m.length, 2);
  assert.deepEqual(m[0], { data: '2026-11-05', valuta: '2026-11-05', importo: 1220, causale: '48', descrizione: 'BONIFICO DA LPS SRL FATT. N. 127 DEL 15/10/2026' });
  assert.equal(m[1].importo, -12.5);
  assert.equal(leggiCbi('Data;Importo\n01/11/2026;10,00'), null);
});

test('banca: Excel/CSV dell\'home banking con Dare/Avere e righe di saldo', () => {
  const righe = [
    ['Conto corrente 3092938', '', '', '', ''],
    ['Data contabile', 'Data valuta', 'Dare', 'Avere', 'Descrizione operazione'],
    ['05/11/2026', '05/11/2026', '', '1.220,00', 'BONIFICO DA LPS SRL'],
    ['06/11/2026', '06/11/2026', '12,50', '', 'COMMISSIONI'],
    ['Saldo finale', '', '', '9.999,00', ''],
  ];
  const { movimenti, errore } = movimentiDaTabella(righe);
  assert.equal(errore, undefined);
  assert.deepEqual(movimenti.map(m => m.importo), [1220, -12.5]);
  assert.equal(movimenti[0].descrizione, 'BONIFICO DA LPS SRL');
  // importo unico con segno, numeri di Excel
  const x = movimentiDaTabella([['Data', 'Valuta', 'Importo', 'Causale', 'Descrizione'], ['2026-11-05', '2026-11-05', '-80.5', 'Addebito', 'F24']], false);
  assert.equal(x.movimenti[0].importo, -80.5);
  assert.equal(x.movimenti[0].descrizione, 'Addebito · F24');
  assert.ok(movimentiDaTabella([['A', 'B'], ['1', '2']]).errore);
});

test('banca: lo stesso movimento ricaricato ha la stessa chiave, due movimenti uguali nello stesso file no', () => {
  const m: Movimento = { data: '2026-11-05', valuta: null, importo: -2, descrizione: 'Commissioni bonifico', causale: null };
  const [a, b] = chiaviMovimenti([m, { ...m }], 'BPER');
  assert.notEqual(a, b);
  assert.equal(chiaviMovimenti([m], 'bper')[0], a);
});

const rata = (x: Partial<RataAperta>): RataAperta => ({ id: 1, tipo: 'emessa', documentoId: 1, numero: '127', dataDoc: '2026-10-15', scadenza: '2026-11-05',
  importo: 1220, controparte: 'LPS S.R.L.', ...x });
const mov = (importo: number, descrizione: string, data = '2026-11-05'): Movimento => ({ data, valuta: null, importo, descrizione, causale: null });

test('banca: abbinamento con una rata (importo, numero della fattura, nome)', () => {
  const rate = [rata({ id: 1 }), rata({ id: 2, numero: '130', controparte: 'SELEA SRL' }), rata({ id: 3, tipo: 'ricevuta', controparte: 'MOUSER' })];
  const p = proponiAbbinamento(mov(1220, 'BONIFICO DA SELEA SRL FATT 130'), rate)!;
  assert.deepEqual(p.rate.map(r => r.id), [2]);
  assert.ok(p.punteggio >= SOGLIA_SICURA);
  // uscita → solo fatture dei fornitori
  assert.deepEqual(proponiAbbinamento(mov(-1220, 'MOUSER ELECTRONICS'), rate)!.rate.map(r => r.id), [3]);
  // due rate uguali senza indizi: proposta da controllare, non spuntata
  const incerta = proponiAbbinamento(mov(1220, 'BONIFICO'), rate.slice(0, 2))!;
  assert.ok(incerta.punteggio < SOGLIA_SICURA);
  assert.match(incerta.motivo, /controlla/);
  // nessun importo che torna
  assert.equal(proponiAbbinamento(mov(999, 'BONIFICO DA LPS'), rate), null);
});

test('banca: un bonifico che paga più fatture dello stesso cliente', () => {
  const rate = [rata({ id: 1, importo: 500, numero: '120' }), rata({ id: 2, importo: 300, numero: '121' }), rata({ id: 3, importo: 200, numero: '122' }),
    rata({ id: 4, importo: 300, controparte: 'ALTRO CLIENTE' })];
  const p = proponiAbbinamento(mov(800, 'BONIFICO LPS SRL SALDO FATTURE'), rate)!;
  assert.deepEqual(p.rate.map(r => r.id).sort(), [1, 2]);
});

test('banca: accredito di una distinta RiBa intera', () => {
  const rate = [rata({ id: 1, importo: 500, distintaId: 7, controparte: 'A' }), rata({ id: 2, importo: 700, distintaId: 7, controparte: 'B' })];
  const p = proponiAbbinamento(mov(1200, 'ACCREDITO PRESENTAZIONE EFFETTI SBF'), rate)!;
  assert.deepEqual(p.rate.map(r => r.id), [1, 2]);
  assert.ok(p.punteggio >= 90);
});

test('banca: numero della fattura nella descrizione solo con una parola di fattura vicina', () => {
  assert.ok(citaNumero('SALDO FATT. N. 127 DEL 15/10', '127'));
  assert.ok(citaNumero('FT127', '127'));
  assert.ok(!citaNumero('BONIFICO 1270 EURO', '127'));
  assert.ok(!citaNumero('CAP 29127', '127'));
  assert.ok(citaNumero('PAGAMENTO FPR 9/26', 'FPR 9/26'));
});

test('banca: categoria proposta per i movimenti senza fattura', () => {
  assert.equal(categoriaProposta({ descrizione: 'DELEGA F24 AGENZIA ENTRATE', importo: -500 }), 'Imposte e contributi (F24)');
  assert.equal(categoriaProposta({ descrizione: 'COMMISSIONI SU BONIFICO', importo: -1 }), 'Commissioni e spese bancarie');
  assert.equal(categoriaProposta({ descrizione: 'EMOLUMENTI OTTOBRE', importo: -9000 }), 'Stipendi');
  assert.equal(categoriaProposta({ descrizione: 'VERSAMENTO', importo: 100 }), 'Altre entrate');
});

test('banca: IBAN → ABI, CAB e conto', () => {
  assert.ok(ibanValido('IT37B0538765310000003092938'));
  assert.deepEqual(abiCabDaIban('IT37 B053 8765 3100 0000 3092 938'), { abi: '05387', cab: '65310', conto: '000003092938' });
  assert.equal(abiCabDaIban('IT38B0538765310000003092938'), null);  // cifre di controllo sbagliate
  assert.equal(abiCabDaIban('BPER FIORENZUOLA'), null);
});

test('banca: file RiBa CBI, righe da 120 caratteri, totali e numero di record nella coda', () => {
  const cred = { sia: 'A1B2C', ragioneSociale: 'CASTELTECH S.R.L.', indirizzo: 'STRADA FIORENZUOLA, 8', cap: '29014', comune: "CASTELL'ARQUATO", provincia: 'PC',
    partitaIva: '01777320332', iban: 'IT37B0538765310000003092938' };
  const deb = { nome: 'Società Àlfa S.r.l.', codiceFiscale: 'IT01777320332', indirizzo: 'Via Roma 1', cap: '20100', comune: 'Milano', provincia: 'MI', iban: 'IT37B0538765310000003092938' };
  const effetti = [
    { rataId: 11, scadenza: '2026-12-31', importo: 1220, numeroFattura: '127', dataFattura: '2026-10-15', debitore: deb },
    { rataId: 12, scadenza: '2027-01-31', importo: 30.5, numeroFattura: '128', dataFattura: '2026-10-16', debitore: deb },
  ];
  const f = generaRiba(cred, effetti, '2026-11-07', 'RIBA202611070001');
  const righe = f.split('\r\n').filter(Boolean);
  assert.equal(righe.length, 2 * 7 + 2);
  for (const r of righe) assert.equal(r.length, 120, r);
  assert.equal(righe[0].slice(0, 19), ' IBA1B2C05387071126');
  assert.equal(righe[1].slice(22, 28), '311226');                    // scadenza
  assert.equal(righe[1].slice(28, 33), '30000');                     // causale RiBa
  assert.equal(righe[1].slice(33, 46), '0000000122000');             // importo in centesimi
  assert.equal(righe[1].slice(47, 69), '0538765310000003092938');    // ABI, CAB e conto del creditore
  assert.match(righe[3], /SOCIETA ALFA S\.R\.L\./);                    // senza accenti, maiuscolo
  assert.match(righe[3], /01777320332 /);                            // P.IVA senza IT
  const coda = righe[righe.length - 1];
  assert.equal(coda.slice(1, 3), 'EF');
  assert.equal(coda.slice(45, 52), '0000002');                       // effetti
  assert.equal(coda.slice(52, 67), '000000000125050');               // totale in centesimi
  assert.equal(coda.slice(82, 89), '0000016');                       // record
});

test('banca: controlli prima di creare la RiBa', () => {
  const e = { rataId: 1, scadenza: '2026-10-01', importo: 10, numeroFattura: '1', dataFattura: '2026-09-01',
    debitore: { nome: 'X', codiceFiscale: '', indirizzo: '', cap: '', comune: '', provincia: '', iban: 'BPER' } };
  const err = controlliEffetto(e, '2026-11-07');
  assert.equal(err.length, 4);
  assert.match(err[0], /IBAN/);
  assert.match(controlliCreditore({ sia: '', ragioneSociale: '', indirizzo: '', cap: '', comune: '', provincia: '', partitaIva: '', iban: 'IT37B0538765310000003092938' })[0], /SIA/);
});

test('banca: nel menu Amministrazione e nella guida', () => {
  const voci = MENU_GRUPPI.find(g => g.chiave === 'amministrazione')!.voci.map(v => v[1]);
  assert.ok(voci.includes('/amministrazione/banca'));
  assert.ok(voci.includes('/amministrazione/banca/anticipi'));
  assert.ok(cercaGuida('estratto conto banca').length > 0);
  assert.ok(cercaGuida('riba file cbi').length > 0);
});
