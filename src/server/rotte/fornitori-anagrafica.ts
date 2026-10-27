/**
 * Anagrafiche → Fornitori: anagrafica dei fornitori (solo ufficio).
 * Regole di Adriano (26/10/2026): solo con P.IVA valida, niente doppioni, tutto in MAIUSCOLO (email e PEC in minuscolo).
 */
import express, { Router, type Request } from 'express';
import { gunzipSync } from 'node:zlib';
import { q, q1 } from '../db.js';
import { html, raw, type Raw } from '../views/html.js';
import type { PaginaAnagrafiche } from './anagrafiche.js';
import { preparaFornitore, CAMPI_FORNITORE, type CampoFornitore } from '../../engine/anagrafica-fornitori.js';
import { caricaFornitori, salvaFornitore } from '../anagrafica-fornitori-servizio.js';

const ETICHETTE: Record<CampoFornitore, string> = {
  ragione_sociale: 'Ragione sociale', partita_iva: 'Partita IVA', codice_fiscale: 'Codice fiscale', indirizzo: 'Indirizzo', cap: 'CAP',
  comune: 'Comune', provincia: 'Provincia', paese: 'Paese', email: 'Email', pec: 'PEC', telefono: 'Telefono', referente: 'Referente',
  iban: 'IBAN', codice_sdi: 'Codice SDI', note: 'Note',
};

export function rotteFornitoriAnagrafica(pagina: PaginaAnagrafiche) {
  const r = Router();
  const pag = (req: Request, contenuto: Raw, avviso?: string) => pagina(req, 'fornitori', contenuto, avviso, 'fornitori.js');
  const torna = (msg: string, dove = '') => `/anagrafiche/fornitori${dove}?msg=${encodeURIComponent(msg)}`;

  const modulo = (f: Partial<Record<CampoFornitore, string | null>>, azione: string, pulsante: string) => html`
    <form method="post" action="${azione}" class="blocco stretto-form">
      ${CAMPI_FORNITORE.map(c => html`<label>${ETICHETTE[c]}
        ${c === 'note' ? html`<textarea name="note" class="maiuscolo" rows="3">${f.note ?? ''}</textarea>`
          : html`<input name="${c}" value="${f[c] ?? (c === 'paese' ? 'ITALIA' : '')}" class="${c === 'email' || c === 'pec' ? '' : 'maiuscolo'}"
              ${c === 'ragione_sociale' || c === 'partita_iva' ? raw('required') : ''}>`}</label>`)}
      <button class="primario">${pulsante}</button>
    </form>`;

  r.get('/', async (req, res) => {
    const righe = await q(`SELECT id, ragione_sociale, partita_iva, comune, provincia, paese, email, telefono, note FROM fornitori_anagrafica ORDER BY ragione_sociale`);
    res.send(await pag(req, html`
      <div class="intestazione-pagina"><p class="nota">Solo fornitori con partita IVA valida, senza doppioni (una P.IVA = un fornitore). Tutto in MAIUSCOLO, email e PEC in minuscolo.</p>
        <a href="/anagrafiche/fornitori/nuovo" class="bottone primario">+ Nuovo fornitore</a></div>
      <div class="ricerca-veloce"><input type="search" data-filtra="tab-fornitori" data-conta="conta-fornitori" placeholder="Cerca nome, P.IVA, comune, email, telefono…" autofocus autocomplete="off">
        <span class="nota">Trovati: <b id="conta-fornitori">${righe.length}</b></span></div>
      <div class="tabella-scorre limitata"><table class="elenco" id="tab-fornitori">
        <thead><tr><th>Ragione sociale</th><th>Partita IVA</th><th>Comune</th><th>Paese</th><th>Email</th><th>Telefono</th><th>Note</th></tr></thead>
        <tbody>${righe.map(f => html`<tr class="cliccabile" data-href="/anagrafiche/fornitori/${f.id}">
          <td><a href="/anagrafiche/fornitori/${f.id}">${f.ragione_sociale}</a></td><td>${f.partita_iva}</td>
          <td>${f.comune ?? ''}${f.provincia ? ` (${f.provincia})` : ''}</td><td>${f.paese ?? ''}</td><td>${f.email ?? ''}</td><td>${f.telefono ?? ''}</td><td>${f.note ?? ''}</td></tr>`)}
        </tbody></table></div>
      <details class="blocco">
        <summary>Carica l'elenco (file preparato da Claude)</summary>
        <div class="stretto-form dentro-blocco">
          <p class="nota">Aggiunge i fornitori nuovi e aggiorna quelli con la stessa P.IVA. Non toglie niente. Prima mostra un riepilogo e chiede conferma.</p>
          <label>File <input type="file" id="file-fornitori" accept=".gz,.json"></label>
          <button class="primario" type="button" id="carica-fornitori">Controlla il file</button>
          <output id="esito-fornitori"></output>
          <button class="primario" type="button" id="conferma-fornitori" hidden>Conferma e carica</button>
        </div>
      </details>`, req.query.msg ? String(req.query.msg) : undefined));
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

  r.get('/nuovo', async (req, res) => res.send(await pag(req, html`<h2>Nuovo fornitore</h2>${modulo({}, '/anagrafiche/fornitori/nuovo', 'Aggiungi')}`,
    req.query.msg ? String(req.query.msg) : undefined)));

  const doppione = (piva: string, escludi = 0) => q1(`SELECT ragione_sociale FROM fornitori_anagrafica WHERE partita_iva = $1 AND id <> $2`, [piva, escludi]);

  r.post('/nuovo', async (req, res) => {
    const { fornitore: f, errore } = preparaFornitore(req.body);
    if (errore) return res.send(await pag(req, html`<h2>Nuovo fornitore</h2>${modulo(f, '/anagrafiche/fornitori/nuovo', 'Aggiungi')}`, errore));
    const d = await doppione(f.partita_iva!);
    if (d) return res.send(await pag(req, html`<h2>Nuovo fornitore</h2>${modulo(f, '/anagrafiche/fornitori/nuovo', 'Aggiungi')}`, `La P.IVA ${f.partita_iva} è già di ${d.ragione_sociale}.`));
    const n = await q1(`INSERT INTO fornitori_anagrafica (${CAMPI_FORNITORE.join(', ')}) VALUES (${CAMPI_FORNITORE.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
      CAMPI_FORNITORE.map(k => f[k]));
    res.redirect(torna(`${f.ragione_sociale} aggiunto.`, `/${n!.id}`));
  });

  const scheda = (req: Request, id: number, f: Record<string, any>, avviso?: string) => pag(req, html`
    <p><a href="/anagrafiche/fornitori">← Tutti i fornitori</a></p>
    <h2>${f.ragione_sociale}</h2>
    ${modulo(f, `/anagrafiche/fornitori/${id}`, 'Salva')}
    <form method="post" action="/anagrafiche/fornitori/${id}/elimina" data-conferma="${`Eliminare il fornitore ${f.ragione_sociale} dall'anagrafica?`}">
      <button class="link negativo">Elimina</button></form>`, avviso);

  r.get('/:id', async (req, res) => {
    const id = Number(req.params.id);
    const f = await q1(`SELECT * FROM fornitori_anagrafica WHERE id = $1`, [id]);
    if (!f) return res.redirect(torna('Fornitore non trovato.'));
    res.send(await scheda(req, id, f, req.query.msg ? String(req.query.msg) : undefined));
  });

  r.post('/:id', async (req, res) => {
    const id = Number(req.params.id);
    const { fornitore: f, errore } = preparaFornitore(req.body);
    if (errore) return res.send(await scheda(req, id, f, errore));
    const d = await doppione(f.partita_iva!, id);
    if (d) return res.send(await scheda(req, id, f, `La P.IVA ${f.partita_iva} è già di ${d.ragione_sociale}.`));
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
