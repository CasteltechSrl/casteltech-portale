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

test('file aggiornati: si tolgono solo i file di prima dello stesso tipo', async () => {
  const { fileDaSostituire } = await import('../src/engine/scheda/classifica.js');
  const vecchi = [{ nome: 'bom_rev1.xlsx', tipo: 'bom' as const }, { nome: 'top.gtl', tipo: 'gerber' as const }, { nome: 'drill.drl', tipo: 'foratura' as const },
    { nome: 'pp.txt', tipo: 'pick-place' as const }];
  // solo Gerber nuovi: via Gerber e forature vecchie, BOM e pick and place restano
  let r = fileDaSostituire(vecchi, [{ nome: 'top_rev2.gtl', tipo: 'gerber' }]);
  assert.deepEqual(r.togliere, ['top.gtl', 'drill.drl']); assert.equal(r.bom, false);
  // solo BOM nuova: via la BOM vecchia, da ricodificare
  r = fileDaSostituire(vecchi, [{ nome: 'bom_rev2.xlsx', tipo: 'bom' }]);
  assert.deepEqual(r.togliere, ['bom_rev1.xlsx']); assert.equal(r.bom, true);
  // stesso nome = file riscritto, non si toglie
  r = fileDaSostituire(vecchi, [{ nome: 'pp.txt', tipo: 'pick-place' }]);
  assert.deepEqual(r.togliere, []);
  // uno zip: non si sa cosa contiene, si sostituisce tutto
  r = fileDaSostituire(vecchi, [{ nome: 'pacchetto_rev2.zip', tipo: 'archivio' }]);
  assert.equal(r.togliere.length, 4); assert.equal(r.bom, true);
});
