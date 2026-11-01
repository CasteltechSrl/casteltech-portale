import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { controlliOrdineDaPreventivo, righeDaModuloOrdine, righeOrdineDaPreventivo, totaleOrdineProposto } from '../src/engine/ordine-da-preventivo.js';
import { cercaGuida } from '../src/engine/guida.js';

const base = { codice: 'ea1002-0', descrizione: 'Scheda prova', nSchede: 100, prezzoScheda: 12.345, unaTantum: [{ nome: 'Programmazione attrezzature di produzione', prezzo: 250 }, { nome: 'Lamina serigrafica', prezzo: 110 }, { nome: 'Niente', prezzo: 0 }] };

test('ordine dal preventivo: una riga di schede al prezzo del preventivo + una tantum come servizi solo nel primo lotto', () => {
  const primo = righeOrdineDaPreventivo(base, true);
  assert.equal(primo.length, 3);
  assert.deepEqual(primo[0], { tipo: 'scheda', codice: 'EA1002-0', descrizione: 'SCHEDA PROVA', quantita: 100, prezzo: 12.35 });
  assert.deepEqual(primo[1], { tipo: 'servizio', codice: null, descrizione: 'PROGRAMMAZIONE ATTREZZATURE DI PRODUZIONE', quantita: 1, prezzo: 250 });
  assert.equal(totaleOrdineProposto(primo), 1595);
  const successivo = righeOrdineDaPreventivo(base, false);
  assert.equal(successivo.length, 1);
  assert.equal(righeOrdineDaPreventivo({ ...base, codice: null, descrizione: null }, false)[0].descrizione, 'SCHEDA');
});

test('ordine dal preventivo: righe dal modulo (vuote saltate, numeri all\'italiana) e controlli', () => {
  const righe = righeDaModuloOrdine({ riga_tipo: ['scheda', 'servizio', 'scheda'], riga_codice: ['ea1002-0', '', ''], riga_desc: ['scheda', 'lamina', ''], riga_qta: ['1.000', '1', ''], riga_prezzo: ['12,35', '110', ''] });
  assert.equal(righe.length, 2);
  assert.deepEqual(righe[0], { tipo: 'scheda', codice: 'EA1002-0', descrizione: 'SCHEDA', quantita: 1000, prezzo: 12.35 });
  const oggi = '2026-11-02';
  assert.deepEqual(controlliOrdineDaPreventivo({ clienteId: 1, righe, consegna: '2026-11-27', dataOrdineCliente: '2026-11-01', oggi }), []);
  const errori = controlliOrdineDaPreventivo({ clienteId: null, righe: [righe[1]], consegna: '2026-10-01', dataOrdineCliente: '2026-12-01', oggi });
  assert.ok(errori.some(e => /cliente/.test(e)) && errori.some(e => /riga di schede/.test(e)) && errori.some(e => /passato/.test(e)) && errori.some(e => /futuro/.test(e)), errori.join(' | '));
  assert.ok(controlliOrdineDaPreventivo({ clienteId: 1, righe: [{ ...righe[0], quantita: 0 }], consegna: null, dataOrdineCliente: null, oggi }).length > 0);
});

test('ordine dal preventivo: pulsante "Crea ordine" nel preventivo salvato, origine preventivo e collegamento nella migrazione 058', () => {
  const rotta = readFileSync('src/server/rotte/preventivi.ts', 'utf8');
  assert.ok(rotta.includes('href="/preventivi/${salvato.id}/ordine"') && rotta.includes("r.post('/:id/ordine'"));
  const mig = readFileSync('db/migrazioni/058_ordine_da_preventivo.sql', 'utf8');
  assert.ok(mig.includes('preventivo_id') && mig.includes("'preventivo'"));
  assert.ok(readFileSync('src/server/ordine-da-preventivo-servizio.ts', 'utf8').includes("'preventivo'"));
  for (const q of ['creare l\'ordine dal preventivo', 'il cliente ha confermato il preventivo'])
    assert.ok(cercaGuida(q).slice(0, 3).some(r => r.argomento.id === 'ordine-da-preventivo'), q);
});
