import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contaDifferite, differitePerCliente, testoDifferite, type DdtAperto } from '../src/engine/fatture-differite.js';
import { cosaDaFare, type ContiDaFare } from '../src/engine/cruscotto-generale.js';

const ddt = (id: number, data: string, clienteId: number, cliente = `CLIENTE ${clienteId}`): DdtAperto => ({ id, numero: id, data, clienteId, cliente });

test('fatture differite: il termine è il 15 del mese dopo il DDT più vecchio; scaduto / in scadenza / dopo', () => {
  const lista = [ddt(1, '2026-10-20', 1), ddt(2, '2026-11-03', 1), ddt(3, '2026-09-28', 2), ddt(4, '2026-11-05', 3)];
  const g = differitePerCliente(lista, '2026-11-02');
  assert.deepEqual(g.map(x => [x.clienteId, x.termine, x.scaduto, x.inScadenza, x.ddt.map(d => d.id)]), [
    [2, '2026-10-15', true, false, [3]],       // settembre: andava fatturato entro il 15/10
    [1, '2026-11-15', false, true, [1, 2]],    // ottobre: entro il 15/11, con il DDT di novembre nella stessa fattura
    [3, '2026-12-15', false, false, [4]],      // novembre: c'è tempo
  ]);
  // dopo il 15 anche ottobre è scaduto
  assert.deepEqual(differitePerCliente(lista, '2026-11-16').map(x => [x.clienteId, x.scaduto]), [[2, true], [1, true], [3, false]]);
  // dicembre → 15 gennaio dell'anno dopo
  assert.equal(differitePerCliente([ddt(9, '2026-12-30', 5)], '2027-01-02')[0].termine, '2027-01-15');
});

test('fatture differite: conteggio per il cruscotto e frase (giallo dal 1°, rosso dal 16)', () => {
  const date = [{ data: '2026-10-20' }, { data: '2026-10-28' }, { data: '2026-09-02' }, { data: '2026-11-02' }];
  assert.deepEqual(contaDifferite(date, '2026-11-03'), { scaduti: 1, inScadenza: 2, termine: '2026-11-15' });
  assert.equal(testoDifferite(contaDifferite(date, '2026-11-03')), '1 DDT da fatturare oltre il termine (il 15 del mese dopo il DDT)');
  assert.deepEqual(contaDifferite(date, '2026-11-16'), { scaduti: 3, inScadenza: 0, termine: '2026-11-15' });
  assert.equal(testoDifferite(contaDifferite([{ data: '2026-10-20' }], '2026-11-03')), '1 DDT del mese scorso da fatturare entro il 15/11');
  assert.equal(testoDifferite(contaDifferite([{ data: '2026-11-02' }], '2026-11-03')), null);   // DDT del mese in corso: niente avviso
  // "Da fare oggi": rossa se scadute, gialla se in scadenza, con il link alla pagina
  const zero = { sdiScartate: 0, sdiNonConsegnate: 0, consegneInRitardo: 0, preventiviDaValidare: 0, ordiniDaAcquisire: 0, acquisizioniInErrore: 0,
    ddtDaFatturare: 0, schedeScansionate: 0, tempiAperti: 0, crmScadute: 0, incassiScaduti: 0, pagamentiScaduti: 0, bozzeDocumenti: 0 } satisfies ContiDaFare;
  const v = cosaDaFare({ ...zero, differiteScadute: 2, differiteInScadenza: 3 });
  assert.deepEqual(v.map(x => [x.chiave, x.livello, x.link]), [['differite-scadute', 'urgente', '/amministrazione/differite'], ['differite-in-scadenza', 'controllare', '/amministrazione/differite']]);
});
