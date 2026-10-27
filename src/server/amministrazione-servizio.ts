/**
 * Amministrazione: lettura e salvataggio di dati dell'azienda, numerazioni, aliquote e condizioni di pagamento.
 * Il numero di un documento si prende SOLO qui (assegnaNumero), dentro una transazione: due persone che emettono
 * insieme non possono avere lo stesso numero e, se l'emissione fallisce, il numero non viene consumato.
 */
import type pg from 'pg';
import { q, q1 } from './db.js';
import { controllaDataNumerazione, preparaAzienda, CAMPI_AZIENDA, type Aliquota, type DatiAzienda } from '../engine/amministrazione.js';

export async function caricaAzienda(): Promise<DatiAzienda> {
  const r = await q1<{ valore: Partial<DatiAzienda> }>(`SELECT valore FROM impostazioni WHERE chiave = 'azienda'`);
  return Object.fromEntries(CAMPI_AZIENDA.map(c => [c, String(r?.valore?.[c] ?? '')])) as DatiAzienda;
}

export async function salvaAzienda(input: Record<string, unknown>): Promise<string[]> {
  const { azienda, errori } = preparaAzienda(input);
  if (errori.length) return errori;
  await q(`INSERT INTO impostazioni (chiave, valore) VALUES ('azienda', $1) ON CONFLICT (chiave) DO UPDATE SET valore = $1, aggiornato_il = now()`, [JSON.stringify(azienda)]);
  return [];
}

export async function caricaAliquote(soloAttive = false): Promise<(Aliquota & { descrizione: string; ordine: number; attiva: boolean })[]> {
  return q(`SELECT * FROM aliquote_iva ${soloAttive ? 'WHERE attiva' : ''} ORDER BY ordine, codice`);
}

export const caricaCondizioniPagamento = (soloAttive = false) =>
  q<{ codice: string; descrizione: string; modalita: string; giorni: number; fine_mese: boolean; ordine: number; attiva: boolean }>(
    `SELECT * FROM condizioni_pagamento ${soloAttive ? 'WHERE attiva' : ''} ORDER BY ordine, codice`);

export const caricaNumerazioni = () =>
  q<{ tipo: string; sezionale: string; anno: number; ultimo_numero: number; ultima_data: string | null }>(
    `SELECT * FROM numerazioni ORDER BY anno DESC, tipo, sezionale`);

/**
 * Prende il numero successivo della serie (tipo + sezionale + anno) dentro la transazione del chiamante.
 * La riga della numerazione resta bloccata fino alla fine della transazione.
 */
export async function assegnaNumero(c: pg.PoolClient, tipo: string, sezionale: string, data: string): Promise<number> {
  const anno = Number(data.slice(0, 4));
  await c.query(`INSERT INTO numerazioni (tipo, sezionale, anno) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [tipo, sezionale, anno]);
  const n = (await c.query(`SELECT ultimo_numero, ultima_data FROM numerazioni WHERE tipo = $1 AND sezionale = $2 AND anno = $3 FOR UPDATE`,
    [tipo, sezionale, anno])).rows[0];
  const errore = controllaDataNumerazione(data, anno, n.ultima_data);
  if (errore) throw new Error(errore);
  const numero = n.ultimo_numero + 1;
  await c.query(`UPDATE numerazioni SET ultimo_numero = $4, ultima_data = $5 WHERE tipo = $1 AND sezionale = $2 AND anno = $3`,
    [tipo, sezionale, anno, numero, data]);
  return numero;
}
