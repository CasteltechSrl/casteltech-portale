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
import { leggiRitocchi, prezziComeInStampa, righeUnaTantum } from '../engine/stampa-preventivo.js';
import { stimaConsegna } from '../engine/consegna-preventivo.js';
import { PRIMO_NUMERO_EMAIL, numeroOrdineEmail } from '../engine/acquisizioni.js';
import { controlliOrdineDaPreventivo, controlliPiuPreventivi, notaPreventivi, righeDaModuloOrdine, righeOrdineDaPreventivo, type RigaOrdineProposta } from '../engine/ordine-da-preventivo.js';
import type { Catalogo } from './catalogo-db.js';

export interface PropostaOrdine {
  preventivo: any; cliente: string; clienteId: number | null; prodottoId: number | null; primoLotto: boolean;
  righe: RigaOrdineProposta[]; consegnaProposta: string | null; settimana: number | null; ordiniEsistenti: { id: number; numero: number; anno: number }[];
  /** preventivi dell'ordine (più di uno = ordine unico da più preventivi dello stesso cliente) */
  preventivi?: { id: number; numero: string }[];
  errori?: string[];
}

/** Ordine unico da più preventivi (Cinzia, 2/11/2026): righe una dopo l'altra, consegna proposta = la più lontana. */
export async function propostaOrdineDaPreventivi(ids: number[], oggi: string): Promise<PropostaOrdine | null> {
  const proposte = (await Promise.all([...new Set(ids)].map(id => propostaOrdineDaPreventivo(id, oggi)))).filter((x): x is PropostaOrdine => !!x);
  if (!proposte.length) return null;
  if (proposte.length === 1) return proposte[0];
  const errori = controlliPiuPreventivi(proposte.map(x => ({ numero: x.preventivo.numero, clienteId: x.clienteId })));
  const consegne = proposte.map(x => x.consegnaProposta).filter((d): d is string => !!d).sort();
  const ultima = proposte.find(x => x.consegnaProposta === consegne[consegne.length - 1]);
  return { ...proposte[0], righe: proposte.flatMap(x => x.righe), primoLotto: proposte.some(x => x.primoLotto),
    consegnaProposta: ultima?.consegnaProposta ?? null, settimana: ultima?.settimana ?? null,
    ordiniEsistenti: proposte.flatMap(x => x.ordiniEsistenti), preventivi: proposte.map(x => ({ id: x.preventivo.id, numero: x.preventivo.numero })), errori };
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
  // stessi prezzi della stampa per il cliente: quelli scritti a mano nella stampa, se ci sono (Adriano 4/11/2026)
  const rit = leggiRitocchi(p.stampa);
  const prezzi = prezziComeInStampa(r, p.n_schede, righeUnaTantum(ris, { doppia, nLamine }), rit.prezzi, rit.sconto);
  const righe = righeOrdineDaPreventivo({
    codice: p.intestazione?.codice ?? null, descrizione: p.intestazione?.descrizione ?? null, nSchede: p.n_schede,
    prezzoScheda: prezzi.prezzoScheda, unaTantum: prezzi.unaTantum,
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
  return creaOrdineDaPreventivi([preventivoId], b, utenteId, oggi);
}

/** Un ordine da uno o più preventivi dello stesso cliente (Cinzia, 2/11/2026); tutti passano ad "accettato" se erano bozza o inviati. */
export async function creaOrdineDaPreventivi(ids: number[], b: ModuloOrdine, utenteId: number | null, oggi: string): Promise<{ id?: number; errori: string[] }> {
  const prev = (await Promise.all([...new Set(ids)].map(id => leggiPreventivo(id)))).filter(Boolean) as any[];
  if (!prev.length) return { errori: ['Preventivo non trovato.'] };
  const p = prev[0];
  const righe = righeDaModuloOrdine(b);
  const dataQ = (x: unknown) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : null;
  const consegna = dataQ(b.consegna), dataOrdineCliente = dataQ(b.dataOrdineCliente);
  const errori = [
    ...(prev.length > 1 ? controlliPiuPreventivi(prev.map(x => ({ numero: x.numero, clienteId: x.cliente_id ?? null }))) : []),
    ...controlliOrdineDaPreventivo({ clienteId: p.cliente_id ?? null, righe, consegna, dataOrdineCliente, oggi }),
  ];
  if (errori.length) return { errori };
  const rif = String(b.rifCliente ?? '').trim().toUpperCase().slice(0, 60) || null;
  const note = [String(b.note ?? '').trim(), notaPreventivi(prev.map(x => x.numero))].filter(Boolean).join('\n');
  // prodotti dei preventivi: la riga di schede con lo stesso codice si collega al prodotto in anagrafica
  // (e al preventivo da cui viene: collegamento riga d'ordine → preventivo, Adriano 11/11/2026)
  const prodotti = new Map<string, { id: number; descrizione: string; preventivoId: number }>();
  for (const x of prev) if (x.prodotto_id) {
    const pr = await q1<{ codice: string; descrizione: string }>(`SELECT codice, descrizione FROM prodotti WHERE id = $1`, [x.prodotto_id]);
    if (pr) prodotti.set(pr.codice.toUpperCase(), { id: x.prodotto_id, descrizione: pr.descrizione, preventivoId: x.id });
  }
  const id = await transazione(async c => {
    const anno = Number(oggi.slice(0, 4));
    const massimo = (await c.query(`SELECT max(numero) AS m FROM ordini WHERE anno = $1 AND numero >= $2`, [anno, PRIMO_NUMERO_EMAIL])).rows[0].m;
    const cliente = (await c.query(`SELECT ragione_sociale FROM clienti WHERE id = $1`, [p.cliente_id])).rows[0];
    const { id } = (await c.query(`INSERT INTO ordini (anno, numero, data_ordine, cliente_id, cliente_nome, rif_cliente, data_ordine_cliente, origine, note, preventivo_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'preventivo',$8,$9) RETURNING id`,
      [anno, numeroOrdineEmail(massimo), oggi, p.cliente_id, cliente?.ragione_sociale ?? p.intestazione?.cliente ?? '', rif, dataOrdineCliente, note, p.id])).rows[0];
    for (const [i, r] of righe.entries()) {
      const prodotto = r.tipo === 'scheda' && r.codice ? prodotti.get(r.codice) : undefined;
      await c.query(`INSERT INTO ordini_righe (ordine_id, chiave, posizione, prodotto_id, codice, descrizione, tipo, quantita, prezzo, consegna_richiesta, preventivo_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [id, `P${p.id}-${i + 1}`, i, prodotto?.id ?? null, r.codice, prodotto ? prodotto.descrizione : r.descrizione, r.tipo, r.quantita, r.prezzo, r.tipo === 'scheda' ? consegna : null,
          prodotto?.preventivoId ?? null]);
    }
    for (const x of prev) if (['bozza', 'inviato'].includes(x.stato)) await c.query(`UPDATE preventivi SET stato = 'accettato', aggiornato_il = now() WHERE id = $1`, [x.id]);
    return id as number;
  });
  void utenteId;
  return { id, errori: [] };
}
