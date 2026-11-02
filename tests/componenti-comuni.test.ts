import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chiaveComponente, componentiInComune, feederFissi } from '../src/engine/componenti-comuni.js';
import { cercaGuida } from '../src/engine/guida.js';

const riga = (pn: string | null, cod: string | null, q = 1, nonMontato = false) => ({ pn, codiceProduzione: cod, descrizione: null, qtaScheda: q, nonMontato });

test('componenti in comune: stesso codice di produzione o stesso P/N (senza trattini) = stesso componente', () => {
  assert.equal(chiaveComponente({ pn: 'GRM-188', codiceProduzione: ' rs-0603-2k2 ' }), 'C:RS-0603-2K2');
  assert.equal(chiaveComponente({ pn: 'grm-188 r71', codiceProduzione: null }), 'P:GRM188R71');
  assert.equal(chiaveComponente({ pn: '  ', codiceProduzione: null }), null);
});

test('componenti in comune: prima quelli in più BOM, poi più pezzi; non montati esclusi; un solo uso escluso', () => {
  const elenco = componentiInComune([
    { id: 1, nome: 'A', righe: [riga('X1', 'RS-0603-10K', 4), riga('LM-317', null, 1), riga('SOLO-A', null, 9), riga('DNP1', 'CC-0402', 1, true)] },
    { id: 2, nome: 'B', righe: [riga('Y1', 'RS-0603-10K', 2), riga('LM317', null, 3), riga('DNP1', 'CC-0402', 1)] },
    { id: 3, nome: 'C', righe: [riga('Z1', 'RS-0603-10K', 1)] },
  ]);
  assert.deepEqual(elenco.map(c => c.chiave), ['C:RS-0603-10K', 'P:LM317']);
  assert.equal(elenco[0].bom.length, 3);
  assert.equal(elenco[0].pezziTotali, 7);
  assert.deepEqual(elenco[0].pn, ['X1', 'Y1', 'Z1']);
  assert.equal(elenco[1].pezziTotali, 4);
});

test('componenti in comune: con una sola BOM si vede tutto; feeder fissi = i primi N', () => {
  const elenco = componentiInComune([{ id: 1, nome: 'A', righe: [riga('A1', null, 1), riga('B1', null, 5)] }], 1);
  assert.deepEqual(elenco.map(c => c.chiave), ['P:B1', 'P:A1']);
  assert.deepEqual([...feederFissi(elenco, '1')], ['P:B1']);
  assert.equal(feederFissi(elenco, '').size, 0);
  assert.equal(feederFissi(elenco, 'boh').size, 0);
});

test('guida: "stessi feeder selea" porta ai componenti in comune', () => {
  assert.equal(cercaGuida('stessi feeder selea')[0]?.argomento.id, 'componenti-in-comune');
});
