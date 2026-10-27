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

test('fogli tempi: fasi fatte insieme, tempo diviso in proporzione al preventivo', async () => {
  const { ripartisciFasiInsieme, dividiMinuti } = await import('../src/engine/fogli-tempi.js');
  assert.deepEqual(dividiMinuti(90, [1, 9]), [9, 81]);
  assert.deepEqual(dividiMinuti(10, [1, 1, 1]), [4, 3, 3]);
  const fasi = [{ codice: 'serigrafia', numero: '5', cicloSec: 600 }, { codice: 'pickPlace', numero: '6', cicloSec: 5400 }, { codice: 'aoi', numero: '7', cicloSec: 0 }];
  const numeri = new Map([['5', 'serigrafia'], ['6', 'pickPlace'], ['7', 'aoi']]);
  const { righe, ripartite } = ripartisciFasiInsieme([
    { fase: 'collaudo', inizio: '07:00', fine: '07:30', tipo: 'S' as const, note: '' },
    { fase: 'serigrafia', data: '2026-10-22', inizio: '08:00', fine: '09:40', totaleScrittoMin: 100, persone: 2, tipo: 'S' as const, note: 'FASI 5+6 INSIEME · ok' },
    { fase: 'serigrafia', durataMin: 30, tipo: 'P' as const, causa: 'FASI 5+7 INSIEME' },
  ], fasi, numeri);
  assert.equal(righe.length, 5);
  assert.deepEqual(ripartite, [{ riga: 1, fasi: '5+6' }, { riga: 3, fasi: '5+7' }]);
  // 1/10 e 9/10 come nel preventivo, una riga dopo l'altra
  assert.deepEqual([righe[1].fase, righe[1].inizio, righe[1].fine, righe[1].totaleScrittoMin], ['serigrafia', '08:00', '08:10', 10]);
  assert.deepEqual([righe[2].fase, righe[2].inizio, righe[2].fine, righe[2].totaleScrittoMin, righe[2].persone], ['pickPlace', '08:10', '09:40', 90, 2]);
  assert.equal(righe[2].note, "FASI 5+6 INSIEME: 1h 40' RIPARTITI COME DA PREVENTIVO · ok");
  // fase senza tempo previsto: parti uguali, sul totale
  assert.deepEqual(righe.slice(3).map(r => [r.fase, r.durataMin]), [['serigrafia', 15], ['aoi', 15]]);
  assert.match(righe[4].causa!, /IN PARTI UGUALI/);
  // già ripartite: non si toccano più
  assert.equal(ripartisciFasiInsieme(righe, fasi, numeri).righe.length, 5);
  // fase sconosciuta: la riga resta com'è
  assert.equal(ripartisciFasiInsieme([{ fase: 'serigrafia', durataMin: 30, tipo: 'S' as const, note: 'FASI 5+99 INSIEME' }], fasi, numeri).righe.length, 1);
});
