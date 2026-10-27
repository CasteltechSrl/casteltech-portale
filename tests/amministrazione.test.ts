import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcolaScadenza, calcolaTotali, controllaDataNumerazione, importoRiga, numeroCompleto, preparaAzienda, type Aliquota } from '../src/engine/amministrazione.js';

const ALIQUOTE: Aliquota[] = [
  { codice: 'IVA22', percentuale: 22, natura: null, soggetta_bollo: false },
  { codice: 'INTENTO', percentuale: 0, natura: 'N3.5', riferimento_normativo: 'Non imponibile art. 8 c. 1 lett. c D.P.R. 633/72', soggetta_bollo: true },
  { codice: 'UE_BENI', percentuale: 0, natura: 'N3.2', soggetta_bollo: false },
];

test('scadenze: giorni, poi fine mese (come Fatture in Cloud)', () => {
  // fattura n. 116 del 09/10/2026, 60 gg f.m. → 31/12/2026
  assert.equal(calcolaScadenza('2026-10-09', { giorni: 60, fine_mese: true }), '2026-12-31');
  // fattura n. 109 del 30/09/2026, 30 gg f.m. → 31/10/2026
  assert.equal(calcolaScadenza('2026-09-30', { giorni: 30, fine_mese: true }), '2026-10-31');
  assert.equal(calcolaScadenza('2026-01-31', { giorni: 30, fine_mese: false }), '2026-03-02');
  assert.equal(calcolaScadenza('2026-12-15', { giorni: 30, fine_mese: true }), '2027-01-31');
  assert.equal(calcolaScadenza('2026-10-27', { giorni: 0, fine_mese: false }), '2026-10-27');
  assert.throws(() => calcolaScadenza('27/10/2026', { giorni: 0, fine_mese: false }));
});

test('importo di riga: quantità × prezzo con sconto, arrotondato al centesimo', () => {
  assert.equal(importoRiga({ quantita: 204, prezzo: 2.1 }), 428.4);
  assert.equal(importoRiga({ quantita: 3, prezzo: 1.115 }), 3.35);
  assert.equal(importoRiga({ quantita: 10, prezzo: 10, sconto: 15 }), 85);
  assert.equal(importoRiga({ quantita: 1, prezzo: 99, solo_descrizione: true }), 0);
});

test('totali: la fattura n. 116 di Fatture in Cloud (IVA 22% + lettera d\'intento)', () => {
  const righe = [
    { quantita: 1, prezzo: 0, solo_descrizione: true },          // DDT n. 195 del 05/10/2026
    { quantita: 4, prezzo: 10 },
    { quantita: 204, prezzo: 2.1, aliquota_iva: 'INTENTO' },
    { quantita: 205, prezzo: 5.5, aliquota_iva: 'INTENTO' },
    { quantita: 4, prezzo: 7 },
  ];
  // senza bollo sulla lettera d'intento i totali sono quelli di FIC: 68 + 14,96 IVA + 1.555,90 non imponibile = 1.638,86
  const senzaBollo = calcolaTotali(righe, ALIQUOTE.map(a => ({ ...a, soggetta_bollo: false })));
  assert.deepEqual(senzaBollo.errori, []);
  assert.deepEqual(senzaBollo.riepilogo.map(g => [g.aliquota, g.imponibile, g.imposta, g.natura]),
    [['IVA22', 68, 14.96, null], ['INTENTO', 1555.9, 0, 'N3.5']]);
  assert.equal(senzaBollo.imponibile, 1623.9);
  assert.equal(senzaBollo.imposta, 14.96);
  assert.equal(senzaBollo.bollo, 0);
  assert.equal(senzaBollo.totale, 1638.86);
  // con la lettera d'intento soggetta a bollo: 2 € in più
  const conBollo = calcolaTotali(righe, ALIQUOTE);
  assert.equal(conBollo.bollo, 2);
  assert.equal(conBollo.totale, 1640.86);
});

test('bollo: solo oltre 77,47 € di importi senza IVA soggetti a bollo', () => {
  assert.equal(calcolaTotali([{ quantita: 1, prezzo: 77.47, aliquota_iva: 'INTENTO' }], ALIQUOTE).bollo, 0);
  assert.equal(calcolaTotali([{ quantita: 1, prezzo: 77.48, aliquota_iva: 'INTENTO' }], ALIQUOTE).bollo, 2);
  // le cessioni intracomunitarie non pagano il bollo
  assert.equal(calcolaTotali([{ quantita: 1, prezzo: 5000, aliquota_iva: 'UE_BENI' }], ALIQUOTE).bollo, 0);
  // l'IVA 22% non conta per il bollo
  assert.equal(calcolaTotali([{ quantita: 1, prezzo: 5000 }], ALIQUOTE).bollo, 0);
});

test('totali: aliquota sconosciuta segnalata, IVA arrotondata sul totale per aliquota', () => {
  assert.match(calcolaTotali([{ quantita: 1, prezzo: 10, aliquota_iva: 'IVA99' }], ALIQUOTE).errori[0], /Riga 1.*IVA99/);
  // 3 righe da 0,35: IVA su 1,05 = 0,231 → 0,23 (non 3 × 0,08)
  const t = calcolaTotali([{ quantita: 1, prezzo: 0.35 }, { quantita: 1, prezzo: 0.35 }, { quantita: 1, prezzo: 0.35 }], ALIQUOTE);
  assert.equal(t.imposta, 0.23);
  assert.equal(t.totale, 1.28);
});

test('numerazione: date in ordine e nello stesso anno', () => {
  assert.equal(controllaDataNumerazione('2026-10-27', 2026, '2026-10-09'), null);
  assert.equal(controllaDataNumerazione('2026-10-09', 2026, '2026-10-09'), null);
  assert.equal(controllaDataNumerazione('2026-01-02', 2026, null), null);
  assert.match(controllaDataNumerazione('2026-10-01', 2026, '2026-10-09')!, /precedente/);
  assert.match(controllaDataNumerazione('2027-01-02', 2026, null)!, /anno 2026/);
  assert.match(controllaDataNumerazione('2026-13-01x', 2026, null)!, /non valida/);
  assert.equal(numeroCompleto(117), '117');
  assert.equal(numeroCompleto(93, 'AF'), '93/AF');
});

test('dati dell\'azienda: scritture uniformi e controlli per la fattura elettronica', () => {
  const { azienda, errori } = preparaAzienda({ ragione_sociale: 'casteltech s.r.l.', partita_iva: '01777320332', codice_fiscale: '01777320332',
    regime_fiscale: 'RF01', indirizzo: 'strada fiorenzuola, 8', cap: '29014', comune: "castell'arquato", provincia: 'pc',
    email: ' Info@Casteltech.NET ', iban: 'it37 b053 8765 3100 0000 3092 938' });
  assert.deepEqual(errori, []);
  assert.equal(azienda.ragione_sociale, 'CASTELTECH S.R.L.');
  assert.equal(azienda.comune, "CASTELL'ARQUATO");
  assert.equal(azienda.provincia, 'PC');
  assert.equal(azienda.email, 'info@casteltech.net');
  assert.equal(azienda.iban, 'IT37B0538765310000003092938');
  assert.equal(azienda.nazione, 'IT');
  const sbagliata = preparaAzienda({ ragione_sociale: '', partita_iva: '123', regime_fiscale: 'RF99', cap: '2901', provincia: 'Piacenza', iban: 'DE89370400440532013000', socio_unico: 'X', rea_numero: '12345' });
  assert.equal(sbagliata.errori.length, 9);
});
