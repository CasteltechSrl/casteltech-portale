import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  confrontoConPortale, contoEconomico, famigliaDiCategoria, famigliaDiConto, leggiBilanciUfficiali, leggiBilancino, meseDalNome, mesiDelPeriodo, pareggioDaBilancio,
  puntoPareggio, stimaFamiglia, utileConFatturato, type BilancioUfficiale, type FoglioBilancino, type VoceMese,
} from '../src/engine/pareggio.js';
import { cercaGuida } from '../src/engine/guida.js';

test('pareggio: famiglie dai conti del commercialista e dalle categorie di FIC', () => {
  assert.equal(famigliaDiConto('70200001'), 'materie');
  assert.equal(famigliaDiConto('70900003'), 'servizi');
  assert.equal(famigliaDiConto('71500002'), 'servizi');
  assert.equal(famigliaDiConto('71700011'), 'godimento');
  assert.equal(famigliaDiConto('72000001'), 'personale');
  assert.equal(famigliaDiConto('71100046'), 'compensi');
  assert.equal(famigliaDiConto('72700013'), 'ammortamenti');
  assert.equal(famigliaDiConto('73700061'), 'oneri');
  assert.equal(famigliaDiConto('74000037'), 'finanziari');
  assert.equal(famigliaDiConto('80300001'), 'ricavi');
  assert.equal(famigliaDiConto('82500012'), 'ricavi');
  assert.equal(famigliaDiConto('70100001'), null);     // rimanenze iniziali
  assert.equal(famigliaDiConto('702'), null);          // totale di gruppo
  assert.equal(famigliaDiConto('10400013'), null);     // patrimoniale
  assert.equal(famigliaDiCategoria('B6_Materie prime c/acqusti'), 'materie');
  assert.equal(famigliaDiCategoria('B6_Cancelleria'), 'servizi');
  assert.equal(famigliaDiCategoria('B7_Comp.Ammin.Soci'), 'compensi');
  assert.equal(famigliaDiCategoria('B7_Energia elettrica'), 'servizi');
  assert.equal(famigliaDiCategoria('B8_Canone Locazione Finanz.'), 'godimento');
  assert.equal(famigliaDiCategoria('B9_Salari-stipendi'), 'personale');
  assert.equal(famigliaDiCategoria('Componenti elettronici'), 'materie');
  assert.equal(famigliaDiCategoria(''), 'senza_categoria');
  assert.equal(famigliaDiCategoria(null), 'senza_categoria');
});

test('pareggio: mese dal nome del foglio', () => {
  assert.equal(meseDalNome('GENNAIO'), 1);
  assert.equal(meseDalNome('Marzo '), 3);
  assert.equal(meseDalNome('AGOSTO'), 8);
  assert.equal(meseDalNome('set'), 9);
  assert.equal(meseDalNome('2026-10'), 10);
  assert.equal(meseDalNome('RIEPILOGO'), null);
  assert.equal(meseDalNome('MENSILE'), null);
  assert.equal(meseDalNome('13'), null);
});

const foglio = (nome: string, righe: [string, string, number][]): FoglioBilancino => ({ nome, righe: righe.map(([conto, descrizione, saldo]) => ({ conto, descrizione, saldo })) });

test('pareggio: dai saldi progressivi ai valori del mese; i totali di gruppo e le rimanenze non entrano', () => {
  const { voci, mesi, avvisi } = leggiBilancino([
    foglio('GENNAIO', [['702', 'ACQ MATERIE', 100], ['70200001', 'MATERIE PRIME', 100], ['80300001', 'RICAVI', 300], ['70100001', 'RIM.INIZ.', 999], ['71700011', 'LEASING', 50]]),
    foglio('FEBBRAIO', [['70200001', 'MATERIE PRIME', 160], ['80300001', 'RICAVI', 520], ['70900003', 'ENERGIA', 40]]),   // il leasing sparisce dal foglio
    foglio('RIEPILOGO', [['70200001', 'MATERIE PRIME', 99999]]),
  ], 2026);
  assert.deepEqual(mesi, [1, 2]);
  assert.deepEqual(avvisi, []);
  const v = (m: number, c: string) => voci.find(x => x.mese === m && x.conto === c);
  assert.equal(v(1, '70200001')!.importo, 100);
  assert.equal(v(2, '70200001')!.importo, 60);
  assert.equal(v(2, '80300001')!.importo, 220);
  assert.equal(v(2, '70900003')!.importo, 40);           // conto nuovo a febbraio: tutto del mese
  assert.equal(v(2, '71700011')!.importo, 0);            // conto sparito: progressivo fermo, mese 0
  assert.equal(v(2, '71700011')!.progressivo, 50);
  assert.equal(v(1, '702'), undefined);
  assert.equal(v(1, '70100001'), undefined);
});

test('pareggio: un mese senza il mese prima non si carica, salvo che il mese prima sia già nel portale', () => {
  const marzo = foglio('MARZO', [['70200001', 'MATERIE PRIME', 300]]);
  const senza = leggiBilancino([marzo], 2026);
  assert.deepEqual(senza.voci, []);
  assert.match(senza.avvisi[0], /manca febbraio/);
  const gia: VoceMese[] = [{ anno: 2026, mese: 2, conto: '70200001', descrizione: 'MATERIE PRIME', importo: 60, progressivo: 160 }];
  const con = leggiBilancino([marzo], 2026, gia);
  assert.equal(con.voci[0].importo, 140);
  assert.deepEqual(con.avvisi, []);
  assert.equal(leggiBilancino([foglio('MARZO', [])], 2026).avvisi.length, 1);
});

test('pareggio: stessi numeri del file del commercialista (gen–ago 2026)', () => {
  // medie del file: ricavi 36.006,38, materie 18.276,03, costi fissi 28.382,22 → pareggio 57.637,95
  const p = puntoPareggio(36006.38375, 18276.03125, 28382.22375);
  assert.equal(p.fatturatoPareggio, 57637.95);
  assert.equal(p.fatturatoPareggioAnno, 691655.4);
  assert.equal(Math.round(p.margineContribuzione! * 1000) / 1000, 0.492);
  assert.equal(p.utileMedio, -10651.87);
  assert.equal(p.acquistiAlPareggio, 29255.73);
  assert.equal(utileConFatturato(p, 58000), 178.28);      // la colonna "Valutativo" del file
  assert.equal(puntoPareggio(0, 0, 100).fatturatoPareggio, null);
  assert.equal(puntoPareggio(100, 120, 10).fatturatoPareggio, null);   // margine negativo: nessun pareggio
});

const comm = (anno: number, mese: number, conto: string, importo: number): VoceMese => ({ anno, mese, conto, descrizione: conto, importo, progressivo: 0 });
const bilancio2025: BilancioUfficiale = { anno: 2025, ricavi: 476906, altriRicavi: 32580, variazioneRimanenzeProdotti: -23800, materie: 154261, variazioneRimanenzeMaterie: -1300,
  servizi: 91058, godimento: 26916, personale: 138757, ammortamenti: 32664, oneriDiversi: 28152, oneriFinanziari: 3924, imposte: 2780, utile: 8474 };

test('pareggio: mesi del commercialista così come sono, mesi del portale con le stime per le voci che mancano', () => {
  const commercialista = [
    comm(2026, 1, '80300001', 30000), comm(2026, 1, '70200001', 12000), comm(2026, 1, '72000001', 9000), comm(2026, 1, '72700013', 4000), comm(2026, 1, '74000037', 500),
    comm(2026, 2, '80300001', 20000), comm(2026, 2, '70200001', 8000), comm(2026, 2, '72000001', 9000), comm(2026, 2, '72700013', 4000), comm(2026, 2, '74000037', 300),
  ];
  const portale = [
    { anno: 2026, mese: 2, voci: [{ famiglia: 'ricavi' as const, voce: 'Fatture', importo: 99999 }] },   // ignorato: febbraio è del commercialista
    { anno: 2026, mese: 3, voci: [{ famiglia: 'ricavi' as const, voce: 'Fatture', importo: 40000 }, { famiglia: 'materie' as const, voce: 'B6', importo: 10000 },
      { famiglia: 'personale' as const, voce: 'Buste paga', importo: 9500 }, { famiglia: 'senza_categoria' as const, voce: 'Senza categoria', importo: 1000 }] },
  ];
  const ce = contoEconomico({ periodo: { da: '2026-01', a: '2026-03' }, commercialista, portale, bilanci: [bilancio2025] });
  assert.equal(ce.nMesi, 3);
  assert.deepEqual(ce.mesi.map(m => m.fonte), ['commercialista', 'commercialista', 'portale']);
  assert.deepEqual(ce.mesi[2].stime, ['ammortamenti', 'finanziari']);   // il portale non li ha: media dei mesi del commercialista
  const f = (c: string) => ce.famiglie.find(x => x.codice === c)!;
  assert.equal(f('ricavi').media, 30000);                 // (30000 + 20000 + 40000) / 3
  assert.equal(f('materie').media, 10000);
  assert.equal(f('ammortamenti').media, 4000);            // 4000, 4000, stima 4000
  assert.equal(f('finanziari').media, 400);               // 500, 300, stima 400
  assert.equal(f('personale').media, Math.round(((9000 + 9000 + 9500) / 3) * 100) / 100);
  assert.equal(f('senza_categoria').totale, 1000);
  assert.equal(f('ammortamenti').fonti.stima, 1);
  assert.match(f('ammortamenti').nota!, /2 mesi dal commercialista, 1 stimati/);
  assert.equal(f('ricavi').nota, '2 mesi dal commercialista, 1 dal portale');
  assert.ok(f('ammortamenti').dettagli.some(d => d.fonte === 'stima' && /media dei mesi 2026/.test(d.voce)));
  // costi fissi = tutto tranne le materie; pareggio = fissi / margine
  const fissi = f('personale').media + f('ammortamenti').media + f('finanziari').media + f('senza_categoria').media;
  assert.equal(ce.pareggio.fissiMedi, Math.round(fissi * 100) / 100);
  assert.equal(ce.pareggio.fatturatoPareggio, Math.round((fissi / ((30000 - 10000) / 30000)) * 100) / 100);
});

test('pareggio: senza bilancino la stima viene dal bilancio ufficiale ÷ 12, i compensi non si stimano dal bilancio', () => {
  assert.deepEqual(stimaFamiglia('ammortamenti', 2025, [], [bilancio2025]), { importo: 2722, da: 'bilancio 2025 ÷ 12' });
  assert.equal(stimaFamiglia('compensi', 2025, [], [bilancio2025]), null);
  assert.deepEqual(stimaFamiglia('oneri', 2027, [comm(2026, 1, '73500001', 120)], [bilancio2025]), { importo: 120, da: 'media dei mesi 2026 del commercialista' });
  assert.deepEqual(stimaFamiglia('finanziari', 2024, [], [bilancio2025]), { importo: 327, da: 'bilancio 2025 ÷ 12' });   // anno senza bilancio: l'ultimo
  const ce = contoEconomico({ periodo: { da: '2025-01', a: '2025-02' }, commercialista: [], portale: [{ anno: 2025, mese: 1, voci: [{ famiglia: 'ricavi', voce: 'F', importo: 40000 }] }], bilanci: [bilancio2025] });
  assert.equal(ce.famiglie.find(f => f.codice === 'ammortamenti')!.media, 2722);
  assert.equal(ce.famiglie.find(f => f.codice === 'ricavi')!.media, 20000);
  assert.ok(ce.avvisi.some(a => /Nessun mese del commercialista/.test(a)));
});

test('pareggio: bilancio ufficiale letto con la stessa regola', () => {
  const p = pareggioDaBilancio(bilancio2025);
  assert.equal(p.risultatoPrimaImposte, 11254);   // come nel bilancio depositato 2025
  assert.equal(p.utileBilancio, 8474);
  assert.equal(p.ricaviMedi, Math.round(((476906 + 32580 - 23800) / 12) * 100) / 100);
  assert.ok(p.fatturatoPareggio! > 0 && p.fatturatoPareggio! < p.ricaviMedi);
});

test('pareggio: verifica tra commercialista e portale, segnalate le differenze oltre 500 € e 5 %', () => {
  const commercialista = [comm(2026, 1, '80300001', 31980), comm(2026, 1, '70200001', 25086), comm(2026, 1, '72000001', 7665), comm(2026, 2, '80300001', 25432)];
  const portale = [
    { anno: 2026, mese: 1, voci: [{ famiglia: 'ricavi' as const, voce: 'F', importo: 28480 }, { famiglia: 'materie' as const, voce: 'B6', importo: 25000 }, { famiglia: 'personale' as const, voce: 'P', importo: 10922 }] },
    { anno: 2026, mese: 2, voci: [{ famiglia: 'ricavi' as const, voce: 'F', importo: 7432 }] },
    { anno: 2026, mese: 3, voci: [{ famiglia: 'ricavi' as const, voce: 'F', importo: 28724 }] },   // marzo non ha il bilancino: fuori dal confronto
  ];
  const c = confrontoConPortale(commercialista, portale);
  assert.equal(c.length, 2);
  const gen = c[0].voci;
  assert.equal(gen[0].differenza, -3500);
  assert.equal(gen[0].pct, -10.9);
  assert.equal(gen[0].segnala, true);
  assert.equal(gen[1].differenza, -86);
  assert.equal(gen[1].segnala, false);
  assert.equal(gen[2].segnala, true);
  assert.equal(c[1].voci[0].differenza, -18000);
  assert.equal(c[1].voci[1].commercialista, 0);
  assert.equal(c[1].voci[1].pct, null);
});

test('pareggio: file dei bilanci ufficiali controllato riga per riga', () => {
  const { bilanci, errori } = leggiBilanciUfficiali([{ anno: 2025, ricavi: '476906', utile: 8474 }, { anno: 'x' }, { anno: 2024, ricavi: 'abc' }]);
  assert.equal(bilanci.length, 1);
  assert.equal(bilanci[0].materie, 0);
  assert.equal(bilanci[0].ricavi, 476906);
  assert.equal(errori.length, 2);
  assert.deepEqual(leggiBilanciUfficiali({}).bilanci, []);
});

test('pareggio: periodo', () => {
  assert.deepEqual(mesiDelPeriodo({ da: '2025-11', a: '2026-02' }).map(m => `${m.anno}-${m.mese}`), ['2025-11', '2025-12', '2026-1', '2026-2']);
  assert.deepEqual(mesiDelPeriodo({ da: '2026-03', a: '2026-02' }), []);
});

test('guida: punto di pareggio', () => {
  assert.equal(cercaGuida('quanto devo fatturare per il pareggio')[0].argomento.id, 'punto-pareggio');
  assert.equal(cercaGuida('bilancino del commercialista')[0].argomento.id, 'punto-pareggio');
});
