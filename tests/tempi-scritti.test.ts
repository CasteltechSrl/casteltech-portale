import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { scriviTempo, secondiDaTempo } from '../src/engine/tempi-scritti.js';

const min = (x: string) => { const s = secondiDaTempo(x); return s == null ? null : s / 60; };

test('tempi scritti: 1.30, 1,30 e 1:30 valgono tutti 1h 30\' (base 60, non decimale)', () => {
  for (const x of ['1.30', '1,30', '1:30', ' 1.30 ', '1h30', '1h 30\'', '1 h 30 min', '90']) assert.equal(min(x), 90, x);
  assert.equal(min('0.45'), 45);
  assert.equal(min('.45'), 45);
  assert.equal(min('2.05'), 125);
  assert.equal(min('2'), 2);           // numero da solo = minuti
  assert.equal(min("45'"), 45);
  assert.equal(min('2h'), 120);
  assert.equal(min('1.02.30'), 62.5);  // ore.minuti.secondi
});

test('tempi scritti: si rifiuta ciò che è ambiguo o sbagliato', () => {
  for (const x of ['1.5', '1,75', '1.60', '1:7', 'abc', '1.30.5', '1h75', '']) assert.equal(secondiDaTempo(x), null, x);
});

test('tempi scritti: base in secondi', () => {
  assert.equal(secondiDaTempo('90', 'secondi'), 90);
  assert.equal(secondiDaTempo('1.30', 'secondi'), 90);
  assert.equal(secondiDaTempo("1' 30''", 'secondi'), 90);
  assert.equal(secondiDaTempo("30''", 'secondi'), 30);
  assert.equal(scriviTempo(90, 'secondi'), "1' 30''");
  assert.equal(scriviTempo(45, 'secondi'), "45''");
  assert.equal(scriviTempo(3750, 'secondi'), "1h 02' 30''");
});

test('tempi scritti: riscrittura leggibile, che si rilegge uguale', () => {
  assert.equal(scriviTempo(5400), "1h 30'");
  assert.equal(scriviTempo(3900), "1h 05'");
  assert.equal(scriviTempo(7200), "2h 00'");
  assert.equal(scriviTempo(45 * 60), "45'");
  for (const s of [0, 60, 3900, 5400, 7200, 16 * 3600]) assert.equal(secondiDaTempo(scriviTempo(s)), s);
  for (const s of [5, 90, 3750]) assert.equal(secondiDaTempo(scriviTempo(s, 'secondi'), 'secondi'), s);
});

test('tempi scritti: public/tempi.js (telefono) dà gli stessi risultati del server', () => {
  const finestra: any = {};
  vm.runInNewContext(readFileSync(new URL('../public/tempi.js', import.meta.url), 'utf8'), { window: finestra });
  const js = finestra.CasteltechTempi;
  const casi = ['1.30', '1,30', '1:30', '90', '2', '.45', '1.5', '1.60', '1h30', "1h 30'", "45'", '45 min', "1' 30''", "30''", '1.02.30', 'abc', '', '2h'];
  for (const base of ['minuti', 'secondi'] as const) for (const x of casi) {
    assert.equal(js.secondiDaTempo(x, base), secondiDaTempo(x, base), `${x} (${base})`);
    const s = secondiDaTempo(x, base);
    if (s != null) assert.equal(js.scriviTempo(s, base), scriviTempo(s, base));
  }
});
