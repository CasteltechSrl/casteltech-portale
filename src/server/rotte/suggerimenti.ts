/**
 * Suggerimenti del team (solo ufficio, Adriano 27/10/2026): idee da sviluppare nel portale più avanti,
 * con chi le ha proposte, l'area, la priorità e lo stato. Non sono collegati ad altro: il tasto Elimina va sempre.
 */
import { Router, type Request } from 'express';
import { q, q1 } from '../db.js';
import { layout } from '../views/layout.js';
import { casella, casellaTutti, conMessaggio, idsSpuntati, moduloAzioni } from '../views/azioni-elenco.js';
import { html, data, raw, type Raw } from '../views/html.js';
import { leggiChiaveClaude, nuovaChiaveClaude } from './api-claude.js';
import {
  AREE_SUGGERIMENTI, PRIORITA_SUGGERIMENTI, STATI_SUGGERIMENTI, chiuso, ordinaSuggerimenti, preparaSuggerimento,
  type Suggerimento,
} from '../../engine/suggerimenti.js';

const oggiRoma = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
const CAMPI = ['titolo', 'descrizione', 'area', 'proposto_da', 'proposto_il', 'priorita', 'stato', 'note'] as const;

const opzioni = (voci: Record<string, string>, scelto: string | undefined) =>
  Object.entries(voci).map(([k, v]) => html`<option value="${k}" ${scelto === k ? raw('selected') : ''}>${v}</option>`);
const statoBadge = (s: string) => html`<span class="stato sugg-${s}">${STATI_SUGGERIMENTI[s as keyof typeof STATI_SUGGERIMENTI] ?? s}</span>`;
const prioritaBadge = (p: string) => html`<span class="etichetta prio-${p}">${PRIORITA_SUGGERIMENTI[p as keyof typeof PRIORITA_SUGGERIMENTI] ?? p}</span>`;

/** Riquadro "Collegamento con Claude": la chiave si vede per intero solo subito dopo averla creata. */
async function riquadroChiaveClaude(appenaCreata: boolean): Promise<Raw> {
  const chiave = await leggiChiaveClaude();
  return html`<details class="blocco" ${appenaCreata ? raw('open') : ''}><summary>Collegamento con Claude (controllo settimanale) ·
      ${chiave ? html`<span class="positivo">attivo</span>` : html`<span class="negativo">da attivare</span>`}</summary>
    <p class="nota">Claude legge i suggerimenti e scrive le risposte attraverso un indirizzo protetto da una chiave.
      Si fa una volta sola: crea la chiave, poi in Claude apri Impostazioni progetto → Ambiente → Segreti di rete → Aggiungi, con host
      <code>casteltech-portale.onrender.com</code> e come valore la chiave (se chiede il tipo: Bearer / intestazione Authorization).
      Creare una chiave nuova disattiva la vecchia.</p>
    ${appenaCreata && chiave ? html`<p><strong>Chiave:</strong> <code class="chiave-intera">${chiave}</code></p>
      <p class="nota">Copiala adesso: per sicurezza poi non si mostra più per intero.</p>` : chiave ? html`<p class="nota">Chiave attiva: …${chiave.slice(-4)}</p>` : ''}
    <form method="post" action="/suggerimenti/chiave-claude" ${chiave ? raw('data-conferma="Creare una chiave nuova? Quella di adesso smette di funzionare."') : ''}>
      <button>${chiave ? 'Crea una chiave nuova' : 'Crea la chiave'}</button></form>
  </details>`;
}

export function rotteSuggerimenti() {
  const r = Router();
  const pagina = (req: Request, titolo: string, contenuto: Raw, avviso?: string) =>
    String(layout({ titolo, utente: req.session.utente, attiva: 'suggerimenti', contenuto, avviso, script: 'elenco.js' }));
  const torna = (msg: string, dove = '') => `/suggerimenti${dove}?msg=${encodeURIComponent(msg)}`;

  const modulo = (s: Partial<Suggerimento>, azione: string, pulsante: string) => html`
    <form method="post" action="${azione}" class="blocco stretto-form">
      <label>Titolo <input name="titolo" value="${s.titolo ?? ''}" required placeholder="In poche parole, es. Avviso Telegram alla fase successiva"></label>
      <label>Descrizione <textarea name="descrizione" rows="5" placeholder="Cosa dovrebbe fare il portale e perché serve">${s.descrizione ?? ''}</textarea></label>
      <div class="riga-campi">
        <label>Proposto da <input name="proposto_da" value="${s.proposto_da ?? ''}" placeholder="Nome"></label>
        <label>Data <input name="proposto_il" type="date" value="${s.proposto_il ?? oggiRoma()}"></label>
      </div>
      <div class="riga-campi">
        <label>Area <select name="area">${opzioni(AREE_SUGGERIMENTI, s.area ?? 'generale')}</select></label>
        <label>Priorità <select name="priorita">${opzioni(PRIORITA_SUGGERIMENTI, s.priorita ?? 'media')}</select></label>
        <label>Stato <select name="stato">${opzioni(STATI_SUGGERIMENTI, s.stato ?? 'da_valutare')}</select></label>
      </div>
      <label>Domanda o risposta per chi l'ha proposto <textarea name="risposta" rows="3"
        placeholder="Es. cosa serve sapere per realizzarlo, oppure com'è stato fatto">${(s as { risposta?: string | null }).risposta ?? ''}</textarea></label>
      <label>Note e risposte di chi l'ha proposto <textarea name="note" rows="3" placeholder="Decisioni prese, cosa manca per partire, risposte alle domande">${s.note ?? ''}</textarea></label>
      <button class="primario">${pulsante}</button>
    </form>`;

  r.get('/', async (req, res) => {
    const chiaveClaude = await riquadroChiaveClaude(req.query.chiave === 'nuova');
    const area = String(req.query.area ?? '');
    const tutti = req.query.tutti === '1';
    const righe = ordinaSuggerimenti(await q(`SELECT id, titolo, descrizione, area, proposto_da, proposto_il, priorita, stato, note, risposta, risposta_da
      FROM suggerimenti WHERE $1 = '' OR area = $1`, [area]));
    const aperti = righe.filter(s => !chiuso(s.stato));
    const chiusi = righe.length - aperti.length;
    const mostrati = tutti ? righe : aperti;
    const azioni = moduloAzioni({
      azione: '/suggerimenti/azioni', nome: { singolare: 'suggerimento', plurale: 'suggerimenti' },
      extra: html`<input type="hidden" name="torna" value="${req.originalUrl}">`,
      pulsanti: [
        { azione: 'fatto', testo: 'Segna fatto', serve: '1+', titolo: 'Stato "Fatto": spariscono dagli aperti (restano in "mostra tutti")' },
        { azione: 'scartato', testo: 'Scarta', serve: '1+', titolo: 'Stato "Scartato": spariscono dagli aperti (restano in "mostra tutti")' },
        { azione: 'elimina', testo: 'Elimina', serve: '1+', pericolo: true, chiedi: 'Eliminare {n} suggeriment{o|i}? Non si può annullare.' },
      ],
    });
    res.send(pagina(req, 'Suggerimenti', html`
      <div class="intestazione-pagina"><h1>Suggerimenti</h1>
        <div class="azioni"><a href="/suggerimenti/nuovo" class="bottone primario">+ Nuovo suggerimento</a></div></div>
      <p class="nota">Le idee del team per migliorare il portale, da sviluppare quando è il momento. Si annotano tutte, poi si decide priorità e stato.
        Una volta alla settimana Claude le legge: realizza quelle valide e, se un'idea non è chiara, scrive una domanda e la mette "Da chiarire"
        (in cima all'elenco). Chi l'ha proposta risponde nelle note del suggerimento.</p>
      ${chiaveClaude}
      <form class="cerca" method="get">
        <select name="area"><option value="">Tutte le aree</option>${opzioni(AREE_SUGGERIMENTI, area)}</select>
        ${tutti ? html`<input type="hidden" name="tutti" value="1">` : ''}
        <button>Filtra</button>
      </form>
      <h2>${tutti ? 'Tutti' : 'Aperti'} <span class="nota">(${mostrati.length})</span></h2>
      ${mostrati.length ? html`${azioni.apri}<div class="tabella-scorre"><table class="elenco">
        <thead><tr>${casellaTutti()}<th>Suggerimento</th><th>Area</th><th>Proposto da</th><th>Data</th><th>Priorità</th><th>Stato</th></tr></thead>
        <tbody>${mostrati.map(s => html`<tr>
          ${casella(s.id, s.titolo)}
          <td><a href="/suggerimenti/${s.id}"><strong>${s.titolo}</strong></a>${s.descrizione ? html`<div class="nota taglia">${s.descrizione}</div>` : ''}
            ${s.risposta && !chiuso(s.stato) ? html`<div class="sugg-risposta taglia">${s.stato === 'da_chiarire' ? 'Domanda' : 'Risposta'}${s.risposta_da ? ` di ${s.risposta_da}` : ''}: ${s.risposta}</div>` : ''}</td>
          <td>${AREE_SUGGERIMENTI[s.area as keyof typeof AREE_SUGGERIMENTI] ?? s.area}</td><td>${s.proposto_da ?? ''}</td>
          <td>${data(s.proposto_il)}</td><td>${prioritaBadge(s.priorita)}</td><td>${statoBadge(s.stato)}</td></tr>`)}
        </tbody></table></div>${azioni.chiudi}` : html`<p class="vuoto">Nessun suggerimento${area ? ' in quest\'area' : ''}.</p>`}
      ${chiusi ? html`<p class="nota">${tutti
        ? html`<a href="/suggerimenti${area ? `?area=${encodeURIComponent(area)}` : ''}">Mostra solo gli aperti</a>`
        : html`Ci sono anche ${chiusi} suggeriment${chiusi === 1 ? 'o fatto o scartato' : 'i fatti o scartati'}: <a href="/suggerimenti?tutti=1${area ? `&area=${encodeURIComponent(area)}` : ''}">mostra tutti</a>.`}</p>` : ''}`,
      req.query.msg ? String(req.query.msg) : undefined));
  });

  // azioni dall'elenco sui suggerimenti spuntati
  r.post('/azioni', async (req, res) => {
    const ids = idsSpuntati(req.body);
    const indietro = /^\/suggerimenti(\?|$)/.test(String(req.body?.torna ?? '')) ? String(req.body.torna) : '/suggerimenti';
    const torna = (msg: string) => res.redirect(conMessaggio(indietro, msg));
    if (!ids.length) return torna('Seleziona almeno un suggerimento.');
    const azione = String(req.body?.azione ?? '');
    if (azione === 'fatto' || azione === 'scartato') {
      const n = (await q(`UPDATE suggerimenti SET stato = $2, aggiornato_il = now() WHERE id = ANY($1) RETURNING id`, [ids, azione])).length;
      return torna(`${n === 1 ? '1 suggerimento segnato' : `${n} suggerimenti segnati`} come ${STATI_SUGGERIMENTI[azione].toLowerCase()}.`);
    }
    if (azione === 'elimina') {
      const n = (await q(`DELETE FROM suggerimenti WHERE id = ANY($1) RETURNING id`, [ids])).length;
      return torna(n === 1 ? 'Suggerimento eliminato.' : `Eliminati ${n} suggerimenti.`);
    }
    torna('Azione non riconosciuta.');
  });

  // chiave per il controllo settimanale di Claude (/api/claude): si crea qui e si copia nelle impostazioni dell'ambiente di Claude
  r.post('/chiave-claude', async (_req, res) => {
    await nuovaChiaveClaude();
    res.redirect('/suggerimenti?chiave=nuova');
  });

  r.get('/nuovo', (req, res) => res.send(pagina(req, 'Nuovo suggerimento', html`
    <p><a href="/suggerimenti">← Tutti i suggerimenti</a></p><h1>Nuovo suggerimento</h1>
    ${modulo({}, '/suggerimenti/nuovo', 'Aggiungi')}`)));

  r.post('/nuovo', async (req, res) => {
    const { suggerimento: s, errore } = preparaSuggerimento(req.body, oggiRoma());
    if (errore) return res.send(pagina(req, 'Nuovo suggerimento', html`<h1>Nuovo suggerimento</h1>${modulo(s, '/suggerimenti/nuovo', 'Aggiungi')}`, errore));
    const risposta = String(req.body.risposta ?? '').trim() || null;
    await q(`INSERT INTO suggerimenti (${CAMPI.join(', ')}, creato_da, risposta, risposta_da, risposta_il)
      VALUES (${CAMPI.map((_, i) => `$${i + 1}`).join(', ')}, $${CAMPI.length + 1}, $${CAMPI.length + 2}, $${CAMPI.length + 3}, $${CAMPI.length + 4})`,
      [...CAMPI.map(k => s[k]), req.session.utente!.id, risposta, risposta ? req.session.utente!.nome : null, risposta ? new Date() : null]);
    res.redirect(torna(`Suggerimento "${s.titolo}" aggiunto.`));
  });

  const scheda = (req: Request, id: number, s: Partial<Suggerimento>, avviso?: string) => pagina(req, s.titolo || 'Suggerimento', html`
    <p><a href="/suggerimenti">← Tutti i suggerimenti</a></p>
    <h1>${s.titolo} ${s.stato ? statoBadge(s.stato) : ''}</h1>
    ${(s as any).risposta ? html`<div class="blocco sugg-risposta-blocco"><strong>${s.stato === 'da_chiarire' ? 'Domanda' : 'Risposta'}${(s as any).risposta_da ? ` di ${(s as any).risposta_da}` : ''}</strong>
      ${(s as any).risposta_il ? html` <span class="nota">(${data((s as any).risposta_il)})</span>` : ''}<p>${(s as any).risposta}</p>
      ${s.stato === 'da_chiarire' ? html`<p class="nota">Rispondi nel campo "Note e risposte" qui sotto e salva: la prossima settimana Claude la rilegge.</p>` : ''}</div>` : ''}
    ${modulo(s, `/suggerimenti/${id}`, 'Salva')}
    <form method="post" action="/suggerimenti/${id}/elimina" data-conferma="${`Eliminare il suggerimento "${s.titolo}"? Non si può annullare.`}">
      <button class="link negativo">Elimina</button></form>`, avviso);

  r.get('/:id', async (req, res) => {
    const id = Number(req.params.id);
    const s = await q1(`SELECT * FROM suggerimenti WHERE id = $1`, [id]);
    if (!s) return res.redirect(torna('Suggerimento non trovato.'));
    res.send(scheda(req, id, s, req.query.msg ? String(req.query.msg) : undefined));
  });

  r.post('/:id', async (req, res) => {
    const id = Number(req.params.id);
    const { suggerimento: s, errore } = preparaSuggerimento(req.body, oggiRoma());
    if (errore) return res.send(scheda(req, id, { ...s, risposta: req.body.risposta } as any, errore));
    const risposta = String(req.body.risposta ?? '').replace(/\r\n/g, '\n').trim() || null;
    const n = CAMPI.length + 2;
    const ok = await q1(`UPDATE suggerimenti SET ${CAMPI.map((k, i) => `${k} = $${i + 2}`).join(', ')},
        risposta_da = CASE WHEN risposta IS DISTINCT FROM $${n} THEN $${n + 1} ELSE risposta_da END,
        risposta_il = CASE WHEN risposta IS DISTINCT FROM $${n} THEN now() ELSE risposta_il END,
        risposta = $${n}, aggiornato_il = now() WHERE id = $1 RETURNING id`,
      [id, ...CAMPI.map(k => s[k]), risposta, req.session.utente!.nome]);
    res.redirect(ok ? torna('Salvato.', `/${id}`) : torna('Suggerimento non trovato.'));
  });

  // Elimina: un suggerimento non è collegato ad altro, si può sempre togliere
  r.post('/:id/elimina', async (req, res) => {
    const s = await q1(`DELETE FROM suggerimenti WHERE id = $1 RETURNING titolo`, [Number(req.params.id)]);
    res.redirect(torna(s ? `Suggerimento "${s.titolo}" eliminato.` : 'Suggerimento non trovato.'));
  });

  return r;
}
