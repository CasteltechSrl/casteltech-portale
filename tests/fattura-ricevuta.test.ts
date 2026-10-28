import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { datiFattureRicevute, eNostraAutofattura, leggiXml, trova, xmlDaFile } from '../src/engine/fattura-ricevuta.js';
import { generaAutofatturaXml, generaFatturaXml } from '../src/engine/fatturapa.js';
import { ALIQUOTE, AUTOFATTURA_UE, AZIENDA, CLIENTE_IT, FATTURA_RATE, FORNITORE_UE } from '../tools/fatturapa/esempi.js';

// fattura finta di un fornitore (COMPONENTI ITALIA S.R.L.) a Casteltech, firmata .p7m con un certificato di prova
const P7M = readFileSync(new URL('./campioni/fattura_fornitore_prova.xml.p7m', import.meta.url));

test('Fatture ricevute: piccolo lettore XML (prefissi, entità, CDATA)', () => {
  const n = leggiXml('<?xml version="1.0"?><p:A xmlns:p="x"><B>uno &amp; due</B><C><![CDATA[<tre>]]></C><D/></p:A>');
  assert.equal(trova(n, 'A/B')?.testo, 'uno & due');
  assert.equal(trova(n, 'C')?.testo, '<tre>');
  assert.ok(trova(n, 'A/D'));
});

test('Fatture ricevute: XML dalla busta firmata .p7m (anche in base64)', () => {
  const xml = xmlDaFile(P7M);
  assert.match(xml, /^<\?xml/);
  assert.match(xml, /<\/p:FatturaElettronica>\s*$/);
  assert.equal(xmlDaFile(Buffer.from(P7M.toString('base64'))), xml);
  assert.equal(xmlDaFile(Buffer.from(xml)), xml);
  assert.throws(() => xmlDaFile(Buffer.from([0x30, 0x03, 0x02, 0x01, 0x00])), /non leggibile/);
});

test('Fatture ricevute: fornitore, numero, totali e rate dal file', () => {
  const [f] = datiFattureRicevute(xmlDaFile(P7M));
  assert.equal(f.tipo, 'fattura');
  assert.equal(f.tipo_sdi, 'TD01');
  assert.equal(f.numero, '77');
  assert.equal(f.fornitore.ragione_sociale, 'COMPONENTI ITALIA S.R.L.');
  assert.equal(f.fornitore.partita_iva, '12345678903');            // italiana: senza IT, come in anagrafica
  assert.equal(f.cessionario_piva, 'IT01777320332');
  assert.deepEqual([f.imponibile, f.imposta, f.totale], [610, 134.2, 744.2]);
  assert.deepEqual(f.scadenze.map(s => s.importo), [372.1, 372.1]);
  assert.ok(!eNostraAutofattura(f, '01777320332'));
});

test('Fatture ricevute: la copia della nostra autofattura si riconosce; senza rate una sola scadenza', () => {
  const auto = generaAutofatturaXml(AUTOFATTURA_UE, FORNITORE_UE, AZIENDA, ALIQUOTE).xml;
  const [a] = datiFattureRicevute(auto);
  assert.equal(a.tipo_sdi, 'TD18');
  assert.ok(eNostraAutofattura(a, AZIENDA.partita_iva));
  const nc = generaFatturaXml({ ...FATTURA_RATE, tipo: 'nota_credito', origine: { numero: '1', data: FATTURA_RATE.data }, scadenze: [] } as any, CLIENTE_IT, AZIENDA, ALIQUOTE).xml;
  const [n] = datiFattureRicevute(nc);
  assert.equal(n.tipo, 'nota_credito');
  assert.equal(n.scadenze.length, 1);
  assert.equal(n.scadenze[0].importo, n.totale);
});
