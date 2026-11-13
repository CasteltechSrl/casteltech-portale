// Una quotazione per più quantità (Adriano 13/11/2026, Digifly DGFAM V3: 25, 50, 100 pz). Esempi inventati.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FASCE_INIZIALI, erroriFasce, leggiFasce, parametriCopiati, parametriPerQuantita, quantitaDaEmail, quantitaDaTesto, ricaricoPerQuantita, valoreFascia } from '../src/engine/fasce-quantita.js';
import { cercaGuida } from '../src/engine/guida.js';

test('fasce di Adriano: velocità P&P e ricarico per numero di schede', () => {
  const v = (n: number) => valoreFascia(FASCE_INIZIALI.pepChipH, n);
  assert.deepEqual([1, 10, 11, 25, 26, 100, 101, 300, 301, 5000].map(v), [3000, 3000, 4000, 4000, 6000, 6000, 7000, 7000, 8000, 8000]);
  const r = (n: number) => ricaricoPerQuantita(FASCE_INIZIALI, n);
  assert.deepEqual([5, 10, 11, 50, 51, 1000, 1001].map(r), [1.35, 1.35, 1.3, 1.3, 1.25, 1.25, 1.2]);
});

test('quantità scritte o lette dalla mail', () => {
  assert.deepEqual(quantitaDaTesto('100, 25 / 50; 25'), [25, 50, 100]);
  assert.deepEqual(quantitaDaTesto('1.000 e 2.500'), [1000, 2500]);
  assert.deepEqual(quantitaDaEmail('vi chiediamo di fare una valutazione economica per lotti da 25, 50, 100pz'), [25, 50, 100]);
  assert.deepEqual(quantitaDaEmail('quotazione per 25/50/100 pezzi'), [25, 50, 100]);
  assert.deepEqual(quantitaDaEmail('ci servono 50 e 200 pcs'), [50, 200]);
  assert.deepEqual(quantitaDaEmail('JLCPCB per realizzare 5 campioni, ordine 167pz'), []);
});

test('fasce in impostazioni: scritte male = iniziali, errori spiegati', () => {
  assert.deepEqual(leggiFasce(null), FASCE_INIZIALI);
  assert.deepEqual(leggiFasce({ pepChipH: '1-50=5000; 51+=9000', ricarico: 'tanti' }), { pepChipH: '1-50=5000; 51+=9000', ricarico: FASCE_INIZIALI.ricarico });
  assert.deepEqual(erroriFasce(FASCE_INIZIALI), []);
  assert.match(erroriFasce({ pepChipH: '1-10=3000; 5-20=4000', ricarico: '' }).join(' '), /sovrappongono.*Ricarico: scrivi/);
});

test('altra quantità: velocità e ricarico dalla fascia, buste e cartoni in proporzione, il resto uguale', () => {
  const base = { nSchede: 100, ricarico: 1.25, parametri: { qtSmd: 153, pepChipH: 6000, pepChipHLatoB: 6000, buste: 100, cartoni: 2, tropicalizzante: 0, collaudo: 30 } };
  const x = parametriPerQuantita(base, 25, FASCE_INIZIALI);
  assert.equal(x.parametri.pepChipH, 4000);
  assert.equal(x.parametri.pepChipHLatoB, 4000);
  assert.equal(x.parametri.buste, 25);
  assert.equal(x.parametri.cartoni, 1);          // mai sotto 1 se nella base c'erano
  assert.equal(x.parametri.tropicalizzante, 0);
  assert.equal(x.parametri.collaudo, 30);
  assert.equal(x.parametri.qtSmd, 153);
  assert.equal(x.ricarico, 1.3);
  assert.equal(parametriPerQuantita(base, 250, FASCE_INIZIALI).parametri.cartoni, 5);
  // campionatura: il ricarico resta quello scelto; SMD a mano: la velocità P&P non conta
  assert.equal(parametriPerQuantita({ ...base, ricarico: 1.35, parametri: { ...base.parametri, campionatura: 1 } }, 50, FASCE_INIZIALI).ricarico, 1.35);
  assert.equal(parametriPerQuantita({ ...base, parametri: { ...base.parametri, smdAMano: 1 } }, 5, FASCE_INIZIALI).parametri.pepChipH, 6000);
  // copia nelle altre quantità: costo componenti della sorgente solo come ripiego (il server lo rifà dalla BOM)
  const c = parametriCopiati({ ...base, parametri: { ...base.parametri, costoComponentiScheda: 12.5 } }, 50, FASCE_INIZIALI);
  assert.equal(c.parametri.costoComponentiScheda, 12.5);
  assert.equal(c.parametri.buste, 50);
});

test('collegamenti: pagina dei documenti, preventivo, impostazioni, guida', () => {
  const doc = readFileSync('src/server/rotte/schede-cliente.ts', 'utf8');
  assert.match(doc, /quantitaDaEmail\(p\.email\?\.testo\)/);
  assert.match(doc, /creaAltreQuantita\(id, altre/);
  const prev = readFileSync('src/server/rotte/preventivi.ts', 'utf8');
  assert.match(prev, /\/:id\/copia-quantita/);
  assert.match(prev, /riquadroQuantita\(salvato\)/);
  assert.match(readFileSync('src/server/rotte/impostazioni.ts', 'utf8'), /\/tariffe\/fasce/);
  assert.match(readFileSync('db/migrazioni/097_preventivi_quantita.sql', 'utf8'), /gruppo_quantita/);
  assert.equal(cercaGuida('preventivo più quantità 25 50 100')[0]?.argomento.id, 'piu-quantita');
});
