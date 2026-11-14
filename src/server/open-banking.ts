/**
 * Collegamento automatico con la banca tramite Enable Banking (open banking PSD2; regole in `engine/open-banking.ts`).
 * Chiavi solo su Render: ENABLEBANKING_APP_ID (id dell'applicazione) e ENABLEBANKING_PRIVATE_KEY (chiave privata .pem, anche con "\n" al posto
 * degli a capo). Stato in impostazioni 'open_banking': sessione, scadenza del consenso, conti collegati, ultimo scarico ed esito.
 * Il database si tocca solo quando si scarica (una volta al giorno feriale alle 8:30, o con il pulsante).
 */
import crypto from 'node:crypto';
import { q, q1 } from './db.js';
import { caricaMovimenti, contiBanca, salvaConti } from './banca-servizio.js';
import type { TipoConto } from '../engine/banca.js';
import { FILE_OPEN_BANKING, NOMI_COLLEGAMENTO, bancheBper, collegamentiDaStato, contoDaApi, dataInizioScarico, movimentoDaTransazione, oraDiScaricare, scadenzaRichiesta,
  tipoCollegamento, tipoUtente, togliGiaPresenti, type BancaScelta, type Collegamento, type ContoApi, type ContoCollegato, type TipoCollegamento, type TransazioneApi } from '../engine/open-banking.js';
import { partiRoma } from '../engine/promemoria.js';
import { indirizzoPortale } from './promemoria.js';

const URL_API = () => (process.env.ENABLEBANKING_URL ?? 'https://api.enablebanking.com').replace(/\/$/, '');
const appId = () => process.env.ENABLEBANKING_APP_ID?.trim() || null;
const chiavePrivata = () => normalizzaChiave(process.env.ENABLEBANKING_PRIVATE_KEY);

/**
 * Chiave .pem come la si incolla su Render: a capo tolti o diventati spazi, "\n" scritti, virgolette intorno, solo il blocco senza
 * intestazione. Si rifà il PEM: intestazione, corpo base64 a righe da 64, chiusura (Adriano 14/11/2026: "DECODER routines::unsupported").
 */
export function normalizzaChiave(v: string | null | undefined): string | null {
  let k = String(v ?? '').trim().replace(/^["']|["']$/g, '').replace(/\\n/g, '\n').trim();
  if (!k) return null;
  const m = k.match(/-----BEGIN ([A-Z ]+)-----([\s\S]*?)-----END \1-----/);
  const tipo = m ? m[1] : 'PRIVATE KEY';
  const corpo = (m ? m[2] : k).replace(/[^A-Za-z0-9+/=]/g, '');
  if (!corpo) return null;
  return `-----BEGIN ${tipo}-----\n${corpo.match(/.{1,64}/g)!.join('\n')}\n-----END ${tipo}-----\n`;
}
export const openBankingConfigurato = () => Boolean(appId() && chiavePrivata());
export const percorsoRitorno = '/amministrazione/banca/collega/ritorno';

export type { ContoCollegato, Collegamento };
export interface StatoOpenBanking { collegamenti: Collegamento[]; ultimoGiorno?: string }

export async function statoOpenBanking(): Promise<StatoOpenBanking> {
  const v = (await q1<{ valore: any }>(`SELECT valore FROM impostazioni WHERE chiave = 'open_banking'`))?.valore ?? {};
  return { collegamenti: collegamentiDaStato(v), ultimoGiorno: v.ultimoGiorno };
}
/** Scrive tutti i collegamenti (e toglie i campi dello stato di prima, quando c'era un collegamento solo). */
async function salvaStato(parte: { collegamenti?: Collegamento[]; ultimoGiorno?: string }): Promise<void> {
  const valore = { ...parte, ...(parte.collegamenti ? { sessione: null, conti: null, scadenza: null, banca: null, metodo: null, esito: null, errore: null } : {}) };
  await q(`INSERT INTO impostazioni (chiave, valore) VALUES ('open_banking', $1::jsonb)
    ON CONFLICT (chiave) DO UPDATE SET valore = impostazioni.valore || $1::jsonb, aggiornato_il = now()`, [JSON.stringify(valore)]);
}
async function aggiornaCollegamento(id: TipoCollegamento, cambia: (c: Collegamento | undefined) => Collegamento | null): Promise<void> {
  const tutti = (await statoOpenBanking()).collegamenti;
  const nuovo = cambia(tutti.find(c => c.id === id));
  await salvaStato({ collegamenti: [...tutti.filter(c => c.id !== id), ...(nuovo ? [nuovo] : [])].sort((a, b) => ORDINE.indexOf(a.id) - ORDINE.indexOf(b.id)) });
}
const ORDINE: TipoCollegamento[] = ['conti', 'carta', 'paypal'];

// ───────────────────────────── chiamate all'API ─────────────────────────────

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
/** Gettone firmato con la chiave privata (RS256, valido 1 ora). */
export function gettone(adesso = Date.now(), id = appId(), chiave = chiavePrivata()): string {
  if (!id || !chiave) throw new Error('Collegamento con la banca non configurato: mancano ENABLEBANKING_APP_ID e ENABLEBANKING_PRIVATE_KEY su Render.');
  const iat = Math.floor(adesso / 1000);
  const corpo = `${b64({ typ: 'JWT', alg: 'RS256', kid: id })}.${b64({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat, exp: iat + 3600 })}`;
  let firma: string;
  try { firma = crypto.createSign('RSA-SHA256').update(corpo).sign(chiave).toString('base64url'); }
  catch { throw new Error('La chiave ENABLEBANKING_PRIVATE_KEY su Render non si legge: incolla di nuovo tutto il file .pem (da -----BEGIN a -----END).'); }
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

/** Banche disponibili: BPER (conti e carte) e PayPal. */
export async function bancheDisponibili(): Promise<BancaScelta[]> {
  const r = await api<{ aspsps: { name: string; country: string; psu_types?: string[]; auth_methods?: { name: string; title?: string; psu_type?: string }[] }[] }>('GET', '/aspsps?country=IT');
  return bancheBper(r.aspsps ?? []);
}

/** Primo passo: indirizzo della banca (o di PayPal) dove dare il consenso; `stato` torna indietro e si controlla al ritorno. */
export async function avviaCollegamento(banca: string, stato: string, metodo: string | null = null): Promise<string> {
  const r = await api<{ url: string }>('POST', '/auth', {
    access: { valid_until: scadenzaRichiesta(new Date()) }, aspsp: { name: banca, country: 'IT' }, state: stato,
    redirect_url: `${indirizzoPortale()}${percorsoRitorno}`, psu_type: tipoUtente(metodo), language: 'it', ...(metodo ? { auth_method: metodo } : {}),
  });
  return r.url;
}

/** Tipo del conto in Banca per i conti di un collegamento (carta e PayPal non sono conti correnti: niente saldo di cassa). */
const TIPO_CONTO: Record<TipoCollegamento, TipoConto | null> = { conti: null, carta: 'carta', paypal: 'paypal' };

/** Ritorno dalla banca: il codice diventa la sessione con l'elenco dei conti. La sessione di prima dello stesso tipo si chiude. */
export async function completaCollegamento(codice: string, banca: string, utente: string, metodo: string | null = null): Promise<Collegamento> {
  const r = await api<{ session_id: string; accounts: ContoApi[]; access?: { valid_until?: string } }>('POST', '/sessions', { code: codice });
  const id = tipoCollegamento(banca, metodo);
  const conti = (r.accounts ?? []).map(a => contoDaApi(a, id));
  let prima: string | undefined;
  const nuovo: Collegamento = { id, banca, metodo, sessione: r.session_id, scadenza: r.access?.valid_until ?? scadenzaRichiesta(new Date()), conti,
    collegatoIl: new Date().toISOString(), collegatoDa: utente, errore: null };
  await aggiornaCollegamento(id, c => { prima = c?.sessione; return nuovo; });
  if (prima && prima !== r.session_id) await api('DELETE', `/sessions/${prima}`).catch(() => undefined);
  // carta e PayPal: conti segnati subito col loro tipo (altrimenti al primo scarico diventerebbero conti d'anticipo)
  const tipo = TIPO_CONTO[id];
  if (tipo) {
    const esistenti = await contiBanca();
    const daAggiungere = conti.filter(c => !esistenti.some(e => e.numero === c.numero));
    if (daAggiungere.length) await salvaConti([...esistenti, ...daAggiungere.map(c => ({ numero: c.numero, nome: (c.nome ?? NOMI_COLLEGAMENTO[id]).toUpperCase(), tipo,
      saldoData: null, saldo: null, fido: null }))]);
  }
  return nuovo;
}

/** Scollega un collegamento: chiude la sessione (e il consenso) e toglie i conti. I movimenti già scaricati restano. */
export async function scollega(id: TipoCollegamento): Promise<void> {
  const c = (await statoOpenBanking()).collegamenti.find(x => x.id === id);
  if (c?.sessione && openBankingConfigurato()) await api('DELETE', `/sessions/${c.sessione}`).catch(() => undefined);
  await aggiornaCollegamento(id, () => null);
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

/** Scarico di un collegamento: per ogni conto i movimenti dall'ultimo giorno caricato, senza quelli già presenti (anche dal CSV). */
async function scaricaCollegamento(c: Collegamento, oggi: string): Promise<{ nuovi: number; gia: number; righe: string[] }> {
  let nuovi = 0, gia = 0;
  const righe: string[] = [];
  for (const conto of c.conti) {
    const ultimo = (await q1<{ al: string | null }>(`SELECT to_char(max(data), 'YYYY-MM-DD') AS al FROM banca_movimenti WHERE conto = $1`, [conto.numero]))?.al ?? null;
    const dal = dataInizioScarico(ultimo, oggi);
    const letti = (await transazioni(conto.uid, dal)).map(t => movimentoDaTransazione(t, conto.numero)).filter((m): m is NonNullable<typeof m> => m != null);
    const esistenti = await q<{ conto: string; data: string; importo: number }>(`SELECT conto, to_char(data, 'YYYY-MM-DD') AS data, importo::float AS importo
      FROM banca_movimenti WHERE conto = $1 AND data >= $2`, [conto.numero, dal]);
    const daScrivere = togliGiaPresenti(letti, esistenti);
    const esito = daScrivere.length ? await caricaMovimenti(daScrivere, conto.numero, FILE_OPEN_BANKING) : { nuovi: 0, gia: 0 };
    nuovi += esito.nuovi; gia += letti.length - esito.nuovi;
    righe.push(`${conto.nome ?? conto.numero}: ${esito.nuovi} nuovi`);
  }
  return { nuovi, gia, righe };
}

/**
 * Scarica i movimenti di tutti i collegamenti attivi e li passa alla stessa scrittura del CSV (`caricaMovimenti`): conti, saldi e abbinamenti
 * restano quelli di sempre. Un collegamento che non risponde non ferma gli altri; l'errore resta sul suo riquadro.
 */
export async function scaricaMovimenti(chi = 'automatico', solo?: TipoCollegamento): Promise<{ nuovi: number; gia: number; conti: number; testo: string }> {
  const tutti = (await statoOpenBanking()).collegamenti.filter(c => c.conti.length && (!solo || c.id === solo));
  if (!tutti.length) throw new Error('Nessun conto collegato: premi "Collega".');
  const oggi = partiRoma(new Date()).data;
  let nuovi = 0, gia = 0, conti = 0;
  const parti: string[] = [], errori: string[] = [];
  for (const c of tutti) {
    if (c.scadenza && new Date(c.scadenza).getTime() < Date.now()) { errori.push(`${NOMI_COLLEGAMENTO[c.id]}: consenso scaduto`); continue; }
    try {
      const e = await scaricaCollegamento(c, oggi);
      nuovi += e.nuovi; gia += e.gia; conti += c.conti.length;
      const testo = `${e.nuovi} movimenti nuovi${e.gia ? `, ${e.gia} già presenti` : ''} (${e.righe.join('; ')})`;
      parti.push(`${NOMI_COLLEGAMENTO[c.id]}: ${testo}`);
      await aggiornaCollegamento(c.id, x => x ? { ...x, ultimoScarico: new Date().toISOString(), esito: `${testo} · ${chi}`, errore: null } : null);
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      errori.push(`${NOMI_COLLEGAMENTO[c.id]}: ${msg}`);
      await aggiornaCollegamento(c.id, x => x ? { ...x, ultimoScarico: new Date().toISOString(), errore: msg, ...(err?.scaduto ? { scadenza: new Date().toISOString() } : {}) } : null);
    }
  }
  await salvaStato({ ultimoGiorno: oggi });
  if (!parti.length) throw new Error(errori.join(' · '));
  return { nuovi, gia, conti, testo: [...parti, ...errori.map(e => `non riuscito ${e}`)].join(' · ') };
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
      if (!s.collegamenti.length || s.ultimoGiorno === roma.data) return;
      return scaricaMovimenti('automatico').then(e => console.log('Banca:', e.testo));
    }).catch(e => console.error('Banca non scaricata:', e?.message ?? e));
  }, 10 * 60_000);
}
