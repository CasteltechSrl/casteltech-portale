import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// Adriano 14/11/2026: in ogni pagina una freccia in alto a sinistra per tornare alla pagina d'origine
// (es. Banca e carte → Previsione di cassa: la freccia riporta a Banca e carte). Vale per tutte le pagine, anche quelle nuove.
const { chiavePagina, aggiornaPila, destinazione } = createRequire(import.meta.url)('../public/indietro.js');
const visita = (pila: { u: string; t: string }[], u: string, t = u) => aggiornaPila(pila, { u, t });

test('indietro: la freccia è nel layout comune di tutte le pagine, con lo script e lo stile', () => {
  const layout = readFileSync('src/server/views/layout.ts', 'utf8');
  assert.match(layout, /class="freccia-indietro"/);
  assert.match(layout, /indietro\.js/);
  assert.match(readFileSync('public/stile.css', 'utf8'), /\.freccia-indietro/);
});

test('indietro: Banca e carte → Previsione di cassa, la freccia torna a Banca e carte', () => {
  let p = visita([], '/amministrazione/banca', 'Banca e carte');
  p = visita(p, '/amministrazione/analisi/cassa', 'Previsione di cassa');
  assert.equal(destinazione(p, '/amministrazione').u, '/amministrazione/banca');
  assert.equal(destinazione(p, '/amministrazione').t, 'Banca e carte');
  // premuta la freccia: si torna a Banca e la pagina prima di Banca resta la destinazione
  p = visita(p, '/amministrazione/banca', 'Banca e carte');
  assert.equal(p.length, 1);
});

test('indietro: filtri, salvataggi e messaggi sulla stessa pagina non contano come pagina nuova', () => {
  let p = visita([], '/amministrazione/banca');
  p = visita(p, '/amministrazione/documenti?tipo=fattura&anticipo=tutte');
  p = visita(p, '/amministrazione/documenti?tipo=fattura&anticipo=riba&anno=2026');
  p = visita(p, '/amministrazione/documenti?anno=2025&tipo=fattura&msg=Salvato');
  assert.equal(destinazione(p, '').u, '/amministrazione/banca');
  // ?tipo= diverso = un'altra pagina del menu (DDT e Fatture)
  assert.notEqual(chiavePagina('/amministrazione/documenti?tipo=ddt'), chiavePagina('/amministrazione/documenti?tipo=fattura'));
  assert.equal(chiavePagina('/ordini?anno=2026&pagina=2'), '/ordini');
});

test('indietro: senza pagina prima porta alla pagina principale della sezione, mai alla pagina stessa', () => {
  const p = visita([], '/amministrazione/analisi/cassa');
  assert.equal(destinazione(p, '/amministrazione').u, '/amministrazione');
  assert.equal(destinazione(visita([], '/cruscotto'), '/cruscotto'), null);
});
