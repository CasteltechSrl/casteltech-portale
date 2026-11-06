/**
 * Righe delle fatture dei fornitori (Adriano 6/11/2026: "voglio anche lo storico, riga per riga" e "cercare un componente e sapere
 * dove l'ho comprato storicamente e a quale prezzo"): lettura delle DettaglioLinee dall'XML FatturaPA, riconoscimento del P/N nella riga
 * e riepilogo degli acquisti di un articolo (dove, quando, a quanto). Solo regole, niente database.
 */
import { leggiXml, trova, tutti, type Nodo } from './fattura-ricevuta.js';
import { pnKey } from './codifica/bom.js';

export interface RigaFatturaXml {
  posizione: number;
  codice: string | null;        // CodiceArticolo del fornitore (primo), o il nostro codice gestionale se la fattura era scritta in Fatture in Cloud
  codiceTipo: string | null;
  descrizione: string;
  quantita: number | null;
  um: string | null;
  prezzoUnitario: number | null;  // prezzo di listino del fornitore (prima dello sconto)
  sconto: number | null;          // % di sconto complessiva (ScontoMaggiorazione SC in percentuale)
  imponibile: number;             // PrezzoTotale della riga (già scontato)
  aliquota: number | null;
  natura: string | null;
  pn: string | null;              // P/N riconosciuto nella riga (per abbinare l'archivio componenti)
  candidati: string[];            // tutti i codici con cui provare l'abbinamento (P/N, codice gestionale, codice del fornitore)
}

/** Partita IVA del trasmittente delle fatture scritte a mano in Fatture in Cloud (fornitori esteri senza SdI: Mouser, DigiKey…). */
export const TRASMITTENTE_FIC = 'IT01641790702';

const t = (n: Nodo | undefined, percorso: string) => (trova(n, percorso)?.testo ?? '').replace(/\s+/g, ' ').trim();
const num = (s: string): number | null => { if (!s) return null; const v = Number(s.replace(',', '.')); return Number.isFinite(v) ? v : null; };
const arr = (v: number, dec = 2) => Math.round(v * 10 ** dec) / 10 ** dec;

/** Un codice "da componente": almeno 4 caratteri, con una cifra, senza spazi. Non lo sono i numeri puri (codici d'ordine Farnell) né i valori dei passivi (4.7K, 100R, 10UF, 2K2). */
const sembraPn = (s: string) => /^[A-Z0-9][A-Z0-9\-_./+#]{3,}$/i.test(s) && /\d/.test(s) && !/^\d+$/.test(s) && !/^(ART|COD|RIF|REF|N|NR|NUM)[.\-]?\d+$/i.test(s)
  && !/^\d+([.,]\d+)?[KRMUNPFH]?(OHM|F|H|V|W|A)?$/i.test(s) && !/^\d+[KRMUNP]\d+$/i.test(s);
/** Parole della descrizione (FIC scrive "P/N§Produttore"). */
export const paroleDescrizione = (d: string) => d.split(/[\s,;§()]+/).filter(Boolean);

/**
 * P/N riconosciuto nella riga. Fatture scritte in Fatture in Cloud: descrizione "P/N // cliente"; Mouser: "279-SMF524KJT" (prefisso del catalogo);
 * Farnell: il P/N è la prima parola (con ".." se tagliato: non vale); altri: la prima parola della descrizione se sembra un codice,
 * oppure il CodiceArticolo se non è un codice d'ordine.
 */
export function pnDallaRiga(r: { descrizione: string; codice: string | null; codiceTipo: string | null }, scrittaInFic: boolean): string | null {
  const d = r.descrizione.trim();
  if (scrittaInFic) {
    const prima = d.split(/\s+\/\/\s+/)[0].trim();
    if (prima && !/\s/.test(prima) && sembraPn(prima)) return prima.toUpperCase();
  }
  const primaParola = paroleDescrizione(d)[0] ?? '';
  const mouser = /^\d{2,3}-([A-Z0-9][A-Z0-9\-_./+#]{3,})$/i.exec(primaParola);
  if (mouser && !/^\d+$/.test(mouser[1])) return mouser[1].toUpperCase();
  if (primaParola.endsWith('..')) return null;
  if (sembraPn(primaParola) && !/^\d{1,3}[.,]\d+$/.test(primaParola)) return primaParola.toUpperCase();
  const tipo = (r.codiceTipo ?? '').toUpperCase();
  const codice = (r.codice ?? '').split('*')[0].trim();          // Arrow scrive "P/N*PRODUTTORE"
  if (codice && sembraPn(codice) && !/ORDINE|ORDER|INTERNO|EAN|CARICA/.test(tipo)) return codice.toUpperCase();
  return null;
}

/** Codici con cui cercare la riga nell'archivio componenti: P/N riconosciuto, CodiceArticolo, prima parola della descrizione, parte prima di " // ". */
export function candidatiRiga(r: { descrizione: string; codice: string | null; pn: string | null }): string[] {
  const out = new Set<string>();
  const aggiungi = (s: string | null | undefined) => { const v = (s ?? '').trim().toUpperCase(); if (v && v.length >= 4 && /\d/.test(v) && !/\s/.test(v)) out.add(v); };
  aggiungi(r.pn); aggiungi(r.codice); aggiungi((r.codice ?? '').split('*')[0]);
  const prima = r.descrizione.split(/\s+\/\/\s+/)[0].trim();
  aggiungi(paroleDescrizione(prima)[0]);
  const m = /^\d{2,3}-([A-Z0-9][A-Z0-9\-_./+#]{3,})$/i.exec(paroleDescrizione(prima)[0] ?? '');
  if (m) aggiungi(m[1]);
  return [...out];
}

/** Chiave di confronto dei P/N (come l'archivio componenti: maiuscolo, solo lettere e cifre, senza prefissi di catalogo). */
export const chiavePn = (s: string | null | undefined) => pnKey(s) ?? '';

/** Righe di ogni fattura del file XML (un file può contenere più fatture: una lista per corpo, nello stesso ordine di datiFattureRicevute). */
export function righeFattureDaXml(xml: string): RigaFatturaXml[][] {
  const doc = leggiXml(xml);
  const testa = trova(doc, 'FatturaElettronicaHeader');
  const trasmittente = `${t(testa, 'DatiTrasmissione/IdTrasmittente/IdPaese')}${t(testa, 'DatiTrasmissione/IdTrasmittente/IdCodice')}`;
  const scrittaInFic = trasmittente === TRASMITTENTE_FIC;
  return tutti(doc, 'FatturaElettronicaBody').map(corpo => righeDalCorpo(corpo, scrittaInFic));
}

function righeDalCorpo(corpo: Nodo, scrittaInFic: boolean): RigaFatturaXml[] {
  const out: RigaFatturaXml[] = [];
  let posizione = 0;
  for (const l of tutti(trova(corpo, 'DatiBeniServizi'), 'DettaglioLinee')) {
    posizione++;
    const codici = tutti(l, 'CodiceArticolo');
    const codice = codici.map(c => t(c, 'CodiceValore')).find(Boolean) ?? null;
    const codiceTipo = codice ? t(codici.find(c => t(c, 'CodiceValore') === codice), 'CodiceTipo') || null : null;
    const descrizione = t(l, 'Descrizione');
    const sconti = tutti(l, 'ScontoMaggiorazione').filter(s => t(s, 'Tipo') === 'SC');
    const pct = sconti.reduce((s, x) => s + (num(t(x, 'Percentuale')) ?? 0), 0);
    const quantita = num(t(l, 'Quantita'));
    const prezzoUnitario = num(t(l, 'PrezzoUnitario'));
    const imponibile = num(t(l, 'PrezzoTotale')) ?? (quantita != null && prezzoUnitario != null ? arr(quantita * prezzoUnitario * (1 - pct / 100)) : 0);
    const riga: RigaFatturaXml = {
      posizione, codice: codice && codice !== 'Carica' ? codice.slice(0, 80) : null, codiceTipo: codiceTipo?.slice(0, 40) ?? null,
      descrizione: descrizione.slice(0, 500), quantita, um: t(l, 'UnitaMisura') || null, prezzoUnitario, sconto: pct || null,
      imponibile: arr(imponibile), aliquota: num(t(l, 'AliquotaIVA')), natura: t(l, 'Natura') || null, pn: null, candidati: [],
    };
    riga.pn = pnDallaRiga(riga, scrittaInFic);
    riga.candidati = candidatiRiga(riga);
    out.push(riga);
  }
  return out;
}

/** Codici del fornitore scritti tra parentesi nella descrizione di un materiale di consumo: "(I-TRONIK CMLPKF23012LL; TECNOLAB 05LMA0212)". */
export function codiciFornitoreMateriale(descrizione: string | null | undefined): string[] {
  const out = new Set<string>();
  for (const m of (descrizione ?? '').matchAll(/\(([^)]*)\)/g)) {
    for (const parola of m[1].split(/[\s,;]+/)) {
      const p = parola.trim().toUpperCase();
      if (p.length >= 5 && /\d/.test(p) && /[A-Z]/.test(p)) out.add(p);
    }
  }
  return [...out];
}

// ── Riepilogo degli acquisti di un articolo cercato ("dove l'ho comprato e a quanto") ──
export interface RigaAcquistoStorica {
  documentoId: number; tipo: 'fattura' | 'nota_credito'; numero: string; data: string; fornitore: string; fornitoreChiave: string;
  codice: string | null; descrizione: string; pn: string | null; quantita: number | null; um: string | null; imponibile: number;
  componenteId: number | null; materialeId: number | null;
}
export interface FornitoreArticolo { fornitore: string; fornitoreChiave: string; volte: number; pezzi: number; spesa: number; ultimaData: string; ultimoPrezzo: number | null; minimo: number | null }
export interface ArticoloComprato {
  chiave: string; pn: string | null; descrizione: string; componenteId: number | null; materialeId: number | null;
  volte: number; pezzi: number; spesa: number; primaData: string; ultimaData: string;
  ultimoPrezzo: number | null; ultimoFornitore: string; prezzoMedio: number | null; minimo: number | null; massimo: number | null;
  fornitori: FornitoreArticolo[];
}

/** Prezzo unitario netto della riga (imponibile ÷ quantità); null se la quantità manca o è zero. */
export const prezzoRiga = (r: { quantita: number | null; imponibile: number }) => (r.quantita ? arr(r.imponibile / r.quantita, 4) : null);

/** Chiave con cui le righe di fatture diverse sono "lo stesso articolo": componente, poi P/N, poi codice del fornitore, poi descrizione. */
export const chiaveArticolo = (r: Pick<RigaAcquistoStorica, 'pn' | 'codice' | 'descrizione' | 'componenteId' | 'materialeId'>) =>
  r.componenteId ? `c${r.componenteId}` : r.materialeId ? `m${r.materialeId}` : r.pn ? `p${chiavePn(r.pn)}` : r.codice ? `k${r.codice.toUpperCase()}` : `d${r.descrizione.trim().toUpperCase().slice(0, 80)}`;

/** Le righe trovate raggruppate per articolo, le più comprate di recente in cima; per ognuno i fornitori con l'ultimo prezzo e il più basso. */
export function articoliComprati(righe: RigaAcquistoStorica[]): ArticoloComprato[] {
  const gruppi = new Map<string, ArticoloComprato & { forn: Map<string, FornitoreArticolo> }>();
  const ordinate = [...righe].sort((x, y) => x.data.localeCompare(y.data) || x.documentoId - y.documentoId);
  for (const r of ordinate) {
    const chiave = chiaveArticolo(r);
    let g = gruppi.get(chiave);
    if (!g) {
      g = { chiave, pn: r.pn, descrizione: r.descrizione, componenteId: r.componenteId, materialeId: r.materialeId, volte: 0, pezzi: 0, spesa: 0, primaData: r.data, ultimaData: r.data,
        ultimoPrezzo: null, ultimoFornitore: r.fornitore, prezzoMedio: null, minimo: null, massimo: null, fornitori: [], forn: new Map() };
      gruppi.set(chiave, g);
    }
    const segno = r.tipo === 'nota_credito' ? -1 : 1;
    const prezzo = prezzoRiga(r);
    g.volte++; g.pezzi += segno * (r.quantita ?? 0); g.spesa = arr(g.spesa + segno * r.imponibile); g.ultimaData = r.data;
    if (r.pn && !g.pn) g.pn = r.pn;
    if (segno > 0 && prezzo != null && (r.quantita ?? 0) > 0) {
      g.ultimoPrezzo = prezzo; g.ultimoFornitore = r.fornitore; g.descrizione = r.descrizione;
      g.minimo = g.minimo == null ? prezzo : Math.min(g.minimo, prezzo); g.massimo = g.massimo == null ? prezzo : Math.max(g.massimo, prezzo);
    }
    let f = g.forn.get(r.fornitoreChiave);
    if (!f) { f = { fornitore: r.fornitore, fornitoreChiave: r.fornitoreChiave, volte: 0, pezzi: 0, spesa: 0, ultimaData: r.data, ultimoPrezzo: null, minimo: null }; g.forn.set(r.fornitoreChiave, f); }
    f.volte++; f.pezzi += segno * (r.quantita ?? 0); f.spesa = arr(f.spesa + segno * r.imponibile); f.ultimaData = r.data;
    if (segno > 0 && prezzo != null && (r.quantita ?? 0) > 0) { f.ultimoPrezzo = prezzo; f.minimo = f.minimo == null ? prezzo : Math.min(f.minimo, prezzo); }
  }
  return [...gruppi.values()].map(({ forn, ...g }) => ({
    ...g, prezzoMedio: g.pezzi > 0 ? arr(g.spesa / g.pezzi, 4) : null,
    fornitori: [...forn.values()].sort((a, b) => b.ultimaData.localeCompare(a.ultimaData)),
  })).sort((a, b) => b.ultimaData.localeCompare(a.ultimaData) || b.spesa - a.spesa);
}

/** Testo di ricerca normalizzato per confrontare P/N e codici (maiuscolo, senza trattini/spazi/punti). */

