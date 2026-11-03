import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcolaScadenze, giorniRate, scrittaRate } from '../src/engine/amministrazione.js';

// Regola di Adriano (3/11/2026): RiBa e bonifico 30/60, 60/90, 30/60/90; il totale si divide in 2 o 3 rate uguali.

test('rate: giorni di ogni rata e scritta', () => {
  assert.deepEqual(giorniRate({ giorni: 30, fine_mese: true, rate: 3, ogni: 30 }), [30, 60, 90]);
  assert.deepEqual(giorniRate({ giorni: 60, fine_mese: true, rate: 2, ogni: 30 }), [60, 90]);
  assert.equal(scrittaRate({ giorni: 30, fine_mese: true, rate: 2, ogni: 30 }), '30/60');
  // senza rate (condizioni vecchie) = pagamento unico
  assert.deepEqual(giorniRate({ giorni: 60, fine_mese: true }), [60]);
});

test('rate: 30/60/90 f.m. divide il totale in tre, centesimi in più sull\'ultima', () => {
  assert.deepEqual(calcolaScadenze('2026-10-09', { giorni: 30, fine_mese: true, rate: 3, ogni: 30 }, 1000), [
    { data: '2026-11-30', importo: 333.33 },
    { data: '2026-12-31', importo: 333.33 },
    { data: '2027-01-31', importo: 333.34 },
  ]);
});

test('rate: 60/90 e 30/60 in due parti uguali, anche a data fattura', () => {
  assert.deepEqual(calcolaScadenze('2026-11-03', { giorni: 60, fine_mese: true, rate: 2, ogni: 30 }, 1220.01), [
    { data: '2027-01-31', importo: 610.01 },
    { data: '2027-02-28', importo: 610 },
  ]);
  assert.deepEqual(calcolaScadenze('2026-11-03', { giorni: 30, fine_mese: false, rate: 2, ogni: 30 }, 100), [
    { data: '2026-12-03', importo: 50 },
    { data: '2027-01-02', importo: 50 },
  ]);
});

test('rate: la somma delle rate torna sempre con il totale', () => {
  for (const totale of [0.01, 0.02, 1, 99.99, 1234.57, 77.47]) for (const rate of [1, 2, 3]) {
    const s = calcolaScadenze('2026-11-03', { giorni: 30, fine_mese: true, rate, ogni: 30 }, totale);
    assert.equal(s.length, rate);
    assert.equal(Math.round(s.reduce((t, x) => t + x.importo, 0) * 100), Math.round(totale * 100));
  }
});
