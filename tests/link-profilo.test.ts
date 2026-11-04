import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkPermesso, spegniLinkNonPermessi } from '../src/engine/link-profilo.js';

test('contabilità: link fuori dall\'Amministrazione diventano testo, pulsanti "+ Nuovo" spariscono', () => {
  const p = '<!doctype html><a href="/amministrazione/crediti">Crediti</a> <a href="/anagrafiche/clienti/3">ACME</a>'
    + ' <a class="bottone" href="/amministrazione/documenti/nuovo?tipo=ddt">+ Nuovo DDT</a> <a href="/guida/inizio">Guida</a>';
  const r = spegniLinkNonPermessi(p, 'contabilita');
  assert.match(r, /<a href="\/amministrazione\/crediti">Crediti<\/a>/);
  assert.match(r, /<span class="link-spento"[^>]*>ACME<\/span>/);
  assert.doesNotMatch(r, /Nuovo DDT/);
  assert.match(r, /href="\/guida\/inizio"/);
});

test('esterno: tutto tranne Impostazioni, buste paga, cassa e pagine nuovo', () => {
  assert.equal(linkPermesso('esterno', '/preventivi/12'), true);
  assert.equal(linkPermesso('esterno', '/impostazioni/fasi'), false);
  assert.equal(linkPermesso('esterno', '/preventivi/nuovo'), false);
  assert.equal(linkPermesso('esterno', '/amministrazione/analisi/cassa'), false);
});

test('ufficio e amministratore: la pagina non cambia; produzione solo reparto e guida', () => {
  const p = '<!doctype html><a href="/impostazioni">Impostazioni</a>';
  assert.equal(spegniLinkNonPermessi(p, 'ufficio'), p);
  assert.equal(spegniLinkNonPermessi(p, 'amministratore'), p);
  assert.equal(linkPermesso('produzione', '/r/c/ABC'), true);
  assert.equal(linkPermesso('produzione', '/commesse/1'), false);
});
