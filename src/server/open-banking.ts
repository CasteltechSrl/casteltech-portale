/**
 * Collegamento automatico con la banca tramite Enable Banking (open banking PSD2; regole in `engine/open-banking.ts`).
 * Chiavi solo su Render: ENABLEBANKING_APP_ID (id dell'applicazione) e ENABLEBANKING_PRIVATE_KEY (chiave privata .pem, anche con "\n" al posto
 * degli a capo). Stato in impostazioni 'open_banking': sessione, scadenza del consenso, conti collegati, ultimo scarico ed esito.
 * Il database si tocca solo quando si scarica (una volta al giorno feriale alle 8:30, o con il pulsante).
 */
import crypto from 'node:crypto';
import { q, q1 } from './db.js';
import { caricaMovimenti } from './banca-servizio.js';
import { numeroConto } from '../engine/banca.js';
import { FILE_OPEN_BANKING, bancheBper, type BancaScelta, dataInizioScarico, movimentoDaTransazione, oraDiScaricare, scadenzaRichiesta, togliGiaPresenti, type TransazioneApi } from '../engine/open-banking.js';
import { partiRoma } from '../engine/promemoria.js';
import { indirizzoPortale } from './promemoria.js';

const URL_API = () => (process.env.ENABLEBANKING_URL ?? 'https://api.enablebanking.com').replace(/\/$/, '');
const appId = () => process.env.ENABLEBANKING_APP_ID?.trim() || null;
const chiavePrivata = () => {
  const k = process.env.ENABLEBANKING_PRIVATE_KEY?.trim();
  return k ? k.replace(/\\n/g, '\n') : null;
};
export const openBankingConfigurato = () => Boolean(appId() && chiavePrivata());
export const percorsoRitorno = '/amministrazione/banca/collega/ritorno';

export interface ContoCollegato { uid: string; iban: string | null; numero: string; nome: string | null }
export interface StatoOpenBanking {
  banca?: string; metodo?: string | null; sessione?: string; scadenza?: string; collegatoIl?: string; collegatoDa?: string;
  conti?: ContoCollegato[]; ultimoScarico?: string; ultimoGiorno?: string; esito?: string; errore?: string | null;
}

export async function statoOpenBanking(): Promise<StatoOpenBanking> {
  return (await q1<{ valore: any }>(`SELECT valore FROM impostazioni WHERE chiave = 'open_banking'`))?.valore ?? {};
}
async function salvaStato(parte: Partial<StatoOpenBanking> | Record<string, unknown>): Promise<void> {
  await q(`INSERT INTO impostazioni (chiave, valore) VALUES ('open_banking', $1::jsonb)
    ON CONFLICT (chiave) DO UPDATE SET valore = impostazioni.valore || $1::jsonb, aggiornato_il = now()`, [JSON.stringify(parte)]);
}

// ───────────────────────────── chiamate all'API ─────────────────────────────

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
/** Gettone firmato con la chiave privata (RS256, valido 1 ora). */
export function gettone(adesso = Date.now(), id = appId(), chiave = chiavePrivata()): string {
  if (!id || !chiave) throw new Error('Collegamento con la banca non configurato: mancano ENABLEBANKING_APP_ID e ENABLEBANKING_PRIVATE_KEY su Render.');
  const iat = Math.floor(adesso / 1000);
  const corpo = `${b64({ typ: 'JWT', alg: 'RS256', kid: id })}.${b64({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat, exp: iat + 3600 })}`;
  const firma = crypto.createSign('RSA-SHA256').update(corpo).sign(chiave).toString('base64url');
  return `${corpo}.${firma}`;
}

async function api<T>(metodo: string, percorso: string, corpo?: unknown): Promise<T> {
  const r = await fetch(`${URL_API()}${percorso}`, {
    method: metodo, headers: { Authorization: `Bearer ${gettone()}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo), signal: AbortSignal.timeout(60_000),
  });
  const testo = await r.text();
  let dati: any = null;
  try { dati = testo ? JSON.parse(testo) : null; } catch { /* risposta non JSON */ }
  if (!r.ok) {
    const codice = dati?.error ?? dati?.code ?? '';
    const messaggio = dati?.message ?? dati?.detail ?? testo.slice(0, 200);
    if (codice === 'EXPIRED_SESSION' || codice === 'SESSION_DOES_NOT_EXIST' || r.status === 401 && /session/i.test(messaggio))
      throw Object.assign(new Error('Il consenso dato in banca è scaduto: ricollega i conti con "Collega la banca".'), { scaduto: true });
    if (r.status === 429) throw new Error('La banca ha già risposto troppe volte oggi: riprova tra qualche ora.');
    throw new Error(`Enable Banking ${r.status}${codice ? ` ${codice}` : ''}: ${messaggio}`);
  }
  return dati as T;
}

/** Banche BPER disponibili (nome da usare per il collegamento). */
export async function bancheDisponibili(): Promise<BancaScelta[]> {
  const r = await api<{ aspsps: { name: string; country: string; psu_types?: string[]; auth_methods?: { name: string; title?: string; psu_type?: string }[] }[] }>('GET', '/aspsps?country=IT');
  return bancheBper(r.aspsps ?? []);
}

/** Primo passo: indirizzo della banca dove dare il consenso con l'app; `stato` torna indietro e si controlla al ritorno. */
export async function avviaCollegamento(banca: string, stato: string, metodo: string | null = null): Promise<string> {
  const r = await api<{ url: string }>('POST', '/auth', {
    access: { valid_until: scadenzaRichiesta(new Date()) }, aspsp: { name: banca, country: 'IT' }, state: stato,
    redirect_url: `${indirizzoPortale()}${percorsoRitorno}`, psu_type: 'business', language: 'it', ...(metodo ? { auth_method: metodo } : {}),
  });
  return r.url;
}

/** Ritorno dalla banca: il codice diventa la sessione con l'elenco dei conti. La sessione di prima si chiude. */
export async function completaCollegamento(codice: string, banca: string, utente: string, metodo: string | null = null): Promise<ContoCollegato[]> {
  const r = await api<{ session_id: string; accounts: { uid: string; account_id?: { iban?: string }; name?: string; identification_hash?: string }[]; access?: { valid_until?: string } }>(
    'POST', '/sessions', { code: codice });
  const prima = await statoOpenBanking();
  if (prima.sessione && prima.sessione !== r.session_id) await api('DELETE', `/sessions/${prima.sessione}`).catch(() => undefined);
  const conti = (r.accounts ?? []).map(a => ({ uid: a.uid, iban: a.account_id?.iban ?? null, numero: numeroConto(a.account_id?.iban ?? a.uid), nome: a.name ?? null }));
  await salvaStato({ banca, metodo, sessione: r.session_id, scadenza: r.access?.valid_until ?? scadenzaRichiesta(new Date()), conti,
    collegatoIl: new Date().toISOString(), collegatoDa: utente, errore: null });
  return conti;
}

/** Scollega: chiude la sessione (e il consenso in banca) e toglie i conti. I movimenti già scaricati restano. */
export async function scollega(): Promise<void> {
  const s = await statoOpenBanking();
  if (s.sessione && openBankingConfigurato()) await api('DELETE', `/sessions/${s.sessione}`).catch(() => undefined);
  await salvaStato({ sessione: null, scadenza: null, conti: [], errore: null });
}

/** Movimenti di un conto dal giorno indicato (tutte le pagine). */
async function transazioni(uid: string, dal: string): Promise<TransazioneApi[]> {
  const tutte: TransazioneApi[] = [];
  let continua: string | undefined;
  for (let pagina = 0; pagina < 50; pagina++) {
    const qs = new URLSearchParams({ date_from: dal, ...(continua ? { continuation_key: continua } : {}) });
    const r = await api<{ transactions?: TransazioneApi[]; continuation_key?: string | null }>('GET', `/accounts/${uid}/transactions?${qs}`);
    tutte.push(...(r.transactions ?? []));
    if (!r.continuation_key) break;
    continua = r.continuation_key;
  }
  return tutte;
}

/**
 * Scarica i movimenti di tutti i conti collegati e li passa alla stessa scrittura del CSV (`caricaMovimenti`): conti, saldi e abbinamenti
 * restano quelli di sempre. I movimenti già caricati dal CSV (stesso conto, data e importo) non si ripetono.
 */
export async function scaricaMovimenti(chi = 'automatico'): Promise<{ nuovi: number; gia: number; conti: number; testo: string }> {
  const s = await statoOpenBanking();
  if (!s.sessione || !s.conti?.length) throw new Error('Nessun conto collegato: premi "Collega la banca".');
  const oggi = partiRoma(new Date()).data;
  let nuovi = 0, gia = 0;
  const righe: string[] = [];
  try {
    for (const c of s.conti) {
      const ultimo = (await q1<{ al: string | null }>(`SELECT to_char(max(data), 'YYYY-MM-DD') AS al FROM banca_movimenti WHERE conto = $1`, [c.numero]))?.al ?? null;
      const dal = dataInizioScarico(ultimo, oggi);
      const letti = (await transazioni(c.uid, dal)).map(t => movimentoDaTransazione(t, c.numero)).filter((m): m is NonNullable<typeof m> => m != null);
      const esistenti = await q<{ conto: string; data: string; importo: number }>(`SELECT conto, to_char(data, 'YYYY-MM-DD') AS data, importo::float AS importo
        FROM banca_movimenti WHERE conto = $1 AND data >= $2`, [c.numero, dal]);
      const daScrivere = togliGiaPresenti(letti, esistenti);
      const esito = daScrivere.length ? await caricaMovimenti(daScrivere, c.numero, FILE_OPEN_BANKING) : { nuovi: 0, gia: 0 };
      nuovi += esito.nuovi; gia += letti.length - esito.nuovi;
      righe.push(`${c.nome ?? c.numero}: ${esito.nuovi} nuovi`);
    }
  } catch (e: any) {
    await salvaStato({ ultimoScarico: new Date().toISOString(), ultimoGiorno: oggi, errore: String(e?.message ?? e), ...(e?.scaduto ? { scadenza: new Date().toISOString() } : {}) });
    throw e;
  }
  const testo = `${nuovi} movimenti nuovi${gia ? `, ${gia} già presenti` : ''} (${righe.join('; ')})`;
  await salvaStato({ ultimoScarico: new Date().toISOString(), ultimoGiorno: oggi, esito: `${testo} · ${chi}`, errore: null });
  return { nuovi, gia, conti: s.conti.length, testo };
}

/**
 * Scarico automatico: un controllo dell'orologio ogni 10 minuti SENZA database; alle 8:30 dei giorni feriali una lettura dello stato e lo scarico.
 * Un errore si scrive nello stato e si vede in Banca; si riprova il giorno dopo (o con il pulsante).
 */
let giornoFatto: string | null = null;
export function avviaScaricoBanca(): void {
  if (!openBankingConfigurato()) return;
  setInterval(() => {
    const roma = partiRoma(new Date());
    if (!oraDiScaricare(roma, giornoFatto)) return;
    giornoFatto = roma.data;
    statoOpenBanking().then(s => {
      if (!s.sessione || !s.conti?.length || s.ultimoGiorno === roma.data) return;
      if (s.scadenza && new Date(s.scadenza).getTime() < Date.now()) return;
      return scaricaMovimenti('automatico').then(e => console.log('Banca:', e.testo));
    }).catch(e => console.error('Banca non scaricata:', e?.message ?? e));
  }, 10 * 60_000);
}
