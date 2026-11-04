import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bloccoInvioCortesia, destinatarioFattura, emailFattura, nomeDocumento, nomeFilePdfFattura } from '../src/engine/fattura-email.js';
import { pdfFattura } from '../src/server/pdf-fattura.js';

test('fattura di cortesia per email: si manda solo emessa dal portale, non annullata né scartata (Adriano 4/11/2026)', () => {
  assert.equal(bloccoInvioCortesia({ tipo: 'fattura', numero: 127, stato: 'emesso', origine: 'portale' }), null);
  assert.equal(bloccoInvioCortesia({ tipo: 'nota_credito', numero: 5, stato: 'consegnato', origine: 'portale' }), null);
  assert.match(bloccoInvioCortesia({ tipo: 'fattura', numero: null, stato: 'bozza', origine: 'portale' })!, /bozza/);
  assert.match(bloccoInvioCortesia({ tipo: 'fattura', numero: 3, stato: 'scartato', origine: 'portale' })!, /scartato/);
  assert.match(bloccoInvioCortesia({ tipo: 'fattura', numero: 90, stato: 'consegnato', origine: 'fic' })!, /Fatture in Cloud/);
  assert.match(bloccoInvioCortesia({ tipo: 'autofattura', numero: 9, stato: 'emesso', origine: 'portale' })!, /solo fatture/);
});

test('fattura di cortesia: indirizzo proposto = email per fatture e DDT, poi ultima fattura mandata, poi CRM; mai la PEC', () => {
  assert.equal(destinatarioFattura({ amministrazione: 'amm@cliente.it, cont@cliente.it', ultimaFattura: 'x@cliente.it', crm: 'info@cliente.it' }), 'amm@cliente.it, cont@cliente.it');
  assert.equal(destinatarioFattura({ amministrazione: null, ultimaFattura: 'x@cliente.it', crm: 'info@cliente.it' }), 'x@cliente.it');
  assert.equal(destinatarioFattura({ crm: 'info@cliente.it' }), 'info@cliente.it');
  assert.equal(destinatarioFattura({}), '');
});

test('fattura di cortesia: oggetto, testo con scadenze e IBAN, nome del file', () => {
  const e = emailFattura({ tipo: 'fattura', numero: 127, data: '2026-11-05', azienda: 'CASTELTECH S.R.L.', totale: 1220,
    scadenze: [{ data: '2026-12-31', importo: 1220 }], iban: 'IT00X0000000000000000000000' });
  assert.equal(e.oggetto, 'Fattura n. 127 del 05/11/2026 - CASTELTECH S.R.L.');
  assert.match(e.testo, /copia di cortesia della nostra fattura n\. 127 del 05\/11\/2026, totale 1\.220,00 €/);
  assert.match(e.testo, /Scadenza: 31\/12\/2026 1\.220,00 €/);
  assert.match(e.testo, /IBAN per il bonifico: IT00X/);
  assert.match(e.testo, /XML trasmesso al Sistema di Interscambio/);
  const nc = emailFattura({ tipo: 'nota_credito', numero: 5, data: '2026-11-05', azienda: 'CASTELTECH S.R.L.', totale: 100, scadenze: [{ data: '2026-12-31', importo: 100 }], iban: 'IT00' });
  assert.equal(nc.oggetto, 'Nota di credito n. 5 del 05/11/2026 - CASTELTECH S.R.L.');
  assert.doesNotMatch(nc.testo, /IBAN|Scadenz/);
  assert.equal(nomeDocumento('fattura', 'TD05'), 'nota di debito');
  assert.equal(nomeFilePdfFattura('fattura', 'TD01', 127, 2026, 'ROBUR S.P.A.'), 'Fattura_127_2026_ROBUR_S_P_A.pdf');
  assert.equal(nomeFilePdfFattura('nota_credito', null, '5/NC', 2026, ''), 'Nota_di_credito_5_NC_2026.pdf');
});

test('PDF di cortesia della fattura: si crea anche con righe lunghe, lettera d\'intento e split payment', async () => {
  const pdf = await pdfFattura({
    d: { tipo: 'fattura', tipo_sdi: 'TD01', numero: 127, data: '2026-11-05', stato: 'emesso', esigibilita_iva: 'S' },
    righe: [{ codice: 'EA1002', descrizione: 'SCHEDA CONTROLLO CALDAIA '.repeat(8), um: 'pz', quantita: 50, prezzo: 12.5, sconto: 0, aliquota_iva: 'IVA22' },
      { solo_descrizione: true, descrizione: 'DDT n. 219 del 04/11/2026' }],
    azienda: { ragione_sociale: 'CASTELTECH S.R.L.', iban: 'IT00X', banca: 'BPER' },
    cliente: { ragione_sociale: 'INFN', partita_iva: '01234567890', split_payment: true, codice_sdi: 'ABC123' },
    totali: { riepilogo: [{ aliquota: 'IVA22', percentuale: 22, natura: null, riferimento_normativo: null, imponibile: 625, imposta: 137.5 }],
      imponibile: 625, imposta: 137.5, bollo: 0, totale: 762.5, errori: [] },
    scadenze: [{ data: '2026-12-31', importo: 625 }], intento: { protocollo: '123-1', data_protocollo: '2026-01-10' }, pagamento: { descrizione: 'Bonifico 30 gg f.m.', modalita: 'MP05' },
  });
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
});
