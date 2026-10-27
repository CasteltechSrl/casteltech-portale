/**
 * Suggerimenti del team (solo ufficio, Adriano 27/10/2026): idee da sviluppare nel portale più avanti,
 * con chi le ha proposte, l'area, la priorità e lo stato. Non sono collegati ad altro: il tasto Elimina va sempre.
 */
import { Router, type Request } from 'express';
import { q, q1 } from '../db.js';
import { layout } from '../views/layout.js';
import { html, data, raw, type Raw } from '../views/html.js';
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

export function rotteSuggerimenti() {
  const r = Router();
  const pagina = (req: Request, titolo: string, contenuto: Raw, avviso?: string) =>
    String(layout({ titolo, utente: req.session.utente, attiva: 'suggerimenti', contenuto, avviso }));
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
      <label>Note <textarea name="note" rows="3" placeholder="Decisioni prese, cosa manca per partire">${s.note ?? ''}</textarea></label>
      <button class="primario">${pulsante}</button>
    </form>`;

  r.get('/', async (req, res) => {
    const area = String(req.query.area ?? '');
    const tutti = req.query.tutti === '1';
    const righe = ordinaSuggerimenti(await q(`SELECT id, titolo, descrizione, area, proposto_da, proposto_il, priorita, stato, note
      FROM suggerimenti WHERE $1 = '' OR area = $1`, [area]));
    const aperti = righe.filter(s => !chiuso(s.stato));
    const chiusi = righe.length - aperti.length;
    const mostrati = tutti ? righe : aperti;
    res.send(pagina(req, 'Suggerimenti', html`
      <div class="intestazione-pagina"><h1>Suggerimenti</h1>
        <div class="azioni"><a href="/suggerimenti/nuovo" class="bottone primario">+ Nuovo suggerimento</a></div></div>
      <p class="nota">Le idee del team per migliorare il portale, da sviluppare quando è il momento. Si annotano tutte, poi si decide priorità e stato.</p>
      <form class="cerca" method="get">
        <select name="area"><option value="">Tutte le aree</option>${opzioni(AREE_SUGGERIMENTI, area)}</select>
        ${tutti ? html`<input type="hidden" name="tutti" value="1">` : ''}
        <button>Filtra</button>
      </form>
      <h2>${tutti ? 'Tutti' : 'Aperti'} <span class="nota">(${mostrati.length})</span></h2>
      ${mostrati.length ? html`<div class="tabella-scorre"><table class="elenco">
        <thead><tr><th>Suggerimento</th><th>Area</th><th>Proposto da</th><th>Data</th><th>Priorità</th><th>Stato</th></tr></thead>
        <tbody>${mostrati.map(s => html`<tr>
          <td><a href="/suggerimenti/${s.id}"><strong>${s.titolo}</strong></a>${s.descrizione ? html`<div class="nota taglia">${s.descrizione}</div>` : ''}</td>
          <td>${AREE_SUGGERIMENTI[s.area as keyof typeof AREE_SUGGERIMENTI] ?? s.area}</td><td>${s.proposto_da ?? ''}</td>
          <td>${data(s.proposto_il)}</td><td>${prioritaBadge(s.priorita)}</td><td>${statoBadge(s.stato)}</td></tr>`)}
        </tbody></table></div>` : html`<p class="vuoto">Nessun suggerimento${area ? ' in quest\'area' : ''}.</p>`}
      ${chiusi ? html`<p class="nota">${tutti
        ? html`<a href="/suggerimenti${area ? `?area=${encodeURIComponent(area)}` : ''}">Mostra solo gli aperti</a>`
        : html`Ci sono anche ${chiusi} suggeriment${chiusi === 1 ? 'o fatto o scartato' : 'i fatti o scartati'}: <a href="/suggerimenti?tutti=1${area ? `&area=${encodeURIComponent(area)}` : ''}">mostra tutti</a>.`}</p>` : ''}`,
      req.query.msg ? String(req.query.msg) : undefined));
  });

  r.get('/nuovo', (req, res) => res.send(pagina(req, 'Nuovo suggerimento', html`
    <p><a href="/suggerimenti">← Tutti i suggerimenti</a></p><h1>Nuovo suggerimento</h1>
    ${modulo({}, '/suggerimenti/nuovo', 'Aggiungi')}`)));

  r.post('/nuovo', async (req, res) => {
    const { suggerimento: s, errore } = preparaSuggerimento(req.body, oggiRoma());
    if (errore) return res.send(pagina(req, 'Nuovo suggerimento', html`<h1>Nuovo suggerimento</h1>${modulo(s, '/suggerimenti/nuovo', 'Aggiungi')}`, errore));
    await q(`INSERT INTO suggerimenti (${CAMPI.join(', ')}, creato_da) VALUES (${CAMPI.map((_, i) => `$${i + 1}`).join(', ')}, $${CAMPI.length + 1})`,
      [...CAMPI.map(k => s[k]), req.session.utente!.id]);
    res.redirect(torna(`Suggerimento "${s.titolo}" aggiunto.`));
  });

  const scheda = (req: Request, id: number, s: Partial<Suggerimento>, avviso?: string) => pagina(req, s.titolo || 'Suggerimento', html`
    <p><a href="/suggerimenti">← Tutti i suggerimenti</a></p>
    <h1>${s.titolo}</h1>
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
    if (errore) return res.send(scheda(req, id, s, errore));
    const ok = await q1(`UPDATE suggerimenti SET ${CAMPI.map((k, i) => `${k} = $${i + 2}`).join(', ')}, aggiornato_il = now() WHERE id = $1 RETURNING id`,
      [id, ...CAMPI.map(k => s[k])]);
    res.redirect(ok ? torna('Salvato.', `/${id}`) : torna('Suggerimento non trovato.'));
  });

  // Elimina: un suggerimento non è collegato ad altro, si può sempre togliere
  r.post('/:id/elimina', async (req, res) => {
    const s = await q1(`DELETE FROM suggerimenti WHERE id = $1 RETURNING titolo`, [Number(req.params.id)]);
    res.redirect(torna(s ? `Suggerimento "${s.titolo}" eliminato.` : 'Suggerimento non trovato.'));
  });

  return r;
}
