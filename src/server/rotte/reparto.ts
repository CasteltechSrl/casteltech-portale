/**
 * Reparto: inserimento dei tempi da telefono o tablet (Adriano, 25/10/2026).
 *  - l'operatore entra con la sua sigla e un PIN (Impostazioni → Operatori); il telefono lo ricorda per 120 giorni;
 *  - scansiona il QR della scheda (o scrive il numero della commessa), sceglie la fase e
 *    apre il tempo (ora attuale o scritta a mano) oppure scrive il tempo totale;
 *  - chiude la fase dal telefono (ora attuale o scritta a mano), con pezzi, S/P e note;
 *  - le fasi aperte non chiuse generano i promemoria (src/server/promemoria.ts).
 * Le righe finiscono nel foglio tempi della commessa (rilevazioni, origine "tablet") come quelle scritte sulla carta.
 */
import { Router, type NextFunction, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { q, q1, transazione } from '../db.js';
import { leggiPreventivo, oreDa } from '../preventivi-servizio.js';
import { caricaOperatori, fasiCommessa, leggiCommessa, numeriFasi } from '../commesse-servizio.js';
import { annullaFase, fasiAperte, pianificaFase } from '../promemoria.js';
import { hhmm, minutiDelGiorno, partiRoma } from '../../engine/promemoria.js';
import { VERSIONE } from '../views/layout.js';
import { html, num, raw, type Raw } from '../views/html.js';

declare module 'express-session' { interface SessionData { operatore?: { sigla: string; nome: string } } }

const STATI_APERTI = ['aperta', 'in_produzione'];
const GIORNI_RICORDA = 120;

/** PIN degli operatori (hash), salvati da Impostazioni → Operatori. */
export async function caricaPin(): Promise<Record<string, string>> {
  const r = await q1<{ valore: Record<string, string> }>(`SELECT valore FROM impostazioni WHERE chiave = 'pin_operatori'`);
  return r?.valore && typeof r.valore === 'object' ? r.valore : {};
}

function pagina(opz: { titolo: string; req: Request; contenuto: Raw; avviso?: string; ok?: string }) {
  const op = opz.req.session.operatore;
  return String(html`<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0f6b5c">
<title>${opz.titolo} · Reparto Casteltech</title>
<link rel="icon" href="/static/favicon.svg">
<link rel="manifest" href="/static/reparto.webmanifest">
<link rel="stylesheet" href="/static/stile.css?v=${VERSIONE}">
<link rel="stylesheet" href="/static/reparto.css?v=${VERSIONE}">
</head>
<body class="reparto">
<header class="reparto-testata">
  <a href="/r" class="marchio"><span class="logo">C</span> Reparto</a>
  ${op ? html`<form method="post" action="/r/esci" class="inline"><span class="chi">${op.sigla}</span> <button class="link">Cambia</button></form>` : ''}
</header>
<main>
${opz.avviso ? html`<div class="avviso">${opz.avviso}</div>` : ''}
${opz.ok ? html`<div class="conferma">${opz.ok}</div>` : ''}
${opz.contenuto}
</main>
<script src="/static/reparto.js?v=${VERSIONE}" defer></script>
</body>
</html>`);
}

const tornaSicuro = (t: unknown) => { const s = String(t ?? ''); return s.startsWith('/r') && !s.startsWith('//') ? s : '/r'; };
const dataBreve = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const oraValida = (t: unknown) => { const s = String(t ?? '').trim().replace('.', ':'); return /^([01]?\d|2[0-3]):[0-5]\d$/.test(s) ? s.padStart(5, '0') : null; };
const intero = (x: unknown) => { const n = Number(String(x ?? '').replace(',', '.')); return String(x ?? '').trim() !== '' && Number.isFinite(n) && n >= 0 ? n : undefined; };

export function rotteReparto() {
  const r = Router();
  const tentativi = new Map<string, { n: number; fino: number }>();

  // ── Accesso con sigla e PIN ──
  const paginaAccesso = async (req: Request, errore?: string) => {
    const operatori = await caricaOperatori();
    const pin = await caricaPin();
    const conPin = operatori.filter(o => pin[o.sigla]);
    return pagina({ titolo: 'Accesso', req, avviso: errore, contenuto: conPin.length ? html`
      <form method="post" action="/r/accesso" class="accesso">
        <input type="hidden" name="torna" value="${tornaSicuro(req.query.torna ?? req.body?.torna)}">
        <h1>Chi sei?</h1>
        <div class="griglia-sigle">${conPin.map(o => html`
          <label class="sigla"><input type="radio" name="sigla" value="${o.sigla}" required ${req.body?.sigla === o.sigla ? raw('checked') : ''}>
            <b>${o.sigla}</b><small>${o.nome}</small></label>`)}</div>
        <label class="pin">PIN <input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4,6}" autocomplete="off" required></label>
        <button class="primario grande">Entra</button>
      </form>` : html`<h1>Accesso reparto</h1><p>Nessun operatore ha ancora un PIN: l'ufficio lo imposta in
        <b>Impostazioni → Operatori</b>.</p>` });
  };
  r.get('/accesso', async (req, res) => res.send(await paginaAccesso(req)));
  r.post('/accesso', async (req, res) => {
    const sigla = String(req.body.sigla ?? '').toUpperCase();
    const chiave = `${req.ip}|${sigla}`;
    const t = tentativi.get(chiave);
    if (t && t.n >= 5 && t.fino > Date.now()) return res.status(429).send(await paginaAccesso(req, 'Troppi tentativi: riprova tra 15 minuti.'));
    const op = (await caricaOperatori()).find(o => o.sigla === sigla);
    const hash = (await caricaPin())[sigla];
    const ok = op && hash && await bcrypt.compare(String(req.body.pin ?? ''), hash);
    if (!ok) {
      tentativi.set(chiave, { n: (t && t.fino > Date.now() ? t.n : 0) + 1, fino: Date.now() + 15 * 60_000 });
      return res.status(401).send(await paginaAccesso(req, 'Sigla o PIN non corretti.'));
    }
    tentativi.delete(chiave);
    const utente = req.session.utente; // chi è già entrato come ufficio resta dentro
    req.session.regenerate(() => {
      if (utente) req.session.utente = utente;
      else req.session.cookie.maxAge = GIORNI_RICORDA * 24 * 3600_000;
      req.session.operatore = { sigla: op!.sigla, nome: op!.nome };
      res.redirect(tornaSicuro(req.body.torna));
    });
  });
  r.post('/esci', (req, res) => {
    delete req.session.operatore;
    req.session.save(() => res.redirect('/r/accesso'));
  });

  // la pagina di chiusura si apre anche dall'ufficio (per chiudere fasi dimenticate)
  const operatoreOUfficio = (req: Request, res: Response, next: NextFunction) =>
    req.session.operatore || req.session.utente?.ruolo === 'ufficio' ? next() : res.redirect('/r/accesso?torna=' + encodeURIComponent(req.originalUrl));
  const soloOperatore = (req: Request, res: Response, next: NextFunction) =>
    req.session.operatore ? next() : res.redirect('/r/accesso?torna=' + encodeURIComponent(req.originalUrl));

  r.get('/chiudi/:id', operatoreOUfficio, async (req, res) => res.send(await paginaChiudi(req)));
  r.post('/chiudi/:id', operatoreOUfficio, async (req, res) => {
    const [f] = await fasiAperte({ id: Number(req.params.id) });
    if (!f) return res.redirect('/r?ok=' + encodeURIComponent('Fase già chiusa'));
    if (req.session.utente?.ruolo !== 'ufficio' && f.sigla !== req.session.operatore?.sigla) return res.status(403).send('Fase di un altro operatore');
    const adesso = partiRoma(new Date());
    const fine = oraValida(req.body.fine) ?? (f.data === adesso.data ? adesso.ora : null);
    if (!fine) return res.status(400).send(await paginaChiudi(req, 'Scrivi l\'ora in cui hai finito.'));
    if (minutiDelGiorno(fine) <= minutiDelGiorno(f.inizio)) return res.status(400).send(await paginaChiudi(req, `L'ora di fine deve essere dopo l'inizio (${f.inizio}).`));
    if (f.data === adesso.data && minutiDelGiorno(fine) > adesso.minuti + 1) return res.status(400).send(await paginaChiudi(req, 'L\'ora di fine non può essere nel futuro.'));
    const tipo = req.body.tipo === 'P' ? 'P' : 'S';
    const note = String(req.body.note ?? '').trim();
    if (tipo === 'P' && !note) return res.status(400).send(await paginaChiudi(req, 'Problema (P): scrivi la causa nelle note.'));
    await q(`UPDATE rilevazioni SET ora_fine = $2, chiusa_il = now(), pezzi = $3, tipo = $4, causa = $5, note = $6, persone = coalesce($7, persone)
      WHERE id = $1 AND chiusa_il IS NULL`,
      [f.id, fine, intero(req.body.pezzi) ?? null, tipo, tipo === 'P' ? note : null, tipo === 'P' ? null : (note || null), intero(req.body.persone) || null]);
    annullaFase(f.id);
    const msg = `Fase ${f.numero} chiusa: ${hhmm(minutiDelGiorno(fine) - minutiDelGiorno(f.inizio))}`;
    res.redirect(req.session.operatore ? `/r/c/${f.codice_qr}?ok=${encodeURIComponent(msg)}` : `/commesse/${f.commessa_id}`);
  });

  r.use(soloOperatore);

  // ── Pagina iniziale: fasi aperte, promemoria, scelta commessa ──
  r.get('/', async (req, res) => {
    const op = req.session.operatore!;
    const aperte = await fasiAperte({ sigla: op.sigla });
    const avvisi = await q<{ id: number; testo: string; link: string; creato_il: Date }>(`
      UPDATE notifiche SET letta_il = now() WHERE sigla = $1 AND letta_il IS NULL AND creato_il > now() - interval '3 days'
      RETURNING id, testo, link, creato_il`, [op.sigla]);
    const commesse = await q<{ numero: string; codice_qr: string; intestazione: any }>(`
      SELECT numero, codice_qr, intestazione FROM commesse WHERE stato = ANY($1) ORDER BY creato_il DESC LIMIT 15`, [STATI_APERTI]);
    res.send(pagina({ titolo: 'Reparto', req, avviso: req.query.errore ? String(req.query.errore) : undefined, ok: req.query.ok ? String(req.query.ok) : undefined, contenuto: html`
      <h1>Ciao ${op.nome.split(' ')[0]}</h1>
      ${avvisi.map(a => html`<div class="promemoria">🔔 ${a.testo}</div>`)}
      ${elencoAperte(aperte)}
      <section class="riquadro">
        <h2>Scansiona il QR della scheda</h2>
        <p class="nota">Con la fotocamera del telefono inquadra il QR in alto a destra della scheda di produzione, oppure scrivi il numero della commessa.</p>
        <form method="get" action="/r/cerca" class="riga-cerca">
          <input name="n" placeholder="es. C2026-0003 o 3" autocomplete="off" required>
          <button class="primario">Apri</button>
        </form>
      </section>
      ${commesse.length ? html`<section class="riquadro"><h2>Commesse in produzione</h2>
        <ul class="elenco-tocco">${commesse.map(c => html`<li><a href="/r/c/${c.codice_qr}"><b>${c.numero}</b>
          <span>${c.intestazione?.codice ?? ''} · ${c.intestazione?.cliente ?? ''}</span></a></li>`)}</ul></section>` : ''}` }));
  });

  r.get('/cerca', async (req, res) => {
    const n = String(req.query.n ?? '').trim().toUpperCase();
    const c = await q1<{ codice_qr: string }>(`SELECT codice_qr FROM commesse WHERE upper(numero) = $1 OR codice_qr = $2
      OR ($3 <> '' AND numero ~ ('-0*' || $3 || '$')) ORDER BY creato_il DESC LIMIT 1`, [n, String(req.query.n ?? '').trim(), /^\d+$/.test(n) ? String(Number(n)) : '']);
    res.redirect(c ? `/r/c/${c.codice_qr}` : `/r?errore=${encodeURIComponent(`Commessa ${n} non trovata`)}`);
  });

  // ── Commessa: scelta della fase ──
  r.get('/c/:codice', async (req, res) => {
    const x = await commessaDaQr(req.params.codice);
    if (!x) return res.status(404).send(pagina({ titolo: 'Non trovata', req, avviso: 'Commessa non trovata', contenuto: html`<a href="/r">Torna indietro</a>` }));
    const { c, previste, altre } = x;
    const aperte = await fasiAperte({ commessaId: c.id });
    const mie = aperte.filter(f => f.sigla === req.session.operatore!.sigla);
    const daAltri = new Map<string, string[]>();
    for (const f of aperte.filter(f => f.sigla !== req.session.operatore!.sigla)) daAltri.set(f.fase_codice, [...(daAltri.get(f.fase_codice) ?? []), f.sigla]);
    const voce = (f: { codice: string; numero: string; nome: string; cicloSec?: number }) => html`<li data-cerca="${`${f.numero} ${f.nome}`.toLowerCase()}">
      <a href="/r/c/${c.codice_qr}/f/${f.codice}"><b class="num-fase">${f.numero}</b><span>${f.nome}
        ${daAltri.has(f.codice) ? html`<small class="aperta-da">aperta da ${daAltri.get(f.codice)!.join(', ')}</small>` : ''}</span>
        ${f.cicloSec ? html`<small class="previsto">${hhmm(f.cicloSec / 60)}</small>` : ''}</a></li>`;
    res.send(pagina({ titolo: c.numero, req, ok: req.query.ok ? String(req.query.ok) : undefined, avviso: req.query.errore ? String(req.query.errore) : undefined, contenuto: html`
      ${testataCommessa(c)}
      ${!STATI_APERTI.includes(c.stato) ? html`<div class="avviso">Commessa già rientrata in ufficio: i nuovi tempi vanno comunicati all'ufficio.</div>` : ''}
      ${elencoAperte(mie)}
      <section class="riquadro">
        <h2>Scegli la fase</h2>
        <input type="search" id="filtro-fasi" placeholder="Cerca numero o nome della fase" inputmode="search" autocomplete="off">
        <p class="nota">A destra il tempo previsto per tutto il lotto (ciclo).</p>
        <ul class="elenco-tocco fasi" id="elenco-fasi">${previste.map(voce)}</ul>
        ${altre.length ? html`<details><summary>Altre fasi (non previste su questa commessa)</summary>
          <ul class="elenco-tocco fasi">${altre.map(voce)}</ul></details>` : ''}
      </section>` }));
  });

  // ── Fase: apri il tempo o scrivi il totale ──
  r.get('/c/:codice/f/:fase', async (req, res) => res.send(await paginaFase(req)));

  r.post('/c/:codice/f/:fase/apri', async (req, res) => {
    const x = await commessaDaQr(req.params.codice);
    const f = x && [...x.previste, ...x.altre].find(f => f.codice === req.params.fase);
    if (!x || !f) return res.status(404).send('Fase non trovata');
    if (!STATI_APERTI.includes(x.c.stato)) return res.status(400).send(await paginaFase(req, 'Commessa già rientrata in ufficio.'));
    const op = req.session.operatore!;
    if ((await fasiAperte({ sigla: op.sigla, commessaId: x.c.id })).some(a => a.fase_codice === f.codice))
      return res.redirect(`/r/c/${x.c.codice_qr}?errore=${encodeURIComponent(`Hai già la fase ${f.numero} aperta: chiudila prima`)}`);
    const adesso = partiRoma(new Date());
    const scritta = String(req.body.inizio ?? '').trim();
    const inizio = scritta ? oraValida(scritta) : adesso.ora;
    if (!inizio) return res.status(400).send(await paginaFase(req, 'Ora di inizio non valida (es. 8:30).'));
    if (minutiDelGiorno(inizio) > adesso.minuti + 1) return res.status(400).send(await paginaFase(req, 'L\'ora di inizio non può essere nel futuro.'));
    const persone = intero(req.body.persone) || f.persone || 1;
    // apertura: momento reale (per i promemoria) = oggi all'ora indicata
    const apertaIl = new Date(Date.now() - (adesso.minuti - minutiDelGiorno(inizio)) * 60_000);
    const id = await transazione(async cl => {
      const riga = Number((await cl.query(`SELECT coalesce(max(riga), -1) + 1 AS n FROM rilevazioni WHERE commessa_id = $1`, [x.c.id])).rows[0].n);
      const nuova = (await cl.query(`INSERT INTO rilevazioni (commessa_id, fase_codice, operatore_nome, data, ora_inizio, persone, tipo, riga, origine, aperta_il)
        VALUES ($1,$2,$3,$4,$5,$6,'S',$7,'tablet',$8) RETURNING id`, [x.c.id, f.codice, op.sigla, adesso.data, inizio, persone, riga, apertaIl])).rows[0].id;
      await cl.query(`UPDATE commesse SET stato = 'in_produzione', aggiornato_il = now() WHERE id = $1 AND stato = 'aperta'`, [x.c.id]);
      return Number(nuova);
    });
    pianificaFase({ id, aperta_il: apertaIl, previsto_sec: f.cicloSec ?? 0 });
    res.redirect(`/r/c/${x.c.codice_qr}?ok=${encodeURIComponent(`Fase ${f.numero} aperta alle ${inizio}`)}`);
  });

  r.post('/c/:codice/f/:fase/totale', async (req, res) => {
    const x = await commessaDaQr(req.params.codice);
    const f = x && [...x.previste, ...x.altre].find(f => f.codice === req.params.fase);
    if (!x || !f) return res.status(404).send('Fase non trovata');
    if (!STATI_APERTI.includes(x.c.stato)) return res.status(400).send(await paginaFase(req, 'Commessa già rientrata in ufficio.'));
    const durataMin = Math.round(oreDa(req.body.totale) * 60);
    if (!(durataMin > 0) || durataMin > 16 * 60) return res.status(400).send(await paginaFase(req, 'Scrivi il tempo totale in ore e minuti (es. 1:30).'));
    const oggi = partiRoma(new Date()).data;
    const giorno = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body.data ?? '')) && String(req.body.data) <= oggi ? String(req.body.data) : oggi;
    const tipo = req.body.tipo === 'P' ? 'P' : 'S';
    const note = String(req.body.note ?? '').trim();
    if (tipo === 'P' && !note) return res.status(400).send(await paginaFase(req, 'Problema (P): scrivi la causa nelle note.'));
    await transazione(async cl => {
      const riga = Number((await cl.query(`SELECT coalesce(max(riga), -1) + 1 AS n FROM rilevazioni WHERE commessa_id = $1`, [x.c.id])).rows[0].n);
      await cl.query(`INSERT INTO rilevazioni (commessa_id, fase_codice, operatore_nome, data, durata_min, persone, pezzi, tipo, causa, note, riga, origine, chiusa_il)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'tablet',now())`,
        [x.c.id, f.codice, req.session.operatore!.sigla, giorno, durataMin, intero(req.body.persone) || f.persone || 1, intero(req.body.pezzi) ?? null,
         tipo, tipo === 'P' ? note : null, tipo === 'P' ? null : (note || null), riga]);
      await cl.query(`UPDATE commesse SET stato = 'in_produzione', aggiornato_il = now() WHERE id = $1 AND stato = 'aperta'`, [x.c.id]);
    });
    res.redirect(`/r/c/${x.c.codice_qr}?ok=${encodeURIComponent(`Fase ${f.numero}: registrate ${hhmm(durataMin)}`)}`);
  });

  return r;
}

// ───────────────────────────── pezzi di pagina ─────────────────────────────
interface FaseScelta { codice: string; numero: string; nome: string; persone?: number; cicloSec?: number }

async function commessaDaQr(codice: string) {
  const id = await q1<{ id: number }>(`SELECT id FROM commesse WHERE codice_qr = $1`, [codice]);
  const c = id && await leggiCommessa(id.id);
  if (!c) return null;
  const numeri = await numeriFasi();
  const previste: FaseScelta[] = (await fasiCommessa(c)).map(f => ({ ...f, numero: numeri.get(f.codice) ?? f.numero }));
  const prev = c.preventivo_id ? await leggiPreventivo(c.preventivo_id) : null;
  const giaPreviste = new Set(previste.map(f => f.codice));
  const altre: FaseScelta[] = ((prev?.catalogo?.fasi ?? []) as any[]).filter(f => !giaPreviste.has(f.codice) && numeri.has(f.codice))
    .map(f => ({ codice: f.codice, numero: numeri.get(f.codice)!, nome: f.nome, persone: Number(f.persone) || 1 }));
  return { c, previste, altre };
}

const testataCommessa = (c: any) => html`<div class="testata-commessa">
  <b>${c.numero}</b> <span>${c.intestazione?.codice ?? ''}</span>
  <small>${c.intestazione?.cliente ?? ''} · ${num(c.quantita, 0)} pz</small></div>`;

function elencoAperte(aperte: Awaited<ReturnType<typeof fasiAperte>>) {
  if (!aperte.length) return html``;
  const oggi = partiRoma(new Date()).data;
  return html`<section class="riquadro aperte"><h2>Fasi aperte</h2><ul class="elenco-tocco">${aperte.map(f => html`<li>
    <a href="/r/chiudi/${f.id}"><b class="num-fase">${f.numero}</b><span>${f.nome}<small>${f.commessa} · dalle ${f.inizio}${f.data !== oggi ? ` del ${dataBreve(f.data)}` : ''}</small></span>
    <span class="bottone primario piccolo">Chiudi</span></a></li>`)}</ul></section>`;
}

async function paginaFase(req: Request, errore?: string) {
  const x = await commessaDaQr(String(req.params.codice));
  const f = x && [...x.previste, ...x.altre].find(f => f.codice === req.params.fase);
  if (!x || !f) return pagina({ titolo: 'Non trovata', req, avviso: 'Fase non trovata', contenuto: html`<a href="/r">Torna indietro</a>` });
  const oggi = partiRoma(new Date()).data;
  const base = `/r/c/${x.c.codice_qr}/f/${f.codice}`;
  const b = req.body ?? {};
  return pagina({ titolo: `Fase ${f.numero}`, req, avviso: errore, contenuto: html`
    ${testataCommessa(x.c)}
    <h1 class="titolo-fase"><span class="num-fase">${f.numero}</span> ${f.nome}</h1>
    ${f.cicloSec ? html`<p class="nota">Previsto per tutto il lotto: ${hhmm(f.cicloSec / 60)} (ciclo), ${num(f.persone ?? 1, 1)} ${(f.persone ?? 1) === 1 ? 'persona' : 'persone'}.</p>` : ''}
    <section class="riquadro">
      <h2>Inizio la fase</h2>
      <form method="post" action="${base}/apri" class="modulo-reparto">
        <label>Nr. persone sulla fase <input name="persone" inputmode="numeric" value="${b.persone ?? f.persone ?? 1}"></label>
        <label>Ora di inizio <small>vuoto = adesso</small><input name="inizio" type="time" value="${b.inizio ?? ''}"></label>
        <button class="primario grande">▶ Apri il tempo</button>
      </form>
    </section>
    <section class="riquadro">
      <h2>Oppure scrivo il tempo totale</h2>
      <form method="post" action="${base}/totale" class="modulo-reparto">
        <label>Tempo totale <small>ore:minuti</small><input name="totale" inputmode="decimal" placeholder="1:30" value="${b.totale ?? ''}" required></label>
        <label>Giorno <input name="data" type="date" max="${oggi}" value="${b.data ?? oggi}"></label>
        <label>Nr. persone sulla fase <input name="persone" inputmode="numeric" value="${b.persone ?? f.persone ?? 1}"></label>
        <label>Pezzi fatti <input name="pezzi" inputmode="numeric" value="${b.pezzi ?? ''}"></label>
        ${sceltaSP(b.tipo)}
        <label>Note <small>con P: la causa del problema</small><textarea name="note" rows="2">${b.note ?? ''}</textarea></label>
        <button class="grande">Registra il tempo</button>
      </form>
    </section>
    <a href="/r/c/${x.c.codice_qr}" class="indietro">← Torna alle fasi</a>` });
}

const sceltaSP = (v?: string) => html`<fieldset class="scelta-sp"><legend>Tipo di tempo</legend>
  <label><input type="radio" name="tipo" value="S" ${v !== 'P' ? raw('checked') : ''}> <b>S</b> standard</label>
  <label><input type="radio" name="tipo" value="P" ${v === 'P' ? raw('checked') : ''}> <b>P</b> problema</label></fieldset>`;

async function paginaChiudi(req: Request, errore?: string) {
  const [f] = await fasiAperte({ id: Number(req.params.id) });
  if (!f) return pagina({ titolo: 'Fase chiusa', req, contenuto: html`<h1>Questa fase è già chiusa</h1><a href="/r" class="bottone primario">Vai al reparto</a>` });
  const adesso = partiRoma(new Date());
  const stessoGiorno = f.data === adesso.data;
  const b = req.body ?? {};
  return pagina({ titolo: `Chiudi fase ${f.numero}`, req, avviso: errore, contenuto: html`
    <div class="testata-commessa"><b>${f.commessa}</b> <small>operatore ${f.sigla}</small></div>
    <h1 class="titolo-fase"><span class="num-fase">${f.numero}</span> ${f.nome}</h1>
    <p>Aperta ${stessoGiorno ? 'oggi' : `il ${dataBreve(f.data)}`} alle <b>${f.inizio}</b>${stessoGiorno ? html` · da <b>${hhmm(adesso.minuti - minutiDelGiorno(f.inizio))}</b>` : ''}.</p>
    <form method="post" action="/r/chiudi/${f.id}" class="modulo-reparto riquadro">
      <label>Ora di fine ${stessoGiorno ? html`<small>vuoto = adesso</small>` : html`<small>del ${dataBreve(f.data)}: scrivi quando hai finito</small>`}
        <input name="fine" type="time" value="${b.fine ?? ''}" ${stessoGiorno ? '' : raw('required')}></label>
      <label>Pezzi fatti <input name="pezzi" inputmode="numeric" value="${b.pezzi ?? ''}"></label>
      <label>Nr. persone sulla fase <small>se è cambiato</small><input name="persone" inputmode="numeric" value="${b.persone ?? ''}"></label>
      ${sceltaSP(b.tipo)}
      <label>Note <small>con P: la causa del problema</small><textarea name="note" rows="2">${b.note ?? ''}</textarea></label>
      <button class="primario grande">■ Chiudi la fase</button>
    </form>` });
}
