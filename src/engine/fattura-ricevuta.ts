/**
 * Fatture dei fornitori arrivate dallo SdI (Invoicetronic, Adriano 28/10/2026): dal file (XML o firmato .p7m) ai dati da registrare
 * tra le fatture fornitori. Qui solo la lettura, senza database: un piccolo lettore XML (niente librerie in più) e l'estrazione
 * dell'XML dalla busta firmata CAdES (.p7m).
 */

export interface Nodo { nome: string; figli: Nodo[]; testo: string }

const ENTITA: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decodifica = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITA[e] ?? m);

/** Legge l'XML in un albero di nodi (nomi senza prefisso: p:FatturaElettronica → FatturaElettronica). Attributi ignorati. */
export function leggiXml(xml: string): Nodo {
  const radice: Nodo = { nome: '#', figli: [], testo: '' };
  const pila: Nodo[] = [radice];
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<(\/?)([\w:.\-]+)([^>]*?)(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const cima = pila[pila.length - 1];
    if (m[1] !== undefined) cima.testo += m[1];
    else if (m[6] !== undefined) cima.testo += decodifica(m[6]);
    else if (m[3]) {
      const nome = m[3].replace(/^.*:/, '');
      if (m[2]) { if (pila.length > 1) pila.pop(); continue; }
      const n: Nodo = { nome, figli: [], testo: '' };
      cima.figli.push(n);
      if (!m[5]) pila.push(n);
    }
  }
  return radice;
}

/** Primo nodo lungo il percorso ("A/B/C"), cercando a qualsiasi profondità il primo pezzo. */
export function trova(n: Nodo | undefined, percorso: string): Nodo | undefined {
  if (!n) return undefined;
  const [primo, ...resto] = percorso.split('/');
  const cerca = (x: Nodo): Nodo | undefined => x.figli.find(f => f.nome === primo) ?? x.figli.map(cerca).find(Boolean);
  let cur = cerca(n);
  for (const p of resto) cur = cur?.figli.find(f => f.nome === p);
  return cur;
}
export const tutti = (n: Nodo | undefined, nome: string): Nodo[] => n ? n.figli.flatMap(f => f.nome === nome ? [f] : tutti(f, nome)) : [];
const t = (n: Nodo | undefined, percorso: string) => (trova(n, percorso)?.testo ?? '').replace(/\s+/g, ' ').trim();
const numero = (s: string) => { const v = Number(s); return Number.isFinite(v) ? v : 0; };
const arrotonda2 = (v: number) => Math.round(v * 100) / 100;

/**
 * XML dalla busta firmata .p7m (CMS/CAdES, DER o in base64): si cerca nell'albero DER l'OCTET STRING (anche spezzato in pezzi)
 * che contiene la fattura. Un file che è già XML torna così com'è.
 */
export function xmlDaFile(dati: Buffer): string {
  const inizio = dati.subarray(0, 200).toString('utf8').replace(/^﻿/, '').trimStart();
  if (inizio.startsWith('<')) return dati.toString('utf8').replace(/^﻿/, '');
  let der = dati;
  if (/^[A-Za-z0-9+/=\r\n]+$/.test(dati.subarray(0, 400).toString('latin1')) && dati[0] !== 0x30) der = Buffer.from(dati.toString('latin1'), 'base64');
  const trovato = cercaOttetti(der, 0, der.length, 0);
  if (!trovato) throw new Error('File firmato (.p7m) non leggibile: XML della fattura non trovato.');
  return trovato.toString('utf8').replace(/^﻿/, '');
}

function cercaOttetti(b: Buffer, da: number, a: number, profondita: number): Buffer | null {
  let i = da;
  while (i < a && profondita < 30) {
    const tag = b[i++];
    if (i >= a) return null;
    let lung = b[i++];
    let indefinita = false;
    if (lung === 0x80) { indefinita = true; lung = 0; }
    else if (lung & 0x80) { const n = lung & 0x7f; lung = 0; for (let k = 0; k < n; k++) lung = lung * 256 + b[i++]; }
    const fine = indefinita ? a : Math.min(a, i + lung);
    const costruito = (tag & 0x20) !== 0;
    if ((tag & 0x1f) === 0x04) {          // OCTET STRING
      const contenuto = costruito ? unisciPezzi(b, i, fine) : b.subarray(i, fine);
      if (/<\?xml|FatturaElettronica/.test(contenuto.subarray(0, 600).toString('latin1'))) return contenuto;
    }
    if (costruito) { const x = cercaOttetti(b, i, fine, profondita + 1); if (x) return x; }
    if (indefinita) return null;          // senza lunghezza non si sa dove finisce: già esplorato dentro
    i = fine;
  }
  return null;
}
function unisciPezzi(b: Buffer, da: number, a: number): Buffer {
  const pezzi: Buffer[] = [];
  let i = da;
  while (i < a) {
    const tag = b[i++]; let lung = b[i++];
    if (tag === 0 && lung === 0) break;   // fine di una lunghezza indefinita
    if (lung & 0x80) { const n = lung & 0x7f; lung = 0; for (let k = 0; k < n; k++) lung = lung * 256 + b[i++]; }
    pezzi.push((tag & 0x20) ? unisciPezzi(b, i, i + lung) : b.subarray(i, i + lung));
    i += lung;
  }
  return Buffer.concat(pezzi);
}

export interface FatturaRicevuta {
  tipo: 'fattura' | 'nota_credito'; tipo_sdi: string; numero: string; data: string; valuta: string;
  fornitore: { ragione_sociale: string; partita_iva: string; codice_fiscale: string; indirizzo: string; cap: string; comune: string; provincia: string; nazione: string };
  cessionario_piva: string; trasmittente: string;
  imponibile: number; imposta: number; totale: number; descrizione: string;
  scadenze: { data: string; importo: number }[];
}

/** Tipi SdI delle note di credito (TD04; TD08 nota di credito semplificata). */
const NOTE_CREDITO = new Set(['TD04', 'TD08']);

/** Dati di ogni fattura del file (un file può contenerne più d'una: lotto). */
export function datiFattureRicevute(xml: string): FatturaRicevuta[] {
  const doc = leggiXml(xml);
  const testa = trova(doc, 'FatturaElettronicaHeader');
  const ced = trova(testa, 'CedentePrestatore');
  const anag = trova(ced, 'DatiAnagrafici/Anagrafica');
  const sede = trova(ced, 'Sede');
  const piva = `${t(ced, 'DatiAnagrafici/IdFiscaleIVA/IdPaese')}${t(ced, 'DatiAnagrafici/IdFiscaleIVA/IdCodice')}`;
  const fornitore = {
    ragione_sociale: (t(anag, 'Denominazione') || `${t(anag, 'Nome')} ${t(anag, 'Cognome')}`).trim().toUpperCase(),
    partita_iva: piva.startsWith('IT') ? piva.slice(2) : piva, codice_fiscale: t(ced, 'DatiAnagrafici/CodiceFiscale'),
    indirizzo: [t(sede, 'Indirizzo'), t(sede, 'NumeroCivico')].filter(Boolean).join(', ').toUpperCase(), cap: t(sede, 'CAP'),
    comune: t(sede, 'Comune').toUpperCase(), provincia: t(sede, 'Provincia').toUpperCase(), nazione: t(sede, 'Nazione').toUpperCase(),
  };
  const cessionario_piva = `${t(testa, 'CessionarioCommittente/DatiAnagrafici/IdFiscaleIVA/IdPaese')}${t(testa, 'CessionarioCommittente/DatiAnagrafici/IdFiscaleIVA/IdCodice')}`;
  const trasmittente = `${t(testa, 'DatiTrasmissione/IdTrasmittente/IdPaese')}${t(testa, 'DatiTrasmissione/IdTrasmittente/IdCodice')}`;
  return tutti(doc, 'FatturaElettronicaBody').map(corpo => {
    const gen = trova(corpo, 'DatiGenerali/DatiGeneraliDocumento');
    const tipo_sdi = t(gen, 'TipoDocumento');
    const riepiloghi = tutti(trova(corpo, 'DatiBeniServizi'), 'DatiRiepilogo');
    const imponibile = arrotonda2(riepiloghi.reduce((s, r) => s + numero(t(r, 'ImponibileImporto')), 0));
    const imposta = arrotonda2(riepiloghi.reduce((s, r) => s + numero(t(r, 'Imposta')), 0));
    const totaleScritto = t(gen, 'ImportoTotaleDocumento');
    const totale = totaleScritto ? numero(totaleScritto) : arrotonda2(imponibile + imposta);
    const data = t(gen, 'Data');
    const descrizioni = tutti(trova(corpo, 'DatiBeniServizi'), 'DettaglioLinee').map(l => t(l, 'Descrizione')).filter(Boolean);
    const scadenze = tutti(corpo, 'DettaglioPagamento').map(p => ({ data: t(p, 'DataScadenzaPagamento') || data, importo: numero(t(p, 'ImportoPagamento')) }))
      .filter(s => s.importo);
    const descrizione = `${descrizioni.slice(0, 3).join(' · ')}${descrizioni.length > 3 ? ` e altre ${descrizioni.length - 3} righe` : ''}`.slice(0, 300);
    return {
      tipo: NOTE_CREDITO.has(tipo_sdi) ? 'nota_credito' : 'fattura', tipo_sdi, numero: t(gen, 'Numero'), data, valuta: t(gen, 'Divisa') || 'EUR',
      fornitore, cessionario_piva, trasmittente, imponibile, imposta, totale, descrizione,
      scadenze: scadenze.length ? scadenze : [{ data, importo: totale }],
    } as FatturaRicevuta;
  });
}

/** Autofattura (TD16–TD19, TD28) emessa da Casteltech che lo SdI rimanda anche a noi: non è una fattura di un fornitore. */
export const eNostraAutofattura = (f: FatturaRicevuta, nostraPiva: string) =>
  /^TD(1[6-9]|28)$/.test(f.tipo_sdi) && f.cessionario_piva.replace(/^IT/, '') === nostraPiva.replace(/^IT/, '');
