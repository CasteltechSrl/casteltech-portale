import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { STATI_SDI, ambienteDaChiave, firmaWebhookValida, messaggioErroreApi, statoPiuAvanti, testoErrori } from '../src/engine/sdi.js';

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
