/**
 * Prepara il file dei prezzi da caricare in Anagrafiche (Adriano 31/10/2026) partendo dai dati di Fatture in Cloud,
 * scaricati fuori dal repository (dati reali: mai nel repository).
 *
 *   npx tsx tools/prezzi-da-fic.ts <prodotti_fic.json> <ordini_fornitore_fic.json> <storico_fic_completo.json.gz> <uscita.json.gz> [differenze.xlsx]
 *
 * prodotti_fic.json = GET /products (fieldset detailed), ordini_fornitore_fic.json = GET /issued_documents?type=supplier_order
 * (fieldset detailed), lo storico è lo stesso file che si carica in Impostazioni → Amministrazione.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import ExcelJS from 'exceljs';
import { vociProdotti, vociComponenti, differenzaPrezzi, dataIt, type FilePrezzi } from '../src/engine/prezzi-fic.js';

const [fProdotti, fOrdini, fStorico, fUscita, fExcel] = process.argv.slice(2);
if (!fUscita) { console.error('Uso: npx tsx tools/prezzi-da-fic.ts prodotti.json ordini.json storico.json.gz uscita.json.gz [differenze.xlsx]'); process.exit(1); }
const json = (f: string) => { let b = readFileSync(f); if (b[0] === 0x1f && b[1] === 0x8b) b = gunzipSync(b); return JSON.parse(b.toString('utf8')); };

const storico = json(fStorico);
const prodotti = vociProdotti(json(fProdotti), storico.documenti);
const componenti = vociComponenti(json(fOrdini));
const file: FilePrezzi = { origine: 'Fatture in Cloud', creato_il: new Date().toISOString(), prodotti, componenti };
writeFileSync(fUscita, gzipSync(JSON.stringify(file)));
const diverse = prodotti.filter(differenzaPrezzi);
console.log(`Prodotti: ${prodotti.length} (da fattura ${prodotti.filter(p => p.fonte === 'fic_fattura').length}, da anagrafica ${prodotti.filter(p => p.fonte === 'fic_anagrafica').length}), `
  + `anagrafica diversa dall'ultima fattura: ${diverse.length}, senza cliente: ${prodotti.filter(p => !p.cliente).length}. Componenti (P/N): ${componenti.length}.`);

if (fExcel) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Differenze prezzi');
  ws.columns = [['Cliente', 34], ['Codice', 22], ['Descrizione', 36], ['Prezzo anagrafica FIC', 14], ['Anagrafica aggiornata il', 14], ['Prezzo ultima fattura', 14],
    ['Ultima fattura', 22], ['Differenza', 12], ['Differenza %', 12], ['Prezzo messo nel portale', 14], ['Preso da', 22]].map(([header, width]) => ({ header: header as string, width: width as number }));
  ws.getRow(1).font = { bold: true };
  for (const v of diverse.sort((a, b) => String(a.cliente).localeCompare(String(b.cliente)) || a.codice.localeCompare(b.codice))) {
    const diff = v.prezzo_fattura! - v.prezzo_anagrafica!;
    ws.addRow([v.cliente ?? '', v.codice, v.descrizione, v.prezzo_anagrafica, dataIt(v.anagrafica_aggiornata), v.prezzo_fattura, v.fattura, diff,
      v.prezzo_anagrafica ? diff / v.prezzo_anagrafica : null, v.prezzo, v.fonte === 'fic_fattura' ? 'ultima fattura' : 'anagrafica FIC (più recente)']);
  }
  ws.getColumn(9).numFmt = '0%';
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  const tutti = wb.addWorksheet('Tutti i prodotti');
  tutti.columns = [['Cliente', 34], ['Codice', 22], ['Descrizione', 36], ['Prezzo', 12], ['Preso da', 40], ['Prezzo anagrafica FIC', 14], ['Prezzo ultima fattura', 14]]
    .map(([header, width]) => ({ header: header as string, width: width as number }));
  tutti.getRow(1).font = { bold: true };
  for (const v of prodotti) tutti.addRow([v.cliente ?? '(cliente non riconosciuto)', v.codice, v.descrizione, v.prezzo, v.nota, v.prezzo_anagrafica, v.prezzo_fattura]);
  const comp = wb.addWorksheet('Componenti');
  comp.columns = [['P/N', 28], ['Codice nell\'ordine', 28], ['Fornitore', 30], ['Data', 12], ['Ordine', 12], ['Quantità', 10], ['Prezzo €', 12], ['Valuta ordine', 8]]
    .map(([header, width]) => ({ header: header as string, width: width as number }));
  comp.getRow(1).font = { bold: true };
  for (const c of componenti) comp.addRow([c.pn, c.codice, c.fornitore, dataIt(c.data), c.ordine, c.quantita, c.prezzo, c.valuta]);
  writeFileSync(fExcel, Buffer.from(await wb.xlsx.writeBuffer()));
}
