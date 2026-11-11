/**
 * Flusso di produzione (Adriano 6/11/2026): letture e azioni delle cinque finestre del cruscotto. Le regole stanno in `engine/flusso.ts`.
 * Tutto si legge una volta all'apertura del cruscotto (Neon): righe d'ordine aperte, commesse collegate (con fasi, tempi del reparto e
 * fine lavorazione), preventivo di riferimento (spunte e tempi), DDT del portale (in attesa di corriere / partiti).
 */
import { preventiviDelCliente } from './preventivi-ordini-servizio.js';
import { propostaPreventivo } from '../engine/preventivi-ordini.js';
import { q, q1 } from './db.js';
import { righeOrdini, type RigaElenco } from './ordini-servizio.js';
import { rigaOrdinePerCommessa } from '../engine/ddt.js';
import { daEvadere } from '../engine/ordini.js';
import {
  GIORNI_SPEDITE, aggiungiFineLavorazione, leggiFineLavorazione, leggiStatoFlusso, nuovaPriorita, ordinaPerPriorita, valutaRiga,
  type DdtRiga, type FineLavorazione, type Finestra, type Firma, type RigaFlusso, type StatoFlusso, type Valutazione,
} from '../engine/flusso.js';

export interface RigaCruscottoFlusso extends RigaFlusso {
  ordineId: number; numero: number; anno: number; cliente: string; codice: string | null; descrizione: string | null; prodottoId: number | null;
  consegna: string | null; prevista: string | null; ritardo: number | null;
  commessaNumero: string | null; commessaId: number | null;
  clienteId: number | null;
  /** preventivo della riga (Adriano 11/11/2026): collegato (proposto = false) o proposto dal portale da verificare nell'ordine */
  preventivo: { id: number; numero: string; proposto: boolean } | null;
  valutazione: Valutazione;
  posizione: number;
}
export interface Spedita { data: string; ordineId: number | null; numero: number | null; anno: number | null; cliente: string; codice: string | null; descrizione: string | null; quantita: number; ddtId: number; ddt: string; consegnaRichiesta: string | null; ritardo: number | null; commessaNumero: string | null }
export interface DatiFlusso { righe: RigaCruscottoFlusso[]; perFinestra: Record<Finestra, RigaCruscottoFlusso[]>; spedite: Spedita[]; conta: Record<Finestra, number>; schedeSpedite: number; inAttesaCorriere: number; inRitardo: number; parziali: number }

const isoData = (d: unknown) => (d == null ? null : typeof d === 'string' ? d.slice(0, 10) : (d as Date).toISOString().slice(0, 10));
const isoOra = (d: unknown) => (d == null ? null : typeof d === 'string' ? d : (d as Date).toISOString());

interface CommessaDb { id: number; numero: string; stato: string; quantita: number; preventivo_id: number | null; prodotto_id: number | null; ordine_cliente: string | null; cliente_id: number; fine_lavorazione: unknown }

export async function datiFlusso(oggi: string, righeGia?: RigaElenco[]): Promise<DatiFlusso> {
  const tutte = righeGia ?? await righeOrdini();
  // DDT del portale con la riga d'ordine o la commessa: servono per "in attesa di corriere" e per le spedite del mese
  const ddtRighe = await q<{ id: number; numero: number | null; sezionale: string | null; data: string; stato: string; partito_il: unknown; quantita: number; riga_ordine_id: number | null; commessa_id: number | null; cliente_id: number | null; codice: string | null; descrizione: string | null; riga_id: number }>(`
    SELECT d.id, d.numero, d.sezionale, d.data::text AS data, d.stato, d.partito_il, x.quantita::float AS quantita, x.riga_ordine_id,
      coalesce(x.commessa_id, d.commessa_id) AS commessa_id, d.cliente_id, x.codice, x.descrizione, x.id AS riga_id,
      coalesce(cl.ragione_sociale, d.intestatario->>'ragione_sociale', d.intestatario->>'nome', '') AS cliente_nome
    FROM documenti d JOIN documenti_righe x ON x.documento_id = d.id LEFT JOIN clienti cl ON cl.id = d.cliente_id
    WHERE d.tipo = 'ddt' AND d.stato NOT IN ('bozza', 'annullato') AND NOT x.solo_descrizione AND x.quantita > 0
      AND (d.partito_il IS NULL OR d.partito_il >= ($1::date - ${GIORNI_SPEDITE})::timestamptz)
    ORDER BY d.data DESC, d.id DESC, x.posizione`, [oggi]);
  // commesse non chiuse (e quelle rientrate di recente, che possono ancora spedire)
  const commesse = await q<CommessaDb>(`
    SELECT c.id, c.numero, c.stato, c.quantita, c.preventivo_id, r.prodotto_id, c.ordine_cliente, c.cliente_id, c.fine_lavorazione
    FROM commesse c JOIN prodotti_revisioni r ON r.id = c.revisione_id
    WHERE c.stato IN ('aperta', 'in_produzione') OR c.rientrata_il >= now() - interval '120 days' OR c.id = ANY($1::int[])`,
    [[...new Set(tutte.map(r => r.commessaId).filter((x): x is number => x != null))]]);
  // riga d'ordine → commessa: prima quella scritta sulla riga, poi la regola della filiera (stesso prodotto, riferimento dell'ordine)
  const commessaDiRiga = new Map<number, CommessaDb>();
  for (const c of commesse) {
    const r = rigaOrdinePerCommessa(tutte.filter(x => x.clienteId === c.cliente_id && (x.commessaId == null || x.commessaId === c.id)), c);
    if (r && !commessaDiRiga.has(r.id)) commessaDiRiga.set(r.id, c);
  }
  const inAttesa = new Set(ddtRighe.filter(d => !d.partito_il).flatMap(d => [d.riga_ordine_id, ...[...commessaDiRiga].filter(([, c]) => c.id === d.commessa_id).map(([id]) => id)]).filter((x): x is number => x != null));
  const aperte = tutte.filter(r => (r.tipo === 'scheda' && daEvadere([r]).length > 0) || inAttesa.has(r.id));
  if (!aperte.length) return { righe: [], perFinestra: vuote(), spedite: speditePerRighe(ddtRighe, tutte, commessaDiRiga, oggi), conta: conta([]), schedeSpedite: 0, inAttesaCorriere: 0, inRitardo: 0, parziali: 0 };

  const ids = aperte.map(r => r.id);
  const idsCommesse = [...new Set([...commessaDiRiga.values()].map(c => c.id))];
  const ordiniPrev = new Map((await q<{ id: number; preventivo_id: number | null }>(`SELECT id, preventivo_id FROM ordini WHERE id = ANY($1::int[])`, [[...new Set(aperte.map(r => r.ordineId))]])).map(o => [o.id, o.preventivo_id]));
  // preventivo di ogni riga: collegato nell'ordine, della commessa o dell'ordine creato dal preventivo, altrimenti proposto (da verificare)
  const clientiSenza = [...new Set(aperte.filter(r => !r.preventivoId && r.clienteId != null).map(r => r.clienteId!))];
  const candidatiCliente = new Map(await Promise.all(clientiSenza.map(async id => [id, await preventiviDelCliente(id)] as const)));
  const numeriPrev = new Map<number, string>();
  for (const l of candidatiCliente.values()) for (const k of l) numeriPrev.set(k.id, k.numero);
  const prevRiga = new Map<number, { id: number; proposto: boolean }>();
  for (const r of aperte) {
    const c = commessaDiRiga.get(r.id);
    const certo = r.preventivoId ?? c?.preventivo_id ?? ordiniPrev.get(r.ordineId) ?? null;
    if (certo != null) { prevRiga.set(r.id, { id: certo, proposto: false }); continue; }
    const pr = r.clienteId != null ? propostaPreventivo({ prodottoId: r.prodottoId, codici: [r.codice, r.codiceCliente], quantita: r.quantita, dataOrdine: isoData(r.dataOrdine) },
      candidatiCliente.get(r.clienteId) ?? []) : null;
    if (pr) prevRiga.set(r.id, { id: pr.id, proposto: true });
  }
  const [stati, fasi, tempi, preventivi, ultimiPerProdotto] = await Promise.all([
    q<any>(`SELECT * FROM flusso_righe WHERE riga_id = ANY($1::int[])`, [ids]),
    q<{ commessa_id: number; codice: string; gruppo: string; ciclo: number }>(`SELECT cf.commessa_id, cf.fase_codice AS codice, f.gruppo, cf.ciclo_previsto_sec::float AS ciclo
      FROM commesse_fasi cf JOIN fasi f ON f.codice = cf.fase_codice WHERE cf.commessa_id = ANY($1::int[])`, [idsCommesse]),
    q<{ commessa_id: number; fase_codice: string }>(`SELECT DISTINCT commessa_id, fase_codice FROM rilevazioni WHERE commessa_id = ANY($1::int[]) AND (aperta_il IS NULL OR chiusa_il IS NOT NULL)`, [idsCommesse]),
    q<{ id: number; numero: string; parametri: Record<string, unknown> }>(`SELECT id, numero, parametri FROM preventivi WHERE id = ANY($1::int[])`,
      [[...new Set([...commesse.map(c => c.preventivo_id), ...ordiniPrev.values(), ...[...prevRiga.values()].map(x => x.id)].filter((x): x is number => x != null))]]),
    q<{ prodotto_id: number; parametri: Record<string, unknown> }>(`SELECT DISTINCT ON (pr.prodotto_id) pr.prodotto_id, p.parametri FROM preventivi p JOIN prodotti_revisioni pr ON pr.id = p.revisione_id
      WHERE pr.prodotto_id = ANY($1::int[]) AND p.stato <> 'rifiutato' ORDER BY pr.prodotto_id, p.creato_il DESC`, [[...new Set(aperte.map(r => r.prodottoId).filter((x): x is number => x != null))]]),
  ]);
  const parametriPrev = new Map(preventivi.map(p => [p.id, p.parametri]));
  for (const p of preventivi) numeriPrev.set(p.id, p.numero);
  const parametriProdotto = new Map(ultimiPerProdotto.map(p => [p.prodotto_id, p.parametri]));
  const statoDi = new Map(stati.map(s => [s.riga_id, leggiStatoFlusso(s)]));
  const fasiDi = new Map<number, { codice: string; gruppo: string; cicloSec: number }[]>();
  for (const f of fasi) (fasiDi.get(f.commessa_id) ?? fasiDi.set(f.commessa_id, []).get(f.commessa_id)!).push({ codice: f.codice, gruppo: f.gruppo, cicloSec: f.ciclo });
  const tempiDi = new Map<number, string[]>();
  for (const t of tempi) (tempiDi.get(t.commessa_id) ?? tempiDi.set(t.commessa_id, []).get(t.commessa_id)!).push(t.fase_codice);

  const righe: Omit<RigaCruscottoFlusso, 'posizione'>[] = aperte.map(r => {
    const c = commessaDiRiga.get(r.id) ?? null;
    const pr = prevRiga.get(r.id) ?? null;
    const prevId = pr?.id ?? null;
    const parametri = (prevId != null ? parametriPrev.get(prevId) : undefined) ?? (r.prodottoId != null ? parametriProdotto.get(r.prodottoId) : undefined) ?? null;
    const ddt: DdtRiga[] = ddtRighe.filter(d => d.riga_ordine_id === r.id || (c && d.commessa_id === c.id && d.riga_ordine_id == null))
      .map(d => ({ id: d.id, numero: d.numero, sezionale: d.sezionale, data: d.data, quantita: d.quantita, partitoIl: isoOra(d.partito_il), stato: d.stato }));
    // DDT già partiti contati nelle "già partite": abbinati per codice (storico FIC, Adriano 11/11/2026: DDT 217 di 499 pz non mostrato) o collegati alla riga
    const giaPartiti = r.spedizioni.map(s => ({ documento: s.documento, quantita: s.quantita }));
    for (const d of ddt.filter(x => x.partitoIl)) {
      const documento = `DDT ${d.numero ?? '—'} del ${d.data.slice(8, 10)}/${d.data.slice(5, 7)}/${d.data.slice(0, 4)}`;
      if (!giaPartiti.some(g => g.documento === documento)) giaPartiti.push({ documento, quantita: d.quantita });
    }
    const riga: RigaFlusso = {
      id: r.id, quantita: r.quantita, quantitaSpedita: r.quantitaSpedita, residuoQuantita: r.residuoQuantita, stato: r.stato,
      consegnaRichiesta: r.consegnaRichiesta ? isoData(r.consegnaRichiesta) : null, dataOrdine: isoData(r.dataOrdine),
      parametri, righeOrdine: tutte.filter(x => x.ordineId === r.ordineId && x.id !== r.id && x.tipo === 'servizio').map(x => ({ codice: x.codice, descrizione: x.descrizione })),
      commessa: c ? { id: c.id, numero: c.numero, stato: c.stato, quantita: c.quantita, fineLavorazione: leggiFineLavorazione(c.fine_lavorazione), fasi: fasiDi.get(c.id) ?? [], fasiConTempi: tempiDi.get(c.id) ?? [] } : null,
      ddt, giaPartiti, flusso: statoDi.get(r.id) ?? { priorita: null, acquisti: {}, materiale: {}, produzione: {}, inProduzione: null },
    };
    return {
      ...riga, ordineId: r.ordineId, numero: r.numero, anno: r.anno, cliente: r.cliente, codice: r.codice, descrizione: r.descrizione, prodottoId: r.prodottoId,
      consegna: r.consegna, prevista: r.prevista, ritardo: r.ritardo, commessaNumero: c?.numero ?? null, commessaId: c?.id ?? null, clienteId: r.clienteId,
      preventivo: pr ? { id: pr.id, numero: numeriPrev.get(pr.id) ?? `#${pr.id}`, proposto: pr.proposto } : null, valutazione: valutaRiga(riga),
    };
  }).filter(r => r.valutazione.finestre.length > 0);
  const ordinate = ordinaPerPriorita(righe.map(r => ({ ...r, consegna: r.consegnaRichiesta ?? r.consegna, priorita: r.flusso.priorita })));
  const perFinestra = vuote();
  for (const r of ordinate) for (const f of r.valutazione.finestre) perFinestra[f].push(r);
  const spedite = speditePerRighe(ddtRighe, tutte, commessaDiRiga, oggi);
  perFinestra.spedite = [];
  return {
    righe: ordinate, perFinestra, spedite, conta: { ...conta(ordinate), spedite: spedite.length },
    schedeSpedite: spedite.reduce((a, s) => a + s.quantita, 0),
    inAttesaCorriere: perFinestra.spedire.filter(r => r.valutazione.inAttesaCorriere > 0).length,
    inRitardo: perFinestra.acquistare.filter(r => r.consegna && r.consegna < oggi).length,
    parziali: perFinestra.produzione.filter(r => r.valutazione.finite > 0).length,
  };
}

const vuote = (): Record<Finestra, RigaCruscottoFlusso[]> => ({ acquistare: [], preparare: [], produzione: [], spedire: [], spedite: [] });
const conta = (righe: RigaCruscottoFlusso[]): Record<Finestra, number> => {
  const c: Record<Finestra, number> = { acquistare: 0, preparare: 0, produzione: 0, spedire: 0, spedite: 0 };
  for (const r of righe) for (const f of r.valutazione.finestre) c[f]++;
  return c;
};

/** Spedizioni partite negli ultimi 30 giorni (DDT con "Spedito"), collegate alla riga d'ordine quando si sa quale. */
function speditePerRighe(ddtRighe: any[], tutte: RigaElenco[], commessaDiRiga: Map<number, CommessaDb>, oggi: string): Spedita[] {
  const da = new Date(`${oggi}T00:00:00Z`); da.setUTCDate(da.getUTCDate() - GIORNI_SPEDITE);
  const perChiave = new Map<string, RigaElenco>();
  for (const r of tutte) for (const s of r.spedizioni) perChiave.set(s.chiave, r);
  const perId = new Map(tutte.map(r => [r.id, r]));
  const rigaDiCommessa = new Map([...commessaDiRiga].map(([rigaId, c]) => [c.id, rigaId]));
  const out: Spedita[] = [];
  for (const d of ddtRighe) {
    const partito = isoOra(d.partito_il);
    if (!partito || new Date(partito) < da) continue;
    const r = (d.riga_ordine_id != null ? perId.get(d.riga_ordine_id) : undefined) ?? perChiave.get('P' + d.riga_id) ?? (d.commessa_id != null && rigaDiCommessa.has(d.commessa_id) ? perId.get(rigaDiCommessa.get(d.commessa_id)!) : undefined);
    const c = d.commessa_id != null ? [...commessaDiRiga.values()].find(x => x.id === d.commessa_id) : undefined;
    const consegna = r?.consegnaRichiesta ? isoData(r.consegnaRichiesta) : null;
    const giornoPartenza = partito.slice(0, 10);
    out.push({
      data: giornoPartenza, ordineId: r?.ordineId ?? null, numero: r?.numero ?? null, anno: r?.anno ?? null, cliente: r?.cliente ?? d.cliente_nome ?? '',
      codice: r?.codice ?? d.codice, descrizione: r?.descrizione ?? d.descrizione, quantita: d.quantita, ddtId: d.id,
      ddt: `DDT ${d.numero ?? '—'}${d.sezionale ? '/' + d.sezionale : ''}`, consegnaRichiesta: consegna,
      ritardo: consegna ? Math.round((Date.parse(giornoPartenza) - Date.parse(consegna)) / 86_400_000) : null, commessaNumero: c?.numero ?? null,
    });
  }
  return out.sort((a, b) => b.data.localeCompare(a.data) || b.ddtId - a.ddtId);
}

// ───────────────────────────── azioni ─────────────────────────────

async function statoRiga(rigaId: number): Promise<StatoFlusso> {
  return leggiStatoFlusso(await q1(`SELECT * FROM flusso_righe WHERE riga_id = $1`, [rigaId]));
}
async function salvaStato(rigaId: number, s: StatoFlusso): Promise<void> {
  await q(`INSERT INTO flusso_righe (riga_id, priorita, acquisti, materiale, produzione, in_produzione, aggiornato_il)
    VALUES ($1, $2, $3, $4, $5, $6, now())
    ON CONFLICT (riga_id) DO UPDATE SET priorita = $2, acquisti = $3, materiale = $4, produzione = $5, in_produzione = $6, aggiornato_il = now()`,
    [rigaId, s.priorita, JSON.stringify(s.acquisti), JSON.stringify(s.materiale), JSON.stringify(s.produzione), s.inProduzione ? JSON.stringify(s.inProduzione) : null]);
}

const firma = (utente: string): Firma => ({ da: utente, il: new Date().toISOString() });

/** Spunta (o toglie) una voce: cose comprate, materiale verificato per fase, fase di produzione fatta. */
export async function spunta(rigaId: number, gruppo: string, chiave: string, valore: boolean, utente: string): Promise<void> {
  const s = await statoRiga(rigaId);
  const g = gruppo === 'acquisti' ? s.acquisti : gruppo === 'materiale' ? s.materiale : gruppo === 'produzione' ? s.produzione : null;
  if (!g || !chiave || chiave.length > 60) return;
  if (valore) { if (!g[chiave]) g[chiave] = firma(utente); } else delete g[chiave];
  await salvaStato(rigaId, s);
}

/** Priorità scritta a mano (su, giù, numero) o di nuovo automatica. */
export async function cambiaPriorita(rigaId: number, azione: string, posizione: number, numero: unknown, totale: number): Promise<void> {
  const s = await statoRiga(rigaId);
  s.priorita = nuovaPriorita(azione, posizione, numero, totale);
  await salvaStato(rigaId, s);
}

/** Passaggio in produzione dato a mano: la commessa collegata (se c'è) diventa "in produzione". */
export async function passaInProduzione(rigaId: number, commessaId: number | null, utente: string): Promise<void> {
  const s = await statoRiga(rigaId);
  s.inProduzione = firma(utente);
  await salvaStato(rigaId, s);
  if (commessaId) await q(`UPDATE commesse SET stato = 'in_produzione', aggiornato_il = now() WHERE id = $1 AND stato = 'aperta'`, [commessaId]);
}

/** Fine lavorazione sulla commessa (telefono, ufficio, scansione): schede finite, parziale o totale. */
export async function dichiaraFineLavorazione(commessaId: number, quantita: unknown, totale: boolean, chi: string, origine: string, nota = ''): Promise<{ errore?: string; finite: number; quantita: number }> {
  const c = await q1<{ quantita: number; fine_lavorazione: unknown; stato: string }>(`SELECT quantita, fine_lavorazione, stato FROM commesse WHERE id = $1`, [commessaId]);
  if (!c) return { errore: 'Commessa non trovata.', finite: 0, quantita: 0 };
  const prec = leggiFineLavorazione(c.fine_lavorazione);
  const e = aggiungiFineLavorazione(prec, quantita, totale, c.quantita, chi, new Date().toISOString(), origine, nota);
  if (e.errore) return { errore: e.errore, finite: prec.reduce((a, x) => a + x.quantita, 0), quantita: c.quantita };
  await q(`UPDATE commesse SET fine_lavorazione = $2, stato = CASE WHEN stato = 'aperta' THEN 'in_produzione' ELSE stato END, aggiornato_il = now() WHERE id = $1`, [commessaId, JSON.stringify(e.righe)]);
  return { finite: e.righe.reduce((a, x) => a + x.quantita, 0), quantita: c.quantita };
}

export async function fineLavorazioneDi(commessaId: number): Promise<FineLavorazione[]> {
  const c = await q1<{ fine_lavorazione: unknown }>(`SELECT fine_lavorazione FROM commesse WHERE id = $1`, [commessaId]);
  return leggiFineLavorazione(c?.fine_lavorazione);
}

/** Il corriere è passato: i DDT emessi della riga (o della commessa) non ancora partiti diventano partiti adesso. */
export async function segnaSpedito(ddtIds: number[], utente: string): Promise<number> {
  if (!ddtIds.length) return 0;
  const r = await q(`UPDATE documenti SET partito_il = now(), partito_da = $2 WHERE id = ANY($1::int[]) AND tipo = 'ddt' AND stato NOT IN ('bozza', 'annullato') AND partito_il IS NULL RETURNING id`, [ddtIds, utente]);
  return r.length;
}

/** Chiude la riga d'ordine (stato scritto a mano "evaso"): le ultime schede non partiranno. */
export async function chiudiRiga(rigaId: number): Promise<void> {
  await q(`UPDATE ordini_righe SET stato_manuale = 'evaso' WHERE id = $1`, [rigaId]);
}

/** Torna "in attesa di corriere" (premuto per sbaglio). */
export async function togliSpedito(ddtId: number): Promise<void> {
  await q(`UPDATE documenti SET partito_il = NULL, partito_da = NULL WHERE id = $1 AND tipo = 'ddt'`, [ddtId]);
}

export type { Finestra };
