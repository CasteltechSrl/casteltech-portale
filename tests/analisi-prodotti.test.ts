import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classificaProdotti, consuntivoLotto, eConsegna, margineMedioConsuntivi, mesiDa, riepilogoProdotti, schedaProdotto, totaliFatturato, visioneClienti,
  type FatturaCliente, type RigaVenditaProdotto,
} from '../src/engine/analisi-prodotti.js';
import { cercaGuida } from '../src/engine/guida.js';

const oggi = '2026-11-05';
let id = 0;
const riga = (x: Partial<RigaVenditaProdotto> & { data: string }): RigaVenditaProdotto => ({
  tipo: 'fattura', documentoId: ++id, anno: Number(x.data.slice(0, 4)), clienteChiave: 'c1', clienteId: 1, cliente: 'SELEA', codice: 'SCH-1', descrizione: 'SCHEDA UNO',
  quantita: 0, importo: 0, ...x,
});
// Selea, SCH-1: 2024 un DDT da 100 pz fatturato 1.000 €; 2025 due DDT (60 + 40) in una fattura differita da 1.100 € + una NC da 100 €; 2026 una fattura diretta 50 pz 600 €
const righe: RigaVenditaProdotto[] = [
  riga({ tipo: 'ddt', data: '2024-03-01', quantita: 100, causale: 'VENDITA' }),
  riga({ data: '2024-03-15', quantita: 100, importo: 1000, citaDdt: true }),
  riga({ tipo: 'ddt', data: '2025-02-01', quantita: 60, causale: 'VENDITA' }),
  riga({ tipo: 'ddt', data: '2025-02-20', quantita: 40, causale: 'VENDITA' }),
  riga({ data: '2025-03-15', quantita: 100, importo: 1100, citaDdt: true }),
  riga({ tipo: 'nota_credito', data: '2025-04-10', quantita: 10, importo: 100 }),
  riga({ data: '2026-01-20', quantita: 50, importo: 600 }),
  // reso non lavorato e garanzia: non sono consegne
  riga({ tipo: 'ddt', data: '2026-05-05', quantita: 20, causale: 'RESO NON LAVORATO' }),
  // servizio (lamina): fuori
  riga({ data: '2026-01-20', codice: '001', descrizione: 'LAMINA', quantita: 1, importo: 110 }),
  // stesso codice per un altro cliente = altro prodotto
  riga({ data: '2026-06-01', clienteChiave: 'c2', clienteId: 2, cliente: 'ALFA', quantita: 10, importo: 300 }),
  // prodotto fermo dal 2024
  riga({ data: '2024-09-01', codice: 'SCH-2', descrizione: 'SCHEDA DUE', quantita: 30, importo: 900 }),
];
const fatture: FatturaCliente[] = [
  { clienteChiave: 'c1', cliente: 'SELEA', tipo: 'fattura', anno: 2024, data: '2024-03-15', imponibile: 2000 },
  { clienteChiave: 'c1', cliente: 'SELEA', tipo: 'fattura', anno: 2025, data: '2025-03-15', imponibile: 1100 },
  { clienteChiave: 'c1', cliente: 'SELEA', tipo: 'nota_credito', anno: 2025, data: '2025-04-10', imponibile: 100 },
  { clienteChiave: 'c1', cliente: 'SELEA', tipo: 'fattura', anno: 2026, data: '2026-01-20', imponibile: 710 },
  { clienteChiave: 'c2', cliente: 'ALFA', tipo: 'fattura', anno: 2026, data: '2026-06-01', imponibile: 300 },
  { clienteChiave: 'c3', cliente: 'BETA', tipo: 'fattura', anno: 2025, data: '2025-06-01', imponibile: 5000 },
];

test('analisi prodotti: pezzi e fatturato dalle fatture, lotti dalle consegne, prezzo medio, ultima consegna', () => {
  const p = riepilogoProdotti(righe).get('c1|SCH-1')!;
  assert.ok(p);
  assert.equal(p.cliente, 'SELEA');
  assert.deepEqual(Object.keys(p.perAnno).map(Number), [2024, 2025, 2026]);
  const a25 = p.perAnno[2025];
  assert.equal(a25.pezzi, 90);                 // 100 fatturati − 10 della nota di credito
  assert.equal(a25.fatturato, 1000);           // 1.100 − 100
  assert.equal(a25.lotti, 2);                  // due DDT; la fattura cita i DDT e non conta
  assert.equal(a25.pezziConsegnati, 100);
  assert.equal(a25.lottoMedio, 50);
  assert.equal(a25.prezzoMedio, 11.11);
  const a26 = p.perAnno[2026];
  assert.equal(a26.lotti, 1);                  // fattura diretta = una consegna; il reso non lavorato no
  assert.equal(a26.pezziConsegnati, 50);
  assert.equal(p.ultimaData, '2026-01-20');    // il reso non lavorato non è una vendita
  assert.equal(riepilogoProdotti(righe).has('c1|001'), false, 'la lamina è un servizio');
  assert.ok(riepilogoProdotti(righe).has('c2|SCH-1'), 'stesso codice, altro cliente = altro prodotto');
});

test('analisi prodotti: eConsegna e mesi passati', () => {
  assert.equal(eConsegna({ tipo: 'ddt', causale: 'VENDITA' }), true);
  assert.equal(eConsegna({ tipo: 'ddt', causale: 'CONTO VISIONE' }), false);
  assert.equal(eConsegna({ tipo: 'fattura' }), true);
  assert.equal(eConsegna({ tipo: 'fattura', ddtId: 5 }), false);
  assert.equal(eConsegna({ tipo: 'nota_credito' }), false);
  assert.equal(mesiDa('2026-01-20', oggi), 9);
  assert.equal(mesiDa('2026-05-06', oggi), 5);
  assert.equal(mesiDa('2026-05-05', oggi), 6);
  assert.equal(mesiDa(null, oggi), null);
});

test('analisi prodotti: classifica con variazione, peso sul cliente e sul totale, fermi; filtro per cliente', () => {
  const prodotti = riepilogoProdotti(righe), totali = totaliFatturato(fatture);
  assert.equal(totali.totale[2025], 6000);
  assert.equal(totali.perCliente.get('c1')![2025], 1000);
  const c = classificaProdotti(prodotti.values(), totali, 2026, oggi);
  assert.deepEqual(c.map(x => `${x.clienteChiave}|${x.codice}`), ['c1|SCH-1', 'c2|SCH-1']);
  const s = c[0];
  assert.equal(s.fatturato, 600); assert.equal(s.fatturatoPrima, 1000); assert.equal(s.variazione, -40);
  assert.equal(s.pesoCliente, 84.5);           // 600 su 710
  assert.equal(s.pesoTotale, 59.4);            // 600 su 1.010
  assert.equal(s.fermo, true);                 // ultima consegna gennaio: 9 mesi
  assert.equal(s.mesiFermo, 9);
  // nel 2025 compare anche SCH-2 (venduta nel 2024) con fatturato zero
  const c25 = classificaProdotti(prodotti.values(), totali, 2025, oggi);
  assert.deepEqual(c25.map(x => x.codice), ['SCH-1', 'SCH-2']);
  assert.equal(classificaProdotti(prodotti.values(), totali, 2026, oggi, 'c2').length, 1);
});

test('analisi prodotti: scheda anno per anno con totale e ordini del portale', () => {
  const p = riepilogoProdotti(righe).get('c1|SCH-1')!;
  const s = schedaProdotto(p, totaliFatturato(fatture), oggi, { 2026: 2 });
  assert.deepEqual(s.righe.map(r => r.anno), [2024, 2025, 2026]);
  assert.equal(s.righe[1].variazione, 0);
  assert.equal(s.righe[1].variazionePezzi, -10);
  assert.equal(s.righe[2].ordini, 2);
  assert.equal(s.righe[0].ordini, null);
  assert.equal(s.totale.pezzi, 240); assert.equal(s.totale.fatturato, 2600); assert.equal(s.totale.lotti, 4); assert.equal(s.totale.lottoMedio, 63);
  assert.equal(s.totale.prezzoMedio, 10.83);
  assert.equal(s.fermo, true);
  // anni senza vendite in mezzo restano come righe vuote
  const p2 = riepilogoProdotti([riga({ data: '2023-01-01', quantita: 1, importo: 10 }), riga({ data: '2025-01-01', quantita: 1, importo: 10 })]).get('c1|SCH-1')!;
  assert.deepEqual(schedaProdotto(p2, totaliFatturato([]), oggi).righe.map(r => [r.anno, r.pezzi]), [[2023, 1], [2024, 0], [2025, 1]]);
});

test('analisi prodotti: consuntivo del lotto con la formula del preventivo, fasi senza tempi al previsto', () => {
  const tariffe = { costoAziendaH: 30, costoOperatoreProduzioneH: 15, costoOperatoreUfficioH: 35 };
  const fasi = [
    { codice: 'smd', cicloPrevSec: 3600, uomoPrevSec: 3600, tariffa: 'produzione' },      // 30 + 15 = 45 €
    { codice: 'coll', cicloPrevSec: 1800, uomoPrevSec: 3600, tariffa: 'produzione' },     // 15 + 15 = 30 €
    { codice: 'prog', cicloPrevSec: 3600, uomoPrevSec: 3600, tariffa: 'ufficio' },        // 30 + 35 = 65 €
  ];
  const k = consuntivoLotto({ prezzoLotto: 400, costoVoci: 100, fasi, tariffe, reali: { smd: { cicloSec: 7200, uomoSec: 7200 } } });
  assert.equal(k.costoFasiPrevisto, 140);
  assert.equal(k.costoFasiReale, 185);         // smd raddoppiata (90) + coll e prog al previsto
  assert.equal(k.scostamentoFasiPct, 32);
  assert.equal(k.marginePrevisto, 160); assert.equal(k.margineReale, 115);
  assert.equal(k.marginePrevistoPct, 40); assert.equal(k.margineRealePct, 28.8);
  assert.equal(k.fasiConTempi, 1); assert.equal(k.fasiTotali, 3);
  assert.equal(k.oreCicloPreviste, 2.5); assert.equal(k.oreCicloReali, 3.5);
  // fase fatta ma non prevista: costo in più
  const k2 = consuntivoLotto({ prezzoLotto: 400, costoVoci: 100, fasi, tariffe, reali: { extra: { cicloSec: 3600, uomoSec: 3600 } } });
  assert.equal(k2.costoFasiReale, 185);
  const m = margineMedioConsuntivi([k, k2, consuntivoLotto({ prezzoLotto: 100, costoVoci: 0, fasi: [], tariffe, reali: {} })]);
  assert.equal(m.commesse, 1);                 // k2 non ha fasi previste con tempi, la terza non ha tempi
  assert.equal(m.realePct, 28.8);
});

test('analisi clienti: classifica, peso, concentrazione, calo forte, fermi, nuovi e persi', () => {
  const ft: FatturaCliente[] = [
    ...fatture,
    { clienteChiave: 'c3', cliente: 'BETA', tipo: 'fattura', anno: 2026, data: '2026-02-01', imponibile: 1000 },   // −80 % = calo forte, fermo da 9 mesi
    { clienteChiave: 'c4', cliente: 'GAMMA', tipo: 'fattura', anno: 2025, data: '2025-09-01', imponibile: 3000 }, // perso nel 2026
    { clienteChiave: 'c4', cliente: 'GAMMA', tipo: 'fattura', anno: 2024, data: '2024-09-01', imponibile: 3000 },
    { clienteChiave: 'c5', cliente: 'DELTA', tipo: 'fattura', anno: 2026, data: '2026-10-01', imponibile: 2500 },  // nuovo
    { clienteChiave: 'c6', cliente: 'FUTURO', tipo: 'fattura', anno: 2026, data: '2026-12-01', imponibile: 9000 }, // dopo oggi: fuori dal periodo
  ];
  const extra = new Map([['SELEA', { margineStimato: 150, copertura: 50, giorniIncasso: 70, ritardoMedio: 12, scaduto: 300, esposizione: 710 }]]);
  const v = visioneClienti(ft, 2026, oggi, { finoA: oggi, extra, consegne: [{ clienteChiave: 'c4', data: '2026-03-01' }] });
  assert.deepEqual(v.clienti.map(c => c.cliente), ['DELTA', 'BETA', 'SELEA', 'ALFA', 'GAMMA']);
  assert.equal(v.totale, 4510);
  assert.equal(v.totalePrima, 6000 + 3000);
  assert.equal(Math.round(v.primi3 + v.clienti[3].quota!), 100);
  const selea = v.clienti.find(c => c.cliente === 'SELEA')!;
  assert.equal(selea.quota, 15.7);
  assert.equal(selea.marginePct, 42.3);        // 150 su 355 (= 710 × 50 %)
  assert.equal(selea.giorniIncasso, 70); assert.equal(selea.scaduto, 300);
  assert.equal(selea.segnale, 'fermo');        // ultima vendita a gennaio: il fermo vince sul calo (1.000 → 710)
  const beta = v.clienti.find(c => c.cliente === 'BETA')!;
  assert.equal(beta.variazione, -80); assert.equal(beta.segnale, 'calo forte'); assert.equal(beta.fermo, true);
  assert.deepEqual(v.inCaloForte.map(c => c.cliente), ['BETA']);
  assert.deepEqual(v.nuovi.map(c => c.cliente), ['DELTA', 'ALFA']);   // ALFA: prima vendita nel 2026
  assert.deepEqual(v.persi.map(c => c.cliente), ['GAMMA']);
  const gamma = v.persi[0];
  assert.equal(gamma.ultimaVendita, '2026-03-01');   // il DDT di vendita vale come ultimo ordine
  assert.equal(gamma.segnale, 'perso');
  assert.ok(v.fermi.some(c => c.cliente === 'BETA') && v.fermi.some(c => c.cliente === 'GAMMA'));
  assert.ok(!v.fermi.some(c => c.cliente === 'DELTA'));
  // anno passato: anno intero, niente "fermi"
  const v25 = visioneClienti(ft, 2025, oggi);
  assert.equal(v25.finoA, null);
  assert.equal(v25.fermi.length, 0);
  assert.deepEqual(v25.nuovi.map(c => c.cliente), ['BETA']);
  assert.deepEqual(v25.persi.map(c => c.cliente), []);
});

test('guida: analisi dei prodotti e dei clienti', () => {
  assert.equal(cercaGuida('classifica prodotti per cliente')[0]?.argomento.id, 'analisi-prodotti');
  assert.equal(cercaGuida('clienti persi fermi nuovi')[0]?.argomento.id, 'analisi-clienti');
  assert.equal(cercaGuida('margine consuntivo prodotto')[0]?.argomento.id, 'analisi-prodotti');
});
