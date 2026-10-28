/**
 * Controlla gli XML della fattura elettronica generati dal portale con lo schema ufficiale (FatturaPA 1.2.2,
 * file in tools/fatturapa/, scaricato da fatturapa.gov.it). Serve xmllint (pacchetto libxml2-utils).
 *   npx tsx tools/verifica-fatturapa.ts
 * Da rifare a ogni modifica di src/engine/fatturapa.ts.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generaAutofatturaXml, generaFatturaXml } from '../src/engine/fatturapa.js';
import { ALIQUOTE, AZIENDA, ESEMPI, ESEMPI_AUTOFATTURE } from './fatturapa/esempi.js';

const cartella = mkdtempSync(join(tmpdir(), 'fatturapa-'));
const schema = join(import.meta.dirname, 'fatturapa', 'Schema_FatturaPA_1.2.2.xsd');
let sbagliati = 0;
const tutti = [...ESEMPI.map(e => ({ nome: e.nome, genera: () => generaFatturaXml(e.documento, e.cliente, AZIENDA, ALIQUOTE) })),
  ...ESEMPI_AUTOFATTURE.map(e => ({ nome: e.nome, genera: () => generaAutofatturaXml(e.documento, e.fornitore, AZIENDA, ALIQUOTE) }))];
for (const e of tutti) {
  const r = e.genera();
  const file = join(cartella, `${e.nome}.xml`);
  writeFileSync(file, r.xml);
  try {
    execFileSync('xmllint', ['--noout', '--nonet', '--schema', schema, file], { stdio: 'pipe' });
    console.log(`${e.nome}: valido${r.errori.length ? ` (avvisi del portale: ${r.errori.join(' ')})` : ''}`);
  } catch (err: any) {
    sbagliati++;
    console.log(`${e.nome}: NON valido\n${String(err.stderr ?? err)}`);
  }
}
console.log(sbagliati ? `${sbagliati} file non validi` : 'Tutti i file sono validi secondo lo schema ufficiale.');
process.exit(sbagliati ? 1 : 0);
