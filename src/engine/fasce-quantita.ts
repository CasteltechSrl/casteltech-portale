/**
 * Una quotazione per più quantità (Adriano 13/11/2026, caso DGFAM V3 di Digifly: 25, 50, 100 pz).
 * Stessi dati del preventivo, cambia solo quello che dipende dalla quantità:
 *  - velocità del pick and place per fascia (1-10 schede 3000 chip/h, 11-25 4000, 26-100 6000, 101-300 7000, oltre 300 8000);
 *  - ricarico per fascia (1-10 35 %, 11-50 30 %, 51-1000 25 %, oltre 1000 20 %);
 *  - buste, cartoni e bombolette (totali del lotto) in proporzione alle schede;
 *  - costo dei componenti a scheda dalla BOM collegata, ricalcolato per ogni quantità (lo fa il server).
 * Le fasce si cambiano in Impostazioni → Tariffe (impostazioni 'fasce_quantita'). Nessun accesso al database.
 */
import { leggiScaglioni, prezzoPerQuantita } from './listino.js';

export interface FasceQuantita {
  /** velocità P&P in chip/h per fascia di schede, scritta come gli scaglioni del listino: "1-10=3000; 11-25=4000; …" */
  pepChipH: string;
  /** ricarico in % per fascia di schede: "1-10=35; 11-50=30; …" */
  ricarico: string;
}

export const FASCE_INIZIALI: FasceQuantita = {
  pepChipH: '1-10=3000; 11-25=4000; 26-100=6000; 101-300=7000; 301+=8000',
  ricarico: '1-10=35; 11-50=30; 51-1000=25; 1001+=20',
};

/** Parametri del preventivo che sono totali del lotto e crescono con le schede. */
export const PARAMETRI_IN_PROPORZIONE = ['buste', 'cartoni', 'tropicalizzante'];
/** Velocità del pick and place (TOP e BOT) prese dalla fascia. */
export const PARAMETRI_VELOCITA = ['pepChipH', 'pepChipHLatoB'];
/** Parametri che non si copiano da una quantità all'altra: dipendono dalla quantità. */
export const PARAMETRI_PER_QUANTITA = new Set([...PARAMETRI_IN_PROPORZIONE, ...PARAMETRI_VELOCITA, 'costoComponentiScheda', 'nPCB']);

/** Fasce lette dalle impostazioni: quelle mancanti o scritte male restano le iniziali. */
export function leggiFasce(v: unknown): FasceQuantita {
  const x = (v ?? {}) as Partial<FasceQuantita>;
  const buona = (s: unknown) => typeof s === 'string' && s.trim() !== '' && !leggiScaglioni(s).errori.length && leggiScaglioni(s).scaglioni.length > 0;
  return {
    pepChipH: buona(x.pepChipH) ? String(x.pepChipH).trim() : FASCE_INIZIALI.pepChipH,
    ricarico: buona(x.ricarico) ? String(x.ricarico).trim() : FASCE_INIZIALI.ricarico,
  };
}

/** Errori delle fasce scritte in Impostazioni (vuoto = va bene). */
export function erroriFasce(x: FasceQuantita): string[] {
  const e: string[] = [];
  for (const [k, nome] of [['pepChipH', 'Velocità pick and place'], ['ricarico', 'Ricarico']] as const) {
    const l = leggiScaglioni(x[k]);
    if (!l.scaglioni.length) e.push(`${nome}: scrivi almeno una fascia, es. 1-10=3000; 11+=4000.`);
    for (const err of l.errori) e.push(`${nome}: ${err}`);
  }
  return e;
}

/** Valore della fascia per un numero di schede (null se non ci sono fasce). */
export function valoreFascia(testo: string, schede: number): number | null {
  return prezzoPerQuantita(null, leggiScaglioni(testo).scaglioni, schede).prezzo;
}

/** Ricarico (es. 1,30) per un numero di schede. */
export function ricaricoPerQuantita(fasce: FasceQuantita, schede: number): number | null {
  const p = valoreFascia(fasce.ricarico, schede);
  return p == null ? null : Math.round((1 + p / 100) * 10000) / 10000;
}

/** Quantità scritte in una casella: "25, 50, 100" o "25 / 50 / 100 pz" → [25, 50, 100] (in ordine, senza doppioni, al massimo 6). */
export function quantitaDaTesto(x: unknown): number[] {
  const n = String(x ?? '').replace(/(\d)\.(\d{3})\b/g, '$1$2').split(/[^\d]+/).map(s => parseInt(s, 10)).filter(v => v > 0 && v < 1e7);
  return [...new Set(n)].sort((a, b) => a - b).slice(0, 6);
}

/**
 * Quantità chieste nella mail del cliente: "lotti da 25, 50, 100pz", "quotazione per 25/50/100 pezzi", "25, 50 e 100 pcs".
 * Serve un elenco di almeno due numeri seguito da pz/pezzi/pcs/schede (o preceduto da "lotti da"); niente elenchi = [].
 */
export function quantitaDaEmail(testo: string | null | undefined): number[] {
  const t = String(testo ?? '');
  const elenco = String.raw`\d{1,6}(?:\s*(?:,|/|;|-|e|ed|and)\s*\d{1,6})+`;
  const re = new RegExp(String.raw`(?:lott[oi]\s+(?:da|di)\s*(${elenco}))|(?:(${elenco})\s*(?:pz|pezzi|pcs|pc|schede|pcb)\b)`, 'gi');
  const trovate: number[] = [];
  for (const m of t.matchAll(re)) trovate.push(...quantitaDaTesto(m[1] ?? m[2]));
  const q = [...new Set(trovate)].sort((a, b) => a - b);
  return q.length >= 2 ? q.slice(0, 6) : [];
}

export interface BaseQuantita {
  nSchede: number;
  parametri: Record<string, number>;
  ricarico: number;
}

/**
 * Parametri e ricarico di una quantità partendo da un preventivo (la base): velocità P&P e ricarico dalle fasce,
 * buste/cartoni/bombolette in proporzione (arrotondati per eccesso, mai sotto 1 se nella base c'erano), il resto uguale.
 * Con la spunta "Campionatura" il ricarico resta quello della base (35 % per scelta dell'ufficio).
 * Con gli SMD montati a mano la velocità P&P non conta: resta quella della base.
 */
export function parametriPerQuantita(base: BaseQuantita, schede: number, fasce: FasceQuantita): { parametri: Record<string, number>; ricarico: number; cambi: string[] } {
  const parametri: Record<string, number> = { ...base.parametri };
  const cambi: string[] = [];
  if (!parametri.smdAMano) {
    const v = valoreFascia(fasce.pepChipH, schede);
    if (v != null) { for (const k of PARAMETRI_VELOCITA) parametri[k] = v; cambi.push(`velocità P&P ${v} chip/h`); }
  }
  const rapporto = base.nSchede > 0 ? schede / base.nSchede : 1;
  for (const k of PARAMETRI_IN_PROPORZIONE) {
    const x = Number(base.parametri[k] ?? 0);
    if (x > 0) { parametri[k] = Math.max(1, Math.ceil(x * rapporto - 1e-9)); cambi.push(`${k} ${parametri[k]}`); }
  }
  const ric = parametri.campionatura ? base.ricarico : ricaricoPerQuantita(fasce, schede) ?? base.ricarico;
  cambi.push(`ricarico ${Math.round((ric - 1) * 1000) / 10} %`);
  return { parametri, ricarico: ric, cambi };
}

/**
 * Parametri da copiare da un preventivo a un'altra quantità dello stesso gruppo ("Copia nelle altre quantità"):
 * tutti quelli della sorgente tranne quelli che dipendono dalla quantità, che restano quelli dell'altro preventivo
 * e poi si ricalcolano con `parametriPerQuantita` partendo dalla sorgente.
 */
export function parametriCopiati(sorgente: BaseQuantita, schede: number, fasce: FasceQuantita): { parametri: Record<string, number>; ricarico: number } {
  const x = parametriPerQuantita(sorgente, schede, fasce);
  delete x.parametri.costoComponentiScheda;
  if (sorgente.parametri.costoComponentiScheda != null) x.parametri.costoComponentiScheda = sorgente.parametri.costoComponentiScheda;
  return { parametri: x.parametri, ricarico: x.ricarico };
}
