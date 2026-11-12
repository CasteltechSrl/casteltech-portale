// Registro delle attività (chi ha cambiato cosa e quando, eliminazioni comprese) e sicurezza degli accessi: src/engine/registro.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chiudereSessioni, daSaltare, problemaPassword, sezioneDi, voceRegistro } from '../src/engine/registro.js';

test('registro: letture, errori, accesso, reparto e chiavi esterne non si registrano', () => {
  assert.equal(voceRegistro({ metodo: 'GET', percorso: '/preventivi/12', stato: 200 }), null);
  assert.equal(voceRegistro({ metodo: 'POST', percorso: '/preventivi/12', stato: 500 }), null);
  assert.equal(voceRegistro({ metodo: 'POST', percorso: '/login', stato: 302 }), null);
  assert.equal(voceRegistro({ metodo: 'POST', percorso: '/r/fase/3/apri', stato: 302 }), null);
  assert.equal(voceRegistro({ metodo: 'POST', percorso: '/api/claude/suggerimenti', stato: 200 }), null);
});

test('registro: salvataggio con link alla riga, sezione dal percorso', () => {
  const v = voceRegistro({ metodo: 'POST', percorso: '/amministrazione/documenti/45/emetti?x=1', stato: 302 })!;
  assert.equal(v.tipo, 'modifica');
  assert.equal(v.sezione, 'Amministrazione');
  assert.equal(v.azione, 'emetti');
  assert.equal(v.oggetto, '45');
  assert.equal(v.link, '/amministrazione/documenti/45');
  assert.equal(voceRegistro({ metodo: 'POST', percorso: '/preventivi/7', stato: 302 })!.azione, 'salva');
  assert.equal(sezioneDi('/ordini/fornitori/3'), 'Ordini a fornitore');
  assert.equal(sezioneDi('/preventivi/documenti/3'), 'Documenti commesse');
});

test('registro: eliminazioni dall\'indirizzo e dai pulsanti degli elenchi, con le righe spuntate', () => {
  const a = voceRegistro({ metodo: 'POST', percorso: '/commesse/9/elimina', stato: 302 })!;
  assert.equal(a.tipo, 'eliminazione');
  assert.equal(a.link, null);
  const b = voceRegistro({ metodo: 'POST', percorso: '/preventivi/azioni', corpo: { azione: 'elimina', ids: ['3', '4'] }, stato: 302 })!;
  assert.equal(b.tipo, 'eliminazione');
  assert.equal(b.oggetto, '3, 4');
  const c = voceRegistro({ metodo: 'POST', percorso: '/amministrazione/documenti/azioni', corpo: { azione: 'annulla', ids: '8' }, stato: 302 })!;
  assert.equal(c.tipo, 'eliminazione');
  const d = voceRegistro({ metodo: 'POST', percorso: '/preventivi/azioni', corpo: { azione: 'duplica', ids: ['3'] }, stato: 302 })!;
  assert.equal(d.tipo, 'modifica');
  // mai i valori dei moduli
  const e = voceRegistro({ metodo: 'POST', percorso: '/impostazioni/utenti/2', corpo: { password: 'segreta-123456' }, stato: 302 })!;
  assert.ok(!JSON.stringify(e).includes('segreta'));
});

test('registro: le bozze che si salvano da sole una volta ogni 10 minuti', () => {
  assert.equal(daSaltare(true, Date.now() - 60_000, Date.now()), true);
  assert.equal(daSaltare(true, Date.now() - 11 * 60_000, Date.now()), false);
  assert.equal(daSaltare(false, Date.now() - 1000, Date.now()), false, 'un clic su Salva si registra sempre');
});

test('accessi: chi è disattivato, cambia ruolo o password esce subito', () => {
  const base = { attivoPrima: true, attivoDopo: true, ruoloPrima: 'ufficio', ruoloDopo: 'ufficio', passwordCambiata: false };
  assert.equal(chiudereSessioni(base), false);
  assert.equal(chiudereSessioni({ ...base, attivoDopo: false }), true);
  assert.equal(chiudereSessioni({ ...base, ruoloDopo: 'esterno' }), true);
  assert.equal(chiudereSessioni({ ...base, passwordCambiata: true }), true);
});

test('password: almeno 10 caratteri e non facili da indovinare', () => {
  assert.match(problemaPassword('corta1')!, /10 caratteri/);
  assert.match(problemaPassword('1234567890')!, /soli numeri/);
  assert.match(problemaPassword('aaaaaaaaaaaa')!, /stessi caratteri/);
  assert.match(problemaPassword('qwertyuiop')!, /sequenza/);
  assert.match(problemaPassword('Casteltech2026!')!, /casteltech/);
  assert.match(problemaPassword('Password2026')!, /password/);
  assert.match(problemaPassword('mario.rossi99', { email: 'mario.rossi@casteltech.net' })!, /email/);
  assert.equal(problemaPassword('Fiorenzuola-stagno-77'), null);
  assert.equal(problemaPassword('cavallo verde lampada'), null);
});
