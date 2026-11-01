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
  const sezioni = ['anagrafiche', 'preventivi', 'ordini', 'commesse', 'quotazioni', 'crm', 'amministrazione', 'impostazioni', 'suggerimenti', 'r', 'cruscotto', 'qualita', 'dipendenti', 'cerca'];
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
  assert.ok(primi('data di consegna al cliente', 2).includes('data-consegna'));
  assert.ok(primi('togliere una riga sbagliata dalla bom', 2).includes('codifica-bom'));
  assert.ok(primi('pasta saldante dai gerber', 2).includes('documenti-cliente'));
  assert.ok(primi('prezzo di vendita del prodotto', 2).includes('prezzi-anagrafiche'));
  assert.ok(primi('ultimo prezzo di acquisto componente', 2).includes('prezzi-anagrafiche'));
  assert.ok(primi('prezzo a scaglioni di quantità', 2).includes('prezzi-anagrafiche'));
  assert.ok(primi('codice dal menu nella fattura', 3).includes('nuova-fattura'));
  assert.ok(primi('aggiornare il prezzo in anagrafica', 3).includes('prezzi-anagrafiche'));
  assert.deepEqual(primi('stornare una fattura'), ['nota-credito']);
  assert.ok(primi('fattura INFN split payment', 2).includes('pubblica-amministrazione'));
  assert.ok(primi('codice ufficio CIG pubblica amministrazione', 2).includes('pubblica-amministrazione'));
  assert.ok(primi('fattura di acconto', 2).includes('tipi-fattura'));
  assert.ok(primi('nota di debito', 2).includes('tipi-fattura'));
  assert.ok(primi('ritenuta acconto commercialista F24', 2).includes('ritenute-fornitori'));
  assert.deepEqual(primi('fattura scartata dallo SdI', 1), ['invio-sdi']);
  assert.deepEqual(primi('inviare allo sdi', 1), ['invio-sdi']);
  assert.ok(primi('fatture fornitori arrivate dallo sdi', 3).includes('incassi-pagamenti'));
  assert.deepEqual(primi('fare un ddt', 1), ['ddt-emessi']);
  assert.ok(primi('pdf della fattura per il cliente', 3).includes('nuova-fattura'));
  assert.ok(primi('stampare la bolla', 3).includes('ddt-emessi'));
  assert.deepEqual(primi('stampare la scheda di produzione'), ['crea-commessa']);
  assert.deepEqual(primi('preventivo essenziale'), ['stampa-preventivo']);
  assert.ok(primi('sconto sul preventivo', 2).includes('stampa-preventivo'));
  assert.ok(primi('firma del cliente sul preventivo', 2).includes('stampa-preventivo'));
  assert.deepEqual(primi('tempi dal cellulare'), ['telefono']);
  assert.deepEqual(primi('gerber'), ['documenti-cliente']);
  assert.ok(primi('due codici diversi nella bom', 2).includes('alternative-componenti'));
  assert.ok(primi('mail con due codici e forecast', 2).includes('pulsante-gmail'));
  assert.ok(primi('cicli di lavorazione della mail', 2).includes('preventivo-da-validare'));
  assert.ok(primi('bom con alternative pref alt', 2).includes('documenti-cliente'));
  assert.deepEqual(primi('BOLLA spedita'), ['ddt-acquisiti']);
  assert.deepEqual(primi("conferma d'ordine"), ['conferma-ordine']);
  assert.ok(primi('mandare la conferma al cliente con gmail', 2).includes('conferma-ordine'));
  assert.ok(primi('ordine al fornitore', 2).includes('ordini-fornitore'));
  assert.ok(primi('comprare i componenti da mouser', 2).includes('ordini-fornitore'));
  assert.ok(primi('merce arrivata dal fornitore', 2).includes('ordini-fornitore'));
  assert.deepEqual(primi('backup'), ['backup']);
  assert.deepEqual(primi('credito anthropic finito', 1), ['servizi']);
  assert.deepEqual(primi('quanti token sto usando', 1), ['servizi']);
  assert.ok(primi('memoria di render', 2).includes('servizi'));
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
  assert.ok(primi('codici senza cliente', 2).includes('prodotti'));
  assert.ok(primi('codice non assegnato', 3).includes('prodotti'));
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

test('guida: pulsante di Gmail si trova', () => {
  assert.ok(primi('mandare una mail al portale', 2).includes('pulsante-gmail'));
  assert.ok(primi('pulsante gmail preventivo', 2).includes('pulsante-gmail'));
  assert.ok(primi('richiesta offerta arrivata per email con allegati', 3).includes('pulsante-gmail'));
});

test('guida: versioni della stessa scheda e file aggiunti dopo', () => {
  assert.ok(primi('dividi per versione', 3).includes('pulsante-gmail'));
  assert.ok(primi('aggiungere file mancanti', 3).includes('pulsante-gmail'));
});

test('guida: SMD montati a mano', () => {
  assert.ok(primi('smd a mano giostra', 3).includes('nuovo-preventivo'));
});

test('guida: mail .eml nella cartella', () => {
  assert.ok(primi('mail eml', 3).includes('pulsante-gmail'));
});

test('guida: spunte nell\'elenco dei documenti emessi', () => {
  assert.ok(primi('eliminare più bozze di fattura insieme', 3).includes('azioni-documenti'));
  assert.ok(primi('scaricare xml di più fatture', 3).includes('azioni-documenti'));
});

test('guida: calendario dei ritardi e domande sui suggerimenti', () => {
  assert.ok(primi('commesse in ritardo nel calendario google', 3).includes('calendario-ritardi'));
  assert.ok(primi('rispondere alla domanda su un suggerimento', 3).includes('suggerimento'));
});
