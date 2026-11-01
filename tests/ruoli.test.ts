import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contabilitaPuo, paginaDopoAccesso, paginaIniziale, ruoloDaModulo } from '../src/engine/ruoli.js';
import { acquistiPerFornitore } from '../src/engine/cruscotto-amministrazione.js';
import { layout } from '../src/server/views/layout.js';
import { html } from '../src/server/views/html.js';
import { cercaGuida } from '../src/engine/guida.js';

test('profilo Contabilità (commercialista, Sonia di HTS): solo lettura dell\'Amministrazione', () => {
  assert.equal(contabilitaPuo('GET', '/amministrazione'), true);
  assert.equal(contabilitaPuo('GET', '/amministrazione/registri/pacchetto'), true);
  assert.equal(contabilitaPuo('GET', '/amministrazione/documenti/12/xml'), true);
  assert.equal(contabilitaPuo('POST', '/amministrazione/documenti/12/emetti'), false);
  assert.equal(contabilitaPuo('POST', '/amministrazione/ricevuti/scadenze/3'), false);
  assert.equal(contabilitaPuo('GET', '/amministrazione/documenti/nuovo'), false);
  assert.equal(contabilitaPuo('GET', '/preventivi'), false);
  assert.equal(contabilitaPuo('GET', '/amministrazionefalsa'), false);
  assert.equal(paginaIniziale('contabilita'), '/amministrazione');
  assert.equal(ruoloDaModulo('contabilita'), 'contabilita');
  assert.equal(ruoloDaModulo('amministratore'), 'produzione');
});

test('profilo Contabilità: nel menu solo pagine dell\'Amministrazione e Guida, con la scritta "sola lettura"', () => {
  const p = String(layout({ titolo: 'Prova', utente: { id: 1, nome: 'Commercialista', ruolo: 'contabilita' }, contenuto: html`` }));
  const gruppi = [...p.matchAll(/class="titolo-gruppo[^"]*"[^>]*>([^<]+)</g)].map(m => m[1]);
  assert.deepEqual(gruppi, []); // dal 1/11/2026 niente tendine: le pagine dell'Amministrazione in fila (tests/menu.test.ts)
  assert.match(p, /<nav class="menu menu-piatto">/);
  assert.match(p, /sola lettura/);
  assert.match(p, /<body class="sola-lettura">/);
  assert.doesNotMatch(p, /Impostazioni/);
});

test('acquisti per fornitore e mese: imponibile per mese, note di credito in negativo, fornitori dal più grande', () => {
  const r = acquistiPerFornitore([
    { fornitore_id: 2, nome: 'MOUSER', tipo: 'fattura', data: '2026-03-04', imponibile: 100 },
    { fornitore_id: 2, nome: 'MOUSER', tipo: 'fattura', data: '2026-03-20', imponibile: 50.5 },
    { fornitore_id: 2, nome: 'MOUSER', tipo: 'nota_credito', data: '2026-04-01', imponibile: 10 },
    { fornitore_id: null, nome: 'Affitto', tipo: 'fattura', data: '2026-03-01', imponibile: 1000 },
  ]);
  assert.deepEqual(r.righe.map(x => [x.nome, x.mesi[2], x.mesi[3], x.totale, x.documenti]), [['Affitto', 1000, 0, 1000, 1], ['MOUSER', 150.5, -10, 140.5, 3]]);
  assert.equal(r.mesi[2], 1150.5);
  assert.equal(r.totale, 1140.5);
});

test('guida: accesso del commercialista e acquisti del mese', () => {
  for (const [q, id] of [['accesso commercialista', 'accesso-contabilita'], ['utente sola lettura', 'accesso-contabilita'],
    ['cosa ho comprato a marzo', 'acquisti-mese'], ['acquisti per fornitore', 'acquisti-mese']])
    assert.ok(cercaGuida(q).slice(0, 2).some(r => r.argomento.id === id), q);
});

test('dopo l\'accesso il commercialista va al cruscotto dell\'Amministrazione (Adriano 1/11/2026)', () => {
  assert.equal(paginaDopoAccesso('contabilita', '/'), '/amministrazione');
  assert.equal(paginaDopoAccesso('contabilita', undefined), '/amministrazione');
  assert.equal(paginaDopoAccesso('contabilita', '/cruscotto'), '/amministrazione');
  assert.equal(paginaDopoAccesso('contabilita', '/preventivi?x=1'), '/amministrazione');
  assert.equal(paginaDopoAccesso('contabilita', '/amministrazione/registri?anno=2026'), '/amministrazione/registri?anno=2026');
  assert.equal(paginaDopoAccesso('contabilita', '//sito-esterno.it'), '/amministrazione');
  assert.equal(paginaDopoAccesso('ufficio', '/'), '/cruscotto');
  assert.equal(paginaDopoAccesso('ufficio', '/preventivi/3'), '/preventivi/3');
  assert.equal(paginaDopoAccesso('produzione', '/'), '/r');
});
