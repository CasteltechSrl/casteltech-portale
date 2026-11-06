/**
 * DDT in ingresso (Adriano 6/11/2026): DDT dei fornitori (merce ordinata) e dei clienti (materiale in conto lavoro, schede da rilavorare)
 * arrivati in Da acquisire. Qui le letture dal database: mittente dall'anagrafica (P.IVA o nome), ordini aperti, incrocio con le regole
 * di `engine/ddt-ricevuti.ts`, conferma (il DDT resta in `ddt_ricevuti`; per i fornitori gli arrivi si scrivono sull'ordine a fornitore).
 */
import { pool, q, q1, transazione } from './db.js';
import { maiuscolo, risolvi } from './anagrafiche-servizio.js';
import { stessoNomeFornitore } from '../engine/autofatture.js';
import { righeOrdini } from './ordini-servizio.js';
import {
  abbinaDdtCliente, abbinaDdtFornitore, type Anomalia, type DdtRicevutoLetto, type Mittente, type RigaClienteAbbinata, type RigaFornitoreAbbinata,
  type RigaOrdineFornitoreAperta, type RigaRicevuta,
} from '../engine/ddt-ricevuti.js';

/** Riga del DDT con i collegamenti proposti o scelti (fornitore: ordineId+posizione; cliente: componente/prodotto/riga d'ordine). */
export interface RigaDdtRicevutoDb extends RigaRicevuta {
  ordineId?: number | null; posizione?: number | null; ordine?: string | null; attesi?: number | null;
  componenteClienteId?: number | null; prodottoId?: number | null; rigaOrdineId?: number | null;
  anomalia?: string | null;
  /** scelta dell'ufficio (modulo): fornitore "ordineId:posizione" / "0"; cliente "c:ID" / "p:ID" / "" ; undefined = da proporre */
  scelta?: string;
}
/** Quello che si salva in acquisizioni.proposta per un DDT ricevuto. */
export interface DdtRicevutoDb extends Omit<DdtRicevutoLetto, 'righe'> {
  tipoDocumento: 'ddt_ricevuto';
  mittenteTipo: Mittente | null;        // deciso dall'anagrafica (o dall'ufficio)
  fornitoreId: number | null;
  clienteId: number | null;
  /** DDT dai clienti: l'ordine del cliente a cui serve il materiale (undefined = da proporre, null = nessuno) */
  ordineId?: number | null;
  righe: RigaDdtRicevutoDb[];
  anomalie?: Anomalia[];
}

const soloCifre = (s: string | null | undefined) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^IT/, '');

/** Fornitore dell'anagrafica dal DDT: prima per P.IVA, poi per nome (senza forme societarie: "MOUSER ELECTRONICS, INC." = "MOUSER ELECTRONICS"). */
async function trovaFornitore(nome: string, partitaIva: string): Promise<number | null> {
  const piva = soloCifre(partitaIva);
  if (piva) {
    const f = await q1<{ id: number }>(`SELECT id FROM fornitori_anagrafica WHERE regexp_replace(upper(partita_iva), '[^A-Z0-9]', '', 'g') IN ($1, 'IT' || $1) LIMIT 1`, [piva]);
    if (f) return f.id;
  }
  if (!nome) return null;
  const tutti = await q<{ id: number; ragione_sociale: string }>(`SELECT id, ragione_sociale FROM fornitori_anagrafica ORDER BY ragione_sociale`);
  const esatto = tutti.find(f => maiuscolo(f.ragione_sociale) === maiuscolo(nome));
  if (esatto) return esatto.id;
  const simili = tutti.filter(f => stessoNomeFornitore(f.ragione_sociale, nome));
  return simili.length === 1 ? simili[0].id : null;
}

/** Cliente dell'anagrafica dal DDT: P.IVA, poi nome o alias (`risolvi`). */
async function trovaCliente(nome: string, partitaIva: string): Promise<number | null> {
  const piva = soloCifre(partitaIva);
  if (piva) {
    const c = await q1<{ id: number }>(`SELECT id FROM clienti WHERE regexp_replace(upper(coalesce(partita_iva, '')), '[^A-Z0-9]', '', 'g') IN ($1, 'IT' || $1) LIMIT 1`, [piva]);
    if (c) return c.id;
  }
  return nome ? (await risolvi(pool, nome, '')).clienteId : null;
}

/** Righe degli ordini a fornitore emessi (non annullati) al fornitore, con i pezzi già arrivati. */
export async function righeOrdiniFornitore(fornitoreId: number | null): Promise<RigaOrdineFornitoreAperta[]> {
  if (!fornitoreId) return [];
  return (await q<any>(`SELECT d.id AS ordine_id, d.numero, d.anno, d.fornitore_id, r.posizione, r.codice, r.descrizione, r.quantita, r.arrivati
    FROM documenti d JOIN documenti_righe r ON r.documento_id = d.id
    WHERE d.tipo = 'ordine_fornitore' AND d.fornitore_id = $1 AND d.numero IS NOT NULL AND d.stato <> 'annullato' AND NOT r.solo_descrizione AND r.quantita > 0
    ORDER BY d.data, d.numero, r.posizione`, [fornitoreId]))
    .map(r => ({ ordineId: r.ordine_id, ordine: `${r.numero}/${r.anno}`, fornitoreId: r.fornitore_id, posizione: r.posizione, codice: r.codice,
      descrizione: r.descrizione ?? '', quantita: Number(r.quantita), arrivati: Number(r.arrivati) }));
}

/** Ordini aperti del cliente con le righe di schede ancora da spedire (per i DDT dei clienti). */
async function ordiniApertiCliente(clienteId: number | null) {
  if (!clienteId) return [];
  const righe = (await righeOrdini()).filter(r => r.clienteId === clienteId && r.tipo === 'scheda' && ['da_evadere', 'parziale'].includes(r.stato));
  const perOrdine = new Map<number, { id: number; numero: number; anno: number; rifCliente: string | null; righe: { id: number; codice: string | null; codiceCliente: string | null; descrizione: string | null; prodottoId: number | null; residuo: number }[] }>();
  for (const r of righe) {
    const o = perOrdine.get(r.ordineId) ?? { id: r.ordineId, numero: r.numero, anno: r.anno, rifCliente: r.rifCliente, righe: [] };
    o.righe.push({ id: r.id, codice: r.codice, codiceCliente: r.codiceCliente, descrizione: r.descrizione, prodottoId: r.prodottoId, residuo: r.residuoQuantita });
    perOrdine.set(r.ordineId, o);
  }
  return [...perOrdine.values()];
}

/** Quello che serve alla pagina per i menu: righe ordinate del fornitore, componenti/prodotti e ordini aperti del cliente. */
export async function contestoDdtRicevuto(d: DdtRicevutoDb) {
  return {
    aperte: d.mittenteTipo === 'fornitore' ? await righeOrdiniFornitore(d.fornitoreId) : [],
    componenti: d.mittenteTipo === 'cliente' && d.clienteId ? await q<{ id: number; codice: string; descrizione: string | null }>(`SELECT id, codice, descrizione FROM componenti_clienti WHERE cliente_id = $1 ORDER BY codice`, [d.clienteId]) : [],
    prodotti: d.mittenteTipo === 'cliente' && d.clienteId ? await q<{ id: number; codice: string; descrizione: string | null }>(`SELECT id, codice, descrizione FROM prodotti WHERE cliente_id = $1 ORDER BY codice`, [d.clienteId]) : [],
    ordini: d.mittenteTipo === 'cliente' ? await ordiniApertiCliente(d.clienteId) : [],
  };
}

/**
 * Collega il DDT all'anagrafica (mittente scelto dall'ufficio, altrimenti cercato per P.IVA e nome tra fornitori e clienti) e incrocia
 * le righe con gli ordini. Un'azienda che è sia fornitore sia cliente: fornitore se ha ordini a fornitore emessi, altrimenti cliente.
 */
export async function collegaDdtRicevuto(d: DdtRicevutoDb): Promise<DdtRicevutoDb> {
  let fornitoreId = d.fornitoreId ? (await q1<{ id: number }>(`SELECT id FROM fornitori_anagrafica WHERE id = $1`, [d.fornitoreId]))?.id ?? null : null;
  let clienteId = d.clienteId ? (await q1<{ id: number }>(`SELECT id FROM clienti WHERE id = $1`, [d.clienteId]))?.id ?? null : null;
  let tipo: Mittente | null = d.mittenteTipo;
  if (!tipo || (tipo === 'fornitore' && !fornitoreId) || (tipo === 'cliente' && !clienteId)) {
    const f = fornitoreId ?? await trovaFornitore(d.mittente, d.partitaIva);
    const c = clienteId ?? await trovaCliente(d.mittente, d.partitaIva);
    if (f && c) tipo = (await righeOrdiniFornitore(f)).length ? 'fornitore' : 'cliente';
    else tipo = f ? 'fornitore' : c ? 'cliente' : tipo;
    fornitoreId = tipo === 'fornitore' ? f : null;
    clienteId = tipo === 'cliente' ? c : null;
  } else if (tipo === 'fornitore') clienteId = null;
  else fornitoreId = null;
  const base = { ...d, mittenteTipo: tipo, fornitoreId, clienteId };
  if (!tipo) return { ...base, ordineId: null, righe: d.righe.map(r => ({ ...r, anomalia: null })),
    anomalie: [{ livello: 'errore', testo: `Mittente «${d.mittente || '?'}» non trovato in anagrafica: scegli se è un fornitore o un cliente e quale.` }] };
  if (tipo === 'cliente') {
    const ctx = await contestoDdtRicevuto({ ...base, mittenteTipo: 'cliente' });
    const esito = abbinaDdtCliente({ righe: d.righe, rifOrdine: d.rifOrdine }, { clienteId, componenti: ctx.componenti, prodotti: ctx.prodotti, ordini: ctx.ordini,
      scelte: d.righe.map(r => r.scelta), ordineScelto: d.ordineId });
    const righe: RigaDdtRicevutoDb[] = esito.righe.map((r: RigaClienteAbbinata, i) => ({ ...r, scelta: d.righe[i]?.scelta }));
    return { ...base, ordineId: esito.ordineId, righe, anomalie: esito.anomalie };
  }
  const aperte = await righeOrdiniFornitore(fornitoreId);
  const altri = (await q<any>(`SELECT d.id, d.numero, d.anno, f.ragione_sociale AS fornitore FROM documenti d LEFT JOIN fornitori_anagrafica f ON f.id = d.fornitore_id
    WHERE d.tipo = 'ordine_fornitore' AND d.numero IS NOT NULL AND d.stato <> 'annullato' AND (d.fornitore_id IS DISTINCT FROM $1)`, [fornitoreId]))
    .map(x => ({ ordineId: x.id, numero: x.numero, anno: x.anno, fornitore: x.fornitore }));
  const scelte = d.righe.map(r => (r.scelta === undefined ? undefined : r.scelta === '0' || r.scelta === '' ? null
    : (([o, p]) => (Number(o) && Number(p) ? { ordineId: Number(o), posizione: Number(p) } : null))(r.scelta.split(':'))));
  const esito = abbinaDdtFornitore({ righe: d.righe, rifOrdine: d.rifOrdine }, { fornitoreId, aperte, altri, scelte });
  const righe: RigaDdtRicevutoDb[] = esito.righe.map((r: RigaFornitoreAbbinata, i) => ({ ...r, scelta: d.righe[i]?.scelta }));
  return { ...base, ordineId: null, righe, anomalie: esito.anomalie };
}

export async function salvaDdtRicevuto(id: number, d: DdtRicevutoDb): Promise<DdtRicevutoDb> {
  const nuovo = await collegaDdtRicevuto(d);
  await q(`UPDATE acquisizioni SET proposta = $2 WHERE id = $1 AND tipo = 'ddt_ricevuto' AND stato IN ('da_confermare', 'errore')`, [id, JSON.stringify(nuovo)]);
  return nuovo;
}

/**
 * Conferma: il DDT entra in `ddt_ricevuti` con righe, collegamenti e anomalie; per i fornitori i pezzi delle righe abbinate si sommano
 * agli arrivati dell'ordine a fornitore (data dell'arrivo = data del DDT). Le anomalie "da sistemare" bloccano, salvo la spunta "Ho controllato".
 */
export async function confermaDdtRicevuto(id: number, d: DdtRicevutoDb, utenteId: number, oggi: string, anomalieControllate: boolean): Promise<number> {
  const ddt = await collegaDdtRicevuto(d);
  if (!ddt.mittenteTipo || (ddt.mittenteTipo === 'fornitore' ? !ddt.fornitoreId : !ddt.clienteId)) throw new Error("scegli il mittente dall'anagrafica (fornitore o cliente)");
  const righe = ddt.righe.filter(r => r.quantita > 0 && (r.codice || r.descrizione));
  if (!righe.length) throw new Error('nessuna riga con quantità');
  const errori = (ddt.anomalie ?? []).filter(a => a.livello === 'errore');
  if (errori.length && !anomalieControllate) throw new Error('ci sono anomalie da sistemare: correggile, oppure spunta «Ho controllato le anomalie» e conferma');
  const nome = ddt.mittenteTipo === 'fornitore'
    ? (await q1<{ r: string }>(`SELECT ragione_sociale AS r FROM fornitori_anagrafica WHERE id = $1`, [ddt.fornitoreId]))!.r
    : (await q1<{ r: string }>(`SELECT ragione_sociale AS r FROM clienti WHERE id = $1`, [ddt.clienteId]))!.r;
  return transazione(async c => {
    const a = (await c.query(`SELECT stato FROM acquisizioni WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!a || a.stato === 'confermato') throw new Error('DDT già confermato');
    const { id: ddtId } = (await c.query(`INSERT INTO ddt_ricevuti (mittente, fornitore_id, cliente_id, mittente_nome, numero, data, rif_ordine, ordine_id, righe, anomalie, note, acquisizione_id, confermato_da)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [ddt.mittenteTipo, ddt.fornitoreId, ddt.clienteId, nome, ddt.numero || null, ddt.data, ddt.rifOrdine || null, ddt.mittenteTipo === 'cliente' ? ddt.ordineId ?? null : null,
        JSON.stringify(righe.map(({ scelta: _s, ...r }) => r)), JSON.stringify(ddt.anomalie ?? []), ddt.note || null, id, utenteId])).rows[0];
    if (ddt.mittenteTipo === 'fornitore') {
      const dataArrivo = ddt.data ?? oggi;
      for (const r of righe) if (r.ordineId && r.posizione)
        await c.query(`UPDATE documenti_righe SET arrivati = arrivati + $3, arrivati_il = $4 WHERE documento_id = $1 AND posizione = $2`, [r.ordineId, r.posizione, r.quantita, dataArrivo]);
      for (const o of new Set(righe.map(r => r.ordineId).filter(Boolean))) await c.query(`UPDATE documenti SET aggiornato_il = now() WHERE id = $1`, [o]);
    }
    await c.query(`UPDATE acquisizioni SET stato = 'confermato', confermato_da = $2, proposta = $3 WHERE id = $1`, [id, utenteId, JSON.stringify(ddt)]);
    return ddtId as number;
  });
}

export interface DdtRicevutoElenco {
  id: number; mittente: Mittente; mittente_nome: string; fornitore_id: number | null; cliente_id: number | null; numero: string | null; data: string | null;
  rif_ordine: string | null; ordine_id: number | null; ordine_numero: number | null; ordine_anno: number | null; righe: RigaDdtRicevutoDb[]; anomalie: Anomalia[];
  note: string | null; acquisizione_id: number | null; nome_file: string | null; confermato_nome: string | null; creato_il: Date;
}

/** DDT ricevuti confermati, più recenti in cima (ultimi 400). */
export const elencoDdtRicevuti = () => q<DdtRicevutoElenco>(`SELECT r.*, o.numero AS ordine_numero, o.anno AS ordine_anno, a.nome_file, u.nome AS confermato_nome
  FROM ddt_ricevuti r LEFT JOIN ordini o ON o.id = r.ordine_id LEFT JOIN acquisizioni a ON a.id = r.acquisizione_id LEFT JOIN utenti u ON u.id = r.confermato_da
  ORDER BY r.data DESC NULLS LAST, r.id DESC LIMIT 400`);

/** DDT ricevuti ancora da confermare (letti, con anomalie, in errore). */
export const ddtRicevutiDaConfermare = () => q<{ id: number; nome_file: string; stato: string; errore: string | null; creato_il: Date; proposta: DdtRicevutoDb | null }>(
  `SELECT id, nome_file, stato, errore, creato_il, proposta FROM acquisizioni WHERE tipo = 'ddt_ricevuto' AND stato IN ('da_confermare', 'errore', 'nuovo') ORDER BY creato_il DESC`);

/** DDT del fornitore con righe che riguardano un ordine a fornitore (per la pagina dell'ordine). */
export const ddtRicevutiPerOrdineFornitore = (ordineId: number) => q<{ id: number; numero: string | null; data: string | null; codice: string; descrizione: string; quantita: number; anomalia: string | null; acquisizione_id: number | null }>(
  `SELECT r.id, r.numero, r.data, x->>'codice' AS codice, x->>'descrizione' AS descrizione, (x->>'quantita')::numeric AS quantita, x->>'anomalia' AS anomalia, r.acquisizione_id
   FROM ddt_ricevuti r, jsonb_array_elements(r.righe) x WHERE r.mittente = 'fornitore' AND (x->>'ordineId')::int = $1 ORDER BY r.data, r.id`, [ordineId]);

/** DDT del cliente collegati a un ordine cliente (materiale arrivato per quell'ordine). */
export const ddtRicevutiPerOrdineCliente = (ordineId: number) => q<{ id: number; numero: string | null; data: string | null; codice: string; descrizione: string; quantita: number; anomalia: string | null; acquisizione_id: number | null }>(
  `SELECT r.id, r.numero, r.data, x->>'codice' AS codice, x->>'descrizione' AS descrizione, (x->>'quantita')::numeric AS quantita, x->>'anomalia' AS anomalia, r.acquisizione_id
   FROM ddt_ricevuti r, jsonb_array_elements(r.righe) x WHERE r.mittente = 'cliente' AND (r.ordine_id = $1 OR (x->>'rigaOrdineId')::int IN (SELECT id FROM ordini_righe WHERE ordine_id = $1))
   ORDER BY r.data, r.id`, [ordineId]);

/** Elimina un DDT ricevuto registrato per errore: per i fornitori toglie i pezzi dagli arrivati dell'ordine. */
export async function eliminaDdtRicevuto(id: number): Promise<void> {
  await transazione(async c => {
    const r = (await c.query(`SELECT * FROM ddt_ricevuti WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!r) return;
    if (r.mittente === 'fornitore') for (const x of r.righe as RigaDdtRicevutoDb[]) if (x.ordineId && x.posizione)
      await c.query(`UPDATE documenti_righe SET arrivati = greatest(0, arrivati - $3) WHERE documento_id = $1 AND posizione = $2`, [x.ordineId, x.posizione, x.quantita]);
    await c.query(`DELETE FROM ddt_ricevuti WHERE id = $1`, [id]);
    if (r.acquisizione_id) await c.query(`UPDATE acquisizioni SET stato = 'da_confermare', confermato_da = NULL WHERE id = $1 AND stato = 'confermato'`, [r.acquisizione_id]);
  });
}
