import { test } from 'node:test';
import assert from 'node:assert/strict';
import { datiXmlFattura } from '../src/engine/xml-fic.js';

// Adriano 9/11/2026: la banca vuole l'XML SdI anche delle fatture fatte con Fatture in Cloud (dati inventati)
test('xml-fic: tipo, numero e data dall\'XML della fattura', () => {
  const xml = (tipo: string, numero: string) => `<?xml version="1.0"?><p:FatturaElettronica xmlns:p="x"><FatturaElettronicaBody><DatiGenerali>
    <DatiGeneraliDocumento><TipoDocumento>${tipo}</TipoDocumento><Divisa>EUR</Divisa><Data>2026-10-30</Data><Numero>${numero}</Numero></DatiGeneraliDocumento>
    <DatiOrdineAcquisto><Data>2026-09-01</Data><Numero>999</Numero></DatiOrdineAcquisto></DatiGenerali></FatturaElettronicaBody></p:FatturaElettronica>`;
  assert.deepEqual(datiXmlFattura(xml('TD01', '117')), { tipo: 'fattura', tipoSdi: 'TD01', numero: 117, data: '2026-10-30', numeroTesto: '117' });
  assert.equal(datiXmlFattura(xml('TD04', '3'))!.tipo, 'nota_credito');
  assert.equal(datiXmlFattura(xml('TD17', '12/AF'))!.tipo, 'autofattura');
  assert.equal(datiXmlFattura(xml('TD17', '12/AF'))!.numero, 12);
  assert.equal(datiXmlFattura('<x/>'), null);
});
