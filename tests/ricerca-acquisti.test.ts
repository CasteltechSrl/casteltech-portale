import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acquistiPerAnno, radice, spiegaTermini, terminiRicerca, terminiTolleranti, varianteConErrori } from '../src/engine/ricerca-acquisti.js';
import type { RigaAcquistoStorica } from '../src/engine/righe-fattura.js';
import { cercaGuida } from '../src/engine/guida.js';

// Adriano 11/11/2026: "lamine serigrafiche" anno per anno e ricerca più generica
const contiene = (testo: string, varianti: string[]) => varianti.some(v => new RegExp(v.replace(/_/g, '.')).test(testo));
const trova = (cerca: string, riga: string) => terminiRicerca(cerca).every(t => contiene(riga, t.varianti));

test('radice: singolare e plurale, -che/-ghe, codici interi', () => {
  assert.equal(radice('LAMINA'), 'LAMIN');
  assert.equal(radice('LAMINE'), 'LAMIN');
  assert.equal(radice('SERIGRAFICHE'), 'SERIGRAFIC');
  assert.equal(radice('SERIGRAFICA'), 'SERIGRAFIC');
  assert.equal(radice('STENCILS'), 'STENCIL');
  assert.equal(radice('STM32F103'), 'STM32F103');
  assert.equal(radice('0603'), '0603');
});

test('lamina = lamine = stencil; "serigrafica" non obbligatoria; accenti e parole vuote non contano', () => {
  for (const cerca of ['lamina', 'lamine', 'Lamine serigrafiche', 'lamina serigrafica', 'stencil', 'le lamine']) {
    assert.ok(trova(cerca, 'LAMINA SERIGRAFICA 29X29 PER CODICE A1'), cerca);
    assert.ok(trova(cerca, 'STENCIL LASER 0,12 MM'), cerca);
    assert.ok(trova(cerca, 'LAMINE ACCIAIO'), cerca);
  }
  assert.equal(terminiRicerca('lamine serigrafiche').length, 1);
  assert.ok(trova('pasta saldante', 'SOLDER PASTE SAC305 500G'));
  assert.ok(trova('paste saldanti', 'PASTA SALDANTE NO CLEAN'));
  assert.ok(trova('trasporto', 'SPESE DI SPEDIZIONE'));
  assert.ok(trova('qualità', 'CONTROLLO QUALITA'));
  assert.ok(!trova('lamina', 'PASTA SALDANTE'));
  // due parole senza sinonimi: tutte e due devono esserci
  assert.ok(trova('0603 10K', 'RES 0603 10K 1%'));
  assert.ok(!trova('0603 10K', 'RES 0805 10K 1%'));
  // parole esatte: niente sinonimi né radici
  assert.deepEqual(terminiRicerca('lamine', { esatta: true }), [{ parola: 'LAMINE', varianti: ['LAMINE'] }]);
  assert.match(spiegaTermini(terminiRicerca('lamina')), /stencil/);
});

test('errori di battitura: una lettera sbagliata, mancante o in più (solo se la ricerca normale non trova niente)', () => {
  const tolleranti = terminiTolleranti(terminiRicerca('kapston'));
  assert.ok(contiene('NASTRO KAPTON 10MM', tolleranti[0].varianti));          // lettera in più
  assert.ok(contiene('FLUSSANTE', terminiTolleranti(terminiRicerca('flusante'))[0].varianti));  // lettera mancante
  assert.ok(contiene('DISSIPATORE', varianteConErrori('DISIPATOR')));        // lettera mancante
  assert.ok(contiene('DISSIPATORE', varianteConErrori('DISSIPETOR')));       // lettera sbagliata
  assert.deepEqual(varianteConErrori('0603'), ['0603']);                      // codici corti: niente
});

const riga = (data: string, fornitore: string, quantita: number, imponibile: number, tipo: 'fattura' | 'nota_credito' = 'fattura', documentoId = Math.random()): RigaAcquistoStorica => ({
  documentoId, tipo, numero: '1', data, fornitore, fornitoreChiave: `n:${fornitore}`, codice: null, descrizione: 'LAMINA', pn: null, quantita, um: 'PZ', imponibile, componenteId: null, materialeId: null,
});

test('totali per anno: spesa, quantità, note di credito in negativo, variazione, fornitori', () => {
  const anni = acquistiPerAnno([
    riga('2026-03-01', 'I-TRONIK', 2, 150, 'fattura', 1), riga('2026-05-01', 'LOPAR', 1, 90, 'fattura', 2), riga('2026-06-01', 'I-TRONIK', 1, 75, 'nota_credito', 3),
    riga('2025-02-01', 'I-TRONIK', 4, 300, 'fattura', 4), riga('2024-01-10', 'JOX', 1, 80, 'fattura', 5),
  ]);
  assert.deepEqual(anni.map(a => a.anno), [2026, 2025, 2024]);
  assert.equal(anni[0].spesa, 165); assert.equal(anni[0].quantita, 2); assert.equal(anni[0].fatture, 3);
  assert.equal(anni[0].variazione, -45);
  assert.equal(anni[0].fornitori[0].fornitore, 'LOPAR');
  assert.equal(anni[1].prezzoMedio, 75);
  assert.equal(anni[2].variazione, null);
});

test('guida: anno per anno e ricerca tollerante', () => {
  assert.equal(cercaGuida('quanto ho comprato di lamine ogni anno')[0]?.argomento.id, 'analisi-acquisti');
});
