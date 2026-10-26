import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chiaveNome, chiavePiva, scadenza, formatta, statoDa, statoDopoImport, trovaCliente, unisciElenco } from '../src/engine/crm.js';

test('crm: nomi confrontati senza punteggiatura e forma giuridica (solo in fondo al nome)', () => {
  assert.equal(chiaveNome('Audioscope 2K s.r.l.'), chiaveNome('AUDIOSCOPE 2K S.R.L.'));
  assert.equal(chiaveNome('C.M.C. S.R.L.'), 'CMC');
  assert.equal(chiaveNome('MECSTAR - SOCIETA A RESPONSABILITA LIMITATA'), 'MECSTAR');
  assert.equal(chiaveNome('PIZZORNO & LINI S.R.L. A SOCIO UNICO'), 'PIZZORNO & LINI');
  assert.equal(chiaveNome('DVG Automation S.p.A.'), 'DVG AUTOMATION');
  assert.equal(chiaveNome('AB ELETTRONICA'), 'AB ELETTRONICA');   // "AB" all'inizio non è una forma giuridica
});

test('crm: partita IVA per il confronto (ultime 11 cifre, altrimenti vuota)', () => {
  assert.equal(chiavePiva('IT 01494460338'), '01494460338');
  assert.equal(chiavePiva('01494460338'), '01494460338');
  assert.equal(chiavePiva('92-1701124'), '');
  assert.equal(chiavePiva(null), '');
});

test('crm: collegamento al cliente in anagrafica prima per P.IVA, poi per nome o alias', () => {
  const clienti = [
    { id: 1, ragione_sociale: 'DVG AUTOMATION S.P.A.', partita_iva: '01494460338' },
    { id: 2, ragione_sociale: 'R TOOLING S.R.L.', partita_iva: null, alias: ['ROLLERI MANUFACTURING SRL'] },
    { id: 3, ragione_sociale: 'SELEA S.R.L.', partita_iva: null },
  ];
  assert.deepEqual(trovaCliente({ ragione_sociale: 'DVG AUTOMANTION SPA', partita_iva: '01494460338' }, clienti), { cliente: clienti[0], come: 'partita_iva' });
  assert.equal(trovaCliente({ ragione_sociale: 'Rolleri Manufacturing S.r.l.' }, clienti)?.cliente.id, 2);
  assert.equal(trovaCliente({ ragione_sociale: 'Selea srl' }, clienti)?.come, 'nome');
  assert.equal(trovaCliente({ ragione_sociale: 'SELEX ES' }, clienti), null);
});

test('crm: scadenza della prossima azione', () => {
  assert.equal(scadenza('2026-10-20', '2026-10-26'), 'scaduta');
  assert.equal(scadenza('2026-10-26', '2026-10-26'), 'oggi');
  assert.equal(scadenza('2026-11-02', '2026-10-26'), 'settimana');
  assert.equal(scadenza('2026-11-03', '2026-10-26'), 'futura');
  assert.equal(scadenza(null, '2026-10-26'), null);
});

test('crm: stato scritto come nel vecchio file Excel', () => {
  assert.equal(statoDa('Offerta inviata'), 'offerta_inviata');
  assert.equal(statoDa('Da contattare'), 'da_contattare');
  assert.equal(statoDa('cliente'), 'cliente');
  assert.equal(statoDa('boh'), null);
  assert.equal(statoDa(''), null);
});

test('crm: scritte uniformi per colonna (le note restano come scritte)', async () => {
  const { iniziali } = await import('../src/engine/crm.js');
  assert.equal(iniziali("REGGIO NELL'EMILIA"), "Reggio nell'Emilia");
  assert.equal(iniziali("castell'arquato"), "Castell'Arquato");
  assert.equal(iniziali("CASSANO D'ADDA"), "Cassano d'Adda");
  assert.equal(iniziali('FRIULI-VENEZIA GIULIA'), 'Friuli-Venezia Giulia');
  assert.equal(iniziali('SAN GIOVANNI LA PUNTA'), 'San Giovanni la Punta');
  assert.equal(formatta('nome', 'SIG. GIUSEPPE RIBOLI'), 'Sig. Giuseppe Riboli');
  assert.equal(formatta('ragione_sociale', 'Audioscope 2K s.r.l.'), 'AUDIOSCOPE 2K S.R.L.');
  assert.equal(formatta('provincia', ' mi '), 'MI');
  assert.equal(formatta('settore', 'AUTOMAZIONE INDUSTRIALE'), 'Automazione industriale');
  assert.equal(formatta('ateco', '262 – FABBRICAZIONE DI COMPUTER'), '262 – Fabbricazione di computer');
  assert.equal(formatta('email', 'R.Terenghi@2BITS.it'), 'r.terenghi@2bits.it');
  assert.equal(formatta('prossima_azione', 'mandare le BOM'), 'Mandare le BOM');
  assert.equal(formatta('note', 'già cliente DVG, sentire  Mario'), 'già cliente DVG, sentire Mario');
  assert.equal(formatta('citta', '   '), null);
});

test('crm: fascia del fatturato medio annuo dei clienti', async () => {
  const { fasciaFatturato, mediaAnnua } = await import('../src/engine/crm.js');
  const anni = [2022, 2023, 2024, 2025];
  assert.equal(mediaAnnua({ 2024: 83_500, 2023: 70_665 }, anni), 38_541.25);   // gli anni senza fatture contano zero
  assert.equal(fasciaFatturato(38_541.25), '20–50 mila €');
  assert.equal(fasciaFatturato(4_999), 'meno di 5 mila €');
  assert.equal(fasciaFatturato(20_000), '20–50 mila €');
  assert.equal(fasciaFatturato(300_000), 'oltre 250 mila €');
  assert.equal(fasciaFatturato(0), 'nessuna fattura');
  assert.equal(mediaAnnua({ 2025: 10 }, []), 0);
});

test('crm: con due partite IVA diverse il nome uguale non collega al cliente', () => {
  const clienti = [{ id: 7, ragione_sociale: 'STEM S.R.L.', partita_iva: '01269760185' }];
  assert.equal(trovaCliente({ ragione_sociale: 'STEM SRL', partita_iva: '01538380344' }, clienti), null);
  assert.equal(trovaCliente({ ragione_sociale: 'STEM SRL' }, clienti)?.cliente.id, 7);
});

test('crm: import che si aggiunge a quello che c\'è (altri nomi, telefoni, email, note, stato)', () => {
  assert.equal(unisciElenco('ACI SRL', 'aci srl | ACI FARFISA'), 'ACI SRL | ACI FARFISA');
  assert.equal(unisciElenco('+39 0523 591992', '0523591992 | 0523 523056'), '+39 0523 591992 | 0523 523056');
  assert.equal(unisciElenco(null, 'info@a.it'), 'info@a.it');
  assert.equal(unisciElenco('Prima riga\nSeconda', 'Seconda\nTerza', '\n'), 'Prima riga\nSeconda\nTerza');
  assert.equal(unisciElenco(null, null), null);
  assert.equal(statoDopoImport('da_contattare', 'non_interessato'), 'non_interessato');
  assert.equal(statoDopoImport('in_trattativa', 'scartato'), 'in_trattativa');
  assert.equal(statoDopoImport('da_contattare', null), 'da_contattare');
  assert.equal(formatta('note', 'riga  uno\n\n  riga due '), 'riga uno\nriga due');
});
