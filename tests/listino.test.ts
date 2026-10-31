// Prezzi a scaglioni di quantità (Adriano 31/10/2026). Esempi inventati.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { leggiScaglioni, prezzoPerQuantita, scrivi } from '../src/engine/listino.js';

test('scaglioni: si scrivono come 1-5=10; 6-20=8; 21+=7', () => {
  const { scaglioni, errori } = leggiScaglioni('6-20 = 8 €; 1-5=10\n21+=7,5');
  assert.deepEqual(errori, []);
  assert.deepEqual(scaglioni, [{ da: 1, a: 5, prezzo: 10 }, { da: 6, a: 20, prezzo: 8 }, { da: 21, a: null, prezzo: 7.5 }]);
  assert.equal(scrivi(scaglioni), '1-5=10; 6-20=8; 21+=7,5');
  assert.deepEqual(leggiScaglioni('da 1 a 5 pz: 10; oltre 5: 8.5').scaglioni, [{ da: 1, a: 5, prezzo: 10 }, { da: 6, a: null, prezzo: 8.5 }]);
  assert.deepEqual(leggiScaglioni(''), { scaglioni: [], errori: [] });
});

test('scaglioni sbagliati: sovrapposti, al contrario, illeggibili', () => {
  assert.match(leggiScaglioni('1-10=5; 5-20=4').errori.join(), /sovrappongono/);
  assert.match(leggiScaglioni('1+=5; 10-20=4').errori.join(), /sovrappongono/);
  assert.match(leggiScaglioni('20-5=3').errori.join(), /più piccola/);
  assert.match(leggiScaglioni('tanti=3').errori.join(), /non si capisce/);
});

test('prezzo per quantità: scaglione giusto, altrimenti prezzo unico', () => {
  const sc = leggiScaglioni('1-5=10; 6-20=8; 21+=7').scaglioni;
  assert.equal(prezzoPerQuantita(12, sc, 3).prezzo, 10);
  assert.equal(prezzoPerQuantita(12, sc, 6).prezzo, 8);
  assert.equal(prezzoPerQuantita(12, sc, 20).prezzo, 8);
  assert.equal(prezzoPerQuantita(12, sc, 500).prezzo, 7);
  assert.equal(prezzoPerQuantita(12, [], 500).prezzo, 12);        // senza scaglioni: un prezzo per tutte le quantità
  assert.equal(prezzoPerQuantita(null, [], 5).prezzo, null);
  const buco = leggiScaglioni('1-5=10; 10-20=8').scaglioni;
  assert.equal(prezzoPerQuantita(12, buco, 7).prezzo, 10);         // tra due scaglioni: vale quello prima
  assert.equal(prezzoPerQuantita(12, buco, 50).prezzo, 8);
  assert.equal(prezzoPerQuantita(12, leggiScaglioni('10-20=8').scaglioni, 3).prezzo, 12);   // sotto il primo: prezzo unico
});

test('fattura, nota di credito, DDT: la bozza prende il prezzo dal listino solo dove manca, tra i codici del cliente', () => {
  const doc = readFileSync(new URL('../src/server/documenti-servizio.ts', import.meta.url), 'utf8');
  assert.match(doc, /righeDaModulo\(await completaDaListino\(cliente, b\.righe/);
  const srv = readFileSync(new URL('../src/server/prezzi-servizio.ts', import.meta.url), 'utf8');
  const f = srv.slice(srv.indexOf('export async function completaDaListino'));
  assert.match(f, /if \(String\(r\.prezzo \?\? ''\)\.trim\(\)/);       // prezzo scritto = resta quello
  assert.match(srv.slice(srv.indexOf('export async function prezzoListino')), /WHERE cliente_id = \$1/);
});
