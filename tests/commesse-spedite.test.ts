import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eSpedita, nellaVista, spedizioniCommesse, vistaCommesse, type CommessaPerSpedizione, type RigaDdtSpedita } from '../src/engine/commesse-spedite.js';

// Adriano 11/11/2026: "THS è già stato spedito, perché rimane nelle commesse?"
const comm = (x: Partial<CommessaPerSpedizione> & { id: number }): CommessaPerSpedizione =>
  ({ clienteId: 1, prodottoId: 10, codice: 'A', quantita: 50, stato: 'aperta', dataInizio: '2026-10-01', finite: 0, ...x });
const riga = (x: Partial<RigaDdtSpedita> & { ddtId: number }): RigaDdtSpedita =>
  ({ numero: x.ddtId, data: '2026-11-09', clienteId: 1, prodottoId: 10, codice: 'A', quantita: 50, commessaRiga: null, commessaDocumento: null, commessaRigaOrdine: null, ...x });

test('DDT senza collegamento alla commessa: stesso cliente e prodotto la chiude (THS 51 schede, spedite 50 a rientro confermato)', () => {
  const m = spedizioniCommesse([comm({ id: 7, quantita: 51, stato: 'rientrata' })], [riga({ ddtId: 224 })]);
  assert.deepEqual(m.get(7), { spedite: 50, spedita: true, ddt: [{ id: 224, numero: 224, quantita: 50 }] });
  // stessa situazione ma lavorazione non finita: 50 su 51 non basta
  assert.equal(spedizioniCommesse([comm({ id: 7, quantita: 51 })], [riga({ ddtId: 224 })]).get(7)!.spedita, false);
});

test('altro cliente, altro prodotto, DDT prima dell\'ordine: non contano', () => {
  const m = spedizioniCommesse([comm({ id: 1 })], [riga({ ddtId: 1, clienteId: 2 }), riga({ ddtId: 2, prodottoId: 11 }), riga({ ddtId: 3, data: '2026-09-01' })]);
  assert.equal(m.get(1)!.spedite, 0);
});

test('senza prodotto si confronta il codice (trattini e spazi non contano)', () => {
  const m = spedizioniCommesse([comm({ id: 1, prodottoId: null, codice: 'VEERBO REMOTE V02' })], [riga({ ddtId: 1, prodottoId: null, codice: 'veerbo-remote-v02' })]);
  assert.equal(m.get(1)!.spedita, true);
});

test('stesso prodotto su due commesse: prima quella con la lavorazione finita, mai oltre la quantità', () => {
  const m = spedizioniCommesse(
    [comm({ id: 12, quantita: 200, stato: 'in_produzione' }), comm({ id: 13, quantita: 500, stato: 'rientrata' })],
    [riga({ ddtId: 217, quantita: 499 })]);
  assert.equal(m.get(13)!.spedite, 499);
  assert.equal(m.get(13)!.spedita, true);
  assert.equal(m.get(12)!.spedite, 0);
  const n = spedizioniCommesse([comm({ id: 1, quantita: 10 }), comm({ id: 2, quantita: 10, dataInizio: '2026-10-05' })], [riga({ ddtId: 1, quantita: 15 })]);
  assert.equal(n.get(1)!.spedite, 10);
  assert.equal(n.get(2)!.spedite, 5);
});

test('collegamenti diretti: riga, riga d\'ordine; quello del DDT solo per lo stesso prodotto', () => {
  const m = spedizioniCommesse([comm({ id: 4, quantita: 4000 }), comm({ id: 5, prodottoId: 20, quantita: 10000 })], [
    riga({ ddtId: 223, quantita: 2300, clienteId: 9, commessaRigaOrdine: 4 }),
    riga({ ddtId: 228, quantita: 1700, commessaDocumento: 4 }),
    riga({ ddtId: 228, prodottoId: 20, quantita: 185, commessaDocumento: 4 }),
  ]);
  assert.equal(m.get(4)!.spedite, 4000);
  assert.equal(m.get(4)!.spedita, true);
  assert.equal(m.get(5)!.spedite, 185);
  assert.equal(m.get(5)!.spedita, false);
});

test('regola della spedita e viste dell\'elenco', () => {
  assert.equal(eSpedita({ quantita: 100, stato: 'aperta', finite: 0 }, 100), true);
  assert.equal(eSpedita({ quantita: 100, stato: 'rientrata', finite: 0 }, 89), false);
  assert.equal(eSpedita({ quantita: 100, stato: 'aperta', finite: 100 }, 90), true);
  assert.equal(eSpedita({ quantita: 100, stato: 'rientrata', finite: 0 }, 0), false);
  assert.equal(vistaCommesse('x'), 'dafare');
  assert.equal(nellaVista('dafare', 'rientrata', false), true);
  assert.equal(nellaVista('dafare', 'rientrata', true), false);
  assert.equal(nellaVista('dafare', 'chiusa', false), false);
  assert.equal(nellaVista('spedite', 'chiusa', false), true);
  assert.equal(nellaVista('tutte', 'aperta', true), true);
});
