import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generaFatturaXml } from '../src/engine/fatturapa.js';
import {
  controlliOrdinePa, datiFiscaliDaModulo, importoDaIncassare, nomeTipoSdi, righeStornoAcconto, scadenzaF24, termineDifferita, tipoSdiEffettivo,
} from '../src/engine/tipi-fattura.js';
import { datiFattureRicevute } from '../src/engine/fattura-ricevuta.js';
import { ACCONTO, ALIQUOTE, AZIENDA, CLIENTE_IT, CLIENTE_PA, FATTURA_PA, NOTA_DEBITO, SALDO } from '../tools/fatturapa/esempi.js';

const tag = (xml: string, nome: string) => [...xml.matchAll(new RegExp(`<${nome}>([^<]*)</${nome}>`, 'g'))].map(m => m[1]);

test('Tipo di fattura: TD24 da solo se cita DDT con data precedente, TD02/TD26/TD05 scelti, TD04 nota di credito', () => {
  assert.equal(tipoSdiEffettivo('fattura', 'TD01', '2026-11-05', ['2026-10-30']), 'TD24');
  assert.equal(tipoSdiEffettivo('fattura', 'TD01', '2026-11-05', ['2026-11-05']), 'TD01');   // DDT dello stesso giorno: immediata
  assert.equal(tipoSdiEffettivo('fattura', null, '2026-11-05', []), 'TD01');
  assert.equal(tipoSdiEffettivo('fattura', 'TD24', '2026-11-05', []), 'TD01');               // DDT tolti: torna immediata
  assert.equal(tipoSdiEffettivo('fattura', 'TD02', '2026-11-05', ['2026-10-01']), 'TD02');
  assert.equal(tipoSdiEffettivo('fattura', 'TD26', '2026-11-05', []), 'TD26');
  assert.equal(tipoSdiEffettivo('nota_credito', 'TD05', '2026-11-05', []), 'TD04');
  assert.equal(termineDifferita(['2026-10-30', '2026-10-02']), '2026-11-15');
  assert.equal(termineDifferita(['2026-12-20']), '2027-01-15');
  assert.equal(nomeTipoSdi('fattura', 'TD05'), 'Nota di debito');
  assert.equal(nomeTipoSdi('fattura', 'TD01'), null);
});

test('Pubblica amministrazione: FPA12, codice ufficio di 6 caratteri, CIG e ordine, split payment', () => {
  const { xml, errori, totali, tipoSdi, daIncassare } = generaFatturaXml(FATTURA_PA, CLIENTE_PA, AZIENDA, ALIQUOTE);
  assert.deepEqual(errori, []);
  assert.equal(tipoSdi, 'TD01');
  assert.match(xml, /versione="FPA12"/);
  assert.deepEqual(tag(xml, 'FormatoTrasmissione'), ['FPA12']);
  assert.deepEqual(tag(xml, 'CodiceDestinatario'), ['E9YBYU']);
  assert.match(xml, /<DatiOrdineAcquisto><IdDocumento>4924<\/IdDocumento><Data>2025-10-23<\/Data><CodiceCIG>B8C295DE7C<\/CodiceCIG><\/DatiOrdineAcquisto>/);
  assert.deepEqual(tag(xml, 'EsigibilitaIVA'), ['S']);
  assert.equal(totali.totale, 1220);                      // il totale del documento comprende l'IVA
  assert.equal(daIncassare, 1000);                        // ma si incassa solo l'imponibile
  assert.deepEqual(tag(xml, 'ImportoPagamento'), ['1000.00']);
  assert.equal(importoDaIncassare({ totale: 1222, imposta: 220 }, true), 1002);   // con il bollo
  // senza CIG, senza ordine, codice di 7 caratteri: non si emette
  const male = generaFatturaXml({ ...FATTURA_PA, cig: null, riferimento_esterno: null, data_ordine: null }, { ...CLIENTE_PA, codice_sdi: 'ABC1234' }, AZIENDA, ALIQUOTE);
  assert.ok(male.errori.some(e => /codice univoco dell'ufficio/.test(e)));
  assert.ok(male.errori.some(e => /manca il CIG/.test(e)));
  assert.ok(male.errori.some(e => /numero dell'ordine/.test(e)));
  // scadenza del totale con IVA: non torna con lo split payment
  const scad = generaFatturaXml({ ...FATTURA_PA, scadenze: [{ data: '2026-12-10', importo: 1220, modalita: 'MP05' }] }, CLIENTE_PA, AZIENDA, ALIQUOTE);
  assert.ok(scad.errori.some(e => /split payment/.test(e)));
  assert.deepEqual(controlliOrdinePa({ cig: 'B8C29', riferimento_esterno: 'X' }), ['CIG "B8C29" non valido: sono 10 caratteri, lettere e numeri.']);
  assert.deepEqual(controlliOrdinePa({ cup: 'J12345678901234' }), ['Con CIG, CUP o data dell\'ordine serve anche il numero dell\'ordine del cliente.']);
});

test('Acconto TD02 e saldo che lo scala; nota di debito TD05 con la fattura collegata', () => {
  const a = generaFatturaXml(ACCONTO, CLIENTE_IT, AZIENDA, ALIQUOTE);
  assert.deepEqual(a.errori, []);
  assert.deepEqual(tag(a.xml, 'TipoDocumento'), ['TD02']);
  const s = generaFatturaXml(SALDO, CLIENTE_IT, AZIENDA, ALIQUOTE);
  assert.deepEqual(s.errori, []);
  assert.deepEqual(tag(s.xml, 'TipoDocumento'), ['TD01']);
  assert.equal(s.totali.imponibile, 700);
  assert.match(s.xml, /<DatiFattureCollegate><IdDocumento>120<\/IdDocumento><Data>2026-11-10<\/Data><\/DatiFattureCollegate>/);
  assert.deepEqual(righeStornoAcconto({ id: 9, numero: '120', data: '2026-11-10', riepilogo: [{ aliquota: 'IVA22', imponibile: 300 }, { aliquota: 'INTENTO', imponibile: 0 }] }),
    [{ descrizione: 'Storno acconto fattura n. 120 del 10/11/2026', quantita: 1, prezzo: -300, aliquota_iva: 'IVA22', acconto_id: 9 }]);
  const d = generaFatturaXml(NOTA_DEBITO, CLIENTE_IT, AZIENDA, ALIQUOTE);
  assert.deepEqual(d.errori, []);
  assert.deepEqual(tag(d.xml, 'TipoDocumento'), ['TD05']);
  assert.match(d.xml, /<DatiFattureCollegate><IdDocumento>119<\/IdDocumento>/);
  const senza = generaFatturaXml({ ...NOTA_DEBITO, origine: null }, CLIENTE_IT, AZIENDA, ALIQUOTE);
  assert.ok(senza.errori.includes('La nota di debito deve indicare la fattura che corregge.'));
});

test('Fattura del consulente con ritenuta e cassa: netto da pagare e F24 entro il 16 del mese dopo il pagamento', () => {
  const xml = `<?xml version="1.0"?><p:FatturaElettronica xmlns:p="x"><FatturaElettronicaHeader><CedentePrestatore><DatiAnagrafici>
    <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA><Anagrafica><Nome>MARIO</Nome><Cognome>ROSSI</Cognome></Anagrafica></DatiAnagrafici>
    <Sede><Indirizzo>VIA X</Indirizzo><CAP>29121</CAP><Comune>PIACENZA</Comune><Nazione>IT</Nazione></Sede></CedentePrestatore></FatturaElettronicaHeader>
    <FatturaElettronicaBody><DatiGenerali><DatiGeneraliDocumento><TipoDocumento>TD01</TipoDocumento><Divisa>EUR</Divisa><Data>2026-10-15</Data><Numero>12</Numero>
    <DatiRitenuta><TipoRitenuta>RT01</TipoRitenuta><ImportoRitenuta>200.00</ImportoRitenuta><AliquotaRitenuta>20.00</AliquotaRitenuta><CausalePagamento>A</CausalePagamento></DatiRitenuta>
    <DatiCassaPrevidenziale><TipoCassa>TC22</TipoCassa><AlCassa>4.00</AlCassa><ImportoContributoCassa>40.00</ImportoContributoCassa></DatiCassaPrevidenziale>
    <ImportoTotaleDocumento>1268.80</ImportoTotaleDocumento></DatiGeneraliDocumento></DatiGenerali>
    <DatiBeniServizi><DatiRiepilogo><AliquotaIVA>22.00</AliquotaIVA><ImponibileImporto>1040.00</ImponibileImporto><Imposta>228.80</Imposta></DatiRiepilogo></DatiBeniServizi>
    </FatturaElettronicaBody></p:FatturaElettronica>`;
  const [f] = datiFattureRicevute(xml);
  assert.equal(f.totale, 1268.8);
  assert.equal(f.ritenuta, 200);
  assert.equal(f.cassa, 40);
  assert.equal(f.tipo_ritenuta, 'RT01');
  assert.equal(f.causale_ritenuta, 'A');
  assert.equal(f.netto_a_pagare, 1068.8);
  assert.deepEqual(f.scadenze, [{ data: '2026-10-15', importo: 1068.8 }]);
  assert.equal(scadenzaF24('2026-10-31'), '2026-11-16');
  assert.equal(scadenzaF24('2026-12-03'), '2027-01-16');
});

test('Dati fiscali del cliente: PA con codice ufficio di 6 caratteri, privati con 7', () => {
  const pa = datiFiscaliDaModulo({ codice_fiscale: '84001850589', nazione: 'it', codice_sdi: 'e9ybyu', pubblica_amministrazione: 'on', split_payment: 'on', pec: ' X@Pec.IT ' });
  assert.deepEqual(pa.errori, []);
  assert.equal(pa.dati.codice_sdi, 'E9YBYU');
  assert.equal(pa.dati.nazione, 'IT');
  assert.equal(pa.dati.pec, 'x@pec.it');
  assert.equal(pa.dati.split_payment, true);
  assert.ok(datiFiscaliDaModulo({ codice_sdi: 'E9YBYU' }).errori.some(e => /7 caratteri/.test(e)));
  assert.ok(datiFiscaliDaModulo({ codice_sdi: 'ABC1234', pubblica_amministrazione: 'on', codice_fiscale: '84001850589' }).errori.some(e => /6 caratteri/.test(e)));
  assert.ok(datiFiscaliDaModulo({ partita_iva: '123', cap: '291' }).errori.length === 2);
});
