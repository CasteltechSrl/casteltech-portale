/**
 * Moduli del sito casteltech.net (pagine statiche su Render, cartella sito/ del repository; Adriano 2/11/2026).
 * Senza sessione e senza chiave: li usano i visitatori del sito. Regole in engine/sito.ts.
 *
 *  - POST /api/sito/contatto   → email a info@ con "Rispondi" verso chi ha scritto.
 *  - POST /api/sito/preventivo → pacchetto nei Documenti commesse ("SITO – AZIENDA", o "SITO – PRIVATO – NOME") con il testo
 *                                della richiesta e i file utili (stessa scelta del pulsante di Gmail), analisi dopo la risposta,
 *                                email a info@ con il link. Accetta il modulo del vecchio WordPress e il preventivo guidato del sito nuovo.
 *  - POST /api/sito/candidatura → email a info@ con il curriculum allegato (modulo "Lavora con noi" del sito nuovo, 8/11/2026).
 *
 * Arrivano come multipart (FormData del browser) da public/moduli.js del sito: va montato PRIMA dei lettori da 2 MB (index.ts).
 * Contro i robot: casella trappola, tempo minimo di compilazione, 5 invii all'ora per indirizzo; niente database per i rifiuti.
 */
import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { q } from '../db.js';
import { caricamentoLimitato } from '../memoria.js';
import { gmailConfigurato, inviaGmail, mittenteGmail } from '../gmail.js';
import { messaggioEmail } from '../../engine/conferme-ordine.js';
import { analizzaPacchetto, aggiungiFile, creaPacchetto, scegliFileDaCaricare, sincronizzaVersioni } from '../schede-cliente-servizio.js';
import { clientePerMittente } from './gmail.js';
import {
  leggiCandidatura, leggiContatto, leggiPreventivo, nomeFileSicuro, nomePacchettoSito, origineSitoAmmessa, sembraRobot, testoCandidatura,
  testoContatto, testoPreventivo, tipoFile, troppiInvii,
} from '../../engine/sito.js';

const registroInvii = new Map<string, number[]>();
const MAX_FILE = 10;

function cors(req: Request, res: Response, next: NextFunction) {
  const origine = req.get('origin');
  if (!origineSitoAmmessa(origine)) return res.status(403).json({ errore: 'Modulo non ammesso da questo sito.' });
  res.set({ 'Access-Control-Allow-Origin': origine!, Vary: 'Origin', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'content-type' });
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
}

/** Campi e file del modulo (multipart o urlencoded) dal corpo grezzo, con il lettore del browser incluso in Node. */
async function leggiModulo(req: Request): Promise<{ campi: Record<string, string>; file: { nome: string; dati: Buffer }[] }> {
  const corpo = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const dati = await new Response(new Uint8Array(corpo), { headers: { 'content-type': req.get('content-type') ?? '' } }).formData();
  const campi: Record<string, string> = {}, file: { nome: string; dati: Buffer }[] = [];
  for (const [k, v] of dati.entries()) {
    if (typeof v === 'string') { if (!(k in campi)) campi[k] = v; }
    else if (v.size > 0 && file.length < MAX_FILE) file.push({ nome: nomeFileSicuro(v.name), dati: Buffer.from(await v.arrayBuffer()) });
  }
  return { campi, file };
}

function ipDi(req: Request) { return req.ip ?? req.socket.remoteAddress ?? '?'; }

async function avvisaInfo(oggetto: string, testo: string, rispondiA: string, allegato?: { nome: string; mime: string; dati: Buffer }) {
  const ufficio = mittenteGmail();
  const messaggio = messaggioEmail({ da: `"Sito Casteltech" <${ufficio}>`, a: [ufficio], oggetto, testo, allegato })
    .replace(/^(From: [^\r\n]*\r\n)/, `$1Reply-To: ${rispondiA}\r\n`);
  await inviaGmail(messaggio);
}

export function rotteSito() {
  const r = Router();
  r.use(cors);

  r.post('/contatto', express.raw({ type: () => true, limit: '200kb' }), async (req, res) => {
    try {
      const { campi } = await leggiModulo(req);
      if (sembraRobot(campi) || troppiInvii(registroInvii, ipDi(req))) return res.json({ ok: true });   // al robot non si dice niente
      const { contatto, errori } = leggiContatto(campi);
      if (errori.length) return res.status(400).json({ errore: 'campi', campi: errori });
      if (!gmailConfigurato()) return res.status(503).json({ errore: 'invio' });
      const { oggetto, testo } = testoContatto(contatto);
      await avvisaInfo(oggetto, testo, contatto.email);
      res.json({ ok: true });
    } catch (e) { console.error('modulo contatti del sito', e); res.status(502).json({ errore: 'invio' }); }
  });

  r.post('/preventivo', caricamentoLimitato, express.raw({ type: () => true, limit: '40mb' }), async (req, res) => {
    try {
      const { campi, file } = await leggiModulo(req);
      if (sembraRobot(campi) || troppiInvii(registroInvii, ipDi(req))) return res.json({ ok: true });
      const { richiesta, errori } = leggiPreventivo(campi);
      if (errori.length) return res.status(400).json({ errore: 'campi', campi: errori });
      const { oggetto, testo } = testoPreventivo(richiesta, file.map(f => f.nome));
      const id = await creaPacchetto({ nome: nomePacchettoSito(richiesta.azienda, richiesta.privato), clienteId: await clientePerMittente(richiesta.email), utenteId: null });
      const email = { mittente: `${richiesta.azienda} <${richiesta.email}>`, oggetto, data: new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' }), testo, messaggioId: '' };
      await q(`UPDATE pacchetti_scheda SET email = $2 WHERE id = $1`, [id, JSON.stringify(email)]);
      const scelta = await scegliFileDaCaricare(id, file.map(f => ({ nome: f.nome, byte: f.dati.length })));
      for (const f of file) if (scelta.carica.includes(f.nome)) await aggiungiFile(id, f.nome, f.dati);
      if (scelta.carica.length) {
        await q(`UPDATE pacchetti_scheda SET stato = 'in_analisi', errore = NULL WHERE id = $1`, [id]);
        analizzaPacchetto(id).then(() => sincronizzaVersioni(id)).catch(async (e: any) => {
          console.error(e);
          await q(`UPDATE pacchetti_scheda SET stato = 'caricamento', errore = $2 WHERE id = $1`, [id, `Analisi non riuscita: ${String(e?.message ?? e).slice(0, 400)}`]).catch(() => {});
        });
      }
      const link = `${req.protocol}://${req.get('host')}/preventivi/documenti/${id}`;
      if (gmailConfigurato()) avvisaInfo(oggetto, `${testo}\n\nNel portale: ${link}`, richiesta.email).catch(e => console.error('avviso preventivo dal sito', e));
      res.json({ ok: true });
    } catch (e) { console.error('modulo preventivo del sito', e); res.status(502).json({ errore: 'invio' }); }
  });

  r.post('/candidatura', express.raw({ type: () => true, limit: '12mb' }), async (req, res) => {
    try {
      const { campi, file } = await leggiModulo(req);
      if (sembraRobot(campi) || troppiInvii(registroInvii, ipDi(req))) return res.json({ ok: true });
      const { candidatura, errori } = leggiCandidatura(campi);
      if (errori.length) return res.status(400).json({ errore: 'campi', campi: errori });
      if (!gmailConfigurato()) return res.status(503).json({ errore: 'invio' });
      const cv = file[0] ?? null;   // un solo allegato per email: il primo file
      const { oggetto, testo } = testoCandidatura(candidatura, cv?.nome ?? null);
      await avvisaInfo(oggetto, testo, candidatura.email, cv ? { nome: cv.nome, mime: tipoFile(cv.nome), dati: cv.dati } : undefined);
      res.json({ ok: true });
    } catch (e) { console.error('modulo candidatura del sito', e); res.status(502).json({ errore: 'invio' }); }
  });

  return r;
}
