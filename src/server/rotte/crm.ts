/**
 * CRM (solo ufficio): ricerca delle aziende, scheda con recapiti e referenti, registro delle attività
 * (telefonate, email, visite, offerte) e prossima azione con la data. Le aziende dubbie dell'import
 * restano nella lista "Da verificare" finché non si confermano o si scartano.
 */
import { excelSemplice, inviaExcel, nomeExcel } from '../excel.js';
import { conCampo } from '../../engine/errori-campo.js';
import { Router, type Request } from 'express';
import { q, q1, transazione } from '../db.js';
import { layout } from '../views/layout.js';
import { html, data, euro, num, raw, type Raw } from '../views/html.js';
import { maiuscolo } from '../anagrafiche-servizio.js';
import { allineaClienti, aziendaConNome, cercaAziende, fatturatoClienti, type FatturatoCliente } from '../crm-servizio.js';
import { PRIORITA, STATI_CRM, formatta, TIPI_ATTIVITA, scadenza, statoDa, type StatoCrm, type TipoAttivita } from '../../engine/crm.js';

const oggiRoma = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
const dataValida = (d: unknown) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
const testo = (v: unknown) => { const t = String(v ?? '').trim(); return t || null; };

const statoBadge = (s: StatoCrm) => html`<span class="stato crm-${s}">${STATI_CRM[s]}</span>`;
/** Data della prossima azione colorata: rossa se scaduta, evidenziata se oggi. */
function quando(d: string | null, oggi: string) {
  const s = scadenza(d, oggi);
  if (!s) return '';
  return html`<span class="scadenza ${s}">${s === 'oggi' ? 'oggi' : data(d)}</span>`;
}
const telefono = (t: string | null) => (t ? html`<a href="tel:${t.replace(/[^\d+]/g, '')}">${t}</a>` : '');
const sito = (s: string | null) => (s ? html`<a href="${/^https?:\/\//i.test(s) ? s : 'https://' + s}" target="_blank" rel="noopener">${s.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')}</a>` : '');

export function rotteCrm() {
  const r = Router();
  const pagina = (req: Request, titolo: string, contenuto: Raw, avviso?: string) =>
    String(layout({ titolo, utente: req.session.utente, attiva: 'crm', largo: true, script: 'crm.js', contenuto, avviso }));
  const msg = (req: Request) => (req.query.msg ? String(req.query.msg) : undefined);

  // ── Ricerca e cose da fare ──
  r.get('/elenco.xlsx', async (req, res) => {
    const filtri = { testo: String(req.query.q ?? ''), stato: String(req.query.stato ?? ''), provincia: String(req.query.prov ?? ''), responsabile: String(req.query.resp ?? ''), soloAzioni: req.query.azioni === '1' };
    const righe = await cercaAziende(filtri, 5000);
    inviaExcel(res, nomeExcel('crm'), await excelSemplice('CRM', [
      { header: 'Azienda', key: 'nome', width: 40 }, { header: 'Città', key: 'citta', width: 22 }, { header: 'Prov.', key: 'provincia', width: 6 }, { header: 'Telefono', key: 'telefono', width: 16 },
      { header: 'Email', key: 'email', width: 30 }, { header: 'Stato', key: 'stato', width: 14 }, { header: 'Priorità', key: 'priorita', width: 10 }, { header: 'Responsabile', key: 'responsabile', width: 14 },
      { header: 'Prossima azione', key: 'prossima_azione', width: 30 }, { header: 'Quando', key: 'data_prossima_azione', formato: 'data' }, { header: 'Ultimo contatto', key: 'ultimo_contatto', formato: 'data' },
      { header: 'Già cliente', key: 'cliente', width: 10 },
    ], righe.map((a: any) => ({ ...a, stato: String(a.stato ?? '').replace(/_/g, ' '), cliente: a.cliente_id ? 'sì' : '' }))));
  });

  r.get('/', async (req, res) => {
    await allineaClienti();
    const oggi = oggiRoma();
    const filtri = {
      testo: String(req.query.q ?? ''), stato: String(req.query.stato ?? ''), provincia: String(req.query.prov ?? ''),
      responsabile: String(req.query.resp ?? ''), soloAzioni: req.query.azioni === '1',
    };
    const cerca = !!(filtri.testo.trim() || filtri.stato || filtri.provincia.trim() || filtri.responsabile || filtri.soloAzioni);
    const conti = (await q(`SELECT
        count(*) FILTER (WHERE da_verificare IS NULL AND stato <> 'scartato')::int AS aziende,
        count(*) FILTER (WHERE da_verificare IS NULL AND cliente_id IS NOT NULL)::int AS clienti,
        count(*) FILTER (WHERE da_verificare IS NOT NULL)::int AS verificare,
        count(*) FILTER (WHERE da_verificare IS NULL AND data_prossima_azione < $1)::int AS scadute,
        count(*) FILTER (WHERE da_verificare IS NULL AND data_prossima_azione = $1)::int AS oggi,
        count(*) FILTER (WHERE da_verificare IS NULL AND data_prossima_azione > $1 AND data_prossima_azione <= $1::date + 7)::int AS settimana
      FROM crm_aziende`, [oggi]))[0];
    const responsabili = (await q<{ r: string }>(`SELECT DISTINCT responsabile AS r FROM crm_aziende WHERE responsabile IS NOT NULL ORDER BY 1`)).map(x => x.r);
    const righe = cerca ? await cercaAziende(filtri) : await cercaAziende({ soloAzioni: true }, 100);
    const { perCliente } = await fatturatoClienti(righe.filter(a => a.cliente_id).map(a => a.cliente_id));
    const recenti = cerca ? [] : await q(`SELECT t.data, t.tipo, t.descrizione, a.id, coalesce(cl.ragione_sociale, a.ragione_sociale) AS nome
      FROM crm_attivita t JOIN crm_aziende a ON a.id = t.azienda_id LEFT JOIN clienti cl ON cl.id = a.cliente_id
      ORDER BY t.data DESC, t.id DESC LIMIT 10`);
    res.send(pagina(req, 'CRM', html`
      <div class="intestazione-pagina"><h1>CRM</h1>
        <div class="azioni">
          ${conti.verificare ? html`<a class="bottone" href="/crm/verificare">Da verificare <span class="conta">${conti.verificare}</span></a>` : ''}
          <form method="post" action="/crm/nuova" class="nuova-azienda"><input name="ragione_sociale" class="maiuscolo" placeholder="Nuova azienda" required><button>Aggiungi</button></form>
        </div></div>

      <form class="cerca-crm" method="get" action="/crm">
        <input name="q" type="search" value="${filtri.testo}" placeholder="Cerca azienda, città, referente, telefono, email, P.IVA…" autofocus>
        <select name="stato"><option value="">Tutti gli stati</option>${Object.entries(STATI_CRM).map(([k, v]) => html`<option value="${k}" ${filtri.stato === k ? raw('selected') : ''}>${v}</option>`)}</select>
        <input name="prov" value="${filtri.provincia}" placeholder="Prov." maxlength="2" class="maiuscolo corto">
        ${responsabili.length ? html`<select name="resp"><option value="">Tutti i responsabili</option>${responsabili.map(x => html`<option ${filtri.responsabile === x ? raw('selected') : ''}>${x}</option>`)}</select>` : ''}
        <label class="spunta piccola"><input type="checkbox" name="azioni" value="1" ${filtri.soloAzioni ? raw('checked') : ''}> solo con prossima azione</label>
        <button class="primario">Cerca</button>${cerca ? html` <a href="/crm">Azzera</a>` : ''}
      </form>

      ${cerca ? '' : html`<div class="cifre">
        <a class="cifra ${conti.scadute ? 'allarme' : ''}" href="/crm?azioni=1"><span>Azioni scadute</span><b>${conti.scadute}</b><small>da fare prima possibile</small></a>
        <a class="cifra" href="/crm?azioni=1"><span>Da fare oggi</span><b>${conti.oggi}</b><small>${conti.settimana} nei prossimi 7 giorni</small></a>
        <div class="cifra"><span>Aziende</span><b>${num(conti.aziende, 0)}</b><small>di cui ${conti.clienti} clienti</small></div>
      </div>`}

      <h2>${cerca ? html`Risultati <span class="nota">(${righe.length}${righe.length === 200 ? '+, restringi la ricerca' : ''})</span>` : 'Prossime azioni'}
        <a class="bottone" href="/crm/elenco.xlsx?${new URLSearchParams({ q: filtri.testo, stato: filtri.stato, prov: filtri.provincia, resp: filtri.responsabile, azioni: cerca ? (filtri.soloAzioni ? '1' : '') : '1' })}" title="Queste aziende in Excel">Excel</a></h2>
      ${righe.length ? html`<div class="tabella-scorre"><table class="elenco crm">
        <thead><tr><th>Azienda</th><th>Città</th><th>Telefono</th><th>Referente</th><th>Stato</th><th>Prossima azione</th><th>Quando</th></tr></thead>
        <tbody>${righe.map(a => html`<tr class="cliccabile ${scadenza(a.data_prossima_azione, oggi) ?? ''} ${a.cliente_id ? 'gia-cliente' : ''}" data-href="/crm/${a.id}">
          <td class="taglia"><a href="/crm/${a.id}">${a.nome}</a>${a.cliente_id ? giaCliente(perCliente.get(a.cliente_id)) : ''}</td>
          <td class="nowrap">${a.citta ?? ''}${a.provincia ? html` <span class="nota">(${a.provincia})</span>` : ''}</td>
          <td class="nowrap">${telefono(a.telefono)}</td><td class="taglia">${a.referente ?? ''}</td>
          <td>${statoBadge(a.stato)}</td><td class="taglia">${a.prossima_azione ?? ''}</td><td class="nowrap">${quando(a.data_prossima_azione, oggi)}</td>
        </tr>`)}</tbody></table></div>`
        : html`<p class="vuoto">${cerca ? 'Nessuna azienda trovata.' : html`Nessuna prossima azione in programma. Cerca un'azienda e registra cosa hai fatto e cosa fare dopo.`}</p>`}

      ${recenti.length ? html`<h2>Ultime attività</h2>
        <div class="tabella-scorre"><table class="elenco"><tbody>${recenti.map(t => html`<tr class="cliccabile" data-href="/crm/${t.id}">
          <td class="nowrap">${data(t.data)}</td><td class="nowrap">${TIPI_ATTIVITA[t.tipo as TipoAttivita]}</td>
          <td class="nowrap"><a href="/crm/${t.id}">${t.nome}</a></td><td class="taglia">${t.descrizione}</td></tr>`)}</tbody></table></div>` : ''}
      `, msg(req)));
  });

  // ── Aziende dubbie dell'import: si confermano o si scartano ──
  r.get('/verificare', async (req, res) => {
    const righe = await cercaAziende({ testo: String(req.query.q ?? ''), verificare: true }, 300);
    res.send(pagina(req, 'Da verificare', html`
      <div class="intestazione-pagina"><h1><a href="/crm">CRM</a> › Da verificare</h1></div>
      <p class="nota">Aziende del vecchio file con un dubbio (possibile doppione, nome rovinato, dati da internet poco sicuri). Non compaiono nelle ricerche del CRM
        finché non le confermi. <b>Conferma</b> la mette nel CRM; <b>Scarta</b> la toglie dalle ricerche (stato Scartato: dati e referenti restano).
        Per un doppione: apri le due schede, tieni quella giusta e scarta l'altra.</p>
      <form class="cerca" method="get"><input name="q" type="search" value="${req.query.q ?? ''}" placeholder="Cerca…"><button>Cerca</button></form>
      <div class="tabella-scorre"><table class="elenco crm">
        <thead><tr><th>Azienda</th><th>Città</th><th>Telefono</th><th>Email</th><th>Dubbio</th><th></th></tr></thead>
        <tbody>${righe.map(a => html`<tr>
          <td class="taglia"><a href="/crm/${a.id}">${a.nome}</a></td>
          <td class="nowrap">${a.citta ?? ''}${a.provincia ? html` <span class="nota">(${a.provincia})</span>` : ''}</td>
          <td class="nowrap">${telefono(a.telefono)}</td><td class="taglia">${a.email ?? ''}</td>
          <td class="dubbio">${collegaCodici(a.da_verificare)}</td>
          <td class="nowrap"><form method="post" action="/crm/${a.id}/verifica" class="inline">
            <button name="esito" value="conferma">Conferma</button> <button name="esito" value="scarta" class="link negativo">Scarta</button></form></td>
        </tr>`)}</tbody></table></div>
      ${righe.length === 300 ? html`<p class="nota">Ne mostro 300: usa la ricerca per trovare le altre.</p>` : ''}`, msg(req)));
  });

  r.post('/nuova', async (req, res) => {
    const nome = maiuscolo(req.body.ragione_sociale);
    if (!nome) return res.redirect('/crm');
    const esiste = await aziendaConNome(nome);
    if (esiste) return res.redirect(`/crm/${esiste.id}?msg=${encodeURIComponent(`${esiste.ragione_sociale} è già nel CRM.`)}`);
    const { id } = (await q1(`INSERT INTO crm_aziende (ragione_sociale) VALUES ($1) RETURNING id`, [nome]))!;
    res.redirect(`/crm/${id}?msg=${encodeURIComponent(`${nome} aggiunta: completa i dati.`)}#dati`);
  });

  // link dai motivi dei dubbi ("Possibile doppione di AZ00004")
  r.get('/codice/:codice', async (req, res) => {
    const a = await q1(`SELECT id FROM crm_aziende WHERE codice = $1`, [req.params.codice]);
    res.redirect(a ? `/crm/${a.id}` : '/crm');
  });

  // ── Scheda dell'azienda ──
  r.get('/:id', async (req, res) => {
    const id = Number(req.params.id);
    const a = await q1(`SELECT a.*, cl.ragione_sociale AS cliente FROM crm_aziende a LEFT JOIN clienti cl ON cl.id = a.cliente_id WHERE a.id = $1`, [id]);
    if (!a) return res.status(404).send('Azienda non trovata');
    const oggi = oggiRoma();
    const contatti = await q(`SELECT * FROM crm_contatti WHERE azienda_id = $1 ORDER BY codice NULLS LAST, id`, [id]);
    const attivita = await q(`SELECT t.*, u.nome AS utente FROM crm_attivita t LEFT JOIN utenti u ON u.id = t.utente_id
      WHERE t.azienda_id = $1 ORDER BY t.data DESC, t.id DESC`, [id]);
    const clientiLiberi = await q(`SELECT id, ragione_sociale FROM clienti c
      WHERE c.id = $1 OR NOT EXISTS (SELECT 1 FROM crm_aziende x WHERE x.cliente_id = c.id) ORDER BY ragione_sociale`, [a.cliente_id ?? 0]);
    const ordini = a.cliente_id ? (await q1(`SELECT count(*)::int AS n FROM ordini WHERE cliente_id = $1`, [a.cliente_id]))!.n : 0;
    const fatt = a.cliente_id ? await fatturatoClienti([a.cliente_id]) : null;
    const fc = fatt?.perCliente.get(a.cliente_id);
    const nome = a.cliente ?? a.ragione_sociale;
    const s = scadenza(a.data_prossima_azione, oggi);
    const campo = (k: string, t: string, extra: Raw | string = '') =>
      html`<label>${t} <input name="${k}" value="${a[k] ?? ''}" ${extra}></label>`;

    res.send(pagina(req, nome, html`
      <div class="intestazione-pagina">
        <h1><a href="/crm">CRM</a> › ${nome} ${statoBadge(a.stato)}</h1>
      </div>
      ${a.cliente_id ? html`<div class="riquadro-cliente">
        <span class="etichetta cliente grande">Già cliente</span>
        <span>${fc ? html`fatturato medio annuo <b>${fc.fascia}</b> <small class="nota">(media ${fatt!.anni[0]}–${fatt!.anni.at(-1)}: ${euro(Math.round(fc.media))};
          ${fatt!.anni.map(y => `${y}: ${fc.perAnno[y] ? euro(Math.round(fc.perAnno[y])) : '—'}`).join(' · ')})</small>`
          : fatt?.anni.length ? html`nessuna fattura negli anni ${fatt.anni[0]}–${fatt.anni.at(-1)}` : 'fatturato non ancora caricato'}</span>
        ${ordini ? html`<a href="/ordini?vista=tutti&q=${encodeURIComponent(a.cliente)}">${ordini} ordini</a>` : ''}
      </div>` : ''}
      ${a.da_verificare ? html`<div class="avviso">Da verificare: ${collegaCodici(a.da_verificare)}
        <form method="post" action="/crm/${id}/verifica" class="inline"> <button name="esito" value="conferma">Conferma</button> <button name="esito" value="scarta" class="link negativo">Scarta</button></form></div>` : ''}

      <div class="prossima ${s ?? 'nessuna'}">
        ${a.prossima_azione || a.data_prossima_azione
          ? html`<span>Prossima azione</span> <b>${a.prossima_azione ?? '(senza descrizione)'}</b> ${a.data_prossima_azione ? html`<span class="scadenza ${s}">${s === 'oggi' ? 'oggi' : data(a.data_prossima_azione)}${s === 'scaduta' ? ' · scaduta' : ''}</span>` : ''}`
          : html`<span>Nessuna prossima azione</span>`}
        ${a.ultimo_contatto ? html`<small>ultimo contatto ${data(a.ultimo_contatto)}</small>` : ''}
      </div>

      <div class="griglia-crm">
        <section>
          <form method="post" action="/crm/${id}/attivita" class="blocco registra">
            <h2>Registra un'attività</h2>
            <div class="riga-campi">
              <label class="stretto">Data <input type="date" name="data" value="${oggi}" required></label>
              <label>Tipo <select name="tipo">${Object.entries(TIPI_ATTIVITA).map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select></label>
              <label>Con chi <input name="referente" list="referenti" autocomplete="off"></label>
            </div>
            <label>Cosa è stato fatto / esito <textarea name="descrizione" rows="3" required placeholder="Es. sentito il responsabile acquisti: interessati, mandano le BOM la prossima settimana"></textarea></label>
            <div class="riga-campi">
              <label class="largo">Prossima azione <input name="prossima_azione" value="${a.prossima_azione ?? ''}" placeholder="Es. richiamare per l'offerta"></label>
              <label>Entro il <input type="date" name="data_prossima_azione" id="data-prossima" value="${a.data_prossima_azione ?? ''}"></label>
            </div>
            <div class="date-rapide" data-oggi="${oggi}">
              <button type="button" data-giorni="1">domani</button><button type="button" data-giorni="7">tra 1 settimana</button>
              <button type="button" data-giorni="14">tra 2 settimane</button><button type="button" data-mesi="1">tra 1 mese</button>
              <button type="button" data-mesi="3">tra 3 mesi</button><button type="button" data-giorni="0" class="link">nessuna</button>
            </div>
            <div class="riga-campi">
              <label>Nuovo stato <select name="stato"><option value="">— resta ${STATI_CRM[a.stato as StatoCrm]} —</option>
                ${Object.entries(STATI_CRM).filter(([k]) => k !== a.stato).map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select></label>
              <div class="in-fondo"><button class="primario">Registra</button></div>
            </div>
            <datalist id="referenti">${contatti.map(k => html`<option value="${k.nome}">`)}</datalist>
          </form>

          <h2>Storico attività <span class="nota">(${attivita.length})</span></h2>
          ${attivita.length ? html`<ul class="storico-crm">${attivita.map(t => html`<li>
            <div class="testa"><b>${data(t.data)}</b> · ${TIPI_ATTIVITA[t.tipo as TipoAttivita]}${t.referente ? html` · con ${t.referente}` : ''}
              <span class="nota">${t.utente ?? ''}</span>
              <form method="post" action="/crm/attivita/${t.id}/elimina" class="inline elimina-attivita"><button class="link negativo" title="Elimina">×</button></form></div>
            <div class="testo">${t.descrizione}</div></li>`)}</ul>`
          : html`<p class="nota">Nessuna attività registrata.</p>`}
        </section>

        <section>
          <div class="blocco recapiti">
            <h2>Recapiti</h2>
            <dl>
              ${a.telefono ? html`<dt>Telefono</dt><dd>${telefono(a.telefono)}${a.altri_telefoni ? html` <span class="nota">· ${a.altri_telefoni}</span>` : ''}</dd>` : ''}
              ${a.email ? html`<dt>Email</dt><dd><a href="mailto:${a.email}">${a.email}</a>${a.altre_email ? html` <span class="nota">· ${a.altre_email}</span>` : ''}</dd>` : ''}
              ${a.sito ? html`<dt>Sito</dt><dd>${sito(a.sito)}</dd>` : ''}
              ${a.indirizzo || a.citta ? html`<dt>Sede</dt><dd>${[a.indirizzo, [a.cap, a.citta].filter(Boolean).join(' '), a.provincia ? `(${a.provincia})` : '', a.paese && a.paese !== 'Italia' ? a.paese : ''].filter(Boolean).join(' ')}</dd>` : ''}
              ${a.partita_iva ? html`<dt>P.IVA</dt><dd>${a.partita_iva}</dd>` : ''}
              ${a.settore || a.descrizione ? html`<dt>Settore</dt><dd>${[a.settore, a.descrizione].filter(Boolean).join(' · ')}</dd>` : ''}
              ${a.ateco ? html`<dt>ATECO</dt><dd>${a.ateco}</dd>` : ''}
              ${a.dipendenti || a.fatturato ? html`<dt>Dimensione</dt><dd>${a.dipendenti ? `${a.dipendenti} dipendenti` : ''}${a.dipendenti && a.fatturato ? ' · ' : ''}${a.fatturato ? `fatturato ${euro(a.fatturato)}` : ''}</dd>` : ''}
              ${a.priorita || a.responsabile ? html`<dt>Gestione</dt><dd>${a.priorita ? `priorità ${PRIORITA[a.priorita as keyof typeof PRIORITA].toLowerCase()}` : ''}${a.priorita && a.responsabile ? ' · ' : ''}${a.responsabile ?? ''}</dd>` : ''}
              ${a.note ? html`<dt>Note</dt><dd class="a-capo">${a.note}</dd>` : ''}
            </dl>
          </div>

          <div class="blocco">
            <h2>Referenti <span class="nota">(${contatti.length})</span></h2>
            ${contatti.length ? html`<table class="referenti"><tbody>${contatti.map(k => html`<tr>
              <td><b>${k.nome}</b>${k.ruolo ? html`<br><small class="nota">${k.ruolo}</small>` : ''}</td>
              <td>${telefono(k.telefono)}${k.email ? html`<br><a href="mailto:${k.email}">${k.email}</a>` : ''}${k.note ? html`<br><small class="nota">${k.note}</small>` : ''}</td>
              <td class="nowrap"><details class="modifica"><summary>Modifica</summary>
                <form method="post" action="/crm/contatti/${k.id}" class="stretto-form">
                  <label>Nome <input name="nome" value="${k.nome}" required></label><label>Ruolo <input name="ruolo" value="${k.ruolo ?? ''}"></label>
                  <label>Telefono <input name="telefono" value="${k.telefono ?? ''}"></label><label>Email <input name="email" type="email" value="${k.email ?? ''}"></label>
                  <label>Note <input name="note" value="${k.note ?? ''}"></label>
                  <div><button class="primario">Salva</button> <button name="elimina" value="1" class="link negativo" data-conferma="${`Eliminare il referente ${k.nome}?`}">Elimina referente</button></div>
                </form></details></td></tr>`)}</tbody></table>` : ''}
            <details class="modifica"><summary>+ Aggiungi referente</summary>
              <form method="post" action="/crm/${id}/contatti" class="stretto-form">
                <label>Nome e cognome <input name="nome" required></label><label>Ruolo <input name="ruolo" placeholder="Es. responsabile acquisti"></label>
                <label>Telefono <input name="telefono"></label><label>Email <input name="email" type="email"></label><label>Note <input name="note"></label>
                <div><button class="primario">Aggiungi</button></div>
              </form></details>
          </div>

          <details class="blocco" id="dati" ${req.query.msg && String(req.query.msg).includes('completa') ? raw('open') : ''}>
            <summary>Modifica i dati dell'azienda</summary>
            <form method="post" action="/crm/${id}/dati" class="campi-azienda">
              ${a.cliente_id ? html`<p class="nota">Il nome viene dall'anagrafica clienti (Anagrafiche → Clienti).</p>` : campo('ragione_sociale', 'Ragione sociale', raw('class="maiuscolo" required'))}
              <div class="riga-campi">
                <label>Stato <select name="stato">${Object.entries(STATI_CRM).map(([k, v]) => html`<option value="${k}" ${a.stato === k ? raw('selected') : ''}>${v}</option>`)}</select></label>
                <label>Priorità <select name="priorita"><option value="">—</option>${Object.entries(PRIORITA).map(([k, v]) => html`<option value="${k}" ${a.priorita === k ? raw('selected') : ''}>${v}</option>`)}</select></label>
                ${campo('responsabile', 'Responsabile', raw('class="maiuscolo"'))}
              </div>
              <div class="riga-campi">${campo('telefono', 'Telefono')}${campo('altri_telefoni', 'Altri telefoni')}</div>
              <div class="riga-campi">${campo('email', 'Email')}${campo('altre_email', 'Altre email')}</div>
              ${campo('sito', 'Sito')}
              ${campo('indirizzo', 'Indirizzo')}
              <div class="riga-campi"><label class="stretto">CAP <input name="cap" value="${a.cap ?? ''}"></label>${campo('citta', 'Città')}
                <label class="stretto">Prov. <input name="provincia" value="${a.provincia ?? ''}" maxlength="2" class="maiuscolo"></label></div>
              <div class="riga-campi">${campo('regione', 'Regione')}${campo('paese', 'Paese')}</div>
              <div class="riga-campi">${campo('partita_iva', 'Partita IVA', raw('class="maiuscolo"'))}${campo('settore', 'Settore')}</div>
              ${campo('descrizione', 'Cosa fa')}
              ${campo('altri_nomi', 'Altri nomi (per la ricerca)', raw('class="maiuscolo"'))}
              <label>Note <textarea name="note" rows="3">${a.note ?? ''}</textarea></label>
              <label>Cliente in anagrafica <select name="cliente_id"><option value="">— non è un cliente in anagrafica —</option>
                ${clientiLiberi.map(c => html`<option value="${c.id}" ${c.id === a.cliente_id ? raw('selected') : ''}>${c.ragione_sociale}</option>`)}</select>
                <small>Quando diventa cliente: prima aggiungilo in Anagrafiche → Clienti, poi collegalo qui.</small></label>
              <p class="nota">Le scritte si salvano sempre nello stesso formato: nome, provincia, P.IVA e responsabile in MAIUSCOLO; città, indirizzo e nomi
                delle persone con l'Iniziale maiuscola; settore e descrizione con solo la prima lettera maiuscola; email e sito in minuscolo. Le note restano come le scrivi.</p>
              <div><button class="primario">Salva i dati</button></div>
            </form>
            ${a.cliente_id
              ? html`<p class="nota">È un cliente in anagrafica: non si elimina dal CRM (ci tornerebbe da solo). Per toglierlo, prima eliminalo da Anagrafiche → Clienti.</p>`
              : html`<form method="post" action="/crm/${id}/elimina" class="elimina-azienda"
                  data-conferma="${`Eliminare ${a.ragione_sociale} dal CRM, con ${contatti.length} referenti e ${attivita.length} attività? Non si può annullare.`}">
                  <button class="pericolo">Elimina azienda</button></form>`}
          </details>
        </section>
      </div>`, msg(req)));
  });

  // registra l'attività fatta, la prossima azione con la data e (se scelto) il nuovo stato
  r.post('/:id/attivita', async (req, res) => {
    const id = Number(req.params.id);
    const giorno = dataValida(req.body.data) ?? oggiRoma();
    const tipo = String(req.body.tipo) in TIPI_ATTIVITA ? String(req.body.tipo) : 'nota';
    const descrizione = formatta('descrizione_attivita', req.body.descrizione);
    if (!descrizione) return res.redirect(conCampo(`/crm/${id}?msg=${encodeURIComponent('Scrivi cosa è stato fatto.')}`, 'descrizione'));
    const stato = statoDa(req.body.stato);
    await transazione(async c => {
      await c.query(`INSERT INTO crm_attivita (azienda_id, data, tipo, referente, descrizione, utente_id) VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, giorno, tipo, formatta('referente', req.body.referente), descrizione, req.session.utente!.id]);
      await c.query(`UPDATE crm_aziende SET prossima_azione = $2, data_prossima_azione = $3, stato = coalesce($4, stato),
          ultimo_contatto = CASE WHEN $5 = 'nota' THEN ultimo_contatto ELSE greatest(ultimo_contatto, $6::date) END,
          da_verificare = NULL, aggiornato_il = now()
        WHERE id = $1`, [id, formatta('prossima_azione', req.body.prossima_azione), dataValida(req.body.data_prossima_azione), stato, tipo, giorno]);
    });
    res.redirect(`/crm/${id}?msg=${encodeURIComponent('Attività registrata.')}`);
  });

  r.post('/attivita/:id/elimina', async (req, res) => {
    const t = await q1(`DELETE FROM crm_attivita WHERE id = $1 RETURNING azienda_id`, [Number(req.params.id)]);
    if (!t) return res.redirect('/crm');
    await q(`UPDATE crm_aziende SET ultimo_contatto = (SELECT max(data) FROM crm_attivita WHERE azienda_id = $1 AND tipo <> 'nota') WHERE id = $1`, [t.azienda_id]);
    res.redirect(`/crm/${t.azienda_id}?msg=${encodeURIComponent('Attività eliminata.')}`);
  });

  // azienda inserita per errore (doppione, nome sbagliato): via con referenti e attività. I clienti in anagrafica no: tornerebbero da soli.
  r.post('/:id/elimina', async (req, res) => {
    const id = Number(req.params.id);
    const a = await q1(`SELECT ragione_sociale, cliente_id FROM crm_aziende WHERE id = $1`, [id]);
    if (!a) return res.redirect('/crm');
    if (a.cliente_id) return res.redirect(`/crm/${id}?msg=${encodeURIComponent('È un cliente in anagrafica: per toglierlo dal CRM eliminalo prima da Anagrafiche → Clienti.')}`);
    await q(`DELETE FROM crm_aziende WHERE id = $1`, [id]);
    res.redirect(`/crm?msg=${encodeURIComponent(`${a.ragione_sociale} eliminata dal CRM.`)}`);
  });

  r.post('/:id/verifica', async (req, res) => {
    const id = Number(req.params.id);
    const scarta = req.body.esito === 'scarta';
    await q(`UPDATE crm_aziende SET da_verificare = NULL, stato = CASE WHEN $2 THEN 'scartato' ELSE stato END, aggiornato_il = now() WHERE id = $1`, [id, scarta]);
    const torna = String(req.get('referer') ?? '').includes('/crm/verificare') ? '/crm/verificare' : `/crm/${id}`;
    res.redirect(`${torna}?msg=${encodeURIComponent(scarta ? 'Azienda scartata.' : 'Azienda confermata: ora è nel CRM.')}`);
  });

  r.post('/:id/dati', async (req, res) => {
    const id = Number(req.params.id);
    const b = req.body;
    const clienteId = Number(b.cliente_id) > 0 ? Number(b.cliente_id) : null;
    if (clienteId && await q1(`SELECT 1 FROM crm_aziende WHERE cliente_id = $1 AND id <> $2`, [clienteId, id]))
      return res.redirect(`/crm/${id}?msg=${encodeURIComponent('Quel cliente è già collegato a un\'altra azienda del CRM.')}`);
    const prima = await q1(`SELECT cliente_id FROM crm_aziende WHERE id = $1`, [id]);
    if (!prima) return res.redirect('/crm');
    // collegata adesso a un cliente dell'anagrafica: diventa Cliente
    const stato = clienteId && clienteId !== prima.cliente_id ? 'cliente' : statoDa(b.stato) ?? 'da_contattare';
    await q(`UPDATE crm_aziende SET ragione_sociale = coalesce(nullif($2, ''), ragione_sociale), stato = $3, priorita = $4, responsabile = $5,
        telefono = $6, altri_telefoni = $7, email = $8, altre_email = $9, sito = $10, indirizzo = $11, cap = $12, citta = $13, provincia = $14,
        regione = $15, paese = $16, partita_iva = $17, settore = $18, descrizione = $19, altri_nomi = $20, note = $21, cliente_id = $22,
        aggiornato_il = now()
      WHERE id = $1`, [id, formatta('ragione_sociale', b.ragione_sociale) ?? '', stato,
      String(b.priorita) in PRIORITA ? b.priorita : null,
      ...['responsabile', 'telefono', 'altri_telefoni', 'email', 'altre_email', 'sito', 'indirizzo', 'cap', 'citta', 'provincia', 'regione', 'paese',
        'partita_iva', 'settore', 'descrizione', 'altri_nomi', 'note'].map(k => formatta(k, b[k])), clienteId]);
    res.redirect(`/crm/${id}?msg=${encodeURIComponent('Dati salvati.')}`);
  });

  r.post('/:id/contatti', async (req, res) => {
    const id = Number(req.params.id), b = req.body;
    if (formatta('nome', b.nome)) await q(`INSERT INTO crm_contatti (azienda_id, nome, ruolo, telefono, email, note) VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, ...['nome', 'ruolo', 'telefono', 'email', 'note'].map(k => formatta(k, b[k]))]);
    res.redirect(`/crm/${id}?msg=${encodeURIComponent('Referente aggiunto.')}`);
  });

  r.post('/contatti/:id', async (req, res) => {
    const b = req.body, kid = Number(req.params.id);
    const k = b.elimina === '1'
      ? await q1(`DELETE FROM crm_contatti WHERE id = $1 RETURNING azienda_id`, [kid])
      : await q1(`UPDATE crm_contatti SET nome = coalesce($2, nome), ruolo = $3, telefono = $4, email = $5, note = $6 WHERE id = $1 RETURNING azienda_id`,
        [kid, ...['nome', 'ruolo', 'telefono', 'email', 'note'].map(k => formatta(k, b[k]))]);
    if (!k) return res.redirect('/crm');
    res.redirect(`/crm/${k.azienda_id}?msg=${encodeURIComponent(b.elimina === '1' ? 'Referente eliminato.' : 'Referente salvato.')}`);
  });

  return r;
}

/** Etichetta "Già cliente" con la fascia del fatturato medio annuo. */
function giaCliente(f: FatturatoCliente | undefined) {
  return html` <span class="etichetta cliente" title="${f ? `fatturato medio annuo ${f.fascia}` : 'cliente in anagrafica'}">già cliente${f && f.media > 0 ? ` · ${f.fascia}` : ''}</span>`;
}

/** "Possibile doppione di AZ00004" → i codici diventano link alla scheda di quell'azienda. */
function collegaCodici(motivo: string | null): Raw {
  return html`${String(motivo ?? '').split(/(AZ\d{5})/).map((p, i) => (i % 2 ? html`<a href="/crm/codice/${p}">${p}</a>` : p))}`;
}
