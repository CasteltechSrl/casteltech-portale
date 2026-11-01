/**
 * Ordine dal preventivo (proposta della revisione, Adriano 1/11/2026): proposta delle righe dal preventivo salvato
 * (prezzo a scheda del lotto successivo, una tantum se primo lotto, consegna stimata come in /preventivi/:id/consegna)
 * e creazione dell'ordine cliente (origine 'preventivo', numero della serie 9001 come gli ordini da email).
 */
import { q, q1, transazione } from './db.js';
import { calcola, datiDaRiga, leggiPreventivo } from './preventivi-servizio.js';
import { haCommessePrecedenti } from './commesse-servizio.js';
import { pianificaProduzione } from './ordini-servizio.js';
import { caricoGiornaliero } from '../engine/ordini.js';
import { riepilogo } from '../engine/riepilogo.js';
import { righeUnaTantum } from '../engine/stampa-preventivo.js';
import { stimaConsegna } from '../engine/consegna-preventivo.js';
import { PRIMO_NUMERO_EMAIL, numeroOrdineEmail } from '../engine/acquisizioni.js';
import { controlliOrdineDaPreventivo, righeDaModuloOrdine, righeOrdineDaPreventivo, type RigaOrdineProposta } from '../engine/ordine-da-preventivo.js';
import type { Catalogo } from './catalogo-db.js';

export interface PropostaOrdine {
  preventivo: any; cliente: string; clienteId: number | null; prodottoId: number | null; primoLotto: boolean;
  righe: RigaOrdineProposta[]; consegnaProposta: string | null; settimana: number | null; ordiniEsistenti: { id: number; numero: number; anno: number }[];
}

export async function propostaOrdineDaPreventivo(preventivoId: number, oggi: string): Promise<PropostaOrdine | null> {
  const p = await leggiPreventivo(preventivoId);
  if (!p) return null;
  const cat: Catalogo = p.catalogo;
  const dati = datiDaRiga(p);
  const ris = calcola(cat, dati);
  const v = (cod: string) => dati.parametri[cod] ?? cat.parametri.find(x => x.codice === cod)?.default;
  const doppia = !!v('doppiaFaccia');
  const nLamine = Number(v('nLamine')) > 0 ? Number(v('nLamine')) : (doppia ? 2 : 1);
  const r = riepilogo(ris);
  const primoLotto = p.parametri?.primaProduzione !== 0 && (p.prodotto_id ? !(await haCommessePrecedenti(p.prodotto_id)) : true);
  const righe = righeOrdineDaPreventivo({
    codice: p.intestazione?.codice ?? null, descrizione: p.intestazione?.descrizione ?? null, nSchede: p.n_schede,
    prezzoScheda: r.prezzoScheda, unaTantum: righeUnaTantum(ris, { doppia, nLamine }),
  }, primoLotto);
  let consegnaProposta: string | null = null, settimana: number | null = null;
  try {
    const { oreGiorno, barre } = await pianificaProduzione(oggi);
    const s = stimaConsegna({ oggi, arrivoComponenti: null, arrivoPcb: null, oreLavoro: r.oreCicloPrimoLottoSec / 3600, carico: caricoGiornaliero(barre), oreGiorno });
    consegnaProposta = s.venerdi; settimana = s.settimana;
  } catch { /* senza Gantt la consegna resta da scrivere */ }
  const cliente = p.cliente_id ? await q1<{ ragione_sociale: string }>(`SELECT ragione_sociale FROM clienti WHERE id = $1`, [p.cliente_id]) : null;
  const ordiniEsistenti = await q<{ id: number; numero: number; anno: number }>(`SELECT id, numero, anno FROM ordini WHERE preventivo_id = $1 ORDER BY id DESC`, [p.id]);
  return { preventivo: p, cliente: cliente?.ragione_sociale ?? p.intestazione?.cliente ?? '', clienteId: p.cliente_id ?? null, prodottoId: p.prodotto_id ?? null,
    primoLotto, righe, consegnaProposta, settimana, ordiniEsistenti };
}

export interface ModuloOrdine { rifCliente?: string; dataOrdineCliente?: string; consegna?: string; note?: string; [k: string]: unknown }

/** Crea l'ordine dal modulo: errori in italiano, oppure l'id dell'ordine. Il preventivo passa ad "accettato" se era bozza o inviato. */
export async function creaOrdineDaPreventivo(preventivoId: number, b: ModuloOrdine, utenteId: number | null, oggi: string): Promise<{ id?: number; errori: string[] }> {
  const p = await leggiPreventivo(preventivoId);
  if (!p) return { errori: ['Preventivo non trovato.'] };
  const righe = righeDaModuloOrdine(b);
  const dataQ = (x: unknown) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : null;
  const consegna = dataQ(b.consegna), dataOrdineCliente = dataQ(b.dataOrdineCliente);
  const errori = controlliOrdineDaPreventivo({ clienteId: p.cliente_id ?? null, righe, consegna, dataOrdineCliente, oggi });
  if (errori.length) return { errori };
  const rif = String(b.rifCliente ?? '').trim().toUpperCase().slice(0, 60) || null;
  const note = [String(b.note ?? '').trim(), `Dal preventivo ${p.numero}.`].filter(Boolean).join('\n');
  const prodotto = p.prodotto_id ? await q1<{ codice: string; descrizione: string }>(`SELECT codice, descrizione FROM prodotti WHERE id = $1`, [p.prodotto_id]) : null;
  const id = await transazione(async c => {
    const anno = Number(oggi.slice(0, 4));
    const massimo = (await c.query(`SELECT max(numero) AS m FROM ordini WHERE anno = $1 AND numero >= $2`, [anno, PRIMO_NUMERO_EMAIL])).rows[0].m;
    const cliente = (await c.query(`SELECT ragione_sociale FROM clienti WHERE id = $1`, [p.cliente_id])).rows[0];
    const { id } = (await c.query(`INSERT INTO ordini (anno, numero, data_ordine, cliente_id, cliente_nome, rif_cliente, data_ordine_cliente, origine, note, preventivo_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'preventivo',$8,$9) RETURNING id`,
      [anno, numeroOrdineEmail(massimo), oggi, p.cliente_id, cliente?.ragione_sociale ?? p.intestazione?.cliente ?? '', rif, dataOrdineCliente, note, p.id])).rows[0];
    for (const [i, r] of righe.entries()) {
      const eProdotto = r.tipo === 'scheda' && prodotto && r.codice === prodotto.codice.toUpperCase();
      await c.query(`INSERT INTO ordini_righe (ordine_id, chiave, posizione, prodotto_id, codice, descrizione, tipo, quantita, prezzo, consegna_richiesta)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [id, `P${p.id}-${i + 1}`, i, eProdotto ? p.prodotto_id : null, r.codice, eProdotto ? prodotto!.descrizione : r.descrizione, r.tipo, r.quantita, r.prezzo, r.tipo === 'scheda' ? consegna : null]);
    }
    if (['bozza', 'inviato'].includes(p.stato)) await c.query(`UPDATE preventivi SET stato = 'accettato', aggiornato_il = now() WHERE id = $1`, [p.id]);
    return id as number;
  });
  void utenteId;
  return { id, errori: [] };
}
