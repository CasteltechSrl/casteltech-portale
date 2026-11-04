/** Correzioni del controllo notturno del 4/11/2026. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { valoreAttributo } from '../src/engine/attributi-fatturapa.js';
import { emailFattura } from '../src/engine/fattura-email.js';

test('attributi FatturaPA: numero colli 0 rifiutato (lo schema vuole da 1), giorni termini pagamento 0 ammesso', () => {
  assert.match(valoreAttributo({ nome: 'NumeroColli', tipo: 'intero', max: 4 } as any, '0').errore ?? '', /almeno 1/);
  assert.equal(valoreAttributo({ nome: 'NumeroColli', tipo: 'intero', max: 4 } as any, '3').valore, '3');
  assert.equal(valoreAttributo({ nome: 'GiorniTerminiPagamento', tipo: 'intero', max: 3 } as any, '0').valore, '0');
});

test('email della fattura in split payment: dice anche il netto da pagare', () => {
  const e = emailFattura({ tipo: 'fattura', numero: 5, data: '2026-11-04', azienda: 'Casteltech S.r.l.', totale: 122, nettoDaPagare: 100 });
  assert.match(e.testo, /totale 122,00 €, netto da pagare 100,00 €/);
  const n = emailFattura({ tipo: 'fattura', numero: 5, data: '2026-11-04', azienda: 'Casteltech S.r.l.', totale: 122 });
  assert.doesNotMatch(n.testo, /netto da pagare/);
});

import { piediniDaTesto } from '../src/engine/scheda/piedini.js';
test('punti di saldatura: impronte KiCad con "_" dopo il numero', () => {
  assert.equal(piediniDaTesto('DIP-16_W7.62mm_Socket'), 16);
  assert.equal(piediniDaTesto('TO-92_Inline'), 3);
  assert.equal(piediniDaTesto('TO-220AB'), 3);
  assert.equal(piediniDaTesto('D_DO-35_SOD27_P7.62mm_Horizontal'), 2);
  assert.equal(piediniDaTesto('LED_D5.0mm'), 2);
});

import { pareggiaSulPiuGrande, prezziComeInStampa } from '../src/engine/stampa-preventivo.js';
test('una tantum: prezzo "con" riscritto vicino al "senza" non stampa voci negative, l\'ordine ha le stesse', () => {
  const voci = [{ nome: 'Doc', prezzo: 30 }, { nome: 'Prog', prezzo: 20 }, { nome: 'Lamina', prezzo: 110 }];
  const v = voci.map(x => ({ ...x }));
  pareggiaSulPiuGrande(v, x => x.prezzo, (x, n) => { x.prezzo = n; }, 10);
  assert.ok(v.every(x => x.prezzo >= 0));
  assert.equal(Math.round(v.reduce((a, x) => a + x.prezzo, 0) * 100) / 100, 10);
  const o = prezziComeInStampa({ prezzoScheda: 100, prezzoSchedaConUnaTantum: 132, unaTantum: 160, prezzoLotto: 500 }, 5, voci, { senza: null, con: 102 });
  assert.equal(Math.round(o.unaTantum.reduce((a, x) => a + x.prezzo, 0) * 100) / 100, 10);
  // centesimi di arrotondamento: sempre sulla voce più grande
  const w = voci.map(x => ({ ...x }));
  pareggiaSulPiuGrande(w, x => x.prezzo, (x, n) => { x.prezzo = n; }, 160.03);
  assert.deepEqual(w.map(x => x.prezzo), [30, 20, 110.03]);
});

test('ordine dal preventivo: prende lo sconto della stampa', () => {
  const o = prezziComeInStampa({ prezzoScheda: 100, prezzoSchedaConUnaTantum: 132, unaTantum: 160, prezzoLotto: 500 }, 5,
    [{ nome: 'Lamina', prezzo: 160 }], { senza: null, con: null }, { tipo: 'percento', valore: 10 });
  assert.equal(o.prezzoScheda, 90);
  assert.equal(o.unaTantum[0].prezzo, 144);
});

import { leggiRitocchi } from '../src/engine/stampa-preventivo.js';
test('stampa del preventivo: "1.800" scritto come prezzo vale 1800', () => {
  assert.equal(leggiRitocchi({ prezzoSenza: '1.800' }).prezzi.senza, 1800);
  assert.equal(leggiRitocchi({ prezzoSenza: '12.5' }).prezzi.senza, 12.5);
  assert.equal(leggiRitocchi({ prezzoSenza: '1.250,50' }).prezzi.senza, 1250.5);
});
