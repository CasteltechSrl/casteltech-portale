/**
 * Lettura delle risposte della Customer API di Würth Elektronik (CAPI: dati prodotto, prezzi, disponibilità) — Adriano 2–4/11/2026:
 * "compriamo molto da WE, i prezzi diretti sono molto più bassi degli shop online". Credenziali (client ID + secret, scadono il
 * 5/6/2027, "Renew" sulla pagina) da profile.we-online.com/api-credentials con l'account WEID di info@; documentazione sulla stessa pagina:
 *   token:        POST https://login.witglobal.net/as/token.oauth2  (x-www-form-urlencoded) grant_type=client_credentials&wuerth_resource=customer_api
 *   prezzi:       POST https://api.witglobal.net/rest/api-services/pricing       { articles: [{ articleNumber, quantities: [..] }] }
 *                 → [{ articleNumber, requestedArticleNumber, requestedQuantity, articlePrices: [{ quantity, price, baseUnit, currency, validUntil }] }]
 *   disponibilità: POST https://api.witglobal.net/rest/api-services/availability (stesso corpo)
 *                 → [{ articleNumber, requestedArticleNumber, currentStock, leadTime, isAvailableAfterLeadTime, availabilitySegments, spq }]
 * Prezzi = i NOSTRI prezzi (storico degli acquisti), per i codici mai comprati quelli di listino (Federico Graffeo, WE, 4/11/2026).
 * Si ordina comunque tramite il commerciale WE: l'API serve per avere subito il prezzo nel preventivo.
 * Separata dalle chiamate di rete per poterla provare nei test. Lettura tollerante (campi da confermare con la prima "Prova").
 */
import { leggiPrezzo, type Offerta } from './acquisti.js';
import { pnKey } from './codifica/bom.js';

/** Quantità chieste a WE per costruire gli scaglioni di prezzo. */
export const QUANTITA_WURTH = [1, 10, 100, 500, 1000, 5000];

/**
 * Codici Würth Elektronik: solo cifre (es. 885012206071, 744227, 7447709100), al più una lettera in fondo, o con il prefisso "WE".
 * Agli altri P/N non si chiede (risparmia chiamate: le BOM hanno per lo più codici di altri produttori).
 */
export function codiceWurth(pn: unknown): boolean {
  const k = pnKey(pn);
  if (!k) return false;
  const senza = k.replace(/^WE/, '');
  return /^\d{6,14}[A-Z]?$/.test(senza);
}

/** Il numero da mandare a WE: senza il prefisso "WE-" e senza spazi. */
export function articoloWurth(pn: string): string {
  return pn.trim().toUpperCase().replace(/^WE[-\s]?(?=\d)/, '').replace(/\s+/g, '');
}

/** Corpo della richiesta (prezzi o disponibilità) per un elenco di P/N. */
export function corpoWurth(pns: string[], quantita: number[] = QUANTITA_WURTH) {
  return { articles: pns.map(pn => ({ articleNumber: articoloWurth(pn), quantities: quantita })), projectName: 'Preventivo Casteltech', endCustomerName: 'Casteltech' };
}

const lista = (x: any): any[] => Array.isArray(x) ? x : x == null ? [] : Array.isArray(x?.articles) ? x.articles : Array.isArray(x?.data) ? x.data : [x];
const chiave = (x: any) => pnKey(articoloWurth(String(x ?? '')));

/** Offerte WE per ogni P/N chiesto, unendo la risposta dei prezzi e quella della disponibilità. */
export function offerteWurth(pns: string[], prezzi: any, disponibilita: any): Map<string, Offerta[]> {
  const perArticolo = new Map<string, { articolo: string; scaglioni: Map<number, number>; valuta: string; unita: string }>();
  for (const e of lista(prezzi)) {
    const k = chiave(e?.requestedArticleNumber ?? e?.articleNumber);
    if (!k) continue;
    const a = perArticolo.get(k) ?? { articolo: String(e?.articleNumber ?? e?.requestedArticleNumber ?? ''), scaglioni: new Map(), valuta: 'EUR', unita: '' };
    for (const p of lista(e?.articlePrices)) {
      const qta = Number(p?.quantity ?? e?.requestedQuantity ?? 0);
      const prezzo = leggiPrezzo(p?.price) ?? 0;
      if (!(qta > 0 && prezzo > 0)) continue;
      // stessa quantità due volte: vale il prezzo più basso
      a.scaglioni.set(qta, Math.min(prezzo, a.scaglioni.get(qta) ?? Infinity));
      if (p?.currency) a.valuta = String(p.currency).toUpperCase();
      if (p?.baseUnit) a.unita = String(p.baseUnit);
    }
    perArticolo.set(k, a);
  }
  const disp = new Map<string, any>();
  for (const e of lista(disponibilita)) { const k = chiave(e?.requestedArticleNumber ?? e?.articleNumber); if (k) disp.set(k, e); }

  return new Map(pns.map(pn => {
    const k = chiave(pn)!;
    const a = perArticolo.get(k);
    if (!a || !a.scaglioni.size) return [pn, []];
    const d = disp.get(k);
    const scaglioni = [...a.scaglioni.entries()].map(([qta, prezzo]) => ({ qta, prezzo })).sort((x, y) => x.qta - y.qta);
    // prezzo uguale per più quantità: basta il primo scaglione
    const ridotti = scaglioni.filter((s, i) => i === 0 || s.prezzo < scaglioni[i - 1].prezzo);
    const consegna = Number(d?.leadTime);
    const offerta: Offerta = {
      fornitore: 'wurth', codiceFornitore: a.articolo || articoloWurth(pn), mpn: a.articolo || articoloWurth(pn), produttore: 'Würth Elektronik',
      descrizione: '', stock: Number(d?.currentStock ?? 0) || 0, moq: ridotti[0].qta, multiplo: 1,
      confezione: d?.spq ? `confezione standard ${d.spq} pz` : undefined,
      scaglioni: ridotti, valuta: a.valuta, ciclo: a.unita && !/^(STK|PCE|PCS|ST)$/i.test(a.unita) ? `prezzo per ${a.unita}` : null,
      consegnaSettimane: Number.isFinite(consegna) && consegna > 0 ? consegna : null,
      url: `https://www.we-online.com/en/search?q=${encodeURIComponent(a.articolo || articoloWurth(pn))}`,
    };
    return [pn, [offerta]];
  }));
}
