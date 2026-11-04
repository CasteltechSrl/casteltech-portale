import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controllaSede, destinazioneProposta, pulisciSede, sedeDaModulo, sedeDelCliente, testoSede } from '../src/engine/sede-operativa.js';
import { cercaGuida } from '../src/engine/guida.js';

// Adriano 4/11/2026: ELEXES ha sede legale a Vertova e sede operativa a Stezzano (in FIC "Indirizzo di spedizione")
const elexes = { sede_operativa_diversa: true, sede_op_indirizzo: 'VIA FIUME PO 932', sede_op_cap: '24050', sede_op_comune: 'STEZZANO',
  sede_op_provincia: 'BG', sede_op_nazione: 'IT', sede_op_presso: null, sede_op_note: null };

test('sede operativa: senza spunta il cliente ha una sola sede', () => {
  assert.equal(sedeDelCliente({ ...elexes, sede_operativa_diversa: false }), null);
  assert.equal(destinazioneProposta({ ...elexes, sede_operativa_diversa: false }, 'VIA DEL DDT PRIMA'), 'VIA DEL DDT PRIMA');
  assert.equal(destinazioneProposta(null, null), '');
});

test('sede operativa: è il luogo di destinazione proposto nel DDT, prima dell\'ultimo DDT', () => {
  assert.equal(destinazioneProposta(elexes, 'ALTRO INDIRIZZO'), 'VIA FIUME PO 932\n24050 STEZZANO (BG)');
  const estera = pulisciSede({ presso: 'kyokita', indirizzo: '60 rue de Wattignies', cap: '75015', comune: 'Paris', nazione: 'fr', note: 'att. Jean-Francois Hernandez' });
  assert.equal(testoSede(estera), 'KYOKITA\n60 RUE DE WATTIGNIES\n75015 PARIS\nFR\nATT. JEAN-FRANCOIS HERNANDEZ');
});

test('sede operativa dal modulo: tutto maiuscolo, controlli solo con la spunta', () => {
  const ok = sedeDaModulo({ sede_operativa_diversa: 'on', sede_op_indirizzo: 'via fiume po 932', sede_op_cap: '24050', sede_op_comune: 'stezzano', sede_op_provincia: 'bg' });
  assert.equal(ok.diversa, true);
  assert.deepEqual(ok.errori, []);
  assert.equal(ok.sede.comune, 'STEZZANO');
  assert.equal(ok.sede.nazione, 'IT');
  const vuota = sedeDaModulo({ sede_operativa_diversa: 'on' });
  assert.ok(vuota.errori[0].includes('indirizzo e comune'));
  assert.deepEqual(sedeDaModulo({ sede_op_cap: 'x' }).errori, []);   // senza spunta non si controlla
  assert.ok(controllaSede(pulisciSede({ indirizzo: 'VIA', comune: 'X', cap: '123', provincia: 'BGG' })).length === 2);
});

test('guida: la sede operativa si trova cercando "indirizzo di spedizione"', () => {
  assert.equal(cercaGuida('indirizzo di spedizione')[0]?.argomento.id, 'sede-operativa');
  assert.equal(cercaGuida('sede operativa')[0]?.argomento.id, 'sede-operativa');
});
