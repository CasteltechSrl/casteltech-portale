import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confrontaOrdiniFatture, fattureDaCoprire, notaPostumo, riepilogoMesi, type FatturaConfronto, type RigaOrdineConfronto } from '../src/engine/ordini-postumi.js';
import { cercaGuida } from '../src/engine/guida.js';

const ordine = (id: number, x: Partial<RigaOrdineConfronto> = {}): RigaOrdineConfronto => ({
  id, ordineId: id, clienteId: 1, dataOrdine: '2026-09-01', codici: ['M2116'], descrizione: 'M2116', quantita: 100, annullata: false, postumoFatturaId: null, ...x });
const fattura = (id: number, numero: number, data: string, righe: FatturaConfronto['righe'], clienteId = 1): FatturaConfronto =>
  ({ id, anno: 2026, numero, data, clienteId, cliente: 'CONTROL SYSTEMS SRL', righe });

test('righe coperte dal collegamento o da un ordine con stesso codice e quantità libera', () => {
  const esiti = confrontaOrdiniFatture([ordine(1)], [
    fattura(10, 100, '2026-09-20', [{ chiave: 'a', codice: 'M2116', descrizione: null, quantita: 80, valore: 120 }]),
    // seconda fattura: restano 20 pezzi liberi, gli altri 30 sono senza ordine
    fattura(11, 101, '2026-10-20', [{ chiave: 'b', codice: 'M-2116', descrizione: null, quantita: 50, valore: 75 },
      { chiave: 'c', codice: null, descrizione: 'Sconto', quantita: 1, valore: -5 }]),
    // collegata direttamente: coperta anche se il codice è diverso
    fattura(12, 102, '2026-10-21', [{ chiave: 'd', codice: 'X', descrizione: null, quantita: 5, valore: 50, rigaOrdineId: 1 }]),
  ]);
  assert.equal(esiti[0].scoperto, 0);
  assert.equal(esiti[1].valore, 70);            // fatturato con lo sconto
  assert.equal(esiti[1].scoperto, 45);          // 30 pezzi × 1,50
  assert.equal(esiti[1].scoperte[0].quantitaScoperta, 30);
  assert.equal(esiti[2].scoperto, 0);
  assert.deepEqual(fattureDaCoprire(esiti).map(e => e.fattura.numero), [101]);
});

test('altro cliente, ordine annullato, ordine molto dopo la fattura e fatture stornate', () => {
  const esiti = confrontaOrdiniFatture([ordine(1, { clienteId: 2 }), ordine(2, { annullata: true }), ordine(3, { dataOrdine: '2026-12-31' })], [
    fattura(10, 100, '2026-10-01', [{ chiave: 'a', codice: 'M2116', descrizione: null, quantita: 10, valore: 10 }]),
    fattura(6, 6, '2026-01-31', [{ chiave: 'b', codice: 'M2116', descrizione: null, quantita: 10, valore: 10 }]),
  ]);
  assert.equal(esiti.length, 1);                // la 6/2026 è stornata
  assert.equal(esiti[0].scoperto, 10);
});

test('la fattura con il suo ordine postumo è coperta e il riepilogo la conta a parte', () => {
  const esiti = confrontaOrdiniFatture([ordine(9, { postumoFatturaId: 10, codici: ['ZZZZ'], valore: 20 })],
    [fattura(10, 100, '2026-10-01', [{ chiave: 'a', codice: 'M2116', descrizione: null, quantita: 10, valore: 30 }])]);
  assert.equal(esiti[0].postumo, true);
  assert.deepEqual(fattureDaCoprire(esiti), []);
  const mesi = riepilogoMesi(esiti, { '2026-10': { valore: 500, ordini: 2 } }, 2026);
  const ott = mesi.find(m => m.mese === '2026-10')!;
  assert.equal(mesi.length, 12);
  assert.deepEqual([ott.fatturato, ott.coperto, ott.postumi, ott.scoperto, ott.ordinato, ott.ordini], [30, 10, 20, 0, 500, 2]);
  assert.match(notaPostumo({ numero: 118, anno: 2026 }, '2026-11-09'), /ORDINE POSTUMO creato ad hoc il 09\/11\/2026 .*118\/2026/);
});

test('la guida spiega gli ordini postumi', () => {
  assert.ok(cercaGuida('ordini postumi').some(a => a.argomento.id === 'cruscotto-ordini'));
});
