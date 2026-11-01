/**
 * Stato dei servizi esterni tenuto in memoria (nessun accesso al database, così l'avviso in cima alle pagine non costa nulla):
 * contatori del mese (caricati all'avvio da consumi-servizi.ts, poi aumentati a ogni chiamata), ultimi errori, memoria del server.
 * Il salvataggio nel database lo fa consumi-servizi.ts, qualche secondo dopo l'ultima chiamata.
 */
import { avvisiServizi, costoIa, giornoRoma, righeServizi, type Conteggio, type DatiServizi, type ErroreRecente, type UsoIa } from '../engine/servizi.js';
import { BUDGET, memoriaInUso } from './memoria.js';

const MB = 1024 * 1024;
export const LIMITE_MEMORIA_MB = Number(process.env.RENDER_MEMORIA_MB) || 512;
export const LIMITE_DATABASE_MB = Number(process.env.NEON_SPAZIO_MB) || 512;
export const LIMITE_GMAIL_GIORNO = 2000;
/** Richieste al giorno dei distributori (piani gratuiti): DigiKey e Farnell 1000, Mouser 1000 (e 30 al minuto); TME nessun limite giornaliero noto. */
export const LIMITI_DISTRIBUTORI: Record<string, number | null> = { digikey: 1000, mouser: 1000, farnell: 1000, tme: null, arrow: null };
export const NOMI_DISTRIBUTORI: Record<string, string> = { digikey: 'DigiKey', mouser: 'Mouser', farnell: 'Farnell', tme: 'TME', arrow: 'Arrow' };

export const modelloIa = () => process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5';

// ── contatori: chiave "giorno|servizio|voce" ──
const contatori = new Map<string, Conteggio>();
/** Le stesse aggiunte, ancora da scrivere nel database. */
export const daSalvare = new Map<string, Conteggio>();
let avvisaSalvataggio: (() => void) | null = null;
/** consumi-servizi.ts si registra qui per salvare dopo ogni aggiunta. */
export const quandoCiSonoConsumi = (fn: () => void) => { avvisaSalvataggio = fn; };

const somma = (a: Conteggio, b: Conteggio): Conteggio => ({
  chiamate: a.chiamate + b.chiamate, errori: a.errori + b.errori,
  tokenIngresso: (a.tokenIngresso ?? 0) + (b.tokenIngresso ?? 0), tokenUscita: (a.tokenUscita ?? 0) + (b.tokenUscita ?? 0),
  costoUsd: (a.costoUsd ?? 0) + (b.costoUsd ?? 0),
});
const vuoto = (): Conteggio => ({ chiamate: 0, errori: 0, tokenIngresso: 0, tokenUscita: 0, costoUsd: 0 });

/** Aggiunge un consumo (in memoria e nella coda da salvare). */
export function conta(servizio: string, voce: string, c: Partial<Conteggio>, adesso = new Date()) {
  const k = `${giornoRoma(adesso)}|${servizio}|${voce}`;
  const d = { ...vuoto(), ...c };
  contatori.set(k, somma(contatori.get(k) ?? vuoto(), d));
  daSalvare.set(k, somma(daSalvare.get(k) ?? vuoto(), d));
  avvisaSalvataggio?.();
}
/** Carica i totali già salvati (all'avvio): si sommano a quelli in memoria. */
export function caricaContatori(righe: { giorno: string; servizio: string; voce: string; c: Conteggio }[]) {
  for (const r of righe) { const k = `${r.giorno}|${r.servizio}|${r.voce}`; contatori.set(k, somma(contatori.get(k) ?? vuoto(), r.c)); }
}

/** Totale di un servizio (e voce, se data) dal giorno `da` (AAAA-MM-GG) in poi, tra quelli in memoria (mese corrente). */
export function totale(servizio: string, da: string, voce?: string): Conteggio {
  let t = vuoto();
  for (const [k, c] of contatori) {
    const [g, s, v] = k.split('|');
    if (s === servizio && g >= da && (voce == null || v === voce)) t = somma(t, c);
  }
  return t;
}
export function perVoce(servizio: string, da: string) {
  const m = new Map<string, Conteggio>();
  for (const [k, c] of contatori) { const [g, s, v] = k.split('|'); if (s === servizio && g >= da) m.set(v, somma(m.get(v) ?? vuoto(), c)); }
  return [...m].map(([voce, c]) => ({ voce, chiamate: c.chiamate, costoUsd: c.costoUsd ?? 0 })).sort((a, b) => b.costoUsd - a.costoUsd);
}

export const oggi = () => giornoRoma(new Date());
export const inizioMese = () => oggi().slice(0, 8) + '01';

// ── ultimi errori e riuscite ──
export const ultimiErrori = new Map<string, ErroreRecente>();
export const ultimeRiuscite = new Map<string, string>();
let segnalaErrore: ((servizio: string, e: ErroreRecente) => void) | null = null;
export const quandoCeUnErrore = (fn: (servizio: string, e: ErroreRecente) => void) => { segnalaErrore = fn; };

export function erroreServizio(servizio: string, tipo: string, messaggio: string) {
  const e = { tipo, messaggio: messaggio.slice(0, 500), il: new Date().toISOString() };
  const prima = ultimiErrori.get(servizio);
  ultimiErrori.set(servizio, e);
  // lo stesso errore ripetuto (es. la cartella Drive ogni 15 minuti) si scrive nel database al massimo ogni 6 ore:
  // altrimenti terrebbe sveglio Neon
  if (!prima || prima.messaggio !== e.messaggio || Date.now() - +new Date(prima.il) > 6 * 3600_000) segnalaErrore?.(servizio, e);
  else ultimiErrori.set(servizio, { ...e, il: prima.il });
}
export const riuscito = (servizio: string) => { ultimeRiuscite.set(servizio, new Date().toISOString()); };

// ── IA ──
export const ia = {
  limiteMinuto: null as NonNullable<DatiServizi['ia']>['limiteMinuto'],
  /** credito scritto in Impostazioni → Servizi; `spesoPrima` = spesa salvata dal giorno `dal` fino a `contaDa` (escluso), il resto è in memoria */
  credito: null as { importo: number; dal: string; spesoPrima: number; contaDa: string } | null,
  tettoMese: null as number | null,
  spesaUfficialeMese: null as number | null,
};

/** Registra una risposta riuscita dell'IA: token, costo e limiti del piano dalle intestazioni. */
export function rispostaIa(voce: string, modello: string, uso: UsoIa | undefined, intestazioni?: Headers) {
  const u = uso ?? {};
  conta('ia', voce, {
    chiamate: 1, tokenIngresso: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
    tokenUscita: u.output_tokens ?? 0, costoUsd: costoIa(modello, u),
  });
  riuscito('ia');
  if (intestazioni) {
    const n = (h: string) => { const v = intestazioni.get(h); return v == null || v === '' ? undefined : Number(v); };
    const lm = { richieste: n('anthropic-ratelimit-requests-limit'), richiesteRimaste: n('anthropic-ratelimit-requests-remaining'),
      token: n('anthropic-ratelimit-tokens-limit'), tokenRimasti: n('anthropic-ratelimit-tokens-remaining') };
    if (Object.values(lm).some(x => x != null)) ia.limiteMinuto = lm;
  }
}

// ── memoria del server (Render) ──
export const memoria = { piccoMb: 0, avviatoIl: new Date().toISOString(), riavviiInattesi: [] as string[] };
const misura = () => { const mb = process.memoryUsage().rss / MB; if (mb > memoria.piccoMb) memoria.piccoMb = mb; return mb; };
/** Misura la memoria ogni 30 secondi (solo il processo, mai il database). */
export function avviaMisuraMemoria() { misura(); setInterval(misura, 30_000).unref(); }

// ── database (ultimo valore letto) ──
export const database = { spazioMb: null as number | null };

// ── istantanea per il riquadro e per l'avviso ──
export function datiInMemoria(): DatiServizi {
  const g = oggi(), m = inizioMese();
  const e = process.env;
  const conf: Record<string, boolean> = { digikey: !!(e.DIGIKEY_CLIENT_ID && e.DIGIKEY_CLIENT_SECRET), mouser: !!e.MOUSER_API_KEY,
    farnell: !!e.FARNELL_API_KEY, tme: !!(e.TME_APP_TOKEN && e.TME_APP_SECRET), arrow: !!(e.ARROW_LOGIN && e.ARROW_API_KEY) };
  const errIa = ultimiErrori.get('ia') ?? null;
  const c = ia.credito;
  const creditoSpeso = c ? c.spesoPrima + (totale('ia', c.dal > c.contaDa ? c.dal : c.contaDa).costoUsd ?? 0) : 0;
  return {
    ia: {
      configurata: !!process.env.ANTHROPIC_API_KEY, modello: modelloIa(),
      oggi: totale('ia', g), mese: totale('ia', m),
      credito: ia.credito ? { importo: ia.credito.importo, dal: ia.credito.dal, speso: creditoSpeso } : null,
      tettoMese: ia.tettoMese, spesaUfficialeMese: ia.spesaUfficialeMese,
      ultimoErrore: errIa, ultimaRiuscita: ultimeRiuscite.get('ia') ?? null, limiteMinuto: ia.limiteMinuto,
      perVoce: perVoce('ia', m),
    },
    memoria: {
      usataMb: misura(), piccoMb: memoria.piccoMb, limiteMb: LIMITE_MEMORIA_MB,
      lavoriMb: memoriaInUso() / MB, budgetLavoriMb: BUDGET / MB, avviatoIl: memoria.avviatoIl, riavviiInattesi: memoria.riavviiInattesi,
    },
    database: { spazioMb: database.spazioMb, limiteMb: LIMITE_DATABASE_MB, tabelle: [], ore: null, neonCollegato: false },
    distributori: Object.keys(NOMI_DISTRIBUTORI).map(k => ({
      nome: NOMI_DISTRIBUTORI[k], configurato: conf[k], oggi: totale(k, g),
      limiteGiorno: LIMITI_DISTRIBUTORI[k], ultimoErrore: ultimiErrori.get(k) ?? null,
    })),
    drive: { configurato: !!process.env.GOOGLE_SERVICE_ACCOUNT, ultimoControllo: ultimeRiuscite.get('drive') ?? null, fileOggi: totale('drive', g).chiamate, ultimoErrore: ultimiErrori.get('drive') ?? null },
    gmail: { configurato: !!process.env.GOOGLE_SERVICE_ACCOUNT && /@/.test(process.env.GMAIL_MITTENTE ?? ''), inviatiOggi: totale('gmail', g).chiamate, limiteGiorno: LIMITE_GMAIL_GIORNO, ultimoErrore: ultimiErrori.get('gmail') ?? null },
    invoicetronic: { configurato: !!process.env.INVOICETRONIC_API_KEY, prova: !/^ik_live_/i.test(process.env.INVOICETRONIC_API_KEY ?? '') },
  };
}

/** Avviso in cima alle pagine dell'ufficio quando un servizio è vicino al limite o fermo (null se va tutto bene). */
export function avvisoServizi(): { livello: 'attenzione' | 'critico'; testi: string[] } | null {
  try {
    const a = avvisiServizi(righeServizi(datiInMemoria()));
    if (!a.length) return null;
    return { livello: a.some(r => r.stato === 'critico') ? 'critico' : 'attenzione', testi: a.map(r => r.avviso ?? `${r.servizio}: controlla i consumi`) };
  } catch { return null; }
}
