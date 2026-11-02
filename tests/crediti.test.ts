import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fasciaScaduto, giorniScaduta, riepilogoCrediti, ritornoSicuro, type RataCredito } from '../src/engine/crediti.js';
import { MENU_CONTABILITA, MENU_GRUPPI } from '../src/server/views/layout.js';
import { cercaGuida } from '../src/engine/guida.js';

const oggi = '2026-11-02';
let id = 0;
const rata = (x: Partial<RataCredito>): RataCredito => ({ scadenzaId: ++id, documentoId: id, numero: `${id}/2026`, dataFattura: '2026-08-01', scadenza: '2026-10-31',
  importo: 1000, clienteId: 5, cliente: 'ACME S.R.L.', pagataIl: null, ...x });

test('crediti: fasce dello scaduto 1–30, 31–60, 61–90, oltre 90; il giorno della scadenza non è scaduto', () => {
  assert.equal(fasciaScaduto('2026-11-02', oggi), null);
  assert.equal(fasciaScaduto('2026-11-20', oggi), null);
  assert.equal(fasciaScaduto('2026-11-01', oggi), 'f30');
  assert.equal(fasciaScaduto('2026-10-03', oggi), 'f30');   // 30 giorni
  assert.equal(fasciaScaduto('2026-10-02', oggi), 'f60');   // 31
  assert.equal(giorniScaduta('2026-09-03', oggi), 60);
  assert.equal(fasciaScaduto('2026-09-03', oggi), 'f60');   // 60
  assert.equal(fasciaScaduto('2026-09-02', oggi), 'f90');   // 61
  assert.equal(fasciaScaduto('2026-08-04', oggi), 'f90');   // 90
  assert.equal(fasciaScaduto('2026-08-03', oggi), 'oltre90');
});

test('crediti: totali, fasce, esposizione per cliente, note di credito che tolgono, prossimi 14 giorni', () => {
  const r = riepilogoCrediti([
    rata({ scadenza: '2026-10-20', importo: 1000 }),                         // 13 gg → f30
    rata({ scadenza: '2026-07-01', importo: 500 }),                          // oltre 90
    rata({ scadenza: '2026-11-10', importo: 300 }),                          // prossimi 14 gg
    rata({ scadenza: '2026-12-31', importo: 700 }),                          // a scadere, non prossima
    rata({ scadenza: '2026-10-20', importo: -200, numero: 'NC 1' }),         // nota di credito aperta
    rata({ clienteId: 7, cliente: 'BETA', scadenza: '2026-09-15', importo: 2000 }), // 48 gg → f60
    rata({ clienteId: 7, cliente: 'BETA', scadenza: '2026-11-16', importo: 100 }),  // 14 gg: ancora nei prossimi
    rata({ clienteId: 7, cliente: 'BETA', scadenza: '2026-11-17', importo: 100 }),  // 15 gg: fuori
  ], oggi);
  assert.equal(r.totale, 4500);
  assert.equal(r.scaduto, 3300);
  assert.equal(r.aScadere, 1200);
  assert.deepEqual(r.fasce, { f30: 800, f60: 2000, f90: 0, oltre90: 500 });
  assert.deepEqual(r.clienti.map(c => c.cliente), ['BETA', 'ACME S.R.L.']);   // prima chi ha più scaduto
  const acme = r.clienti[1];
  assert.equal(acme.esposizione, 2300);
  assert.equal(acme.scaduto, 1300);
  assert.equal(acme.rateAperte, 4);          // la nota di credito non conta come rata
  assert.equal(acme.ritardoMax, 124);
  assert.deepEqual(r.prossime.map(p => p.scadenza), ['2026-11-10', '2026-11-16']);
});

test('crediti: giorni medi di incasso sulle rate pagate degli ultimi 12 mesi; cliente tutto pagato non compare', () => {
  const r = riepilogoCrediti([
    rata({ dataFattura: '2026-06-01', pagataIl: '2026-07-01', scadenza: '2026-06-30' }),   // 30 gg
    rata({ dataFattura: '2026-08-01', pagataIl: '2026-09-30', scadenza: '2026-08-31' }),   // 60 gg
    rata({ dataFattura: '2024-01-01', pagataIl: '2024-12-31', scadenza: '2024-01-31' }),   // troppo vecchia: non conta
    rata({ scadenza: '2026-12-31', importo: 400 }),
    rata({ clienteId: 9, cliente: 'GAMMA', pagataIl: '2026-10-01' }),
  ], oggi);
  assert.equal(r.clienti.length, 1);
  assert.equal(r.clienti[0].giorniMediIncasso, 45);
  assert.equal(r.clienti[0].esposizione, 400);
});

test('crediti: dopo "Segna incassata" si torna solo a pagine dell\'Amministrazione', () => {
  assert.equal(ritornoSicuro('/amministrazione/crediti'), '/amministrazione/crediti');
  assert.equal(ritornoSicuro('/amministrazione/crediti?cliente=5'), '/amministrazione/crediti?cliente=5');
  assert.equal(ritornoSicuro('//sito-esterno.it'), null);
  assert.equal(ritornoSicuro('https://sito.it/amministrazione'), null);
  assert.equal(ritornoSicuro('/amministrazione/../preventivi'), null);
  assert.equal(ritornoSicuro(undefined), null);
});

test('crediti: nel menu Amministrazione (anche per la Contabilità) e nella guida', () => {
  const amm = MENU_GRUPPI.find(g => g.chiave === 'amministrazione')!;
  assert.ok(amm.voci.some(([, h]) => h === '/amministrazione/crediti'));
  assert.ok(MENU_CONTABILITA.some(([, h]) => h === '/amministrazione/crediti'));
  assert.equal(cercaGuida('crediti scaduti clienti')[0]?.argomento.id, 'crediti-clienti');
  assert.ok(cercaGuida('giorni medi di incasso').slice(0, 3).some(a => a.argomento.id === 'crediti-clienti'));
});
