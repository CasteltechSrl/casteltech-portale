/**
 * Anagrafiche clienti e prodotti.
 * Regola (Adriano, 23/10/2026): nei preventivi cliente, codice e descrizione si scelgono SOLO dalle anagrafiche;
 * tutto in MAIUSCOLO. I nomi scritti in modo diverso nei vecchi preventivi sono collegati tramite "alias".
 */
import type pg from 'pg';
import { q, transazione } from './db.js';

/** Maiuscolo e spazi singoli. */
export const maiuscolo = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
/** Chiave per confrontare codici: solo lettere e numeri ("SL_0067" = "sl-0067"). */
export const chiaveCodice = (s: unknown) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Toglie le quantità scritte nella descrizione ("50 PZ", "x 1000pz", "272"). */
export function pulisciDescrizione(s: unknown): string {
  let t = maiuscolo(s);
  t = t.replace(/\s*[-–]?\s*\bX?\s*\d+([.,]\d+)?\s*(PZ|PEZZI|PCS|PZ\.|SCHEDE)\.?\s*$/i, '');
  if (/^\d+([.,]\d+)?$/.test(t)) t = '';
  return t.trim();
}

type Db = Pick<pg.PoolClient, 'query'>;

export interface Risolto { clienteId: number | null; prodottoId: number | null; cliente: string; codice: string; descrizione: string | null }

/** Trova cliente e prodotto ufficiali partendo dai nomi scritti in un preventivo. */
export async function risolvi(c: Db, nomeCliente: string, codice: string): Promise<Risolto> {
  const nome = maiuscolo(nomeCliente);
  const cl = (await c.query(
    `SELECT id, ragione_sociale, 1 AS ordine FROM clienti WHERE upper(ragione_sociale) = $1
     UNION ALL SELECT c.id, c.ragione_sociale, 2 FROM alias_clienti a JOIN clienti c ON c.id = a.cliente_id WHERE a.nome = $1
     ORDER BY ordine LIMIT 1`, [nome])).rows[0];
  const k = chiaveCodice(codice);
  let pr: any;
  if (k) {
    pr = (await c.query(
      `SELECT p.id, p.codice, p.descrizione, 1 AS ordine FROM prodotti p
         WHERE regexp_replace(upper(p.codice), '[^A-Z0-9]', '', 'g') = $2 AND (p.cliente_id = $1 OR p.cliente_id IS NULL)
       UNION ALL SELECT p.id, p.codice, p.descrizione, 2 FROM alias_prodotti a JOIN prodotti p ON p.id = a.prodotto_id
         WHERE a.codice = $2 AND a.cliente_id = $1
       ORDER BY ordine LIMIT 1`, [cl?.id ?? -1, k])).rows[0];
    if (!pr && cl) {
      // alias registrato sotto un altro cliente (es. THE METER / OFFICINE IADR): solo se univoco
      const altri = (await c.query(`SELECT p.id, p.codice, p.descrizione FROM alias_prodotti a JOIN prodotti p ON p.id = a.prodotto_id WHERE a.codice = $1`, [k])).rows;
      if (altri.length === 1) pr = altri[0];
    }
  }
  return {
    clienteId: cl?.id ?? null, prodottoId: pr?.id ?? null,
    cliente: cl?.ragione_sociale ?? nome, codice: pr?.codice ?? maiuscolo(codice), descrizione: pr?.descrizione ?? null,
  };
}

export interface FileAnagrafiche {
  clienti: string[];
  prodotti: { codice: string; descrizione: string; cliente: string | null }[];
  alias_clienti: Record<string, string>;
  alias_prodotti: { cliente: string; codice_vecchio: string; codice: string }[];
}

/**
 * Carica l'elenco ufficiale: crea/aggiorna clienti e prodotti, registra gli alias, riallinea tutti i preventivi
 * e toglie dalle anagrafiche i clienti e prodotti che non sono nell'elenco (i preventivi vecchi restano, scollegati).
 */
export async function caricaAnagrafiche(f: FileAnagrafiche) {
  return transazione(async c => {
    const idCliente = new Map<string, number>();
    for (const nome of f.clienti.map(maiuscolo)) {
      const e = (await c.query(`SELECT id FROM clienti WHERE upper(ragione_sociale) = $1 ORDER BY id LIMIT 1`, [nome])).rows[0];
      const id = e ? e.id : (await c.query(`INSERT INTO clienti (ragione_sociale) VALUES ($1) RETURNING id`, [nome])).rows[0].id;
      await c.query(`UPDATE clienti SET ragione_sociale = $2, aggiornato_il = now() WHERE id = $1`, [id, nome]);
      idCliente.set(nome, id);
    }
    const idProdotti = new Set<number>();
    for (const p of f.prodotti) {
      const cl = p.cliente ? idCliente.get(maiuscolo(p.cliente)) ?? null : null;
      const k = chiaveCodice(p.codice);
      const e = (await c.query(
        `SELECT id FROM prodotti WHERE regexp_replace(upper(codice), '[^A-Z0-9]', '', 'g') = $1 AND cliente_id IS NOT DISTINCT FROM $2 ORDER BY id LIMIT 1`, [k, cl])).rows[0];
      const id = e ? e.id
        : (await c.query(`INSERT INTO prodotti (cliente_id, codice, descrizione) VALUES ($1,$2,$3) RETURNING id`, [cl, maiuscolo(p.codice), maiuscolo(p.descrizione)])).rows[0].id;
      await c.query(`UPDATE prodotti SET codice = $2, descrizione = $3 WHERE id = $1`, [id, maiuscolo(p.codice), maiuscolo(p.descrizione)]);
      idProdotti.add(id);
    }
    for (const [vecchio, nuovo] of Object.entries(f.alias_clienti)) {
      const id = idCliente.get(maiuscolo(nuovo));
      if (id && maiuscolo(vecchio) !== maiuscolo(nuovo))
        await c.query(`INSERT INTO alias_clienti (nome, cliente_id) VALUES ($1,$2) ON CONFLICT (nome) DO UPDATE SET cliente_id = $2`, [maiuscolo(vecchio), id]);
    }
    let aliasProdotti = 0;
    for (const a of f.alias_prodotti) {
      const cl = idCliente.get(maiuscolo(a.cliente));
      if (!cl) continue;
      const p = (await c.query(
        `SELECT id FROM prodotti WHERE regexp_replace(upper(codice), '[^A-Z0-9]', '', 'g') = $1 AND (cliente_id = $2 OR cliente_id IS NULL) ORDER BY cliente_id NULLS LAST LIMIT 1`,
        [chiaveCodice(a.codice), cl])).rows[0];
      if (!p) continue;
      await c.query(`INSERT INTO alias_prodotti (cliente_id, codice, prodotto_id) VALUES ($1,$2,$3) ON CONFLICT (cliente_id, codice) DO UPDATE SET prodotto_id = $3`,
        [cl, chiaveCodice(a.codice_vecchio), p.id]);
      aliasProdotti++;
    }
    const preventivi = await riallineaPreventivi(c);
    // via dalle anagrafiche ciò che non è nell'elenco ufficiale (e non è usato)
    const tieniClienti = [...idCliente.values()], tieniProdotti = [...idProdotti];
    await c.query(`DELETE FROM prodotti_revisioni r WHERE NOT (r.prodotto_id = ANY($1))
      AND NOT EXISTS (SELECT 1 FROM preventivi p WHERE p.revisione_id = r.id) AND NOT EXISTS (SELECT 1 FROM commesse k WHERE k.revisione_id = r.id)`, [tieniProdotti]);
    const prodottiTolti = (await c.query(`DELETE FROM prodotti p WHERE NOT (p.id = ANY($1))
      AND NOT EXISTS (SELECT 1 FROM prodotti_revisioni r WHERE r.prodotto_id = p.id)`, [tieniProdotti])).rowCount;
    const clientiTolti = (await c.query(`DELETE FROM clienti k WHERE NOT (k.id = ANY($1))
      AND NOT EXISTS (SELECT 1 FROM prodotti p WHERE p.cliente_id = k.id) AND NOT EXISTS (SELECT 1 FROM preventivi p WHERE p.cliente_id = k.id)
      AND NOT EXISTS (SELECT 1 FROM commesse m WHERE m.cliente_id = k.id)`, [tieniClienti])).rowCount;
    return { clienti: idCliente.size, prodotti: idProdotti.size, aliasProdotti, preventivi, clientiTolti, prodottiTolti };
  });
}

/** Collega ogni preventivo a cliente/prodotto ufficiali e mette l'intestazione in maiuscolo. */
export async function riallineaPreventivi(c: Db) {
  const righe = (await c.query(`SELECT id, intestazione, note FROM preventivi`)).rows;
  let collegati = 0, prodottiCollegati = 0;
  for (const p of righe) {
    const i = p.intestazione ?? {};
    const r = await risolvi(c, i.cliente ?? '', i.codice ?? '');
    const revisione = maiuscolo(i.revisione);
    let revId: number | null = null;
    if (r.prodottoId) {
      if (r.clienteId) await c.query(`UPDATE prodotti SET cliente_id = $2 WHERE id = $1 AND cliente_id IS NULL`, [r.prodottoId, r.clienteId]);
      revId = (await c.query(`INSERT INTO prodotti_revisioni (prodotto_id, revisione) VALUES ($1,$2)
        ON CONFLICT (prodotto_id, revisione) DO UPDATE SET revisione = EXCLUDED.revisione RETURNING id`, [r.prodottoId, revisione])).rows[0].id;
    }
    const descrVecchia = pulisciDescrizione(i.descrizione);
    const descrizione = r.descrizione ?? descrVecchia;
    // se la descrizione scritta a mano era un testo vero (non solo pezzi) e viene sostituita, la conservo nelle note
    const note = r.descrizione && descrVecchia && descrVecchia !== maiuscolo(r.descrizione) && !String(p.note ?? '').includes(descrVecchia)
      ? [p.note, `Descrizione originale: ${descrVecchia}`].filter(Boolean).join('\n') : p.note;
    await c.query(`UPDATE preventivi SET cliente_id = $2, revisione_id = $3, intestazione = $4, note = $5 WHERE id = $1`, [p.id, r.clienteId, revId,
      { cliente: r.cliente, codice: r.codice, revisione, descrizione }, note]);
    if (r.clienteId) collegati++;
    if (r.prodottoId) prodottiCollegati++;
  }
  return { totale: righe.length, collegati, prodottiCollegati };
}

/** Prodotti selezionabili per un cliente: i suoi + quelli non ancora assegnati. */
export const prodottiPerCliente = (clienteId: number) => q(
  `SELECT id, codice, descrizione, cliente_id IS NULL AS da_assegnare FROM prodotti
   WHERE cliente_id = $1 OR cliente_id IS NULL ORDER BY cliente_id NULLS LAST, codice`, [clienteId]);
