// Larghezza di codice e descrizione in Anagrafiche → Prodotti (Adriano 9/11/2026). Esempi inventati.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { caratteriCasella, MINIMO_CODICE, MASSIMO_CODICE, MINIMO_DESCRIZIONE, MASSIMO_DESCRIZIONE } from '../src/engine/larghezze-colonne.js';

test('il codice più lungo si vede sempre tutto', () => {
  const n = caratteriCasella(['M0929-C', 'M0929-C_C_SMD', 'M0929-C_H_SMD-TOP'], MINIMO_CODICE, MASSIMO_CODICE);
  assert.ok(n > 'M0929-C_H_SMD-TOP'.length);
});

test('codici corti o elenco vuoto: almeno il minimo', () => {
  assert.equal(caratteriCasella(['A1'], MINIMO_CODICE, MASSIMO_CODICE), MINIMO_CODICE);
  assert.equal(caratteriCasella([], MINIMO_CODICE, MASSIMO_CODICE), MINIMO_CODICE);
});

test('descrizione lunghissima: si ferma al massimo', () => {
  assert.equal(caratteriCasella(['X'.repeat(200), null], MINIMO_DESCRIZIONE, MASSIMO_DESCRIZIONE), MASSIMO_DESCRIZIONE);
});

test('la pagina Prodotti usa le caselle su misura', () => {
  const s = readFileSync('src/server/rotte/anagrafiche.ts', 'utf8');
  assert.match(s, /size="\$\{misuraCodice\}"/);
  assert.match(s, /size="\$\{misuraDescrizione\}"/);
  assert.match(readFileSync('public/stile.css', 'utf8'), /table\.editor input\.su-misura \{ width: auto/);
});
