import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chiaveGiusta, dominioAziendale, indirizzoDa, nomeFileEmail, nomePacchettoDaEmail, notaRichiesta, oggettoPulito } from '../src/engine/gmail.js';
import { leggiEmail } from '../src/engine/acquisizioni.js';

test('gmail: la chiave del pannello deve essere quella di Render (e abbastanza lunga)', () => {
  const k = 'una-frase-lunga-a-caso-1234';
  assert.equal(chiaveGiusta(k, k), true);
  assert.equal(chiaveGiusta('altra', k), false);
  assert.equal(chiaveGiusta(undefined, k), false);
  assert.equal(chiaveGiusta('corta', 'corta'), false);       // chiave troppo corta su Render: nessuno entra
  assert.equal(chiaveGiusta('qualcosa', undefined), false);  // chiave non impostata: nessuno entra
});

test('gmail: indirizzo e dominio aziendale del mittente', () => {
  assert.equal(indirizzoDa('Mario Rossi <M.Rossi@Selea.it>'), 'm.rossi@selea.it');
  assert.equal(indirizzoDa('ufficio.tecnico@univac.it'), 'ufficio.tecnico@univac.it');
  assert.equal(indirizzoDa('Senza indirizzo'), '');
  assert.equal(dominioAziendale('m.rossi@selea.it'), 'selea.it');
  assert.equal(dominioAziendale('mario.rossi@gmail.com'), null);
  assert.equal(dominioAziendale('info@casteltech.net'), null);
});

test('gmail: nome del pacchetto dall\'oggetto (senza R:, I:, FW:), poi dal primo allegato', () => {
  assert.equal(oggettoPulito('R: I: Fwd: Richiesta offerta EA1002-0'), 'Richiesta offerta EA1002-0');
  assert.equal(oggettoPulito('RE[2]: quotazione'), 'quotazione');
  assert.equal(oggettoPulito('Ricambi: offerta'), 'Ricambi: offerta');
  assert.equal(nomePacchettoDaEmail({ oggetto: 'RE: Offerta scheda VT106', mittente: 'a@b.it', allegati: ['x.zip'] }), 'Offerta scheda VT106');
  assert.equal(nomePacchettoDaEmail({ oggetto: '', mittente: 'a@b.it', allegati: ['EA1002-0_impianti.zip'] }), 'EA1002-0_impianti');
  assert.equal(nomePacchettoDaEmail({ oggetto: ' ', mittente: 'Luca <l@b.it>', data: '29/10/2026', allegati: [] }), 'Email di l@b.it del 29/10/2026');
});

test('gmail: richiesta del cliente nelle note del preventivo e nome del file .eml', () => {
  const n = notaRichiesta({ mittente: 'l@b.it', oggetto: 'Offerta', data: '29/10/2026', testo: 'Buongiorno,\r\n\n\n\nci servono 500 schede.' });
  assert.equal(n, 'Richiesta del cliente: email di l@b.it del 29/10/2026, oggetto «Offerta».\nBuongiorno,\n\nci servono 500 schede.');
  assert.ok(notaRichiesta({ mittente: 'x', oggetto: 'y', testo: 'a'.repeat(5000) }).endsWith('…'));
  assert.equal(nomeFileEmail('R: Ordine n. 12/2026: schede'), 'Ordine n. 12 2026 schede.eml');
  assert.equal(nomeFileEmail(''), 'email.eml');
});

test('gmail: la mail intera mandata dal pannello si rilegge con testo e allegati', () => {
  const eml = ['From: Selea <acquisti@selea.it>', 'Subject: Ordine 260', 'Message-ID: <abc@selea.it>',
    'Content-Type: multipart/mixed; boundary="X"', '', '--X', 'Content-Type: text/plain; charset=utf-8', '', 'Vi ordiniamo 1.050 pezzi.',
    '--X', 'Content-Type: application/pdf; name="ordine.pdf"', 'Content-Disposition: attachment; filename="ordine.pdf"', 'Content-Transfer-Encoding: base64', '',
    Buffer.from('%PDF-1.4 prova').toString('base64'), '--X--', ''].join('\r\n');
  const e = leggiEmail(Buffer.from(eml));
  assert.equal(e.oggetto, 'Ordine 260');
  assert.equal(e.messaggioId, '<abc@selea.it>');
  assert.equal(e.testo, 'Vi ordiniamo 1.050 pezzi.');
  assert.equal(e.allegati[0].nome, 'ordine.pdf');
});
