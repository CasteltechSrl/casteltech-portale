import { test } from 'node:test';
import assert from 'node:assert/strict';
import { righeNote, unisciNote, noteDaProporre, testoSegnalazioniVecchie } from '../src/engine/note-prodotto.js';

test('righeNote: toglie trattini, spazi doppi, righe vuote e "/"', () => {
  assert.deepEqual(righeNote('- R51  NON MONTARE\n\n/\n• C40 DIVENTA CSM47UD10VT'), ['R51 NON MONTARE', 'C40 DIVENTA CSM47UD10VT']);
  assert.deepEqual(righeNote(['a', ' ', 'b\nc']), ['a', 'b', 'c']);
});

test('unisciNote: niente doppioni (maiuscole e spazi non contano), le righe scritte restano prime', () => {
  const r = unisciNote('Non separare le schede', ['NON SEPARARE LE SCHEDE', 'R37 diventa 330R']);
  assert.equal(r.testo, 'Non separare le schede\nR37 diventa 330R');
  assert.equal(r.aggiunte, 1);
  assert.equal(unisciNote(r.testo, ['r37 DIVENTA 330 R']).aggiunte, 0);
});

test('noteDaProporre: la scheda tecnica vince, altrimenti le note del prodotto', () => {
  assert.equal(noteDaProporre('Note della revisione', 'Note del prodotto'), 'Note della revisione');
  assert.equal(noteDaProporre('  ', 'Note del prodotto'), 'Note del prodotto');
  assert.equal(noteDaProporre('', ''), '');
});

test('testoSegnalazioniVecchie: una riga sola, senza doppioni', () => {
  assert.equal(testoSegnalazioniVecchie(['Attenzione alla microSD', 'ATTENZIONE ALLA MICROSD', 'Verificare U13']),
    'Dalle schede di produzione vecchie: Attenzione alla microSD · Verificare U13');
  assert.equal(testoSegnalazioniVecchie(['/', '']), '');
});
