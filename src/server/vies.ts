/**
 * Controllo VIES (servizio REST gratuito della Commissione europea, senza chiave): una chiamata quando l'ufficio preme
 * "Controlla", niente controlli periodici. Chiediamo con la nostra P.IVA così il VIES dà il numero di consultazione (prova).
 * Ogni controllo resta nella tabella controlli_vies.
 */
import { q, q1 } from './db.js';
import { esitoVies, partitaIvaPerVies, type EsitoVies } from '../engine/vies.js';
import { conta, erroreServizio, riuscito } from './stato-servizi.js';

const INDIRIZZO_VIES = process.env.VIES_URL ?? 'https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number';

export interface ControlloVies extends EsitoVies { id: number; paese: string; numero: string; controllato_il: string }

/** Chiede al VIES (20 secondi al massimo) e salva l'esito. Gli errori di rete diventano un esito "non verificabile". */
export async function controllaVies(piva: string, paese: string | null | undefined, utenteId: number | null): Promise<ControlloVies> {
  const p = partitaIvaPerVies(piva, paese);
  if (!p) throw new Error(`${piva}: non è una partita IVA di un paese dell'Unione europea (le italiane non passano dal VIES).`);
  const azienda = (await q1(`SELECT valore FROM impostazioni WHERE chiave = 'azienda'`))?.valore ?? {};
  const nostra = String(azienda.partita_iva ?? '').replace(/\D/g, '');
  let esito: EsitoVies;
  try {
    const risposta = await fetch(INDIRIZZO_VIES, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({ countryCode: p.paese, vatNumber: p.numero, ...(nostra ? { requesterMemberStateCode: 'IT', requesterNumber: nostra } : {}) }),
    });
    const testo = await risposta.text();
    let json: any = null;
    try { json = JSON.parse(testo); } catch { /* risposta non JSON: errore sotto */ }
    esito = json ? esitoVies(json) : { valida: null, nome: null, indirizzo: null, consultazione: null, data: null, errore: `Il VIES ha risposto con lo stato ${risposta.status}: riprova più tardi.` };
  } catch (e: any) {
    esito = { valida: null, nome: null, indirizzo: null, consultazione: null, data: null,
      errore: e?.name === 'TimeoutError' ? 'Il VIES non ha risposto entro 20 secondi: riprova più tardi.' : `Il VIES non si raggiunge (${e?.message ?? e}): riprova più tardi.` };
  }
  conta('vies', 'controlli', { chiamate: 1, errori: esito.errore ? 1 : 0 });
  if (esito.errore) erroreServizio('vies', 'controllo', esito.errore); else riuscito('vies');
  const riga = await q1<{ id: number; controllato_il: string }>(`INSERT INTO controlli_vies (paese, numero, valida, nome, indirizzo, consultazione, errore, controllato_da)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, controllato_il`,
    [p.paese, p.numero, esito.valida, esito.nome, esito.indirizzo, esito.consultazione, esito.errore, utenteId]);
  return { ...esito, id: riga!.id, paese: p.paese, numero: p.numero, controllato_il: riga!.controllato_il };
}

export interface UltimoControllo { paese: string; numero: string; valida: boolean | null; nome: string | null; consultazione: string | null; errore: string | null; controllato_il: string }

/** Ultimo controllo di ogni partita IVA (chiave "paese|numero"). */
export async function ultimiControlli(): Promise<Map<string, UltimoControllo>> {
  const righe = await q<UltimoControllo>(`SELECT DISTINCT ON (paese, numero) paese, numero, valida, nome, consultazione, errore, controllato_il
    FROM controlli_vies ORDER BY paese, numero, controllato_il DESC`);
  return new Map(righe.map(r => [`${r.paese}|${r.numero}`, r]));
}

/** Ultimo controllo di una partita IVA (null se mai controllata o non UE). */
export async function ultimoControllo(piva: string | null | undefined, paese: string | null | undefined): Promise<UltimoControllo | null> {
  const p = partitaIvaPerVies(piva, paese);
  if (!p) return null;
  return (await q1<UltimoControllo>(`SELECT paese, numero, valida, nome, consultazione, errore, controllato_il FROM controlli_vies
    WHERE paese = $1 AND numero = $2 ORDER BY controllato_il DESC LIMIT 1`, [p.paese, p.numero])) ?? null;
}

export interface SoggettoUe { tipo: 'cliente' | 'fornitore'; id: number; nome: string; partita_iva: string; paese: string; chiave: string }

/** Clienti e fornitori in anagrafica con una partita IVA di un altro paese UE (quelli da controllare nel VIES). */
export async function soggettiUe(): Promise<SoggettoUe[]> {
  const [clienti, fornitori] = await Promise.all([
    q<{ id: number; nome: string; partita_iva: string; paese: string }>(`SELECT id, ragione_sociale AS nome, partita_iva, nazione AS paese FROM clienti
      WHERE coalesce(partita_iva, '') <> '' AND (coalesce(nazione, 'IT') <> 'IT' OR partita_iva ~ '^[A-Za-z]{2}')`),
    q<{ id: number; nome: string; partita_iva: string; paese: string }>(`SELECT id, ragione_sociale AS nome, partita_iva, paese FROM fornitori_anagrafica
      WHERE partita_iva ~ '^[A-Za-z]{2}' OR upper(coalesce(paese, 'ITALIA')) NOT IN ('ITALIA', 'IT', '')`),
  ]);
  const elenco: SoggettoUe[] = [];
  for (const [tipo, righe] of [['cliente', clienti], ['fornitore', fornitori]] as const) for (const r of righe) {
    const p = partitaIvaPerVies(r.partita_iva, r.paese);
    if (p) elenco.push({ tipo, id: r.id, nome: r.nome, partita_iva: r.partita_iva, paese: p.paese, chiave: `${p.paese}|${p.numero}` });
  }
  return elenco.sort((a, b) => a.nome.localeCompare(b.nome));
}
