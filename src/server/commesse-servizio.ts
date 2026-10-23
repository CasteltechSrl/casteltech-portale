/**
 * Commesse: un preventivo diventato ordine, con i dati della scheda di produzione.
 * - Le fasi stampate sulla scheda sono quelle del preventivo (con il suo catalogo "fotografato"),
 *   ricalcolate sulla quantità della commessa; le una tantum solo se è il primo lotto.
 * - "Ultima produzione" = tempi standard (righe S) della commessa precedente dello stesso prodotto,
 *   riportati alla quantità di questa commessa.
 * - La scheda tecnica (programmi, lamine, paste, note di montaggio) si salva sulla revisione del prodotto
 *   e si ripropone alla commessa successiva; la commessa ne tiene una copia.
 */
import { randomBytes } from 'node:crypto';
import { q, q1, transazione } from './db.js';
import { calcola, datiDaRiga, leggiPreventivo, nPannelli } from './preventivi-servizio.js';
import type { Catalogo } from './catalogo-db.js';
import { cicloStandardPerFase, riportaAQuantita, type Rilevazione } from '../engine/consuntivo.js';

// ───────────────────────────── scheda tecnica (intestazione della MASTERspec) ─────────────────────────────
/** Campi con TOP e BOT, nell'ordine della scheda. */
export const PROGRAMMI: [string, string][] = [
  ['progArmadio', 'Prog. armadio'], ['progSerigrafia', 'Prog. serigrafia'], ['lamina', 'Lamina'],
  ['progPePFox', 'Prog. P&P FOX'], ['progPePIpulse', 'Prog. P&P iPulse'], ['progForno', 'Prog. forno'], ['progAOI', 'Prog. AOI'],
];
/** Vecchio campo "materiali di saldatura" (tipo): non più usato, sostituito dalla riga Materiale di consumo. */
export const MATERIALI_SALDATURA: [string, string][] = [
  ['pastaSaldante', 'Pasta saldante'], ['stagnoSaldatrice', 'Stagno saldatrice'], ['flussante', 'Flussante / gel'], ['filo', 'Filo di saldatura'],
];

export interface SchedaTecnica {
  programmi: Record<string, { top: string; bot: string }>;
  pasta: string;
  materiali: Record<string, string>;
  noteMontaggio: string;
}

export function schedaTecnica(x: any): SchedaTecnica {
  const testo = (v: unknown) => String(v ?? '').trim().slice(0, 2000);
  return {
    programmi: Object.fromEntries(PROGRAMMI.map(([k]) => [k, { top: testo(x?.programmi?.[k]?.top), bot: testo(x?.programmi?.[k]?.bot) }])),
    pasta: testo(x?.pasta),
    materiali: Object.fromEntries(MATERIALI_SALDATURA.map(([k]) => [k, testo(x?.materiali?.[k])])),
    noteMontaggio: testo(x?.noteMontaggio),
  };
}

// ───────────────────────────── fasi previste sulla scheda ─────────────────────────────
export interface FaseScheda {
  codice: string; numero: string; nome: string; gruppo: string; unaTantum: boolean; tariffa: string;
  persone: number; cicloSec: number; uomoSec: number; ultimaSec: number | null;
}

/** Fasi del preventivo ricalcolate sulla quantità della commessa (solo quelle con un tempo). */
export function fasiPreviste(prev: any, quantita: number, primoLotto: boolean): FaseScheda[] {
  const cat: Catalogo = prev.catalogo;
  const dati = { ...datiDaRiga(prev), nSchede: quantita };
  const ris = calcola(cat, dati);
  return cat.fasi.flatMap(f => {
    const r = ris.fasi.find(x => x.codice === f.codice);
    if (!r || r.secondiCiclo <= 0 || (f.unaTantum && !primoLotto)) return [];
    return [{ codice: f.codice, numero: f.numero, nome: f.nome, gruppo: f.gruppo, unaTantum: f.unaTantum, tariffa: f.tariffa,
      persone: r.persone, cicloSec: r.secondiCiclo, uomoSec: r.secondiUomo, ultimaSec: null }];
  });
}

/** Tempi dell'ultima produzione dello stesso prodotto (commessa precedente con rilevazioni), riportati a questa quantità. */
export async function ultimaProduzione(prodottoId: number, prima: { id?: number }, quantita: number, pannelli: number, cat: Catalogo)
  : Promise<{ numero: string; tempi: Record<string, number> } | null> {
  const prec = await q1<{ id: number; numero: string; quantita: number; n_pannelli: number | null }>(`
    SELECT c.id, c.numero, c.quantita, c.n_pannelli FROM commesse c JOIN prodotti_revisioni r ON r.id = c.revisione_id
    WHERE r.prodotto_id = $1 AND ($2::int IS NULL OR c.id <> $2) AND EXISTS (SELECT 1 FROM rilevazioni x WHERE x.commessa_id = c.id)
    ORDER BY c.creato_il DESC, c.id DESC LIMIT 1`, [prodottoId, prima.id ?? null]);
  if (!prec) return null;
  const righe = await q(`SELECT fase_codice, to_char(data, 'YYYY-MM-DD') AS data, to_char(ora_inizio, 'HH24:MI') AS inizio,
      to_char(ora_fine, 'HH24:MI') AS fine, persone, tipo FROM rilevazioni WHERE commessa_id = $1`, [prec.id]);
  const prevFasi = await q<{ fase_codice: string; persone_previste: number }>(`SELECT fase_codice, persone_previste FROM commesse_fasi WHERE commessa_id = $1`, [prec.id]);
  const ril: Rilevazione[] = righe.map(r => ({ fase: r.fase_codice, data: r.data, inizio: r.inizio, fine: r.fine, persone: Number(r.persone), tipo: r.tipo }));
  const std = cicloStandardPerFase(ril, Object.fromEntries(prevFasi.map(f => [f.fase_codice, Number(f.persone_previste)])));
  const da = { schede: prec.quantita, pannelli: prec.n_pannelli ?? prec.quantita }, a = { schede: quantita, pannelli };
  const tempi: Record<string, number> = {};
  for (const [codice, sec] of Object.entries(std)) {
    const f = cat.fasi.find(x => x.codice === codice);
    tempi[codice] = riportaAQuantita(sec, f?.scala ?? 'fisso', da, a);
  }
  return { numero: prec.numero, tempi };
}

// ───────────────────────────── lettura e salvataggio ─────────────────────────────
export interface DatiCommessa {
  numero: string; ordineCliente: string; referenteCliente: string; dataOrdine: string | null; dataConsegna: string | null;
  quantita: number; primoLotto: boolean; segnalazioni: string; scheda: SchedaTecnica; stato?: string;
}

export const STATI_COMMESSA = ['aperta', 'in_produzione', 'rientrata', 'analizzata', 'chiusa'];

export const leggiCommessa = (id: number) => q1(`
  SELECT c.*, r.prodotto_id, r.revisione, p.n_schede_pannello, p.numero AS numero_preventivo
  FROM commesse c JOIN prodotti_revisioni r ON r.id = c.revisione_id LEFT JOIN preventivi p ON p.id = c.preventivo_id
  WHERE c.id = $1`, [id]);

export async function proponiNumero(): Promise<string> {
  const r = await q1<{ n: string }>(`SELECT 'C' || to_char(now(), 'YYYY') || '-' || lpad((last_value + CASE WHEN is_called THEN 1 ELSE 0 END)::text, 4, '0') AS n FROM numerazione_commesse`);
  return r!.n;
}

/** Il prodotto ha già avuto commesse? (se no, è il primo lotto e paga i costi una tantum) */
export async function haCommessePrecedenti(prodottoId: number, escludi?: number): Promise<boolean> {
  return !!(await q1(`SELECT 1 FROM commesse c JOIN prodotti_revisioni r ON r.id = c.revisione_id WHERE r.prodotto_id = $1 AND ($2::int IS NULL OR c.id <> $2) LIMIT 1`,
    [prodottoId, escludi ?? null]));
}

/** Crea o aggiorna una commessa. Restituisce l'id, oppure un errore in italiano. */
export async function salvaCommessa(opz: { id?: number; preventivoId: number; dati: DatiCommessa; utenteId: number }): Promise<{ id?: number; errore?: string }> {
  const prev = await leggiPreventivo(opz.preventivoId);
  if (!prev) return { errore: 'Preventivo non trovato' };
  if (!prev.revisione_id || !prev.cliente_id) return { errore: 'Il preventivo non ha cliente e codice dalle anagrafiche: aprilo, sceglili e salvalo' };
  const d = opz.dati;
  if (!(d.quantita > 0)) return { errore: 'Indica la quantità di schede' };
  const numero = d.numero.trim().toUpperCase();
  const pannelli = nPannelli(d.quantita, prev.n_schede_pannello);
  const fasi = fasiPreviste(prev, d.quantita, d.primoLotto);
  const ultima = await ultimaProduzione(prev.prodotto_id, { id: opz.id }, d.quantita, pannelli, prev.catalogo);
  return transazione(async c => {
    const doppio = numero && (await c.query(`SELECT 1 FROM commesse WHERE numero = $1 AND id IS DISTINCT FROM $2`, [numero, opz.id ?? null])).rowCount;
    if (doppio) return { errore: `Esiste già una commessa numero ${numero}` };
    const campi = [d.ordineCliente || null, d.referenteCliente || null, d.dataOrdine, d.dataConsegna, d.quantita, pannelli, d.primoLotto,
      d.segnalazioni || null, d.scheda, prev.intestazione ?? {}];
    let id = opz.id;
    if (id) {
      await c.query(`UPDATE commesse SET ordine_cliente=$2, referente_cliente=$3, data_ordine=$4, data_consegna=$5, quantita=$6, n_pannelli=$7,
        primo_lotto=$8, segnalazioni=$9, scheda_tecnica=$10, intestazione=$11, numero=coalesce(nullif($12, ''), numero),
        stato=coalesce($13, stato), aggiornato_il=now() WHERE id=$1`, [id, ...campi, numero, d.stato ?? null]);
      await c.query(`DELETE FROM commesse_fasi WHERE commessa_id = $1`, [id]);
    } else {
      id = (await c.query(`INSERT INTO commesse (ordine_cliente, referente_cliente, data_ordine, data_consegna, quantita, n_pannelli, primo_lotto,
          segnalazioni, scheda_tecnica, intestazione, numero, preventivo_id, revisione_id, cliente_id, codice_qr, creato_da)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
          coalesce(nullif($11, ''), 'C' || to_char(now(), 'YYYY') || '-' || lpad(nextval('numerazione_commesse')::text, 4, '0')),
          $12,$13,$14,$15,$16) RETURNING id`,
        [...campi, numero, prev.id, prev.revisione_id, prev.cliente_id, randomBytes(9).toString('base64url'), opz.utenteId])).rows[0].id;
      // se il numero proposto è stato accettato, la numerazione va avanti
      if (/^C\d{4}-\d+$/.test(numero)) await c.query(`SELECT setval('numerazione_commesse', greatest((SELECT last_value FROM numerazione_commesse),
        coalesce(substring($1 from '^C\\d{4}-(\\d+)$')::int, 0)), true)`, [numero]);
      await c.query(`UPDATE preventivi SET stato = 'accettato', aggiornato_il = now() WHERE id = $1 AND stato IN ('bozza', 'inviato')`, [prev.id]);
    }
    for (const [i, f] of fasi.entries())
      await c.query(`INSERT INTO commesse_fasi (commessa_id, fase_codice, ordine, persone_previste, ciclo_previsto_sec, uomo_previsto_sec, ciclo_ultima_prod_sec)
        VALUES ($1,$2,$3,$4,$5,$6,$7)`, [id, f.codice, i, f.persone, Math.round(f.cicloSec), Math.round(f.uomoSec),
        ultima?.tempi[f.codice] != null ? Math.round(ultima.tempi[f.codice]) : null]);
    // la scheda tecnica si ripropone alla prossima commessa dello stesso prodotto/revisione
    await c.query(`UPDATE prodotti_revisioni SET scheda_tecnica = $2 WHERE id = $1`, [prev.revisione_id, d.scheda]);
    return { id };
  });
}

/** Fasi salvate della commessa, con i nomi dal catalogo del preventivo. */
export async function fasiCommessa(commessa: any): Promise<FaseScheda[]> {
  const prev = commessa.preventivo_id ? await leggiPreventivo(commessa.preventivo_id) : null;
  const cat: Catalogo | undefined = prev?.catalogo;
  const righe = await q(`SELECT cf.*, f.numero, f.nome, f.gruppo, f.una_tantum, f.tariffa FROM commesse_fasi cf JOIN fasi f ON f.codice = cf.fase_codice
    WHERE cf.commessa_id = $1 ORDER BY cf.ordine`, [commessa.id]);
  return righe.map(r => {
    const f = cat?.fasi.find(x => x.codice === r.fase_codice);
    return { codice: r.fase_codice, numero: f?.numero ?? r.numero, nome: f?.nome ?? r.nome, gruppo: f?.gruppo ?? r.gruppo,
      unaTantum: f?.unaTantum ?? r.una_tantum, tariffa: f?.tariffa ?? r.tariffa, persone: Number(r.persone_previste),
      cicloSec: Number(r.ciclo_previsto_sec), uomoSec: Number(r.uomo_previsto_sec),
      ultimaSec: r.ciclo_ultima_prod_sec == null ? null : Number(r.ciclo_ultima_prod_sec) };
  });
}

/** Segnalazioni del prodotto da riportare sulle prossime schede (storico). */
export const segnalazioniProdotto = (prodottoId: number) => q<{ testo: string; origine: string; creato_il: string; numero: string | null }>(`
  SELECT s.testo, s.origine, s.creato_il, c.numero FROM segnalazioni s LEFT JOIN commesse c ON c.id = s.commessa_id
  WHERE s.prodotto_id = $1 AND s.rilevante_prossime ORDER BY s.creato_il DESC LIMIT 10`, [prodottoId]);

export { consumiPrevisti } from '../engine/consumi.js';
