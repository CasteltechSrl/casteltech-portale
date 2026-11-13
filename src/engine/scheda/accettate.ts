/**
 * Segnalazioni "Va bene" (Adriano 28/10/2026): l'ufficio controlla una segnalazione dei documenti del cliente (es. simbolo
 * scritto in modo diverso, componente giusto) e la segna come controllata. Non conta più tra gli errori, non va nel
 * "Da controllare" del preventivo e i componenti che aveva segnalato non sono più critici nelle stampe (se non hanno
 * altre segnalazioni aperte). Si applica in lettura: l'analisi salvata non cambia e "Rianalizza" la ritrova.
 *
 * Risposte alle osservazioni (Adriano 13/11/2026, "solo va bene spesso non è sufficiente"): a ogni segnalazione si risponde
 * con un testo e si decide come resta:
 * - `aperta`: la risposta è scritta ma la cosa non è chiusa (conta ancora come prima);
 * - `va_bene`: risolta (come il vecchio "Va bene");
 * - `produzione`: non tocca il prezzo, si vede DOPO la conferma d'ordine e PRIMA della produzione: non blocca il preventivo,
 *   ma nella pre-produzione della commessa resta aperta ("non partire finché non è chiarito") finché non si chiude lì.
 * La spunta "cambia il prezzo" sulla risposta fa comparire l'avviso nel preventivo (e in tutti quelli della stessa quotazione)
 * finché il preventivo non viene salvato di nuovo. Le risposte restano tutte, con chi e quando, dal preventivo alla produzione.
 * Nessun accesso al database.
 */
import type { AnalisiScheda, Segnalazione } from './analisi.js';

export type EsitoOsservazione = 'aperta' | 'va_bene' | 'produzione';
export type MomentoRisposta = 'preventivo' | 'produzione';
export interface RispostaOsservazione { da: string; il: string; testo: string; momento: MomentoRisposta; prezzo?: boolean }
/** Voce salvata in `pacchetti_scheda.accettate` (chiave = `chiaveSegnalazione`). Le voci vecchie {da, il} valgono "va_bene". */
export interface Accettazione { da: string; il: string; esito?: EsitoOsservazione; risposte?: RispostaOsservazione[] }
export type Accettate = Record<string, Accettazione>;

export const ETICHETTE_ESITO: Record<EsitoOsservazione, string> = {
  aperta: 'Ancora da chiarire', va_bene: 'Risolta: va bene', produzione: 'Da vedere prima della produzione',
};

/** Chiave della segnalazione: stesso livello e stesso testo (se cambia il numero di componenti è un'altra segnalazione). */
export const chiaveSegnalazione = (s: Pick<Segnalazione, 'livello' | 'testo'>) => `${s.livello}|${s.testo}`;

export const esitoDi = (x: Accettazione | null | undefined): EsitoOsservazione | null => x ? (x.esito ?? 'va_bene') : null;

/** Non pesa sul preventivo: risolta o rimandata alla produzione. */
export const chiusaPerPreventivo = (s: Pick<Segnalazione, 'accettata' | 'rimandata'>) => !!(s.accettata || s.rimandata);

export function conAccettate(a: AnalisiScheda, accettate: Accettate | null | undefined): AnalisiScheda {
  if (!accettate || !Object.keys(accettate).length) return a;
  const segnalazioni = a.segnalazioni.map(s => {
    const x = accettate[chiaveSegnalazione(s)];
    if (!x) return s;
    const esito = esitoDi(x)!;
    const risposte = x.risposte ?? [];
    return {
      ...s, esito, risposte,
      ...(esito === 'va_bene' ? { accettata: { da: x.da, il: x.il } } : {}),
      ...(esito === 'produzione' ? { rimandata: { da: x.da, il: x.il } } : {}),
    };
  });
  // un componente resta segnalato se almeno una segnalazione aperta (non "info") lo nomina
  const aperti = new Set(segnalazioni.filter(s => !s.accettata && s.livello !== 'info').flatMap(s => s.refs ?? []));
  const chiusi = new Set(segnalazioni.filter(s => s.accettata).flatMap(s => s.refs ?? []));
  const componenti = a.componenti.map(c => chiusi.has(c.ref) && !aperti.has(c.ref) && c.segnalazioni.length
    ? { ...c, segnalazioni: [], segnalazioniAccettate: c.segnalazioni } : c);
  return { ...a, segnalazioni, componenti };
}

/**
 * Nuova voce dopo una risposta (o un "Va bene", testo vuoto). La risposta si aggiunge in fondo alle altre (mai cancellate);
 * l'esito scelto vince. Esito non indicato: "va_bene" senza testo (il tasto Va bene), altrimenti resta quello di prima o "aperta".
 */
export function rispondi(prima: Accettazione | null | undefined, r: { da: string; il: string; testo?: string; esito?: string; prezzo?: boolean; momento?: string }): Accettazione {
  const testo = String(r.testo ?? '').trim().slice(0, 2000);
  const esiti: EsitoOsservazione[] = ['aperta', 'va_bene', 'produzione'];
  const esito: EsitoOsservazione = esiti.includes(r.esito as EsitoOsservazione) ? r.esito as EsitoOsservazione
    : !testo ? 'va_bene' : esitoDi(prima) ?? 'aperta';
  const momento: MomentoRisposta = r.momento === 'produzione' ? 'produzione' : 'preventivo';
  const risposte = [...(prima?.risposte ?? [])];
  if (testo) risposte.push({ da: r.da, il: r.il, testo, momento, ...(r.prezzo ? { prezzo: true } : {}) });
  // chi e quando: dell'ultima decisione se cambia, altrimenti restano quelli di prima
  const cambia = !prima || esitoDi(prima) !== esito;
  return { da: cambia ? r.da : prima!.da, il: cambia ? r.il : prima!.il, esito, ...(risposte.length ? { risposte } : {}) };
}

/** "annulla" del Va bene: la segnalazione torna aperta ma le risposte restano; senza risposte la voce si toglie (null). */
export function riapri(prima: Accettazione | null | undefined, chi: { da: string; il: string }): Accettazione | null {
  if (!prima?.risposte?.length) return null;
  return { da: chi.da, il: chi.il, esito: 'aperta', risposte: prima.risposte };
}

/**
 * Risposte che cambiano il prezzo, scritte dopo l'ultimo salvataggio del preventivo: il preventivo va ricontrollato.
 * `salvatoIl` = `preventivi.aggiornato_il`.
 */
export function risposteDaRivedere(segnalazioni: Segnalazione[], salvatoIl: string | Date | null | undefined): { testo: string; risposta: RispostaOsservazione }[] {
  const limite = salvatoIl ? new Date(salvatoIl).getTime() : 0;
  return segnalazioni.flatMap(s => (s.risposte ?? []).filter(r => r.prezzo && new Date(r.il).getTime() > limite).map(r => ({ testo: s.testo, risposta: r })));
}

/** Riassunto per i riquadri: aperte che pesano sul prezzo (errori/avvisi non risolti né rimandati), rimandate, con risposta. */
export function contaOsservazioni(segnalazioni: Segnalazione[]) {
  const nonInfo = segnalazioni.filter(s => s.livello !== 'info');
  return {
    perIlPrezzo: nonInfo.filter(s => !chiusaPerPreventivo(s)).length,
    perLaProduzione: nonInfo.filter(s => s.rimandata).length,
    conRisposta: segnalazioni.filter(s => s.risposte?.length).length,
  };
}
