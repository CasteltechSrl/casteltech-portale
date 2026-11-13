import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MENU_GRUPPI } from '../src/server/views/layout.js';
import { PAGINE_MACCHINE, paginaMacchina } from '../src/engine/macchine.js';
import { cercaGuida } from '../src/engine/guida.js';

test('Produzione: Stoccaggio componenti, Pick & Place, AOI nel menu (Adriano 12/11/2026)', () => {
  const voci = MENU_GRUPPI.find(g => g.chiave === 'produzione')!.voci;
  assert.deepEqual(voci.slice(-3), [['Stoccaggio componenti', '/produzione/stoccaggio'], ['Pick & Place', '/produzione/pick-place'], ['AOI', '/produzione/aoi']]);
  for (const p of PAGINE_MACCHINE) assert.ok(voci.some(v => v[1] === `/produzione/${p.chiave}`), p.chiave);
  assert.equal(paginaMacchina('aoi')?.titolo, 'AOI');
  assert.equal(paginaMacchina('niente'), undefined);
  const index = readFileSync(new URL('../src/server/index.ts', import.meta.url), 'utf8');
  assert.match(index, /app\.use\('\/produzione', soloUfficio, rotteMacchine\(\)\)/);
});

test('guida: armadi e AOI portano alle pagine delle macchine', () => {
  assert.equal(cercaGuida('armadi stoccaggio')[0]?.argomento.id, 'stoccaggio-componenti'); // dal 13/11/2026 la pagina ha i dati degli armadi
  assert.equal(cercaGuida('pick and place macchine')[0]?.argomento.id, 'macchine-produzione');
  assert.equal(cercaGuida('aoi difetti')[0]?.argomento.id, 'macchine-produzione');
});
