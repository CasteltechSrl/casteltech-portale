/**
 * Banca (Adriano 7/11/2026): Amministrazione → Banca. Carica l'estratto conto (CBI o Excel/CSV dell'home banking BPER), abbina i movimenti
 * alle rate delle fatture emesse e ricevute, mette in categoria gli altri; RiBa e anticipo fatture = file CBI da caricare nell'home banking.
 * Regole in `engine/banca.ts`, letture e scritture in `banca-servizio.ts`. Montate su /amministrazione/banca.
 */
import express, { Router, type Request } from 'express';
import { q } from '../db.js';
import { layout } from '../views/layout.js';
import { html, data, euro, raw, type Raw } from '../views/html.js';
import { menuAmministrazione } from './cruscotto-amministrazione.js';
import { excelSemplice, inviaExcel, nomeExcel } from '../excel.js';
import { CATEGORIE_MOVIMENTO, SOGLIA_SICURA, abiCabDaIban, controlliEffetto, type RataAperta } from '../../engine/banca.js';
import { abbinaMovimento, annullaDistinta, annullaMovimento, caricaMovimenti, codiceSia, creaDistinta, distinte, effettoDa, eliminaMovimento,
  leggiEstrattoConto, movimentiDaAbbinare, movimento, rateAperte, rateDaAnticipare, registraMovimento, salvaCodiceSia } from '../banca-servizio.js';

const oggiRoma = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
const pagina = (req: Request, titolo: string, contenuto: Raw, avviso?: string, script?: string[]) =>
  String(layout({ titolo, utente: req.session.utente, attiva: 'amministrazione', contenuto, avviso, script, largo: true }));
const msg = (req: Request) => (req.query.msg ? String(req.query.msg) : undefined);
const vaiA = (percorso: string, testo: string) => `/amministrazione/banca${percorso}${percorso.includes('?') ? '&' : '?'}msg=${encodeURIComponent(testo)}`;
const elenco = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v == null || v === '' ? [] : [String(v)]);
const utente = (req: Request) => req.session.utente?.nome ?? 'ufficio';
const importoClasse = (n: number) => (n < 0 ? 'num negativo' : 'num');

function tasti(attiva: 'movimenti' | 'anticipi'): Raw {
  const voci = [['movimenti', '/amministrazione/banca', 'Movimenti e abbinamenti'], ['anticipi', '/amministrazione/banca/anticipi', 'RiBa e anticipo fatture']] as const;
  return html`<nav class="tasti-sezione secondari">${voci.map(([k, href, nome]) => html`<a href="${href}" class="${k === attiva ? 'attivo' : ''}">${nome}</a>`)}</nav>`;
}

const scritturaRate = (rate: RataAperta[]) => rate.map(r => `${r.tipo}:${r.id}`).join(',');
const testoRata = (r: RataAperta) => html`<a href="${r.tipo === 'emessa' ? `/amministrazione/documenti/${r.documentoId}` : `/amministrazione/ricevuti/${r.documentoId}`}">
  ${r.tipo === 'emessa' ? 'Fatt.' : 'Fatt. forn.'} ${r.numero || 's.n.'}</a> del ${data(r.dataDoc)} · ${r.controparte} · scad. ${data(r.scadenza)} · ${euro(r.importo)}`;

export function rotteBanca() {
  const r = Router();

  // ───────────── movimenti ─────────────
  r.get('/', async (req, res) => {
    const [daAbbinare, fatti, conti] = await Promise.all([
      movimentiDaAbbinare(),
      q<any>(`SELECT id, conto, to_char(data, 'YYYY-MM-DD') AS data, importo::float AS importo, descrizione, stato, categoria, rate, confermato_da
        FROM banca_movimenti WHERE stato <> 'da_abbinare' ORDER BY data DESC, id DESC LIMIT 200`),
      q<{ conto: string; quanti: number; dal: string; al: string }>(`SELECT conto, count(*)::int AS quanti, to_char(min(data), 'YYYY-MM-DD') AS dal, to_char(max(data), 'YYYY-MM-DD') AS al
        FROM banca_movimenti GROUP BY conto ORDER BY conto`),
    ]);
    const sicuri = daAbbinare.filter(x => (x.proposta?.punteggio ?? 0) >= SOGLIA_SICURA).length;
    res.send(pagina(req, 'Banca', html`
      <div class="intestazione-pagina"><h1>Banca</h1></div>
      ${menuAmministrazione('banca')}${tasti('movimenti')}
      <details class="blocco" ${conti.length ? '' : raw('open')}><summary><strong>Carica l'estratto conto</strong>
        ${conti.map(c => html` · ${c.conto}: ${c.quanti} movimenti dal ${data(c.dal)} al ${data(c.al)}`)}</summary>
        <p class="nota">Da BPER Banking Business scarica i movimenti del conto in formato <strong>CBI</strong> (consigliato) oppure Excel (.xlsx) o CSV, e caricali qui.
          Puoi ricaricare anche un periodo che si sovrappone: i movimenti già caricati non si ripetono.</p>
        <div class="riga-campi">
          <label class="stretto">Conto <input id="conto-banca" value="BPER" class="maiuscolo"></label>
          <label class="largo">File <input type="file" id="file-acquisizioni" multiple accept=".txt,.cbi,.csv,.xlsx,.dat"></label>
        </div>
        <div class="barra-azioni"><button type="button" class="primario" id="avvia-acquisizioni" data-url="/amministrazione/banca/carica">Carica</button>
          <span id="esito-acquisizioni" class="nota"></span></div>
      </details>

      <h2>Da abbinare (${daAbbinare.length})</h2>
      ${daAbbinare.length ? html`
        <p class="nota">Entrate → fatture emesse da incassare, uscite → fatture dei fornitori da pagare. Il portale cerca lo stesso importo, poi il numero della fattura
          e il nome nella descrizione; più fatture dello stesso cliente o una distinta RiBa intera. Le proposte sicure (${sicuri}) sono già spuntate: controlla e premi
          <strong>Conferma</strong>. Le fatture diventano incassate o pagate alla data del movimento. Senza fattura: scegli la categoria e spunta.</p>
        <form method="post" action="/amministrazione/banca/conferma">
          <div class="barra-azioni"><button class="primario">Conferma le righe spuntate</button></div>
          <div class="tabella-scorre limitata"><table class="elenco">
            <thead><tr><th data-non-ordinare></th><th>Data</th><th class="num">Importo</th><th>Descrizione</th><th>Proposta</th><th></th></tr></thead>
            <tbody>${daAbbinare.map(({ m, proposta, categoria }) => html`<tr class="${proposta && proposta.punteggio >= SOGLIA_SICURA ? '' : 'da-controllare'}">
              <td><input type="checkbox" name="ok" value="${m.id}" ${proposta && proposta.punteggio >= SOGLIA_SICURA ? raw('checked') : ''}></td>
              <td>${data(m.data)}</td><td class="${importoClasse(m.importo)}">${euro(m.importo)}</td>
              <td><span class="nota taglia" title="${m.descrizione}">${m.descrizione}</span></td>
              <td>${proposta ? html`<input type="hidden" name="rate_${m.id}" value="${scritturaRate(proposta.rate)}">
                  ${proposta.rate.map(x => html`<div>${testoRata(x)}</div>`)}<div class="nota">${proposta.motivo}</div>`
                : html`<select name="cat_${m.id}">${CATEGORIE_MOVIMENTO.filter(c => c !== 'Incasso fattura' && c !== 'Pagamento fattura')
                    .map(c => html`<option ${c === categoria ? raw('selected') : ''}>${c}</option>`)}</select>`}</td>
              <td><a href="/amministrazione/banca/movimento/${m.id}">a mano</a></td></tr>`)}</tbody></table></div>
        </form>` : html`<p class="vuoto">Nessun movimento da abbinare.</p>`}

      <h2>Già abbinati e registrati</h2>
      ${fatti.length ? html`<div class="tabella-scorre limitata"><table class="elenco">
        <thead><tr><th>Data</th><th class="num">Importo</th><th>Descrizione</th><th>Categoria</th><th>Fatture</th><th>Da</th><th></th></tr></thead>
        <tbody>${fatti.map(m => html`<tr><td>${data(m.data)}</td><td class="${importoClasse(m.importo)}">${euro(m.importo)}</td>
          <td><span class="nota taglia" title="${m.descrizione}">${m.descrizione}</span></td><td>${m.categoria ?? ''}</td><td>${(m.rate ?? []).length || ''}</td>
          <td>${m.confermato_da ?? ''}</td>
          <td><form method="post" action="/amministrazione/banca/movimento/${m.id}/annulla" class="inline"
            data-conferma="${m.stato === 'abbinato' ? 'Le fatture abbinate tornano da incassare/pagare. Continuare?' : 'Il movimento torna da abbinare. Continuare?'}"><button>Annulla</button></form></td></tr>`)}</tbody></table></div>`
        : html`<p class="vuoto">Ancora nulla.</p>`}`, msg(req), ['acquisizioni.js']));
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

  r.post('/conferma', async (req, res) => {
    const ids = elenco(req.body?.ok).map(Number).filter(Number.isInteger);
    let abbinati = 0, registrati = 0;
    const errori: string[] = [];
    for (const id of ids) {
      const rate = String(req.body?.[`rate_${id}`] ?? '');
      if (rate) {
        const scelte = rate.split(',').map(x => { const [tipo, n] = x.split(':'); return { tipo: tipo as 'emessa' | 'ricevuta', id: Number(n) }; });
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
          <label>Categoria <select name="categoria">${CATEGORIE_MOVIMENTO.filter(c => c !== 'Incasso fattura' && c !== 'Pagamento fattura').map(c => html`<option>${c}</option>`)}</select></label>
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
