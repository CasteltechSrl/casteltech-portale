import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL ??= 'postgres://solo-per-i-test@localhost/nessuno'; // il modulo db non si collega finché non si fanno query
const { pulisciDescrizione, maiuscolo, chiaveCodice } = await import('../src/server/anagrafiche-servizio.js');

test('descrizioni: tolte le quantità scritte al posto della descrizione', () => {
  for (const s of ['50 PZ', '50 pz', '160pz', '50 pezzi', '272', ' 1000 PZ ', '100 SCHEDE']) assert.equal(pulisciDescrizione(s), '', s);
  assert.equal(pulisciDescrizione('PCA NW24080D LF x 1000pz'), 'PCA NW24080D LF');
  assert.equal(pulisciDescrizione('100 pannelli da 20 schedine disp. fox'), '100 PANNELLI DA 20 SCHEDINE DISP. FOX');
  assert.equal(pulisciDescrizione('Prova dal nuovo portale'), 'PROVA DAL NUOVO PORTALE');
});

test('maiuscolo e chiave codice', () => {
  assert.equal(maiuscolo('  idea   automazione s.r.l. '), 'IDEA AUTOMAZIONE S.R.L.');
  assert.equal(chiaveCodice('sl_0067'), chiaveCodice('SL-0067'));
  assert.notEqual(chiaveCodice('SL_0068'), chiaveCodice('SL_0083'));
});
