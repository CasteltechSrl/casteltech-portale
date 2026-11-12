/**
 * Produzione → Stoccaggio componenti, Pick & Place, AOI (Adriano 12/11/2026): pagine di attesa per il collegamento alle API
 * delle macchine. Testi in engine/macchine.ts; nessuna lettura del database.
 */
import { Router } from 'express';
import { PAGINE_MACCHINE, paginaMacchina } from '../../engine/macchine.js';
import { layout } from '../views/layout.js';
import { html } from '../views/html.js';

export function rotteMacchine() {
  const r = Router();
  r.get('/:chiave', (req, res, next) => {
    const p = paginaMacchina(req.params.chiave);
    if (!p) return next();
    const contenuto = html`
      <nav class="tasti-sezione">${PAGINE_MACCHINE.map(x => html`<a href="/produzione/${x.chiave}" class="${x.chiave === p.chiave ? 'attivo' : ''}">${x.titolo}</a>`)}</nav>
      <h1>${p.titolo}</h1>
      <p>${p.cosa}</p>
      <div class="riquadro">
        <h2>In preparazione</h2>
        <p>Questa pagina si riempirà quando la macchina sarà collegata al portale con le sue API. Per ora non ci sono dati.</p>
        <p><strong>Cosa mostrerà:</strong></p>
        <ul>${p.mostrera.map(m => html`<li>${m}</li>`)}</ul>
      </div>`;
    res.send(String(layout({ titolo: p.titolo, utente: req.session.utente, attiva: 'produzione', contenuto })));
  });
  return r;
}
