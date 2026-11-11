import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avvisoPrezziDdt } from '../src/engine/ddt.js';
import { elencoControlli } from '../src/engine/controlli.js';
import { generaFatturaXml } from '../src/engine/fatturapa.js';
import { ALIQUOTE, AZIENDA, CLIENTE_IT, FATTURA } from '../tools/fatturapa/esempi.js';

// Adriano 11/11/2026: elenco DDT con causale, imponibile e totale; DDT da fatturare senza prezzi in evidenza

test('Elenco DDT: avviso solo sui DDT da fatturare con righe senza prezzo', () => {
  assert.equal(avvisoPrezziDdt({ daFatturare: true, stato: 'emesso', righe: 2, senzaPrezzo: 0 }), null);
  assert.equal(avvisoPrezziDdt({ daFatturare: true, stato: 'emesso', righe: 2, senzaPrezzo: 2 })?.testo, 'senza prezzi');
  assert.equal(avvisoPrezziDdt({ daFatturare: true, stato: 'emesso', righe: 3, senzaPrezzo: 1 })?.testo, '1 riga senza prezzo');
  // reso non lavorato, garanzia, conto visione: il prezzo non serve
  assert.equal(avvisoPrezziDdt({ daFatturare: false, stato: 'emesso', righe: 2, senzaPrezzo: 2 }), null);
  assert.equal(avvisoPrezziDdt({ daFatturare: true, stato: 'annullato', righe: 2, senzaPrezzo: 2 }), null);
});

test('Controlli: DDT da fatturare senza prezzi e DDT senza causale', () => {
  const c = elencoControlli({
    oggi: '2026-11-11', ordiniSenzaConsegna: [], prodottiSenzaPrezzo: [], clientiSenzaRecapitoSdi: [], fattureFornitoriSenzaScadenza: [],
    preventiviFermi: [], commesseOltreConsegna: [], tempiApertiVecchi: [],
    ddtDaFatturare: [{ id: 1, numero: '228', data: '2026-11-11', cliente: 'ELEXES', righe: 2, senzaPrezzo: 2 },
      { id: 2, numero: '227', data: '2026-11-10', cliente: 'CONTROL', righe: 2, senzaPrezzo: 0 }],
    ddtSenzaCausale: [{ id: 3, numero: '226', data: '2026-11-10', cliente: 'SELEA' }],
  });
  const prezzi = c.find(x => x.chiave === 'ddt-senza-prezzi');
  assert.equal(prezzi?.righe.length, 1);
  assert.equal(prezzi?.righe[0].dettaglio, 'tutte le righe senza prezzo');
  assert.equal(c.find(x => x.chiave === 'ddt-senza-causale')?.righe.length, 1);
});

test('Fattura di due DDT dello stesso cliente: ogni riga col suo DDT di provenienza (DatiDDT)', () => {
  const doc = { ...FATTURA, righe: [
    { descrizione: 'DDT n. 225 del 10/11/2026', quantita: 1, prezzo: 0, solo_descrizione: true },
    { codice: 'A1', descrizione: 'SCHEDA A1', quantita: 10, prezzo: 5, ddt: { numero: '225', data: '2026-11-10' } },
    { descrizione: 'DDT n. 226 del 10/11/2026', quantita: 1, prezzo: 0, solo_descrizione: true },
    { codice: 'B2', descrizione: 'SCHEDA B2', quantita: 4, prezzo: 20, ddt: { numero: '226', data: '2026-11-10' } },
    { codice: 'B3', descrizione: 'SCHEDA B3', quantita: 1, prezzo: 7, ddt: { numero: '226', data: '2026-11-10' } },
  ], intento: undefined, scadenze: [{ data: '2026-12-31', importo: 192.54, modalita: 'MP05' }] };
  const { xml } = generaFatturaXml(doc as typeof FATTURA, CLIENTE_IT, AZIENDA, ALIQUOTE);
  assert.match(xml, /<DatiDDT><NumeroDDT>225<\/NumeroDDT><DataDDT>2026-11-10<\/DataDDT><RiferimentoNumeroLinea>1<\/RiferimentoNumeroLinea><\/DatiDDT>/);
  assert.match(xml, /<DatiDDT><NumeroDDT>226<\/NumeroDDT><DataDDT>2026-11-10<\/DataDDT><RiferimentoNumeroLinea>2<\/RiferimentoNumeroLinea><RiferimentoNumeroLinea>3<\/RiferimentoNumeroLinea><\/DatiDDT>/);
});
