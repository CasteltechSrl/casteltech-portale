/**
 * Documentazione dei prodotti: letture e scritture di `prodotti_documenti` (migrazione 081). Regole in engine/documenti-prodotto.ts.
 * Nel portale resta solo il riassunto; i file stanno sul Drive del cliente (Adriano 6/11/2026).
 */
import { q, q1 } from './db.js';
import { confrontaRevisioni, revisioneProposta, riassuntoDaAnalisi, type Confronto, type RiassuntoDocumenti } from '../engine/documenti-prodotto.js';
import { decomprimi, type Disegno } from './schede-cliente-servizio.js';
import type { AnalisiScheda } from '../engine/scheda/analisi.js';

export interface RevisioneDocumenti {
  id: number; prodotto_id: number; revisione: string; revisione_da: string | null; caricato_il: string; caricato_da: string | null;
  origine: string; cartella: string | null; pacchetto_id: number | null; riassunto: RiassuntoDocumenti; note: string | null;
}

/** Le revisioni di un prodotto, dalla più vecchia alla più nuova. */
export function revisioniDelProdotto(prodottoId: number): Promise<RevisioneDocumenti[]> {
  return q<RevisioneDocumenti>(`SELECT id, prodotto_id, revisione, revisione_da, caricato_il::text AS caricato_il, caricato_da, origine, cartella, pacchetto_id, riassunto, note
    FROM prodotti_documenti WHERE prodotto_id = $1 ORDER BY caricato_il, id`, [prodottoId]);
}

/** Quante revisioni ha ogni prodotto (per l'elenco Prodotti). */
export async function revisioniPerProdotto(ids: number[]): Promise<Map<number, { n: number; ultima: string }>> {
  if (!ids.length) return new Map();
  const righe = await q<{ prodotto_id: number; n: number; ultima: string }>(`SELECT prodotto_id, count(*)::int AS n,
      (array_agg(revisione ORDER BY caricato_il DESC, id DESC))[1] AS ultima FROM prodotti_documenti WHERE prodotto_id = ANY($1::int[]) GROUP BY prodotto_id`, [ids]);
  return new Map(righe.map(r => [r.prodotto_id, { n: r.n, ultima: r.ultima }]));
}

export interface NuovaRevisione {
  prodottoId: number;
  riassunto: RiassuntoDocumenti;
  /** revisione già decisa (es. scritta dall'ufficio); altrimenti si legge dal riassunto e dai nomi */
  revisione?: string | null;
  nomi?: string[];
  caricatoDa: string | null;
  origine: 'drive' | 'portale';
  cartella?: string | null;
  pacchettoId?: number | null;
  note?: string | null;
}

/** Salva una revisione nuova e la confronta con quella prima (se c'è). */
export async function salvaRevisione(n: NuovaRevisione): Promise<{ id: number; revisione: string; confronto: Confronto | null; precedente: RevisioneDocumenti | null }> {
  const esistenti = await revisioniDelProdotto(n.prodottoId);
  const nomi = n.nomi ?? [n.cartella ?? '', n.riassunto.fonti.bom ?? '', ...n.riassunto.file.filter(f => f.usato).map(f => f.nome), ...n.riassunto.file.map(f => f.nome)].filter(Boolean);
  const scelta = n.revisione?.trim()
    ? { revisione: n.revisione.trim().toUpperCase().slice(0, 20), fonte: 'scritta a mano' }
    : revisioneProposta({ daFile: n.riassunto.prodotto?.revisione ?? null, fonteFile: n.riassunto.prodotto?.fonti?.revisione, nomi, esistenti: esistenti.map(e => e.revisione) });
  const r = await q1<{ id: number }>(`INSERT INTO prodotti_documenti (prodotto_id, revisione, revisione_da, caricato_da, origine, cartella, pacchetto_id, riassunto, note)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [n.prodottoId, scelta.revisione, scelta.fonte, n.caricatoDa, n.origine, n.cartella ?? null, n.pacchettoId ?? null, JSON.stringify(n.riassunto), n.note ?? null]);
  const precedente = esistenti.at(-1) ?? null;
  return { id: r!.id, revisione: scelta.revisione, confronto: precedente ? confrontaRevisioni(precedente.riassunto, n.riassunto) : null, precedente };
}

/**
 * Dal pacchetto dei Documenti dei clienti già analizzato al riassunto per il prodotto. Con `liberaFile` i file del pacchetto
 * si tolgono dal database (resta analisi e disegno): i file stanno sul Drive, non pesano su Neon.
 */
export async function revisioneDaPacchetto(opz: { prodottoId: number; pacchettoId: number; caricatoDa: string | null; revisione?: string | null; liberaFile: boolean; note?: string | null }) {
  const p = await q1<{ nome: string; stato: string; analisi: AnalisiScheda | null; file_elenco: any[] | null; fonti: any; disegno: Buffer | null }>(
    `SELECT nome, stato, analisi, file_elenco, fonti, disegno FROM pacchetti_scheda WHERE id = $1`, [opz.pacchettoId]);
  if (!p || p.stato !== 'analizzato' || !p.analisi) throw new Error('Il pacchetto non è ancora analizzato.');
  const disegno = decomprimi<Disegno>(p.disegno);
  const riassunto = riassuntoDaAnalisi(p.analisi, p.file_elenco ?? [], p.fonti ?? { bom: null, pickPlace: [], gerber: [], cad: null, forature: [] },
    disegno?.strati.map(s => ({ nome: s.nome, ruolo: s.ruolo, lato: s.lato })) ?? []);
  const esito = await salvaRevisione({ prodottoId: opz.prodottoId, riassunto, revisione: opz.revisione, nomi: [p.nome, ...(riassunto.fonti.bom ? [riassunto.fonti.bom] : []), ...riassunto.file.map(f => f.nome)],
    caricatoDa: opz.caricatoDa, origine: 'portale', pacchettoId: opz.pacchettoId, note: opz.note ?? null });
  if (opz.liberaFile) await q(`UPDATE pacchetti_scheda_file SET dati = ''::bytea WHERE pacchetto_id = $1`, [opz.pacchettoId]);
  return esito;
}

export async function eliminaRevisione(prodottoId: number, id: number): Promise<boolean> {
  const r = await q(`DELETE FROM prodotti_documenti WHERE id = $1 AND prodotto_id = $2 RETURNING id`, [id, prodottoId]);
  return r.length > 0;
}

/** Prodotti venduti in un anno (DDT e fatture, anche storico FIC) con le revisioni già caricate: per l'acquisizione dal Drive fatta da Claude. */
export function prodottiVendutiNellAnno(anno: number) {
  return q<{ id: number; codice: string; descrizione: string | null; cliente: string; revisioni: number; ultima: string | null }>(`
    SELECT p.id, p.codice, p.descrizione, c.ragione_sociale AS cliente,
      (SELECT count(*)::int FROM prodotti_documenti d WHERE d.prodotto_id = p.id) AS revisioni,
      (SELECT d.revisione FROM prodotti_documenti d WHERE d.prodotto_id = p.id ORDER BY d.caricato_il DESC, d.id DESC LIMIT 1) AS ultima
    FROM prodotti p JOIN clienti c ON c.id = p.cliente_id
    WHERE EXISTS (SELECT 1 FROM documenti_righe r JOIN documenti d ON d.id = r.documento_id
      WHERE d.anno = $1 AND d.tipo IN ('ddt', 'fattura') AND d.stato NOT IN ('bozza', 'annullato', 'scartato') AND NOT r.solo_descrizione
        AND (r.prodotto_id = p.id OR (d.cliente_id = p.cliente_id AND upper(trim(r.codice)) = upper(p.codice))))
    ORDER BY c.ragione_sociale, p.codice`, [anno]);
}

/** Prodotto per cliente (nome, anche parziale) e codice: per l'acquisizione dal Drive. */
export async function trovaProdotto(cliente: string, codice: string): Promise<{ id: number; codice: string; cliente: string } | null> {
  const righe = await q<{ id: number; codice: string; cliente: string }>(`SELECT p.id, p.codice, c.ragione_sociale AS cliente FROM prodotti p JOIN clienti c ON c.id = p.cliente_id
    WHERE upper(p.codice) = upper($2) AND (c.ragione_sociale ILIKE '%' || $1 || '%' OR c.id = (SELECT cliente_id FROM alias_clienti WHERE upper(nome) = upper($1) LIMIT 1))`, [cliente.trim(), codice.trim()]);
  return righe.length === 1 ? righe[0] : null;
}

/** Spazio occupato su Neon per tabella (Adriano 6/11/2026: "pesano sullo spazio disponibile sul portale?"). */
export function spazioTabelle() {
  return q<{ tabella: string; byte: number; righe: number }>(`SELECT c.relname AS tabella, pg_total_relation_size(c.oid)::bigint::float AS byte, c.reltuples::bigint::float AS righe
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY 2 DESC`);
}
