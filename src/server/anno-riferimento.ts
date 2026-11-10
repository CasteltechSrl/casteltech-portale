/**
 * Anno di riferimento dei cruscotti (Adriano 10/11/2026; regole in engine/anno-riferimento.ts): `?anno=AAAA` lo cambia e lo ricorda nella sessione,
 * così vale per tutti i cruscotti (generale, Ordini clienti, Amministrazione, Dipendenti) finché non si sceglie un altro anno.
 * Anche l'elenco dei clienti con il fatturato (una lettura sola, due anni) per il cruscotto generale e il cruscotto degli ordini.
 */
import type { Request } from 'express';
import { q } from './db.js';
import { annoValido, fatturatoPerCliente, type ClienteFatturato, type FatturaPerCliente } from '../engine/anno-riferimento.js';
import { SQL_DATA_ANALISI } from '../engine/analisi.js';

declare module 'express-session' { interface SessionData { annoRiferimento?: number } }

const oggiRoma = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });

/** Anno scelto: quello dell'indirizzo (e da ora vale per tutti i cruscotti), altrimenti quello ricordato, altrimenti l'anno in corso. */
export function annoRiferimento(req: Request, oggi = oggiRoma()): number {
  const annoOggi = Number(oggi.slice(0, 4));
  const scelto = annoValido(req.query.anno, annoOggi);
  if (scelto != null && req.session) {
    if (scelto === annoOggi) delete req.session.annoRiferimento; else req.session.annoRiferimento = scelto;
    return scelto;
  }
  return annoValido(req.session?.annoRiferimento, annoOggi) ?? annoOggi;
}

const NOME = `coalesce(c.ragione_sociale, d.intestatario->>'ragione_sociale', d.intestatario->>'nome', '(senza nome)')`;

/** Clienti con il fatturato dell'anno e dell'anno prima (fatture meno note di credito, NC collegate nella data della fattura stornata, come l'Analisi). */
export async function fatturatoClienti(anno: number, oggi = oggiRoma()): Promise<ClienteFatturato[]> {
  const righe = await q<FatturaPerCliente>(`SELECT CASE WHEN d.cliente_id IS NOT NULL THEN 'c' || d.cliente_id ELSE 'n:' || upper(${NOME}) END AS chiave,
      ${NOME} AS cliente, d.cliente_id AS "clienteId", d.tipo, to_char(${SQL_DATA_ANALISI}, 'YYYY-MM-DD') AS data, d.imponibile::float AS imponibile
    FROM documenti d LEFT JOIN clienti c ON c.id = d.cliente_id LEFT JOIN documenti o ON o.id = d.documento_origine_id
    WHERE d.tipo IN ('fattura', 'nota_credito') AND d.stato NOT IN ('bozza', 'annullato', 'scartato') AND d.numero IS NOT NULL
      AND extract(year FROM ${SQL_DATA_ANALISI})::int IN ($1::int, $1::int - 1)`, [anno]);
  return fatturatoPerCliente(righe.map(r => ({ ...r, imponibile: Number(r.imponibile) || 0 })), anno, oggi);
}
