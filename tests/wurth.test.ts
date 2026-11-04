/**
 * Würth Elektronik (Customer API, Adriano 4/11/2026): solo i codici WE, prezzi + disponibilità uniti in un'offerta,
 * scaglioni dalle quantità chieste, il fornitore dell'anagrafica è Würth Elektronik e non Würth (viteria).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { articoloWurth, codiceWurth, corpoWurth, offerteWurth, QUANTITA_WURTH } from '../src/engine/wurth.js';
import { NOMI_FORNITORI } from '../src/engine/acquisti.js';
import { fornitorePerDistributore } from '../src/engine/ordini-fornitore.js';

test('Würth: si chiede solo per i codici WE', () => {
  for (const pn of ['885012206071', '744227', '7447709100', 'WE-744227', '74404042010A']) assert.ok(codiceWurth(pn), pn);
  for (const pn of ['RC0603FR-072K2L', 'BAV99', 'STM32L151RCT6', '12345', '']) assert.ok(!codiceWurth(pn), pn);
  assert.equal(articoloWurth(' we-744227 '), '744227');
  const c = corpoWurth(['WE-744227']);
  assert.equal(c.articles[0].articleNumber, '744227');
  assert.deepEqual(c.articles[0].quantities, QUANTITA_WURTH);
  assert.equal(NOMI_FORNITORI.wurth, 'Würth Elektronik');
});

test('Würth: prezzi e disponibilità diventano un\'offerta con gli scaglioni', () => {
  const prezzi = [
    { articleNumber: '885012206071', requestedArticleNumber: '885012206071', requestedQuantity: 1,
      articlePrices: [{ quantity: 1, price: 0.05, baseUnit: 'STK', currency: 'EUR' }, { quantity: 10, price: 0.05, currency: 'EUR' }] },
    { articleNumber: '885012206071', requestedArticleNumber: '885012206071', requestedQuantity: 1000,
      articlePrices: [{ quantity: 1000, price: 0.01234, baseUnit: 'STK', currency: 'EUR' }] },
  ];
  const disp = [{ articleNumber: '885012206071', requestedArticleNumber: '885012206071', currentStock: 15000, leadTime: 15, spq: '1000' }];
  const m = offerteWurth(['885012206071', '744227'], prezzi, disp);
  const [o] = m.get('885012206071')!;
  assert.equal(o.fornitore, 'wurth');
  assert.equal(o.stock, 15000);
  assert.equal(o.moq, 1);
  assert.deepEqual(o.scaglioni, [{ qta: 1, prezzo: 0.05 }, { qta: 1000, prezzo: 0.01234 }], 'stesso prezzo a 10 pz: un solo scaglione');
  assert.equal(o.valuta, 'EUR');
  assert.equal(o.ciclo, null, 'prezzo al pezzo: nessuna nota');
  assert.equal(o.consegnaSettimane, 15);
  assert.deepEqual(m.get('744227'), [], 'codice senza prezzo: nessuna offerta');
  assert.deepEqual(offerteWurth(['744227'], null, null).get('744227'), []);
});

test('Würth: prezzo per un\'altra unità viene segnalato', () => {
  const [o] = offerteWurth(['WE-744227'], [{ articleNumber: '744227', articlePrices: [{ quantity: 1, price: 12, baseUnit: '1000', currency: 'EUR' }] }], []).get('WE-744227')!;
  assert.match(String(o.ciclo), /prezzo per 1000/);
});

test('Würth Elektronik nell\'anagrafica fornitori, non Würth S.r.l.', () => {
  const f = [{ id: 1, ragione_sociale: 'WÜRTH S.R.L.' }, { id: 2, ragione_sociale: 'WÜRTH ELEKTRONIK ITALIA S.R.L.' }];
  assert.equal(fornitorePerDistributore('wurth', f)?.id, 2);
  assert.equal(fornitorePerDistributore('wurth', [{ id: 3, ragione_sociale: 'WURTH ELEKTRONIK EISOS GMBH & CO. KG' }])?.id, 3);
  assert.equal(fornitorePerDistributore('wurth', [f[0]]), null);
});
