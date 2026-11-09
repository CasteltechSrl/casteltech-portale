/**
 * PDF di cortesia di fattura e nota di credito da allegare all'email (Adriano 4/11/2026, "come per i preventivi").
 * Stessi dati della stampa dal browser (`stampaFattura` in views/stampa-documento.ts): azienda, cliente (fotografia dell'emissione),
 * righe con IVA, riepilogo per aliquota/natura, bollo, lettera d'intento, split payment, pagamento con scadenze e IBAN.
 * Fatto sul server con pdf-lib (come DDT e preventivi), perché la stampa del browser non si può allegare.
 */
import { readFile } from 'node:fs/promises';
import { notaFattura } from '../engine/condizioni.js';
import { join } from 'node:path';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import { euro, euroUnitario, num } from './views/html.js';
import { indirizzoSu } from '../engine/ddt.js';
import { importoRiga, numeroCompleto, type Totali } from '../engine/amministrazione.js';
import { importoDaIncassare, nomeTipoSdi } from '../engine/tipi-fattura.js';

const NERO = rgb(0.07, 0.07, 0.07), GRIGIO = rgb(0.44, 0.44, 0.44), LINEA = rgb(0.75, 0.75, 0.75), RIGA = rgb(0.9, 0.9, 0.9);
const ROSSO = rgb(0.75, 0.2, 0.2), FONDO = rgb(0.95, 0.95, 0.95);
const L = 595.28, H = 841.89, M = 40;
const dataIt = (d: string | Date | null | undefined) => {
  if (!d) return '';
  if (d instanceof Date) return d.toLocaleDateString('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric' });
  return String(d).slice(0, 10).split('-').reverse().join('/');
};

let logo: Buffer | null | undefined;
async function caricaLogo(): Promise<Buffer | null> {
  if (logo === undefined) logo = await readFile(join(process.cwd(), 'public', 'logo-casteltech.png')).catch(() => null);
  return logo;
}

export interface DatiPdfFattura {
  d: any; righe: any[]; azienda: any; cliente: any; totali: Totali; scadenze: any[]; intento: any; pagamento: any;
  /** testo della modalità di pagamento quando non è un bonifico (es. "RiBa") */
  modalita?: string;
}

export async function pdfFattura(x: DatiPdfFattura): Promise<Buffer> {
  const { d, righe, azienda, cliente, totali } = x;
  const titolo = d.tipo === 'nota_credito' ? 'NOTA DI CREDITO' : (nomeTipoSdi(d.tipo, d.tipo_sdi) ?? 'Fattura').toUpperCase();
  const numero = d.numero == null ? 'BOZZA' : numeroCompleto(d.numero, d.sezionale ?? '');
  const split = !!cliente.split_payment;
  const doc = await PDFDocument.create();
  doc.setTitle(`${titolo} ${numero} del ${dataIt(d.data)}`);
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
  const casella = (p: PDFPage, x: number, y: number, largo: number, alto: number, etichetta: string, valore: string[], grande = false) => {
    p.drawRectangle({ x, y: y - alto, width: largo, height: alto, borderColor: LINEA, borderWidth: 0.7 });
    scrivi(p, etichetta.toUpperCase(), x + 5, y - 9, { dim: 6.3, colore: GRIGIO });
    valore.forEach((r, i) => scrivi(p, r, x + 5, y - 21 - i * 10.5, { f: grande && i === 0 ? grassetto : font, dim: grande && i === 0 ? 10 : 8.8 }));
  };

  const pagine: PDFPage[] = [];
  const nuovaPagina = () => { const p = doc.addPage([L, H]); pagine.push(p); return p; };
  let p = nuovaPagina();
  let y = H - M;
  const PIEDE = M + 30;

  // ── testata: logo e azienda a sinistra, titolo a destra ──
  if (immagine) {
    const alto = 40, largo = immagine.width * (alto / immagine.height);
    p.drawImage(immagine, { x: M, y: y - alto, width: Math.min(largo, 180), height: alto });
  }
  const mittente = [azienda.indirizzo, [azienda.cap, azienda.comune, azienda.provincia ? `(${azienda.provincia})` : ''].filter(Boolean).join(' ')].filter(Boolean).join(' - ');
  const rea = azienda.rea_numero ? `REA ${azienda.rea_ufficio ? `${azienda.rea_ufficio}-` : ''}${azienda.rea_numero}` : '';
  scrivi(p, azienda.ragione_sociale ?? '', M, y - 54, { f: grassetto, dim: 10 });
  scrivi(p, mittente, M, y - 65, { dim: 7.8, colore: GRIGIO });
  scrivi(p, [azienda.partita_iva ? `P.IVA ${azienda.partita_iva}` : '', azienda.codice_fiscale && azienda.codice_fiscale !== azienda.partita_iva ? `C.F. ${azienda.codice_fiscale}` : '', rea]
    .filter(Boolean).join(' · '), M, y - 75, { dim: 7.8, colore: GRIGIO });
  scrivi(p, [azienda.telefono ? `Tel. ${azienda.telefono}` : '', azienda.email ?? '', azienda.pec ? `PEC ${azienda.pec}` : ''].filter(Boolean).join(' · '),
    M, y - 85, { dim: 7.8, colore: GRIGIO });
  scrivi(p, titolo, L - M, y - 12, { f: grassetto, dim: 13, destra: true });
  scrivi(p, 'COPIA DI CORTESIA', L - M, y - 24, { dim: 7.5, colore: GRIGIO, destra: true });
  scrivi(p, `N. ${numero} del ${dataIt(d.data)}`, L - M, y - 40, { f: grassetto, dim: 11, destra: true });
  const timbro = d.numero == null ? 'BOZZA' : d.stato === 'scartato' ? 'SCARTATA' : '';
  if (timbro) scrivi(p, timbro, L - M, y - 56, { f: grassetto, dim: 12, colore: ROSSO, destra: true });
  y -= 98;

  // ── cliente e recapito per la fattura elettronica ──
  const meta = (L - 2 * M) / 2;
  const righeCliente = [
    ...aCapo(cliente.ragione_sociale ?? '', meta - 12, grassetto, 10),
    ...aCapo(indirizzoSu(cliente), meta - 12, font, 8.8),
    ...(cliente.partita_iva ? [`P.IVA ${cliente.partita_iva}`] : []),
    ...(cliente.codice_fiscale && cliente.codice_fiscale !== cliente.partita_iva ? [`C.F. ${cliente.codice_fiscale}`] : []),
  ];
  const righeRecapito = [
    ...(cliente.codice_sdi ? [`Codice destinatario ${cliente.codice_sdi}`] : []),
    ...(cliente.pec ? aCapo(`PEC ${cliente.pec}`, meta - 12, font, 8.8) : []),
    ...(d.riferimento_esterno ? aCapo(`Rif. ordine: ${d.riferimento_esterno}${d.data_ordine ? ` del ${dataIt(String(d.data_ordine).slice(0, 10))}` : ''}`, meta - 12, font, 8.8) : []),
    ...(d.cig ? [`CIG ${d.cig}${d.cup ? ` · CUP ${d.cup}` : ''}`] : []),
  ];
  const altoCli = 26 + Math.max(righeCliente.length, righeRecapito.length, 1) * 10.5;
  casella(p, M, y, meta, altoCli, 'Cliente', righeCliente, true);
  casella(p, M + meta, y, meta, altoCli, 'Recapito per la fattura elettronica', righeRecapito);
  y -= altoCli + 8;
  if (d.causale) for (const r of aCapo(d.causale, L - 2 * M, font, 8.5)) { scrivi(p, r, M, y - 8, { dim: 8.5 }); y -= 10.5; }
  y -= 6;

  // ── righe ──
  const percentuale = (codice: string | null) => totali.riepilogo.find(g => g.aliquota === codice);
  const colonne = [{ t: 'CODICE', l: 80 }, { t: 'DESCRIZIONE', l: 0 }, { t: 'U.M.', l: 28 }, { t: 'Q.TÀ', l: 40, n: true },
    { t: 'PREZZO', l: 62, n: true }, { t: 'SC. %', l: 32, n: true }, { t: 'IMPORTO', l: 66, n: true }, { t: 'IVA', l: 34, n: true }];
  colonne[1].l = L - 2 * M - colonne.reduce((s, c) => s + c.l, 0);
  const xs = colonne.reduce<number[]>((a, _c, i) => [...a, i ? a[i - 1] + colonne[i - 1].l : M], []);
  const PAD = 4, DIM = 8.3, INTER = 10.2;
  const testata = () => {
    p.drawRectangle({ x: M, y: y - 15, width: L - 2 * M, height: 15, color: FONDO });
    colonne.forEach((c, i) => scrivi(p, c.t, c.n ? xs[i] + c.l - PAD : xs[i] + PAD, y - 10, { f: grassetto, dim: 6.5, colore: GRIGIO, destra: c.n }));
    y -= 15; linea(p, M, y, L - M, NERO); y -= 2;
  };
  testata();
  const aDestra = (s: string, i: number, yt: number, f = font) => scrivi(p, s, xs[i] + colonne[i].l - PAD, yt, { dim: DIM, destra: true, f });
  for (const r of righe) {
    const descr = [...aCapo(r.descrizione ?? '', colonne[1].l - 2 * PAD, font, DIM), ...(r.note ? aCapo(String(r.note), colonne[1].l - 2 * PAD, font, DIM) : [])];   // note del lotto sotto (9/11/2026)
    const codice = r.solo_descrizione ? [] : aCapo(r.codice ?? '', colonne[0].l - 2 * PAD, grassetto, DIM);
    const alto = Math.max(1, descr.length, codice.length) * INTER + 5;
    if (y - alto < PIEDE + 20) { p = nuovaPagina(); y = H - M; testata(); }
    const yt = y - 3 - DIM;
    codice.forEach((s, i) => scrivi(p, s, xs[0] + PAD, yt - i * INTER, { f: grassetto, dim: DIM }));
    descr.forEach((s, i) => scrivi(p, s, xs[1] + PAD, yt - i * INTER, { dim: DIM, colore: r.solo_descrizione ? GRIGIO : NERO }));
    if (!r.solo_descrizione) {
      const q = Number(r.quantita), g = percentuale(r.aliquota_iva);
      scrivi(p, r.um ?? '', xs[2] + PAD, yt, { dim: DIM });
      aDestra(num(q, q % 1 ? 2 : 0), 3, yt);
      aDestra(euroUnitario(Number(r.prezzo)), 4, yt);
      aDestra(Number(r.sconto) ? num(Number(r.sconto)) : '', 5, yt);
      aDestra(euro(importoRiga(r)), 6, yt, grassetto);
      aDestra(g ? (g.percentuale ? `${num(g.percentuale, 0)}%` : g.natura ?? '') : '', 7, yt);
    }
    y -= alto; linea(p, M, y, L - M, RIGA, 0.5);
  }

  // ── riepilogo IVA a sinistra, somme a destra ──
  const note: string[] = [];
  if (x.intento) note.push(`Operazione non imponibile art. 8 c. 1 lett. c D.P.R. 633/72: lettera d'intento prot. ${x.intento.protocollo} del ${dataIt(x.intento.data_protocollo)}.`);
  if (split) note.push("Scissione dei pagamenti (split payment) art. 17-ter D.P.R. 633/72: l'IVA è versata dal cliente all'Erario.");
  if (d.esigibilita_iva === 'D') note.push('IVA ad esigibilità differita (art. 6, comma 5, D.P.R. 633/72).');
  if (totali.bollo) note.push('Imposta di bollo assolta in modo virtuale ai sensi del D.M. 17/06/2014.');
  if (d.tipo === 'fattura') note.push(notaFattura());   // mora, riserva di proprietà, condizioni, privacy (Adriano 7/11/2026)
  const somme: [string, string, boolean][] = [['Imponibile', euro(totali.imponibile), false], ['IVA', euro(totali.imposta), false]];
  if (totali.bollo && !totali.rigaBollo) somme.push(['Bollo virtuale (a carico di Casteltech)', euro(totali.bollo), false]);
  somme.push(['Totale documento', euro(totali.totale), true]);
  if (split) somme.push(['IVA versata dal cliente (split payment)', `- ${euro(totali.imposta)}`, false], ['Netto da pagare', euro(importoDaIncassare(totali, true)), true]);
  const altoRiep = 16 + Math.max(totali.riepilogo.length * 11, somme.length * 13);
  const notaRighe = note.flatMap(n => aCapo(n, L - 2 * M, font, 7.8));
  const scad = d.tipo === 'fattura' ? x.scadenze : [];
  const altoPag = d.tipo === 'fattura' ? 26 + Math.max(1 + scad.length, 2) * 10.5 : 0;
  if (y - 12 - altoRiep - notaRighe.length * 10 - altoPag - 30 < PIEDE) { p = nuovaPagina(); y = H - M; }
  y -= 12;
  const largoRiep = 270, xSomme = L - M - 220;
  scrivi(p, 'ALIQUOTA / NATURA', M, y - 8, { f: grassetto, dim: 6.5, colore: GRIGIO });
  scrivi(p, 'IMPONIBILE', M + 200, y - 8, { f: grassetto, dim: 6.5, colore: GRIGIO, destra: true });
  scrivi(p, 'IMPOSTA', M + largoRiep, y - 8, { f: grassetto, dim: 6.5, colore: GRIGIO, destra: true });
  totali.riepilogo.forEach((g, i) => {
    const yy = y - 22 - i * 11;
    const etichetta = g.percentuale ? `IVA ${num(g.percentuale, 0)}%` : `${g.natura ?? ''} - ${g.riferimento_normativo ?? ''}`;
    scrivi(p, aCapo(etichetta, 125, font, 7.8)[0] ?? '', M, yy, { dim: 7.8 });
    scrivi(p, euro(g.imponibile), M + 200, yy, { dim: 7.8, destra: true });
    scrivi(p, euro(g.imposta), M + largoRiep, yy, { dim: 7.8, destra: true });
  });
  somme.forEach(([e, v, forte], i) => {
    const yy = y - 10 - i * 13;
    if (forte) p.drawRectangle({ x: xSomme, y: yy - 3.5, width: L - M - xSomme, height: 13, color: FONDO });
    scrivi(p, e, xSomme + 4, yy, { dim: forte ? 9 : 8.3, f: forte ? grassetto : font });
    scrivi(p, v, L - M - 4, yy, { dim: forte ? 9.5 : 8.3, f: forte ? grassetto : font, destra: true });
  });
  y -= altoRiep + 6;
  for (const r of notaRighe) { scrivi(p, r, M, y - 8, { dim: 7.8, colore: GRIGIO }); y -= 10; }

  // ── pagamento con scadenze e coordinate bancarie (solo fatture) ──
  if (d.tipo === 'fattura') {
    y -= 8;
    const righePag = [x.pagamento?.descrizione ?? '', ...scad.map((s: any) => `Scadenza ${dataIt(s.data)}: ${euro(Number(s.importo))}`)];
    const bonifico = x.pagamento?.modalita === 'MP05' || !x.pagamento;
    const righeBanca = bonifico ? [azienda.banca ?? '', azienda.iban ? `IBAN ${azienda.iban}` : ''].filter(Boolean) : [x.modalita ?? ''];
    casella(p, M, y, meta, altoPag, 'Pagamento', righePag, true);
    casella(p, M + meta, y, meta, altoPag, 'Coordinate bancarie', righeBanca);
    y -= altoPag;
  }

  pagine.forEach((pg, i) => {
    for (const [k, r] of aCapo("Copia di cortesia: il documento fiscale è il file XML trasmesso al Sistema di Interscambio ed è disponibile nell'area riservata del sito dell'Agenzia delle Entrate.",
      L - 2 * M - 175, font, 6.8).entries()) scrivi(pg, r, M, M - 6 - k * 8.5, { dim: 6.8, colore: GRIGIO });
    scrivi(pg, `${titolo} n. ${numero} del ${dataIt(d.data)}${pagine.length > 1 ? ` · pag. ${i + 1}/${pagine.length}` : ''}`, L - M, M - 6, { dim: 6.8, colore: GRIGIO, destra: true });
  });
  return Buffer.from(await doc.save());
}
