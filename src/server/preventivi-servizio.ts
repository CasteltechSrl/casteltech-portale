/**
 * Logica dei preventivi lato server: calcolo con un catalogo, salvataggio, anagrafiche.
 */
import type pg from 'pg';
import { calcolaPreventivo, type Risultato, type Tariffe } from '../engine/calcolo.js';
import type { Catalogo } from './catalogo-db.js';
import { q1, transazione } from './db.js';
import { maiuscolo } from './anagrafiche-servizio.js';

export interface DatiPreventivo {
  clienteId: number | null;      // dalle anagrafiche (obbligatorio per i preventivi nuovi)
  prodottoId: number | null;
  cliente: string;               // testi come compaiono nel preventivo (presi dalle anagrafiche, in maiuscolo)
  codice: string;
  revisione: string;
  descrizione: string;
  nSchede: number;
  nSchedeInPCB: number;
  tariffe: Tariffe;
  parametri: Record<string, number>;
  personeFase: Record<string, number>;
  prezziMateriali: Record<string, number>;
  prezzoTargetScheda?: number | null;
  note?: string;
}

const numero = (x: unknown) => { const n = Number(String(x ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
/** Durata scritta come "1:30", "30'", "1h30", "45m" o numero di ore → ore decimali. */
export function oreDa(x: unknown): number {
  const t = String(x ?? '').trim().toLowerCase().replace(',', '.');
  if (!t) return 0;
  let m = t.match(/^(\d+):(\d{1,2})$/);
  if (m) return Number(m[1]) + Number(m[2]) / 60;
  m = t.match(/^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+)\s*(?:'|m|min)?)?$/);
  if (m && (m[1] || m[2]) && /h|'|m/.test(t)) return Number(m[1] ?? 0) + Number(m[2] ?? 0) / 60;
  return numero(t);
}

/** Ripulisce i dati arrivati dal browser. */
export function normalizza(d: any, cat: Catalogo): DatiPreventivo {
  const parametri: Record<string, number> = {};
  for (const p of cat.parametri) if (d?.parametri?.[p.codice] !== undefined && d.parametri[p.codice] !== '')
    parametri[p.codice] = p.tipo === 'durata' ? oreDa(d.parametri[p.codice]) : numero(d.parametri[p.codice]);
  // spunte delle informazioni generali tolte: le quantità nascoste non devono contare
  const haSpunta = (cod: string) => cat.parametri.some(p => p.codice === cod && p.gruppo === 'INFORMAZIONI GENERALI');
  if (haSpunta('presenteSmd') && parametri.presenteSmd === 0)
    for (const k of ['qtSmd', 'qtFeeder', 'qtSmdLatoB', 'qtFeederLatoB']) parametri[k] = 0;
  if (haSpunta('presenteTht') && haSpunta('usaOnda') && parametri.presenteTht === 0 && parametri.usaOnda === 0)
    for (const k of ['qtTht', 'qtTipolTht', 'qtPthdaPreparare', 'qntCompMontaggio', 'qntPuntiSaldaturaMano', 'tempoProtezione', 'tempoDiRevisione', 'tempoSeparazioneSchede']) parametri[k] = 0;
  const personeFase: Record<string, number> = {};
  for (const f of cat.fasi) {
    const v = d?.personeFase?.[f.codice];
    if (v !== undefined && v !== '' && numero(v) !== f.persone) personeFase[f.codice] = Math.max(0, numero(v));
  }
  const prezziMateriali: Record<string, number> = {};
  for (const m of cat.materiali) prezziMateriali[m.codice] = d?.prezziMateriali?.[m.codice] !== undefined ? numero(d.prezziMateriali[m.codice]) : m.costo;
  const id = (x: unknown) => (x == null || x === '' || !Number.isFinite(Number(x)) ? null : Number(x));
  return {
    clienteId: id(d?.clienteId), prodottoId: id(d?.prodottoId),
    cliente: maiuscolo(d?.cliente),
    codice: maiuscolo(d?.codice),
    revisione: maiuscolo(d?.revisione),
    descrizione: maiuscolo(d?.descrizione),
    nSchede: Math.max(0, Math.round(numero(d?.nSchede))),
    nSchedeInPCB: Math.max(1, Math.round(numero(d?.nSchedeInPCB) || 1)),
    tariffe: {
      costoAziendaH: numero(d?.tariffe?.costoAziendaH),
      costoOperatoreProduzioneH: numero(d?.tariffe?.costoOperatoreProduzioneH),
      costoOperatoreUfficioH: numero(d?.tariffe?.costoOperatoreUfficioH),
      ricarico: numero(d?.tariffe?.ricarico),
    },
    parametri, personeFase, prezziMateriali,
    prezzoTargetScheda: d?.prezzoTargetScheda === '' || d?.prezzoTargetScheda == null ? null : numero(d.prezzoTargetScheda),
    note: String(d?.note ?? ''),
  };
}

export const nPannelli = (nSchede: number, perPannello: number) => Math.ceil(nSchede / Math.max(1, perPannello));

export function calcola(cat: Catalogo, d: DatiPreventivo): Risultato {
  const vars: Record<string, number> = {};
  for (const p of cat.parametri) if (p.default != null) vars[p.codice] = p.default;
  for (const m of cat.materiali) { vars['prezzo_' + m.codice] = d.prezziMateriali[m.codice] ?? m.costo; vars['qta_' + m.codice] = m.quantita ?? 0; }
  Object.assign(vars, d.parametri);
  vars.nSchedeInPCB = d.nSchedeInPCB;
  vars.nPCB = nPannelli(d.nSchede, d.nSchedeInPCB);
  return calcolaPreventivo(cat.fasi, cat.voci, d.tariffe, { nSchede: d.nSchede, parametri: vars, personeFase: d.personeFase });
}

/** Revisione del prodotto (creata se manca); un prodotto senza cliente viene assegnato a questo cliente. */
async function revisioneProdotto(c: pg.PoolClient, prodottoId: number | null, clienteId: number | null, revisione: string): Promise<number | null> {
  if (!prodottoId) return null;
  if (clienteId) await c.query(`UPDATE prodotti SET cliente_id = $2 WHERE id = $1 AND cliente_id IS NULL`, [prodottoId, clienteId]);
  return (await c.query(
    `INSERT INTO prodotti_revisioni (prodotto_id, revisione) VALUES ($1,$2)
     ON CONFLICT (prodotto_id, revisione) DO UPDATE SET revisione = EXCLUDED.revisione RETURNING id`, [prodottoId, revisione])).rows[0].id;
}

export async function salvaPreventivo(opz: {
  id?: number; dati: DatiPreventivo; catalogo: Catalogo; utenteId: number;
  origine?: 'nuovo' | 'vecchio_portale' | 'prezzo_corretto'; legacyId?: string; datiVecchioPortale?: unknown; creatoIl?: string;
}): Promise<number> {
  const { dati, catalogo } = opz;
  const ris = calcola(catalogo, dati);
  return transazione(async c => {
    const revId = await revisioneProdotto(c, dati.prodottoId, dati.clienteId, dati.revisione);
    const campi = [dati.clienteId, revId, dati.nSchede, dati.nSchedeInPCB, dati.tariffe,
      dati.parametri, dati.personeFase, catalogo, ris, ris.totali.totalePrimoLotto, ris.totali.totaleSecondoLotto,
      dati.prezzoTargetScheda ?? null, dati.note ?? '',
      { cliente: dati.cliente, codice: dati.codice, revisione: dati.revisione, descrizione: dati.descrizione }, dati.prezziMateriali];
    if (opz.id) {
      await c.query(`UPDATE preventivi SET cliente_id=$2, revisione_id=$3, n_schede=$4, n_schede_pannello=$5, tariffe=$6, parametri=$7,
        persone_fase=$8, catalogo=$9, risultato=$10, totale_primo_lotto=$11, totale_secondo_lotto=$12, prezzo_target_scheda=$13, note=$14,
        intestazione=$15, prezzi_materiali=$16, aggiornato_il=now() WHERE id=$1`, [opz.id, ...campi]);
      return opz.id;
    }
    const r = await c.query(`INSERT INTO preventivi (numero, cliente_id, revisione_id, n_schede, n_schede_pannello, tariffe, parametri,
        persone_fase, catalogo, risultato, totale_primo_lotto, totale_secondo_lotto, prezzo_target_scheda, note, intestazione, prezzi_materiali, creato_da,
        origine, legacy_id, dati_vecchio_portale, creato_il)
      VALUES ('P' || to_char(coalesce($20::timestamptz, now()), 'YYYY') || '-' || lpad(nextval('numerazione_preventivi')::text, 4, '0'),
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19, coalesce($20::timestamptz, now())) RETURNING id`,
      [...campi, opz.utenteId, opz.origine ?? 'nuovo', opz.legacyId ?? null, opz.datiVecchioPortale ?? null, opz.creatoIl ?? null]);
    return r.rows[0].id;
  });
}

/** Ricostruisce i dati del form da un preventivo salvato. */
export function datiDaRiga(r: any): DatiPreventivo {
  const i = r.intestazione ?? {};
  return {
    clienteId: r.cliente_id ?? null, prodottoId: r.prodotto_id ?? null,
    cliente: i.cliente ?? '', codice: i.codice ?? '', revisione: i.revisione ?? '', descrizione: i.descrizione ?? '',
    nSchede: r.n_schede, nSchedeInPCB: r.n_schede_pannello, tariffe: r.tariffe, parametri: r.parametri ?? {},
    personeFase: r.persone_fase ?? {}, prezziMateriali: r.prezzi_materiali ?? {},
    prezzoTargetScheda: r.prezzo_target_scheda, note: r.note ?? '',
  };
}

export const leggiPreventivo = (id: number) => q1(
  `SELECT p.*, r.prodotto_id FROM preventivi p LEFT JOIN prodotti_revisioni r ON r.id = p.revisione_id WHERE p.id = $1`, [id]);
