import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggiornaParametri, testoCambi, SCELTE_UFFICIO } from '../src/engine/scheda/preventivo.js';
import { cercaGuida } from '../src/engine/guida.js';

test('file nuovi del cliente: nel preventivo cambiano solo i numeri letti, le scelte dell\'ufficio restano', () => {
  const attuali = { qtSmd: 120, qtFeeder: 18, acquistoLamina: 0, primaProduzione: 0, ricarico: 1.3, qtTht: 4 };
  const letti = { qtSmd: 135, qtFeeder: 18, acquistoLamina: 1, primaProduzione: 1, qtTht: 6, sconosciuto: 3 };
  const { parametri, cambi } = aggiornaParametri(attuali, letti, new Set(['qtSmd', 'qtFeeder', 'acquistoLamina', 'primaProduzione', 'qtTht', 'ricarico']));
  assert.deepEqual(cambi, [{ codice: 'qtSmd', prima: 120, dopo: 135 }, { codice: 'qtTht', prima: 4, dopo: 6 }]);
  assert.equal(parametri.acquistoLamina, 0);       // lamine del cliente: scelta dell'ufficio
  assert.equal(parametri.primaProduzione, 0);
  assert.equal(parametri.ricarico, 1.3);           // non letto dai file: resta
  assert.equal('sconosciuto' in parametri, false); // non nel catalogo del preventivo
  assert.ok(SCELTE_UFFICIO.includes('controlloVisivo'));
  assert.equal(testoCambi(cambi, { qtSmd: 'SMD lato TOP' }), 'SMD lato TOP 120 → 135; qtTht 4 → 6');
  assert.equal(testoCambi([{ codice: 'crema', prima: null, dopo: 0.45 }]), 'crema — → 0,45');
});

test('guida: aggiornare il preventivo con BOM e Gerber nuovi', () => {
  assert.ok(cercaGuida('aggiornare preventivo bom gerber nuovi').slice(0, 3).some(r => r.argomento.id === 'documenti-cliente-aggiornati'));
});

test('guida: rinominare i pacchetti e assegnare il cliente', () => {
  assert.equal(cercaGuida('rinominare pacchetto cliente')[0]?.argomento.id, 'documenti-cliente-aggiornati');
});
