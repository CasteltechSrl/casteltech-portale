import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { layout, gruppoAttivo, MENU_GRUPPI } from '../src/server/views/layout.js';
import { html } from '../src/server/views/html.js';
import { cercaGuida } from '../src/engine/guida.js';

const pagina = (ruolo: 'ufficio' | 'produzione', attiva?: string) => String(layout({ titolo: 'Prova', utente: { id: 1, nome: 'Prova', ruolo }, attiva, contenuto: html`` }));
const link = (pezzo: string) => [...pezzo.matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map(m => [m[2], m[1]]);
const menu = (ruolo: 'ufficio' | 'produzione') => pagina(ruolo).split('<nav class="menu">')[1].split('</nav>')[0];
const destra = (ruolo: 'ufficio' | 'produzione') => link(pagina(ruolo).split('<nav class="menu-destra">')[1].split('</nav>')[0]).map(v => v[0]);
const gruppi = (ruolo: 'ufficio' | 'produzione') => [...menu(ruolo).matchAll(/class="titolo-gruppo[^"]*"[^>]*>([^<]+)</g)].map(m => m[1]);

test('menu in alto a gruppi (Adriano 31/10/2026): Anagrafiche, Commerciale, Acquisti, Produzione, Amministrazione, Qualità; a destra Impostazioni, Suggerimenti, Guida', () => {
  assert.deepEqual(gruppi('ufficio'), ['Anagrafiche', 'Commerciale', 'Acquisti', 'Produzione', 'Amministrazione', 'Qualità', 'Dipendenti']);
  assert.deepEqual(destra('ufficio'), ['Impostazioni', 'Suggerimenti', 'Guida']);
  const voci = link(menu('ufficio'));
  assert.ok(voci.some(v => v[0] === 'Quotazioni' && v[1] === '/quotazioni'));
  assert.ok(voci.some(v => v[0] === 'Ordini a fornitore' && v[1] === '/ordini/fornitori'));
  assert.ok(voci.some(v => v[0] === 'Commesse' && v[1] === '/commesse'));
  // la produzione vede solo la Guida
  assert.deepEqual(gruppi('produzione'), []);
  assert.deepEqual(destra('produzione'), ['Guida']);
});

test('menu a gruppi: la sezione della pagina accende il suo gruppo', () => {
  assert.equal(gruppoAttivo('quotazioni'), 'commerciale');
  assert.equal(gruppoAttivo('ordini'), 'commerciale');
  assert.equal(gruppoAttivo('acquisti'), 'acquisti');
  assert.equal(gruppoAttivo('commesse'), 'produzione');
  assert.match(pagina('ufficio', 'acquisti'), /class="titolo-gruppo attiva"[^>]*>Acquisti</);
  assert.equal(MENU_GRUPPI.every(g => g.voci.length > 0), true);
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

test('guida: dove trovo le voci del menu a gruppi', () => {
  for (const q of ['menu a tendina', 'dove sono finiti gli ordini a fornitore nel menu'])
    assert.ok(cercaGuida(q).slice(0, 2).some(r => r.argomento.id === 'menu-gruppi'), q);
});

test('menu a gruppi: tendine meno sensibili (Adriano 31/10/2026, menu.js con ritardo di chiusura e ponte nel CSS)', () => {
  assert.match(pagina('ufficio'), /<script src="\/static\/menu\.js\?v=[^"]+" defer><\/script>/);
  const js = readFileSync(new URL('../public/menu.js', import.meta.url), 'utf8');
  const chiusura = Number(js.match(/CHIUSURA_MS = (\d+)/)?.[1]);
  assert.ok(chiusura >= 300 && chiusura <= 700, 'ritardo di chiusura tra 0,3 e 0,7 s');
  const css = readFileSync(new URL('../public/stile.css', import.meta.url), 'utf8');
  assert.match(css, /\.gruppo \.tendina::before \{ content: ''/);
  // con lo script attivo la tendina non dipende più da :hover (che la chiudeva subito)
  assert.match(css, /\.testata:not\(\.menu-js\) \.gruppo:hover \.tendina/);
});
