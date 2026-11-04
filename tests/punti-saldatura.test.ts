// Punti di saldatura THT (Adriano 4/11/2026): piedini dei THT, controllo con i fori del Gerber, stagno in filo o saldatrice.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { campiStagno, contaPuntiSaldatura, piediniDaTesto, puntiDaBom, STAGNO_A_PUNTO } from '../src/engine/scheda/piedini.js';
import { analizzaScheda, leggiBomScheda, type Componente } from '../src/engine/scheda/analisi.js';
import { leggiForatura } from '../src/engine/scheda/foratura.js';
import { parametriDaAnalisi } from '../src/engine/scheda/preventivo.js';

test('piedini dall\'impronta o dalla descrizione', () => {
  assert.equal(piediniDaTesto('DIP-8'), 8);
  assert.equal(piediniDaTesto('PDIP14'), 14);
  assert.equal(piediniDaTesto('TO-220'), 3);
  assert.equal(piediniDaTesto('TO-220-5'), 5);
  assert.equal(piediniDaTesto('TO92'), 3);
  assert.equal(piediniDaTesto('PinHeader_2x05_P2.54mm_Vertical'), 10);
  assert.equal(piediniDaTesto('Conn_01x04'), 4);
  assert.equal(piediniDaTesto('MORSETTO 3 POLI PASSO 5,08'), 3);
  assert.equal(piediniDaTesto('TERMINAL_2P'), 2);
  assert.equal(piediniDaTesto('JST B4B-XH-A'), 4);
  assert.equal(piediniDaTesto('R_Axial_DIN0207'), 2);
  assert.equal(piediniDaTesto('CP_Radial_D5.0mm'), 2);
  assert.equal(piediniDaTesto('DO-41'), 2);
  assert.equal(piediniDaTesto('PORTAFUSIBILE 5x20mm'), null, 'il 5x20 dei fusibili non sono piedini');
  assert.equal(piediniDaTesto('220P', '100n'), null, 'un valore in pF non è un numero di piedini');
  assert.equal(piediniDaTesto('', null, 'RELE 5V'), null);
  assert.equal(piediniDaTesto(null, 'DIP8', 'TO-220'), 8, 'vale il primo testo che si capisce');
});

const tht = (ref: string, piediniTht: number | null, footprint = '', montato = true): Componente => ({
  ref, lato: 'TOP', tipo: 'THT', tipoDa: 'BOM', montato, piediniTht, codiceCliente: ref, segnalazioni: [],
  bom: { riga: 1, pn: '', produttore: '', valore: '', footprint, descrizione: '', note: '' },
});

test('punti = piedini dei THT montati; fori del Gerber senza componente non contano', () => {
  const p = contaPuntiSaldatura([tht('U1', null, 'DIP8'), tht('J1', 3), tht('J2', null, 'TERMINAL_2P', false)], { refori: 18, fissaggio: 4 });
  assert.equal(p.punti, 11);
  assert.equal(p.fonte, 'componenti');
  assert.deepEqual(p.nonMontati, { refs: ['J2'], piedini: 2 });
  // 18 fori metallizzati − 4 di fissaggio − 2 del non montato − 11 piedini = 1 foro senza componente
  assert.equal(p.fori!.senzaComponente, 1);
  assert.match(p.testo, /1 fori senza componente/);
});

test('THT senza piedini leggibili: si usano i fori del Gerber che restano, senza quelli dei non montati', () => {
  const p = contaPuntiSaldatura([tht('U1', null, 'DIP8'), tht('K1', null, 'RELE'), tht('J2', null, 'TERMINAL_2P', false)], { refori: 15, fissaggio: 0 });
  assert.equal(p.fonte, 'foratura');
  assert.equal(p.punti, 13);
  assert.deepEqual(p.senzaPiedini, ['K1']);
});

test('THT senza piedini e senza foratura: 2 a pezzo, da controllare', () => {
  const p = contaPuntiSaldatura([tht('U1', null, 'DIP8'), tht('K1', null, 'RELE')]);
  assert.equal(p.fonte, 'stima');
  assert.equal(p.punti, 10);
});

test('BOM collegata: righe THT montate × quantità, poli dei connettori', () => {
  const p = puntiDaBom([
    { designatori: 'U1, U2', qtaScheda: 2, montata: true, tecnologia: 'T', testi: ['DIP8'] },
    { designatori: 'J1', qtaScheda: 1, montata: true, tecnologia: 'T', poli: '4', testi: ['CONN'] },
    { designatori: 'J9', qtaScheda: 1, montata: false, tecnologia: 'T', testi: ['DIP16'] },
    { designatori: 'R1', qtaScheda: 1, montata: true, tecnologia: 'S', testi: ['0603'] },
    { designatori: 'X1', qtaScheda: 1, montata: true, tecnologia: 'T', testi: ['QUARZO'] },
  ]);
  assert.equal(p.punti, 2 * 8 + 4 + 2);
  assert.equal(p.thtMontati, 4);
  assert.equal(p.fonte, 'stima');
  assert.deepEqual(p.senzaPiedini, ['X1']);
});

test('campi del preventivo: a mano punti + filo, saldatrice stagno in grammi', () => {
  assert.deepEqual(campiStagno(40, 'mano'), { qntPuntiSaldaturaMano: 40, stagnoInFilo: 40 * STAGNO_A_PUNTO.filo });
  assert.deepEqual(campiStagno(40, 'onda'), { stagno: 40, stagnoPerSaldature: 0 });
  assert.equal(STAGNO_A_PUNTO.saldatrice, 0.02, 'Adriano 4/11/2026: 0,02 g a reoforo come in Impostazioni');
});

test('analisi dei documenti: punti dai piedini, fori in più segnalati, preventivo a onda con lo stagno della saldatrice', () => {
  const bom = leggiBomScheda([['Designator', 'Quantity', 'Value', 'Manufacturer P/N', 'Footprint', 'Mounting'],
    ['U1', '1', 'NE555', 'NE555P', 'DIP8', 'THT'], ['J1', '1', 'MORSETTO', 'PHX', 'TERMINAL_2P', 'THT'], ['C1', '1', '100n', 'GCM188', 'C0603', 'SMD']]).righe;
  // 8 + 2 piedini, 2 fori di test e 1 foro di fissaggio da 3,2 mm
  const fori = Array.from({ length: 12 }, (_, i) => `X${i + 1}.0Y1.0`).join('\n');
  const foratura = leggiForatura('f-PTH.drl', `M48\nMETRIC,TZ\nT1C1.000\nT2C3.200\n%\nT1\n${fori}\nT2\nX50.0Y50.0\nM30\n`);
  const a = analizzaScheda({ bom: { nome: 'bom.xlsx', righe: bom }, forature: [{ nome: 'f.drl', foratura }] });
  assert.equal(a.conteggi.refori, 10);
  assert.equal(a.conteggi.reforiDa, 'componenti');
  assert.equal(a.puntiSaldatura!.fori!.senzaComponente, 2);
  assert.equal(a.puntiSaldatura!.fori!.fissaggio, 1);
  assert.ok(a.segnalazioni.some(s => /2 fori metallizzati del Gerber non hanno un componente/.test(s.testo)));
  const { parametri } = parametriDaAnalisi(a);
  assert.equal(parametri.usaOnda, 1);
  assert.equal(parametri.stagno, 10);
  assert.equal(parametri.stagnoPerSaldature, 0);
});
