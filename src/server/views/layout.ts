import { html, raw, type Raw } from './html.js';

export interface Utente { id: number; nome: string; ruolo: 'ufficio' | 'produzione' }

export function layout(opz: { titolo: string; utente?: Utente; attiva?: string; contenuto: Raw; script?: string; avviso?: string; largo?: boolean }) {
  const voce = (href: string, testo: string, chiave: string) =>
    html`<a href="${href}" class="${opz.attiva === chiave ? 'attiva' : ''}">${testo}</a>`;
  return html`<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${opz.titolo} · Casteltech</title>
<link rel="icon" href="/static/favicon.svg">
<link rel="stylesheet" href="/static/stile.css">
</head>
<body>
${opz.utente ? html`
<header class="testata">
  <a class="marchio" href="/"><span class="logo">C</span> Casteltech <small>portale</small></a>
  <nav>
    ${opz.utente.ruolo === 'ufficio' ? html`
      ${voce('/preventivi', 'Preventivi', 'preventivi')}
      ${voce('/impostazioni', 'Impostazioni', 'impostazioni')}` : ''}
  </nav>
  <div class="utente">${opz.utente.nome} · <form method="post" action="/esci" class="inline"><button class="link">Esci</button></form></div>
</header>` : ''}
<main class="${opz.utente ? (opz.largo ? 'largo' : '') : 'centrato'}">
${opz.avviso ? html`<div class="avviso">${opz.avviso}</div>` : ''}
${opz.contenuto}
</main>
${opz.script ? raw(`<script src="/static/${opz.script}" defer></script>`) : ''}
</body>
</html>`;
}
