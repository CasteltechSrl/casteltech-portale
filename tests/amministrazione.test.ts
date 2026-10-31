import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aliquotaDaFic, aliquotaRigaFic, annoLetteraIntento, fatturaCitata, preparaDocumentoFic, preparaRicevutoFic, calcolaScadenza, calcolaTotali, condizioneDaFic, controllaDataNumerazione, importoRiga, numeroCompleto,
  preparaAzienda, preparaClienteFiscale, siglaNazione, type Aliquota } from '../src/engine/amministrazione.js';

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

test('clienti da FIC: condizione di pagamento dal metodo e dai giorni', () => {
  assert.deepEqual(condizioneDaFic('RI.BA LPS', 60, true), { codice: 'RB_60FM', descrizione: 'RiBa 60 gg f.m.', modalita: 'MP12', giorni: 60, fine_mese: true });
  assert.equal(condizioneDaFic('Ri.Ba. UNIVAC GROUP SRL', 60, true)!.codice, 'RB_60FM');
  assert.equal(condizioneDaFic('RI.BA CONTROL SYSTEM', 40, true)!.codice, 'RB_40FM');
  assert.equal(condizioneDaFic('RI.BA. A.E.E.', 30, false)!.codice, 'RB_30');
  assert.equal(condizioneDaFic('BONIFICO BANCARIO', 30, true)!.codice, 'BB_30FM');
  assert.equal(condizioneDaFic('BONIFICO BANCARIO', 0, false)!.codice, 'BB_VISTA');
  assert.equal(condizioneDaFic(null, 60, true)!.codice, 'BB_60FM');
  assert.equal(condizioneDaFic('Contanti', 0, false)!.codice, 'CONTANTI');
  assert.equal(condizioneDaFic(null, 0, false), null);
});

test('clienti da FIC: aliquota predefinita dalla descrizione', () => {
  assert.equal(aliquotaDaFic('***ALIQUOTA 22%', 22).codice, null);
  assert.equal(aliquotaDaFic('Non imp. Art.8/c D.P.R. 633/72', 0).codice, 'INTENTO');
  assert.equal(aliquotaDaFic('***Lettera c) per Italia con dichiarazione di intento', 0).codice, 'INTENTO');
  assert.equal(aliquotaDaFic('***Lettera a) per estero trasporto a nostro carico', 0).codice, 'EXPORT');
  assert.equal(aliquotaDaFic('Non imp. art. 41 D.L. 331/93', 0).codice, 'UE_BENI');
  assert.equal(aliquotaDaFic('Non Imp. Art.72, D.P.R. 633/72', 0).codice, 'ART72');
  assert.match(aliquotaDaFic('R.C. art. 74/7-8 rottami e metalli ferrosi e non', 0).avviso!, /non riconosciuta/);
});

test('clienti da FIC: dati fiscali uniformi e avvisi', () => {
  const { cliente: c, avvisi } = preparaClienteFiscale({ ragione_sociale: 'Lps Electronics S.r.l.', partita_iva: 'IT01385430192', indirizzo: 'Via Stazione, 12',
    cap: '26028', comune: 'Sesto ed Uniti', provincia: 'cr', paese: 'Italia', codice_sdi: 'usal8pv', email: 'Laboratorio@LPS.it',
    pagamento: { metodo: 'RI.BA LPS', giorni: 60, fine_mese: true }, iva: { descrizione: 'Non imp. Art.8/c', percentuale: 0 },
    intento: { protocollo: '26021609544759358-000006', data: '2026-02-16' } });
  assert.deepEqual(avvisi, []);
  assert.equal(c.ragione_sociale, 'LPS ELECTRONICS S.R.L.');
  assert.equal(c.partita_iva, '01385430192');
  assert.equal(c.provincia, 'CR');
  assert.equal(c.codice_sdi, 'USAL8PV');
  assert.equal(c.email_amministrazione, 'laboratorio@lps.it');
  assert.equal(c.aliquota_iva, 'INTENTO');
  assert.equal(c.condizione!.codice, 'RB_60FM');
  assert.deepEqual(c.intento, { protocollo: '26021609544759358-000006', data: '2026-02-16' });
  assert.equal(siglaNazione('Stati Uniti'), 'US');
  assert.equal(siglaNazione('Atlantide'), null);
  const estero = preparaClienteFiscale({ ragione_sociale: 'Agilian', paese: 'Cina' });
  assert.equal(estero.cliente.nazione, 'CN');
  assert.deepEqual(estero.avvisi, []);
  const pa = preparaClienteFiscale({ ragione_sociale: 'INFN', codice_sdi: 'E9YBYU', tipo: 'pa' });
  assert.equal(pa.cliente.pubblica_amministrazione, true);
  assert.match(preparaClienteFiscale({ ragione_sociale: 'X', codice_sdi: '12' }).avvisi.join(), /SDI "12" non valido/);
  assert.match(preparaClienteFiscale({ ragione_sociale: 'X', paese: 'Italia' }).avvisi.join(), /cassetto fiscale/);
  // lettere d'intento di dicembre: valgono per l'anno dopo
  assert.equal(annoLetteraIntento('2025-12-17'), 2026);
  assert.equal(annoLetteraIntento('2026-02-16'), 2026);
});

test('storico FIC: aliquota delle righe e fattura citata nelle note di credito', () => {
  assert.equal(aliquotaRigaFic({ descrizione: '***IVA 22%', percentuale: 22 }), 'IVA22');
  assert.equal(aliquotaRigaFic({ descrizione: 'Non imp. Art.8/c D.P.R. 633/72', percentuale: 0 }), 'INTENTO');
  assert.equal(aliquotaRigaFic({ descrizione: 'Non Imp. Art.72, D.P.R. 633/72', percentuale: 0 }), 'ART72');
  assert.equal(aliquotaRigaFic({ percentuale: 5 }), null);
  assert.deepEqual(fatturaCitata('Nota di Credito relativa alla fattura nr. 11/2025 del 31/01/2025'), { numero: 11, anno: 2025 });
  assert.deepEqual(fatturaCitata('Rif. Ns Fattura n.21/2025 del 28/02/2025'), { numero: 21, anno: 2025 });
  assert.deepEqual(fatturaCitata('Nota di Credito a storno parziale Nostra Ft 52 del 30/04/2025'), { numero: 52, anno: 2025 });
  assert.equal(fatturaCitata('CUBE 3 VER. 2.2'), null);
  assert.equal(fatturaCitata('fattura n. 12'), null);   // senza anno non si sa quale
});

test('storico FIC: documento emesso con righe, DDT citato e scadenze', () => {
  const { documento: d, errore } = preparaDocumentoFic({ fic_id: 522350920, tipo: 'fattura', tipo_sdi: 'TD01', sezionale: '', numero: 44, data: '2026-04-30',
    intestatario: { ragione_sociale: 'ARTEL S.R.L.', partita_iva: '00967890344', pec: '' }, totale: 780.8, imponibile: 640, imposta: 140.8, stato_sdi: 'sent',
    pagamento: { modalita: 'MP12' },
    righe: [{ codice: '', descrizione: 'DDT  n. 86 del 27/04/2026', quantita: 1, prezzo: 0, iva: { percentuale: 22 } },
            { codice: 'IMB_595N', descrizione: 'PCBA IMB_595N', quantita: 20, um: 'pezzi', prezzo: 32, iva: { descrizione: 'Iva 22%', percentuale: 22 } }],
    scadenze: [{ data: '2026-06-30', importo: 780.8, stato: 'paid', pagata_il: '2026-07-01', conto: 'Bper' }, { data: '2026-07-31', importo: 1, stato: 'reversed' }] });
  assert.equal(errore, null);
  assert.equal(d!.anno, 2026);
  assert.equal(d!.stato, 'consegnato');
  assert.deepEqual(d!.intestatario, { ragione_sociale: 'ARTEL S.R.L.', partita_iva: '00967890344' });
  assert.deepEqual(d!.righe.map(r => [r.solo_descrizione, r.aliquota_iva]), [[true, null], [false, 'IVA22']]);
  assert.deepEqual(d!.scadenze, [{ data: '2026-06-30', importo: 780.8, pagata_il: '2026-07-01', conto: 'Bper' }]);
  // autofatture: niente scadenze (non si pagano al fornitore); DDT: collegamento alla fattura
  const af = preparaDocumentoFic({ fic_id: 1, tipo: 'autofattura', sezionale: 'af', numero: 95, data: '2025-12-29', scadenze: [{ data: '2025-12-29', importo: 5, stato: 'not_paid' }] });
  assert.equal(af.documento!.sezionale, 'AF');
  assert.deepEqual(af.documento!.scadenze, []);
  const ddt = preparaDocumentoFic({ fic_id: 2, tipo: 'ddt', numero: 101, data: '2025-05-30', fattura_fic_id: 444795325, trasporto: { causale: 'RESO LAVORATO', peso: null },
    righe: [{ codice: 'SL_0107', descrizione: 'PCA SL_0107', quantita: 200, prezzo: 0 }] });
  assert.equal(ddt.documento!.stato, 'emesso');
  assert.equal(ddt.documento!.fattura_fic_id, 444795325);
  assert.deepEqual(ddt.documento!.dati_trasporto, { causale: 'RESO LAVORATO' });
  assert.equal(ddt.documento!.righe[0].solo_descrizione, false);
  const nc = preparaDocumentoFic({ fic_id: 3, tipo: 'nota_credito', numero: 1, data: '2025-02-10', oggetto: 'Nota di Credito relativa alla fattura nr. 11/2025 del 31/01/2025' });
  assert.deepEqual(nc.documento!.fattura_citata, { numero: 11, anno: 2025 });
  assert.match(preparaDocumentoFic({ fic_id: 4, tipo: 'preventivo', numero: 1, data: '2025-01-01' }).errore!, /tipo non previsto/);
  assert.match(preparaDocumentoFic({ fic_id: 4, tipo: 'ddt', numero: 0, data: '2025-01-01' }).errore!, /mancanti/);
});

test('storico FIC: documento ricevuto da un fornitore', () => {
  const { documento: d } = preparaRicevutoFic({ fic_id: 9, tipo: 'fattura', numero: ' FPR 9/26 ', data: '2026-10-11',
    fornitore: { nome: 'TME ITALIA S.R.L.', partita_iva: 'IT04106160163', paese: 'Italia' }, totale: 33.71, elettronica: true,
    scadenze: [{ data: '2026-11-30', importo: 33.71, stato: 'not_paid', pagata_il: null, conto: null }] });
  assert.equal(d!.numero, 'FPR 9/26');
  assert.equal(d!.partita_iva, '04106160163');
  assert.deepEqual(d!.scadenze, [{ data: '2026-11-30', importo: 33.71, pagata_il: null, conto: null }]);
  assert.equal(preparaRicevutoFic({ fic_id: 9, fornitore: { partita_iva: 'DE239975861' }, data: '2026-01-01' }).documento!.partita_iva, 'DE239975861');
  assert.match(preparaRicevutoFic({ fic_id: 9, data: 'ieri' }).errore!, /mancanti/);
});

test('Rate: modo di pagamento solo tra quelli previsti (Adriano 31/10/2026)', async () => {
  const { MODI_PAGAMENTO, modoPagamento } = await import('../src/engine/amministrazione.js');
  for (const m of ['Bonifico', 'Ri.Ba.', 'Bancomat', 'Carta di credito', 'PayPal', 'Compensato con fattura', 'Stornato']) assert.ok(MODI_PAGAMENTO.includes(m as any));
  assert.equal(modoPagamento(' carta  di CREDITO '), 'Carta di credito');
  assert.equal(modoPagamento('paypal'), 'PayPal');
  assert.equal(modoPagamento('Bper'), null);
  assert.equal(modoPagamento(''), null);
});
