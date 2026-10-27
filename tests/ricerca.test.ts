import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { corrispondeRicerca } from '../src/engine/ricerca.js';

test('ricerca veloce: maiuscole e accenti non contano', () => {
  assert.ok(corrispondeRicerca('ROSSI ELETTRONICA S.R.L. — CITTÀ DI CASTELLO', 'citta'));
  assert.ok(corrispondeRicerca('rossi elettronica', 'ROSSI'));
  assert.ok(!corrispondeRicerca('ROSSI ELETTRONICA', 'bianchi'));
});

test('ricerca veloce: più parole, tutte presenti in qualsiasi ordine', () => {
  assert.ok(corrispondeRicerca('ROSSI ELETTRONICA S.R.L. 01234567890 MILANO', 'milano rossi'));
  assert.ok(!corrispondeRicerca('ROSSI ELETTRONICA S.R.L. ROMA', 'milano rossi'));
  assert.ok(corrispondeRicerca('qualsiasi', '   '), 'ricerca vuota: si vede tutto');
});

test('ricerca veloce: nei codici trattini, punti e spazi non contano', () => {
  assert.ok(corrispondeRicerca('RS-0603-2K2-1-100MW', 'rs0603'));
  assert.ok(corrispondeRicerca('CT.1234 A', 'ct1234a'));
  assert.ok(corrispondeRicerca('IT 01234567890', '0123 4567'));
  assert.ok(corrispondeRicerca('RS 0603 2K2', 'rs-0603-2k2'));
  assert.ok(!corrispondeRicerca('RS-0603-2K2', 'rs0805'));
});

test('ricerca veloce: public/ricerca.js usa la stessa regola', () => {
  const js = readFileSync(new URL('../public/ricerca.js', import.meta.url), 'utf8');
  for (const pezzo of [".normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase()", ".replace(/[^a-z0-9]/g, '')",
    "split(/\\s+/).filter(Boolean).every(p => riga.includes(p) || (compatto(p) !== '' && rigaCompatta.includes(compatto(p))))"])
    assert.ok(js.includes(pezzo), pezzo);
});
