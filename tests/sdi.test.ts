import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  STATI_SDI, ambienteDaChiave, conNumero, firmaWebhookValida, messaggioErroreApi, numeroDiProva, numeroNellXml, numeroNonValido, passaggioChiaveReale, statoPiuAvanti, testoErrori,
} from '../src/engine/sdi.js';

test('SdI: la chiave di Invoicetronic decide prova o reale', () => {
  assert.equal(ambienteDaChiave('ik_test_abc'), 'prova');
  assert.equal(ambienteDaChiave('ik_live_abc'), 'reale');
  assert.equal(ambienteDaChiave(''), null);
  assert.equal(ambienteDaChiave(undefined), null);
});

test('SdI: firma dei webhook (HMAC-SHA256 di "t.corpo", al massimo 5 minuti)', () => {
  const corpo = '{"Id":1,"Endpoint":"update","ResourceId":5}';
  const t = 1_800_000_000;
  const v1 = createHmac('sha256', 'wh_sec_x').update(`${t}.${corpo}`).digest('hex');
  assert.ok(firmaWebhookValida(`t=${t},v1=${v1}`, corpo, 'wh_sec_x', t + 10));
  assert.ok(!firmaWebhookValida(`t=${t},v1=${v1}`, corpo, 'wh_sec_altro', t + 10));     // segreto sbagliato
  assert.ok(!firmaWebhookValida(`t=${t},v1=${v1}`, corpo + ' ', 'wh_sec_x', t + 10));     // corpo cambiato
  assert.ok(!firmaWebhookValida(`t=${t},v1=${v1}`, corpo, 'wh_sec_x', t + 301));         // troppo vecchia
  assert.ok(!firmaWebhookValida(undefined, corpo, 'wh_sec_x', t));
  assert.ok(!firmaWebhookValida('t=abc,v1=00', corpo, 'wh_sec_x', t));
});

test('SdI: stati dello SdI → stato del documento; un esito vecchio non torna indietro', () => {
  assert.equal(STATI_SDI.Consegnato.stato, 'consegnato');
  assert.equal(STATI_SDI.Scartato.stato, 'scartato');
  assert.equal(STATI_SDI.ImpossibilitaDiRecapito.stato, 'non_consegnato');   // fattura valida, nel cassetto fiscale del cliente
  assert.ok(statoPiuAvanti('caricato', 'Inviato'));
  assert.ok(statoPiuAvanti('Inviato', 'Consegnato'));
  assert.ok(!statoPiuAvanti('Consegnato', 'Inviato'));
  assert.ok(statoPiuAvanti('ImpossibilitaDiRecapito', 'Consegnato'));
});

test('SdI: errori di Invoicetronic e dello SdI in italiano leggibile', () => {
  assert.equal(testoErrori([{ code: '00305', description: 'IdFiscaleIVA non valido', hint: 'controlla la P.IVA' }]),
    '[00305] IdFiscaleIVA non valido (controlla la P.IVA)');
  assert.equal(testoErrori(null), '');
  assert.match(messaggioErroreApi(401, { title: 'Unauthorized' }), /Chiave di Invoicetronic non valida/);
  assert.match(messaggioErroreApi(422, { title: 'Unprocessable', errors: { payload: ['Numero mancante'] } }), /payload: Numero mancante/);
  // errori della validazione SdI come elenco, e risposta senza dettagli mostrata com'è (prova del 2/11/2026: solo "Bad Request")
  assert.match(messaggioErroreApi(400, { title: 'Bad Request', errors: [{ code: '00305', description: 'IdFiscaleIVA non valido', hint: 'controlla la P.IVA' }] }), /00305 – IdFiscaleIVA non valido – controlla la P.IVA/);
  assert.match(messaggioErroreApi(400, { title: 'Bad Request', status: 400, motivo: 'company non trovata' }), /company non trovata/);
  assert.equal(messaggioErroreApi(400, { title: 'Bad Request', status: 400 }), 'Bad Request');
  assert.match(messaggioErroreApi(400, { detail: 'A file with the same name already exists.' }), /same name/);
});

// Adriano 4/11/2026: la prova da bozza era scartata come "Fattura duplicata numero 0" [00404]
const xmlConNumero = (n: string) => `<FatturaElettronica><CedentePrestatore><NumeroREA>190591</NumeroREA></CedentePrestatore><FatturaElettronicaBody><DatiGenerali>`
  + `<DatiGeneraliDocumento><TipoDocumento>TD01</TipoDocumento><Data>2026-11-02</Data><Numero>${n}</Numero></DatiGeneraliDocumento>`
  + `<DatiDDT><NumeroDDT>219</NumeroDDT></DatiDDT></DatiGenerali></FatturaElettronicaBody></FatturaElettronica>`;

test('SdI: numero vuoto o 0 non parte, il numero vero sì', () => {
  for (const n of [null, '', '0', '00', '0/AF']) assert.equal(numeroNonValido(n), true, String(n));
  for (const n of ['127', '93/AF', '10', 'PROVA-12-1']) assert.equal(numeroNonValido(n), false, n);
});

test('SdI: la prova da bozza ha un numero riconoscibile e diverso a ogni invio', () => {
  assert.equal(numeroDiProva(57, 1), 'PROVA-57-1');
  assert.notEqual(numeroDiProva(57, 2), numeroDiProva(57, 1));
  assert.ok(numeroDiProva(123456789, 999).length <= 20);
});

test('SdI: il numero di prova cambia solo in DatiGeneraliDocumento', () => {
  const x = conNumero(xmlConNumero('0'), 'PROVA-57-1');
  assert.equal(numeroNellXml(x), 'PROVA-57-1');
  assert.ok(x.includes('<NumeroDDT>219</NumeroDDT>') && x.includes('<NumeroREA>190591</NumeroREA>'));
  assert.equal(numeroNellXml(xmlConNumero('0')), '0');
  assert.throws(() => conNumero('<a/>', '1'));
});

test('SdI: passaggio alla chiave reale, passi fatti e da fare', () => {
  const prova = passaggioChiaveReale({ ambiente: 'prova', webhookCollegato: true });
  assert.equal(prova.length, 4);
  assert.deepEqual(prova.map(p => p.fatto), [true, false, false, false]);   // con la chiave di prova il webhook collegato non conta
  const reale = passaggioChiaveReale({ ambiente: 'reale', webhookCollegato: false });
  assert.deepEqual(reale.map(p => p.fatto), [true, true, false, false]);
  const tutto = passaggioChiaveReale({ ambiente: 'reale', webhookCollegato: true });
  assert.deepEqual(tutto.map(p => p.fatto), [true, true, true, false]);
  assert.ok(reale[1].testo.includes('INVOICETRONIC_API_KEY') && reale[1].testo.includes('ik_live_'));
});
