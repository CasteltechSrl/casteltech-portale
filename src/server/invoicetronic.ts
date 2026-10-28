/**
 * Invio delle fatture allo SdI e ritorno degli esiti tramite Invoicetronic (Adriano, 28/10/2026; regole in engine/sdi.ts).
 * Chiave: INVOICETRONIC_API_KEY (solo su Render). ik_test_ = prova (sandbox, niente arriva allo SdI), ik_live_ = reale.
 *
 * - Invio: POST /send con l'XML del documento emesso (con la chiave di prova anche dalla bozza, numero 0, per provare).
 *   Il nome del file lo dà Invoicetronic (sempre nuovo, così un nuovo invio dopo uno scarto non è un doppione).
 * - Esiti: Invoicetronic chiama il webhook /sdi/webhook quando arriva un esito (niente controlli periodici: il database
 *   Neon si sveglia solo quando c'è qualcosa); il pulsante "Aggiorna esito" li rilegge a mano (gratis in Invoicetronic).
 * - Fatture dei fornitori (receive): l'evento si registra; la lettura arriva nel passo successivo.
 */
import { q, q1, transazione } from './db.js';
import { anteprimaDocumento } from './documenti-servizio.js';
import {
  STATI_SDI, ambienteDaChiave, firmaWebhookValida, messaggioErroreApi, statoPiuAvanti, testoErrori, type Ambiente, type StatoSdi,
} from '../engine/sdi.js';

const URL_API = () => (process.env.INVOICETRONIC_URL ?? 'https://api.invoicetronic.com/v1').replace(/\/$/, '');
const chiave = () => process.env.INVOICETRONIC_API_KEY?.trim() || null;
export const ambienteAttuale = (): Ambiente | null => ambienteDaChiave(chiave());
/** Documenti che vanno allo SdI (i DDT no). */
export const TIPI_SDI = ['fattura', 'nota_credito', 'autofattura'];

export class ErroreSdi extends Error {}

async function chiama<T = any>(metodo: string, percorso: string, corpo?: unknown, intestazioni: Record<string, string> = {}): Promise<T> {
  const k = chiave();
  if (!k) throw new ErroreSdi('Manca la chiave di Invoicetronic (INVOICETRONIC_API_KEY su Render).');
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const r = await fetch(`${URL_API()}${percorso}`, {
      method: metodo, signal: ctrl.signal,
      headers: { authorization: `Basic ${Buffer.from(`${k}:`).toString('base64')}`, accept: 'application/json',
        ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}), ...intestazioni },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    });
    const testo = await r.text();
    let dati: any = testo;
    try { dati = testo ? JSON.parse(testo) : null; } catch { /* testo semplice */ }
    if (!r.ok) throw new ErroreSdi(messaggioErroreApi(r.status, dati));
    return dati as T;
  } catch (e: any) {
    if (e instanceof ErroreSdi) throw e;
    throw new ErroreSdi(e?.name === 'AbortError' ? 'Invoicetronic non ha risposto in tempo: riprova.' : `Invoicetronic non raggiungibile: ${e?.message ?? e}`);
  } finally { clearTimeout(t); }
}

/** Crediti rimasti e webhook collegato, per Impostazioni → Amministrazione. */
export async function statoInvoicetronic(): Promise<{ ambiente: Ambiente | null; operazioni?: number; errore?: string; webhook: any }> {
  const ambiente = ambienteAttuale();
  const conf = await configurazione();
  const webhook = ambiente ? conf[ambiente] ?? null : null;
  if (!ambiente) return { ambiente, webhook };
  try {
    const s = await chiama<{ operation_left: number }>('GET', '/status');
    return { ambiente, operazioni: s?.operation_left, webhook };
  } catch (e: any) { return { ambiente, errore: e.message, webhook }; }
}

/** impostazioni.invoicetronic = { prova: {webhook_id, segreto, url}, reale: {…} } */
async function configurazione(): Promise<Partial<Record<Ambiente, { webhook_id: number; segreto: string; url: string; collegato_il: string }>>> {
  return (await q1<{ valore: any }>(`SELECT valore FROM impostazioni WHERE chiave = 'invoicetronic'`))?.valore ?? {};
}

/**
 * Collega il webhook di Invoicetronic all'indirizzo del portale (esiti e fatture ricevute). Se ce n'era già uno per
 * questa chiave lo sostituisce. Il segreto (serve a riconoscere le chiamate vere) si vede solo ora: resta nel database.
 */
export async function collegaWebhook(urlPortale: string): Promise<void> {
  const ambiente = ambienteAttuale();
  if (!ambiente) throw new ErroreSdi('Manca la chiave di Invoicetronic (INVOICETRONIC_API_KEY su Render).');
  const conf = await configurazione();
  const vecchio = conf[ambiente];
  if (vecchio?.webhook_id) await chiama('DELETE', `/webhook/${vecchio.webhook_id}`).catch(() => undefined);
  const url = `${urlPortale.replace(/\/$/, '')}/sdi/webhook`;
  const w = await chiama<{ id: number; secret: string }>('POST', '/webhook', {
    url, enabled: true, description: 'Portale Casteltech: esiti SdI e fatture ricevute', events: ['update.add', 'receive.add'] });
  if (!w?.secret) throw new ErroreSdi('Invoicetronic non ha restituito il segreto del webhook.');
  conf[ambiente] = { webhook_id: w.id, segreto: w.secret, url, collegato_il: new Date().toISOString() };
  await q(`INSERT INTO impostazioni (chiave, valore) VALUES ('invoicetronic', $1) ON CONFLICT (chiave) DO UPDATE SET valore = $1, aggiornato_il = now()`,
    [JSON.stringify(conf)]);
}

/**
 * Manda il documento allo SdI. Con la chiave reale solo i documenti emessi (una volta: un nuovo invio solo dopo uno scarto);
 * con la chiave di prova anche le bozze (XML con numero 0), per provare tutto senza consumare la numerazione.
 */
export async function inviaDocumento(id: number, utenteId: number | null): Promise<{ invioId: number; messaggio: string }> {
  const ambiente = ambienteAttuale();
  if (!ambiente) throw new ErroreSdi('Manca la chiave di Invoicetronic (INVOICETRONIC_API_KEY su Render).');
  const d = await q1(`SELECT id, tipo, stato, xml, origine FROM documenti WHERE id = $1`, [id]);
  if (!d) throw new ErroreSdi('Documento non trovato.');
  if (!TIPI_SDI.includes(d.tipo)) throw new ErroreSdi('Allo SdI vanno solo fatture, note di credito e autofatture.');
  if (d.origine !== 'portale') throw new ErroreSdi('Documento di Fatture in Cloud: è già stato inviato da lì.');
  let xml: string = d.xml;
  if (d.stato === 'bozza') {
    if (ambiente === 'reale') throw new ErroreSdi('Prima emetti il documento: allo SdI va solo con il suo numero.');
    const { esito, erroriExtra } = await anteprimaDocumento(id);
    const errori = [...esito.errori, ...erroriExtra];
    if (errori.length) throw new ErroreSdi(`La bozza ha errori: ${errori.join(' ')}`);
    xml = esito.xml;
  } else if (ambiente === 'reale') {
    if (!['emesso', 'scartato'].includes(d.stato)) throw new ErroreSdi('Il documento è già stato inviato allo SdI.');
    const inCorso = await q1(`SELECT id FROM sdi_invii WHERE documento_id = $1 AND ambiente = 'reale' AND stato NOT IN ('Scartato', 'errore')`, [id]);
    if (inCorso) throw new ErroreSdi('Il documento è già stato inviato allo SdI: aspetta l\'esito.');
  }
  if (!xml) throw new ErroreSdi('Manca l\'XML del documento.');
  const nInvii = (await q1<{ n: number }>(`SELECT count(*)::int AS n FROM sdi_invii WHERE documento_id = $1 AND ambiente = $2`, [id, ambiente]))!.n;
  try {
    const s = await chiama<{ id: number; file_name: string }>('POST', '/send?validate=true',
      { payload: xml, meta_data: { documento_id: id, portale: 'casteltech' } },
      { 'Idempotency-Key': `casteltech-${ambiente}-doc${id}-${nInvii + 1}` });
    const r = await q1<{ id: number }>(`INSERT INTO sdi_invii (documento_id, ambiente, invoicetronic_id, nome_file, creato_da) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (ambiente, invoicetronic_id) DO UPDATE SET aggiornato_il = now() RETURNING id`, [id, ambiente, s.id, s.file_name, utenteId]);
    if (ambiente === 'reale') await q(`UPDATE documenti SET sdi_id = $2, sdi_stato = 'caricato', sdi_messaggio = NULL,
      stato = CASE WHEN stato = 'scartato' THEN 'emesso' ELSE stato END, aggiornato_il = now() WHERE id = $1`, [id, String(s.id)]);
    return { invioId: r!.id, messaggio: ambiente === 'prova'
      ? `Inviato a Invoicetronic in PROVA (file ${s.file_name}): non arriva allo SdI. L'esito simulato arriva entro un'ora o due.`
      : `Inviato allo SdI (file ${s.file_name}). L'esito arriva di solito in pochi minuti, a volte in qualche ora.` };
  } catch (e: any) {
    await q(`INSERT INTO sdi_invii (documento_id, ambiente, stato, messaggio, creato_da) VALUES ($1, $2, 'errore', $3, $4)`, [id, ambiente, e.message, utenteId]);
    throw e;
  }
}

/** Applica un esito dello SdI (Update di Invoicetronic) all'invio e, se è reale, al documento. */
export async function applicaEsito(ambiente: Ambiente, u: any): Promise<string> {
  const stato = String(u?.state ?? '') as StatoSdi;
  const regola = STATI_SDI[stato];
  if (!regola) return `stato sconosciuto ${stato}`;
  return transazione(async c => {
    const inv = (await c.query(`SELECT * FROM sdi_invii WHERE ambiente = $1 AND invoicetronic_id = $2 FOR UPDATE`, [ambiente, u.send_id])).rows[0];
    if (!inv) return `invio ${u.send_id} non del portale`;
    if (!statoPiuAvanti(inv.stato, stato)) return `esito ${stato} più vecchio di ${inv.stato}: ignorato`;
    const dettagli = [u.description, testoErrori(u.errors)].filter(Boolean).join(' · ');
    const messaggio = [regola.testo, dettagli].filter(Boolean).join(' ');
    const identificativo = u.identifier ?? u.send?.identifier ?? inv.identificativo;
    await c.query(`UPDATE sdi_invii SET stato = $2, messaggio = $3, errori = $4, identificativo = $5, aggiornato_il = now() WHERE id = $1`,
      [inv.id, stato, messaggio, u.errors?.length ? JSON.stringify(u.errors) : null, identificativo]);
    if (ambiente === 'reale')
      await c.query(`UPDATE documenti SET stato = $2, sdi_stato = $3, sdi_messaggio = $4, sdi_identificativo = $5, aggiornato_il = now()
        WHERE id = $1 AND stato <> 'annullato'`, [inv.documento_id, regola.stato, stato, messaggio, identificativo]);
    return `documento ${inv.documento_id}: ${stato}`;
  });
}

/** Rilegge da Invoicetronic gli esiti degli invii del documento ancora aperti (con la chiave attuale). */
export async function aggiornaEsitiDocumento(id: number): Promise<number> {
  const ambiente = ambienteAttuale();
  if (!ambiente) throw new ErroreSdi('Manca la chiave di Invoicetronic (INVOICETRONIC_API_KEY su Render).');
  const invii = await q(`SELECT invoicetronic_id FROM sdi_invii WHERE documento_id = $1 AND ambiente = $2 AND invoicetronic_id IS NOT NULL
    AND stato NOT IN ('Consegnato', 'Scartato', 'DecorrenzaTermini', 'AccettatoDalDestinatario', 'RifiutatoDalDestinatario', 'errore')`, [id, ambiente]);
  let n = 0;
  for (const inv of invii) {
    const esiti = await chiama<any[]>('GET', `/update?send_id=${inv.invoicetronic_id}&sort=last_update&page_size=100`);
    for (const u of esiti ?? []) if (STATI_SDI[u.state as StatoSdi] && !/ignorato|non del portale/.test(await applicaEsito(ambiente, u))) n++;
  }
  return n;
}

/**
 * Chiamata del webhook di Invoicetronic (corpo grezzo, per la firma). Riconosce l'ambiente dal segreto, scarta i doppioni,
 * per un esito legge l'Update e lo applica. Non lancia errori: Invoicetronic ritenta se la risposta non è 2xx.
 */
export async function riceviWebhook(corpo: string, firma: string | undefined): Promise<{ valido: boolean; esito: string }> {
  const conf = await configurazione();
  const ambiente = (['reale', 'prova'] as Ambiente[]).find(a => conf[a]?.segreto && firmaWebhookValida(firma, corpo, conf[a]!.segreto));
  if (!ambiente) return { valido: false, esito: 'firma non valida' };
  let ev: any;
  try { ev = JSON.parse(corpo); } catch { return { valido: true, esito: 'corpo non leggibile' }; }
  const tipo = String(ev.Endpoint ?? '').toLowerCase().replace(/^\/|\/.*$/g, '');
  const nuovo = await q1(`INSERT INTO sdi_eventi (id, ambiente, tipo, risorsa_id) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING id`,
    [ev.Id, ambiente, tipo, ev.ResourceId ?? null]);
  if (!nuovo) return { valido: true, esito: 'già ricevuto' };
  let esito = 'registrato';
  try {
    if (ambiente !== ambienteAttuale()) esito = `evento ${ambiente} con chiave ${ambienteAttuale() ?? 'assente'}: non letto`;
    else if (tipo === 'update' && ev.ResourceId) esito = await applicaEsito(ambiente, await chiama('GET', `/update/${ev.ResourceId}`));
    else if (tipo === 'receive') esito = 'fattura ricevuta: da leggere';
  } catch (e: any) { esito = `errore: ${e.message}`; }
  await q(`UPDATE sdi_eventi SET esito = $3 WHERE id = $1 AND ambiente = $2`, [ev.Id, ambiente, esito.slice(0, 500)]);
  return { valido: true, esito };
}
