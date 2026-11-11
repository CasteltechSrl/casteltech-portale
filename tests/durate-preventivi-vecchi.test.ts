import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL ??= 'postgres://solo-per-i-test@localhost/nessuno'; // il modulo db non si collega finché non si fanno query
const { eDurata, normalizza } = await import('../src/server/preventivi-servizio.js');

// Preventivi del vecchio portale (Adriano 11/11/2026, P2026-2219): nel catalogo salvato le ore sono "numero" con unità h,
// l'etichetta dice "h:mm" e quindi vanno lette come durata: "0:30" = mezz'ora, non zero; "30" scritto pensando ai minuti si vede subito come 30:00.
const catalogo: any = {
  fasi: [], voci: [], materiali: [],
  parametri: [
    { codice: 'oreProgSerigrafia', etichetta: 'Programmazione serigrafia (per lato)', unita: 'h', gruppo: 'SMD TOP', tipo: 'numero', default: 0.5 },
    { codice: 'oreFoglioTempi', etichetta: 'Preparazione foglio tempi', unita: 'h', gruppo: 'PRE-PRODUZIONE', tipo: 'durata' },
    { codice: 'tempoAttrezSerigrafia', etichetta: 'Attrezzaggio serigrafia', unita: 'min', gruppo: 'SMD TOP', tipo: 'numero' },
  ],
};

test('campi in ore dei cataloghi vecchi = durata', () => {
  assert.equal(eDurata({ tipo: 'numero', unita: 'h' }), true);
  assert.equal(eDurata({ tipo: 'durata', unita: 'h' }), true);
  assert.equal(eDurata({ tipo: 'numero', unita: 'min' }), false);
});

test('"0:30" in un campo in ore del vecchio catalogo vale mezz\'ora; i decimali restano validi', () => {
  const d = normalizza({ parametri: { oreProgSerigrafia: '0:30', oreFoglioTempi: '1,5', tempoAttrezSerigrafia: '30' } }, catalogo);
  assert.equal(d.parametri.oreProgSerigrafia, 0.5);
  assert.equal(d.parametri.oreFoglioTempi, 1.5);
  assert.equal(d.parametri.tempoAttrezSerigrafia, 30);
  assert.equal(normalizza({ parametri: { oreProgSerigrafia: '0,5' } }, catalogo).parametri.oreProgSerigrafia, 0.5);
  assert.equal(normalizza({ parametri: { oreProgSerigrafia: "30'" } }, catalogo).parametri.oreProgSerigrafia, 0.5);
});
