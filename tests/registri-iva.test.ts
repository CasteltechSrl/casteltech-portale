import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aliquotaDedotta, codiceTributoIva, controlliRegistro, liquidazione, liquidazioniMensili, meseDaLiquidare, scadenzaVersamentoIva, numeriMancanti, periodoDa, protocolla, riepilogoDaXml, riepilogoDocumento, riepilogoRegistro, type RigaRegistro,
} from '../src/engine/registri-iva.js';
import { cercaGuida } from '../src/engine/guida.js';
import { esitoVies, partitaIvaPerVies, statoControllo } from '../src/engine/vies.js';

const ALIQUOTE = [
  { codice: 'IVA22', percentuale: 22, natura: null, soggetta_bollo: false },
  { codice: 'INTENTO', percentuale: 0, natura: 'N3.5', soggetta_bollo: true },
  { codice: 'UE_BENI', percentuale: 0, natura: 'N3.2', soggetta_bollo: false },
];

test('registri IVA: periodo da mese, trimestre o anno (febbraio bisestile, trimestre di oggi se manca)', () => {
  assert.deepEqual(periodoDa(2028, 'M02'), { codice: 'M02', tipo: 'mese', anno: 2028, dal: '2028-02-01', al: '2028-02-29', nome: 'febbraio 2028' });
  assert.equal(periodoDa(2026, 'T4').al, '2026-12-31');
  assert.equal(periodoDa(2026, 'A').dal, '2026-01-01');
  assert.equal(periodoDa(2026, undefined, '2026-10-31').codice, 'M10');
  assert.equal(periodoDa(2026, undefined, '2026-11-10').codice, 'M10');
  assert.equal(periodoDa(2025, undefined, '2026-01-10').codice, 'M12');
  assert.equal(periodoDa(2025, 'boh', '2026-10-31').codice, 'T1');
  assert.deepEqual(meseDaLiquidare('2026-01-16'), { anno: 2025, codice: 'M12' });
  assert.deepEqual(meseDaLiquidare('2026-01-17'), { anno: 2026, codice: 'M01' });
});

test('registri IVA: riepilogo dal file FatturaPA (anche con più aliquote e nature), vince sulle righe', () => {
  const xml = `<p:FatturaElettronica><FatturaElettronicaBody><DatiBeniServizi>
    <DatiRiepilogo><AliquotaIVA>22.00</AliquotaIVA><ImponibileImporto>1000.00</ImponibileImporto><Imposta>220.00</Imposta></DatiRiepilogo>
    <DatiRiepilogo><AliquotaIVA>0.00</AliquotaIVA><Natura>N3.5</Natura><ImponibileImporto>500.00</ImponibileImporto><Imposta>0.00</Imposta></DatiRiepilogo>
    <DatiRiepilogo><AliquotaIVA>22.00</AliquotaIVA><ImponibileImporto>10.00</ImponibileImporto><Imposta>2.20</Imposta></DatiRiepilogo>
  </DatiBeniServizi></FatturaElettronicaBody></p:FatturaElettronica>`;
  assert.deepEqual(riepilogoDaXml(xml), [
    { codice: '22%', percentuale: 22, natura: null, imponibile: 1010, imposta: 222.2 },
    { codice: 'N3.5', percentuale: 0, natura: 'N3.5', imponibile: 500, imposta: 0 },
  ]);
  const r = riepilogoDocumento({ imponibile: 1510, imposta: 222.2, xml, righe: [{ quantita: 1, prezzo: 1510 }] }, ALIQUOTE);
  assert.equal(r.voci.length, 2);
  assert.equal(r.differenza, false);
});

test('registri IVA: riepilogo dalle righe con l\'aliquota del cliente; se non torna con i totali vincono i totali', () => {
  const daRighe = riepilogoDocumento({ imponibile: 300, imposta: 22, aliquotaPredefinita: 'INTENTO',
    righe: [{ quantita: 2, prezzo: 50, aliquota_iva: 'IVA22' }, { quantita: 1, prezzo: 200 }, { quantita: 0, prezzo: 0, solo_descrizione: true }] }, ALIQUOTE);
  assert.deepEqual(daRighe.voci.map(v => [v.codice, v.imponibile, v.imposta]), [['22%', 100, 22], ['N3.5', 200, 0]]);
  const storico = riepilogoDocumento({ imponibile: 1000, imposta: 220, righe: [{ quantita: 1, prezzo: 900 }] }, ALIQUOTE);
  assert.deepEqual(storico, { voci: [{ codice: '22%', percentuale: 22, natura: null, imponibile: 1000, imposta: 220 }], differenza: true });
  assert.equal(riepilogoDocumento({ imponibile: 100, imposta: 14 }, ALIQUOTE).voci[0].codice, 'mista');
  assert.equal(aliquotaDedotta(1000, 100), 10);
  assert.equal(aliquotaDedotta(1000, 0), 0);
  assert.equal(aliquotaDedotta(1000, 140), null);
});

const riga = (x: Partial<RigaRegistro>): RigaRegistro => ({
  id: 1, registro: 'vendite', protocollo: null, tipo: 'fattura', tipoSdi: 'TD01', numero: '1', data: '2026-11-05', nome: 'CLIENTE', partitaIva: '01234567890',
  paese: 'IT', imponibile: 1000, imposta: 220, totale: 1220, voci: [{ codice: '22%', percentuale: 22, natura: null, imponibile: 1000, imposta: 220 }],
  differenza: false, origine: 'portale', link: '', ...x,
});

test('registri IVA: note di credito in negativo, riepilogo per aliquota e liquidazione con le autofatture a debito e a credito', () => {
  const vendite = [riga({}), riga({ id: 2, tipo: 'nota_credito', imponibile: 100, imposta: 22, totale: 122, voci: [{ codice: '22%', percentuale: 22, natura: null, imponibile: 100, imposta: 22 }] }),
    riga({ id: 3, imponibile: 500, imposta: 0, totale: 502, voci: [{ codice: 'N3.5', percentuale: 0, natura: 'N3.5', imponibile: 500, imposta: 0 }] })];
  const r = riepilogoRegistro(vendite);
  assert.deepEqual(r.voci.map(v => [v.codice, v.imponibile, v.imposta, v.documenti]), [['22%', 900, 198, 2], ['N3.5', 500, 0, 1]]);
  assert.equal(r.totale, 1600);
  const acquisti = [riga({ registro: 'acquisti', imponibile: 400, imposta: 88, voci: [] })];
  const autofatture = [riga({ registro: 'autofatture', tipo: 'autofattura', imponibile: 300, imposta: 66, voci: [] })];
  assert.deepEqual(liquidazione(vendite, acquisti, autofatture),
    { splitPayment: 0, debitoVendite: 198, debitoAutofatture: 66, creditoAcquisti: 88, creditoAutofatture: 66, debito: 264, credito: 154, saldo: 110 });
});

test('registri IVA: protocollo degli acquisti in ordine di data, numeri mancanti nella serie e segnalazioni', () => {
  assert.deepEqual(protocolla([{ id: 5, data: '2026-02-01' }, { id: 3, data: '2026-01-10' }, { id: 4, data: '2026-01-10' }]).map(x => [x.id, x.protocollo]), [[3, 1], [4, 2], [5, 3]]);
  assert.deepEqual(numeriMancanti([1, 2, 4, 7]), [3, 5, 6]);
  assert.deepEqual(numeriMancanti([]), []);
  const c = controlliRegistro({ vendite: [riga({ differenza: true })], acquisti: [riga({ registro: 'acquisti', partitaIva: '' })], autofatture: [],
    mancanti: [{ serie: 'Fatture 2026', numeri: [3] }], scartati: [{ numero: '9', data: '2026-11-03' }], bozzeNelPeriodo: 2 });
  assert.equal(c.length, 5);
  assert.match(c[0], /Fatture 2026: mancano i numeri 3/);
  assert.match(c[1], /scartata dallo SdI/);
  assert.match(c[2], /2 bozze/);
});

test('VIES: partita IVA da controllare solo se di un altro paese UE (prefisso o paese dell\'anagrafica, Grecia = EL)', () => {
  assert.deepEqual(partitaIvaPerVies('DE 811 193 231'), { paese: 'DE', numero: '811193231' });
  assert.deepEqual(partitaIvaPerVies('811193231', 'DE'), { paese: 'DE', numero: '811193231' });
  assert.deepEqual(partitaIvaPerVies('094014298', 'GRECIA'), { paese: 'EL', numero: '094014298' });
  assert.deepEqual(partitaIvaPerVies('EL094014298'), { paese: 'EL', numero: '094014298' });
  assert.equal(partitaIvaPerVies('01777320332', 'IT'), null);
  assert.equal(partitaIvaPerVies('IT01777320332'), null);
  assert.equal(partitaIvaPerVies('CHE123456789', 'SVIZZERA'), null);
  assert.equal(partitaIvaPerVies('123456', 'STATI UNITI'), null);
});

test('VIES: esito della risposta (valida con numero di consultazione, non valida, servizio del paese che non risponde)', () => {
  assert.deepEqual(esitoVies({ countryCode: 'DE', vatNumber: '811193231', valid: true, name: '---', address: '---', requestIdentifier: 'WAPIAAAAZ', requestDate: '2026-10-31T14:15:15.065Z' }),
    { valida: true, nome: null, indirizzo: null, consultazione: 'WAPIAAAAZ', data: '2026-10-31', errore: null });
  assert.equal(esitoVies({ valid: false, name: '---' }).valida, false);
  const e = esitoVies({ actionSucceed: false, errorWrappers: [{ error: 'MS_UNAVAILABLE' }] });
  assert.equal(e.valida, null);
  assert.match(e.errore!, /non risponde/);
  assert.equal(esitoVies({ isValid: false, userError: 'MS_MAX_CONCURRENT_REQ' }).valida, null);
  const oggi = new Date('2026-10-31T12:00:00Z');
  assert.equal(statoControllo(null, oggi).stato, 'mai');
  assert.equal(statoControllo({ valida: true, controllato_il: '2026-10-01T10:00:00Z' }, oggi).stato, 'valida');
  assert.equal(statoControllo({ valida: true, controllato_il: '2026-06-01T10:00:00Z' }, oggi).stato, 'scaduta');
  assert.equal(statoControllo({ valida: false, controllato_il: '2026-10-30T10:00:00Z' }, oggi).stato, 'non_valida');
});

test('guida: registri IVA e controllo VIES', () => {
  for (const [q, id] of [['registro iva', 'registri-iva'], ['quanta iva devo versare', 'registri-iva'], ['file per il commercialista', 'registri-iva'],
    ['controllare partita iva europea', 'vies'], ['vies', 'vies'], ['scadenza f24 iva', 'registri-iva'], ['codice tributo iva mensile', 'registri-iva']])
    assert.ok(cercaGuida(q).slice(0, 2).some(r => r.argomento.id === id), q);
});

test('registri IVA: split payment (fatture alla PA) nel registro ma non a debito nella liquidazione', () => {
  const xml = '<DatiRiepilogo><AliquotaIVA>22.00</AliquotaIVA><ImponibileImporto>1000.00</ImponibileImporto><Imposta>220.00</Imposta><EsigibilitaIVA>S</EsigibilitaIVA></DatiRiepilogo>';
  const daXml = riepilogoDocumento({ imponibile: 1000, imposta: 220, xml }, ALIQUOTE);
  assert.deepEqual(daXml.voci, [{ codice: '22% split payment', percentuale: 22, natura: null, imponibile: 1000, imposta: 220, splitPayment: true }]);
  const daRighe = riepilogoDocumento({ imponibile: 100, imposta: 22, righe: [{ quantita: 1, prezzo: 100 }], splitPayment: true }, ALIQUOTE);
  assert.equal(daRighe.voci[0].splitPayment, true);
  const l = liquidazione([riga({}), riga({ id: 2, voci: daXml.voci, imposta: 220 })], [], []);
  assert.equal(l.splitPayment, 220);
  assert.equal(l.debitoVendite, 220);
  assert.equal(riepilogoRegistro([riga({ voci: daXml.voci })]).voci[0].codice, '22% split payment');
});

test('liquidazione IVA mensile (Adriano 31/10/2026): credito riportato, sotto 25,82 € rinviata, 16 del mese dopo con il codice tributo', () => {
  assert.equal(scadenzaVersamentoIva(2026, 10), '2026-11-16');
  assert.equal(scadenzaVersamentoIva(2026, 7), '2026-08-20');
  assert.equal(scadenzaVersamentoIva(2026, 12), '2027-01-18'); // il 16/1/2027 è sabato
  assert.equal(codiceTributoIva(1), '6001');
  assert.equal(codiceTributoIva(12), '6012');
  const v = (mese: string, imposta: number) => riga({ data: `2026-${mese}-10`, imposta, voci: [] });
  const a = (mese: string, imposta: number) => riga({ registro: 'acquisti', data: `2026-${mese}-12`, imposta, voci: [] });
  const m = liquidazioniMensili(2026, 4, [v('01', 100), v('02', 300), v('03', 20), v('04', 500)], [a('01', 250), a('03', 0)], [], 30);
  assert.deepEqual(m.map(x => [x.mese, x.riporto, x.risultato, x.daVersare, x.creditoRiportato, x.rinviata]), [
    [1, -30, -180, 0, 180, 0],     // credito dell'anno prima 30 + credito del mese 150
    [2, -180, 120, 120, 0, 0],     // 300 - 180 di credito = 120 da versare
    [3, 0, 20, 0, 0, 20],          // 20 €: sotto il minimo, rinviata
    [4, 20, 520, 520, 0, 0],       // 500 + 20 rinviati
  ]);
  assert.equal(m[1].codiceTributo, '6002');
  assert.equal(m[1].scadenza, '2026-03-16');
});
