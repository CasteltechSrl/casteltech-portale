/**
 * Storico delle buste paga dall'archivio (Adriano 1/11/2026): legge i PDF dei cedolini di una cartella (anche sottocartelle)
 * con `pdftotext -layout` e prepara il file da caricare in Dipendenti → Buste paga → "Storico dei cedolini".
 *
 *   npx tsx tools/cedolini-da-pdf.ts <cartella> <uscita.json.gz> [password dei PDF]
 *
 * Si saltano le cartelle dei cedolini "in prova" e i cedolini divisi per persona (copie dei definitivi).
 * Lo stesso cedolino in più file (rifatti, corretti, da sostituire, separato): vale il file corretto.
 * I dati delle persone NON vanno nel repository: il file si salva fuori (Project Files → dipendenti).
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import { leggiCedolini, unisciCedolini } from '../src/engine/cedolini.js';

const [cartella, uscita, password] = process.argv.slice(2);
if (!cartella || !uscita) { console.error('uso: npx tsx tools/cedolini-da-pdf.ts <cartella> <uscita.json.gz> [password]'); process.exit(1); }

function pdf(dir: string): string[] {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return /prova|divisi/i.test(n) ? [] : pdf(p);
    return /\.pdf$/i.test(n) ? [p] : [];
  });
}
/** I file che correggono un cedolino vengono dopo, così vincono. */
const correzione = (p: string) => (/rifatt|corrett|sostitu|separato/i.test(p) ? 1 : 0);
const file = pdf(cartella).filter(p => !/nota|ferie|welfare|costi/i.test(relative(cartella, p)))
  .sort((a, b) => correzione(a) - correzione(b) || a.localeCompare(b));

const letti = [];
let pagine = 0;
for (const p of file) {
  const nome = relative(cartella, p);
  const arg = ['-layout', ...(password ? ['-upw', password] : []), p, '-'];
  let testo = '';
  try { testo = execFileSync('pdftotext', arg, { encoding: 'utf8', maxBuffer: 50e6 }); }
  catch { console.log(`NON LETTO  ${nome}`); continue; }
  const cedolini = leggiCedolini(testo, nome);
  pagine += testo.split('\f').filter(s => s.trim()).length;
  console.log(`${String(cedolini.length).padStart(3)} cedolini  ${nome}`);
  for (const c of cedolini) for (const a of c.avvisi) console.log(`      ${c.anno}-${String(c.mese).padStart(2, '0')} ${c.mensilita} ${c.matricola ?? ''}: ${a}`);
  letti.push({ nome, cedolini });
}
const tutti = unisciCedolini(letti);
writeFileSync(uscita, gzipSync(JSON.stringify({ tipo: 'cedolini', creato: new Date().toISOString(), cedolini: tutti })));
const mesi = new Set(tutti.map(c => `${c.anno}-${c.mese}`));
console.log(`\n${file.length} file, ${pagine} pagine, ${tutti.length} cedolini in ${mesi.size} mesi → ${uscita}`);
