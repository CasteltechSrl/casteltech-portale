/**
 * Prepara righe_fornitori.json.gz dall'archivio XML delle fatture dei fornitori di Fatture in Cloud (Adriano 6/11/2026, "lo storico riga per riga").
 * Legge gli zip fornitori_<anno>.zip (un file per fattura: XML, XML firmato .p7m o PDF; nome "AAAA-MM-GG_Nome_<id FIC>_<P.IVA>_<xxxxx>.ext"),
 * estrae le righe (DettaglioLinee) con le regole di engine/righe-fattura.ts e scrive il file da caricare in
 * Impostazioni → Amministrazione → "Righe delle fatture dei fornitori". I dati reali restano fuori dal repository.
 *
 *   npx tsx tools/righe-fornitori-da-xml.ts <cartella con gli zip> <file di uscita .json.gz>
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { unzipSync } from 'fflate';
import { datiFattureRicevute, xmlDaFile } from '../src/engine/fattura-ricevuta.js';
import { righeFattureDaXml, TRASMITTENTE_FIC } from '../src/engine/righe-fattura.js';

const [cartella, uscita] = process.argv.slice(2);
if (!cartella || !uscita) { console.error('Uso: npx tsx tools/righe-fornitori-da-xml.ts <cartella zip> <uscita.json.gz>'); process.exit(1); }

const documenti: unknown[] = [];
let pdf = 0, errori = 0, righeTotali = 0;
for (const zipNome of readdirSync(cartella).filter(n => /^fornitori_\d{4}\.zip$/.test(n)).sort()) {
  const zip = unzipSync(readFileSync(join(cartella, zipNome)));
  let n = 0;
  for (const [percorso, contenuto] of Object.entries(zip)) {
    const nome = percorso.split('/').pop() ?? '';
    if (!contenuto.length || nome.startsWith('.')) continue;
    if (/\.pdf$/i.test(nome)) { pdf++; continue; }
    const m = /^(\d{4}-\d{2}-\d{2})_.*?_(\d{6,})_([A-Za-z0-9]*)_[^_]*\.(xml|p7m)(\.xml)?$/i.exec(nome);
    try {
      const xml = xmlDaFile(Buffer.from(contenuto));
      const fatture = datiFattureRicevute(xml);
      const righe = righeFattureDaXml(xml);
      fatture.forEach((f, i) => {
        documenti.push({ fic_id: m ? Number(m[2]) : null, numero: f.numero, data: f.data, piva: f.fornitore.partita_iva, fornitore: f.fornitore.ragione_sociale, file: nome,
          scrittaInFic: f.trasmittente === TRASMITTENTE_FIC, righe: righe[i] ?? [] });
        righeTotali += righe[i]?.length ?? 0;
        n++;
      });
    } catch (e: any) { errori++; console.error(`${nome}: ${e.message}`); }
  }
  console.log(`${zipNome}: ${n} fatture`);
}
writeFileSync(uscita, gzipSync(Buffer.from(JSON.stringify({ tipo: 'righe_fornitori', generato: new Date().toISOString().slice(0, 10), documenti }))));
console.log(`Scritto ${uscita}: ${documenti.length} fatture, ${righeTotali} righe; ${pdf} file PDF senza righe, ${errori} file non letti.`);
