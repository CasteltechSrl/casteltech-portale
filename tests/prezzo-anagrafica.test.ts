// Prezzo in anagrafica dal preventivo inviato e controllo dell'ordine (Adriano 11/11/2026). Esempi inventati.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { differenzaOrdine, inserisciScaglione, leggiSceltaAnagrafica } from '../src/engine/prezzo-anagrafica.js';
import { prezzoPerQuantita } from '../src/engine/listino.js';

test('scaglione nuovo senza scaglioni: le altre quantità restano al prezzo unico', () => {
  const s = inserisciScaglione(10, [], 500, 999, 8);
  assert.deepEqual(s, [{ da: 500, a: 999, prezzo: 8 }, { da: 1000, a: null, prezzo: 10 }]);
  assert.equal(prezzoPerQuantita(10, s, 100).prezzo, 10);
  assert.equal(prezzoPerQuantita(10, s, 700).prezzo, 8);
  assert.equal(prezzoPerQuantita(10, s, 2000).prezzo, 10);
});

test('scaglione dentro uno esistente: lo divide; "e oltre" taglia quelli dopo', () => {
  assert.deepEqual(inserisciScaglione(null, [{ da: 1, a: 99, prezzo: 12 }, { da: 100, a: null, prezzo: 9 }], 200, 499, 8),
    [{ da: 1, a: 99, prezzo: 12 }, { da: 100, a: 199, prezzo: 9 }, { da: 200, a: 499, prezzo: 8 }, { da: 500, a: null, prezzo: 9 }]);
  assert.deepEqual(inserisciScaglione(null, [{ da: 1, a: 99, prezzo: 12 }, { da: 100, a: 499, prezzo: 9 }, { da: 500, a: null, prezzo: 8 }], 300, null, 7),
    [{ da: 1, a: 99, prezzo: 12 }, { da: 100, a: 299, prezzo: 9 }, { da: 300, a: null, prezzo: 7 }]);
});

test('scelta del modulo e differenza dell\'ordine', () => {
  assert.deepEqual(leggiSceltaAnagrafica({ modo: 'scaglione', da: '200', a: '' }), { modo: 'scaglione', da: 200, a: null });
  assert.equal(leggiSceltaAnagrafica({ modo: 'scaglione', da: '200', a: '100' }), null);
  assert.deepEqual(leggiSceltaAnagrafica({ modo: 'unico' }), { modo: 'unico' });
  assert.equal(differenzaOrdine(8, 300, 8, []), null);
  assert.deepEqual(differenzaOrdine(7.5, 300, 8, []), { anagrafica: 8 });
  assert.deepEqual(differenzaOrdine(7.5, 300, null, []), { anagrafica: null });
  assert.equal(differenzaOrdine(0, 300, 8, []), null);
});

test('agganci: invio email e "Segna come inviato" scrivono in anagrafica, il Salva solo con "Variazione quantità"', () => {
  const prev = readFileSync('src/server/rotte/preventivi.ts', 'utf8');
  assert.equal((prev.match(/prezzoInAnagraficaDaPreventivo\(id, 'invio'\)/g) ?? []).length, 2);
  assert.match(prev, /prezzoInAnagraficaDaPreventivo\(nuovoId, 'salvataggio'\)/);
  assert.match(readFileSync('public/preventivo.js', 'utf8'), /casella\('variazioneQuantita'\)[\s\S]*showModal/);
  assert.match(readFileSync('src/server/rotte/ordini.ts', 'utf8'), /\/righe\/:riga\/prezzo/);
});
