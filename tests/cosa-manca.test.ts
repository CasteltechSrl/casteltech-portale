import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chiaviComponente, cosaManca, quantitaBomPerCommessa } from '../src/engine/cosa-manca.js';
import { cercaGuida } from '../src/engine/guida.js';

const servono = [
  { codice: '311-10KGRCT-ND', descrizione: 'RC0603FR-0710KL YAGEO RIF. R1,R2', quantita: 220, prezzo: 0.01, distributore: 'digikey' },
  { codice: '81-GRM188R71C104KA1D', descrizione: 'GRM188R71C104KA01D MURATA RIF. C1', quantita: 110, prezzo: 0.02, distributore: 'mouser' },
  { codice: null, descrizione: 'STM32F103C8T6 ST RIF. U1', quantita: 105, prezzo: 3.5, distributore: 'mouser' },
  { codice: 'LM358-X', descrizione: 'LM358DR TI RIF. U2', quantita: 105, prezzo: 0.3, distributore: 'tme' },
];

test('cosa manca: chiavi per codice del distributore e per P/N (prima parola della descrizione)', () => {
  assert.deepEqual(chiaviComponente(' 311-10kgrct-nd ', 'RC0603FR-0710KL YAGEO'), ['C:311-10KGRCT-ND', 'P:RC0603FR-0710KL']);
  assert.deepEqual(chiaviComponente(null, 'U1'), []);
});

test('cosa manca: ordinati, arrivati, in parte e da ordinare rispetto agli ordini a fornitore', () => {
  const ordinate = [
    { codice: '311-10KGRCT-ND', descrizione: 'RC0603FR-0710KL YAGEO', quantita: 220, arrivati: 220, documento: '205/2026' },        // arrivato
    { codice: 'ALTRO', descrizione: 'GRM188R71C104KA01D MURATA', quantita: 50, arrivati: 0, documento: 'bozza 9' },               // per P/N, in parte
    { codice: 'LM358-X', descrizione: 'LM358DR', quantita: 105, arrivati: 0, documento: '206/2026' },                               // ordinato
  ];
  const e = cosaManca(servono, ordinate);
  assert.deepEqual(e.righe.map(x => x.stato), ['arrivato', 'parziale', 'da_ordinare', 'ordinato']);
  assert.deepEqual(e.righe.map(x => x.mancante), [0, 60, 105, 0]);
  assert.deepEqual(e.righe[1].ordini, ['bozza 9']);
  assert.deepEqual(e.conta, { da_ordinare: 1, ordinato: 1, parziale: 1, arrivato: 1 });
  assert.equal(e.mancanti, 2);
  // senza ordini tutto è da ordinare
  assert.equal(cosaManca(servono, []).conta.da_ordinare, 4);
});

test('cosa manca: quantità della BOM per la commessa = la più piccola che copre le schede', () => {
  assert.equal(quantitaBomPerCommessa([50, 100, 500], 100), 100);
  assert.equal(quantitaBomPerCommessa([50, 100, 500], 120), 500);
  assert.equal(quantitaBomPerCommessa([50, 100], 800), 100);
  assert.equal(quantitaBomPerCommessa([], 10), null);
});

test('cosa manca: pulsante nella commessa, pagina e ordine dei mancanti collegato a BOM e commessa; guida', () => {
  assert.ok(readFileSync('src/server/rotte/commesse.ts', 'utf8').includes('href="/ordini/fornitori/commessa/${salvata.id}"'));
  const rotta = readFileSync('src/server/rotte/ordini-fornitore.ts', 'utf8');
  assert.ok(rotta.includes("r.get('/commessa/:id'") && rotta.includes("r.post('/commessa/:id'"));
  assert.ok(readFileSync('src/server/ordini-fornitore-servizio.ts', 'utf8').includes('bomId: x.bom!.id, commessaId'));
  for (const q of ['cosa manca per la commessa', 'componenti non ancora ordinati'])
    assert.ok(cercaGuida(q).slice(0, 3).some(r => r.argomento.id === 'cosa-manca'), q);
});
