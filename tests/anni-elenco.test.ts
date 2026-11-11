import { test } from 'node:test';
import assert from 'node:assert/strict';
import { annoDi, annoScelto, clienteAnnoPerAnno, contaPerAnno, filtraPerAnno, indirizzoAnno } from '../src/engine/anni-elenco.js';
import { barraAnni } from '../src/server/views/barra-anni.js';
import { cercaGuida } from '../src/engine/guida.js';

// Adriano 11/11/2026: "la divisione per anno è sempre una cosa importante"
test('anno di una data, anno scelto, conteggio e filtro', () => {
  assert.equal(annoDi('2025-03-01'), 2025);
  assert.equal(annoDi(new Date('2024-12-31T10:00:00Z')), 2024);
  assert.equal(annoDi(null), null);
  assert.equal(annoScelto({ anno: '2025' }), 2025);
  assert.equal(annoScelto({ anno: 'x' }), null);
  const righe = [{ d: '2026-01-02' }, { d: '2025-05-01' }, { d: '2026-07-01' }, { d: null }];
  assert.deepEqual(contaPerAnno(righe, r => r.d), [{ anno: 2026, n: 2 }, { anno: 2025, n: 1 }]);
  assert.equal(filtraPerAnno(righe, r => r.d, 2026).length, 2);
  assert.equal(filtraPerAnno(righe, r => r.d, null).length, 4);
});

test('indirizzo con l\'anno: tiene i filtri, toglie pagina e messaggio', () => {
  assert.equal(indirizzoAnno('/preventivi', { q: 'SELEA', pagina: '3', msg: 'ok' }, 2025), '/preventivi?q=SELEA&anno=2025');
  assert.equal(indirizzoAnno('/preventivi', { anno: '2025' }, null), '/preventivi');
  const barra = String(barraAnni([{ anno: 2026, n: 2 }, { anno: 2025, n: 1 }], 2025, '/commesse', { q: 'X' }));
  assert.match(barra, /Tutti \(3\)/);
  assert.match(barra, /href="\/commesse\?q=X&amp;anno=2026"/);
  assert.match(barra, /<b aria-current="page">2025 \(1\)<\/b>/);
  assert.equal(String(barraAnni([{ anno: 2026, n: 5 }], null, '/commesse', {})), '');   // un anno solo: niente fila
});

test('cliente anno per anno: fatturato con le note di credito in negativo, variazione, conteggi', () => {
  const anni = clienteAnnoPerAnno([
    { tipo: 'fattura', anno: 2026, stato: 'emesso', imponibile: 1000 }, { tipo: 'nota_credito', anno: 2026, stato: 'emesso', imponibile: 200 },
    { tipo: 'fattura', anno: 2026, stato: 'bozza', imponibile: 5000 }, { tipo: 'ddt', anno: 2026, stato: 'emesso', imponibile: null },
    { tipo: 'fattura', anno: 2025, stato: 'emesso', imponibile: 1600 },
  ], [{ creato_il: '2026-02-01' }, { creato_il: '2024-02-01' }], [{ data: '2025-09-01' }]);
  assert.deepEqual(anni.map(a => a.anno), [2026, 2025, 2024]);
  assert.equal(anni[0].fatturato, 800); assert.equal(anni[0].fatture, 1); assert.equal(anni[0].noteCredito, 1); assert.equal(anni[0].ddt, 1);
  assert.equal(anni[0].variazione, -50);
  assert.equal(anni[1].ordini, 1); assert.equal(anni[2].preventivi, 1); assert.equal(anni[2].fatturato, 0);
});

test('guida: elenchi divisi per anno', () => {
  assert.ok(cercaGuida('preventivi di un anno solo').some(r => r.argomento.id === 'divisione-per-anno'));
});
