import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { addebitiCarta, speseCartaPerMese, bancheBper, soloCarte, collegamentiDaStato, contoDaApi, leggiScelta, tipoCollegamento, tipoUtente, dataInizioScarico, movimentoDaTransazione, oraDiScaricare, statoConsenso, togliGiaPresenti } from '../src/engine/open-banking.js';
import { cosaDaFare } from '../src/engine/cruscotto-generale.js';
import { cercaGuida } from '../src/engine/guida.js';
process.env.DATABASE_URL ??= 'postgres://solo-per-i-test@localhost/nessuno'; // il modulo db non si collega finché non si fanno query
const { gettone, normalizzaChiave } = await import('../src/server/open-banking.js');

test('open banking: transazione dell\'API → movimento come il CSV', () => {
  const m = movimentoDaTransazione({ status: 'BOOK', booking_date: '2026-11-13', value_date: '2026-11-14', transaction_amount: { amount: '1220.00', currency: 'EUR' },
    credit_debit_indicator: 'CRDT', debtor: { name: 'SELEA SRL' }, remittance_information: ['SALDO FT 120/2026'], bank_transaction_code: { description: 'BONIFICO A VOSTRO FAVORE', code: '48' } }, 'IT37B0538765310000003092938');
  assert.deepEqual(m, { data: '2026-11-13', valuta: '2026-11-14', importo: 1220, descrizione: 'BONIFICO A VOSTRO FAVORE · SELEA SRL · SALDO FT 120/2026', causale: '48', rapporto: '3092938' });
  const u = movimentoDaTransazione({ status: 'BOOK', booking_date: '2026-11-12', transaction_amount: { amount: '35.5' }, credit_debit_indicator: 'DBIT', creditor: { name: 'ENEL' } }, '3092938');
  assert.equal(u?.importo, -35.5);
  assert.equal(u?.descrizione, 'ENEL');
  // in attesa o senza importo: non si prende
  assert.equal(movimentoDaTransazione({ status: 'PDNG', booking_date: '2026-11-12', transaction_amount: { amount: '5' }, credit_debit_indicator: 'DBIT' }, '1'), null);
  assert.equal(movimentoDaTransazione({ status: 'BOOK', booking_date: '2026-11-12', transaction_amount: { amount: '0' } }, '1'), null);
});

test('open banking: movimenti già caricati dal CSV non si ripetono (conto, data, importo, conteggi)', () => {
  const nuovi = [
    { rapporto: '3092938', data: '2026-11-10', importo: -2, descrizione: 'a' },
    { rapporto: '3092938', data: '2026-11-10', importo: -2, descrizione: 'b' },
    { rapporto: '3092938', data: '2026-11-11', importo: 100, descrizione: 'c' },
    { rapporto: '3106071', data: '2026-11-10', importo: -2, descrizione: 'd' },
  ];
  const fuori = togliGiaPresenti(nuovi, [{ conto: '000003092938', data: '2026-11-10', importo: -2 }]);
  assert.deepEqual(fuori.map(m => m.descrizione), ['b', 'c', 'd']);
});

test('open banking: da quando scaricare, consenso e ora', () => {
  assert.equal(dataInizioScarico(null, '2026-11-14'), '2026-08-17');
  assert.equal(dataInizioScarico('2026-11-12', '2026-11-14'), '2026-11-07');
  assert.equal(dataInizioScarico('2026-01-01', '2026-11-14'), '2026-08-17');
  const ora = new Date('2026-11-14T08:00:00Z');
  assert.equal(statoConsenso(null, ora).stato, 'mancante');
  assert.equal(statoConsenso('2026-11-10T00:00:00Z', ora).stato, 'scaduto');
  assert.equal(statoConsenso('2026-11-20T00:00:00Z', ora).stato, 'in_scadenza');
  assert.equal(statoConsenso('2027-05-10T00:00:00Z', ora).stato, 'attivo');
  assert.equal(oraDiScaricare({ data: '2026-11-16', ora: '08:30', feriale: true }, null), true);
  assert.equal(oraDiScaricare({ data: '2026-11-16', ora: '08:20', feriale: true }, null), false);
  assert.equal(oraDiScaricare({ data: '2026-11-16', ora: '09:10', feriale: true }, '2026-11-16'), false);
  assert.equal(oraDiScaricare({ data: '2026-11-15', ora: '09:00', feriale: false }, null), false);
});

test('open banking: banche BPER (senza le carte) e gettone firmato', () => {
  const b = bancheBper([{ name: 'BPER Banca Carte' }, { name: 'BPER Banca', psu_types: ['personal', 'business'] }, { name: 'Intesa Sanpaolo' }, { name: 'BPER Banca Smart', psu_types: ['personal'] }]);
  assert.deepEqual(b.map(x => x.name), ['BPER Banca', 'BPER Banca Smart']);
  // modi di accesso: quelli per le aziende + Smart (carta, accesso personale) (elenco vero di Enable Banking del 14/11/2026)
  const conMetodi = bancheBper([{ name: 'BPER Banca', psu_types: ['personal', 'business'], auth_methods: [
    { name: 'SMART', title: 'Servizi digitali Smart', psu_type: 'personal' }, { name: 'CORPORATE', title: 'Corporate Banking', psu_type: 'business' },
    { name: 'DIGITAL_CORPORATE', title: 'Digital Corporate Banking', psu_type: 'business' }] }]);
  assert.deepEqual(conMetodi[0].metodi.map(m => m.name), ['SMART', 'CORPORATE', 'DIGITAL_CORPORATE']);
  assert.deepEqual(leggiScelta('BPER Banca|CORPORATE'), { banca: 'BPER Banca', metodo: 'CORPORATE' });
  assert.deepEqual(leggiScelta(''), { banca: 'BPER Banca', metodo: null });
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const t = gettone(Date.UTC(2026, 10, 14), 'app-123', pem);
  const [h, p, f] = t.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url').toString()), { typ: 'JWT', alg: 'RS256', kid: 'app-123' });
  const corpo = JSON.parse(Buffer.from(p, 'base64url').toString());
  assert.equal(corpo.aud, 'api.enablebanking.com');
  assert.equal(corpo.exp - corpo.iat, 3600);
  assert.ok(crypto.createVerify('RSA-SHA256').update(`${h}.${p}`).verify(publicKey, Buffer.from(f, 'base64url')));
});

test('open banking: chiave incollata su Render senza a capo, con spazi, "\\n" o virgolette', () => {
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const corpo = pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s/g, '');
  for (const v of [pem, pem.replace(/\n/g, ' '), pem.replace(/\n/g, ''), pem.replace(/\n/g, '\\n'), `"${pem.trim()}"`, corpo, pem.replace(/\n/g, '\r\n')]) {
    const k = normalizzaChiave(v)!;
    assert.doesNotThrow(() => crypto.createPrivateKey(k));
    assert.ok(gettone(0, 'app', k).split('.').length === 3);
  }
  assert.equal(normalizzaChiave('  '), null);
  assert.equal(normalizzaChiave(undefined), null);
});

test('open banking: carta di credito BPER e PayPal (Adriano 14/11/2026)', () => {
  // elenco vero di Enable Banking del 14/11/2026: Area Riservata Carte è un accesso da privato, PayPal senza nome del metodo
  const b = bancheBper([{ name: 'PayPal', psu_types: ['business', 'personal'], auth_methods: [{ name: '', psu_type: 'business' } as any] },
    { name: 'BPER Banca', psu_types: ['personal', 'business'], auth_methods: [{ name: 'SMART', psu_type: 'personal' }, { name: 'BPERCARD', title: 'Area Riservata Carte', psu_type: 'personal' },
      { name: 'CORPORATE', title: 'Corporate Banking', psu_type: 'business' }] }]);
  assert.deepEqual(b.map(x => x.name), ['BPER Banca', 'PayPal']);
  assert.deepEqual(b[0].metodi.map(m => m.name), ['SMART', 'BPERCARD', 'CORPORATE']);
  // Adriano 14/11/2026: le carte si vedono entrando con l'accesso personale (Smart)
  assert.match(b[0].metodi[0].titolo, /carta di credito, accesso personale/);
  assert.equal(tipoCollegamento('BPER Banca', 'SMART'), 'carta');
  assert.equal(tipoUtente('SMART'), 'personal');
  assert.deepEqual(soloCarte([{ uid: 'cc', account_id: { iban: 'IT37B0538765310000001234567' } }, { uid: 'k', cash_account_type: 'CARD' }]).map(a => a.uid), ['k']);
  assert.deepEqual(soloCarte([{ uid: 'cc', account_id: { iban: 'IT37B0538765310000001234567' } }, { uid: 'k2' }]).map(a => a.uid), ['k2']);
  assert.match(b[0].metodi[1].titolo, /carta di credito/);
  assert.equal(tipoCollegamento('BPER Banca', 'BPERCARD'), 'carta');
  assert.equal(tipoCollegamento('BPER Banca', 'CORPORATE'), 'conti');
  assert.equal(tipoCollegamento('PayPal', null), 'paypal');
  assert.equal(tipoUtente('BPERCARD'), 'personal');
  assert.equal(tipoUtente('CORPORATE'), 'business');
  assert.equal(contoDaApi({ uid: 'u1', account_id: { iban: 'IT37B0538765310000003092938' } }, 'conti').numero, '3092938');
  assert.equal(contoDaApi({ uid: 'u2', account_id: { other: { identification: '5520 43** **** 1234' } }, name: 'CARTA BUSINESS' }, 'carta').numero, 'CARTA1234');
  assert.equal(contoDaApi({ uid: 'u3', currency: 'EUR' }, 'paypal').numero, 'PAYPAL');
  assert.equal(contoDaApi({ uid: 'u4', currency: 'USD' }, 'paypal').numero, 'PAYPALUSD');
  // stato di prima (un collegamento solo) = conti
  const vecchio = collegamentiDaStato({ sessione: 's1', banca: 'BPER Banca', metodo: 'CORPORATE', scadenza: '2027-05-01', conti: [{ uid: 'u', numero: '3092938' }] });
  assert.equal(vecchio[0].id, 'conti');
  assert.equal(collegamentiDaStato({ collegamenti: [{ id: 'carta', sessione: 's2', conti: [] }, { id: 'paypal', sessione: null }] }).length, 1);
  assert.deepEqual(collegamentiDaStato({}), []);
  // spese di ottobre pagate il 15/11, di novembre (finora) il 15/12; rimborso in meno; addebito già passato fuori
  const a = addebitiCarta([{ data: '2026-09-10', importo: -50 }, { data: '2026-10-03', importo: -120.5 }, { data: '2026-10-20', importo: -79.5 }, { data: '2026-10-21', importo: 20 },
    { data: '2026-11-02', importo: -33 }], '2026-11-14');
  assert.deepEqual(a, [{ mese: '2026-10', data: '2026-11-15', importo: 180, finora: false }, { mese: '2026-11', data: '2026-12-15', importo: 33, finora: true }]);
  assert.equal(addebitiCarta([{ data: '2026-12-05', importo: -10 }], '2026-12-20')[0].data, '2027-01-15');
});

test('open banking: cruscotto e guida', () => {
  const zero = { sdiScartate: 0, sdiNonConsegnate: 0, consegneInRitardo: 0, preventiviDaValidare: 0, ordiniDaAcquisire: 0, acquisizioniInErrore: 0, ddtDaFatturare: 0,
    schedeScansionate: 0, tempiAperti: 0, crmScadute: 0, incassiScaduti: 0, pagamentiScaduti: 0, bozzeDocumenti: 0 } as any;
  assert.equal(cosaDaFare(zero).length, 0);
  assert.equal(cosaDaFare({ ...zero, bancaDaRicollegare: 1 })[0].link, '/amministrazione/banca');
  assert.ok(cercaGuida('collegamento automatico banca').some((x: any) => (x.id ?? x.argomento?.id) === 'banca-collegamento'));
});

test('open banking: spese della carta mese per mese', () => {
  const m = speseCartaPerMese([{ data: '2026-10-03', importo: -120.5 }, { data: '2026-10-20', importo: -79.5 }, { data: '2026-11-02', importo: -10 }, { data: '2026-11-05', importo: 4 },
    { data: '2026-10-30', importo: 3220.55, descrizione: 'TOTALE ACCREDITI' }, { data: '2026-10-31', importo: -3220.55, descrizione: 'TOTALE SPESE' }], '2026-11-14');
  assert.deepEqual(m.map(x => [x.mese, x.importo, x.movimenti, x.data, x.finora]), [['2026-11', 6, 2, '2026-12-15', true], ['2026-10', 200, 2, '2026-11-15', false]]);
});
