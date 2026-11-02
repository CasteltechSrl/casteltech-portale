import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fonteRiga, leggiElencoComponentiCliente, rigaComponenteNostro, testoDaFile } from '../src/engine/componenti-clienti.js';

test('Componenti clienti: elenco con intestazione (Idea: Cod, Descrizione, DescrSFam, DescrGruppo), tutto MAIUSCOLO, ultimo vince', () => {
  const { componenti, scartate } = leggiElencoComponentiCliente([
    ['Cod', 'Descrizione', 'DescrSFam', 'DescrGruppo'],
    ['alm0001', 'DC/DC converter  24V', 'ALIMENTATORI - DC/DC', 'TRADIZIONALE'],
    ['', 'riga senza codice', '', ''],
    ['CI0206', 'C.I. STM32G0B1K-B-TC\n', 'CIRCUITO INTEGRATO', 'SMD'],
    ['ALM0001', 'DC/DC CONVERTER 24V AIMTEC', 'ALIMENTATORI - DC/DC', 'TRADIZIONALE'],
  ]);
  assert.equal(scartate, 1);
  assert.deepEqual(componenti, [
    { codice: 'ALM0001', descrizione: 'DC/DC CONVERTER 24V AIMTEC', famiglia: 'ALIMENTATORI - DC/DC', gruppo: 'TRADIZIONALE' },
    { codice: 'CI0206', descrizione: 'C.I. STM32G0B1K-B-TC', famiglia: 'CIRCUITO INTEGRATO', gruppo: 'SMD' },
  ]);
});

test('Componenti clienti: elenco senza titoli veri (Selea: Colonna1;Colonna2;Colonna3) = codice e descrizione', () => {
  const { componenti } = leggiElencoComponentiCliente([
    ['Colonna1', 'Colonna2', 'Colonna3'],
    ['CSC100n716VM', 'C SMD CER 100nF 10% X7R 16V 0402', 'SELEA'],
  ]);
  assert.deepEqual(componenti, [{ codice: 'CSC100N716VM', descrizione: 'C SMD CER 100NF 10% X7R 16V 0402', famiglia: null, gruppo: null }]);
  // senza nessuna intestazione la prima riga è già un codice
  assert.equal(leggiElencoComponentiCliente([['RST10KF0402', 'R SMD 10K']]).componenti[0].codice, 'RST10KF0402');
});

test('Componenti clienti: CSV di Excel italiano (Windows-1252) letto con gli accenti', () => {
  assert.equal(testoDaFile(new Uint8Array([0x2d, 0x34, 0x30, 0x20, 0x2b, 0x31, 0x30, 0x35, 0xb0, 0x43])), '-40 +105°C');
  assert.equal(testoDaFile(new TextEncoder().encode('﻿codice;descrizione')), 'codice;descrizione');
});

test('DDT: componente nostro = codice gestionale, descrizione "P/N (codice produzione)"', () => {
  assert.deepEqual(rigaComponenteNostro({ pn: 'grm155r71c104ka88d', codice_gestionale: 'SCC-0402-100N-001', codice_produzione: 'CC-0402-100N-X7R-16V' }),
    { codice: 'SCC-0402-100N-001', descrizione: 'GRM155R71C104KA88D (CC-0402-100N-X7R-16V)' });
  assert.deepEqual(rigaComponenteNostro({ pn: null, codice_gestionale: null, codice_produzione: 'RS-0603-2K2-1-100MW', descrizione: 'resistenza' }),
    { codice: 'RS-0603-2K2-1-100MW', descrizione: 'RS-0603-2K2-1-100MW' });
});

test('DDT: fonte della riga scelta o dedotta per le righe vecchie', () => {
  assert.equal(fonteRiga({ fonte: 'libero' }), 'libero');
  assert.equal(fonteRiga({ fonte: 'sbagliata', prodotto_id: 3 }), 'prodotto');
  assert.equal(fonteRiga({ componente_cliente_id: 7 }), 'componente_cliente');
  assert.equal(fonteRiga({ componente_id: 2 }), 'componente');
  assert.equal(fonteRiga({ codice: 'XYZ' }), 'libero');
  assert.equal(fonteRiga({}), 'prodotto');
});
