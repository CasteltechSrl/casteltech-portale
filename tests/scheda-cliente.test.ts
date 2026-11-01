import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fatturatoPerAnno, giorniMediIncasso, situazioneIncassi } from '../src/engine/scheda-cliente.js';

test('scheda cliente: fatturato per anno = fatture meno note di credito, fuori bozze/annullate/scartate, ultimi 3 anni', () => {
  const docs = [
    { tipo: 'fattura', anno: 2026, data: '2026-03-01', stato: 'consegnato', imponibile: 1000, totale: 1220 },
    { tipo: 'nota_credito', anno: 2026, data: '2026-04-01', stato: 'consegnato', imponibile: 100, totale: 122 },
    { tipo: 'fattura', anno: 2026, data: '2026-05-01', stato: 'bozza', imponibile: 999, totale: 0 },
    { tipo: 'fattura', anno: 2026, data: '2026-05-02', stato: 'scartato', imponibile: 999, totale: 0 },
    { tipo: 'ddt', anno: 2026, data: '2026-05-03', stato: 'emesso', imponibile: 500, totale: 500 },
    { tipo: 'fattura', anno: 2025, data: '2025-03-01', stato: 'consegnato', imponibile: 800, totale: 976 },
    { tipo: 'fattura', anno: 2022, data: '2022-03-01', stato: 'consegnato', imponibile: 5, totale: 6 },
  ];
  assert.deepEqual(fatturatoPerAnno(docs, 2026), [{ anno: 2024, importo: 0 }, { anno: 2025, importo: 800 }, { anno: 2026, importo: 900 }]);
});

test('scheda cliente: incassi scaduti e a scadere, giorni medi di incasso', () => {
  const rate = [
    { data: '2026-10-01', importo: 100, pagata: false }, { data: '2026-10-20', importo: 50, pagata: false },
    { data: '2026-12-01', importo: 300, pagata: false }, { data: '2026-09-01', importo: 70, pagata: true },
  ];
  assert.deepEqual(situazioneIncassi(rate, '2026-11-02'), { scaduto: 150, scaduteN: 2, aScadere: 300, aScadereN: 1 });
  assert.equal(giorniMediIncasso([{ dataFattura: '2026-01-01', pagataIl: '2026-03-02' }, { dataFattura: '2026-02-01', pagataIl: '2026-03-03' }, { dataFattura: '2026-05-01', pagataIl: null }]), 45);
  assert.equal(giorniMediIncasso([{ dataFattura: '2026-05-01', pagataIl: null }]), null);
});

test('scheda cliente: la nota di credito aperta toglie dal credito ma non conta come rata (Adriano 1/11/2026)', () => {
  const r = situazioneIncassi([{ data: '2026-10-01', importo: 1000, pagata: false }, { data: '2026-10-01', importo: -200, pagata: false }], '2026-11-02');
  assert.deepEqual(r, { scaduto: 800, scaduteN: 1, aScadere: 0, aScadereN: 0 });
});
