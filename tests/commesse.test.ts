import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consumiPrevisti } from '../src/engine/consumi.js';

test('scheda: materiale di consumo previsto a scheda dal preventivo (conformal coating riportato alla quantità)', () => {
  const prev = {
    n_schede: 100,
    catalogo: { parametri: [{ codice: 'crema', default: 0 }, { codice: 'viteria', default: 0 }] },
    parametri: { crema: 1.5, stagnoInFilo: 0.25, kaptonInNastro: 4, bolliniKapton: 2, tropicalizzante: 2 },
  };
  const c = Object.fromEntries(consumiPrevisti(prev, 250).map(m => [m.nome, m.previsto]));
  assert.equal(c['Pasta saldante'], '1,5 gr');
  assert.equal(c['Filo di saldatura'], '0,25 gr');
  assert.equal(c['Kapton'], '4 cm + 2 bollini');
  assert.equal(c['Conformal coating'], '5 bomb. sul lotto');   // 2 bombolette per 100 schede → 5 per 250
  assert.equal(c['Viteria'], '');                              // zero = niente previsto
  assert.equal(c['Flussante liquido / gel'], '');
});
