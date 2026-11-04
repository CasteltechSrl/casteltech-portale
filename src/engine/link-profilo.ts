/**
 * Collegamenti che il profilo non può aprire (controllo notturno del 4/11/2026): contabilità, esterno e produzione vedevano nelle pagine
 * (guida, cruscotto, controlli, VIES…) link e pulsanti che portavano alla pagina "Accesso negato". Prima di mandare la pagina, i link
 * interni non permessi diventano testo semplice (i pulsanti "+ Nuovo…" spariscono). Le regole sono quelle di `engine/ruoli.ts`:
 * qui si decide solo cosa mostrare, i controlli veri restano nelle rotte.
 */
import { contabilitaPuo, esternoPuo, eUfficio } from './ruoli.js';

/** Pagine aperte a tutti quelli che sono entrati (guida, reparto, QR, accesso). */
const PER_TUTTI = /^\/(guida|r|c|login|static)(\/|$)|^\/$/;

/** Il profilo può aprire questa pagina? (solo il percorso, senza ?…) */
export function linkPermesso(ruolo: string | undefined, percorso: string): boolean {
  if (!ruolo || eUfficio(ruolo)) return true;
  if (PER_TUTTI.test(percorso)) return true;
  if (ruolo === 'contabilita') return contabilitaPuo('GET', percorso);
  if (ruolo === 'esterno') return esternoPuo('GET', percorso);
  return false; // produzione: solo reparto e guida
}

const ANCORA = /<a\b([^>]*?)\bhref="(\/[^"]*)"([^>]*)>([\s\S]*?)<\/a>/g;

/** Toglie dalla pagina i link interni che il profilo non può aprire: pulsanti tolti, link normali lasciati come testo. */
export function spegniLinkNonPermessi(pagina: string, ruolo: string | undefined): string {
  if (!ruolo || eUfficio(ruolo)) return pagina;
  return pagina.replace(ANCORA, (tutto, prima: string, href: string, dopo: string, testo: string) => {
    const percorso = href.replace(/&amp;/g, '&').split(/[?#]/)[0];
    if (linkPermesso(ruolo, percorso)) return tutto;
    const classe = /\bclass="([^"]*)"/.exec(prima + dopo)?.[1] ?? '';
    if (/\bbottone\b/.test(classe)) return '';
    return `<span class="link-spento" title="Non disponibile con il tuo profilo">${testo}</span>`;
  });
}
