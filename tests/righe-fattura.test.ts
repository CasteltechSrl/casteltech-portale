import { test } from 'node:test';
import assert from 'node:assert/strict';
import { articoliComprati, codiciFornitoreMateriale, pnDallaRiga, prezzoRiga, righeFattureDaXml, chiaveArticolo, type RigaAcquistoStorica } from '../src/engine/righe-fattura.js';
import { linkPermesso } from '../src/engine/link-profilo.js';
import { cercaGuida } from '../src/engine/guida.js';

const linea = (n: number, descrizione: string, qta: string, prezzo: string, totale: string, codice?: [string, string], sconto?: string) => `<DettaglioLinee>
  <NumeroLinea>${n}</NumeroLinea>${codice ? `<CodiceArticolo><CodiceTipo>${codice[0]}</CodiceTipo><CodiceValore>${codice[1]}</CodiceValore></CodiceArticolo>` : ''}
  <Descrizione>${descrizione}</Descrizione><Quantita>${qta}</Quantita><UnitaMisura>pezzi</UnitaMisura><PrezzoUnitario>${prezzo}</PrezzoUnitario>
  ${sconto ? `<ScontoMaggiorazione><Tipo>SC</Tipo><Percentuale>${sconto}</Percentuale></ScontoMaggiorazione>` : ''}<PrezzoTotale>${totale}</PrezzoTotale><AliquotaIVA>22.00</AliquotaIVA></DettaglioLinee>`;
const xml = (trasmittente: string, corpi: string[]) => `<?xml version="1.0"?><p:FatturaElettronica xmlns:p="x"><FatturaElettronicaHeader>
  <DatiTrasmissione><IdTrasmittente><IdPaese>${trasmittente.slice(0, 2)}</IdPaese><IdCodice>${trasmittente.slice(2)}</IdCodice></IdTrasmittente></DatiTrasmissione>
  <CedentePrestatore><DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01234567890</IdCodice></IdFiscaleIVA><Anagrafica><Denominazione>Fornitore</Denominazione></Anagrafica></DatiAnagrafici></CedentePrestatore>
  </FatturaElettronicaHeader>${corpi.map((c, i) => `<FatturaElettronicaBody><DatiGenerali><DatiGeneraliDocumento><TipoDocumento>TD01</TipoDocumento><Numero>${i + 1}</Numero><Data>2025-03-01</Data></DatiGeneraliDocumento></DatiGenerali>
  <DatiBeniServizi>${c}</DatiBeniServizi></FatturaElettronicaBody>`).join('')}</p:FatturaElettronica>`;

test('righe dall\'XML: codice, descrizione, quantità, prezzo, sconto, imponibile; fatture scritte in FIC con "P/N // cliente" e codice gestionale', () => {
  const fic = xml('IT01641790702', [
    linea(1, 'MAX98357AETE+T // Kairos Animalite', '100.00', '1.9489', '194.89', ['INTERNO', 'IC-TQFN16-MAX98357AETT_KI'])
    + linea(2, 'Spese di trasporto', '1.00', '18.00', '18.00'),
  ]);
  const [righe] = righeFattureDaXml(fic);
  assert.equal(righe.length, 2);
  assert.deepEqual([righe[0].codice, righe[0].codiceTipo, righe[0].quantita, righe[0].prezzoUnitario, righe[0].imponibile, righe[0].pn], ['IC-TQFN16-MAX98357AETT_KI', 'INTERNO', 100, 1.9489, 194.89, 'MAX98357AETE+T']);
  assert.ok(righe[0].candidati.includes('MAX98357AETE+T') && righe[0].candidati.includes('IC-TQFN16-MAX98357AETT_KI'));
  assert.equal(righe[1].pn, null);                       // "Spese" non è un codice
  assert.equal(prezzoRiga({ quantita: 100, imponibile: 194.89 }), 1.9489);
  // sconto in percentuale e imponibile mancante: calcolato
  const [[r]] = righeFattureDaXml(xml('IT99999999999', [linea(1, 'Articolo 1234-AB', '10', '2.00', '', undefined, '10.00')]));
  assert.equal(r.sconto, 10); assert.equal(r.imponibile, 18);
  // più fatture nello stesso file: una lista per corpo, nello stesso ordine
  assert.equal(righeFattureDaXml(xml('IT99999999999', [linea(1, 'A1234', '1', '1', '1'), linea(1, 'B5678', '2', '1', '2') + linea(2, 'C', '1', '1', '1')])).map(c => c.length).join(','), '1,2');
});

test('P/N riconosciuto nella riga: Mouser "279-PN", Farnell con codice d\'ordine, prima parola se sembra un codice, niente dai numeri puri o dai testi', () => {
  const r = (descrizione: string, codice: string | null = null, codiceTipo: string | null = null) => pnDallaRiga({ descrizione, codice, codiceTipo }, false);
  assert.equal(r('279-SMF524KJT'), 'SMF524KJT');
  assert.equal(r('653-G2R-1-DC24'), 'G2R-1-DC24');
  assert.equal(r('V5.5MLA1206H.. VARISTOR, 5.5V, 17.5V, 1206', '2131862', "Codice d'ordine"), null);     // P/N tagliato con ".." non vale
  assert.equal(r('STM32F103C8T6 MCU ARM', '2131862', "Codice d'ordine"), 'STM32F103C8T6');
  assert.equal(r('Trasporto e Imballo'), null);
  assert.equal(r('Lamina serigrafica', 'CMLPKF23012LL', 'Fornitore'), 'CMLPKF23012LL');             // dal CodiceArticolo se non è un codice d'ordine
  assert.equal(r('1234567'), null);
  assert.equal(r('MCU 32-bit ARM Cortex M0', 'STM32F030RCT6*STMICRO', 'Codice'), 'STM32F030RCT6');   // Arrow: "P/N*PRODUTTORE"
  assert.equal(r('4.7K // LPS'), null); assert.equal(r('100R'), null);
  assert.equal(pnDallaRiga({ descrizione: 'LMV321LILT // LPS', codice: 'IC-SOT235-LMV321LILT', codiceTipo: 'INTERNO' }, true), 'LMV321LILT');
});

test('codici del fornitore tra parentesi nella descrizione del materiale di consumo', () => {
  assert.deepEqual(codiciFornitoreMateriale('LAMINA SERIGRAFICA ZELFLEX 23" SP. 0,12 MM (I-TRONIK CMLPKF23012LL; TECNOLAB 05LMA0212)'), ['CMLPKF23012LL', '05LMA0212']);
  assert.deepEqual(codiciFornitoreMateriale('PASTA SALDANTE (VASETTO 500 G)'), []);
  assert.deepEqual(codiciFornitoreMateriale(null), []);
});

test('ricerca negli acquisti: righe unite per articolo con fornitori, ultimo prezzo, min/max, note di credito in negativo', () => {
  const riga = (data: string, fornitore: string, pn: string | null, quantita: number, imponibile: number, extra: Partial<RigaAcquistoStorica> = {}): RigaAcquistoStorica => ({
    documentoId: Number(data.replace(/-/g, '')), tipo: 'fattura', numero: 'n', data, fornitore, fornitoreChiave: `n:${fornitore}`, codice: null, descrizione: pn ?? 'ART', pn,
    quantita, um: 'pezzi', imponibile, componenteId: null, materialeId: null, ...extra,
  });
  const righe = [
    riga('2024-01-10', 'MOUSER', 'STM32F103', 100, 250),            // 2,50
    riga('2024-06-10', 'DIGIKEY', 'STM32F103', 50, 150),             // 3,00
    riga('2025-02-01', 'MOUSER', 'STM-32F103', 10, 28),              // stesso P/N senza trattini: 2,80
    riga('2025-03-01', 'MOUSER', 'STM32F103', 10, 28, { tipo: 'nota_credito' }),
    riga('2023-05-05', 'FARNELL', null, 1, 18, { descrizione: 'Trasporto' }),
  ];
  const a = articoliComprati(righe);
  assert.equal(a.length, 2);
  assert.equal(a[0].pn, 'STM32F103');
  assert.deepEqual([a[0].volte, a[0].pezzi, a[0].spesa, a[0].ultimoPrezzo, a[0].ultimoFornitore, a[0].minimo, a[0].massimo, a[0].primaData, a[0].ultimaData],
    [4, 150, 400, 2.8, 'MOUSER', 2.5, 3, '2024-01-10', '2025-03-01']);
  assert.deepEqual(a[0].fornitori.map(f => [f.fornitore, f.volte, f.ultimoPrezzo, f.minimo]), [['MOUSER', 3, 2.8, 2.5], ['DIGIKEY', 1, 3, 3]]);
  assert.equal(a[1].descrizione, 'Trasporto');
  // il componente abbinato vince sul P/N come chiave
  assert.equal(chiaveArticolo({ pn: 'X', codice: null, descrizione: '', componenteId: 7, materialeId: null }), 'c7');
  assert.equal(chiaveArticolo({ pn: 'A-B', codice: null, descrizione: '', componenteId: null, materialeId: null }), 'pAB');
});

test('pagina Acquisti dell\'Analisi riservata come il resto dell\'Analisi; guida', () => {
  assert.equal(linkPermesso('amministratore', '/amministrazione/analisi/acquisti'), true);
  assert.equal(linkPermesso('esterno', '/amministrazione/analisi/acquisti'), true);
  assert.equal(linkPermesso('ufficio', '/amministrazione/analisi/acquisti'), false);
  assert.equal(linkPermesso('contabilita', '/amministrazione/analisi/acquisti'), false);
  assert.equal(cercaGuida('dove ho comprato un componente e a quale prezzo')[0]?.argomento.id, 'analisi-acquisti');
  assert.equal(cercaGuida('storico acquisti riga per riga fatture fornitori')[0]?.argomento.id, 'analisi-acquisti');
});
