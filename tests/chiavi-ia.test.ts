import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chiaviDaProvare, passaAllaRiserva } from '../src/engine/chiavi-ia.js';
import { notaChiaviIa } from '../src/engine/servizi.js';

test('chiavi IA: senza primaria si usa solo ANTHROPIC_API_KEY (come prima)', () => {
  assert.deepEqual(chiaviDaProvare({ ANTHROPIC_API_KEY: 'info' }, false), [{ nome: 'riserva', chiave: 'info' }]);
  assert.deepEqual(chiaviDaProvare({}, false), []);
  assert.equal(notaChiaviIa({ primaria: false, riserva: true, primariaEsaurita: null }), '');
});

test('chiavi IA: prima la gratuita, poi info@; finita la gratuita si salta', () => {
  const env = { ANTHROPIC_API_KEY_PRIMARIA: 'gratis', ANTHROPIC_API_KEY: 'info' };
  assert.deepEqual(chiaviDaProvare(env, false).map(c => c.nome), ['primaria', 'riserva']);
  assert.deepEqual(chiaviDaProvare(env, true).map(c => c.chiave), ['info']);
  // solo la primaria: si usa anche se segnata finita (non c'è altro)
  assert.deepEqual(chiaviDaProvare({ ANTHROPIC_API_KEY_PRIMARIA: 'gratis' }, true).map(c => c.chiave), ['gratis']);
  // stessa chiave scritta due volte: una sola prova
  assert.equal(chiaviDaProvare({ ANTHROPIC_API_KEY_PRIMARIA: 'x', ANTHROPIC_API_KEY: 'x' }, false).length, 1);
});

test('chiavi IA: si passa alla riserva solo per credito, tetto, chiave', () => {
  assert.ok(passaAllaRiserva('credito') && passaAllaRiserva('tetto') && passaAllaRiserva('chiave'));
  assert.ok(!passaAllaRiserva('limite') && !passaAllaRiserva('sovraccarico') && !passaAllaRiserva('troppo_grande'));
  assert.match(notaChiaviIa({ primaria: true, riserva: true, primariaEsaurita: null }), /credito gratuito.*da sola/);
  assert.match(notaChiaviIa({ primaria: true, riserva: true, primariaEsaurita: { il: '2026-11-20T10:00:00Z', messaggio: '' } }), /finita.*ora si usa ANTHROPIC_API_KEY/);
});
