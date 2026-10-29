import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AREE_GUIDA, ARGOMENTI_GUIDA, cercaGuida, radice } from '../src/engine/guida.js';
process.env.DATABASE_URL ??= 'postgres://solo-per-i-test@localhost/nessuno';
const { leggiRispostaGuida } = await import('../src/server/guida-ia.js');

const primi = (q: string, n = 1) => cercaGuida(q).slice(0, n).map(r => r.argomento.id);

test('guida: argomenti con id unici, ogni area ha i suoi argomenti, pagine del portale', () => {
  const ids = ARGOMENTI_GUIDA.map(a => a.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const a of ARGOMENTI_GUIDA) assert.ok(AREE_GUIDA.some(x => x.id === a.area), `area sconosciuta: ${a.id}`);
  for (const area of AREE_GUIDA) assert.ok(ARGOMENTI_GUIDA.some(a => a.area === area.id), `area vuota: ${area.id}`);
  const sezioni = ['anagrafiche', 'preventivi', 'ordini', 'commesse', 'quotazioni', 'crm', 'amministrazione', 'impostazioni', 'suggerimenti', 'r'];
  for (const a of ARGOMENTI_GUIDA) for (const [href] of a.pagine) assert.ok(sezioni.includes(href.split(/[/?]/)[1]), `pagina sconosciuta: ${href}`);
});

test('guida: radice delle parole italiane', () => {
  assert.equal(radice('ordine'), radice('ordini'));
  assert.equal(radice('ordinare'), radice('ordine'));
  assert.equal(radice('caricare'), radice('caricamento'));
  assert.equal(radice('carico'), radice('carica'));
  assert.equal(radice('documento'), radice('documenti'));
  assert.equal(radice('ddt'), 'ddt');
});

test('guida: la ricerca porta all\'argomento giusto, anche con "+" e parole diverse', () => {
  assert.deepEqual(primi('ordine+documenti'), ['carica-ordine']);
  assert.deepEqual(primi('ordine documenti'), ['carica-ordine']);
  assert.ok(primi("dove salvo il file dell'ordine?", 2).includes('carica-ordine'));
  assert.deepEqual(primi('Caricare un ordine'), ['carica-ordine']);
  assert.deepEqual(primi('nota di credito'), ['nota-credito']);
  assert.deepEqual(primi('stornare una fattura'), ['nota-credito']);
  assert.deepEqual(primi('stampare la scheda di produzione'), ['crea-commessa']);
  assert.deepEqual(primi('preventivo essenziale'), ['stampa-preventivo']);
  assert.ok(primi('firma del cliente sul preventivo', 2).includes('stampa-preventivo'));
  assert.deepEqual(primi('tempi dal cellulare'), ['telefono']);
  assert.deepEqual(primi('gerber'), ['documenti-cliente']);
  assert.deepEqual(primi('BOLLA spedita'), ['ddt-acquisiti']);
  assert.deepEqual(primi("conferma d'ordine"), ['conferma-ordine']);
  assert.ok(primi('mandare la conferma al cliente con gmail', 2).includes('conferma-ordine'));
  assert.deepEqual(primi('backup'), ['backup']);
  assert.deepEqual(primi('PIN operatori', 1), ['operatori']);
  assert.ok(primi('cancellare un cliente', 3).includes('eliminare'));
});

test('guida: niente risultati per domande vuote o senza parole utili', () => {
  assert.deepEqual(cercaGuida(''), []);
  assert.deepEqual(cercaGuida('come si fa?'), []);
  assert.deepEqual(cercaGuida('xyzqwk'), []);
});

test('guida: risposta dell\'IA separata dagli argomenti (solo id esistenti, al massimo 3)', () => {
  const r = leggiRispostaGuida('Vai in Ordini → Da acquisire.\n1. Carica il file\n\nARGOMENTI: [carica-ordine], dove-file, inventato');
  assert.equal(r.risposta, 'Vai in Ordini → Da acquisire.\n1. Carica il file');
  assert.deepEqual(r.argomenti, ['carica-ordine', 'dove-file']);
  assert.deepEqual(leggiRispostaGuida('Non lo so.').argomenti, []);
  assert.equal(leggiRispostaGuida('**ARGOMENTI:** backup').argomenti[0], 'backup');
});

test('guida: preventivo da validare e stampe di montaggio si trovano', () => {
  assert.ok(primi('preventivo da validare', 2).includes('preventivo-da-validare'));
  assert.ok(primi('proteggere fori onda', 2).includes('documentazione-produzione'));
});

test('guida: segnalazione che va bene', () => {
  assert.ok(primi('segnalazione va bene', 2).includes('documenti-cliente'));
  assert.ok(primi('cartella troppo grande', 2).includes('documenti-cliente'));
});

test('guida: prodotto nuovo dal preventivo si trova', () => {
  assert.ok(primi('prodotto nuovo nel preventivo', 2).includes('prodotto-nuovo-preventivo'));
  assert.ok(primi('non trovo il codice nell\'elenco', 3).includes('prodotto-nuovo-preventivo'));
  assert.ok(primi('revisione 0', 3).includes('prodotto-nuovo-preventivo'));
});

test('guida: AOI visivo e BOM quotata', () => {
  assert.ok(primi('controllo visivo aoi', 2).includes('nuovo-preventivo'));
  assert.ok(primi('quotare la bom del cliente', 3).includes('bom-preventivo'));
  assert.ok(primi('componente non trovato alternativa', 3).includes('alternative-componenti'));
  assert.ok(primi('perché è critico', 3).includes('alternative-componenti'));
  assert.ok(primi('scrivere il prezzo a mano di un componente', 3).includes('alternative-componenti'));
});

test('guida: spunte e pulsanti negli elenchi (Adriano 29/10/2026)', () => {
  assert.ok(primi('eliminare più commesse insieme', 3).includes('azioni-elenchi'));
  assert.ok(primi('spuntare più righe', 2).includes('azioni-elenchi'));
});
