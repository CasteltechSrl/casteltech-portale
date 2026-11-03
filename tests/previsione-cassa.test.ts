import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bandaIncassi, comprendeDicembre, dateUscita, euro, finestraDi, leggiImpostazioniCassa, mediaUltimi, numeroScritto, previsioneCassa, ritardiIncasso, usciteFisse,
  type IncassoStorico,
} from '../src/engine/previsione-cassa.js';
import { cercaGuida } from '../src/engine/guida.js';

const oggi = '2026-11-03';
const inc = (cliente: string, scadenza: string, incassata: string, importo = 1000, dataFattura = '2026-08-31'): IncassoStorico =>
  ({ cliente, dataFattura, scadenza, incassata, importo });

test('cassa: finestre 0–30, 31–60, 61–90 compresi, poi oltre', () => {
  assert.equal(finestraDi('2026-11-03', oggi), 'f30');
  assert.equal(finestraDi('2026-12-03', oggi), 'f30');   // 30 giorni
  assert.equal(finestraDi('2026-12-04', oggi), 'f60');   // 31
  assert.equal(finestraDi('2027-01-02', oggi), 'f60');   // 60
  assert.equal(finestraDi('2027-01-03', oggi), 'f90');   // 61
  assert.equal(finestraDi('2027-02-01', oggi), 'f90');   // 90
  assert.equal(finestraDi('2027-02-02', oggi), 'oltre');
});

test('cassa: ritardo dei clienti pesato sull\'importo, banda tra 0 e 50 % (30 % senza storico)', () => {
  const r = ritardiIncasso([inc('A', '2026-09-30', '2026-10-10', 3000), inc('A', '2026-08-31', '2026-08-31', 1000)]);
  assert.equal(r.perCliente.get('A')!.n, 2);
  assert.equal(r.media, 7.5);            // (10×3000 + 0×1000) / 4000
  assert.equal(r.perCliente.get('A')!.max, 10);
  assert.equal(bandaIncassi(10, null), 0.3);
  assert.equal(bandaIncassi(100, 40), 0.5);
  assert.equal(bandaIncassi(8, 40), 0.2);
});

test('cassa: incasso = scadenza + ritardo del cliente (con almeno 3 incassi), altrimenti la media; mai prima di oggi', () => {
  const storico = [
    inc('LENTO', '2026-06-30', '2026-07-20'), inc('LENTO', '2026-07-31', '2026-08-20'), inc('LENTO', '2026-08-31', '2026-09-20'),  // 20 gg
    inc('NUOVO', '2026-09-30', '2026-09-30'),                                                                                  // 1 solo incasso
  ];
  const p = previsioneCassa({ oggi, saldo: null, storico, pagamenti: [], fisse: [], puntuali: [], rate: [
    { cliente: 'LENTO', numero: '1/2026', scadenza: '2026-11-30', importo: 1000 },
    { cliente: 'NUOVO', numero: '2/2026', scadenza: '2026-11-30', importo: 500 },
    { cliente: 'LENTO', numero: '3/2026', scadenza: '2026-10-31', importo: 200 },     // scaduta: già oltre oggi + ritardo? 31/10 + 20 = 20/11
    { cliente: 'NUOVO', numero: '4/2026', scadenza: '2026-09-30', importo: 100 },     // scaduta da molto → oggi
  ] });
  const per = (n: string) => p.movimenti.find(m => m.riferimento === n)!;
  assert.equal(per('1/2026').data, '2026-12-20');
  assert.equal(per('1/2026').finestra, 'f60');
  assert.equal(per('2/2026').ritardo, Math.round(p.ritardoGenerale));   // media di tutti
  assert.equal(per('3/2026').data, '2026-11-20');
  assert.equal(per('4/2026').data, oggi);
  assert.ok(per('4/2026').scaduta);
  assert.equal(p.clienti.find(c => c.cliente === 'NUOVO')!.daStorico, false);
});

test('cassa: note di credito tolgono, fornitori scaduti vanno a oggi, saldo e cassa a fine finestra', () => {
  const p = previsioneCassa({ oggi, saldo: { importo: 10_000, data: oggi }, storico: [], fisse: [], puntuali: [],
    rate: [{ cliente: 'A', numero: '1', scadenza: '2026-11-10', importo: 3000 }, { cliente: 'A', numero: 'NC 1', scadenza: '2026-11-10', importo: -500 }],
    pagamenti: [{ fornitore: 'F', numero: 'X', scadenza: '2026-10-05', importo: 1200 }, { fornitore: 'F', numero: 'Y', scadenza: '2026-12-20', importo: 800 }] });
  const [f30, f60, f90] = p.finestre;
  assert.equal(f30.incassi, 2500);
  assert.equal(f30.pagamenti, -1200);
  assert.equal(p.movimenti.find(m => m.riferimento === 'X')!.data, oggi);
  assert.equal(f60.pagamenti, -800);
  assert.equal(f30.cassaFine, 11_300);
  assert.equal(f60.cassaFine, 10_500);
  assert.equal(f90.cassaFine, 10_500);
  assert.ok(p.rischi.some(r => /fornitori/.test(r.testo) && /scadenza passata/.test(r.testo)));
});

test('cassa: uscite fisse ogni mese, IVA alla scadenza di legge, l\'uscita vera prende il posto della stima', () => {
  assert.deepEqual(dateUscita({ chiave: 'stipendi', giorno: 10 }, oggi), ['2026-11-10', '2026-12-10', '2027-01-10']);
  assert.deepEqual(dateUscita({ chiave: 'altro', giorno: 31 }, oggi), ['2026-11-30', '2026-12-31', '2027-01-31']);
  assert.deepEqual(dateUscita({ chiave: 'iva', giorno: 16 }, oggi), ['2026-11-16', '2026-12-16', '2027-01-18']);   // 16/1/2027 è sabato
  assert.deepEqual(dateUscita({ chiave: 'iva', giorno: 16 }, '2026-07-25'), ['2026-08-20', '2026-09-16', '2026-10-16']);   // luglio → 20 agosto
  const p = previsioneCassa({ oggi, saldo: null, rate: [], storico: [], pagamenti: [],
    fisse: [{ chiave: 'f24', voce: 'F24 stima', importo: 3000, giorno: 16, stima: true }],
    puntuali: [{ chiave: 'f24', voce: 'F24 vero', data: '2026-11-16', importo: 3400 }] });
  const f24 = p.movimenti.filter(m => m.tipo === 'uscita');
  assert.deepEqual(f24.map(m => [m.data, m.importo]), [['2026-11-16', -3400], ['2026-12-16', -3000], ['2027-01-16', -3000]]);
});

test('cassa: punto più basso e cassa sotto zero = critico', () => {
  const p = previsioneCassa({ oggi, saldo: { importo: 2000, data: oggi }, storico: [], puntuali: [],
    rate: [{ cliente: 'A', numero: '1', scadenza: '2026-11-30', importo: 5000 }],
    pagamenti: [{ fornitore: 'F', numero: 'X', scadenza: '2026-11-15', importo: 3000 }],
    fisse: [{ chiave: 'stipendi', voce: 'Stipendi netti', importo: 1000, giorno: 10 }] });
  assert.deepEqual(p.puntoMinimo, { data: '2026-11-15', cassa: -2000 });
  assert.equal(p.rischi[0].livello, 'critico');
});

test('cassa: avvisi su saldo mancante o vecchio, stipendi mancanti, tredicesima, cliente che pesa troppo', () => {
  const p = previsioneCassa({ oggi, saldo: null, storico: [], pagamenti: [], fisse: [], puntuali: [],
    rate: [{ cliente: 'GRANDE', numero: '1', scadenza: '2026-11-30', importo: 20_000 }, { cliente: 'PICCOLO', numero: '2', scadenza: '2026-11-30', importo: 1000 }] });
  const testi = p.rischi.map(r => r.testo).join('\n');
  assert.match(testi, /Manca il saldo/);
  assert.match(testi, /Stipendi non indicati/);
  assert.match(testi, /tredicesima/);
  assert.match(testi, /GRANDE vale 95 %/);
  const vecchio = previsioneCassa({ oggi, saldo: { importo: 1, data: '2026-10-20' }, rate: [], storico: [], pagamenti: [], puntuali: [],
    fisse: [{ chiave: 'stipendi', voce: 'Stipendi', importo: 1, giorno: 10 }, { chiave: 'altro', voce: 'Tredicesima', importo: 1, giorno: 15 }] });
  assert.match(vecchio.rischi.map(r => r.testo).join('\n'), /14 giorni fa/);
  assert.doesNotMatch(vecchio.rischi.map(r => r.testo).join('\n'), /Stipendi non indicati|tredicesima/);
  assert.equal(comprendeDicembre('2026-11-03'), true);
  assert.equal(comprendeDicembre('2026-06-01'), false);
  assert.equal(comprendeDicembre('2026-12-20'), false);
});

test('cassa: euro con il punto delle migliaia anche sotto 10.000 e in negativo', () => {
  assert.equal(euro(4299.4), '4.299 €');
  assert.equal(euro(-4299), '-4.299 €');
  assert.equal(euro(999), '999 €');
  assert.equal(euro(1234567), '1.234.567 €');
});

test('cassa: impostazioni scritte all\'italiana, vuoto = automatico (stima), altre uscite', () => {
  assert.equal(numeroScritto('12.500,50'), 12500.5);
  assert.equal(numeroScritto('1.500'), 1500);
  assert.equal(numeroScritto('1500.5'), 1500.5);
  assert.equal(numeroScritto(''), null);
  const i = leggiImpostazioniCassa({ saldo: '-1.200,00', dataSaldo: '2026-11-03', stipendi: '', giornoStipendi: '40', f24: '3.100', iva: '',
    altre: [{ voce: 'Affitto', importo: '1.800', giorno: '5' }, { voce: '', importo: '10', giorno: '1' }] });
  assert.equal(i.saldo, -1200);
  assert.equal(i.giornoStipendi, 10);       // giorno non valido → predefinito
  assert.deepEqual(i.altre, [{ voce: 'Affitto', importo: 1800, giorno: 5 }]);
  const u = usciteFisse(i, { stipendi: 9000, stipendiDa: 'x', f24: 2500, f24Da: 'y', iva: null, ivaDa: null });
  assert.deepEqual(u.map(x => [x.chiave, x.importo, !!x.stima]), [['stipendi', 9000, true], ['f24', 3100, false], ['altro', 1800, false]]);
  assert.equal(mediaUltimi([0, 1000, 2000, 3000, 0]), 2000);
  assert.equal(mediaUltimi([0, 0]), null);
});

test('guida: la previsione di cassa si trova', () => {
  assert.equal(cercaGuida('previsione di cassa')[0]?.argomento.id, 'previsione-cassa');
  assert.equal(cercaGuida('ce la faccio a pagare gli stipendi')[0]?.argomento.id, 'previsione-cassa');
});
