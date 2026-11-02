/**
 * Invio allo SdI con Invoicetronic (Adriano, 28/10/2026): regole senza database né rete.
 * - chiave ik_test_ = ambiente di prova (sandbox: niente arriva davvero allo SdI), ik_live_ = invii reali;
 * - stati dello SdI → stato del documento nel portale e frase per l'ufficio;
 * - firma dei webhook (HMAC-SHA256 su "timestamp.corpo", intestazione Invoicetronic-Signature: t=…,v1=…).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export type Ambiente = 'prova' | 'reale';
export const ambienteDaChiave = (chiave: string | null | undefined): Ambiente | null =>
  !chiave ? null : chiave.startsWith('ik_live_') ? 'reale' : 'prova';

export type StatoSdi = 'Inviato' | 'Consegnato' | 'NonConsegnato' | 'Scartato' | 'AccettatoDalDestinatario' | 'RifiutatoDalDestinatario'
  | 'ImpossibilitaDiRecapito' | 'DecorrenzaTermini' | 'AttestazioneTrasmissioneFattura';

/** Stato del documento (documenti.stato) e spiegazione per ogni stato dello SdI. */
export const STATI_SDI: Record<StatoSdi, { stato: 'inviato' | 'consegnato' | 'non_consegnato' | 'scartato'; testo: string }> = {
  Inviato: { stato: 'inviato', testo: 'Accettata dallo SdI, in consegna al cliente.' },
  Consegnato: { stato: 'consegnato', testo: 'Consegnata al cliente.' },
  AccettatoDalDestinatario: { stato: 'consegnato', testo: 'Accettata dal cliente (Pubblica Amministrazione).' },
  DecorrenzaTermini: { stato: 'consegnato', testo: 'Consegnata: il cliente (Pubblica Amministrazione) non ha risposto nei 15 giorni.' },
  ImpossibilitaDiRecapito: { stato: 'non_consegnato', testo: 'Fattura valida, ma lo SdI non è riuscito a consegnarla (codice o PEC del cliente): '
    + 'è nell\'area riservata del cliente sul sito dell\'Agenzia. Avvisa il cliente e mandagli una copia.' },
  NonConsegnato: { stato: 'non_consegnato', testo: 'Non consegnata alla Pubblica Amministrazione: lo SdI ritenta, controlla più tardi.' },
  AttestazioneTrasmissioneFattura: { stato: 'non_consegnato', testo: 'Lo SdI attesta la trasmissione ma non la consegna: avvisa il cliente.' },
  RifiutatoDalDestinatario: { stato: 'non_consegnato', testo: 'Rifiutata dal cliente (Pubblica Amministrazione): va stornata con una nota di credito.' },
  Scartato: { stato: 'scartato', testo: 'Scartata dallo SdI: la fattura NON è emessa. Correggi e rimandala entro 5 giorni con lo stesso numero e la stessa data.' },
};
export const NOMI_STATI_SDI: Record<string, string> = {
  caricato: 'In coda per lo SdI', Inviato: 'Accettata dallo SdI', Consegnato: 'Consegnata', NonConsegnato: 'Non consegnata',
  Scartato: 'Scartata', AccettatoDalDestinatario: 'Accettata dal cliente', RifiutatoDalDestinatario: 'Rifiutata dal cliente',
  ImpossibilitaDiRecapito: 'Non recapitata (nel cassetto fiscale del cliente)', DecorrenzaTermini: 'Decorrenza termini',
  AttestazioneTrasmissioneFattura: 'Attestazione di trasmissione', errore: 'Non inviata',
};

/** Ordine degli stati: un esito arrivato in ritardo (es. "Inviato" dopo "Consegnato") non torna indietro. */
const ORDINE: Record<string, number> = { caricato: 0, Inviato: 1, NonConsegnato: 2, AttestazioneTrasmissioneFattura: 3, ImpossibilitaDiRecapito: 3,
  Consegnato: 4, DecorrenzaTermini: 5, AccettatoDalDestinatario: 5, RifiutatoDalDestinatario: 5, Scartato: 5 };
export const statoPiuAvanti = (attuale: string, nuovo: string) => (ORDINE[nuovo] ?? 0) >= (ORDINE[attuale] ?? 0);

/** Errori dello SdI (o della convalida di Invoicetronic) in una frase sola. */
export function testoErrori(errori: Array<{ code?: string; description?: string; hint?: string }> | null | undefined): string {
  return (errori ?? []).map(e => [e.code && `[${e.code}]`, e.description, e.hint && `(${e.hint})`].filter(Boolean).join(' ')).join(' · ');
}

/**
 * Risposta di errore di Invoicetronic (ProblemDetails, anche con l'elenco "errors" della convalida) in italiano leggibile.
 * Es. 400 "A file with the same name already exists.", 422 convalida dell'XML.
 */
export function messaggioErroreApi(stato: number, corpo: any): string {
  const dettagli: string[] = [];
  // errori dei campi ({ campo: [testi] }) o della validazione SdI ([{ code, description, hint }])
  if (Array.isArray(corpo?.errors))
    for (const e of corpo.errors) dettagli.push(typeof e === 'object' && e ? [e.code, e.description, e.hint].filter(Boolean).join(' – ') : String(e));
  else if (corpo?.errors && typeof corpo.errors === 'object')
    for (const [campo, testi] of Object.entries(corpo.errors)) dettagli.push(`${campo}: ${[testi].flat().join(', ')}`);
  const base = corpo?.detail || corpo?.title || (typeof corpo === 'string' ? corpo : '') || `errore ${stato}`;
  // risposta senza dettagli leggibili: si mostra com'è, per capire cosa non va
  if (!dettagli.length && !corpo?.detail && corpo && typeof corpo === 'object') {
    const altro = Object.fromEntries(Object.entries(corpo).filter(([k]) => !['type', 'title', 'status', 'traceId'].includes(k)));
    if (Object.keys(altro).length) dettagli.push(JSON.stringify(altro));
  }
  const prima = stato === 401 ? 'Chiave di Invoicetronic non valida o mancante.' : stato === 403 ? 'Operazione non permessa dalla chiave (o crediti finiti).' : '';
  return [prima, base, dettagli.join(' · ')].filter(Boolean).join(' ').slice(0, 1000);
}

/** Controlla la firma di un webhook: HMAC-SHA256 di "t.corpo" con il segreto, al massimo 5 minuti di differenza. */
export function firmaWebhookValida(intestazione: string | undefined, corpo: string, segreto: string, adessoSec = Math.floor(Date.now() / 1000)): boolean {
  if (!intestazione || !segreto) return false;
  const parti = Object.fromEntries(intestazione.split(',').map(p => p.trim().split('=') as [string, string]));
  const t = Number(parti.t), v1 = parti.v1;
  if (!Number.isFinite(t) || !v1 || Math.abs(adessoSec - t) > 300) return false;
  const atteso = createHmac('sha256', segreto).update(`${parti.t}.${corpo}`, 'utf8').digest('hex');
  const a = Buffer.from(atteso), b = Buffer.from(v1);
  return a.length === b.length && timingSafeEqual(a, b);
}
