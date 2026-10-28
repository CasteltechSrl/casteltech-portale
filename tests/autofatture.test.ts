import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cambioDaCsv, causaleAutofattura, controllaFatturaEstera, nomeConfrontabile, normalizzaFatturaEstera, paeseFiscale, righeInEuro, sommaRighe,
  stessoNomeFornitore, tipoAutofattura,
} from '../src/engine/autofatture.js';
import { generaAutofatturaXml } from '../src/engine/fatturapa.js';
import { ALIQUOTE, AUTOFATTURA_CINA, AUTOFATTURA_UE, AZIENDA, FORNITORE_CINA, FORNITORE_UE } from '../tools/fatturapa/esempi.js';

const tag = (xml: string, nome: string) => [...xml.matchAll(new RegExp(`<${nome}>([^<]*)</${nome}>`, 'g'))].map(m => m[1]);

test('Autofatture: tipo dal paese della P.IVA (Mouser ha sede in USA ma P.IVA francese)', () => {
  assert.equal(paeseFiscale('FR27512466913', 'US'), 'FR');
  assert.equal(paeseFiscale('EL123456789', 'GR'), 'GR');
  assert.equal(paeseFiscale('91440300MA5', 'CINA'), 'CN');
  assert.equal(paeseFiscale('MA91440300', 'CN'), 'CN');            // due lettere che non sono un prefisso europeo
  assert.equal(tipoAutofattura('FR', false), 'TD18');
  assert.equal(tipoAutofattura('DE', true), 'TD17');
  assert.equal(tipoAutofattura('US', true), 'TD17');
  assert.equal(tipoAutofattura('CN', false), 'TD19');
  assert.equal(causaleAutofattura('93174181', '2026-10-21'), 'Relativo a fattura n. 93174181 del 21/10/2026');
});

test('Autofatture: lettura dell\'IA ripulita, cambio BCE e prezzi in euro', () => {
  const f = normalizzaFatturaEstera({
    fornitore: { ragione_sociale: ' Mouser  Electronics ', partita_iva: 'FR 27 512 466 913', indirizzo: '1000 N Main St', comune: 'Mansfield', paese: 'United States' },
    numero: '93174181', data: '21/10/2026', valuta: 'usd', pagata: true,
    righe: [{ codice: 'hfbr-14e4z', descrizione: 'Transmitter', quantita: '50', prezzo: '1.234,50' }, { descrizione: 'Shipping', prezzo: 20 }, {}],
    imponibile: '61745,00', iva: 0,
  });
  assert.equal(f.fornitore.ragione_sociale, 'MOUSER ELECTRONICS');
  assert.equal(f.fornitore.partita_iva, 'FR27512466913');
  assert.equal(f.fornitore.paese, 'US');
  assert.equal(f.data, '2026-10-21');
  assert.equal(f.valuta, 'USD');
  assert.deepEqual(f.righe.map(r => [r.codice, r.quantita, r.prezzo]), [['HFBR-14E4Z', 50, 1234.5], ['', 1, 20]]);
  assert.equal(sommaRighe(f.righe), 61745);
  const csv = 'KEY,FREQ,TIME_PERIOD,OBS_VALUE\nX,D,2026-10-16,1.1253\nX,D,2026-10-19,1.1225\nX,D,2026-10-20,1.1215';
  assert.equal(cambioDaCsv(csv, '2026-10-19'), 1.1225);
  assert.equal(cambioDaCsv(csv, '2026-10-18'), 1.1253);              // domenica: vale il venerdì
  assert.equal(cambioDaCsv(csv, '2026-10-01'), null);
  assert.deepEqual(righeInEuro([{ codice: '', descrizione: 'x', quantita: 1, prezzo: 25 }], 'USD', 1.1193).map(r => r.prezzo), [22.33539]);
  assert.throws(() => righeInEuro(f.righe, 'USD', null), /cambio/);
});

test('Autofatture: controlli prima di preparare la bozza', () => {
  const base = normalizzaFatturaEstera({ fornitore: { ragione_sociale: 'X', partita_iva: 'DE239975861', indirizzo: 'A', comune: 'B', paese: 'DE' },
    numero: '1', data: '2026-10-01', righe: [{ descrizione: 'a', quantita: 1, prezzo: 10 }], imponibile: 10 });
  assert.deepEqual(controllaFatturaEstera(base), { errori: [], avvisi: [] });
  const italiano = controllaFatturaEstera({ ...base, fornitore: { ...base.fornitore, partita_iva: '01777320332', paese: 'IT' } });
  assert.match(italiano.errori.join(), /italiano/);
  assert.match(controllaFatturaEstera({ ...base, valuta: 'USD' }).errori.join(), /cambio/);
  assert.match(controllaFatturaEstera({ ...base, tipo: 'TD18', fornitore: { ...base.fornitore, partita_iva: '123456', paese: 'CN' } }).errori.join(), /Unione europea/);
  const avvisi = controllaFatturaEstera({ ...base, imponibileLetto: 12, ivaLetta: 2.2, tipo: 'TD19', fornitore: { ...base.fornitore, partita_iva: '123456', paese: 'CN' } }).avvisi.join(' | ');
  assert.match(avvisi, /sommano 10.00/);
  assert.match(avvisi, /addebitato IVA/);
  assert.match(avvisi, /dogana/);
});

test('Autofatture: XML con il fornitore estero come cedente e Casteltech come cessionario', () => {
  const ue = generaAutofatturaXml(AUTOFATTURA_UE, FORNITORE_UE, AZIENDA, ALIQUOTE);
  assert.deepEqual(ue.errori, []);
  assert.deepEqual(tag(ue.xml, 'TipoDocumento'), ['TD18']);
  assert.deepEqual(tag(ue.xml, 'IdPaese'), ['IT', 'FR', 'IT']);       // trasmittente, fornitore (P.IVA francese), Casteltech
  assert.deepEqual(tag(ue.xml, 'RegimeFiscale'), ['RF18']);
  assert.deepEqual(tag(ue.xml, 'CodiceDestinatario'), ['0000000']);
  assert.match(ue.xml, /<CAP>00000<\/CAP><Comune>DALLAS<\/Comune><Nazione>US<\/Nazione>/);
  assert.match(ue.xml, /<DatiFattureCollegate><IdDocumento>93174181<\/IdDocumento><Data>2026-10-21<\/Data><\/DatiFattureCollegate>/);
  // 50 × 22,86167 = 1143,08 + 20 = 1163,08; IVA 22 % = 255,88
  assert.deepEqual(tag(ue.xml, 'ImponibileImporto'), ['1163.08']);
  assert.deepEqual(tag(ue.xml, 'Imposta'), ['255.88']);
  assert.deepEqual(tag(ue.xml, 'ImportoTotaleDocumento'), ['1418.96']);
  assert.deepEqual(tag(ue.xml, 'Numero'), ['93/AF']);
  const cina = generaAutofatturaXml(AUTOFATTURA_CINA, FORNITORE_CINA, AZIENDA, ALIQUOTE);
  assert.deepEqual(cina.errori, []);
  assert.match(cina.xml, /<IdFiscaleIVA><IdPaese>CN<\/IdPaese><IdCodice>MA91440300X<\/IdCodice><\/IdFiscaleIVA>/);
  assert.match(generaAutofatturaXml({ ...AUTOFATTURA_CINA, tipo_sdi: 'TD18' }, FORNITORE_CINA, AZIENDA, ALIQUOTE).errori.join(), /Unione europea/);
  assert.match(generaAutofatturaXml({ ...AUTOFATTURA_UE, fattura: null }, FORNITORE_UE, AZIENDA, ALIQUOTE).errori.join(), /fattura del fornitore/);
  assert.match(generaAutofatturaXml(AUTOFATTURA_UE, { ...FORNITORE_UE, nazione: 'IT', partita_iva: '01777320332' }, AZIENDA, ALIQUOTE).errori.join(), /italiano/);
});

test('Autofatture: stesso fornitore anche con forma societaria e trattini diversi (prova con le fatture vere del 2026)', () => {
  assert.equal(nomeConfrontabile('MOUSER ELECTRONICS, INC.'), 'MOUSER ELECTRONICS');
  assert.equal(nomeConfrontabile('Digi-Key Electronics'), 'DIGIKEY ELECTRONICS');
  assert.ok(stessoNomeFornitore('MOUSER ELECTRONICS, INC.', 'MOUSER ELECTRONICS'));
  assert.ok(stessoNomeFornitore('Anthropic Ireland, Limited', 'Anthropic, PBC'));
  assert.ok(!stessoNomeFornitore('AMAZON EU', 'AMAZON BUSINESS EU'));
  assert.ok(!stessoNomeFornitore('CO LTD', 'ABC'));
});

test('Autofatture: date scritte all\'inglese sulle fatture estere', () => {
  const data = (d: string) => normalizzaFatturaEstera({ data: d }).data;
  assert.equal(data('21-OCT-26'), '2026-10-21');                 // Mouser
  assert.equal(data('13­Oct­26'), '2026-10-13');        // Mouser Italia (trattino "morbido" del PDF)
  assert.equal(data('October 24, 2026'), '2026-10-24');          // Anthropic
  assert.equal(data('03-Oct-2026'), '2026-10-03');               // DigiKey
  assert.equal(data('21/10/2026'), '2026-10-21');
  assert.equal(data('Smarch 3, 2026'), null);
});

test('Autofatture: righe arrotondate una per una come sulla fattura (DigiKey 123868019 = 277,58)', () => {
  assert.equal(sommaRighe([{ codice: '', descrizione: 'a', quantita: 800, prezzo: 0.15068 }, { codice: '', descrizione: 'b', quantita: 500, prezzo: 0.12288 },
    { codice: '', descrizione: 'c', quantita: 550, prezzo: 0.17382 }]), 277.58);
});
