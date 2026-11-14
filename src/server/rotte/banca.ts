/**
 * Banca (Adriano 7/11/2026): Amministrazione → Banca. Carica l'estratto conto (CBI o Excel/CSV dell'home banking BPER), abbina i movimenti
 * alle rate delle fatture emesse e ricevute, mette in categoria gli altri; RiBa e anticipo fatture = file CBI da caricare nell'home banking.
 * Regole in `engine/banca.ts`, letture e scritture in `banca-servizio.ts`. Montate su /amministrazione/banca.
 */
import express, { Router, type Request } from 'express';
import bcrypt from 'bcryptjs';
import { q, q1 } from '../db.js';
import { chiedePasswordRiservata } from '../../engine/ruoli.js';
import { MINUTI_SBLOCCO, sbloccoValido } from '../../engine/dipendenti.js';

declare module 'express-session' { interface SessionData { bancaSbloccata?: number } }
import { layout } from '../views/layout.js';
import { html, data, euro, raw, type Raw } from '../views/html.js';
import { menuAmministrazione } from './cruscotto-amministrazione.js';
import { excelSemplice, inviaExcel, nomeExcel } from '../excel.js';
import { CATEGORIE_MOVIMENTO, SOGLIA_SICURA, TIPI_CONTO, tipoConto, abiCabDaIban, controlliEffetto, importoDa, dataDa, nomeConto, type ContoBanca, type RataAperta } from '../../engine/banca.js';
import { abbinaMovimento, contiBanca, contiConSaldo, fidoAnticipi, salvaConti, annullaDistinta, annullaMovimento, caricaMovimenti, codiceSia, creaDistinta, distinte, effettoDa, eliminaMovimento,
  leggiEstrattoConto, movimentiDaAbbinare, movimento, rateAperte, rateDaAnticipare, registraMovimento, salvaCodiceSia } from '../banca-servizio.js';

import crypto from 'node:crypto';
import { avviaCollegamento, bancheDisponibili, completaCollegamento, openBankingConfigurato, scaricaMovimenti, scollega, statoOpenBanking, type StatoOpenBanking } from '../open-banking.js';
import { proponiConIa } from '../banca-ia.js';
import { NOMI_COLLEGAMENTO, leggiScelta, speseCartaPerMese, statoConsenso, tipoCollegamento, type BancaScelta, type Collegamento, type TipoCollegamento } from '../../engine/open-banking.js';

declare module 'express-session' { interface SessionData { bancaCollega?: { stato: string; banca: string; metodo: string | null } } }

const oggiRoma = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
const pagina = (req: Request, titolo: string, contenuto: Raw, avviso?: string, script?: string[]) =>
  String(layout({ titolo, utente: req.session.utente, attiva: 'amministrazione', contenuto, avviso, script, largo: true }));
const msg = (req: Request) => (req.query.msg ? String(req.query.msg) : undefined);
const vaiA = (percorso: string, testo: string) => `/amministrazione/banca${percorso}${percorso.includes('?') ? '&' : '?'}msg=${encodeURIComponent(testo)}`;
const elenco = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v == null || v === '' ? [] : [String(v)]);
const utente = (req: Request) => req.session.utente?.nome ?? 'ufficio';
const importoClasse = (n: number) => (n < 0 ? 'num negativo' : 'num');

function tasti(attiva: 'movimenti' | 'anticipi' | 'anticipate' | 'cassa'): Raw {
  // Banca e carte (Adriano 14/11/2026): tutto in un posto, conti, carta di credito, PayPal, riconciliazione, RiBa e anticipi, fatture anticipate, previsione di cassa
  const voci = [['movimenti', '/amministrazione/banca', 'Conti, carte e riconciliazione'], ['anticipi', '/amministrazione/banca/anticipi', 'RiBa e anticipo fatture'],
    ['anticipate', '/amministrazione/documenti?tipo=fattura&anticipo=tutte', 'Fatture anticipate'], ['cassa', '/amministrazione/analisi/cassa', 'Previsione di cassa']] as const;
  return html`<nav class="tasti-sezione secondari">${voci.map(([k, href, nome]) => html`<a href="${href}" class="${k === attiva ? 'attivo' : ''}">${nome}</a>`)}</nav>`;
}

const quando = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('it-IT', { timeZone: 'Europe/Rome', dateStyle: 'short', timeStyle: 'short' }) : '');

/** Riquadro "Collegamento automatico" (open banking, Adriano 14/11/2026): conti BPER, carta di credito e PayPal, ognuno col suo consenso. */
function sezioneCollegamento(s: StatoOpenBanking, configurato: boolean, banche: BancaScelta[] | null): Raw {
  if (!configurato) return html`<details class="blocco"><summary><strong>Collegamento automatico con la banca</strong> · non ancora attivo</summary>
    <p class="nota">Con l'open banking il portale scarica da solo i movimenti dei conti BPER, della carta di credito e di PayPal ogni mattina dei giorni feriali (8:30),
      senza caricare il CSV. Servizio: Enable Banking. Per attivarlo servono le chiavi ENABLEBANKING_APP_ID e ENABLEBANKING_PRIVATE_KEY su Render (vedi la Guida, "Banca: collegamento automatico").</p></details>`;
  const stati = s.collegamenti.map(c => ({ c, consenso: statoConsenso(c.scadenza, new Date()) }));
  const daGuardare = !stati.length || stati.some(x => x.consenso.stato !== 'attivo' || x.c.errore);
  // una voce per banca e modo di accesso (BPER: Corporate Banking, Digital Corporate Banking, Area Riservata Carte; PayPal)
  const voci = (banche?.length ? banche : [{ name: 'BPER Banca', impresa: true, metodi: [] }, { name: 'PayPal', impresa: true, metodi: [] }] as BancaScelta[])
    .flatMap(b => (b.metodi.length ? b.metodi : [{ name: '', titolo: '' }]).map(m => ({ valore: `${b.name}|${m.name}`, testo: m.titolo ? `${b.name} · ${m.titolo}` : b.name })));
  const usato = s.collegamenti.find(c => c.id === 'conti');
  const proposta = usato ? `${usato.banca}|${usato.metodo ?? ''}` : '';
  const stato = (c: Collegamento, k: ReturnType<typeof statoConsenso>) => k.stato === 'scaduto' ? html`<span class="negativo">consenso scaduto</span>`
    : k.stato === 'in_scadenza' ? html`<span class="negativo">consenso in scadenza tra ${k.giorni} giorni</span>` : html`attivo, consenso fino al ${data(String(c.scadenza).slice(0, 10))}`;
  return html`<details class="blocco" ${daGuardare ? raw('open') : ''}><summary><strong>Collegamento automatico con la banca</strong>
    · ${stati.length ? stati.map(({ c, consenso }, i) => html`${i ? ' · ' : ''}${NOMI_COLLEGAMENTO[c.id]}: ${consenso.stato === 'attivo' && !c.errore ? 'attivo'
      : html`<span class="negativo">${consenso.stato === 'attivo' ? 'errore' : consenso.stato === 'scaduto' ? 'scaduto' : 'in scadenza'}</span>`}`) : 'niente collegato'}</summary>
    <p class="nota">Ogni giorno feriale alle 8:30 il portale scarica da solo i movimenti di quello che è collegato e li mette qui sotto "Da abbinare", come il CSV.
      I movimenti già caricati (anche dal CSV: stesso conto, data e importo) non si ripetono. Ogni consenso dura al massimo 180 giorni: prima della scadenza il portale
      lo segnala e si rinnova con "Rinnova". Carta di credito: le spese di un mese entrano nella previsione di cassa come uscita del 15 del mese dopo.</p>
    ${stati.length ? html`<table class="elenco"><thead><tr><th>Collegamento</th><th>Conti</th><th>Stato</th><th>Ultimo scarico</th><th></th></tr></thead>
      <tbody>${stati.map(({ c, consenso }) => html`<tr><td><strong>${NOMI_COLLEGAMENTO[c.id]}</strong><div class="nota">${c.banca}${c.metodo ? ` · ${c.metodo}` : ''}
          · collegato il ${quando(c.collegatoIl)}${c.collegatoDa ? ` da ${c.collegatoDa}` : ''}</div></td>
        <td>${c.conti.map(x => html`<div>${x.nome ?? 'Conto'} · ${x.iban ?? x.numero}</div>`)}</td>
        <td>${stato(c, consenso)}${c.errore ? html`<div class="negativo">Ultimo scarico non riuscito: ${c.errore}</div>` : ''}</td>
        <td>${c.esito && !c.errore ? html`${quando(c.ultimoScarico)}<div class="nota">${c.esito}</div>` : quando(c.ultimoScarico)}</td>
        <td><form method="post" action="/amministrazione/banca/collega" class="inline"><input type="hidden" name="banca" value="${c.banca}|${c.metodo ?? ''}">
            <button class="${consenso.stato === 'attivo' ? '' : 'primario'}">Rinnova</button></form>
          <form method="post" action="/amministrazione/banca/scollega" class="inline" data-conferma="Scollegare ${NOMI_COLLEGAMENTO[c.id]}? Il portale smette di scaricarne i movimenti (quelli già scaricati restano).">
            <input type="hidden" name="id" value="${c.id}"><button>Scollega</button></form></td></tr>`)}</tbody></table>` : ''}
    <div class="barra-azioni">
      <form method="post" action="/amministrazione/banca/collega" class="inline"><label>Collega <select name="banca">${voci.map(v => html`<option value="${v.valore}" ${v.valore === proposta ? raw('selected') : ''}>${v.testo}</option>`)}</select></label>
        <button class="${stati.length ? '' : 'primario'}">Collega</button></form>
      ${stati.length ? html`<form method="post" action="/amministrazione/banca/scarica" class="inline"><button class="primario">Scarica adesso</button></form>` : ''}
    </div>
    <p class="nota">Conti correnti: BPER Banca · Corporate Banking (o Digital Corporate Banking). Carta di credito: BPER Banca · Area Riservata Carte. PayPal: PayPal.
      Collegare di nuovo la stessa cosa sostituisce il consenso di prima.</p></details>`;
}

const scritturaRate = (rate: RataAperta[]) => rate.map(r => `${r.tipo}:${r.id}${r.gia ? ':gia' : ''}`).join(',');
/** Categorie nel menu di un movimento: "Incasso/Pagamento fattura" solo nella direzione giusta (fattura non ancora arrivata). */
const categorieMenu = (importo: number) => CATEGORIE_MOVIMENTO.filter(c => (c !== 'Incasso fattura' || importo > 0) && (c !== 'Pagamento fattura' || importo < 0));
const testoRata = (r: RataAperta) => html`<a href="${r.tipo === 'emessa' ? `/amministrazione/documenti/${r.documentoId}` : `/amministrazione/ricevuti/${r.documentoId}`}">
  ${r.tipo === 'emessa' ? 'Fatt.' : 'Fatt. forn.'} ${r.numero || 's.n.'}</a> del ${data(r.dataDoc)} · ${r.controparte} · scad. ${data(r.scadenza)} · ${euro(r.importo)}${r.gia ? html` · <span class="nota">già segnata pagata</span>` : ''}`;

/** Conti della banca con il saldo di oggi (saldo dell'estratto conto + movimenti caricati dopo) e quanto resta dell'affidamento. */
function sezioneConti(conti: Awaited<ReturnType<typeof contiConSaldo>>, fidoAnticipi: number | null): Raw {
  if (!conti.length) return html``;
  // l'affidamento per gli anticipi è uno solo per tutti i conti d'anticipo (Adriano: 100k di anticipo fatture di qualsiasi genere)
  const anticipi = conti.filter(c => c.tipo === 'anticipo');
  const usati = anticipi.every(c => c.saldoOggi != null) ? Math.round(anticipi.reduce((t, c) => t + (c.saldoOggi ?? 0), 0) * 100) / 100 : null;
  return html`<h2>Conti</h2>
    <form method="post" action="/amministrazione/banca/conti"><div class="tabella-scorre"><table class="elenco">
      <thead><tr><th>Conto</th><th>Nome</th><th>Tipo</th><th>Saldo dell'estratto conto al</th><th class="num">Saldo</th><th class="num">Fido / affidamento</th>
        <th>Movimenti fino al</th><th class="num">Saldo di oggi</th><th class="num">Disponibile</th></tr></thead>
      <tbody>${conti.map(c => html`<tr><td>${c.numero}</td>
        <td><input name="nome_${c.numero}" value="${c.nome}" class="maiuscolo" size="22"></td>
        <td><select name="tipo_${c.numero}">${TIPI_CONTO.map(([k, t]) => html`<option value="${k}" ${c.tipo === k ? raw('selected') : ''}>${t}</option>`)}</select></td>
        <td><input type="date" name="saldo_data_${c.numero}" value="${c.saldoData ?? ''}"></td>
        <td class="num"><input name="saldo_${c.numero}" value="${c.saldo != null ? String(c.saldo).replace('.', ',') : ''}" inputmode="decimal" size="10"></td>
        <td class="num"><input name="fido_${c.numero}" value="${c.fido != null ? String(c.fido).replace('.', ',') : ''}" inputmode="decimal" size="10"></td>
        <td>${c.ultimo ? data(c.ultimo) : ''}</td>
        <td class="${(c.saldoOggi ?? 0) < 0 ? 'num negativo' : 'num'}">${c.saldoOggi != null ? euro(c.saldoOggi) : ''}</td>
        <td class="num">${c.tipo === 'ordinario' && c.disponibile != null ? euro(c.disponibile) : ''}</td></tr>`)}
      ${anticipi.length ? html`<tr><td colspan="5"><strong>Anticipi, tutti i conti d'anticipo insieme</strong></td>
        <td class="num"><input name="fido_anticipi" value="${fidoAnticipi != null ? String(fidoAnticipi).replace('.', ',') : ''}" inputmode="decimal" size="10"></td><td></td>
        <td class="num negativo">${usati != null ? euro(usati) : ''}</td>
        <td class="num">${usati != null && fidoAnticipi != null ? euro(fidoAnticipi + usati) : ''}</td></tr>` : ''}</tbody></table></div>
      <p class="nota">Saldo: scrivi il saldo finale di un estratto conto (es. al 31/12) con la sua data; il portale aggiunge i movimenti caricati dopo.
        Sui conti d'anticipo i movimenti non si abbinano mai alle fatture (l'incasso vero arriva sul conto corrente). Disponibile = saldo + fido; per gli anticipi un solo affidamento per tutti i conti d'anticipo (riga in fondo).</p>
      <div class="barra-azioni"><button>Salva i conti</button></div></form>`;
}

/** Spese della carta di credito e di PayPal mese per mese (Adriano 14/11/2026: "sapere e mettere a budget l'uscita del 15"). */
async function sezioneSpeseCarte(conti: Awaited<ReturnType<typeof contiConSaldo>>): Promise<Raw> {
  const carte = conti.filter(c => c.tipo === 'carta' || c.tipo === 'paypal');
  if (!carte.length) return html``;
  const oggi = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
  const movimenti = await q<{ conto: string; data: string; importo: number; descrizione: string }>(`SELECT conto, to_char(data, 'YYYY-MM-DD') AS data, importo::float AS importo, descrizione
    FROM banca_movimenti WHERE conto = ANY($1) AND data >= $2`, [carte.map(c => c.numero), `${Number(oggi.slice(0, 4)) - 1}${oggi.slice(4, 7)}-01`]);
  return html`<h2>Spese della carta e di PayPal</h2>
    ${carte.map(c => {
      const mesi = speseCartaPerMese(movimenti.filter(m => m.conto === c.numero), oggi).slice(0, 6);
      return html`<h3>${c.nome} <span class="nota">(${c.tipo === 'carta' ? 'carta di credito' : 'PayPal'})</span></h3>
        ${mesi.length ? html`<table class="elenco"><thead><tr><th>Mese</th><th class="num">Movimenti</th><th class="num">Spese</th><th>${c.tipo === 'carta' ? 'Addebito sul conto' : ''}</th></tr></thead>
          <tbody>${mesi.map(x => html`<tr><td>${x.mese.slice(5, 7)}/${x.mese.slice(0, 4)}${x.finora ? ' (finora)' : ''}</td><td class="num">${x.movimenti}</td>
            <td class="num">${euro(x.importo)}</td><td>${c.tipo === 'carta' ? data(x.data) : ''}</td></tr>`)}</tbody></table>`
          : html`<p class="vuoto">Nessun movimento scaricato.</p>`}`;
    })}
    <p class="nota">I movimenti della carta e di PayPal si registrano da soli come "Spese carta / PayPal" (li trovi in "Già abbinati e registrati"): non sono incassi o
      pagamenti di fatture sul conto. Le spese di un mese della carta si pagano il 15 del mese dopo e sono già nella Previsione di cassa.</p>`;
}

export function rotteBanca() {
  const r = Router();

  // ───────────── password per l'ufficio (Adriano 8/11/2026) ─────────────
  // Banca protetta per ufficio e produzione con la password delle buste paga; amministratore, contabilità ed esterno entrano senza.
  // Aperta per MINUTI_SBLOCCO minuti, ogni pagina vista la tiene aperta.
  const tentativi = new Map<number, { n: number; fino: number }>();
  r.post('/sblocca', async (req, res) => {
    const id = req.session.utente?.id ?? 0;
    const t = tentativi.get(id);
    if (t && t.n >= 5 && t.fino > Date.now()) return res.redirect(vaiA('', 'Troppi tentativi: riprova tra 15 minuti.'));
    const p = await q1<{ valore: { hash: string } }>(`SELECT valore FROM impostazioni WHERE chiave = 'paghe_password'`);
    if (!p || !(await bcrypt.compare(String(req.body?.password ?? ''), p.valore.hash))) {
      tentativi.set(id, { n: (t && t.fino > Date.now() ? t.n : 0) + 1, fino: Date.now() + 15 * 60_000 });
      return res.redirect(vaiA('', 'Password non corretta.'));
    }
    tentativi.delete(id);
    req.session.bancaSbloccata = Date.now();
    res.redirect('/amministrazione/banca');
  });
  r.post('/chiudi', (req, res) => { delete req.session.bancaSbloccata; res.redirect('/amministrazione'); });
  // ritorno dalla banca dopo il consenso con l'app: prima della password (lo sblocco può essere scaduto mentre si era in banca); vale solo con lo stesso "state"
  r.get('/collega/ritorno', async (req, res) => {
    const attesa = req.session.bancaCollega;
    delete req.session.bancaCollega;
    if (req.query.error) return res.redirect(vaiA('', `La banca non ha dato il consenso: ${String(req.query.error_description ?? req.query.error)}`));
    if (!attesa || String(req.query.state ?? '') !== attesa.stato || !req.query.code) return res.redirect(vaiA('', 'Collegamento non riuscito: riparti da "Collega la banca".'));
    try {
      const c = await completaCollegamento(String(req.query.code), attesa.banca, utente(req), attesa.metodo ?? null);
      let testo = `${NOMI_COLLEGAMENTO[c.id]} collegato: ${c.conti.length} ${c.conti.length === 1 ? 'conto' : 'conti'}.`;
      try { testo += ` ${(await scaricaMovimenti(utente(req), c.id)).testo}.`; } catch (e: any) { testo += ` Primo scarico non riuscito: ${e?.message ?? e}`; }
      res.redirect(vaiA('', testo));
    } catch (e: any) { res.redirect(vaiA('', `Collegamento non riuscito: ${e?.message ?? e}`)); }
  });
  r.use(async (req, res, next) => {
    if (!chiedePasswordRiservata(req.session.utente?.ruolo)) return next();
    if (sbloccoValido(req.session.bancaSbloccata, Date.now())) { req.session.bancaSbloccata = Date.now(); return next(); }
    if (req.method !== 'GET') return res.status(403).send('Banca chiusa: scrivi di nuovo la password.');
    const impostata = await q1(`SELECT 1 FROM impostazioni WHERE chiave = 'paghe_password'`);
    res.status(403).send(pagina(req, 'Banca', html`<div class="intestazione-pagina"><h1>🔒 Banca e carte</h1></div>
      ${impostata ? html`<form method="post" action="/amministrazione/banca/sblocca" class="scheda-login sempre-attivo">
        <p>La Banca è riservata: scrivi la password (la stessa delle buste paga). Si richiude da sola dopo ${MINUTI_SBLOCCO} minuti senza aprire pagine.</p>
        <label>Password <input type="password" name="password" required autofocus autocomplete="off"></label>
        <button class="primario">Apri</button></form>`
        : html`<p class="avviso">La password non è ancora stata scelta: la sceglie l'amministratore in Dipendenti → Buste paga.</p>`}`, msg(req)));
  });

  // ───────────── movimenti ─────────────
  r.get('/', async (req, res) => {
    const configurato = openBankingConfigurato();
    const [daAbbinare, fatti, conti, elencoConti, statoOb, banche] = await Promise.all([
      movimentiDaAbbinare(),
      q<any>(`SELECT id, conto, to_char(data, 'YYYY-MM-DD') AS data, importo::float AS importo, descrizione, stato, categoria, rate, confermato_da
        FROM banca_movimenti WHERE stato <> 'da_abbinare' ORDER BY data DESC, id DESC LIMIT 200`),
      q<{ conto: string; quanti: number; dal: string; al: string }>(`SELECT conto, count(*)::int AS quanti, to_char(min(data), 'YYYY-MM-DD') AS dal, to_char(max(data), 'YYYY-MM-DD') AS al
        FROM banca_movimenti GROUP BY conto ORDER BY conto`),
      contiConSaldo(),
      statoOpenBanking(),
      // elenco delle banche con i modi di accesso (una chiamata all'API, non al database)
      configurato ? bancheDisponibili().catch(() => null) : Promise.resolve(null),
    ]);
    const nome = (n: string) => nomeConto(n, elencoConti);
    const sicuri = daAbbinare.filter(x => (x.proposta?.punteggio ?? 0) >= SOGLIA_SICURA || (!x.proposta && x.sicura)).length;
    const spuntata = (x: (typeof daAbbinare)[number]) => x.proposta ? x.proposta.punteggio >= SOGLIA_SICURA : x.sicura;
    res.send(pagina(req, 'Banca e carte', html`
      <div class="intestazione-pagina"><h1>Banca e carte</h1></div>
      ${menuAmministrazione('banca')}${tasti('movimenti')}
      ${sezioneCollegamento(statoOb, configurato, banche)}
      <details class="blocco" ${conti.length ? '' : raw('open')}><summary><strong>Carica l'estratto conto</strong>
        ${conti.map(c => html` · ${nome(c.conto)}: ${c.quanti} movimenti dal ${data(c.dal)} al ${data(c.al)}`)}</summary>
        <p class="nota">Da BPER Banking Business: Rapporti CBI → <strong>Tutti i movimenti</strong> → esporta in <strong>CSV</strong> (tutti i conti insieme: il portale
          li divide da solo con la colonna Rapporto), oppure il file CBI o Excel di un conto. Puoi ricaricare anche un periodo che si sovrappone: i movimenti già caricati non si ripetono.</p>
        <div class="riga-campi">
          <label class="stretto">Conto (se il file non lo dice) <input id="conto-banca" value="BPER" class="maiuscolo"></label>
          <label class="largo">File <input type="file" id="file-acquisizioni" multiple accept=".txt,.cbi,.csv,.xlsx,.dat"></label>
        </div>
        <div class="barra-azioni"><button type="button" class="primario" id="avvia-acquisizioni" data-url="/amministrazione/banca/carica">Carica</button>
          <span id="esito-acquisizioni" class="nota"></span></div>
      </details>

      ${sezioneConti(elencoConti, await fidoAnticipi())}
      ${await sezioneSpeseCarte(elencoConti)}
      <h2>Da abbinare (${daAbbinare.length})</h2>
      ${daAbbinare.length ? html`
        <p class="nota">Entrate → fatture emesse da incassare, uscite → fatture dei fornitori da pagare. Il portale cerca lo stesso importo, poi il numero della fattura
          e il nome nella descrizione; più fatture dello stesso cliente, una distinta RiBa intera, le fatture già segnate pagate e le distinte di bonifici ai fornitori.
          Commissioni, emolumenti, F24, anticipi e rientri si registrano da soli. Quello che le regole non capiscono lo guarda l'IA (righe "IA:").
          Le proposte sicure (${sicuri}) sono già spuntate: controlla e premi <strong>Conferma</strong>. Le fatture diventano incassate o pagate alla data del movimento.</p>
        <form method="post" action="/amministrazione/banca/ia" class="inline" id="modulo-ia"></form>
        <form method="post" action="/amministrazione/banca/conferma">
          <div class="barra-azioni"><button class="primario">Conferma le righe spuntate</button>
            <button form="modulo-ia" title="L'IA guarda di nuovo i movimenti che le regole non sanno abbinare">Chiedi all'IA</button></div>
          <div class="tabella-scorre limitata"><table class="elenco">
            <thead><tr><th data-non-ordinare></th><th>Data</th><th>Conto</th><th class="num">Importo</th><th>Descrizione</th><th>Proposta</th><th></th></tr></thead>
            <tbody>${daAbbinare.map(x => { const { m, proposta, categoria, ia } = x; return html`<tr class="${spuntata(x) ? '' : 'da-controllare'}">
              <td><input type="checkbox" name="ok" value="${m.id}" ${spuntata(x) ? raw('checked') : ''}></td>
              <td>${data(m.data)}</td><td>${nome(m.conto)}</td><td class="${importoClasse(m.importo)}">${euro(m.importo)}</td>
              <td><span class="nota taglia" title="${m.descrizione}">${m.descrizione}</span></td>
              <td>${proposta ? html`<input type="hidden" name="rate_${m.id}" value="${scritturaRate(proposta.rate)}">
                  ${proposta.rate.map(x => html`<div>${testoRata(x)}</div>`)}<div class="nota">${proposta.motivo}</div>`
                : html`<select name="cat_${m.id}">${categorieMenu(m.importo)
                    .map(c => html`<option ${c === categoria ? raw('selected') : ''}>${c}</option>`)}</select>
                  ${ia?.motivo && !ia.rate?.length ? html`<div class="nota">IA: ${ia.motivo}</div>` : ''}`}</td>
              <td><a href="/amministrazione/banca/movimento/${m.id}">a mano</a></td></tr>`; })}</tbody></table></div>
        </form>` : html`<p class="vuoto">Nessun movimento da abbinare.</p>`}

      <h2>Già abbinati e registrati</h2>
      ${fatti.length ? html`<div class="tabella-scorre limitata"><table class="elenco">
        <thead><tr><th>Data</th><th>Conto</th><th class="num">Importo</th><th>Descrizione</th><th>Categoria</th><th>Fatture</th><th>Da</th><th></th></tr></thead>
        <tbody>${fatti.map(m => html`<tr><td>${data(m.data)}</td><td>${nome(m.conto)}</td><td class="${importoClasse(m.importo)}">${euro(m.importo)}</td>
          <td><span class="nota taglia" title="${m.descrizione}">${m.descrizione}</span></td><td>${m.categoria ?? ''}</td><td>${(m.rate ?? []).length || ''}</td>
          <td>${m.confermato_da ?? ''}</td>
          <td><form method="post" action="/amministrazione/banca/movimento/${m.id}/annulla" class="inline"
            data-conferma="${m.stato === 'abbinato' ? 'Le fatture abbinate tornano da incassare/pagare. Continuare?' : 'Il movimento torna da abbinare. Continuare?'}"><button>Annulla</button></form></td></tr>`)}</tbody></table></div>`
        : html`<p class="vuoto">Ancora nulla.</p>`}`, msg(req), ['acquisizioni.js']));
  });

  // ───────────── collegamento automatico (open banking) ─────────────
  r.post('/collega', async (req, res) => {
    if (!openBankingConfigurato()) return res.redirect(vaiA('', 'Collegamento non configurato: mancano le chiavi di Enable Banking su Render.'));
    const { banca, metodo } = leggiScelta(req.body.banca);
    const stato = crypto.randomBytes(16).toString('hex');
    try {
      const url = await avviaCollegamento(banca, stato, metodo);
      req.session.bancaCollega = { stato, banca, metodo };
      // pagina con il link (non un redirect: la Content-Security-Policy "form-action" blocca un modulo che finisce su un altro sito)
      res.send(pagina(req, 'Collega', html`<div class="intestazione-pagina"><h1>Collega: ${NOMI_COLLEGAMENTO[tipoCollegamento(banca, metodo)]}</h1></div>
        <p>Si apre il sito di ${banca} (tramite Enable Banking). Entra come sempre e conferma${tipoCollegamento(banca, metodo) === 'paypal' ? '' : " con l'app BPER"}:
          autorizzi il portale a <strong>leggere</strong> saldi e movimenti (nessun pagamento). Alla fine torni qui da solo.</p>
        <p class="nota">Scegli tutti i conti${tipoCollegamento(banca, metodo) === 'carta' ? ' e le carte' : ''} che vuoi far scaricare al portale. Il consenso dura al massimo 180 giorni, poi si rinnova da questa pagina.</p>
        <div class="barra-azioni"><a class="pulsante primario" href="${url}">Vai a ${banca}</a> <a class="pulsante" href="/amministrazione/banca">Annulla</a></div>`));
    } catch (e: any) { res.redirect(vaiA('', `La banca non risponde: ${e?.message ?? e}`)); }
  });
  r.post('/scarica', async (req, res) => {
    try { res.redirect(vaiA('', `Scaricati: ${(await scaricaMovimenti(utente(req))).testo}.`)); }
    catch (e: any) { res.redirect(vaiA('', `Scarico non riuscito: ${e?.message ?? e}`)); }
  });
  r.post('/scollega', async (req, res) => {
    const id = (['conti', 'carta', 'paypal'] as TipoCollegamento[]).find(x => x === req.body?.id) ?? 'conti';
    await scollega(id);
    res.redirect(vaiA('', `${NOMI_COLLEGAMENTO[id]} scollegato: il portale non ne scarica più i movimenti (quelli già scaricati restano).`));
  });

  r.post('/carica', express.raw({ type: 'application/octet-stream', limit: '20mb' }), async (req, res) => {
    const nome = decodeURIComponent(String(req.get('x-nome-file') ?? '')).trim();
    const conto = (decodeURIComponent(String(req.get('x-conto') ?? '')).trim().toUpperCase() || 'BPER').slice(0, 30);
    const dati = req.body as Buffer;
    if (!nome || !Buffer.isBuffer(dati) || !dati.length) return res.status(400).json({ errore: 'file vuoto' });
    const letti = await leggiEstrattoConto(nome, dati);
    if (letti.errore) return res.status(400).json({ errore: letti.errore });
    if (!letti.movimenti.length) return res.status(400).json({ errore: `nessun movimento trovato nel file (${letti.formato})` });
    const { nuovi, gia } = await caricaMovimenti(letti.movimenti, conto, nome);
    res.json({ stato: `${letti.formato}: ${nuovi} movimenti nuovi${gia ? `, ${gia} già caricati` : ''}` });
  });

  r.post('/conti', async (req, res) => {
    const vecchi = await contiBanca();
    const b = req.body ?? {};
    const conti: ContoBanca[] = vecchi.map(c => {
      const v = (k: string) => String(b[`${k}_${c.numero}`] ?? '').trim();
      return { numero: c.numero, nome: v('nome').toUpperCase() || c.nome, tipo: tipoConto(v('tipo')),
        saldoData: dataDa(v('saldo_data')), saldo: importoDa(v('saldo')), fido: importoDa(v('fido')) };
    });
    await salvaConti(conti, importoDa(String(b.fido_anticipi ?? '')));
    res.redirect(vaiA('', 'Conti salvati.'));
  });

  r.post('/conferma', async (req, res) => {
    const ids = elenco(req.body?.ok).map(Number).filter(Number.isInteger);
    let abbinati = 0, registrati = 0;
    const errori: string[] = [];
    for (const id of ids) {
      const rate = String(req.body?.[`rate_${id}`] ?? '');
      if (rate) {
        const scelte = rate.split(',').map(x => { const [tipo, n, gia] = x.split(':'); return { tipo: tipo as 'emessa' | 'ricevuta', id: Number(n), ...(gia === 'gia' ? { gia: true } : {}) }; });
        const e = await abbinaMovimento(id, scelte, utente(req));
        if (e) errori.push(`Movimento ${id}: ${e}`); else abbinati++;
      } else {
        const cat = String(req.body?.[`cat_${id}`] ?? '');
        if (!(CATEGORIE_MOVIMENTO as readonly string[]).includes(cat)) { errori.push(`Movimento ${id}: categoria non valida.`); continue; }
        await registraMovimento(id, cat, utente(req));
        registrati++;
      }
    }
    res.redirect(vaiA('', [`${abbinati} movimenti abbinati alle fatture, ${registrati} registrati in categoria.`, ...errori].join(' ')));
  });

  r.post('/ia', async (req, res) => {
    try { res.redirect(vaiA('', `${(await proponiConIa(true)).testo}.`)); }
    catch (e: any) { res.redirect(vaiA('', `IA non riuscita: ${e?.message ?? e}`)); }
  });

  r.get('/movimento/:id', async (req, res) => {
    const m = await movimento(Number(req.params.id));
    if (!m) return res.status(404).send(pagina(req, 'Movimento', html`<p>Movimento non trovato.</p>`));
    const tipo = m.importo > 0 ? 'emessa' : 'ricevuta';
    const imp = Math.abs(m.importo);
    const rate = (await rateAperte()).filter(x => x.tipo === tipo && x.importo > 0)
      .sort((a, b) => Math.abs(a.importo - imp) - Math.abs(b.importo - imp) || a.scadenza.localeCompare(b.scadenza)).slice(0, 300);
    res.send(pagina(req, 'Movimento in banca', html`
      <div class="intestazione-pagina"><h1>Movimento del ${data(m.data)} · <span class="${m.importo < 0 ? 'negativo' : ''}">${euro(m.importo)}</span></h1></div>
      ${menuAmministrazione('banca')}${tasti('movimenti')}
      <p>${m.descrizione}</p><p class="nota">Conto ${m.conto}${m.valuta ? ` · valuta ${data(m.valuta)}` : ''}${m.file ? ` · dal file ${m.file}` : ''} · ${m.stato.replace('_', ' ')}</p>
      ${m.stato === 'da_abbinare' ? html`
        <h2>Abbina a ${tipo === 'emessa' ? 'fatture emesse da incassare' : 'fatture dei fornitori da pagare'}</h2>
        <p class="nota">Spunta una o più rate: la somma deve fare ${euro(imp)}. In cima quelle con l'importo più vicino.</p>
        <form method="post" action="/amministrazione/banca/movimento/${m.id}/abbina">
          <div class="tabella-scorre limitata"><table class="elenco">
            <thead><tr><th data-non-ordinare></th><th>Scadenza</th><th>Fattura</th><th>Del</th><th>${tipo === 'emessa' ? 'Cliente' : 'Fornitore'}</th><th class="num">Importo</th></tr></thead>
            <tbody>${rate.map(x => html`<tr><td><input type="checkbox" name="rata" value="${x.tipo}:${x.id}"></td><td>${data(x.scadenza)}</td>
              <td><a href="${x.tipo === 'emessa' ? `/amministrazione/documenti/${x.documentoId}` : `/amministrazione/ricevuti/${x.documentoId}`}">${x.numero || 's.n.'}</a></td>
              <td>${data(x.dataDoc)}</td><td>${x.controparte}</td><td class="num">${euro(x.importo)}</td></tr>`)}</tbody></table></div>
          <div class="barra-azioni"><button class="primario">Abbina le rate spuntate</button></div>
        </form>
        <h2>Oppure senza fattura</h2>
        <form method="post" action="/amministrazione/banca/movimento/${m.id}/registra" class="riga-campi">
          <label>Categoria <select name="categoria">${categorieMenu(m.importo).map(c => html`<option>${c}</option>`)}</select></label>
          <button>Registra</button></form>
        <form method="post" action="/amministrazione/banca/movimento/${m.id}/elimina" class="inline" data-conferma="Eliminare questo movimento (caricato per sbaglio)?">
          <button class="pericolo">Elimina il movimento</button></form>`
      : html`<form method="post" action="/amministrazione/banca/movimento/${m.id}/annulla" class="inline" data-conferma="Annullare l'abbinamento?"><button>Annulla l'abbinamento</button></form>`}
      <p><a href="/amministrazione/banca">← Banca</a></p>`, msg(req)));
  });

  r.post('/movimento/:id/abbina', async (req, res) => {
    const id = Number(req.params.id);
    const scelte = elenco(req.body?.rata).map(x => { const [tipo, n] = x.split(':'); return { tipo: tipo as 'emessa' | 'ricevuta', id: Number(n) }; });
    const e = await abbinaMovimento(id, scelte, utente(req));
    res.redirect(e ? vaiA(`/movimento/${id}`, e) : vaiA('', 'Movimento abbinato: fatture segnate incassate/pagate.'));
  });
  r.post('/movimento/:id/registra', async (req, res) => {
    const cat = String(req.body?.categoria ?? '');
    if (!(CATEGORIE_MOVIMENTO as readonly string[]).includes(cat)) return res.redirect(vaiA(`/movimento/${req.params.id}`, 'Categoria non valida.'));
    await registraMovimento(Number(req.params.id), cat, utente(req));
    res.redirect(vaiA('', `Movimento registrato: ${cat}.`));
  });
  r.post('/movimento/:id/annulla', async (req, res) => {
    await annullaMovimento(Number(req.params.id));
    res.redirect(vaiA('', 'Abbinamento annullato: il movimento è di nuovo da abbinare.'));
  });
  r.post('/movimento/:id/elimina', async (req, res) => {
    const ok = await eliminaMovimento(Number(req.params.id));
    res.redirect(vaiA('', ok ? 'Movimento eliminato.' : 'Un movimento abbinato non si elimina: prima annulla l\'abbinamento.'));
  });

  // ───────────── RiBa e anticipo fatture ─────────────
  r.get('/anticipi', async (req, res) => {
    const oggi = oggiRoma();
    const [rate, sia, elencoDistinte] = await Promise.all([rateDaAnticipare(), codiceSia(), distinte()]);
    const nuova = Number(req.query.distinta) || 0;
    res.send(pagina(req, 'RiBa e anticipo fatture', html`
      <div class="intestazione-pagina"><h1>RiBa e anticipo fatture</h1></div>
      ${menuAmministrazione('banca')}${tasti('anticipi')}
      ${nuova ? html`<div class="avviso info"><strong>Distinta RiBa n. ${nuova} pronta.</strong> <a href="/amministrazione/banca/riba/${nuova}" class="pulsante primario">Scarica il file CBI</a>
        e caricalo in BPER Banking Business → Incassi → Ri.Ba. (importa file / flusso CBI). Quando la banca accredita, l'incasso si abbina da solo alla distinta.</div>` : ''}
      <p class="nota">Rate delle fatture emesse ancora da incassare, con scadenza da oggi in avanti. <strong>RiBa</strong>: spunta e "Crea il file RiBa" = file CBI
        standard da caricare nell'home banking (presentazione salvo buon fine o al dopo incasso, come d'accordo con la banca).
        <strong>Anticipo fatture con bonifico</strong>: spunta e "Excel per l'anticipo" = elenco delle fatture da mandare alla banca; gli XML delle fatture
        si scaricano da <a href="/amministrazione/documenti?tipo=fattura">Fatture</a> (spunte → XML/zip).</p>
      <form method="post" action="/amministrazione/banca/sia" class="riga-campi blocco">
        <label class="stretto">Codice SIA dell'azienda <input name="sia" value="${sia}" maxlength="5" class="maiuscolo" placeholder="5 caratteri"></label>
        <span class="nota">Lo dà BPER (contratto incassi commerciali / RiBa). Senza il codice SIA il file non si crea.</span>
        <button>Salva</button></form>
      ${rate.length ? html`<form method="post" action="/amministrazione/banca/anticipi">
        <div class="barra-azioni"><button name="azione" value="riba" class="primario">Crea il file RiBa (CBI)</button>
          <button name="azione" value="excel">Excel per l'anticipo</button></div>
        <div class="tabella-scorre limitata"><table class="elenco">
          <thead><tr><th data-non-ordinare></th><th>Scadenza</th><th>Fattura</th><th>Del</th><th>Cliente</th><th class="num">Importo</th><th>Pagamento</th><th>Banca del cliente</th><th>Distinta</th></tr></thead>
          <tbody>${rate.map(x => {
            const err = controlliEffetto(effettoDa(x), oggi);
            const riba = x.modalita === 'MP12';
            return html`<tr><td><input type="checkbox" name="rata" value="${x.id}" ${riba && !x.riba_distinta_id && !err.length ? raw('checked') : ''}></td>
              <td>${data(x.scadenza)}</td><td><a href="/amministrazione/documenti/${x.documento_id}">${x.numero}</a></td><td>${data(x.data_doc)}</td>
              <td>${x.cliente_id ? html`<a href="/anagrafiche/clienti/${x.cliente_id}/fiscali">${x.cliente}</a>` : x.cliente}</td>
              <td class="num">${euro(x.importo)}</td><td>${riba ? 'RiBa' : x.modalita === 'MP05' ? 'Bonifico' : x.modalita}</td>
              <td>${abiCabDaIban(x.banca_appoggio) ? html`ABI ${abiCabDaIban(x.banca_appoggio)!.abi} CAB ${abiCabDaIban(x.banca_appoggio)!.cab}`
                : html`<span class="negativo" title="${err.join('; ')}">manca l'IBAN</span>`}</td>
              <td>${x.riba_distinta_id ? `n. ${x.riba_distinta_id}` : ''}</td></tr>`;
          })}</tbody></table></div></form>` : html`<p class="vuoto">Nessuna rata da incassare con scadenza futura.</p>`}
      <h2>Distinte RiBa create</h2>
      ${elencoDistinte.length ? html`<table class="elenco"><thead><tr><th>N.</th><th>Creata il</th><th>Da</th><th>Supporto</th><th class="num">Effetti</th><th class="num">Totale</th><th>Incassate</th><th></th></tr></thead>
        <tbody>${elencoDistinte.map(d => html`<tr class="${d.annullata ? 'annullato' : ''}"><td>${d.id}</td><td>${data(d.creata_il)}</td><td>${d.creata_da ?? ''}</td><td>${d.nome_supporto}</td>
          <td class="num">${d.quante}</td><td class="num">${euro(d.totale)}</td><td>${d.annullata ? 'annullata' : `${d.incassate} di ${d.quante}`}</td>
          <td><a href="/amministrazione/banca/riba/${d.id}">Scarica</a>
            ${d.annullata ? '' : html` <form method="post" action="/amministrazione/banca/riba/${d.id}/annulla" class="inline"
              data-conferma="Annullare la distinta? Fallo solo se la banca non l'ha presa: le rate tornano libere."><button>Annulla</button></form>`}</td></tr>`)}</tbody></table>`
        : html`<p class="vuoto">Nessuna distinta.</p>`}`, msg(req)));
  });

  r.post('/sia', async (req, res) => {
    const sia = String(req.body?.sia ?? '').trim();
    if (sia && !/^[A-Za-z0-9]{5}$/.test(sia)) return res.redirect(vaiA('/anticipi', 'Il codice SIA ha 5 caratteri (lettere o numeri).'));
    await salvaCodiceSia(sia);
    res.redirect(vaiA('/anticipi', 'Codice SIA salvato.'));
  });

  r.post('/anticipi', async (req, res) => {
    const ids = elenco(req.body?.rata).map(Number).filter(Number.isInteger);
    if (!ids.length) return res.redirect(vaiA('/anticipi', 'Spunta almeno una fattura.'));
    if (req.body?.azione === 'excel') {
      const rate = (await rateDaAnticipare()).filter(x => ids.includes(x.id));
      return inviaExcel(res, nomeExcel('anticipo-fatture'), await excelSemplice('Anticipo fatture', [
        { header: 'Fattura', key: 'numero' }, { header: 'Data', key: 'data_doc', formato: 'data' }, { header: 'Cliente', key: 'cliente', width: 40 },
        { header: 'P.IVA', key: 'partita_iva', width: 14 }, { header: 'Scadenza', key: 'scadenza', formato: 'data' }, { header: 'Importo', key: 'importo', formato: 'euro', width: 14 }],
        rate as unknown as Record<string, unknown>[]));
    }
    const esito = await creaDistinta(ids, utente(req), oggiRoma());
    if (esito.errori.length) return res.redirect(vaiA('/anticipi', `File non creato: ${esito.errori.join(' ')}`));
    res.redirect(`/amministrazione/banca/anticipi?distinta=${esito.id}`);
  });

  r.get('/riba/:id', async (req, res) => {
    const d = (await q<{ nome_supporto: string; file: string }>(`SELECT nome_supporto, file FROM riba_distinte WHERE id = $1`, [Number(req.params.id) || 0]))[0];
    if (!d) return res.status(404).send(pagina(req, 'Distinta', html`<p>Distinta non trovata.</p>`));
    res.type('text/plain').setHeader('Content-Disposition', `attachment; filename="${d.nome_supporto}.txt"`).send(d.file);
  });
  r.post('/riba/:id/annulla', async (req, res) => {
    await annullaDistinta(Number(req.params.id));
    res.redirect(vaiA('/anticipi', 'Distinta annullata: le rate si possono rimettere in un\'altra distinta.'));
  });

  return r;
}
