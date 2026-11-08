import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anticipiDelleFatture, fattureAnticipate, numeriCitati, QUOTA_BONIFICO, segnoAnticipo, type MovimentoAnticipo } from '../src/engine/anticipi.js';
import { previsioneCassa } from '../src/engine/previsione-cassa.js';
import { cercaGuida } from '../src/engine/guida.js';

// Adriano 7/11/2026: RiBa anticipate al 100 %, bonifici all'80 %; descrizioni come quelle dei conti tecnici BPER (nomi e importi inventati)
test('anticipi: numeri delle fatture nelle descrizioni della banca', () => {
  assert.deepEqual(numeriCitati('ANTICIPO SU DOCUMENTI FT. 108 + 98'), ['108', '98']);
  assert.deepEqual(numeriCitati('ANTICIPO SU DOCUMENTI ft. 95/2026'), ['95']);
  assert.deepEqual(numeriCitati('ANTICIPO SU DOCUMENTI FT.155 DEL 30.12.25'), ['155']);
  assert.deepEqual(numeriCitati('ANTICIPO SU DOCUMENTI FT.109+110+111+113+116'), ['109', '110', '111', '113', '116']);
  assert.deepEqual(numeriCitati('ANTICIPO SU DOCUMENTI ANTICIPO SU FATTURE 41 E 42'), ['41', '42']);
  assert.deepEqual(numeriCitati('RIENTRO ANTICIPO/FINANZIAMENTO ALFA S.R.L. N 81/2026'), ['81']);
  assert.deepEqual(numeriCitati('RIENTRO ANTICIPO/FINANZIAMENTO BETA SRL N 119.BIS'), ['119']);
  assert.deepEqual(numeriCitati('RIENTRO ANTICIPO/FINANZIAMENTO RIENTRO SU ANT FATTURA IN SCADENZA30.04.26 GAMMA SRL'), []);
});

test('anticipi: bonifico all\'80 %, rientro, numero sbagliato della banca, RiBa al SBF', () => {
  const m = (data: string, importo: number, descrizione: string, conto = 'IT'): MovimentoAnticipo => ({ data, importo, descrizione, conto });
  const movimenti = [
    m('2026-02-02', -7000, 'ANTICIPO SU DOCUMENTI FT. 05 DEL 30.01.26'),
    m('2026-02-25', 7000, 'RIENTRO ANTICIPO/FINANZIAMENTO DELTA SRL N 2'),          // numero sbagliato, stesso importo: chiude la FT 5
    m('2026-09-04', -4100, 'ANTICIPO SU DOCUMENTI FT. 98/2026'),
    m('2026-11-03', 4100, 'RIENTRO ANTICIPO/FINANZIAMENTO FT 98 + 108'),
    m('2026-11-04', -8800, 'ANTICIPO SU DOCUMENTI FT. 108 + 98'),                  // di nuovo anticipate (rata di novembre)
    m('2026-09-15', -3900, 'ANTICIPO SU DOCUMENTI ft. 106/2026', 'ESTERO'),           // fattura già incassata, anticipo non ancora rientrato
    m('2026-09-15', 12000, 'ACCREDITO RIBA AL SBF LOTTO: PRG. 0001', 'RIBA'),
  ];
  const rate = [
    { id: 1, numero: '98', dataDoc: '2026-08-31', scadenza: '2026-11-30', importo: 5000 },
    { id: 2, numero: '108', dataDoc: '2026-09-21', scadenza: '2026-11-30', importo: 6000 },
    { id: 3, numero: '77', dataDoc: '2026-07-31', scadenza: '2026-11-10', importo: 12000, riba: true },
    { id: 4, numero: '5', dataDoc: '2026-01-30', scadenza: '2026-12-31', importo: 100 },
  ];
  const { anticipate, daRientrare } = fattureAnticipate(movimenti, rate, '2026-11-07');
  const bon = anticipate.filter(a => a.tipo === 'bonifico');
  assert.deepEqual(bon.map(a => a.numero).sort(), ['108', '98']);
  assert.equal(Math.round(bon.reduce((s, a) => s + a.anticipato, 0) * 100) / 100, 8800);   // = saldo del conto anticipo
  assert.equal(QUOTA_BONIFICO, 0.8);
  assert.deepEqual(anticipate.filter(a => a.tipo === 'riba').map(a => [a.numero, a.anticipato]), [['77', 12000]]);
  assert.deepEqual(daRientrare, [{ numero: '106', data: '2026-09-15', importo: 3900 }]);

  // nella previsione: la RiBa non entra più, il bonifico entra intero e la banca riprende l'80 %, l'anticipo della 106 esce subito
  const perRata = new Map(anticipate.flatMap(a => a.rate.map(r => [r.id, { tipo: a.tipo, anticipato: r.anticipato }] as const)));
  const p = previsioneCassa({ oggi: '2026-11-07', saldo: { importo: 0, data: '2026-11-07' }, storico: [], pagamenti: [], fisse: [], puntuali: [],
    rate: rate.map(r => ({ id: r.id, cliente: 'C', numero: r.numero, scadenza: r.scadenza, importo: r.importo })), anticipi: { perRata, daRientrare } });
  assert.equal(p.anticipi.riba, 12000);
  assert.equal(p.anticipi.daRientrare, 3900);
  assert.ok(!p.movimenti.some(x => x.riferimento === '77'));
  const netto98 = p.movimenti.filter(x => x.riferimento === '98').reduce((s, x) => s + x.importo, 0);
  assert.equal(Math.round(netto98 * 100) / 100, 1000);                               // 20 % di 5000
  assert.ok(p.movimenti.some(x => x.riferimento === '106' && x.importo === -3900 && x.data === '2026-11-07'));
});

test('anticipi: la guida spiega le fatture anticipate', () => {
  assert.ok(cercaGuida('fatture anticipate riba 80').some(a => a.argomento.id === 'banca-riba'));
});

// Adriano 8/11/2026: nell'elenco delle fatture si vede quali sono state anticipate, anche quelle già incassate (dati inventati)
test('anticipi: storico fattura per fattura (bonifico con rientro, rientro senza numero, RiBa, incassata senza rientro)', () => {
  const mov: MovimentoAnticipo[] = [
    { data: '2026-03-06', importo: -9000, descrizione: 'ANTICIPO SU DOCUMENTI FT.14 +20', conto: 'b' },
    { data: '2026-03-16', importo: -2000, descrizione: 'ANTICIPO SU DOCUMENTI FT.23', conto: 'b' },
    { data: '2026-04-02', importo: 5000, descrizione: 'RIENTRO ANTICIPO/FINANZIAMENTO ROSSI SRL N 14', conto: 'b' },
    { data: '2026-04-27', importo: 2000, descrizione: 'RIENTRO ANTICIPO/FINANZIAMENTO RIENTRO SU ANT FATTURA IN SCADENZA30.04.26', conto: 'b' },
    { data: '2026-03-10', importo: 1234.5, descrizione: 'ACCREDITO RIBA AL SBF LOTTO: PRG. 0003 NUM.EFF. 00001', conto: 'r' },
  ];
  const fatture = [
    { id: 1, numero: '14', data: '2026-02-28', rate: [{ id: 11, scadenza: '2026-03-31', importo: 6250, pagata: '2026-03-31' }] },
    { id: 2, numero: '20', data: '2026-02-28', rate: [{ id: 21, scadenza: '2026-03-31', importo: 5000, pagata: '2026-03-31' }] },
    { id: 3, numero: '23', data: '2026-03-16', rate: [{ id: 31, scadenza: '2026-04-30', importo: 2500, pagata: null }] },
    { id: 4, numero: '14', data: '2025-02-28', rate: [{ id: 41, scadenza: '2025-03-31', importo: 6250, pagata: '2025-03-31' }] },
    { id: 5, numero: '9', data: '2026-02-10', rate: [{ id: 51, scadenza: '2026-04-30', importo: 1234.5, riba: true, pagata: null }] },
  ];
  const a = anticipiDelleFatture(mov, fatture);
  assert.equal(a.get(1)![0].rientro, '2026-04-02');                 // fattura del 2026, non quella del 2025 con lo stesso numero
  assert.deepEqual(a.get(1)![0].insieme, ['20']);
  assert.equal(a.has(4), false);
  assert.equal(a.get(2)![0].rientro, null);
  assert.equal(a.get(2)![0].incassata, true);                       // incassata, rientro non riconosciuto
  assert.equal(a.get(3)![0].rientro, '2026-04-27');                 // rientro senza numero: stesso importo dell'anticipo
  assert.equal(a.get(5)![0].tipo, 'riba');
  assert.equal(a.get(5)![0].scadenza, '2026-04-30');
  assert.equal(segnoAnticipo(a.get(5))!.testo, 'RiBa');
  assert.match(segnoAnticipo(a.get(2))!.titolo, /incassata/);
});

// FT 20 anticipata insieme alla 14: la banca riprende la parte della 20 con un altro nome e numero (dati inventati)
test('anticipi: rientro con il nome sbagliato = quanto resta dell\'anticipo di più fatture', () => {
  const mov: MovimentoAnticipo[] = [
    { data: '2026-03-06', importo: -9000, descrizione: 'ANTICIPO SU DOCUMENTI FT.14 +20', conto: 'b' },
    { data: '2026-03-31', importo: 1000, descrizione: 'RIENTRO ANTICIPO/FINANZIAMENTO BIANCHI SRL N 18', conto: 'b' },
    { data: '2026-04-02', importo: 8000, descrizione: 'RIENTRO ANTICIPO/FINANZIAMENTO ROSSI SRL N 14', conto: 'b' },
  ];
  const a = anticipiDelleFatture(mov, [
    { id: 1, numero: '14', data: '2026-02-28', rate: [{ id: 11, scadenza: '2026-03-31', importo: 10000, pagata: '2026-03-31' }] },
    { id: 2, numero: '20', data: '2026-02-28', rate: [{ id: 21, scadenza: '2026-03-31', importo: 4000, pagata: '2026-03-30' }] },
  ]);
  assert.equal(a.get(2)![0].rientro, '2026-03-31');      // 9000 − 80 % della 14 (8000) = 1000
  assert.equal(a.get(1)![0].rientro, '2026-04-02');
});
