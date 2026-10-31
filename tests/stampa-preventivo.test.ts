import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcolaPreventivo, type FaseDef, type Tariffe, type VoceDef } from '../src/engine/calcolo.js';
import { contiStampa, leggiRitocchi, quotaSmd, righeDettaglio, righeUnaTantum, versioneStampa } from '../src/engine/stampa-preventivo.js';

const t: Tariffe = { costoAziendaH: 0, costoOperatoreProduzioneH: 60, costoOperatoreUfficioH: 60, ricarico: 1 };
// una fase da "euro" € a lotto (60 €/h × 1 persona, ricarico 1: secondi = euro × 60)
const F = (codice: string, gruppo: string, euro: number, unaTantum = false): FaseDef =>
  ({ codice, nome: codice, gruppo, formulaSecondi: String(euro * 60), persone: 1, tariffa: 'produzione', unaTantum });
const V = (codice: string, gruppo: string, euro: number, unaTantum = false): VoceDef => ({ codice, nome: codice, gruppo, formulaEuro: String(euro), unaTantum });

test('stampa: versione dall\'indirizzo, se manca Essenziale con dettaglio', () => {
  assert.equal(versioneStampa('essenziale'), 'essenziale');
  assert.equal(versioneStampa('fasi'), 'fasi');
  assert.equal(versioneStampa(undefined), 'dettaglio');
  assert.equal(versioneStampa('altro'), 'dettaglio');
});

test('stampa: gestione materiale e imballaggio 70/30 su SMD e THT, pesato sul valore (Adriano 28/10/2026)', () => {
  assert.equal(quotaSmd(100, 100), 0.7);
  assert.equal(Math.round(quotaSmd(10, 90) * 1000) / 1000, 0.206);   // 7 / (7 + 27)
  assert.equal(quotaSmd(50, 0), 1);
  assert.equal(quotaSmd(0, 50), 0);
});

test('stampa con dettaglio: componenti, PCB, SMD, THT (con i costi comuni), consumo, spedizione; totali uguali al preventivo', () => {
  const fasi = [F('pep', 'SMD', 100), F('onda', 'THT', 100), F('stocc', 'GESTIONE MATERIALE', 30), F('imb', 'IMBALLAGGIO', 20),
    F('prog', 'SMD', 200, true), F('test', 'COMPLETAMENTO', 40)];
  const voci = [V('valoreAcquistoComponenti', 'MATERIALE PER PRODUZIONE', 500), V('valoreAcquistoPCB', 'MATERIALE PER PRODUZIONE', 100),
    V('materialeDiConsumo', 'MATERIALE DI CONSUMO', 8), V('energiaForno', 'ENERGIA', 2), V('spedizione', 'SPEDIZIONE', 15),
    V('laminaSerigrafica', 'COSTI UNA TANTUM', 110, true)];
  const ris = calcolaPreventivo(fasi, voci, t, { nSchede: 10, parametri: {} });
  const righe = righeDettaglio(ris);
  assert.deepEqual(righe.map(r => [r.nome, r.lotto]), [
    ['Acquisto componenti', 500], ['Acquisto PCB', 100],
    ['Montaggio SMD', 135], ['Montaggio THT', 115],                  // 50 € comuni: 70 % SMD, 30 % THT
    ['Lavorazioni di completamento', 40], ['Materiale di consumo', 10], ['Spedizione', 15],
  ]);
  assert.equal(righe.reduce((a, r) => a + r.lotto, 0), ris.totali.totaleSecondoLotto);
  assert.equal(Math.round(righe.reduce((a, r) => a + r.scheda, 0) * 100) / 100, ris.totali.prezzoSchedaSecondoLotto);
  assert.ok(!righe.some(r => /prog|lamina/i.test(r.nome)), 'le una tantum restano a parte');
  assert.deepEqual(righeUnaTantum(ris, { doppia: false, nLamine: 1 }).map(r => [r.nome, r.prezzo]),
    [['Programmazione attrezzature di produzione', 200], ['Lamina serigrafica', 110]]);
});

test('stampa con dettaglio: SMD piccolo e THT grande → i costi comuni vanno più sul THT', () => {
  const ris = calcolaPreventivo([F('pep', 'SMD', 10), F('onda', 'THT', 90), F('imb', 'IMBALLAGGIO', 34)], [], t, { nSchede: 1, parametri: {} });
  assert.deepEqual(righeDettaglio(ris).map(r => [r.nome, r.lotto]), [['Montaggio SMD', 17], ['Montaggio THT', 117]]);   // 34 × 7/34 = 7
});

test('stampa con dettaglio: i centesimi degli arrotondamenti tornano con il prezzo a scheda', () => {
  const ris = calcolaPreventivo([F('pep', 'SMD', 10), F('onda', 'THT', 10), F('imb', 'IMBALLAGGIO', 10)],
    [V('materialeDiConsumo', 'MATERIALE DI CONSUMO', 10)], t, { nSchede: 3, parametri: {} });
  const righe = righeDettaglio(ris);
  assert.equal(Math.round(righe.reduce((a, r) => a + r.scheda, 0) * 100) / 100, ris.totali.prezzoSchedaSecondoLotto);
  assert.equal(Math.round(righe.reduce((a, r) => a + r.lotto, 0) * 100) / 100, ris.totali.totaleSecondoLotto);
});

test('stampa: ritocchi dal modulo (Adriano 29/10/2026): righe vuote saltate, numeri all\'italiana, note interne solo con la spunta', () => {
  const r = leggiRitocchi({ noteCliente: ' Consegna in 3 settimane ', scontoTipo: 'percento', scontoValore: '5,5',
    rigaDescrizione: ['Collaudo funzionale', '', 'Trasporto'], rigaQuantita: ['257', '', ''], rigaPrezzo: ['0,80', '', '35'] });
  assert.equal(r.noteCliente, 'Consegna in 3 settimane');
  assert.deepEqual(r.sconto, { tipo: 'percento', valore: 5.5 });
  assert.deepEqual(r.righe, [{ descrizione: 'Collaudo funzionale', quantita: 257, prezzo: 0.8 }, { descrizione: 'Trasporto', quantita: 1, prezzo: 35 }]);
  assert.equal(r.noteInterne, false);
  assert.equal(leggiRitocchi({ noteInterne: 'si' }).noteInterne, true);
  assert.equal(leggiRitocchi({ scontoValore: '0' }).sconto, null);
  assert.deepEqual(leggiRitocchi(r), r); // quello salvato si rilegge uguale
  assert.deepEqual(leggiRitocchi(null).righe, []);
});

test('stampa: sconto in % su tutto, sconto in € sul lotto, righe in più nel totale', () => {
  const base = { prezzoScheda: 3.25, lotto: 834.79, unaTantum: 347.5, nSchede: 257 };
  const p = contiStampa(base, leggiRitocchi({ scontoTipo: 'percento', scontoValore: '10', rigaDescrizione: 'Trasporto', rigaPrezzo: '50' }));
  assert.equal(p.extra, 50);
  assert.equal(p.sconto, 123.23);            // 10% di 834,79 + 347,50 + 50
  assert.equal(p.totale, 1109.06);
  assert.equal(p.lotto, 751.31);
  assert.equal(p.unaTantum, 312.75);
  assert.equal(p.etichettaSconto, 'Sconto 10%');
  const e = contiStampa(base, leggiRitocchi({ scontoTipo: 'euro', scontoValore: '34,79' }));
  assert.equal(e.lotto, 800);
  assert.equal(e.prezzoScheda, 3.11);
  assert.equal(e.unaTantum, 347.5);
  assert.equal(e.totale, 1147.5);
  const nulla = contiStampa(base, leggiRitocchi({}));
  assert.equal(nulla.totale, 1182.29);
  assert.equal(nulla.prezzoScheda, 3.25);
});
