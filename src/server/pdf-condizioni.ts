/**
 * Pagina delle condizioni generali nei PDF fatti dal server (preventivo, conferma d'ordine, ordine a fornitore; Adriano 7/11/2026):
 * titolo con la revisione, clausole numerate con il titolo in grassetto, frase di accettazione con le firme, riquadro dell'approvazione
 * specifica con la seconda firma (artt. 1341-1342 c.c.). Se il testo non sta in una pagina continua sulla successiva.
 */
import { rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { REVISIONE_CONDIZIONI, type PaginaCondizioni } from '../engine/condizioni.js';

const NERO = rgb(0.07, 0.07, 0.07), GRIGIO = rgb(0.44, 0.44, 0.44), LINEA = rgb(0.8, 0.8, 0.8), BORDO = rgb(0.6, 0.6, 0.6);
const L = 595.28, M = 40;
const DIM = 7.5, INTERLINEA = 9.1;

export interface ContestoCondizioni {
  font: PDFFont; grassetto: PDFFont; corsivo?: PDFFont;
  /** pagina nuova già con la testata: restituisce la pagina e la y da cui scrivere */
  nuovaPagina: () => { p: PDFPage; y: number };
  nomeAzienda: string;
}

const pulisci = (f: PDFFont, s: string) => [...String(s ?? '')].map(c => { try { f.widthOfTextAtSize(c, 10); return c; } catch { return '?'; } }).join('');
const larghezza = (s: string, f: PDFFont, dim: number) => f.widthOfTextAtSize(pulisci(f, s), dim);

/** A capo con la prima riga più corta (dopo il titolo in grassetto). */
export function aCapoRientro(s: string, max: number, primaMax: number, f: PDFFont, dim: number): string[] {
  const out: string[] = [];
  let riga = '';
  const limite = () => (out.length ? max : primaMax);
  for (const parola of String(s ?? '').split(/\s+/).filter(Boolean)) {
    const prova = riga ? `${riga} ${parola}` : parola;
    if (!riga || larghezza(prova, f, dim) <= limite()) riga = prova;
    else { out.push(riga); riga = parola; }
  }
  out.push(riga);
  return out;
}

/** Disegna le condizioni a partire da una pagina nuova; `sotto` = riga grigia sotto il titolo ("allegate al preventivo nr. …"). */
export function disegnaCondizioni(ctx: ContestoCondizioni, pag: PaginaCondizioni, sotto: string,
  opz: { firme: boolean; accettazione?: string; firmaPrima?: string }): void {
  const { font, grassetto } = ctx;
  const corsivo = ctx.corsivo ?? font;
  let { p, y } = ctx.nuovaPagina();
  const scrivi = (t: string, x: number, yy: number, o: { f?: PDFFont; dim?: number; colore?: typeof NERO } = {}) =>
    p.drawText(pulisci(o.f ?? font, t), { x, y: yy, size: o.dim ?? DIM, font: o.f ?? font, color: o.colore ?? NERO });
  const spazio = (alto: number) => { if (y - alto < M + 20) ({ p, y } = ctx.nuovaPagina()); };

  scrivi(pag.titolo, M, y, { f: grassetto, dim: 12 });
  y -= 12;
  scrivi(`rev. ${REVISIONE_CONDIZIONI}${sotto ? ` · ${sotto}` : ''}`, M, y, { dim: 8, colore: GRIGIO });
  y -= 8;
  p.drawLine({ start: { x: M, y }, end: { x: L - M, y }, thickness: 0.7, color: LINEA });
  y -= 13;

  const rientro = 14, largo = L - 2 * M - rientro;
  pag.clausole.forEach((c, i) => {
    const titolo = `${c.titolo}.`;
    const lt = larghezza(titolo, grassetto, DIM) + 3;
    const righe = aCapoRientro(c.testo, largo, largo - lt, font, DIM);
    spazio(righe.length * INTERLINEA + 4);
    scrivi(`${i + 1}.`, M, y, { f: grassetto });
    scrivi(titolo, M + rientro, y, { f: grassetto });
    righe.forEach((r, k) => { scrivi(r, M + rientro + (k ? 0 : lt), y); y -= INTERLINEA; });
    y -= 2.4;
  });

  if (!opz.firme) return;
  const largoFirma = (L - 2 * M - 30) / 2;
  const firma = (x: number, yy: number, t: string, s: string) => {
    p.drawLine({ start: { x, y: yy }, end: { x: x + largoFirma, y: yy }, thickness: 0.7, color: NERO });
    scrivi(t, x, yy - 10, { f: grassetto, dim: 8 });
    if (s) scrivi(s, x, yy - 20, { dim: 7.5, colore: GRIGIO });
  };
  if (opz.accettazione && opz.firmaPrima) {
    const righe = aCapoRientro(opz.accettazione, L - 2 * M, L - 2 * M, corsivo, 8.5);
    spazio(righe.length * 11 + 60);
    y -= 4;
    for (const r of righe) { scrivi(r, M, y, { f: corsivo, dim: 8.5 }); y -= 11; }
    y -= 22;
    firma(M, y, ctx.nomeAzienda, '');
    firma(M + largoFirma + 30, y, opz.firmaPrima, 'Data, timbro e firma');
    y -= 24;
  }
  // riquadro dell'approvazione specifica con la seconda firma
  const righe = aCapoRientro(pag.approvazione, L - 2 * M - 16, L - 2 * M - 16, font, 8);
  const alto = righe.length * 10 + 44;
  spazio(alto + 6);
  y -= 6;
  p.drawRectangle({ x: M, y: y - alto, width: L - 2 * M, height: alto, borderColor: BORDO, borderWidth: 0.8 });
  let yy = y - 13;
  for (const r of righe) { scrivi(r, M + 8, yy, { dim: 8 }); yy -= 10; }
  firma(M + largoFirma + 30, y - alto + 23, pag.firma, 'Data, timbro e firma');
  y -= alto;
}
