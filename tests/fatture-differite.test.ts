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

test('fatture differite: DDT da non fatturare con il motivo (Adriano 10/11/2026)', async () => {
  const { notaNonFatturare, MOTIVI_NON_FATTURARE, ddtDaFatturareRegola } = await import('../src/engine/ddt.js');
  assert.equal(notaNonFatturare('prima', '', 'Adriano', '10/11/2026'), 'Già fatturato prima della consegna, segnato da Adriano il 10/11/2026');
  assert.equal(notaNonFatturare('garanzia', '  scheda  rotta ', 'Adriano', '10/11/2026'), 'Riparazione in garanzia (scheda rotta), segnato da Adriano il 10/11/2026');
  assert.ok(notaNonFatturare('???', null, 'X', '1/1/2026').startsWith(MOTIVI_NON_FATTURARE.altro));
  // segnato = non più da fatturare (stessa colonna fatturato_altrove usata da elenco, differite e cruscotto)
  assert.equal(ddtDaFatturareRegola({ causale: 'VENDITA', origine: 'portale', valore: 100, fatturatoAltrove: notaNonFatturare('garanzia', '', 'A', 'oggi') }), false);
  assert.equal(ddtDaFatturareRegola({ causale: 'VENDITA', origine: 'portale', valore: 100, fatturatoAltrove: null }), true);
});

test('fatture differite: la scelta per riga si salva senza ricaricare la pagina (Adriano 10/11/2026)', async () => {
  const { readFileSync } = await import('node:fs');
  const js = readFileSync(new URL('../public/differite.js', import.meta.url), 'utf8');
  assert.match(js, /\/amministrazione\/differite\/scelta/);
  assert.match(js, /riga\.remove\(\)/);
  const rotta = readFileSync(new URL('../src/server/rotte/amministrazione.ts', import.meta.url), 'utf8');
  assert.match(rotta, /\['differite\.js'\]/);
  assert.match(rotta, /res\.json\(\{ ok: true, tolto/);
});

test('fatture differite: il DDT aperto da qui torna alle Fatture differite (Adriano 10/11/2026)', async () => {
  const { readFileSync } = await import('node:fs');
  const rotta = readFileSync(new URL('../src/server/rotte/amministrazione.ts', import.meta.url), 'utf8');
  assert.match(rotta, /documenti\/\$\{d\.id\}\?da=differite/);
  assert.match(rotta, /daDifferite \? html`<a href="\/amministrazione\/differite">/);
});

test('fatture differite: cruscotto e pagina contano gli stessi DDT (Adriano 10/11/2026)', async () => {
  const { readFileSync } = await import('node:fs');
  const { SQL_DDT_DIFFERITA } = await import('../src/engine/ddt.js');
  assert.match(SQL_DDT_DIFFERITA, /d\.numero IS NOT NULL AND d\.cliente_id IS NOT NULL/);
  assert.match(SQL_DDT_DIFFERITA, /f\.stato = 'bozza'/);   // DDT già in una bozza di fattura: né nella pagina né nell'avviso
  for (const f of ['../src/server/cruscotto-generale-servizio.ts', '../src/server/documenti-servizio.ts'])
    assert.match(readFileSync(new URL(f, import.meta.url), 'utf8'), /WHERE \$\{SQL_DDT_DIFFERITA\}/);
});
