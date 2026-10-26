import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dataDaGiornoMese, minutiDa, numeriFase, operatoriDa, oraDa, righeDaFoglio, soloNuove } from '../src/engine/fogli-tempi.js';

test('fogli tempi: ore, durate, date gg/mm con l\'anno della scansione', () => {
  assert.equal(oraDa('8:00'), '08:00');
  assert.equal(oraDa('16.45'), '16:45');
  assert.equal(oraDa('930'), '09:30');
  assert.equal(oraDa('9'), '09:00');
  assert.equal(oraDa('25:00'), null);
  assert.equal(minutiDa('1:30'), 90);
  assert.equal(minutiDa('1,5'), 90);
  assert.equal(minutiDa("45'"), 45);
  assert.equal(minutiDa(''), null);
  assert.equal(dataDaGiornoMese('22/10', '2026-10-26'), '2026-10-22');
  assert.equal(dataDaGiornoMese('28/12', '2027-01-08'), '2026-12-28');   // foglio di dicembre scansionato a gennaio
  assert.equal(dataDaGiornoMese('22/10/25', '2026-10-26'), '2025-10-22');
  assert.equal(dataDaGiornoMese('32/10', '2026-10-26'), null);
});

test('fogli tempi: "+" prestampato in fase e operatore', () => {
  assert.deepEqual(numeriFase('13+15'), ['13', '15']);
  assert.deepEqual(numeriFase('3+'), ['3']);
  assert.deepEqual(numeriFase('m1 +'), ['M1']);
  assert.equal(operatoriDa('MH+NG'), 'MH+NG');
  assert.equal(operatoriDa('ag +'), 'AG');
});

test('fogli tempi: righe lette → righe del rientro (fasi insieme, P con causa, righe vuote e già presenti tolte)', () => {
  const fasi = new Map([['1', 'serigrafia'], ['2', 'pickPlace'], ['26', 'collaudo']]);
  const righe = righeDaFoglio([{ commessa: 'C2026-0001', righe: [
    { fase: '1+2', operatore: 'AG+', data: '22/10', apertura: '8:00', chiusura: '8:30', persone: '1', pezzi: '50', sp: 'S' },
    { fase: '26+', operatore: 'CO+HI', data: '23/10', apertura: '9:00', chiusura: '16:30', persone: '2', pezzi: '50', sp: 'P', note: '1/2 ora di pausa' },
    { fase: '99+', operatore: 'SH', data: '24/10', totale: '1:00', sp: 'S' },
    { fase: '+', operatore: '+', data: '/' },
  ] }], fasi, '2026-10-26');
  assert.equal(righe.length, 3);
  assert.deepEqual({ ...righe[0] }, { fase: 'serigrafia', faseScritta: '1+2', operatore: 'AG', data: '2026-10-22', inizio: '08:00', fine: '08:30',
    durataMin: undefined, totaleScrittoMin: undefined, persone: 1, pezzi: 50, tipo: 'S', causa: '', note: 'FASI 1+2 INSIEME', resp: '', materiale: '', incerta: false });
  assert.equal(righe[1].tipo, 'P');
  assert.equal(righe[1].causa, '1/2 ora di pausa');
  assert.equal(righe[1].operatore, 'CO+HI');
  assert.equal(righe[2].fase, '');            // fase non della commessa: da scegliere
  assert.equal(righe[2].incerta, true);
  assert.equal(righe[2].durataMin, 60);
  assert.equal(soloNuove(righe, [{ ...righe[0] }]).length, 2);
});
