import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { annoTabelle, cercaTariffe, etichettaAci, leggiTabelleAci, tabellaDaCaricare } from '../src/engine/tariffe-aci.js';
import { cercaGuida } from '../src/engine/guida.js';

// Righe come escono dal PDF della Gazzetta Ufficiale (S.O. n. 40 alla G.U. n. 297 del 23/12/2025), testo con le colonne allineate.
const TESTO = `
                                                            FRINGE BENEFIT 2026
                                                    AUTOVEICOLI A BENZINA IN PRODUZIONE
               ID Modello        Marca                        Modello
                 23383      ALFA ROMEO       GIULIA 2.0 TURBO Q4 VELOCE 280CV AWD         0,9011   3.379,13 4.054,95 6.758,25     8.109,90
                     MG                 MG3 1.5 116CV MOD 2025                      0,4217   1.581,38    1.897,65    3.162,75    3.795,30
                                             AUTOVEICOLI A GASOLIO IN PRODUZIONE
      30594      VOLKSWAGEN    PASSAT STATION 2024 2.0 TDI 122CV             0,5988   2.245,50 2.694,60 4.491,00 5.389,20
                                              AUTOVEICOLI ELETTRICI IN PRODUZIONE
             30498   TESLA        MODEL 3 NV35 RWD ELETTRICA                      0,4448    667,20  1.668,00 2.001,60
                                          AUTOVEICOLI A GASOLIO FUORI PRODUZIONE
          21650      VOLKSWAGEN   PASSAT VARIANT 1.4 TSI 150CV EURO 6 SW        0,5711   2.141,63   2.569,95   4.283,25   5.139,90
          21650      VOLKSWAGEN   PASSAT VARIANT 1.4 TSI 150CV EURO 6 SW        0,5711   2.141,63   2.569,95   4.283,25   5.139,90
       MOTOCICLI
         17710      APRILIA                  SCARABEO 100 4T                      0,1888    283,20    708,00     849,60    1.416,00
`;

test('tabelle ACI: anno, sezioni, righe con e senza ID, niente doppioni', () => {
  assert.equal(annoTabelle(TESTO), 2026);
  const r = leggiTabelleAci(TESTO);
  assert.equal(r.length, 6);
  assert.deepEqual(r[0], { idAci: 23383, marca: 'ALFA ROMEO', modello: 'GIULIA 2.0 TURBO Q4 VELOCE 280CV AWD', alimentazione: 'BENZINA', produzione: true, costoKm: 0.9011 });
  assert.equal(r[1].idAci, null);
  assert.equal(r[1].marca, 'MG');
  assert.equal(r.find(x => x.marca === 'TESLA')!.alimentazione, 'ELETTRICI');
  const passat = r.find(x => x.modello.startsWith('PASSAT VARIANT'))!;
  assert.equal(passat.produzione, false);
  assert.equal(passat.alimentazione, 'GASOLIO');
  assert.equal(r.at(-1)!.alimentazione, 'MOTO');
});

test('ricerca: parole in qualunque ordine, inizio di parola, prima quelli in produzione', () => {
  const r = leggiTabelleAci(TESTO);
  assert.deepEqual(cercaTariffe(r, 'model 3 tesla').map(x => x.costoKm), [0.4448]);
  assert.deepEqual(cercaTariffe(r, 'pass').map(x => x.modello.slice(0, 14)), ['PASSAT STATION', 'PASSAT VARIANT']);
  assert.equal(cercaTariffe(r, 'gasolio passat').length, 2);
  assert.deepEqual(cercaTariffe(r, ''), []);
  assert.equal(cercaTariffe(r, 'citroen').length, 0);
  assert.match(etichettaAci(r.find(x => !x.produzione)!), /fuori produzione/);
});

test('tabella da caricare dal 1° gennaio', () => {
  assert.equal(tabellaDaCaricare(null, 2026), true);
  assert.equal(tabellaDaCaricare(2026, 2026), false);
  assert.equal(tabellaDaCaricare(2026, 2027), true);
});

test('pagina Persone e auto: qualifica spiegata, ricerca e caricamento ACI; guida', () => {
  const rotta = readFileSync('src/server/rotte/dipendenti.ts', 'utf8');
  assert.match(rotta, /list="qualifiche"/);
  assert.match(rotta, /\/aci\/cerca/);
  assert.match(rotta, /\/aci\/carica/);
  assert.match(readFileSync('public/dipendenti.js', 'utf8'), /\/dipendenti\/aci\/cerca/);
  assert.ok(cercaGuida('tabelle aci gazzetta').some(a => a.argomento.id === 'nota-spese'));
  assert.ok(cercaGuida('qualifica').some(a => a.argomento.id === 'nota-spese'));
});
