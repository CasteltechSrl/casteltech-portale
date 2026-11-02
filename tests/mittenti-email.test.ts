import { test } from 'node:test';
import assert from 'node:assert/strict';
import { descriviMittente, funzioneDi, indirizzoFunzione, intestazioneDa, scegliMittente } from '../src/engine/mittenti-email.js';

const INFO = 'info@casteltech.net';

test('mittenti: ogni documento ha la sua funzione', () => {
  assert.equal(funzioneDi('ddt'), 'amministrazione');
  assert.equal(funzioneDi('fattura'), 'amministrazione');
  assert.equal(funzioneDi('nota_credito'), 'amministrazione');
  assert.equal(funzioneDi('sollecito'), 'amministrazione');
  assert.equal(funzioneDi('conferma_ordine'), 'ordini');
  assert.equal(funzioneDi('preventivo'), 'preventivi');
  assert.equal(funzioneDi('ordine_fornitore'), 'acquisti');
  assert.equal(funzioneDi('commessa'), 'produzione');
  assert.equal(funzioneDi('sito'), null);
});

test('mittenti: alias con il dominio della casella principale', () => {
  assert.equal(indirizzoFunzione('amministrazione', 'Info@Casteltech.net'), 'amministrazione@casteltech.net');
  assert.equal(indirizzoFunzione('ordini', 'senza-chiocciola'), null);
});

test('mittenti: alias attivo in Gmail → parte dall\'alias, altrimenti da info@', () => {
  const attivi = [INFO, 'amministrazione@casteltech.net', 'ORDINI@casteltech.net'];
  assert.deepEqual(scegliMittente('amministrazione', INFO, attivi), { indirizzo: 'amministrazione@casteltech.net', alias: 'amministrazione@casteltech.net', ripiego: false });
  assert.equal(scegliMittente('ordini', INFO, attivi).indirizzo, 'ordini@casteltech.net');
  const acq = scegliMittente('acquisti', INFO, attivi);
  assert.deepEqual(acq, { indirizzo: INFO, alias: 'acquisti@casteltech.net', ripiego: true });
  assert.match(descriviMittente(acq), /^info@casteltech\.net \(acquisti@casteltech\.net non è ancora attivo/);
  // elenco non letto (permesso o Gmail non raggiungibile): parte da info@ comunque
  assert.equal(scegliMittente('amministrazione', INFO, null).indirizzo, INFO);
  // nessuna funzione (es. moduli del sito): casella principale
  assert.deepEqual(scegliMittente(null, INFO, attivi), { indirizzo: INFO, alias: null, ripiego: false });
});

test('mittenti: intestazione From senza virgolette nel nome', () => {
  assert.equal(intestazioneDa('Casteltech "S.r.l."', 'ordini@casteltech.net'), '"Casteltech S.r.l." <ordini@casteltech.net>');
});
