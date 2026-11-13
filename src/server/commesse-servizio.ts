/**
 * Commesse: un preventivo diventato ordine, con i dati della scheda di produzione.
 * - Le fasi stampate sulla scheda sono quelle del preventivo (con il suo catalogo "fotografato"),
 *   ricalcolate sulla quantità della commessa; le una tantum solo se è il primo lotto.
 * - La scheda tecnica (programmi, lamine, paste, note di montaggio) si salva sulla revisione del prodotto
 *   e si ripropone alla commessa successiva; la commessa ne tiene una copia.
 */
import { randomBytes } from 'node:crypto';
import { q, q1, transazione } from './db.js';
import { calcola, datiDaRiga, leggiPreventivo, nPannelli } from './preventivi-servizio.js';
import type { Catalogo } from './catalogo-db.js';
import type { Rilevazione } from '../engine/consuntivo.js';
import type { Operatore } from '../engine/operatori.js';
import { SQL_CAUSALE_DA_FATTURARE } from '../engine/ddt.js';
import { leggiFineLavorazione } from '../engine/flusso.js';
import { spedizioniCommesse, type SpedizioneCommessa } from '../engine/commesse-spedite.js';
import { caricaCatalogo } from './catalogo-db.js';
import { leggiProgrammi, riempiVuote, aggiornaDaCommessa } from '../engine/programmi-prodotto.js';
import { noteDaProporre } from '../engine/note-prodotto.js';
import { leggiSenzaPreventivo, type FaseCatalogo, type SenzaPreventivo } from '../engine/schede-libere.js';

// ───────────────────────────── scheda tecnica (intestazione della MASTERspec) ─────────────────────────────
/** Campi con TOP e BOT, nell'ordine della scheda. */
export const PROGRAMMI: [string, string][] = [
  ['progArmadio', 'Prog. armadio'], ['progSerigrafia', 'Prog. serigrafia'], ['lamina', 'Lamina'],
  ['progPePFox', 'Prog. P&P FOX'], ['progPePIpulse', 'Prog. P&P iPulse'], ['progAOI', 'Prog. AOI'], ['progForno', 'Prog. forno'],
];
/** Vecchio campo "materiali di saldatura" (tipo): non più usato, sostituito dalla riga Materiale di consumo. */
export const MATERIALI_SALDATURA: [string, string][] = [
  ['pastaSaldante', 'Pasta saldante'], ['stagnoSaldatrice', 'Stagno saldatrice'], ['flussante', 'Flussante / gel'], ['filo', 'Filo di saldatura'],
];

export interface SchedaTecnica {
  programmi: Record<string, { top: string; bot: string }>;
  pasta: string;
  forno: string;                 // (vecchio campo unico del forno: ora è progForno con TOP e BOT)
  materiali: Record<string, string>;
  noteMontaggio: string;
  /** Note del cliente (Adriano 13/11/2026): richieste particolari, stampate nel riquadro delle note di montaggio. */
  noteCliente: string;
}

export function schedaTecnica(x: any): SchedaTecnica {
  const testo = (v: unknown) => String(v ?? '').trim().slice(0, 2000);
  return {
    programmi: Object.fromEntries(PROGRAMMI.map(([k]) => [k, { top: testo(x?.programmi?.[k]?.top), bot: testo(x?.programmi?.[k]?.bot) }])),
    pasta: testo(x?.pasta),
    forno: testo(x?.forno),
    materiali: Object.fromEntries(MATERIALI_SALDATURA.map(([k]) => [k, testo(x?.materiali?.[k])])),
    noteMontaggio: testo(x?.noteMontaggio),
    noteCliente: testo(x?.noteCliente),
  };
}

// ───────────────────────────── fasi previste sulla scheda ─────────────────────────────
export interface FaseScheda {
  codice: string; numero: string; nome: string; gruppo: string; unaTantum: boolean; tariffa: string;
  persone: number; cicloSec: number; uomoSec: number;
}

/** Fasi tolte (Adriano, 24/10/2026) che i preventivi salvati prima possono ancora avere. */
const FASI_TOLTE_DALLA_SCHEDA = ['progForno'];

/** Fasi del preventivo ricalcolate sulla quantità della commessa (solo quelle con un tempo). */
export function fasiPreviste(prev: any, quantita: number, primoLotto: boolean): FaseScheda[] {
  const cat: Catalogo = prev.catalogo;
  const dati = { ...datiDaRiga(prev), nSchede: quantita };
  const ris = calcola(cat, dati);
  return cat.fasi.flatMap(f => {
    const r = ris.fasi.find(x => x.codice === f.codice);
    if (!r || r.secondiCiclo <= 0 || (f.unaTantum && !primoLotto) || FASI_TOLTE_DALLA_SCHEDA.includes(f.codice)) return [];
    return [{ codice: f.codice, numero: f.numero, nome: f.nome, gruppo: f.gruppo, unaTantum: f.unaTantum, tariffa: f.tariffa,
      persone: r.persone, cicloSec: r.secondiCiclo, uomoSec: r.secondiUomo }];
  });
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

/** Crea o aggiorna una commessa dal preventivo. Restituisce l'id, oppure un errore in italiano. */
export async function salvaCommessa(opz: { id?: number; preventivoId: number; dati: DatiCommessa; utenteId: number }): Promise<{ id?: number; errore?: string }> {
  const prev = await leggiPreventivo(opz.preventivoId);
  if (!prev) return { errore: 'Preventivo non trovato' };
  if (!prev.revisione_id || !prev.cliente_id) return { errore: 'Il preventivo non ha cliente e codice dalle anagrafiche: aprilo, sceglili e salvalo' };
  const d = opz.dati;
  if (!(d.quantita > 0)) return { errore: 'Indica la quantità di schede' };
  return scriviCommessa({
    id: opz.id, dati: d, utenteId: opz.utenteId, preventivoId: prev.id, revisioneId: prev.revisione_id, clienteId: prev.cliente_id,
    intestazione: prev.intestazione ?? {}, pannelli: nPannelli(d.quantita, prev.n_schede_pannello), fasi: fasiPreviste(prev, d.quantita, d.primoLotto),
    senza: null,
  });
}

/**
 * Crea o aggiorna una scheda di produzione SENZA preventivo (Adriano 13/11/2026): prodotto e cliente dall'anagrafica,
 * revisione scritta (vuota = l'ultima del prodotto, altrimenti "0"), fasi scelte nel modulo.
 */
export async function salvaCommessaLibera(opz: {
  id?: number; prodottoId: number; revisione: string; senza: SenzaPreventivo; fasi: FaseScheda[]; dati: DatiCommessa; utenteId: number;
}): Promise<{ id?: number; errore?: string }> {
  const d = opz.dati;
  const prod = opz.prodottoId ? await q1<{ id: number; codice: string; descrizione: string | null; cliente_id: number | null; cliente: string | null }>(
    `SELECT p.id, p.codice, p.descrizione, p.cliente_id, c.ragione_sociale AS cliente FROM prodotti p LEFT JOIN clienti c ON c.id = p.cliente_id WHERE p.id = $1`,
    [opz.prodottoId]) : null;
  if (!prod) return { errore: 'Scegli il prodotto dall\'anagrafica (codice del cliente)' };
  if (!prod.cliente_id) return { errore: `Il codice ${prod.codice} non ha il cliente: assegnalo in Anagrafiche → Prodotti` };
  if (!(d.quantita > 0)) return { errore: 'Indica la quantità di schede' };
  if (!opz.fasi.length) return { errore: 'Spunta almeno una fase da stampare sulla scheda' };
  let revisione = opz.revisione.trim().toUpperCase().slice(0, 20);
  if (!revisione) revisione = (await q1<{ revisione: string }>(`SELECT revisione FROM prodotti_revisioni WHERE prodotto_id = $1 ORDER BY creato_il DESC, id DESC LIMIT 1`,
    [prod.id]))?.revisione ?? '0';
  const rev = await q1<{ id: number }>(`INSERT INTO prodotti_revisioni (prodotto_id, revisione) VALUES ($1,$2)
    ON CONFLICT (prodotto_id, revisione) DO UPDATE SET revisione = EXCLUDED.revisione RETURNING id`, [prod.id, revisione]);
  // scheda tecnica vuota su una scheda nuova: quella della revisione o dell'ultima commessa dello stesso codice
  const vuota = JSON.stringify(d.scheda) === JSON.stringify(schedaTecnica({}));
  const dati = !opz.id && vuota ? { ...d, scheda: await schedaTecnicaDaProporre(rev!.id, prod.id) } : d;
  return scriviCommessa({
    id: opz.id, dati, utenteId: opz.utenteId, preventivoId: null, revisioneId: rev!.id, clienteId: prod.cliente_id,
    intestazione: { cliente: prod.cliente ?? '', codice: prod.codice, revisione, descrizione: prod.descrizione ?? '' },
    pannelli: nPannelli(d.quantita, opz.senza.schedePannello), fasi: opz.fasi, senza: opz.senza,
  });
}

async function scriviCommessa(o: {
  id?: number; dati: DatiCommessa; utenteId: number; preventivoId: number | null; revisioneId: number; clienteId: number;
  intestazione: Record<string, unknown>; pannelli: number; fasi: FaseScheda[]; senza: SenzaPreventivo | null;
}): Promise<{ id?: number; errore?: string }> {
  const d = o.dati;
  const numero = d.numero.trim().toUpperCase();
  return transazione(async c => {
    const doppio = numero && (await c.query(`SELECT 1 FROM commesse WHERE numero = $1 AND id IS DISTINCT FROM $2`, [numero, o.id ?? null])).rowCount;
    if (doppio) return { errore: `Esiste già una commessa numero ${numero}` };
    const campi = [d.ordineCliente || null, d.referenteCliente || null, d.dataOrdine, d.dataConsegna, d.quantita, o.pannelli, d.primoLotto,
      d.segnalazioni || null, d.scheda, o.intestazione];
    let id = o.id;
    if (id) {
      // senza preventivo il prodotto si può ancora cambiare; con il preventivo resta quello del preventivo
      await c.query(`UPDATE commesse SET ordine_cliente=$2, referente_cliente=$3, data_ordine=$4, data_consegna=$5, quantita=$6, n_pannelli=$7,
        primo_lotto=$8, segnalazioni=$9, scheda_tecnica=$10, intestazione=$11, numero=coalesce(nullif($12, ''), numero),
        stato=coalesce($13, stato), senza_preventivo = $14,
        revisione_id = CASE WHEN preventivo_id IS NULL THEN $15 ELSE revisione_id END, cliente_id = CASE WHEN preventivo_id IS NULL THEN $16 ELSE cliente_id END,
        aggiornato_il=now() WHERE id=$1`, [id, ...campi, numero, d.stato ?? null, o.senza, o.revisioneId, o.clienteId]);
      await c.query(`DELETE FROM commesse_fasi WHERE commessa_id = $1`, [id]);
    } else {
      id = (await c.query(`INSERT INTO commesse (ordine_cliente, referente_cliente, data_ordine, data_consegna, quantita, n_pannelli, primo_lotto,
          segnalazioni, scheda_tecnica, intestazione, numero, preventivo_id, revisione_id, cliente_id, codice_qr, creato_da, senza_preventivo)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
          coalesce(nullif($11, ''), 'C' || to_char(now(), 'YYYY') || '-' || lpad(nextval('numerazione_commesse')::text, 4, '0')),
          $12,$13,$14,$15,$16,$17) RETURNING id`,
        [...campi, numero, o.preventivoId, o.revisioneId, o.clienteId, randomBytes(9).toString('base64url'), o.utenteId, o.senza])).rows[0].id;
      // se il numero proposto è stato accettato, la numerazione va avanti
      if (/^C\d{4}-\d+$/.test(numero)) await c.query(`SELECT setval('numerazione_commesse', greatest((SELECT last_value FROM numerazione_commesse),
        coalesce(substring($1 from '^C\\d{4}-(\\d+)$')::int, 0)), true)`, [numero]);
      if (o.preventivoId) await c.query(`UPDATE preventivi SET stato = 'accettato', aggiornato_il = now() WHERE id = $1 AND stato IN ('bozza', 'inviato')`, [o.preventivoId]);
    }
    for (const [i, f] of o.fasi.entries())
      await c.query(`INSERT INTO commesse_fasi (commessa_id, fase_codice, ordine, persone_previste, ciclo_previsto_sec, uomo_previsto_sec)
        VALUES ($1,$2,$3,$4,$5,$6)`, [id, f.codice, i, f.persone, Math.round(f.cicloSec), Math.round(f.uomoSec)]);
    // la scheda tecnica si ripropone alla prossima commessa dello stesso prodotto/revisione
    await c.query(`UPDATE prodotti_revisioni SET scheda_tecnica = $2 WHERE id = $1`, [o.revisioneId, d.scheda]);
    // i programmi scritti nella commessa tornano sul prodotto (Adriano 13/11/2026): le caselle vuote non cancellano quelli del prodotto
    const chiavi = PROGRAMMI.map(([k]) => k);
    const pr = (await c.query(`SELECT p.id, p.programmi FROM prodotti p JOIN prodotti_revisioni r ON r.prodotto_id = p.id WHERE r.id = $1`, [o.revisioneId])).rows[0];
    if (pr) await c.query(`UPDATE prodotti SET programmi = $2 WHERE id = $1`,
      [pr.id, aggiornaDaCommessa(leggiProgrammi(pr.programmi, chiavi), leggiProgrammi(d.scheda.programmi, chiavi))]);
    // le note di montaggio scritte nella commessa tornano sul prodotto (Adriano 13/11/2026): vuote = restano quelle del prodotto
    if (pr && d.scheda.noteMontaggio.trim()) await c.query(`UPDATE prodotti SET note_montaggio = $2 WHERE id = $1`, [pr.id, d.scheda.noteMontaggio.trim()]);
    // le segnalazioni scritte nella commessa vanno nello storico del prodotto: stampate anche sulle prossime schede
    await c.query(`DELETE FROM segnalazioni WHERE commessa_id = $1 AND origine = 'ufficio'`, [id]);
    if (d.segnalazioni) await c.query(`INSERT INTO segnalazioni (prodotto_id, revisione_id, commessa_id, origine, testo, rilevante_prossime, autore_id)
      VALUES ((SELECT prodotto_id FROM prodotti_revisioni WHERE id = $1), $1, $2, 'ufficio', $3, true, $4)`, [o.revisioneId, id, d.segnalazioni, o.utenteId]);
    return { id };
  });
}

/** Fasi attive del catalogo (Impostazioni → Fasi), per le schede senza preventivo. */
export async function fasiDelCatalogo(): Promise<FaseCatalogo[]> {
  const numeri = await numeriFasi();
  return (await caricaCatalogo()).fasi.filter(f => !FASI_TOLTE_DALLA_SCHEDA.includes(f.codice)).map(f => ({ codice: f.codice, numero: numeri.get(f.codice) ?? f.numero,
    nome: f.nome, gruppo: f.gruppo, unaTantum: f.unaTantum, tariffa: f.tariffa, persone: Number(f.persone) || 1 }));
}

/**
 * Il preventivo della commessa; per una scheda senza preventivo un "preventivo" vuoto con il catalogo di oggi
 * (nomi e numeri delle fasi, voci di consumo senza previsto), TOP/BOT e schede per pannello scritti nella commessa.
 */
export async function preventivoDellaCommessa(c: any): Promise<any> {
  if (c.preventivo_id) { const p = await leggiPreventivo(c.preventivo_id); if (p) return p; }
  const sp = leggiSenzaPreventivo(c.senza_preventivo);
  return preventivoVuoto(await caricaCatalogo(), sp, c);
}

export function preventivoVuoto(catalogo: Catalogo, sp: SenzaPreventivo | null, c: any = {}): any {
  return {
    id: null, numero: null, senzaPreventivo: sp ?? { modo: 'urgente', doppiaFaccia: false, schedePannello: 1 }, catalogo,
    intestazione: c.intestazione ?? {}, parametri: { doppiaFaccia: sp?.doppiaFaccia ? 1 : 0 },
    n_schede: c.quantita ?? 0, n_schede_pannello: sp?.schedePannello ?? 1, revisione_id: c.revisione_id ?? null, prodotto_id: c.prodotto_id ?? null,
    cliente_id: c.cliente_id ?? null,
  };
}

/** Prodotti dell'anagrafica con il cliente (menu della scheda senza preventivo). */
export const prodottiConCliente = () => q<{ id: number; codice: string; descrizione: string | null; cliente: string; revisione: string | null }>(
  `SELECT p.id, p.codice, p.descrizione, c.ragione_sociale AS cliente,
     (SELECT r.revisione FROM prodotti_revisioni r WHERE r.prodotto_id = p.id ORDER BY r.creato_il DESC, r.id DESC LIMIT 1) AS revisione
   FROM prodotti p JOIN clienti c ON c.id = p.cliente_id ORDER BY c.ragione_sociale, p.codice`);

/** Fasi salvate della commessa, con i nomi dal catalogo del preventivo. */
export async function fasiCommessa(commessa: any): Promise<FaseScheda[]> {
  const prev = commessa.preventivo_id ? await leggiPreventivo(commessa.preventivo_id) : null;
  const cat: Catalogo | undefined = prev?.catalogo;
  const righe = await q(`SELECT cf.*, f.numero, f.nome, f.gruppo, f.una_tantum, f.tariffa FROM commesse_fasi cf JOIN fasi f ON f.codice = cf.fase_codice
    WHERE cf.commessa_id = $1 ORDER BY cf.ordine`, [commessa.id]);
  return righe.map(r => {
    const f = cat?.fasi.find(x => x.codice === r.fase_codice);
    return { codice: r.fase_codice, numero: r.numero ?? f?.numero, nome: f?.nome ?? r.nome, gruppo: f?.gruppo ?? r.gruppo,
      unaTantum: f?.unaTantum ?? r.una_tantum, tariffa: f?.tariffa ?? r.tariffa, persone: Number(r.persone_previste),
      cicloSec: Number(r.ciclo_previsto_sec), uomoSec: Number(r.uomo_previsto_sec) };
  });
}

/** Segnalazioni del prodotto da riportare sulle prossime schede (storico). */
export const segnalazioniProdotto = (prodottoId: number) => q<{ testo: string; origine: string; creato_il: string; numero: string | null }>(`
  SELECT s.testo, s.origine, s.creato_il, c.numero FROM segnalazioni s LEFT JOIN commesse c ON c.id = s.commessa_id
  WHERE s.prodotto_id = $1 AND s.rilevante_prossime ORDER BY s.creato_il DESC LIMIT 10`, [prodottoId]);

export { vociConsumo, consumoReale } from '../engine/consumi.js';

/** Righe del foglio tempi di una commessa, nel formato del motore di calcolo. */
export async function rilevazioniCommessa(commessaId: number): Promise<(Rilevazione & RigaRientro)[]> {
  const righe = await q(`SELECT id, fase_codice, operatore_nome, to_char(data, 'YYYY-MM-DD') AS data, to_char(ora_inizio, 'HH24:MI') AS inizio,
      to_char(ora_fine, 'HH24:MI') AS fine, durata_min, totale_scritto_min, persone, pezzi, tipo, causa, materiale, resp, note, confermata_il
    FROM rilevazioni WHERE commessa_id = $1 ORDER BY riga, id`, [commessaId]);
  return righe.map(r => ({
    fase: r.fase_codice, operatore: r.operatore_nome ?? '', data: r.data ?? undefined, inizio: r.inizio ?? undefined, fine: r.fine ?? undefined,
    durataMin: r.durata_min == null ? undefined : Number(r.durata_min),
    totaleScrittoMin: r.totale_scritto_min == null ? undefined : Number(r.totale_scritto_min),
    persone: Number(r.persone), pezzi: r.pezzi ?? undefined, tipo: r.tipo, causa: r.causa ?? '', materiale: r.materiale ?? '', resp: r.resp ?? '',
    note: r.note ?? '', confermata: !!r.confermata_il,
  }));
}

export interface RigaRientro {
  totaleScrittoMin?: number; materiale?: string; resp?: string; confermata?: boolean;
}

export interface Spedizione { qta: string; colli: string; bancali: string; peso: string; dimensione: string }

/**
 * Salva il rientro della scheda: righe del foglio tempi (sostituiscono le precedenti), consumi del lotto,
 * spedizioni, nuova segnalazione. Con "conferma" l'ufficio approva le righe (S/P compresi) e la commessa
 * diventa "rientrata": serve che non ci siano errori nei controlli.
 */
export async function salvaRientro(opz: {
  commessaId: number; righe: (Rilevazione & RigaRientro)[]; consumi: Record<string, number>; spedizioni: Spedizione[];
  segnalazione?: { testo: string; prossime: boolean; faseCodice?: string }; conferma: boolean; utenteId: number; prodottoId: number; revisioneId: number;
  /** commessa già rientrata: le correzioni dell'ufficio restano confermate anche con un semplice "Salva" */
  giaConfermata?: boolean;
}): Promise<void> {
  const righeConfermate = opz.conferma || !!opz.giaConfermata;
  await transazione(async c => {
    // righe arrivate dal telefono: se l'ufficio le lascia uguali (fase, operatore, giorno, inizio) restano "del telefono",
    // e quelle ancora aperte si possono chiudere dal telefono (con i loro promemoria)
    const chiave = (fase: string, op: string | null | undefined, data: string | null | undefined, inizio: string | null | undefined) =>
      [fase, (op ?? '').trim().toUpperCase(), data ?? '', inizio ?? ''].join('|');
    // Le righe del telefono NON si cancellano e reinseriscono (perderebbero l'id usato dai promemoria e dai link "Chiudi"):
    // quelle presenti nel modulo si aggiornano, quelle chiuse e tolte dal modulo si eliminano, quelle ancora APERTE restano sempre
    // (un operatore può averle aperte mentre l'ufficio aveva la pagina davanti: il suo tempo non va perso; revisione 1/11/2026).
    const daTelefono = new Map<string, { id: number; aperta_il: Date | null; chiusa_il: Date | null }[]>();
    for (const t of (await c.query(`SELECT id, fase_codice, operatore_nome, to_char(data, 'YYYY-MM-DD') AS data, to_char(ora_inizio, 'HH24:MI') AS inizio, aperta_il, chiusa_il
        FROM rilevazioni WHERE commessa_id = $1 AND origine = 'tablet' ORDER BY id`, [opz.commessaId])).rows) {
      const k = chiave(t.fase_codice, t.operatore_nome, t.data, t.inizio);
      daTelefono.set(k, [...(daTelefono.get(k) ?? []), { id: t.id, aperta_il: t.aperta_il, chiusa_il: t.chiusa_il }]);
    }
    await c.query(`DELETE FROM rilevazioni WHERE commessa_id = $1 AND origine <> 'tablet'`, [opz.commessaId]);
    const tenute = new Set<number>();
    for (const [i, r] of opz.righe.entries()) {
      const tel = daTelefono.get(chiave(r.fase, r.operatore, r.data, r.inizio))?.shift();
      const chiusa = tel && (tel.chiusa_il ?? (r.fine || r.durataMin ? new Date() : null));
      const valori = [r.fase, r.operatore || null, r.data || null, r.inizio || null, r.fine || null, r.durataMin ?? null, r.totaleScrittoMin ?? null,
         r.persone ?? 1, r.pezzi ?? null, r.tipo, r.tipo === 'P' ? (r.causa || null) : null, r.materiale || null, r.resp || null,
         r.tipo === 'P' ? null : (r.note || null), i, righeConfermate ? opz.utenteId : null, righeConfermate ? new Date() : null];
      if (tel) {
        tenute.add(tel.id);
        await c.query(`UPDATE rilevazioni SET fase_codice = $2, operatore_nome = $3, data = $4, ora_inizio = $5, ora_fine = $6, durata_min = $7, totale_scritto_min = $8,
            persone = $9, pezzi = $10, tipo = $11, causa = $12, materiale = $13, resp = $14, note = $15, riga = $16, confermata_da = $17, confermata_il = $18, chiusa_il = $19
          WHERE id = $1`, [tel.id, ...valori, chiusa ?? null]);
      } else {
        await c.query(`INSERT INTO rilevazioni (commessa_id, fase_codice, operatore_nome, data, ora_inizio, ora_fine, durata_min, totale_scritto_min,
            persone, pezzi, tipo, causa, materiale, resp, note, riga, confermata_da, confermata_il, origine)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'manuale')`, [opz.commessaId, ...valori]);
      }
    }
    // righe del telefono tolte dal modulo: via se chiuse; se ancora aperte restano (si chiudono dal telefono o dal pulsante "aperta per sbaglio")
    const daTogliere = [...daTelefono.values()].flat().filter(t => !tenute.has(t.id) && t.chiusa_il).map(t => t.id);
    if (daTogliere.length) await c.query(`DELETE FROM rilevazioni WHERE id = ANY($1::int[])`, [daTogliere]);
    await c.query(`UPDATE commesse SET consumi = $2, spedizioni = $3, aggiornato_il = now(),
        stato = CASE WHEN $4 THEN 'rientrata' WHEN stato = 'aperta' AND $5 THEN 'in_produzione' ELSE stato END,
        rientrata_il = CASE WHEN $4 THEN now() ELSE rientrata_il END, rientrata_da = CASE WHEN $4 THEN $6::int ELSE rientrata_da END
      WHERE id = $1`, [opz.commessaId, opz.consumi, JSON.stringify(opz.spedizioni), opz.conferma, opz.righe.length > 0, opz.utenteId]);
    if (opz.segnalazione?.testo)
      await c.query(`INSERT INTO segnalazioni (prodotto_id, revisione_id, commessa_id, fase_codice, origine, testo, rilevante_prossime, autore_id)
        VALUES ($1,$2,$3,$4,'produzione',$5,$6,$7)`, [opz.prodottoId, opz.revisioneId, opz.commessaId, opz.segnalazione.faseCodice || null,
        opz.segnalazione.testo, opz.segnalazione.prossime, opz.utenteId]);
  });
}

export const segnalazioniCommessa = (commessaId: number) => q<{ id: number; testo: string; rilevante_prossime: boolean; creato_il: string; fase_codice: string | null }>(
  `SELECT id, testo, rilevante_prossime, creato_il, fase_codice FROM segnalazioni WHERE commessa_id = $1 ORDER BY creato_il`, [commessaId]);

/**
 * Inserimento rapido dalla pagina della commessa (ufficio): tempi totali per fase, aggiunti in fondo al foglio tempi
 * come righe "solo totale" di tipo S (es. pre-produzione, tempi dimenticati). Se la commessa è già rientrata,
 * le righe nuove sono già confermate.
 */
export async function aggiungiTempi(commessaId: number, righe: { fase: string; durataMin: number; persone: number; note?: string }[],
  utente: { id: number; nome: string }): Promise<number> {
  if (!righe.length) return 0;
  return transazione(async c => {
    const comm = (await c.query(`SELECT stato FROM commesse WHERE id = $1`, [commessaId])).rows[0];
    if (!comm) return 0;
    const confermate = ['rientrata', 'analizzata', 'chiusa'].includes(comm.stato);
    let riga = Number((await c.query(`SELECT coalesce(max(riga), -1) AS n FROM rilevazioni WHERE commessa_id = $1`, [commessaId])).rows[0].n);
    for (const r of righe) {
      await c.query(`INSERT INTO rilevazioni (commessa_id, fase_codice, operatore_nome, data, durata_min, persone, tipo, note, riga, origine, confermata_da, confermata_il)
        VALUES ($1,$2,$3,current_date,$4,$5,'S',$6,$7,'manuale',$8,$9)`,
        [commessaId, r.fase, utente.nome.toUpperCase(), r.durataMin, r.persone, r.note || 'Inserito dalla commessa', ++riga,
         confermate ? utente.id : null, confermate ? new Date() : null]);
    }
    await c.query(`UPDATE commesse SET stato = CASE WHEN stato = 'aperta' THEN 'in_produzione' ELSE stato END, aggiornato_il = now() WHERE id = $1`, [commessaId]);
    return righe.length;
  });
}

/** Operatori con le sigle (Impostazioni → Operatori). */
export async function caricaOperatori(): Promise<Operatore[]> {
  const r = await q1<{ valore: Operatore[] }>(`SELECT valore FROM impostazioni WHERE chiave = 'operatori'`);
  return Array.isArray(r?.valore) ? r!.valore : [];
}

/** Numeri delle fasi come sono ora nel catalogo (la scheda stampa la numerazione attuale). */
export async function numeriFasi(): Promise<Map<string, string>> {
  return new Map((await q<{ codice: string; numero: string }>(`SELECT codice, numero FROM fasi`)).map(f => [f.codice, f.numero]));
}

/**
 * Scheda tecnica da proporre a una nuova commessa: quella della revisione; se è vuota (es. revisione nuova)
 * quella dell'ultima commessa dello stesso codice prodotto.
 */
export async function schedaTecnicaDaProporre(revisioneId: number | null, prodottoId: number | null): Promise<SchedaTecnica> {
  const vuota = (x: any) => !x || JSON.stringify(schedaTecnica(x)) === JSON.stringify(schedaTecnica({}));
  const rev = revisioneId ? await q1<{ scheda_tecnica: any }>(`SELECT scheda_tecnica FROM prodotti_revisioni WHERE id = $1`, [revisioneId]) : null;
  let scheda: SchedaTecnica;
  if (!vuota(rev?.scheda_tecnica)) scheda = schedaTecnica(rev!.scheda_tecnica);
  else {
    const ultima = prodottoId ? await q1<{ scheda_tecnica: any }>(`SELECT c.scheda_tecnica FROM commesse c JOIN prodotti_revisioni r ON r.id = c.revisione_id
      WHERE r.prodotto_id = $1 ORDER BY c.creato_il DESC, c.id DESC LIMIT 1`, [prodottoId]) : null;
    scheda = schedaTecnica(ultima?.scheda_tecnica);
  }
  // caselle ancora vuote: i programmi delle macchine scritti sul prodotto (Adriano 13/11/2026)
  const prod = prodottoId ? await q1<{ programmi: unknown; note_montaggio: string }>(`SELECT programmi, note_montaggio FROM prodotti WHERE id = $1`, [prodottoId]) : null;
  const chiavi = PROGRAMMI.map(([k]) => k);
  const { programmi } = riempiVuote(leggiProgrammi(scheda.programmi, chiavi), leggiProgrammi(prod?.programmi, chiavi));
  // note di montaggio vuote: quelle scritte sul prodotto (anche dalle vecchie schede di produzione, Adriano 13/11/2026)
  return schedaTecnica({ ...scheda, programmi: { ...scheda.programmi, ...programmi }, noteMontaggio: noteDaProporre(scheda.noteMontaggio, prod?.note_montaggio ?? '') });
}

export { programmaForno } from '../engine/forno.js';

/**
 * Schede spedite con DDT per ogni commessa (Adriano 11/11/2026, THS C2026-0075 spedita col DDT 224 ma ancora tra le commesse):
 * regole in `engine/commesse-spedite.ts`, letto all'apertura dell'elenco (due letture, nessuna tabella nuova).
 */
export async function spedizioniDelleCommesse(): Promise<Map<number, SpedizioneCommessa>> {
  const commesse = await q<{ id: number; cliente_id: number | null; prodotto_id: number | null; codice: string | null; quantita: number; stato: string; inizio: string | null; fine_lavorazione: unknown }>(
    `SELECT c.id, c.cliente_id, r.prodotto_id, c.intestazione->>'codice' AS codice, c.quantita, c.stato,
       c.creato_il::date::text AS inizio, c.fine_lavorazione
     FROM commesse c LEFT JOIN prodotti_revisioni r ON r.id = c.revisione_id`);
  if (!commesse.length) return new Map();
  const righe = await q<{ ddt_id: number; numero: number | null; data: string; cliente_id: number | null; prodotto_id: number | null; codice: string | null;
    quantita: number; commessa_riga: number | null; commessa_documento: number | null; commessa_riga_ordine: number | null }>(
    `SELECT d.id AS ddt_id, d.numero, d.data::text AS data, d.cliente_id, x.prodotto_id, x.codice, x.quantita::float AS quantita,
       x.commessa_id AS commessa_riga, d.commessa_id AS commessa_documento, o.commessa_id AS commessa_riga_ordine
     FROM documenti d JOIN documenti_righe x ON x.documento_id = d.id LEFT JOIN ordini_righe o ON o.id = x.riga_ordine_id
     WHERE d.tipo = 'ddt' AND d.numero IS NOT NULL AND d.stato NOT IN ('bozza', 'annullato', 'scartato') AND NOT coalesce(x.solo_descrizione, false)
       AND ${SQL_CAUSALE_DA_FATTURARE}
       AND d.data >= (SELECT min(creato_il::date) FROM commesse)
       AND (x.commessa_id IS NOT NULL OR d.commessa_id IS NOT NULL OR o.commessa_id IS NOT NULL OR d.cliente_id IN (SELECT cliente_id FROM commesse WHERE cliente_id IS NOT NULL))`);
  return spedizioniCommesse(
    commesse.map(c => ({ id: c.id, clienteId: c.cliente_id, prodottoId: c.prodotto_id, codice: c.codice, quantita: Number(c.quantita) || 0, stato: c.stato,
      dataInizio: c.inizio, finite: leggiFineLavorazione(c.fine_lavorazione).reduce((s, f) => s + f.quantita, 0) })),
    righe.map(r => ({ ddtId: r.ddt_id, numero: r.numero, data: r.data, clienteId: r.cliente_id, prodottoId: r.prodotto_id, codice: r.codice, quantita: Number(r.quantita) || 0,
      commessaRiga: r.commessa_riga, commessaDocumento: r.commessa_documento, commessaRigaOrdine: r.commessa_riga_ordine })));
}
