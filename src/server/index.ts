/**
 * Avvio del portale: server web, sessioni, login, pagine.
 */
import express, { type NextFunction, type Request, type Response } from 'express';
import session from 'express-session';
import pgSession from 'connect-pg-simple';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import { join } from 'node:path';
import { pool, q1, applicaMigrazioni } from './db.js';
import { primoAvvio } from './catalogo-db.js';
import { layout, type Utente } from './views/layout.js';
import { html } from './views/html.js';
import { rottePreventivi } from './rotte/preventivi.js';
import { rotteSchedeCliente } from './rotte/schede-cliente.js';
import { rotteImpostazioni } from './rotte/impostazioni.js';
import { rotteCommesse } from './rotte/commesse.js';
import { avviaBackupNotturno } from './backup.js';
import { rotteReparto } from './rotte/reparto.js';
import { avviaPromemoria } from './promemoria.js';
import { avviaControlloDrive } from './drive.js';
import { avviaConsumiServizi } from './consumi-servizi.js';
import { rotteComponenti } from './rotte/componenti.js';
import { rotteAnagrafiche } from './rotte/anagrafiche.js';
import { rotteOrdini } from './rotte/ordini.js';
import { rotteAcquisizioni } from './rotte/acquisizioni.js';
import { rotteOrdiniFornitore } from './rotte/ordini-fornitore.js';
import { rotteCrm } from './rotte/crm.js';
import { rotteSuggerimenti } from './rotte/suggerimenti.js';
import { rotteQualita } from './rotte/qualita.js';
import { rotteCruscottoGenerale } from './rotte/cruscotto-generale.js';
import { rotteAmministrazione } from './rotte/amministrazione.js';
import { rotteGuida } from './rotte/guida.js';
import { rotteGmail } from './rotte/gmail.js';
import { rotteApiClaude } from './rotte/api-claude.js';
import { rotteCalendario } from './rotte/calendario.js';
import { sistemaInterrotte } from './codifica-servizio.js';
import { riceviWebhook } from './invoicetronic.js';
import { contabilitaPuo, paginaIniziale } from '../engine/ruoli.js';

declare module 'express-session' { interface SessionData { utente?: Utente } }

const app = express();
app.set('trust proxy', 1); // dietro il proxy https di Render
app.use(helmet({ referrerPolicy: { policy: 'same-origin' }, contentSecurityPolicy: { directives: { 'script-src': ["'self'"], 'style-src': ["'self'"], 'img-src': ["'self'", 'data:'] } } }));
app.use('/static', express.static(join(process.cwd(), 'public'), { maxAge: '1h' }));
// Webhook di Invoicetronic (esiti SdI, fatture ricevute): corpo grezzo per la firma, prima di sessione e login.
// Risponde sempre 200 alle chiamate firmate (anche se l'elaborazione fallisce, resta in sdi_eventi), 401 alle altre.
app.post('/sdi/webhook', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
  try {
    const { valido, esito } = await riceviWebhook(Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '', req.get('invoicetronic-signature'));
    if (!valido) return res.status(401).json({ errore: esito });
    res.json({ ok: true, esito });
  } catch (e) { console.error('webhook Invoicetronic', e); res.status(500).json({ errore: 'interno' }); }
});
// pulsante "Portale Casteltech" dentro Gmail: entra con la sua chiave, senza sessione, e manda file più grandi dei moduli (prima dei lettori da 2 MB)
app.use('/api/gmail', rotteGmail());
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.json({ limit: '2mb' }));
// controllo settimanale dei suggerimenti fatto da Claude: entra con la sua chiave, senza sessione
app.use('/api/claude', rotteApiClaude());
// calendario dei ritardi letto da Google Calendar (indirizzo con la chiave dentro), senza sessione
app.use('/calendario', rotteCalendario());

const segreto = process.env.SESSION_SECRET;
if (!segreto && process.env.NODE_ENV === 'production') throw new Error('Manca SESSION_SECRET');
app.use(session({
  // pulizia sessioni scadute ogni 12 ore (non ogni 15 minuti), per non tenere sveglio il database
  store: new (pgSession(session))({ pool, createTableIfMissing: true, tableName: 'sessioni', pruneSessionInterval: 12 * 60 * 60 }),
  secret: segreto ?? 'solo-per-sviluppo-locale',
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 1000 * 60 * 60 * 12 },
}));

// blocca richieste che modificano dati arrivando da altri siti
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    // (i cookie di sessione "lax" non partono comunque da altri siti; questo è un controllo in più)
    const origine = req.get('origin');
    let host: string | null = null;
    try { host = origine && origine !== 'null' ? new URL(origine).host : null; } catch { host = 'non-valido'; }
    if (host && host !== req.get('host')) return res.status(403).send('Richiesta non consentita');
  }
  next();
});

export function soloUfficio(req: Request, res: Response, next: NextFunction) {
  if (!req.session.utente) return res.redirect('/login?torna=' + encodeURIComponent(req.originalUrl));
  if (req.session.utente.ruolo !== 'ufficio') return res.status(403).send(String(layout({ titolo: 'Accesso negato', utente: req.session.utente, contenuto: html`<h1>Pagina riservata all'ufficio</h1>` })));
  next();
}

/**
 * Amministrazione: l'ufficio fa tutto; la contabilità (commercialista, Sonia di HTS) solo letture (GET), vedi engine/ruoli.ts.
 */
function amministrazioneOContabilita(req: Request, res: Response, next: NextFunction) {
  const u = req.session.utente;
  if (u?.ruolo === 'contabilita') {
    if (contabilitaPuo(req.method, req.baseUrl + req.path)) return next();
    return res.status(403).send(String(layout({ titolo: 'Sola lettura', utente: u, contenuto: html`<h1>Accesso in sola lettura</h1>
      <p>Il tuo profilo può consultare l'Amministrazione, scaricare Excel, XML e stampe, ma non modificare nulla. Per una correzione chiedi all'ufficio.</p>
      <p><a href="/amministrazione">← Amministrazione</a></p>` })));
  }
  return soloUfficio(req, res, next);
}

// ── Login ──
const tentativi = new Map<string, { n: number; fino: number }>();
const paginaLogin = (errore?: string, torna = '/') => String(layout({
  titolo: 'Accesso', avviso: errore,
  contenuto: html`
  <form method="post" action="/login" class="scheda-login">
    <div class="marchio grande"><span class="logo">C</span> Portale Casteltech</div>
    <input type="hidden" name="torna" value="${torna}">
    <label>Email <input name="email" type="email" autocomplete="username" required autofocus></label>
    <label>Password <input name="password" type="password" autocomplete="current-password" required></label>
    <button class="primario">Entra</button>
  </form>`,
}));
app.get('/login', (req, res) => res.send(paginaLogin(undefined, String(req.query.torna ?? '/'))));
app.post('/login', async (req, res) => {
  const ip = req.ip ?? '';
  const t = tentativi.get(ip);
  if (t && t.n >= 8 && t.fino > Date.now()) return res.status(429).send(paginaLogin('Troppi tentativi: riprova tra qualche minuto.'));
  const u = await q1(`SELECT * FROM utenti WHERE email = lower($1) AND attivo`, [String(req.body.email ?? '').trim()]);
  const ok = u?.password_hash && await bcrypt.compare(String(req.body.password ?? ''), u.password_hash);
  if (!ok) {
    tentativi.set(ip, { n: (t && t.fino > Date.now() ? t.n : 0) + 1, fino: Date.now() + 10 * 60_000 });
    return res.status(401).send(paginaLogin('Email o password non corretti.'));
  }
  tentativi.delete(ip);
  req.session.regenerate(() => {
    req.session.utente = { id: u.id, nome: u.nome, ruolo: u.ruolo };
    const torna = String(req.body.torna ?? '/');
    res.redirect(torna.startsWith('/') && !torna.startsWith('//') ? torna : '/');
  });
});
app.post('/esci', (req, res) => req.session.destroy(() => res.redirect('/login')));

app.get('/', (req, res) => {
  if (!req.session.utente) return res.redirect(req.session.operatore ? '/r' : '/login');
  res.redirect(paginaIniziale(req.session.utente.ruolo));
});
// la produzione lavora dalle pagine del reparto (telefono/tablet)
app.get('/produzione', (_req, res) => res.redirect('/r'));
// controllo di Render: NON interroga il database, così Neon (piano gratuito) può spegnersi quando nessuno lavora
app.get('/salute', (_req, res) => { res.send('ok'); });

// cruscotto generale = pagina iniziale dell'ufficio (Adriano 31/10/2026)
app.use('/cruscotto', soloUfficio, rotteCruscottoGenerale());
app.use('/anagrafiche', soloUfficio, rotteAnagrafiche());
app.use('/preventivi/documenti', soloUfficio, rotteSchedeCliente());
app.use('/preventivi', soloUfficio, rottePreventivi());
app.use('/impostazioni', soloUfficio, rotteImpostazioni());
app.use('/commesse', soloUfficio, rotteCommesse());
app.use('/ordini/acquisire', soloUfficio, rotteAcquisizioni());
app.use('/ordini/fornitori', soloUfficio, rotteOrdiniFornitore());
app.use('/ordini', soloUfficio, rotteOrdini());
// Quotazioni (fino al 28/10/2026 "Componenti"): i vecchi indirizzi /componenti/... portano qui (307 = anche i moduli inviati)
app.use('/quotazioni', soloUfficio, rotteComponenti());
app.use('/componenti', (req, res) => res.redirect(307, '/quotazioni' + req.url));
app.use('/crm', soloUfficio, rotteCrm());
app.use('/suggerimenti', soloUfficio, rotteSuggerimenti());
app.use('/qualita', soloUfficio, rotteQualita());
app.use('/amministrazione', amministrazioneOContabilita, rotteAmministrazione());
// la guida la può leggere chiunque sia entrato (ufficio e produzione)
app.use('/guida', (req, res, next) => req.session.utente ? next() : res.redirect('/login?torna=' + encodeURIComponent(req.originalUrl)), rotteGuida());
app.use('/r', rotteReparto());
// QR stampato sulla scheda di produzione: in reparto (operatore entrato con il PIN) apre la scelta della fase,
// all'ufficio apre la commessa; chi non è entrato va all'accesso del reparto
app.get('/c/:codice', async (req, res) => {
  const c = await q1<{ id: number }>(`SELECT id FROM commesse WHERE codice_qr = $1`, [req.params.codice]);
  if (!c) return res.status(404).send('Commessa non trovata');
  const reparto = `/r/c/${encodeURIComponent(req.params.codice)}`;
  if (req.session.operatore) return res.redirect(reparto);
  if (req.session.utente?.ruolo === 'ufficio') return res.redirect(`/commesse/${c.id}`);
  res.redirect('/r/accesso?torna=' + encodeURIComponent(reparto));
});

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).send('Si è verificato un errore. Riprova; se continua, segnala l\'ora e la pagina.');
});

await applicaMigrazioni();
await primoAvvio();
await avviaConsumiServizi();
avviaBackupNotturno();
avviaPromemoria();
avviaControlloDrive();
await sistemaInterrotte();
const porta = Number(process.env.PORT ?? 3000);
app.listen(porta, () => console.log(`Portale attivo su http://localhost:${porta}`));
