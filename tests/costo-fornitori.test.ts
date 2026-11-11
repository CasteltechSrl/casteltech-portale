import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costoDocumento, ePartitaFinanziaria, fattoreRighe, SQL_NON_DOPPIONE } from '../src/engine/costo-fornitori.js';

// Adriano 11/11/2026: energia Enel 2025 a 5.543 € invece di ~9.400 €.
test('"Importo a credito cliente" di Enel è una partita finanziaria, non un costo', () => {
  assert.equal(ePartitaFinanziaria('ALTRE PARTITE - Importo a credito cliente (importo non assoggettato ad IVA)', 'N2.2'), true);
  assert.equal(ePartitaFinanziaria('Rimborso doppi pagamenti', 'N2.2'), true);
  assert.equal(ePartitaFinanziaria('ALTRE PARTITE - Indennizzo per mancata Emissione fattura', 'N1'), false);
  assert.equal(ePartitaFinanziaria('RIMBORSO SPESE INCASSO', 'N3.5'), false);
});

test('bolletta "a credito" (nota di credito in FIC, righe negative nell\'XML): resta il costo dell\'energia del mese', () => {
  const righe = [
    { imponibile: 112.8, descrizione: 'SPESA PER L\'ENERGIA - Energia fascia F1', natura: '' },
    { imponibile: 236.54, descrizione: 'Trasporto e oneri', natura: '' },
    { imponibile: -954.29, descrizione: 'ALTRE PARTITE - Importo a credito cliente (importo non assoggettato ad IVA)', natura: 'N2.2' },
  ];
  // FIC: nota di credito da 570,22 → prima −570,22, ora +384,07 (la parte di energia del mese)
  assert.equal(costoDocumento({ tipo: 'nota_credito', imponibile: 570.22 }, righe), 384.07);
});

test('segno delle righe: note di credito con importi positivi o già negativi nell\'XML', () => {
  assert.equal(fattoreRighe(-100, 100), -1);   // nota di credito normale
  assert.equal(fattoreRighe(-1347.21, -1347.21), 1); // nota di credito DigiKey con importi negativi
  assert.equal(fattoreRighe(500, 480), 1);
  assert.equal(fattoreRighe(0, 19.36), 1);
  assert.equal(costoDocumento({ tipo: 'nota_credito', imponibile: 100 }, [{ imponibile: 100 }]), -100);
  assert.equal(costoDocumento({ tipo: 'fattura', imponibile: 100 }, []), 100);
});

test('doppione: stesso fornitore, numero, data, tipo e totale', () => {
  for (const c of ['z.numero = d.numero', 'z.data = d.data', 'z.tipo = d.tipo', 'z.totale = d.totale', 'z.id < d.id']) assert.ok(SQL_NON_DOPPIONE.includes(c), c);
});
