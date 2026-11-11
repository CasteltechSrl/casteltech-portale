import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  lamineDaVendite, pezziLamina, materialeVenduto, costiPcbComprati,
  chiaveFornitore, classificaCosti, classificaVendite, confrontoRivendita, costiPerAnno, fornitoriDaControllare, nomiPcbComprati, riassuntoCosti, type RigaCosto, type RigaVendita,
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

const vendita = (x: Partial<RigaVendita> & { cliente: string; descrizione: string; importo: number }): RigaVendita =>
  ({ anno: 2026, clienteId: null, codice: '', acconto: false, ...x });

test('vendite: ogni riga nel suo gruppo con la riga, il preventivo (solo sì/no), il PCB comprato e il cliente', () => {
  const pcb = classificaCosti([
    riga({ rigaId: 1, fornitore: 'HTS PCB', descrizione: 'NASOMETER_BUZZER', importo: 259, data: '2026-06-29' }),
    riga({ rigaId: 2, fornitore: 'HTS PCB', descrizione: 'PCB codice JR_RELE LABELPACK produzione', importo: 700, data: '2026-01-08' }),
    riga({ rigaId: 3, fornitore: 'HTS PCB', descrizione: 'DELAS-SQR/T', importo: 180, data: '2026-04-28', codici: ['CS260053/T'] }),
  ], []);
  const nomi = nomiPcbComprati(pcb);
  assert.ok(nomi.includes('NASOMETERBUZZER') && nomi.includes('DELASSQR'));
  assert.ok(!nomi.includes('PRODUZIONE') && !nomi.includes('LABELPACK'), 'parole comuni di una descrizione lunga non sono nomi di prodotto');
  const righe = [
    vendita({ cliente: 'ARILAN', descrizione: 'Nasometer', importo: 13289 }),                                     // PCB comprato con lo stesso nome
    vendita({ cliente: 'CABLESTEEL', clienteId: 1, codice: 'DE0904-025', descrizione: 'DELAS05-24', importo: 5000 }), // preventivo con componenti
    vendita({ cliente: 'CABLESTEEL', clienteId: 1, codice: 'DE0904-01', descrizione: 'DELAS SQR', importo: 12648 }),   // senza preventivo: PCB comprato
    vendita({ cliente: 'CABLESTEEL', clienteId: 1, codice: 'DE0103-106', descrizione: 'DE0103-106', importo: 3500 }),  // niente indizi: il cliente è chiavi in mano
    vendita({ cliente: 'SELEA', clienteId: 2, codice: 'WPAJZERO6', descrizione: 'JZERO6', importo: 3663 }),           // preventivo senza materiale
    vendita({ cliente: 'IDEA', clienteId: 3, codice: 'SL_0103', descrizione: 'PCA SL_0103', importo: 1980 }),         // cliente con componenti in conto lavoro
    vendita({ cliente: 'LPS', clienteId: 4, codice: '004', descrizione: 'COMPONENTI PRODUZIONE APRILE 2026', importo: 1450 }),
    vendita({ cliente: 'BOTISUM', descrizione: 'PCA MODULE PESEE\n- Acquisto componenti: 2€\n- Montaggio', importo: 45300 }),
    vendita({ cliente: 'CONTROL', descrizione: 'Montaggio PTH scheda M9906-B', importo: 855 }),
    vendita({ cliente: 'X', descrizione: 'Avvio produzione\n-Programmazione attrezzature', importo: 250 }),
    vendita({ cliente: 'X', codice: 'UT-LAMINA', descrizione: 'Lamina', importo: 110 }),
    vendita({ cliente: 'SOLOKEYS', descrizione: 'Project SOLO V3\n-engineering technical supervision', importo: 3250 }),
    vendita({ cliente: 'JOX', descrizione: 'Acconto 75% Ordine Nr. 261185gl', importo: 18825 }),
    vendita({ cliente: 'TREE', descrizione: 'Dispositivo MOD-M', importo: 6700 }),
    vendita({ cliente: 'TREE', descrizione: 'Lavorazione frontalini', importo: 180 }),
    vendita({ cliente: 'MC', descrizione: 'Mycronic MY200\ncompleta e funzionante', importo: 32000 }),
  ];
  const tipi = classificaVendite(righe, [
    { codice: 'DE0904-025', clienteId: 1, conMateriale: true }, { codice: 'WPAJZERO6', clienteId: 2, conMateriale: false },
  ], nomi, new Set(['c3']));
  assert.deepEqual(tipi, ['nostro', 'nostro', 'nostro', 'nostro', 'conto_lavoro', 'conto_lavoro', 'nostro', 'nostro', 'conto_lavoro', 'servizio', 'servizio', 'servizio', 'acconto', 'non_so', 'conto_lavoro', 'servizio']);
});

test('vendite: la scelta dell\'ufficio per cliente vince sul portale, tranne anticipi, materiale scritto e servizi (JOX, Tree, Control Systems)', () => {
  const righe = [
    vendita({ cliente: 'TREE', clienteId: 247, descrizione: 'Dispositivo MOD-M', importo: 6700 }),
    vendita({ cliente: 'TREE', clienteId: 247, descrizione: 'Lavorazione frontalini', importo: 180 }),
    vendita({ cliente: 'JOX', clienteId: 150, descrizione: 'Acconto 75% Ordine Nr. 261185gl', importo: 18825 }),
    vendita({ cliente: 'JOX', clienteId: 150, descrizione: 'Scheda JX-01', importo: 26554 }),
    vendita({ cliente: 'CONTROL', clienteId: 136, codice: 'M9906', descrizione: 'SCHEDA2', importo: 11500 }),
    vendita({ cliente: 'CONTROL', clienteId: 136, descrizione: 'Programmazione attrezzature', importo: 200 }),
    vendita({ cliente: 'CONTROL', clienteId: 136, descrizione: 'Acquisto componenti mancanti', importo: 90 }),
  ];
  const scelte = new Map([['c247', 'nostro'], ['c150', 'nostro'], ['c136', 'conto_lavoro']] as const);
  const tipi = classificaVendite(righe, [{ codice: 'M9906', clienteId: 136, conMateriale: true }], ['SCHEDA2'], new Set(), new Map(scelte));
  assert.deepEqual(tipi, ['nostro', 'nostro', 'acconto', 'nostro', 'conto_lavoro', 'servizio', 'nostro']);
});

test('comprato e rivenduto: comprato anche dall\'estero contro il fatturato vero con materiale nostro, peso del materiale, lamine', () => {
  const righe = classificaCosti([
    riga({ rigaId: 1, fornitore: 'TME', descrizione: 'IC', importo: 6000, data: '2026-01-10' }),
    riga({ rigaId: -7, documentoId: -3, fornitore: 'MOUSER ELECTRONICS', descrizione: 'LM358', importo: 2000, data: '2026-02-10', categoriaFic: 'B6_Materie prime c/acquisti' }),
    riga({ rigaId: 2, fornitore: 'HTS PCB', descrizione: 'circuiti stampati', importo: 2000, data: '2026-01-10' }),
    riga({ rigaId: 3, fornitore: 'Gea', descrizione: 'lamina serigrafica', importo: 300, data: '2026-01-10' }),
  ], []);
  const vendite = [
    { ...vendita({ cliente: 'A', descrizione: 'x', importo: 12000 }), tipo: 'nostro' as const },
    { ...vendita({ cliente: 'B', descrizione: 'x', importo: 3000 }), tipo: 'non_so' as const },
    { ...vendita({ cliente: 'C', descrizione: 'x', importo: 9000 }), tipo: 'conto_lavoro' as const },
    { ...vendita({ cliente: 'D', descrizione: 'x', importo: 500 }), tipo: 'acconto' as const },
  ];
  const r = confrontoRivendita({ righe, vendite, anni: [2026], lamine: [{ anno: 2026, pezzi: 4, importo: 440, pezziUnaTantum: 0, importoUnaTantum: 0 }] })[0];
  assert.equal(r.compratoSchede, 10000); assert.equal(r.compratoEstero, 2000); assert.equal(r.comprato, 10300);
  assert.equal(r.vendutoNostro, 12000); assert.equal(r.vendutoNonSo, 3000); assert.equal(r.vendutoContoLavoro, 9000);
  assert.equal(r.pesoMateriale, 83.33); assert.equal(r.pesoMaterialeMin, 66.67);
  assert.deepEqual(r.clientiNonSo, [{ chiave: 'n:B', cliente: 'B', importo: 3000 }]);
  assert.equal(r.margineLamine, 140);
});

test('componenti e PCB venduti: riga del materiale, quota del preventivo, media per le schede senza preventivo', () => {
  const v = (codice: string, descrizione: string, importo: number, tipo: 'nostro' | 'servizio' = 'nostro') => ({ ...vendita({ cliente: 'X', codice, descrizione, importo }), tipo });
  const m = materialeVenduto([v('A', 'scheda A', 1000), v('', 'Acquisto componenti', 300), v('', 'Acquisto PCB', 200), v('B', 'scheda B', 500), v('', 'Lamina', 110, 'servizio')],
    [{ codice: 'A', clienteId: null, conMateriale: true, quotaComponenti: 0.6, quotaPcb: 0.1 }]);
  assert.deepEqual(m.map(x => [Math.round(x.componenti), Math.round(x.pcb)]), [[600, 100], [300, 0], [0, 200], [300, 50], [0, 0]]);
});

test('PCB nascosto nel prezzo: PCB comprato con lo stesso nome del prodotto (Adriano 11/11/2026)', () => {
  const righe = classificaCosti([
    riga({ rigaId: 1, fornitore: 'HTS PCB S.r.l.', descrizione: 'NASOMETERV11', quantita: 100, importo: 300, data: '2026-03-01' }),
    riga({ rigaId: 2, fornitore: 'HTS PCB S.r.l.', descrizione: 'NASOMETERV11/T', quantita: 1, importo: 180, data: '2026-03-01' }),
    riga({ rigaId: 3, fornitore: 'NCAB Group', descrizione: 'CSMISV0203_V4 PRINTED CIRCUIT BOARD', quantita: 500, importo: 1190, data: '2026-06-01' }),
  ], [{ tipo: 'fornitore', chiave: 'HTS PCB S.R.L.', categoria: 'pcb' }, { tipo: 'fornitore', chiave: 'NCAB GROUP', categoria: 'pcb' }]);
  const costi = costiPcbComprati(righe);
  assert.equal(costi.get('NASOMETERV11'), 3, 'attrezzatura /T fuori dal costo a pezzo');
  assert.equal(Math.round(costi.get('CSMISV0203V4')! * 100), 238);
  const v = (codice: string, descrizione: string, importo: number, quantita: number) => ({ ...vendita({ cliente: 'X', codice, descrizione, importo }), quantita, tipo: 'nostro' as const });
  const vendite = [v('CSMISV0203', 'CS Nuovo Palmare', 1450, 500), v('', 'NASOMETERV11', 1000, 100), v('', 'NASOMETERV11', 6000, 100), v('S1', 'scheda', 1000, 10)];
  const prev = [{ codice: 'S1', clienteId: null, conMateriale: true, quotaComponenti: 0.5, quotaPcb: 0.1 }];
  const m = materialeVenduto(vendite, prev, costi);
  assert.deepEqual(m.map(x => [Math.round(x.componenti), Math.round(x.pcb)]), [[0, 1450], [500, 300], [3000, 600], [500, 100]],
    'PCB venduto da solo = tutta la riga; scheda = almeno il costo del PCB (300) o la media (600); col preventivo vale il preventivo');
  assert.deepEqual(materialeVenduto(vendite, prev).map(x => Math.round(x.pcb)), [145, 100, 600, 100], 'senza i PCB comprati: la media');
});

test('riassunto: dove vanno i soldi, cosa sale, rivendita in perdita, proposte', () => {
  const r = (fornitore: string, descrizione: string, importo: number, anno: number, id: number) => riga({ rigaId: id, fornitore, descrizione, importo, data: `${anno}-02-01` });
  const righe = classificaCosti([
    r('Mouser', 'IC', 60000, 2026, 1), r('Mouser', 'IC', 40000, 2025, 2),
    r('Studio Bianchi', 'assistenza prestata per la contabilità', 12000, 2026, 3), r('Studio Bianchi', 'assistenza prestata per la contabilità', 6000, 2025, 4),
    r('Enel Energia', 'energia elettrica', 20000, 2026, 5), r('Enel Energia', 'energia elettrica', 19000, 2025, 6),
  ], []);
  const costi = costiPerAnno(righe, [2026, 2025]);
  const rivendita = confrontoRivendita({ righe, anni: [2026, 2025], lamine: [],
    vendite: [{ ...vendita({ cliente: 'X', codice: 'S1', descrizione: 'scheda', importo: 66000 }), tipo: 'nostro' as const }],
    preventivi: [{ codice: 'S1', clienteId: null, conMateriale: true, quotaComponenti: 0.5, quotaPcb: 0.1 }] });
  const s = riassuntoCosti({ costi, rivendita, ricavi: { 2026: 150000, 2025: 140000 }, mesi: 12 });
  const testi = s.frasi.map(f => f.testo).join('\n');
  assert.match(testi, /valgono 92\.000 €, il 61,3% del fatturato/);
  assert.ok(s.frasi.some(f => f.livello === 'critico' && /costi salgono più del fatturato/.test(f.testo)));
  assert.ok(s.frasi.some(f => f.livello === 'attenzione' && /^Commercialista, paghe, notaio, consulenze amministrative: 12\.000 € nel 2026 contro 6\.000 €/.test(f.testo)));
  // una riga coppia comprato / venduto: componenti 60.000 comprati, 66.000 × 50 % venduti
  assert.ok(s.frasi.some(f => f.livello === 'critico' && f.testo === 'Componenti: comprati 60.000 €, venduti 33.000 €: perdita di 27.000 €.'), testi);
  assert.ok(s.proposte.some(p => /venduti per meno di quanto si comprano/.test(p)));
  assert.ok(s.proposte.some(p => /consulenze amministrative 12\.000 €/.test(p)));
  assert.match(s.opinione, /resta troppo poco per il montaggio/);
  // senza fatture: nessun conto
  assert.equal(riassuntoCosti({ costi: costiPerAnno([], [2024]), rivendita: [], ricavi: {}, mesi: 12 }).frasi.length, 1);
});

test('guida: costi per categoria, comprato e rivenduto', () => {
  for (const q of ['costi per categoria', 'quanto spendo di stagno', 'guadagno sulla rivendita dei componenti'])
    assert.ok(cercaGuida(q).slice(0, 3).some(r => r.argomento.id === 'costi-categoria'), q);
});

test('costi: una riga senza regola prende la categoria dallo storico del fornitore (quella che pesa di più), il tipo di fattura FIC aiuta anche le righe', () => {
  const c = classificaCosti([
    riga({ rigaId: 1, fornitore: 'Rossi Srl', descrizione: 'resistenza smd 0603 10k', importo: 100, data: '2026-02-01' }),
    riga({ rigaId: 2, fornitore: 'Rossi Srl', descrizione: 'lamina serigrafica', importo: 50, data: '2026-02-01' }),
    riga({ rigaId: 3, fornitore: 'Rossi Srl', descrizione: 'art. 4471/B', importo: 70, data: '2026-03-01' }),            // nessuna parola: storico → componenti (100 > 50)
    riga({ rigaId: 4, fornitore: 'Mai Visto Snc', descrizione: 'art. 12', importo: 30, data: '2026-03-01', categoriaFic: 'B7_Trasporti' }),   // riga: la categoria FIC decide
    riga({ rigaId: 5, fornitore: 'Sconosciuto', descrizione: 'art. 13', importo: 20, data: '2026-03-01' }),                // davvero senza niente
  ], []);
  assert.deepEqual(c.map(r => [r.categoria, r.come]), [['componenti', 'parola'], ['lamine', 'parola'], ['componenti', 'storico'], ['trasporti', 'fic'], ['altro', 'nessuna']]);
  assert.equal(c[2].macro, 'rivendita');
  assert.deepEqual(fornitoriDaControllare(c).map(f => f.nome), ['Sconosciuto']);
});

test('costi: famiglia del punto di pareggio per ogni categoria di Casteltech', async () => {
  const { famigliaDiCategoriaCasteltech } = await import('../src/engine/analisi-costi.js');
  const { CATEGORIE } = await import('../src/engine/categorie-acquisti.js');
  assert.equal(famigliaDiCategoriaCasteltech('componenti'), 'materie');
  assert.equal(famigliaDiCategoriaCasteltech('stagno'), 'materie');
  assert.equal(famigliaDiCategoriaCasteltech('affitto'), 'godimento');
  assert.equal(famigliaDiCategoriaCasteltech('leasing'), 'godimento');
  assert.equal(famigliaDiCategoriaCasteltech('banca'), 'finanziari');
  assert.equal(famigliaDiCategoriaCasteltech('imposte'), 'oneri');
  assert.equal(famigliaDiCategoriaCasteltech('attrezzature'), 'ammortamenti');
  assert.equal(famigliaDiCategoriaCasteltech('energia'), 'servizi');
  assert.equal(famigliaDiCategoriaCasteltech('montaggi_esterni'), 'servizi');
  for (const c of CATEGORIE) assert.notEqual(famigliaDiCategoriaCasteltech(c.codice), 'senza_categoria');
});

test('lamine vendute: a parte e dentro i costi una tantum, pezzi dalla descrizione o dalla quantità (Adriano 11/11/2026)', () => {
  assert.equal(pezziLamina('Campionatura M2204-C\n- 2 Lamine serigrafiche', 1), 2);
  assert.equal(pezziLamina('Costi una tantum\n- Lamine serigrafiche (CTRL_INV/A - DRIVER/A)', 2), 2);
  assert.equal(pezziLamina('Avvio produzione\n-Lamina serigrafica', 1), 1);
  const l = lamineDaVendite([
    { anno: 2026, codice: '001', descrizione: 'LAMINA SERIGRAFICA\n- DE0102100\n- DE0103210', quantita: 4, importo: 440 },
    { anno: 2026, codice: 'UT-LAMINA', descrizione: 'Lamina', quantita: 1, importo: 110 },
    { anno: 2026, codice: '', descrizione: 'Avvio produzione\n-Programmazione attrezzature\n-Lamina serigrafica', quantita: 2, importo: 500 },
    { anno: 2026, codice: 'M2204-C', descrizione: 'Campionatura M2204-C_SMD (prezzo a forfait)\n- 2 Lamine serigrafiche', quantita: 1, importo: 1500 },
    { anno: 2026, codice: '001', descrizione: 'LAMINA SERIGRAFICA', quantita: -1, importo: -110 },
    { anno: 2026, codice: '', descrizione: 'Costi una tantum avvio produzione\n- Lamine serigrafiche (A - B)', quantita: 2, importo: 0 },
    { anno: 2026, codice: '', descrizione: 'Avvio Produzione SL_0112', quantita: 2, importo: 650, lamine: 1 },         // segnata a mano: senza la parola lamina
    { anno: 2026, codice: '', descrizione: 'Avvio produzione\nLamina serigrafica', quantita: 1, importo: 250, lamine: 0 }, // a mano: nessuna
    { anno: 2025, codice: '', descrizione: 'Lamina', quantita: 1, importo: 110 },
  ], [2026]);
  assert.deepEqual(l, [{ anno: 2026, pezzi: 4, importo: 440, pezziUnaTantum: 5, importoUnaTantum: 2650 }]);
  const righe = classificaCosti([
    riga({ rigaId: 1, fornitore: 'I-TRONIK S.R.L.', descrizione: 'LAMINA AUTOT. ZELFLEX 23" SP.0,12 UM', importo: 600, quantita: 8, data: '2026-03-10' }),
    riga({ rigaId: 2, fornitore: 'LOPAR S.R.L.', descrizione: 'LAMINA COD.LA26-0306', importo: 75, quantita: 1, data: '2026-03-10' }),
    riga({ rigaId: 3, fornitore: 'LOPAR S.R.L.', descrizione: 'Circuito Stampato Cod. DE0904-018 02', importo: 508, quantita: 1, data: '2026-03-10' }),
    riga({ rigaId: 4, fornitore: 'LOPAR S.R.L.', descrizione: 'CAMPIONI FORFAIT', importo: 340, quantita: 1, data: '2026-03-10' }),
  ], []);
  assert.deepEqual(righe.map(r => r.categoria), ['lamine', 'lamine', 'pcb', 'pcb']);
  const r = confrontoRivendita({ righe, vendite: [], anni: [2026], lamine: l })[0];
  assert.equal(r.lamineCompratePezzi, 9); assert.equal(r.compratoLamine, 675);
  assert.equal(r.margineLamine, 440 + 5 * 110 - 675);
});
