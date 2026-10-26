/**
 * Cartella Google Drive degli ordini: ogni 15 minuti (lun–ven 8–20) il portale guarda la cartella condivisa con
 * l'account di servizio, scarica i file nuovi, li registra in "Da acquisire" (gli ordini li legge l'IA) e li sposta
 * nella sottocartella "Acquisiti". Il database si tocca solo se ci sono file nuovi (Neon gratuito: niente interrogazioni a vuoto).
 * Chiave: GOOGLE_SERVICE_ACCOUNT = contenuto del file JSON dell'account di servizio (solo su Render).
 * Cartella: DRIVE_CARTELLA_ORDINI (link o identificativo); se manca, l'unica cartella condivisa con l'account.
 */
import { createSign } from 'node:crypto';
import { aggiungiFile, elabora } from './acquisizioni-servizio.js';
import { fileDaAcquisire, idCartellaDa, orarioDrive } from '../engine/acquisizioni.js';
import { partiRoma } from '../engine/promemoria.js';

const API = 'https://www.googleapis.com/drive/v3';
const CARTELLA = 'application/vnd.google-apps.folder';
const NOME_ACQUISITI = 'Acquisiti';
const MAX_BYTE = 30 * 1024 * 1024;

interface Chiave { client_email: string; private_key: string }
function chiave(): Chiave | null {
  try {
    const k = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT ?? '');
    return k?.client_email && k?.private_key ? k : null;
  } catch { return null; }
}
export const driveConfigurato = () => !!chiave();
export const emailAccountDrive = () => chiave()?.client_email ?? null;

// ── accesso (token di un'ora, firmato con la chiave dell'account di servizio) ──
let token: { valore: string; scade: number } | null = null;
async function accesso(): Promise<string> {
  if (token && token.scade > Date.now() + 60_000) return token.valore;
  const k = chiave();
  if (!k) throw new Error('manca la chiave GOOGLE_SERVICE_ACCOUNT su Render');
  const b64 = (x: object | Buffer) => (Buffer.isBuffer(x) ? x : Buffer.from(JSON.stringify(x))).toString('base64url');
  const ora = Math.floor(Date.now() / 1000);
  const testo = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: k.client_email, scope: 'https://www.googleapis.com/auth/drive', aud: 'https://oauth2.googleapis.com/token', iat: ora, exp: ora + 3600 })}`;
  const firma = createSign('RSA-SHA256').update(testo).sign(k.private_key);
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${testo}.${b64(firma)}` }),
  });
  const j: any = await r.json().catch(() => null);
  if (!r.ok || !j?.access_token) throw new Error(`accesso a Google non riuscito: ${j?.error_description ?? j?.error ?? r.status}`);
  token = { valore: j.access_token, scade: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
  return token.valore;
}

async function chiama(percorso: string, opz: RequestInit = {}): Promise<Response> {
  const r = await fetch(`${API}${percorso}`, { ...opz, headers: { ...(opz.headers ?? {}), authorization: `Bearer ${await accesso()}` } });
  if (!r.ok) {
    const j: any = await r.json().catch(() => null);
    throw new Error(`Google Drive: ${j?.error?.message ?? r.status}`);
  }
  return r;
}
const elenco = async (q: string) => ((await (await chiama(`/files?${new URLSearchParams({
  q, fields: 'files(id,name,mimeType,size)', pageSize: '100', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true', orderBy: 'createdTime',
})}`)).json()) as any).files as { id: string; name: string; mimeType: string; size?: string }[];

// ── cartelle ──
let cartelle: { ordini: string; acquisiti: string } | null = null;
async function trovaCartelle() {
  if (cartelle) return cartelle;
  let ordini = idCartellaDa(process.env.DRIVE_CARTELLA_ORDINI ?? '');
  if (!ordini) {
    const condivise = await elenco(`mimeType = '${CARTELLA}' and sharedWithMe and trashed = false`);
    if (condivise.length !== 1) throw new Error(condivise.length
      ? `l'account vede ${condivise.length} cartelle condivise: indicare quale con DRIVE_CARTELLA_ORDINI su Render`
      : `nessuna cartella condivisa con ${emailAccountDrive()}: condividerla come Editor`);
    ordini = condivise[0].id;
  }
  let acquisiti = (await elenco(`'${ordini}' in parents and mimeType = '${CARTELLA}' and name = '${NOME_ACQUISITI}' and trashed = false`))[0]?.id;
  if (!acquisiti) {
    acquisiti = ((await (await chiama('/files?supportsAllDrives=true', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: NOME_ACQUISITI, mimeType: CARTELLA, parents: [ordini] }),
    })).json()) as any).id as string;
  }
  cartelle = { ordini, acquisiti };
  return cartelle;
}

export interface EsitoDrive { file: number; letti: string[]; errori: string[] }
let inCorso: Promise<EsitoDrive> | null = null;

/** Guarda la cartella e acquisisce i file nuovi. Due controlli insieme non partono mai. */
export function controllaDrive(): Promise<EsitoDrive> {
  inCorso ??= (async () => {
    const esito: EsitoDrive = { file: 0, letti: [], errori: [] };
    const { ordini, acquisiti } = await trovaCartelle();
    const nuovi = (await elenco(`'${ordini}' in parents and trashed = false`)).filter(f => fileDaAcquisire(f.mimeType));
    for (const f of nuovi) {
      esito.file++;
      try {
        if (Number(f.size ?? 0) > MAX_BYTE) throw new Error('file oltre 30 MB');
        const dati = Buffer.from(await (await chiama(`/files/${f.id}?alt=media&supportsAllDrives=true`)).arrayBuffer());
        // stesso file già registrato (es. spostamento non riuscito l'altra volta): non si rilegge
        const { id } = await aggiungiFile(f.name, dati, { origine: 'drive', driveId: f.id });
        if (id) await elabora(id);
        await chiama(`/files/${f.id}?addParents=${acquisiti}&removeParents=${ordini}&supportsAllDrives=true`, { method: 'PATCH' });
        esito.letti.push(f.name);
      } catch (e: any) { esito.errori.push(`${f.name}: ${e?.message ?? e}`); }
    }
    return esito;
  })().finally(() => { inCorso = null; });
  return inCorso;
}

/** Controllo ogni 15 minuti, solo nei giorni feriali 8–20. Senza chiave non parte. */
export function avviaControlloDrive() {
  if (!driveConfigurato()) return;
  setInterval(() => {
    if (!orarioDrive(partiRoma(new Date()))) return;
    controllaDrive().then(e => { if (e.errori.length) console.error('Cartella Drive:', e.errori.join('; ')); })
      .catch(e => console.error('Cartella Drive non controllata:', e?.message ?? e));
  }, 15 * 60_000);
}
