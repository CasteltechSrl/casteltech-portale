import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avvisoSenzaFase, totaleDaOre, ordineRighe } from '../src/engine/rientro.js';

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

test('righe del rientro in ordine di fase, poi data e ora; senza fase in fondo (Adriano 12/11/2026)', () => {
  const righe = [
    { fase: 'F3', data: '2026-10-23', inizio: '15:10' },
    { fase: 'F1', data: '2026-10-16', inizio: '14:20' },
    { fase: '', data: '2026-11-03', inizio: '11:45' },
    { fase: 'F2', data: '2026-10-23' },
    { fase: 'F1', data: '2026-10-16', inizio: '13:40' },
    { fase: 'ALTRA', data: '2026-10-01' },
    { fase: 'F2', data: '2026-10-23', inizio: '09:00' },
  ];
  assert.deepEqual(ordineRighe(righe, ['F1', 'F2', 'F3', 'ALTRA']), [4, 1, 6, 3, 0, 5, 2]);
});
