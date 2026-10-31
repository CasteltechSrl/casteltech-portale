import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import {
  arriviDaModulo, avvisoNumerazione, controlliEmissioneOrdine, csvCarrello, emailOrdineFornitore, fornitorePerDistributore, nomeFilePdfOrdine, righeOrdineDaBom,
  statoArrivo, type RigaBomPerOrdine,
} from '../src/engine/ordini-fornitore.js';
import { pdfConfermaOrdine, MODELLO_ORDINE_FORNITORE } from '../src/server/pdf-conferma-ordine.js';

test('ordine a fornitore: stato della merce dalle righe (da ricevere, arrivato in parte, arrivato)', () => {
  assert.equal(statoArrivo([{ quantita: 10, arrivati: 0 }, { quantita: 5 }]), 'da_ricevere');
  assert.equal(statoArrivo([{ quantita: 10, arrivati: 10 }, { quantita: 5, arrivati: 2 }]), 'parziale');
  assert.equal(statoArrivo([{ quantita: 10, arrivati: 12 }, { quantita: 5, arrivati: 5 }]), 'arrivato');
  assert.equal(statoArrivo([]), 'da_ricevere');
});

test('ordine a fornitore: pezzi arrivati scritti a mano ("1.200" = milleduecento), di più = avviso, testo = errore', () => {
  const righe = [{ posizione: 1, quantita: 1200, codice: 'A', descrizione: 'X' }, { posizione: 2, quantita: 5, codice: 'B', descrizione: 'Y' }, { posizione: 3, quantita: 1, codice: null, descrizione: 'Z' }];
  const e = arriviDaModulo({ p1: '1.200', p2: '6', p3: '' }, righe);
  assert.deepEqual([...e.arrivi], [[1, 1200], [2, 6]]);
  assert.equal(e.errori.length, 0);
  assert.match(e.avvisi[0], /arrivati 6 pezzi su 5/);
  assert.match(arriviDaModulo({ 1: 'tanti' }, righe).errori[0], /Riga 1/);
  // "Tutto arrivato": le quantità arrivano già come numeri (anche con decimali)
  assert.deepEqual([...arriviDaModulo({ 1: 0.5 }, righe).arrivi], [[1, 0.5]]);
});

test("ordine a fornitore: per emettere servono il fornitore dell'anagrafica e almeno una riga (la consegna no)", () => {
  const riga = { posizione: 1, codice: 'PCB', descrizione: 'PCB 1001', quantita: 24, prezzo: 12.08, consegna: null, prodotto_id: null, riga_ordine_id: null };
  assert.deepEqual(controlliEmissioneOrdine({ fornitoreId: 7 }, [riga]), []);
  assert.equal(controlliEmissioneOrdine({ fornitoreId: null }, []).length, 2);
});

test('ordine a fornitore: avviso se la numerazione 2026 non è allineata a Fatture in Cloud (n. 204 del 30/10/2026)', () => {
  assert.match(avvisoNumerazione(2026, 0)!, /204/);
  assert.equal(avvisoNumerazione(2026, 204), null);
  assert.equal(avvisoNumerazione(2027, 0), null);
});

const rigaBom = (x: Partial<RigaBomPerOrdine>): RigaBomPerOrdine => ({
  n: 1, pn: 'RC0603FR-0710KL', produttore: 'YAGEO', designatori: 'R1,R2', descrizione: null, codiceProduzione: 'RS-0603-10K-1-100MW', ...x,
});
const scelta = (fornitore: string, codice: string, qta: number, prezzo: number, disponibile = true) => ({ fornitore, codice, mpn: '', qta, prezzo, totale: qta * prezzo, disponibile });

test('ordine dalla BOM: righe divise per distributore scelto, con scarto, senza non montati, forniti dal cliente e senza prezzo', () => {
  const { gruppi, senzaPrezzo } = righeOrdineDaBom([
    rigaBom({ acquisti: [{ schede: 100, lorda: 220, scelta: scelta('mouser', '603-RC0603FR-0710KL', 220, 0.01) }, { schede: 500, lorda: 1100, scelta: scelta('digikey', 'X', 1100, 0.005) }] }),
    rigaBom({ n: 2, pn: 'STM32G071', designatori: 'U1', codiceProduzione: null, acquisti: [{ schede: 100, lorda: 100, scelta: scelta('digikey', '497-STM32G071-ND', 100, 2.5, false) }] }),
    rigaBom({ n: 3, pn: 'NM', esito: 'NON MONTATO', acquisti: [{ schede: 100, lorda: 100, scelta: scelta('mouser', 'Z', 100, 1) }] }),
    rigaBom({ n: 4, pn: 'CLI', clienteFornisce: true, acquisti: [{ schede: 100, lorda: 100, scelta: scelta('mouser', 'Z', 100, 1) }] }),
    rigaBom({ n: 5, pn: 'SENZA-PREZZO', acquisti: [{ schede: 100, lorda: 100 }] }),
  ], 100);
  assert.deepEqual(gruppi.map(g => [g.distributore, g.righe.length, g.totale, g.nonDisponibili]), [['digikey', 1, 250, 1], ['mouser', 1, 2.2, 0]]);
  const m = gruppi[1].righe[0];
  assert.equal(m.codice, '603-RC0603FR-0710KL');
  assert.equal(m.quantita, 220);
  assert.equal(m.descrizione, 'RC0603FR-0710KL YAGEO (RS-0603-10K-1-100MW) RIF. R1,R2');
  assert.deepEqual(senzaPrezzo, ['SENZA-PREZZO']);
});

test("ordine dalla BOM: il distributore si abbina al fornitore dell'anagrafica per nome (il primo = il più usato)", () => {
  const f = [{ id: 1, ragione_sociale: 'WURTH ELEKTRONIK ITALIA S.R.L.' }, { id: 2, ragione_sociale: 'DIGI-KEY ELECTRONICS' }, { id: 3, ragione_sociale: 'MOUSER ELECTRONICS' },
    { id: 4, ragione_sociale: 'MOUSER ELECTRONICS ITALY S.R.L.' }, { id: 5, ragione_sociale: 'TME ITALIA S.R.L.' }, { id: 6, ragione_sociale: 'STME SRL' }];
  assert.equal(fornitorePerDistributore('digikey', f)?.id, 2);
  assert.equal(fornitorePerDistributore('mouser', f)?.id, 3);
  assert.equal(fornitorePerDistributore('tme', f)?.id, 5);   // "STME" non è TME
  assert.equal(fornitorePerDistributore('farnell', f), null);
  assert.equal(fornitorePerDistributore('manuale', f), null);
});

test('ordine a fornitore: file per il carrello (codice;quantità;riferimento), righe senza codice escluse', () => {
  const csv = csvCarrello([{ codice: '603-RC0603', descrizione: 'X', quantita: 220 }, { codice: null, descrizione: 'TRASPORTO', quantita: 1 }, { codice: 'A;B', descrizione: 'Y', quantita: 2 }], 'ORDINE 205/2026');
  assert.equal(csv, 'Codice;Quantita;Riferimento\r\n603-RC0603;220;ORDINE 205/2026\r\n"A;B";2;ORDINE 205/2026\r\n');
});

test('ordine a fornitore: email e nome del PDF', () => {
  const e = emailOrdineFornitore({ numero: '205/2026', data: '2026-11-03', rifFornitore: 'OFF 77', azienda: 'CASTELTECH S.R.L.', consegna: '2026-11-20' });
  assert.equal(e.oggetto, 'Ordine n. 205/2026 del 03/11/2026 - CASTELTECH S.R.L.');
  assert.match(e.testo, /vostra offerta OFF 77/);
  assert.match(e.testo, /Consegna richiesta: 20\/11\/2026/);
  assert.equal(nomeFilePdfOrdine(205, 2026, 'HTS PCB S.R.L.'), 'Ordine_fornitore_205_2026_HTS_PCB_S_R_L.pdf');
  assert.equal(nomeFilePdfOrdine(null, 2026, ''), 'Ordine_fornitore_bozza_2026.pdf');
});

test('ordine a fornitore: il PDF usa lo stesso impaginato della conferma con i testi del fornitore', async () => {
  const pdf = await pdfConfermaOrdine({ numero: 205, anno: 2026, data: '2026-11-03', modello: MODELLO_ORDINE_FORNITORE,
    azienda: { nome: 'CASTELTECH S.R.L.', indirizzo: 'STRADA FIORENZUOLA, 8', piva: '01777320332', rea: 'PC-190591', tel: '0523 190 24 64', email: 'info@casteltech.net', pec: 'casteltech@pec.it', iban: 'IT00X' },
    cliente: { ragione_sociale: 'HTS PCB S.R.L.', partita_iva: '03127970162' }, rifCliente: null, pagamento: null, note: 'Rif. nostra commessa 26-100',
    righe: [{ posizione: 1, codice: '1001', descrizione: 'PCB', quantita: 24, prezzo: 12.08333, consegna: null, prodotto_id: null, riga_ordine_id: null }] });
  const letto = await PDFDocument.load(pdf);
  assert.equal(letto.getTitle(), 'Ordine a fornitore 205/2026');
});
