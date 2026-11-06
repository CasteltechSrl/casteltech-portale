/**
 * Analisi degli acquisti (Adriano 6/11/2026, "per fornitori, componenti e materiali va fatta l'analisi come per i prodotti"):
 *  - fornitore: acquisti anno per anno dalle fatture dei fornitori (note di credito in negativo, anche lo storico di Fatture in Cloud
 *    dal 2019), variazione, peso sul totale degli acquisti dell'anno, fatture, ordini a fornitore del portale, ultimo acquisto, "fermo",
 *    pagamenti (giorni medi dalla scadenza, da pagare, scaduto); classifica dei fornitori di un anno;
 *  - articolo (componente o materiale di consumo): acquisti anno per anno dalle righe degli ordini a fornitore emessi dal portale:
 *    pezzi, spesa, prezzo medio e sua variazione, fornitori, ordini, ultimo acquisto. Prima del portale (ordini fatti in Fatture in Cloud)
 *    resta solo l'ultimo acquisto caricato nell'anagrafica.
 * Solo conti: le letture stanno in analisi-acquisti-servizio.ts. "Fermo" = nessuna fattura da `MESI_FERMO` mesi, come per prodotti e clienti.
 */
import { variazionePct } from './analisi.js';
import { mesiDa, MESI_FERMO } from './analisi-prodotti.js';

export interface FatturaFornitore {
  fornitoreChiave: string; fornitoreId: number | null; fornitore: string;
  tipo: 'fattura' | 'nota_credito'; data: string; imponibile: number; categoria: string | null;
}
export interface PagamentoFornitore { fornitoreChiave: string; dataFattura: string; scadenza: string; importo: number; pagataIl: string | null }
export interface OrdineFornitoreAnalisi { fornitoreChiave: string; data: string; totale: number }
/** Riga di un ordine a fornitore emesso dal portale che compra l'articolo. */
export interface RigaAcquistoArticolo { data: string; documentoId: number; numero: string; fornitore: string; fornitoreId: number | null; quantita: number; prezzo: number; sconto: number }

const anno = (d: string) => Number(d.slice(0, 4));
const segno = (f: Pick<FatturaFornitore, 'tipo' | 'imponibile'>) => (f.tipo === 'nota_credito' ? -1 : 1) * f.imponibile;
const arr = (n: number, dec = 2) => Math.round(n * 10 ** dec) / 10 ** dec;
const pesoPct = (parte: number, tutto: number | undefined) => (tutto && tutto > 0 && parte > 0 ? Math.round((parte / tutto) * 1000) / 10 : null);
const giorniTra = (da: string, a: string) => Math.round((Date.parse(a.slice(0, 10)) - Date.parse(da.slice(0, 10))) / 86_400_000);

/** Totale degli acquisti di tutti i fornitori per anno (per il peso). */
export function totaliAcquisti(fatture: FatturaFornitore[]): Record<number, number> {
  const t: Record<number, number> = {};
  for (const f of fatture) t[anno(f.data)] = arr((t[anno(f.data)] ?? 0) + segno(f));
  return t;
}

export interface AnnoFornitore {
  anno: number; acquisti: number; fatture: number; variazione: number | null; pesoTotale: number | null;
  ordini: number; ordiniTotale: number; ultimaFattura: string | null;
}
export interface SchedaFornitore {
  righe: AnnoFornitore[]; totale: { acquisti: number; fatture: number }; primaData: string | null; ultimaData: string | null;
  mesiFermo: number | null; fermo: boolean;
  /** categorie di costo delle fatture (es. B6_Materie prime), in ordine di importo */
  categorie: { categoria: string; importo: number }[];
  pagamenti: { giorniMedi: number | null; ritardoMedio: number | null; pagate: number; daPagare: number; scaduto: number };
}

/**
 * Scheda di un fornitore: una riga per anno (dalla prima fattura a oggi), con acquisti, variazione, peso sul totale degli acquisti,
 * fatture e ordini del portale; giorni medi di pagamento (dalla data della fattura) e ritardo medio (oltre la scadenza) sulle rate pagate negli ultimi 12 mesi.
 */
export function schedaFornitore(fatture: FatturaFornitore[], opz: {
  totali: Record<number, number>; oggi: string; pagamenti?: PagamentoFornitore[]; ordini?: OrdineFornitoreAnalisi[];
}): SchedaFornitore {
  const perAnno = new Map<number, AnnoFornitore>();
  const riga = (a: number) => {
    let r = perAnno.get(a);
    if (!r) { r = { anno: a, acquisti: 0, fatture: 0, variazione: null, pesoTotale: null, ordini: 0, ordiniTotale: 0, ultimaFattura: null }; perAnno.set(a, r); }
    return r;
  };
  const ordinate = [...fatture].sort((x, y) => x.data.localeCompare(y.data));
  const categorie = new Map<string, number>();
  for (const f of ordinate) {
    const r = riga(anno(f.data));
    r.acquisti = arr(r.acquisti + segno(f)); r.fatture++;
    if (!r.ultimaFattura || f.data > r.ultimaFattura) r.ultimaFattura = f.data;
    const cat = (f.categoria ?? '').trim();
    if (cat) categorie.set(cat, arr((categorie.get(cat) ?? 0) + segno(f)));
  }
  for (const o of opz.ordini ?? []) { const r = riga(anno(o.data)); r.ordini++; r.ordiniTotale = arr(r.ordiniTotale + o.totale); }
  const annoOggi = anno(opz.oggi);
  const primo = perAnno.size ? Math.min(...perAnno.keys()) : annoOggi;
  const righe: AnnoFornitore[] = [];
  for (let a = primo; a <= annoOggi; a++) righe.push(riga(a));
  righe.sort((x, y) => x.anno - y.anno);
  for (let i = 0; i < righe.length; i++) {
    righe[i].variazione = i ? variazionePct(righe[i].acquisti, righe[i - 1].acquisti) : null;
    righe[i].pesoTotale = pesoPct(righe[i].acquisti, opz.totali[righe[i].anno]);
  }
  const ultimaData = ordinate.length ? ordinate.reduce((m, f) => (f.data > m ? f.data : m), ordinate[0].data) : null;
  const mesiFermo = mesiDa(ultimaData, opz.oggi);
  // pagamenti: rate pagate negli ultimi 12 mesi
  const unAnnoFa = `${annoOggi - 1}${opz.oggi.slice(4, 10)}`;
  const pagate = (opz.pagamenti ?? []).filter(p => p.pagataIl && p.pagataIl >= unAnnoFa);
  const aperte = (opz.pagamenti ?? []).filter(p => !p.pagataIl);
  const media = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
  return {
    righe,
    totale: { acquisti: arr(righe.reduce((s, r) => s + r.acquisti, 0)), fatture: ordinate.length },
    primaData: ordinate[0]?.data ?? null, ultimaData, mesiFermo, fermo: mesiFermo != null && mesiFermo >= MESI_FERMO,
    categorie: [...categorie].map(([categoria, importo]) => ({ categoria, importo })).sort((x, y) => y.importo - x.importo),
    pagamenti: {
      giorniMedi: media(pagate.map(p => giorniTra(p.dataFattura, p.pagataIl!))),
      ritardoMedio: media(pagate.map(p => giorniTra(p.scadenza, p.pagataIl!))),
      pagate: pagate.length,
      daPagare: arr(aperte.reduce((s, p) => s + p.importo, 0)),
      scaduto: arr(aperte.filter(p => p.scadenza < opz.oggi.slice(0, 10)).reduce((s, p) => s + p.importo, 0)),
    },
  };
}

export interface RigaClassificaFornitore {
  fornitoreChiave: string; fornitoreId: number | null; fornitore: string; acquisti: number; fatture: number;
  acquistiPrima: number; variazione: number | null; pesoTotale: number | null; ultimaFattura: string | null; mesiFermo: number | null; fermo: boolean;
}

/** Classifica dei fornitori di un anno (in ordine di acquisti) con l'anno prima, il peso sul totale e l'ultima fattura di sempre. */
export function classificaFornitori(fatture: FatturaFornitore[], anno_: number, oggi: string): RigaClassificaFornitore[] {
  const totali = totaliAcquisti(fatture);
  const per = new Map<string, RigaClassificaFornitore>();
  for (const f of fatture) {
    let r = per.get(f.fornitoreChiave);
    if (!r) {
      r = { fornitoreChiave: f.fornitoreChiave, fornitoreId: f.fornitoreId, fornitore: f.fornitore, acquisti: 0, fatture: 0, acquistiPrima: 0, variazione: null, pesoTotale: null, ultimaFattura: null, mesiFermo: null, fermo: false };
      per.set(f.fornitoreChiave, r);
    }
    const a = anno(f.data);
    if (a === anno_) { r.acquisti = arr(r.acquisti + segno(f)); r.fatture++; }
    if (a === anno_ - 1) r.acquistiPrima = arr(r.acquistiPrima + segno(f));
    if (!r.ultimaFattura || f.data > r.ultimaFattura) r.ultimaFattura = f.data;
  }
  const righe = [...per.values()].filter(r => r.acquisti !== 0 || r.acquistiPrima !== 0);
  for (const r of righe) {
    r.variazione = variazionePct(r.acquisti, r.acquistiPrima);
    r.pesoTotale = pesoPct(r.acquisti, totali[anno_]);
    r.mesiFermo = mesiDa(r.ultimaFattura, oggi);
    r.fermo = r.mesiFermo != null && r.mesiFermo >= MESI_FERMO;
  }
  return righe.sort((x, y) => y.acquisti - x.acquisti || x.fornitore.localeCompare(y.fornitore));
}

export interface AnnoArticolo {
  anno: number; pezzi: number; spesa: number; prezzoMedio: number | null; variazionePrezzo: number | null; variazioneSpesa: number | null;
  ordini: number; fornitori: string[]; ultimoAcquisto: string | null;
}
export interface SchedaArticolo {
  righe: AnnoArticolo[]; totale: { pezzi: number; spesa: number; ordini: number; prezzoMedio: number | null };
  primaData: string | null; ultimaData: string | null; mesiFermo: number | null;
  /** ultimo acquisto dalle righe degli ordini: prezzo netto e fornitore */
  ultimo: { data: string; prezzo: number; fornitore: string; quantita: number } | null;
  /** prezzo netto più basso e più alto pagati (per vedere quanto oscilla) */
  minimo: number | null; massimo: number | null;
}

/** Prezzo netto della riga (sconto applicato). */
export const prezzoNetto = (r: Pick<RigaAcquistoArticolo, 'prezzo' | 'sconto'>) => arr(r.prezzo * (1 - (r.sconto || 0) / 100), 6);

/** Scheda di un componente o materiale: una riga per anno dagli ordini a fornitore del portale (pezzi, spesa, prezzo medio pesato, fornitori). */
export function schedaArticolo(righe: RigaAcquistoArticolo[], oggi: string): SchedaArticolo {
  const perAnno = new Map<number, AnnoArticolo & { docs: Set<number>; forn: Set<string> }>();
  const ordinate = [...righe].sort((x, y) => x.data.localeCompare(y.data) || x.documentoId - y.documentoId);
  const docs = new Set<number>();
  let ultimo: SchedaArticolo['ultimo'] = null, minimo: number | null = null, massimo: number | null = null;
  for (const r of ordinate) {
    const a = anno(r.data);
    let x = perAnno.get(a);
    if (!x) { x = { anno: a, pezzi: 0, spesa: 0, prezzoMedio: null, variazionePrezzo: null, variazioneSpesa: null, ordini: 0, fornitori: [], ultimoAcquisto: null, docs: new Set(), forn: new Set() }; perAnno.set(a, x); }
    const netto = prezzoNetto(r);
    x.pezzi += r.quantita; x.spesa = arr(x.spesa + r.quantita * netto); x.docs.add(r.documentoId); docs.add(r.documentoId);
    if (r.fornitore) x.forn.add(r.fornitore);
    if (!x.ultimoAcquisto || r.data >= x.ultimoAcquisto) x.ultimoAcquisto = r.data;
    if (r.quantita > 0) {
      ultimo = { data: r.data, prezzo: netto, fornitore: r.fornitore, quantita: r.quantita };
      minimo = minimo == null ? netto : Math.min(minimo, netto); massimo = massimo == null ? netto : Math.max(massimo, netto);
    }
  }
  const out: AnnoArticolo[] = [...perAnno.values()].sort((x, y) => x.anno - y.anno).map(x => ({
    anno: x.anno, pezzi: x.pezzi, spesa: x.spesa, prezzoMedio: x.pezzi > 0 ? arr(x.spesa / x.pezzi, 4) : null, variazionePrezzo: null, variazioneSpesa: null,
    ordini: x.docs.size, fornitori: [...x.forn].sort(), ultimoAcquisto: x.ultimoAcquisto,
  }));
  for (let i = 1; i < out.length; i++) {
    out[i].variazionePrezzo = out[i].prezzoMedio != null && out[i - 1].prezzoMedio != null ? variazionePct(out[i].prezzoMedio!, out[i - 1].prezzoMedio!) : null;
    out[i].variazioneSpesa = variazionePct(out[i].spesa, out[i - 1].spesa);
  }
  const pezzi = out.reduce((s, r) => s + r.pezzi, 0), spesa = arr(out.reduce((s, r) => s + r.spesa, 0));
  const ultimaData = ordinate.length ? ordinate[ordinate.length - 1].data : null;
  return {
    righe: out, totale: { pezzi, spesa, ordini: docs.size, prezzoMedio: pezzi > 0 ? arr(spesa / pezzi, 4) : null },
    primaData: ordinate[0]?.data ?? null, ultimaData, mesiFermo: mesiDa(ultimaData, oggi), ultimo, minimo, massimo,
  };
}

// ── Indirizzi delle schede di analisi (tasto "Analisi" nelle anagrafiche: Prodotti, Fornitori, Componenti, Materiali) ──
/** Scheda di analisi del prodotto (Analisi → Prodotti): codice + chiave del cliente (c<id>). */
export const linkAnalisiProdotto = (p: { codice: string; cliente_id: number | null }) =>
  `/amministrazione/analisi/prodotto?codice=${encodeURIComponent(p.codice)}${p.cliente_id ? `&cliente=c${p.cliente_id}` : ''}`;
export const linkAnalisiFornitore = (id: number) => `/amministrazione/analisi/fornitore?f=f${id}`;
export const linkAnalisiComponente = (id: number) => `/amministrazione/analisi/componente?id=${id}`;
export const linkAnalisiMateriale = (id: number) => `/amministrazione/analisi/materiale?id=${id}`;
