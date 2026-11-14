import { html, raw, type Raw } from './html.js';
import { avvisoServizi } from '../stato-servizi.js';

/** Versione del portale: cambia a ogni pubblicazione, così il browser non usa stili e script vecchi. */
export const VERSIONE = (process.env.RENDER_GIT_COMMIT ?? String(Date.now())).slice(0, 10);

import { eUfficio, paginaIniziale, type Ruolo } from '../../engine/ruoli.js';
import { linkPermesso } from '../../engine/link-profilo.js';

export interface Utente { id: number; nome: string; ruolo: Ruolo }

/**
 * Menu in alto a gruppi (Adriano 31/10/2026): ogni gruppo ha una tendina con le sue pagine, così la barra resta corta
 * quando arriveranno Qualità e Sicurezza e ambiente. Ordini dei clienti nel Commerciale (vendite), ordini a fornitore
 * negli Acquisti, soldi e documenti fiscali in Amministrazione. Impostazioni, Suggerimenti e Guida a destra.
 * Gli indirizzi delle pagine non cambiano. Un gruppo nuovo si aggiunge qui (test in tests/menu.test.ts).
 */
export const MENU_GRUPPI: { chiave: string; nome: string; voci: [string, string][] }[] = [
  { chiave: 'anagrafiche', nome: 'Anagrafiche', voci: [['Clienti', '/anagrafiche/clienti'], ['Fornitori', '/anagrafiche/fornitori'], ['Prodotti', '/anagrafiche/prodotti'], ['Componenti', '/anagrafiche/componenti'], ['Componenti clienti', '/anagrafiche/componenti-clienti'], ['Materiali di consumo', '/anagrafiche/materiali']] },
  // Adriano 13/11/2026: quattro voci in Arrivati = Prodotti (ex Documenti commesse), Cliente, Fornitore, Schede di produzione (sezioni di Da acquisire)
  // Documenti (Adriano 12/11/2026): i documenti che ARRIVANO (dai clienti, da e-mail e PDF), prima sotto Commerciale; indirizzi invariati
  { chiave: 'documenti', nome: 'Documenti', voci: [['Arrivati', ''], ['Prodotti', '/preventivi/documenti'], ['Cliente', '/ordini/acquisire?sezione=clienti'],
    ['Fornitore', '/ordini/acquisire?sezione=fornitori'], ['Schede di produzione', '/ordini/acquisire?sezione=produzione'],
    // Adriano 12/11/2026: nella stessa tendina anche i documenti che produciamo noi (restano anche nei loro gruppi)
    ['Emessi da noi', ''], ['Preventivi', '/preventivi'], ['Conferme d\'ordine', '/ordini/conferme'], ['DDT', '/amministrazione/documenti?tipo=ddt'],
    ['Fatture', '/amministrazione/documenti?tipo=fattura'], ['Note di credito', '/amministrazione/documenti?tipo=nota_credito'],
    ['Autofatture', '/amministrazione/documenti?tipo=autofattura'], ['Ordini a fornitore', '/ordini/fornitori']] },
  { chiave: 'commerciale', nome: 'Commerciale', voci: [['CRM', '/crm'], ['Quotazioni componenti', '/quotazioni'], ['Preventivi', '/preventivi'], ['Ordini clienti', '/ordini/cruscotto'], ['Conferme d\'ordine', '/ordini/conferme']] },
  { chiave: 'acquisti', nome: 'Acquisti', voci: [['Ordini a fornitore', '/ordini/fornitori'], ['DDT ricevuti', '/acquisti/ddt'], ['Fatture fornitori', '/amministrazione/ricevuti'], ['Acquisti per fornitore e mese', '/amministrazione/ricevuti/mesi'], ['Miglior prezzo di un P/N', '/quotazioni/prezzo'],
    // Adriano 13/11/2026: voci del materiale di consumo della scheda con costo, giacenza e cruscotto
    ['Materiale di consumo', '/acquisti/materiale-consumo']] },
  { chiave: 'produzione', nome: 'Produzione', voci: [['Flusso di produzione', '/cruscotto?flusso=preparare'], ['Commesse', '/commesse'], ['Gantt della produzione', '/ordini/gantt'], ['Codifica componenti', '/produzione/codifica-componenti'],
    // Adriano 12/11/2026: pagine delle macchine, pronte per il collegamento con le API (engine/macchine.ts)
    ['Stoccaggio componenti', '/produzione/stoccaggio'], ['Pick & Place', '/produzione/pick-place'], ['AOI', '/produzione/aoi']] },
  { chiave: 'amministrazione', nome: 'Amministrazione', voci: [['Cruscotto', '/amministrazione'], ['DDT', '/amministrazione/documenti?tipo=ddt'], ['Fatture', '/amministrazione/documenti?tipo=fattura'], ['Autofatture', '/amministrazione/documenti?tipo=autofattura'], ['Note di credito', '/amministrazione/documenti?tipo=nota_credito'], ['Fatture differite (DDT da fatturare)', '/amministrazione/differite'], ['Banca e carte', '/amministrazione/banca'], ['Crediti verso clienti', '/amministrazione/crediti'], ['Solleciti incassi', '/amministrazione/solleciti'], ['Controlli settimanali', '/amministrazione/controlli'], ['Registri IVA', '/amministrazione/registri'], ['Controllo VIES', '/amministrazione/vies'], ['Spese senza fattura elettronica', '/amministrazione/spese'], ['Bollo virtuale', '/amministrazione/bollo'], ['Lettere d\'intento', '/amministrazione/lettere-intento'], ['Analisi', '/amministrazione/analisi']] },
  { chiave: 'qualita', nome: 'Qualità', voci: [['Cruscotto della qualità', '/qualita'], ['Non conformità e reclami', '/qualita/non_conformita'], ['Strumenti e tarature', '/qualita/strumenti'], ['Piano delle manutenzioni', '/qualita/manutenzioni'], ['Verifiche ESD', '/qualita/esd'], ['Documenti del sistema', '/qualita/documenti'], ['Formazione', '/qualita/formazione'], ['Audit', '/qualita/audit'], ['Rischi e opportunità', '/qualita/rischi'], ['Codifica dei difetti', '/qualita/difetti']] },
  // Dipendenti (Adriano 1/11/2026): costo del personale, nota spese, persone; buste paga nell'area riservata con password
  { chiave: 'dipendenti', nome: 'Dipendenti', voci: [['Costo del personale', '/dipendenti'], ['Nota spese', '/dipendenti/note-spese'], ['Persone e auto', '/dipendenti/persone'], ['Buste paga (riservato)', '/dipendenti/riservata']] },
  // Sicurezza (Adriano 12/11/2026): schede di sicurezza dei prodotti chimici, controllo su ordini e DDT, scadenzario del D.Lgs. 81/08
  { chiave: 'sicurezza', nome: 'Sicurezza', voci: [['Cruscotto della sicurezza', '/sicurezza'], ['Schede di sicurezza (SDS)', '/sicurezza/schede'], ['Controllo SDS su ordini e DDT', '/sicurezza/controllo'],
    ['Documenti e valutazioni (DVR)', '/sicurezza/sic_adempimenti'], ['Formazione sicurezza', '/sicurezza/sic_formazione'], ['Visite mediche', '/sicurezza/sic_visite'],
    ['DPI consegnati', '/sicurezza/sic_dpi'], ['Antincendio ed emergenza', '/sicurezza/sic_emergenza'], ['Impianti, macchine e ambiente', '/sicurezza/sic_impianti'],
    ['Organigramma della sicurezza', '/sicurezza/sic_figure'], ['Infortuni e quasi infortuni', '/sicurezza/sic_infortuni']] },
];
/** Gruppo da evidenziare per la sezione della pagina (chiave `attiva` passata al layout). */
const GRUPPO_DI: Record<string, string> = {
  crm: 'commerciale', quotazioni: 'commerciale', preventivi: 'commerciale', ordini: 'commerciale',
  acquisti: 'acquisti', documenti: 'documenti', commesse: 'produzione', produzione: 'produzione', anagrafiche: 'anagrafiche', amministrazione: 'amministrazione', qualita: 'qualita', dipendenti: 'dipendenti', sicurezza: 'sicurezza',
};
/**
 * Menu del profilo Contabilità (Adriano 1/11/2026): niente tendine, le pagine dell'Amministrazione in fila nella barra in alto
 * (c'è spazio, il commercialista ha solo questo gruppo). Nomi corti; la voce della pagina aperta la accende public/menu.js.
 * Il menu dell'ufficio e della produzione non cambia.
 */
export const MENU_CONTABILITA: [string, string][] = [
  ['Cruscotto', '/amministrazione'], ['DDT', '/amministrazione/documenti?tipo=ddt'], ['Fatture', '/amministrazione/documenti?tipo=fattura'],
  ['Autofatture', '/amministrazione/documenti?tipo=autofattura'], ['Note di credito', '/amministrazione/documenti?tipo=nota_credito'], ['Fatture fornitori', '/amministrazione/ricevuti'],
  ['Acquisti per mese', '/amministrazione/ricevuti/mesi'], ['Registri IVA', '/amministrazione/registri'], ['DDT da fatturare', '/amministrazione/differite'],
  ['Spese', '/amministrazione/spese'], ['Bollo', '/amministrazione/bollo'], ['Lettere d\'intento', '/amministrazione/lettere-intento'],
  ['VIES', '/amministrazione/vies'], ['Crediti', '/amministrazione/crediti'], ['Solleciti', '/amministrazione/solleciti'], ['Controlli', '/amministrazione/controlli'],
  ['Previsione di cassa', '/amministrazione/analisi/cassa'], ['Buste paga', '/dipendenti/riservata'],   // niente Analisi: solo amministratore ed esterno (6/11/2026)
];

/**
 * Tasti in cima alle pagine degli Acquisti che stanno ancora sotto /amministrazione (Fatture fornitori, Acquisti per mese):
 * Adriano 7/11/2026, "Fatture fornitori" va negli Acquisti accanto a ordini e DDT. Gli indirizzi non cambiano.
 */
export function tastiAcquisti(attivo: string) {
  const voci = MENU_GRUPPI.find(g => g.chiave === 'acquisti')!.voci;
  return html`<nav class="tasti-sezione">${voci.map(([t, h]) => html`<a href="${h}" class="${h === attivo ? 'attivo' : ''}">${t}</a>`)}</nav>`;
}

export const gruppoAttivo = (attiva: string | undefined) => (attiva ? GRUPPO_DI[attiva] ?? attiva : '');

export function layout(opz: { titolo: string; utente?: Utente; attiva?: string; contenuto: Raw; script?: string | string[]; avviso?: string; largo?: boolean }) {
  const voce = (href: string, testo: string, chiave: string) =>
    html`<a href="${href}" class="${opz.attiva === chiave ? 'attiva' : ''}">${testo}</a>`;
  // nel menu solo le pagine che il profilo può aprire (es. Analisi: solo amministratore ed esterno, Adriano 6/11/2026)
  // voce senza indirizzo = titoletto dentro la tendina (es. Documenti: Arrivati / Emessi da noi)
  const permesse = (voci: readonly [string, string][]) => voci.filter(([, h]) => !h || linkPermesso(opz.utente?.ruolo, h.split(/[?#]/)[0]));
  // freccia "torna indietro" (Adriano 14/11/2026): senza pagina prima, la prima pagina della sezione accesa o la pagina iniziale del profilo
  const gruppo = MENU_GRUPPI.find(g => g.chiave === gruppoAttivo(opz.attiva));
  const ripiego = opz.utente ? ((gruppo && opz.utente.ruolo !== 'produzione' ? permesse(gruppo.voci).find(v => v[1])?.[1] : undefined) ?? paginaIniziale(opz.utente.ruolo)) : '';
  return html`<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${opz.titolo} · Portale Casteltech</title>
<link rel="icon" href="/static/favicon.svg">
<link rel="stylesheet" href="/static/stile.css?v=${VERSIONE}">
</head>
<body class="${opz.utente?.ruolo === 'contabilita' ? 'sola-lettura' : opz.utente?.ruolo === 'esterno' ? 'sola-lettura-tutto' : ''}">
${opz.utente ? html`
<header class="testata">
  <a class="freccia-indietro" href="${ripiego}" data-ripiego="${ripiego}" title="Torna alla pagina di prima" aria-label="Torna alla pagina di prima" hidden>←</a>
  <a class="marchio" href="/"><span class="logo">C</span> Portale Casteltech</a>
  ${opz.utente.ruolo === 'contabilita' ? html`<nav class="menu menu-piatto">${permesse(MENU_CONTABILITA).map(([t, h]) => html`<a href="${h}">${t}</a>`)}</nav>` : html`<nav class="menu"><!-- menu a gruppi deciso da Adriano (31/10/2026); "⌂ Cruscotto" prima voce, senza tendina (Adriano 9/11/2026) -->
    ${eUfficio(opz.utente.ruolo) || opz.utente.ruolo === 'esterno' ? html`<a href="/cruscotto" class="voce-cruscotto ${opz.attiva === 'cruscotto' ? 'attiva' : ''}">⌂ Cruscotto</a>` : ''}
    ${(eUfficio(opz.utente.ruolo) || opz.utente.ruolo === 'esterno' ? MENU_GRUPPI : []).map(g => html`<div class="gruppo ${gruppoAttivo(opz.attiva) === g.chiave ? 'attivo' : ''}">
      <a href="${g.voci.find(v => v[1])![1]}" class="titolo-gruppo ${gruppoAttivo(opz.attiva) === g.chiave ? 'attiva' : ''}" aria-haspopup="true">${g.nome}</a>
      <div class="tendina">${permesse(g.voci).map(([t, h]) => h ? html`<a href="${h}">${t}</a>` : html`<span class="titolo-tendina">${t}</span>`)}</div>
    </div>`)}
  </nav>`}
  ${opz.utente.ruolo === 'produzione' ? '' : html`<form class="cerca-globale" method="get" action="/cerca" role="search" autocomplete="off">
    <input name="q" type="search" placeholder="Cerca…  /" title="Ricerca unica: cliente, codice, commessa, numero di ordine o fattura (tasto / oppure Ctrl+K)" aria-label="Cerca nel portale" autocomplete="off">
    <div class="suggerimenti-ricerca" hidden></div>
  </form>`}
  <nav class="menu-destra">
    ${eUfficio(opz.utente.ruolo) ? html`${voce('/impostazioni', 'Impostazioni', 'impostazioni')}${voce('/suggerimenti', 'Suggerimenti', 'suggerimenti')}` : ''}
    ${opz.utente.ruolo === 'esterno' ? voce('/suggerimenti', 'Suggerimenti', 'suggerimenti') : ''}
    ${voce('/guida', 'Guida', 'guida')}
    ${opz.utente.ruolo === 'contabilita' || opz.utente.ruolo === 'esterno' ? html`<span class="etichetta">sola lettura</span>` : ''}
  </nav>
  <div class="utente" title="${opz.utente.nome}"><span class="nome-utente">${opz.utente.nome} · </span><form method="post" action="/esci" class="inline"><button class="link">Esci</button></form></div>
</header>` : ''}
<main class="${opz.utente ? (opz.largo ? 'largo' : '') : 'centrato'}">
${eUfficio(opz.utente?.ruolo) ? avvisoDeiServizi() : ''}
${opz.avviso ? html`<div class="avviso chiudibile">${opz.avviso}</div>` : ''}
${opz.contenuto}
</main>
${opz.utente ? raw(`<script src="/static/conferma.js?v=${VERSIONE}" defer></script>
<script src="/static/avvisi.js?v=${VERSIONE}" defer></script>
<script src="/static/menu.js?v=${VERSIONE}" defer></script>
<script src="/static/cerca.js?v=${VERSIONE}" defer></script>
<script src="/static/tasti.js?v=${VERSIONE}" defer></script>
<script src="/static/tempi.js?v=${VERSIONE}" defer></script>
<script src="/static/errori-campo.js?v=${VERSIONE}" defer></script>
<script src="/static/formati.js?v=${VERSIONE}" defer></script>
<script src="/static/sola-lettura.js?v=${VERSIONE}" defer></script>
<script src="/static/ordina-tabelle.js?v=${VERSIONE}" defer></script>
<script src="/static/elenchi-scelta.js?v=${VERSIONE}" defer></script>
<script src="/static/menu-cercabile.js?v=${VERSIONE}" defer></script>
<script src="/static/resta-qui.js?v=${VERSIONE}" defer></script>
<script src="/static/indietro.js?v=${VERSIONE}" defer></script>`) : ''}
${[opz.script ?? []].flat().map(s => raw(`<script src="/static/${s}?v=${VERSIONE}" defer></script>`))}
</body>
</html>`;
}

/** Servizi vicini al limite o fermi (credito dell'IA, memoria, database…): avviso a tutto l'ufficio, dai dati in memoria. */
function avvisoDeiServizi() {
  const a = avvisoServizi();
  if (!a) return '';
  return html`<div class="avviso servizi chiudibile ${a.livello === 'critico' ? 'servizi-critico' : ''}" data-chiave="${a.chiave}"><b>${a.livello === 'critico' ? 'Servizio fermo o al limite' : 'Servizi vicini al limite'}:</b>
    <ul>${a.testi.map(t => html`<li>${t}</li>`)}</ul><a href="/impostazioni/servizi">Vedi consumi e limiti</a></div>`;
}
