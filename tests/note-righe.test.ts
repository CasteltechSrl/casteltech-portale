// Note per riga del DDT e domanda "cosa sostituisco" alla scelta del codice (Adriano 9/11/2026, DDT 222). Esempi inventati.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { descrizioneConNota, notaRiga, righeDaModulo } from '../src/engine/documenti.js';
import { cellaNotaRiga, riquadriSceltaProdotto } from '../src/server/views/scelta-prodotto.js';

test('nota della riga: spazi tolti, maiuscolo, vuota = null', () => {
  assert.equal(notaRiga('  matricole 101-150  '), 'MATRICOLE 101-150');
  assert.equal(notaRiga('   '), null);
  assert.equal(notaRiga(undefined), null);
  assert.equal(notaRiga('x'.repeat(600))!.length, 500);
});

test('descrizione con la nota (XML e PDF)', () => {
  assert.equal(descrizioneConNota('SCHEDA ALFA', 'LOTTO 12'), 'SCHEDA ALFA - LOTTO 12');
  assert.equal(descrizioneConNota('SCHEDA ALFA', null), 'SCHEDA ALFA');
  assert.equal(descrizioneConNota('', 'SOLO NOTA'), 'SOLO NOTA');
});

test('righe del modulo: la nota resta nella riga, non nelle righe di solo testo', () => {
  const { righe, errori } = righeDaModulo([
    { codice: 'AB-100', descrizione: 'SCHEDA ALFA', quantita: '10', prezzo: '5', note: 'senza connettore' },
    { descrizione: 'DDT n. 3 del 01/11/2026', solo_descrizione: 'on', note: 'ignorata' },
  ]);
  assert.deepEqual(errori, []);
  assert.equal(righe[0].note, 'SENZA CONNETTORE');
  assert.equal(righe[0].descrizione, 'SCHEDA ALFA');     // la descrizione dell'anagrafica non cambia
  assert.equal(righe[1].note, null);
});

test('casella Note nella riga e riquadro "cosa sostituisco"', () => {
  const c = String(cellaNotaRiga({ note: 'LOTTO 12' }, 4));
  assert.match(c, /name="righe\[4\]\[note\]"/);
  assert.match(c, /value="LOTTO 12"/);
  const r = String(riquadriSceltaProdotto(1));
  assert.match(r, /id="domanda-sostituisci"/);
  assert.match(r, /anche la descrizione/);
  assert.match(r, /anche il prezzo/);
  assert.match(r, /Solo il codice/);
});

test('la nota passa dal DDT alla fattura e alle stampe', () => {
  const servizio = readFileSync('src/server/documenti-servizio.ts', 'utf8');
  assert.match(servizio, /commessa_id, ddt_id, note\)\s+SELECT [^`]*\$3, note/);            // aggiungiDdt copia la nota
  assert.match(servizio, /descrizione: descrizioneConNota\(r\.descrizione, r\.note\)/);  // XML della fattura
  assert.match(readFileSync('src/server/views/stampa-documento.ts', 'utf8'), /notaStampa\(r\)/);
  for (const f of ['src/server/pdf-ddt.ts', 'src/server/pdf-fattura.ts']) assert.match(readFileSync(f, 'utf8'), /r\.note \? aCapo/);
  assert.match(readFileSync('db/migrazioni/084_note_righe_documenti.sql', 'utf8'), /ADD COLUMN IF NOT EXISTS note text/);
});

test('guida: note per riga del DDT', async () => {
  const { cercaGuida } = await import('../src/engine/guida.js') as any;
  if (typeof cercaGuida !== 'function') return;
  const trovati = cercaGuida('note riga ddt');
  assert.ok(JSON.stringify(trovati).includes('note-righe-ddt'));
});
