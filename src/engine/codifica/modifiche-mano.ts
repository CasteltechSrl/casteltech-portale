/**
 * Modifiche a mano delle righe di una BOM quotata (suggerimenti di Federico, 2/11/2026: "manca poter modificare P/N, quantità e scarto,
 * aggiungere e togliere riga, un campo Note"; "i componenti che si comprano altrove dovrebbero essere aggiunti a mano").
 * P/N e quantità si scrivono nella riga del file (righe_file): così "Rielabora" e "Aggiorna prezzi" li tengono. Scarto, nota e
 * prezzo della riga aggiunta stanno in `mano` sulla stessa riga del file. Qui solo le regole, senza database.
 */
import type { Ruolo } from './bom.js';

/** Scarto scritto a mano: pezzi in più per ogni lotto, oppure percentuale sulla quantità netta. */
export type ScartoMano = { pezzi: number } | { percento: number };

/** Dati scritti a mano su una riga del file della BOM. */
export interface ManoRiga {
  scarto?: ScartoMano | null;
  nota?: string | null;
  /** riga aggiunta dall'ufficio (non era nella BOM del cliente) */
  aggiunta?: boolean;
  /** dove si compra il componente aggiunto (es. "magazzino", "Würth"): solo promemoria */
  dove?: string | null;
  /** prezzo €/pz scritto quando si aggiunge la riga */
  prezzo?: number | null;
  /** P/N e quantità com'erano nella BOM prima della correzione (per ricordarlo nelle note) */
  pnBom?: string | null;
  qtaBom?: string | null;
}

export interface RigaFile { n: number; celle: string[]; mano?: ManoRiga }

/** "10" = 10 pezzi in più, "5%" = 5 % in più, vuoto = scarto standard; errore se scritto male. */
export function leggiScartoAMano(testo: unknown): { scarto: ScartoMano | null; errore?: string } {
  const t = String(testo ?? '').trim().replace(/\s+/g, '');
  if (!t) return { scarto: null };
  const m = /^(\d+(?:[.,]\d+)?)(%?)$/.exec(t);
  if (!m) return { scarto: null, errore: 'Scarto non valido: scrivi i pezzi in più (es. 10) o la percentuale (es. 5%).' };
  const v = Number(m[1].replace(',', '.'));
  if (m[2]) return v <= 100 ? { scarto: { percento: v } } : { scarto: null, errore: 'Scarto oltre il 100%: controlla il numero.' };
  if (!Number.isInteger(v)) return { scarto: null, errore: 'I pezzi di scarto sono un numero intero (es. 10).' };
  return { scarto: { pezzi: v } };
}

/** Pezzi di scarto per un lotto con lo scarto scritto a mano. */
export function pezziScartoAMano(s: ScartoMano, netta: number): number {
  return 'pezzi' in s ? s.pezzi : Math.ceil(netta * s.percento / 100 - 1e-9);
}

/** Come si legge lo scarto scritto a mano (per la casella e per la tabella). */
export const testoScarto = (s: ScartoMano | null | undefined) => !s ? '' : 'pezzi' in s ? String(s.pezzi) : `${String(s.percento).replace('.', ',')}%`;

export const NOME_COLONNA_MANO = (etichetta: string) => `${etichetta} (a mano)`;

/**
 * Scrive i valori nella riga del file. Se la BOM non ha la colonna di quel dato (es. nessuna colonna P/N) si aggiunge la colonna
 * "<dato> (a mano)" e si collega al dato: le altre righe restano vuote in quella colonna, come prima.
 */
export function scriviNellaRiga(colonne: string[], mappatura: Partial<Record<Ruolo, string>>, celle: string[], valori: Partial<Record<Ruolo, string | null>>,
  etichette: Record<Ruolo, string>): { colonne: string[]; mappatura: Partial<Record<Ruolo, string>>; celle: string[] } {
  const col = [...colonne], map = { ...mappatura }, out = [...celle];
  for (const [ruolo, valore] of Object.entries(valori) as [Ruolo, string | null | undefined][]) {
    if (valore === undefined) continue;
    let nome = map[ruolo];
    if (!nome || !col.includes(nome)) {
      if (!valore) continue; // niente da scrivere in una colonna che non c'è
      nome = NOME_COLONNA_MANO(etichette[ruolo]);
      if (!col.includes(nome)) col.push(nome);
      map[ruolo] = nome;
    }
    const i = col.indexOf(nome);
    while (out.length <= i) out.push('');
    out[i] = valore ?? '';
  }
  return { colonne: col, mappatura: map, celle: out };
}

/** Numero della riga aggiunta: dopo tutte quelle che ci sono (anche quelle tolte non si riusano più di così). */
export function numeroRigaNuova(righeFile: { n: number }[], righe: { n: number }[] = []): number {
  return Math.max(0, ...righeFile.map(r => r.n), ...righe.map(r => r.n)) + 1;
}

/** Quantità a scheda scritta a mano: numero ≥ 0 (anche 0,5 per i componenti a metà, es. colla); null = non valida. */
export function leggiQuantitaScheda(testo: unknown): number | null {
  const t = String(testo ?? '').trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

/** Inizio della nota lasciata quando l'ufficio conferma un codice "da verificare". */
export const NOTA_VERIFICATO = 'codice verificato da';

/**
 * "Verificato" su una riga NUOVO - DA VERIFICARE (Adriano 4/11/2026: "dove devo cliccare?"): l'ufficio ha controllato famiglia e campi
 * (ed eventualmente corretto e premuto Ricalcola) e conferma il codice. La riga diventa NUOVO (stato OK in archivio), le note
 * "CODICE DA VALIDARE" si tolgono, le altre restano. Si può solo su una riga da verificare con il codice gestionale calcolato.
 */
export function confermaVerifica<R extends { esito: string; codiceGestionale: string | null; note: string[] }>(
  r: R, esiti: { NUOVO: string; NUOVO_VER: string }, notaDaValidare: string, chi: string, oggi: string,
): { ok: true; riga: R } | { ok: false; errore: string } {
  if (r.esito !== esiti.NUOVO_VER) return { ok: false, errore: 'Questa riga non è da verificare.' };
  if (!r.codiceGestionale) return { ok: false, errore: 'Manca il codice gestionale: completa i dati e premi Ricalcola.' };
  const note = r.note.filter(n => !n.startsWith(notaDaValidare) && !n.startsWith(NOTA_VERIFICATO));
  return { ok: true, riga: { ...r, esito: esiti.NUOVO, note: [...note, `${NOTA_VERIFICATO} ${chi} il ${oggi}`] } };
}
