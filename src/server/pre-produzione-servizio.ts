/**
 * Scheda di pre-produzione della commessa (Adriano 5/11/2026): raccoglie in una lettura sola tutto quello che serve prima
 * del via libera: cliente e preventivo, ordine e conferma d'ordine, documenti del cliente (pacchetto con Gerber, BOM, segnalazioni),
 * BOM quotata con le offerte usate nel preventivo, situazione del materiale (ordini a fornitore, materiale del cliente, "già in casa"),
 * storico delle segnalazioni del prodotto, scheda tecnica, checklist. Le regole stanno in `engine/pre-produzione.ts`.
 */
import { q, q1 } from './db.js';
import { leggiCommessa, fasiCommessa, segnalazioniProdotto, schedaTecnica, type FaseScheda, type SchedaTecnica } from './commesse-servizio.js';
import { leggiPreventivo } from './preventivi-servizio.js';
import { mancantiCommessa } from './ordini-fornitore-servizio.js';
import { riepilogo, type Riepilogo } from '../engine/riepilogo.js';
import { conAccettate } from '../engine/scheda/accettate.js';
import { alternativeDaConfermare, componentiDaVerificare } from '../engine/alternative-cliente.js';
import { quantitaBomPerCommessa } from '../engine/cosa-manca.js';
import type { AnalisiScheda } from '../engine/scheda/analisi.js';
import type { FileElenco } from './schede-cliente-servizio.js';
import {
  aggiornaPreProduzione, contestoDaParametri, leggiPreProduzione, moduloDaForm, propostaCosaFare, situazioneMateriale, statoChecklist, vociPerCommessa,
  type ContestoPreProduzione, type PreProduzione, type RigaMateriale, type SituazioneRiga, type StatoChecklist, type StatoMateriale,
} from '../engine/pre-produzione.js';

export interface Pacchetto {
  id: number; nome: string; analizzato_il: string | null; file: FileElenco[]; analisi: AnalisiScheda | null;
  protezioni: { fori?: unknown[]; zone?: unknown[] } | null; stesso: boolean; // stesso = collegato a questo preventivo (altrimenti a uno precedente della stessa revisione)
}

export interface DatiPreProduzione {
  commessa: any; prev: any; cliente: any;
  fasi: FaseScheda[]; scheda: SchedaTecnica; totali: Riepilogo | null;
  ordine: { id: number; anno: number; numero: number; rif_cliente: string | null; data_ordine: string | null; quantita: number; prezzo: number; consegna: string | null; descrizione: string | null } | null;
  conferme: { id: number; numero: number | null; anno: number; data: string; stato: string }[];
  pacchetto: Pacchetto | null;
  bom: { id: number; nome: string; stato: string; quantita: number[]; schede: number | null; righe: RigaMateriale[] } | null;
  materiale: { righe: SituazioneRiga[]; conta: Record<StatoMateriale, number>; totale: number } | null;
  ordiniFornitore: { id: number; numero: number | null; anno: number; stato: string; fornitore: string | null; arrivo: string }[];
  alternative: ReturnType<typeof alternativeDaConfermare>; daVerificare: ReturnType<typeof componentiDaVerificare>;
  storico: { testo: string; origine: string; creato_il: string; numero: string | null }[];
  contesto: ContestoPreProduzione; voci: ReturnType<typeof vociPerCommessa>; pp: PreProduzione; checklist: StatoChecklist;
  proposta: { fare: string[]; nonFare: string[] };
  codiciCliente: number;
}

export async function datiPreProduzione(commessaId: number): Promise<DatiPreProduzione | null> {
  const c = await leggiCommessa(commessaId);
  if (!c) return null;
  const prev = c.preventivo_id ? await leggiPreventivo(c.preventivo_id) : null;
  const cliente = await q1<any>(`SELECT * FROM clienti WHERE id = $1`, [c.cliente_id]);
  const [fasi, storico, ordine, pacchetto, bomRiga, codiciCliente, manca] = await Promise.all([
    fasiCommessa(c),
    c.prodotto_id ? segnalazioniProdotto(c.prodotto_id) : Promise.resolve([]),
    q1<any>(`SELECT r.id, o.id AS ordine_id, o.anno, o.numero, o.rif_cliente, o.data_ordine, r.quantita::float AS quantita, r.prezzo::float AS prezzo,
        coalesce(r.consegna_richiesta, r.consegna_prevista)::text AS consegna, r.descrizione
      FROM ordini_righe r JOIN ordini o ON o.id = r.ordine_id WHERE r.commessa_id = $1 ORDER BY r.id LIMIT 1`, [c.id]),
    prev ? leggiPacchetto(prev.id, prev.revisione_id) : Promise.resolve(null),
    prev?.bom_id ? q1<any>(`SELECT id, nome, stato, quantita, righe FROM bom_analisi WHERE id = $1`, [prev.bom_id]) : Promise.resolve(null),
    q<{ codice: string }>(`SELECT codice FROM componenti_clienti WHERE cliente_id = $1`, [c.cliente_id]),
    mancantiCommessa(c.id),
  ]);
  const conferme = ordine ? await q<any>(`SELECT id, numero, anno, data::text AS data, stato FROM documenti WHERE tipo = 'conferma_ordine' AND ordine_id = $1 AND stato <> 'annullato' ORDER BY id`, [ordine.ordine_id]) : [];
  let totali: Riepilogo | null = null;
  try { totali = prev?.risultato ? riepilogo(prev.risultato) : null; } catch { totali = null; }
  const pp = leggiPreProduzione(c.pre_produzione);
  const righeBom: RigaMateriale[] = (bomRiga?.righe ?? []) as RigaMateriale[];
  const quantita: number[] = (bomRiga?.quantita ?? []).map(Number);
  const schede = bomRiga ? quantitaBomPerCommessa(quantita, Number(c.quantita)) : null;
  const bom = bomRiga ? { id: bomRiga.id, nome: bomRiga.nome, stato: bomRiga.stato, quantita, schede, righe: righeBom } : null;
  const codici = codiciCliente.map(x => x.codice);
  const materiale = bom ? (() => {
    const s = situazioneMateriale(righeBom, schede, manca?.righe ?? [], codici, pp.inCasa);
    const totale = Math.round(s.righe.reduce((a, r) => a + (r.scelta && r.stato !== 'cliente' && r.stato !== 'non_montato' ? r.scelta.totale : 0), 0) * 100) / 100;
    return { ...s, totale };
  })() : null;
  const alternative = bom ? alternativeDaConfermare(righeBom as any) : [];
  const daVerificare = bom ? componentiDaVerificare(righeBom as any) : [];
  const a = pacchetto?.analisi ?? null;
  const contesto = contestoDaParametri(prev?.parametri, {
    primoLotto: !!c.primo_lotto, haDocumenti: !!pacchetto, haBom: !!bom,
    segnalazioniAperte: a ? a.segnalazioni.filter(s => s.livello !== 'info' && !s.accettata).length : 0,
    alternativeDaConfermare: alternative.length,
    materialeDalCliente: !!materiale && materiale.conta.cliente > 0,
    protezioniOnda: a?.lavorazione.saldaturaTht === 'onda' ? (pacchetto?.protezioni?.fori?.length ?? 0) + (pacchetto?.protezioni?.zone?.length ?? 0) : null,
  });
  const voci = vociPerCommessa(contesto);
  const scheda = schedaTecnica(c.scheda_tecnica);
  const proposta = propostaCosaFare({
    contesto, saldaturaMotivo: a?.lavorazione.motivo, noteMontaggio: scheda.noteMontaggio, noteCliente: a?.noteCliente,
    segnalazioniProdotto: storico.filter(s => s.numero !== c.numero), segnalazioniPreanalisi: a?.segnalazioni,
    componentiCritici: daVerificare.filter(x => !x.quotato).map(x => `${x.codice} (${x.riferimenti}): ${x.problema}`), notePreventivo: prev?.note,
  });
  return {
    commessa: c, prev, cliente, fasi, scheda, totali,
    ordine: ordine ? { id: ordine.ordine_id, anno: ordine.anno, numero: ordine.numero, rif_cliente: ordine.rif_cliente, data_ordine: ordine.data_ordine, quantita: ordine.quantita, prezzo: ordine.prezzo, consegna: ordine.consegna, descrizione: ordine.descrizione } : null,
    conferme, pacchetto, bom, materiale, ordiniFornitore: manca?.ordini ?? [], alternative, daVerificare, storico, contesto, voci, pp,
    checklist: statoChecklist(pp, voci), proposta, codiciCliente: codici.length,
  };
}

/** Pacchetto dei documenti del cliente collegato al preventivo; se non c'è, l'ultimo analizzato di un preventivo della stessa revisione. */
async function leggiPacchetto(preventivoId: number, revisioneId: number | null): Promise<Pacchetto | null> {
  const leggi = (sql: string, par: unknown[]) => q1<any>(`SELECT p.id, p.nome, p.analizzato_il, p.file_elenco, p.analisi, p.accettate, p.protezioni, p.preventivo_id FROM pacchetti_scheda p ${sql}`, par);
  let p = await leggi(`WHERE p.preventivo_id = $1 ORDER BY p.analizzato_il DESC NULLS LAST, p.id DESC LIMIT 1`, [preventivoId]);
  if (!p && revisioneId) p = await leggi(`JOIN preventivi v ON v.id = p.preventivo_id WHERE v.revisione_id = $1 AND p.analisi IS NOT NULL ORDER BY p.analizzato_il DESC NULLS LAST, p.id DESC LIMIT 1`, [revisioneId]);
  if (!p) return null;
  return { id: p.id, nome: p.nome, analizzato_il: p.analizzato_il, file: p.file_elenco ?? [], analisi: p.analisi ? conAccettate(p.analisi, p.accettate) : null,
    protezioni: p.protezioni ?? null, stesso: p.preventivo_id === preventivoId };
}

/** Salva checklist, cosa fare / non fare, "già in casa" e via libera. Restituisce il messaggio per l'ufficio (o l'errore). */
export async function salvaPreProduzione(commessaId: number, body: Record<string, unknown>, utente: { nome: string }): Promise<{ messaggio: string; errore?: string }> {
  const d = await datiPreProduzione(commessaId);
  if (!d) return { messaggio: '', errore: 'Commessa non trovata' };
  const m = moduloDaForm(body);
  const esito = aggiornaPreProduzione(d.pp, m, d.voci, utente.nome, new Date().toISOString());
  await q(`UPDATE commesse SET pre_produzione = $2, aggiornato_il = now() WHERE id = $1`, [commessaId, esito.dati]);
  // via libera dato: la commessa aperta passa "in produzione" (lo stato resta modificabile dalla pagina della commessa)
  if (esito.dati.viaLibera && !d.pp.viaLibera) await q(`UPDATE commesse SET stato = 'in_produzione' WHERE id = $1 AND stato = 'aperta'`, [commessaId]);
  return { messaggio: esito.messaggio, errore: esito.errore };
}
