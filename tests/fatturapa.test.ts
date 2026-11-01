import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decimaleXml, generaFatturaXml, progressivoInvio, testoXml } from '../src/engine/fatturapa.js';
import { ALIQUOTE, AZIENDA, CLIENTE_IT, CLIENTE_PEC, CLIENTE_UE, FATTURA, FATTURA_RATE, NOTA_UE } from '../tools/fatturapa/esempi.js';

const tag = (xml: string, nome: string) => [...xml.matchAll(new RegExp(`<${nome}>([^<]*)</${nome}>`, 'g'))].map(m => m[1]);

test('FatturaPA: testi con i soli caratteri ammessi dallo SdI e numeri nel formato giusto', () => {
  assert.equal(testoXml('Lotto “A” – 10 € & <B>'), 'Lotto &quot;A&quot; - 10 EUR &amp; &lt;B&gt;');
  assert.equal(testoXml('Città   d\'Arda'), 'Città d&apos;Arda');
  assert.equal(testoXml('Ω emoji 😀 ok'), 'emoji ok');
  assert.equal(testoXml('abcdef', 3), 'abc');
  assert.equal(decimaleXml(2.1), '2.10');
  assert.equal(decimaleXml(0.00502), '0.00502');
  assert.equal(decimaleXml(204), '204.00');
  assert.equal(progressivoInvio(1234), '000YA');
});

test('FatturaPA: fattura con DDT, sconto, lettera d\'intento e bollo', () => {
  const { xml, errori, totali, nomeFile } = generaFatturaXml(FATTURA, CLIENTE_IT, AZIENDA, ALIQUOTE);
  assert.deepEqual(errori, []);
  assert.equal(nomeFile, 'IT01777320332_000YA.xml');
  // 40 + 8,80 IVA + 406,98 non imponibile (204 × 2,10 − 5%) + 2 € di bollo
  assert.equal(totali.totale, 457.78);
  assert.deepEqual(tag(xml, 'ImportoTotaleDocumento'), ['457.78']);
  assert.deepEqual(tag(xml, 'ImportoBollo'), ['2.00']);
  assert.deepEqual(tag(xml, 'CodiceDestinatario'), ['ABC1234']);
  // cita un DDT del mese prima: fattura differita (TD24)
  assert.deepEqual(tag(xml, 'TipoDocumento'), ['TD24']);
  // la riga di testo "DDT n. 195" non si ripete: diventa DatiDDT con la riga che viene da quel DDT
  assert.deepEqual(tag(xml, 'NumeroLinea'), ['1', '2', '3']);
  assert.match(xml, /<DatiDDT><NumeroDDT>195<\/NumeroDDT><DataDDT>2026-10-05<\/DataDDT><RiferimentoNumeroLinea>1<\/RiferimentoNumeroLinea><\/DatiDDT>/);
  assert.match(xml, /<AltriDatiGestionali><TipoDato>INTENTO<\/TipoDato><RiferimentoTesto>26021609544759358-000006<\/RiferimentoTesto><RiferimentoData>2026-02-16<\/RiferimentoData>/);
  assert.deepEqual(tag(xml, 'Natura'), ['N3.5', 'N3.5']);   // riga + riepilogo
  assert.deepEqual(tag(xml, 'IBAN'), ['IT37B0538765310000003092938']);
  assert.deepEqual(tag(xml, 'IdDocumento'), ['ORD 4924']);
  assert.deepEqual(tag(xml, 'Causale'), ['Lavorazione schede - lotto &quot;A&quot; &amp; B EUR']);
});

test('FatturaPA: nota di credito UE, cliente con PEC, rate RiBa', () => {
  const nc = generaFatturaXml(NOTA_UE, CLIENTE_UE, AZIENDA, ALIQUOTE);
  assert.deepEqual(nc.errori, []);
  assert.deepEqual(tag(nc.xml, 'TipoDocumento'), ['TD04']);
  assert.deepEqual(tag(nc.xml, 'CodiceDestinatario'), ['XXXXXXX']);
  assert.match(nc.xml, /<IdFiscaleIVA><IdPaese>FR<\/IdPaese><IdCodice>12345678901<\/IdCodice><\/IdFiscaleIVA>/);
  assert.match(nc.xml, /<CAP>00000<\/CAP><Comune>Dijon<\/Comune><Nazione>FR<\/Nazione>/);
  assert.match(nc.xml, /<DatiFattureCollegate><IdDocumento>1<\/IdDocumento><Data>2025-01-21<\/Data><\/DatiFattureCollegate>/);
  assert.deepEqual(tag(nc.xml, 'PrezzoUnitario'), ['50.125']);
  const rate = generaFatturaXml(FATTURA_RATE, CLIENTE_PEC, AZIENDA, ALIQUOTE);
  assert.deepEqual(rate.errori, []);
  assert.deepEqual(tag(rate.xml, 'CodiceDestinatario'), ['0000000']);
  assert.deepEqual(tag(rate.xml, 'PECDestinatario'), ['amministrazione@pec.prova.it']);
  assert.deepEqual(tag(rate.xml, 'CondizioniPagamento'), ['TP01']);
  assert.deepEqual(tag(rate.xml, 'ModalitaPagamento'), ['MP12', 'MP12']);
  assert.deepEqual(tag(rate.xml, 'IBAN'), []);   // RiBa: niente IBAN di Casteltech
});

test('FatturaPA: errori che lo SdI scarterebbe', () => {
  const senzaLettera = generaFatturaXml({ ...FATTURA, intento: null }, CLIENTE_IT, AZIENDA, ALIQUOTE);
  assert.match(senzaLettera.errori.join(), /lettera d'intento/);
  assert.match(generaFatturaXml({ ...NOTA_UE, origine: null }, CLIENTE_UE, AZIENDA, ALIQUOTE).errori.join(), /fattura che corregge/);
  assert.match(generaFatturaXml({ ...FATTURA_RATE, numero: null }, CLIENTE_IT, AZIENDA, ALIQUOTE).errori.join(), /numero/);
  assert.match(generaFatturaXml({ ...FATTURA_RATE, scadenze: [{ data: '2026-12-31', importo: 700, modalita: 'MP12' }] }, CLIENTE_IT, AZIENDA, ALIQUOTE).errori.join(),
    /non tornano con il totale \(744\.20\)/);
  const cliente = generaFatturaXml(FATTURA_RATE, { ragione_sociale: 'X', nazione: 'IT', codice_sdi: '12' }, AZIENDA, ALIQUOTE).errori.join(' | ');
  assert.match(cliente, /indirizzo o comune/);
  assert.match(cliente, /CAP/);
  assert.match(cliente, /partita IVA o codice fiscale/);
  assert.match(cliente, /codice destinatario "12"/);
  assert.match(generaFatturaXml(FATTURA_RATE, CLIENTE_IT, { ...AZIENDA, partita_iva: '' }, ALIQUOTE).errori.join(), /Dati dell'azienda/);
  assert.match(generaFatturaXml({ ...FATTURA_RATE, righe: [{ descrizione: 'solo testo', quantita: 1, prezzo: 0, solo_descrizione: true }], scadenze: [] },
    CLIENTE_IT, AZIENDA, ALIQUOTE).errori.join(), /righe con un importo/);
});

test('fattura: riferimento ordine oltre 20 caratteri = errore chiaro (non un taglio); capitale sociale e telefono scritti in modi diversi', () => {
  const lungo = generaFatturaXml({ ...FATTURA, riferimento_esterno: 'ORDINE-2026-0001234567890' }, CLIENTE_IT, AZIENDA, ALIQUOTE);
  assert.ok(lungo.errori.some(e => /20 caratteri/.test(e)), lungo.errori.join(' | '));
  const az = { ...AZIENDA, rea_ufficio: 'PC', rea_numero: '190591', capitale_sociale: '10000.00', telefono: '+39 0523 190 24 64' };
  const { xml, errori } = generaFatturaXml(FATTURA, CLIENTE_IT, az, ALIQUOTE);
  assert.deepEqual(errori, []);
  assert.match(xml, /<CapitaleSociale>10000\.00<\/CapitaleSociale>/);
  assert.match(xml, /<Telefono>05231902464<\/Telefono>/);   // senza spazi; il +39 si toglie perché non ci starebbe nei 12 caratteri
  const az2 = { ...az, capitale_sociale: '10.000,00' };
  assert.match(generaFatturaXml(FATTURA, CLIENTE_IT, az2, ALIQUOTE).xml, /<CapitaleSociale>10000\.00<\/CapitaleSociale>/);
});
