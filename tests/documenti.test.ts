import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numeroModulo, righeDaModulo } from '../src/engine/documenti.js';

test('bozza: numeri scritti all\'italiana o con il punto', () => {
  assert.equal(numeroModulo('1.234,50'), 1234.5);
  assert.equal(numeroModulo('2,1'), 2.1);
  assert.equal(numeroModulo('2.1'), 2.1);      // senza virgola il punto è il decimale
  assert.equal(numeroModulo(''), 0);
  assert.ok(Number.isNaN(numeroModulo('due')));
});

test('bozza: righe del modulo, vuote tolte, testo senza importo, errori', () => {
  const { righe, errori } = righeDaModulo([
    { descrizione: 'DDT n. 207 del 15/10/2026', solo_descrizione: 'on', prezzo: '5', ddt_id: '1377' },
    { codice: 'abc', descrizione: 'Montaggio', quantita: '', prezzo: '1.234,50', sconto: '5', aliquota_iva: 'INTENTO' },
    { descrizione: '', codice: '', prezzo: '' },
  ]);
  assert.deepEqual(errori, []);
  assert.equal(righe.length, 2);
  assert.deepEqual([righe[0].solo_descrizione, righe[0].prezzo, righe[0].aliquota_iva, righe[0].ddt_id], [true, 0, null, 1377]);
  assert.deepEqual([righe[1].codice, righe[1].quantita, righe[1].prezzo, righe[1].sconto, righe[1].posizione], ['ABC', 1, 1234.5, 5, 2]);
  const sbagliate = righeDaModulo([{ descrizione: 'X', prezzo: 'tanto' }, { codice: 'Y', prezzo: '1', sconto: '120' }]).errori.join(' ');
  assert.match(sbagliate, /Riga 1: quantità, prezzo o sconto non sono numeri/);
  assert.match(sbagliate, /Riga 2: lo sconto va da 0 a 100/);
  assert.match(sbagliate, /Riga 2: manca la descrizione/);
});
