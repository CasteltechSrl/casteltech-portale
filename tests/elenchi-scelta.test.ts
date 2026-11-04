// Caselle con elenco di scelte (Adriano 4/11/2026: causale del trasporto nel DDT): public/elenchi-scelta.js al posto del datalist del browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { CAUSALI_DDT } from '../src/engine/ddt.js';

type Voce = { valore: string; etichetta?: string };
const finestra: { elenchiScelta?: { vociDaMostrare: (v: Voce[], t: string, tutte: boolean) => Voce[] } } = {};
vm.runInNewContext(readFileSync(new URL('../public/elenchi-scelta.js', import.meta.url), 'utf8'), { window: finestra });
const { vociDaMostrare } = finestra.elenchiScelta!;
const causali = CAUSALI_DDT.map(valore => ({ valore }));
const valori = (t: string, tutte = false) => vociDaMostrare(causali, t, tutte).map(v => v.valore);

test('con una causale già scritta la freccia mostra TUTTE le causali (il datalist ne mostrava una sola)', () => {
  assert.equal(valori('RESO LAVORATO').length, CAUSALI_DDT.length);
  assert.equal(valori('reso lavorato').length, CAUSALI_DDT.length);
  assert.equal(valori('', false).length, CAUSALI_DDT.length);
  assert.equal(valori('QUALSIASI', true).length, CAUSALI_DDT.length);
});

test('scrivendo si filtra su tutte le parole, in qualunque punto, senza badare a maiuscole e accenti', () => {
  assert.deepEqual(valori('garanzia'), ['RESO DA RIPARAZIONE IN GARANZIA']);
  assert.deepEqual(valori('reso non'), ['RESO NON LAVORATO']);
  assert.deepEqual(valori('VISIÒNE'), ['CONTO VISIONE']);
  assert.deepEqual(valori('CAUSALE INVENTATA'), []);   // testo libero: nessuna voce, la casella lo tiene
});

test('il datalist si sostituisce in ogni pagina e il DDT lo usa per la causale', () => {
  assert.match(readFileSync(new URL('../src/server/views/layout.ts', import.meta.url), 'utf8'), /elenchi-scelta\.js/);
  assert.match(readFileSync(new URL('../src/server/rotte/amministrazione.ts', import.meta.url), 'utf8'), /name="causale_trasporto"[^>]*list="causali-ddt"/);
});
