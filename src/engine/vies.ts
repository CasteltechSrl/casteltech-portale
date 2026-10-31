/**
 * Controllo delle partite IVA europee sul VIES della Commissione europea (Adriano 31/10/2026).
 * Serve per le fatture a clienti UE non imponibili (art. 41, N3.2) e per i servizi UE (art. 7-ter, N2.1): il cliente deve essere
 * iscritto al VIES alla data dell'operazione, altrimenti la fattura va con l'IVA italiana. Il numero di consultazione che il VIES
 * restituisce (chiedendo con la nostra P.IVA) è la prova del controllo da conservare.
 * Solo calcoli e testi: la chiamata sta in server/vies.ts.
 */
import { siglaNazione } from './amministrazione.js';
import { PAESI_UE } from './autofatture.js';

/** Sigla del paese nel VIES: come ISO, ma la Grecia è EL. */
const siglaVies = (paese: string) => (paese === 'GR' ? 'EL' : paese);

/**
 * Paese e numero da mandare al VIES: P.IVA con il prefisso (DE811193231) oppure senza prefisso con il paese dell'anagrafica.
 * null se non è una P.IVA di un paese UE diverso dall'Italia (le italiane si controllano con la cifra di controllo, non qui).
 */
export function partitaIvaPerVies(piva: string | null | undefined, paese?: string | null): { paese: string; numero: string } | null {
  const p = String(piva ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!p || !/\d/.test(p)) return null;
  const m = /^([A-Z]{2})([0-9A-Z]{2,13})$/.exec(p);
  const pref = m ? (m[1] === 'EL' ? 'GR' : m[1]) : '';
  if (m && PAESI_UE.has(pref)) return pref === 'IT' ? null : { paese: siglaVies(pref), numero: m[2] };
  const sigla = siglaNazione(paese ?? '') ?? '';
  if (!PAESI_UE.has(sigla) || sigla === 'IT') return null;
  return { paese: siglaVies(sigla), numero: p };
}

export interface EsitoVies { valida: boolean | null; nome: string | null; indirizzo: string | null; consultazione: string | null; data: string | null; errore: string | null }

/** Messaggi in parole chiare per gli errori del VIES (non vuol dire che la P.IVA sia sbagliata: si riprova più tardi). */
export const ERRORI_VIES: Record<string, string> = {
  INVALID_INPUT: 'Il VIES dice che la partita IVA non ha un formato valido per quel paese.',
  INVALID_REQUESTER_INFO: 'La nostra partita IVA (Impostazioni → Amministrazione → Dati dell\'azienda) non è stata accettata dal VIES.',
  SERVICE_UNAVAILABLE: 'Il VIES non risponde in questo momento: riprova più tardi.',
  MS_UNAVAILABLE: 'Il servizio del paese non risponde in questo momento (capita, soprattutto la notte e nel fine settimana): riprova più tardi.',
  TIMEOUT: 'Il servizio del paese non ha risposto in tempo: riprova più tardi.',
  VAT_BLOCKED: 'Il paese non permette di controllare questa partita IVA.',
  IP_BLOCKED: 'Il VIES ha bloccato le richieste dal portale per troppi controlli: riprova più tardi.',
  GLOBAL_MAX_CONCURRENT_REQ: 'Il VIES è sovraccarico in questo momento: riprova tra qualche minuto.',
  GLOBAL_MAX_CONCURRENT_REQ_TIME: 'Il VIES è sovraccarico in questo momento: riprova tra qualche minuto.',
  MS_MAX_CONCURRENT_REQ: 'Il servizio del paese è sovraccarico in questo momento: riprova tra qualche minuto.',
  MS_MAX_CONCURRENT_REQ_TIME: 'Il servizio del paese è sovraccarico in questo momento: riprova tra qualche minuto.',
};

const pulito = (s: unknown) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t && t !== '---' ? t : null;
};

/**
 * Esito della risposta del VIES (servizio REST check-vat-number). Con un errore del servizio `valida` è null:
 * la partita IVA non è né buona né cattiva, il controllo va rifatto.
 */
export function esitoVies(r: any): EsitoVies {
  const codice = r?.userError && r.userError !== 'VALID' && r.userError !== 'INVALID' ? String(r.userError)
    : r?.actionSucceed === false || Array.isArray(r?.errorWrappers) ? String(r?.errorWrappers?.[0]?.error ?? 'SERVICE_UNAVAILABLE') : null;
  if (codice) return { valida: null, nome: null, indirizzo: null, consultazione: null, data: null, errore: ERRORI_VIES[codice] ?? `Il VIES ha risposto con l'errore ${codice}: riprova più tardi.` };
  const valida = typeof r?.valid === 'boolean' ? r.valid : typeof r?.isValid === 'boolean' ? r.isValid : null;
  if (valida == null) return { valida: null, nome: null, indirizzo: null, consultazione: null, data: null, errore: 'Risposta del VIES non riconosciuta: riprova più tardi.' };
  return {
    valida, nome: pulito(r.name ?? r.traderName), indirizzo: pulito(r.address ?? r.traderStreet), consultazione: pulito(r.requestIdentifier),
    data: pulito(r.requestDate)?.slice(0, 10) ?? null, errore: null,
  };
}

/** Giorni dopo i quali un controllo valido si considera da rifare prima di fatturare (la P.IVA può essere cessata). */
export const GIORNI_VALIDITA_VIES = 90;

/** Stato del controllo per l'elenco: da fare, valida (recente o vecchia), non valida, non verificabile. */
export function statoControllo(c: { valida: boolean | null; controllato_il: string } | null | undefined, oggi = new Date()):
  { stato: 'mai' | 'valida' | 'scaduta' | 'non_valida' | 'errore'; testo: string } {
  if (!c) return { stato: 'mai', testo: 'mai controllata' };
  if (c.valida === false) return { stato: 'non_valida', testo: 'NON valida nel VIES' };
  if (c.valida == null) return { stato: 'errore', testo: 'controllo non riuscito' };
  const giorni = Math.floor((oggi.getTime() - new Date(c.controllato_il).getTime()) / 86_400_000);
  return giorni > GIORNI_VALIDITA_VIES ? { stato: 'scaduta', testo: `valida ${giorni} giorni fa: da ricontrollare` } : { stato: 'valida', testo: 'valida' };
}
