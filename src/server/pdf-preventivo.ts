/**
 * PDF del preventivo da mandare per email (Adriano 4/11/2026): stesso contenuto della stampa per il cliente
 * (views/stampa-preventivo.ts: righe, riquadro verde, totale e condizioni da engine/stampa-preventivo.ts `contenutoStampa`),
 * impaginato come il PDF della conferma d'ordine (pdf-lib, niente browser sul server).
 */
import type { PrezzoQuantita } from '../engine/stampa-preventivo.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import { euro, euroUnitario, num } from './views/html.js';
import { type RigaDocumentoPreventivo } from '../engine/stampa-preventivo.js';
import { ACCETTAZIONE_PREVENTIVO, PAGINA_FORNITURA } from '../engine/condizioni.js';
import { disegnaCondizioni } from './pdf-condizioni.js';
import { FOGLIO_COMPONENTI, fraseAlternative, type AlternativaDaConfermare, type ComponenteDaVerificare } from '../engine/alternative-cliente.js';

export interface DatiPdfPreventivo {
  numero: string; data: string;
  /** revisione dell'invio (Adriano 11/11/2026): 0 o assente = primo invio, niente scritta */
  revisioneInvio?: number;
  azienda: { nome: string; indirizzo: string; piva: string; rea: string; tel: string; email: string; pec: string; iban?: string; banca?: string };
  cliente: { ragione_sociale: string; indirizzo?: string | null; cap?: string | null; comune?: string | null; provincia?: string | null; nazione?: string | null;
    partita_iva?: string | null; codice_fiscale?: string | null; codice_sdi?: string | null; pec?: string | null };
  codice: string; revisione?: string | null; nSchede: number;
  righe: RigaDocumentoPreventivo[];
  riquadro: { senza: number; con: number | null }; scontato: boolean; primoLotto: boolean; totale: number;
  note?: string; pagamento?: string | null;
  /** tempi di consegna già scritti ("Circa 3 settimane dall'arrivo del materiale"), vuoto = non stampati */
  consegna?: string; condizioni: boolean; firma: boolean;
  /** righe della validità dell'offerta (montaggio 30 gg, componenti e PCB 10 gg: Adriano 5/11/2026) */
  validita?: string[];
  /** codici alternativi alla BOM da confermare: frase sotto le righe e foglio in coda */
  alternative?: AlternativaDaConfermare[];
  /** componenti non trovati o con problemi di acquisto, nello stesso foglio (Adriano 5/11/2026) */
  problemiAcquisto?: ComponenteDaVerificare[];
  /** prezzi delle quantità della stessa quotazione (Adriano 13/11/2026), tabella sotto le righe */
  quantita?: PrezzoQuantita[];
}

const VERDE = rgb(0x1b / 255, 0x5e / 255, 0x52 / 255);
const VERDE_CHIARO = rgb(0xe8 / 255, 0xf3 / 255, 0xf0 / 255);
const VERDE_BORDO = rgb(0x9c / 255, 0xc5 / 255, 0xba / 255);
const NERO = rgb(0.07, 0.07, 0.07), GRIGIO = rgb(0.44, 0.44, 0.44), LINEA = rgb(0.8, 0.8, 0.8), RIGA = rgb(0.9, 0.9, 0.9), FONDO = rgb(0.95, 0.95, 0.95);
const L = 595.28, H = 841.89, M = 40;
const dataIt = (d: string) => { const s = String(d ?? '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split('-').reverse().join('/') : s; };

let logo: Buffer | null | undefined;
async function caricaLogo(): Promise<Buffer | null> {
  if (logo === undefined) logo = await readFile(join(process.cwd(), 'public', 'logo-casteltech.png')).catch(() => null);
  return logo;
}

/** Nome del file: Preventivo_P2026-0123_CODICE.pdf */
export const nomeFilePdfPreventivo = (numero: string, codice: string) =>
  `Preventivo_${[numero, codice].map(x => String(x ?? '').trim().replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '')).filter(Boolean).join('_')}.pdf`;

export async function pdfPreventivo(d: DatiPdfPreventivo): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Preventivo ${d.numero}`);
  doc.setAuthor(d.azienda.nome);
  doc.setCreator('Portale Casteltech');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const grassetto = await doc.embedFont(StandardFonts.HelveticaBold);
  const corsivo = await doc.embedFont(StandardFonts.HelveticaOblique);
  const datiLogo = await caricaLogo();
  const immagine: PDFImage | null = datiLogo ? await doc.embedPng(datiLogo).catch(() => null) : null;

  const pulisci = (f: PDFFont, s: string) => [...String(s ?? '')].map(c => { try { f.widthOfTextAtSize(c, 10); return c; } catch { return '?'; } }).join('');
  const larghezza = (s: string, f: PDFFont, dim: number) => f.widthOfTextAtSize(pulisci(f, s), dim);
  const scrivi = (p: PDFPage, s: string, x: number, y: number, o: { f?: PDFFont; dim?: number; colore?: typeof NERO; destra?: boolean } = {}) => {
    const f = o.f ?? font, dim = o.dim ?? 9, t = pulisci(f, s);
    p.drawText(t, { x: o.destra ? x - f.widthOfTextAtSize(t, dim) : x, y, size: dim, font: f, color: o.colore ?? NERO });
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
    return out;
  };
  const linea = (p: PDFPage, x1: number, y: number, x2: number, colore = LINEA, spessore = 0.7) =>
    p.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: spessore, color: colore });

  const pagine: PDFPage[] = [];
  const nuovaPagina = () => { const p = doc.addPage([L, H]); pagine.push(p); return p; };
  const testata = (p: PDFPage, y: number) => {
    if (immagine) {
      const alto = 46, largo = immagine.width * (alto / immagine.height);
      p.drawImage(immagine, { x: M, y: y - alto, width: Math.min(largo, 200), height: alto });
    } else scrivi(p, d.azienda.nome, M, y - 20, { f: grassetto, dim: 16, colore: VERDE });
    scrivi(p, d.azienda.nome, L - M, y - 10, { f: grassetto, dim: 12, destra: true });
    [d.azienda.indirizzo, `P.IVA e C.F. ${d.azienda.piva} · REA ${d.azienda.rea}`, `Tel. ${d.azienda.tel} · ${d.azienda.email} · PEC ${d.azienda.pec}`]
      .forEach((t, i) => scrivi(p, t, L - M, y - 23 - i * 10, { dim: 7.5, colore: GRIGIO, destra: true }));
  };

  // ── testata, titolo, destinatario ──
  let p = nuovaPagina();
  let y = H - M;
  testata(p, y);
  y -= 72;
  const pezzi: [string, boolean][] = [['PREVENTIVO', true], [' nr. ', false], [d.numero, true], [' del ', false], [dataIt(d.data), true],
    ...(d.revisioneInvio ? [[' · ', false], [`Rev. ${d.revisioneInvio}`, true]] as [string, boolean][] : [])];
  let xt = L - M - pezzi.reduce((s, [t, g]) => s + larghezza(t, g ? grassetto : font, 12), 0);
  for (const [t, g] of pezzi) { scrivi(p, t, xt, y, { f: g ? grassetto : font, dim: 12, colore: g ? NERO : GRIGIO }); xt += larghezza(t, g ? grassetto : font, 12); }
  y -= 12;
  linea(p, M, y, L - M);
  y -= 12;
  const c = d.cliente, meta = (L - 2 * M) / 2;
  scrivi(p, 'DESTINATARIO', M, y, { dim: 6.5, colore: GRIGIO });
  const destinatario = [c.indirizzo ?? '', [c.cap, c.comune].filter(Boolean).join(' ') + (c.provincia ? ` (${c.provincia})` : '') + (c.nazione && c.nazione !== 'IT' ? ` · ${c.nazione}` : '')].filter(x => x.trim());
  let yd = y - 12;
  for (const r of aCapo(c.ragione_sociale, meta - 10, grassetto, 10)) { scrivi(p, r, M, yd, { f: grassetto, dim: 10 }); yd -= 12; }
  for (const r of destinatario) { scrivi(p, r, M, yd, { dim: 9 }); yd -= 11; }
  const fiscali = ([['P.IVA', c.partita_iva], ['C.F.', c.codice_fiscale !== c.partita_iva ? c.codice_fiscale : null], ['Codice SDI', c.codice_sdi], ['PEC', c.pec]] as [string, string | null | undefined][])
    .filter((x): x is [string, string] => !!x[1]);
  let yf = y - 12;
  if (fiscali.length) scrivi(p, 'DATI FISCALI', M + meta, y, { dim: 6.5, colore: GRIGIO });
  for (const [k, v] of fiscali) { scrivi(p, k, M + meta, yf, { f: grassetto, dim: 9 }); scrivi(p, v, M + meta + larghezza(k, grassetto, 9) + 4, yf, { dim: 9 }); yf -= 11; }
  y = Math.min(yd, yf) - 14;

  // ── tabella: Codice / Descrizione / Quantità / Prezzo unitario / Importo ──
  const colonne = [{ t: 'CODICE', l: 86 }, { t: 'DESCRIZIONE', l: 0 }, { t: 'QUANTITÀ', l: 56, n: true }, { t: 'PREZZO UNITARIO', l: 76, n: true }, { t: 'IMPORTO', l: 76, n: true }];
  colonne[1].l = L - 2 * M - colonne.reduce((s, x) => s + x.l, 0);
  const xs = colonne.reduce<number[]>((a, x, i) => [...a, i ? a[i - 1] + colonne[i - 1].l : M], []);
  const PAD = 4, DIM = 8.5, INTER = 10.5, PIEDE = M + 26;
  const testataTabella = () => {
    linea(p, M, y + 4, L - M);
    colonne.forEach((k, i) => scrivi(p, k.t, k.n ? xs[i] + k.l - PAD : xs[i] + PAD, y - 6, { f: grassetto, dim: 6.3, colore: GRIGIO, destra: k.n }));
    y -= 12;
    linea(p, M, y, L - M);
    y -= 4;
  };
  const altraPagina = () => { p = nuovaPagina(); y = H - M - 10; testataTabella(); };
  testataTabella();
  const largoDescr = colonne[1].l - 2 * PAD;
  for (const r of d.righe) {
    // testo di ogni colonna (righe a capo) e stile
    let codice: string[] = [], descr: { t: string; f: PDFFont; dim: number; colore?: typeof NERO }[] = [];
    let valori: [string, string, string] = ['', '', ''];
    let fondo = false, rientro = 0;
    if (r.tipo === 'prodotto') {
      fondo = true;
      codice = [...aCapo(d.codice, colonne[0].l - 2 * PAD, grassetto, DIM), ...(d.revisione ? [`rev. ${d.revisione}`] : [])];
      descr = aCapo(r.descrizione, largoDescr, grassetto, DIM).map(t => ({ t, f: grassetto, dim: DIM }));
      if (r.sotto) descr.push(...aCapo(r.sotto, largoDescr, corsivo, 7.5).map(t => ({ t, f: corsivo, dim: 7.5, colore: GRIGIO })));
      valori = [`${num(d.nSchede, 0)} pz`, euroUnitario(r.prezzo), euro(r.importo)];
    } else if (r.tipo === 'voce') {
      rientro = r.stile === 'fase' ? 10 : 0;
      const f = r.stile === 'area' ? grassetto : font, dim = r.stile === 'fase' ? 7.8 : DIM;
      descr = aCapo(r.descrizione, largoDescr - rientro, f, dim).map(t => ({ t, f, dim, colore: r.stile === 'fase' ? GRIGIO : NERO }));
      if (r.sotto) descr.push(...aCapo(r.sotto, largoDescr - rientro, corsivo, 7.5).map(t => ({ t, f: corsivo, dim: 7.5, colore: GRIGIO })));
      valori = ['', r.prezzo == null ? '' : euroUnitario(r.prezzo), euro(r.importo)];
    } else if (r.tipo === 'unaTantum') {
      fondo = true;
      descr = [{ t: 'COSTI UNA TANTUM (solo primo lotto)', f: grassetto, dim: DIM }];
      for (const v of r.voci) descr.push({ t: `${v.nome}  ·  ${euro(v.prezzo)}`, f: font, dim: 7.8, colore: GRIGIO });
      valori = ['1', euroUnitario(r.prezzo), euro(r.importo)];
    } else if (r.tipo === 'aggiunta') {
      fondo = true;
      descr = aCapo(r.descrizione, largoDescr, grassetto, DIM).map(t => ({ t, f: grassetto, dim: DIM }));
      valori = [num(r.quantita, r.quantita % 1 ? 2 : 0), euroUnitario(r.prezzo), euro(r.importo)];
    } else {
      fondo = true;
      descr = [{ t: r.descrizione, f: grassetto, dim: DIM }];
      valori = ['', '', `- ${euro(r.importo)}`]; // il segno − non c'è nel carattere del PDF (usciva "?")
    }
    const alto = Math.max(codice.length * INTER, descr.reduce((s, x) => s + x.dim + 2, 0)) + 6;
    if (y - alto < PIEDE + 10) altraPagina();
    if (fondo) p.drawRectangle({ x: M, y: y - alto, width: L - 2 * M, height: alto, color: FONDO });
    const yt = y - 3 - DIM;
    codice.forEach((t, i) => scrivi(p, t, xs[0] + PAD, yt - i * INTER, { f: i ? font : grassetto, dim: i ? 7.5 : DIM, colore: i ? GRIGIO : NERO }));
    let yy = y - 3;
    for (const x of descr) { yy -= x.dim; scrivi(p, x.t, xs[1] + PAD + rientro, yy, { f: x.f, dim: x.dim, colore: x.colore }); yy -= 2; }
    valori.forEach((v, i) => { if (v) scrivi(p, v, xs[i + 2] + colonne[i + 2].l - PAD, yt, { dim: DIM, f: fondo && i === 2 ? grassetto : font, destra: true }); });
    y -= alto;
    linea(p, M, y, L - M, RIGA, 0.5);
    y -= 1.5;
  }

  // ── prezzi per quantità della stessa quotazione (Adriano 13/11/2026) ──
  const gq = d.quantita ?? [];
  if (gq.length > 1) {
    const conUt = gq.some(x => x.unaTantum > 0);
    const tit = conUt ? ['QUANTITÀ', 'PREZZO A SCHEDA', 'IMPORTO DEL LOTTO', 'UNA TANTUM (1° LOTTO)', 'A SCHEDA CON UNA TANTUM'] : ['QUANTITÀ', 'PREZZO A SCHEDA', 'IMPORTO DEL LOTTO'];
    const largo = (L - 2 * M) / tit.length;
    const alto = 14 + gq.length * 13 + 22;
    if (y - 14 - alto < PIEDE + 10) { p = nuovaPagina(); y = H - M - 10; }
    y -= 12;
    scrivi(p, 'PREZZI PER QUANTITÀ', M, y, { dim: 6.5, colore: GRIGIO });
    y -= 6;
    linea(p, M, y, L - M);
    tit.forEach((t, i) => scrivi(p, t, M + (i + 1) * largo - PAD, y - 9, { f: grassetto, dim: 6.3, colore: GRIGIO, destra: true }));
    y -= 13;
    linea(p, M, y, L - M);
    for (const x of gq) {
      const v = [`${num(x.schede, 0)} pz`, euroUnitario(x.prezzoScheda), euro(x.lotto), ...(conUt ? [euro(x.unaTantum), x.conUnaTantum != null ? euroUnitario(x.conUnaTantum) : ''] : [])];
      if (x.questo) p.drawRectangle({ x: M, y: y - 13, width: L - 2 * M, height: 13, color: VERDE_CHIARO });
      v.forEach((t, i) => scrivi(p, t, M + (i + 1) * largo - PAD, y - 9.5, { f: i < 2 ? grassetto : font, dim: DIM, destra: true }));
      y -= 13;
      linea(p, M, y, L - M, RIGA, 0.5);
    }
    y -= 10;
    scrivi(p, `Il dettaglio qui sopra, il riquadro dei prezzi e il totale si riferiscono a ${num(d.nSchede, 0)} pz.`, M, y, { f: corsivo, dim: 7.5, colore: GRIGIO });
    y -= 4;
  }

  // ── note per il cliente ──
  if (d.note?.trim()) {
    const righeNote = aCapo(d.note, L - 2 * M, font, 8.5);
    if (y - 20 - righeNote.length * 10.5 < PIEDE + 10) { p = nuovaPagina(); y = H - M - 10; }
    y -= 12;
    scrivi(p, 'NOTE', M, y, { dim: 6.5, colore: GRIGIO });
    y -= 11;
    // note lunghe: si va a capo di pagina (controllo del 4/11/2026: oltre ~70 righe finivano fuori dal foglio)
    for (const r of righeNote) { if (y < PIEDE + 10) { p = nuovaPagina(); y = H - M - 10; } scrivi(p, r, M, y, { dim: 8.5 }); y -= 10.5; }
  }

  // ── avviso dei codici alternativi da confermare ──
  const alternative = d.alternative ?? [], problemi = d.problemiAcquisto ?? [];
  if (alternative.length || problemi.length) {
    const righeAvviso = aCapo(fraseAlternative(alternative.length, problemi.length), L - 2 * M - 12, grassetto, 8.5);
    const alto = righeAvviso.length * 10.5 + 8;
    if (y - 12 - alto < PIEDE + 10) { p = nuovaPagina(); y = H - M - 10; }
    y -= 10;
    p.drawRectangle({ x: M, y: y - alto, width: L - 2 * M, height: alto, color: rgb(0xfd / 255, 0xf5 / 255, 0xe1 / 255), borderColor: rgb(0xe2 / 255, 0xb5 / 255, 0x4f / 255), borderWidth: 0.7 });
    let ya = y - 4 - 8.5;
    for (const r of righeAvviso) { scrivi(p, r, M + 6, ya, { f: grassetto, dim: 8.5 }); ya -= 10.5; }
    y -= alto;
  }

  // ── riquadro verde con i prezzi a scheda, poi pagamento e totale ──
  const validita = d.validita ?? [];
  const altoRiq = 40, altoFondo = 46, altoFirme = d.firma && !d.condizioni ? 50 : 0;
  const largoVal = d.consegna ? (L - 2 * M) / 2 - 12 : L - 2 * M - 12;
  const righeValidita = validita.flatMap(v => aCapo(v, largoVal, grassetto, 8.5));
  const altoConsegna = d.consegna || validita.length ? 18 + Math.max(d.consegna ? aCapo(d.consegna, (L - 2 * M) / 2 - 12, grassetto, 9).length : 0, righeValidita.length) * 11 : 0;
  if (y - altoRiq - altoConsegna - altoFondo - altoFirme - 40 < PIEDE) { p = nuovaPagina(); y = H - M - 10; }
  y -= 14;
  const sc = d.scontato ? ' scontato' : '';
  const caselle: [string, string][] = [[`PREZZO A SCHEDA${sc.toUpperCase()}${d.riquadro.con != null ? ' SENZA COSTI UNA TANTUM' : ''}`, euro(d.riquadro.senza)]];
  if (d.riquadro.con != null) caselle.push([`PREZZO A SCHEDA${sc.toUpperCase()} CON I COSTI UNA TANTUM (PRIMO LOTTO, ${num(d.nSchede, 0)} SCHEDE)`, euro(d.riquadro.con)]);
  const largoCas = (L - 2 * M) / caselle.length;
  p.drawRectangle({ x: M, y: y - altoRiq, width: L - 2 * M, height: altoRiq, color: VERDE_CHIARO, borderColor: VERDE_BORDO, borderWidth: 0.7 });
  caselle.forEach(([e, v], i) => {
    const x = M + i * largoCas;
    if (i) p.drawLine({ start: { x, y }, end: { x, y: y - altoRiq }, thickness: 0.7, color: VERDE_BORDO });
    let de = 6.5; while (de > 5 && larghezza(e, font, de) > largoCas - 16) de -= 0.25;
    scrivi(p, e, x + 8, y - 12, { dim: de, colore: GRIGIO });
    scrivi(p, v, x + 8, y - 31, { f: grassetto, dim: 14, colore: VERDE });
  });
  y -= altoRiq + 12;
  if (altoConsegna) {
    // tempi di consegna a sinistra, validità dell'offerta a destra
    const meta2 = (L - 2 * M) / 2;
    linea(p, M, y, L - M);
    if (d.consegna) {
      scrivi(p, 'TEMPI DI CONSEGNA', M + 6, y - 11, { dim: 6.5, colore: GRIGIO });
      aCapo(d.consegna, meta2 - 12, grassetto, 9).forEach((r, k) => scrivi(p, r, M + 6, y - 23 - k * 11, { f: grassetto, dim: 9 }));
    }
    const xv = d.consegna ? M + meta2 + 6 : M + 6;
    if (validita.length) {
      scrivi(p, "VALIDITÀ DELL'OFFERTA", xv, y - 11, { dim: 6.5, colore: GRIGIO });
      righeValidita.forEach((r, k) => scrivi(p, r, xv, y - 23 - k * 11, { f: grassetto, dim: 8.5 }));
    }
    y -= altoConsegna;
  }
  const xTot = L - M - 175;
  linea(p, M, y, L - M); linea(p, M, y - altoFondo, L - M);
  p.drawLine({ start: { x: xTot, y }, end: { x: xTot, y: y - altoFondo }, thickness: 0.7, color: LINEA });
  scrivi(p, 'MODALITÀ DI PAGAMENTO', M + 6, y - 11, { dim: 6.5, colore: GRIGIO });
  scrivi(p, d.pagamento || 'Da concordare', M + 6, y - 24, { f: grassetto, dim: 9 });
  if (d.azienda.iban) scrivi(p, `IBAN ${d.azienda.iban}${d.azienda.banca ? ` · ${d.azienda.banca}` : ''}`, M + 6, y - 36, { dim: 7.5, colore: GRIGIO });
  scrivi(p, `TOTALE PREVENTIVO${d.primoLotto ? ' (PRIMO LOTTO)' : ''}`, L - M - 6, y - 11, { dim: 6.5, colore: GRIGIO, destra: true });
  scrivi(p, euro(d.totale), L - M - 6, y - 30, { f: grassetto, dim: 16, destra: true });
  scrivi(p, 'IVA esclusa', L - M - 6, y - 41, { dim: 7, colore: GRIGIO, destra: true });
  y -= altoFondo;

  const firme = (pg: PDFPage, yy: number) => {
    const largoFirma = (L - 2 * M - 30) / 2;
    [[d.azienda.nome, ''], ['Per accettazione del cliente', 'Data, timbro e firma']].forEach(([t, s], i) => {
      const x = M + i * (largoFirma + 30);
      linea(pg, x, yy, x + largoFirma, NERO, 0.7);
      scrivi(pg, t, x, yy - 10, { f: grassetto, dim: 8 });
      if (s) scrivi(pg, s, x, yy - 20, { dim: 7.5, colore: GRIGIO });
    });
  };
  if (d.firma && !d.condizioni) firme(p, y - 34);

  // ── seconda pagina: condizioni generali (e firma) ──
  if (d.condizioni) {
    disegnaCondizioni({ font, grassetto, corsivo, nomeAzienda: d.azienda.nome,
      nuovaPagina: () => { p = nuovaPagina(); testata(p, H - M); y = H - M - 64; return { p, y }; } },
    PAGINA_FORNITURA, `allegate al preventivo nr. ${d.numero} del ${dataIt(d.data)}`,
    { firme: d.firma, accettazione: ACCETTAZIONE_PREVENTIVO, firmaPrima: 'Per accettazione del cliente' });
  }

  // ── foglio a parte: codici alternativi da confermare e componenti con problemi di acquisto (Adriano 5/11/2026) ──
  if (alternative.length || problemi.length) {
    p = nuovaPagina();
    y = H - M;
    testata(p, y);
    y -= 72;
    scrivi(p, FOGLIO_COMPONENTI.toUpperCase(), M, y, { f: grassetto, dim: 12 });
    y -= 12;
    scrivi(p, `allegato al preventivo nr. ${d.numero} del ${dataIt(d.data)} · ${d.codice}${d.revisione ? ` rev. ${d.revisione}` : ''}`, M, y, { dim: 8, colore: GRIGIO });
    y -= 10;
    linea(p, M, y, L - M);
    y -= 14;
    type Col = { t: string; l: number; n?: boolean };
    // una tabella: colonne (la larghezza 0 prende il resto), celle per riga [testo, grassetto][] e caselle Sì/No in fondo
    const tabella = (titolo: string, spiega: string, col: Col[], righe: { celle: [string, boolean, number?][][]; qta: number; siNo: boolean; rosso?: number }[]) => {
      if (y < PIEDE + 120) { p = nuovaPagina(); y = H - M - 10; }
      scrivi(p, titolo, M, y, { f: grassetto, dim: 10 });
      y -= 13;
      for (const r of aCapo(spiega, L - 2 * M, font, 8.5)) { scrivi(p, r, M, y, { dim: 8.5 }); y -= 11; }
      y -= 6;
      const libera = col.findIndex(c => !c.l);
      col[libera].l = L - 2 * M - col.reduce((a, x) => a + x.l, 0);
      const xc = col.reduce<number[]>((a, x, i) => [...a, i ? a[i - 1] + col[i - 1].l : M], []);
      const intest = () => {
        linea(p, M, y + 4, L - M);
        col.forEach((k, i) => scrivi(p, k.t, k.n ? xc[i] + k.l - PAD : xc[i] + PAD, y - 6, { f: grassetto, dim: 6.3, colore: GRIGIO, destra: k.n }));
        y -= 12; linea(p, M, y, L - M); y -= 4;
      };
      intest();
      const iQta = col.findIndex(c => c.n), iSiNo = righe.some(r => r.siNo) ? col.length - 1 : -1;
      for (const r of righe) {
        // ogni cella: pezzi di testo [testo, grassetto, dimensione] mandati a capo nella sua colonna
        const celle = r.celle.map((pezzi, i) => pezzi.flatMap(([t, g, dim]) => aCapo(t, col[i].l - 2 * PAD, g ? grassetto : font, dim ?? 7.8).map(x => ({ t: x, g, dim: dim ?? 7.8 }))));
        const alto = Math.max(1, ...celle.map(c => c.length)) * 9.5 + 6;
        if (y - alto < PIEDE + 70) { p = nuovaPagina(); y = H - M - 10; intest(); }
        celle.forEach((righeCella, i) => righeCella.forEach((x, k) =>
          scrivi(p, x.t, xc[i] + PAD, y - 3 - 8 - k * 9.5, { f: x.g ? grassetto : font, dim: x.dim, colore: i === r.rosso ? rgb(0.65, 0.07, 0.07) : !x.g && x.dim < 7.5 ? GRIGIO : NERO })));
        if (iQta >= 0) scrivi(p, num(r.qta, r.qta % 1 ? 2 : 0), xc[iQta] + col[iQta].l - PAD, y - 11, { dim: 8, destra: true });
        if (r.siNo && iSiNo >= 0) [['Sì', 0], ['No', 30]].forEach(([t, dx]) => {
          p.drawRectangle({ x: xc[iSiNo] + PAD + (dx as number), y: y - 12, width: 7, height: 7, borderColor: NERO, borderWidth: 0.6 });
          scrivi(p, t as string, xc[iSiNo] + PAD + (dx as number) + 10, y - 11, { dim: 8 });
        });
        y -= alto;
        linea(p, M, y, L - M, RIGA, 0.5);
        y -= 1.5;
      }
      y -= 14;
    };
    if (alternative.length) tabella('Codici alternativi da confermare',
      'Per questi componenti proponiamo un codice diverso da quello della BOM, con le stesse caratteristiche (non disponibile o più conveniente). '
      + 'Il prezzo del preventivo è calcolato con il codice alternativo. Indicate per ogni riga se lo accettate: senza conferma acquistiamo il codice della BOM, se disponibile, e il prezzo può cambiare.',
      [{ t: 'RIFERIMENTI', l: 80 }, { t: 'CODICE DELLA BOM', l: 105 }, { t: 'CODICE ALTERNATIVO', l: 105 }, { t: 'DESCRIZIONE', l: 0 }, { t: 'Q.TÀ', l: 32, n: true }, { t: 'CONFERMATO', l: 62 }],
      alternative.map(a => ({ qta: a.qtaScheda, siNo: true, celle: [
        [[a.riferimenti, false]],
        [[a.pnBom, true, 8], ...(a.produttoreBom ? [[a.produttoreBom, false, 7] as [string, boolean, number]] : [])],
        [[a.alternativa, true, 8], ...(a.produttoreAlternativa ? [[a.produttoreAlternativa, false, 7] as [string, boolean, number]] : [])],
        [[a.descrizione, false, 7.3]], [], [],
      ] })));
    if (problemi.length) tabella('Componenti non trovati o con problemi di acquisto',
      'Componenti della BOM che non abbiamo trovato o che hanno una disponibilità da verificare al momento dell\'offerta. Quelli "non quotati" non sono '
      + 'compresi nel prezzo: potete fornirli voi, indicarci un codice equivalente o chiederci di cercarlo.',
      [{ t: 'RIFERIMENTI', l: 80 }, { t: 'CODICE DELLA BOM', l: 110 }, { t: 'DESCRIZIONE', l: 0 }, { t: 'Q.TÀ', l: 32, n: true }, { t: 'PROBLEMA', l: 150 }],
      problemi.map(x => ({ qta: x.qtaScheda, siNo: false, rosso: x.quotato ? undefined : 4, celle: [
        [[x.riferimenti, false]],
        [[x.codice, true, 8], ...(x.produttore ? [[x.produttore, false, 7] as [string, boolean, number]] : [])],
        [[x.descrizione, false, 7.3]], [], [[x.problema, !x.quotato, 7.5]],
      ] })));
    if (y - 40 < PIEDE + 30) { p = nuovaPagina(); y = H - M - 10; }
    firme(p, y - 30);
  }

  // ── piede su ogni pagina ──
  pagine.forEach((pg, i) => {
    scrivi(pg, `Preventivo nr. ${d.numero} del ${dataIt(d.data)}${d.revisioneInvio ? ` · Rev. ${d.revisioneInvio}` : ''}`, M, M - 8, { dim: 7, colore: GRIGIO });
    scrivi(pg, `${d.azienda.nome} · ${d.azienda.email} · ${d.azienda.tel}${pagine.length > 1 ? ` · pagina ${i + 1} di ${pagine.length}` : ''}`,
      L - M, M - 8, { dim: 7, colore: GRIGIO, destra: true });
  });
  return Buffer.from(await doc.save());
}
