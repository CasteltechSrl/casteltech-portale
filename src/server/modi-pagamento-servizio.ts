/**
 * Modi di pagamento e banche/strumenti (Adriano 7/11/2026): lettura e salvataggio dell'impostazione 'modi_pagamento'.
 * Regole in engine/modi-pagamento.ts; pagina in Impostazioni → Amministrazione → Modi di pagamento e banche.
 */
import { q, q1 } from './db.js';
import { elencoDaTesto, leggiModiPagamento, type ModiPagamento } from '../engine/modi-pagamento.js';

/** Banche o conti già scritti nelle rate (i più usati prima): l'elenco di partenza finché l'ufficio non lo scrive. */
export async function contiUsati(): Promise<string[]> {
  const righe = await q<{ conto: string }>(`SELECT conto FROM (SELECT conto FROM documenti_scadenze UNION ALL SELECT conto FROM documenti_ricevuti_scadenze) x
    WHERE coalesce(conto, '') <> '' GROUP BY conto ORDER BY count(*) DESC`);
  return righe.map(r => r.conto);
}

export async function caricaModiPagamento(): Promise<ModiPagamento & { salvato: boolean }> {
  const [v, usati] = await Promise.all([q1<{ valore: any }>(`SELECT valore FROM impostazioni WHERE chiave = 'modi_pagamento'`), contiUsati()]);
  return { ...leggiModiPagamento(v?.valore ?? {}, usati), salvato: !!v };
}

/** Salva i due elenchi scritti una voce per riga; i modi del portale (compensato, stornato) si rimettono da soli in lettura. */
export async function salvaModiPagamento(testoModi: unknown, testoStrumenti: unknown): Promise<ModiPagamento> {
  const valore = { modi: elencoDaTesto(testoModi), strumenti: elencoDaTesto(testoStrumenti) };
  await q(`INSERT INTO impostazioni (chiave, valore) VALUES ('modi_pagamento', $1) ON CONFLICT (chiave) DO UPDATE SET valore = $1, aggiornato_il = now()`, [JSON.stringify(valore)]);
  return leggiModiPagamento(valore);
}
