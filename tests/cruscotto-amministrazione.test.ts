import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fasciaScadenza, imponibilePerMese, riepilogoScadenze, variazione } from '../src/engine/cruscotto-amministrazione.js';

test('Cruscotto: scadenze divise per urgenza (il giorno stesso non è ancora scaduta)', () => {
  const oggi = '2026-10-27';
  assert.equal(fasciaScadenza('2026-10-26', oggi), 'scaduta');
  assert.equal(fasciaScadenza('2026-10-27', oggi), 'settimana');
  assert.equal(fasciaScadenza('2026-11-03', oggi), 'settimana');
  assert.equal(fasciaScadenza('2026-11-04', oggi), 'mese');
  assert.equal(fasciaScadenza('2026-11-26', oggi), 'mese');
  assert.equal(fasciaScadenza('2026-11-27', oggi), 'oltre');
  const r = riepilogoScadenze([{ data: '2026-09-11', importo: 100.1 }, { data: '2026-10-01', importo: 0.2 }, { data: '2026-10-31', importo: 50 }], oggi);
  assert.equal(r.totale, 150.3);
  assert.deepEqual(r.fasce.scaduta, { totale: 100.3, quante: 2 });
  assert.deepEqual(r.fasce.settimana, { totale: 50, quante: 1 });
  assert.deepEqual(r.fasce.oltre, { totale: 0, quante: 0 });
});

test('Cruscotto: imponibile per mese, note di credito tolte, stesso periodo dell\'anno prima', () => {
  const movimenti = [
    { tipo: 'fattura', data: '2026-01-10', imponibile: 1000 }, { tipo: 'nota_credito', data: '2026-01-20', imponibile: 200 },
    { tipo: 'fattura', data: '2025-10-27', imponibile: 300 }, { tipo: 'fattura', data: '2025-10-28', imponibile: 400 },
  ];
  const mesi = imponibilePerMese(movimenti, 2026);
  assert.equal(mesi.length, 12);
  assert.equal(mesi[0], 800);
  assert.equal(imponibilePerMese(movimenti, 2025)[9], 700);
  assert.equal(imponibilePerMese(movimenti, 2025, '2026-10-27')[9], 300);   // fino al 27 ottobre
  assert.equal(variazione(110, 100), 10);
  assert.equal(variazione(79, 100), -21);
  assert.equal(variazione(50, 0), null);
});
