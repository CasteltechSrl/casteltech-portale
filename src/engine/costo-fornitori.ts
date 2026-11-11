/**
 * Costo vero delle fatture dei fornitori per le analisi (Adriano 11/11/2026: "nell'energia è impossibile che nel 2025 abbia fatto solo 5.000 €").
 * Tre correzioni, solo per le analisi (registri IVA, scadenze e pagamenti non cambiano):
 *  1. Partite finanziarie: righe fuori campo IVA (natura N2…) come "Importo a credito cliente" di Enel = soldi di bollette già pagate e già
 *     stornate con una nota di credito, restituiti in una bolletta dopo. Non sono un costo (né un risparmio): contarle toglieva due volte
 *     le note di credito di marzo 2025 (3.305 € in meno sull'energia del 2025).
 *  2. Segno delle righe: alcune note di credito (Enel, Mouser, DigiKey…) hanno nell'XML gli importi già negativi, e bollette "a credito"
 *     arrivano come fattura con importi negativi ma in Fatture in Cloud sono note di credito. Le righe si contano con il segno che dà al
 *     documento lo stesso verso del suo imponibile (`fattoreRighe`).
 *  3. Doppioni: la stessa fattura caricata due volte in Fatture in Cloud (stesso fornitore, numero, data, tipo e totale) conta una volta.
 */

/** Descrizioni delle partite finanziarie (righe fuori campo IVA che spostano soldi già pagati, non costi). */
export const REGEX_PARTITA_FINANZIARIA = 'importo a (credito|debito) (del )?cliente|doppi pagamenti';

export function ePartitaFinanziaria(descrizione: string | null | undefined, natura: string | null | undefined): boolean {
  return /^N2/i.test(natura ?? '') && new RegExp(REGEX_PARTITA_FINANZIARIA, 'i').test(descrizione ?? '');
}

/** 1 o −1: per quanto moltiplicare le righe perché la loro somma abbia il verso dell'imponibile del documento (già con il segno del tipo). */
export function fattoreRighe(valoreDocumento: number, sommaRighe: number): 1 | -1 {
  return valoreDocumento * sommaRighe < 0 ? -1 : 1;
}

/** Costo con il segno (note di credito in negativo) del documento: imponibile meno le partite finanziarie. */
export function costoDocumento(doc: { tipo: string; imponibile: number }, righe: { imponibile: number; descrizione?: string | null; natura?: string | null }[]): number {
  const valore = (doc.tipo === 'nota_credito' ? -1 : 1) * doc.imponibile;
  if (!righe.length) return valore;
  const k = fattoreRighe(valore, righe.reduce((s, r) => s + r.imponibile, 0));
  const finanziarie = righe.filter(r => ePartitaFinanziaria(r.descrizione, r.natura)).reduce((s, r) => s + r.imponibile, 0);
  return Math.round((valore - k * finanziarie) * 100) / 100;
}

// --- Le stesse regole in SQL (alias d = documenti_ricevuti, r = documenti_ricevuti_righe) ---

export const SQL_SEGNO_RICEVUTO = `CASE WHEN d.tipo = 'nota_credito' THEN -1 ELSE 1 END`;

/** Condizione "la riga x è una partita finanziaria". */
export const sqlPartitaFinanziaria = (x: string) => `(coalesce(${x}.natura, '') ILIKE 'N2%' AND ${x}.descrizione ~* '${REGEX_PARTITA_FINANZIARIA}')`;

/** `fattoreRighe` in SQL. */
export const SQL_FATTORE_RIGHE = `(CASE WHEN ${SQL_SEGNO_RICEVUTO} * d.imponibile
  * (SELECT coalesce(sum(x.imponibile), 0) FROM documenti_ricevuti_righe x WHERE x.documento_id = d.id) < 0 THEN -1 ELSE 1 END)`;

/** Imponibile per le analisi, con la convenzione del documento (positivo anche nelle note di credito: il segno lo mette il tipo). */
export const SQL_IMPONIBILE_COSTO = `(d.imponibile - ${SQL_SEGNO_RICEVUTO} * ${SQL_FATTORE_RIGHE}
  * (SELECT coalesce(sum(x.imponibile), 0) FROM documenti_ricevuti_righe x WHERE x.documento_id = d.id AND ${sqlPartitaFinanziaria('x')}))`;

/** Il documento d non è il doppione di un altro caricato prima. */
export const SQL_NON_DOPPIONE = `NOT EXISTS (SELECT 1 FROM documenti_ricevuti z WHERE z.id < d.id AND z.tipo = d.tipo AND z.data = d.data
  AND d.numero <> '' AND z.numero = d.numero AND z.totale = d.totale AND z.fornitore_id IS NOT DISTINCT FROM d.fornitore_id
  AND (d.fornitore_id IS NOT NULL OR upper(coalesce(z.intestatario->>'nome', '')) = upper(coalesce(d.intestatario->>'nome', ''))))`;
