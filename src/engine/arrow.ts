/**
 * Lettura delle risposte dell'API di Arrow (Pricing & Availability, ItemService v4) — Adriano 1/11/2026: "controlla se Arrow ha le API".
 * Arrow ha l'API: chiave gratuita per i clienti da developers.arrow.com → "Request API Key" (login + apikey; arrow.com e Verical
 * usano la stessa chiave). Chiamata: GET https://api.arrow.com/itemservice/v4/en/search/token?login=…&apikey=…&search_token=<P/N>&rows=10
 * Risposta (struttura documentata da Arrow, campi da confermare con le prime chiavi vere, lettura tollerante):
 *   itemserviceresult.data[].PartList[]: partNum, manufacturer{mfrName}, desc, status,
 *     InvOrg.webSites[]{code, sources[]{currency, sourceCd, sourceParts[]{packSize, minimumOrderQuantity, sourcePartNumber,
 *       Prices.resaleList[]{price, minQty}, Availability[]{fohQty}, mfrLeadTime, containerType}}}
 * Separata dalle chiamate di rete per poterla provare nei test.
 */
import { leggiPrezzo, type Offerta } from './acquisti.js';
import { pnKey } from './codifica/bom.js';

const lista = (x: any): any[] => Array.isArray(x) ? x : x == null ? [] : [x];

/** Le parti della risposta, ovunque siano (data[].PartList[]). */
export function partiArrow(r: any): any[] {
  const res = r?.itemserviceresult ?? r?.itemServiceResult ?? r;
  return lista(res?.data).flatMap((d: any) => lista(d?.PartList ?? d?.partList));
}

/** Offerte Arrow per un P/N: solo le parti con lo stesso codice del produttore (o, se `varianti`, che cominciano con il P/N). */
export function offerteArrow(pn: string, r: any, opz: { varianti?: boolean } = {}): Offerta[] {
  const k = pnKey(pn);
  const out: Offerta[] = [];
  for (const p of partiArrow(r)) {
    const mpn = String(p?.partNum ?? p?.mpn ?? '');
    const kp = pnKey(mpn);
    if (!kp || !(kp === k || (opz.varianti && k && kp.startsWith(k)))) continue;
    const stato = String(p?.status ?? '');
    const siti = lista(p?.InvOrg?.webSites ?? p?.invOrg?.webSites);
    // prima arrow.com; Verical (marketplace) solo se arrow.com non c'è
    const arrow = siti.filter((s: any) => /arrow/i.test(String(s?.code ?? s?.name ?? '')));
    for (const sito of arrow.length ? arrow : siti) {
      for (const sorgente of lista(sito?.sources)) {
        for (const sp of lista(sorgente?.sourceParts)) {
          const scaglioni = lista(sp?.Prices?.resaleList ?? sp?.prices?.resaleList)
            .map((x: any) => ({ qta: Number(x?.minQty ?? x?.minQuantity ?? 1), prezzo: leggiPrezzo(x?.price ?? x?.displayPrice) ?? 0 }))
            .filter((x: { qta: number; prezzo: number }) => x.qta > 0 && x.prezzo > 0).sort((a: any, b: any) => a.qta - b.qta);
          if (!scaglioni.length) continue;
          const stock = lista(sp?.Availability ?? sp?.availability).reduce((s: number, a: any) => s + (Number(a?.fohQty ?? a?.quantity ?? 0) || 0), 0);
          const pack = Number(sp?.packSize ?? 1) || 1;
          out.push({
            fornitore: 'arrow', codiceFornitore: String(sp?.sourcePartNumber ?? sp?.sourcePartId ?? mpn), mpn,
            produttore: String(p?.manufacturer?.mfrName ?? p?.manufacturer?.name ?? ''), descrizione: String(p?.desc ?? p?.description ?? ''),
            confezione: sp?.containerType ? String(sp.containerType) : undefined, stock,
            moq: Number(sp?.minimumOrderQuantity ?? 1) || 1, multiplo: /reel/i.test(String(sp?.containerType ?? '')) ? pack : 1,
            scaglioni, valuta: String(sorgente?.currency ?? 'USD').toUpperCase(), ciclo: stato || null,
            obsoleto: /obsolete|discontinued|eol/i.test(stato), consegnaSettimane: Number(sp?.mfrLeadTime) || null,
            url: `https://www.arrow.com/it-it/products/search?q=${encodeURIComponent(mpn)}`,
          });
        }
      }
    }
  }
  // stessa parte da più sorgenti: in cima quelle in euro
  return out.sort((a, b) => Number(b.valuta === 'EUR') - Number(a.valuta === 'EUR'));
}
