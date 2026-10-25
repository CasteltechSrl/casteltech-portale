/**
 * Ordini dei clienti nel database: import (ordini, DDT e fatture preparati dall'incrocio con Fatture in Cloud),
 * lettura delle righe con stato e date, tempi dal preventivo per il Gantt.
 */
import { gunzipSync } from 'node:zlib';
import { q, transazione } from './db.js';
import { maiuscolo, risolvi } from './anagrafiche-servizio.js';
import { dateRiga, residuo, statoRiga, type RigaOrdine, type StatoRiga } from '../engine/ordini.js';

/**
 * File di import: un anno di ordini con le loro righe, più DDT e fatture dello stesso anno.
 * Un ordine può avere un suo "anno" (es. ordini dell'anno prima ancora fatturati) e una riga uno "stato" iniziale
 * (es. evaso per gli ordini vecchi di cui non si hanno i DDT): lo stato scritto dall'ufficio nel portale resta.
 */
export interface FileOrdini {
  anno: number;
  ordini: {
    anno?: number; numero: number; data?: string | null; cliente: string; rif_cliente?: string | null; data_ordine_cliente?: string | null;
    origine?: string; file?: string | null; note?: string | null;
    righe: {
      chiave: string; codice?: string | null; descrizione?: string | null; codice_cliente?: string | null; descrizione_cliente?: string | null;
      tipo?: 'scheda' | 'servizio'; quantita: number; prezzo?: number; consegna_richiesta?: string | null;
      quantita_spedita?: number; importo_fatturato?: number; note?: string | null; consegne?: { data: string; quantita: number }[];
      stato?: 'evaso' | 'da_evadere' | 'annullato' | null;
    }[];
  }[];
  ddt?: { numero: number; data: string; cliente: string; codice?: string | null; descrizione?: string | null; quantita?: number; imponibile?: number; riga?: string | null }[];
  fatture?: { numero: number; data: string; cliente: string; codice?: string | null; descrizione?: string | null; quantita?: number; imponibile?: number; ddt?: number | null; intestazione?: boolean; riga?: string | null }[];
}

const ORIGINI = ['fic', 'ordine_cliente', 'foglio', 'manuale', 'email'];
const dataValida = (d: unknown) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
const numero = (n: unknown) => (Number.isFinite(Number(n)) ? Number(n) : 0);

export function leggiFileOrdini(contenuto: Buffer): FileOrdini {
  const testo = contenuto[0] === 0x1f && contenuto[1] === 0x8b ? gunzipSync(contenuto).toString('utf8') : contenuto.toString('utf8');
  const f = JSON.parse(testo) as FileOrdini;
  if (!Number.isInteger(f.anno) || !Array.isArray(f.ordini)) throw new Error('mancano "anno" o "ordini"');
  return f;
}

/**
 * Import: gli ordini si aggiornano per numero (stesso anno), le righe per chiave. Gli ordini dell'anno importati prima
 * e non più nel file si tolgono (se senza commesse). Restano quelle scritte nel portale:
 * arrivo materiale, date a mano, ritardi, stato deciso dall'ufficio, commessa collegata, note.
 * DDT e fatture dell'anno si sostituiscono per intero. Clienti e prodotti si collegano solo se sono già in anagrafica.
 */
export async function importaOrdini(f: FileOrdini) {
  const annoDi = (o: FileOrdini['ordini'][number]) => (Number.isInteger(o.anno) ? o.anno! : f.anno);
  return transazione(async c => {
    const cache = new Map<string, Awaited<ReturnType<typeof risolvi>>>();
    const collega = async (cliente: string, codice?: string | null) => {
      const k = `${maiuscolo(cliente)}|${codice ?? ''}`;
      if (!cache.has(k)) cache.set(k, await risolvi(c, cliente, codice ?? ''));
      return cache.get(k)!;
    };
    const idRiga = new Map<string, number>();
    const clientiFuori = new Set<string>(), prodottiFuori = new Set<string>();
    let nRighe = 0;
    for (const o of f.ordini) {
      const cl = await collega(o.cliente);
      if (!cl.clienteId) clientiFuori.add(maiuscolo(o.cliente));
      const { id: ordineId } = (await c.query(`
        INSERT INTO ordini (anno, numero, data_ordine, cliente_id, cliente_nome, rif_cliente, data_ordine_cliente, origine, file, note)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (anno, numero) DO UPDATE SET data_ordine = EXCLUDED.data_ordine, cliente_id = EXCLUDED.cliente_id, cliente_nome = EXCLUDED.cliente_nome,
          rif_cliente = EXCLUDED.rif_cliente, data_ordine_cliente = EXCLUDED.data_ordine_cliente, origine = EXCLUDED.origine, file = EXCLUDED.file,
          note = coalesce(ordini.note, EXCLUDED.note), aggiornato_il = now()
        RETURNING id`, [annoDi(o), o.numero, dataValida(o.data), cl.clienteId, cl.clienteId ? cl.cliente : maiuscolo(o.cliente), o.rif_cliente || null,
        dataValida(o.data_ordine_cliente), ORIGINI.includes(String(o.origine)) ? o.origine : 'fic', o.file || null, o.note || null])).rows[0];
      const chiavi: string[] = [];
      for (const [i, r] of (o.righe ?? []).entries()) {
        const pr = r.tipo === 'servizio' || !r.codice ? null : await collega(o.cliente, r.codice);
        if (pr && !pr.prodottoId) prodottiFuori.add(`${maiuscolo(o.cliente)} · ${maiuscolo(r.codice)}`);
        const { id } = (await c.query(`
          INSERT INTO ordini_righe (ordine_id, chiave, posizione, prodotto_id, codice, descrizione, codice_cliente, descrizione_cliente, tipo,
            quantita, prezzo, consegna_richiesta, quantita_spedita, importo_fatturato, note, stato_manuale)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
          ON CONFLICT (ordine_id, chiave) DO UPDATE SET posizione = EXCLUDED.posizione, prodotto_id = EXCLUDED.prodotto_id, codice = EXCLUDED.codice,
            descrizione = EXCLUDED.descrizione, codice_cliente = EXCLUDED.codice_cliente, descrizione_cliente = EXCLUDED.descrizione_cliente, tipo = EXCLUDED.tipo,
            quantita = EXCLUDED.quantita, prezzo = EXCLUDED.prezzo, consegna_richiesta = EXCLUDED.consegna_richiesta,
            quantita_spedita = EXCLUDED.quantita_spedita, importo_fatturato = EXCLUDED.importo_fatturato, note = coalesce(ordini_righe.note, EXCLUDED.note)
          RETURNING id`, [ordineId, r.chiave, i, pr?.prodottoId ?? null, pr?.prodottoId ? pr.codice : maiuscolo(r.codice) || null,
          (pr?.prodottoId && pr.descrizione) || r.descrizione || null, r.codice_cliente || null, r.descrizione_cliente || null,
          r.tipo === 'servizio' ? 'servizio' : 'scheda', numero(r.quantita), numero(r.prezzo), dataValida(r.consegna_richiesta),
          numero(r.quantita_spedita), numero(r.importo_fatturato), r.note || null,
          ['evaso', 'da_evadere', 'annullato'].includes(String(r.stato)) ? r.stato : null])).rows[0];
        idRiga.set(r.chiave, id);
        chiavi.push(r.chiave);
        nRighe++;
        await c.query(`DELETE FROM ordini_consegne WHERE riga_id = $1`, [id]);
        for (const k of r.consegne ?? []) if (dataValida(k.data)) await c.query(`INSERT INTO ordini_consegne (riga_id, data, quantita) VALUES ($1,$2,$3)`, [id, k.data, numero(k.quantita)]);
      }
      // righe tolte dall'ordine (non collegate a commesse)
      await c.query(`DELETE FROM ordini_righe WHERE ordine_id = $1 AND NOT (chiave = ANY($2)) AND commessa_id IS NULL`, [ordineId, chiavi]);
    }
    // ordini importati negli anni passati ma tolti dal file (es. annullati): via, se non hanno commesse collegate.
    // Gli ordini scritti a mano o arrivati per email restano.
    let tolti = 0;
    for (const anno of new Set(f.ordini.map(annoDi).concat(f.anno))) {
      tolti += (await c.query(`DELETE FROM ordini o WHERE anno = $1 AND origine IN ('fic', 'ordine_cliente', 'foglio') AND NOT (numero = ANY($2))
        AND NOT EXISTS (SELECT 1 FROM ordini_righe r WHERE r.ordine_id = o.id AND r.commessa_id IS NOT NULL)`,
        [anno, f.ordini.filter(o => annoDi(o) === anno).map(o => o.numero)])).rowCount ?? 0;
    }
    await c.query(`DELETE FROM ddt_righe WHERE anno = $1`, [f.anno]);
    for (const d of f.ddt ?? []) {
      if (!dataValida(d.data)) continue;
      const cl = await collega(d.cliente);
      await c.query(`INSERT INTO ddt_righe (anno, numero, data, cliente_id, cliente_nome, codice, descrizione, quantita, imponibile, riga_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [f.anno, d.numero, d.data, cl.clienteId, cl.clienteId ? cl.cliente : maiuscolo(d.cliente), d.codice || null, d.descrizione || null, numero(d.quantita), numero(d.imponibile), d.riga ? idRiga.get(d.riga) ?? null : null]);
    }
    await c.query(`DELETE FROM fatture_righe WHERE anno = $1`, [f.anno]);
    for (const x of f.fatture ?? []) {
      if (!dataValida(x.data)) continue;
      const cl = await collega(x.cliente);
      await c.query(`INSERT INTO fatture_righe (anno, numero, data, cliente_id, cliente_nome, codice, descrizione, quantita, imponibile, ddt_numero, intestazione, riga_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [f.anno, x.numero, x.data, cl.clienteId, cl.clienteId ? cl.cliente : maiuscolo(x.cliente), x.codice || null, x.descrizione || null, numero(x.quantita), numero(x.imponibile),
          x.ddt ?? null, !!x.intestazione, x.riga ? idRiga.get(x.riga) ?? null : null]);
    }
    return {
      ordini: f.ordini.length, ordiniTolti: tolti, righe: nRighe, ddt: f.ddt?.length ?? 0, fatture: f.fatture?.length ?? 0,
      clientiNonInAnagrafica: [...clientiFuori].sort(), prodottiNonInAnagrafica: [...prodottiFuori].sort(),
    };
  });
}

// ───────────────────────────── lettura ─────────────────────────────
export interface RigaElenco extends RigaOrdine {
  numero: number; anno: number; dataOrdine: string | null; cliente: string; clienteId: number | null; rifCliente: string | null;
  codice: string | null; descrizione: string | null; codiceCliente: string | null; prodottoId: number | null; commessaId: number | null; note: string | null;
  stato: StatoRiga; lavorazione: string | null; prevista: string | null; ritardo: number | null; consegna: string | null;
  residuoQuantita: number; residuoValore: number;
}

/** Tutte le righe (o quelle di un ordine) con stato, date e residuo calcolati. */
export async function righeOrdini(ordineId?: number): Promise<RigaElenco[]> {
  const righe = await q(`
    SELECT r.*, o.numero, o.anno, o.data_ordine, o.cliente_nome, o.cliente_id, o.rif_cliente,
      coalesce((SELECT json_agg(json_build_object('data', k.data, 'quantita', k.quantita) ORDER BY k.data) FROM ordini_consegne k WHERE k.riga_id = r.id), '[]') AS consegne
    FROM ordini_righe r JOIN ordini o ON o.id = r.ordine_id
    WHERE $1::int IS NULL OR o.id = $1
    ORDER BY o.anno, o.numero, r.posizione, r.id`, [ordineId ?? null]);
  const base: RigaOrdine[] = righe.map(r => ({
    id: r.id, ordineId: r.ordine_id, tipo: r.tipo, quantita: r.quantita, prezzo: r.prezzo, quantitaSpedita: r.quantita_spedita,
    importoFatturato: r.importo_fatturato, statoManuale: r.stato_manuale, consegnaRichiesta: r.consegna_richiesta, arrivoMateriale: r.arrivo_materiale,
    dataLavorazione: r.data_lavorazione, ritardiProduzione: r.ritardi_produzione, consegnaPrevista: r.consegna_prevista, consegne: r.consegne,
  }));
  return base.map((b, i) => {
    const r = righe[i];
    const stato = statoRiga(b, base);
    const d = dateRiga(b);
    const res = residuo(b, stato);
    // con un programma di consegne vale la prossima consegna ancora da fare
    const prossima = b.consegne?.length && b.tipo === 'scheda' ? prossimaConsegna(b) : null;
    return {
      ...b, numero: r.numero, anno: r.anno, dataOrdine: r.data_ordine, cliente: r.cliente_nome, clienteId: r.cliente_id, rifCliente: r.rif_cliente,
      codice: r.codice, descrizione: r.descrizione, codiceCliente: r.codice_cliente, prodottoId: r.prodotto_id, commessaId: r.commessa_id, note: r.note,
      stato, lavorazione: d.lavorazione, prevista: d.prevista, ritardo: d.ritardo, consegna: prossima ?? d.consegna,
      residuoQuantita: res.quantita, residuoValore: res.valore,
    };
  });
}

function prossimaConsegna(r: RigaOrdine): string | null {
  let spedite = r.quantitaSpedita;
  for (const c of r.consegne ?? []) { if (spedite >= c.quantita) { spedite -= c.quantita; continue; } return c.data; }
  return null;
}

/** Tempo ciclo per scheda dall'ultimo preventivo di ogni prodotto (lotto successivo al primo, senza una tantum). */
export async function secondiPerSchedaProdotti(): Promise<Map<number, number>> {
  const righe = await q<{ prodotto_id: number; sec: number }>(`
    SELECT DISTINCT ON (pr.prodotto_id) pr.prodotto_id, (p.risultato->'totali'->>'secondiCicloSecondoLotto')::numeric / nullif(p.n_schede, 0) AS sec
    FROM preventivi p JOIN prodotti_revisioni pr ON pr.id = p.revisione_id
    WHERE p.stato <> 'rifiutato' AND (p.risultato->'totali'->>'secondiCicloSecondoLotto') IS NOT NULL
    ORDER BY pr.prodotto_id, p.creato_il DESC`);
  return new Map(righe.filter(r => r.sec > 0).map(r => [r.prodotto_id, Number(r.sec)]));
}

export async function caricaOreGiorno(): Promise<number> {
  const v = (await q(`SELECT valore FROM impostazioni WHERE chiave = 'pianificazione'`))[0]?.valore;
  const n = Number(v?.oreGiorno);
  return n > 0 && n <= 24 ? n : 8;
}
