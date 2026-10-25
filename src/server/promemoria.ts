/**
 * Promemoria per le fasi aperte dal telefono (regole in src/engine/promemoria.ts).
 * Per non tenere sveglio il database Neon (piano gratuito):
 *  - il promemoria "fase aperta da troppo" è un timer in memoria fissato all'apertura della fase
 *    (all'avvio del portale si ricaricano le fasi aperte con UNA lettura);
 *  - fine giornata e giorno dopo: un controllo dell'orologio ogni minuto, SENZA database; il database si
 *    interroga solo all'ora giusta, nei giorni feriali.
 * Canale: per ora i promemoria compaiono sul telefono dell'operatore (pagina reparto) e in Impostazioni → Promemoria.
 * Quando si sceglie la piattaforma (SMS, WhatsApp, Telegram) basta aggiungere un canale qui sotto.
 */
import { q, q1 } from './db.js';
import { daChiudereOggi, eOra, hhmm, leggiOrari, momentoPromemoria, partiRoma, sogliaMinuti, type OrariPromemoria } from '../engine/promemoria.js';

let orari: OrariPromemoria = leggiOrari({});
const timer = new Map<number, NodeJS.Timeout>();

export const orariPromemoria = () => orari;

/** Indirizzo pubblico del portale per i link nei messaggi (Render lo fornisce in RENDER_EXTERNAL_URL). */
export const indirizzoPortale = () => (process.env.RENDER_EXTERNAL_URL ?? process.env.INDIRIZZO_PUBBLICO ?? `http://localhost:${process.env.PORT ?? 3000}`).replace(/\/$/, '');

// ───────────────────────────── canali di invio ─────────────────────────────
interface Canale { nome: string; invia(sigla: string, testo: string): Promise<string> }

/** Per ora: il messaggio resta nel portale (lo vede l'operatore sul telefono e l'ufficio nelle impostazioni). */
const soloPortale: Canale = { nome: 'portale', invia: async () => 'visibile nel portale' };
const canaleAttivo = (): Canale => soloPortale;

/** Registra e invia un promemoria; uno solo al giorno per operatore, tipo e fase. */
export async function inviaNotifica(m: { sigla: string; tipo: 'durata' | 'fine_giornata' | 'giorno_dopo'; rilevazioneId?: number; testo: string; link: string }): Promise<boolean> {
  const canale = canaleAttivo();
  const r = await q1<{ id: number }>(`INSERT INTO notifiche (sigla, tipo, rilevazione_id, giorno, testo, link, canale) VALUES ($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT DO NOTHING RETURNING id`, [m.sigla, m.tipo, m.rilevazioneId ?? null, partiRoma(new Date()).data, m.testo, m.link, canale.nome]);
  if (!r) return false;
  let esito: string;
  try { esito = await canale.invia(m.sigla, `${m.testo}\n${m.link}`); } catch (e: any) { esito = 'ERRORE: ' + String(e?.message ?? e); }
  await q(`UPDATE notifiche SET esito = $2 WHERE id = $1`, [r.id, esito]);
  return true;
}

// ───────────────────────────── fasi aperte ─────────────────────────────
export interface FaseAperta {
  id: number; sigla: string; commessa_id: number; commessa: string; codice_qr: string; fase_codice: string; numero: string; nome: string;
  aperta_il: Date; data: string; inizio: string; previsto_sec: number;
}

/** Fasi aperte dal telefono e non ancora chiuse (di un operatore, di una commessa, oppure tutte). */
export const fasiAperte = (filtro: { sigla?: string; commessaId?: number; id?: number } = {}) => q<FaseAperta>(`
  SELECT r.id, r.operatore_nome AS sigla, c.id AS commessa_id, c.numero AS commessa, c.codice_qr, r.fase_codice, f.numero, f.nome,
         r.aperta_il, to_char(r.data, 'YYYY-MM-DD') AS data, to_char(r.ora_inizio, 'HH24:MI') AS inizio,
         coalesce(cf.ciclo_previsto_sec, 0)::float AS previsto_sec
  FROM rilevazioni r JOIN commesse c ON c.id = r.commessa_id JOIN fasi f ON f.codice = r.fase_codice
  LEFT JOIN commesse_fasi cf ON cf.commessa_id = r.commessa_id AND cf.fase_codice = r.fase_codice
  WHERE r.aperta_il IS NOT NULL AND r.chiusa_il IS NULL
    AND ($1::text IS NULL OR r.operatore_nome = $1) AND ($2::int IS NULL OR r.commessa_id = $2) AND ($3::int IS NULL OR r.id = $3)
  ORDER BY r.aperta_il`, [filtro.sigla ?? null, filtro.commessaId ?? null, filtro.id ?? null]);

const linkChiudi = (id: number) => `${indirizzoPortale()}/r/chiudi/${id}`;
const descrivi = (f: FaseAperta) => `commessa ${f.commessa}, fase ${f.numero} ${f.nome}`;

// ───────────────────────────── 1. fase aperta da troppo ─────────────────────────────
export function pianificaFase(f: { id: number; aperta_il: Date; previsto_sec: number }) {
  annullaFase(f.id);
  const quando = momentoPromemoria(new Date(f.aperta_il), sogliaMinuti(f.previsto_sec, orari), orari);
  if (!quando) return;
  const attesa = quando.getTime() - Date.now();
  if (attesa < -5 * 60_000) return; // passato da un pezzo (es. riavvio del portale): ci pensano fine giornata e giorno dopo
  timer.set(f.id, setTimeout(() => { timer.delete(f.id); void promemoriaDurata(f.id); }, Math.max(1000, attesa)));
}

export function annullaFase(id: number) {
  const t = timer.get(id);
  if (t) { clearTimeout(t); timer.delete(id); }
}

async function promemoriaDurata(id: number) {
  try {
    const [f] = await fasiAperte({ id });
    if (!f) return;
    const aperta = (Date.now() - new Date(f.aperta_il).getTime()) / 60_000;
    await inviaNotifica({
      sigla: f.sigla, tipo: 'durata', rilevazioneId: f.id, link: linkChiudi(f.id),
      testo: `${f.sigla}: ${descrivi(f)} è aperta da ${hhmm(aperta)}${f.previsto_sec > 0 ? ` (prevista ${hhmm(f.previsto_sec / 60)})` : ''}. Se hai finito, chiudila.`,
    });
  } catch (e) { console.error('Promemoria fase aperta non riuscito', e); }
}

// ───────────────────────────── 2. fine giornata  3. giorno dopo ─────────────────────────────
async function promemoriaFineGiornata() {
  const perOperatore = new Map<string, FaseAperta[]>();
  for (const f of await fasiAperte()) perOperatore.set(f.sigla, [...(perOperatore.get(f.sigla) ?? []), f]);
  for (const [sigla, fasi] of perOperatore) {
    await inviaNotifica({
      sigla, tipo: 'fine_giornata', link: `${indirizzoPortale()}/r`,
      testo: `${sigla}: hai ${fasi.length === 1 ? 'una fase ancora aperta' : `${fasi.length} fasi ancora aperte`}: `
        + fasi.map(f => `${f.commessa} fase ${f.numero} (dalle ${f.inizio}${f.data !== partiRoma(new Date()).data ? ` del ${f.data.slice(8, 10)}/${f.data.slice(5, 7)}` : ''})`).join(', ')
        + '. Chiudile prima di andare via.',
    });
  }
}

async function promemoriaGiornoDopo() {
  const oggi = partiRoma(new Date()).data;
  for (const f of await fasiAperte()) {
    if (!daChiudereOggi(f.data, oggi)) continue;
    await inviaNotifica({
      sigla: f.sigla, tipo: 'giorno_dopo', rilevazioneId: f.id, link: linkChiudi(f.id),
      testo: `${f.sigla}: ${descrivi(f)}, aperta il ${f.data.slice(8, 10)}/${f.data.slice(5, 7)} alle ${f.inizio}, non è stata chiusa. Apri il link e scrivi l'ora in cui hai finito.`,
    });
  }
}

/** Invio manuale dall'ufficio (Impostazioni → Promemoria), utile per provare. */
export async function inviaAdesso(tipo: 'fine_giornata' | 'giorno_dopo') {
  return tipo === 'fine_giornata' ? promemoriaFineGiornata() : promemoriaGiornoDopo();
}

/** Ricarica orari e timer (all'avvio, dopo il rientro dell'ufficio, dopo aver cambiato gli orari). */
export async function ricaricaPromemoria() {
  const r = await q1<{ valore: any }>(`SELECT valore FROM impostazioni WHERE chiave = 'promemoria'`);
  orari = leggiOrari(r?.valore);
  for (const id of [...timer.keys()]) annullaFase(id);
  for (const f of await fasiAperte()) pianificaFase(f);
}

export function avviaPromemoria() {
  ricaricaPromemoria().catch(e => console.error('Promemoria non caricati', e));
  const fatti = { fineGiornata: '', giornoDopo: '' };
  setInterval(() => {
    const adesso = partiRoma(new Date());
    if (eOra(orari.fineGiornata, adesso) && fatti.fineGiornata !== adesso.data) {
      fatti.fineGiornata = adesso.data;
      promemoriaFineGiornata().catch(e => console.error('Promemoria fine giornata non riuscito', e));
    }
    if (eOra(orari.giornoDopo, adesso) && fatti.giornoDopo !== adesso.data) {
      fatti.giornoDopo = adesso.data;
      promemoriaGiornoDopo().catch(e => console.error('Promemoria giorno dopo non riuscito', e));
    }
  }, 60_000);
}
