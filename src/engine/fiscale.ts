/**
 * Adempimenti fiscali piccoli ma da non dimenticare (fase 1 della contabilità, Adriano 31/10/2026):
 *  - bollo virtuale sulle fatture: riepilogo per trimestre, codice tributo e scadenza dell'F24 (con i rinvii sotto 5.000 €);
 *  - plafond delle lettere d'intento: quanto si è già fatturato senza IVA (N3.5) e quanto resta, avviso dall'80 %;
 *  - spese senza fattura elettronica (scontrini, affitto, polizze…): controlli del modulo.
 * Solo calcoli: niente database e niente rete.
 */
import { arrotonda2 } from './amministrazione.js';
import { primoGiornoLavorativo } from './registri-iva.js';

// ───────────────────────────── bollo virtuale ─────────────────────────────

/** Codici tributo F24 dell'imposta di bollo sulle fatture elettroniche, per trimestre. */
export const CODICI_BOLLO: Record<number, string> = { 1: '2521', 2: '2522', 3: '2523', 4: '2524' };
/** Sotto questa cifra il bollo del 1° trimestre (o del 1° + 2°) si versa insieme al trimestre dopo (DL 73/2022). */
export const SOGLIA_RINVIO_BOLLO = 5000;

/** Scadenza normale del bollo del trimestre: 31 maggio, 30 settembre, 30 novembre, fine febbraio dell'anno dopo. */
export function scadenzaBollo(anno: number, trimestre: number): string {
  const d = trimestre === 1 ? `${anno}-05-31` : trimestre === 2 ? `${anno}-09-30` : trimestre === 3 ? `${anno}-11-30`
    : `${anno + 1}-02-${new Date(Date.UTC(anno + 1, 2, 0)).getUTCDate()}`;
  return primoGiornoLavorativo(d);
}

export interface TrimestreBollo {
  trimestre: number; documenti: number; importo: number; codice: string;
  /** Scadenza vera, dopo i rinvii (1° trimestre sotto 5.000 € → 30/9; 1° + 2° sotto 5.000 € → 30/11). */
  scadenza: string; rinviato: boolean; chiuso: boolean;
}

/**
 * Bollo virtuale dell'anno per trimestre. `documenti` = fatture e note di credito emesse con il bollo (2 €).
 * L'Agenzia mette l'importo calcolato nel portale Fatture e corrispettivi: questo è il conto del portale da confrontare.
 */
export function bolloPerTrimestre(anno: number, documenti: { data: string; bollo: number }[], oggi: string): TrimestreBollo[] {
  const t = [1, 2, 3, 4].map(n => ({ trimestre: n, documenti: 0, importo: 0, codice: CODICI_BOLLO[n], scadenza: scadenzaBollo(anno, n), rinviato: false,
    chiuso: oggi > `${anno}-${String(n * 3).padStart(2, '0')}-${n === 1 || n === 4 ? 31 : 30}` }));
  for (const d of documenti) {
    if (Number(d.data.slice(0, 4)) !== anno || !(Number(d.bollo) > 0)) continue;
    const q = t[Math.floor((Number(d.data.slice(5, 7)) - 1) / 3)];
    q.documenti += 1; q.importo = arrotonda2(q.importo + Number(d.bollo));
  }
  if (t[0].importo > 0 && t[0].importo < SOGLIA_RINVIO_BOLLO) {
    t[0].rinviato = true; t[0].scadenza = t[1].scadenza;
    if (t[0].importo + t[1].importo < SOGLIA_RINVIO_BOLLO) {
      t[0].scadenza = t[2].scadenza;
      if (t[1].importo > 0) { t[1].rinviato = true; t[1].scadenza = t[2].scadenza; }
    }
  }
  return t;
}

// ───────────────────────────── plafond delle lettere d'intento ─────────────────────────────

export const SOGLIA_AVVISO_PLAFOND = 0.8;

export interface UsoPlafond { plafond: number | null; usato: number; residuo: number | null; percentuale: number | null; stato: 'senza_plafond' | 'ok' | 'vicino' | 'superato' }

/** Quanto è usato il plafond (imponibile N3.5 già fatturato, più l'eventuale fattura nuova). */
export function usoPlafond(plafond: number | null | undefined, usato: number, nuovo = 0): UsoPlafond {
  const totale = arrotonda2(usato + nuovo);
  if (!(Number(plafond) > 0)) return { plafond: null, usato: totale, residuo: null, percentuale: null, stato: 'senza_plafond' };
  const p = Number(plafond), percentuale = Math.round((totale / p) * 100);
  return { plafond: p, usato: totale, residuo: arrotonda2(p - totale), percentuale,
    stato: totale > p + 0.005 ? 'superato' : totale >= p * SOGLIA_AVVISO_PLAFOND ? 'vicino' : 'ok' };
}

/** Frase per l'avviso nella fattura o nell'elenco. */
export function testoPlafond(u: UsoPlafond, euro: (n: number) => string): string {
  if (u.stato === 'senza_plafond') return `Lettera d'intento senza importo massimo scritto: fatturato senza IVA finora ${euro(u.usato)}. Scrivi il plafond in Anagrafiche → Clienti → Dati fiscali.`;
  if (u.stato === 'superato') return `Plafond superato di ${euro(-u.residuo!)} (${euro(u.usato)} su ${euro(u.plafond!)}): oltre il plafond la fattura va con l'IVA, salvo una nuova lettera d'intento del cliente.`;
  return `Plafond usato al ${u.percentuale}%: ${euro(u.usato)} su ${euro(u.plafond!)}, restano ${euro(u.residuo!)}.${u.stato === 'vicino' ? ' Avvisa il cliente: se serve, manda una lettera integrativa.' : ''}`;
}

// ───────────────────────────── spese senza fattura elettronica ─────────────────────────────

/** Tipi di spesa senza fattura elettronica: finiscono nella categoria del documento. */
export const TIPI_SPESA = ['Scontrino', 'Affitto', 'Polizza assicurativa', 'Spese bancarie', 'Imposte e tasse', 'Spese postali e valori bollati', 'Fattura cartacea', 'Altro'] as const;

export interface Spesa { data: string; tipo: string; controparte: string; numero: string; descrizione: string; imponibile: number; imposta: number; totale: number; pagataIl: string | null; conto: string | null }

const numero = (v: unknown) => {
  const t = String(v ?? '').trim().replace(/\s|€/g, '');
  if (!t) return 0;
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) ? n : NaN;
};
const data = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? String(v) : '');

/**
 * Spesa dal modulo: data, tipo, a chi (MAIUSCOLO), importo. L'IVA si scrive solo per una fattura cartacea che la riporta
 * (es. un fornitore senza obbligo di fattura elettronica): uno scontrino non dà diritto alla detrazione.
 */
export function spesaDaModulo(b: Record<string, unknown>): { spesa: Spesa; errori: string[] } {
  const errori: string[] = [];
  const tipo = (TIPI_SPESA as readonly string[]).includes(String(b.tipo)) ? String(b.tipo) : 'Altro';
  const totale = numero(b.totale), imposta = tipo === 'Fattura cartacea' ? numero(b.imposta) : 0;
  const spesa: Spesa = {
    data: data(b.data), tipo, controparte: String(b.controparte ?? '').trim().toUpperCase(), numero: String(b.numero ?? '').trim().toUpperCase(),
    descrizione: String(b.descrizione ?? '').trim(), imponibile: arrotonda2(totale - imposta), imposta: arrotonda2(imposta), totale: arrotonda2(totale),
    pagataIl: b.pagata ? data(b.pagata_il) || data(b.data) : null, conto: String(b.conto ?? '').trim() || null,
  };
  if (!spesa.data) errori.push('Manca la data.');
  if (!spesa.controparte) errori.push('Scrivi a chi è stata pagata (negozio, proprietario, assicurazione…).');
  if (!(totale > 0)) errori.push('L\'importo deve essere più di zero.');
  if (totale > 0 && (Number.isNaN(imposta) || imposta < 0 || imposta >= totale)) errori.push('L\'IVA non torna con il totale.');
  return { spesa, errori };
}
