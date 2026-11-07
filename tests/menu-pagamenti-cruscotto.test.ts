/**
 * Richieste di Adriano del 7/11/2026: Fatture fornitori negli Acquisti; RID e modi di pagamento/banche modificabili in Impostazioni;
 * controlli settimanali nel cruscotto sotto "Da fare oggi"; l'indirizzo del portale apre il cruscotto.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MENU_GRUPPI, MENU_CONTABILITA, tastiAcquisti } from '../src/server/views/layout.js';
import { MODI_PAGAMENTO, modoPagamento } from '../src/engine/amministrazione.js';
import { MODI_DI_SISTEMA, elencoDaTesto, leggiModiPagamento, modiDaUsare } from '../src/engine/modi-pagamento.js';
import type { Controllo } from '../src/engine/controlli.js';
import { cercaGuida } from '../src/engine/guida.js';
process.env.DATABASE_URL ??= 'postgres://solo-per-i-test@localhost/nessuno'; // il modulo db non si collega finché non si fanno query
const { sezioneControlli, RIGHE_CONTROLLO_CRUSCOTTO } = await import('../src/server/rotte/cruscotto-generale.js');

const voci = (chiave: string) => MENU_GRUPPI.find(g => g.chiave === chiave)!.voci;

test('Fatture fornitori nel menu Acquisti dopo ordini e DDT ricevuti, non più in Amministrazione (indirizzo invariato)', () => {
  assert.deepEqual(voci('acquisti').slice(0, 3).map(v => v[0]), ['Ordini a fornitore', 'DDT ricevuti', 'Fatture fornitori']);
  assert.equal(voci('acquisti')[2][1], '/amministrazione/ricevuti');
  assert.ok(!voci('amministrazione').some(v => v[1] === '/amministrazione/ricevuti'));
  // il commercialista (menu piatto) le vede ancora
  assert.ok(MENU_CONTABILITA.some(v => v[1] === '/amministrazione/ricevuti'));
  const tasti = String(tastiAcquisti('/amministrazione/ricevuti'));
  assert.match(tasti, /<a href="\/amministrazione\/ricevuti" class="attivo">Fatture fornitori<\/a>/);
  const rotte = readFileSync(new URL('../src/server/rotte/amministrazione.ts', import.meta.url), 'utf8');
  assert.match(rotte, /req\.path\.startsWith\('\/ricevuti'\) \? 'acquisti'/);
  const cruscottoAmm = readFileSync(new URL('../src/server/rotte/cruscotto-amministrazione.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(cruscottoAmm, /\['ricevuti', '\/amministrazione\/ricevuti'/);
});

test('RID tra i modi di pagamento; il modo si controlla sull\'elenco scritto in Impostazioni', () => {
  assert.ok(MODI_PAGAMENTO.includes('RID'));
  assert.equal(modoPagamento('rid'), 'RID');
  assert.equal(modoPagamento('Assegno'), null);
  assert.equal(modoPagamento('assegno', ['Bonifico', 'Assegno']), 'Assegno');
  assert.equal(modoPagamento('Bonifico', ['Assegno']), null);
});

test('elenchi dei modi e delle banche: una voce per riga, doppioni e righe vuote tolti; compensato e stornato restano sempre', () => {
  assert.deepEqual(elencoDaTesto(' Bonifico \r\n\nbonifico\nRID\n  Carta   di credito '), ['Bonifico', 'RID', 'Carta di credito']);
  assert.deepEqual(modiDaUsare(['Bonifico', 'RID']), ['Bonifico', 'RID', ...MODI_DI_SISTEMA]);
  assert.deepEqual(modiDaUsare([]), [...MODI_PAGAMENTO]);           // elenco svuotato = quello di partenza
  assert.deepEqual(modiDaUsare(undefined), [...MODI_PAGAMENTO]);
  // banche: finché non si salvano, quelle già usate nelle rate; salvate (anche vuote) valgono quelle
  assert.deepEqual(leggiModiPagamento({}, ['Bper', 'bper', 'Credit Agricole']).strumenti, ['Bper', 'Credit Agricole']);
  assert.deepEqual(leggiModiPagamento({ strumenti: ['Bper', 'Carta di credito aziendale'] }, ['Deutsche Bank']).strumenti, ['Bper', 'Carta di credito aziendale']);
  assert.deepEqual(leggiModiPagamento({ strumenti: [] }, ['Deutsche Bank']).strumenti, []);
});

test('Impostazioni → Amministrazione: sezione "Modi di pagamento e banche" e RID (MP09) nelle condizioni di pagamento', () => {
  const src = readFileSync(new URL('../src/server/rotte/impostazioni-amministrazione.ts', import.meta.url), 'utf8');
  assert.match(src, /<h2 id="modi-pagamento">Modi di pagamento e banche<\/h2>/);
  assert.match(src, /r\.post\('\/modi-pagamento'/);
  const stampa = readFileSync(new URL('../src/server/views/stampa-documento.ts', import.meta.url), 'utf8');
  assert.match(stampa, /MP09: 'RID'/);
});

const controllo = (livello: Controllo['livello'], n: number, chiave = 'prova'): Controllo => ({
  chiave, titolo: `Controllo ${livello}`, livello, spiegazione: 'Cosa fare.',
  righe: Array.from({ length: n }, (_, i) => ({ testo: `Riga ${i + 1}`, link: `/x/${i + 1}` })),
});

test('controlli settimanali nel cruscotto: un riquadro per controllo, urgenti aperti, prime righe e link alla pagina completa', () => {
  const h = String(sezioneControlli([controllo('urgente', 3, 'commesse'), controllo('normale', RIGHE_CONTROLLO_CRUSCOTTO + 4, 'preventivi')]));
  assert.match(h, /<h3>Controlli settimanali<\/h3>/);
  assert.match(h, /<details class="controllo urgente" open>/);
  assert.match(h, /<details class="controllo normale" >/);
  assert.equal((h.match(/<li>/g) ?? []).length, 3 + RIGHE_CONTROLLO_CRUSCOTTO);
  assert.match(h, /href="\/amministrazione\/controlli#preventivi">tutte le 12 →/);
  assert.match(String(sezioneControlli([])), /Tutto a posto/);
  // sotto "Da fare oggi", prima dei numeri chiave
  const src = readFileSync(new URL('../src/server/rotte/cruscotto-generale.ts', import.meta.url), 'utf8');
  assert.ok(src.indexOf('<h3>Da fare oggi</h3>') < src.indexOf('${controlli ? sezioneControlli(controlli)') && src.indexOf('${controlli ? sezioneControlli(controlli)') < src.indexOf('<div class="cifre cifre-sei">'));
});

test('l\'indirizzo del portale apre il cruscotto: senza accesso si va al login (anche col reparto ricordato), poi al cruscotto', () => {
  const index = readFileSync(new URL('../src/server/index.ts', import.meta.url), 'utf8');
  assert.match(index, /app\.get\('\/', \(req, res\) => \{\n  if \(!req\.session\.utente\) return res\.redirect\('\/login'\);/);
  assert.match(index, /continua come \$\{operatore\}/);
});

test('guida: RID, modi di pagamento e fatture fornitori negli acquisti', () => {
  assert.ok(cercaGuida('aggiungere un modo di pagamento RID').slice(0, 2).some(r => r.argomento.id === 'incassi-pagamenti'));
  assert.ok(cercaGuida('dove sono le fatture fornitori nel menu').slice(0, 3).some(r => r.argomento.id === 'menu-gruppi'));
  assert.ok(cercaGuida('controlli settimanali nel cruscotto').slice(0, 2).some(r => ['controlli-settimanali', 'cruscotto-generale'].includes(r.argomento.id)));
});
