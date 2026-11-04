import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testoCella } from '../src/engine/excel-celle.js';

test('BOM da Excel: formule senza risultato e celle in errore non diventano "[object Object]"', () => {
  assert.equal(testoCella({ formula: 'B2*C2' }), '');
  assert.equal(testoCella({ sharedFormula: 'D5' }), '');
  assert.equal(testoCella({ error: '#REF!' }), '#REF!');
  assert.equal(testoCella({ formula: 'A1', result: { error: '#N/A' } }), '#N/A');
  assert.equal(testoCella({ formula: 'A1', result: 0.15 }), '0.15');
  assert.equal(testoCella({ richText: [{ text: 'GRM' }, { text: '155' }] }), 'GRM155');
});
