import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esternoPuo, paginaDopoAccesso, paginaIniziale, ruoloDaModulo, solaLettura, NOMI_RUOLI } from '../src/engine/ruoli.js';
import { layout } from '../src/server/views/layout.js';
import { html } from '../src/server/views/html.js';
import { cercaGuida } from '../src/engine/guida.js';
import { readFileSync } from 'node:fs';

test('profilo Esterno (Adriano 2/11/2026): legge tutto, non modifica nulla', () => {
  for (const p of ['/cruscotto', '/preventivi', '/preventivi/12', '/preventivi/12/stampa', '/commesse/3', '/ordini', '/ordini/fornitori',
    '/anagrafiche/clienti', '/anagrafiche/clienti/5', '/quotazioni', '/crm', '/qualita', '/dipendenti', '/suggerimenti', '/amministrazione',
    '/amministrazione/registri', '/preventivi/elenco.xlsx', '/cerca'])
    assert.equal(esternoPuo('GET', p), true, p);
  for (const p of ['/preventivi/salva', '/preventivi/calcola', '/commesse/3/rientro', '/amministrazione/documenti/12/emetti', '/cerca'])
    assert.equal(esternoPuo('POST', p), false, p);
  // fuori: Impostazioni (chiavi, utenti, backup), buste paga, moduli "nuovo…"
  for (const p of ['/impostazioni', '/impostazioni/utenti', '/impostazioni/backup/file/x.gz', '/dipendenti/riservata', '/dipendenti/riservata/persona',
    '/preventivi/nuovo', '/amministrazione/documenti/nuovo', '/qualita/nc/nuovo'])
    assert.equal(esternoPuo('GET', p), false, p);
  assert.equal(esternoPuo('GET', '/impostazionifalse'), true); // non è Impostazioni (pagina che non esiste)
  assert.equal(esternoPuo('HEAD', '/preventivi'), true);
  assert.equal(ruoloDaModulo('esterno'), 'esterno');
  assert.match(NOMI_RUOLI.esterno, /sola lettura/);
  assert.equal(solaLettura('esterno'), true);
  assert.equal(solaLettura('contabilita'), true);
  assert.equal(solaLettura('ufficio'), false);
});

test('profilo Esterno: entra nel cruscotto generale e non va in Impostazioni né nel reparto', () => {
  assert.equal(paginaIniziale('esterno'), '/cruscotto');
  assert.equal(paginaDopoAccesso('esterno', '/'), '/cruscotto');
  assert.equal(paginaDopoAccesso('esterno', '/preventivi/3'), '/cruscotto'); // Adriano 9/11/2026: sempre il cruscotto
  assert.equal(paginaDopoAccesso('esterno', '/impostazioni/utenti'), '/cruscotto');
  assert.equal(paginaDopoAccesso('esterno', '/r/c/ABC'), '/cruscotto');
  assert.equal(paginaDopoAccesso('esterno', '/ricevuti'), '/cruscotto');
});

test('profilo Esterno: stesso menu dell\'ufficio, senza Impostazioni, con "sola lettura" e caselle spente', () => {
  const p = String(layout({ titolo: 'Prova', utente: { id: 1, nome: 'Revisore', ruolo: 'esterno' }, contenuto: html`` }));
  const u = String(layout({ titolo: 'Prova', utente: { id: 2, nome: 'Ufficio', ruolo: 'ufficio' }, contenuto: html`` }));
  const gruppi = (s: string) => [...s.matchAll(/class="titolo-gruppo[^"]*"[^>]*>([^<]+)</g)].map(m => m[1]);
  assert.deepEqual(gruppi(p), gruppi(u));
  assert.ok(gruppi(p).length > 3);
  assert.match(p, /<body class="sola-lettura-tutto">/);
  assert.match(p, /sola lettura/);
  assert.match(p, /\/static\/sola-lettura\.js/);
  assert.doesNotMatch(p, /href="\/impostazioni"/);
  assert.match(p, /href="\/suggerimenti"/);
  // Analisi nel menu solo per amministratore ed esterno (Adriano 6/11/2026): l'ufficio non la vede
  assert.match(p, /href="\/amministrazione\/analisi"/);
  assert.doesNotMatch(u, /href="\/amministrazione\/analisi"/);
  const a = String(layout({ titolo: 'Prova', utente: { id: 3, nome: 'Adriano', ruolo: 'amministratore' }, contenuto: html`` }));
  assert.match(a, /href="\/amministrazione\/analisi"/);
  const c = String(layout({ titolo: 'Prova', utente: { id: 4, nome: 'Commercialista', ruolo: 'contabilita' }, contenuto: html`` }));
  assert.doesNotMatch(c, /href="\/amministrazione\/analisi"/);
  assert.match(c, /href="\/amministrazione\/analisi\/cassa"/);
  assert.match(p, /class="cerca-globale"/);
  // i moduli restano visibili (il preventivo è un modulo), si nascondono pulsanti che salvano e spunte
  const css = readFileSync('public/stile.css', 'utf8');
  assert.match(css, /body\.sola-lettura-tutto main form\[method="post"\] button:not\(\[type="button"\]\)/);
  assert.match(css, /body\.sola-lettura-tutto main \.barra-azioni/);
});

test('guida: accesso per esterni', () => {
  for (const q of ['accesso esterni', 'utente vede tutto sola lettura', 'accesso consulente esterno'])
    assert.ok(cercaGuida(q).slice(0, 3).some(r => r.argomento.id === 'accesso-esterni'), q);
});
