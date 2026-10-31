// Prezzi di prodotti e componenti da Fatture in Cloud (Adriano 31/10/2026). Esempi inventati.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  vociProdotti, vociComponenti, abbinaProdotti, abbinaComponenti, clienteDaCategoria, differenzaPrezzi, leggiPrezzo,
  type ProdottoFic, type DocumentoStorico, type OrdineFornitoreFic,
} from '../src/engine/prezzi-fic.js';

const fattura = (numero: number, data: string, cliente: string, righe: DocumentoStorico['righe']): DocumentoStorico =>
  ({ tipo: 'fattura', numero, data, intestatario: { ragione_sociale: cliente }, righe });
const anag = (id: number, name: string, code: string, net_price: number, updated_at: string | null, category = ''): ProdottoFic =>
  ({ id, name, code, net_price, category, updated_at });

test('prodotti: vale l\'ultima fattura, salvo anagrafica FIC aggiornata dopo', () => {
  const voci = vociProdotti([
    anag(1, 'SCHEDA ALFA', 'AB-100', 10, '2025-01-10'),
    anag(2, 'SCHEDA BETA', 'AB-200', 7, '2026-10-08'),
  ], [
    fattura(5, '2026-03-01', 'ROSSI S.R.L.', [{ codice: 'AB-100', descrizione: 'SCHEDA ALFA', quantita: 100, prezzo: 11 }]),
    fattura(9, '2026-06-01', 'ROSSI S.R.L.', [{ codice: 'AB_100', descrizione: 'SCHEDA ALFA', quantita: 50, prezzo: 12, sconto: 10 }]),
    fattura(3, '2026-02-01', 'ROSSI S.R.L.', [{ codice: 'AB-200', descrizione: 'SCHEDA BETA', quantita: 10, prezzo: 6 }]),
    { tipo: 'nota_credito', numero: 1, data: '2026-07-01', intestatario: { ragione_sociale: 'ROSSI S.R.L.' }, righe: [{ codice: 'AB-100', prezzo: 1 }] },
  ]);
  const alfa = voci.find(v => v.codice.startsWith('AB'))!;
  assert.equal(alfa.prezzo, 10.8);           // 12 con sconto 10 %, fattura 9 (le note di credito non contano)
  assert.equal(alfa.fonte, 'fic_fattura');
  assert.match(alfa.nota, /Fattura 9 del 01\/06\/2026/);
  assert.ok(differenzaPrezzi(alfa));
  const beta = voci.find(v => v.codice === 'AB-200')!;
  assert.equal(beta.prezzo, 7);              // anagrafica aggiornata l'8/10, dopo la fattura di febbraio
  assert.equal(beta.fonte, 'fic_anagrafica');
  assert.equal(beta.cliente, 'ROSSI S.R.L.');
});

test('prodotti: mai fatturati → cliente dalla categoria di FIC, solo se ne somiglia uno', () => {
  const clienti = ['SELTA S.P.A.', 'SELEA S.R.L.', 'TECNOELETTRONICA S.R.L.'];
  assert.equal(clienteDaCategoria('SCHEDA ELETTRONICA SELTA', clienti), 'SELTA S.P.A.');
  assert.equal(clienteDaCategoria('SCHEDA ELETTRONICA TECNOELETTRON', clienti), 'TECNOELETTRONICA S.R.L.');
  assert.equal(clienteDaCategoria('SCHEDA ELETTRONICA SEL', clienti), null);   // due clienti: non si indovina
  assert.equal(clienteDaCategoria('', clienti), null);
  const voci = vociProdotti([anag(3, 'UNITA X', '640-1', 20, null, 'SCHEDA ELETTRONICA SELTA')], [fattura(1, '2026-01-01', 'SELTA S.P.A.', [])]);
  assert.deepEqual(voci.map(v => [v.cliente, v.codice, v.prezzo, v.fonte]), [['SELTA S.P.A.', '640-1', 20, 'fic_anagrafica']]);
});

test('prodotti: il prezzo va sul codice del cliente giusto (regola codice-cliente), mai su quelli scritti a mano', () => {
  const voci = vociProdotti([], [
    fattura(1, '2026-05-01', 'Rossi S.r.l.', [{ codice: 'X1', prezzo: 5 }]),
    fattura(2, '2026-05-02', 'BIANCHI SPA', [{ codice: 'X1', prezzo: 9 }]),
    fattura(3, '2026-05-03', 'VERDI SRL', [{ codice: 'UNICO', prezzo: 3 }, { codice: 'MANO', prezzo: 4 }]),
  ]);
  const prodotti = [
    { id: 10, codice: 'X1', cliente_id: 1, prezzo_fonte: null }, { id: 11, codice: 'X-1', cliente_id: 2, prezzo_fonte: null },
    { id: 12, codice: 'UNICO', cliente_id: 1, prezzo_fonte: null }, { id: 13, codice: 'MANO', cliente_id: 3, prezzo_fonte: 'manuale' },
  ];
  const clienti = [{ id: 1, ragione_sociale: 'ROSSI S.R.L.' }, { id: 2, ragione_sociale: 'BIANCHI S.P.A.' }, { id: 3, ragione_sociale: 'VERDI S.R.L.' }];
  const r = abbinaProdotti(voci, prodotti, clienti, [{ nome: 'BIANCHI SPA', cliente_id: 2 }]);
  const prezzo = (id: number) => r.abbinati.find(a => a.prodotto_id === id)?.voce.prezzo;
  assert.equal(prezzo(10), 5);
  assert.equal(prezzo(11), 9);                // stesso codice, altro cliente (riconosciuto dall'alias)
  assert.equal(prezzo(12), undefined);        // VERDI fattura UNICO ma nel portale UNICO è di ROSSI: non si sposta
  assert.equal(prezzo(13), undefined);        // scritto a mano: non si tocca
  assert.equal(r.manuali, 1);
  // cliente sconosciuto: il codice vale solo se nel portale c'è una volta sola
  const s = abbinaProdotti(vociProdotti([], [fattura(4, '2026-06-01', 'NUOVO SRL', [{ codice: 'UNICO', prezzo: 2 }, { codice: 'X1', prezzo: 2 }])]), prodotti, clienti);
  assert.deepEqual(s.abbinati.map(a => [a.prodotto_id, a.comeTrovato]), [[12, 'solo codice']]);
});

test('componenti: ultimo ordine a fornitore per P/N, in euro, senza trasporti e lamine', () => {
  const ordine = (id: number, date: string, fornitore: string, items: any[], currency = { id: 'EUR', exchange_rate: '1' }): OrdineFornitoreFic =>
    ({ id, date, number: id, entity: { name: fornitore }, currency, items_list: items });
  const voci = vociComponenti([
    ordine(1, '2026-01-10', 'MOUSER', [{ name: 'CRCW06030000Z0EC', code: '', qty: 500, net_price: 0.01 }]),
    ordine(2, '2026-09-01', 'DIGIKEY', [{ name: 'CRCW0603-0000Z0EC', code: '', qty: 1000, net_price: 0.008 }, { name: 'Trasporto', qty: 1, net_price: 20 }]),
    ordine(3, '2026-05-01', 'LCSC', [{ name: 'GRM188R71H104KA93D', code: 'CC-0603-100NF-10-X7R-50V', qty: 4000, net_price: 0.0022 }], { id: 'USD', exchange_rate: '1.1' }),
    ordine(4, '2026-06-01', 'TECNOLAB', [{ name: 'LAMINA SERIGRAFICA', code: '001', qty: 1, net_price: 70 }]),
  ]);
  assert.equal(voci.length, 2);
  const r0 = voci.find(v => v.fornitore === 'DIGIKEY')!;
  assert.equal(r0.prezzo, 0.008);
  assert.equal(r0.quantita, 1000);
  const usd = voci.find(v => v.fornitore === 'LCSC')!;
  assert.equal(usd.prezzo, 0.002);            // 0,0022 $ / 1,1
  const r = abbinaComponenti(voci, [
    { id: 1, pn_key: 'CRCW06030000Z0EC', codice_produzione: 'RS-0603-0R-5-100MW', codice_gestionale: null, prezzo_fonte: null },
    { id: 2, pn_key: 'ALTROPN', codice_produzione: 'CC-0603-100NF-10-X7R-50V', codice_gestionale: 'SCC-0603-100N-001', prezzo_fonte: null },
    { id: 3, pn_key: 'GRM188R71H104KA93D', codice_produzione: null, codice_gestionale: null, prezzo_fonte: 'manuale' },
  ]);
  assert.deepEqual(r.abbinati.map(a => [a.componente_id, a.voce.fornitore]).sort(), [[1, 'DIGIKEY'], [2, 'LCSC']]);
  assert.equal(r.manuali, 1);
});

test('prezzo scritto a mano: virgola, punto, euro', () => {
  assert.equal(leggiPrezzo('12,50'), 12.5);
  assert.equal(leggiPrezzo('12.5'), 12.5);
  assert.equal(leggiPrezzo('€ 1.234,5'), 1234.5);
  assert.equal(leggiPrezzo(''), null);
  assert.ok(Number.isNaN(leggiPrezzo('abc')));
  assert.ok(Number.isNaN(leggiPrezzo('-3')));
});
