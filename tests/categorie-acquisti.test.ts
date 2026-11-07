import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIE, NOMI_MACRO, categoria, classificaRiga, rigaDaIgnorare, riepilogoCategorie } from '../src/engine/categorie-acquisti.js';

test('categorie di Adriano (6/11/2026): quattro gruppi, ogni categoria in un gruppo, codici unici', () => {
  assert.deepEqual(Object.keys(NOMI_MACRO), ['rivendita', 'consumo', 'lavorazioni', 'gestione']);
  assert.equal(new Set(CATEGORIE.map(c => c.codice)).size, CATEGORIE.length);
  for (const m of Object.keys(NOMI_MACRO)) assert.ok(CATEGORIE.some(c => c.macro === m), m);
  assert.equal(categoria('non-esiste').codice, 'altro');
});

test('le parole della descrizione decidono: lamine, stagno, pasta, flussante, punte, PCB', () => {
  const c = (fornitore: string, descrizione: string) => classificaRiga({ fornitore, descrizione });
  assert.equal(c('I-TRONIK S.R.L.', 'LAMINA AUTOT. ZELFLEX 23" SP.0,12 UM').categoria, 'lamine');
  assert.equal(c('I-TRONIK S.R.L.', 'PASTA LOCTITE GC10 SAC305T3 885V 52K 500 GR').categoria, 'stagno');
  assert.equal(c('I-TRONIK S.R.L.', 'STAGNO IN VERGHE LEGA SN100Ce').categoria, 'stagno');
  assert.equal(c('I-TRONIK S.R.L.', 'MANUTENZIONE ORDINARIA').categoria, 'manutenzioni');
  assert.equal(c('GEA SRL', 'FLUX REMOVER ETIMOL DFX80 CA conf. 20Lt').categoria, 'chimici');
  assert.equal(c('GEA SRL', 'FLUX PASTE EO-FP-003 100ml').categoria, 'stagno');
  assert.equal(c('BARBIERI SRL', 'XT H Punta saldante 0,8mm per WP 120').categoria, 'ricambi_saldatura');
  assert.equal(c('MOUSER ELECTRONICS', 'codice articolo produttore: T0054471399 // Weller XTH,ReachChiselTip').categoria, 'ricambi_saldatura');
  assert.equal(c('SERIGROUP S.R.L.', 'PCB ML6 2.4 35/17*4/17 UM USB TAP-A V3 ENIG').categoria, 'pcb');
  assert.equal(c('Sconosciuto srl', 'PRINTED CIRCUIT BOARD 4 layers').categoria, 'pcb');
  assert.equal(c('MARIA SETTEGRANI', 'MONTAGGIO SCHEDA ASAT_AM').macro, 'lavorazioni');
  assert.equal(c('INNUVATECH SRL', '5 SAL ricerca e sviluppo progetto "Eredità Digitale"').categoria, 'ricerca_sviluppo');
});

test('con un fornitore specializzato le parole generiche non contano: "nastro" nei componenti, "trasporto" in bolletta, "montaggio" dal gommista', () => {
  const c = (fornitore: string, descrizione: string) => classificaRiga({ fornitore, descrizione });
  assert.equal(c('TME ITALIA S.R.L.', 'Diodo:raddrizzatore Schottky;SMA;SMD;60V;3A;bobina,nastro').categoria, 'componenti');
  assert.equal(c('Enel Energia S.p.A.', "SPESA PER IL TRASPORTO DELL'ENERGIA ELETTRICA E LA GESTIONE DEL CONTATORE").categoria, 'energia');
  assert.equal(c('CALESTANI GOMME di Calestani Romano & C.', 'PNEUMATICI NUOVI 215/75 R 16 + montaggio').categoria, 'auto');
  assert.equal(c('Fedex Express Italy S.r.l', 'Supplemento Carburante').categoria, 'trasporti');
  assert.equal(c('DHL EXPRESS (ITALY) S.R.L.', '2746677636 Oneri Doganali - DAZIO').categoria, 'dogane');
  // negozio generico (Amazon): decidono le parole
  assert.equal(c('Amazon Business EU S.a.r.l, Sede Seconda', 'Cool Toner TN423 Cartuccia toner compatibile per Brother').categoria, 'ufficio');
  assert.equal(c('Amazon Business EU S.a.r.l, Sede Seconda', 'LANON Guanti in Silicone Liquido Resistenti al Calore').categoria, 'dpi');
  assert.equal(c('Amazon Business EU S.a.r.l, Sede Seconda', 'AIESI Acqua Bidistillata F.U. pura (25 litri)').categoria, 'chimici');
  assert.equal(c('Amazon EU S.a r.l., Succursale Italiana', 'TP-Link Switch Ethernet 5 Porte, Montaggio a parete').categoria, 'ufficio');
});

test('fornitore abituale senza parole decisive; spese accessorie restano nella categoria del fornitore; sconosciuti = da verificare', () => {
  const c = (fornitore: string, descrizione: string) => classificaRiga({ fornitore, descrizione });
  assert.equal(c('Pc Components Europe S.r.l.', 'STM32F405VGT7§ST Micro').categoria, 'componenti');
  assert.equal(c('HTS PCB SRL', 'CS250299').categoria, 'pcb');
  assert.equal(c('SARDALEASING S.P.A.', 'CANONI LEASING S3').categoria, 'leasing');
  assert.equal(c('IMMOBILZETA SRL', 'CANONE DI LOCAZIONE RELATIVO AL I° SEMESTRE 2026').categoria, 'affitto');
  assert.equal(c('U.P.A. - FEDERIMPRESA', "CONTABILITA' PAGHE N.7 CEDOLINI").categoria, 'consulenze_amministrative');
  assert.equal(c('METRONOTTE PIACENZA S.R.L.', 'CANONE 893 M').categoria, 'sicurezza');
  const acc = c('Wuerth Elektronik Italia S.r.l.', 'Freight costs');
  assert.equal(acc.categoria, 'componenti'); assert.equal(acc.accessoria, true);
  assert.equal(c('TME ITALIA S.R.L.', 'Spese di trasporto').categoria, 'componenti');
  const x = c('DITTA MAI VISTA SRL', 'Prestazione varia');
  assert.equal(x.come, 'nessuna'); assert.equal(x.categoria, 'altro');
  assert.equal(c('DITTA MAI VISTA SRL', 'RES 75 OHM 1% 1/16W 0402').categoria, 'componenti');   // descrizione da catalogo
});

test('righe senza valore ignorate; riepilogo per gruppo e categoria con le note di credito in negativo', () => {
  assert.equal(rigaDaIgnorare({ fornitore: 'X', descrizione: 'DDT N. 1633 DEL 29/04/2026', importo: 0 }), true);
  assert.equal(rigaDaIgnorare({ fornitore: 'X', descrizione: 'Rif. Vs. Ordine nr. 42-25', importo: 12 }), true);
  assert.equal(rigaDaIgnorare({ fornitore: 'X', descrizione: 'Riga ausiliaria contenente informazioni tecniche', importo: 0 }), true);
  assert.equal(rigaDaIgnorare({ fornitore: 'X', descrizione: 'LAMINA', importo: 75 }), false);
  const r = riepilogoCategorie([{ categoria: 'componenti', importo: 1000 }, { categoria: 'pcb', importo: 500 }, { categoria: 'componenti', importo: -100 }, { categoria: 'affitto', importo: 400 }]);
  assert.equal(r.totale, 1800);
  assert.equal(r.macro.find(m => m.macro === 'rivendita')?.importo, 1400);
  assert.equal(r.macro.find(m => m.macro === 'rivendita')?.quota, 77.78);
  assert.deepEqual(r.categorie.map(c => c.codice), ['componenti', 'pcb', 'affitto']);
});

test('Laura Nardi: PCB o progettazione secondo la riga; Federico Cetani consulenze (Adriano 7/11/2026)', () => {
  const c = (fornitore: string, descrizione: string) => classificaRiga({ fornitore, descrizione }).categoria;
  assert.equal(c('NARDI LAURA', 'PCB 2 strati FR4 1.6 mm ENIG'), 'pcb');
  assert.equal(c('LAURA NARDI', 'Circuito stampato M0925-B'), 'pcb');
  assert.equal(c('LAURA NARDI', 'Progettazione scheda controllo motore'), 'progettazione');
  assert.equal(c('LAURA NARDI', 'Consulenza tecnica su layout'), 'progettazione');
  assert.equal(c('CETANI FEDERICO', 'Prestazione professionale ottobre 2026'), 'consulenze_tecniche');
});
