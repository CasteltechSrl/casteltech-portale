import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pagamentoRata } from '../src/engine/amministrazione.js';
import { statoIncasso } from '../src/engine/anticipi.js';
import { cercaGuida } from '../src/engine/guida.js';

test('pagamento parziale: la rata si divide in pagato e residuo (Adriano 10/11/2026)', () => {
  assert.deepEqual(pagamentoRata(1220, ''), { pagato: 1220, residuo: 0 });
  assert.deepEqual(pagamentoRata(1220, '1220'), { pagato: 1220, residuo: 0 });
  assert.deepEqual(pagamentoRata(1220, '500'), { pagato: 500, residuo: 720 });
  assert.deepEqual(pagamentoRata(1220, '500,50'), { pagato: 500.5, residuo: 719.5 });
  assert.deepEqual(pagamentoRata(3000, '1.000,00 €'), { pagato: 1000, residuo: 2000 });
  assert.deepEqual(pagamentoRata(3000, '1.000'), { pagato: 1000, residuo: 2000 });
  assert.ok('errore' in pagamentoRata(1220, '1500'));
  assert.ok('errore' in pagamentoRata(1220, '0'));
  assert.ok('errore' in pagamentoRata(1220, 'abc'));
  // note di credito (rate negative): sempre intere
  assert.deepEqual(pagamentoRata(-200, '50'), { pagato: -200, residuo: 0 });
});

test('pagamento parziale: colonna Incasso dice quanto resta, la Guida lo spiega', () => {
  const i = statoIncasso([{ scadenza: '2026-12-31', importo: 500, pagata: '2026-11-10' }, { scadenza: '2026-12-31', importo: 720, pagata: null }], '2026-11-10')!;
  assert.equal(i.stato, 'in_parte');
  assert.match(i.testo, /restano 720,00 €/);
  assert.ok(cercaGuida('fattura pagata parzialmente').some(a => a.argomento.id === 'incassi-pagamenti'));
});

test('solleciti incassi: pulsante "Pagato" per rata, spiegato nella Guida', async () => {
  const { readFileSync } = await import('node:fs');
  const rotte = readFileSync('src/server/rotte/amministrazione.ts', 'utf8');
  assert.match(rotte, /function moduloPagato/);
  assert.match(readFileSync('public/solleciti.js', 'utf8'), /X-Senza-Ricarica/);
  assert.ok(cercaGuida('solleciti pagato').some(a => a.argomento.id === 'solleciti-incassi'));
});
