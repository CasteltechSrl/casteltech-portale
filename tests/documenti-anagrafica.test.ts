// Righe dei documenti con codice dall'anagrafica e domanda sul prezzo (Adriano 31/10/2026). Esempi inventati.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cosaAggiornare, leggiScaglioni } from '../src/engine/listino.js';
import { cellaCodice, cellaDescrizione, prodottoDellaRiga } from '../src/server/views/scelta-prodotto.js';

const prodotti = [{ id: 1, codice: 'AB-100', descrizione: 'SCHEDA ALFA' }, { id: 2, codice: 'AB-200', descrizione: 'SCHEDA BETA' }];

test('menu Codice: solo i prodotti del cliente, voce nuova, codici vecchi visibili', () => {
  const vuota = String(cellaCodice({}, 0, prodotti));
  assert.match(vuota, /— senza codice —/);
  assert.match(vuota, /value="1"[^>]*>AB-100</);
  assert.match(vuota, /value="nuovo">\+ Nuovo prodotto/);
  assert.match(String(cellaCodice({ prodotto_id: 2 }, 3, prodotti)), /value="2"[^>]*selected/);
  assert.match(String(cellaCodice({ codice: 'AB100' }, 0, prodotti)), /value="1"[^>]*selected/);       // stesso codice scritto in altro modo
  const vecchio = String(cellaCodice({ codice: 'XYZ' }, 0, prodotti));
  assert.match(vecchio, /XYZ \(non in anagrafica\)/);
  assert.match(vecchio, /name="righe\[0\]\[codice\]" value="XYZ"/);
  assert.equal(prodottoDellaRiga({ codice: 'ZZZ' }, prodotti), null);
  assert.match(String(cellaDescrizione({ prodotto_id: 1 }, 0, prodotti)), /value="SCHEDA ALFA"[^>]*readonly/);
  assert.doesNotMatch(String(cellaDescrizione({ descrizione: 'TRASPORTO' }, 0, prodotti)), /readonly/);   // riga senza codice: libera
});

test('prezzo cambiato a mano: si aggiorna lo scaglione di quella quantità, altrimenti il prezzo unico', () => {
  const sc = leggiScaglioni('1-5=10; 6-20=8; 21+=7').scaglioni;
  assert.deepEqual(cosaAggiornare(12, sc, 10, 7.5), { voce: 'scaglione', scaglione: { da: 6, a: 20, prezzo: 8 }, attuale: 8 });
  assert.equal(cosaAggiornare(12, sc, 10, 8), null);                         // già uguale: niente domanda
  assert.deepEqual(cosaAggiornare(12, [], 10, 11), { voce: 'unico', attuale: 12 });
  assert.deepEqual(cosaAggiornare(null, [], 10, 11), { voce: 'unico', attuale: null });
  assert.equal(cosaAggiornare(12, [], 1, 12), null);
  assert.equal(cosaAggiornare(12, leggiScaglioni('10-20=8').scaglioni, 3, 11)?.voce, 'unico');   // sotto il primo scaglione vale il prezzo unico
});

test('tutti i documenti con righe al cliente usano il menu dell\'anagrafica; il codice salvato viene dal prodotto del cliente', () => {
  const amm = readFileSync(new URL('../src/server/rotte/amministrazione.ts', import.meta.url), 'utf8');
  assert.equal((amm.match(/cellaCodice\(x, i, prodotti\)/g) ?? []).length, 2);     // DDT + fattura / nota di credito / di debito
  assert.match(readFileSync(new URL('../src/server/rotte/conferme-ordine.ts', import.meta.url), 'utf8'), /cellaCodice\(x, i, prodotti\)/);
  assert.match(readFileSync(new URL('../src/server/rotte/ordini-fornitore.ts', import.meta.url), 'utf8'), /cerca-componente/);
  assert.match(readFileSync(new URL('../src/server/conferme-ordine-servizio.ts', import.meta.url), 'utf8'), /completaDaListino\(cliente/);
  const srv = readFileSync(new URL('../src/server/prezzi-servizio.ts', import.meta.url), 'utf8');
  assert.match(srv, /WHERE id = ANY\(\$1\) AND cliente_id = \$2/);
});
