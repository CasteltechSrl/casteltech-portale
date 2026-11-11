/**
 * Letture per Analisi → Costi per categoria (regole in engine/analisi-costi.ts): righe delle fatture dei fornitori
 * (tabella documenti_ricevuti_righe, caricata dagli XML e dallo SdI) + fatture senza righe (solo PDF: prese intere),
 * regole scritte dall'ufficio, venduto per prodotto, materiale dei preventivi, lamine fatturate, ricavi.
 * Tutto letto all'apertura della pagina, niente controlli periodici (Neon).
 */
import { q, q1 } from './db.js';
import { riepilogo } from '../engine/riepilogo.js';
import { chiaveFornitore, type LamineVendute, type MaterialePreventivo, type RegolaCategoria, type RigaCosto, type RigaVendita } from '../engine/analisi-costi.js';
import { SQL_FATTORE_RIGHE, SQL_NON_DOPPIONE, sqlPartitaFinanziaria } from '../engine/costo-fornitori.js';
import { categoria as categoriaDaCodice } from '../engine/categorie-acquisti.js';

const NOME_FORNITORE = `coalesce(f.ragione_sociale, d.intestatario->>'nome', d.intestatario->>'ragione_sociale', '(senza nome)')`;
const CHIAVE_FORNITORE = `CASE WHEN d.fornitore_id IS NOT NULL THEN 'f' || d.fornitore_id ELSE 'n:' || upper(${NOME_FORNITORE}) END`;
const SEGNO = `CASE WHEN d.tipo = 'nota_credito' THEN -1 ELSE 1 END`;
const NOME_CLIENTE = `coalesce(c.ragione_sociale, d.intestatario->>'ragione_sociale', d.intestatario->>'nome', '(senza nome)')`;
const STATI_OK = `d.stato NOT IN ('bozza', 'annullato', 'scartato')`;

/** La tabella delle righe esiste solo dopo la migrazione del lavoro "storico acquisti riga per riga": senza, si leggono le fatture intere. */
export async function tabellaRigheEsiste(): Promise<boolean> {
  const r = await q1<{ c: string | null }>(`SELECT to_regclass('documenti_ricevuti_righe')::text AS c`);
  return !!r?.c;
}

/** Righe delle fatture dei fornitori degli anni chiesti; le fatture senza righe lette entrano intere (rigaId null). */
export async function righeCosti(anni: number[]): Promise<RigaCosto[]> {
  const conRighe = await tabellaRigheEsiste();
  const intere = q<RigaCosto>(`SELECT NULL::int AS "rigaId", d.id AS "documentoId", to_char(d.data, 'YYYY-MM-DD') AS data, ${NOME_FORNITORE} AS fornitore,
      ${CHIAVE_FORNITORE} AS "fornitoreChiave", coalesce(d.descrizione, '') AS descrizione, ARRAY[]::text[] AS codici,
      (${SEGNO} * d.imponibile)::float AS importo, d.categoria AS "categoriaFic"
    FROM documenti_ricevuti d LEFT JOIN fornitori_anagrafica f ON f.id = d.fornitore_id
    WHERE extract(year FROM d.data)::int = ANY($1::int[]) AND ${SQL_NON_DOPPIONE}${conRighe ? ` AND NOT EXISTS (SELECT 1 FROM documenti_ricevuti_righe r WHERE r.documento_id = d.id)` : ''}`, [anni]);
  if (!conRighe) return intere;
  const righe = q<RigaCosto>(`SELECT r.id AS "rigaId", d.id AS "documentoId", to_char(d.data, 'YYYY-MM-DD') AS data, ${NOME_FORNITORE} AS fornitore,
      ${CHIAVE_FORNITORE} AS "fornitoreChiave", coalesce(r.descrizione, '') AS descrizione, array_remove(ARRAY[r.codice, r.pn], NULL) AS codici,
      (${SQL_FATTORE_RIGHE} * coalesce(r.imponibile, 0))::float AS importo, d.categoria AS "categoriaFic"
    FROM documenti_ricevuti_righe r JOIN documenti_ricevuti d ON d.id = r.documento_id LEFT JOIN fornitori_anagrafica f ON f.id = d.fornitore_id
    WHERE extract(year FROM d.data)::int = ANY($1::int[]) AND ${SQL_NON_DOPPIONE} AND NOT ${sqlPartitaFinanziaria('r')}`, [anni]);
  const [a, b, c] = await Promise.all([righe, intere, righeAutofatture(anni)]);
  return [...a, ...b, ...c];
}

/**
 * Acquisti dai fornitori esteri (Mouser, DigiKey, Alantys…): la loro fattura entra nel portale come AUTOFATTURA (TD17/18/19), non tra le
 * fatture dei fornitori (Adriano 11/11/2026, "rivendita di componenti e PCB": nel 2026 mancavano circa 41.000 € di componenti). Le righe
 * dell'autofattura sono le righe della fattura estera in euro. Non si contano due volte: fuori le autofatture la cui fattura del fornitore
 * è già tra le ricevute (`ricevuto_id`, caricate dal portale) e quelle di cui Fatture in Cloud teneva la copia ricevuta ("12AF", fino al 2025).
 * Gli id sono NEGATIVI (riga e documento dell'autofattura), così le regole scritte a mano per riga o per documento non si confondono con le ricevute.
 */
export function righeAutofatture(anni: number[]): Promise<RigaCosto[]> {
  return q<RigaCosto>(`SELECT -r.id AS "rigaId", -d.id AS "documentoId", to_char(d.data, 'YYYY-MM-DD') AS data, ${NOME_FORNITORE} AS fornitore,
      ${CHIAVE_FORNITORE} AS "fornitoreChiave", coalesce(r.descrizione, '') AS descrizione, array_remove(ARRAY[nullif(trim(r.codice), '')], NULL) AS codici,
      round(r.quantita * r.prezzo * (1 - coalesce(r.sconto, 0) / 100), 2)::float AS importo, CASE WHEN d.tipo_sdi = 'TD17' THEN NULL ELSE 'B6_Materie prime c/acquisti' END AS "categoriaFic"
    FROM documenti_righe r JOIN documenti d ON d.id = r.documento_id LEFT JOIN fornitori_anagrafica f ON f.id = d.fornitore_id
    WHERE d.tipo = 'autofattura' AND ${STATI_OK} AND d.numero IS NOT NULL AND NOT r.solo_descrizione AND d.ricevuto_id IS NULL
      AND extract(year FROM d.data)::int = ANY($1::int[])
      AND NOT EXISTS (SELECT 1 FROM documenti_ricevuti x WHERE x.numero = d.numero::text || 'AF' AND extract(year FROM x.data) = extract(year FROM d.data))`, [anni]);
}

/** Quante fatture hanno le righe lette e quante no (per dire da dove vengono i numeri). */
export async function copertureRighe(anni: number[]): Promise<{ conRighe: number; senzaRighe: number }> {
  if (!(await tabellaRigheEsiste())) {
    const r = await q1<{ n: string }>(`SELECT count(*) AS n FROM documenti_ricevuti d WHERE extract(year FROM d.data)::int = ANY($1::int[])`, [anni]);
    return { conRighe: 0, senzaRighe: Number(r?.n ?? 0) };
  }
  const r = await q1<{ con: string; senza: string }>(`SELECT count(*) FILTER (WHERE EXISTS (SELECT 1 FROM documenti_ricevuti_righe r WHERE r.documento_id = d.id)) AS con,
      count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM documenti_ricevuti_righe r WHERE r.documento_id = d.id)) AS senza
    FROM documenti_ricevuti d WHERE extract(year FROM d.data)::int = ANY($1::int[])`, [anni]);
  return { conRighe: Number(r?.con ?? 0), senzaRighe: Number(r?.senza ?? 0) };
}

export const regoleCategorie = () => q<RegolaCategoria>(`SELECT tipo, chiave, categoria FROM categorie_acquisti_regole`);

/** Scrive (o toglie, con categoria vuota) una regola dell'ufficio. La chiave del fornitore è il nome in maiuscolo. */
export async function salvaRegola(tipo: RegolaCategoria['tipo'], chiave: string, categoria: string): Promise<string> {
  const k = tipo === 'fornitore' ? chiaveFornitore(chiave) : String(Number(chiave) || '');
  if (!k) return 'Manca la chiave della regola.';
  if (!categoria) { await q(`DELETE FROM categorie_acquisti_regole WHERE tipo = $1 AND chiave = $2`, [tipo, k]); return 'Regola tolta: la riga torna alla categoria automatica.'; }
  if (categoriaDaCodice(categoria).codice !== categoria) return 'Categoria sconosciuta.';
  await q(`INSERT INTO categorie_acquisti_regole (tipo, chiave, categoria) VALUES ($1, $2, $3) ON CONFLICT (tipo, chiave) DO UPDATE SET categoria = EXCLUDED.categoria`, [tipo, k, categoria]);
  return tipo === 'fornitore' ? `Fatto: tutte le fatture di ${k} vanno in "${categoriaDaCodice(categoria).nome}".` : `Fatto: categoria "${categoriaDaCodice(categoria).nome}" scritta.`;
}

/** `finoA` (MM-GG): per confrontare un anno in corso con gli anni prima sugli stessi mesi, gli anni passati si fermano a quel giorno. */
const STESSO_PERIODO = `AND (extract(year FROM d.data)::int = $2::int OR $3::text = '' OR to_char(d.data, 'MM-DD') <= $3::text)`;

/** Ogni riga venduta (fatture e note di credito emesse, anche storico FIC), con il segno: la classificano `classificaVendite`. */
export function righeVenditeRivendita(anni: number[], finoA = ''): Promise<RigaVendita[]> {
  return q<RigaVendita>(`SELECT extract(year FROM d.data)::int AS anno, d.cliente_id AS "clienteId", ${NOME_CLIENTE} AS cliente, upper(trim(coalesce(r.codice, ''))) AS codice,
      coalesce(r.descrizione, '') AS descrizione, (${SEGNO} * round(r.quantita * r.prezzo * (1 - coalesce(r.sconto, 0) / 100), 2))::float AS importo, (r.acconto_id IS NOT NULL) AS acconto
    FROM documenti_righe r JOIN documenti d ON d.id = r.documento_id LEFT JOIN clienti c ON c.id = d.cliente_id
    WHERE d.tipo IN ('fattura', 'nota_credito') AND ${STATI_OK} AND d.numero IS NOT NULL AND NOT r.solo_descrizione AND r.quantita * r.prezzo <> 0
      AND extract(year FROM d.data)::int = ANY($1::int[]) ${STESSO_PERIODO}`, [anni, anni[0], finoA]);
}

/** Per ogni prodotto con un preventivo: si vendono componenti o PCB (preventivo più recente, accettati prima)? Si usa solo il sì/no, non i prezzi. */
export async function materialeDeiPreventivi(): Promise<MaterialePreventivo[]> {
  const righe = await q<{ codice: string; clienteId: number | null; risultato: any }>(`SELECT DISTINCT ON (p.id) upper(p.codice) AS codice, p.cliente_id AS "clienteId", pr.risultato
    FROM preventivi pr JOIN prodotti_revisioni rv ON rv.id = pr.revisione_id JOIN prodotti p ON p.id = rv.prodotto_id
    WHERE pr.stato <> 'rifiutato' AND pr.risultato IS NOT NULL ORDER BY p.id, (pr.stato = 'accettato') DESC, pr.creato_il DESC`);
  const out: MaterialePreventivo[] = [];
  for (const r of righe) {
    try {
      const rp = riepilogo(r.risultato);
      out.push({ codice: r.codice, clienteId: r.clienteId, conMateriale: rp.venditaComponentiScheda + rp.venditaPcbScheda > 0 });
    } catch { /* preventivo con un risultato non leggibile: non conta */ }
  }
  return out;
}

/** Clienti che mandano il materiale (componenti in conto lavoro in anagrafica), chiave c<id>. */
export async function clientiContoLavoro(): Promise<Set<string>> {
  const r = await q<{ id: number }>(`SELECT DISTINCT cliente_id AS id FROM componenti_clienti WHERE cliente_id IS NOT NULL`);
  return new Set(r.map(x => `c${x.id}`));
}

/** Lamine fatturate ai clienti per anno: codice UT-LAMINA o righe "lamina"/"stencil" (storico FIC). */
export function lamineVendute(anni: number[], finoA = ''): Promise<LamineVendute[]> {
  return q<LamineVendute>(`SELECT extract(year FROM d.data)::int AS anno, sum(${SEGNO} * r.quantita)::float AS pezzi,
      sum(${SEGNO} * round(r.quantita * r.prezzo * (1 - coalesce(r.sconto, 0) / 100), 2))::float AS importo
    FROM documenti_righe r JOIN documenti d ON d.id = r.documento_id
    WHERE d.tipo IN ('fattura', 'nota_credito') AND ${STATI_OK} AND d.numero IS NOT NULL AND NOT r.solo_descrizione AND r.acconto_id IS NULL
      AND (upper(trim(r.codice)) = 'UT-LAMINA' OR split_part(coalesce(r.descrizione, ''), E'\\n', 1) ~* '\\m(LAMIN[AE]|STENCIL)\\M')
      AND extract(year FROM d.data)::int = ANY($1::int[]) ${STESSO_PERIODO} GROUP BY 1`, [anni, anni[0], finoA]);
}

/** Fatturato (imponibile di fatture meno note di credito) per anno. */
export async function ricaviPerAnno(anni: number[], finoA = ''): Promise<Record<number, number>> {
  const righe = await q<{ anno: number; importo: number }>(`SELECT extract(year FROM d.data)::int AS anno, sum(${SEGNO} * d.imponibile)::float AS importo
    FROM documenti d WHERE d.tipo IN ('fattura', 'nota_credito') AND ${STATI_OK} AND d.numero IS NOT NULL AND extract(year FROM d.data)::int = ANY($1::int[]) ${STESSO_PERIODO} GROUP BY 1`, [anni, anni[0], finoA]);
  return Object.fromEntries(righe.map(r => [r.anno, r.importo]));
}
