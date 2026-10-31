/**
 * Prezzi di prodotti e componenti recuperati da Fatture in Cloud (Adriano 31/10/2026).
 *  - Prodotti (prezzo di vendita): anagrafica prodotti di FIC confrontata con le fatture emesse. Vale il prezzo più recente:
 *    l'ultima fattura, a meno che l'anagrafica FIC sia stata aggiornata dopo (es. "Prezzo aggiornato al 08/10/2026").
 *    Le differenze anagrafica / ultima fattura si elencano per Adriano.
 *  - Componenti (prezzo di acquisto): l'ultimo ordine a fornitore di FIC con quel P/N (o quel codice di produzione).
 * Regola codice-cliente: il prezzo va sul prodotto del cliente giusto; un codice senza cliente si abbina solo se nel
 * portale quel codice esiste una volta sola. Nessun accesso al database: lo usano tools/prezzi-da-fic.ts e il caricamento.
 */
import { pnKey } from './codifica/bom.js';

/** Codici confrontati solo con lettere e cifre ("SL_0067" = "sl-0067"), come in anagrafica. */
export const chiave = (s: unknown) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const arrot = (n: number, d = 5) => Math.round(n * 10 ** d) / 10 ** d;

// ── Dati di FIC (solo i campi che servono) ──
export interface ProdottoFic { id: number; name: string; code: string; net_price: number | null; category: string; updated_at: string | null; notes?: string }
export interface RigaDoc { codice?: string; descrizione?: string; quantita?: number; prezzo?: number; sconto?: number }
export interface DocumentoStorico { tipo: string; numero: number | string; sezionale?: string; data: string; intestatario?: { ragione_sociale?: string }; righe?: RigaDoc[] }
export interface OrdineFornitoreFic {
  id: number; date: string; number: number; entity?: { name?: string } | null;
  currency?: { id?: string; exchange_rate?: string | number } | null;
  items_list?: { code?: string; name?: string; description?: string; qty?: number; net_price?: number; discount?: number }[];
}

// ── Voci del file che si carica nel portale ──
export interface VoceProdotto {
  cliente: string | null; codice: string; altri_codici: string[]; descrizione: string;
  prezzo: number; fonte: 'fic_anagrafica' | 'fic_fattura'; data: string | null; nota: string;
  prezzo_anagrafica: number | null; anagrafica_aggiornata: string | null;
  prezzo_fattura: number | null; data_fattura: string | null; fattura: string | null;
}
export interface VoceComponente { pn: string; codice: string; fornitore: string; data: string; ordine: string; quantita: number; prezzo: number; valuta: string; descrizione: string }
export interface FilePrezzi { origine: string; creato_il: string; prodotti: VoceProdotto[]; componenti: VoceComponente[] }

/** Cliente del prodotto dalla categoria di FIC ("SCHEDA ELETTRONICA SELTA" → SELTA S.P.A.): solo se un cliente solo ci somiglia. */
export function clienteDaCategoria(categoria: string, clienti: string[]): string | null {
  const t = chiave(String(categoria ?? '').replace(/^\s*(SCHEDA\s+ELETTRONICA|CABLAGGIO|RIPARAZIONE)\s*/i, ''));
  if (t.length < 3) return null;
  const trovati = [...new Set(clienti.filter(c => chiave(c).startsWith(t) || (t.length >= 5 && chiave(c).includes(t))))];
  // stesso nome scritto in modo diverso (es. "KAIROS S.r.l." e "kairos s.r.l."): è sempre lo stesso cliente
  const unici = [...new Map(trovati.map(c => [chiave(c), c])).values()];
  return unici.length === 1 ? unici[0] : null;
}

/** Prezzo unitario netto della riga (sconto in %). */
const prezzoRiga = (r: { prezzo?: number; sconto?: number }) => arrot(Number(r.prezzo ?? 0) * (1 - Number(r.sconto ?? 0) / 100));

/**
 * Voci dei prodotti: per ogni cliente + codice l'ultima fattura emessa, confrontata con l'anagrafica di FIC.
 * I codici solo in anagrafica FIC (mai fatturati) prendono il cliente dalla categoria; i codici solo in fattura entrano lo stesso.
 */
export function vociProdotti(anagrafica: ProdottoFic[], documenti: DocumentoStorico[]): VoceProdotto[] {
  const fatture = documenti.filter(d => d.tipo === 'fattura');
  const clienti = [...new Set(fatture.map(d => d.intestatario?.ragione_sociale ?? '').filter(Boolean))];
  // ultima fattura per cliente + codice
  const ultime = new Map<string, { cliente: string; codice: string; descrizione: string; prezzo: number; data: string; fattura: string }>();
  for (const d of fatture) for (const r of d.righe ?? []) {
    const k = chiave(r.codice), cliente = d.intestatario?.ragione_sociale ?? '';
    const prezzo = prezzoRiga(r);
    if (!k || !cliente || !(prezzo > 0)) continue;
    const id = `${chiave(cliente)}|${k}`, prima = ultime.get(id);
    if (prima && prima.data >= d.data) continue;
    ultime.set(id, { cliente, codice: String(r.codice).trim(), descrizione: String(r.descrizione ?? '').split('\n')[0].trim(), prezzo, data: d.data,
      fattura: `${d.numero}${d.sezionale ? '/' + d.sezionale : ''} del ${dataIt(d.data)}` });
  }
  // anagrafica FIC per codice (code, oppure il nome se il codice manca)
  const perCodice = new Map<string, ProdottoFic[]>();
  for (const p of anagrafica) for (const k of new Set([chiave(p.code), chiave(p.name)].filter(Boolean))) perCodice.set(k, [...(perCodice.get(k) ?? []), p]);
  const anagraficaDi = (k: string) => {
    const xs = (perCodice.get(k) ?? []).filter(p => Number(p.net_price) > 0);
    // più righe con lo stesso codice: quella aggiornata per ultima
    return xs.sort((a, b) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')))[0];
  };
  const voci: VoceProdotto[] = [];
  const usati = new Set<number>();
  for (const f of ultime.values()) {
    const a = anagraficaDi(chiave(f.codice));
    if (a) usati.add(a.id);
    voci.push(scegli(f.cliente, f.codice, a, f));
  }
  for (const a of anagrafica) {
    if (usati.has(a.id) || !(Number(a.net_price) > 0)) continue;
    const codice = String(a.code || a.name).trim();
    if (!chiave(codice)) continue;
    // stesso codice già fatturato a qualcuno: l'anagrafica è già confrontata lì
    if ([...ultime.values()].some(f => chiave(f.codice) === chiave(codice))) continue;
    voci.push(scegli(clienteDaCategoria(a.category, clienti), codice, a, null));
  }
  return voci;

  function scegli(cliente: string | null, codice: string, a: ProdottoFic | undefined, f: { prezzo: number; data: string; fattura: string; descrizione: string } | null): VoceProdotto {
    const aggiornata = a?.updated_at ? a.updated_at.slice(0, 10) : null;
    // vale il più recente: l'ultima fattura, salvo un'anagrafica aggiornata dopo quella fattura
    const usaAnagrafica = !f || (!!a && !!aggiornata && aggiornata > f.data);
    const altri = a ? [a.code, a.name].filter(x => x && chiave(x) !== chiave(codice)) : [];
    return {
      cliente, codice, altri_codici: [...new Set(altri.map(x => String(x).trim()))],
      descrizione: (a?.name && chiave(a.name) !== chiave(codice) ? a.name : f?.descrizione ?? a?.name ?? '').trim(),
      prezzo: usaAnagrafica ? arrot(Number(a!.net_price)) : f!.prezzo,
      fonte: usaAnagrafica ? 'fic_anagrafica' : 'fic_fattura',
      data: usaAnagrafica ? aggiornata : f!.data,
      nota: usaAnagrafica ? `Anagrafica prodotti FIC${aggiornata ? ` (aggiornata il ${dataIt(aggiornata)})` : ''}` : `Fattura ${f!.fattura}`,
      prezzo_anagrafica: a ? arrot(Number(a.net_price)) : null, anagrafica_aggiornata: aggiornata,
      prezzo_fattura: f?.prezzo ?? null, data_fattura: f?.data ?? null, fattura: f?.fattura ?? null,
    };
  }
}

/** Anagrafica FIC e ultima fattura con prezzi diversi (oltre mezzo centesimo): da far vedere ad Adriano. */
export const differenzaPrezzi = (v: VoceProdotto) =>
  v.prezzo_anagrafica != null && v.prezzo_fattura != null && Math.abs(v.prezzo_anagrafica - v.prezzo_fattura) > 0.005;

/** Righe d'ordine che non sono componenti (lamine, trasporto, spese…). */
const NON_COMPONENTE = /^(TRASPORTO|SPEDIZIONE|SPESE|LAMINA|PCB\b|CIRCUITO STAMPATO|ATTREZZATURA|SERVIZIO|IMBALLO|DOGANA)/i;

/** Ultimo prezzo di acquisto per P/N dagli ordini a fornitore (prezzi in valuta estera riportati in euro con il cambio dell'ordine). */
export function vociComponenti(ordini: OrdineFornitoreFic[]): VoceComponente[] {
  const ultime = new Map<string, VoceComponente & { _id: number }>();
  for (const o of ordini) {
    const valuta = o.currency?.id || 'EUR';
    const cambio = valuta === 'EUR' ? 1 : Number(o.currency?.exchange_rate) || 0;
    if (!cambio) continue;
    for (const r of o.items_list ?? []) {
      const pn = String(r.name ?? '').trim(), codice = String(r.code ?? '').trim();
      const prezzo = arrot(Number(r.net_price ?? 0) * (1 - Number(r.discount ?? 0) / 100) / cambio, 6);
      if (!(prezzo > 0) || !(Number(r.qty) > 0) || NON_COMPONENTE.test(pn) || NON_COMPONENTE.test(codice)) continue;
      const k = pnKey(pn) ?? chiave(codice);
      if (!k) continue;
      const prima = ultime.get(k);
      if (prima && (prima.data > o.date || (prima.data === o.date && prima._id > o.id))) continue;
      ultime.set(k, { _id: o.id, pn, codice, fornitore: String(o.entity?.name ?? '').trim(), data: o.date, ordine: `${o.number}/${o.date.slice(0, 4)}`,
        quantita: Number(r.qty), prezzo, valuta, descrizione: String(r.description ?? '').split('\n')[0].trim() });
    }
  }
  return [...ultime.values()].map(({ _id, ...v }) => v);
}

// ── Abbinamento con le anagrafiche del portale ──
export interface ProdottoPortale { id: number; codice: string; cliente_id: number | null; prezzo_fonte: string | null }
export interface ClientePortale { id: number; ragione_sociale: string }
export interface AbbinamentoProdotto { prodotto_id: number; voce: VoceProdotto; comeTrovato: 'cliente' | 'alias' | 'solo codice' }

/** Nome del cliente confrontato senza punteggiatura e senza maiuscole/minuscole. */
const chiaveNome = (s: unknown) => chiave(String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, ''));

export function abbinaProdotti(voci: VoceProdotto[], prodotti: ProdottoPortale[], clienti: ClientePortale[],
  aliasClienti: { nome: string; cliente_id: number }[] = [], aliasProdotti: { cliente_id: number; codice: string; prodotto_id: number }[] = []) {
  const clientePer = new Map<string, number>();
  for (const a of aliasClienti) clientePer.set(chiaveNome(a.nome), a.cliente_id);
  for (const c of clienti) clientePer.set(chiaveNome(c.ragione_sociale), c.id);
  const perCodice = new Map<string, ProdottoPortale[]>();
  for (const p of prodotti) perCodice.set(chiave(p.codice), [...(perCodice.get(chiave(p.codice)) ?? []), p]);
  const scelti = new Map<number, AbbinamentoProdotto>();
  const nonTrovati: VoceProdotto[] = [];
  let manuali = 0;
  for (const v of voci) {
    const cl = v.cliente ? clientePer.get(chiaveNome(v.cliente)) ?? null : null;
    const codici = [v.codice, ...v.altri_codici].map(chiave).filter(Boolean);
    let trovato: { p: ProdottoPortale; come: AbbinamentoProdotto['comeTrovato'] } | null = null;
    for (const k of codici) {
      const delCliente = cl ? (perCodice.get(k) ?? []).filter(p => p.cliente_id === cl) : [];
      if (delCliente.length) { trovato = { p: delCliente[0], come: 'cliente' }; break; }
      const al = cl ? aliasProdotti.find(a => a.cliente_id === cl && a.codice === k) : undefined;
      const pa = al && prodotti.find(p => p.id === al.prodotto_id);
      if (pa) { trovato = { p: pa, come: 'alias' }; break; }
    }
    // cliente non riconosciuto: il codice vale solo se nel portale c'è una volta sola (e non è di un altro cliente riconosciuto)
    if (!trovato && !cl) for (const k of codici) {
      const xs = perCodice.get(k) ?? [];
      if (xs.length === 1) { trovato = { p: xs[0], come: 'solo codice' }; break; }
    }
    if (!trovato) { nonTrovati.push(v); continue; }
    if (trovato.p.prezzo_fonte === 'manuale') { manuali++; continue; }
    const prima = scelti.get(trovato.p.id);
    if (prima && String(prima.voce.data ?? '') >= String(v.data ?? '')) continue;
    scelti.set(trovato.p.id, { prodotto_id: trovato.p.id, voce: v, comeTrovato: trovato.come });
  }
  return { abbinati: [...scelti.values()], nonTrovati, manuali };
}

export interface ComponentePortale { id: number; pn_key: string | null; codice_produzione: string | null; codice_gestionale: string | null; prezzo_fonte: string | null }

/** Componenti dell'archivio: stesso P/N, oppure codice dell'ordine = codice di produzione o gestionale. Vince l'ordine più recente. */
export function abbinaComponenti(voci: VoceComponente[], componenti: ComponentePortale[]) {
  const perChiave = new Map<string, ComponentePortale[]>();
  const metti = (k: string | null, c: ComponentePortale) => { if (k) perChiave.set(k, [...(perChiave.get(k) ?? []), c]); };
  for (const c of componenti) { metti(c.pn_key ? 'P' + c.pn_key : null, c); metti(c.codice_produzione ? 'C' + chiave(c.codice_produzione) : null, c); metti(c.codice_gestionale ? 'C' + chiave(c.codice_gestionale) : null, c); }
  const scelti = new Map<number, VoceComponente>();
  let vociAbbinate = 0, manuali = 0;
  for (const v of voci) {
    const kp = pnKey(v.pn), kc = chiave(v.codice);
    const trovati = new Set([...(kp ? perChiave.get('P' + kp) ?? [] : []), ...(kp ? perChiave.get('C' + kp) ?? [] : []), ...(kc ? perChiave.get('C' + kc) ?? [] : []), ...(kc ? perChiave.get('P' + (pnKey(v.codice) ?? '')) ?? [] : [])]);
    if (trovati.size) vociAbbinate++;
    for (const c of trovati) {
      if (c.prezzo_fonte === 'manuale') { manuali++; continue; }
      const prima = scelti.get(c.id);
      if (!prima || prima.data < v.data) scelti.set(c.id, v);
    }
  }
  return { abbinati: [...scelti.entries()].map(([componente_id, voce]) => ({ componente_id, voce })), vociAbbinate, vociNonTrovate: voci.length - vociAbbinate, manuali };
}

/** Data in italiano (gg/mm/aaaa). */
export function dataIt(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** Prezzo scritto dall'ufficio ("12,50", "12.5", "€ 1.234,5"): numero, null se vuoto, NaN se non valido. */
export function leggiPrezzo(s: unknown): number | null {
  let t = String(s ?? '').replace(/[€\s]/g, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}
