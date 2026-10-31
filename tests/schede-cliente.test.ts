// Documenti della scheda del cliente (Preventivi → Da documenti): solo esempi inventati, niente file veri dei clienti.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leggiPickPlace, sembraPickPlace } from '../src/engine/scheda/pick-place.js';
import { leggiGerber, sembraGerber } from '../src/engine/scheda/gerber.js';
import { calcolaEspressione } from '../src/engine/scheda/espressioni-gerber.js';
import { contaRefori, leggiForatura, sembraForatura } from '../src/engine/scheda/foratura.js';
import { leggiGenCad } from '../src/engine/scheda/gencad.js';
import { analizzaScheda, CONSUMI, leggiBomScheda, numeroPassivo, stessoComponente } from '../src/engine/scheda/analisi.js';
import { ruoloStrato, tipoFile } from '../src/engine/scheda/classifica.js';
import { CARTELLA_CASTELTECH, lavoratoDaCasteltech, MAX_FILE, scegliFile, sceltaFile, TROPPO_GRANDE, VERSIONI_VECCHIE } from '../src/engine/scheda/scelta-file.js';
import { parametriDaAnalisi } from '../src/engine/scheda/preventivo.js';
import { controllaPiazzole, misuraPiazzole, PIAZZOLE_IPC } from '../src/engine/scheda/piazzole.js';
import { latoFoglio, righeFoglio } from '../src/engine/scheda/documentazione.js';
import { chiaveSegnalazione, conAccettate } from '../src/engine/scheda/accettate.js';
import type { Piazzola } from '../src/engine/scheda/gerber.js';

// ───────────── pick and place ─────────────

test('pick and place KiCad (.pos): lato, misure, fiducial separati', () => {
  const t = `### Footprint positions
## Unit = mm, Angle = deg.
# Ref     Val       Package                X        Y       Rot  Side
C1        100n      C_0603_1608Metric   10.0000  -5.0000   90.0  top
R1        4K7       R_0603_1608Metric   12.5000  -5.0000    0.0  bottom
FID1      Fiducial  Fiducial_1mm         2.0000  -2.0000    0.0  top
`;
  const l = leggiPickPlace('scheda-all.pos', t);
  assert.equal(l.posizioni.length, 2);
  assert.deepEqual(l.posizioni.map(p => [p.ref, p.lato]), [['C1', 'TOP'], ['R1', 'BOT']]);
  assert.equal(l.posizioni[0].x, 10);
  assert.equal(l.fiducial.length, 1);
});

test('pick and place PADS (vb_ais): sezione PART, lato e fiducial', () => {
  const t = `$UNITS$ MM
$FIDUCIAL_SECTION_BEGIN$
FID 5.0 5.0 BOTTOM
$FIDUCIAL_SECTION_END$
$PART_SECTION_BEGIN$
REF PART ROT X Y SIDE
C1 C_100N_0603 180 20.5 30.25 BOTTOM
K1 RELE_5V 90 40 30 TOP
$PART_SECTION_END$
`;
  assert.ok(sembraPickPlace(t));
  const l = leggiPickPlace('vb_ais.txt', t);
  assert.deepEqual(l.posizioni.map(p => [p.ref, p.lato, p.rot]), [['C1', 'BOT', 180], ['K1', 'TOP', 90]]);
  assert.equal(l.fiducial.length, 1);
  assert.equal(l.fiducial[0].lato, 'BOT');
});

test('pick and place senza intestazione: il lato viene dal nome del file', () => {
  const t = `C1; 100n C0603;10.5;20.5;90;CODE1\nR1; 10k R0603;11.5;20.5;0;CODE2\n`;
  const l = leggiPickPlace('pp_scheda_bot_x.txt', t);
  assert.equal(l.posizioni.length, 2);
  assert.ok(l.posizioni.every(p => p.lato === 'BOT'));
});

// ───────────── Gerber ─────────────

test('Gerber: espressioni delle macro senza eval', () => {
  assert.equal(calcolaEspressione('$1x2+0.5', { 1: 3 }), 6.5);
  assert.equal(calcolaEspressione('($1-$2)/2', { 1: 5, 2: 1 }), 2);
});

test('Gerber assoluto in mm: piazzola tonda e riquadro', () => {
  const t = `%FSLAX24Y24*%\n%MOMM*%\n%ADD10C,1.0*%\nD10*\nX100000Y50000D03*\nM02*\n`;
  assert.ok(sembraGerber(t));
  const g = leggiGerber(t, 'p');
  assert.equal(g.oggetti, 1);
  assert.ok(g.riquadro);
  assert.ok(Math.abs(g.riquadro!.x0 - 9.5) < 1e-6 && Math.abs(g.riquadro!.x1 - 10.5) < 1e-6);
  assert.match(g.corpo, /<use href="#p-a10"/);
});

test('Gerber incrementale in pollici: le coordinate si sommano', () => {
  const t = `%FSLIX24Y24*%\n%MOIN*%\n%ADD11C,0.01*%\nD11*\nX10000Y0D02*\nX10000Y0D01*\nM02*\n`;
  const g = leggiGerber(t, 'q');
  // da x=1" a x=2": 25,4 → 50,8 mm
  assert.ok(Math.abs(g.riquadro!.x1 - 50.8) < 0.2, JSON.stringify(g.riquadro));
  assert.ok(g.riquadro!.x0 > 25 && g.riquadro!.x0 < 26);
});

test('Gerber: macro con cerchio e polarità chiara', () => {
  const t = `%FSLAX24Y24*%\n%MOMM*%\n%AMTONDO*\n0 commento*\n1,1,$1,0,0*%\n%ADD12TONDO,2.0*%\n%LPC*%\nD12*\nX0Y0D03*\nM02*\n`;
  const g = leggiGerber(t, 'm');
  assert.match(g.defs, /<circle/);
  assert.match(g.corpo, /class="cancella"/);
});

// ───────────── forature ─────────────

test('foratura Excellon metrica: refori da 0,7 mm in su, vias sotto, non metallizzati a parte', () => {
  const pth = `M48\nMETRIC,TZ\nT1C0.300\nT2C1.000\n%\nT1\nX1.0Y1.0\nX2.0Y1.0\nT2\nX5.0Y5.0\nX6.0Y5.0\nX7.0Y5.0\nM30\n`;
  assert.ok(sembraForatura(pth));
  const f = leggiForatura('scheda-PTH.drl', pth);
  const npth = leggiForatura('scheda-NPTH.drl', `M48\nMETRIC,TZ\nT1C3.200\n%\nT1\nX0.0Y0.0\nM30\n`);
  assert.deepEqual(contaRefori([f, npth]), { refori: 3, vias: 2, nonMetallizzati: 1 });
});

test('foratura Allegro senza "T": misure e quantità dai commenti Holesize', () => {
  const t = `;   Holesize 1. = 12.000000 Tolerance = +2.000000/-2.000000 PLATED MILS Quantity = 2
;   Holesize 2. = 40.000000 Tolerance = +2.000000/-2.000000 PLATED MILS Quantity = 1
X1000Y1000\nX2000Y1000\nX3000Y3000\nM30\n`;
  assert.ok(sembraForatura(t));
  const f = leggiForatura('scheda-1-4.drl', t);
  assert.deepEqual(f.punte.map(p => [p.codice, p.fori]), [['T1', 2], ['T2', 1]]);
  assert.deepEqual(contaRefori([f]), { refori: 1, vias: 2, nonMetallizzati: 0 });
});

// ───────────── GenCAD ─────────────

const GENCAD = `$HEADER
GENCAD 1.4
UNITS MM
$ENDHEADER
$PADSTACKS
PADSTACK "PTH_1MM" 1.0
PADSTACK "SMD_PAD" 0
$ENDPADSTACKS
$SHAPES
SHAPE "RELE"
INSERT TH
PIN 1 "PTH_1MM" 0 0 TOP 0 0
PIN 2 "PTH_1MM" 5 0 TOP 0 0
PIN 3 "PTH_1MM" 10 0 TOP 0 0
SHAPE "R0603"
INSERT SMD
PIN 1 "SMD_PAD" 0 0 TOP 0 0
PIN 2 "SMD_PAD" 1.6 0 TOP 0 0
$ENDSHAPES
$COMPONENTS
COMPONENT K1
PLACE 40 30
LAYER TOP
ROTATION 90
SHAPE "RELE" 0 0
ATTRIBUTE K1 Mounting_Type SMT
COMPONENT R1
PLACE 12 20
LAYER BOTTOM
ROTATION 0
SHAPE "R0603" 0 0
$ENDCOMPONENTS
`;

test('GenCAD: THT dalle piazzole con foro, anche se il CAD dichiara SMT', () => {
  const { componenti } = leggiGenCad(GENCAD);
  const k1 = componenti.find(c => c.ref === 'K1')!, r1 = componenti.find(c => c.ref === 'R1')!;
  assert.equal(k1.tht, true); assert.equal(k1.piediniTht, 3); assert.equal(k1.montaggioDichiarato, 'SMT');
  assert.equal(r1.tht, false); assert.equal(r1.lato, 'BOT');
});

// ───────────── classificazione ─────────────

test('riconoscimento dei file e degli strati', () => {
  assert.equal(tipoFile('layout.pdf', null), 'pdf');
  assert.equal(tipoFile('bom.xlsx', null), 'bom');
  assert.equal(tipoFile('x.gtl', `%FSLAX24Y24*%\n%MOMM*%\n%ADD10C,1.0*%\nD10*\nX0Y0D03*\nM02*\n`), 'gerber');
  assert.deepEqual(ruoloStrato('scheda.gtl'), { ruolo: 'rame', lato: 'TOP' });
  assert.deepEqual(ruoloStrato('scheda.gbs'), { ruolo: 'maschera', lato: 'BOT' });
  assert.equal(ruoloStrato('scheda_GND_Negative.GP1').ruolo, 'interno');
  // nomi senza estensione con il numero del lato (RFQ M0929-C, 29/10/2026)
  assert.deepEqual(ruoloStrato('gerber/m0929c_pa1'), { ruolo: 'pasta', lato: 'TOP' });
  assert.deepEqual(ruoloStrato('gerber/m0929c_so1'), { ruolo: 'maschera', lato: 'TOP' });
  assert.deepEqual(ruoloStrato('gerber/m0929c_cu2'), { ruolo: 'rame', lato: 'BOT' });
  assert.deepEqual(ruoloStrato('x.art', '%TF.FileFunction,Paste,Bot*%'), { ruolo: 'pasta', lato: 'BOT' });
  assert.equal(ruoloStrato('SCHEDA_OUTLINE.art').ruolo, 'contorno');
});

// ───────────── incrocio (regole di Adriano, 27/10/2026) ─────────────

const pos = (ref: string, lato: 'TOP' | 'BOT', valore: string, footprint: string, x: number, y = 10) => ({ ref, valore, footprint, x, y, rot: 0, lato });
const lettura = (posizioni: ReturnType<typeof pos>[]) => ({ formato: 'prova', unita: 'mm' as const, posizioni, fiducial: [{ x: 1, y: 1, lato: 'TOP' as const }], avvisi: [] });
const bomDa = (righe: string[][]) => ({ nome: 'bom.xlsx', righe: leggiBomScheda(righe).righe });

test('valori dei passivi in numero', () => {
  assert.equal(numeroPassivo('4K7'), 4700);
  assert.ok(Math.abs(numeroPassivo('100n')! - 1e-7) < 1e-15);
  assert.equal(numeroPassivo('0R'), 0);
  assert.equal(numeroPassivo('ABC'), null);
});

test('stesso componente: valore, P/N, codice produttore diverso', () => {
  assert.ok(stessoComponente({ pn: 'GCM188R71H104KA57D', valore: '100n' }, 'C_100N_0603'));
  assert.ok(!stessoComponente({ pn: 'LTST-C191KRKT', valore: 'LED rosso' }, 'LTST-S270KRKT'));
  assert.ok(stessoComponente({ pn: 'CONN-123', valore: 'CONN' }, 'Exposed PAD'));
});

test('SMD su un lato solo: THT a onda, stagno della saldatrice dai refori', () => {
  const a = analizzaScheda({
    bom: bomDa([['Designator', 'Quantity', 'Value', 'Manufacturer P/N', 'Footprint'],
      ['C1, C2', '2', '100n', 'GCM188R71H104', 'C0603'], ['R1', '1', '10k', 'RC0603FR-0710K', 'R0603'], ['J1', '1', 'MORSETTO', 'PHX-123', 'TERMINAL_2P']]),
    pickPlace: [{ nome: 'pp.txt', lettura: lettura([pos('C1', 'TOP', '100n', 'C0603', 1), pos('C2', 'TOP', '100n', 'C0603', 5), pos('R1', 'TOP', '10k', 'R0603', 9)]) }],
    forature: [{ nome: 'f.drl', foratura: leggiForatura('f-PTH.drl', `M48\nMETRIC,TZ\nT1C1.000\n%\nT1\nX1.0Y1.0\nX3.0Y1.0\nM30\n`) }],
  });
  assert.equal(a.conteggi.smdTop, 3); assert.equal(a.conteggi.smdBot, 0); assert.equal(a.conteggi.tht, 1);
  assert.equal(a.conteggi.feederTop, 2);
  assert.equal(a.lavorazione.latiSmd, 1); assert.equal(a.lavorazione.saldaturaTht, 'onda');
  assert.equal(a.conteggi.refori, 2);
  assert.equal(a.consumi.stagnoOndaGrammi, +(2 * CONSUMI.ondaGrammiForo * (1 + CONSUMI.ondaScorie)).toFixed(3));
  assert.equal(a.consumi.filoGrammi, 0);
  assert.equal(a.componenti.find(c => c.ref === 'C1')!.codiceCliente, 'GCM188R71H104');
});

test('SMD su tutti e due i lati: THT saldati a mano, filo a piedino', () => {
  const { componenti } = leggiGenCad(GENCAD);
  const a = analizzaScheda({
    pickPlace: [{ nome: 'pp.txt', lettura: lettura([pos('R1', 'BOT', '10k', 'R0603', 12, 20), pos('R2', 'TOP', '10k', 'R0603', 30, 20)]) }],
    cad: { nome: 'x.cad', componenti },
  });
  assert.equal(a.lavorazione.latiSmd, 2);
  assert.equal(a.lavorazione.saldaturaTht, 'mano');
  assert.equal(a.conteggi.refori, 3, 'piedini THT del relè dal file CAD');
  assert.equal(a.consumi.filoGrammi, 3 * CONSUMI.filoGrammiPiedino);
});

test('incrocio: valore diverso, riferimento mancante, montaggio dichiarato sbagliato', () => {
  const { componenti } = leggiGenCad(GENCAD);
  const a = analizzaScheda({
    bom: bomDa([['Designator', 'Quantity', 'Value', 'Manufacturer P/N', 'Mounting Type'],
      ['K1', '1', 'RELE 5V', 'G5Q-1A', 'SMT'], ['R1', '1', '10k', 'RC0603FR-0710K', 'SMT'], ['C9', '1', '1u', 'GRM188R61E105', 'SMT']]),
    pickPlace: [{ nome: 'pp.txt', lettura: lettura([pos('K1', 'TOP', 'RELE 5V', 'RELE', 40, 30), pos('R1', 'BOT', '22k', 'R0603', 12, 20), pos('U7', 'BOT', 'LM358', 'SO8', 20, 20)]) }],
    cad: { nome: 'x.cad', componenti },
  });
  const errori = a.segnalazioni.filter(s => s.livello === 'errore');
  const con = (ref: string) => errori.some(s => s.refs?.includes(ref));
  assert.ok(con('R1'), 'valore diverso tra BOM (10k) e pick and place (22k)');
  assert.ok(con('C9'), 'SMD nella BOM ma non nel pick and place');
  assert.ok(con('U7'), 'nel pick and place ma non nella BOM');
  assert.ok(con('K1'), 'la BOM dice SMT, il CAD ha i fori: è THT');
  assert.equal(a.componenti.find(c => c.ref === 'K1')!.tipo, 'THT');
});

test('fiducial uguali su lati diversi restano due', () => {
  const l = { ...lettura([pos('R1', 'TOP', '10k', 'R0603', 5)]), fiducial: [{ x: 1, y: 1, lato: 'TOP' as const }, { x: 1, y: 1, lato: 'BOT' as const }] };
  const a = analizzaScheda({ pickPlace: [{ nome: 'pp.txt', lettura: l }] });
  assert.equal(a.conteggi.fiducialTop, 1); assert.equal(a.conteggi.fiducialBot, 1);
});

// ───────────── preventivo da validare, piazzole IPC, documentazione (Adriano 28/10/2026) ─────────────

test('preventivo dai documenti: lato unico, onda, item con il PCB', () => {
  const a = analizzaScheda({
    bom: bomDa([['Designator', 'Quantity', 'Value', 'Manufacturer P/N', 'Footprint'],
      ['C1, C2', '2', '100n', 'GCM188R71H104', 'C0603'], ['R1', '1', '10k', 'RC0603FR-0710K', 'R0603'], ['J1', '1', 'MORSETTO', 'PHX-123', 'TERMINAL_2P']]),
    pickPlace: [{ nome: 'pp.txt', lettura: lettura([pos('C1', 'BOT', '100n', 'C0603', 1), pos('C2', 'BOT', '100n', 'C0603', 5), pos('R1', 'BOT', '10k', 'R0603', 9)]) }],
    forature: [{ nome: 'f.drl', foratura: leggiForatura('f-PTH.drl', `M48\nMETRIC,TZ\nT1C1.000\n%\nT1\nX1.0Y1.0\nX3.0Y1.0\nM30\n`) }],
  });
  const { parametri, daControllare } = parametriDaAnalisi(a);
  assert.equal(parametri.doppiaFaccia, 0);
  assert.equal(parametri.qtSmd, 3, 'SMD tutti sul BOTTOM del cliente: per noi lato unico');
  assert.equal(parametri.qtFeeder, 2);
  assert.equal(parametri.qtSmdLatoB, 0);
  assert.equal(parametri.nLamine, 1);
  assert.equal(parametri.usaOnda, 1); assert.equal(parametri.presenteTht, 0);
  assert.equal(parametri.qntCompMontaggio, 1);
  assert.equal(parametri.stagnoPerSaldature, 2 * CONSUMI.ondaGrammiForo);
  assert.equal(parametri.nItemMateriale, a.conteggi.item);
  assert.ok(daControllare.some(d => /lamine/.test(d)));
});

test('preventivo dai documenti: due lati SMD, THT a mano', () => {
  const { componenti } = leggiGenCad(GENCAD);
  const a = analizzaScheda({
    pickPlace: [{ nome: 'pp.txt', lettura: lettura([pos('R1', 'BOT', '10k', 'R0603', 12, 20), pos('R2', 'TOP', '10k', 'R0603', 30, 20)]) }],
    cad: { nome: 'x.cad', componenti },
  });
  const { parametri } = parametriDaAnalisi(a);
  assert.equal(parametri.doppiaFaccia, 1);
  assert.equal(parametri.qtSmd, 1); assert.equal(parametri.qtSmdLatoB, 1);
  assert.equal(parametri.nLamine, 2);
  assert.equal(parametri.presenteTht, 1); assert.equal(parametri.usaOnda, 0);
  assert.equal(parametri.qntPuntiSaldaturaMano, 3);
  assert.equal(parametri.stagnoInFilo, 3 * CONSUMI.filoGrammiPiedino);
});

/** Coppia di piazzole rettangolari IPC del case, orizzontale, centrata in (x, y). */
const coppia = (k: string, x: number, y: number): Piazzola[] => {
  const n = PIAZZOLE_IPC[k];
  return [-1, 1].map(s => ({ x: x + s * n.passo / 2, y, w: n.lunghezza, h: n.larghezza }));
};

test('piazzole: 0805 sul Gerber e 0603 in BOM si segnala, quelle giuste no', () => {
  const piazzole = { TOP: [...coppia('0805', 10, 10), ...coppia('0603', 20, 10), ...coppia('0402', 30, 10)] };
  const esiti = controllaPiazzole([
    { ref: 'C1', lato: 'TOP', x: 10, y: 10, caseAtteso: '0603' },
    { ref: 'C2', lato: 'TOP', x: 20, y: 10, caseAtteso: '0603' },
    { ref: 'C3', lato: 'TOP', x: 30, y: 10, caseAtteso: '0402' },
    { ref: 'C4', lato: 'TOP', x: 50, y: 50, caseAtteso: '0603' },
  ], piazzole);
  const di = (r: string) => esiti.find(e => e.ref === r)!;
  assert.equal(di('C1').ok, false); assert.equal(di('C1').caseSimile, '0805');
  assert.equal(di('C2').ok, true);
  assert.equal(di('C3').ok, true);
  assert.equal(di('C4').ok, null, 'piazzole non trovate: niente giudizio');
});

test('piazzole: vias tonde e componenti a 3 terminali non si misurano', () => {
  const tonde = coppia('0603', 10, 10).map(p => ({ ...p, tonda: true }));
  assert.equal(misuraPiazzole(10, 10, tonde, '0603'), null);
  const treTerminali = [...coppia('1206', 10, 10), { x: 10, y: 10, w: 0.8, h: 1.6 }];
  assert.equal(misuraPiazzole(10, 10, treTerminali, '1206'), null);
});

test('piazzole nell\'analisi: segnalazione d\'errore sul componente', () => {
  const a = analizzaScheda({
    bom: bomDa([['Designator', 'Quantity', 'Value', 'Manufacturer P/N', 'Footprint'], ['C1', '1', '100n', 'GCM188R71H104', 'C0603']]),
    pickPlace: [{ nome: 'pp.txt', lettura: lettura([pos('C1', 'TOP', '100n', 'C0603', 10, 10)]) }],
    piazzole: { TOP: coppia('0805', 10, 10) },
  });
  assert.deepEqual(a.piazzole, { controllati: 1, misurati: 1, diversi: 1 });
  assert.ok(a.componenti.find(c => c.ref === 'C1')!.segnalazioni.some(s => /piazzole da 0805/.test(s)));
  assert.ok(a.segnalazioni.some(s => s.livello === 'errore' && s.refs?.includes('C1')));
});

test('Gerber: piazzole dai flash (rettangoli e macro), le tonde segnate', () => {
  const t = `%FSLAX34Y34*%\n%MOMM*%\n%AMPAD*21,1,1.0,0.6,0,0,0*%\n%ADD10R,1.03X1.40*%\n%ADD11C,0.6*%\n%ADD12PAD*%\nD10*\nX100000Y100000D03*\nD11*\nX200000Y100000D03*\nD12*\nX300000Y100000D03*\nM02*\n`;
  const g = leggiGerber(t);
  assert.equal(g.piazzole.length, 3);
  const [r, c, m] = g.piazzole;
  assert.deepEqual([r.x, r.y, r.w, r.h], [10, 10, 1.03, 1.4]);
  assert.equal(c.tonda, true);
  assert.ok(Math.abs(m.w - 1) < 1e-6 && Math.abs(m.h - 0.6) < 1e-6 && !m.stimata, 'macro: misure dal suo ingombro');
});

test('GenCAD: piedino 1 ruotato e specchiato sul lato BOTTOM', () => {
  const t = `$HEADER\nUNITS MM\n$ENDHEADER\n$PADSTACKS\nPADSTACK "SMD" 0\n$ENDPADSTACKS\n$SHAPES\nSHAPE "D_SOD"\nINSERT SMD\nPIN 1 "SMD" -0.8 0 TOP 0 0\nPIN 2 "SMD" 0.8 0 TOP 0 0\n$ENDSHAPES\n$COMPONENTS
COMPONENT D1\nPLACE 10 10\nLAYER TOP\nROTATION 90\nSHAPE "D_SOD" 0 0
COMPONENT D2\nPLACE 20 10\nLAYER BOTTOM\nROTATION 0\nSHAPE "D_SOD" MIRRORX 0
COMPONENT D3\nPLACE 30 10\nLAYER BOTTOM\nROTATION 90\nSHAPE "D_SOD" MIRRORX 0\n$ENDCOMPONENTS\n`;
  const { componenti } = leggiGenCad(t);
  const p = (r: string) => { const q = componenti.find(c => c.ref === r)!.pin1!; return [+q.x.toFixed(3), +q.y.toFixed(3)]; };
  assert.deepEqual(p('D1'), [10, 9.2]);
  assert.deepEqual(p('D2'), [20.8, 10]);
  assert.deepEqual(p('D3'), [30, 9.2]);
});

test('documentazione: righe per codice, THT colorati, critici con note e segnalazioni', () => {
  const a = analizzaScheda({
    bom: bomDa([['Designator', 'Quantity', 'Value', 'Manufacturer P/N', 'Footprint', 'Note'],
      ['C1, C2', '2', '100n', 'GCM188R71H104', 'C0603', ''], ['D1', '1', 'LED', 'LTST-C191', 'LED0603', 'attenzione al verso'],
      ['J1, J2', '2', 'MORSETTO', 'PHX-123', 'TERMINAL_2P', ''], ['K1', '1', 'RELE', 'G5Q-1A', 'RELE_THT', '']]),
    pickPlace: [{ nome: 'pp.txt', lettura: lettura([pos('C1', 'TOP', '100n', 'C0603', 1), pos('C2', 'TOP', '100n', 'C0603', 5), pos('D1', 'TOP', 'LED', 'LED0603', 9)]) }],
  });
  const top = righeFoglio(a, 'TOP');
  assert.deepEqual(top.map(r => [r.item, r.refs.join(','), r.critico]), [[1, 'C1,C2', false], [2, 'D1', true]]);
  assert.ok(top.every(r => !r.colore));
  assert.equal(righeFoglio(a, 'BOT').length, 0);
  const tht = righeFoglio(a, 'THT');
  assert.deepEqual(tht.map(r => r.refs.join(',')), ['J1,J2', 'K1']);
  assert.notEqual(tht[0].colore, tht[1].colore);
  assert.equal(latoFoglio(a, 'protezioni'), 'BOT', 'le protezioni si guardano dal lato saldature');
});

// ───────────── file KiCad di Trancerie Emiliane (Adriano 28/10/2026), esempio inventato ─────────────

test('KiCad: simbolo Ω in UTF-8, riferimenti con il trattino basso, ponticelli a stagno', async () => {
  process.env.DATABASE_URL ??= 'postgres://solo-per-i-test@localhost/nessuno';
  const { testoDi } = await import('../src/server/schede-cliente-servizio.js');
  const pos = `### Footprint positions\n## Unit = mm, Angle = deg.\n# Ref     Val       Package                X        Y       Rot  Side
R1        10.0kΩ,_0603_SMD   R_0603_1608Metric   10.0  -5.0  180.0  top
C_IN_1    10u       C_0805_2012Metric   20.0  -5.0    0.0  top
J_RS232   Opened    SolderJumper-2_P1.3mm_Open_Pad1.0x1.5mm   30.0  -5.0  0.0  top\n`;
  const testo = testoDi(Buffer.from(pos, 'utf8'));
  assert.ok(testo.includes('10.0kΩ'), 'letto come UTF-8');
  assert.equal(testoDi(Buffer.from('R1 10kµ', 'latin1')), 'R1 10kµ', 'file non UTF-8: Latin-1');
  const l = leggiPickPlace('scheda-all.pos', testo);
  assert.deepEqual(l.posizioni.map(p => p.ref), ['R1', 'C_IN_1']);
  assert.ok(l.avvisi.some(a => /J_RS232/.test(a)));
  const a = analizzaScheda({
    bom: bomDa([['Reference', 'Qty', 'Value', 'Manufacturer Part Number', 'Footprint'],
      ['R1', '1', '10.0kΩ, 0603 SMD', 'RC0603FR-0710KL', 'R_0603'], ['C_IN_1', '1', '10u', 'GRM21BR61E106', 'C_0805']]),
    pickPlace: [{ nome: 'scheda-all.pos', lettura: l }],
  });
  assert.deepEqual(a.segnalazioni.filter(s => s.livello === 'errore'), []);
});

test('segnalazione "Va bene": non conta più e i componenti non sono più critici', () => {
  const a = analizzaScheda({
    bom: bomDa([['Designator', 'Quantity', 'Value', 'Manufacturer P/N', 'Footprint'], ['R1', '1', '10k', 'RC0603FR-0710K', 'R0603'], ['R2', '1', '4k7', 'RC0603FR-074K7', 'R0603']]),
    pickPlace: [{ nome: 'pp.txt', lettura: lettura([pos('R1', 'TOP', '22k', 'R0603', 1), pos('R2', 'TOP', '4k7', 'R0603', 5)]) }],
  });
  const errore = a.segnalazioni.find(s => s.livello === 'errore' && s.refs?.includes('R1'))!;
  assert.ok(errore);
  assert.ok(righeFoglio(a, 'TOP').find(r => r.refs.includes('R1'))!.critico);
  const b = conAccettate(a, { [chiaveSegnalazione(errore)]: { da: 'ADRIANO', il: '2026-10-28' } });
  assert.equal(b.segnalazioni.find(s => s.testo === errore.testo)!.accettata?.da, 'ADRIANO');
  assert.deepEqual(b.componenti.find(c => c.ref === 'R1')!.segnalazioni, []);
  assert.ok(!righeFoglio(b, 'TOP').find(r => r.refs.includes('R1'))!.critico);
  assert.ok(!parametriDaAnalisi(b).daControllare.some(d => /segnalazioni da chiarire/.test(d)));
  assert.equal(a.componenti.find(c => c.ref === 'R1')!.segnalazioni.length, 1, 'l\'analisi salvata non cambia');
});

test('preventivo dai documenti: AOI sui lati con SMD, niente controllo visivo', () => {
  const { componenti } = leggiGenCad(GENCAD);
  const due = analizzaScheda({ pickPlace: [{ nome: 'pp.txt', lettura: lettura([pos('R1', 'BOT', '10k', 'R0603', 12, 20), pos('R2', 'TOP', '10k', 'R0603', 30, 20)]) }], cad: { nome: 'x.cad', componenti } });
  assert.deepEqual([parametriDaAnalisi(due).parametri.aoiTop, parametriDaAnalisi(due).parametri.aoiBot, parametriDaAnalisi(due).parametri.controlloVisivo], [1, 1, 0]);
  const uno = analizzaScheda({ pickPlace: [{ nome: 'pp.txt', lettura: lettura([pos('R1', 'BOT', '10k', 'R0603', 12, 20)]) }] });
  assert.deepEqual([parametriDaAnalisi(uno).parametri.aoiTop, parametriDaAnalisi(uno).parametri.aoiBot], [1, 0], 'lato unico (anche se è il BOTTOM del cliente) = AOI TOP');
});

test('BOM quotata per il preventivo: problemi da risolvere prima della quota', async () => {
  process.env.DATABASE_URL ??= 'postgres://solo-per-i-test@localhost/nessuno';
  const { problemiBom, ESITI } = await import('../src/server/codifica-servizio.js');
  const riga = (esito: string, extra: object = {}) => ({ esito, note: [], ...extra }) as any;
  assert.deepEqual(problemiBom([riga(ESITI.DB), riga(ESITI.NON_MONTATO)], { senzaPrezzo: 0, nonDisponibili: 0 }), []);
  const p = problemiBom([riga(ESITI.INC), riga(ESITI.NUOVO_VER), riga(ESITI.DB, { reperibilita: { livello: 'critico' } }), riga(ESITI.INC, { clienteFornisce: true })],
    { senzaPrezzo: 2, nonDisponibili: 1 });
  assert.deepEqual(p, ['1 riga da completare', '1 codice da validare', '2 righe senza prezzo', '1 componente non disponibile', '1 componente con reperibilità critica']);
});

test('cartella del cliente: si caricano solo i file utili, il resto resta sul Drive con il solo nome', () => {
  const MB = 1024 * 1024;
  const { carica, soloElenco } = scegliFile([
    { nome: '3D/scheda.step', byte: 83 * MB },          // il file che dava "troppo grande"
    { nome: '3D/scheda.pdf', byte: 10 * MB },
    { nome: 'PDF/foto.tif', byte: MB },
    { nome: 'ODBpp/scheda.tgz', byte: 2 * MB },
    { nome: 'DOC/legenda.doc', byte: 20000 },
    { nome: 'Gerber/template.dsn', byte: 1500 },
    { nome: 'desktop.ini', byte: 352 },
    { nome: 'Gerber/OLD/L1_TOP.gdo', byte: 1000 },
    { nome: 'odb/matrix/matrix', byte: 500 }, { nome: 'odb/steps/pcb/layers/top/features', byte: 9000 },
    { nome: 'EC/BOM.xlsx', byte: 100000 },
    { nome: 'GenCAD/gencad.cad', byte: 2.5 * MB },
    { nome: 'Gerber/L1_TOP.gdo', byte: 160000 },
    { nome: 'gerber/lcz', byte: 800000 },                 // senza estensione: si capisce dal contenuto
    { nome: 'P&P/vb_ais.txt', byte: 38000 },
    { nome: 'tutto.zip', byte: 40 * MB },
    { nome: 'enorme.zip', byte: 90 * MB },
    { nome: 'enorme.gbr', byte: MAX_FILE + 1 },
  ]);
  assert.deepEqual(carica, ['EC/BOM.xlsx', 'GenCAD/gencad.cad', 'Gerber/L1_TOP.gdo', 'gerber/lcz', 'P&P/vb_ais.txt', 'tutto.zip']);
  assert.ok(!soloElenco.some(f => f.nome === 'desktop.ini'), 'i file di sistema non compaiono');
  assert.equal(soloElenco.find(f => f.nome === '3D/scheda.step')?.byte, 83 * MB);
  assert.equal(soloElenco.find(f => f.nome === 'enorme.zip')?.motivo, TROPPO_GRANDE);
  assert.equal(soloElenco.find(f => f.nome === 'enorme.gbr')?.motivo, TROPPO_GRANDE);
  assert.equal(soloElenco.find(f => f.nome === 'Gerber/OLD/L1_TOP.gdo')?.motivo, VERSIONI_VECCHIE);
  assert.ok(soloElenco.some(f => f.nome === 'odb/steps/pcb/layers/top/features'));
  assert.equal(sceltaFile('archivio.rar', 1000).carica, false);
  assert.deepEqual(sceltaFile('Armadi/Armadi_1001_1_TOP.txt', 400), { carica: false, motivo: CARTELLA_CASTELTECH });
  assert.equal(sceltaFile('Topografico/1001_TOP.af', 800000).carica, false);
});

test('file già lavorati da Casteltech (codici di produzione) non sono del cliente', () => {
  const nostro = ['Colonna1;Colonna2;Colonna3;Colonna4;Colonna5;Colonna8',
    ...Array.from({ length: 8 }, (_, i) => `C${i + 1};C_100N_50V_X7R_0402_10TOL;180;${10 + i}.5;20.1;CC-0402-100NF-10-X7R-50V`)].join('\n');
  assert.ok(lavoratoDaCasteltech(nostro));
  const cliente = ['Designator;Comment;X;Y;Rotation', ...Array.from({ length: 8 }, (_, i) => `R${i + 1};10K;${i}.0;5.0;0`)].join('\n');
  assert.ok(!lavoratoDaCasteltech(cliente));
});

test('strati PADS: L1_TOP e L4_BOTTOM sono rame esterno, L2 interno', () => {
  assert.deepEqual(ruoloStrato('Gerber/L1_TOP.gdo'), { ruolo: 'rame', lato: 'TOP' });
  assert.deepEqual(ruoloStrato('Gerber/L4_BOTTOM.gdo'), { ruolo: 'rame', lato: 'BOT' });
  assert.equal(ruoloStrato('Gerber/L2.gdo').ruolo, 'interno');
});

test('zip del cliente: si aprono solo i file utili, PDF e 3D restano chiusi con nome e dimensione (memoria del server)', async () => {
  process.env.DATABASE_URL ??= 'postgres://solo-per-i-test@localhost/nessuno';
  const { espandiArchivi } = await import('../src/server/schede-cliente-servizio.js');
  const { zipSync } = await import('fflate');
  const testo = (s: string) => new TextEncoder().encode(s);
  const interno = zipSync({ 'dentro/scheda.drl': testo('M48\nT1C0.8\n%\nT1\nX1Y1\nM30\n') });
  const zip = Buffer.from(zipSync({
    'gerber/top.gbr': testo('G04 prova*\n%FSLAX46Y46*%\nM02*\n'),
    'bom.csv': testo('Ref;Valore\nR1;10K\n'),
    'disegni/assieme.pdf': new Uint8Array(5000),
    '3d/scheda.step': new Uint8Array(3000),
    'OLD/bom.csv': testo('vecchia'),
    'odb/matrix/matrix': testo('STEP {}'),
    'odb/steps/pcb/profile': testo('x'),
    'interno.zip': interno,
  }));
  const file = espandiArchivi([{ nome: 'pacchetto.zip', dati: zip }]);
  const aperti = file.filter(f => f.conservato !== false).map(f => f.nome).sort();
  assert.deepEqual(aperti, ['pacchetto/bom.csv', 'pacchetto/gerber/top.gbr', 'pacchetto/interno/dentro/scheda.drl']);
  const chiusi = Object.fromEntries(file.filter(f => f.conservato === false).map(f => [f.nome, f.byte]));
  assert.equal(chiusi['pacchetto/disegni/assieme.pdf'], 5000, 'PDF: solo nome e dimensione');
  assert.equal(chiusi['pacchetto/3d/scheda.step'], 3000);
  assert.ok('pacchetto/OLD/bom.csv' in chiusi, 'cartella vecchia non aperta');
  assert.ok('pacchetto/odb/matrix/matrix' in chiusi && 'pacchetto/odb/steps/pcb/profile' in chiusi, 'ODB++ non aperto');
});

test('M0929-C (Control Systems, 29/10/2026): centri in pollici, BOM a colonne fisse, pick and place con un\'altra origine', async () => {
  const { allineaAlRame } = await import('../src/engine/scheda/allinea.js');
  const { leggiBomColonneFisse } = await import('../src/engine/codifica/bom.js');
  // centri: X Y lato rotazione unità, poi le coordinate in centomillesimi di mm
  const pp = leggiPickPlace('centri.txt', ' U23 0.7875 0.625 1 270 IN 2000250 1587500 \r\n R74 3.05 1.475 1 90 IN 7747000 3746500 \r\n C1 5.5 1.3 2 0 IN 13970000 3302000 \r\n');
  assert.equal(pp.unita, 'inch');
  assert.deepEqual(pp.posizioni.map(p => [p.ref, Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100, p.rot, p.lato]),
    [['U23', 20, 15.88, 270, 'TOP'], ['R74', 77.47, 37.47, 90, 'TOP'], ['C1', 139.7, 33.02, 0, 'BOT']]);
  // BOM stampata a colonne fisse con i puntini e le righe di pagina
  const bom = leggiBomColonneFisse([
    '          CONTROL SYSTEMS SRL                                   29.10.2026',
    '         Reference        NxU.M.    Componente                           Costruttore              Descrizione componente',
    '',
    '         C1                         C0402C220J5GAC.....................  Kemet................... Condensatore smd (0402) 22pF 50V 5%',
    '         JSER1                      LU003505-R.........................  ADIMPEX................. Connettore subminiatura D, 9 poli',
    '                                                                                                    Pag.  di ',
  ].join('\n'))!;
  assert.deepEqual(bom.slice(1), [['C1', '', 'C0402C220J5GAC', 'Kemet', 'Condensatore smd (0402) 22pF 50V 5%'],
    ['JSER1', '', 'LU003505-R', 'ADIMPEX', 'Connettore subminiatura D, 9 poli']]);
  assert.equal(leggiBomColonneFisse('Reference;Value;Footprint\nR1;10k;0603\n'), null);
  // allineamento: chip 0402 (piazzole a ±0,5 mm) su una scheda spostata di 101,6 / 203,2 mm, con le piazzole dei vicini a 1,27 mm
  const comp = Array.from({ length: 30 }, (_, i) => ({ x: 5 + (i % 10) * 6, y: 5 + Math.floor(i / 10) * 2.54 }));
  const piazzole = comp.flatMap(c => [-0.53, 0.53].map(d => ({ x: c.x + 101.6 + d, y: c.y + 203.2, w: 0.56, h: 0.76 })));
  const s = allineaAlRame(comp, piazzole)!;
  assert.deepEqual([s.dx, s.dy], [101.6, 203.2]);
  // già allineati: niente spostamento
  assert.equal(allineaAlRame(comp.map(c => ({ x: c.x + 101.6, y: c.y + 203.2 })), piazzole), null);
});

// ───────────── LPS Zapper (30/10/2026): esempi inventati con la stessa forma dei file ─────────────

test('Allegro vecchio senza "!": "m" = mirror = lato BOT, unità da UUNITS', () => {
  const t = `UUNITS = MILLIMETERS
L2                   -16.8435      27.8210        0    ANTNFC2
R1                   -30.4083      -2.3717      180  m RES_0603
J2                   -47.8180      21.9065        0  m FPC_24
SW1                  -48.9694      19.0187        0    TACTILEWURTH
`;
  const l = leggiPickPlace('place_txt.txt', t);
  assert.equal(l.formato, 'Allegro (senza separatori)');
  assert.deepEqual(l.posizioni.map(p => [p.ref, p.lato, p.footprint]), [['L2', 'TOP', 'ANTNFC2'], ['R1', 'BOT', 'RES_0603'], ['J2', 'BOT', 'FPC_24'], ['SW1', 'TOP', 'TACTILEWURTH']]);
  assert.equal(l.posizioni[1].rot, 180);
});

test('strati CAM350 con nomi attaccati: pastetop, maskbot, bot, int2', () => {
  assert.deepEqual(ruoloStrato('pastetop.gbr'), { ruolo: 'pasta', lato: 'TOP' });
  assert.deepEqual(ruoloStrato('masktop.gbr'), { ruolo: 'maschera', lato: 'TOP' });
  assert.deepEqual(ruoloStrato('maskbot.gbr'), { ruolo: 'maschera', lato: 'BOT' });
  assert.deepEqual(ruoloStrato('silktop.gbr'), { ruolo: 'serigrafia', lato: 'TOP' });
  assert.deepEqual(ruoloStrato('bot.gbr'), { ruolo: 'rame', lato: 'BOT' });
  assert.deepEqual(ruoloStrato('int2.gbr'), { ruolo: 'interno', lato: null });
});

test('Gerber con molte macro prima delle aperture è comunque un Gerber', () => {
  const macro = Array.from({ length: 800 }, (_, i) => `%AMDATA${i}*\n20,1,0.1000000,-2.4750000,0.1687500,-1.8750000,0.1687500,0.0000000*%`).join('\n');
  const t = `G04 CAM350*\n%FSLAX33Y33*%\n%MOMM*%\n${macro}\n%ADD10C,0.100*%\nD10*\nX1000Y1000D03*\nM02*`;
  assert.ok(t.indexOf('%ADD') > 20000);
  assert.ok(sembraGerber(t));
});

test('BOM con "Non Montare" nella colonna Note e componenti solo nel pick and place: non si contano', () => {
  const bom = leggiBomScheda([
    ['#', 'Qty', 'Reference', 'Part', 'Package', 'Note'],
    ['1', '1', 'C1', '10uF', 'cap_0603', ''],
    ['2', '1', 'C2', '4u7F', 'res_0603', 'Non Montare'],
    ['3', '2', 'R1,R2', '10K', 'res_0603', ''],
  ]);
  assert.deepEqual(bom.righe.map(r => r.montato), [true, false, true]);
  const pos = (ref: string) => ({ ref, valore: '', footprint: 'RES_0603', x: 1, y: 1, rot: 0, lato: 'TOP' as const });
  const a = analizzaScheda({ bom: { nome: 'bom.xlsx', righe: bom.righe },
    pickPlace: [{ nome: 'place_txt.txt', lettura: { formato: 'x', unita: 'mm', posizioni: ['C1', 'C2', 'R1', 'R2', 'J1', 'TP1'].map(pos), fiducial: [], avvisi: [] } }] });
  assert.equal(a.conteggi.smdTop, 3);   // C1, R1, R2: C2 non montato, J1 e TP1 non sono nella BOM
  assert.ok(a.segnalazioni.some(s => s.livello === 'errore' && s.refs?.includes('J1')));
  assert.ok(a.componenti.find(c => c.ref === 'J1')!.segnalazioni.some(s => s.includes('non è nella BOM')));
});
