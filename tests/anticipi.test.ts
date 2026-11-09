import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anticipiDelleFatture, fattureAnticipate, numeriCitati, QUOTA_BONIFICO, segnoAnticipo, statoIncasso, type MovimentoAnticipo } from '../src/engine/anticipi.js';
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

// Controllo del 9/11/2026 (Adriano: "in anticipo secondo me mancano dei dati"): casi visti nei movimenti veri, nomi e importi inventati
test('anticipi: fatture riconosciute dall\'importo (80 %), numero attaccato, fattura con data dopo l\'anticipo', () => {
  assert.deepEqual(numeriCitati('ANTICIPO SU DOCUMENTI FT51 +54'), ['51', '54']);
  assert.deepEqual(numeriCitati('RIENTRO ANTICIPO/FINANZIAMENTO FATT.39'), ['39']);
  const b = (data: string, importo: number, descrizione: string): MovimentoAnticipo => ({ data, importo, descrizione, conto: 'b' });
  const f = (id: number, numero: string, data: string, importo: number, cliente = 'ALFA SRL', pagata: string | null = null) =>
    ({ id, numero, data, cliente, rate: [{ id: id * 10, scadenza: '2026-12-31', importo, pagata }] });
  const fatture = [
    f(1, '14', '2026-02-28', 10000), f(2, '18', '2026-02-28', 2000, 'BETA SRL'), f(3, '20', '2026-02-28', 3000, 'GAMMA SRL'),
    f(4, '4', '2026-01-31', 5000, 'ALFA SRL', '2026-04-22'), f(5, '64', '2026-06-30', 4100, 'DELTA SRL'),
    f(6, '74', '2026-07-16', 3000, 'EPSILON SRL'), f(7, '75', '2026-07-16', 1500, 'ZETA SRL'), f(8, '73', '2026-07-16', 2400, 'ETA SRL'),
    f(9, '65', '2026-06-30', 12000, 'CABLE TEST SRL'), f(10, '91', '2026-08-17', 1000, 'TETA SRL'),
  ];
  const a = anticipiDelleFatture([
    b('2026-03-06', -9600, 'ANTICIPO SU DOCUMENTI FT.14 +20'),        // 80 % di 14 + 18, non di 14 + 20
    b('2026-06-30', -3280, 'ANTICIPO SU DOCUMENTI ft.4/2026'),          // la 4 è già incassata: 80 % della 64
    b('2026-07-02', -9000, 'ANTICIPO SU DOCUMENTI ft cable test'),      // senza numero, col nome del cliente
    b('2026-07-17', -3600, 'ANTICIPO SU DOCUMENTI ft'),                 // 80 % di 74 + 75
    b('2026-08-14', -800, 'ANTICIPO SU DOCUMENTI ft. 91'),              // fattura con la data di 3 giorni dopo
  ], fatture);
  assert.deepEqual([...a.keys()].sort((x, y) => x - y), [1, 2, 5, 6, 7, 9, 10]);
  assert.equal(a.get(2)![0].numeroBanca, '14 + 20');
  assert.equal(a.get(5)![0].importo, 3280);
  assert.match(segnoAnticipo(a.get(7))!.titolo, /non ha scritto il numero/);
});

test('anticipi: rientro che corregge il numero, rientro di anticipi più vecchi, RiBa con più fatture', () => {
  const b = (data: string, importo: number, descrizione: string, conto = 'b'): MovimentoAnticipo => ({ data, importo, descrizione, conto });
  const a = anticipiDelleFatture([
    b('2026-01-05', 1000, 'RIENTRO ANTICIPO/FINANZIAMENTO ALFA SRL N 125'),       // anticipata a dicembre, prima del file
    b('2026-02-02', -7000, 'ANTICIPO SU DOCUMENTI FT. 05 DEL 30.01.26'),
    b('2026-02-25', 7000, 'RIENTRO ANTICIPO/FINANZIAMENTO BETA SRL N 2'),          // l'anticipo era della 2
    b('2026-08-03', 1159, 'ACCREDITO RIBA AL SBF LOTTO: PRG. 0003 NUM.EFF. 00001', 'r'),
  ], [
    { id: 1, numero: '125', data: '2025-12-16', rate: [{ id: 11, scadenza: '2026-01-31', importo: 1250, pagata: '2026-01-05' }] },
    { id: 2, numero: '2', data: '2026-01-31', rate: [{ id: 21, scadenza: '2026-03-31', importo: 9000, pagata: '2026-02-25' }] },
    { id: 3, numero: '5', data: '2026-01-31', rate: [{ id: 31, scadenza: '2026-02-28', importo: 183, pagata: '2026-02-20' }] },
    { id: 4, numero: '72', data: '2026-07-15', rate: [{ id: 41, scadenza: '2026-09-10', importo: 976, riba: true, pagata: null }] },
    { id: 5, numero: '82', data: '2026-07-29', rate: [{ id: 51, scadenza: '2026-09-10', importo: 183, riba: true, pagata: null }] },
  ]);
  assert.equal(a.get(1)![0].prima, true);
  assert.equal(a.get(1)![0].rientro, '2026-01-05');
  assert.equal(a.has(3), false);
  assert.equal(a.get(2)![0].numeroBanca, '5');
  assert.equal(a.get(4)![0].tipo, 'riba');
  assert.deepEqual(a.get(5)![0].insieme, ['72']);
});

test('incasso: incassata col movimento della banca, in parte, scaduta, da incassare', () => {
  const oggi = '2026-11-09';
  const i = statoIncasso([{ scadenza: '2026-10-31', importo: 100, pagata: '2026-10-14', movimento: { data: '2026-10-14', conto: 'c/c ordinario' } }], oggi)!;
  assert.equal(i.stato, 'incassata');
  assert.equal(i.testo, 'incassata 14/10/2026');
  assert.match(i.titolo, /movimento di banca del 14\/10\/2026, c\/c ordinario/);
  assert.equal(statoIncasso([{ scadenza: '2026-10-31', importo: 100, pagata: '2026-10-30' }, { scadenza: '2026-11-30', importo: 100, pagata: null }], oggi)!.stato, 'in_parte');
  assert.equal(statoIncasso([{ scadenza: '2026-10-31', importo: 100, pagata: null }], oggi)!.stato, 'scaduta');
  assert.equal(statoIncasso([{ scadenza: '2026-12-31', importo: 100, pagata: null }], oggi)!.testo, 'da incassare');
  assert.equal(statoIncasso([], oggi), null);
  assert.ok(cercaGuida('fattura incassata colonna incasso').some(a => a.argomento.id === 'banca-riba'));
});
