/**
 * Letture per l'analisi degli acquisti (regole in engine/analisi-acquisti.ts): fatture dei fornitori di tutti gli anni (anche lo storico
 * di Fatture in Cloud), rate, ordini a fornitore del portale e le loro righe per un componente o un materiale di consumo.
 * Tutto letto all'apertura della pagina, niente controlli periodici (Neon).
 */
import { q, q1 } from './db.js';
import { SQL_IMPONIBILE_COSTO, SQL_NON_DOPPIONE } from '../engine/costo-fornitori.js';
import type { FatturaFornitore, OrdineFornitoreAnalisi, PagamentoFornitore, RigaAcquistoArticolo } from '../engine/analisi-acquisti.js';

export const NOME_FORNITORE_SQL = `coalesce(f.ragione_sociale, d.intestatario->>'nome', d.intestatario->>'ragione_sociale', '(senza nome)')`;
/** Chiave del fornitore: f<id> se è in anagrafica, altrimenti n:NOME (come in Acquisti per fornitore e mese). */
const CHIAVE_FORNITORE_SQL = `CASE WHEN d.fornitore_id IS NOT NULL THEN 'f' || d.fornitore_id ELSE 'n:' || upper(${NOME_FORNITORE_SQL}) END`;
const ORDINI_OK = `d.tipo = 'ordine_fornitore' AND d.stato NOT IN ('bozza', 'annullato', 'scartato')`;

/** Fatture e note di credito dei fornitori di tutti gli anni (imponibile del documento senza partite finanziarie, niente doppioni: engine/costo-fornitori.ts). */
export function fattureFornitoriTutte(): Promise<FatturaFornitore[]> {
  return q<FatturaFornitore>(`SELECT ${CHIAVE_FORNITORE_SQL} AS "fornitoreChiave", d.fornitore_id AS "fornitoreId", ${NOME_FORNITORE_SQL} AS fornitore,
      d.tipo, to_char(d.data, 'YYYY-MM-DD') AS data, ${SQL_IMPONIBILE_COSTO}::float AS imponibile, d.categoria
    FROM documenti_ricevuti d LEFT JOIN fornitori_anagrafica f ON f.id = d.fornitore_id WHERE ${SQL_NON_DOPPIONE} ORDER BY d.data, d.id`);
}

/** Il fornitore della scheda: dalla chiave (f12 o n:NOME) o dall'id dell'anagrafica. */
export async function fornitoreDaChiave(chiave: string): Promise<{ chiave: string; id: number | null; nome: string; piva: string | null } | null> {
  if (/^f\d+$/.test(chiave)) {
    const f = await q1<{ id: number; ragione_sociale: string; partita_iva: string | null }>(`SELECT id, ragione_sociale, partita_iva FROM fornitori_anagrafica WHERE id = $1`, [Number(chiave.slice(1))]);
    return f ? { chiave, id: f.id, nome: f.ragione_sociale, piva: f.partita_iva } : null;
  }
  if (chiave.startsWith('n:')) return { chiave, id: null, nome: chiave.slice(2), piva: null };
  return null;
}

/** Rate delle fatture del fornitore (pagate e aperte) con la data della fattura. */
export function pagamentiFornitore(chiave: string): Promise<PagamentoFornitore[]> {
  return q<PagamentoFornitore>(`SELECT ${CHIAVE_FORNITORE_SQL} AS "fornitoreChiave", to_char(d.data, 'YYYY-MM-DD') AS "dataFattura",
      to_char(s.data, 'YYYY-MM-DD') AS scadenza, (CASE WHEN d.tipo = 'nota_credito' THEN -1 ELSE 1 END * s.importo)::float AS importo, to_char(s.pagata_il, 'YYYY-MM-DD') AS "pagataIl"
    FROM documenti_ricevuti_scadenze s JOIN documenti_ricevuti d ON d.id = s.documento_id LEFT JOIN fornitori_anagrafica f ON f.id = d.fornitore_id
    WHERE ${CHIAVE_FORNITORE_SQL} = $1 ORDER BY s.data`, [chiave]);
}

/** Ordini a fornitore emessi dal portale a questo fornitore (solo in anagrafica). */
export function ordiniFornitore(fornitoreId: number | null): Promise<(OrdineFornitoreAnalisi & { id: number; numero: string; righe: string | null })[]> {
  if (!fornitoreId) return Promise.resolve([]);
  return q(`SELECT 'f' || d.fornitore_id AS "fornitoreChiave", to_char(d.data, 'YYYY-MM-DD') AS data, d.id,
      coalesce(d.numero::text, 'bozza') || CASE WHEN d.sezionale <> '' THEN '/' || d.sezionale ELSE '' END AS numero,
      coalesce((SELECT sum(r.quantita * r.prezzo * (1 - coalesce(r.sconto, 0) / 100)) FROM documenti_righe r WHERE r.documento_id = d.id AND NOT r.solo_descrizione), 0)::float AS totale,
      (SELECT string_agg(r.descrizione, ' · ' ORDER BY r.posizione) FROM documenti_righe r WHERE r.documento_id = d.id AND NOT r.solo_descrizione) AS righe
    FROM documenti d WHERE ${ORDINI_OK} AND d.fornitore_id = $1 ORDER BY d.data DESC, d.id DESC`, [fornitoreId]);
}

/** Le ultime fatture del fornitore (per l'elenco in fondo alla scheda). */
export function ultimeFattureFornitore(chiave: string, max = 30) {
  return q<{ id: number; tipo: string; numero: string; data: string; imponibile: number; descrizione: string | null; categoria: string | null; origine: string }>(
    `SELECT d.id, d.tipo, d.numero, to_char(d.data, 'YYYY-MM-DD') AS data, d.imponibile::float AS imponibile, d.descrizione, d.categoria, d.origine
     FROM documenti_ricevuti d LEFT JOIN fornitori_anagrafica f ON f.id = d.fornitore_id
     WHERE ${CHIAVE_FORNITORE_SQL} = $1 ORDER BY d.data DESC, d.id DESC LIMIT $2`, [chiave, max]);
}

const SQL_RIGHE_ARTICOLO = `SELECT to_char(d.data, 'YYYY-MM-DD') AS data, d.id AS "documentoId",
    coalesce(d.numero::text, 'bozza') || CASE WHEN d.sezionale <> '' THEN '/' || d.sezionale ELSE '' END AS numero,
    coalesce(f.ragione_sociale, d.intestatario->>'nome', d.intestatario->>'ragione_sociale', '') AS fornitore, d.fornitore_id AS "fornitoreId",
    r.quantita::float AS quantita, r.prezzo::float AS prezzo, coalesce(r.sconto, 0)::float AS sconto, r.descrizione, r.arrivati::float AS arrivati, d.commessa_id AS "commessaId"
  FROM documenti_righe r JOIN documenti d ON d.id = r.documento_id LEFT JOIN fornitori_anagrafica f ON f.id = d.fornitore_id
  WHERE ${ORDINI_OK} AND NOT r.solo_descrizione
    AND NOT EXISTS (SELECT 1 FROM documenti_ricevuti x WHERE x.id = d.ricevuto_id AND x.righe_lette_il IS NOT NULL)`;
export type RigaAcquistoLetta = RigaAcquistoArticolo & { descrizione: string; arrivati: number; commessaId: number | null; fonte?: 'ordine' | 'fattura' };

/** Righe degli ordini a fornitore che comprano il componente (collegato con componente_id o con uno dei suoi tre codici). */
export function righeAcquistoComponente(c: { id: number; pn: string | null; codice_gestionale: string | null; codice_produzione: string | null }): Promise<RigaAcquistoLetta[]> {
  const codici = [c.pn, c.codice_gestionale, c.codice_produzione].filter((x): x is string => !!x && x.trim() !== '').map(x => x.trim().toUpperCase());
  return q<RigaAcquistoLetta>(`${SQL_RIGHE_ARTICOLO} AND (r.componente_id = $1 OR upper(trim(coalesce(r.codice, ''))) = ANY($2)) ORDER BY d.data, d.id, r.posizione`, [c.id, codici]);
}

/** Righe degli ordini a fornitore che comprano il materiale di consumo (codice MC-…). */
export function righeAcquistoMateriale(codice: string): Promise<RigaAcquistoLetta[]> {
  return q<RigaAcquistoLetta>(`${SQL_RIGHE_ARTICOLO} AND upper(trim(coalesce(r.codice, ''))) = $1 ORDER BY d.data, d.id, r.posizione`, [codice.toUpperCase()]);
}

export interface ComponenteScheda {
  id: number; pn: string | null; produttore: string | null; famiglia: string | null; codice_produzione: string | null; codice_gestionale: string | null;
  descrizione: string | null; stato: string | null; prezzo_acquisto: number | null; prezzo_fornitore: string | null; prezzo_quantita: number | null;
  prezzo_data: string | null; prezzo_fonte: string | null;
}
export const componentePerId = (id: number) => q1<ComponenteScheda>(`SELECT id, pn, produttore, famiglia, codice_produzione, codice_gestionale, descrizione, stato,
    prezzo_acquisto::float AS prezzo_acquisto, prezzo_fornitore, prezzo_quantita::float AS prezzo_quantita, to_char(prezzo_data, 'YYYY-MM-DD') AS prezzo_data, prezzo_fonte
  FROM componenti WHERE id = $1`, [id]);

/** BOM quotate (o solo codificate) in cui compare il componente: stesso P/N o stesso codice gestionale; con il cliente del preventivo o dei documenti collegati. */
export function bomDelComponente(c: { pn: string | null; codice_gestionale: string | null }) {
  const pn = (c.pn ?? '').trim().toUpperCase(), gest = (c.codice_gestionale ?? '').trim().toUpperCase();
  if (!pn && !gest) return Promise.resolve([]);
  return q<{ id: number; nome: string; data: string; solo_codifica: boolean; cliente: string | null; preventivo: string | null; quantita: number }>(
    `SELECT b.id, b.nome, to_char(b.aggiornato_il, 'YYYY-MM-DD') AS data, b.solo_codifica,
        coalesce((SELECT c.ragione_sociale FROM preventivi p JOIN clienti c ON c.id = p.cliente_id WHERE p.bom_id = b.id ORDER BY p.id DESC LIMIT 1),
                 (SELECT c.ragione_sociale FROM pacchetti_scheda s JOIN clienti c ON c.id = s.cliente_id WHERE s.bom_id = b.id ORDER BY s.id DESC LIMIT 1)) AS cliente,
        (SELECT p.numero FROM preventivi p WHERE p.bom_id = b.id ORDER BY p.id DESC LIMIT 1) AS preventivo,
        coalesce((SELECT sum((x->>'qtaScheda')::float) FROM jsonb_array_elements(b.righe) x
          WHERE ($1 <> '' AND upper(coalesce(x->>'pn', '')) = $1) OR ($2 <> '' AND upper(coalesce(x->>'codiceGestionale', '')) = $2)), 0)::float AS quantita
     FROM bom_analisi b
     WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(b.righe) x
       WHERE ($1 <> '' AND upper(coalesce(x->>'pn', '')) = $1) OR ($2 <> '' AND upper(coalesce(x->>'codiceGestionale', '')) = $2))
     ORDER BY b.aggiornato_il DESC LIMIT 50`, [pn, gest]);
}

export const materialePerId = (id: number) => q1<{ id: number; codice: string; descrizione: string; categoria: string; um: string | null; attivo: boolean;
    prezzo_acquisto: number | null; prezzo_fornitore: string | null; prezzo_quantita: number | null; prezzo_data: string | null; prezzo_fonte: string | null }>(
  `SELECT id, codice, descrizione, categoria, um, attivo, prezzo_acquisto::float AS prezzo_acquisto, prezzo_fornitore, prezzo_quantita::float AS prezzo_quantita,
     to_char(prezzo_data, 'YYYY-MM-DD') AS prezzo_data, prezzo_fonte FROM materiali_consumo WHERE id = $1`, [id]);
