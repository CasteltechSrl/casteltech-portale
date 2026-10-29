// Regola codice-cliente (Adriano 29/10/2026): ogni codice prodotto ha il suo cliente (esempi inventati).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { avvisoSenzaCliente, codiciDelCliente, erroreClienteProdotto } from '../src/engine/anagrafiche.js';

test('regola codice-cliente: un prodotto senza cliente non si salva', () => {
  for (const x of [null, undefined, '', 0, '0', -1]) assert.match(erroreClienteProdotto(x)!, /cliente/, String(x));
  assert.equal(erroreClienteProdotto(7), undefined);
  assert.equal(erroreClienteProdotto('7'), undefined);
});

test('preventivo: nel menu Codice solo i codici del cliente scelto', () => {
  const prodotti = [
    { id: 1, codice: 'AB12', cliente_id: 7 }, { id: 2, codice: 'SENZA', cliente_id: null }, { id: 3, codice: 'ALTRO', cliente_id: 9 },
  ];
  assert.deepEqual(codiciDelCliente(prodotti, 7).map(p => p.codice), ['AB12']);
  assert.deepEqual(codiciDelCliente(prodotti, 0), []);
  // la query del portale fa la stessa cosa: niente codici senza cliente
  const sorgente = readFileSync(new URL('../src/server/anagrafiche-servizio.ts', import.meta.url), 'utf8');
  const query = sorgente.slice(sorgente.indexOf('export const prodottiPerCliente'));
  assert.match(query, /WHERE cliente_id = \$1 ORDER BY/);
  assert.doesNotMatch(query.slice(0, 300), /IS NULL/);
});

test('anagrafica: avviso dei codici senza cliente', () => {
  assert.equal(avvisoSenzaCliente(0), undefined);
  assert.match(avvisoSenzaCliente(1)!, /1 codice senza cliente.*va assegnato.*eliminat/);
  assert.match(avvisoSenzaCliente(5)!, /5 codici senza cliente.*vanno assegnati/);
});
