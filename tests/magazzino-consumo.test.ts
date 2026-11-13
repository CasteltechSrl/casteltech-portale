import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { vociConsumo } from '../src/engine/consumi.js';
import {
  VOCI_MAGAZZINO, consumoMensile, contenutoProposto, costoInVoce, cruscottoConsumo, indicatoriVoce, numeroScritto, situazioneGiacenza, ultimoAcquisto, voceMagazzino, voceProposta,
  type MovimentoConsumo,
} from '../src/engine/magazzino-consumo.js';

const sql = ['065_materiali_consumo.sql', '086_materiali_pcb.sql'].map(f => readFileSync(new URL(`../db/migrazioni/${f}`, import.meta.url), 'utf8')).join('\n');
const iniziali = [...sql.matchAll(/\('(MC-[A-Z]{3}-\d{3})', '([A-Z]{3})', '([A-Z]+)', '((?:[^']|'')+)'\)/g)]
  .map(([, codice, categoria, um, descrizione]) => ({ codice, categoria, um, descrizione: descrizione.replace(/''/g, "'") }));
const art = (codice: string) => iniziali.find(m => m.codice === codice)!;
const v = (c: string) => voceMagazzino(c)!;

test('Materiale di consumo: le stesse voci del riquadro della commessa, con unità di gestione', () => {
  assert.deepEqual(VOCI_MAGAZZINO.filter(x => !x.soloAcquisti).map(x => x.codice), vociConsumo(null, 0).map(x => x.codice));
  // flussante diviso negli Acquisti: liquido per l'onda (voce della scheda) e gel per le riprese SMD
  assert.deepEqual(VOCI_MAGAZZINO.filter(x => x.soloAcquisti).map(x => x.codice), ['flussanteGel']);
  assert.equal(v('pastaSaldante').unita, 'kg');
  assert.equal(v('kaptonNastro').unita, 'm');
  assert.equal(v('kaptonNastro').dallaScheda, 0.01);   // la scheda conta il Kapton in cm
});

test('Materiale di consumo: articoli dell\'anagrafica nella voce giusta', () => {
  assert.equal(voceProposta(art('MC-PAS-001')), 'pastaSaldante');
  assert.equal(voceProposta(art('MC-BAR-001')), 'stagnoSaldatrice');
  assert.equal(voceProposta(art('MC-FIL-001')), 'filo');
  assert.equal(voceProposta(art('MC-FLU-004')), 'flussante');
  assert.equal(voceProposta(art('MC-FLU-008')), 'flussante');      // pasta flussante concentrata: diventa liquido
  assert.equal(voceProposta(art('MC-FLU-006')), 'flussanteGel');
  assert.equal(voceProposta(art('MC-FLU-007')), 'flussanteGel');
  assert.equal(voceProposta(art('MC-KAP-003')), 'kaptonNastro');
  assert.equal(voceProposta(art('MC-KAP-011')), 'kaptonBollini');
  assert.equal(voceProposta(art('MC-COA-002')), 'conformal');
  assert.equal(voceProposta(art('MC-COA-003')), null);          // diluente
  assert.equal(voceProposta(art('MC-COA-006')), 'pastaTermo');  // pasta siliconica
  assert.equal(voceProposta(art('MC-LAM-001')), null);          // le lamine non sono nel riquadro
  assert.equal(voceProposta({ categoria: 'VAR', descrizione: 'VITI M3X6 INOX - CF. 100', um: 'CF' }), 'viteria');
  // ogni voce tranne la viteria ha almeno un articolo
  for (const x of VOCI_MAGAZZINO.filter(x => x.codice !== 'viteria')) assert.ok(iniziali.some(m => voceProposta(m) === x.codice), x.codice);
});

test('Materiale di consumo: contenuto della confezione letto da unità e descrizione', () => {
  assert.equal(contenutoProposto(art('MC-PAS-001'), v('pastaSaldante')), 0.5);   // PZ, vasetto 500 g
  assert.equal(contenutoProposto(art('MC-PAS-003'), v('pastaSaldante')), 1);     // venduta a KG
  assert.equal(contenutoProposto(art('MC-FIL-002'), v('filo')), 0.25);
  assert.equal(contenutoProposto(art('MC-FLU-001'), v('flussante')), 25);        // tanica 25 L
  assert.equal(contenutoProposto(art('MC-FLU-008'), v('flussante')), 0.1);       // 100 ML
  assert.equal(contenutoProposto(art('MC-FLU-006'), v('flussante')), null);      // siringa 10 G: non è un volume
  assert.equal(contenutoProposto(art('MC-FLU-006'), v('flussanteGel')), 10);     // nel gel: 10 g
  assert.equal(contenutoProposto(art('MC-FLU-007'), v('flussanteGel')), 300);
  assert.equal(contenutoProposto(art('MC-KAP-003'), v('kaptonNastro')), 33);     // 6 MM X 33 M
  assert.equal(contenutoProposto(art('MC-KAP-011'), v('kaptonBollini')), 1000);  // CF. 1000
  assert.equal(contenutoProposto(art('MC-COA-002'), v('conformal')), 1);         // spray
  assert.equal(contenutoProposto(art('MC-COA-001'), v('conformal')), null);      // latta: da scrivere
  assert.equal(contenutoProposto(art('MC-COA-006'), v('pastaTermo')), 1000);     // 1 KG in grammi
});

test('Materiale di consumo: prezzo dall\'acquisto più recente', () => {
  const u = ultimoAcquisto([
    { data: '2026-03-01', prezzo: 40, fonte: 'fattura' as const },
    { data: '2026-11-10', prezzo: 45, fonte: 'ordine' as const },
    { data: '2026-11-10', prezzo: 44, fonte: 'anagrafica' as const },
    { data: '2026-12-01', prezzo: 0, fonte: 'ordine' as const },
  ]);
  assert.equal(u?.prezzo, 45);
  assert.equal(ultimoAcquisto([]), null);
});

const mov = (tipo: MovimentoConsumo['tipo'], data: string, quantita: number, ora = '10:00:00', stimato = false): MovimentoConsumo =>
  ({ tipo, data, quando: `${data}T${ora}`, quantita, testo: tipo, stimato });

test('Materiale di consumo: giacenza = ultimo inventario + ordini − consumi venuti dopo', () => {
  const s = situazioneGiacenza([
    mov('carico', '2026-10-01', 5),          // prima dell'inventario: non conta
    mov('inventario', '2026-11-01', 2),
    mov('carico', '2026-11-01', 1, '09:00:00'), // stesso giorno ma prima dell'inventario: non conta
    mov('carico', '2026-11-05', 3),
    mov('consumo', '2026-11-08', 0.5),
    mov('consumo', '2026-11-09', 0.25, '10:00:00', true),
  ], '2026-11-13');
  assert.equal(s.giacenza, 4.25);
  assert.equal(s.caricato, 3);
  assert.equal(s.consumato, 0.75);
  assert.equal(s.consumatoStimato, 0.25);
  assert.equal(s.movimenti.at(-1)!.saldo, 4.25);
  // media: 2 per 4 giorni, 5 per 3, 4,5 per 1, 4,25 per 4 = (8 + 15 + 4,5 + 17) / 12
  assert.ok(Math.abs(s.media! - 44.5 / 12) < 1e-6);
  // un inventario nuovo riparte da lì
  const s2 = situazioneGiacenza([mov('inventario', '2026-11-01', 2), mov('carico', '2026-11-05', 3), mov('inventario', '2026-11-10', 1)], '2026-11-10');
  assert.equal(s2.giacenza, 1);
  assert.equal(situazioneGiacenza([mov('carico', '2026-11-05', 3)], '2026-11-10').giacenza, null);
});

test('Materiale di consumo: consumo al mese, copertura, rotazione, scorta e cruscotto', () => {
  assert.equal(consumoMensile([], '2026-11-13'), null);
  // 12 kg in un anno = 1 kg al mese
  assert.ok(Math.abs(consumoMensile([{ data: '2025-11-14', quantita: 6 }, { data: '2026-06-01', quantita: 6 }], '2026-11-13')! - 12 / 12) < 0.01);
  // un consumo di una settimana fa vale come un mese intero (niente medie gonfiate)
  assert.equal(consumoMensile([{ data: '2026-11-06', quantita: 2 }], '2026-11-13'), 2);
  const s = situazioneGiacenza([mov('inventario', '2026-11-13', 3)], '2026-11-13');
  const ind = indicatoriVoce(s, 40, 1, 5);
  assert.equal(ind.valore, 120);
  assert.equal(ind.copertura, 3);
  assert.equal(ind.rotazione, 4);
  assert.equal(ind.sottoScorta, true);
  const c = cruscottoConsumo([
    { ind, costo: 40, acquistato12: 500, stimato: false },
    { ind: indicatoriVoce(situazioneGiacenza([], '2026-11-13'), null, null, null), costo: null, acquistato12: 0, stimato: false },
  ]);
  assert.equal(c.valore, 120);
  assert.equal(c.consumato12, 480);
  assert.equal(c.copertura, 3);
  assert.equal(c.vociSenzaInventario, 1);
  assert.equal(c.vociSenzaPrezzo, 1);
  assert.equal(c.sottoScorta, 1);
});

test('Materiale di consumo: numeri scritti dall\'ufficio', () => {
  assert.equal(numeroScritto('2,5'), 2.5);
  assert.equal(numeroScritto('1.500'), 1500);
  assert.equal(numeroScritto(''), null);
  assert.equal(numeroScritto('abc'), null);
  assert.equal(numeroScritto('-3'), null);
});

test('Materiale di consumo: costo per unità anche con righe fatturate in un\'altra unità', () => {
  const tanica = { um: 'PZ', contenuto: 25 }, pasta = { um: 'PZ', contenuto: 0.5 };
  assert.equal(costoInVoce(200, 2, 'PZ', tanica, voceMagazzino('flussante')!), 4);        // 2 taniche da 25 l a 200 € = 4 €/l
  assert.equal(costoInVoce(200, 2, null, tanica, voceMagazzino('flussante')!), 4);
  assert.equal(costoInVoce(105, 1870, 'gr', tanica, voceMagazzino('flussante')!), null);  // flussante fatturato a grammi: niente costo
  assert.equal(costoInVoce(68, 1, 'confezioni', pasta, voceMagazzino('pastaSaldante')!), 136);
  assert.equal(costoInVoce(65, 500, 'g', pasta, voceMagazzino('pastaSaldante')!), 130);    // 500 g a 65 € = 130 €/kg
  assert.equal(costoInVoce(10, 1, 'PZ', { um: 'PZ', contenuto: null }, voceMagazzino('conformal')!), null);
});
