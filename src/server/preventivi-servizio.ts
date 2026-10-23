/**
 * Logica dei preventivi lato server: calcolo con un catalogo, salvataggio, anagrafiche.
 */
import type pg from 'pg';
import { calcolaPreventivo, type Risultato, type Tariffe } from '../engine/calcolo.js';
import type { Catalogo } from './catalogo-db.js';
import { q1, transazione } from './db.js';

export interface DatiPreventivo {
  cliente: string;
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

/** Ripulisce i dati arrivati dal browser. */
export function normalizza(d: any, cat: Catalogo): DatiPreventivo {
  const parametri: Record<string, number> = {};
  for (const p of cat.parametri) if (d?.parametri?.[p.codice] !== undefined && d.parametri[p.codice] !== '') parametri[p.codice] = numero(d.parametri[p.codice]);
  const personeFase: Record<string, number> = {};
  for (const f of cat.fasi) {
    const v = d?.personeFase?.[f.codice];
    if (v !== undefined && v !== '' && numero(v) !== f.persone) personeFase[f.codice] = Math.max(0, numero(v));
  }
  const prezziMateriali: Record<string, number> = {};
  for (const m of cat.materiali) prezziMateriali[m.codice] = d?.prezziMateriali?.[m.codice] !== undefined ? numero(d.prezziMateriali[m.codice]) : m.costo;
  return {
    cliente: String(d?.cliente ?? '').trim(),
    codice: String(d?.codice ?? '').trim(),
    revisione: String(d?.revisione ?? '').trim(),
    descrizione: String(d?.descrizione ?? '').trim(),
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

async function trovaOCreaCliente(c: pg.PoolClient, nome: string): Promise<number | null> {
  if (!nome) return null;
  const e = (await c.query(`SELECT id FROM clienti WHERE lower(ragione_sociale) = lower($1) ORDER BY id LIMIT 1`, [nome])).rows[0];
  if (e) return e.id;
  return (await c.query(`INSERT INTO clienti (ragione_sociale) VALUES ($1) RETURNING id`, [nome])).rows[0].id;
}

async function trovaOCreaRevisione(c: pg.PoolClient, clienteId: number | null, codice: string, descrizione: string, revisione: string): Promise<number | null> {
  if (!clienteId || !codice) return null;
  let p = (await c.query(`SELECT id FROM prodotti WHERE cliente_id = $1 AND lower(codice) = lower($2)`, [clienteId, codice])).rows[0];
  if (!p) p = (await c.query(`INSERT INTO prodotti (cliente_id, codice, descrizione) VALUES ($1,$2,$3) RETURNING id`, [clienteId, codice, descrizione])).rows[0];
  else if (descrizione) await c.query(`UPDATE prodotti SET descrizione = $2 WHERE id = $1 AND coalesce(descrizione,'') = ''`, [p.id, descrizione]);
  const r = (await c.query(
    `INSERT INTO prodotti_revisioni (prodotto_id, revisione) VALUES ($1,$2)
     ON CONFLICT (prodotto_id, revisione) DO UPDATE SET revisione = EXCLUDED.revisione RETURNING id`, [p.id, revisione])).rows[0];
  return r.id;
}

export async function salvaPreventivo(opz: {
  id?: number; dati: DatiPreventivo; catalogo: Catalogo; utenteId: number;
  origine?: 'nuovo' | 'vecchio_portale' | 'prezzo_corretto'; legacyId?: string; datiVecchioPortale?: unknown; creatoIl?: string;
}): Promise<number> {
  const { dati, catalogo } = opz;
  const ris = calcola(catalogo, dati);
  return transazione(async c => {
    const clienteId = await trovaOCreaCliente(c, dati.cliente);
    const revId = await trovaOCreaRevisione(c, clienteId, dati.codice, dati.descrizione, dati.revisione);
    const campi = [clienteId, revId, dati.nSchede, dati.nSchedeInPCB, dati.tariffe,
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
    cliente: i.cliente ?? '', codice: i.codice ?? '', revisione: i.revisione ?? '', descrizione: i.descrizione ?? '',
    nSchede: r.n_schede, nSchedeInPCB: r.n_schede_pannello, tariffe: r.tariffe, parametri: r.parametri ?? {},
    personeFase: r.persone_fase ?? {}, prezziMateriali: r.prezzi_materiali ?? {},
    prezzoTargetScheda: r.prezzo_target_scheda, note: r.note ?? '',
  };
}

export const leggiPreventivo = (id: number) => q1(`SELECT * FROM preventivi WHERE id = $1`, [id]);
