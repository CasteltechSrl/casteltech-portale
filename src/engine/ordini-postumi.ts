/**
 * Ordini dei clienti contro fatturato e ordini "postumi" (Adriano 9/11/2026: "in base al fatturato di ottobre, cosa manca a livello
 * di ordini? … fai degli ordini fittizi per compensare quello che manca, rendi visibile che è un ordine postumo creato ad hoc").
 *
 * Ogni riga di fattura è "coperta" da un ordine quando:
 *  1) è già collegata a una riga d'ordine (import da Fatture in Cloud, DDT o fattura fatti dall'ordine nel portale);
 *  2) altrimenti, se lo stesso cliente ha una riga d'ordine con lo stesso codice (o la stessa descrizione) con ancora quantità libera:
 *     le fatture si prendono in ordine di data e consumano prima gli ordini più vecchi, senza superare la quantità ordinata;
 *  3) la fattura ha già il suo ordine postumo.
 * Quello che resta è "senza ordine": l'ordine postumo lo copre con le stesse righe (quantità non coperta × prezzo della fattura).
 * Gli ordini postumi nascono già evasi: non entrano tra le righe da evadere, nel Gantt, nel flusso di produzione né negli acquisti.
 */

/** Fatture stornate perché doppie (Adriano 25/10/2026: 6, 13, 26 del 2026 = doppie di 11, 39, 38): non contano. */
export const FATTURE_STORNATE: Record<number, number[]> = { 2026: [6, 13, 26] };
/** Numerazione degli ordini postumi nell'anno: 8001, 8002… (FIC 1–999, ordini da email e preventivo 9001+). */
export const PRIMO_NUMERO_POSTUMO = 8001;
/** Differenze sotto 1 € non contano (arrotondamenti). */
export const SOGLIA_EURO = 1;
/** Un ordine registrato fino a 31 giorni dopo la fattura vale ancora (ordini scritti dopo la consegna). */
export const GIORNI_TOLLERANZA_ORDINE = 31;
export const ETICHETTA_POSTUMO = 'ORDINE POSTUMO creato ad hoc';

export interface RigaOrdineConfronto {
  id: number; ordineId: number; clienteId: number | null; dataOrdine: string | null; codici: (string | null)[]; descrizione: string | null;
  quantita: number; annullata: boolean; postumoFatturaId: number | null; valore?: number;
}
export interface RigaFatturaConfronto {
  chiave: string; codice: string | null; descrizione: string | null; quantita: number; valore: number;
  prodottoId?: number | null; rigaOrdineId?: number | null;
}
export interface FatturaConfronto {
  id: number; anno: number; numero: number; data: string; clienteId: number | null; cliente: string; righe: RigaFatturaConfronto[];
}
export interface RigaScoperta extends RigaFatturaConfronto { quantitaScoperta: number; valoreScoperto: number; prezzo: number }
export interface EsitoFattura {
  fattura: FatturaConfronto; valore: number; coperto: number; scoperto: number; postumo: boolean; scoperte: RigaScoperta[];
  /** valore coperto dal suo ordine postumo (il resto della fattura aveva già un ordine) */
  valorePostumo?: number;
}

const normale = (s: string | null | undefined) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const codiceBuono = (s: string) => s.length >= 4 && !/^\d{1,4}$/.test(s);
const arrotonda = (n: number) => Math.round(n * 100) / 100;
const piuGiorni = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

export const fatturaStornata = (anno: number, numero: number) => (FATTURE_STORNATE[anno] ?? []).includes(numero);

/** Stessa merce: codice uguale (codice buono) o descrizione lunga uguale. */
function stessaMerce(o: RigaOrdineConfronto, f: RigaFatturaConfronto): boolean {
  const c = normale(f.codice), d = normale(f.descrizione);
  const codici = o.codici.map(normale).filter(codiceBuono), descr = normale(o.descrizione);
  return (codiceBuono(c) && (codici.includes(c) || c === descr))
    || (codiceBuono(d) && (codici.includes(d) || (d.length >= 6 && d === descr)));
}

/** Copertura di ogni fattura (tutte quelle passate, in ordine di data: le più vecchie consumano prima gli ordini). */
export function confrontaOrdiniFatture(ordini: RigaOrdineConfronto[], fatture: FatturaConfronto[]): EsitoFattura[] {
  const vive = ordini.filter(o => !o.annullata && !o.postumoFatturaId && o.quantita > 0);
  const libero = new Map(vive.map(o => [o.id, o.quantita]));
  const conPostumo = new Map<number, number>();
  for (const o of ordini) if (o.postumoFatturaId) conPostumo.set(o.postumoFatturaId, (conPostumo.get(o.postumoFatturaId) ?? 0) + (o.valore ?? 0));
  const perData = [...vive].sort((a, b) => (a.dataOrdine ?? '').localeCompare(b.dataOrdine ?? '') || a.id - b.id);
  const esiti: EsitoFattura[] = [];
  for (const f of [...fatture].sort((a, b) => a.data.localeCompare(b.data) || a.numero - b.numero)) {
    if (fatturaStornata(f.anno, f.numero)) continue;
    // fatturato = tutte le righe (sconti e acconti scalati compresi); la copertura si cerca per le righe positive
    const righe = f.righe.filter(r => r.valore > 0);
    const valore = arrotonda(f.righe.reduce((t, r) => t + r.valore, 0));
    if (conPostumo.has(f.id)) {
      const valorePostumo = arrotonda(Math.min(valore, conPostumo.get(f.id)!));
      esiti.push({ fattura: f, valore, coperto: arrotonda(valore - valorePostumo), scoperto: 0, postumo: true, scoperte: [], valorePostumo });
      continue;
    }
    const scoperte: RigaScoperta[] = [];
    for (const r of righe) {
      const q = r.quantita > 0 ? r.quantita : 1, prezzo = r.valore / q;
      let resta = q;
      if (r.rigaOrdineId != null) {
        // già collegata: consuma la riga d'ordine (anche oltre la quantità: il collegamento l'ha deciso l'ufficio o l'import)
        libero.set(r.rigaOrdineId, Math.max(0, (libero.get(r.rigaOrdineId) ?? 0) - q));
        resta = 0;
      } else {
        const limite = piuGiorni(f.data, GIORNI_TOLLERANZA_ORDINE);
        for (const o of perData) {
          if (resta <= 0) break;
          if (o.clienteId == null || o.clienteId !== f.clienteId || (o.dataOrdine && o.dataOrdine > limite) || !stessaMerce(o, r)) continue;
          const presa = Math.min(resta, libero.get(o.id) ?? 0);
          if (presa <= 0) continue;
          libero.set(o.id, (libero.get(o.id) ?? 0) - presa);
          resta -= presa;
        }
      }
      if (resta > 1e-6 && resta * prezzo >= 0.005) scoperte.push({ ...r, prezzo: arrotonda(prezzo * 10000) / 10000, quantitaScoperta: resta, valoreScoperto: arrotonda(resta * prezzo) });
    }
    const scoperto = arrotonda(scoperte.reduce((t, r) => t + r.valoreScoperto, 0));
    esiti.push({ fattura: f, valore, coperto: arrotonda(valore - scoperto), scoperto, postumo: false, scoperte: scoperto >= SOGLIA_EURO ? scoperte : [] });
  }
  return esiti.map(e => (e.scoperto < SOGLIA_EURO && !e.postumo ? { ...e, coperto: e.valore, scoperto: 0 } : e));
}

/** Fatture che riceverebbero un ordine postumo. */
export function fattureDaCoprire(esiti: EsitoFattura[]): EsitoFattura[] {
  return esiti.filter(e => !e.postumo && e.scoperto >= SOGLIA_EURO && e.scoperte.length > 0);
}

export interface MeseConfronto {
  mese: string; fatturato: number; coperto: number; scoperto: number; postumi: number; ordinato: number; ordini: number;
  clienti: { cliente: string; fatturato: number; scoperto: number; postumi: number; fatture: EsitoFattura[] }[];
}

/**
 * Riepilogo per mese dell'anno: fatturato (righe positive delle fatture, note di credito escluse), quanto è coperto da ordini,
 * quanto manca, quanto è coperto da ordini postumi, e quanto è stato ordinato nel mese (ordini veri, per data dell'ordine).
 */
export function riepilogoMesi(esiti: EsitoFattura[], ordinatoMese: Record<string, { valore: number; ordini: number }>, anno: number): MeseConfronto[] {
  const mesi = new Map<string, MeseConfronto>();
  for (let m = 1; m <= 12; m++) {
    const k = `${anno}-${String(m).padStart(2, '0')}`;
    mesi.set(k, { mese: k, fatturato: 0, coperto: 0, scoperto: 0, postumi: 0, ordinato: arrotonda(ordinatoMese[k]?.valore ?? 0), ordini: ordinatoMese[k]?.ordini ?? 0, clienti: [] });
  }
  for (const e of esiti) {
    if (e.fattura.anno !== anno && !e.fattura.data.startsWith(String(anno))) continue;
    const m = mesi.get(e.fattura.data.slice(0, 7));
    if (!m) continue;
    m.fatturato += e.valore;
    m.coperto += e.coperto; m.scoperto += e.scoperto; m.postumi += e.valorePostumo ?? 0;
    let c = m.clienti.find(x => x.cliente === e.fattura.cliente);
    if (!c) m.clienti.push(c = { cliente: e.fattura.cliente, fatturato: 0, scoperto: 0, postumi: 0, fatture: [] });
    c.fatturato += e.valore;
    c.postumi += e.valorePostumo ?? 0; c.scoperto += e.scoperto;
    if (e.scoperto || e.postumo) c.fatture.push(e);
  }
  return [...mesi.values()].map(m => ({
    ...m, fatturato: arrotonda(m.fatturato), coperto: arrotonda(m.coperto), scoperto: arrotonda(m.scoperto), postumi: arrotonda(m.postumi),
    clienti: m.clienti.map(c => ({ ...c, fatturato: arrotonda(c.fatturato), scoperto: arrotonda(c.scoperto), postumi: arrotonda(c.postumi) }))
      .filter(c => c.scoperto || c.postumi).sort((a, b) => b.scoperto - a.scoperto || b.postumi - a.postumi),
  }));
}

/** Nota scritta sull'ordine postumo: si vede nella pagina dell'ordine. */
export function notaPostumo(f: { numero: number; anno: number }, oggi: string): string {
  const gma = `${oggi.slice(8, 10)}/${oggi.slice(5, 7)}/${oggi.slice(0, 4)}`;
  return `${ETICHETTA_POSTUMO} il ${gma} per coprire la fattura n. ${f.numero}/${f.anno}, che non aveva un ordine registrato nel portale. `
    + 'Non è un ordine del cliente: serve solo a far tornare ordini e fatturato. Nasce già evaso (non va in produzione né negli acquisti).';
}
