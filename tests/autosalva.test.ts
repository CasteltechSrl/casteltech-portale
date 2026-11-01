import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { esitoAutosalvataggio, eAutosalvataggio } from '../src/server/autosalva.js';

test('bozze che si salvano da sole: esito JSON con ora italiana; si riconosce dall\'intestazione X-Autosalva', () => {
  const ok = esitoAutosalvataggio([], new Date('2026-11-02T09:05:00Z'));
  assert.deepEqual(ok, { ok: true, errori: [], ora: '10:05' });   // ora di Roma (UTC+1 a novembre)
  const ko = esitoAutosalvataggio(['Data non valida.']);
  assert.equal(ko.ok, false);
  assert.deepEqual(ko.errori, ['Data non valida.']);
  assert.equal(eAutosalvataggio({ get: (n: string) => (n === 'x-autosalva' ? '1' : undefined) } as any), true);
  assert.equal(eAutosalvataggio({ get: () => undefined } as any), false);
});

test('bozze che si salvano da sole: i moduli di fattura/DDT, conferma e ordine a fornitore portano data-autosalva e lo script', () => {
  for (const f of ['src/server/rotte/amministrazione.ts', 'src/server/rotte/conferme-ordine.ts', 'src/server/rotte/ordini-fornitore.ts']) {
    const t = readFileSync(f, 'utf8');
    assert.ok(t.includes('id="modulo-documento" data-autosalva='), `${f}: manca data-autosalva sul modulo`);
    assert.ok(t.includes("'autosalva.js'"), `${f}: manca lo script`);
  }
  const js = readFileSync('public/autosalva.js', 'utf8');
  assert.ok(js.includes("'X-Autosalva': '1'") && js.includes('ATTESA_MS = 2000') && js.includes('beforeunload'));
});
