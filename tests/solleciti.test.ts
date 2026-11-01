import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { giorniRitardo, livelloSollecito, mailtoSollecito, oggettoSollecito, raggruppaScaduti, testoSollecito, type RataScaduta } from '../src/engine/solleciti.js';
import { cosaDaFare, type ContiDaFare } from '../src/engine/cruscotto-generale.js';
import { cercaGuida } from '../src/engine/guida.js';

const oggi = '2026-11-02';
const rata = (x: Partial<RataScaduta>): RataScaduta => ({ documentoId: 1, numero: '12/2026', dataFattura: '2026-08-01', scadenza: '2026-09-30', importo: 1000, clienteId: 5, cliente: 'ACME S.R.L.', email: 'amm@acme.it', ...x });

test('solleciti: rate scadute raggruppate per cliente, dal totale più alto; livello dal ritardo massimo', () => {
  const g = raggruppaScaduti([
    rata({}), rata({ documentoId: 2, numero: '20/2026', scadenza: '2026-10-25', importo: 500 }),
    rata({ documentoId: 3, clienteId: 7, cliente: 'BETA', scadenza: '2026-10-30', importo: 2000, email: null }),
    rata({ documentoId: 4, scadenza: '2026-11-02' }),           // scade oggi: non è scaduta
    rata({ documentoId: 5, scadenza: '2026-12-01' }),           // futura
  ], oggi);
  assert.deepEqual(g.map(x => [x.cliente, x.totale, x.rate.length, x.giorniMax, x.livello]), [['BETA', 2000, 1, 3, 'primo'], ['ACME S.R.L.', 1500, 2, 33, 'secondo']]);
  assert.equal(g[1].rate[0].numero, '12/2026');   // dalla più vecchia
  assert.equal(giorniRitardo('2026-09-30', oggi), 33);
  assert.deepEqual([livelloSollecito(0), livelloSollecito(29), livelloSollecito(30), livelloSollecito(60)], ['primo', 'primo', 'secondo', 'ultimo']);
});

test('solleciti: oggetto e testo con fatture, ritardo, totale e IBAN; tono che sale', () => {
  const [g] = raggruppaScaduti([rata({}), rata({ documentoId: 2, numero: '20/2026', scadenza: '2026-10-25', importo: 500 })], oggi);
  const oggetto = oggettoSollecito(g, 'CASTELTECH S.R.L.');
  assert.equal(oggetto, 'Secondo sollecito: 2 fatture scadute - CASTELTECH S.R.L.');
  const testo = testoSollecito(g, { azienda: 'CASTELTECH S.R.L.', iban: 'IT60X0542811101000000123456', banca: 'BPER', oggi, telefono: '0523 190 24 64' });
  assert.ok(testo.startsWith('Spett.le ACME S.R.L.'));
  assert.ok(testo.includes('nonostante il nostro precedente sollecito'));
  assert.ok(testo.includes('- fattura n. 12/2026 del 01/08/2026, scaduta il 30/09/2026: 1.000,00 € (33 giorni di ritardo)'));
  assert.ok(testo.includes('Totale scaduto: 1.500,00 €') && testo.includes('IBAN IT60X0542811101000000123456 (BPER)') && testo.includes('Tel. 0523 190 24 64'));
  const [ultimo] = raggruppaScaduti([rata({ scadenza: '2026-08-01' })], oggi);
  assert.ok(oggettoSollecito(ultimo, 'X').startsWith('Ultimo avviso: fattura n. 12/2026'));
  assert.ok(testoSollecito(ultimo, { azienda: 'X', oggi }).includes('entro 5 giorni'));
  assert.ok(!testoSollecito(ultimo, { azienda: 'X', oggi }).includes('IBAN'));
  assert.ok(mailtoSollecito('a@b.it', 'Ogg', 'riga 1\nriga 2').startsWith('mailto:a%40b.it?subject=Ogg&body=riga%201%0Ariga%202'));
});

test('solleciti: pagina in Amministrazione, voce nel menu, "incassi scaduti" del cruscotto porta ai solleciti, sollecito dalla scheda cliente', () => {
  const rotta = readFileSync('src/server/rotte/amministrazione.ts', 'utf8');
  assert.ok(rotta.includes("r.get('/solleciti'") && rotta.includes("r.post('/solleciti/:cliente/invia'") && rotta.includes("r.post('/solleciti/:cliente/registra'"));
  assert.ok(readFileSync('src/server/views/layout.ts', 'utf8').includes("['Solleciti incassi', '/amministrazione/solleciti']"));
  assert.ok(readFileSync('src/server/rotte/anagrafiche.ts', 'utf8').includes('/amministrazione/solleciti/${d.cliente.id}'));
  const zero: ContiDaFare = { sdiScartate: 0, sdiNonConsegnate: 0, consegneInRitardo: 0, preventiviDaValidare: 0, ordiniDaAcquisire: 0, acquisizioniInErrore: 0, ddtDaFatturare: 0, schedeScansionate: 0, tempiAperti: 0, crmScadute: 0, incassiScaduti: 0, pagamentiScaduti: 0, bozzeDocumenti: 0 };
  assert.equal(cosaDaFare({ ...zero, incassiScaduti: 3 })[0].link, '/amministrazione/solleciti');
  // il sollecito mandato resta nel CRM come attività email
  assert.ok(readFileSync('src/server/solleciti-servizio.ts', 'utf8').includes("INSERT INTO crm_attivita (azienda_id, data, tipo, descrizione, utente_id) VALUES ($1, $2, 'email'"));
  for (const q of ['sollecitare un pagamento', 'email al cliente per le fatture scadute'])
    assert.ok(cercaGuida(q).slice(0, 3).some(r => r.argomento.id === 'solleciti-incassi'), q);
});
