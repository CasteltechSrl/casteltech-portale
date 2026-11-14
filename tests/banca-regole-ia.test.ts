// Regole di Adriano per i movimenti della banca e proposte dell'IA (14/11/2026), con i movimenti BPER veri del 6–13/11/2026.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categoriaMovimento, categoriaF24, proponiAbbinamento, type Movimento, type RataAperta } from '../src/engine/banca.js';
import { leggiRispostaIa, richiestaIa } from '../src/engine/banca-ia.js';

const mov = (importo: number, descrizione: string, data = '2026-11-10'): Movimento => ({ data, valuta: null, importo, descrizione, causale: null });
const rata = (x: Partial<RataAperta>): RataAperta => ({ id: 1, tipo: 'emessa', documentoId: 1, numero: '111', dataDoc: '2026-09-30', scadenza: '2026-10-31',
  importo: 100, controparte: 'SELEA S.R.L.', ...x });

test('banca: commissioni, emolumenti, anticipi, rientri e carta si registrano da soli', () => {
  const c = (d: string, i = -10, data = '2026-11-10') => categoriaMovimento({ descrizione: d, importo: i, data });
  assert.deepEqual(c('COMMISSIONI BONIFICI Bonifico num. 263140100269886', -0.07), { categoria: 'Commissioni e spese bancarie', sicura: true });
  assert.deepEqual(c('COMMISSIONI PAGAMENTO BOLLETTINO CBILL ... CREDITORE: AGENZIA DELLE ENTRATE - RISCOSSIONE', -1.1), { categoria: 'Commissioni e spese bancarie', sicura: true });
  // le "Spese: 0,07" dentro la riga dello stipendio non la fanno diventare commissione
  assert.deepEqual(c('DISPOSIZIONE EMOLUMENTI EUR 1.450,00 Busta paga di Ottobre 2026 Spese: 0,07 EUR', -1450), { categoria: 'Stipendi', sicura: true });
  assert.deepEqual(c('DISPOSIZIONE EMOLUMENTI EUR 7.480,00 Spese: 0,35 EUR Num. Distinta 263140100075700', -7480), { categoria: 'Stipendi', sicura: true });
  assert.deepEqual(c('ANTICIPO SU DOCUMENTI ft. 117+120+123+124+126', 14053.23), { categoria: 'Anticipo fatture', sicura: true });
  assert.deepEqual(c('RIENTRO ANTICIPO/FINANZIAMENTO ACCONTO SELEA SRL N 111/2026', -2462), { categoria: 'Rientro anticipo', sicura: true });
  assert.deepEqual(c('PAGAMENTO CARTA DI CREDITO ADDEBITO E/C DEL 30.10.2026 PER LA POSIZ N. 4935********9999', -3220.55), { categoria: 'Carta di credito', sicura: true });
  assert.equal(c('ADDEBITO SDD Generali Italia N: 1192296726/67').categoria, 'Assicurazioni');
  assert.equal(c('BONIFICO o/c: MIMIT - DGIAI PAGAMENTO QUOTA 5 EROGAZIONE (NUOVA SABATINI)', 4135.88).categoria, 'Contributi pubblici');
  assert.equal(c('BONIFICO o/c: RS COMPONENTS S.R.L. RIMBORSO DOPPIO PAGAMENTO FT.7026291570', 188.81).categoria, 'Rimborsi');
  // professionista: è il pagamento della sua fattura, non uno stipendio
  assert.deepEqual(c('DISPOSIZIONE a favore di Cetani Federico Martin EUR 2.082,08 nr. FPR 10/26 del 09/11/2026 Spese: 0,07 EUR', -2082.08),
    { categoria: 'Pagamento fattura', sicura: false });
});

test('banca: F24 = rate dell\'Agenzia delle Entrate, intorno al 16 contributi dei dipendenti', () => {
  assert.equal(categoriaF24('2026-11-16'), 'Contributi dipendenti (F24)');
  assert.equal(categoriaF24('2026-11-10'), 'Contributi dipendenti (F24)');
  assert.equal(categoriaF24('2026-11-30'), 'Imposte e rate Agenzia Entrate');
  assert.deepEqual(categoriaMovimento({ descrizione: 'PAGAM. DELEGA UNIFICATA DELEGA F24 - CBI DEL : 10.11.2026', importo: -411, data: '2026-11-10' }),
    { categoria: 'Contributi dipendenti (F24)', sicura: true });
  assert.equal(categoriaMovimento({ descrizione: 'PAGAM. DELEGA UNIFICATA DELEGA F24', importo: -900, data: '2026-11-28' }).categoria, 'Imposte e rate Agenzia Entrate');
});

test('banca: il bonifico trova la fattura già segnata pagata quel giorno, non la rata aperta uguale', () => {
  const rate = [
    rata({ id: 1, numero: '109', importo: 732, controparte: 'SILIBIT SRL', scadenza: '2026-11-30' }),
    rata({ id: 2, numero: '109', importo: 732, controparte: 'SILIBIT SRL', scadenza: '2026-10-31', gia: true, pagataIl: '2026-11-12' }),
  ];
  const p = proponiAbbinamento(mov(732, 'BONIFICO o/c: SILIBIT SRL SALDO FATTURA 109 30/09/2026', '2026-11-12'), rate)!;
  assert.deepEqual(p.rate.map(r => r.id), [2]);
  assert.match(p.motivo, /già segnata pagata/);
  // professionista: fattura FPR 10/26 già pagata, il movimento la conferma
  const cetani = [rata({ id: 9, tipo: 'ricevuta', numero: 'FPR 10/26', importo: 2082.08, controparte: 'CETANI FEDERICO MARTIN', gia: true, pagataIl: '2026-11-10', scadenza: '2026-11-09' }),
    rata({ id: 8, tipo: 'ricevuta', numero: 'FPR 7/26', importo: 2082.08, controparte: 'Cetani Federico Martin', gia: true, pagataIl: '2026-08-07', scadenza: '2026-08-03' })];
  assert.deepEqual(proponiAbbinamento(mov(-2082.08, 'DISPOSIZIONE a favore di Cetani Federico Martin EUR 2.082,08 nr. FPR 10/26 del 09/11/2026'), cetani)!.rate.map(r => r.id), [9]);
  // stipendi e F24 mai una fattura, anche se l'importo torna
  assert.equal(proponiAbbinamento(mov(-1450, 'DISPOSIZIONE EMOLUMENTI EUR 1.450,00'), [rata({ tipo: 'ricevuta', importo: 1450 })]), null);
});

test('banca: distinta di bonifici ai fornitori ricostruita dalle fatture in scadenza', () => {
  const rate = [
    rata({ id: 1, tipo: 'ricevuta', importo: 500, controparte: 'A SRL', scadenza: '2026-11-10' }),
    rata({ id: 2, tipo: 'ricevuta', importo: 300, controparte: 'B SRL', scadenza: '2026-11-10' }),
    rata({ id: 3, tipo: 'ricevuta', importo: 250, controparte: 'C SRL', scadenza: '2026-11-12' }),
    rata({ id: 4, tipo: 'ricevuta', importo: 300, controparte: 'D SRL', scadenza: '2027-03-31' }),
  ];
  const p = proponiAbbinamento(mov(-750, 'DISPOSIZIONE BONIFICI Num. Distinta 263140100075711'), rate)!;
  assert.deepEqual(p.rate.map(r => r.id).sort(), [1, 3]);
  assert.ok(p.punteggio < 75);
});

test('banca: risposta dell\'IA controllata (fatture esistenti, direzione, somma, categoria)', () => {
  const movimenti = [{ ...mov(2462.57, 'BONIFICO SELEA ACCONTO FATTURA 111'), id: 1, conto: '3092938' }, { ...mov(-74.67, 'ADDEBITO SDD XYZ'), id: 2, conto: '3092938' },
    { ...mov(100, 'BONIFICO'), id: 3, conto: '3092938' }];
  const rate = [rata({ id: 5, importo: 2462.57, gia: true, pagataIl: '2026-11-10' }), rata({ id: 6, importo: 90 })];
  assert.match(richiestaIa(movimenti, rate, n => n), /E5:gia \| fattura emessa 111/);
  const testo = `Ecco: [{"id":1,"fatture":["E5:gia"],"categoria":null,"motivo":"acconto FT 111","sicura":true},
    {"id":2,"fatture":[],"categoria":"Assicurazioni","motivo":"polizza","sicura":false},
    {"id":3,"fatture":["E6"],"categoria":"Altre entrate","motivo":"?","sicura":true},{"id":99,"fatture":[],"categoria":"Utenze"}]`;
  const r = leggiRispostaIa(testo, movimenti, rate, '2026-11-14');
  assert.deepEqual(r.get(1)!.rate, [{ tipo: 'emessa', id: 5, gia: true }]);
  assert.equal(r.get(2)!.categoria, 'Assicurazioni');
  // 90 € non fanno 100 €: resta solo la categoria, non sicura
  assert.deepEqual([r.get(3)!.rate, r.get(3)!.categoria, r.get(3)!.sicura], [[], 'Altre entrate', false]);
  assert.equal(r.has(99), false);
  assert.equal(leggiRispostaIa('non so', movimenti, rate, '2026-11-14').size, 0);
});
