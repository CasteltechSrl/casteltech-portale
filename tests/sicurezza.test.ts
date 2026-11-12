import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  categoriaSostanza, trovaScheda, chiaviScheda, paroleDaDescrizione, pericoliDaTesto, pittogrammi, avvisiPericoli, statoScheda, dataRevisioneDaTesto,
  eSchedaSicurezza, SEZIONI_SICUREZZA, CORSI_SICUREZZA, OBBLIGHI_SICUREZZA, daCompilare,
} from '../src/engine/sicurezza.js';
import { SEZIONI_QUALITA, preparaVoce, prossimaScadenza, riepilogoQualita } from '../src/engine/qualita.js';
import { MENU_GRUPPI, gruppoAttivo } from '../src/server/views/layout.js';
import { cercaGuida } from '../src/engine/guida.js';

test('sicurezza: le sostanze si riconoscono dal codice MC- o dalle parole, gli accessori no', () => {
  assert.equal(categoriaSostanza('MC-PAS-005', 'PASTA SALDANTE SAC305 ALPHA OM-338-PT'), 'pasta');
  assert.equal(categoriaSostanza('MC-FLU-001', 'FLUSSANTE LOCTITE MF 210'), 'flussante');
  assert.equal(categoriaSostanza('MC-PUL-002', 'SPRUZZATORE A GRILLETTO PER FLACONI DA 1 L'), null, 'spruzzatore: accessorio');
  assert.equal(categoriaSostanza('MC-PUL-007', 'TRECCIA DISSALDANTE NO-CLEAN STANNOL'), null);
  assert.equal(categoriaSostanza('MC-LAM-001', 'LAMINA SERIGRAFICA'), null, 'lamine: niente scheda');
  assert.equal(categoriaSostanza('MC-KAP-001', 'KAPTON 12 MM'), null);
  assert.equal(categoriaSostanza(null, 'FILO DI STAGNO SAC0307 3,3% FLUX Ø 0,38 MM'), 'filo', 'il filo con flussante resta filo');
  assert.equal(categoriaSostanza(null, 'STAGNO IN BARRE SN100NI+'), 'barre');
  assert.equal(categoriaSostanza(null, 'ALCOL ISOPROPILICO IPA 1 L'), 'pulizia');
  assert.equal(categoriaSostanza(null, 'CONFORMAL COATING GCE 4 AR SPRAY'), 'coating');
  assert.equal(categoriaSostanza(null, 'DOWSIL 1-2577'), 'colle');
  assert.equal(categoriaSostanza('STM32F103C8T6', 'IC MCU 32BIT 64KB FLASH LQFP48'), null, 'i componenti elettronici non sono sostanze');
  assert.equal(categoriaSostanza(null, 'PUNTE WELLER LT B'), null);
});

test('sicurezza: la riga trova la scheda con le parole (codici senza spazi e segni), meglio una SDS che una scheda tecnica', () => {
  const schede = [
    { id: 1, prodotto: 'LOCTITE MF210', parole: 'MF210\nMC-FLU-001', tipo: 'sds' },
    { id: 2, prodotto: 'ALPHA OM-338 PT', parole: 'OM-338\nOM338', tipo: 'sds' },
    { id: 3, prodotto: 'ETIMOL DFX 80 TDS', parole: 'ETIMOL\nDFX80', tipo: 'tds' },
    { id: 4, prodotto: 'ETIMOL DFX 80', parole: 'ETIMOL\nDFX80', tipo: 'sds' },
    { id: 5, prodotto: 'IPA', parole: 'IPA', tipo: 'sds' },   // chiave troppo corta: non deve abbinare a caso
  ];
  assert.equal(trovaScheda('MC-FLU-001', 'FLUSSANTE LOCTITE MF 210 ALCOLICO', schede)?.id, 1);
  assert.equal(trovaScheda(null, 'PASTA SALDANTE SAC305 ALPHA OM-338-PT VASETTO', schede)?.id, 2);
  assert.equal(trovaScheda(null, 'FLUX REMOVER ETIMOL DFX80 CA - TANICA 20 L', schede)?.id, 4);
  assert.equal(trovaScheda(null, 'PIPA DI PROVA', schede), undefined);
  assert.deepEqual(chiaviScheda({ id: 9, prodotto: 'X', parole: 'MF 210; ab' }), ['MF210']);
  assert.deepEqual(paroleDaDescrizione('PASTA SALDANTE SAC305 TIPO 4 LOCTITE GC10 885V52U - VASETTO 500 G (I-TRONIK HK2002845)'), ['SAC305', 'GC10', '885V52U']);
});

test('sicurezza: frasi H della sezione 2, pittogrammi e avvisi CMR/sensibilizzanti', () => {
  const t = 'SEZIONE 1 identificazione H999\nSEZIONE 2: Identificazione dei pericoli\nFlam. Liq. 2 H225\nEye Irrit. 2 H319\nRepr. 1B H360FD\nH317 EUH208\nSEZIONE 3 composizione H300 H410';
  assert.deepEqual(pericoliDaTesto(t), ['EUH208', 'H225', 'H317', 'H319', 'H360FD']);
  assert.deepEqual(pittogrammi(['H225', 'H319', 'H360FD']).map(p => p.nome), ['Infiammabile', 'Pericolo per la salute', 'Nocivo o irritante']);
  const a = avvisiPericoli(['H360FD', 'H317']);
  assert.equal(a.length, 2);
  assert.match(a[0], /CMR/);
  assert.deepEqual(avvisiPericoli(['H315']), []);
  assert.ok(eSchedaSicurezza('SCHEDA DI DATI DI SICUREZZA\nSEZIONE 2: pericoli'));
  assert.ok(!eSchedaSicurezza('Technical Data Sheet TempSave B37'));
  assert.equal(dataRevisioneDaTesto('Data di revisione: 28.07.2025   Versione 3'), '2025-07-28');
  assert.equal(dataRevisioneDaTesto('Revisione: 26/03/2024 Versione: 4'), '2024-03-26');
});

test('sicurezza: stato della scheda (solo tecnica, senza PDF, revisione vecchia)', () => {
  const oggi = '2026-11-12';
  assert.equal(statoScheda({ tipo: 'sds', data_revisione: '2025-07-28', ha_file: true }, oggi).livello, 'ok');
  assert.equal(statoScheda({ tipo: 'tds', data_revisione: '2025-07-28', ha_file: true }, oggi).livello, 'manca');
  assert.match(statoScheda({ tipo: 'sds', data_revisione: '2019-06-12', ha_file: true }, oggi).testo, /vecchia/);
  assert.match(statoScheda({ tipo: 'sds', data_revisione: '2024-01-01', ha_file: false, url: 'https://x' }, oggi).testo, /link/);
});

test('sicurezza: scadenzario con le regole dei registri della Qualità, chiavi diverse dalla Qualità', () => {
  const chiavi = SEZIONI_SICUREZZA.map(s => s.chiave);
  assert.equal(new Set(chiavi).size, chiavi.length);
  assert.ok(chiavi.every(k => k.startsWith('sic_') && !SEZIONI_QUALITA.some(q => q.chiave === k)));
  for (const s of SEZIONI_SICUREZZA) {
    const campi = s.campi.map(c => c.chiave);
    for (const c of s.colonne) assert.ok(campi.includes(c) || c === 'prossima', `${s.chiave}: colonna ${c}`);
    for (const c of s.chiaveImport) assert.ok(campi.includes(c), `${s.chiave}: chiave ${c}`);
    if (s.scadenza === 'frequenza_mesi') assert.ok(campi.includes('ultima') && campi.includes('frequenza_mesi'), s.chiave);
  }
  const formazione = SEZIONI_SICUREZZA.find(s => s.chiave === 'sic_formazione')!;
  // senza "ogni quanti mesi" vale l'aggiornamento di legge del corso: preposto 2 anni, primo soccorso 3
  const { dati } = preparaVoce(formazione, { persona: 'rossi mario', corso: 'preposto', ultima: '10/05/2025' });
  assert.equal(dati.persona, 'ROSSI MARIO');
  assert.equal(dati.frequenza_mesi, 24);
  assert.equal(prossimaScadenza(formazione, dati, '2026-11-12'), '2027-05-10');
  assert.equal(preparaVoce(formazione, { persona: 'X', corso: 'primo_soccorso', frequenza_mesi: '12' }).dati.frequenza_mesi, 12, 'scritto a mano vince');
  assert.equal(preparaVoce(formazione, { persona: 'X', corso: 'lavoratori_generale' }).dati.frequenza_mesi, null, 'la formazione generale non scade');
  assert.equal(CORSI_SICUREZZA.antincendio.mesi, 60);
  // riepilogo con le sezioni della sicurezza; riga senza data = da compilare
  const vuota = { frequenza_mesi: 6, ultima: null };
  assert.ok(daCompilare(vuota));
  const r = riepilogoQualita([{ id: 1, sezione: 'sic_emergenza', dati: { presidio: 'estintori', ultima: '2025-06-19', frequenza_mesi: 6 } }], '2026-11-12', SEZIONI_SICUREZZA);
  assert.equal(r.scadute.length, 1);
  assert.equal(r.conteggi.sic_emergenza, 1);
  assert.ok(OBBLIGHI_SICUREZZA.every(o => o.sezione === 'schede' || chiavi.includes(o.sezione)));
});

test('sicurezza: voce di menu dopo Qualità e Dipendenti, pagine montate, controllo su ordini e DDT, guida', () => {
  const nomi = MENU_GRUPPI.map(g => g.nome);
  assert.equal(nomi.indexOf('Sicurezza'), nomi.indexOf('Dipendenti') + 1);
  assert.ok(nomi.indexOf('Qualità') < nomi.indexOf('Sicurezza'));
  assert.equal(gruppoAttivo('sicurezza'), 'sicurezza');
  const voci = MENU_GRUPPI.find(g => g.chiave === 'sicurezza')!.voci.map(v => v[1]);
  for (const s of SEZIONI_SICUREZZA) assert.ok(voci.includes(`/sicurezza/${s.chiave}`), s.chiave);
  const index = readFileSync(new URL('../src/server/index.ts', import.meta.url), 'utf8');
  assert.match(index, /app\.use\('\/sicurezza', soloUfficio, rotteSicurezza\(\)\)/);
  const ordini = readFileSync(new URL('../src/server/rotte/ordini-fornitore.ts', import.meta.url), 'utf8');
  assert.match(ordini, /riquadroSchede\(sds/);
  assert.match(ordini, /cercaMancantiDopo\(/);
  const acq = readFileSync(new URL('../src/server/rotte/acquisizioni.ts', import.meta.url), 'utf8');
  assert.match(acq, /riquadroSchede\(sds/);
  assert.match(acq, /cercaMancantiDopo\(/);
  const migr = readFileSync(new URL('../db/migrazioni/094_sicurezza.sql', import.meta.url), 'utf8');
  assert.match(migr, /CREATE TABLE IF NOT EXISTS sicurezza_schede/);
  assert.ok(cercaGuida('scheda di sicurezza').some(r => r.argomento.id === 'sicurezza-schede'));
  assert.ok(cercaGuida('scadenza corso antincendio').some(r => r.argomento.id === 'sicurezza-scadenzario'));
});
