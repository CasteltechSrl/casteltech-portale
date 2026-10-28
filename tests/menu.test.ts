import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { layout } from '../src/server/views/layout.js';
import { html } from '../src/server/views/html.js';
import { cercaGuida } from '../src/engine/guida.js';

const voci = (ruolo: 'ufficio' | 'produzione') => [...String(layout({ titolo: 'Prova', utente: { id: 1, nome: 'Prova', ruolo }, contenuto: html`` }))
  .split('<nav>')[1].split('</nav>')[0].matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map(m => [m[2], m[1]]);

test('menu in alto: ordine deciso da Adriano (28/10/2026), Componenti diventa Quotazioni', () => {
  assert.deepEqual(voci('ufficio').map(v => v[0]),
    ['CRM', 'Anagrafiche', 'Quotazioni', 'Preventivi', 'Ordini', 'Commesse', 'Amministrazione', 'Impostazioni', 'Suggerimenti', 'Guida']);
  assert.deepEqual(voci('ufficio').find(v => v[0] === 'Quotazioni'), ['Quotazioni', '/quotazioni']);
  assert.deepEqual(voci('produzione').map(v => v[0]), ['Guida']);
});

test('Quotazioni: i vecchi indirizzi /componenti restano validi', () => {
  const index = readFileSync(new URL('../src/server/index.ts', import.meta.url), 'utf8');
  assert.match(index, /app\.use\('\/quotazioni', soloUfficio, rotteComponenti\(\)\)/);
  assert.match(index, /app\.use\('\/componenti', \(req, res\) => res\.redirect\(307, '\/quotazioni' \+ req\.url\)\)/);
});

test('guida: "quotazioni" porta alla quotazione delle BOM', () => {
  for (const q of ['quotazioni', 'quotare una BOM'])
    assert.ok(cercaGuida(q).slice(0, 2).some(r => r.argomento.id === 'codifica-bom'), q);
});

test('guida: miglior prezzo di un P/N tra gli shop', () => {
  for (const q of ['miglior prezzo di un componente', 'confrontare i prezzi degli shop'])
    assert.ok(cercaGuida(q).slice(0, 2).some(r => r.argomento.id === 'miglior-prezzo'), q);
});
