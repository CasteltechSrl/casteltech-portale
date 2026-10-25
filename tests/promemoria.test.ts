import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daChiudereOggi, eOra, giornoLavorativoDopo, hhmm, leggiOrari, momentoPromemoria, partiRoma, sogliaMinuti } from '../src/engine/promemoria.js';

test('promemoria: dopo il doppio del tempo previsto, minimo 30 minuti', () => {
  assert.equal(sogliaMinuti(3600), 120);          // fase da 1h → promemoria dopo 2h
  assert.equal(sogliaMinuti(5 * 60), 30);         // fase da 5 minuti → comunque 30 minuti
  assert.equal(sogliaMinuti(0), 30);              // fase non prevista
  assert.equal(sogliaMinuti(3600, leggiOrari({ fattore: 1.5, minimoMin: 45 })), 90);
});

test('promemoria: non parte di sera, nel weekend o il giorno dopo', () => {
  // 26/10/2026 è lunedì; ora solare: Italia = UTC+1
  const lun9 = new Date('2026-10-26T08:00:00Z');                    // lunedì 9:00
  assert.equal(momentoPromemoria(lun9, 120)?.toISOString(), '2026-10-26T10:00:00.000Z');
  assert.ok(momentoPromemoria(new Date('2026-10-26T17:00:00Z'), 120));         // 18:00 + 2h = 20:00 → sì
  assert.equal(momentoPromemoria(new Date('2026-10-26T17:30:00Z'), 120), null); // 18:30 + 2h = 20:30 → no
  assert.equal(momentoPromemoria(new Date('2026-10-26T20:00:00Z'), 180), null); // 21:00 + 3h → giorno dopo
  assert.equal(momentoPromemoria(new Date('2026-10-31T08:00:00Z'), 60), null);  // sabato
});

test('promemoria: giorno lavorativo dopo, saltando il weekend', () => {
  assert.equal(giornoLavorativoDopo('2026-10-26'), '2026-10-27');  // lunedì → martedì
  assert.equal(giornoLavorativoDopo('2026-10-30'), '2026-11-02');  // venerdì → lunedì (3 giorni dopo)
  assert.equal(giornoLavorativoDopo('2026-10-31'), '2026-11-02');  // sabato → lunedì
  assert.equal(daChiudereOggi('2026-10-30', '2026-10-30'), false);
  assert.equal(daChiudereOggi('2026-10-30', '2026-11-02'), true);
  assert.equal(daChiudereOggi('2026-10-26', '2026-10-28'), true);  // ancora aperta: si ripete
});

test('promemoria: ora italiana e finestra degli orari giornalieri', () => {
  const p = partiRoma(new Date('2026-10-26T15:30:00Z'));
  assert.deepEqual([p.data, p.ora, p.feriale], ['2026-10-26', '16:30', true]);
  assert.equal(eOra('16:30', p), true);
  assert.equal(eOra('16:30', { minuti: 16 * 60 + 29, feriale: true }), false);
  assert.equal(eOra('16:30', { minuti: 17 * 60, feriale: true }), false);
  assert.equal(eOra('16:30', { minuti: 16 * 60 + 30, feriale: false }), false);
  assert.equal(partiRoma(new Date('2026-07-01T14:30:00Z')).ora, '16:30');         // ora legale: UTC+2
  assert.equal(hhmm(119.6), '2:00');
  assert.deepEqual(leggiOrari({ fineGiornata: '25:00', fattore: 'x' }).fineGiornata, '16:30');
});
