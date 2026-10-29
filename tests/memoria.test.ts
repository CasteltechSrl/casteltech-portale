// Lavori pesanti in fila (memoria del server, Render 512 MB): src/server/memoria.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUDGET, conMemoria, memoriaInUso, prenota } from '../src/server/memoria.js';

test('memoria: oltre il budget si aspetta, un lavoro da solo passa sempre', async () => {
  const libera1 = await prenota(BUDGET * 0.7);
  let secondo = false;
  const attesa = prenota(BUDGET * 0.7).then(l => { secondo = true; return l; });
  await new Promise(r => setTimeout(r, 10));
  assert.equal(secondo, false, 'il secondo aspetta');
  const piccolo = await prenota(BUDGET * 0.2);
  piccolo();
  libera1(); libera1();
  const libera2 = await attesa;
  assert.equal(secondo, true);
  libera2();
  assert.equal(memoriaInUso(), 0);
  // più grande del budget: passa da solo, e libera anche in caso di errore
  await assert.rejects(conMemoria(BUDGET * 5, async () => { assert.equal(memoriaInUso(), BUDGET); throw new Error('rotto'); }));
  assert.equal(memoriaInUso(), 0);
});

test('memoria: due analisi non vanno mai insieme', async () => {
  let insieme = 0, massimo = 0;
  const lavoro = () => conMemoria(BUDGET, async () => { insieme++; massimo = Math.max(massimo, insieme); await new Promise(r => setTimeout(r, 5)); insieme--; });
  await Promise.all([lavoro(), lavoro(), lavoro()]);
  assert.equal(massimo, 1);
});
