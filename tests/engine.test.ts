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

test('gestione materiale: tutto a ogni lotto; con materiale da restituire niente magazzino e 10\' di reso', () => {
  const t: Tariffe = { costoAziendaH: 25, costoOperatoreProduzioneH: 15, costoOperatoreUfficioH: 20, ricarico: 1 };
  const def = Object.fromEntries(PARAMETRI.filter(p => p.default != null).map(p => [p.codice, p.default!]));
  const tempi = { oreControlloBolla: 0.5, oreEtichettaturaMateriale: 1, oreStoccaggioMateriale: 0.25, oreEstrazioneMateriale: 0.25,
    orePreparazioneMateriale: 0.5, oreChiusuraSessione: 0.25 };
  const calc = (provenienzaMateriale: number) => calcolaPreventivo(FASI, VOCI, t, { nSchede: 10, parametri: { ...def, nPCB: 10, ...tempi, provenienzaMateriale } });
  const sec = (r: ReturnType<typeof calc>, c: string) => r.fasi.find(f => f.codice === c)!.secondiCiclo;
  const restituire = calc(1), magazzino = calc(2), acquistato = calc(3), misto = calc(4);
  // caso 1: niente etichettatura, stoccaggio ed estrazione (non passa dal magazzino), 10' di reso al cliente
  assert.equal(sec(restituire, 'etichettaturaMateriale') + sec(restituire, 'stoccaggioMateriale') + sec(restituire, 'estrazioneMateriale'), 0);
  assert.equal(sec(restituire, 'resoMaterialeCliente'), 600);
  // casi 2 e 3: etichettatura, stoccaggio ed estrazione; niente reso
  for (const r of [magazzino, acquistato, misto]) {
    assert.equal(sec(r, 'etichettaturaMateriale'), 3600);
    assert.equal(sec(r, 'stoccaggioMateriale'), 900);
    assert.equal(sec(r, 'estrazioneMateriale'), 900);
    assert.equal(sec(r, 'resoMaterialeCliente'), 0);
  }
  // sempre: controllo bolla, preparazione per la produzione, chiusura
  for (const r of [restituire, magazzino, acquistato, misto]) {
    assert.equal(sec(r, 'controlloBollaLotto'), 1800);
    assert.equal(sec(r, 'preparazioneMateriale'), 1800);
    assert.equal(sec(r, 'chiusuraSessione'), 900);
    // tutto a ogni lotto: nessun costo una tantum dalla gestione materiale
    assert.equal(r.totali.totalePrimoLotto, r.totali.totaleSecondoLotto);
  }
  assert.ok(FASI.filter(f => f.gruppo === 'GESTIONE MATERIALE').every(f => !f.unaTantum));
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
