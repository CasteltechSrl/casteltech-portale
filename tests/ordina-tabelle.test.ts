// Ordinare gli elenchi cliccando l'intestazione della colonna (Adriano 3/11/2026): public/ordina-tabelle.js in ogni pagina.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { paginata } from '../src/server/views/paginazione.js';

type Chiave = { tipo: string; v: number | string };
const finestra: { ordinaTabelle?: { chiave: (t: string) => Chiave; confronta: (a: Chiave, b: Chiave, verso: number) => number; ordina: <T>(r: T[], v: Chiave[], verso: number) => T[] } } = {};
vm.runInNewContext(readFileSync(new URL('../public/ordina-tabelle.js', import.meta.url), 'utf8'), { window: finestra, Intl });
const { chiave, ordina } = finestra.ordinaTabelle!;
const ordinati = (valori: string[], verso = 1) => ordina(valori, valori.map(chiave), verso);

test('date gg/mm/aaaa in ordine di tempo, non di testo', () => {
  assert.deepEqual(ordinati(['15/10/2026', '08/09/2026', '30/11/2025', '3/11/2026']), ['30/11/2025', '08/09/2026', '15/10/2026', '3/11/2026']);
  assert.equal(chiave('15/10/2026 (3 consegne)').tipo, 'data');
  assert.equal(chiave('mail del 08/09/2026').tipo, 'testo');
  assert.deepEqual(ordinati(['15/10/2026', '08/09/2026', '30/11/2025'], -1), ['15/10/2026', '08/09/2026', '30/11/2025']);
});

test('numeri di documento: prima l\'anno, poi il numero', () => {
  assert.deepEqual(ordinati(['61/2026', '9001/2026', '43/2026', '120/2025', '9/2026']), ['120/2025', '9/2026', '43/2026', '61/2026', '9001/2026']);
});

test('numeri all\'italiana: migliaia col punto, decimali con la virgola, euro, giorni, negativi', () => {
  assert.deepEqual(ordinati(['2.456,40 €', '474,00 €', '1.050', '8,00 €', '-31 gg', '12 %']), ['-31 gg', '8,00 €', '12 %', '474,00 €', '1.050', '2.456,40 €']);
  assert.equal(chiave('1.050').v, 1050);
  assert.equal(chiave('3.663,00 €').v, 3663);
});

test('testo: maiuscole e accenti non contano, i numeri nei codici in ordine naturale', () => {
  assert.deepEqual(ordinati(['SELEA S.R.L.', 'botisum s.a.s.', 'ELEXES S.R.L.', 'Àrea']), ['Àrea', 'botisum s.a.s.', 'ELEXES S.R.L.', 'SELEA S.R.L.']);
  assert.deepEqual(ordinati(['C2026-10', 'C2026-9', 'C2026-100']), ['C2026-9', 'C2026-10', 'C2026-100']);
});

test('celle vuote sempre in fondo, in tutti e due i versi; a parità resta l\'ordine di partenza', () => {
  assert.deepEqual(ordinati(['', '20/11/2026', '—', '01/11/2026']), ['01/11/2026', '20/11/2026', '', '—']);
  assert.deepEqual(ordinati(['', '20/11/2026', '—', '01/11/2026'], -1), ['20/11/2026', '01/11/2026', '', '—']);
  const righe = ['a', 'b', 'c'];
  assert.deepEqual(ordina(righe, ['X', 'x', 'X'].map(chiave), 1), ['a', 'b', 'c']);
});

test('colonna mista: numeri prima del testo', () => {
  assert.deepEqual(ordinati(['mail del 12/08', '260', '2601355']), ['260', '2601355', 'mail del 12/08']);
});

test('lo script è in ogni pagina e ha il suo stile', () => {
  assert.match(readFileSync('src/server/views/layout.ts', 'utf8'), /ordina-tabelle\.js/);
  const css = readFileSync('public/stile.css', 'utf8');
  assert.match(css, /th\.ordinabile/);
  assert.match(css, /ordinata-giu/);
  const anagrafiche = readFileSync('src/server/rotte/anagrafiche.ts', 'utf8');
  assert.match(anagrafiche, /id="tab-clienti" data-ordina/);
  assert.match(anagrafiche, /id="tab-prodotti" data-ordina/);
});

test('"Mostra tutte": un\'unica pagina, così si ordina tutto l\'elenco', () => {
  const righe = Array.from({ length: 250 }, (_, i) => i);
  const normale = paginata(righe, { q: 'selea' });
  assert.equal(normale.righe.length, 100);
  assert.match(String(normale.barra), /pagina=tutte/);
  assert.match(String(normale.barra), /Mostra tutte/);
  const tutte = paginata(righe, { q: 'selea', pagina: 'tutte' });
  assert.equal(tutte.righe.length, 250);
  assert.match(String(tutte.barra), /A pagine da 100/);
  assert.match(String(tutte.barra), /q=selea&amp;pagina=1|q=selea&pagina=1/);
  assert.equal(String(paginata(righe.slice(0, 40), { pagina: 'tutte' }).barra), '');
});
