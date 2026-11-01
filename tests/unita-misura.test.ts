import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UNITA_MISURA, UM_PREDEFINITA, siglaUm } from '../src/engine/unita-misura.js';
import { sceltaUm } from '../src/server/views/scelta-um.js';
import { cercaGuida } from '../src/engine/guida.js';

test('Unità di misura (Adriano 2/11/2026): elenco con PZ e NR in testa, poi le unità internazionali', () => {
  assert.deepEqual(UNITA_MISURA.slice(0, 2).map(u => u.sigla), ['PZ', 'NR']);
  for (const s of ['KG', 'G', 'M', 'CM', 'MM', 'M2', 'M3', 'L', 'H']) assert.ok(UNITA_MISURA.some(u => u.sigla === s), s);
  assert.ok(UNITA_MISURA.every(u => u.sigla.length <= 10));     // UnitaMisura dell'XML: max 10 caratteri
  assert.equal(UM_PREDEFINITA, 'PZ');
});

test('Unità scritte in altri modi riconosciute; il resto no', () => {
  for (const [scritto, sigla] of [['pz', 'PZ'], ['Pz.', 'PZ'], ['PCS', 'PZ'], ['n.', 'NR'], ['Nr', 'NR'], ['kg', 'KG'], ['mt', 'M'], ['mq', 'M2'], ['lt', 'L'], ['ore', 'H']])
    assert.equal(siglaUm(scritto), sigla, scritto);
  assert.equal(siglaUm(''), null);
  assert.equal(siglaUm('BOBINA'), null);
});

test('Menu a tendina: valore riconosciuto selezionato, valore vecchio tenuto "(com\'era)", riga nuova = PZ', () => {
  const s = (x: unknown) => String(x);
  assert.match(s(sceltaUm('righe[0][um]', 'pz.')), /<option value="PZ"[^>]*selected/);
  const vecchio = s(sceltaUm('righe[0][um]', 'BOBINA'));
  assert.match(vecchio, /value="BOBINA" data-libero="1" selected>BOBINA \(com'era\)/);
  assert.match(s(sceltaUm('righe[3][um]', '', true)), /<option value="PZ"[^>]*selected/);
  assert.doesNotMatch(s(sceltaUm('righe[0][um]', '')), /selected/);
  assert.match(s(sceltaUm('righe[0][um]', 'KG')), /<select name="righe\[0\]\[um\]"/);
});

test('Guida: "unità di misura" porta ai DDT o alla fattura', () => {
  const ids = cercaGuida('unità di misura').map(r => r.argomento.id);
  assert.ok(ids.includes('nuova-fattura') || ids.includes('ddt-emessi'), ids.join(','));
});
