import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { commesseRecenti, faseSuccessiva, riepilogoOggi, type RigaOggi } from '../src/engine/reparto-oggi.js';
import { cercaGuida } from '../src/engine/guida.js';

const previste = [
  { codice: 'm1', numero: 'M1', nome: 'Controllo bolla' },
  { codice: 'f1', numero: '1', nome: 'Serigrafia' },
  { codice: 'f2', numero: '2', nome: 'Pick and place' },
  { codice: 'f3', numero: '3', nome: 'Forno' },
  { codice: 'f4', numero: '4', nome: 'AOI' },
];

test('prossima fase: la prima prevista dopo quella chiusa, saltando le già fatte e quelle aperte da altri', () => {
  assert.equal(faseSuccessiva(previste, 'f1', [])?.codice, 'f2');
  assert.equal(faseSuccessiva(previste, 'f1', ['f2'])?.codice, 'f3');
  assert.equal(faseSuccessiva(previste, 'f1', ['f2'], ['f3'])?.codice, 'f4');
  // dopo l'ultima non c'è più niente: si propone la prima saltata dall'inizio
  assert.equal(faseSuccessiva(previste, 'f4', ['f1', 'f3'])?.codice, 'm1');
  assert.equal(faseSuccessiva(previste, 'f4', ['m1', 'f1', 'f2', 'f3']), null);
  // la fase chiusa non si ripropone, anche se non risulta tra le fatte (la riga si sta ancora salvando)
  assert.equal(faseSuccessiva(previste, 'f3', ['m1', 'f1', 'f2'])?.codice, 'f4');
  // fase chiusa non tra le previste (fase "altra"): si parte dall'inizio
  assert.equal(faseSuccessiva(previste, 'x9', ['m1'])?.codice, 'f1');
  assert.equal(faseSuccessiva([], 'f1', []), null);
});

const riga = (x: Partial<RigaOggi>): RigaOggi => ({ id: 1, commessa: 'C2026-0001', codice_qr: 'q1', fase_codice: 'f1', numero: '1', nome: 'Serigrafia',
  inizio: '08:00', fine: '09:00', minuti: 60, pezzi: null, aperta: false, ...x });

test('le mie fasi di oggi: aperte prima, poi dalla più recente; totale ore e conteggi', () => {
  const r = riepilogoOggi([
    riga({ id: 1, inizio: '08:00', fine: '09:30', minuti: 90 }),
    riga({ id: 2, inizio: '10:00', fine: null, minuti: 25, aperta: true }),
    riga({ id: 3, inizio: '09:30', fine: '10:00', minuti: 30, pezzi: 50 }),
    riga({ id: 4, inizio: null, fine: null, minuti: 45 }),   // scritta come tempo totale
  ]);
  assert.deepEqual(r.righe.map(x => x.id), [2, 3, 1, 4]);
  assert.equal(r.totaleMin, 190);
  assert.equal(r.chiuse, 3);
  assert.equal(r.aperte, 1);
  assert.deepEqual(riepilogoOggi([]), { righe: [], totaleMin: 0, chiuse: 0, aperte: 0 });
});

test('commesse recenti: una volta sola, in ordine, al massimo cinque', () => {
  const righe = ['a', 'b', 'a', 'c', 'b', 'd', 'e', 'f', 'g'].map(codice_qr => ({ codice_qr }));
  assert.deepEqual(commesseRecenti(righe).map(r => r.codice_qr), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(commesseRecenti(righe, 2).map(r => r.codice_qr), ['a', 'b']);
});

test('telefono: la pagina ha le sezioni nuove e la chiusura porta alla prossima fase', () => {
  const src = readFileSync('src/server/rotte/reparto.ts', 'utf8');
  assert.match(src, /Le tue fasi di oggi/);
  assert.match(src, /Le tue commesse degli ultimi giorni/);
  assert.match(src, /&dopo=\$\{encodeURIComponent\(f\.fase_codice\)\}/);
  assert.match(src, /Prossima fase/);
  assert.match(src, /Apri adesso/);
  assert.ok(cercaGuida('prossima fase telefono riapri').slice(0, 2).some(r => r.argomento.id === 'fasi-di-oggi'));
});
