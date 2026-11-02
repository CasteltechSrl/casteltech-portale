/**
 * Invio di email da info@casteltech.net con Gmail (conferme d'ordine in risposta all'email del cliente).
 * Usa lo stesso account di servizio della cartella Drive (GOOGLE_SERVICE_ACCOUNT) con la "delega a livello di dominio"
 * di Google Workspace: l'account di servizio scrive a nome della casella GMAIL_MITTENTE (es. info@casteltech.net).
 * Da attivare una volta nella Console di amministrazione di Google Workspace (Sicurezza → Controllo API → Delega a livello
 * di dominio): ID client dell'account di servizio con gli ambiti
 *   https://www.googleapis.com/auth/gmail.send,https://www.googleapis.com/auth/gmail.readonly
 * gmail.readonly serve solo per trovare la conversazione dell'ordine: senza, l'email parte lo stesso (come risposta,
 * con In-Reply-To), ma nella casella di info@ può comparire come conversazione a parte.
 */
import { createSign } from 'node:crypto';
import { chiaveAccountServizio } from './drive.js';
import { conta, erroreServizio, riuscito } from './stato-servizi.js';
import { FUNZIONI_EMAIL, funzioneDi, indirizzoFunzione, scegliMittente } from '../engine/mittenti-email.js';

const SCOPE_INVIO = 'https://www.googleapis.com/auth/gmail.send';
const SCOPE_LETTURA = 'https://www.googleapis.com/auth/gmail.readonly';
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

/** Casella da cui partono le email (vuota = invio non attivo). */
export const mittenteGmail = () => (process.env.GMAIL_MITTENTE ?? '').trim().toLowerCase();
export const gmailConfigurato = () => !!chiaveAccountServizio() && /@/.test(mittenteGmail());

const token = new Map<string, { valore: string; scade: number }>();
async function accesso(scope: string): Promise<string> {
  const t = token.get(scope);
  if (t && t.scade > Date.now() + 60_000) return t.valore;
  const k = chiaveAccountServizio();
  if (!k) throw new Error('manca la chiave GOOGLE_SERVICE_ACCOUNT su Render');
  const b64 = (x: object | Buffer) => (Buffer.isBuffer(x) ? x : Buffer.from(JSON.stringify(x))).toString('base64url');
  const ora = Math.floor(Date.now() / 1000);
  const testo = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: k.client_email, sub: mittenteGmail(), scope, aud: 'https://oauth2.googleapis.com/token', iat: ora, exp: ora + 3600 })}`;
  const firma = createSign('RSA-SHA256').update(testo).sign(k.private_key);
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${testo}.${b64(firma)}` }),
  });
  const j: any = await r.json().catch(() => null);
  if (!r.ok || !j?.access_token) {
    const motivo = j?.error === 'unauthorized_client'
      ? `la delega di Google Workspace non è ancora attiva per ${mittenteGmail()} (Console di amministrazione → Sicurezza → Controllo API → Delega a livello di dominio)`
      : j?.error_description ?? j?.error ?? r.status;
    throw new Error(`accesso a Gmail non riuscito: ${motivo}`);
  }
  token.set(scope, { valore: j.access_token, scade: Date.now() + (Number(j.expires_in) || 3600) * 1000 });
  return j.access_token;
}

/** Conversazione di Gmail che contiene l'email con quel Message-ID (null se non si trova o manca il permesso di lettura). */
async function conversazioneDi(messaggioId: string): Promise<string | null> {
  try {
    const t = await accesso(SCOPE_LETTURA);
    const r = await fetch(`${API}/messages?${new URLSearchParams({ q: `rfc822msgid:${messaggioId}`, maxResults: '1', includeSpamTrash: 'true' })}`,
      { headers: { authorization: `Bearer ${t}` } });
    const j: any = await r.json().catch(() => null);
    return r.ok ? j?.messages?.[0]?.threadId ?? null : null;
  } catch { return null; }
}

/**
 * Indirizzi "Invia messaggio come" della casella principale (Gmail → Impostazioni → Account → Invia messaggio come):
 * solo da questi Gmail lascia partire un alias. Letti con l'ambito gmail.readonly, tenuti in memoria un'ora (10 minuti se
 * la lettura non riesce: null = si manda dalla casella principale). Nessuna query al database.
 */
let invioCome: { elenco: string[] | null; il: number; errore: string | null } | null = null;
export async function indirizziInvioCome(forza = false): Promise<string[] | null> {
  if (!gmailConfigurato()) return null;
  if (!forza && invioCome && Date.now() - invioCome.il < (invioCome.elenco ? 3_600_000 : 600_000)) return invioCome.elenco;
  try {
    const t = await accesso(SCOPE_LETTURA);
    const r = await fetch(`${API}/settings/sendAs`, { headers: { authorization: `Bearer ${t}` } });
    const j: any = await r.json().catch(() => null);
    if (!r.ok) throw new Error(j?.error?.message ?? String(r.status));
    const elenco = (j?.sendAs ?? [])
      .filter((x: any) => !x.verificationStatus || x.verificationStatus === 'accepted')
      .map((x: any) => String(x.sendAsEmail ?? '').trim().toLowerCase()).filter(Boolean);
    invioCome = { elenco, il: Date.now(), errore: null };
  } catch (e: any) {
    invioCome = { elenco: null, il: Date.now(), errore: String(e?.message ?? e) };
  }
  return invioCome.elenco;
}

/** Da chi parte l'email di quel tipo di documento (ddt, fattura, conferma_ordine, ordine_fornitore, sollecito, preventivo…). */
export async function mittentePer(tipo: string) {
  return scegliMittente(funzioneDi(tipo), mittenteGmail(), await indirizziInvioCome());
}

/** Stato degli alias per Impostazioni → Servizi (dall'ultima lettura in memoria, senza chiamare Gmail). */
export function statoAlias(): { funzione: string; indirizzo: string; attivo: boolean | null }[] {
  const p = mittenteGmail();
  if (!/@/.test(p)) return [];
  return FUNZIONI_EMAIL.map(f => {
    const indirizzo = indirizzoFunzione(f.funzione, p) ?? '';
    return { funzione: f.funzione, indirizzo, attivo: invioCome?.elenco ? invioCome.elenco.includes(indirizzo) : null };
  });
}

/** Manda il messaggio già composto (vedi messaggioEmail): se risponde a un'email, nella stessa conversazione. */
export async function inviaGmail(messaggio: string, inRispostaA?: string | null): Promise<{ id: string; conversazione: string | null }> {
  if (!gmailConfigurato()) throw new Error('invio con Gmail non attivo: mancano GMAIL_MITTENTE o GOOGLE_SERVICE_ACCOUNT su Render');
  const threadId = inRispostaA ? await conversazioneDi(inRispostaA) : null;
  const t = await accesso(SCOPE_INVIO);
  const r = await fetch(`${API}/messages/send`, {
    method: 'POST', headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json' },
    body: JSON.stringify({ raw: Buffer.from(messaggio, 'utf8').toString('base64url'), ...(threadId ? { threadId } : {}) }),
  });
  const j: any = await r.json().catch(() => null);
  if (!r.ok) {
    const msg = `Gmail non ha inviato l'email: ${j?.error?.message ?? r.status}`;
    erroreServizio('gmail', r.status === 429 ? 'limite' : 'altro', msg);
    throw new Error(msg);
  }
  conta('gmail', 'invio', { chiamate: 1 }); riuscito('gmail');
  return { id: String(j?.id ?? ''), conversazione: j?.threadId ?? threadId };
}
