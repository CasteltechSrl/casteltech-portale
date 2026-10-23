/**
 * Ricalcola tutti i preventivi del vecchio portale col nuovo motore e confronta i totali salvati.
 * Uso:  npx tsx tools/verifica-legacy.ts percorso/preventivi.json
 */
import { readFileSync } from 'node:fs';
import { calcolaPreventivo } from '../src/engine/calcolo.js';
import { FASI_LEGACY, VOCI_LEGACY, daDocumentoLegacy } from '../src/catalogo/legacy.js';

const file = process.argv[2];
if (!file) { console.error('Indica il file preventivi.json'); process.exit(1); }
const docs: any[] = JSON.parse(readFileSync(file, 'utf8'));

const CAMPI: [string, (t: any) => number][] = [
  ['totalePrimoLotto', t => t.totalePrimoLotto],
  ['totaleSecondoLotto', t => t.totaleSecondoLotto],
  ['costiUnaTantum', t => t.costiUnaTantum],
  ['totaleASchedaPrimoLotto', t => t.prezzoSchedaPrimoLotto],
  ['totaleASchedaSecondoLotto', t => t.prezzoSchedaSecondoLotto],
  ['costoOrario', t => t.prezzoOrarioMedio],
  ['guadagnoAlotto', t => t.guadagnoLotto],
];

let ok = 0, maiCalcolati = 0;
const diversi: string[] = [];
for (const d of docs) {
  const tf = d.totaliFinali;
  if (!tf || tf.totalePrimoLotto == null) { maiCalcolati++; continue; }
  const { tariffe, input } = daDocumentoLegacy(d);
  const r = calcolaPreventivo(FASI_LEGACY, VOCI_LEGACY, tariffe, input).totali;
  const diff = CAMPI.filter(([k, f]) => Math.abs((tf[k] ?? 0) - f(r)) > 0.0001)
    .map(([k, f]) => `${k}: salvato ${tf[k]} / nuovo ${f(r)}`);
  if (diff.length) diversi.push(`${d._id.$oid} ${d.cliente} ${d.codice ?? ''} (${d.data?.$date?.slice(0, 10)})\n   ` + diff.join('\n   '));
  else ok++;
}
console.log(`Preventivi: ${docs.length}  |  identici al centesimo: ${ok}  |  diversi: ${diversi.length}  |  mai aperti (senza totali salvati): ${maiCalcolati}`);
if (process.argv.includes('--dettaglio')) console.log(diversi.join('\n'));
else console.log(diversi.slice(0, 15).join('\n'));
