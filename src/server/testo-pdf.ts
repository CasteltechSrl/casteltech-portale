/**
 * Testo di un PDF con le colonne allineate, come `pdftotext -layout` (serve alla lettura dei cedolini, `engine/cedolini.ts`):
 * righe ricostruite dalla posizione delle scritte (pdfjs-dist, senza IA e senza programmi esterni), pagine separate da "\f".
 * Si tolgono le scritte ruotate (i margini verticali del modello) e le scritte ripetute nello stesso punto (il "grassetto finto"
 * del cedolino U.P.A. scrive tre volte lo stesso testo). Provato sui cedolini 2022–2026: stessi valori di pdftotext.
 */
import { conMemoria } from './memoria.js';

export async function testoPdf(pdf: Buffer, password?: string): Promise<string> {
  return conMemoria(pdf.length * 20 + 20 * 1024 * 1024, async () => {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await getDocument({ data: new Uint8Array(pdf), password, isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
    try {
      const pagine: string[] = [];
      for (let p = 1; p <= doc.numPages; p++) {
        const pg = await doc.getPage(p);
        const tc = await pg.getTextContent();
        type Scritta = { str: string; transform: number[]; width: number };
        const diritte = (tc.items as Scritta[]).filter(i => i.str?.trim() && Math.abs(i.transform[1]) < 0.01 && Math.abs(i.transform[2]) < 0.01);
        const scritte: Scritta[] = [];
        for (const i of diritte)
          if (!scritte.some(j => j.str === i.str && Math.abs(j.transform[4] - i.transform[4]) < 2 && Math.abs(j.transform[5] - i.transform[5]) < 2)) scritte.push(i);
        // larghezza di un carattere: la mediana delle scritte (le colonne si contano in caratteri, come pdftotext)
        const larghezze = scritte.filter(i => i.str.length > 2 && i.width > 0).map(i => i.width / i.str.length).sort((a, b) => a - b);
        const carattere = larghezze.length ? larghezze[Math.floor(larghezze.length / 2)] : 4;
        const righe: { y: number; scritte: Scritta[] }[] = [];
        for (const i of scritte) {
          const y = i.transform[5];
          let r = righe.find(x => Math.abs(x.y - y) < 2);
          if (!r) righe.push(r = { y, scritte: [] });
          r.scritte.push(i);
        }
        righe.sort((a, b) => b.y - a.y);
        pagine.push(righe.map(r => {
          let linea = '';
          for (const s of r.scritte.sort((a, b) => a.transform[4] - b.transform[4])) {
            const colonna = Math.round(s.transform[4] / carattere);
            linea = linea.length < colonna ? linea.padEnd(colonna) : linea + (linea && !linea.endsWith(' ') ? ' ' : '');
            linea += s.str;
          }
          return linea;
        }).join('\n'));
        pg.cleanup();
      }
      return pagine.join('\n\f');
    } finally {
      await doc.destroy();
    }
  });
}
