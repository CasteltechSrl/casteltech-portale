/**
 * Preventivo materiali dalla BOM (Adriano, 25/10/2026). Nessun accesso alla rete né al database.
 *  - Quantità da acquistare = quantità a scheda × schede + scarto:
 *      passivi economici (resistenze, condensatori, ferriti… sotto 0,10 €/pz)  +10%
 *      componenti sotto 1 €/pz                                               +5%
 *      da 1 € a 3 €/pz                                                       +1 pezzo
 *      oltre 3 €/pz                                                          nessuno
 *    (le soglie si cambiano da Impostazioni → Componenti).
 *  - Prezzo: scaglione del distributore per la quantità, rispettando minimo d'ordine e multipli; se lo scaglione
 *    successivo costa meno in totale (es. 100 pezzi costano meno di 80) si propone quello.
 *  - Fornitore: il totale più basso tra quelli con disponibilità sufficiente.
 *  - Reperibilità: si cerca da tutti i distributori; critico solo se il componente non si trova da nessuna parte (Adriano, 28/10/2026).
 */

export type Fornitore = 'digikey' | 'mouser' | 'farnell' | 'tme';
export const NOMI_FORNITORI: Record<Fornitore, string> = { digikey: 'DigiKey', mouser: 'Mouser', farnell: 'Farnell', tme: 'TME' };

export interface Scaglione { qta: number; prezzo: number }
export interface Offerta {
  fornitore: Fornitore;
  codiceFornitore: string;
  mpn: string;
  produttore: string;
  descrizione: string;
  confezione?: string;          // es. Cut Tape, Tape & Reel
  stock: number;
  moq: number;                  // minimo d'ordine
  multiplo: number;
  scaglioni: Scaglione[];       // prezzo unitario per quantità minima, valuta come "valuta"
  valuta: string;
  ciclo?: string | null;        // stato del prodotto come lo dà il distributore
  obsoleto?: boolean;
  fineVita?: boolean;
  consegnaSettimane?: number | null;
  url?: string | null;
}

export interface RegoleScarto {
  famigliePassive: string[];
  sogliaPassivoEconomico: number;   // €/pz sotto cui il passivo è "economico" (+10%)
  percentualePassivi: number;       // 10
  sogliaEconomico: number;          // 1 €/pz
  percentualeEconomici: number;     // 5
  sogliaMedio: number;              // 3 €/pz
  pezziMedi: number;                // +1
}
export const REGOLE_SCARTO_DEFAULT: RegoleScarto = {
  famigliePassive: ['RS', 'RR', 'CC', 'CE', 'CT', 'ID', 'FR'],
  sogliaPassivoEconomico: 0.10, percentualePassivi: 10, sogliaEconomico: 1, percentualeEconomici: 5, sogliaMedio: 3, pezziMedi: 1,
};

export function leggiRegoleScarto(x: any): RegoleScarto {
  const r = { ...REGOLE_SCARTO_DEFAULT };
  const n = (v: unknown) => { const k = Number(String(v ?? '').replace(',', '.')); return String(v ?? '').trim() !== '' && Number.isFinite(k) && k >= 0 ? k : null; };
  for (const k of ['sogliaPassivoEconomico', 'percentualePassivi', 'sogliaEconomico', 'percentualeEconomici', 'sogliaMedio', 'pezziMedi'] as const) {
    const v = n(x?.[k]); if (v != null) r[k] = v;
  }
  if (Array.isArray(x?.famigliePassive)) r.famigliePassive = x.famigliePassive.map((s: unknown) => String(s).toUpperCase().trim()).filter(Boolean);
  return r;
}

/** Pezzi di scarto da aggiungere, dato il prezzo unitario. */
export function pezziScarto(famiglia: string | null | undefined, prezzoUnitario: number | null, qtaNetta: number, r: RegoleScarto = REGOLE_SCARTO_DEFAULT): { pezzi: number; regola: string } {
  if (!(qtaNetta > 0)) return { pezzi: 0, regola: '' };
  const passivo = !!famiglia && r.famigliePassive.includes(famiglia.toUpperCase());
  // senza prezzo: un passivo si tratta come economico, il resto come sotto 1 €
  const p = prezzoUnitario ?? (passivo ? 0 : r.sogliaEconomico / 2);
  if (passivo && p < r.sogliaPassivoEconomico) return { pezzi: Math.ceil(qtaNetta * r.percentualePassivi / 100), regola: `+${r.percentualePassivi}% passivo economico` };
  if (p < r.sogliaEconomico) return { pezzi: Math.ceil(qtaNetta * r.percentualeEconomici / 100), regola: `+${r.percentualeEconomici}% (sotto ${r.sogliaEconomico} €)` };
  if (p <= r.sogliaMedio) return { pezzi: r.pezziMedi, regola: `+${r.pezziMedi} pz (${r.sogliaEconomico}–${r.sogliaMedio} €)` };
  return { pezzi: 0, regola: `nessuno scarto (oltre ${r.sogliaMedio} €)` };
}

/** Prezzo unitario dello scaglione valido per la quantità (null se non c'è listino). */
export function prezzoUnitario(o: Pick<Offerta, 'scaglioni'>, qta: number): number | null {
  const s = [...o.scaglioni].filter(x => x.prezzo > 0).sort((a, b) => a.qta - b.qta);
  if (!s.length) return null;
  let p = s[0].prezzo;
  for (const x of s) if (qta >= x.qta) p = x.prezzo;
  return p;
}

export interface Acquisto { qta: number; prezzo: number; totale: number; nota?: string }

/** Quantità da ordinare e costo, rispettando minimo e multipli; propone lo scaglione superiore se costa meno in totale. */
export function acquisto(o: Offerta, qta: number): Acquisto | null {
  if (!(qta > 0)) return null;
  const multiplo = Math.max(1, o.multiplo || 1);
  const arrotonda = (q: number) => Math.ceil(Math.max(q, o.moq || 1) / multiplo) * multiplo;
  const base = arrotonda(qta);
  const pb = prezzoUnitario(o, base);
  if (pb == null) return null;
  let best: Acquisto = { qta: base, prezzo: pb, totale: base * pb, nota: base > qta ? (o.moq > qta ? `minimo d'ordine ${o.moq}` : `multipli di ${multiplo}`) : undefined };
  for (const s of o.scaglioni) {
    if (s.qta <= base) continue;
    const q = arrotonda(s.qta), p = prezzoUnitario(o, q)!;
    if (q * p < best.totale - 1e-9) best = { qta: q, prezzo: p, totale: q * p, nota: `${q} pz costano meno di ${base}` };
  }
  return best;
}

export interface Scelta { offerta: Offerta; acquisto: Acquisto; disponibile: boolean }

/**
 * Offerta migliore: totale più basso tra quelle con disponibilità sufficiente (prima quelle non obsolete: un obsoleto in magazzino
 * si compra lo stesso); altrimenti quella con più pezzi.
 */
export function sceltaMigliore(offerte: Offerta[], qta: number): Scelta | null {
  const valide = offerte.filter(o => o.valuta === 'EUR' || !o.valuta)
    .map(o => ({ offerta: o, acquisto: acquisto(o, qta) }))
    .filter((x): x is { offerta: Offerta; acquisto: Acquisto } => !!x.acquisto);
  if (!valide.length) return null;
  const disponibili = valide.filter(x => x.offerta.stock >= x.acquisto.qta);
  if (disponibili.length) {
    disponibili.sort((a, b) => Number(!!a.offerta.obsoleto) - Number(!!b.offerta.obsoleto) || a.acquisto.totale - b.acquisto.totale);
    return { ...disponibili[0], disponibile: true };
  }
  valide.sort((a, b) => b.offerta.stock - a.offerta.stock || a.acquisto.totale - b.acquisto.totale);
  return { ...valide[0], disponibile: false };
}

/** Una riga del confronto prezzi di un P/N tra gli shop (Quotazioni → Miglior prezzo, Adriano 28/10/2026). */
export interface RigaConfronto { offerta: Offerta; acquisto: Acquisto | null; disponibile: boolean; migliore: boolean; differenza: number | null }

/**
 * Confronto delle offerte di un P/N per una quantità: in cima la migliore (la stessa scelta della BOM, `sceltaMigliore`),
 * poi quelle con pezzi sufficienti dal totale più basso, poi le altre (più pezzi prima), in fondo quelle senza prezzo.
 * `differenza` = quanto si spende in più rispetto alla migliore.
 */
export function confrontaOfferte(offerte: Offerta[], qta: number): RigaConfronto[] {
  const best = sceltaMigliore(offerte, qta);
  const righe = offerte.map(o => {
    const a = acquisto(o, qta);
    return { offerta: o, acquisto: a, disponibile: !!a && o.stock >= a.qta, migliore: !!best && o === best.offerta, differenza: null as number | null };
  });
  const gruppo = (r: RigaConfronto) => r.migliore ? 0 : !r.acquisto ? 3 : r.disponibile ? 1 : 2;
  righe.sort((a, b) => gruppo(a) - gruppo(b)
    || (gruppo(a) === 1 ? a.acquisto!.totale - b.acquisto!.totale : gruppo(a) === 2 ? b.offerta.stock - a.offerta.stock || a.acquisto!.totale - b.acquisto!.totale : 0));
  if (best) for (const r of righe) if (r.acquisto && !r.migliore && (r.offerta.valuta === 'EUR' || !r.offerta.valuta)) r.differenza = r.acquisto.totale - best.acquisto.totale;
  return righe;
}

export type Livello = 'ok' | 'attenzione' | 'critico';
export interface Reperibilita { livello: Livello; motivi: string[] }

const OBSOLETO = /OBSOLETE|OBSOLETO|DISCONTINUED|NO LONGER|NO_LONGER|END OF LIFE|EOL|NOT RECOMMENDED|NRND|LAST TIME BUY|NOT FOR NEW DESIGN/i;
export const fineVita = (o: Offerta) => !!(o.obsoleto || o.fineVita || OBSOLETO.test(o.ciclo ?? ''));
const elencoNomi = (fs: Fornitore[]) => fs.map(f => NOMI_FORNITORI[f]).join(', ');

/**
 * Il componente si trova? (Adriano, 28/10/2026) Si cerca presso TUTTI i distributori: se uno non lo ha ma un altro sì, va bene
 * (nessun "critico" né "attenzione"). Critico SOLO se non è disponibile da nessuna parte nella quantità che serve.
 * "Attenzione" solo se la quantità c'è ma divisa tra più distributori, o se qualche distributore non ha risposto.
 * Le altre informazioni (fine vita, un solo distributore, scorte basse) restano come note, senza segnalazione.
 * nonControllati = distributori collegati che per questo P/N non hanno risposto (errore, limite di richieste).
 */
export function reperibilita(offerte: Offerta[], qta: number, nonControllati: Fornitore[] = []): Reperibilita {
  const motivi: string[] = []; let livello: Livello = 'ok';
  const alza = (l: Livello, m: string) => { motivi.push(m); if (l === 'critico' || (l === 'attenzione' && livello === 'ok')) livello = l; };
  const daRiprovare = nonControllati.length ? ` (${elencoNomi(nonControllati)} non ha risposto: premi "Aggiorna prezzi")` : '';
  if (!offerte.length) {
    return nonControllati.length ? { livello: 'attenzione', motivi: [`non trovato${daRiprovare}`] }
      : { livello: 'critico', motivi: ['non trovato presso nessun distributore'] };
  }
  const perFornitore = new Map<Fornitore, number>();
  for (const o of offerte) perFornitore.set(o.fornitore, Math.max(perFornitore.get(o.fornitore) ?? 0, o.stock));
  const totale = [...perFornitore.values()].reduce((a, b) => a + b, 0);
  const sufficienti = [...perFornitore.entries()].filter(([, s]) => s >= qta).map(([f]) => f);
  if (qta > 0 && totale < qta) {
    if (nonControllati.length) alza('attenzione', `disponibili ${totale} pz contro ${qta} necessari${daRiprovare}`);
    else alza('critico', `non disponibile da nessuna parte: ${totale} pz in tutto contro ${qta} necessari`);
  } else if (qta > 0 && !sufficienti.length) alza('attenzione', `nessun distributore ha da solo ${qta} pz: vanno presi da più distributori (in tutto ${totale})`);
  else if (qta > 0) motivi.push(`disponibile da ${elencoNomi(sufficienti)}`);
  const fv = offerte.find(fineVita);
  if (fv) motivi.push(`${NOMI_FORNITORI[fv.fornitore]}: ${fv.ciclo || 'fine vita'}`);
  if (qta > 0 && sufficienti.length && Math.max(...sufficienti.map(f => perFornitore.get(f)!)) < 3 * qta) motivi.push('scorte basse (meno di 3 volte il fabbisogno)');
  const attese = offerte.filter(o => o.stock < qta && (o.consegnaSettimane ?? 0) > 8).map(o => o.consegnaSettimane!);
  if (attese.length && totale < qta) motivi.push(`consegna dal produttore ${Math.min(...attese)} settimane`);
  return { livello, motivi };
}

/** "€0,10" / "0,10 €" / "1.234,56" / "0.1" → numero */
export function leggiPrezzo(x: unknown): number | null {
  if (typeof x === 'number') return Number.isFinite(x) ? x : null;
  let s = String(x ?? '').replace(/[^\d.,]/g, '');
  if (!s) return null;
  const v = s.lastIndexOf(','), p = s.lastIndexOf('.');
  if (v > p) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
