import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caricoSettimane, cosaDaFare, euroBreve, lunedi, saluto, scadenzeFiscali, settimanaIso, type ContiDaFare } from '../src/engine/cruscotto-generale.js';
import { paginaIniziale } from '../src/engine/ruoli.js';

const zero: ContiDaFare = {
  sdiScartate: 0, sdiNonConsegnate: 0, consegneInRitardo: 0, preventiviDaValidare: 0, ordiniDaAcquisire: 0, acquisizioniInErrore: 0,
  ddtDaFatturare: 0, schedeScansionate: 0, tempiAperti: 0, crmScadute: 0, incassiScaduti: 0, pagamentiScaduti: 0, bozzeDocumenti: 0,
};

test('il cruscotto generale è la pagina iniziale dell\'ufficio (Adriano 31/10/2026)', () => {
  assert.equal(paginaIniziale('ufficio'), '/cruscotto');
  assert.equal(paginaIniziale('contabilita'), '/amministrazione');
  assert.equal(paginaIniziale('produzione'), '/r');
});

test('Da fare oggi: solo le voci con qualcosa da fare, prima le urgenti, singolare e plurale', () => {
  assert.deepEqual(cosaDaFare(zero), []);
  const v = cosaDaFare({ ...zero, ddtDaFatturare: 6, preventiviDaValidare: 2, sdiScartate: 1, consegneInRitardo: 3 });
  assert.deepEqual(v.map(x => x.livello), ['urgente', 'urgente', 'controllare', 'normale']);
  assert.equal(v[0].testo, 'fattura scartata dallo SdI');
  assert.equal(v[1].testo, 'consegne in ritardo');
  assert.equal(v.find(x => x.chiave === 'preventivi-da-validare')!.testo, 'preventivi da validare');
});

test('Da fare oggi: con una sola cosa il pulsante porta direttamente lì', () => {
  const diretti = { 'sdi-scartate': '/amministrazione/documenti/12' };
  assert.equal(cosaDaFare({ ...zero, sdiScartate: 1 }, diretti)[0].link, '/amministrazione/documenti/12');
  assert.equal(cosaDaFare({ ...zero, sdiScartate: 2 }, diretti)[0].link, '/amministrazione/documenti');
});

test('settimane: lunedì e numero ISO', () => {
  assert.equal(lunedi('2026-10-31'), '2026-10-26');   // sabato → lunedì prima
  assert.equal(lunedi('2026-11-02'), '2026-11-02');
  assert.equal(settimanaIso('2026-11-02'), 45);
  assert.equal(settimanaIso('2026-01-01'), 1);
  assert.equal(settimanaIso('2027-01-01'), 53);       // venerdì: ultima settimana del 2026
});

test('carico delle prossime settimane: ore ciclo dal giorno di oggi, settimana piena se oltre le ore disponibili', () => {
  const carico = { '2026-11-02': 4, '2026-11-03': 6, '2026-11-09': 30, '2026-11-10': 15, '2026-10-30': 99 };
  const s = caricoSettimane(carico, '2026-11-02', 8, 3);
  assert.deepEqual(s.map(x => [x.numero, x.ore, x.disponibili, x.piena]), [[45, 10, 40, false], [46, 45, 40, true], [47, 0, 40, false]]);
  // a metà settimana i giorni già passati non contano
  assert.equal(caricoSettimane(carico, '2026-11-03', 8, 1)[0].ore, 6);
});

test('scadenze del mese: il 15 e il 16, spostate al lunedì se cadono nel fine settimana', () => {
  assert.deepEqual(scadenzeFiscali('2026-10-31', 35).map(x => x.data), ['2026-11-16', '2026-11-16']);   // 15/11 è domenica
  assert.deepEqual(scadenzeFiscali('2026-12-01', 20).map(x => x.data), ['2026-12-15', '2026-12-16']);
  assert.deepEqual(scadenzeFiscali('2026-12-17', 10), []);
});

test('saluto e cifre brevi', () => {
  assert.equal(saluto(9), 'Buongiorno');
  assert.equal(saluto(15), 'Buon pomeriggio');
  assert.equal(saluto(21), 'Buonasera');
  assert.equal(euroBreve(1_520_000), '1,52 M€');
  assert.equal(euroBreve(142_300), '142 k€');
  assert.equal(euroBreve(8_000), '8,0 k€');
  assert.equal(euroBreve(950), '950 €');
});

test('la guida spiega il cruscotto generale', async () => {
  const { cercaGuida } = await import('../src/engine/guida.js');
  assert.equal(cercaGuida('pagina iniziale')[0]?.argomento.id, 'cruscotto-generale');
  assert.equal(cercaGuida('cose da fare oggi')[0]?.argomento.id, 'cruscotto-generale');
});

test('controllo serale 10/11/2026: i numeri di "Da fare oggi" portano alla pagina con lo stesso elenco', async () => {
  const { consegneInRitardo } = await import('../src/engine/ordini.js');
  const v = cosaDaFare({ sdiScartate: 0, sdiNonConsegnate: 0, consegneInRitardo: 2, incassiScaduti: 0, pagamentiScaduti: 0, preventiviDaValidare: 0,
    ordiniDaAcquisire: 0, acquisizioniInErrore: 0, ddtDaFatturare: 5, bozzeDocumenti: 0, schedeScansionate: 0, tempiAperti: 0, crmScadute: 0 } as ContiDaFare);
  assert.equal(v.find(x => x.chiave === 'consegne-ritardo')!.link, '/ordini?vista=ritardo');
  assert.equal(v.find(x => x.chiave === 'ddt-da-fatturare')!.link, '/amministrazione/differite');
  // stessa regola del numero del cruscotto e della scheda Ordini → In ritardo: solo schede aperte con pezzi da spedire e consegna passata
  const r = (tipo: 'scheda' | 'servizio', stato: any, residuoQuantita: number, consegna: string | null) => ({ tipo, stato, residuoQuantita, consegna });
  const righe = [r('scheda', 'da_evadere', 10, '2026-11-01'), r('scheda', 'parziale', 5, '2026-11-09'), r('scheda', 'da_evadere', 10, '2026-11-20'),
    r('scheda', 'evaso', 0, '2026-10-01'), r('servizio', 'da_evadere', 1, '2026-10-01'), r('scheda', 'da_evadere', 10, null), r('scheda', 'parziale', 0, '2026-10-01')];
  assert.equal(consegneInRitardo(righe, '2026-11-10').length, 2);
});
