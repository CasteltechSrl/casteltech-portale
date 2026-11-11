import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Adriano 11/11/2026: le spunte SMD/THT del flusso ricaricavano la pagina e la facevano saltare altrove.
test('resta-qui: lo script è in ogni pagina e la barra "Aggiorna la pagina" ha il suo stile', () => {
  assert.match(readFileSync('src/server/views/layout.ts', 'utf8'), /resta-qui\.js/);
  const js = readFileSync('public/resta-qui.js', 'utf8');
  assert.match(js, /data-senza-ricarica/);
  assert.match(js, /X-Senza-Ricarica/);
  assert.match(js, /Aggiorna la pagina/);
  assert.match(js, /sessionStorage/);
  assert.match(readFileSync('public/stile.css', 'utf8'), /\.barra-aggiorna/);
});

test('resta-qui: le spunte del flusso si salvano senza ricaricare (JSON), senza script il vecchio invio resta', () => {
  const rotte = readFileSync('src/server/rotte/flusso.ts', 'utf8');
  assert.match(rotte, /class="spunta-form" data-senza-ricarica/);
  assert.match(rotte, /X-Senza-Ricarica'\)\) return res\.json\(\{ ok: true, fatta: valore \}\)/);
  assert.match(rotte, /res\.redirect\(torna\(req, id\)\)/);
});
