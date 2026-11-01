import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCHEDE_DOCUMENTI, controlloDdtStessoCliente, dividiPerAzione, frasiEscluse, motivoEscluso, motivoNonEliminabile, pulsantiDocumenti, type DocumentoElenco } from '../src/engine/azioni-documenti.js';
import { moduloAzioni } from '../src/server/views/azioni-elenco.js';

const doc = (x: Partial<DocumentoElenco>): DocumentoElenco => ({ id: 1, tipo: 'fattura', numero: 10, stato: 'emesso', origine: 'portale', cliente_id: 5, ha_xml: true, ...x });

test('documenti emessi: pulsanti per tipo', () => {
  const azioni = (t: string) => pulsantiDocumenti(t).map(p => p.azione);
  assert.deepEqual(azioni('fattura'), ['stampa', 'xml', 'excel', 'incassa', 'duplica', 'nota_credito', 'elimina']);
  assert.deepEqual(azioni('nota_credito'), ['stampa', 'xml', 'excel', 'elimina']);
  assert.deepEqual(azioni('autofattura'), ['xml', 'excel', 'elimina']);
  assert.deepEqual(azioni('ddt'), ['stampa', 'excel', 'fattura_ddt', 'annulla', 'elimina']);
  // Elimina e Annulla chiedono conferma; la stampa apre una scheda nuova
  const f = pulsantiDocumenti('ddt');
  assert.ok(f.find(p => p.azione === 'elimina')!.chiedi && f.find(p => p.azione === 'annulla')!.chiedi);
  assert.equal(f.find(p => p.azione === 'stampa')!.nuovaScheda, true);
  const m = String(moduloAzioni({ azione: '/amministrazione/documenti/azioni', nome: { singolare: 'documento', plurale: 'documenti' }, pulsanti: pulsantiDocumenti('fattura') }).apri);
  assert.match(m, /value="nota_credito" data-serve="1"/);
});

test('documenti emessi: si eliminano solo le bozze senza numero (la numerazione non ha buchi)', () => {
  assert.equal(motivoNonEliminabile(doc({ numero: null, stato: 'bozza' })), null);
  assert.match(motivoNonEliminabile(doc({}))!, /nota di credito/);
  assert.match(motivoNonEliminabile(doc({ stato: 'consegnato' }))!, /nota di credito/);
  assert.match(motivoNonEliminabile(doc({ stato: 'bozza', numero: 7 }))!, /scartato/); // scartato e riaperto: ha già il numero
  assert.match(motivoNonEliminabile(doc({ tipo: 'ddt' }))!, /annulla/);
  assert.match(motivoNonEliminabile(doc({ origine: 'fic', stato: 'bozza', numero: null }))!, /Fatture in Cloud/);
  assert.match(motivoNonEliminabile(doc({ tipo: 'autofattura' }))!, /non si eliminano/);
  const { si, no } = dividiPerAzione('elimina', [doc({ id: 1, numero: null, stato: 'bozza' }), doc({ id: 2 }), doc({ id: 3, stato: 'inviato' })]);
  assert.deepEqual(si.map(d => d.id), [1]);
  assert.deepEqual(no.map(x => x.doc.id), [2, 3]);
  assert.match(frasiEscluse(no), /^Non toccati: n\. 10 è emesso/);
});

test('documenti emessi: regole degli altri pulsanti', () => {
  // XML solo se c'è il file (le bozze non l'hanno)
  assert.equal(motivoEscluso('xml', doc({})), null);
  assert.match(motivoEscluso('xml', doc({ ha_xml: false, stato: 'bozza', numero: null }))!, /Emetti/);
  // incassi e storno solo su fatture emesse
  assert.equal(motivoEscluso('incassa', doc({})), null);
  assert.ok(motivoEscluso('incassa', doc({ stato: 'bozza', numero: null })));
  assert.ok(motivoEscluso('incassa', doc({ stato: 'annullato' })));
  assert.equal(motivoEscluso('nota_credito', doc({ stato: 'consegnato' })), null);
  assert.ok(motivoEscluso('nota_credito', doc({ numero: null, stato: 'bozza' })));
  assert.ok(motivoEscluso('duplica', doc({ cliente_id: null })));
  // DDT: si fatturano gli emessi non fatturati; si annullano solo quelli del portale non in fattura
  const ddt = (x: Partial<DocumentoElenco>) => doc({ tipo: 'ddt', ...x });
  assert.equal(motivoEscluso('fattura_ddt', ddt({})), null);
  assert.match(motivoEscluso('fattura_ddt', ddt({ fattura_id: 9 }))!, /già fatturato/);
  assert.ok(motivoEscluso('fattura_ddt', ddt({ stato: 'annullato' })));
  assert.equal(motivoEscluso('annulla', ddt({})), null);
  assert.match(motivoEscluso('annulla', ddt({ origine: 'fic' }))!, /dal portale/);
  assert.match(motivoEscluso('annulla', ddt({ fattura_id: 3 }))!, /fattura/);
  assert.match(motivoEscluso('annulla', ddt({ stato: 'bozza', numero: null }))!, /elimina/);
  // una fattura per un cliente solo
  assert.equal(controlloDdtStessoCliente([ddt({ cliente_id: 1 }), ddt({ cliente_id: 1 })]), null);
  assert.match(controlloDdtStessoCliente([ddt({ cliente_id: 1 }), ddt({ cliente_id: 2 })])!, /clienti diversi/);
});

test('documenti emessi: messaggio delle righe escluse si accorcia oltre 5', () => {
  const no = Array.from({ length: 7 }, (_, i) => ({ doc: doc({ numero: i + 1 }), motivo: 'è emesso' }));
  assert.match(frasiEscluse(no), /e altri 2\.$/);
  assert.equal(frasiEscluse([]), '');
});

test('documenti emessi: schede nell\'ordine del lavoro (Adriano 1/11/2026), si apre sui DDT', () => {
  assert.deepEqual(SCHEDE_DOCUMENTI.map(s => s.tanti), ['DDT', 'Fatture', 'Autofatture', 'Note di credito']);
  assert.equal(SCHEDE_DOCUMENTI[0].tipo, 'ddt');
});
