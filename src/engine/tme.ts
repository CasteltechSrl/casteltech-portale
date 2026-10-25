/**
 * Lettura delle risposte dell'API v2 di TME (documentazione: developers.tme.eu/openapi.json).
 *   GET /products?mpns[]=…            → data.elements[]: symbol, manufacturer_symbols[], manufacturer{name}, description,
 *                                        minimal_amount, multiples, product_status[]
 *   GET /products/data?symbols[]=…&scope[]=prices&scope[]=stock&amounts[]=…
 *                                      → data.elements[]: symbol, stock_quantity, prices{elements[]{amount, price}, currency}
 * Separata dalle chiamate di rete per poterla provare nei test.
 */
import { leggiPrezzo, type Offerta } from './acquisti.js';
import { pnKey } from './codifica/bom.js';

/** Stati TME che vogliono dire "non si può più comprare". */
const STATI_OBSOLETI = /CANNOT_BE_ORDERED|NOT_IN_OFFER|PRODUCT_BLOCKED|END_OF_LIFE|WITHDRAWN/i;
/** "Fino a esaurimento scorte": si compra ancora, ma è a fine vita. */
const STATI_FINE_VITA = /AVAILABLE_WHILE_STOCKS_LAST/i;

/** Gli elementi della risposta: { data: { elements: [...] } } (tollera anche altre forme vicine). */
export function elementiTme(r: any): any[] {
  const x = r?.data?.elements ?? r?.elements ?? r?.data ?? r;
  return Array.isArray(x) ? x : [];
}

/** Codici del produttore di un prodotto TME (possono essere più di uno). */
const codiciProduttore = (p: any): string[] => [p?.manufacturer_symbols, p?.original_symbol].flat().filter(Boolean).map(String);

/**
 * Offerte TME per ogni P/N cercato. Un prodotto vale per il P/N se uno dei suoi codici produttore coincide;
 * se TME non li manda e si è cercato un solo P/N, valgono tutti i prodotti trovati.
 */
export function offerteTme(pns: string[], prodotti: any[], dati: any[]): Map<string, Offerta[]> {
  const perSimbolo = new Map(dati.map(d => [String(d?.symbol), d]));
  const out = new Map<string, Offerta[]>();
  for (const pn of pns) {
    const k = pnKey(pn);
    const trovati = prodotti.filter(p => {
      const codici = codiciProduttore(p);
      return codici.length ? codici.some(c => pnKey(c) === k) : pns.length === 1;
    });
    out.set(pn, trovati.map((p): Offerta => {
      const s = String(p.symbol); const d = perSimbolo.get(s) ?? {};
      const stati: string[] = [p.product_status].flat().filter(Boolean).map(String);
      const prezzi = d.prices?.elements ?? [];
      return {
        fornitore: 'tme', codiceFornitore: s,
        mpn: codiciProduttore(p).find(c => pnKey(c) === k) ?? codiciProduttore(p)[0] ?? pn.trim(),
        produttore: String(p.manufacturer?.name ?? p.manufacturer ?? ''), descrizione: String(p.description ?? ''),
        stock: Number(d.stock_quantity ?? 0) || 0,
        moq: Number(p.minimal_amount ?? 1) || 1, multiplo: Number(p.multiples ?? 1) || 1,
        scaglioni: (Array.isArray(prezzi) ? prezzi : []).map((x: any) => ({ qta: Number(x?.amount), prezzo: leggiPrezzo(x?.price) ?? 0 }))
          .filter(x => x.qta > 0 && x.prezzo > 0).sort((a, b) => a.qta - b.qta),
        valuta: String(d.prices?.currency ?? 'EUR'), ciclo: stati.join(' ') || null, obsoleto: stati.some(x => STATI_OBSOLETI.test(x)),
        fineVita: stati.some(x => STATI_FINE_VITA.test(x)),
        url: `https://www.tme.eu/it/details/${encodeURIComponent(s)}/`,
      };
    }).filter(o => o.scaglioni.length));
  }
  return out;
}
