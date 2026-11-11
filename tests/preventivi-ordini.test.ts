// Riga d'ordine del cliente collegata al preventivo (Adriano 11/11/2026). Esempi inventati.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { codiceNormale, etichettaPreventivo, propostaPreventivo, type CandidatoPreventivo } from '../src/engine/preventivi-ordini.js';

const c = (x: Partial<CandidatoPreventivo> & { id: number }): CandidatoPreventivo => ({
  numero: `P2026-${x.id}`, clienteId: 1, prodottoId: null, codice: null, stato: 'bozza', origine: 'nuovo', nSchede: 100, prezzoScheda: 10, data: '2026-05-01', ...x,
});

test('stesso prodotto: vince la quantità preventivata più vicina a quella dell\'ordine', () => {
  const candidati = [
    c({ id: 1, prodottoId: 7, nSchede: 50, data: '2026-09-01', stato: 'inviato' }),
    c({ id: 2, prodottoId: 7, nSchede: 500, data: '2026-03-01' }),
    c({ id: 3, prodottoId: 8, nSchede: 400 }),
  ];
  assert.deepEqual(propostaPreventivo({ prodottoId: 7, codici: [], quantita: 450, dataOrdine: '2026-10-01' }, candidati), { id: 2, motivo: 'prodotto' });
  assert.equal(propostaPreventivo({ prodottoId: 7, codici: [], quantita: 60, dataOrdine: '2026-10-01' }, candidati)?.id, 1);
});

test('a pari quantità: prima inviati/accettati, poi fatti prima dell\'ordine, poi il più recente', () => {
  const candidati = [
    c({ id: 1, prodottoId: 7, data: '2026-09-01' }),
    c({ id: 2, prodottoId: 7, data: '2026-04-01', stato: 'accettato' }),
    c({ id: 3, prodottoId: 7, data: '2026-12-01', stato: 'inviato' }),
  ];
  assert.equal(propostaPreventivo({ prodottoId: 7, codici: [], quantita: 100, dataOrdine: '2026-10-01' }, candidati)?.id, 2);
});

test('vecchio portale senza anagrafica: si trova dal codice scritto, senza trattini e spazi', () => {
  assert.equal(codiceNormale('ea-1002.0 '), 'EA10020');
  const candidati = [c({ id: 9, codice: 'EA 1002-0', origine: 'vecchio_portale' }), c({ id: 10, codice: 'ALTRO' })];
  assert.deepEqual(propostaPreventivo({ prodottoId: 3, codici: ['EA10020'], quantita: 10, dataOrdine: null }, candidati), { id: 9, motivo: 'codice' });
  assert.equal(propostaPreventivo({ prodottoId: 3, codici: ['ZZ'], quantita: 10, dataOrdine: null }, candidati), null);
  assert.match(etichettaPreventivo(candidati[0]), /P2026-9 · EA 1002-0 · 100 pz · 10,00 €\/scheda · 01\/05\/2026 \(vecchio portale\)/);
});

test('pagina dell\'ordine: menu del preventivo, Crea commessa dalla riga, commessa collegata alla riga', () => {
  const ordini = readFileSync('src/server/rotte/ordini.ts', 'utf8');
  assert.match(ordini, /righe\[r\$\{x\.id\}\]\[preventivo\]/);
  assert.match(ordini, /\/commesse\/nuova\?preventivo=\$\{x\.preventivoId\}&riga=\$\{x\.id\}/);
  const commesse = readFileSync('src/server/rotte/commesse.ts', 'utf8');
  assert.match(commesse, /collegaCommessaARiga\(Number\(b\.rigaOrdine\)/);
  assert.match(readFileSync('db/migrazioni/092_righe_ordine_preventivo.sql', 'utf8'), /ordini_righe ADD COLUMN IF NOT EXISTS preventivo_id/);
});
