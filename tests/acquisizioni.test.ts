import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dataDa, leggiEmail, normalizzaProposta, numeroDa, numeroOrdineEmail, oggettoJson, tipoFile } from '../src/engine/acquisizioni.js';

test('acquisizioni: tipo del file dal nome', () => {
  assert.equal(tipoFile('export_ordini_25-10-2026_22-51-19.xls'), 'export_ordini');
  assert.equal(tipoFile('export_ddt_2026.csv'), 'export_ddt');
  assert.equal(tipoFile('Export Fatture ottobre.xls'), 'export_fatture');
  assert.equal(tipoFile('Ordine 653 del 04_09_2026.PDF'), 'ordine');
  assert.equal(tipoFile('ordine scritto.txt'), 'ordine');
  assert.equal(tipoFile('Re_ ordine schede.eml'), 'email');
  assert.equal(tipoFile('foto.heic'), 'altro');
});

test('acquisizioni: numeri e date scritti in modi diversi', () => {
  assert.equal(numeroDa('1.234,50'), 1234.5);
  assert.equal(numeroDa('1,234.50'), 1234.5);
  assert.equal(numeroDa('12,5 €'), 12.5);
  assert.equal(numeroDa('2.460'), 2460);
  assert.equal(numeroDa(''), null);
  assert.equal(dataDa('30/11/2026'), '2026-11-30');
  assert.equal(dataDa('4.9.26'), '2026-09-04');
  assert.equal(dataDa('2026-11-30T00:00:00'), '2026-11-30');
  assert.equal(dataDa('al pronto'), null);
});

test('acquisizioni: proposta dell\'IA pulita (maiuscolo, numeri, righe vuote tolte)', () => {
  const p = normalizzaProposta({ e_ordine: true, cliente: 'Selea srl', rif_cliente: '260', data_ordine: '11/09/2026', note: 'consegna parziale',
    righe: [{ codice: 'wpaflatraspx6', descrizione: 'Flat rasp', quantita: '1.050', prezzo: '0,75', consegna: '30/09/2026' }, { codice: '', descrizione: '' }] });
  assert.deepEqual(p, { eOrdine: true, cliente: 'SELEA SRL', rifCliente: '260', dataOrdine: '2026-09-11', note: 'consegna parziale',
    righe: [{ codice: 'WPAFLATRASPX6', descrizione: 'FLAT RASP', quantita: 1050, prezzo: 0.75, consegna: '2026-09-30' }] });
  assert.equal(normalizzaProposta({ e_ordine: false }).eOrdine, false);
});

test('acquisizioni: email salvata (.eml) con testo e PDF allegato', () => {
  const pdf = Buffer.from('%PDF-1.4 prova');
  const eml = [
    'From: Ufficio Acquisti <acquisti@cliente.it>', 'Subject: =?utf-8?B?T3JkaW5lIG4uIDY1Mw==?=', 'Date: Fri, 4 Sep 2026 10:00:00 +0200',
    'Content-Type: multipart/mixed; boundary="XYZ"', '', '--XYZ',
    'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: quoted-printable', '',
    'Vi ordiniamo 100 pz SCH=C3=88DA 1004 a 41,67 =E2=82=AC', '--XYZ',
    'Content-Type: application/pdf; name="ordine 653.pdf"', 'Content-Disposition: attachment; filename="ordine 653.pdf"',
    'Content-Transfer-Encoding: base64', '', pdf.toString('base64'), '--XYZ--', ''].join('\r\n');
  const e = leggiEmail(eml);
  assert.equal(e.oggetto, 'Ordine n. 653');
  assert.equal(e.mittente, 'Ufficio Acquisti <acquisti@cliente.it>');
  assert.equal(e.testo, 'Vi ordiniamo 100 pz SCHÈDA 1004 a 41,67 €');
  assert.equal(e.allegati.length, 1);
  assert.equal(e.allegati[0].nome, 'ordine 653.pdf');
  assert.equal(e.allegati[0].mime, 'application/pdf');
  assert.deepEqual(e.allegati[0].dati, pdf);
});

test('acquisizioni: risposta JSON dell\'IA con testo intorno, numerazione degli ordini da email dal 9001', () => {
  assert.deepEqual(oggettoJson('Ecco:\n```json\n{"e_ordine": true, "righe": []}\n```'), { e_ordine: true, righe: [] });
  assert.equal(oggettoJson('nessun ordine'), null);
  assert.equal(numeroOrdineEmail(null), 9001);
  assert.equal(numeroOrdineEmail(120), 9001);       // il massimo degli ordini FIC non conta
  assert.equal(numeroOrdineEmail(9003), 9004);
});

test('acquisizioni: righe di servizio riconosciute dalla descrizione', async () => {
  const { tipoRigaDa } = await import('../src/engine/acquisizioni.js');
  assert.equal(tipoRigaDa('COSTO ATTREZZAGGIO'), 'servizio');
  assert.equal(tipoRigaDa('Lamina serigrafica'), 'servizio');
  assert.equal(tipoRigaDa('SCHEDA CONTROLLO 1004 REV.B'), 'scheda');
});

test('acquisizioni: cartella Drive (orario lun–ven 8–20, link della cartella, file leggibili)', async () => {
  const { orarioDrive, idCartellaDa, fileDaAcquisire } = await import('../src/engine/acquisizioni.js');
  assert.equal(orarioDrive({ feriale: true, minuti: 8 * 60 }), true);
  assert.equal(orarioDrive({ feriale: true, minuti: 20 * 60 + 15 }), false);
  assert.equal(orarioDrive({ feriale: false, minuti: 10 * 60 }), false);
  assert.equal(idCartellaDa('https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp?usp=sharing'), '1AbCdEfGhIjKlMnOp');
  assert.equal(idCartellaDa('1AbCdEfGhIjKlMnOp'), '1AbCdEfGhIjKlMnOp');
  assert.equal(idCartellaDa('cartella ordini'), null);
  assert.equal(fileDaAcquisire('application/pdf'), true);
  assert.equal(fileDaAcquisire('application/vnd.google-apps.folder'), false);
});

test('acquisizioni: DDT in PDF letto e abbinato alle righe d\'ordine aperte', async () => {
  const { normalizzaDdt, abbinaDdt } = await import('../src/engine/acquisizioni.js');
  const d = normalizzaDdt({ numero: 'n. 312', data: '24/10/2026', cliente: 'R Tooling srl', rif_ordine: '26-366',
    righe: [{ codice: 'rt-100', descrizione: 'scheda', quantita: '50' }, { codice: 'RT-100', quantita: '30' }, { codice: 'X9', quantita: 2 }, { descrizione: 'imballo', quantita: 0 }] });
  assert.equal(d.numero, 312);
  assert.equal(d.data, '2026-10-24');
  assert.equal(d.righe.length, 3);
  const aperte = [
    { id: 1, codice: 'RT100', codiceCliente: null, descrizione: null, rifCliente: '26-100', residuo: 40, consegna: '2026-10-01' },
    { id: 2, codice: 'RT-100', codiceCliente: null, descrizione: null, rifCliente: '26-366', residuo: 50, consegna: '2026-11-01' },
    { id: 3, codice: 'ALTRO', codiceCliente: 'X9', descrizione: null, rifCliente: null, residuo: 2, consegna: null },
  ];
  // la prima va sull'ordine citato nel DDT (26-366); la seconda, con quella ormai piena, sull'altro ordine; X9 è il codice del cliente
  assert.deepEqual(abbinaDdt(d.righe, aperte, d.rifOrdine), [2, 1, 3]);
  assert.deepEqual(abbinaDdt([{ codice: 'NESSUNO', descrizione: '', quantita: 1 }], aperte), [null]);
});
