/**
 * Prezzo in anagrafica dal preventivo mandato al cliente e controllo dei prezzi dell'ordine (Adriano 11/11/2026).
 * Regole in `engine/prezzo-anagrafica.ts`.
 */
import { q, q1 } from './db.js';
import { calcola, datiDaRiga, leggiPreventivo } from './preventivi-servizio.js';
import { riepilogo } from '../engine/riepilogo.js';
import { leggiRitocchi, prezziComeInStampa, righeUnaTantum } from '../engine/stampa-preventivo.js';
import { aggiornaPrezzoDaDocumento, salvaScaglioni, scaglioniDi } from './prezzi-servizio.js';
import { inserisciScaglione, leggiSceltaAnagrafica, type SceltaAnagrafica } from '../engine/prezzo-anagrafica.js';
import { prezzoPerQuantita, testoScaglione } from '../engine/listino.js';
import type { Catalogo } from './catalogo-db.js';

const r5 = (n: number) => Math.round(n * 100000) / 100000;
const euro = (n: number) => new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 5 }).format(n) + ' €';

/** Prezzo a scheda senza una tantum come lo vede il cliente nella stampa (prezzi a mano e sconto compresi), come "Crea ordine". */
export function prezzoSchedaDelPreventivo(p: any): number {
  const cat: Catalogo = p.catalogo;
  const dati = datiDaRiga(p);
  const ris = calcola(cat, dati);
  const v = (cod: string) => dati.parametri[cod] ?? cat.parametri.find(x => x.codice === cod)?.default;
  const doppia = !!v('doppiaFaccia');
  const nLamine = Number(v('nLamine')) > 0 ? Number(v('nLamine')) : (doppia ? 2 : 1);
  const rit = leggiRitocchi(p.stampa);
  return r5(prezziComeInStampa(riepilogo(ris), p.n_schede, righeUnaTantum(ris, { doppia, nLamine }), rit.prezzi, rit.sconto).prezzoScheda);
}

/** La spunta "Variazione quantità" è accesa nel preventivo. */
export const conVariazioneQuantita = (p: any) => !!Number(p?.parametri?.variazioneQuantita);

/**
 * Scrive in anagrafica il prezzo del preventivo. `occasione`:
 * - 'invio': preventivo mandato (email o "Segna come inviato"). Con "Variazione quantità" vale la scelta fatta al salvataggio,
 *   altrimenti si aggiorna lo scaglione di quella quantità, o il prezzo unico.
 * - 'salvataggio': solo con "Variazione quantità" e una scelta (Adriano: "in fase di salvataggio mi dovrebbe chiedere").
 * Restituisce il messaggio per l'ufficio, o null se non c'era niente da fare.
 */
export async function prezzoInAnagraficaDaPreventivo(id: number, occasione: 'invio' | 'salvataggio'): Promise<string | null> {
  const p = await leggiPreventivo(id);
  if (!p?.prodotto_id || p.stato === 'da_validare') return null;
  const variazione = conVariazioneQuantita(p);
  const scelta: SceltaAnagrafica | null = variazione ? leggiSceltaAnagrafica(p.anagrafica_prezzo) : null;
  if (occasione === 'salvataggio' && !scelta) return null;
  if (scelta?.modo === 'nessuno') return occasione === 'invio' ? 'Anagrafica non toccata, come scelto nel preventivo.' : null;
  const prezzo = prezzoSchedaDelPreventivo(p);
  if (!(prezzo > 0)) return null;
  const documento = `preventivo ${p.numero}${occasione === 'invio' ? ' inviato al cliente' : ''}`;
  const pr = await q1<{ codice: string; prezzo: number | null }>(`SELECT codice, prezzo_vendita::float AS prezzo FROM prodotti WHERE id = $1`, [p.prodotto_id]);
  if (!pr) return null;
  if (scelta?.modo === 'unico') {
    await q(`DELETE FROM prodotti_scaglioni WHERE prodotto_id = $1`, [p.prodotto_id]);
    await q(`UPDATE prodotti SET prezzo_vendita = $2, prezzo_fonte = 'preventivo', prezzo_data = current_date, prezzo_nota = $3 WHERE id = $1`,
      [p.prodotto_id, prezzo, `Aggiornato da ${documento}`.slice(0, 200)]);
    return `${pr.codice}: in anagrafica ${euro(prezzo)} a scheda per tutte le quantità.`;
  }
  if (scelta?.modo === 'scaglione') {
    const sc = (await scaglioniDi([p.prodotto_id])).get(p.prodotto_id) ?? [];
    await salvaScaglioni(p.prodotto_id, inserisciScaglione(pr.prezzo, sc, scelta.da!, scelta.a ?? null, prezzo));
    return `${pr.codice}: in anagrafica ${euro(prezzo)} a scheda per ${testoScaglione({ da: scelta.da!, a: scelta.a ?? null, prezzo })}; le altre quantità non cambiano.`;
  }
  return aggiornaPrezzoDaDocumento(p.prodotto_id, p.n_schede, prezzo, documento, 'preventivo');
}

/** Salva la scelta fatta nel riquadro "Variazione quantità" (null = toglie la scelta). */
export async function salvaSceltaAnagrafica(id: number, x: unknown) {
  await q(`UPDATE preventivi SET anagrafica_prezzo = $2 WHERE id = $1`, [id, leggiSceltaAnagrafica(x)]);
}

/** Ordine: "tieni l'anagrafica" = la riga prende il prezzo dell'anagrafica per la sua quantità; "aggiorna" = l'anagrafica prende il prezzo della riga. */
export async function sceltaPrezzoOrdine(ordineId: number, rigaId: number, scelta: 'anagrafica' | 'ordine'): Promise<string> {
  const r = await q1<{ prodotto_id: number | null; quantita: number; prezzo: number; numero: number; anno: number }>(
    `SELECT r.prodotto_id, r.quantita::float AS quantita, r.prezzo::float AS prezzo, o.numero, o.anno FROM ordini_righe r JOIN ordini o ON o.id = r.ordine_id
     WHERE r.id = $1 AND r.ordine_id = $2`, [rigaId, ordineId]);
  if (!r?.prodotto_id) return 'Riga senza codice dall\'anagrafica.';
  if (scelta === 'ordine') return aggiornaPrezzoDaDocumento(r.prodotto_id, r.quantita, r.prezzo, `ordine ${r.numero}/${r.anno}`, 'ordine');
  const pr = await q1<{ codice: string; prezzo: number | null }>(`SELECT codice, prezzo_vendita::float AS prezzo FROM prodotti WHERE id = $1`, [r.prodotto_id]);
  const an = prezzoPerQuantita(pr?.prezzo ?? null, (await scaglioniDi([r.prodotto_id])).get(r.prodotto_id) ?? [], r.quantita).prezzo;
  if (an == null) return `${pr?.codice ?? 'Il prodotto'} non ha un prezzo in anagrafica.`;
  await q(`UPDATE ordini_righe SET prezzo = $3 WHERE id = $1 AND ordine_id = $2`, [rigaId, ordineId, an]);
  await q(`UPDATE ordini SET aggiornato_il = now() WHERE id = $1`, [ordineId]);
  return `${pr?.codice}: la riga dell'ordine prende il prezzo dell'anagrafica, ${euro(an)}. Se c'è già una conferma d'ordine, riprendi le righe dall'ordine.`;
}
