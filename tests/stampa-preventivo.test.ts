import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcolaPreventivo, type FaseDef, type Tariffe, type VoceDef } from '../src/engine/calcolo.js';
import { compresoEssenziale, quotaSmd, righeDettaglio, righeUnaTantum, versioneStampa } from '../src/engine/stampa-preventivo.js';

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

test('stampa essenziale: cosa comprende, senza prezzi; spedizione e programmazione solo se ci sono', () => {
  const con = calcolaPreventivo([F('ispezioneAOI', 'SMD', 10), F('onda', 'THT', 10), F('prog', 'SMD', 50, true)],
    [V('valoreAcquistoComponenti', 'MATERIALE PER PRODUZIONE', 100), V('spedizione', 'SPEDIZIONE', 15)], t, { nSchede: 1, parametri: {} });
  assert.deepEqual(compresoEssenziale(con), ['Acquisto componenti', 'Montaggio scheda (SMD e THT)', 'Controllo AOI', 'Imballaggio', 'Spedizione',
    'Comprensivo dei costi di programmazione e attrezzaggio (prima produzione)']);
  const senza = calcolaPreventivo([F('pep', 'SMD', 10)], [], t, { nSchede: 1, parametri: {} });
  assert.deepEqual(compresoEssenziale(senza), ['Montaggio scheda (SMD)', 'Controllo', 'Imballaggio']);
});
