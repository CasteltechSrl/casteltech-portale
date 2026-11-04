/**
 * Pagina della riga BOM (Adriano 4/11/2026): elenchi dei valori delle tabelle nelle caselle e suggerimenti quando c'è un problema.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caseInTabella, simili, suggerimentiRiga, valoriTabella } from '../src/engine/codifica/valori-tabella.js';
import { caseLookup } from '../src/engine/codifica/regole.js';

test('valori delle tabelle per campo e famiglia', () => {
  const c = caseInTabella();
  assert.ok(c.includes('0603') && c.includes('SOT23') && c.includes('TO92'));
  // ogni case dell'elenco è davvero accettato dalla tabella
  for (const x of c) assert.notEqual(caseLookup(x)[0], null, x);
  assert.deepEqual(valoriTabella('case', 'CN'), [], 'i connettori usano il tipo, non il case');
  assert.ok(valoriTabella('tipo', 'CN').includes('RJ45'));
  assert.ok(valoriTabella('tipo', 'BT').includes('PORTABATTERIA'));
  assert.ok(valoriTabella('colore', 'DL').includes('GIALLO'));
  assert.deepEqual(valoriTabella('tensione', 'IT'), []);
});

test('valori simili a quello scritto', () => {
  assert.ok(simili('SOT-23', caseInTabella()).includes('SOT23'));
  assert.ok(simili('2SMD', ['4SMD', '0603', 'SMD2', '6035']).includes('SMD2'));
  assert.deepEqual(simili('', ['A']), []);
});

test('suggerimenti per case non in tabella, campi mancanti e tipo connettore', () => {
  const s = suggerimentiRiga({ famiglia: 'IT', attributi: { case: '2SMD' }, note: ['case "2SMD" non in tabella: da definire', 'produzione: manca Tensione'] },
    { case: [{ valore: '6035', volte: 4 }], tensione: [{ valore: '12V', volte: 7 }] });
  assert.match(s[0], /"2SMD" non è in tabella/);
  assert.match(s[0], /Già usati in archivio per IT: 6035 \(4\)/);
  assert.match(s[0], /LLWW/);
  assert.match(s[1], /manca Tensione.*12V \(7\)/);
  const t = suggerimentiRiga({ famiglia: 'CN', attributi: { tipo: 'RJ-45' }, note: ['tipo connettore "RJ-45" non in tabella'] });
  assert.match(t[0], /Simili: RJ45/);
  assert.deepEqual(suggerimentiRiga({ famiglia: 'RS', attributi: {}, note: ['VERIFICA: qualcosa'] }), []);
});
