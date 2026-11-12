import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avvisoSenzaFase, totaleDaOre } from '../src/engine/rientro.js';

test('dice quali righe non hanno la fase e che non si è perso niente', () => {
  assert.ok(avvisoSenzaFase([15]).includes('la riga 15 non ha la fase'));
  assert.ok(avvisoSenzaFase([15, 18, 21]).includes('le righe 15, 18 e 21 non hanno la fase'));
  assert.ok(avvisoSenzaFase([15]).includes('non si è perso niente'));
});
test('il totale suggerito viene da apertura e chiusura, non più "1.30" fisso', () => {
  assert.equal(totaleDaOre({ inizio: '13:40', fine: '14:00' }), "20'");
  assert.equal(totaleDaOre({ inizio: '15:10', fine: '17:00' }), "1h 50'");
  assert.equal(totaleDaOre({ inizio: '23:30', fine: '00:15' }), "45'");
  assert.equal(totaleDaOre({ inizio: '13:40' }), undefined);
});

