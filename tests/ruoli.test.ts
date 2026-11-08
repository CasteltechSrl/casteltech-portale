import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contabilitaPuo, controlloEliminaUtente, controlloUtente, esternoPuo, eUfficio, paginaDopoAccesso, paginaIniziale, ruoloDaModulo, vedePaghe, vedeAnalisi, chiedePasswordRiservata, analisiPermessa, PERCORSO_ANALISI, DESCRIZIONI_RUOLI } from '../src/engine/ruoli.js';
import { acquistiPerFornitore } from '../src/engine/cruscotto-amministrazione.js';
import { layout } from '../src/server/views/layout.js';
import { html } from '../src/server/views/html.js';
import { cercaGuida } from '../src/engine/guida.js';

test('profilo Contabilità (commercialista, Sonia di HTS): solo lettura dell\'Amministrazione', () => {
  assert.equal(contabilitaPuo('GET', '/amministrazione'), true);
  assert.equal(contabilitaPuo('GET', '/amministrazione/registri/pacchetto'), true);
  assert.equal(contabilitaPuo('GET', '/amministrazione/documenti/12/xml'), true);
  assert.equal(contabilitaPuo('POST', '/amministrazione/documenti/12/emetti'), false);
  assert.equal(contabilitaPuo('POST', '/amministrazione/ricevuti/scadenze/3'), false);
  assert.equal(contabilitaPuo('GET', '/amministrazione/documenti/nuovo'), false);
  assert.equal(contabilitaPuo('GET', '/preventivi'), false);
  assert.equal(contabilitaPuo('GET', '/amministrazionefalsa'), false);
  assert.equal(paginaIniziale('contabilita'), '/amministrazione');
  assert.equal(ruoloDaModulo('contabilita'), 'contabilita');
  assert.equal(ruoloDaModulo('amministratore'), 'amministratore');
  assert.equal(ruoloDaModulo('capo'), 'produzione');
});

test('profilo Contabilità: nel menu solo pagine dell\'Amministrazione e Guida, con la scritta "sola lettura"', () => {
  const p = String(layout({ titolo: 'Prova', utente: { id: 1, nome: 'Commercialista', ruolo: 'contabilita' }, contenuto: html`` }));
  const gruppi = [...p.matchAll(/class="titolo-gruppo[^"]*"[^>]*>([^<]+)</g)].map(m => m[1]);
  assert.deepEqual(gruppi, []); // dal 1/11/2026 niente tendine: le pagine dell'Amministrazione in fila (tests/menu.test.ts)
  assert.match(p, /<nav class="menu menu-piatto">/);
  assert.match(p, /sola lettura/);
  assert.match(p, /<body class="sola-lettura">/);
  assert.doesNotMatch(p, /Impostazioni/);
});

test('acquisti per fornitore e mese: imponibile per mese, note di credito in negativo, fornitori dal più grande', () => {
  const r = acquistiPerFornitore([
    { fornitore_id: 2, nome: 'MOUSER', tipo: 'fattura', data: '2026-03-04', imponibile: 100 },
    { fornitore_id: 2, nome: 'MOUSER', tipo: 'fattura', data: '2026-03-20', imponibile: 50.5 },
    { fornitore_id: 2, nome: 'MOUSER', tipo: 'nota_credito', data: '2026-04-01', imponibile: 10 },
    { fornitore_id: null, nome: 'Affitto', tipo: 'fattura', data: '2026-03-01', imponibile: 1000 },
  ]);
  assert.deepEqual(r.righe.map(x => [x.nome, x.mesi[2], x.mesi[3], x.totale, x.documenti]), [['Affitto', 1000, 0, 1000, 1], ['MOUSER', 150.5, -10, 140.5, 3]]);
  assert.equal(r.mesi[2], 1150.5);
  assert.equal(r.totale, 1140.5);
});

test('guida: accesso del commercialista e acquisti del mese', () => {
  for (const [q, id] of [['accesso commercialista', 'accesso-contabilita'], ['utente sola lettura', 'accesso-contabilita'],
    ['cosa ho comprato a marzo', 'acquisti-mese'], ['acquisti per fornitore', 'acquisti-mese']])
    assert.ok(cercaGuida(q).slice(0, 2).some(r => r.argomento.id === id), q);
});

test('dopo l\'accesso il commercialista va al cruscotto dell\'Amministrazione (Adriano 1/11/2026)', () => {
  assert.equal(paginaDopoAccesso('contabilita', '/'), '/amministrazione');
  assert.equal(paginaDopoAccesso('contabilita', undefined), '/amministrazione');
  assert.equal(paginaDopoAccesso('contabilita', '/cruscotto'), '/amministrazione');
  assert.equal(paginaDopoAccesso('contabilita', '/preventivi?x=1'), '/amministrazione');
  assert.equal(paginaDopoAccesso('contabilita', '/amministrazione/registri?anno=2026'), '/amministrazione/registri?anno=2026');
  assert.equal(paginaDopoAccesso('contabilita', '//sito-esterno.it'), '/amministrazione');
  assert.equal(paginaDopoAccesso('ufficio', '/'), '/cruscotto');
  assert.equal(paginaDopoAccesso('ufficio', '/preventivi/3'), '/preventivi/3');
  assert.equal(paginaDopoAccesso('produzione', '/'), '/r');
});

test('ruolo Amministratore (Adriano 3/11/2026): fa tutto quello che fa l\'ufficio, entra nel cruscotto, ha Impostazioni nel menu', () => {
  assert.equal(eUfficio('amministratore'), true);
  assert.equal(eUfficio('ufficio'), true);
  assert.equal(eUfficio('contabilita'), false);
  assert.equal(eUfficio('esterno'), false);
  assert.equal(paginaIniziale('amministratore'), '/cruscotto');
  const p = String(layout({ titolo: 'Prova', utente: { id: 1, nome: 'Adriano', ruolo: 'amministratore' }, contenuto: html`` }));
  assert.match(p, /href="\/impostazioni"/);
  assert.doesNotMatch(p, /sola lettura/);
});

test('stipendi e buste paga: amministratore, contabilità, ufficio solo con il permesso; mai esterno e produzione', () => {
  assert.equal(vedePaghe({ ruolo: 'amministratore' }), true);
  assert.equal(vedePaghe({ ruolo: 'contabilita' }), true);
  assert.equal(vedePaghe({ ruolo: 'ufficio', paghe: false }), false);
  assert.equal(vedePaghe({ ruolo: 'ufficio', paghe: true }), true);
  assert.equal(vedePaghe({ ruolo: 'esterno', paghe: true }), false);
  assert.equal(vedePaghe({ ruolo: 'produzione', paghe: true }), false);
  assert.equal(vedePaghe(null), false);
  // la contabilità legge le buste paga e può solo aprirle con la password e richiuderle
  assert.equal(contabilitaPuo('GET', '/dipendenti/riservata'), true);
  assert.equal(contabilitaPuo('GET', '/dipendenti/riservata/cedolini/4'), true);
  assert.equal(contabilitaPuo('POST', '/dipendenti/riservata/sblocca'), true);
  assert.equal(contabilitaPuo('POST', '/dipendenti/riservata/chiudi'), true);
  assert.equal(contabilitaPuo('POST', '/dipendenti/riservata/permessi'), false);
  assert.equal(contabilitaPuo('POST', '/dipendenti/riservata/documenti/3/elimina'), false);
  assert.equal(contabilitaPuo('GET', '/dipendenti'), false);
  assert.equal(contabilitaPuo('GET', '/dipendenti/riservatafalsa'), false);
  assert.equal(contabilitaPuo('GET', '/amministrazione/analisi/cassa'), true);
  assert.equal(contabilitaPuo('GET', '/amministrazione/analisi'), false);   // Analisi: solo amministratore ed esterno (6/11/2026)
  // l'esterno non vede la previsione di cassa (da lì si ricavano gli stipendi)
  assert.equal(esternoPuo('GET', '/amministrazione/analisi/cassa'), false);
  assert.equal(esternoPuo('GET', '/amministrazione/analisi/cassa.xlsx'), false);
  assert.equal(esternoPuo('GET', '/amministrazione/analisi'), true);
});

test('Impostazioni → Utenti: solo l\'amministratore sceglie i ruoli e tocca gli amministratori; resta sempre un amministratore', () => {
  const base = { altriAmministratoriAttivi: 1 };
  // l'ufficio aggiunge solo utenti della produzione
  assert.equal(controlloUtente({ ...base, chi: 'ufficio', nuovo: true, ruoloNuovo: 'produzione' }), null);
  assert.match(controlloUtente({ ...base, chi: 'ufficio', nuovo: true, ruoloNuovo: 'contabilita' })!, /Solo l'amministratore/);
  assert.match(controlloUtente({ ...base, chi: 'ufficio', nuovo: true, ruoloNuovo: 'amministratore' })!, /Solo l'amministratore/);
  assert.equal(controlloUtente({ ...base, chi: 'amministratore', nuovo: true, ruoloNuovo: 'contabilita' }), null);
  // l'ufficio corregge nome/email/password ma non cambia ruoli e non tocca gli amministratori
  assert.equal(controlloUtente({ ...base, chi: 'ufficio', ruoloAttuale: 'produzione', ruoloNuovo: 'produzione', attivoNuovo: true }), null);
  assert.match(controlloUtente({ ...base, chi: 'ufficio', ruoloAttuale: 'produzione', ruoloNuovo: 'ufficio' })!, /cambiare il ruolo/);
  assert.match(controlloUtente({ ...base, chi: 'ufficio', ruoloAttuale: 'amministratore', ruoloNuovo: 'amministratore' })!, /utente amministratore/);
  // l'amministratore cambia i ruoli, ma non il proprio e non toglie l'ultimo amministratore
  assert.equal(controlloUtente({ ...base, chi: 'amministratore', ruoloAttuale: 'ufficio', ruoloNuovo: 'contabilita', attivoNuovo: true }), null);
  assert.equal(controlloUtente({ ...base, chi: 'amministratore', ruoloAttuale: 'ufficio', ruoloNuovo: 'amministratore', attivoNuovo: true }), null);
  assert.match(controlloUtente({ ...base, chi: 'amministratore', ruoloAttuale: 'amministratore', ruoloNuovo: 'ufficio', stessoUtente: true })!, /te stesso/);
  assert.match(controlloUtente({ ...base, chi: 'amministratore', ruoloAttuale: 'amministratore', ruoloNuovo: 'amministratore', attivoNuovo: false, stessoUtente: true })!, /te stesso/);
  assert.equal(controlloUtente({ ...base, chi: 'amministratore', ruoloAttuale: 'amministratore', ruoloNuovo: 'ufficio', attivoNuovo: true }), null);
  assert.match(controlloUtente({ chi: 'amministratore', ruoloAttuale: 'amministratore', ruoloNuovo: 'ufficio', attivoNuovo: true, altriAmministratoriAttivi: 0 })!, /almeno un amministratore/);
  // eliminare
  assert.equal(controlloEliminaUtente({ chi: 'ufficio', ruoloBersaglio: 'produzione', altriAmministratoriAttivi: 1 }), null);
  assert.match(controlloEliminaUtente({ chi: 'ufficio', ruoloBersaglio: 'amministratore', altriAmministratoriAttivi: 1 })!, /Solo l'amministratore/);
  assert.match(controlloEliminaUtente({ chi: 'amministratore', ruoloBersaglio: 'amministratore', altriAmministratoriAttivi: 0 })!, /almeno un amministratore/);
});

test('Analisi riservata (Adriano 6/11/2026): solo amministratore ed esterno; l\'ufficio e la contabilità non la aprono, la cassa segue la sua regola', () => {
  assert.equal(vedeAnalisi('amministratore'), true);
  assert.equal(vedeAnalisi('esterno'), true);
  assert.equal(vedeAnalisi('ufficio'), false);
  assert.equal(vedeAnalisi('contabilita'), false);
  assert.equal(vedeAnalisi('produzione'), false);
  for (const p of ['/amministrazione/analisi', '/amministrazione/analisi/', '/amministrazione/analisi/prodotti', '/amministrazione/analisi/pareggio.xlsx',
    '/amministrazione/analisi/fornitore', '/amministrazione/analisi.xlsx']) {
    assert.equal(PERCORSO_ANALISI.test(p), true, p);
    assert.equal(analisiPermessa('ufficio', p), false, p);
    assert.equal(analisiPermessa('contabilita', p), false, p);
    assert.equal(analisiPermessa('amministratore', p), true, p);
    assert.equal(analisiPermessa('esterno', p), true, p);
  }
  // fuori dall'Analisi l'ufficio apre tutto come prima; la Previsione di cassa resta a chi vede le paghe (la decide la sua pagina)
  assert.equal(analisiPermessa('ufficio', '/amministrazione'), true);
  assert.equal(analisiPermessa('ufficio', '/amministrazione/analisifalsa'), true);
  assert.equal(analisiPermessa('ufficio', '/amministrazione/analisi/cassa'), true);
  assert.equal(analisiPermessa('contabilita', '/amministrazione/analisi/cassa.xlsx'), true);
  assert.equal(esternoPuo('GET', '/amministrazione/analisi/pareggio'), true);
  assert.match(DESCRIZIONI_RUOLI.ufficio, /Analisi/);
});

// Adriano 8/11/2026: Banca e buste paga con password solo per ufficio e produzione
test('password delle aree riservate: solo ufficio e produzione', () => {
  assert.equal(chiedePasswordRiservata('ufficio'), true);
  assert.equal(chiedePasswordRiservata('produzione'), true);
  for (const r of ['amministratore', 'contabilita', 'esterno']) assert.equal(chiedePasswordRiservata(r), false, r);
  assert.equal(chiedePasswordRiservata(undefined), false);
});
