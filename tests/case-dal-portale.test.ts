/**
 * Formato (case) nuovo aggiunto dalla pagina della riga BOM (Adriano 4/11/2026: "vorrei poter aggiungere un formato nuovo da qui").
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caseDaAggiungere, caseInTabella, codiceProposto, controllaNuovoCase } from '../src/engine/codifica/valori-tabella.js';
import { caseLookup, calcola } from '../src/engine/codifica/regole.js';
import { impostaCaseDalPortale } from '../src/engine/codifica/aggiunte.js';

test('controlli prima di aggiungere un formato', () => {
  impostaCaseDalPortale([]);
  assert.match((controllaNuovoCase({ case: '0603', codice: '0603', tecnologia: 'S' }) as any).errore, /già in tabella/);
  assert.match((controllaNuovoCase({ case: '', codice: '2SMD', tecnologia: 'S' }) as any).errore, /Scrivi il formato/);
  assert.match((controllaNuovoCase({ case: '2SMD', codice: '2SM', tecnologia: 'S' }) as any).errore, /4 lettere o cifre/);
  assert.match((controllaNuovoCase({ case: '2SMD', codice: '2SMD', tecnologia: 'X' }) as any).errore, /tecnologia/);
  const ok = controllaNuovoCase({ case: '2 smd', codice: '2smd', tecnologia: 's' });
  assert.deepEqual(ok, { chiave: '2SMD', scritto: '2 SMD', codice: '2SMD', tecnologia: 'S', sinonimoDi: null });
  // stesso codice di un case già in tabella = sinonimo, si dice quale
  const sin = controllaNuovoCase({ case: 'SOT-23-THIN-5', codice: 'T235', tecnologia: 'S' });
  assert.ok('chiave' in sin && sin.sinonimoDi);
  assert.equal(codiceProposto('2SMD'), '2SMD');
  assert.equal(codiceProposto('SMD-2'), 'SMD2');
  assert.equal(codiceProposto('X'), 'X000');
});

test('il formato aggiunto vale nella codifica, toglierlo lo riporta "non in tabella"', () => {
  impostaCaseDalPortale([]);
  const r = { famiglia: 'PU', attributi: { case: '2SMD' } as any, note: ['case "2SMD" non in tabella: da definire'] };
  assert.equal(caseDaAggiungere(r), '2SMD');
  assert.equal(caseLookup('2SMD')[0], null);
  impostaCaseDalPortale([{ chiave: '2SMD', scritto: '2SMD', codice: '2SMD', tecnologia: 'S', nota: null, creato_da: 'Adriano' }]);
  assert.deepEqual(caseLookup('2-SMD').slice(0, 2), ['2SMD', 'S']);
  assert.ok(caseInTabella().includes('2SMD'), 'nell\'elenco della casella');
  assert.equal(caseDaAggiungere(r), null, 'già in tabella: niente riquadro');
  assert.equal(caseDaAggiungere({ famiglia: 'CN', attributi: { case: 'XYZ' } as any, note: ['case "XYZ" non in tabella'] }), null, 'connettori senza case');
  const c = calcola('RS', { case: '2SMD', valore: '10K', tolleranza: '1' } as any, null);
  assert.equal(c.C, '2SMD', 'il codice del formato entra nel gestionale');
  impostaCaseDalPortale([]);
  assert.equal(caseLookup('2SMD')[0], null);
});
