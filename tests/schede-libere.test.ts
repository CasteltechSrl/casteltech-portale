import { test } from 'node:test';
import assert from 'node:assert/strict';
import { datiDaCompletare, fasiProposte, fasiScelte, leggiSenzaPreventivo, modoScheda, tempoScritto, type FaseCatalogo } from '../src/engine/schede-libere.js';

const CAT: FaseCatalogo[] = [
  { codice: 'pre', numero: 'A', nome: 'Pre-produzione', gruppo: 'PRE', unaTantum: true, tariffa: 'ufficio', persone: 1 },
  { codice: 'smd', numero: '1', nome: 'Montaggio SMD', gruppo: 'SMD', unaTantum: false, tariffa: 'produzione', persone: 2 },
  { codice: 'tht', numero: '2', nome: 'Saldatura a mano', gruppo: 'THT', unaTantum: false, tariffa: 'produzione', persone: 1 },
];

test('schede senza preventivo: modo e dati salvati', () => {
  assert.equal(modoScheda('urgente'), 'urgente');
  assert.equal(modoScheda('altro'), null);
  assert.equal(leggiSenzaPreventivo(null), null);
  assert.deepEqual(leggiSenzaPreventivo({ modo: 'consuntivo', doppiaFaccia: 'on', schedePannello: '4' }), { modo: 'consuntivo', doppiaFaccia: true, schedePannello: 4 });
  assert.equal(leggiSenzaPreventivo({ modo: 'urgente', schedePannello: 'x' })!.schedePannello, 1);
});

test('schede senza preventivo: a consuntivo tutte le fasi spuntate, urgente nessuna, salvate come sono', () => {
  assert.ok(Object.values(fasiProposte(CAT, 'consuntivo')).every(x => x.si && !x.tempo));
  assert.ok(Object.values(fasiProposte(CAT, 'urgente')).every(x => !x.si));
  const salvate = fasiProposte(CAT, 'consuntivo', [{ codice: 'smd', persone: 3, cicloSec: 5400 }]);
  assert.deepEqual(salvate.smd, { si: true, tempo: '1:30', persone: '3' });
  assert.equal(salvate.pre.si, false);
});

test('schede senza preventivo: fasi spuntate con tempo facoltativo, persone dal catalogo se vuote', () => {
  const f = fasiScelte(CAT, { smd: { si: '1', tempo: '1.30', persone: '' }, tht: { si: '1', tempo: '', persone: '2' }, pre: { tempo: '0:10' } });
  assert.deepEqual(f.map(x => x.codice), ['smd', 'tht']);
  assert.equal(f[0].cicloSec, 5400);
  assert.equal(f[0].uomoSec, 10800);       // 2 persone del catalogo
  assert.equal(f[1].cicloSec, 0);          // nessun tempo previsto: la scheda lo lascia vuoto
  assert.equal(f[1].persone, 2);
  assert.equal(tempoScritto(3600 * 2 + 300), '2:05');
});

test('elenco: cosa manca ancora alla scheda di produzione', () => {
  assert.deepEqual(datiDaCompletare({}), ['referente', 'ordine cliente', 'consegna', 'programmi']);
  assert.deepEqual(datiDaCompletare({ referente: 'ROSSI', ordineCliente: '45', consegna: '2026-12-01',
    scheda: { programmi: { progForno: { top: 'TOP STD', bot: '' } } } }), []);
  assert.deepEqual(datiDaCompletare({ referente: 'ROSSI', ordineCliente: '45', consegna: '2026-12-01', scheda: { pasta: 'SAC305' }, senzaFasi: true }), ['fasi']);
});
