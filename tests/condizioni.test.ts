/** Condizioni di vendita e di acquisto nei documenti (Adriano 7/11/2026): testi, doppia firma, DDT per causale, fattura, PDF. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLAUSOLE_FORNITURA, VESSATORIE_FORNITURA, APPROVAZIONE_FORNITURA, CLAUSOLE_ACQUISTO, VESSATORIE_ACQUISTO, APPROVAZIONE_ACQUISTO,
  CONDIZIONI_GENERALI, REVISIONE_CONDIZIONI, naturaDdt, noteDdt, notaFattura, notaConfermaOrdine,
} from '../src/engine/condizioni.js';
import { pezziCausale } from '../src/engine/fatturapa.js';
import { pdfConfermaOrdine, MODELLO_ORDINE_FORNITORE } from '../src/server/pdf-conferma-ordine.js';
import { pdfPreventivo } from '../src/server/pdf-preventivo.js';
import { pdfDdt } from '../src/server/pdf-ddt.js';
import { testoPdf } from '../src/server/testo-pdf.js';

const testo = CONDIZIONI_GENERALI.join(' ');

test('condizioni di fornitura: le scelte di Adriano del 7/11/2026', () => {
  assert.match(testo, /per 12 mesi dalla consegna/);
  assert.match(testo, /IPC-A-610 classe 2/);
  assert.match(testo, /Foro di Piacenza/);
  assert.match(testo, /almeno il 5% in più, minimo 10 pezzi per codice/);
  // materiale del cliente: coperto dalla polizza, ma si rimborsa solo quello che paga l'assicurazione
  assert.match(testo, /soltanto l'importo che l'assicurazione ci riconosce/);
  assert.match(testo, /lamine serigrafiche pagate dal cliente sono di sua proprietà/);
  assert.match(testo, /interessi di mora del D\.Lgs\. 231\/2002/);
  assert.equal(CLAUSOLE_FORNITURA.length, 14);
});

test('doppia firma (artt. 1341-1342 c.c.): le clausole vessatorie sono elencate una per una con il titolo', () => {
  const titoli = VESSATORIE_FORNITURA.map(n => CLAUSOLE_FORNITURA[n - 1].titolo);
  assert.deepEqual(titoli, ['Tempi di consegna', 'Materiale del cliente (conto lavoro)', 'Garanzia e reclami', 'Limitazione di responsabilità',
    'Pagamento e proprietà', 'Legge e foro']);
  for (const n of VESSATORIE_FORNITURA) assert.match(APPROVAZIONE_FORNITURA, new RegExp(`\\b${n} «`));
  assert.match(APPROVAZIONE_FORNITURA, /^Il cliente dichiara/);
  assert.deepEqual(VESSATORIE_ACQUISTO.map(n => CLAUSOLE_ACQUISTO[n - 1].titolo), ['Consegna', 'Garanzia', 'Legge e foro']);
  assert.match(APPROVAZIONE_ACQUISTO, /^Il fornitore dichiara/);
});

test('DDT: proprietà secondo la causale, controllo al ricevimento e ESD sempre', () => {
  assert.equal(naturaDdt('VENDITA'), 'vendita');
  assert.equal(naturaDdt('RESO LAVORATO'), 'conto_lavoro');
  assert.equal(naturaDdt('RESO C/LAVORAZIONE'), 'conto_lavoro');
  assert.equal(naturaDdt('RESO NON LAVORATO'), 'altro');
  assert.equal(naturaDdt('RESO DA RIPARAZIONE IN GARANZIA'), 'altro');
  assert.equal(naturaDdt(null), 'altro');
  assert.match(noteDdt('VENDITA').join(' '), /art\. 1523/);
  assert.doesNotMatch(noteDdt('RESO LAVORATO').join(' '), /1523/);
  assert.match(noteDdt('RESO LAVORATO').join(' '), /conto lavorazione/);
  for (const c of ['VENDITA', 'CONTO VISIONE', '']) {
    assert.match(noteDdt(c).join(' '), /entro 8 giorni/);
    assert.match(noteDdt(c).join(' '), /ESD/);
  }
});

test('fattura e conferma: mora, riserva di proprietà, revisione delle condizioni; causale XML in pezzi da 200 senza spezzare parole', () => {
  assert.match(notaFattura(), /40 €/);
  assert.match(notaFattura(), new RegExp(`rev\\. ${REVISIONE_CONDIZIONI.replace('/', '\\/')}`));
  assert.match(notaConfermaOrdine(), /prevalgono su condizioni diverse dell'ordine del cliente/);
  const pezzi = pezziCausale(notaFattura());
  assert.ok(pezzi.length >= 2 && pezzi.every(p => p.length <= 200));
  assert.equal(pezzi.join(' '), notaFattura().replace('€', 'EUR'));
});

const azienda = { nome: 'CASTELTECH S.R.L.', indirizzo: 'STRADA FIORENZUOLA, 8', piva: '01777320332', rea: 'PC-190591', tel: '0523 190 24 64', email: 'info@casteltech.net', pec: 'casteltech@pec.it' };
const righeOrdine = [{ posizione: 1, codice: 'EA1002', descrizione: 'SCHEDA', quantita: 10, prezzo: 12.5, consegna: '2026-12-01', prodotto_id: null, riga_ordine_id: null }];

test('PDF conferma d\'ordine: richiamo sopra le firme e condizioni di fornitura in coda con la seconda firma', async () => {
  const t = await testoPdf(await pdfConfermaOrdine({ numero: 80, anno: 2026, data: '2026-11-07', azienda, cliente: { ragione_sociale: 'CLIENTE SRL' },
    pagamento: 'Bonifico 30 gg', righe: righeOrdine }));
  assert.match(t, /prevalgono su condizioni diverse/);
  assert.match(t, /CONDIZIONI GENERALI DI FORNITURA/);
  assert.match(t, /Foro di Piacenza/);
  assert.match(t, /Per approvazione specifica del cliente/);
  assert.ok(t.indexOf('Per accettazione del cliente') < t.indexOf('CONDIZIONI GENERALI DI FORNITURA'));
});

test('PDF ordine a fornitore: condizioni generali di acquisto in coda, la nota sulla conferma resta', async () => {
  const t = await testoPdf(await pdfConfermaOrdine({ numero: 210, anno: 2026, data: '2026-11-07', modello: MODELLO_ORDINE_FORNITORE, azienda,
    cliente: { ragione_sociale: 'FORNITORE SRL' }, righe: righeOrdine }));
  assert.match(t, /confermarci sempre l'ordine/);
  assert.match(t, /CONDIZIONI GENERALI DI ACQUISTO/);
  assert.match(t, /RoHS e REACH/);
  assert.match(t, /Per approvazione specifica del fornitore/);
});

test('PDF preventivo: 14 clausole con il riquadro della seconda firma; senza firma niente riquadro', async () => {
  const base = { numero: 'P2026-0200', data: '2026-11-07', azienda, cliente: { ragione_sociale: 'CLIENTE SRL' }, codice: 'EA1002', revisione: '0', nSchede: 10,
    righe: [], riquadro: { senza: 10, con: null }, scontato: false, primoLotto: false, totale: 100, condizioni: true };
  const t = await testoPdf(await pdfPreventivo({ ...base, firma: true }));
  assert.match(t, /14\./);
  assert.match(t, /Per approvazione specifica del cliente/);
  assert.match(t, /artt\. 1341 e 1342 c\.c\./);
  const senza = await testoPdf(await pdfPreventivo({ ...base, firma: false }));
  assert.match(senza, /Legge e foro/);
  assert.doesNotMatch(senza, /approvazione specifica/);
});

test('PDF DDT: righe delle condizioni sopra il piede', async () => {
  const d = { id: 1, numero: 230, sezionale: '', data: '2026-11-07', stato: 'emesso', dati_trasporto: { causale: 'VENDITA' } };
  const t = await testoPdf(await pdfDdt(d, [{ codice: 'EA1002', descrizione: 'SCHEDA', um: 'PZ', quantita: 5 }],
    { ragione_sociale: 'CASTELTECH S.R.L.', partita_iva: '01777320332' }, { ragione_sociale: 'CLIENTE SRL' }));
  assert.match(t, /Controllare la merce al ricevimento/);
  assert.match(t, /art\. 1523/);
});

test('guida: le condizioni dei documenti si trovano', async () => {
  const { cercaGuida } = await import('../src/engine/guida.js');
  for (const q of ['condizioni generali di vendita', 'interessi di mora', 'doppia firma clausole', 'riserva di proprietà'])
    assert.ok(cercaGuida(q).slice(0, 3).some(r => r.argomento.id === 'condizioni-documenti'), q);
});
