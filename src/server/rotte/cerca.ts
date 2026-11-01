/**
 * Ricerca unica in alto (1/11/2026): GET /cerca?q=… mostra i risultati raggruppati (o va dritto alla pagina se il
 * risultato è uno solo); GET /cerca?q=…&formato=json dà le prime voci alla casella della testata mentre si scrive
 * (public/cerca.js). Regole in engine/ricerca-globale.ts, letture in ricerca-globale-servizio.ts.
 */
import { Router } from 'express';
import { layout } from '../views/layout.js';
import { html } from '../views/html.js';
import { cercaOvunque } from '../ricerca-globale-servizio.js';
import { raggruppaRisultati, risultatoDiretto } from '../../engine/ricerca-globale.js';

export function rotteCerca() {
  const r = Router();
  r.get('/', async (req, res) => {
    const utente = req.session.utente!;
    const testo = String(req.query.q ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const risultati = testo.length >= 2 ? await cercaOvunque(testo, utente.ruolo) : [];
    if (req.query.formato === 'json') {
      return res.json({ q: testo, risultati: risultati.slice(0, 10).map(x => ({ tipo: x.tipo, titolo: x.titolo, dettaglio: x.dettaglio ?? '', href: x.href })) });
    }
    const diretto = risultatoDiretto(risultati, testo);
    if (diretto && req.query.elenco !== '1') return res.redirect(diretto.href);
    const gruppi = raggruppaRisultati(risultati);
    res.send(String(layout({
      titolo: testo ? `Ricerca: ${testo}` : 'Ricerca', utente,
      contenuto: html`
      <h1>Ricerca</h1>
      <form class="cerca" method="get" action="/cerca"><input name="q" value="${testo}" type="search" placeholder="Cliente, codice, commessa, numero di ordine o fattura…" autofocus autocomplete="off"><button class="primario">Cerca</button></form>
      ${testo.length < 2 ? html`<p class="nota">Scrivi almeno due caratteri. Da qualsiasi pagina: tasto <kbd>/</kbd> oppure <kbd>Ctrl</kbd>+<kbd>K</kbd> e la casella in alto è pronta.</p>`
        : gruppi.length === 0 ? html`<p class="vuoto">Niente trovato per «${testo}». Prova con una parola sola, il numero senza l'anno, o un pezzo del codice.</p>`
        : gruppi.map(g => html`<section class="gruppo-ricerca"><h2>${g.nome} <small class="nota">${g.voci.length}</small></h2>
            <ul class="risultati-ricerca">${g.voci.map(v => html`<li><a href="${v.href}"><b>${v.titolo}</b>${v.dettaglio ? html` <span class="nota">${v.dettaglio}</span>` : ''}</a></li>`)}</ul></section>`)}`,
    })));
  });
  return r;
}
