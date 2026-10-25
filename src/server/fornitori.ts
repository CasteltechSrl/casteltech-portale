/**
 * Prezzi e disponibilità dai distributori: DigiKey, Mouser, Farnell, TME.
 * Le chiavi si mettono SOLO nelle variabili d'ambiente di Render (mai nel portale o nel repository):
 *   DIGIKEY_CLIENT_ID, DIGIKEY_CLIENT_SECRET   developer.digikey.com → Production App "Product Information V4"
 *   MOUSER_API_KEY                             mouser.it → My Mouser → APIs → Search API
 *   FARNELL_API_KEY (FARNELL_STORE, default it.farnell.com)   partner.element14.com
 *   TME_APP_TOKEN, TME_APP_SECRET              developers.tme.eu (API v2, OAuth client credentials)
 * Ogni risposta resta in fornitori_cache per 24 ore (stesso P/N = nessuna nuova chiamata).
 * Le risposte di TME e Farnell sono lette in modo tollerante: i nomi dei campi vanno confermati con le prime chiavi vere.
 */
import { q, q1 } from './db.js';
import { leggiPrezzo, type Fornitore, type Offerta } from '../engine/acquisti.js';
import { pnKey } from '../engine/codifica/bom.js';
import type { ProdottoDigiKey } from '../engine/codifica/digikey-dati.js';

const ORE_CACHE = 24;
const TIMEOUT = 20_000;

export interface RisultatoFornitore { offerte: Offerta[]; prodotto?: ProdottoDigiKey | null; errore?: string }

export class ErroreFornitore extends Error {}

export function fornitoriConfigurati(): Record<Fornitore, boolean> {
  const e = process.env;
  return {
    digikey: !!(e.DIGIKEY_CLIENT_ID && e.DIGIKEY_CLIENT_SECRET), mouser: !!e.MOUSER_API_KEY,
    farnell: !!e.FARNELL_API_KEY, tme: !!(e.TME_APP_TOKEN && e.TME_APP_SECRET),
  };
}

async function http(url: string, opz: RequestInit & { nome: string }): Promise<any> {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { ...opz, signal: ctrl.signal });
    const testo = await r.text();
    let corpo: any = null; try { corpo = testo ? JSON.parse(testo) : null; } catch { corpo = null; }
    if (r.status === 404) return null;
    if (r.status === 429) throw new ErroreFornitore(`${opz.nome}: limite di richieste raggiunto, riprova più tardi`);
    if (r.status === 401 || r.status === 403) throw new ErroreFornitore(`${opz.nome}: accesso negato (${r.status}), controlla le chiavi su Render`);
    if (!r.ok) throw new ErroreFornitore(`${opz.nome}: errore ${r.status} ${testo.slice(0, 200)}`);
    return corpo;
  } catch (e: any) {
    if (e instanceof ErroreFornitore) throw e;
    throw new ErroreFornitore(`${opz.nome} non raggiungibile: ${e?.name === 'AbortError' ? 'tempo scaduto' : e?.message ?? e}`);
  } finally { clearTimeout(t); }
}

// ───────────────────────────── cache ─────────────────────────────
async function daCache(fornitore: string, chiave: string): Promise<RisultatoFornitore | null> {
  const r = await q1<{ dati: RisultatoFornitore }>(`SELECT dati FROM fornitori_cache WHERE fornitore = $1 AND chiave = $2
    AND aggiornato_il > now() - make_interval(hours => $3)`, [fornitore, chiave, ORE_CACHE]);
  return r?.dati ?? null;
}
/** Salva in cache un risultato già ottenuto (es. dalla ricerca per parametri), così non si richiede di nuovo. */
export const memorizza = (fornitore: Fornitore, pn: string, dati: RisultatoFornitore) => inCache(fornitore, pnKey(pn)!, dati);
async function inCache(fornitore: string, chiave: string, dati: RisultatoFornitore) {
  await q(`INSERT INTO fornitori_cache (fornitore, chiave, dati, aggiornato_il) VALUES ($1,$2,$3, now())
    ON CONFLICT (fornitore, chiave) DO UPDATE SET dati = $3, aggiornato_il = now()`, [fornitore, chiave, JSON.stringify(dati)]);
}

const intero = (x: unknown) => { const n = parseInt(String(x ?? '').replace(/[^\d]/g, ''), 10); return Number.isFinite(n) ? n : 0; };
const settimane = (x: unknown) => {
  const s = String(x ?? ''); const n = parseFloat(s.replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  return /day|giorn/i.test(s) ? Math.ceil(n / 7) : n;
};

// ───────────────────────────── DigiKey ─────────────────────────────
let tokenDk: { valore: string; scade: number } | null = null;
async function tokenDigikey(): Promise<string> {
  if (tokenDk && Date.now() < tokenDk.scade) return tokenDk.valore;
  const r = await http('https://api.digikey.com/v1/oauth2/token', {
    nome: 'DigiKey', method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.DIGIKEY_CLIENT_ID!, client_secret: process.env.DIGIKEY_CLIENT_SECRET!, grant_type: 'client_credentials' }),
  });
  if (!r?.access_token) throw new ErroreFornitore('DigiKey: token non ricevuto');
  tokenDk = { valore: r.access_token, scade: Date.now() + (Number(r.expires_in ?? 600) - 60) * 1000 };
  return tokenDk.valore;
}
async function digikeyKeyword(corpo: object): Promise<any> {
  return http('https://api.digikey.com/products/v4/search/keyword', {
    nome: 'DigiKey', method: 'POST',
    headers: { Authorization: `Bearer ${await tokenDigikey()}`, 'X-DIGIKEY-Client-Id': process.env.DIGIKEY_CLIENT_ID!, 'X-DIGIKEY-Locale-Site': 'IT',
      'X-DIGIKEY-Locale-Language': 'en', 'X-DIGIKEY-Locale-Currency': 'EUR', 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(corpo),
  });
}
/** Solo i campi che servono (la cache resta piccola). */
function riduciDk(p: any): ProdottoDigiKey {
  return { ManufacturerProductNumber: p.ManufacturerProductNumber, Manufacturer: { Name: p.Manufacturer?.Name }, Description: p.Description,
    Category: p.Category, Parameters: p.Parameters, ProductUrl: p.ProductUrl };
}
export function offerteDigikey(p: any): Offerta[] {
  const stato = String(p.ProductStatus?.Status ?? '');
  const comune = {
    fornitore: 'digikey' as const, mpn: p.ManufacturerProductNumber ?? '', produttore: p.Manufacturer?.Name ?? '',
    descrizione: p.Description?.ProductDescription ?? '', valuta: 'EUR', ciclo: stato || null,
    obsoleto: !!p.Discontinued || /obsolete/i.test(stato), fineVita: !!p.EndOfLife || /last time buy|not for new/i.test(stato),
    consegnaSettimane: settimane(p.ManufacturerLeadWeeks), url: p.ProductUrl ?? null,
  };
  return (p.ProductVariations ?? []).filter((v: any) => !/digi-?reel/i.test(v.PackageType?.Name ?? '')).map((v: any): Offerta => {
    const bobina = /tape\s*&\s*reel/i.test(v.PackageType?.Name ?? '');
    return { ...comune, codiceFornitore: v.DigiKeyProductNumber ?? '', confezione: v.PackageType?.Name,
      stock: Number(v.QuantityAvailableforPackageType ?? p.QuantityAvailable ?? 0),
      moq: Number(v.MinimumOrderQuantity ?? 1), multiplo: bobina ? Number(v.StandardPackage ?? 1) || 1 : 1,
      scaglioni: (v.StandardPricing ?? []).map((s: any) => ({ qta: Number(s.BreakQuantity), prezzo: Number(s.UnitPrice) })) };
  }).filter((o: Offerta) => o.scaglioni.length);
}
async function digikeyPn(pn: string): Promise<RisultatoFornitore> {
  const k = pnKey(pn);
  const r = await digikeyKeyword({ Keywords: pn.trim(), Limit: 10, Offset: 0 });
  const prodotti: any[] = [...(r?.ExactMatches ?? []), ...(r?.Products ?? [])];
  const p = prodotti.find(x => pnKey(x.ManufacturerProductNumber) === k) ?? prodotti.find(x => (pnKey(x.ManufacturerProductNumber) ?? '').startsWith(k ?? '@'));
  return p ? { offerte: offerteDigikey(p), prodotto: riduciDk(p) } : { offerte: [], prodotto: null };
}
/** Ricerca per parametri (componenti senza P/N): prodotti in stock, i più economici prima. */
export async function digikeyParametri(parole: string): Promise<{ prodotto: ProdottoDigiKey; offerte: Offerta[] }[]> {
  const r = await digikeyKeyword({ Keywords: parole, Limit: 20, Offset: 0,
    FilterOptionsRequest: { SearchOptions: ['InStock'], MarketPlaceFilter: 'ExcludeMarketPlace' }, SortOptions: { Field: 'Price', SortOrder: 'Ascending' } });
  return (r?.Products ?? []).map((p: any) => ({ prodotto: riduciDk(p), offerte: offerteDigikey(p) }));
}

// ───────────────────────────── Mouser ─────────────────────────────
export function offertaMouser(p: any): Offerta {
  const pb = p.PriceBreaks ?? [];
  return {
    fornitore: 'mouser', codiceFornitore: p.MouserPartNumber ?? '', mpn: p.ManufacturerPartNumber ?? '', produttore: p.Manufacturer ?? '',
    descrizione: p.Description ?? '', stock: intero(p.AvailabilityInStock ?? (String(p.Availability ?? '').match(/\d[\d.,]*/)?.[0] ?? 0)),
    moq: intero(p.Min) || 1, multiplo: intero(p.Mult) || 1, valuta: pb[0]?.Currency ?? 'EUR',
    scaglioni: pb.map((s: any) => ({ qta: Number(s.Quantity), prezzo: leggiPrezzo(s.Price) ?? 0 })).filter((s: any) => s.prezzo > 0),
    ciclo: p.LifecycleStatus ?? null, obsoleto: String(p.IsDiscontinued) === 'true', consegnaSettimane: settimane(p.LeadTime), url: p.ProductDetailUrl ?? null,
  };
}
async function mouserPn(pns: string[]): Promise<Map<string, RisultatoFornitore>> {
  const r = await http(`https://api.mouser.com/api/v1/search/partnumber?apiKey=${encodeURIComponent(process.env.MOUSER_API_KEY!)}`, {
    nome: 'Mouser', method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ SearchByPartRequest: { mouserPartNumber: pns.join('|'), partSearchOptions: 'Exact' } }),
  });
  const errori = (r?.Errors ?? []).map((e: any) => e.Message).filter(Boolean);
  if (errori.length) throw new ErroreFornitore(`Mouser: ${errori.join('; ')}`);
  const parti: any[] = r?.SearchResults?.Parts ?? [];
  return new Map(pns.map(pn => {
    const k = pnKey(pn);
    return [pn, { offerte: parti.filter(p => pnKey(p.ManufacturerPartNumber) === k).map(offertaMouser).filter(o => o.scaglioni.length) }];
  }));
}
export async function mouserParametri(parole: string): Promise<Offerta[]> {
  const r = await http(`https://api.mouser.com/api/v1/search/keyword?apiKey=${encodeURIComponent(process.env.MOUSER_API_KEY!)}`, {
    nome: 'Mouser', method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ SearchByKeywordRequest: { keyword: parole, records: 30, startingRecord: 0, searchOptions: 'InStock' } }),
  });
  return (r?.SearchResults?.Parts ?? []).map(offertaMouser).filter((o: Offerta) => o.scaglioni.length);
}

// ───────────────────────────── Farnell ─────────────────────────────
export function offertaFarnell(p: any): Offerta {
  const pack = Number(p.packSize) > 1 && /pack|confez/i.test(String(p.unitOfMeasure ?? '')) ? Number(p.packSize) : 1;
  const stato = String(p.productStatus ?? '');
  return {
    fornitore: 'farnell', codiceFornitore: p.sku ?? '', mpn: p.translatedManufacturerPartNumber ?? '', produttore: p.brandName ?? p.vendorName ?? '',
    descrizione: p.displayName ?? '', stock: Number(p.stock?.level ?? p.inv ?? 0), confezione: p.unitOfMeasure,
    moq: (Number(p.translatedMinimumOrderQuality ?? p.minimumOrderQuantity ?? 1) || 1) * pack, multiplo: (Number(p.orderMultiples ?? 1) || 1) * pack,
    scaglioni: (p.prices ?? []).map((s: any) => ({ qta: Number(s.from) * pack, prezzo: Number(s.cost) / pack })).filter((s: any) => s.prezzo > 0),
    valuta: 'EUR', ciclo: stato || null, obsoleto: /NO_LONGER_MANUFACTURED|OBSOLETE/i.test(stato),
    consegnaSettimane: p.stock?.leastLeadTime ? Math.ceil(Number(p.stock.leastLeadTime) / 7) : null,
    url: p.sku ? `https://${process.env.FARNELL_STORE ?? 'it.farnell.com'}/${encodeURIComponent(p.sku)}` : null,
  };
}
async function farnellPn(pn: string): Promise<RisultatoFornitore> {
  const u = new URL('https://api.element14.com/catalog/products');
  const par: Record<string, string> = { term: `manuPartNum:${pn.trim()}`, 'storeInfo.id': process.env.FARNELL_STORE ?? 'it.farnell.com',
    'resultsSettings.offset': '0', 'resultsSettings.numberOfResults': '10', 'resultsSettings.responseGroup': 'large',
    'callInfo.responseDataFormat': 'JSON', 'callInfo.apiKey': process.env.FARNELL_API_KEY! };
  for (const [k, v] of Object.entries(par)) u.searchParams.set(k, v);
  const r = await http(u.toString(), { nome: 'Farnell', headers: { Accept: 'application/json' } });
  const ritorno = r?.manufacturerPartNumberSearchReturn ?? r?.keywordSearchReturn ?? {};
  const k = pnKey(pn);
  return { offerte: (ritorno.products ?? []).filter((p: any) => pnKey(p.translatedManufacturerPartNumber) === k).map(offertaFarnell).filter((o: Offerta) => o.scaglioni.length) };
}

// ───────────────────────────── TME (API v2) ─────────────────────────────
let tokenTme: { valore: string; scade: number } | null = null;
async function tokenTmeValido(): Promise<string> {
  if (tokenTme && Date.now() < tokenTme.scade) return tokenTme.valore;
  const basic = Buffer.from(`${process.env.TME_APP_TOKEN}:${process.env.TME_APP_SECRET}`).toString('base64');
  const r = await http('https://api.tme.eu/auth/token', { nome: 'TME', method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials' }) });
  if (!r?.access_token) throw new ErroreFornitore('TME: token non ricevuto');
  tokenTme = { valore: r.access_token, scade: Date.now() + (Number(r.expires_in ?? 300) - 30) * 1000 };
  return tokenTme.valore;
}
async function tmeGet(percorso: string, par: Record<string, string | string[]>): Promise<any> {
  const u = new URL(`https://api.tme.eu/${percorso}`);
  u.searchParams.set('country', 'IT');
  for (const [k, v] of Object.entries(par)) for (const x of Array.isArray(v) ? v : [v]) u.searchParams.append(Array.isArray(v) ? `${k}[]` : k, x);
  const r = await http(u.toString(), { nome: 'TME', headers: { Authorization: `Bearer ${await tokenTmeValido()}`, 'Accept-Language': 'it', Accept: 'application/json' } });
  return r?.data ?? r;
}
/** Elenchi di oggetti con il campo "symbol" ovunque si trovino nella risposta (formato v2 da confermare). */
function elencoSimboli(x: any, out: any[] = []): any[] {
  if (Array.isArray(x)) { for (const y of x) elencoSimboli(y, out); return out; }
  if (x && typeof x === 'object') {
    if ('symbol' in x || 'Symbol' in x) out.push(x);
    else for (const v of Object.values(x)) elencoSimboli(v, out);
  }
  return out;
}
const campo = (o: any, ...nomi: string[]) => { for (const n of nomi) if (o?.[n] != null) return o[n]; return undefined; };
async function tmePn(pns: string[]): Promise<Map<string, RisultatoFornitore>> {
  const prodotti = elencoSimboli(await tmeGet('products', { mpns: pns.slice(0, 50) }));
  const simboli = prodotti.map(p => String(campo(p, 'symbol', 'Symbol')));
  const dati = simboli.length ? elencoSimboli(await tmeGet('products/data', { symbols: simboli, scope: ['prices', 'stocks'], currency: 'EUR' })) : [];
  const perSimbolo = new Map(dati.map(d => [String(campo(d, 'symbol', 'Symbol')), d]));
  const out = new Map<string, RisultatoFornitore>();
  for (const pn of pns) {
    const k = pnKey(pn);
    const offerte = prodotti.filter(p => pnKey(campo(p, 'original_symbol', 'originalSymbol', 'OriginalSymbol', 'mpn')) === k).map((p): Offerta => {
      const s = String(campo(p, 'symbol', 'Symbol')); const d = perSimbolo.get(s) ?? {};
      const prezzi = campo(d, 'prices', 'price_list', 'PriceList') ?? [];
      const stato = [campo(p, 'product_status', 'productStatus', 'ProductStatusList')].flat().filter(Boolean).join(' ');
      return {
        fornitore: 'tme', codiceFornitore: s, mpn: String(campo(p, 'original_symbol', 'originalSymbol', 'OriginalSymbol') ?? ''),
        produttore: String(campo(p, 'producer', 'Producer') ?? ''), descrizione: String(campo(p, 'description', 'Description') ?? ''),
        stock: Number(campo(d, 'stock', 'amount', 'Amount', 'quantity') ?? 0) || 0,
        moq: Number(campo(p, 'min_amount', 'minAmount', 'MinAmount') ?? 1) || 1, multiplo: Number(campo(p, 'multiples', 'Multiples') ?? 1) || 1,
        scaglioni: (Array.isArray(prezzi) ? prezzi : []).map((x: any) => ({ qta: Number(campo(x, 'amount', 'Amount', 'quantity')), prezzo: leggiPrezzo(campo(x, 'price_value', 'priceValue', 'PriceValue', 'price')) ?? 0 }))
          .filter((x: any) => x.qta > 0 && x.prezzo > 0),
        valuta: String(campo(d, 'currency', 'Currency') ?? 'EUR'), ciclo: stato || null, obsoleto: /NOT_IN_OFFER|CANNOT_BE_ORDERED|END_OF_LIFE|WITHDRAWN/i.test(stato),
        url: `https://www.tme.eu/it/details/${encodeURIComponent(s)}/`,
      };
    }).filter(o => o.scaglioni.length);
    out.set(pn, { offerte });
  }
  return out;
}

// ───────────────────────────── ricerca per elenco di P/N ─────────────────────────────
export interface EsitoRicerca { perPn: Map<string, Partial<Record<Fornitore, RisultatoFornitore>>>; errori: Partial<Record<Fornitore, string>> }

async function aLotti<T>(elementi: T[], insieme: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(insieme, elementi.length) }, async () => { while (i < elementi.length) await fn(elementi[i++]); }));
}
const pausa = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Prezzi e disponibilità per una lista di P/N presso tutti i distributori configurati. */
export async function cercaPn(pns: string[], opz: { forza?: boolean; avanzamento?: (fatti: number) => void } = {}): Promise<EsitoRicerca> {
  const attivi = fornitoriConfigurati();
  const unici = [...new Map(pns.filter(Boolean).map(p => [pnKey(p)!, p.trim()])).entries()].filter(([k]) => k);
  const perPn = new Map<string, Partial<Record<Fornitore, RisultatoFornitore>>>(unici.map(([k]) => [k, {}]));
  const errori: Partial<Record<Fornitore, string>> = {};
  let fatti = 0;
  const segna = (k: string, f: Fornitore, r: RisultatoFornitore) => { perPn.get(k)![f] = r; };
  // prima la cache
  const daCercare: Record<Fornitore, [string, string][]> = { digikey: [], mouser: [], farnell: [], tme: [] };
  for (const f of Object.keys(daCercare) as Fornitore[]) {
    if (!attivi[f]) continue;
    for (const [k, pn] of unici) {
      const c = opz.forza ? null : await daCache(f, k);
      if (c) segna(k, f, c); else daCercare[f].push([k, pn]);
    }
  }
  const lavori: Promise<void>[] = [];
  if (daCercare.digikey.length) lavori.push(aLotti(daCercare.digikey, 3, async ([k, pn]) => {
    if (errori.digikey) return;
    try { const r = await digikeyPn(pn); segna(k, 'digikey', r); await inCache('digikey', k, r); }
    catch (e: any) { errori.digikey = e.message; }
    opz.avanzamento?.(++fatti);
  }));
  if (daCercare.mouser.length) lavori.push((async () => {
    for (let i = 0; i < daCercare.mouser.length && !errori.mouser; i += 10) {
      const lotto = daCercare.mouser.slice(i, i + 10);
      try {
        const r = await mouserPn(lotto.map(x => x[1]));
        for (const [k, pn] of lotto) { const x = r.get(pn) ?? { offerte: [] }; segna(k, 'mouser', x); await inCache('mouser', k, x); }
      } catch (e: any) { errori.mouser = e.message; }
      fatti += lotto.length; opz.avanzamento?.(fatti);
      await pausa(2100); // 30 richieste al minuto
    }
  })());
  if (daCercare.farnell.length) lavori.push(aLotti(daCercare.farnell, 2, async ([k, pn]) => {
    if (errori.farnell) return;
    try { const r = await farnellPn(pn); segna(k, 'farnell', r); await inCache('farnell', k, r); }
    catch (e: any) { errori.farnell = e.message; }
    opz.avanzamento?.(++fatti); await pausa(300);
  }));
  if (daCercare.tme.length) lavori.push((async () => {
    for (let i = 0; i < daCercare.tme.length && !errori.tme; i += 50) {
      const lotto = daCercare.tme.slice(i, i + 50);
      try {
        const r = await tmePn(lotto.map(x => x[1]));
        for (const [k, pn] of lotto) { const x = r.get(pn) ?? { offerte: [] }; segna(k, 'tme', x); await inCache('tme', k, x); }
      } catch (e: any) { errori.tme = e.message; }
      fatti += lotto.length; opz.avanzamento?.(fatti);
    }
  })());
  await Promise.all(lavori);
  return { perPn, errori };
}

/** Prova di collegamento (Impostazioni → Componenti). */
export async function provaFornitore(f: Fornitore, pn = 'RC0603FR-072K2L'): Promise<string> {
  if (!fornitoriConfigurati()[f]) return 'chiavi non impostate su Render';
  try {
    let offerte: Offerta[] = [];
    if (f === 'digikey') offerte = (await digikeyPn(pn)).offerte;
    if (f === 'mouser') offerte = (await mouserPn([pn])).get(pn)?.offerte ?? [];
    if (f === 'farnell') offerte = (await farnellPn(pn)).offerte;
    if (f === 'tme') offerte = (await tmePn([pn])).get(pn)?.offerte ?? [];
    if (!offerte.length) return `collegato, ma ${pn} non trovato`;
    const o = offerte[0];
    return `OK: ${o.mpn} ${o.codiceFornitore}, ${o.stock} pz, da ${o.scaglioni[0]?.prezzo} ${o.valuta}`;
  } catch (e: any) { return e.message; }
}
