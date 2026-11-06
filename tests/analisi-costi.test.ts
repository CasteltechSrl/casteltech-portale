import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chiaveFornitore, classificaCosti, confrontoRivendita, costiPerAnno, fornitoriDaControllare, riassuntoCosti, type RigaCosto,
} from '../src/engine/analisi-costi.js';
import { cercaGuida } from '../src/engine/guida.js';

const riga = (x: Partial<RigaCosto> & { fornitore: string; descrizione: string; importo: number; data: string }): RigaCosto =>
  ({ rigaId: 1, documentoId: 1, fornitoreChiave: `n:${x.fornitore.toUpperCase()}`, codici: [], ...x });

test('costi: le regole scritte dall\'ufficio vincono su parole e fornitore; la fattura senza righe usa anche la categoria di FIC', () => {
  const righe = [
    riga({ rigaId: 1, fornitore: 'Mouser Electronics', descrizione: 'LM358 op amp', importo: 100, data: '2026-03-01' }),
    riga({ rigaId: 2, fornitore: 'Laura Nardi', descrizione: 'Fornitura come da ordine', importo: 500, data: '2026-03-02' }),
    riga({ rigaId: null, documentoId: 9, fornitore: 'Studio Rossi', descrizione: '', importo: 300, data: '2026-03-03', categoriaFic: 'B7_Consulenze' }),
    riga({ rigaId: 3, fornitore: 'Pippo Snc', descrizione: 'Varie', importo: 50, data: '2026-03-04' }),
    riga({ rigaId: 4, fornitore: 'Pippo Snc', descrizione: 'Rif. DDT 12', importo: 0, data: '2026-03-04' }),
  ];
  const c = classificaCosti(righe, [{ tipo: 'fornitore', chiave: 'LAURA  NARDI', categoria: 'meccanica' }, { tipo: 'riga', chiave: '1', categoria: 'ricambi_saldatura' }]);
  assert.equal(c.length, 4, 'la riga a zero (riferimento DDT) non conta');
  assert.deepEqual(c.map(r => [r.categoria, r.come]), [['ricambi_saldatura', 'regola'], ['meccanica', 'regola'], ['consulenze_amministrative', 'fic'], ['altro', 'nessuna']]);
  assert.equal(chiaveFornitore('  laura   nardi '), 'LAURA NARDI');
  const dc = fornitoriDaControllare(c);
  assert.deepEqual(dc.map(f => [f.nome, f.importo, f.righe]), [['Pippo Snc', 50, 1]]);
});

test('costi per anno: totali per macro e categoria, peso, variazione e fornitori principali dell\'anno scelto', () => {
  const righe = classificaCosti([
    riga({ rigaId: 1, fornitore: 'Mouser', descrizione: 'IC', importo: 1000, data: '2026-01-10' }),
    riga({ rigaId: 2, fornitore: 'DigiKey', descrizione: 'IC', importo: 500, data: '2026-02-10' }),
    riga({ rigaId: 3, fornitore: 'Mouser', descrizione: 'IC', importo: -100, data: '2026-02-20' }),   // nota di credito
    riga({ rigaId: 4, fornitore: 'Enel Energia', descrizione: 'Energia elettrica', importo: 400, data: '2026-03-01' }),
    riga({ rigaId: 5, fornitore: 'Mouser', descrizione: 'IC', importo: 700, data: '2025-05-10' }),
    riga({ rigaId: 6, fornitore: 'Enel Energia', descrizione: 'Energia elettrica', importo: 200, data: '2025-03-01' }),
  ], []);
  const c = costiPerAnno(righe, [2026, 2025]);
  assert.equal(c.totale[2026], 1800); assert.equal(c.totale[2025], 900);
  const riv = c.macro.find(m => m.macro === 'rivendita')!, gest = c.macro.find(m => m.macro === 'gestione')!;
  assert.equal(riv.perAnno[2026].importo, 1400); assert.equal(riv.perAnno[2026].quota, 77.78); assert.equal(riv.variazione, 100);
  assert.equal(gest.perAnno[2026].importo, 400); assert.equal(gest.variazione, 100);
  const comp = riv.categorie.find(x => x.codice === 'componenti')!;
  assert.equal(comp.perAnno[2026].righe, 3);
  assert.deepEqual(comp.fornitori.map(f => [f.nome, f.importo]), [['Mouser', 900], ['DigiKey', 500]]);
  assert.equal(c.daVerificare[2026], 0);
});

test('comprato e rivenduto: pezzi fatturati × materiale del preventivo, copertura, lamine; prodotti senza preventivo contati a parte', () => {
  const righe = classificaCosti([
    riga({ rigaId: 1, fornitore: 'Mouser', descrizione: 'IC', importo: 6000, data: '2026-01-10' }),
    riga({ rigaId: 2, fornitore: 'HTS PCB', descrizione: 'circuiti stampati', importo: 2000, data: '2026-01-10' }),
    riga({ rigaId: 3, fornitore: 'Gea', descrizione: 'lamina serigrafica', importo: 300, data: '2026-01-10' }),
  ], []);
  const r = confrontoRivendita({
    righe, anni: [2026],
    vendite: [{ codice: 'A1', cliente: 'SELEA', anno: 2026, pezzi: 100, importo: 20000 }, { codice: 'B2', cliente: 'LPS', anno: 2026, pezzi: 40, importo: 4000 }],
    preventivi: [{ codice: 'a1', cliente: 'Selea', venditaComponenti: 70, venditaPcb: 20, costoAcquisto: 75 }],
    lamine: [{ anno: 2026, pezzi: 4, importo: 440 }],
  })[0];
  assert.equal(r.comprato, 8300); assert.equal(r.compratoLamine, 300);
  assert.equal(r.rivendutoComponenti, 7000); assert.equal(r.rivendutoPcb, 2000); assert.equal(r.rivenduto, 9000);
  assert.equal(r.margineSchede, 1000); assert.equal(r.margineSchedePct, 11.11);
  assert.equal(r.costoPrevisto, 7500); assert.equal(r.materialeOltrePreventivo, 500);
  assert.equal(r.pezziConPreventivo, 100); assert.equal(r.pezziSenzaPreventivo, 40); assert.deepEqual(r.prodottiSenzaPreventivo, ['B2']);
  assert.equal(r.margineLamine, 140);
});

test('riassunto: dove vanno i soldi, cosa sale, rivendita in perdita, proposte', () => {
  const r = (fornitore: string, descrizione: string, importo: number, anno: number, id: number) => riga({ rigaId: id, fornitore, descrizione, importo, data: `${anno}-02-01` });
  const righe = classificaCosti([
    r('Mouser', 'IC', 60000, 2026, 1), r('Mouser', 'IC', 40000, 2025, 2),
    r('Studio Bianchi', 'assistenza prestata per la contabilità', 12000, 2026, 3), r('Studio Bianchi', 'assistenza prestata per la contabilità', 6000, 2025, 4),
    r('Enel Energia', 'energia elettrica', 20000, 2026, 5), r('Enel Energia', 'energia elettrica', 19000, 2025, 6),
  ], []);
  const costi = costiPerAnno(righe, [2026, 2025]);
  const rivendita = confrontoRivendita({ righe, anni: [2026, 2025], lamine: [], preventivi: [{ codice: 'A', cliente: 'X', venditaComponenti: 50, venditaPcb: 0, costoAcquisto: 48 }],
    vendite: [{ codice: 'A', cliente: 'X', anno: 2026, pezzi: 1000, importo: 150000 }] });
  const s = riassuntoCosti({ costi, rivendita, ricavi: { 2026: 150000, 2025: 140000 }, mesi: 12 });
  const testi = s.frasi.map(f => f.testo).join('\n');
  assert.match(testi, /valgono 92\.000 €, il 61,3% del fatturato/);
  assert.ok(s.frasi.some(f => f.livello === 'critico' && /costi salgono più del fatturato/.test(f.testo)));
  assert.ok(s.frasi.some(f => f.livello === 'attenzione' && /^Commercialista, paghe, notaio, consulenze amministrative: 12\.000 € nel 2026 contro 6\.000 €/.test(f.testo)));
  assert.ok(s.frasi.some(f => f.livello === 'critico' && /perdita di 10\.000 €/.test(f.testo)), 'rivendita: comprati 60.000, rivenduti 50.000');
  assert.ok(s.proposte.some(p => /Nella rivendita si perde/.test(p)));
  assert.ok(s.proposte.some(p => /consulenze amministrative 12\.000 €/.test(p)));
  assert.match(s.opinione, /rivende sotto costo/);
  // senza fatture: nessun conto
  assert.equal(riassuntoCosti({ costi: costiPerAnno([], [2024]), rivendita: [], ricavi: {}, mesi: 12 }).frasi.length, 1);
});

test('guida: costi per categoria, comprato e rivenduto', () => {
  for (const q of ['costi per categoria', 'quanto spendo di stagno', 'guadagno sulla rivendita dei componenti'])
    assert.ok(cercaGuida(q).slice(0, 3).some(r => r.argomento.id === 'costi-categoria'), q);
});
