import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confermaEliminaCommessa, confermaEliminaOrdine, formulaUsa, motivoCatalogoNonEliminabile, nomiNelleFormule } from '../src/engine/eliminazioni.js';

test('elimina: una formula usa un nome solo se è la parola intera', () => {
  assert.equal(formulaUsa('nPCB * 3 + prezzo_pasta', 'nPCB'), true);
  assert.equal(formulaUsa('nPCBx * 3', 'nPCB'), false);
  assert.equal(formulaUsa('se(primaProduzione, 110, 0)', 'primaProduzione'), true);
  assert.equal(formulaUsa('ore_forno*2', 'ore_forno'), true);
  assert.equal(formulaUsa(null, 'nPCB'), false);
  assert.deepEqual(nomiNelleFormule('materiali', 'pasta'), ['prezzo_pasta', 'qta_pasta']);
  assert.deepEqual(nomiNelleFormule('fasi', 'forno'), ['ore_forno']);
});

test('elimina: nel catalogo si eliminano solo le righe aggiunte a mano e non usate', () => {
  const formule = [{ codice: 'energiaForno', formula: 'ore_fornoNuovo * 3' }, { codice: 'colla', formula: 'nSchede * prezzo_collaUv' }];
  // catalogo di partenza: mai
  assert.match(motivoCatalogoNonEliminabile({ tabella: 'fasi', codice: 'serigrafia', iniziale: true, formule })!, /catalogo di partenza/);
  // usata in una formula di un'altra riga
  assert.match(motivoCatalogoNonEliminabile({ tabella: 'fasi', codice: 'fornoNuovo', iniziale: false, formule })!, /energiaForno/);
  assert.match(motivoCatalogoNonEliminabile({ tabella: 'materiali', codice: 'collaUv', iniziale: false, formule })!, /colla/);
  // fase con tempi già registrati
  assert.match(motivoCatalogoNonEliminabile({ tabella: 'fasi', codice: 'provaX', iniziale: false, formule, usataInCommesse: true })!, /Attiva/);
  // aggiunta per errore e mai usata: sì (anche se la sua formula usa sé stessa)
  assert.equal(motivoCatalogoNonEliminabile({ tabella: 'parametri', codice: 'nuovoParam', iniziale: false, formule }), null);
  assert.equal(motivoCatalogoNonEliminabile({ tabella: 'voci_costo', codice: 'colla', iniziale: false, formule }), null);
});

test('elimina: la conferma dell\'ordine avvisa di DDT/fatture, file ricaricabile e documento da riconfermare', () => {
  const base = { numero: 12, anno: 2026, righe: 1, conDocumenti: false };
  const fic = confermaEliminaOrdine({ ...base, origine: 'fic' });
  assert.match(fic, /ordine 12\/2026 con 1 riga\?/);
  assert.match(fic, /ricarichi lo stesso file/);
  assert.doesNotMatch(fic, /fatture senza ordine/);
  const email = confermaEliminaOrdine({ ...base, origine: 'email', righe: 3, conDocumenti: true });
  assert.match(email, /3 righe/);
  assert.match(email, /fatture senza ordine/);
  assert.match(email, /Da acquisire/);
});

test('elimina: la conferma della commessa dice cosa sparisce e che il preventivo resta', () => {
  const t = confermaEliminaCommessa({ numero: 'C-26-001', stato: 'rientrata', tempi: 5 });
  assert.match(t, /C-26-001/);
  assert.match(t, /5 tempi registrati/);
  assert.match(t, /già rientrata/);
  assert.match(t, /preventivo resta/);
  assert.doesNotMatch(confermaEliminaCommessa({ numero: 'X', stato: 'aperta', tempi: 0 }), /già|registrat[oi]\./);
});
