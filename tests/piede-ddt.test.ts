// Stampa del DDT (Adriano 4/11/2026): il riquadro sotto le righe sta sempre in fondo alla pagina (in fondo all'ultima se le pagine sono più d'una).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

type Misure = { pagina: number; inizioRighe: number; testata: number; righe: number[]; piede: number; stacco: number };
const finestra: { piedeDdt?: { spazioSopraPiede: (m: Misure) => { margine: number; nuovaPagina: boolean } } } = {};
vm.runInNewContext(readFileSync(new URL('../public/piede-ddt.js', import.meta.url), 'utf8'), { window: finestra });
const spazioSopraPiede = (m: Misure) => ({ ...finestra.piedeDdt!.spazioSopraPiede(m) });
const base = { pagina: 1000, inizioRighe: 300, testata: 20, piede: 120, stacco: 8 };

test('poche righe: il piede scende fino al fondo della pagina', () => {
  const r = spazioSopraPiede({ ...base, righe: [20, 20] });
  assert.deepEqual(r, { margine: 1000 - 360 - 120, nuovaPagina: false });
});

test('righe su più pagine: il piede va in fondo all\'ultima (la testata si ripete)', () => {
  const righe = Array(40).fill(20);   // pagina 1: 300+20+34×20 = 1000; pagina 2: 20 + 6×20 = 140
  assert.deepEqual(spazioSopraPiede({ ...base, righe }), { margine: 1000 - 140 - 120, nuovaPagina: false });
});

test('il piede non ci sta sotto l\'ultima riga: va in fondo al foglio dopo', () => {
  const righe = Array(30).fill(20);   // fine righe a 920: 920 + 8 + 120 > 1000
  assert.deepEqual(spazioSopraPiede({ ...base, righe }), { margine: 880, nuovaPagina: true });
});

test('la stampa del DDT carica lo script del piede', () => {
  assert.match(readFileSync(new URL('../src/server/views/stampa-documento.ts', import.meta.url), 'utf8'), /piede-ddt\.js/);
});
