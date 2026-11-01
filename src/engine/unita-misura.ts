/**
 * Unità di misura delle righe dei documenti (Adriano 2/11/2026): si scelgono da un elenco, niente testo libero.
 * Prima PZ e NR, poi le unità internazionali (Sistema Internazionale e unità ammesse: ora, litro, tonnellata).
 * Il valore salvato è la sigla (va così anche nell'XML della fattura, campo UnitaMisura, max 10 caratteri).
 */
export interface UnitaMisura { sigla: string; nome: string }

export const UNITA_MISURA: readonly UnitaMisura[] = [
  { sigla: 'PZ', nome: 'pezzi' },
  { sigla: 'NR', nome: 'numero' },
  { sigla: 'KG', nome: 'chilogrammi' },
  { sigla: 'G', nome: 'grammi' },
  { sigla: 'T', nome: 'tonnellate' },
  { sigla: 'M', nome: 'metri' },
  { sigla: 'CM', nome: 'centimetri' },
  { sigla: 'MM', nome: 'millimetri' },
  { sigla: 'M2', nome: 'metri quadrati' },
  { sigla: 'M3', nome: 'metri cubi' },
  { sigla: 'L', nome: 'litri' },
  { sigla: 'ML', nome: 'millilitri' },
  { sigla: 'H', nome: 'ore' },
  { sigla: 'MIN', nome: 'minuti' },
];

/** Unità proposta sulle righe nuove. */
export const UM_PREDEFINITA = 'PZ';

/** Modi diversi di scrivere la stessa unità (documenti vecchi, storico FIC, ordini letti dall'IA). */
const SINONIMI: Record<string, string> = {
  PZ: 'PZ', PZI: 'PZ', PEZZI: 'PZ', PEZZO: 'PZ', PCS: 'PZ', PC: 'PZ', PCE: 'PZ', EA: 'PZ', EACH: 'PZ', UN: 'PZ',
  NR: 'NR', N: 'NR', NUM: 'NR', NUMERO: 'NR', NO: 'NR',
  KG: 'KG', KGS: 'KG', CHILI: 'KG', CHILOGRAMMI: 'KG',
  G: 'G', GR: 'G', GRAMMI: 'G',
  T: 'T', TON: 'T', TONNELLATE: 'T',
  M: 'M', MT: 'M', MTL: 'M', MTR: 'M', METRI: 'M', METRO: 'M',
  CM: 'CM', MM: 'MM',
  M2: 'M2', MQ: 'M2', 'M²': 'M2', M3: 'M3', MC: 'M3', 'M³': 'M3',
  L: 'L', LT: 'L', LITRI: 'L', ML: 'ML',
  H: 'H', HR: 'H', ORE: 'H', ORA: 'H', HH: 'H',
  MIN: 'MIN', MINUTI: 'MIN',
};

/** Sigla dell'elenco per un valore scritto in un altro modo ("pz.", "Nr", "mt"); null se non è riconosciuto. */
export function siglaUm(valore: unknown): string | null {
  const t = String(valore ?? '').trim().toUpperCase().replace(/[.\s]/g, '');
  if (!t) return null;
  return SINONIMI[t] ?? null;
}
