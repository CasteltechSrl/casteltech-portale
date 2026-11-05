import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prezzoSchedaConUnaTantumElenco } from '../src/engine/elenco-preventivi.js';

test('elenco preventivi: €/PCB con una tantum = prezzo a scheda del primo lotto (Adriano 5/11/2026)', () => {
  // totale lotti successivi 890,42 + una tantum 250,94 su 1 scheda → prezzoSchedaPrimoLotto 1141,36 (viene da PostgreSQL come testo)
  assert.deepEqual(prezzoSchedaConUnaTantumElenco({ prezzo_scheda_ut: '1141.36', prezzo_scheda_ut_mano: null }), { valore: 1141.36, aMano: false });
  // senza risultato salvato la cella resta vuota
  assert.deepEqual(prezzoSchedaConUnaTantumElenco({ prezzo_scheda_ut: null, prezzo_scheda_ut_mano: null }), { valore: null, aMano: false });
});

test('elenco preventivi: il prezzo scritto a mano nei ritocchi della stampa vince sul calcolato', () => {
  assert.deepEqual(prezzoSchedaConUnaTantumElenco({ prezzo_scheda_ut: 1141.36, prezzo_scheda_ut_mano: '1150' }), { valore: 1150, aMano: true });
  // zero o vuoto a mano = non scritto
  assert.deepEqual(prezzoSchedaConUnaTantumElenco({ prezzo_scheda_ut: 1141.36, prezzo_scheda_ut_mano: '' }), { valore: 1141.36, aMano: false });
  assert.deepEqual(prezzoSchedaConUnaTantumElenco({ prezzo_scheda_ut: 1141.36, prezzo_scheda_ut_mano: 0 }), { valore: 1141.36, aMano: false });
});
