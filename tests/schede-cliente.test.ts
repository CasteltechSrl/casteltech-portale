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
