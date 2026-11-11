/**
 * PDF del DDT da allegare all'email (Adriano 2/11/2026). Stessi dati della stampa dal browser (views/stampa-documento.ts,
 * D.P.R. 472/96): mittente, destinatario, luogo di destinazione, numero e data, causale, beni e quantità, aspetto, colli,
 * peso, trasporto a cura del, vettore, inizio del trasporto, spazi per le firme. Senza prezzi.
 * Fatto sul server con pdf-lib (come conferme d'ordine e ordini a fornitore), perché la stampa del browser non si può allegare.
 */
import { readFile } from 'node:fs/promises';
import { noteDdt } from '../engine/condizioni.js';
import { join } from 'node:path';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import { num } from './views/html.js';
import { indirizzoSu } from '../engine/ddt.js';
import { numeroCompleto } from '../engine/amministrazione.js';

const NERO = rgb(0.07, 0.07, 0.07), GRIGIO = rgb(0.44, 0.44, 0.44), LINEA = rgb(0.75, 0.75, 0.75), RIGA = rgb(0.9, 0.9, 0.9);
const ROSSO = rgb(0.75, 0.2, 0.2);
const L = 595.28, H = 841.89, M = 40;
const dataIt = (d: string | null | undefined) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');

let logo: Buffer | null | undefined;
async function caricaLogo(): Promise<Buffer | null> {
  if (logo === undefined) logo = await readFile(join(process.cwd(), 'public', 'logo-casteltech.png')).catch(() => null);
  return logo;
}

/** d = riga di `documenti` (tipo ddt), righe = documenti_righe, azienda = impostazioni 'azienda', destinatario = fotografia o anagrafica. */
export async function pdfDdt(d: any, righe: any[], azienda: any, destinatario: any, revisione = 0): Promise<Buffer> {
  const t = d.dati_trasporto ?? {};
  const numero = d.numero == null ? 'BOZZA' : numeroCompleto(d.numero, d.sezionale);
  const doc = await PDFDocument.create();
  doc.setTitle(`DDT ${numero} del ${dataIt(d.data)}`);
  doc.setAuthor(azienda.ragione_sociale ?? 'Casteltech');
  doc.setCreator('Portale Casteltech');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const grassetto = await doc.embedFont(StandardFonts.HelveticaBold);
  const datiLogo = await caricaLogo();
  const immagine: PDFImage | null = datiLogo ? await doc.embedPng(datiLogo).catch(() => null) : null;

  // i caratteri che i font standard non hanno (es. Ω) diventano "?" invece di bloccare il PDF
  const pulisci = (f: PDFFont, s: string) => [...String(s ?? '')].map(c => { try { f.widthOfTextAtSize(c, 10); return c; } catch { return '?'; } }).join('');
  const larghezza = (s: string, f: PDFFont, dim: number) => f.widthOfTextAtSize(pulisci(f, s), dim);
  const scrivi = (p: PDFPage, s: string, x: number, y: number, o: { f?: PDFFont; dim?: number; colore?: typeof NERO; destra?: boolean } = {}) => {
    const f = o.f ?? font, dim = o.dim ?? 9, testo = pulisci(f, s);
    p.drawText(testo, { x: o.destra ? x - f.widthOfTextAtSize(testo, dim) : x, y, size: dim, font: f, color: o.colore ?? NERO });
  };
  const aCapo = (s: string, max: number, f: PDFFont, dim: number): string[] => {
    const out: string[] = [];
    for (const paragrafo of String(s ?? '').split(/\r?\n/)) {
      let riga = '';
      for (let parola of paragrafo.split(/\s+/).filter(Boolean)) {
        while (larghezza(parola, f, dim) > max) {
          let i = parola.length;
          while (i > 1 && larghezza(parola.slice(0, i), f, dim) > max) i--;
          if (riga) { out.push(riga); riga = ''; }
          out.push(parola.slice(0, i)); parola = parola.slice(i);
        }
        const prova = riga ? `${riga} ${parola}` : parola;
        if (larghezza(prova, f, dim) <= max) riga = prova; else { out.push(riga); riga = parola; }
      }
      out.push(riga);
    }
    return out.filter((r, i) => r || i < out.length - 1);
  };
  const linea = (p: PDFPage, x1: number, y: number, x2: number, colore = LINEA, spessore = 0.7) =>
    p.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: spessore, color: colore });
  /** Riquadro con etichetta piccola e valore (anche su più righe); restituisce l'altezza usata. */
  const casella = (p: PDFPage, x: number, y: number, largo: number, alto: number, etichetta: string, valore: string[], grande = false) => {
    p.drawRectangle({ x, y: y - alto, width: largo, height: alto, borderColor: LINEA, borderWidth: 0.7 });
    scrivi(p, etichetta.toUpperCase(), x + 5, y - 9, { dim: 6.3, colore: GRIGIO });
    valore.forEach((r, i) => scrivi(p, r, x + 5, y - 21 - i * 10.5, { f: grande && i === 0 ? grassetto : font, dim: grande && i === 0 ? 10 : 8.8 }));
  };

  const pagine: PDFPage[] = [];
  const nuovaPagina = () => { const p = doc.addPage([L, H]); pagine.push(p); return p; };
  let p = nuovaPagina();
  let y = H - M;

  // ── testata: logo e mittente a sinistra, titolo a destra ──
  if (immagine) {
    const alto = 40, largo = immagine.width * (alto / immagine.height);
    p.drawImage(immagine, { x: M, y: y - alto, width: Math.min(largo, 180), height: alto });
  }
  const mittente = [azienda.indirizzo, [azienda.cap, azienda.comune, azienda.provincia ? `(${azienda.provincia})` : ''].filter(Boolean).join(' ')].filter(Boolean).join(' - ');
  scrivi(p, azienda.ragione_sociale ?? '', M, y - 54, { f: grassetto, dim: 10 });
  scrivi(p, mittente, M, y - 65, { dim: 7.8, colore: GRIGIO });
  scrivi(p, [azienda.partita_iva ? `P.IVA ${azienda.partita_iva}` : '', azienda.telefono ? `Tel. ${azienda.telefono}` : '', azienda.email ?? ''].filter(Boolean).join(' · '),
    M, y - 75, { dim: 7.8, colore: GRIGIO });
  scrivi(p, 'DOCUMENTO DI TRASPORTO', L - M, y - 12, { f: grassetto, dim: 13, destra: true });
  scrivi(p, 'D.P.R. 472/96', L - M, y - 24, { dim: 7.5, colore: GRIGIO, destra: true });
  const titolo = `N. ${numero} del ${dataIt(d.data)}${revisione > 0 ? ` · Rev. ${revisione}` : ''}`;
  scrivi(p, titolo, L - M, y - 40, { f: grassetto, dim: 11, destra: true });
  const timbro = d.numero == null ? 'BOZZA' : d.stato === 'annullato' ? 'ANNULLATO' : '';
  if (timbro) scrivi(p, timbro, L - M, y - 56, { f: grassetto, dim: 12, colore: ROSSO, destra: true });
  y -= 88;

  // ── destinatario e luogo di destinazione ──
  const meta = (L - 2 * M) / 2;
  const righeDest = [
    ...aCapo(destinatario.ragione_sociale ?? '', meta - 12, grassetto, 10),
    ...aCapo(indirizzoSu(destinatario), meta - 12, font, 8.8),
    ...(destinatario.partita_iva ? [`P.IVA ${destinatario.partita_iva}`] : []),
  ];
  const righeLuogo = t.destinazione ? aCapo(t.destinazione, meta - 12, font, 8.8) : ['COME DESTINATARIO'];
  const altoDest = 26 + Math.max(righeDest.length, righeLuogo.length) * 10.5;
  casella(p, M, y, meta, altoDest, 'Destinatario', righeDest, true);
  casella(p, M + meta, y, meta, altoDest, 'Luogo di destinazione', righeLuogo);
  y -= altoDest;

  // ── causale, riferimento, porto, a cura ──
  const quarti = (L - 2 * M) / 4;
  const fila = (valori: [string, string][], alto = 34) => {
    valori.forEach(([e, v], i) => casella(p, M + i * quarti, y, quarti, alto, e, aCapo(v ?? '', quarti - 10, font, 8.8).slice(0, 2)));
    y -= alto;
  };
  fila([['Causale del trasporto', t.causale ?? ''], ['Riferimento', d.riferimento_esterno ?? ''], ['Porto', t.porto ?? ''], ['Trasporto a cura del', t.a_cura ?? '']]);
  y -= 12;

  // ── righe dei beni ──
  const colonne = [{ t: 'CODICE', l: 110 }, { t: 'DESCRIZIONE DEI BENI', l: 0 }, { t: 'U.M.', l: 40 }, { t: 'QUANTITÀ', l: 60, n: true }];
  colonne[1].l = L - 2 * M - colonne.reduce((s, c) => s + c.l, 0);
  const xs = colonne.reduce<number[]>((a, _c, i) => [...a, i ? a[i - 1] + colonne[i - 1].l : M], []);
  // condizioni sopra il piede (Adriano 7/11/2026): controllo al ricevimento, ESD, proprietà secondo la causale
  const righeCondizioni = noteDdt(t.causale).flatMap(n => aCapo(n, L - 2 * M, font, 7));
  const altoCondizioni = righeCondizioni.length * 8.6 + 4;
  const PAD = 5, DIM = 8.8, INTERLINEA = 10.8, ALTO_PIEDE = 120 + altoCondizioni;
  const testata = () => {
    linea(p, M, y, L - M, NERO);
    colonne.forEach((c, i) => scrivi(p, c.t, c.n ? xs[i] + c.l - PAD : xs[i] + PAD, y - 10, { f: grassetto, dim: 6.5, colore: GRIGIO, destra: c.n }));
    y -= 15; linea(p, M, y, L - M, NERO); y -= 2;
  };
  testata();
  for (const r of righe) {
    const descr = [...aCapo(r.descrizione ?? '', colonne[1].l - 2 * PAD, font, DIM), ...(r.note ? aCapo(String(r.note), colonne[1].l - 2 * PAD, font, DIM) : [])];   // note del lotto sotto (9/11/2026)
    const codice = r.solo_descrizione ? [] : aCapo(r.codice ?? '', colonne[0].l - 2 * PAD, grassetto, DIM);
    const alto = Math.max(1, descr.length, codice.length) * INTERLINEA + 6;
    if (y - alto < M + ALTO_PIEDE) { p = nuovaPagina(); y = H - M; testata(); }
    const yt = y - 3 - DIM;
    codice.forEach((s, i) => scrivi(p, s, xs[0] + PAD, yt - i * INTERLINEA, { f: grassetto, dim: DIM }));
    descr.forEach((s, i) => scrivi(p, s, xs[1] + PAD, yt - i * INTERLINEA, { dim: DIM, colore: r.solo_descrizione ? GRIGIO : NERO }));
    if (!r.solo_descrizione) {
      scrivi(p, r.um ?? '', xs[2] + PAD, yt, { dim: DIM });
      const qt = Number(r.quantita);
      scrivi(p, num(qt, qt % 1 ? 2 : 0), xs[3] + colonne[3].l - PAD, yt, { f: grassetto, dim: DIM, destra: true });
    }
    y -= alto; linea(p, M, y, L - M, RIGA, 0.5);
  }

  // ── piede: aspetto, colli, peso, inizio trasporto, vettore e firme (in fondo alla pagina) ──
  if (y - 20 < M + ALTO_PIEDE) p = nuovaPagina();
  y = M + ALTO_PIEDE - 10;
  for (const r of righeCondizioni) { scrivi(p, r, M, y - 7, { dim: 7, colore: GRIGIO }); y -= 8.6; }
  y -= 4;
  const inizio = t.inizio ? `${dataIt(String(t.inizio).slice(0, 10))} ore ${String(t.inizio).slice(11, 16)}` : '';
  fila([['Aspetto esteriore dei beni', t.aspetto ?? ''], ['N. colli', t.colli ?? ''], ['Peso', t.peso ?? ''], ['Data e ora inizio trasporto', inizio]]);
  casella(p, M, y, quarti * 2, 48, 'Vettore', aCapo(t.trasportatore ?? '', quarti * 2 - 10, font, 8.8).slice(0, 2));
  casella(p, M + quarti * 2, y, quarti, 48, 'Firma conducente / vettore', []);
  casella(p, M + quarti * 3, y, quarti, 48, 'Firma del destinatario', []);

  pagine.forEach((pg, i) => scrivi(pg, `DDT n. ${numero} del ${dataIt(d.data)}${revisione > 0 ? ` · Rev. ${revisione}` : ''}${pagine.length > 1 ? ` · pagina ${i + 1} di ${pagine.length}` : ''}`,
    L - M, M - 14, { dim: 7, colore: GRIGIO, destra: true }));
  return Buffer.from(await doc.save());
}
