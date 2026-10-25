/**
 * Confronta la codifica del portale con il programma Python "Codifica componenti" (core/regole.py, core/decoder.py).
 * Il file dei casi lo genera il Python (P/N reali del database: NON va nel repository):
 *   npx tsx tools/verifica-codifica.ts /percorso/casi.json
 * I casi in cui il Python va in errore (valori illeggibili) si saltano: il portale li gestisce senza fermarsi.
 */
import { readFileSync } from 'node:fs';
import { calcola, progStr } from '../src/engine/codifica/regole.js';
import { daColonneBom, decodificaMpn } from '../src/engine/codifica/decoder.js';

const casi = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const conta: Record<string, { uguali: number; diversi: number; saltati: number }> = {};
const esempi: string[] = [];
const pulisci = (o: any) => JSON.parse(JSON.stringify(o, (_k, v) => (v === undefined ? null : v)));
const uguale = (a: any, b: any) => JSON.stringify(ordina(a)) === JSON.stringify(ordina(b));
function ordina(x: any): any {
  if (Array.isArray(x)) return x.map(ordina);
  if (x && typeof x === 'object') return Object.fromEntries(Object.keys(x).sort().map(k => [k, ordina(x[k])]));
  return x;
}

for (const c of casi) {
  const k = (conta[c.tipo] ??= { uguali: 0, diversi: 0, saltati: 0 });
  if (!('ok' in c.atteso)) { k.saltati++; continue; }
  let ottenuto: any, atteso = c.atteso.ok;
  if (c.tipo === 'decodifica') ottenuto = decodificaMpn(c.pn);
  else if (c.tipo === 'colonne') ottenuto = daColonneBom(c.args[0], ...c.args.slice(1));
  else if (c.tipo === 'prog') ottenuto = [0, 1, 33, 34, 1155, 39303].map(progStr);
  else {
    const r = calcola(c.fam, c.attrs, c.pn);
    ottenuto = { prod: r.prod, prod_bozza: r.prodBozza ?? null, root: r.root, stato: r.stato, note: r.note, descr: r.descr,
      ...(r.attrs ? { attrs: r.attrs, T: r.T, C: r.C, V: r.V } : { mancanti_prod: ['famiglia'] }) };
    if (!r.attrs) delete ottenuto.prod_bozza;
  }
  if (uguale(pulisci(ottenuto), atteso)) k.uguali++;
  else {
    k.diversi++;
    if (esempi.length < 40) esempi.push(`${c.tipo} ${JSON.stringify(c.pn ?? c.args ?? c.attrs)}\n   python: ${JSON.stringify(ordina(atteso))}\n   portale: ${JSON.stringify(ordina(pulisci(ottenuto)))}`);
  }
}
console.log(conta);
for (const e of esempi) console.log(e);
