import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classificaFornitori, linkAnalisiComponente, linkAnalisiFornitore, linkAnalisiMateriale, linkAnalisiProdotto, prezzoNetto, schedaArticolo, schedaFornitore, totaliAcquisti,
  type FatturaFornitore,
} from '../src/engine/analisi-acquisti.js';
import { linkPermesso } from '../src/engine/link-profilo.js';
import { cercaGuida } from '../src/engine/guida.js';

const f = (fornitoreChiave: string, data: string, imponibile: number, tipo: 'fattura' | 'nota_credito' = 'fattura', categoria: string | null = null): FatturaFornitore =>
  ({ fornitoreChiave, fornitoreId: fornitoreChiave.startsWith('f') ? Number(fornitoreChiave.slice(1)) : null, fornitore: fornitoreChiave.toUpperCase(), tipo, data, imponibile, categoria });

const FATTURE = [
  f('f1', '2024-03-10', 1000, 'fattura', 'B6 Materie prime'), f('f1', '2024-09-01', 500), f('f1', '2025-02-01', 2000), f('f1', '2025-05-01', 100, 'nota_credito'),
  f('f2', '2024-06-01', 3000), f('f2', '2025-06-01', 1000, 'fattura', 'B7 Servizi'),
  f('n:TERZO', '2025-01-15', 400),
];

test('fornitore: totali per anno e scheda anno per anno con variazione, peso, categorie, fermo e pagamenti', () => {
  const totali = totaliAcquisti(FATTURE);
  assert.deepEqual(totali, { 2024: 4500, 2025: 3300 });
  const s = schedaFornitore(FATTURE.filter(x => x.fornitoreChiave === 'f1'), {
    totali, oggi: '2026-11-06',
    pagamenti: [
      { fornitoreChiave: 'f1', dataFattura: '2025-11-01', scadenza: '2025-12-31', importo: 1000, pagataIl: '2026-01-10' },   // 70 gg dalla fattura, 10 di ritardo
      { fornitoreChiave: 'f1', dataFattura: '2026-01-01', scadenza: '2026-03-02', importo: 500, pagataIl: '2026-03-02' },    // 60 gg, puntuale
      { fornitoreChiave: 'f1', dataFattura: '2026-09-01', scadenza: '2026-10-31', importo: 300, pagataIl: null },            // scaduta
      { fornitoreChiave: 'f1', dataFattura: '2026-10-01', scadenza: '2026-11-30', importo: 200, pagataIl: null },            // aperta
    ],
    ordini: [{ fornitoreChiave: 'f1', data: '2026-11-03', totale: 250 }],
  });
  assert.deepEqual(s.righe.map(r => [r.anno, r.acquisti, r.variazione, r.pesoTotale, r.fatture, r.ordini]), [
    [2024, 1500, null, 33.3, 2, 0], [2025, 1900, 27, 57.6, 2, 0], [2026, 0, -100, null, 0, 1],
  ]);
  assert.equal(s.totale.acquisti, 3400);
  assert.equal(s.ultimaData, '2025-05-01');
  assert.equal(s.fermo, true);                      // oltre 6 mesi senza fatture
  assert.deepEqual(s.categorie, [{ categoria: 'B6 Materie prime', importo: 1000 }]);
  assert.equal(s.pagamenti.giorniMedi, 65);
  assert.equal(s.pagamenti.ritardoMedio, 5);
  assert.equal(s.pagamenti.pagate, 2);
  assert.equal(s.pagamenti.daPagare, 500);
  assert.equal(s.pagamenti.scaduto, 300);
});

test('fornitori: classifica di un anno in ordine di acquisti, con anno prima, peso e fornitori non in anagrafica', () => {
  const c = classificaFornitori(FATTURE, 2025, '2026-11-06');
  assert.deepEqual(c.map(x => [x.fornitore, x.acquisti, x.acquistiPrima, x.variazione, x.pesoTotale, x.fatture]), [
    ['F1', 1900, 1500, 27, 57.6, 2], ['F2', 1000, 3000, -67, 30.3, 1], ['N:TERZO', 400, 0, null, 12.1, 1],
  ]);
  assert.equal(c[2].fornitoreId, null);
  // nel 2024 F2 era il primo
  assert.equal(classificaFornitori(FATTURE, 2024, '2026-11-06')[0].fornitore, 'F2');
});

test('articolo: pezzi, spesa, prezzo medio pesato con lo sconto, variazione del prezzo, fornitori, ultimo acquisto e oscillazione', () => {
  const righe = [
    { data: '2025-03-01', documentoId: 1, numero: '1', fornitore: 'MOUSER', fornitoreId: 5, quantita: 1000, prezzo: 0.10, sconto: 0 },
    { data: '2025-07-01', documentoId: 2, numero: '2', fornitore: 'DIGIKEY', fornitoreId: 6, quantita: 1000, prezzo: 0.125, sconto: 20 },  // netto 0,10
    { data: '2026-02-01', documentoId: 3, numero: '3', fornitore: 'MOUSER', fornitoreId: 5, quantita: 500, prezzo: 0.12, sconto: 0 },
  ];
  assert.equal(prezzoNetto(righe[1]), 0.1);
  const s = schedaArticolo(righe, '2026-11-06');
  assert.deepEqual(s.righe.map(r => [r.anno, r.pezzi, r.spesa, r.prezzoMedio, r.variazionePrezzo, r.variazioneSpesa, r.ordini, r.fornitori]), [
    [2025, 2000, 200, 0.1, null, null, 2, ['DIGIKEY', 'MOUSER']], [2026, 500, 60, 0.12, 20, -70, 1, ['MOUSER']],
  ]);
  assert.deepEqual(s.totale, { pezzi: 2500, spesa: 260, ordini: 3, prezzoMedio: 0.104 });
  assert.deepEqual(s.ultimo, { data: '2026-02-01', prezzo: 0.12, fornitore: 'MOUSER', quantita: 500 });
  assert.equal(s.minimo, 0.1); assert.equal(s.massimo, 0.12);
  assert.equal(s.mesiFermo, 9);
  // senza righe: scheda vuota, niente errori
  const vuota = schedaArticolo([], '2026-11-06');
  assert.equal(vuota.righe.length, 0); assert.equal(vuota.ultimo, null); assert.equal(vuota.totale.prezzoMedio, null);
});

test('pulsanti Analisi delle anagrafiche: indirizzi e profili (chi non apre l\'Analisi non vede il pulsante)', () => {
  assert.equal(linkAnalisiProdotto({ codice: 'EA1002-0', cliente_id: 12 }), '/amministrazione/analisi/prodotto?codice=EA1002-0&cliente=c12');
  assert.equal(linkAnalisiProdotto({ codice: 'X Y', cliente_id: null }), '/amministrazione/analisi/prodotto?codice=X%20Y');
  assert.equal(linkAnalisiFornitore(7), '/amministrazione/analisi/fornitore?f=f7');
  assert.equal(linkAnalisiComponente(3), '/amministrazione/analisi/componente?id=3');
  assert.equal(linkAnalisiMateriale(9), '/amministrazione/analisi/materiale?id=9');
  for (const p of ['/amministrazione/analisi/prodotto', '/amministrazione/analisi/fornitore', '/amministrazione/analisi/fornitori', '/amministrazione/analisi/componente', '/amministrazione/analisi/materiale']) {
    // Analisi solo all'amministratore e all'esterno (Adriano 6/11/2026)
    assert.equal(linkPermesso('ufficio', p), false, p);
    assert.equal(linkPermesso('amministratore', p), true);
    assert.equal(linkPermesso('esterno', p), true);
    assert.equal(linkPermesso('contabilita', p), false, p);
    assert.equal(linkPermesso('produzione', p), false, p);
  }
});

test('guida: analisi di fornitori, componenti e materiali', () => {
  assert.equal(cercaGuida('analisi fornitore acquisti anno per anno')[0]?.argomento.id, 'analisi-acquisti');
  assert.equal(cercaGuida('quanto ho speso da un fornitore')[0]?.argomento.id, 'analisi-acquisti');
  assert.equal(cercaGuida('pulsante analisi prodotto anagrafica')[0]?.argomento.id, 'analisi-prodotti');
});
