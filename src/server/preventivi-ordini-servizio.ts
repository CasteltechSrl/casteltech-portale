/**
 * Collegamento riga d'ordine del cliente → preventivo → commessa (Adriano 11/11/2026). Regole in `engine/preventivi-ordini.ts`.
 */
import { q, q1, transazione } from './db.js';
import type { CandidatoPreventivo } from '../engine/preventivi-ordini.js';

const iso = (d: unknown) => (d == null ? '' : typeof d === 'string' ? d.slice(0, 10) : (d as Date).toISOString().slice(0, 10));

/** Tutti i preventivi del cliente (nuovi e del vecchio portale), dal più recente. */
export async function preventiviDelCliente(clienteId: number): Promise<CandidatoPreventivo[]> {
  const righe = await q(`SELECT p.id, p.numero, p.cliente_id, r.prodotto_id, coalesce(pr.codice, p.intestazione->>'codice') AS codice,
      coalesce(pr.descrizione, p.intestazione->>'descrizione') AS descrizione, p.stato, p.origine, p.n_schede, p.creato_il,
      coalesce(nullif(p.stampa->'prezzi'->>'senza', '')::numeric, (p.risultato->'totali'->>'prezzoSchedaSecondoLotto')::numeric)::float AS prezzo
    FROM preventivi p LEFT JOIN prodotti_revisioni r ON r.id = p.revisione_id LEFT JOIN prodotti pr ON pr.id = r.prodotto_id
    WHERE p.cliente_id = $1 AND p.stato <> 'rifiutato' ORDER BY p.creato_il DESC, p.id DESC`, [clienteId]);
  return righe.map(r => ({
    id: r.id, numero: r.numero, clienteId: r.cliente_id, prodottoId: r.prodotto_id, codice: r.codice, descrizione: r.descrizione,
    stato: r.stato, origine: r.origine, nSchede: Number(r.n_schede), prezzoScheda: r.prezzo == null ? null : Number(r.prezzo), data: iso(r.creato_il),
  }));
}

/**
 * Collega (o scollega, con null) il preventivo alla riga d'ordine. Il preventivo deve essere dello stesso cliente.
 * Un preventivo del vecchio portale senza codice dall'anagrafica prende il prodotto della riga (con la sua revisione, o "0"):
 * serve per creare la commessa. Prezzi, fasi e catalogo del preventivo non cambiano.
 */
export async function collegaPreventivo(ordineId: number, rigaId: number, preventivoId: number | null): Promise<string | null> {
  return transazione(async c => {
    const riga = (await c.query(`SELECT r.id, r.prodotto_id, r.preventivo_id, o.cliente_id FROM ordini_righe r JOIN ordini o ON o.id = r.ordine_id
      WHERE r.id = $1 AND r.ordine_id = $2`, [rigaId, ordineId])).rows[0];
    if (!riga) return 'Riga non trovata.';
    if ((riga.preventivo_id ?? null) === preventivoId) return null;
    if (preventivoId == null) { await c.query(`UPDATE ordini_righe SET preventivo_id = NULL WHERE id = $1`, [rigaId]); return null; }
    const p = (await c.query(`SELECT p.id, p.numero, p.cliente_id, p.revisione_id, p.intestazione FROM preventivi p WHERE p.id = $1`, [preventivoId])).rows[0];
    if (!p) return 'Preventivo non trovato.';
    if (riga.cliente_id && p.cliente_id !== riga.cliente_id) return `Il preventivo ${p.numero} è di un altro cliente.`;
    await c.query(`UPDATE ordini_righe SET preventivo_id = $2 WHERE id = $1`, [rigaId, p.id]);
    if (!p.revisione_id && riga.prodotto_id) {
      const pr = (await c.query(`SELECT codice, descrizione FROM prodotti WHERE id = $1`, [riga.prodotto_id])).rows[0];
      const rev = String(p.intestazione?.revisione ?? '').trim().toUpperCase() || '0';
      const revId = (await c.query(`INSERT INTO prodotti_revisioni (prodotto_id, revisione) VALUES ($1,$2)
        ON CONFLICT (prodotto_id, revisione) DO UPDATE SET revisione = EXCLUDED.revisione RETURNING id`, [riga.prodotto_id, rev])).rows[0].id;
      const intestazione = { ...(p.intestazione ?? {}), codice: pr.codice, descrizione: pr.descrizione, revisione: rev,
        ...(p.intestazione?.codice && p.intestazione.codice !== pr.codice ? { codiceVecchioPortale: p.intestazione.codice } : {}) };
      await c.query(`UPDATE preventivi SET revisione_id = $2, intestazione = $3, aggiornato_il = now() WHERE id = $1`, [p.id, revId, intestazione]);
      return `Il preventivo ${p.numero} non aveva il codice dall'anagrafica: ora è collegato a ${pr.codice}.`;
    }
    return null;
  });
}

/** Dati della riga d'ordine per precompilare la commessa nuova. */
export const rigaPerCommessa = (rigaId: number) => q1<{ id: number; ordine_id: number; quantita: number; consegna_richiesta: string | null;
  rif_cliente: string | null; data_ordine_cliente: string | null; numero: number; anno: number; commessa_id: number | null }>(
  `SELECT r.id, r.ordine_id, r.quantita::float AS quantita, r.consegna_richiesta::text, o.rif_cliente, o.data_ordine_cliente::text, o.numero, o.anno, r.commessa_id
   FROM ordini_righe r JOIN ordini o ON o.id = r.ordine_id WHERE r.id = $1`, [rigaId]);

/** La commessa appena creata dalla riga d'ordine si collega alla riga (e la riga al preventivo della commessa, se non l'aveva). */
export async function collegaCommessaARiga(rigaId: number, commessaId: number) {
  await q(`UPDATE ordini_righe r SET commessa_id = c.id, preventivo_id = coalesce(r.preventivo_id, c.preventivo_id)
    FROM commesse c WHERE r.id = $1 AND c.id = $2`, [rigaId, commessaId]);
}
