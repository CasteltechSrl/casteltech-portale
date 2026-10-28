import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import {
  controlliEmissione, elencoIndirizzi, indirizzoEmail, messaggioEmail, nomeFilePdf, oggettoRisposta, righeConfermaDaModulo, righeConfermaDaOrdine,
  testoEmailConferma, totaleConferma,
} from '../src/engine/conferme-ordine.js';
import { leggiEmail } from '../src/engine/acquisizioni.js';
import { pdfConfermaOrdine } from '../src/server/pdf-conferma-ordine.js';

const riga = (x: Partial<Parameters<typeof righeConfermaDaOrdine>[0][number]>) =>
  ({ id: 1, codice: 'EA1002-0', descrizione: 'SCHEDA', codiceCliente: null, quantita: 100, prezzo: 10, consegnaRichiesta: '2026-11-20', ...x });

test("conferma d'ordine: tutte le righe dell'ordine con la data di consegna richiesta, annullate escluse (Adriano 28/10/2026)", () => {
  const r = righeConfermaDaOrdine([
    riga({}),
    riga({ id: 2, codice: 'PROG', descrizione: 'PROGRAMMAZIONE', quantita: 1, prezzo: 300, consegnaRichiesta: null, consegnaPrevista: '2026-11-15' }),
    riga({ id: 3, statoManuale: 'annullato' }),
  ]);
  assert.equal(r.length, 2);
  assert.deepEqual(r.map(x => [x.posizione, x.codice, x.quantita, x.prezzo, x.consegna, x.riga_ordine_id]),
    [[1, 'EA1002-0', 100, 10, '2026-11-20', 1], [2, 'PROG', 1, 300, '2026-11-15', 2]]);
});

test("conferma d'ordine: consegne a programma = una riga per consegna; codice del cliente nella descrizione", () => {
  const r = righeConfermaDaOrdine([riga({ codiceCliente: 'CL-77', quantita: 1200, consegne: [{ data: '2027-01-15', quantita: 400 }, { data: '2026-12-15', quantita: 800 }] })]);
  assert.deepEqual(r.map(x => [x.quantita, x.consegna]), [[800, '2026-12-15'], [400, '2027-01-15']]);
  assert.equal(r[0].descrizione, 'SCHEDA - VS. COD. CL-77');
  // senza il nostro codice si usa quello del cliente
  assert.equal(righeConfermaDaOrdine([riga({ codice: null, codiceCliente: 'CL-77' })])[0].codice, 'CL-77');
});

test("conferma d'ordine: righe modificabili dal modulo, numeri all'italiana, togli, errori", () => {
  const { righe, errori } = righeConfermaDaModulo({
    0: { codice: 'ea1002-0', descrizione: 'scheda  controllo', quantita: '1.200', prezzo: '7,25', consegna: '2026-12-15', riga_ordine_id: '5' },
    1: { codice: 'X', descrizione: 'DA TOGLIERE', quantita: '1', prezzo: '1', togli: 'on' },
    2: { codice: '', descrizione: '', quantita: '', prezzo: '' },
    3: { descrizione: 'SENZA DATA', quantita: '2', prezzo: '0', consegna: '' },
  });
  assert.deepEqual(errori, []);
  assert.deepEqual(righe.map(r => [r.posizione, r.codice, r.descrizione, r.quantita, r.prezzo, r.consegna, r.riga_ordine_id]),
    [[1, 'EA1002-0', 'SCHEDA CONTROLLO', 1200, 7.25, '2026-12-15', 5], [2, null, 'SENZA DATA', 2, 0, null, null]]);
  assert.equal(totaleConferma(righe), 8700);
  // per emettere serve la data di consegna su ogni riga
  assert.deepEqual(controlliEmissione(righe), ['Riga 2 (SENZA DATA): manca la data di consegna.']);
  const sbagliate = righeConfermaDaModulo([{ descrizione: 'A', quantita: '0', prezzo: 'abc', consegna: '31/02' }]).errori;
  assert.equal(sbagliate.length, 3);
  assert.deepEqual(righeConfermaDaModulo([]).errori, ['Serve almeno una riga.']);
});

test("conferma d'ordine: indirizzi email, oggetto della risposta, testo e nome del PDF", () => {
  assert.equal(indirizzoEmail('Mario Rossi <Mario.Rossi@Ditta.it>'), 'mario.rossi@ditta.it');
  assert.equal(indirizzoEmail('acquisti@ditta.it'), 'acquisti@ditta.it');
  assert.equal(indirizzoEmail('Mario Rossi'), '');
  assert.deepEqual(elencoIndirizzi('a@b.it; Uff <c@d.com>, a@b.it, sbagliato'), { indirizzi: ['a@b.it', 'c@d.com'], errati: ['sbagliato'] });
  assert.equal(oggettoRisposta('Ordine 26-366', '12/2026'), 'Re: Ordine 26-366');
  assert.equal(oggettoRisposta('RE: Ordine 26-366', '12/2026'), 'RE: Ordine 26-366');
  assert.equal(oggettoRisposta('', '12/2026', '26-366'), "Conferma d'ordine n. 12/2026 - vostro ordine 26-366");
  const testo = testoEmailConferma({ numero: '12/2026', data: '2026-10-28', rifCliente: '26-366', dataRif: '2026-10-27', azienda: 'CASTELTECH S.R.L.' });
  assert.match(testo, /conferma d'ordine n\. 12\/2026 del 28\/10\/2026 relativa al vostro ordine n\. 26-366 del 27\/10\/2026/);
  assert.equal(nomeFilePdf(12, 2026, 'ELETTRONICA SERVIZI JOX S.R.L.'), 'Conferma_ordine_12_2026_ELETTRONICA_SERVIZI_JOX_S_R_L.pdf');
  assert.equal(nomeFilePdf(null, 2026, ''), 'Conferma_ordine_bozza_2026.pdf');
});

test("conferma d'ordine: risposta nella stessa conversazione dell'email d'ordine (Message-ID → In-Reply-To)", () => {
  const eml = ['From: Ufficio Acquisti <acquisti@cliente.it>', 'Reply-To: ordini@cliente.it', 'Subject: =?utf-8?Q?Ordine_n=C2=B0_26-366?=',
    'Message-ID: <abc123@cliente.it>', 'References: <prima@cliente.it>', 'Content-Type: text/plain; charset=utf-8', '', 'Vi ordiniamo...'].join('\r\n');
  const e = leggiEmail(eml);
  assert.equal(e.messaggioId, '<abc123@cliente.it>');
  assert.equal(e.riferimenti, '<prima@cliente.it>');
  assert.equal(e.rispondiA, 'ordini@cliente.it');
  assert.equal(e.oggetto, 'Ordine n° 26-366');
  const m = messaggioEmail({ da: '"CASTELTECH S.R.L." <info@casteltech.net>', a: ['ordini@cliente.it'], oggetto: oggettoRisposta(e.oggetto, '12/2026'),
    testo: 'Buongiorno,\nin allegato.', allegato: { nome: 'c.pdf', mime: 'application/pdf', dati: Buffer.from('%PDF-1.7') },
    inRispostaA: e.messaggioId, riferimenti: e.riferimenti, confine: 'XX' });
  assert.match(m, /^From: "CASTELTECH S\.R\.L\." <info@casteltech\.net>\r\nTo: ordini@cliente\.it\r\n/);
  assert.match(m, /\r\nSubject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=\r\n/);   // "Re: Ordine n° 26-366" codificato
  assert.match(m, /\r\nIn-Reply-To: <abc123@cliente\.it>\r\nReferences: <prima@cliente\.it> <abc123@cliente\.it>\r\n/);
  assert.match(m, /Content-Disposition: attachment; filename="c\.pdf"\r\n\r\nJVBERi0xLjc=\r\n/);
  assert.match(m, /--XX--\r\n$/);
  // senza email d'origine: niente intestazioni di risposta
  assert.doesNotMatch(messaggioEmail({ da: 'a@b.it', a: ['c@d.it'], oggetto: 'x', testo: 'y' }), /In-Reply-To/);
});

test("conferma d'ordine: il PDF si crea (anche su più pagine e con caratteri che i font non hanno)", async () => {
  const righe = righeConfermaDaOrdine(Array.from({ length: 40 }, (_, i) => riga({ id: i + 1, descrizione: `SCHEDA ${i} CON RESISTENZA DA 10 Ω E DESCRIZIONE MOLTO LUNGA CHE VA A CAPO` })));
  const pdf = await pdfConfermaOrdine({ numero: 12, anno: 2026, data: '2026-10-28',
    azienda: { nome: 'CASTELTECH S.R.L.', indirizzo: 'STRADA FIORENZUOLA, 8', piva: '01777320332', rea: 'PC-190591', tel: '0523 190 24 64', email: 'info@casteltech.net', pec: 'casteltech@pec.it' },
    cliente: { ragione_sociale: 'CLIENTE DI PROVA S.R.L.', partita_iva: '01234567890' }, rifCliente: '26-366', dataRif: '2026-10-27', pagamento: null, note: 'Prova', righe });
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  const letto = await PDFDocument.load(pdf);
  assert.ok(letto.getPageCount() >= 2);
  assert.equal(letto.getTitle(), "Conferma d'ordine 12/2026");
});
