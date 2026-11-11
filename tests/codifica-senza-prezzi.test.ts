/**
 * Codifica di una BOM senza prezzi (Adriano 4/11/2026, Produzione → Codifica componenti):
 * nessuna quantità di schede = niente acquisti né giudizio di reperibilità, anche con i distributori collegati.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cercaGuida } from '../src/engine/guida.js';
import { foglioBom } from '../src/engine/codifica/bom.js';
import { MENU_GRUPPI } from '../src/server/views/layout.js';

test('BOM solo codifica: niente acquisti né reperibilità, i codici restano', async () => {
  process.env.DATABASE_URL ??= 'postgres://solo-per-i-test@localhost/nessuno';
  const { calcolaAcquistiCon, riepilogo, ESITI } = await import('../src/server/codifica-servizio.js');
  const { REGOLE_SCARTO_DEFAULT } = await import('../src/engine/acquisti.js');
  const prima = process.env.MOUSER_API_KEY;
  process.env.MOUSER_API_KEY = 'x'; // un distributore collegato: con le quantità darebbe "critico"
  try {
    const r: any = { n: 2, pn: 'RC0603FR-0710KL', esito: ESITI.NUOVO, famiglia: 'RS', attributi: {}, qtaScheda: 4, note: [], fonti: [], offerte: [], acquisti: [],
      codiceProduzione: 'RS-0603-10K-1-100MW', codiceGestionale: 'SRS-0603-10K0F-001' };
    calcolaAcquistiCon([r], [], REGOLE_SCARTO_DEFAULT);
    assert.deepEqual(r.acquisti, []);
    assert.equal(r.reperibilita, undefined);
    assert.equal(r.codiceGestionale, 'SRS-0603-10K0F-001');
    const rp = riepilogo([r], []);
    assert.deepEqual(rp.perQuantita, []);
    assert.equal(rp.nuovi, 1);
    assert.equal(rp.critici, 0);
    // con le quantità (BOM di Quotazioni) il giudizio c'è
    calcolaAcquistiCon([r], [100], REGOLE_SCARTO_DEFAULT, new Map());
    assert.equal(r.acquisti.length, 1);
    assert.ok(r.reperibilita);
  } finally { if (prima === undefined) delete process.env.MOUSER_API_KEY; else process.env.MOUSER_API_KEY = prima; }
});

test('BOM solo codifica: non si chiama nessun distributore e non entra nei preventivi', () => {
  const s = readFileSync(new URL('../src/server/codifica-servizio.ts', import.meta.url), 'utf8');
  assert.match(s, /solo \? \{ perPn: new Map\(\), errori: \{\} \}\s*: await cercaPn/);
  assert.match(s, /if \(solo\) \{ await salvaRighe\(id, righe\); await archiviaCorrette\(id, righe, [^)]*\); return notaIa; \}/);
  assert.match(s, /AND NOT solo_codifica/);
  assert.match(readFileSync(new URL('../src/server/rotte/preventivi.ts', import.meta.url), 'utf8'), /AND NOT solo_codifica/);
});

test('Excel con più fogli: si codifica il foglio "BOM"', () => {
  assert.equal(foglioBom(['Note', 'Bom ', 'Gerber']), 1);
  assert.equal(foglioBom(['Copertina', 'BOM']), 1);
  assert.equal(foglioBom(['Copertina', 'BOM TOP', 'BOM']), 2); // il nome esatto vince
  assert.equal(foglioBom(['Copertina', 'BOM_rev2']), 1);
  assert.equal(foglioBom(['Foglio1', 'BOMBATURA']), -1);
  assert.equal(foglioBom(['Foglio1']), -1);
});

test('menu Produzione: Codifica componenti', () => {
  const produzione = MENU_GRUPPI.find(g => g.chiave === 'produzione')!;
  assert.ok(produzione.voci.some(([t, u]) => t === 'Codifica componenti' && u === '/produzione/codifica-componenti'));
});

test('guida: codifica BOM senza prezzi', () => {
  assert.equal(cercaGuida('codificare una bom senza prezzi')[0]?.argomento.id, 'codifica-bom-senza-prezzi');
  assert.equal(cercaGuida('codifica componenti foglio bom google sheets')[0]?.argomento.id, 'codifica-bom-senza-prezzi');
});
