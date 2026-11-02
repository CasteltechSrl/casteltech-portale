import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RITMO_MS, attesaTurno } from '../src/engine/ritmo-distributori.js';

test('Distributori: le richieste partono distanziate secondo i limiti dei piani (2/11/2026)', () => {
  // limiti: DigiKey 120/min, Mouser 30/min, Farnell 2/s
  assert.ok(60_000 / RITMO_MS.digikey <= 120);
  assert.ok(60_000 / RITMO_MS.mouser <= 30);
  assert.ok(1000 / RITMO_MS.farnell <= 2);
  const t0 = 1_000_000_000;
  assert.equal(attesaTurno('farnell', t0), 0);
  assert.equal(attesaTurno('farnell', t0), 600);        // la seconda insieme aspetta
  assert.equal(attesaTurno('farnell', t0 + 100), 1100);
  assert.equal(attesaTurno('mouser', t0), 0);            // ogni distributore ha il suo ritmo
  assert.equal(attesaTurno('farnell', t0 + 10_000), 0);  // dopo una pausa riparte subito
});
