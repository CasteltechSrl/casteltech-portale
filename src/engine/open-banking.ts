/**
 * Collegamento automatico con la banca (open banking PSD2, Adriano 14/11/2026: "connettersi direttamente e in autonomia alla banca").
 * Servizio scelto: Enable Banking (api.enablebanking.com, autorizzato in UE, BPER Banca nell'elenco, accesso con l'app della banca).
 * GoCardless Bank Account Data non accetta più clienti nuovi; Tink, Salt Edge, Fabrick solo a contratto per piattaforme.
 *
 * Regole (qui, senza database):
 * - `movimentoDaTransazione`: una transazione dell'API diventa un `Movimento` come quelli del CSV di BPER, così abbinamento, conti e
 *   saldi restano gli stessi.
 * - `togliGiaPresenti`: il CSV e l'open banking scrivono la descrizione in modo diverso, quindi la chiave del CSV non basta. Un movimento
 *   con stesso conto, data e importo di uno già caricato (da qualunque fonte) non si ricarica; due movimenti uguali nello stesso giorno
 *   contano due volte (si confrontano i conteggi).
 * - `dataInizioScarico`: si riparte qualche giorno prima dell'ultimo movimento del conto (la banca registra anche in ritardo);
 *   la prima volta al massimo 89 giorni (oltre i 90 BPER chiede una seconda conferma con l'app).
 * - `statoConsenso`: il consenso dato in banca dura al massimo 180 giorni, poi va rinnovato con l'app (avviso 14 giorni prima).
 * - `oraDiScaricare`: una volta al giorno nei giorni feriali alle 8:30 (Neon: il database si tocca solo a quell'ora; la banca permette
 *   poche letture al giorno senza la persona presente).
 */
import type { Movimento } from './banca.js';
import { numeroConto } from './banca.js';

/** Transazione come la dà Enable Banking (solo i campi che servono). */
export interface TransazioneApi {
  entry_reference?: string | null;
  transaction_id?: string | null;
  transaction_amount?: { amount?: string | number; currency?: string } | null;
  credit_debit_indicator?: 'CRDT' | 'DBIT' | string | null;
  status?: string | null;               // BOOK = contabilizzata, PDNG = in attesa
  booking_date?: string | null;
  value_date?: string | null;
  transaction_date?: string | null;
  creditor?: { name?: string | null } | null;
  debtor?: { name?: string | null } | null;
  remittance_information?: string[] | null;
  bank_transaction_code?: { description?: string | null; code?: string | null; sub_code?: string | null } | null;
  note?: string | null;
}

/** Nome della fonte scritto nei movimenti (colonna `file` di banca_movimenti). */
export const FILE_OPEN_BANKING = 'Open banking (Enable Banking)';

const pulisci = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();
const soloData = (s: unknown) => { const m = String(s ?? '').match(/^\d{4}-\d{2}-\d{2}/); return m ? m[0] : null; };

/**
 * Movimento da una transazione dell'API. Null se non è contabilizzata (in attesa: si prende al prossimo scarico, quando è definitiva)
 * o se mancano data e importo. Descrizione = causale della banca · controparte · testo del bonifico (come le colonne del CSV).
 */
export function movimentoDaTransazione(t: TransazioneApi, conto: string): (Movimento & { rapporto: string }) | null {
  if (t.status && t.status !== 'BOOK') return null;
  const data = soloData(t.booking_date) ?? soloData(t.value_date) ?? soloData(t.transaction_date);
  const valore = Number(String(t.transaction_amount?.amount ?? '').replace(',', '.'));
  if (!data || !Number.isFinite(valore) || valore === 0) return null;
  const segno = t.credit_debit_indicator === 'DBIT' ? -1 : t.credit_debit_indicator === 'CRDT' ? 1 : Math.sign(valore);
  const importo = Math.round(segno * Math.abs(valore) * 100) / 100;
  const controparte = pulisci(importo > 0 ? t.debtor?.name : t.creditor?.name);
  const parti = [pulisci(t.bank_transaction_code?.description), controparte, pulisci((t.remittance_information ?? []).join(' ')), pulisci(t.note)]
    .filter((p, i, a) => p && a.indexOf(p) === i);
  return { data, valuta: soloData(t.value_date), importo, descrizione: parti.join(' · '), causale: pulisci(t.bank_transaction_code?.code) || null,
    rapporto: numeroConto(conto) };
}

/** Toglie i movimenti già caricati: stesso conto, data e importo, confrontando quante volte compaiono. */
export function togliGiaPresenti<T extends { rapporto: string; data: string; importo: number }>(nuovi: T[],
  esistenti: { conto: string; data: string; importo: number }[]): T[] {
  const chiave = (conto: string, data: string, importo: number) => `${numeroConto(conto)}|${data}|${importo.toFixed(2)}`;
  const resto = new Map<string, number>();
  for (const e of esistenti) { const k = chiave(e.conto, e.data, e.importo); resto.set(k, (resto.get(k) ?? 0) + 1); }
  return nuovi.filter(m => {
    const k = chiave(m.rapporto, m.data, m.importo);
    const n = resto.get(k) ?? 0;
    if (n > 0) { resto.set(k, n - 1); return false; }
    return true;
  });
}

const giorni = (data: string, n: number) => { const d = new Date(`${data}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** Da che giorno chiedere i movimenti di un conto. */
export function dataInizioScarico(ultimo: string | null, oggi: string): string {
  const limite = giorni(oggi, -89);
  if (!ultimo) return limite;
  const da = giorni(ultimo, -5);
  return da < limite ? limite : da;
}

export type StatoConsenso = 'mancante' | 'scaduto' | 'in_scadenza' | 'attivo';
export const GIORNI_AVVISO_CONSENSO = 14;

/** Stato del consenso dato in banca (scadenza = data e ora ISO dell'API). */
export function statoConsenso(scadenza: string | null | undefined, adesso: Date): { stato: StatoConsenso; giorni: number | null } {
  if (!scadenza) return { stato: 'mancante', giorni: null };
  const ms = new Date(scadenza).getTime() - adesso.getTime();
  if (!Number.isFinite(ms)) return { stato: 'mancante', giorni: null };
  const g = Math.floor(ms / 86_400_000);
  if (ms <= 0) return { stato: 'scaduto', giorni: 0 };
  return { stato: g < GIORNI_AVVISO_CONSENSO ? 'in_scadenza' : 'attivo', giorni: g };
}

/** Scarico automatico: giorni feriali alle 8:30 (ora di Roma), una volta al giorno. */
export const ORA_SCARICO = '08:30';
export function oraDiScaricare(roma: { data: string; ora: string; feriale: boolean }, ultimoGiorno: string | null): boolean {
  return roma.feriale && roma.ora >= ORA_SCARICO && roma.ora < '20:00' && ultimoGiorno !== roma.data;
}

/** Scadenza da chiedere per il consenso: 180 giorni (la banca può darne meno: vale quello che risponde). */
export function scadenzaRichiesta(adesso: Date, giorniConsenso = 180): string {
  return new Date(adesso.getTime() + giorniConsenso * 86_400_000).toISOString();
}

/** Banche BPER nell'elenco dell'API (BPER Banca, BPER Banca Corporate…; le carte no). */
export function bancheBper(elenco: { name: string; country?: string; psu_types?: string[] }[]): { name: string; impresa: boolean }[] {
  return elenco.filter(b => /bper/i.test(b.name) && !/carte|card/i.test(b.name))
    .map(b => ({ name: b.name, impresa: !b.psu_types || b.psu_types.includes('business') }))
    .sort((a, b) => Number(b.impresa) - Number(a.impresa) || a.name.localeCompare(b.name));
}
