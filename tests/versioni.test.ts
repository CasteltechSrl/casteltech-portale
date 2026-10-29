import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileDellaVersione, richiesteDaEmail, richiesteDaTesto, versioneDa, versioniDaDividere } from '../src/engine/scheda/versioni.js';
import { unisciBomDivise } from '../src/engine/scheda/bom-divise.js';
import { leggiBomScheda } from '../src/engine/scheda/analisi.js';

const MAIL_M0929 = `Buongiorno Adriano,

come anticipato per le brevi, con la presente si richiede la Vs. quotazione
per la produzione delle seguenti schede:

*         167pz    M0929-C versione HELIOS

*          90pz    M0929-C Versione CRONOS

di cui alleghiamo la relativa documentazione.`;

test('versioni: quantità e versioni lette dalla mail (RFQ M0929-C)', () => {
  const r = richiesteDaTesto(MAIL_M0929);
  assert.deepEqual(r, [
    { quantita: 167, descrizione: 'M0929-C versione HELIOS', versione: 'HELIOS' },
    { quantita: 90, descrizione: 'M0929-C Versione CRONOS', versione: 'CRONOS' },
  ]);
  assert.equal(versioniDaDividere(r).length, 2);
  assert.deepEqual(richiesteDaTesto('n. 1.000 schede EA1002-0\nEA1001 x 50 pz'), [
    { quantita: 1000, descrizione: 'EA1002-0', versione: null }, { quantita: 50, descrizione: 'EA1001', versione: null }]);
  assert.deepEqual(richiesteDaTesto('Grazie, cordiali saluti.\nTel. 0372 471806'), []);
  assert.deepEqual(versioniDaDividere(richiesteDaTesto('500 pz EA1002')), []);   // una sola: niente da dividere
  assert.equal(versioneDa('scheda VT106 variante B'), 'B');
});

test('versioni: file comuni a tutte, file con il nome della versione solo alla sua', () => {
  const tutte = ['HELIOS', 'CRONOS'];
  assert.equal(fileDellaVersione('BOM_HELIOS_V2.0.csv', 'HELIOS', tutte), true);
  assert.equal(fileDellaVersione('BOM_CRONOS3_V2.0 PTH.csv', 'HELIOS', tutte), false);
  assert.equal(fileDellaVersione('BOM_CRONOS3_V2.0 PTH.csv', 'CRONOS', tutte), true);
  assert.equal(fileDellaVersione('lamine M0929 RevC.zip', 'CRONOS', tutte), true);
  assert.equal(fileDellaVersione('gerber/M0929-C.GTL', 'HELIOS', tutte), true);
});

test('BOM divisa in due file (SMD e PTH): si uniscono; la BOM di un\'altra versione no', () => {
  const righe = (t: string) => leggiBomScheda(t.trim().split('\n').map(r => r.match(/("[^"]*"|[^,]+)/g)!.map(c => c.replace(/"/g, '')))).righe;
  const smd = { nome: 'BOM_HELIOS.csv', righe: righe('Designator,Comment,Footprint,Quantity\n"R1,R2",10K,0603,2\nC1,100nF,0603,1') };
  const pth = { nome: 'BOM_HELIOS_PTH.csv', righe: righe('Designator,Comment,Footprint,Quantity\nJ1,CONN,THT,1\nJ2,CONN,THT,1') };
  const cronos = { nome: 'BOM_CRONOS.csv', righe: righe('Designator,Comment,Footprint,Quantity\n"R1,R2",22K,0603,2\nC1,100nF,0603,1') };
  assert.equal(smd.righe.length, 2);
  const u = unisciBomDivise([smd, pth, cronos]);
  assert.deepEqual(u.unite.map(b => b.nome), ['BOM_HELIOS.csv', 'BOM_HELIOS_PTH.csv']);
  assert.deepEqual(u.scartate.map(b => b.nome), ['BOM_CRONOS.csv']);
  assert.deepEqual(u.unite.flatMap(b => b.righe.flatMap(r => r.designatori)), ['R1', 'R2', 'C1', 'J1', 'J2']);
});

test('quantità scritta solo nell\'oggetto della mail (Adriano 29/10/2026: «Ordine 5 PCB MULTI»)', () => {
  const r = richiesteDaEmail({ oggetto: 'R: Ordine 5 PCB MULTI', testo: 'Buongiorno,\nin allegato i file aggiornati.\nSaluti' });
  assert.deepEqual(r.map(x => x.quantita), [5]);
  // il testo vince sull'oggetto
  assert.deepEqual(richiesteDaEmail({ oggetto: 'Ordine 5 PCB', testo: '167pz M0929-C versione HELIOS' }).map(x => x.quantita), [167]);
  assert.deepEqual(richiesteDaEmail({ oggetto: 'Richiesta offerta', testo: '' }), []);
});

test('mail salvata come .eml nella cartella: quantità e versioni dal suo testo (Adriano 29/10/2026)', async () => {
  const { leggiEmail } = await import('../src/engine/acquisizioni.js');
  const eml = 'From: Marco <m@cliente.it>\r\nSubject: RFQ_26225 *** Documentazione per scheda M0929-C\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset="utf-8"\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n'
    + 'Buongiorno,\r\n=E2=80=A2         167pz      M0929-C versione HELIOS\r\n=E2=80=A2         90pz       M0929-C Versione CRONOS\r\n';
  const e = leggiEmail(Buffer.from(eml, 'latin1'));
  assert.deepEqual(versioniDaDividere(richiesteDaEmail(e)).map(v => `${v.versione} ${v.quantita}`), ['HELIOS 167', 'CRONOS 90']);
});
