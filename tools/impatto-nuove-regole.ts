/**
 * Quanto cambiano i prezzi passando dal vecchio catalogo al nuovo: fasi della scheda di produzione,
 * 2 persone su P&P TOP/BOT, forno e onda; pre-produzione a tariffa ufficio; forno fuori linea.
 * Uso: npx tsx tools/impatto-nuove-regole.ts preventivi.json [dal=2025-10-01]
 */
import { readFileSync } from 'node:fs';
import { calcolaPreventivo, type Tariffe } from '../src/engine/calcolo.js';
import { FASI_LEGACY, VOCI_LEGACY, daDocumentoLegacy } from '../src/catalogo/legacy.js';
import { FASI, VOCI } from '../src/catalogo/iniziale.js';
import { importaPreventivoLegacy, variabiliFormule } from '../src/catalogo/import-legacy.js';

const docs: any[] = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const dal = process.argv[3] ?? '2025-10-01';

// 1) il materiale di consumo ricalcolato con la formula del catalogo coincide con quello salvato?
let consumoOk = 0, consumoKo = 0, consumoNonVerificabile = 0;
for (const d of docs) {
  const imp = importaPreventivoLegacy(d);
  if (Object.values(imp.prezziMateriali).some(x => !x)) { consumoNonVerificabile++; continue; }
  const r = calcolaPreventivo([], VOCI.filter(v => v.codice === 'materialeDiConsumo'),
    { costoAziendaH: 0, costoOperatoreProduzioneH: 0, costoOperatoreUfficioH: 0, ricarico: 1 },
    { nSchede: imp.nSchede, parametri: variabiliFormule(imp.parametri, imp.prezziMateriali) });
  const salvato = d.materialiDiConsumo?.costi ?? 0;
  if (Math.abs(Number(r.voci[0].costo.toFixed(2)) - salvato) < 0.011) consumoOk++; else consumoKo++;
}
console.log(`Materiale di consumo: formula identica al vecchio su ${consumoOk} preventivi, diversa su ${consumoKo}, non verificabili (prezzi mancanti, preventivi prima del 21/09/2022): ${consumoNonVerificabile}`);

// 2) impatto sui prezzi
const righe: { cliente: string; codice: string; vecchio: number; nuovo15: number; nuovo35: number; forno: number }[] = [];
for (const d of docs) {
  if ((d.data?.$date ?? '') < dal) continue;
  const old = daDocumentoLegacy(d);
  const vecchio = calcolaPreventivo(FASI_LEGACY, VOCI_LEGACY, old.tariffe, old.input).totali.totalePrimoLotto;
  const imp = importaPreventivoLegacy(d);
  const vars = variabiliFormule(imp.parametri, imp.prezziMateriali);
  // il consumo salvato vince (i vecchi preventivi possono avere prezzi materiali diversi)
  const voci = VOCI.map(v => v.codice === 'materialeDiConsumo' ? { ...v, formulaEuro: 'consumoSalvato' } : v);
  vars.consumoSalvato = d.materialiDiConsumo?.costi ?? 0;
  const t = (uff: number): Tariffe => ({ ...imp.tariffe, costoOperatoreUfficioH: uff });
  const nuovo15 = calcolaPreventivo(FASI, voci, t(imp.tariffe.costoOperatoreProduzioneH), { nSchede: imp.nSchede, parametri: vars }).totali.totalePrimoLotto;
  const nuovo35 = calcolaPreventivo(FASI, voci, t(20), { nSchede: imp.nSchede, parametri: vars }).totali.totalePrimoLotto;
  const conForno = { ...vars, tempoTransitoForno: 240, cadenzaForno: 15, preriscaldamentoForno: 6, potenzaFornoKw: 15, prezzoKwh: 0.4,
    preriscaldamentoOnda: 25, potenzaOndaKw: 15 };
  const forno = calcolaPreventivo(FASI, voci, t(20), { nSchede: imp.nSchede, parametri: conForno }).totali.totalePrimoLotto;
  righe.push({ cliente: imp.cliente, codice: imp.codice, vecchio, nuovo15, nuovo35, forno });
}
const pct = (a: number, b: number) => (b ? (a / b - 1) * 100 : 0);
const media = (f: (r: typeof righe[0]) => number) => righe.reduce((a, r) => a + f(r), 0) / righe.length;
const s = (xs: number[]) => xs.sort((a, b) => a - b);
const d15 = s(righe.map(r => pct(r.nuovo15, r.vecchio))), d35 = s(righe.map(r => pct(r.nuovo35, r.vecchio))), dF = s(righe.map(r => pct(r.forno, r.vecchio)));
const q = (xs: number[], p: number) => xs[Math.floor((xs.length - 1) * p)];
console.log(`\nPreventivi dal ${dal}: ${righe.length}`);
console.log(`Solo P&P BOT a 2 persone, pre-produzione a 15 €:   media ${media(r => pct(r.nuovo15, r.vecchio)).toFixed(2)}%  mediana ${q(d15, .5).toFixed(2)}%  min ${d15[0].toFixed(2)}%  max ${d15.at(-1)!.toFixed(2)}%`);
console.log(`+ pre-produzione a tariffa ufficio 20 €:          media ${media(r => pct(r.nuovo35, r.vecchio)).toFixed(2)}%  mediana ${q(d35, .5).toFixed(2)}%  min ${d35[0].toFixed(2)}%  max ${d35.at(-1)!.toFixed(2)}%`);
console.log(`+ forno fuori linea (4 min + 15 s/pannello, 2 pers.) e energia: media ${media(r => pct(r.forno, r.vecchio)).toFixed(2)}%  mediana ${q(dF, .5).toFixed(2)}%  min ${dF[0].toFixed(2)}%  max ${dF.at(-1)!.toFixed(2)}%`);
console.log('\nEsempi:');
for (const r of righe.slice(-6)) console.log(`  ${r.cliente} ${r.codice}: vecchio ${r.vecchio} € → ${r.nuovo15} (persone) → ${r.nuovo35} (+ ufficio) → ${r.forno} (+ forno)`);
