import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analisiClienti, analisiProdotti, commentiAnalisi, marginePreventivo, nomeCategoria, perMese, quotaPrimi, raggruppaAcquisti,
  type FatturaAnalisi, type PreventivoProdotto, type RigaAnalisi,
} from '../src/engine/analisi.js';
import { cercaGuida } from '../src/engine/guida.js';

const periodo = { anno: 2026, finoA: '2026-10-31' };
const f = (cliente: string, data: string, imponibile: number, tipo = 'fattura'): FatturaAnalisi => ({ cliente, tipo, data, imponibile });
const fatture = [
  f('ALFA', '2026-03-10', 6000), f('ALFA', '2025-03-10', 6000), f('ALFA', '2025-12-10', 9000),
  f('BETA', '2026-02-10', 1000), f('BETA', '2025-02-10', 5000), f('BETA', '2026-04-10', 200, 'nota_credito'),
  f('GAMMA', '2025-05-10', 6000), f('NUOVO', '2026-06-01', 3000),
];
const righe: RigaAnalisi[] = [
  { codice: 'P1', descrizione: 'SCHEDA', cliente: 'ALFA', tipo: 'fattura', data: '2026-03-10', quantita: 100, importo: 4000 },
  { codice: 'P2', descrizione: 'SCHEDA 2', cliente: 'BETA', tipo: 'fattura', data: '2026-02-10', quantita: 50, importo: 1000 },
  { codice: 'P1', descrizione: 'SCHEDA', cliente: 'ALFA', tipo: 'fattura', data: '2025-03-10', quantita: 100, importo: 4500 },
];
const preventivi = new Map<string, PreventivoProdotto>([['P1', { codice: 'P1', prezzoScheda: 45, marginePct: 25 }], ['P2', { codice: 'P2', prezzoScheda: 20, marginePct: 5 }]]);

test('analisi: per mese e stesso periodo dell\'anno prima (note di credito in negativo, dicembre fuori dal confronto)', () => {
  const m = perMese(fatture, x => x.imponibile, 2025, '2026-10-31');
  assert.equal(m[11], 0);
  assert.equal(m[2], 6000);
  assert.equal(perMese(fatture, x => x.imponibile, 2026)[3], -200);
});

test('analisi: clienti con peso, variazione, margine stimato dal preventivo e giorni di incasso', () => {
  const c = analisiClienti(periodo, fatture, righe, preventivi, [
    { cliente: 'ALFA', dataDocumento: '2026-01-10', scadenza: '2026-03-10', incassata: '2026-03-20', importo: 1000 },
    { cliente: 'ALFA', dataDocumento: '2026-02-10', scadenza: '2026-04-10', incassata: '2026-04-10', importo: 3000 },
  ]);
  assert.deepEqual(c.map(x => x.cliente), ['ALFA', 'NUOVO', 'BETA', 'GAMMA']);
  const alfa = c[0];
  assert.equal(alfa.quota, 61.2);
  assert.equal(alfa.variazione, 0);
  assert.equal(alfa.primaAnnoIntero, 15000);
  assert.equal(alfa.margineStimato, 1000);   // 4000 × 25%
  assert.equal(alfa.copertura, 67);          // 4000 su 6000
  assert.equal(alfa.giorniIncasso, 62);      // (69 × 1000 + 59 × 3000) ÷ 4000 = 61,5
  assert.equal(alfa.ritardoMedio, 3);       // 10 giorni su 1000 €
  assert.equal(c.find(x => x.cliente === 'BETA')!.variazione, -84);
  assert.equal(quotaPrimi(c, 2), 91.8);
});

test('analisi: prodotti con prezzo medio, scarto dal preventivo e margine', () => {
  const p = analisiProdotti(periodo, righe, preventivi);
  assert.equal(p[0].codice, 'P1');
  assert.equal(p[0].prezzoMedio, 40);
  assert.equal(p[0].scartoPrezzo, -11);
  assert.equal(p[0].fatturatoPrima, 4500);
  assert.equal(marginePreventivo({ guadagnoLotto: 250, totaleSecondoLotto: 1000 }), 25);
  assert.equal(marginePreventivo({}), null);
});

test('analisi: acquisti per categoria (nome FIC ripulito)', () => {
  assert.equal(nomeCategoria('B6_Materie prime c/acquisti'), 'Materie prime c/acquisti');
  assert.equal(nomeCategoria(null), 'Senza categoria');
  const g = raggruppaAcquisti(periodo, [
    { fornitore: 'MOUSER', categoria: 'B6_Materie prime', tipo: 'fattura', data: '2026-02-01', imponibile: 1250 },
    { fornitore: 'MOUSER', categoria: 'B6_Materie prime', tipo: 'fattura', data: '2025-02-01', imponibile: 1000 },
  ], a => nomeCategoria(a.categoria));
  assert.deepEqual([g[0].nome, g[0].importo, g[0].prima, g[0].variazione], ['Materie prime', 1250, 1000, 25]);
});

test('analisi: commenti critici prima, con il consiglio (calo, dipendenza, clienti fermi, scaduto, prezzi)', () => {
  const clienti = analisiClienti(periodo, fatture, righe, preventivi, []);
  const prodotti = analisiProdotti(periodo, righe, preventivi);
  const c = commentiAnalisi({ periodo, fatturato: 9800, fatturatoPrima: 17000, acquisti: 6000, acquistiPrima: 5000, mesiChiusi: 9,
    fatturatoMesiChiusi: 9800, fatturatoAnnoPrima: 26000, clienti, prodotti, scaduto: 5000, scadutoOltre60: [{ cliente: 'BETA', importo: 3000 }] });
  assert.equal(c[0].livello, 'critico');
  const testi = c.map(x => x.testo).join('\n');
  assert.match(testi, /Fatturato in calo del 42%/);
  assert.match(testi, /BETA \(−4\.?200 €\)/);
  assert.match(testi, /ALFA vale da solo il 61.2%/);
  assert.match(testi, /non hanno ancora comprato: GAMMA/);
  assert.match(testi, /scadute da oltre 60 giorni: BETA/);
  assert.match(testi, /Clienti nuovi quest'anno: NUOVO/);
  assert.match(testi, /sotto il prezzo del preventivo: P1 \(-11%\)/);
  assert.ok(c.filter(x => x.livello !== 'bene').every(x => x.consiglio));
});

test('guida: analisi', () => {
  for (const q of ['analisi', 'come sta andando l\'azienda', 'margine per cliente', 'clienti che pagano in ritardo'])
    assert.ok(cercaGuida(q).slice(0, 3).some(r => r.argomento.id === 'analisi'), q);
});
