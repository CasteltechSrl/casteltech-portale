import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caricoGiornaliero, consegneDaFare, cruscotto, dateRiga, pianifica, piuLavorativi, residuo, statoOrdine, statoRiga, type RigaOrdine } from '../src/engine/ordini.js';

const riga = (x: Partial<RigaOrdine>): RigaOrdine => ({ id: 1, ordineId: 1, tipo: 'scheda', quantita: 100, prezzo: 10, quantitaSpedita: 0, importoFatturato: 0, ...x });

test('ordini: date come nel foglio (lavorazione = arrivo + 3, prevista = lavorazione + 5 + ritardi, ritardo)', () => {
  const d = dateRiga({ arrivoMateriale: '2026-10-01', ritardiProduzione: 2, consegnaRichiesta: '2026-10-08' });
  assert.equal(d.lavorazione, '2026-10-04');
  assert.equal(d.prevista, '2026-10-11');
  assert.equal(d.ritardo, 3);
  assert.equal(d.consegna, '2026-10-11');
  // date scritte a mano vincono; senza arrivo materiale vale la consegna richiesta
  assert.equal(dateRiga({ arrivoMateriale: '2026-10-01', consegnaPrevista: '2026-10-20' }).prevista, '2026-10-20');
  const s = dateRiga({ consegnaRichiesta: '2026-11-30' });
  assert.equal(s.prevista, null);
  assert.equal(s.ritardo, null);
  assert.equal(s.consegna, '2026-11-30');
});

test('ordini: stato delle schede dalla quantità spedita, servizi evasi con le schede o se fatturati', () => {
  const a = riga({ id: 1, quantitaSpedita: 100 });
  const b = riga({ id: 2, quantitaSpedita: 40 });
  const s = riga({ id: 3, tipo: 'servizio', quantita: 1, prezzo: 150 });
  assert.equal(statoRiga(a, [a, b, s]), 'evaso');
  assert.equal(statoRiga(b, [a, b, s]), 'parziale');
  assert.equal(statoRiga(s, [a, b, s]), 'da_evadere');           // una scheda ancora aperta
  const b2 = { ...b, quantitaSpedita: 100 };
  assert.equal(statoRiga(s, [a, b2, s]), 'evaso');                // tutte le schede evase
  assert.equal(statoRiga({ ...s, importoFatturato: 150 }, [a, b, s]), 'evaso');
  assert.equal(statoRiga({ ...b, statoManuale: 'evaso' }, [a, b, s]), 'evaso');   // decisione dell'ufficio
  assert.equal(statoOrdine(['evaso', 'parziale', 'da_evadere']), 'parziale');
  assert.equal(statoOrdine(['evaso', 'annullato']), 'evaso');
  assert.equal(statoOrdine(['da_evadere']), 'da_evadere');
  assert.deepEqual(residuo(b, 'parziale'), { quantita: 60, valore: 600 });
  assert.deepEqual(residuo(s, 'da_evadere'), { quantita: 1, valore: 150 });
});

test('ordini: consegne a programma, le spedizioni coprono le prime', () => {
  const r = riga({ quantita: 300, prezzo: 2, quantitaSpedita: 150, consegne: [
    { data: '2026-12-15', quantita: 100 }, { data: '2026-10-15', quantita: 100 }, { data: '2026-11-15', quantita: 100 }] });
  assert.deepEqual(consegneDaFare(r, 'parziale'), [{ data: '2026-11-15', quantita: 50, valore: 100 }, { data: '2026-12-15', quantita: 100, valore: 200 }]);
  // senza programma: un'unica consegna alla data della riga
  assert.deepEqual(consegneDaFare(riga({ consegnaRichiesta: '2026-11-30' }), 'da_evadere'), [{ data: '2026-11-30', quantita: 100, valore: 1000 }]);
  assert.deepEqual(consegneDaFare(riga({ quantitaSpedita: 100 }), 'evaso'), []);
});

test('ordini: cruscotto con fatturato, media dei mesi chiusi, da evadere per mese e previsione', () => {
  const fatture = [
    { data: '2026-01-20', imponibile: 1000 }, { data: '2026-03-05', imponibile: 2000 },
    { data: '2026-10-02', imponibile: 500 }, { data: '2026-10-02', imponibile: 0, intestazione: true }, { data: '2025-12-30', imponibile: 9999 }];
  const righe = [
    riga({ id: 1, consegnaRichiesta: '2026-09-30', quantita: 10 }),          // scaduta: va nel mese corrente
    riga({ id: 2, consegnaRichiesta: '2026-12-10', quantita: 20 }),
    riga({ id: 3, consegnaRichiesta: '2027-02-10', quantita: 30 }),
    riga({ id: 4, quantita: 5 }),                                            // senza data
    riga({ id: 5, consegnaRichiesta: '2026-11-10', quantitaSpedita: 100 }),  // evasa
  ];
  const c = cruscotto(fatture, righe, '2026-10-25');
  assert.equal(c.fatturato, 3500);
  assert.equal(c.nMesiChiusi, 9);
  assert.equal(c.mediaMensile, 333.33);          // 3000 € in 9 mesi chiusi
  assert.equal(c.daEvadere, 650);
  assert.equal(c.scaduto, 100);
  assert.equal(c.senzaData, 50);
  assert.equal(c.previsioneAnno, 3500 + 100 + 200);
  const m = Object.fromEntries(c.mesi.map(x => [x.mese, x]));
  assert.equal(m['2026-10'].daEvadere, 100);
  assert.equal(m['2026-10'].fatturato, 500);
  assert.equal(m['2027-02'].daEvadere, 300);
});

test('ordini: Gantt all\'indietro dalla consegna con le ore del preventivo, carico per giorno', () => {
  assert.equal(piuLavorativi('2026-10-23', 1), '2026-10-26');   // venerdì + 1 = lunedì
  assert.equal(piuLavorativi('2026-10-26', -1), '2026-10-23');
  const [b] = pianifica([{ id: 1, etichetta: 'X', quantita: 200, consegna: '2026-11-06', secondiPerScheda: 216 }], '2026-10-25', 8);
  // 200 × 216 s = 12 ore → 2 giorni da 8 ore, finisce giovedì 5/11 (giorno prima della consegna)
  assert.equal(b.ore, 12);
  assert.equal(b.giorni, 2);
  assert.equal(b.fine, '2026-11-05');
  assert.equal(b.inizio, '2026-11-04');
  assert.equal(b.inRitardo, false);
  assert.deepEqual(caricoGiornaliero([b]), { '2026-11-04': 6, '2026-11-05': 6 });
  // consegna di sabato: finisce il venerdì; senza preventivo un giorno stimato; già scaduta = in ritardo
  const [s] = pianifica([{ id: 2, etichetta: 'Y', quantita: 10, consegna: '2026-10-10' }], '2026-10-25');
  assert.equal(s.fine, '2026-10-09');
  assert.equal(s.stimata, true);
  assert.equal(s.inRitardo, true);
  // con la data di lavorazione del foglio si parte da quella
  const [l] = pianifica([{ id: 3, etichetta: 'Z', quantita: 200, consegna: '2026-11-30', lavorazione: '2026-11-07', secondiPerScheda: 216 }], '2026-10-25');
  assert.equal(l.inizio, '2026-11-09');
  assert.equal(l.fine, '2026-11-10');
  assert.equal(pianifica([{ id: 4, etichetta: 'W', quantita: 10, consegna: null }], '2026-10-25').length, 0);
});
