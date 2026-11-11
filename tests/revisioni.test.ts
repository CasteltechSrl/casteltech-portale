import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emailConRevisione, etichettaRevisione, nomeFileRevisione, prossimaRevisione, TIPI_CON_REVISIONI } from '../src/engine/revisioni.js';
import { cercaGuida } from '../src/engine/guida.js';

test('revisioni: primo invio = 0, poi 1, 2…; già inviato prima delle revisioni = 1', () => {
  assert.equal(prossimaRevisione(null, false), 0);
  assert.equal(prossimaRevisione(null, true), 1);
  assert.equal(prossimaRevisione(0, true), 1);
  assert.equal(prossimaRevisione(2, true), 3);
});

test('revisioni: etichetta e nome del file', () => {
  assert.equal(etichettaRevisione(0), '');
  assert.equal(etichettaRevisione(2), 'Rev. 2');
  assert.equal(nomeFileRevisione('Preventivo_P2026-1_X.pdf', 0), 'Preventivo_P2026-1_X.pdf');
  assert.equal(nomeFileRevisione('Preventivo_P2026-1_X.pdf', 2), 'Preventivo_P2026-1_X_rev2.pdf');
});

test('revisioni: email con "annulla e sostituisce", senza ripetere', () => {
  const base = { oggetto: 'Preventivo P2026-1', testo: 'Buongiorno,\nin allegato.' };
  assert.deepEqual(emailConRevisione(base, 0), base);
  const r = emailConRevisione(base, 1, new Date('2026-11-10T09:00:00Z'));
  assert.equal(r.oggetto, 'Preventivo P2026-1 - Rev. 1');
  assert.match(r.testo, /^ATTENZIONE: questo invio \(revisione 1\) annulla e sostituisce l'invio precedente del 10\/11\/2026/);
  assert.ok(r.testo.endsWith('in allegato.'));
  assert.deepEqual(emailConRevisione(r, 1), r);
});

test('revisioni: fatture fuori (si correggono con la nota di credito), guida trova l\'argomento', () => {
  for (const t of ['preventivo', 'conferma_ordine', 'ddt', 'ordine_fornitore']) assert.ok(TIPI_CON_REVISIONI.includes(t));
  for (const t of ['fattura', 'nota_credito', 'autofattura']) assert.ok(!TIPI_CON_REVISIONI.includes(t));
  assert.equal(cercaGuida('rimandare il preventivo con una revisione')[0].argomento.id, 'revisioni-invio');
});
