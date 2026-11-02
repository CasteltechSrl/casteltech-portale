/**
 * Prezzi e disponibilità dai distributori: DigiKey, Mouser, Farnell, TME.
 * Le chiavi si mettono SOLO nelle variabili d'ambiente di Render (mai nel portale o nel repository):
 *   DIGIKEY_CLIENT_ID, DIGIKEY_CLIENT_SECRET   developer.digikey.com → Production App "Product Information V4"
 *   MOUSER_API_KEY                             mouser.it → My Mouser → APIs → Search API
 *   FARNELL_API_KEY (FARNELL_STORE, default it.farnell.com)   partner.element14.com
 *   TME_APP_TOKEN, TME_APP_SECRET              developers.tme.eu (API v2, OAuth client credentials)
 *   ARROW_LOGIN, ARROW_API_KEY                 developers.arrow.com → Request API Key (aggiunto 1/11/2026, da verificare con le prime chiavi)
 * Ogni P/N si cerca presso TUTTI i distributori collegati, in parallelo; un errore su un P/N non ferma gli altri
 * (si riprova una volta; ci si ferma solo se le chiavi sono sbagliate, se il limite è finito o dopo 3 errori di fila).
 * Ogni risposta resta in fornitori_cache per 24 ore (stesso P/N = nessuna nuova chiamata).
 * TME: lettura secondo la documentazione ufficiale v2 (src/engine/tme.ts). Farnell: lettura tollerante, campi da confermare con le prime chiavi vere.
 */
import { q, q1 } from './db.js';
import { leggiPrezzo, type Fornitore, type Offerta } from '../engine/acquisti.js';
import { pnKey } from '../engine/codifica/bom.js';
import type { ProdottoDigiKey } from '../engine/codifica/digikey-dati.js';
import { elementiTme, offerteTme } from '../engine/tme.js';
import { offerteArrow } from '../engine/arrow.js';
import { cambioBce } from './autofatture-servizio.js';
import { conta, erroreServizio, riuscito } from './stato-servizi.js';

const ORE_CACHE = 24;
const TIMEOUT = 20_000;

export interface RisultatoFornitore { offerte: Offerta[]; prodotto?: ProdottoDigiKey | null; errore?: string }

export class ErroreFornitore extends Error { constructor(msg: string, public tipo: string = 'altro') { super(msg); } }

export function fornitoriConfigurati(): Record<Fornitore, boolean> {
  const e = process.env;
  return {
    digikey: !!(e.DIGIKEY_CLIENT_ID && e.DIGIKEY_CLIENT_SECRET), mouser: !!e.MOUSER_API_KEY,
    farnell: !!e.FARNELL_API_KEY, tme: !!(e.TME_APP_TOKEN && e.TME_APP_SECRET), arrow: !!(e.ARROW_LOGIN && e.ARROW_API_KEY),
  };
}

async function http(url: string, opz: RequestInit & { nome: string }): Promise<any> {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  // ogni richiesta conta per il limite giornaliero del distributore (Impostazioni → Servizi)
  const servizio = opz.nome.toLowerCase();
  const fallita = (tipo: string, msg: string) => { conta(servizio, 'prezzi', { chiamate: 1, errori: 1 }); erroreServizio(servizio, tipo, msg); return new ErroreFornitore(msg, tipo); };
  try {
    let r: Response, testo: string;
    try { r = await fetch(url, { ...opz, signal: ctrl.signal }); testo = await r.text(); }
    catch (e: any) { throw fallita('rete', `${opz.nome} non raggiungibile: ${e?.name === 'AbortError' ? 'tempo scaduto' : e?.message ?? e}`); }
    let corpo: any = null; try { corpo = testo ? JSON.parse(testo) : null; } catch { corpo = null; }
    if (r.status === 429) throw fallita('limite', `${opz.nome}: limite di richieste raggiunto, riprova più tardi`);
    if (r.status === 401 || r.status === 403) {
      // Farnell (element14) risponde 403 anche quando finiscono le richieste del giorno o del secondo: lo dice l'intestazione
      const motivo = [r.headers.get('x-error-detail-header'), r.headers.get('x-mashery-error-code'), testo.slice(0, 200)].filter(Boolean).join(' ');
      if (/over|limit|rate|quota/i.test(motivo)) throw fallita('limite', `${opz.nome}: limite di richieste raggiunto (${motivo.slice(0, 120)}), riprova più tardi`);
      throw fallita('chiave', `${opz.nome}: accesso negato (${r.status}${motivo ? `: ${motivo.slice(0, 120)}` : ''}), controlla le chiavi su Render`);
    }
    if (!r.ok && r.status !== 404) throw fallita('altro', `${opz.nome}: errore ${r.status} ${testo.slice(0, 200)}`);
    conta(servizio, 'prezzi', { chiamate: 1 }); riuscito(servizio);
    return r.status === 404 ? null : corpo;
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
  if (!r?.access_token) throw new ErroreFornitore('DigiKey: token non ricevuto', 'chiave');
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

/** Ricerca per parola su Farnell (varianti dello stesso P/N). */
async function farnellParola(parole: string): Promise<Offerta[]> {
  const u = new URL('https://api.element14.com/catalog/products');
  const par: Record<string, string> = { term: `any:${parole.trim()}`, 'storeInfo.id': process.env.FARNELL_STORE ?? 'it.farnell.com',
    'resultsSettings.offset': '0', 'resultsSettings.numberOfResults': '20', 'resultsSettings.responseGroup': 'large',
    'callInfo.responseDataFormat': 'JSON', 'callInfo.apiKey': process.env.FARNELL_API_KEY! };
  for (const [k, v] of Object.entries(par)) u.searchParams.set(k, v);
  const r = await http(u.toString(), { nome: 'Farnell', headers: { Accept: 'application/json' } });
  const ritorno = r?.keywordSearchReturn ?? r?.manufacturerPartNumberSearchReturn ?? {};
  return (ritorno.products ?? []).map(offertaFarnell).filter((o: Offerta) => o.scaglioni.length);
}

// ───────────────────────────── TME (API v2) ─────────────────────────────
let tokenTme: { valore: string; scade: number } | null = null;
async function tokenTmeValido(): Promise<string> {
  if (tokenTme && Date.now() < tokenTme.scade) return tokenTme.valore;
  const basic = Buffer.from(`${process.env.TME_APP_TOKEN}:${process.env.TME_APP_SECRET}`).toString('base64');
  const r = await http('https://api.tme.eu/auth/token', { nome: 'TME', method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials' }) });
  if (!r?.access_token) throw new ErroreFornitore('TME: token non ricevuto', 'chiave');
  tokenTme = { valore: r.access_token, scade: Date.now() + (Number(r.expires_in ?? 300) - 30) * 1000 };
  return tokenTme.valore;
}
async function tmeGet(percorso: string, par: Record<string, string | string[]>): Promise<any> {
  const u = new URL(`https://api.tme.eu/${percorso}`);
  u.searchParams.set('country', 'IT');
  for (const [k, v] of Object.entries(par)) for (const x of Array.isArray(v) ? v : [v]) u.searchParams.append(Array.isArray(v) ? `${k}[]` : k, x);
  return http(u.toString(), { nome: 'TME', headers: { Authorization: `Bearer ${await tokenTmeValido()}`, 'Accept-Language': 'it', Accept: 'application/json' } });
}
async function tmePn(pns: string[]): Promise<Map<string, RisultatoFornitore>> {
  const prodotti = elementiTme(await tmeGet('products', { mpns: pns.slice(0, 50) }));
  const simboli = prodotti.map(p => String(p.symbol)).slice(0, 50);
  // amounts[] serve solo per le consegne (delivery): con prices e stock TME lo rifiuta come campo in più
  const dati = simboli.length ? elementiTme(await tmeGet('products/data', { symbols: simboli, scope: ['prices', 'stock'], currency: 'EUR' })) : [];
  const offerte = offerteTme(pns, prodotti, dati);
  return new Map(pns.map(pn => [pn, { offerte: offerte.get(pn) ?? [] }]));
}

// ───────────────────────────── Arrow ─────────────────────────────
let cambioUsd: { giorno: string; valore: number | null } | null = null;
/** Prezzi Arrow in dollari → euro al cambio BCE del giorno (sceltaMigliore usa solo offerte in euro). */
async function inEuro(offerte: Offerta[]): Promise<Offerta[]> {
  const oggi = new Date().toISOString().slice(0, 10);
  const daCambiare = offerte.filter(o => o.valuta !== 'EUR');
  if (!daCambiare.length) return offerte;
  if (cambioUsd?.giorno !== oggi) cambioUsd = { giorno: oggi, valore: await cambioBce('USD', oggi) };
  const c = cambioUsd.valore;
  if (!c) return offerte;
  return offerte.map(o => o.valuta !== 'USD' ? o : { ...o, valuta: 'EUR', scaglioni: o.scaglioni.map(s => ({ qta: s.qta, prezzo: s.prezzo / c })),
    ciclo: [o.ciclo, `prezzo convertito da USD (cambio BCE ${c})`].filter(Boolean).join(' · ') });
}
async function arrowCerca(pn: string, varianti = false): Promise<Offerta[]> {
  const u = new URL('https://api.arrow.com/itemservice/v4/en/search/token');
  for (const [k, v] of Object.entries({ login: process.env.ARROW_LOGIN!, apikey: process.env.ARROW_API_KEY!, search_token: pn.trim(), rows: '10' })) u.searchParams.set(k, v);
  const r = await http(u.toString(), { nome: 'Arrow', headers: { Accept: 'application/json' } });
  return inEuro(offerteArrow(pn, r, { varianti }));
}
async function arrowPn(pn: string): Promise<RisultatoFornitore> { return { offerte: await arrowCerca(pn) }; }

// ───────────────────────────── varianti e sostituti (P/N non trovato esatto) ─────────────────────────────
/**
 * Varianti dello stesso P/N (confezione o suffisso diverso: -TR, /R7, #PBF…) presso TUTTI i distributori che hanno la ricerca per parola
 * (DigiKey, Mouser, Farnell, Arrow; TME v2 cerca solo per codice esatto). Restituisce P/N → offerte trovate (le altre si chiedono dopo).
 */
export async function cercaVarianti(pn: string): Promise<{ varianti: Map<string, { mpn: string; produttore: string; descrizione: string }>; errori: string[] }> {
  const attivi = fornitoriConfigurati(); const k = pnKey(pn) ?? '';
  const varianti = new Map<string, { mpn: string; produttore: string; descrizione: string }>(), errori: string[] = [];
  const variante = (mpn: string) => { const x = pnKey(mpn); return !!x && k.length >= 6 && x !== k && (x.startsWith(k) || (x.length >= 6 && k.startsWith(x))); };
  const aggiungi = (mpn: string, produttore: string, descrizione: string) => { if (variante(mpn) && !varianti.has(pnKey(mpn)!)) varianti.set(pnKey(mpn)!, { mpn, produttore, descrizione }); };
  if (k.length < 6) return { varianti, errori };
  await Promise.all([
    attivi.digikey && digikeyParametri(pn).then(xs => { for (const x of xs) aggiungi(x.prodotto.ManufacturerProductNumber ?? '', x.prodotto.Manufacturer?.Name ?? '', x.offerte[0]?.descrizione ?? ''); })
      .catch(e => { errori.push(`DigiKey: ${e.message}`); }),
    attivi.mouser && mouserParametri(pn).then(os => { for (const o of os) aggiungi(o.mpn, o.produttore, o.descrizione); }).catch(e => { errori.push(`Mouser: ${e.message}`); }),
    attivi.farnell && farnellParola(pn).then(os => { for (const o of os) aggiungi(o.mpn, o.produttore, o.descrizione); }).catch(e => { errori.push(`Farnell: ${e.message}`); }),
    attivi.arrow && arrowCerca(pn, true).then(os => { for (const o of os) aggiungi(o.mpn, o.produttore, o.descrizione); }).catch(e => { errori.push(`Arrow: ${e.message}`); }),
  ]);
  return { varianti, errori };
}

/** Sostituto proposto da DigiKey per un P/N (anche obsoleto): tipo come lo scrive DigiKey (Direct, Parametric Equivalent, Similar, Upgrade…). */
export interface SostitutoDk { mpn: string; produttore: string; descrizione: string; tipo: string }
export async function digikeySostituti(pn: string): Promise<SostitutoDk[]> {
  if (!fornitoriConfigurati().digikey) return [];
  const r = await http(`https://api.digikey.com/products/v4/search/${encodeURIComponent(pn.trim())}/substitutions`, {
    nome: 'DigiKey', headers: { Authorization: `Bearer ${await tokenDigikey()}`, 'X-DIGIKEY-Client-Id': process.env.DIGIKEY_CLIENT_ID!, 'X-DIGIKEY-Locale-Site': 'IT',
      'X-DIGIKEY-Locale-Language': 'en', 'X-DIGIKEY-Locale-Currency': 'EUR', Accept: 'application/json' } });
  return (r?.ProductSubstitutes ?? []).map((x: any) => ({ mpn: String(x.ManufacturerProductNumber ?? ''), produttore: String(x.Manufacturer?.Name ?? ''),
    descrizione: String(x.Description?.ProductDescription ?? x.Description ?? ''), tipo: String(x.SubstituteType ?? '') })).filter((x: SostitutoDk) => x.mpn);
}

// ───────────────────────────── ricerca per elenco di P/N ─────────────────────────────
export interface EsitoRicerca { perPn: Map<string, Partial<Record<Fornitore, RisultatoFornitore>>>; errori: Partial<Record<Fornitore, string>> }

async function aLotti<T>(elementi: T[], insieme: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(insieme, elementi.length) }, async () => { while (i < elementi.length) await fn(elementi[i++]); }));
}
const pausa = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Errori: un errore su un P/N non ferma il distributore; si ferma con chiavi sbagliate, limite finito o 3 errori di fila. */
class Guardia {
  private diFila = 0; fermo: string | null = null;
  constructor(private f: Fornitore, private errori: Partial<Record<Fornitore, string>>) {}
  ok() { this.diFila = 0; }
  errore(e: any) {
    this.errori[this.f] = e?.message ?? String(e);
    if (e?.tipo === 'chiave' || e?.tipo === 'limite' || ++this.diFila >= 3) this.fermo = this.errori[this.f]!;
  }
}
/** Una chiamata con un secondo tentativo (dopo una pausa) se l'errore non è di chiavi o di limite. */
async function conRiprova<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); }
  catch (e: any) { if (e?.tipo === 'chiave' || e?.tipo === 'limite') throw e; await pausa(1500); return fn(); }
}

/** Prezzi e disponibilità per una lista di P/N presso TUTTI i distributori configurati (in parallelo, nessuno si ferma al primo). */
export async function cercaPn(pns: string[], opz: { forza?: boolean; avanzamento?: (fatti: number) => void } = {}): Promise<EsitoRicerca> {
  const attivi = fornitoriConfigurati();
  const unici = [...new Map(pns.filter(Boolean).map(p => [pnKey(p)!, p.trim()])).entries()].filter(([k]) => k);
  const perPn = new Map<string, Partial<Record<Fornitore, RisultatoFornitore>>>(unici.map(([k]) => [k, {}]));
  const errori: Partial<Record<Fornitore, string>> = {};
  let fatti = 0;
  const segna = (k: string, f: Fornitore, r: RisultatoFornitore) => { perPn.get(k)![f] = r; };
  // prima la cache
  const daCercare: Record<Fornitore, [string, string][]> = { digikey: [], mouser: [], farnell: [], tme: [], arrow: [] };
  for (const f of Object.keys(daCercare) as Fornitore[]) {
    if (!attivi[f]) continue;
    for (const [k, pn] of unici) {
      const c = opz.forza ? null : await daCache(f, k);
      if (c) segna(k, f, c); else daCercare[f].push([k, pn]);
    }
  }
  const lavori: Promise<void>[] = [];
  /** distributori che cercano un P/N per volta */
  const unoAllaVolta = (f: Fornitore, insieme: number, cerca: (pn: string) => Promise<RisultatoFornitore>, attesa = 0) => {
    if (!daCercare[f].length) return;
    const g = new Guardia(f, errori);
    lavori.push(aLotti(daCercare[f], insieme, async ([k, pn]) => {
      if (g.fermo) return;
      try { const r = await conRiprova(() => cerca(pn)); segna(k, f, r); await inCache(f, k, r); g.ok(); }
      catch (e: any) { g.errore(e); }
      opz.avanzamento?.(++fatti); if (attesa) await pausa(attesa);
    }));
  };
  /** distributori che cercano più P/N in una chiamata */
  const aGruppi = (f: Fornitore, quanti: number, cerca: (pns: string[]) => Promise<Map<string, RisultatoFornitore>>, attesa = 0) => {
    if (!daCercare[f].length) return;
    const g = new Guardia(f, errori);
    lavori.push((async () => {
      for (let i = 0; i < daCercare[f].length && !g.fermo; i += quanti) {
        const lotto = daCercare[f].slice(i, i + quanti);
        try {
          const r = await conRiprova(() => cerca(lotto.map(x => x[1])));
          for (const [k, pn] of lotto) { const x = r.get(pn) ?? { offerte: [] }; segna(k, f, x); await inCache(f, k, x); }
          g.ok();
        } catch (e: any) { g.errore(e); }
        fatti += lotto.length; opz.avanzamento?.(fatti);
        if (attesa) await pausa(attesa);
      }
    })());
  };
  unoAllaVolta('digikey', 3, digikeyPn);
  aGruppi('mouser', 10, mouserPn, 2100); // 30 richieste al minuto
  unoAllaVolta('farnell', 2, farnellPn, 300);
  aGruppi('tme', 50, tmePn);
  unoAllaVolta('arrow', 2, arrowPn, 200);
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
    if (f === 'arrow') offerte = (await arrowPn(pn)).offerte;
    if (!offerte.length) return `collegato, ma ${pn} non trovato`;
    const o = offerte[0];
    return `OK: ${o.mpn} ${o.codiceFornitore}, ${o.stock} pz, da ${o.scaglioni[0]?.prezzo} ${o.valuta}`;
  } catch (e: any) { return e.message; }
}
