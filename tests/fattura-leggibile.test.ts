import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allegatoFattura, fatturaLeggibile } from '../src/engine/fattura-leggibile.js';
import { cercaGuida } from '../src/engine/guida.js';

const pdf = Buffer.from('%PDF-1.4 prova').toString('base64');
const XML = `<?xml version="1.0"?><p:FatturaElettronica xmlns:p="x"><FatturaElettronicaHeader><CedentePrestatore><DatiAnagrafici>
  <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01443020282</IdCodice></IdFiscaleIVA><Anagrafica><Denominazione>I-TRONIK S.R.L.</Denominazione></Anagrafica></DatiAnagrafici>
  <Sede><Indirizzo>VIA DELL'ARTIGIANATO</Indirizzo><CAP>35010</CAP><Comune>VIGONZA</Comune><Provincia>PD</Provincia><Nazione>IT</Nazione></Sede></CedentePrestatore></FatturaElettronicaHeader>
  <FatturaElettronicaBody><DatiGenerali><DatiGeneraliDocumento><TipoDocumento>TD24</TipoDocumento><Divisa>EUR</Divisa><Data>2026-03-16</Data><Numero>673</Numero>
  <ImportoTotaleDocumento>122.00</ImportoTotaleDocumento></DatiGeneraliDocumento>
  <DatiOrdineAcquisto><IdDocumento>18/2026</IdDocumento><Data>2026-03-03</Data></DatiOrdineAcquisto><DatiOrdineAcquisto><IdDocumento>18/2026</IdDocumento><Data>2026-03-03</Data></DatiOrdineAcquisto>
  <DatiDDT><NumeroDDT>936</NumeroDDT><DataDDT>2026-03-05</DataDDT></DatiDDT></DatiGenerali>
  <DatiBeniServizi><DettaglioLinee><NumeroLinea>1</NumeroLinea><Descrizione>LAMINA SMD</Descrizione><Quantita>1.00</Quantita><PrezzoUnitario>100.00</PrezzoUnitario><PrezzoTotale>100.00</PrezzoTotale><AliquotaIVA>22.00</AliquotaIVA></DettaglioLinee>
  <DatiRiepilogo><AliquotaIVA>22.00</AliquotaIVA><ImponibileImporto>100.00</ImponibileImporto><Imposta>22.00</Imposta></DatiRiepilogo></DatiBeniServizi>
  <DatiPagamento><DettaglioPagamento><ModalitaPagamento>MP12</ModalitaPagamento><DataScadenzaPagamento>2026-05-31</DataScadenzaPagamento><ImportoPagamento>122.00</ImportoPagamento></DettaglioPagamento></DatiPagamento>
  <Allegati><NomeAttachment>FATTURA_673.PDF</NomeAttachment><FormatoAttachment>PDF</FormatoAttachment><Attachment>${pdf}</Attachment></Allegati></FatturaElettronicaBody></p:FatturaElettronica>`;

test('fattura del fornitore da leggere: dati, righe, pagamento e PDF allegato (Adriano 10/11/2026)', () => {
  const f = fatturaLeggibile(XML);
  assert.equal(f.fornitore.nome, 'I-TRONIK S.R.L.');
  assert.equal(f.fornitore.partitaIva, 'IT01443020282');
  assert.equal(f.tipo, 'Fattura differita (TD24)');
  assert.equal(f.numero, '673');
  assert.deepEqual(f.ordini, ['18/2026 del 03/03/2026']);
  assert.deepEqual(f.ddt, ['936 del 05/03/2026']);
  assert.equal(f.righe[0].descrizione, 'LAMINA SMD');
  assert.equal(f.pagamenti[0].modalita, 'RiBa');
  assert.equal(f.totale, 122);
  assert.equal(f.allegati[0].nome, 'FATTURA_673.PDF');
  const a = allegatoFattura(XML, 1)!;
  assert.equal(a.tipo, 'application/pdf');
  assert.equal(a.dati.subarray(0, 5).toString(), '%PDF-');
  assert.equal(allegatoFattura(XML, 2), null);
  assert.ok(cercaGuida('vedere fattura fornitore pdf').some(a => a.argomento.id === 'incassi-pagamenti'));
});
