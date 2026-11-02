/**
 * Mittente delle email per funzione (Adriano 2/11/2026): la casella principale è info@casteltech.net, gli alias
 * amministrazione@, ordini@, preventivi@, acquisti@, produzione@ sono legati a info@. Ogni documento parte dall'alias
 * della sua funzione; se l'alias non è ancora attivo come "Invia messaggio come" nel Gmail di info@, parte da info@.
 * Solo regole, niente chiamate: la lista degli indirizzi attivi la legge `server/gmail.ts`.
 */

export type FunzioneEmail = 'amministrazione' | 'ordini' | 'preventivi' | 'acquisti' | 'produzione';

/** Le funzioni con il loro alias (parte prima della @) e cosa parte da lì. Una funzione nuova = una riga qui. */
export const FUNZIONI_EMAIL: { funzione: FunzioneEmail; alias: string; cosa: string }[] = [
  { funzione: 'amministrazione', alias: 'amministrazione', cosa: 'DDT, fatture, note di credito, autofatture, solleciti di pagamento' },
  { funzione: 'ordini', alias: 'ordini', cosa: "conferme d'ordine ai clienti" },
  { funzione: 'preventivi', alias: 'preventivi', cosa: 'preventivi ai clienti' },
  { funzione: 'acquisti', alias: 'acquisti', cosa: 'ordini a fornitore, richieste di offerta ai fornitori' },
  { funzione: 'produzione', alias: 'produzione', cosa: 'avvisi di produzione (commesse, consegne, tempi)' },
];

/** Tipo di documento → funzione che lo manda (tipi di `documenti.tipo`, più 'preventivo' e 'sollecito'). */
const PER_TIPO: Record<string, FunzioneEmail> = {
  ddt: 'amministrazione', fattura: 'amministrazione', nota_credito: 'amministrazione', nota_debito: 'amministrazione',
  autofattura: 'amministrazione', sollecito: 'amministrazione',
  conferma_ordine: 'ordini',
  preventivo: 'preventivi',
  ordine_fornitore: 'acquisti',
  commessa: 'produzione',
};

/** Funzione che manda quel documento (null = casella principale). */
export const funzioneDi = (tipo: string): FunzioneEmail | null => PER_TIPO[tipo] ?? null;

/** Indirizzo dell'alias della funzione, con il dominio della casella principale (info@casteltech.net → amministrazione@casteltech.net). */
export function indirizzoFunzione(funzione: FunzioneEmail, principale: string): string | null {
  const dominio = principale.trim().toLowerCase().split('@')[1];
  const f = FUNZIONI_EMAIL.find(x => x.funzione === funzione);
  return dominio && f ? `${f.alias}@${dominio}` : null;
}

/**
 * Da chi parte l'email: l'alias della funzione se è tra gli indirizzi "Invia messaggio come" di Gmail, altrimenti la casella principale.
 * `disponibili` null = elenco non letto (permesso mancante o Gmail non raggiungibile): si usa la principale, così l'email parte comunque.
 */
export function scegliMittente(funzione: FunzioneEmail | null, principale: string, disponibili: string[] | null):
  { indirizzo: string; alias: string | null; ripiego: boolean } {
  const p = principale.trim().toLowerCase();
  const alias = funzione ? indirizzoFunzione(funzione, p) : null;
  if (!alias || alias === p) return { indirizzo: p, alias: null, ripiego: false };
  const attivo = !!disponibili?.some(x => x.trim().toLowerCase() === alias);
  return attivo ? { indirizzo: alias, alias, ripiego: false } : { indirizzo: p, alias, ripiego: true };
}

/** Intestazione From: "Casteltech S.r.l." <amministrazione@casteltech.net> (virgolette tolte dal nome). */
export const intestazioneDa = (nome: string, indirizzo: string) => `"${nome.replace(/"/g, '')}" <${indirizzo}>`;

/** Frase per la pagina: "Parte da amministrazione@…" oppure "Parte da info@… (amministrazione@… non ancora attivo in Gmail)". */
export function descriviMittente(m: { indirizzo: string; alias: string | null; ripiego: boolean }): string {
  return m.ripiego && m.alias ? `${m.indirizzo} (${m.alias} non è ancora attivo in Gmail come "Invia messaggio come")` : m.indirizzo;
}
