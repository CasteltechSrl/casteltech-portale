/**
 * PDF della conferma d'ordine, impaginato come la stampa dei preventivi (stile Fatture in Cloud, PR #38):
 * logo e dati dell'azienda, destinatario, riquadro verde con ordine del cliente e totale, tabella Codice / Descrizione /
 * Quantità / Prezzo unitario / Importo / Consegna, pagamento e totale in fondo, firma del cliente per accettazione.
 * Fatto sul server (pdf-lib) perché il file si salva nel documento e si allega all'email.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import { euro, num } from './views/html.js';
import { importoRigaConferma, totaleConferma, type RigaConferma } from '../engine/conferme-ordine.js';

export interface DatiPdfConferma {
  numero: number | null; anno: number; data: string;
  azienda: { nome: string; indirizzo: string; piva: string; rea: string; tel: string; email: string; pec: string; iban?: string; banca?: string };
  cliente: { ragione_sociale: string; indirizzo?: string | null; cap?: string | null; comune?: string | null; provincia?: string | null; nazione?: string | null;
    partita_iva?: string | null; codice_fiscale?: string | null; codice_sdi?: string | null; pec?: string | null };
  rifCliente?: string | null; dataRif?: string | null; pagamento?: string | null; note?: string | null;
  righe: RigaConferma[];
  /** testi che cambiano tra conferma d'ordine e ordine a fornitore (stesso impaginato) */
  modello?: ModelloPdf;
}

export interface ModelloPdf { titolo: string; destinatario: string; rif: string; firma: string; piede: string; bozza: string; iban: boolean; nomeDocumento: string }
export const MODELLO_CONFERMA: ModelloPdf = {
  titolo: "CONFERMA D'ORDINE", destinatario: 'DESTINATARIO', rif: 'VOSTRO ORDINE', firma: 'Per accettazione del cliente', piede: "Conferma d'ordine",
  bozza: 'BOZZA - NON VALIDA COME CONFERMA', iban: true, nomeDocumento: "Conferma d'ordine",
};
/** Ordine a fornitore (Adriano 31/10/2026): stesso impaginato; niente IBAN di Casteltech (paghiamo noi), firma del fornitore. */
export const MODELLO_ORDINE_FORNITORE: ModelloPdf = {
  titolo: 'ORDINE A FORNITORE', destinatario: 'FORNITORE', rif: 'VOSTRA OFFERTA', firma: 'Per accettazione del fornitore', piede: 'Ordine a fornitore',
  bozza: 'BOZZA - NON VALIDO COME ORDINE', iban: false, nomeDocumento: 'Ordine a fornitore',
};

const VERDE = rgb(0x1b / 255, 0x5e / 255, 0x52 / 255);
const VERDE_CHIARO = rgb(0xe8 / 255, 0xf3 / 255, 0xf0 / 255);
const VERDE_BORDO = rgb(0x9c / 255, 0xc5 / 255, 0xba / 255);
const NERO = rgb(0.07, 0.07, 0.07), GRIGIO = rgb(0.44, 0.44, 0.44), LINEA = rgb(0.8, 0.8, 0.8), RIGA = rgb(0.9, 0.9, 0.9), FONDO = rgb(0.95, 0.95, 0.95);

const L = 595.28, H = 841.89, M = 40;   // A4 in punti, margini
const quantita = (n: number) => num(n, 3);
const dataIt = (d: string | null | undefined) => (d ? d.split('-').reverse().join('/') : '');

let logo: Buffer | null | undefined;
async function caricaLogo(): Promise<Buffer | null> {
  if (logo === undefined) logo = await readFile(join(process.cwd(), 'public', 'logo-casteltech.png')).catch(() => null);
  return logo;
}

export async function pdfConfermaOrdine(d: DatiPdfConferma): Promise<Buffer> {
  const m = d.modello ?? MODELLO_CONFERMA;
  const doc = await PDFDocument.create();
  doc.setTitle(`${m.nomeDocumento} ${d.numero ?? 'bozza'}/${d.anno}`);
  doc.setAuthor(d.azienda.nome);
  doc.setCreator('Portale Casteltech');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const grassetto = await doc.embedFont(StandardFonts.HelveticaBold);
  const datiLogo = await caricaLogo();
  const immagine: PDFImage | null = datiLogo ? await doc.embedPng(datiLogo).catch(() => null) : null;

  // i caratteri che i font standard non hanno (es. Ω) diventano "?" invece di bloccare il PDF
  const pulisci = (f: PDFFont, s: string) => [...String(s ?? '')].map(c => { try { f.widthOfTextAtSize(c, 10); return c; } catch { return '?'; } }).join('');
  const larghezza = (s: string, f: PDFFont, dim: number) => f.widthOfTextAtSize(pulisci(f, s), dim);
  const scrivi = (p: PDFPage, s: string, x: number, y: number, o: { f?: PDFFont; dim?: number; colore?: typeof NERO; destra?: boolean } = {}) => {
    const f = o.f ?? font, dim = o.dim ?? 9, t = pulisci(f, s);
    p.drawText(t, { x: o.destra ? x - f.widthOfTextAtSize(t, dim) : x, y, size: dim, font: f, color: o.colore ?? NERO });
  };
  /** Testo a capo entro la larghezza (parole intere; una parola troppo lunga si spezza). */
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
    return out;
  };
  const linea = (p: PDFPage, x1: number, y: number, x2: number, colore = LINEA, spessore = 0.7) =>
    p.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: spessore, color: colore });

  const numeroTesto = d.numero ? String(d.numero) : 'BOZZA';
  const pagine: PDFPage[] = [];
  const nuovaPagina = () => { const p = doc.addPage([L, H]); pagine.push(p); return p; };

  // ── testata (solo prima pagina): logo, azienda, titolo, destinatario ──
  let p = nuovaPagina();
  let y = H - M;
  if (immagine) {
    const alto = 46, largo = immagine.width * (alto / immagine.height);
    p.drawImage(immagine, { x: M, y: y - alto, width: Math.min(largo, 200), height: alto });
  } else scrivi(p, d.azienda.nome, M, y - 20, { f: grassetto, dim: 16, colore: VERDE });
  scrivi(p, d.azienda.nome, L - M, y - 10, { f: grassetto, dim: 12, destra: true });
  [d.azienda.indirizzo, `P.IVA e C.F. ${d.azienda.piva} · REA ${d.azienda.rea}`, `Tel. ${d.azienda.tel} · ${d.azienda.email} · PEC ${d.azienda.pec}`]
    .forEach((t, i) => scrivi(p, t, L - M, y - 23 - i * 10, { dim: 7.5, colore: GRIGIO, destra: true }));
  y -= 72;
  // titolo a destra: CONFERMA D'ORDINE nr. 12 del 28/10/2026
  const pezzi: [string, boolean][] = [[m.titolo, true], [' nr. ', false], [numeroTesto, true], [' del ', false], [dataIt(d.data), true]];
  let xt = L - M - pezzi.reduce((s, [t, g]) => s + larghezza(t, g ? grassetto : font, 12), 0);
  for (const [t, g] of pezzi) { scrivi(p, t, xt, y, { f: g ? grassetto : font, dim: 12, colore: g ? NERO : GRIGIO }); xt += larghezza(t, g ? grassetto : font, 12); }
  y -= 12;
  linea(p, M, y, L - M);
  y -= 12;
  const c = d.cliente, meta = (L - 2 * M) / 2;
  scrivi(p, m.destinatario, M, y, { dim: 6.5, colore: GRIGIO });
  const destinatario = [c.indirizzo ?? '', [c.cap, c.comune].filter(Boolean).join(' ') + (c.provincia ? ` (${c.provincia})` : '') + (c.nazione && c.nazione !== 'IT' ? ` · ${c.nazione}` : '')].filter(x => x.trim());
  let yd = y - 12;
  for (const r of aCapo(c.ragione_sociale, meta - 10, grassetto, 10)) { scrivi(p, r, M, yd, { f: grassetto, dim: 10 }); yd -= 12; }
  for (const r of destinatario) { scrivi(p, r, M, yd, { dim: 9 }); yd -= 11; }
  const fiscali: [string, string][] = ([['P.IVA', c.partita_iva], ['C.F.', c.codice_fiscale !== c.partita_iva ? c.codice_fiscale : null], ['Codice SDI', c.codice_sdi], ['PEC', c.pec]] as [string, string | null | undefined][])
    .filter((x): x is [string, string] => !!x[1]);
  let yf = y - 12;
  if (fiscali.length) scrivi(p, 'DATI FISCALI', M + meta, y, { dim: 6.5, colore: GRIGIO });
  for (const [k, v] of fiscali) { scrivi(p, k, M + meta, yf, { f: grassetto, dim: 9 }); scrivi(p, v, M + meta + larghezza(k, grassetto, 9) + 4, yf, { dim: 9 }); yf -= 11; }
  y = Math.min(yd, yf) - 10;

  // ── riquadro verde: vostro ordine, prima consegna, totale ──
  const totale = totaleConferma(d.righe);
  const date = d.righe.map(r => r.consegna).filter((x): x is string => !!x).sort();
  const caselle: [string, string][] = [
    [m.rif, d.rifCliente ? `${d.rifCliente}${d.dataRif ? ` del ${dataIt(d.dataRif)}` : ''}` : '—'],
    [date.length > 1 && date[0] !== date[date.length - 1] ? 'CONSEGNE' : 'CONSEGNA', date.length ? (date[0] === date[date.length - 1] ? dataIt(date[0]) : `dal ${dataIt(date[0])} al ${dataIt(date[date.length - 1])}`) : 'da definire'],
    ['TOTALE ORDINE (IVA ESCLUSA)', euro(totale)],
  ];
  const altoRiq = 36, largoCas = (L - 2 * M) / caselle.length;
  p.drawRectangle({ x: M, y: y - altoRiq, width: L - 2 * M, height: altoRiq, color: VERDE_CHIARO, borderColor: VERDE_BORDO, borderWidth: 0.7 });
  caselle.forEach(([e, v], i) => {
    const x = M + i * largoCas;
    if (i) p.drawLine({ start: { x, y }, end: { x, y: y - altoRiq }, thickness: 0.7, color: VERDE_BORDO });
    scrivi(p, e, x + 8, y - 11, { dim: 6.5, colore: GRIGIO });
    let dim = 13; while (dim > 8 && larghezza(v, grassetto, dim) > largoCas - 16) dim -= 0.5;
    scrivi(p, v, x + 8, y - 28, { f: grassetto, dim });
  });
  y -= altoRiq + 16;

  // ── tabella delle righe ──
  const colonne = [
    { t: 'CODICE', l: 82 }, { t: 'DESCRIZIONE', l: 0 }, { t: 'QUANTITÀ', l: 52, n: true }, { t: 'PREZZO UNITARIO', l: 70, n: true },
    { t: 'IMPORTO', l: 70, n: true }, { t: 'CONSEGNA', l: 56, n: true },
  ];
  colonne[1].l = L - 2 * M - colonne.reduce((s, x) => s + x.l, 0);
  const xs = colonne.reduce<number[]>((a, x, i) => [...a, i ? a[i - 1] + colonne[i - 1].l : M], []);
  const PAD = 4, DIM = 8.5, INTERLINEA = 10.5, PIEDE = M + 26;
  const testataTabella = () => {
    linea(p, M, y + 4, L - M);
    colonne.forEach((k, i) => scrivi(p, k.t, k.n ? xs[i] + k.l - PAD : xs[i] + PAD, y - 6, { f: grassetto, dim: 6.3, colore: GRIGIO, destra: k.n }));
    y -= 12;
    linea(p, M, y, L - M);
    y -= 4;
  };
  const altraPagina = () => { p = nuovaPagina(); y = H - M - 10; testataTabella(); };
  testataTabella();
  for (const r of d.righe) {
    const codice = aCapo(r.codice ?? '', colonne[0].l - 2 * PAD, grassetto, DIM);
    const descr = aCapo(r.descrizione, colonne[1].l - 2 * PAD, font, DIM);
    const alto = Math.max(codice.length, descr.length) * INTERLINEA + 6;
    if (y - alto < PIEDE + 10) altraPagina();
    p.drawRectangle({ x: M, y: y - alto, width: L - 2 * M, height: alto, color: FONDO });
    const yt = y - 3 - DIM;
    codice.forEach((t, i) => scrivi(p, t, xs[0] + PAD, yt - i * INTERLINEA, { f: grassetto, dim: DIM }));
    descr.forEach((t, i) => scrivi(p, t, xs[1] + PAD, yt - i * INTERLINEA, { dim: DIM }));
    const valori = [quantita(r.quantita), euro(r.prezzo), euro(importoRigaConferma(r)), dataIt(r.consegna) || 'da definire'];
    valori.forEach((v, i) => scrivi(p, v, xs[i + 2] + colonne[i + 2].l - PAD, yt, { dim: DIM, f: i === 3 ? grassetto : font, colore: i === 3 && !r.consegna ? GRIGIO : NERO, destra: true }));
    y -= alto;
    linea(p, M, y, L - M, RIGA, 0.5);
    y -= 1.5;
  }

  // ── note ──
  if (d.note?.trim()) {
    const righeNote = aCapo(d.note, L - 2 * M, font, 8.5);
    if (y - 20 - righeNote.length * 10.5 < PIEDE + 10) { p = nuovaPagina(); y = H - M - 10; }
    y -= 12;
    scrivi(p, 'NOTE', M, y, { dim: 6.5, colore: GRIGIO });
    y -= 11;
    for (const r of righeNote) { scrivi(p, r, M, y, { dim: 8.5 }); y -= 10.5; }
  }

  // ── fondo: pagamento e totale, poi firme ──
  const altoFondo = 46, altoFirme = 50;
  if (y - altoFondo - altoFirme - 20 < PIEDE) { p = nuovaPagina(); y = H - M - 10; }
  y -= 14;
  const xTot = L - M - 175;
  linea(p, M, y, L - M); linea(p, M, y - altoFondo, L - M);
  p.drawLine({ start: { x: xTot, y }, end: { x: xTot, y: y - altoFondo }, thickness: 0.7, color: LINEA });
  scrivi(p, 'MODALITÀ DI PAGAMENTO', M + 6, y - 11, { dim: 6.5, colore: GRIGIO });
  scrivi(p, d.pagamento || 'Da concordare', M + 6, y - 24, { f: grassetto, dim: 9 });
  if (m.iban && d.azienda.iban) scrivi(p, `IBAN ${d.azienda.iban}${d.azienda.banca ? ` · ${d.azienda.banca}` : ''}`, M + 6, y - 36, { dim: 7.5, colore: GRIGIO });
  scrivi(p, 'TOTALE ORDINE', L - M - 6, y - 11, { dim: 6.5, colore: GRIGIO, destra: true });
  scrivi(p, euro(totale), L - M - 6, y - 30, { f: grassetto, dim: 16, destra: true });
  scrivi(p, 'IVA esclusa', L - M - 6, y - 41, { dim: 7, colore: GRIGIO, destra: true });
  y -= altoFondo + 34;
  const largoFirma = (L - 2 * M - 30) / 2;
  [[d.azienda.nome, ''], [m.firma, 'Data, timbro e firma']].forEach(([t, s], i) => {
    const x = M + i * (largoFirma + 30);
    linea(p, x, y, x + largoFirma, NERO, 0.7);
    scrivi(p, t, x, y - 10, { f: grassetto, dim: 8 });
    if (s) scrivi(p, s, x, y - 20, { dim: 7.5, colore: GRIGIO });
  });

  // ── piede su ogni pagina ──
  pagine.forEach((pg, i) => {
    scrivi(pg, `${m.piede} nr. ${numeroTesto} del ${dataIt(d.data)}`, M, M - 8, { dim: 7, colore: GRIGIO });
    scrivi(pg, `${d.azienda.nome} · ${d.azienda.email} · ${d.azienda.tel}${pagine.length > 1 ? ` · pagina ${i + 1} di ${pagine.length}` : ''}`,
      L - M, M - 8, { dim: 7, colore: GRIGIO, destra: true });
    if (!d.numero) scrivi(pg, m.bozza, L / 2 - larghezza(m.bozza, grassetto, 9) / 2, M + 6, { f: grassetto, dim: 9, colore: rgb(0.75, 0.2, 0.2) });
  });
  return Buffer.from(await doc.save());
}
