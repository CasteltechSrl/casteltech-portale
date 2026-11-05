/**
 * Letture per l'analisi dei prodotti e la visione d'insieme dei clienti (regole in engine/analisi-prodotti.ts).
 * Tutto lo storico (anche Fatture in Cloud dal 2019) si legge una volta sola all'apertura della pagina: niente controlli periodici (Neon).
 */
import { q, q1 } from './db.js';
import { calcola, datiDaRiga, leggiPreventivo } from './preventivi-servizio.js';
import { fasiCommessa, rilevazioniCommessa } from './commesse-servizio.js';
import { tempiRealiPerFase } from '../engine/consuntivo.js';
import { marginePreventivo } from '../engine/analisi.js';
import { consuntivoLotto, type ConsuntivoLotto, type FatturaCliente, type RigaVenditaProdotto } from '../engine/analisi-prodotti.js';

export const NOME_CLIENTE_SQL = `coalesce(c.ragione_sociale, d.intestatario->>'ragione_sociale', d.intestatario->>'nome', '(senza nome)')`;
const CHIAVE_CLIENTE_SQL = `CASE WHEN d.cliente_id IS NOT NULL THEN 'c' || d.cliente_id ELSE 'n:' || upper(${NOME_CLIENTE_SQL}) END`;
const STATI_OK = `d.stato NOT IN ('bozza', 'annullato', 'scartato')`;

/** Righe di fatture, note di credito e DDT con un codice prodotto, di tutti gli anni. */
export function righeVendite(): Promise<RigaVenditaProdotto[]> {
  return q<RigaVenditaProdotto>(`SELECT d.tipo, d.id AS "documentoId", d.anno, to_char(d.data, 'YYYY-MM-DD') AS data,
      ${CHIAVE_CLIENTE_SQL} AS "clienteChiave", d.cliente_id AS "clienteId", ${NOME_CLIENTE_SQL} AS cliente,
      r.codice, r.descrizione, p.descrizione AS "descrizioneAnagrafica", r.prodotto_id AS "prodottoId", r.quantita::float AS quantita,
      CASE WHEN d.tipo = 'ddt' THEN 0 ELSE round(r.quantita * r.prezzo * (1 - coalesce(r.sconto, 0) / 100), 2)::float END AS importo,
      d.dati_trasporto->>'causale' AS causale, r.ddt_id AS "ddtId",
      (d.tipo = 'fattura' AND EXISTS (SELECT 1 FROM documenti_righe x WHERE x.documento_id = d.id AND x.solo_descrizione AND x.descrizione ~* '^\\s*DDT')) AS "citaDdt"
    FROM documenti_righe r JOIN documenti d ON d.id = r.documento_id LEFT JOIN clienti c ON c.id = d.cliente_id LEFT JOIN prodotti p ON p.id = r.prodotto_id
    WHERE d.tipo IN ('fattura', 'nota_credito', 'ddt') AND ${STATI_OK} AND d.numero IS NOT NULL AND NOT r.solo_descrizione
      AND coalesce(trim(r.codice), '') <> '' AND r.acconto_id IS NULL
    ORDER BY d.data, d.id, r.posizione`);
}

/** Fatture e note di credito emesse di tutti gli anni (imponibile del documento). */
export function fattureTutte(): Promise<FatturaCliente[]> {
  return q<FatturaCliente>(`SELECT ${CHIAVE_CLIENTE_SQL} AS "clienteChiave", ${NOME_CLIENTE_SQL} AS cliente, d.tipo, d.anno, to_char(d.data, 'YYYY-MM-DD') AS data, d.imponibile::float AS imponibile
    FROM documenti d LEFT JOIN clienti c ON c.id = d.cliente_id
    WHERE d.tipo IN ('fattura', 'nota_credito') AND ${STATI_OK} AND d.numero IS NOT NULL ORDER BY d.data`);
}

/** DDT emessi degli ultimi anni (data e causale): servono per l'ultima consegna di ogni cliente. */
export function consegneClienti(dalAnno: number): Promise<{ clienteChiave: string; data: string; causale: string | null }[]> {
  return q(`SELECT ${CHIAVE_CLIENTE_SQL} AS "clienteChiave", to_char(d.data, 'YYYY-MM-DD') AS data, d.dati_trasporto->>'causale' AS causale
    FROM documenti d LEFT JOIN clienti c ON c.id = d.cliente_id
    WHERE d.tipo = 'ddt' AND ${STATI_OK} AND d.numero IS NOT NULL AND d.anno >= $1`, [dalAnno]);
}

/** Scaduto ed esposizione per nome del cliente (rate aperte di fatture, note di credito aperte in negativo). */
export async function creditiPerCliente(oggi: string): Promise<Map<string, { scaduto: number; esposizione: number }>> {
  const righe = await q<{ cliente: string; scaduto: number; esposizione: number }>(`SELECT ${NOME_CLIENTE_SQL} AS cliente,
      sum(CASE WHEN s.data < $1 THEN s.importo * (CASE WHEN d.tipo = 'nota_credito' THEN -1 ELSE 1 END) ELSE 0 END)::float AS scaduto,
      sum(s.importo * (CASE WHEN d.tipo = 'nota_credito' THEN -1 ELSE 1 END))::float AS esposizione
    FROM documenti_scadenze s JOIN documenti d ON d.id = s.documento_id LEFT JOIN clienti c ON c.id = d.cliente_id
    WHERE d.tipo IN ('fattura', 'nota_credito') AND ${STATI_OK} AND s.pagata_il IS NULL GROUP BY 1`, [oggi]);
  return new Map(righe.map(r => [r.cliente, { scaduto: r.scaduto, esposizione: r.esposizione }]));
}

/** Clienti con vendite (per il filtro della classifica): chiave, nome, id. */
export function clientiConVendite(): Promise<{ chiave: string; nome: string; id: number | null }[]> {
  return q(`SELECT DISTINCT ${CHIAVE_CLIENTE_SQL} AS chiave, ${NOME_CLIENTE_SQL} AS nome, d.cliente_id AS id
    FROM documenti d LEFT JOIN clienti c ON c.id = d.cliente_id
    WHERE d.tipo IN ('fattura', 'ddt') AND ${STATI_OK} AND d.numero IS NOT NULL ORDER BY 2`);
}

/** Id del prodotto in anagrafica per cliente e codice (le righe dello storico non sempre sono collegate). */
export async function prodottoDaCodice(clienteId: number | null, codice: string): Promise<number | null> {
  if (!clienteId) return null;
  const r = await q1<{ id: number }>(`SELECT id FROM prodotti WHERE cliente_id = $1 AND upper(codice) = upper($2) LIMIT 1`, [clienteId, codice]);
  return r?.id ?? null;
}

export interface PreventivoScheda { id: number; numero: string; stato: string; data: string; nSchede: number; prezzoScheda: number | null; marginePct: number | null }
/** Preventivi del prodotto (dal più recente): prezzo a scheda e margine dei lotti successivi. */
export async function preventiviProdotto(prodottoId: number): Promise<PreventivoScheda[]> {
  const righe = await q<{ id: number; numero: string; stato: string; data: string; n_schede: number; totali: any }>(`SELECT p.id, p.numero, p.stato,
      to_char(p.creato_il, 'YYYY-MM-DD') AS data, p.n_schede, p.risultato->'totali' AS totali
    FROM preventivi p JOIN prodotti_revisioni r ON r.id = p.revisione_id WHERE r.prodotto_id = $1 AND p.stato <> 'rifiutato'
    ORDER BY p.creato_il DESC LIMIT 12`, [prodottoId]);
  return righe.map(p => ({ id: p.id, numero: p.numero, stato: p.stato, data: p.data, nSchede: p.n_schede,
    prezzoScheda: Number(p.totali?.prezzoSchedaSecondoLotto) > 0 ? Number(p.totali.prezzoSchedaSecondoLotto) : null, marginePct: marginePreventivo(p.totali) }));
}

export interface CommessaScheda { id: number; numero: string; stato: string; data: string | null; quantita: number; primoLotto: boolean; consuntivo: ConsuntivoLotto | null }
/**
 * Commesse del prodotto con il consuntivo (Adriano 5/11/2026: "margine con il confronto preventivo/consuntivo dove ci sono i dati di produzione"):
 * fasi previste della scheda contro i tempi registrati, voci e prezzo del lotto dal preventivo ricalcolato sulla quantità
 * (prezzo venduto se scritto sulla commessa). Al massimo le ultime `quante` commesse: ogni commessa sono tre letture.
 */
export async function commesseProdotto(prodottoId: number, quante = 12): Promise<CommessaScheda[]> {
  const commesse = await q(`SELECT c.*, r.prodotto_id FROM commesse c JOIN prodotti_revisioni r ON r.id = c.revisione_id
    WHERE r.prodotto_id = $1 ORDER BY c.creato_il DESC LIMIT $2`, [prodottoId, quante]);
  const out: CommessaScheda[] = [];
  for (const c of commesse) {
    const base = { id: c.id, numero: c.numero, stato: c.stato, data: c.data_consegna ? String(c.data_consegna).slice(0, 10) : (c.creato_il ? new Date(c.creato_il).toISOString().slice(0, 10) : null),
      quantita: Number(c.quantita), primoLotto: !!c.primo_lotto };
    if (!c.preventivo_id) { out.push({ ...base, consuntivo: null }); continue; }
    try {
      const [prev, fasi, rilevazioni] = await Promise.all([leggiPreventivo(c.preventivo_id), fasiCommessa(c), rilevazioniCommessa(c.id)]);
      if (!prev?.catalogo) { out.push({ ...base, consuntivo: null }); continue; }
      const ris = calcola(prev.catalogo, { ...datiDaRiga(prev), nSchede: base.quantita });
      const prezzoLotto = c.prezzo_venduto != null && Number(c.prezzo_venduto) > 0 ? Number(c.prezzo_venduto) * base.quantita
        : base.primoLotto ? ris.totali.totalePrimoLotto : ris.totali.totaleSecondoLotto;
      const costoVoci = ris.voci.filter(v => base.primoLotto || !v.unaTantum).reduce((t, v) => t + v.costo, 0);
      const consuntivo = consuntivoLotto({ prezzoLotto, costoVoci, tariffe: prev.tariffe, reali: tempiRealiPerFase(rilevazioni),
        fasi: fasi.map(f => ({ codice: f.codice, cicloPrevSec: f.cicloSec, uomoPrevSec: f.uomoSec, tariffa: f.tariffa })) });
      out.push({ ...base, consuntivo });
    } catch { out.push({ ...base, consuntivo: null }); }
  }
  return out;
}

/** Ordini del portale per anno per il prodotto (dal 2025 in poi: prima non ci sono). */
export async function ordiniProdottoPerAnno(prodottoId: number | null, clienteId: number | null, codice: string): Promise<Record<number, number>> {
  const righe = await q<{ anno: number; n: number }>(`SELECT o.anno, count(DISTINCT o.id)::int AS n FROM ordini_righe r JOIN ordini o ON o.id = r.ordine_id
    WHERE ((r.prodotto_id IS NOT NULL AND r.prodotto_id = $1) OR (o.cliente_id IS NOT NULL AND o.cliente_id = $2 AND upper(trim(r.codice)) = upper($3)))
      AND coalesce(r.stato_manuale, '') <> 'annullato' GROUP BY 1`, [prodottoId ?? -1, clienteId ?? -1, codice]);
  return Object.fromEntries(righe.map(r => [r.anno, r.n]));
}
