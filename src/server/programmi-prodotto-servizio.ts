/**
 * Programmi delle macchine sul prodotto (Adriano 13/11/2026; regole in `engine/programmi-prodotto.ts`).
 * - `programmiDelProdotto` / `salvaProgrammiProdotto`: pagina Anagrafiche → Prodotti → "Programmi".
 * - `caricaProgrammi`: caricamento fatto da Claude (POST /api/claude/programmi) con i nomi letti da AOI, serigrafia HTGD, FOX, iPulse:
 *   riempie solo le caselle vuote del prodotto e delle commesse aperte o in produzione; senza `conferma` dice solo cosa farebbe.
 */
import { q, q1, transazione } from './db.js';
import { PROGRAMMI } from './commesse-servizio.js';
import { leggiProgrammi, riempiVuote, type Programmi } from '../engine/programmi-prodotto.js';

const CHIAVI = PROGRAMMI.map(([k]) => k);

export async function programmiDelProdotto(id: number): Promise<Programmi> {
  const r = await q1<{ programmi: unknown }>(`SELECT programmi FROM prodotti WHERE id = $1`, [id]);
  return leggiProgrammi(r?.programmi, CHIAVI);
}

export async function salvaProgrammiProdotto(id: number, programmi: unknown): Promise<void> {
  await q(`UPDATE prodotti SET programmi = $2 WHERE id = $1`, [id, leggiProgrammi(programmi, CHIAVI)]);
}

/** Commesse aperte o in produzione del prodotto (per la pagina del prodotto). */
export async function commesseApertePerProdotto(id: number) {
  return q<{ id: number; numero: string; stato: string }>(`SELECT c.id, c.numero, c.stato FROM commesse c JOIN prodotti_revisioni r ON r.id = c.revisione_id
    WHERE r.prodotto_id = $1 AND c.stato IN ('aperta', 'in_produzione') ORDER BY c.id`, [id]);
}

export interface EsitoCaricamento { prodotti: number; caselleProdotti: number; commesse: number; caselleCommesse: number; nonTrovati: number[];
  dettaglio: { commessa: string; riempite: number }[] }

export async function caricaProgrammi(elenco: { prodotto_id: number; programmi: unknown }[], conferma: boolean): Promise<EsitoCaricamento> {
  const esito: EsitoCaricamento = { prodotti: 0, caselleProdotti: 0, commesse: 0, caselleCommesse: 0, nonTrovati: [], dettaglio: [] };
  await transazione(async c => {
    for (const x of elenco) {
      const nuovi = leggiProgrammi(x.programmi, CHIAVI);
      const p = (await c.query(`SELECT id, programmi FROM prodotti WHERE id = $1`, [x.prodotto_id])).rows[0];
      if (!p) { esito.nonTrovati.push(x.prodotto_id); continue; }
      const sulProdotto = riempiVuote(leggiProgrammi(p.programmi, CHIAVI), nuovi);
      if (sulProdotto.riempite) {
        esito.prodotti++; esito.caselleProdotti += sulProdotto.riempite;
        if (conferma) await c.query(`UPDATE prodotti SET programmi = $2 WHERE id = $1`, [p.id, sulProdotto.programmi]);
      }
      const commesse = (await c.query(`SELECT k.id, k.numero, k.scheda_tecnica FROM commesse k JOIN prodotti_revisioni r ON r.id = k.revisione_id
        WHERE r.prodotto_id = $1 AND k.stato IN ('aperta', 'in_produzione')`, [p.id])).rows;
      for (const k of commesse) {
        const st = k.scheda_tecnica && typeof k.scheda_tecnica === 'object' ? k.scheda_tecnica : {};
        const nella = riempiVuote(leggiProgrammi(st.programmi, CHIAVI), nuovi);
        if (!nella.riempite) continue;
        esito.commesse++; esito.caselleCommesse += nella.riempite; esito.dettaglio.push({ commessa: k.numero, riempite: nella.riempite });
        if (conferma) await c.query(`UPDATE commesse SET scheda_tecnica = jsonb_set(scheda_tecnica, '{programmi}', $2::jsonb), aggiornato_il = now() WHERE id = $1`,
          [k.id, JSON.stringify({ ...(st.programmi ?? {}), ...nella.programmi })]);
      }
    }
    if (!conferma) throw new ProvaSoltanto();
  }).catch(e => { if (!(e instanceof ProvaSoltanto)) throw e; });
  return esito;
}
class ProvaSoltanto extends Error {}
