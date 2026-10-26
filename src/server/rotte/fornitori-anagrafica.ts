/**
 * Impostazioni → Fornitori: anagrafica dei fornitori (solo ufficio).
 * Regole di Adriano (26/10/2026): solo con P.IVA valida, niente doppioni, tutto in MAIUSCOLO (email e PEC in minuscolo).
 */
import express, { Router, type Request } from 'express';
import { gunzipSync } from 'node:zlib';
import { q, q1 } from '../db.js';
import { layout } from '../views/layout.js';
import { html, raw, type Raw } from '../views/html.js';
import { preparaFornitore, CAMPI_FORNITORE, type CampoFornitore } from '../../engine/anagrafica-fornitori.js';
import { caricaFornitori, salvaFornitore } from '../anagrafica-fornitori-servizio.js';

const ETICHETTE: Record<CampoFornitore, string> = {
  ragione_sociale: 'Ragione sociale', partita_iva: 'Partita IVA', codice_fiscale: 'Codice fiscale', indirizzo: 'Indirizzo', cap: 'CAP',
  comune: 'Comune', provincia: 'Provincia', paese: 'Paese', email: 'Email', pec: 'PEC', telefono: 'Telefono', referente: 'Referente',
  iban: 'IBAN', codice_sdi: 'Codice SDI', note: 'Note',
};

export function rotteFornitoriAnagrafica(menu: (t: string) => Raw) {
  const r = Router();
  const pag = (req: Request, contenuto: Raw, avviso?: string) =>
    String(layout({ titolo: 'Fornitori', utente: req.session.utente, attiva: 'impostazioni', contenuto: html`${menu('Fornitori')}${contenuto}`, avviso, script: 'fornitori.js' }));
  const torna = (msg: string, dove = '') => `/impostazioni/fornitori${dove}?msg=${encodeURIComponent(msg)}`;

  const modulo = (f: Partial<Record<CampoFornitore, string | null>>, azione: string, pulsante: string) => html`
    <form method="post" action="${azione}" class="blocco stretto-form">
      ${CAMPI_FORNITORE.map(c => html`<label>${ETICHETTE[c]}
        ${c === 'note' ? html`<textarea name="note" class="maiuscolo" rows="3">${f.note ?? ''}</textarea>`
          : html`<input name="${c}" value="${f[c] ?? (c === 'paese' ? 'ITALIA' : '')}" class="${c === 'email' || c === 'pec' ? '' : 'maiuscolo'}"
              ${c === 'ragione_sociale' || c === 'partita_iva' ? raw('required') : ''}>`}</label>`)}
      <button class="primario">${pulsante}</button>
    </form>`;

  r.get('/', async (req, res) => {
    const cerca = String(req.query.q ?? '').trim();
    const righe = await q(`SELECT id, ragione_sociale, partita_iva, comune, provincia, paese, email, telefono, note FROM fornitori_anagrafica
      WHERE $1 = '' OR ragione_sociale ILIKE '%' || $1 || '%' OR partita_iva ILIKE '%' || $1 || '%' OR comune ILIKE '%' || $1 || '%'
      ORDER BY ragione_sociale`, [cerca]);
    res.send(pag(req, html`
      <p class="nota">Solo fornitori con partita IVA valida, senza doppioni (una P.IVA = un fornitore). Tutto in MAIUSCOLO, email e PEC in minuscolo.</p>
      <details class="blocco">
        <summary>Carica l'elenco (file preparato da Claude)</summary>
        <div class="stretto-form" style="padding: 0 1rem 1rem">
          <p class="nota">Aggiunge i fornitori nuovi e aggiorna quelli con la stessa P.IVA. Non toglie niente. Prima mostra un riepilogo e chiede conferma.</p>
          <label>File <input type="file" id="file-fornitori" accept=".gz,.json"></label>
          <button class="primario" type="button" id="carica-fornitori">Controlla il file</button>
          <output id="esito-fornitori"></output>
          <button class="primario" type="button" id="conferma-fornitori" hidden>Conferma e carica</button>
        </div>
      </details>
      <p><a href="/impostazioni/fornitori/nuovo" class="bottone">+ Nuovo fornitore</a></p>
      <form class="cerca" method="get"><input name="q" type="search" value="${cerca}" placeholder="Cerca nome, P.IVA o comune…"><button>Cerca</button></form>
      <h2>Fornitori <span class="nota">(${righe.length})</span></h2>
      <div class="tabella-scorre limitata"><table class="elenco">
        <thead><tr><th>Ragione sociale</th><th>Partita IVA</th><th>Comune</th><th>Paese</th><th>Email</th><th>Telefono</th><th>Note</th></tr></thead>
        <tbody>${righe.map(f => html`<tr class="cliccabile" data-href="/impostazioni/fornitori/${f.id}">
          <td><a href="/impostazioni/fornitori/${f.id}">${f.ragione_sociale}</a></td><td>${f.partita_iva}</td>
          <td>${f.comune ?? ''}${f.provincia ? ` (${f.provincia})` : ''}</td><td>${f.paese ?? ''}</td><td>${f.email ?? ''}</td><td>${f.telefono ?? ''}</td><td>${f.note ?? ''}</td></tr>`)}
        </tbody></table></div>`, req.query.msg ? String(req.query.msg) : undefined));
  });

  r.post('/carica', express.raw({ type: '*/*', limit: '20mb' }), async (req, res) => {
    let righe: unknown[];
    try {
      let b = req.body as Buffer;
      if (b[0] === 0x1f && b[1] === 0x8b) b = gunzipSync(b);
      righe = JSON.parse(b.toString('utf8')).fornitori;
      if (!Array.isArray(righe)) throw new Error();
    } catch { return res.status(400).json({ errore: 'File non valido: serve fornitori_casteltech.json.gz' }); }
    res.json(await caricaFornitori(righe, { anteprima: req.query.conferma !== '1' }));
  });

  r.get('/nuovo', (req, res) => res.send(pag(req, html`<h2>Nuovo fornitore</h2>${modulo({}, '/impostazioni/fornitori/nuovo', 'Aggiungi')}`,
    req.query.msg ? String(req.query.msg) : undefined)));

  const doppione = (piva: string, escludi = 0) => q1(`SELECT ragione_sociale FROM fornitori_anagrafica WHERE partita_iva = $1 AND id <> $2`, [piva, escludi]);

  r.post('/nuovo', async (req, res) => {
    const { fornitore: f, errore } = preparaFornitore(req.body);
    if (errore) return res.send(pag(req, html`<h2>Nuovo fornitore</h2>${modulo(f, '/impostazioni/fornitori/nuovo', 'Aggiungi')}`, errore));
    const d = await doppione(f.partita_iva!);
    if (d) return res.send(pag(req, html`<h2>Nuovo fornitore</h2>${modulo(f, '/impostazioni/fornitori/nuovo', 'Aggiungi')}`, `La P.IVA ${f.partita_iva} è già di ${d.ragione_sociale}.`));
    const n = await q1(`INSERT INTO fornitori_anagrafica (${CAMPI_FORNITORE.join(', ')}) VALUES (${CAMPI_FORNITORE.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
      CAMPI_FORNITORE.map(k => f[k]));
    res.redirect(torna(`${f.ragione_sociale} aggiunto.`, `/${n!.id}`));
  });

  const scheda = (req: Request, id: number, f: Record<string, any>, avviso?: string) => pag(req, html`
    <p><a href="/impostazioni/fornitori">← Tutti i fornitori</a></p>
    <h2>${f.ragione_sociale}</h2>
    ${modulo(f, `/impostazioni/fornitori/${id}`, 'Salva')}
    <form method="post" action="/impostazioni/fornitori/${id}/elimina" data-conferma="${`Eliminare il fornitore ${f.ragione_sociale} dall'anagrafica?`}">
      <button class="link negativo">Elimina</button></form>`, avviso);

  r.get('/:id', async (req, res) => {
    const id = Number(req.params.id);
    const f = await q1(`SELECT * FROM fornitori_anagrafica WHERE id = $1`, [id]);
    if (!f) return res.redirect(torna('Fornitore non trovato.'));
    res.send(scheda(req, id, f, req.query.msg ? String(req.query.msg) : undefined));
  });

  r.post('/:id', async (req, res) => {
    const id = Number(req.params.id);
    const { fornitore: f, errore } = preparaFornitore(req.body);
    if (errore) return res.send(scheda(req, id, f, errore));
    const d = await doppione(f.partita_iva!, id);
    if (d) return res.send(scheda(req, id, f, `La P.IVA ${f.partita_iva} è già di ${d.ragione_sociale}.`));
    await salvaFornitore({ query: q }, id, f);
    res.redirect(torna(`${f.ragione_sociale} salvato.`, `/${id}`));
  });

  // Elimina: i fornitori per ora non sono collegati ad altro (ordini a fornitore, acquisti), quindi si possono sempre togliere
  r.post('/:id/elimina', async (req, res) => {
    const f = await q1(`DELETE FROM fornitori_anagrafica WHERE id = $1 RETURNING ragione_sociale`, [Number(req.params.id)]);
    res.redirect(torna(f ? `${f.ragione_sociale} eliminato.` : 'Fornitore non trovato.'));
  });

  return r;
}
