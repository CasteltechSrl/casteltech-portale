/**
 * Note di montaggio e segnalazioni sul prodotto (Adriano 13/11/2026; regole in `engine/note-prodotto.ts`).
 * - `noteDelProdotto` / `salvaNoteProdotto`: pagina Anagrafiche → Prodotti → "Programmi" (riquadro Note di montaggio).
 * - `caricaNoteSchede`: caricamento fatto da Claude (POST /api/claude/note-schede) con le note lette dalle vecchie schede di produzione Word:
 *   unisce le note al prodotto, sostituisce la segnalazione "schede vecchie" del prodotto e riempie le note VUOTE delle commesse aperte;
 *   senza `conferma` dice solo cosa farebbe. Con `nuovo: {cliente_id, codice, descrizione}` (codici confermati da Adriano ma non in anagrafica)
 *   il prodotto si cerca per cliente + codice e, se manca, si aggiunge in MAIUSCOLO sotto quel cliente (regola codice-cliente).
 */
import { q, q1, transazione } from './db.js';
import { CATEGORIA_SCHEDE_VECCHIE, MAX_NOTE, prodottoNuovoPulito, testoSegnalazioniVecchie, unisciNote } from '../engine/note-prodotto.js';

export async function noteDelProdotto(id: number): Promise<string> {
  return (await q1<{ note_montaggio: string }>(`SELECT note_montaggio FROM prodotti WHERE id = $1`, [id]))?.note_montaggio ?? '';
}

export async function salvaNoteProdotto(id: number, note: unknown): Promise<void> {
  await q(`UPDATE prodotti SET note_montaggio = $2 WHERE id = $1`, [id, String(note ?? '').trim().slice(0, MAX_NOTE)]);
}

/** Segnalazioni dello storico del prodotto (per la pagina del prodotto). */
export const segnalazioniDelProdotto = (id: number) => q<{ testo: string; categoria: string | null; numero: string | null }>(
  `SELECT s.testo, s.categoria, c.numero FROM segnalazioni s LEFT JOIN commesse c ON c.id = s.commessa_id
   WHERE s.prodotto_id = $1 AND s.rilevante_prossime ORDER BY s.creato_il DESC LIMIT 10`, [id]);

export interface EsitoNoteSchede { prodotti: number; creati: string[]; righeNote: number; segnalazioni: number; commesse: string[]; nonTrovati: number[] }

export interface ProdottoNuovo { cliente_id: number; codice: string; descrizione: string }

export async function caricaNoteSchede(elenco: { prodotto_id?: number; nuovo?: ProdottoNuovo; note?: unknown; segnalazioni?: unknown }[], conferma: boolean): Promise<EsitoNoteSchede> {
  const esito: EsitoNoteSchede = { prodotti: 0, creati: [], righeNote: 0, segnalazioni: 0, commesse: [], nonTrovati: [] };
  await transazione(async c => {
    for (const x of elenco) {
      let p: { id: number; note_montaggio: string } | undefined;
      if (x.nuovo) {
        const n = prodottoNuovoPulito(x.nuovo);
        const cliente = n && (await c.query(`SELECT id FROM clienti WHERE id = $1`, [n.cliente_id])).rows[0];
        if (!n || !cliente) { esito.nonTrovati.push(Number(x.nuovo.cliente_id)); continue; }
        const { codice, descrizione } = n;
        p = (await c.query(`SELECT id, note_montaggio FROM prodotti WHERE cliente_id = $1 AND upper(codice) = $2 ORDER BY id LIMIT 1`, [cliente.id, codice])).rows[0];
        if (!p) {
          esito.creati.push(codice);
          if (!conferma) { p = { id: 0, note_montaggio: '' }; }
          else p = (await c.query(`INSERT INTO prodotti (cliente_id, codice, descrizione) VALUES ($1,$2,$3) RETURNING id, note_montaggio`, [cliente.id, codice, descrizione])).rows[0];
        }
      } else p = (await c.query(`SELECT id, note_montaggio FROM prodotti WHERE id = $1`, [x.prodotto_id])).rows[0];
      if (!p) { esito.nonTrovati.push(Number(x.prodotto_id)); continue; }
      const unite = unisciNote(p.note_montaggio, x.note);
      const segn = testoSegnalazioniVecchie(x.segnalazioni);
      if (unite.aggiunte || segn) esito.prodotti++;
      esito.righeNote += unite.aggiunte;
      if (segn) esito.segnalazioni++;
      if (!conferma) continue;
      if (unite.aggiunte) await c.query(`UPDATE prodotti SET note_montaggio = $2 WHERE id = $1`, [p.id, unite.testo]);
      // una sola riga per prodotto: ricaricando si sostituisce
      await c.query(`DELETE FROM segnalazioni WHERE prodotto_id = $1 AND categoria = $2 AND commessa_id IS NULL`, [p.id, CATEGORIA_SCHEDE_VECCHIE]);
      if (segn) await c.query(`INSERT INTO segnalazioni (prodotto_id, origine, categoria, testo, rilevante_prossime, creato_il)
        VALUES ($1, 'ufficio', $2, $3, true, now())`, [p.id, CATEGORIA_SCHEDE_VECCHIE, segn]);
      // commesse aperte con le note di montaggio vuote: prendono quelle del prodotto
      const testo = unite.aggiunte ? unite.testo : p.note_montaggio;
      if (!testo) continue;
      const aperte = (await c.query(`UPDATE commesse k SET scheda_tecnica = jsonb_set(k.scheda_tecnica, '{noteMontaggio}', to_jsonb($2::text)), aggiornato_il = now()
        FROM prodotti_revisioni r WHERE r.id = k.revisione_id AND r.prodotto_id = $1 AND k.stato IN ('aperta', 'in_produzione')
          AND coalesce(trim(k.scheda_tecnica->>'noteMontaggio'), '') = '' RETURNING k.numero`, [p.id, testo])).rows;
      esito.commesse.push(...aperte.map(r => r.numero));
    }
  });
  return esito;
}

/**
 * Toglie i prodotti aggiunti per sbaglio dal caricamento delle schede vecchie (Adriano 13/11/2026, "scarta anche Kairos"):
 * solo se il prodotto non è usato da nessuna parte (preventivi, commesse, ordini, documenti, segnalazioni diverse da 'schede vecchie').
 */
export async function scartaProdottiSchede(elenco: { cliente_id: unknown; codice: unknown }[], conferma: boolean): Promise<{ tolti: string[]; tenuti: string[] }> {
  const esito = { tolti: [] as string[], tenuti: [] as string[] };
  await transazione(async c => {
    for (const x of elenco) {
      const codice = String(x.codice ?? '').trim().toUpperCase();
      const p = (await c.query(`SELECT id FROM prodotti WHERE cliente_id = $1 AND upper(codice) = $2`, [Number(x.cliente_id), codice])).rows[0];
      if (!p) continue;
      const u = (await c.query(`SELECT
          (SELECT count(*)::int FROM prodotti_revisioni r JOIN preventivi v ON v.revisione_id = r.id WHERE r.prodotto_id = $1)
        + (SELECT count(*)::int FROM prodotti_revisioni r JOIN commesse k ON k.revisione_id = r.id WHERE r.prodotto_id = $1)
        + (SELECT count(*)::int FROM ordini_righe WHERE prodotto_id = $1)
        + (SELECT count(*)::int FROM documenti_righe WHERE prodotto_id = $1)
        + (SELECT count(*)::int FROM segnalazioni WHERE prodotto_id = $1 AND coalesce(categoria, '') <> $2) AS usi`, [p.id, CATEGORIA_SCHEDE_VECCHIE])).rows[0];
      if (u.usi) { esito.tenuti.push(codice); continue; }
      esito.tolti.push(codice);
      if (!conferma) continue;
      await c.query(`DELETE FROM segnalazioni WHERE prodotto_id = $1`, [p.id]);
      await c.query(`DELETE FROM prodotti_revisioni WHERE prodotto_id = $1`, [p.id]);
      await c.query(`DELETE FROM prodotti WHERE id = $1`, [p.id]);
    }
  });
  return esito;
}
