import { test } from 'node:test';
import assert from 'node:assert/strict';
import { annoValido, anniScelta, fatturatoPerCliente, limiteConfronto } from '../src/engine/anno-riferimento.js';
import { cercaGuida } from '../src/engine/guida.js';

process.env.DATABASE_URL ??= 'postgres://solo-per-i-test@localhost/nessuno';
const { sceltaAnno, tabellaClientiFatturato } = await import('../src/server/views/scelta-anno.js');
const { annoRiferimento } = await import('../src/server/anno-riferimento.js');

test('anno di riferimento (Adriano 10/11/2026): anni dal 2019 a oggi, niente anni futuri o strani', () => {
  assert.equal(annoValido('2025', 2026), 2025);
  assert.equal(annoValido('2027', 2026), null);
  assert.equal(annoValido('2018', 2026), null);
  assert.equal(annoValido('abc', 2026), null);
  assert.deepEqual(anniScelta(2021), [2021, 2020, 2019]);
  assert.equal(limiteConfronto(2026, '2026-11-10'), '2025-11-10');
  assert.equal(limiteConfronto(2025, '2026-11-10'), null);
});

test('l\'anno scelto si ricorda nella sessione e vale per tutti i cruscotti; l\'anno in corso lo toglie', () => {
  const sessione: any = {};
  const req = (anno?: string) => ({ query: anno ? { anno } : {}, session: sessione }) as any;
  assert.equal(annoRiferimento(req(), '2026-11-10'), 2026);
  assert.equal(annoRiferimento(req('2024'), '2026-11-10'), 2024);
  assert.equal(annoRiferimento(req(), '2026-11-10'), 2024);   // un altro cruscotto, senza ?anno=
  assert.equal(annoRiferimento(req('2099'), '2026-11-10'), 2024);   // anno non valido: resta quello scelto
  assert.equal(annoRiferimento(req('2026'), '2026-11-10'), 2026);
  assert.equal(sessione.annoRiferimento, undefined);
});

test('clienti con il fatturato: fatture meno note di credito, confronto con lo stesso periodo, persi in fondo', () => {
  const doc = (chiave: string, tipo: string, data: string, imponibile: number, clienteId: number | null = null) => ({ chiave, cliente: chiave.toUpperCase(), clienteId, tipo, data, imponibile });
  const righe = fatturatoPerCliente([
    doc('selea', 'fattura', '2026-03-01', 10000, 1), doc('selea', 'fattura', '2026-05-01', 5000, 1), doc('selea', 'nota_credito', '2026-05-02', 1000, 1),
    doc('selea', 'fattura', '2025-04-01', 7000, 1), doc('selea', 'fattura', '2025-12-01', 9000, 1),   // dicembre 2025 fuori dallo stesso periodo
    doc('lps', 'fattura', '2026-01-10', 6000),
    doc('jox', 'fattura', '2025-02-01', 3000),   // perso
    doc('vecchio', 'fattura', '2024-02-01', 3000),   // fuori dai due anni
  ], 2026, '2026-11-10');
  assert.deepEqual(righe.map(r => r.chiave), ['selea', 'lps', 'jox']);
  assert.equal(righe[0].fatturato, 14000);
  assert.equal(righe[0].fatture, 2);
  assert.equal(righe[0].prima, 7000);
  assert.equal(righe[0].variazione, 100);
  assert.equal(righe[0].peso, 70);
  assert.equal(righe[1].variazione, null);
  assert.equal(righe[2].fatturato, 0);
  // anno passato: anno prima intero
  const passato = fatturatoPerCliente([doc('selea', 'fattura', '2025-12-01', 9000), doc('selea', 'fattura', '2024-12-20', 3000)], 2025, '2026-11-10');
  assert.equal(passato[0].prima, 3000);
  assert.equal(passato[0].variazione, 200);
});

test('tasti degli anni e tabella dei clienti', () => {
  const tasti = String(sceltaAnno(2025, '/ordini/cruscotto', 2026));
  assert.match(tasti, /href="\/ordini\/cruscotto\?anno=2025" class="attivo">2025</);
  assert.match(tasti, /href="\/ordini\/cruscotto\?anno=2019"/);
  assert.doesNotMatch(tasti, /anno=2027/);
  const t = String(tabellaClientiFatturato([{ chiave: 'c1', cliente: 'SELEA', clienteId: 1, fatturato: 14000, fatture: 2, prima: 7000, variazione: 100, peso: 70 }], 2026, true));
  assert.match(t, /<a href="\/anagrafiche\/clienti\/1">SELEA<\/a>/);
  assert.match(t, /Stesso periodo 2025/);
  assert.match(t, /\+100 %/);
});

test('guida: anno dei cruscotti e fatturato per cliente', () => {
  assert.equal(cercaGuida('cambiare anno cruscotto')[0].argomento.id, 'anno-cruscotti');
  assert.equal(cercaGuida('elenco clienti con fatturato')[0].argomento.id, 'anno-cruscotti');
});
