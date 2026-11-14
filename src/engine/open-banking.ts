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

/** Modo di accesso alla banca (BPER ha due siti per le aziende: Corporate Banking e Digital Corporate Banking; le carte dall'"Area Riservata Carte"). */
export interface MetodoAccesso { name: string; title?: string; psu_type?: string }
/** Cosa si collega: conti correnti, carta di credito, PayPal (Adriano 14/11/2026: carta BPER e PayPal per le spese del mese e l'addebito del 15). */
export type TipoCollegamento = 'conti' | 'carta' | 'paypal';
export const NOMI_COLLEGAMENTO: Record<TipoCollegamento, string> = { conti: 'Conti BPER', carta: 'Carta di credito', paypal: 'PayPal' };
export interface BancaScelta { name: string; impresa: boolean; metodi: { name: string; titolo: string }[] }

/** Banche dell'elenco dell'API che servono: BPER (accessi per le aziende + Area Riservata Carte) e PayPal. */
export function bancheBper(elenco: { name: string; country?: string; psu_types?: string[]; auth_methods?: MetodoAccesso[] }[]): BancaScelta[] {
  return elenco.filter(b => (/bper/i.test(b.name) && !/carte|card/i.test(b.name)) || /^paypal$/i.test(b.name.trim()))
    .map(b => ({ name: b.name, impresa: !b.psu_types || b.psu_types.includes('business'),
      metodi: (b.auth_methods ?? []).filter(m => m.name && (!m.psu_type || m.psu_type === 'business' || METODI_CARTA.includes(m.name)))
        .map(m => ({ name: m.name, titolo: m.name === 'BPERCARD' ? `${m.title || 'Area Riservata Carte'} (carta di credito)`
          : m.name === 'SMART' ? `${m.title || 'Servizi digitali Smart'} (carta di credito, accesso personale)` : m.title || m.name })) }))
    .sort((a, b) => Number(/paypal/i.test(a.name)) - Number(/paypal/i.test(b.name)) || Number(b.impresa) - Number(a.impresa) || a.name.localeCompare(b.name));
}

/** Scelta del modulo "banca|metodo" (metodo facoltativo), con il tipo di collegamento e il tipo di utente da chiedere alla banca. */
export function leggiScelta(v: unknown): { banca: string; metodo: string | null } {
  const [banca, metodo] = String(v ?? '').split('|').map(x => x.trim());
  return { banca: banca || 'BPER Banca', metodo: metodo || null };
}
/**
 * Accessi BPER da privato che servono per la carta di credito: Area Riservata Carte, oppure (Adriano 14/11/2026: "dovevo entrare come account
 * personale e poi vedevo le carte") i Servizi digitali Smart con le credenziali personali.
 */
export const METODI_CARTA = ['BPERCARD', 'SMART'];
export function tipoCollegamento(banca: string, metodo: string | null): TipoCollegamento {
  if (/paypal/i.test(banca)) return 'paypal';
  if ((metodo && METODI_CARTA.includes(metodo)) || /carte|card/i.test(banca)) return 'carta';
  return 'conti';
}
/** Gli accessi della carta sono da privato: la banca rifiuta "business". */
export const tipoUtente = (metodo: string | null): 'business' | 'personal' => (metodo && METODI_CARTA.includes(metodo) ? 'personal' : 'business');

/** Collegamento della carta fatto con l'accesso personale: tiene solo le carte (tipo CARD o senza IBAN), non gli eventuali conti personali. */
export function soloCarte<T extends ContoApi>(conti: T[]): T[] {
  const carte = conti.filter(a => /card/i.test(a.cash_account_type ?? ''));
  if (carte.length) return carte;
  const senzaIban = conti.filter(a => !a.account_id?.iban);
  return senzaIban.length ? senzaIban : conti;
}

/** Conto come lo dà l'API: IBAN per i conti, numero mascherato per la carta, valuta per PayPal. */
export interface ContoApi { uid: string; account_id?: { iban?: string | null; other?: { identification?: string | null } | null } | null; name?: string | null;
  details?: string | null; currency?: string | null; cash_account_type?: string | null }
export interface ContoCollegato { uid: string; iban: string | null; numero: string; nome: string | null }
export function contoDaApi(a: ContoApi, tipo: TipoCollegamento): ContoCollegato {
  const iban = a.account_id?.iban ?? null;
  const altro = String(a.account_id?.other?.identification ?? '');
  let numero: string;
  if (tipo === 'paypal') numero = `PAYPAL${a.currency && a.currency !== 'EUR' ? a.currency : ''}`;
  else if (tipo === 'carta' && !iban) numero = `CARTA${(altro.replace(/\D/g, '') || a.uid.replace(/\W/g, '')).slice(-4)}`;
  else numero = iban ?? (altro || a.uid);
  const nome = a.name || a.details || (tipo === 'carta' ? `Carta ${numero.slice(-4)}` : tipo === 'paypal' ? 'PayPal' : null);
  return { uid: a.uid, iban, numero: numeroConto(numero), nome };
}

/** Un collegamento (un consenso dato in banca o a PayPal), uno per tipo. */
export interface Collegamento {
  id: TipoCollegamento; banca: string; metodo: string | null; sessione: string; scadenza: string | null; collegatoIl?: string; collegatoDa?: string;
  conti: ContoCollegato[]; ultimoScarico?: string; esito?: string; errore?: string | null;
}
/** Collegamenti salvati; lo stato di prima (un solo collegamento con i campi in cima) vale come "conti". */
export function collegamentiDaStato(s: any): Collegamento[] {
  if (Array.isArray(s?.collegamenti)) return s.collegamenti.filter((c: any) => c?.sessione);
  if (!s?.sessione) return [];
  return [{ id: 'conti', banca: s.banca ?? 'BPER Banca', metodo: s.metodo ?? null, sessione: s.sessione, scadenza: s.scadenza ?? null, collegatoIl: s.collegatoIl,
    collegatoDa: s.collegatoDa, conti: s.conti ?? [], ultimoScarico: s.ultimoScarico, esito: s.esito, errore: s.errore ?? null }];
}

/**
 * Addebito della carta di credito: le spese di un mese si pagano il 15 del mese dopo (Adriano 14/11/2026). Una voce per mese con addebito da oggi in poi;
 * il mese in corso conta le spese fatte finora. Rimborsi in meno.
 */
/** Righe di riepilogo dell'estratto conto della carta BPER ("TOTALE ACCREDITI" / "TOTALE SPESE" a fine ciclo): non sono spese, si tolgono dai conti. */
export const rigaRiepilogoCarta = (descrizione?: string | null) => /^\s*totale (accrediti|spese)\b/i.test(descrizione ?? '');

/** Spese della carta (o di PayPal) mese per mese, dal più recente: ogni mese si paga il giorno indicato (15) del mese dopo. */
export function speseCartaPerMese(movimenti: { data: string; importo: number; descrizione?: string | null }[], oggi: string, giorno = 15): { mese: string; data: string; importo: number; movimenti: number; finora: boolean }[] {
  const perMese = new Map<string, { importo: number; movimenti: number }>();
  for (const m of movimenti) {
    if (rigaRiepilogoCarta(m.descrizione)) continue;
    const x = perMese.get(m.data.slice(0, 7)) ?? { importo: 0, movimenti: 0 };
    perMese.set(m.data.slice(0, 7), { importo: x.importo - m.importo, movimenti: x.movimenti + 1 });
  }
  return [...perMese].map(([mese, x]) => {
    const [a, mm] = mese.split('-').map(Number);
    const dopo = mm === 12 ? `${a + 1}-01` : `${a}-${String(mm + 1).padStart(2, '0')}`;
    return { mese, data: `${dopo}-${String(giorno).padStart(2, '0')}`, importo: Math.round(x.importo * 100) / 100, movimenti: x.movimenti, finora: mese === oggi.slice(0, 7) };
  }).sort((x, y) => y.mese.localeCompare(x.mese));
}

export function addebitiCarta(movimenti: { data: string; importo: number; descrizione?: string | null }[], oggi: string, giorno = 15): { mese: string; data: string; importo: number; finora: boolean }[] {
  return speseCartaPerMese(movimenti, oggi, giorno).filter(x => x.data >= oggi && x.importo > 0)
    .map(({ mese, data, importo, finora }) => ({ mese, data, importo, finora })).sort((x, y) => x.data.localeCompare(y.data));
}
