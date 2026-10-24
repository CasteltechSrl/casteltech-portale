import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcolaFormula, variabiliUsate } from '../src/engine/espressioni.js';
import { calcolaPreventivo, type FaseDef, type Tariffe } from '../src/engine/calcolo.js';
import { calcolaConsuntivo, prezzoCorretto } from '../src/engine/consuntivo.js';

test('formule: operazioni, parametri mancanti = 0, divisione per zero = 0, funzioni', () => {
  assert.equal(calcolaFormula('a * 60 + b', { a: 2, b: 5 }), 125);
  assert.equal(calcolaFormula('a * mancante', { a: 2 }), 0);
  assert.equal(calcolaFormula('qtSmd / (pepChipH / 3600) * nSchede', { qtSmd: 100, pepChipH: 0, nSchede: 10 }), 0);
  assert.equal(calcolaFormula('ore * 3600 * se(bot, 2, 1)', { ore: 1.5, bot: 1 }), 10800);
  assert.equal(calcolaFormula('max(1, -3) + round(2.345, 2)', {}), 3.35);
  assert.deepEqual(variabiliUsate('x * (y + 2)').sort(), ['x', 'y']);
  assert.throws(() => calcolaFormula('a +', {}));
  assert.throws(() => calcolaFormula('process.exit()', {}));
});

const tariffe: Tariffe = { costoAziendaH: 25, costoOperatoreProduzioneH: 15, costoOperatoreUfficioH: 35, ricarico: 1.25 };
const onda: FaseDef = { codice: 'onda', nome: 'Saldatura ad onda', gruppo: 'THT', formulaSecondi: 'secPannello * nPCB', persone: 2, tariffa: 'produzione', unaTantum: false };
const setup: FaseDef = { codice: 'setup', nome: 'Attrezzaggio', gruppo: 'SMD', formulaSecondi: 'minuti * 60', persone: 1, tariffa: 'produzione', unaTantum: false };
const prog: FaseDef = { codice: 'prog', nome: 'Programmazione P&P', gruppo: 'PRE', formulaSecondi: 'ore * 3600', persone: 1, tariffa: 'ufficio', unaTantum: true };
const input = { nSchede: 100, parametri: { secPannello: 72, nPCB: 50, minuti: 60, ore: 2 } };

test('preventivo: tempo ciclo, tempo uomo con 2 persone, una tantum solo nel primo lotto', () => {
  const r = calcolaPreventivo([onda, setup, prog], [], tariffe, input);
  const o = r.fasi[0];
  assert.equal(o.secondiCiclo, 3600);          // 1 ora di linea
  assert.equal(o.secondiUomo, 7200);           // 2 ore uomo
  assert.equal(o.costo, 25 + 2 * 15);          // 55 €
  assert.equal(r.fasi[2].costo, 2 * (25 + 35)); // 120 € a tariffa ufficio
  assert.equal(r.totali.totaleSecondoLotto, 1.25 * (55 + 40));
  assert.equal(r.totali.totalePrimoLotto, 1.25 * (55 + 40 + 120));
  assert.equal(r.totali.secondiUomoSecondoLotto, 7200 + 3600);
});

test('consuntivo: onda fatta da 1 persona → ciclo più lungo ma meno tempo uomo; problemi esclusi dal prezzo corretto', () => {
  const c = calcolaConsuntivo({
    fasi: [onda, setup, prog], voci: [], tariffe, input, primoLotto: false,
    rilevazioni: [
      { fase: 'onda', data: '2026-11-03', inizio: '08:00', fine: '09:30', persone: 1, tipo: 'S', operatore: 'Mario' },
      { fase: 'setup', data: '2026-11-03', inizio: '07:00', fine: '08:00', tipo: 'S', operatore: 'Luca' },
      { fase: 'setup', data: '2026-11-03', inizio: '07:30', fine: '08:00', tipo: 'S', operatore: 'Anna' }, // in parallelo
      { fase: 'setup', data: '2026-11-03', inizio: '10:00', fine: '10:30', tipo: 'P', causa: 'feeder guasto' },
    ],
  });
  const o = c.fasi.find(f => f.codice === 'onda')!;
  assert.equal(o.realeCicloSec, 5400);   // 1h30 di linea (più del previsto 1h)
  assert.equal(o.realeUomoSec, 5400);    // ma 1h30 uomo (meno delle 2h previste)
  assert.equal(o.scostamentoStandardPct, -25); // riportato a 2 persone: 0h45 equivalenti vs 1h
  const s = c.fasi.find(f => f.codice === 'setup')!;
  assert.equal(s.standardCicloSec, 3600);  // righe sovrapposte: il ciclo non raddoppia
  assert.equal(s.standardUomoSec, 5400);   // ma il tempo uomo sì
  assert.equal(s.problemaUomoSec, 1800);
  assert.deepEqual(s.cause, ['feeder guasto']);
  assert.ok(c.costoProblemi > 0);
  assert.ok(!('prog' in c.fattoriCorrezione)); // una tantum fuori dal secondo lotto
  assert.equal(c.fattoriCorrezione.setup, 1.5);
  assert.equal(c.scenarioReale.fattori.onda, 1.5);   // ciclo reale 1h30 vs 1h
  assert.equal(c.scenarioReale.persone.onda, 1);
});

test('prezzo corretto: i fattori si applicano e la quantità scala solo le fasi per pezzo', () => {
  const base = calcolaPreventivo([onda, setup], [], tariffe, input);
  const corr = prezzoCorretto({ fasi: [onda, setup], voci: [], tariffe, input, fattori: { setup: 1.5 } });
  assert.equal(corr.fasi[1].secondiCiclo, 5400);
  assert.ok(corr.totali.totaleSecondoLotto > base.totali.totaleSecondoLotto);
  const doppio = prezzoCorretto({ fasi: [onda, setup], voci: [], tariffe, input, fattori: {}, nuovaQuantita: { nSchede: 200, nPCB: 100 } });
  assert.equal(doppio.fasi[0].secondiCiclo, 7200); // onda raddoppia
  assert.equal(doppio.fasi[1].secondiCiclo, 3600); // attrezzaggio no
});

import { FASI, VOCI, PARAMETRI, MATERIALI } from '../src/catalogo/iniziale.js';
import { controllaFormula } from '../src/catalogo/controlli.js';

test('catalogo iniziale: tutte le formule sono valide e usano solo nomi esistenti', () => {
  const cat = { fasi: FASI, parametri: PARAMETRI, materiali: MATERIALI };
  for (const f of FASI) assert.equal(controllaFormula(f.formulaSecondi, cat), null, `fase ${f.codice}`);
  for (const v of VOCI) assert.equal(controllaFormula(v.formulaEuro, cat, true), null, `voce ${v.codice}`);
  const codici = FASI.map(f => f.codice);
  assert.equal(new Set(codici).size, codici.length, 'codici fase duplicati');
});

test('energia e forno: preriscaldamento solo se la fase c\'è, consumo = ore × kW × €/kWh', () => {
  const t: Tariffe = { costoAziendaH: 25, costoOperatoreProduzioneH: 15, costoOperatoreUfficioH: 20, ricarico: 1 };
  const voci = VOCI.filter(v => v.gruppo === 'ENERGIA');
  const def = Object.fromEntries(PARAMETRI.filter(p => p.default != null).map(p => [p.codice, p.default!]));
  // nessun SMD e onda non prevista: niente forno, niente onda, niente energia
  const senza = calcolaPreventivo(FASI, voci, t, { nSchede: 100, parametri: { ...def, nPCB: 50 } });
  assert.deepEqual(senza.voci.map(v => v.costo), [0, 0]);
  assert.equal(senza.fasi.find(f => f.codice === 'fornoTop')!.secondiCiclo, 0);
  // SMD su due lati + onda, 50 pannelli: forno 4 min + 49 × 15 s; onda 4 min + 49 × 90 s
  const con = calcolaPreventivo(FASI, voci, t, { nSchede: 100, parametri: { ...def, nPCB: 50, qtSmd: 100, qtSmdLatoB: 10, usaOnda: 1, doppiaFaccia: 1 } });
  const forno = con.fasi.find(f => f.codice === 'fornoTop')!;
  assert.equal(forno.secondiCiclo, 240 + 49 * 15);
  assert.equal(forno.persone, 2);
  assert.equal(con.fasi.find(f => f.codice === 'saldaturaOnda')!.secondiCiclo, 240 + 49 * 90);
  const euroEnergia = (sec: number) => sec / 3600 * 15 * 0.4;
  assert.ok(Math.abs(con.voci[0].costo - (6 + euroEnergia(2 * (240 + 49 * 15)))) < 1e-9);
  assert.ok(Math.abs(con.voci[1].costo - (25 + euroEnergia(240 + 49 * 90))) < 1e-9);
  // serigrafia separata dal P&P: 1 persona contro 2
  assert.equal(con.fasi.find(f => f.codice === 'serigrafiaTop')!.persone, 1);
  assert.equal(con.fasi.find(f => f.codice === 'pepTop')!.persone, 2);
  assert.equal(con.fasi.find(f => f.codice === 'pepBot')!.persone, 2);
  assert.ok(FASI.filter(f => f.gruppo === 'PRE-PRODUZIONE').every(f => f.unaTantum && f.tariffa === 'ufficio'));
});

test('preventivo vuoto: senza componenti SMD nessuna fase SMD, programmazione o AOI', () => {
  const t: Tariffe = { costoAziendaH: 25, costoOperatoreProduzioneH: 15, costoOperatoreUfficioH: 20, ricarico: 1.25 };
  const def = Object.fromEntries(PARAMETRI.filter(p => p.default != null).map(p => [p.codice, p.default!]));
  const r = calcolaPreventivo(FASI, VOCI, t, { nSchede: 100, parametri: { ...def, nPCB: 100 } });
  const conTempo = r.fasi.filter(f => f.secondiCiclo > 0).map(f => f.codice);
  // pre-produzione e gestione materiale senza tempi standard (li scrive l'operatore): restano l'imballaggio
  // e, con materiale del cliente da restituire (provenienza standard), i 10' di reso al cliente
  assert.deepEqual(conTempo, ['imballaggio', 'resoMaterialeCliente']);
  // solo TOP: niente fasi BOT
  const top = calcolaPreventivo(FASI, VOCI, t, { nSchede: 100, parametri: { ...def, nPCB: 100, qtSmd: 50, qtFeeder: 10 } });
  assert.ok(top.fasi.filter(f => /Bot$/.test(f.codice)).every(f => f.secondiCiclo === 0));
  assert.ok(top.fasi.find(f => f.codice === 'avvioTop')!.secondiCiclo > 0);
});

test('Solo TOP / TOP + BOT: raddoppio dei tempi "per lato" e fasi BOT solo con TOP + BOT', () => {
  const t: Tariffe = { costoAziendaH: 25, costoOperatoreProduzioneH: 15, costoOperatoreUfficioH: 20, ricarico: 1 };
  const def = Object.fromEntries(PARAMETRI.filter(p => p.default != null).map(p => [p.codice, p.default!]));
  const pre = { oreFoglioTempi: 1 / 6, oreAnalisiBom: 1, orePreventivo: 0.5, orePrepDoc: 0.5, oreProgArmadi: 0.5, oreFilePeP: 0.5, oreProgPeP: 1, oreEtichettaturaMateriale: 1 };
  const base = { ...def, ...pre, nPCB: 50, qtSmd: 100, qtFeeder: 20, qtSmdLatoB: 10, qtFeederLatoB: 5 };
  const top = calcolaPreventivo(FASI, VOCI, t, { nSchede: 100, parametri: { ...base, doppiaFaccia: 0 } });
  const bot = calcolaPreventivo(FASI, VOCI, t, { nSchede: 100, parametri: { ...base, doppiaFaccia: 1 } });
  const sec = (r: typeof top, c: string) => r.fasi.find(f => f.codice === c)!.secondiCiclo;
  for (const c of ['prepDocumentazione', 'progArmadi', 'filePeP', 'progPeP', 'progAOI']) assert.equal(sec(bot, c), 2 * sec(top, c), c);
  for (const c of ['analisiBom', 'preventivo', 'etichettaturaMateriale']) assert.equal(sec(bot, c), sec(top, c), c);
  // Solo TOP: anche se restano dati BOT, le fasi BOT non contano
  assert.ok(top.fasi.filter(f => /Bot$/.test(f.codice)).every(f => f.secondiCiclo === 0));
  assert.ok(sec(bot, 'avvioBot') > 0);
  assert.equal(sec(top, 'foglioTempi'), 600);
  assert.equal(sec(top, 'progPeP'), 3600);
  // pre-produzione vuota = nessun costo
  const vuota = calcolaPreventivo(FASI, VOCI, t, { nSchede: 100, parametri: { ...def, nPCB: 50 } });
  assert.ok(vuota.fasi.filter(f => f.gruppo === 'PRE-PRODUZIONE').every(f => f.costo === 0));
});

test('gestione materiale: numero item × tempo per item, a ogni lotto; da restituire niente magazzino e 10\' di reso', () => {
  const t: Tariffe = { costoAziendaH: 25, costoOperatoreProduzioneH: 15, costoOperatoreUfficioH: 20, ricarico: 1 };
  const def = Object.fromEntries(PARAMETRI.filter(p => p.default != null).map(p => [p.codice, p.default!]));
  const calc = (provenienzaMateriale: number) => calcolaPreventivo(FASI, VOCI, t, { nSchede: 10, parametri: { ...def, nPCB: 10, nItemMateriale: 40, provenienzaMateriale } });
  const sec = (r: ReturnType<typeof calc>, c: string) => r.fasi.find(f => f.codice === c)!.secondiCiclo;
  const restituire = calc(1), magazzino = calc(2), vecchio3 = calc(3);
  // da restituire: niente etichettatura, stoccaggio ed estrazione, 10' di reso al cliente
  assert.equal(sec(restituire, 'etichettaturaMateriale') + sec(restituire, 'stoccaggioMateriale') + sec(restituire, 'estrazioneMateriale'), 0);
  assert.equal(sec(restituire, 'resoMaterialeCliente'), 600);
  // a magazzino (anche i valori 3/4 dei preventivi salvati prima): 40 item × 60 s, 30 s, 30 s; niente reso
  for (const r of [magazzino, vecchio3]) {
    assert.equal(sec(r, 'etichettaturaMateriale'), 2400);
    assert.equal(sec(r, 'stoccaggioMateriale'), 1200);
    assert.equal(sec(r, 'estrazioneMateriale'), 1200);
    assert.equal(sec(r, 'resoMaterialeCliente'), 0);
  }
  // sempre: controllo bolla 60 s, preparazione 30 s, chiusura 2 min per item
  for (const r of [restituire, magazzino]) {
    assert.equal(sec(r, 'controlloBollaLotto'), 2400);
    assert.equal(sec(r, 'preparazioneMateriale'), 1200);
    assert.equal(sec(r, 'chiusuraSessione'), 4800);
    assert.equal(r.totali.totalePrimoLotto, r.totali.totaleSecondoLotto);   // nessuna una tantum
  }
  // senza numero di item nessun tempo
  const senza = calcolaPreventivo(FASI, VOCI, t, { nSchede: 10, parametri: { ...def, nPCB: 10, provenienzaMateriale: 2 } });
  assert.ok(senza.fasi.filter(f => f.gruppo === 'GESTIONE MATERIALE').every(f => f.secondiCiclo === 0));
});

test('scheda: tempo ultima produzione = righe S, riportato a persone previste e alla nuova quantità', async () => {
  const { cicloStandardPerFase, riportaAQuantita } = await import('../src/engine/consuntivo.js');
  const r = cicloStandardPerFase([
    { fase: 'pep', data: '2026-10-01', inizio: '08:00', fine: '09:00', persone: 2, tipo: 'S' },
    { fase: 'pep', data: '2026-10-01', inizio: '09:00', fine: '09:30', persone: 1, tipo: 'S' },
    { fase: 'pep', data: '2026-10-01', inizio: '10:00', fine: '11:00', persone: 2, tipo: 'P', causa: 'feeder rotto' },
    { fase: 'imb', data: '2026-10-02', inizio: '14:00', fine: '14:30', tipo: 'S' },
    { fase: 'imb', data: '2026-10-02', inizio: '14:15', fine: '14:45', tipo: 'S' },
  ], { pep: 2 });
  assert.equal(r.pep, (7200 + 1800) / 2);  // uomo 2h30 ÷ 2 persone previste; la riga P non conta
  assert.equal(r.imb, 2700);               // senza persone previste: unione degli intervalli (14:00–14:45)
  const da = { schede: 100, pannelli: 50 }, a = { schede: 300, pannelli: 150 };
  assert.equal(riportaAQuantita(600, 'fisso', da, a), 600);
  assert.equal(riportaAQuantita(600, 'scheda', da, a), 1800);
  assert.equal(riportaAQuantita(600, 'pannello', da, { schede: 300, pannelli: 75 }), 900);
});

test('riepilogo preventivo: una tantum interni/acquisti, margini, ore e prezzo orario ciclo e uomo', async () => {
  const { riepilogo } = await import('../src/engine/riepilogo.js');
  const t: Tariffe = { costoAziendaH: 25, costoOperatoreProduzioneH: 15, costoOperatoreUfficioH: 20, ricarico: 1.25 };
  const fasi: FaseDef[] = [
    { codice: 'pep', nome: 'P&P', gruppo: 'SMD', formulaSecondi: '3600', persone: 2, tariffa: 'produzione', unaTantum: false },
    { codice: 'prog', nome: 'Programmazione', gruppo: 'PRE', formulaSecondi: '3600', persone: 1, tariffa: 'ufficio', unaTantum: true },
  ];
  const voci = [{ codice: 'lamina', nome: 'Lamina', gruppo: 'UT', formulaEuro: '100', unaTantum: true }];
  const r = riepilogo(calcolaPreventivo(fasi, voci, t, { nSchede: 10, parametri: {} }));
  assert.equal(r.prezzoLotto, 68.75);                     // (25 + 2 × 15) × 1,25
  assert.equal(r.prezzoScheda, 6.88);
  assert.equal(r.unaTantumInterni, 56.25);                // (25 + 20) × 1,25
  assert.equal(r.unaTantumAcquisti, 125);                 // 100 × 1,25
  assert.equal(r.unaTantum, 181.25);
  assert.equal(r.prezzoLottoConUnaTantum, 250);
  assert.equal(r.margineUnaTantum, 36.25);                // 181,25 − (45 + 100)
  assert.equal(r.margineLotto, 13.75);
  assert.equal(r.margineScheda, 1.38);
  assert.equal(r.oreCicloSec, 3600); assert.equal(r.oreUomoSec, 7200);
  assert.equal(r.prezzoOraCiclo, 68.75); assert.equal(r.prezzoOraUomo, 34.38);
});

test('informazioni generali: programmazioni solo con prima produzione, armadi solo a magazzino, acquisti solo con la spunta', () => {
  const t: Tariffe = { costoAziendaH: 25, costoOperatoreProduzioneH: 15, costoOperatoreUfficioH: 20, ricarico: 1 };
  const def = Object.fromEntries(PARAMETRI.filter(p => p.default != null).map(p => [p.codice, p.default!]));
  const base = { ...def, nPCB: 10, qtSmd: 50, qtFeeder: 10, oreProgArmadi: 0.5, oreFilePeP: 0.5, oreProgPeP: 1, oreProgForno: 0.25,
    oreProgOnda: 0.5, usaOnda: 1, qtTht: 5, oreAcquistoLamine: 0.25, oreAcquistoPcb: 0.25, costoPcbScheda: 2, prezzoLamina: 90 };
  const calc = (p: Record<string, number>) => calcolaPreventivo(FASI, VOCI, t, { nSchede: 10, parametri: { ...base, ...p } });
  const sec = (r: ReturnType<typeof calc>, c: string) => r.fasi.find(f => f.codice === c)!.secondiCiclo;
  const voce = (r: ReturnType<typeof calc>, c: string) => r.voci.find(v => v.codice === c)!.costo;
  const prog = ['progArmadi', 'filePeP', 'progPeP', 'progSerigrafiaTop', 'progForno', 'progAOI', 'progOnda'];
  // prima produzione, materiale a magazzino, THT con onda: tutte le programmazioni
  const prima = calc({ primaProduzione: 1, provenienzaMateriale: 2, presenteTht: 1 });
  for (const c of prog) assert.ok(sec(prima, c) > 0, c);
  // materiale del cliente da restituire: niente programmazione armadi
  assert.equal(sec(calc({ primaProduzione: 1, provenienzaMateriale: 1, presenteTht: 1 }), 'progArmadi'), 0);
  // ripetizione: nessuna programmazione
  const ripetizione = calc({ primaProduzione: 0, provenienzaMateriale: 2, presenteTht: 1 });
  for (const c of prog) assert.equal(sec(ripetizione, c), 0, c);
  // solo THT: niente programmazioni SMD, sì onda
  const soloTht = calc({ primaProduzione: 1, provenienzaMateriale: 2, presenteTht: 1, qtSmd: 0, qtFeeder: 0 });
  for (const c of ['progArmadi', 'filePeP', 'progPeP', 'progSerigrafiaTop', 'progForno', 'progAOI']) assert.equal(sec(soloTht, c), 0, c);
  assert.ok(sec(soloTht, 'progOnda') > 0);
  // acquisti: tempo e costo solo con la spunta; lamine: vuoto = una per lato
  const senza = calc({ acquistoLamina: 0, acquistoPcb: 0 });
  assert.equal(sec(senza, 'acquistoLamine') + sec(senza, 'acquistoPcb'), 0);
  assert.equal(voce(senza, 'laminaSerigrafica') + voce(senza, 'valoreAcquistoPCB'), 0);
  const con = calc({ acquistoLamina: 1, acquistoPcb: 1, doppiaFaccia: 1 });
  assert.equal(sec(con, 'acquistoLamine'), 900);
  assert.equal(voce(con, 'laminaSerigrafica'), 180);      // 2 lati × 90 €
  assert.equal(voce(con, 'valoreAcquistoPCB'), 20);
});
