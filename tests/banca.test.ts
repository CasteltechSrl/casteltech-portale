import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codiceSiaValido, abiCabDaIban, categoriaProposta, chiaviMovimenti, contoNuovo, numeroConto, saldoConto, citaNumero, controlliCreditore, controlliEffetto, dataDa, generaRiba, ibanValido, importoDa,
  leggiCbi, movimentiDaTabella, proponiAbbinamento, rataMancante, SOGLIA_SICURA, type Movimento, type RataAperta } from '../src/engine/banca.js';
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

test('banca: CSV "Tutti i movimenti" di BPER con più conti (colonna Rapporto) e causale interna', () => {
  const righe = [
    ["Societa'", 'Banca', 'Rapporto', 'Contabile', 'Valuta', 'Cau.', 'Descrizione', 'Importo', 'Div.'],
    ['AAAAA', 'BPER', 'IT37B0538765310000003092938', '04/06/2026', '04/06/2026', '4848', 'BONIFICO o/c: ALFA S.R.L. ABI-CAB: 01234-56789 A FAVORE DI CASTELTECH PAG. FATT. 28 DEL 27 03 2026', '2.007,00', 'EUR'],
    ['AAAAA', 'BPER', 'IT16W0538765310000003106080', '04/11/2026', '04/11/2026', '4754', 'ANTICIPO SU DOCUMENTI FT. 108 + 98 ', '-10.732,80', 'EUR'],
  ];
  const { movimenti } = movimentiDaTabella(righe);
  assert.equal(movimenti.length, 2);
  assert.deepEqual(movimenti.map(m => [m.data, m.rapporto, m.causale, m.importo]),
    [['2026-06-04', '3092938', '4848', 2007], ['2026-11-04', '3106080', '4754', -10732.8]]);
  assert.ok(!movimenti[0].descrizione.includes('4848'));
  // stesso movimento su due conti = due chiavi diverse
  const k = chiaviMovimenti([{ ...movimenti[0] }, { ...movimenti[0], rapporto: '3106080' }], 'BPER');
  assert.notEqual(k[0], k[1]);
});

test('banca: anticipo e rientro della banca non sono mai l\'incasso della fattura, i conti d\'anticipo nemmeno', () => {
  const rate = [rata({ id: 45, numero: '45', importo: 12155.64, controparte: 'CABLESTEEL SRL' })];
  assert.equal(proponiAbbinamento(mov(12155.64, 'ANTICIPO SU DOCUMENTI ANTICIPO SU FATTURA 45'), rate), null);
  assert.equal(proponiAbbinamento(mov(12155.64, 'RIENTRO ANTICIPO/FINANZIAMENTO CABLESTEEL SRL N 45/2026'), rate), null);
  assert.equal(proponiAbbinamento(mov(12155.64, 'BONIFICO CABLESTEEL'), rate, { contoTecnico: true }), null);
  assert.deepEqual(proponiAbbinamento(mov(12155.64, 'BONIFICO o/c: CABLESTEEL SRL DOC. N. 45 DEL 30/04/2026'), rate)!.rate.map(r => r.id), [45]);
  // giroconto dal conto anticipo RiBa: solo una distinta intera
  assert.equal(proponiAbbinamento(mov(12155.64, 'GIROCONTO GIROCONTO DAL FIL. 00258 /CONTO 000003106071'), rate), null);
});

test('banca: categorie sui movimenti tipici di BPER', () => {
  const c = (d: string, i = -10) => categoriaProposta({ descrizione: d, importo: i });
  assert.equal(c('GIROCONTO COMPETENZE COMPETENZE SPESE ED ONERI - AL C/C 0258/03092938', 100), 'Giroconto');
  assert.equal(c('RIENTRO ANTICIPO/FINANZIAMENTO FT 98 + 108'), 'Anticipo fatture / RiBa');
  assert.equal(c('RATA PRESTITO Fin. 005/1 Scadenza del 28/03/2026 Quota capitale 1.414,27 Interessi 17,18'), 'Finanziamenti e mutui');
  assert.equal(c('COMPETENZE DARE AUTORIZZATE IN C/C INTERESSI A DEBITO AL 31/12/2025'), 'Interessi');
  assert.equal(c('COMPETENZE SPESE ED ONERI'), 'Commissioni e spese bancarie');
  assert.equal(c('IMPOSTA DI BOLLO BOLLI DA OTTOBRE A DICEMBRE'), 'Commissioni e spese bancarie');
  assert.equal(c('VIACARD ADD. VIACARD - Utente: 1'), 'Pedaggi e carburante');
  assert.equal(c('PAGAM. DELEGA F24 AGENZIA ENTRATE'), 'Imposte e contributi (F24)');
  assert.equal(c('DISPOSIZIONE EMOLUMENTI EUR 1.500,00'), 'Stipendi');
});

test('banca: numero del conto, conti nuovi e saldo di oggi', () => {
  assert.equal(numeroConto('IT37B0538765310000003092938'), '3092938');
  assert.equal(numeroConto('000003106071'), '3106071');
  assert.equal(contoNuovo('3092938', 'IT37B0538765310000003092938').tipo, 'ordinario');
  assert.equal(contoNuovo('3106071', 'IT37B0538765310000003092938').tipo, 'anticipo');
  const conto = { ...contoNuovo('3092938', ''), saldoData: '2025-12-31', saldo: 100, fido: 10000 };
  assert.equal(saldoConto(conto, [{ data: '2025-12-31', importo: 5 }, { data: '2026-01-02', importo: -150.5 }]), -50.5);
  assert.equal(saldoConto({ ...conto, saldo: null }, []), null);
});

// 8/11/2026: fattura arrivata da FIC senza rate → una rata col totale alla data della fattura, così il bonifico si abbina
test('banca: rata per la fattura emessa che non ne ha', () => {
  assert.deepEqual(rataMancante({ tipo: 'fattura', stato: 'consegnato', numero: 52, data: '2026-05-20', totale: 1202.43, rate: 0 }),
    { data: '2026-05-20', importo: 1202.43, modalita: 'MP05' });
  assert.equal(rataMancante({ tipo: 'fattura', stato: 'consegnato', numero: 52, data: '2026-05-20', totale: 1202.43, rate: 1 }), null);
  assert.equal(rataMancante({ tipo: 'fattura', stato: 'bozza', numero: null, data: '2026-05-20', totale: 100, rate: 0 }), null);
  assert.equal(rataMancante({ tipo: 'nota_credito', stato: 'emesso', numero: 3, data: '2026-05-20', totale: 100, rate: 0 }), null);
});

test('codice SIA: 5 caratteri, lettere e numeri', () => {
  assert.equal(codiceSiaValido('CHJ6R'), true);
  assert.equal(codiceSiaValido('chj6r'), true);
  assert.equal(codiceSiaValido('CHJ6'), false);
  assert.equal(codiceSiaValido('CHJ6R1'), false);
  assert.equal(codiceSiaValido('CH-6R'), false);
});
