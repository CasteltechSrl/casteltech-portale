import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bolloPerTrimestre, scadenzaBollo, spesaDaModulo, testoPlafond, usoPlafond } from '../src/engine/fiscale.js';
import { cercaGuida } from '../src/engine/guida.js';

test('bollo virtuale: scadenze per trimestre (fine settimana → lunedì) e codici 2521–2524', () => {
  assert.equal(scadenzaBollo(2026, 1), '2026-06-01'); // 31/5/2026 è domenica
  assert.equal(scadenzaBollo(2026, 2), '2026-09-30');
  assert.equal(scadenzaBollo(2026, 3), '2026-11-30');
  assert.equal(scadenzaBollo(2026, 4), '2027-03-01'); // 28/2/2027 è domenica
  const t = bolloPerTrimestre(2026, [{ data: '2026-02-10', bollo: 2 }, { data: '2026-05-10', bollo: 2 }, { data: '2026-08-10', bollo: 2 }, { data: '2026-08-11', bollo: 0 }], '2026-10-31');
  assert.deepEqual(t.map(x => [x.trimestre, x.documenti, x.importo, x.codice]), [[1, 1, 2, '2521'], [2, 1, 2, '2522'], [3, 1, 2, '2523'], [4, 0, 0, '2524']]);
  // sotto 5.000 €: 1° e 2° trimestre si versano con il 3° (30/11)
  assert.equal(t[0].scadenza, '2026-11-30');
  assert.equal(t[1].scadenza, '2026-11-30');
  assert.ok(t[0].rinviato && t[1].rinviato && !t[2].rinviato);
  assert.ok(t[2].chiuso && !t[3].chiuso);
});

test('bollo virtuale: 1° trimestre sotto 5.000 € con il 2° (30/9), oltre 5.000 € alla sua scadenza', () => {
  const tanti = (mese: string, n: number) => Array.from({ length: n }, () => ({ data: `2026-${mese}-10`, bollo: 2 }));
  const a = bolloPerTrimestre(2026, [...tanti('02', 100), ...tanti('05', 2500)], '2026-12-31');
  assert.equal(a[0].scadenza, '2026-09-30');
  assert.equal(a[1].rinviato, false);
  const b = bolloPerTrimestre(2026, tanti('02', 2600), '2026-12-31');
  assert.equal(b[0].scadenza, '2026-06-01');
  assert.equal(b[0].rinviato, false);
});

test('plafond delle lettere d\'intento: avviso dall\'80 %, superato, senza importo', () => {
  assert.deepEqual(usoPlafond(100000, 50000), { plafond: 100000, usato: 50000, residuo: 50000, percentuale: 50, stato: 'ok' });
  assert.equal(usoPlafond(100000, 70000, 12000).stato, 'vicino');
  assert.equal(usoPlafond(100000, 95000, 6000).stato, 'superato');
  assert.equal(usoPlafond(null, 3000).stato, 'senza_plafond');
  const euro = (n: number) => `${n} €`;
  assert.match(testoPlafond(usoPlafond(100000, 101000), euro), /superato di 1000 €.*con l'IVA/);
  assert.match(testoPlafond(usoPlafond(100000, 85000), euro), /85%.*restano 15000 €.*integrativa/);
});

test('spese senza fattura elettronica: controlli del modulo, IVA solo sulla fattura cartacea', () => {
  const ok = spesaDaModulo({ data: '2026-11-03', tipo: 'Affitto', controparte: 'mario rossi', totale: '1.500,00', imposta: '200', pagata: 'on', conto: 'BPER' });
  assert.deepEqual(ok.errori, []);
  assert.equal(ok.spesa.controparte, 'MARIO ROSSI');
  assert.equal(ok.spesa.totale, 1500);
  assert.equal(ok.spesa.imposta, 0);        // affitto da privato: niente IVA
  assert.equal(ok.spesa.pagataIl, '2026-11-03');
  const carta = spesaDaModulo({ data: '2026-11-03', tipo: 'Fattura cartacea', controparte: 'X', totale: '122', imposta: '22' });
  assert.deepEqual([carta.spesa.imponibile, carta.spesa.imposta, carta.spesa.pagataIl], [100, 22, null]);
  assert.equal(spesaDaModulo({ tipo: 'Scontrino', totale: '0' }).errori.length, 3);
});

test('guida: bollo, lettere d\'intento, spese senza fattura elettronica', () => {
  for (const [q, id] of [['bollo virtuale', 'bollo-virtuale'], ['codice tributo 2521', 'bollo-virtuale'], ['plafond lettera d\'intento', 'lettere-intento'],
    ['esportatore abituale', 'lettere-intento'], ['scontrino', 'spese-non-elettroniche'], ['affitto', 'spese-non-elettroniche']])
    assert.ok(cercaGuida(q).slice(0, 2).some(r => r.argomento.id === id), q);
});
