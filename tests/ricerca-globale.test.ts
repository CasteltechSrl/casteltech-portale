import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpretaRicerca, chiaveNumero, puntiRisultato, ordinaRisultati, raggruppaRisultati, risultatoDiretto, type RisultatoRicerca } from '../src/engine/ricerca-globale.js';
import { layout } from '../src/server/views/layout.js';
import { html } from '../src/server/views/html.js';
import { contabilitaPuo } from '../src/engine/ruoli.js';

test('ricerca unica: capisce numeri di commessa, numero/anno, partita IVA e testo', () => {
  assert.equal(interpretaRicerca('C2026-0012').commessa, 'C2026-0012');
  assert.equal(interpretaRicerca('c2026-12').commessa, 'C2026-0012');
  assert.deepEqual(interpretaRicerca('2026/12'), { testo: '2026/12', commessa: 'C2026-0012', numero: { numero: 12, anno: 2026 } });
  assert.deepEqual(interpretaRicerca('12/2026').numero, { numero: 12, anno: 2026 });
  assert.deepEqual(interpretaRicerca('12/26').numero, { numero: 12, anno: 2026 });
  assert.deepEqual(interpretaRicerca(' 204 ').numero, { numero: 204 });
  assert.equal(interpretaRicerca('01777320332').partitaIva, '01777320332');
  assert.equal(interpretaRicerca('IT01777320332').partitaIva, '01777320332');
  const t = interpretaRicerca('  rossi   milano ');
  assert.equal(t.testo, 'rossi milano');
  assert.equal(t.numero, undefined);
  assert.equal(t.commessa, undefined);
});

const voci: RisultatoRicerca[] = [
  { tipo: 'guida', titolo: 'Le commesse', href: '/guida/commesse#x' },
  { tipo: 'prodotto', titolo: 'EA1002-0', dettaglio: 'SCHEDA · ROSSI S.R.L.', href: '/anagrafiche/prodotti?cliente=1', chiave: 'EA1002-0' },
  { tipo: 'commessa', titolo: 'Commessa C2026-0012', dettaglio: 'ROSSI S.R.L. · EA1002-0', href: '/commesse/12', chiave: 'C2026-0012' },
  { tipo: 'cliente', titolo: 'ROSSI S.R.L.', href: '/anagrafiche/clienti/1', chiave: 'ROSSI S.R.L.' },
  { tipo: 'cliente', titolo: 'ROSSINI S.P.A.', href: '/anagrafiche/clienti/2', chiave: 'ROSSINI S.P.A.' },
];

test('ricerca unica: prima quel che corrisponde esattamente, poi chi comincia così, poi per gruppo', () => {
  const ordine = ordinaRisultati(voci, 'c2026-0012').map(v => v.tipo);
  assert.deepEqual(ordine.slice(0, 1), ['commessa']);
  const rossi = ordinaRisultati(voci, 'rossi').map(v => v.titolo);
  assert.equal(rossi[0], 'ROSSI S.R.L.');
  assert.equal(rossi[1], 'ROSSINI S.P.A.');           // comincia con "rossi"
  assert.ok(rossi.indexOf('EA1002-0') > 1);           // contiene "ROSSI" solo nel dettaglio
  // raggruppati nell'ordine dei gruppi, senza gruppi vuoti
  assert.deepEqual(raggruppaRisultati(voci).map(g => g.nome), ['Clienti', 'Prodotti', 'Commesse', 'Guida']);
});

test('ricerca unica: "2026/5" vale come "5/2026"; "204" è uguale a tutti i 204/anno (elenco, non salto)', () => {
  assert.equal(chiaveNumero('2026/5'), '5/2026');
  assert.equal(chiaveNumero('5-26'), '5/2026');
  assert.equal(chiaveNumero('204'), '204');
  assert.equal(chiaveNumero('rossi'), undefined);
  const ddt = (anno: number): RisultatoRicerca => ({ tipo: 'documento', titolo: `DDT 204/${anno}`, href: `/d/${anno}`, chiave: `204/${anno}` });
  assert.equal(puntiRisultato(ddt(2026), '2026/204'), 100);
  assert.equal(puntiRisultato(ddt(2026), '204'), 100);
  assert.equal(puntiRisultato(ddt(2025), '204/2026'), 10);
  assert.equal(risultatoDiretto([ddt(2026), ddt(2025)], '204'), undefined);
  assert.equal(risultatoDiretto([ddt(2026), ddt(2025)], '204/2026')?.href, '/d/2026');
});

test('ricerca unica: con un solo risultato (o uno esatto) si va dritti alla pagina', () => {
  assert.equal(risultatoDiretto(voci, 'C2026-0012')?.href, '/commesse/12');
  assert.equal(risultatoDiretto(voci, 'rossi'), undefined);               // due clienti simili: elenco
  assert.equal(risultatoDiretto([voci[1]], 'ea10')?.href, voci[1].href); // uno solo
  assert.equal(risultatoDiretto([], 'x'), undefined);
});

test('ricerca unica: casella nella testata per ufficio e contabilità, non per la produzione; la contabilità può aprire /cerca', () => {
  const pagina = (ruolo: 'ufficio' | 'produzione' | 'contabilita') => String(layout({ titolo: 'Prova', utente: { id: 1, nome: 'Prova', ruolo }, contenuto: html`` }));
  assert.ok(pagina('ufficio').includes('class="cerca-globale"') && pagina('ufficio').includes('action="/cerca"'));
  assert.ok(pagina('contabilita').includes('class="cerca-globale"'));
  assert.ok(!pagina('produzione').includes('cerca-globale'));
  assert.ok(pagina('ufficio').includes('/static/cerca.js'));
  assert.equal(contabilitaPuo('GET', '/cerca'), true);
  assert.equal(contabilitaPuo('POST', '/cerca'), false);
});
