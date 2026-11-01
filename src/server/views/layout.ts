import { html, raw, type Raw } from './html.js';
import { avvisoServizi } from '../stato-servizi.js';

/** Versione del portale: cambia a ogni pubblicazione, così il browser non usa stili e script vecchi. */
export const VERSIONE = (process.env.RENDER_GIT_COMMIT ?? String(Date.now())).slice(0, 10);

import type { Ruolo } from '../../engine/ruoli.js';

export interface Utente { id: number; nome: string; ruolo: Ruolo }

/**
 * Menu in alto a gruppi (Adriano 31/10/2026): ogni gruppo ha una tendina con le sue pagine, così la barra resta corta
 * quando arriveranno Qualità e Sicurezza e ambiente. Ordini dei clienti nel Commerciale (vendite), ordini a fornitore
 * negli Acquisti, soldi e documenti fiscali in Amministrazione. Impostazioni, Suggerimenti e Guida a destra.
 * Gli indirizzi delle pagine non cambiano. Un gruppo nuovo si aggiunge qui (test in tests/menu.test.ts).
 */
export const MENU_GRUPPI: { chiave: string; nome: string; voci: [string, string][] }[] = [
  { chiave: 'anagrafiche', nome: 'Anagrafiche', voci: [['Clienti', '/anagrafiche/clienti'], ['Fornitori', '/anagrafiche/fornitori'], ['Prodotti', '/anagrafiche/prodotti'], ['Componenti', '/anagrafiche/componenti']] },
  { chiave: 'commerciale', nome: 'Commerciale', voci: [['CRM', '/crm'], ['Quotazioni', '/quotazioni'], ['Preventivi', '/preventivi'], ['Preventivi dai documenti del cliente', '/preventivi/documenti'], ['Ordini clienti', '/ordini/cruscotto'], ['Ordini da acquisire', '/ordini/acquisire']] },
  { chiave: 'acquisti', nome: 'Acquisti', voci: [['Ordini a fornitore', '/ordini/fornitori'], ['Acquisti per fornitore e mese', '/amministrazione/ricevuti/mesi'], ['Miglior prezzo di un P/N', '/quotazioni/prezzo']] },
  { chiave: 'produzione', nome: 'Produzione', voci: [['Commesse', '/commesse'], ['Gantt della produzione', '/ordini/gantt']] },
  { chiave: 'amministrazione', nome: 'Amministrazione', voci: [['Cruscotto', '/amministrazione'], ['Documenti emessi', '/amministrazione/documenti'], ['Fatture differite (DDT da fatturare)', '/amministrazione/differite'], ['Solleciti incassi', '/amministrazione/solleciti'], ['Fatture fornitori', '/amministrazione/ricevuti'], ['Registri IVA', '/amministrazione/registri'], ['Controllo VIES', '/amministrazione/vies'], ['Spese senza fattura elettronica', '/amministrazione/spese'], ['Bollo virtuale', '/amministrazione/bollo'], ['Lettere d\'intento', '/amministrazione/lettere-intento'], ['Analisi', '/amministrazione/analisi']] },
  { chiave: 'qualita', nome: 'Qualità', voci: [['Cruscotto della qualità', '/qualita'], ['Non conformità e reclami', '/qualita/non_conformita'], ['Strumenti e tarature', '/qualita/strumenti'], ['Piano delle manutenzioni', '/qualita/manutenzioni'], ['Verifiche ESD', '/qualita/esd'], ['Documenti del sistema', '/qualita/documenti'], ['Formazione', '/qualita/formazione'], ['Audit', '/qualita/audit'], ['Rischi e opportunità', '/qualita/rischi'], ['Codifica dei difetti', '/qualita/difetti']] },
  // Dipendenti (Adriano 1/11/2026): costo del personale, nota spese, persone; buste paga nell'area riservata con password
  { chiave: 'dipendenti', nome: 'Dipendenti', voci: [['Costo del personale', '/dipendenti'], ['Nota spese', '/dipendenti/note-spese'], ['Persone e auto', '/dipendenti/persone'], ['Buste paga (riservato)', '/dipendenti/riservata']] },
];
/** Gruppo da evidenziare per la sezione della pagina (chiave `attiva` passata al layout). */
const GRUPPO_DI: Record<string, string> = {
  crm: 'commerciale', quotazioni: 'commerciale', preventivi: 'commerciale', ordini: 'commerciale',
  acquisti: 'acquisti', commesse: 'produzione', produzione: 'produzione', anagrafiche: 'anagrafiche', amministrazione: 'amministrazione', qualita: 'qualita', dipendenti: 'dipendenti',
};
export const gruppoAttivo = (attiva: string | undefined) => (attiva ? GRUPPO_DI[attiva] ?? attiva : '');

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
<body class="${opz.utente?.ruolo === 'contabilita' ? 'sola-lettura' : ''}">
${opz.utente ? html`
<header class="testata">
  <a class="marchio" href="/"><span class="logo">C</span> Portale Casteltech</a>
  <nav class="menu"><!-- menu a gruppi deciso da Adriano (31/10/2026) -->
    ${(opz.utente.ruolo === 'ufficio' ? MENU_GRUPPI : opz.utente.ruolo === 'contabilita' ? MENU_GRUPPI.filter(g => g.chiave === 'amministrazione') : []).map(g => html`<div class="gruppo ${gruppoAttivo(opz.attiva) === g.chiave ? 'attivo' : ''}">
      <a href="${g.voci[0][1]}" class="titolo-gruppo ${gruppoAttivo(opz.attiva) === g.chiave ? 'attiva' : ''}" aria-haspopup="true">${g.nome}</a>
      <div class="tendina">${g.voci.map(([t, h]) => html`<a href="${h}">${t}</a>`)}</div>
    </div>`)}
  </nav>
  ${opz.utente.ruolo === 'produzione' ? '' : html`<form class="cerca-globale" method="get" action="/cerca" role="search" autocomplete="off">
    <input name="q" type="search" placeholder="Cerca…  /" title="Ricerca unica: cliente, codice, commessa, numero di ordine o fattura (tasto / oppure Ctrl+K)" aria-label="Cerca nel portale" autocomplete="off">
    <div class="suggerimenti-ricerca" hidden></div>
  </form>`}
  <nav class="menu-destra">
    ${opz.utente.ruolo === 'ufficio' ? html`${voce('/impostazioni', 'Impostazioni', 'impostazioni')}${voce('/suggerimenti', 'Suggerimenti', 'suggerimenti')}` : ''}
    ${voce('/guida', 'Guida', 'guida')}
    ${opz.utente.ruolo === 'contabilita' ? html`<span class="etichetta">sola lettura</span>` : ''}
  </nav>
  <div class="utente" title="${opz.utente.nome}"><span class="nome-utente">${opz.utente.nome} · </span><form method="post" action="/esci" class="inline"><button class="link">Esci</button></form></div>
</header>` : ''}
<main class="${opz.utente ? (opz.largo ? 'largo' : '') : 'centrato'}">
${opz.utente?.ruolo === 'ufficio' ? avvisoDeiServizi() : ''}
${opz.avviso ? html`<div class="avviso">${opz.avviso}</div>` : ''}
${opz.contenuto}
</main>
${opz.utente ? raw(`<script src="/static/conferma.js?v=${VERSIONE}" defer></script>
<script src="/static/menu.js?v=${VERSIONE}" defer></script>
<script src="/static/cerca.js?v=${VERSIONE}" defer></script>
<script src="/static/tasti.js?v=${VERSIONE}" defer></script>
<script src="/static/tempi.js?v=${VERSIONE}" defer></script>
<script src="/static/errori-campo.js?v=${VERSIONE}" defer></script>
<script src="/static/formati.js?v=${VERSIONE}" defer></script>`) : ''}
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
