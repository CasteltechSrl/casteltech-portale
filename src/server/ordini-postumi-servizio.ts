/**
 * Ordini contro fatturato (letture) e creazione degli ordini postumi (Adriano 9/11/2026). Regole in engine/ordini-postumi.ts.
 */
import { q, transazione } from './db.js';
import { eServizio } from '../engine/ordini.js';
import {
  PRIMO_NUMERO_POSTUMO, confrontaOrdiniFatture, fattureDaCoprire, notaPostumo, riepilogoMesi,
  type EsitoFattura, type FatturaConfronto, type RigaFatturaConfronto, type RigaOrdineConfronto,
} from '../engine/ordini-postumi.js';

const iso = (d: unknown) => (d == null ? null : typeof d === 'string' ? d.slice(0, 10) : (d as Date).toISOString().slice(0, 10));
const normale = (s: unknown) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Fatture emesse (non bozze, annullate, scartate) dal 1° gennaio dell'anno prima, con le righe e i collegamenti agli ordini. */
async function fattureDaConfrontare(anno: number): Promise<FatturaConfronto[]> {
  const fatture = await q(`
    SELECT d.id, d.anno, d.numero, d.data, d.cliente_id, coalesce(c.ragione_sociale, d.intestatario->>'denominazione', d.intestatario->>'nome', '') AS cliente
    FROM documenti d LEFT JOIN clienti c ON c.id = d.cliente_id
    WHERE d.tipo = 'fattura' AND d.numero IS NOT NULL AND d.stato NOT IN ('bozza', 'annullato', 'scartato') AND d.data >= $1::date`, [`${anno - 1}-01-01`]);
  if (!fatture.length) return [];
  // righe dell'import da Fatture in Cloud (incrocio con gli ordini): valgono per le fatture che ci sono
  const importate = await q(`SELECT anno, numero, id, codice, descrizione, quantita, imponibile, riga_id FROM fatture_righe
    WHERE NOT intestazione AND anno >= $1 ORDER BY id`, [anno - 1]);
  const perImport = new Map<string, RigaFatturaConfronto[]>();
  for (const r of importate) {
    const k = `${r.anno}|${r.numero}`;
    (perImport.get(k) ?? perImport.set(k, []).get(k)!).push({ chiave: `I${r.id}`, codice: r.codice, descrizione: r.descrizione,
      quantita: Number(r.quantita), valore: Number(r.imponibile), rigaOrdineId: r.riga_id });
  }
  const ids = fatture.map(f => f.id);
  const righe = await q(`SELECT id, documento_id, codice, descrizione, quantita, prodotto_id, riga_ordine_id,
      round(quantita * prezzo * (1 - coalesce(sconto, 0) / 100), 2)::float AS valore
    FROM documenti_righe WHERE documento_id = ANY($1) AND NOT solo_descrizione ORDER BY documento_id, posizione, id`, [ids]);
  // righe dei DDT fatturati che sono collegate a una riga d'ordine (DDT fatti dall'ordine, DDT dell'import)
  const ddt = await q(`
    SELECT d.fattura_id, r.codice, r.descrizione, r.riga_ordine_id FROM documenti d JOIN documenti_righe r ON r.documento_id = d.id
    WHERE d.tipo = 'ddt' AND d.fattura_id = ANY($1) AND r.riga_ordine_id IS NOT NULL
    UNION ALL
    SELECT d.fattura_id, x.codice, x.descrizione, x.riga_id FROM documenti d JOIN ddt_righe x ON x.anno = d.anno AND x.numero = d.numero
    WHERE d.tipo = 'ddt' AND d.fattura_id = ANY($1) AND x.riga_id IS NOT NULL`, [ids]);
  const perFattura = new Map<number, RigaFatturaConfronto[]>();
  for (const r of righe) (perFattura.get(r.documento_id) ?? perFattura.set(r.documento_id, []).get(r.documento_id)!).push({
    chiave: `R${r.id}`, codice: r.codice, descrizione: r.descrizione, quantita: Number(r.quantita), valore: Number(r.valore),
    prodottoId: r.prodotto_id, rigaOrdineId: r.riga_ordine_id });
  return fatture.map(f => {
    const daImport = perImport.get(`${f.anno}|${f.numero}`);
    const proprie = perFattura.get(f.id) ?? [];
    const collegate = ddt.filter(x => x.fattura_id === f.id);
    const elenco = daImport ?? proprie.map(r => {
      if (r.rigaOrdineId != null) return r;
      const c = normale(r.codice), d = normale(r.descrizione);
      const via = collegate.find(x => (c && normale(x.codice) === c) || (d && normale(x.descrizione) === d));
      return via ? { ...r, rigaOrdineId: via.riga_ordine_id } : r;
    });
    // prodotto per le righe dell'import: lo stesso codice nella fattura del portale
    if (daImport) for (const r of elenco) r.prodottoId = proprie.find(p => p.prodottoId && normale(p.codice) === normale(r.codice))?.prodottoId ?? null;
    return { id: f.id, anno: f.anno, numero: f.numero, data: iso(f.data)!, clienteId: f.cliente_id, cliente: f.cliente, righe: elenco };
  });
}

async function righeOrdiniConfronto(anno: number): Promise<RigaOrdineConfronto[]> {
  const righe = await q(`
    SELECT r.id, r.ordine_id, o.cliente_id, o.data_ordine, r.codice, r.codice_cliente, r.descrizione, r.quantita, r.stato_manuale, o.fattura_id,
      (r.quantita * r.prezzo)::float AS valore
    FROM ordini_righe r JOIN ordini o ON o.id = r.ordine_id WHERE o.anno >= $1`, [anno - 2]);
  return righe.map(r => ({
    id: r.id, ordineId: r.ordine_id, clienteId: r.cliente_id, dataOrdine: iso(r.data_ordine), codici: [r.codice, r.codice_cliente],
    descrizione: r.descrizione, quantita: Number(r.quantita), annullata: r.stato_manuale === 'annullato', postumoFatturaId: r.fattura_id, valore: Number(r.valore),
  }));
}

/** Confronto dell'anno: esiti per fattura e riepilogo per mese (con l'ordinato del mese, ordini postumi esclusi). */
export async function confrontoOrdiniFatturato(anno: number) {
  const [ordini, fatture, ordinato] = await Promise.all([
    righeOrdiniConfronto(anno), fattureDaConfrontare(anno),
    q(`SELECT to_char(o.data_ordine, 'YYYY-MM') AS mese, count(DISTINCT o.id)::int AS ordini,
        coalesce(sum(r.quantita * r.prezzo) FILTER (WHERE coalesce(r.stato_manuale, '') <> 'annullato'), 0)::float AS valore
      FROM ordini o LEFT JOIN ordini_righe r ON r.ordine_id = o.id
      WHERE o.origine <> 'postumo' AND o.data_ordine >= $1::date AND o.data_ordine < $2::date GROUP BY 1`, [`${anno}-01-01`, `${anno + 1}-01-01`]),
  ]);
  const esiti = confrontaOrdiniFatture(ordini, fatture).filter(e => e.fattura.anno === anno);
  const mesi = riepilogoMesi(esiti, Object.fromEntries(ordinato.map(o => [o.mese, { valore: o.valore, ordini: o.ordini }])), anno);
  return { anno, esiti, mesi };
}

/**
 * Crea un ordine postumo per ogni fattura dell'anno con righe senza ordine (oltre 1 €): numero 8001…, data = data della fattura,
 * righe = quantità non coperta al prezzo della fattura, già evase. Rifacendolo non crea doppioni (la fattura ha già il suo postumo).
 */
export async function creaOrdiniPostumi(anno: number, oggi: string, soloFatture?: number[]) {
  const { esiti } = await confrontoOrdiniFatturato(anno);
  const daFare = fattureDaCoprire(esiti).filter(e => !soloFatture || soloFatture.includes(e.fattura.numero));
  return transazione(async c => {
    const creati: { ordine: number; fattura: number; cliente: string; valore: number }[] = [];
    let numero = Math.max(PRIMO_NUMERO_POSTUMO - 1, Number((await c.query(
      `SELECT max(numero) AS n FROM ordini WHERE anno = $1 AND numero BETWEEN $2 AND $3`, [anno, PRIMO_NUMERO_POSTUMO, PRIMO_NUMERO_POSTUMO + 998])).rows[0].n ?? 0));
    for (const e of daFare) {
      const f = e.fattura;
      if ((await c.query(`SELECT 1 FROM ordini WHERE fattura_id = $1`, [f.id])).rowCount) continue;   // creato nel frattempo
      numero++;
      const { id: ordineId } = (await c.query(`
        INSERT INTO ordini (anno, numero, data_ordine, cliente_id, cliente_nome, rif_cliente, origine, note, fattura_id)
        VALUES ($1, $2, $3, $4, $5, $6, 'postumo', $7, $8) RETURNING id`,
        [anno, numero, f.data, f.clienteId, f.cliente.toUpperCase() || '—', `POSTUMO FT ${f.numero}/${f.anno}`, notaPostumo(f, oggi), f.id])).rows[0];
      for (const [i, r] of e.scoperte.entries()) {
        let prodottoId = r.prodottoId ?? null;
        if (!prodottoId && r.codice && f.clienteId) prodottoId = (await c.query(`SELECT id FROM prodotti WHERE cliente_id = $1
          AND regexp_replace(upper(codice), '[^A-Z0-9]', '', 'g') = $2 LIMIT 1`, [f.clienteId, normale(r.codice)])).rows[0]?.id ?? null;
        await c.query(`
          INSERT INTO ordini_righe (ordine_id, chiave, posizione, prodotto_id, codice, descrizione, tipo, quantita, prezzo, consegna_richiesta,
            quantita_spedita, importo_fatturato, stato_manuale, note)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $8, $11, 'evaso', 'Riga postuma: copre la fattura')`,
          [ordineId, `POSTUMO-${f.id}-${i + 1}`, i, prodottoId, r.codice || null, r.descrizione || null,
            eServizio(r.codice, r.descrizione) ? 'servizio' : 'scheda', r.quantitaScoperta, r.prezzo, f.data, r.valoreScoperto]);
      }
      creati.push({ ordine: numero, fattura: f.numero, cliente: f.cliente, valore: e.scoperto });
    }
    return creati;
  });
}

export type { EsitoFattura };
