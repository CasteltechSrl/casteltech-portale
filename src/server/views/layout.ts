import { html, raw, type Raw } from './html.js';
import { avvisoServizi } from '../stato-servizi.js';

/** Versione del portale: cambia a ogni pubblicazione, così il browser non usa stili e script vecchi. */
export const VERSIONE = (process.env.RENDER_GIT_COMMIT ?? String(Date.now())).slice(0, 10);

export interface Utente { id: number; nome: string; ruolo: 'ufficio' | 'produzione' }

export function layout(opz: { titolo: string; utente?: Utente; attiva?: string; contenuto: Raw; script?: string | string[]; avviso?: string; largo?: boolean }) {
  const voce = (href: string, testo: string, chiave: string) =>
    html`<a href="${href}" class="${opz.attiva === chiave ? 'attiva' : ''}">${testo}</a>`;
  return html`<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${opz.titolo} · Portale Casteltech</title>
<link rel="icon" href="/static/favicon.svg">
<link rel="stylesheet" href="/static/stile.css?v=${VERSIONE}">
</head>
<body>
${opz.utente ? html`
<header class="testata">
  <a class="marchio" href="/"><span class="logo">C</span> Portale Casteltech</a>
  <nav><!-- ordine del menu deciso da Adriano (28/10/2026) -->
    ${opz.utente.ruolo === 'ufficio' ? html`
      ${voce('/crm', 'CRM', 'crm')}
      ${voce('/anagrafiche', 'Anagrafiche', 'anagrafiche')}
      ${voce('/quotazioni', 'Quotazioni', 'quotazioni')}
      ${voce('/preventivi', 'Preventivi', 'preventivi')}
      ${voce('/ordini/cruscotto', 'Ordini', 'ordini')}
      ${voce('/commesse', 'Commesse', 'commesse')}
      ${voce('/amministrazione', 'Amministrazione', 'amministrazione')}
      ${voce('/impostazioni', 'Impostazioni', 'impostazioni')}
      ${voce('/suggerimenti', 'Suggerimenti', 'suggerimenti')}` : ''}
    ${voce('/guida', 'Guida', 'guida')}
  </nav>
  <div class="utente">${opz.utente.nome} · <form method="post" action="/esci" class="inline"><button class="link">Esci</button></form></div>
</header>` : ''}
<main class="${opz.utente ? (opz.largo ? 'largo' : '') : 'centrato'}">
${opz.utente?.ruolo === 'ufficio' ? avvisoDeiServizi() : ''}
${opz.avviso ? html`<div class="avviso">${opz.avviso}</div>` : ''}
${opz.contenuto}
</main>
${opz.utente ? raw(`<script src="/static/conferma.js?v=${VERSIONE}" defer></script>
<script src="/static/tempi.js?v=${VERSIONE}" defer></script>`) : ''}
${[opz.script ?? []].flat().map(s => raw(`<script src="/static/${s}?v=${VERSIONE}" defer></script>`))}
</body>
</html>`;
}

/** Servizi vicini al limite o fermi (credito dell'IA, memoria, database…): avviso a tutto l'ufficio, dai dati in memoria. */
function avvisoDeiServizi() {
  const a = avvisoServizi();
  if (!a) return '';
  return html`<div class="avviso servizi ${a.livello === 'critico' ? 'servizi-critico' : ''}"><b>${a.livello === 'critico' ? 'Servizio fermo o al limite' : 'Servizi vicini al limite'}:</b>
    <ul>${a.testi.map(t => html`<li>${t}</li>`)}</ul><a href="/impostazioni/servizi">Vedi consumi e limiti</a></div>`;
}
