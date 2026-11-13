/**
 * Elenco delle osservazioni dei documenti del cliente con le risposte (Adriano 13/11/2026), uguale nella pagina dei documenti,
 * nel preventivo (solo lettura) e nella pre-produzione della commessa. Regole in `engine/scheda/accettate.ts`.
 */
import { chiaveSegnalazione, contaOsservazioni, ETICHETTE_ESITO, risposteDaRivedere, type MomentoRisposta } from '../../engine/scheda/accettate.js';
import type { Segnalazione } from '../../engine/scheda/analisi.js';
import { data, html, type Raw } from './html.js';

export const ETICHETTE_LIVELLO: Record<Segnalazione['livello'], string> = { errore: 'Da chiarire', avviso: 'Attenzione', info: 'Nota' };

/** Ordine: per livello; prima le aperte, poi quelle da vedere in produzione, poi le risolte. */
export function inOrdine(segnalazioni: Segnalazione[]): Segnalazione[] {
  const peso = (s: Segnalazione) => s.accettata ? 2 : s.rimandata ? 1 : 0;
  return (['errore', 'avviso', 'info'] as const).flatMap(lv => segnalazioni.filter(s => s.livello === lv).sort((a, b) => peso(a) - peso(b)));
}

export function risposteOsservazione(s: Segnalazione): Raw | string {
  if (!s.risposte?.length) return '';
  return html`<ul class="risposte">${s.risposte.map(r => html`<li><b>${r.da}</b> <small class="nota">${data(r.il)} · ${r.momento === 'produzione' ? 'prima della produzione' : 'preventivo'}</small>${r.prezzo ? html` <span class="etichetta prezzo" title="Questa risposta cambia il prezzo">cambia il prezzo</span>` : ''}<br>${r.testo}</li>`)}</ul>`;
}

export interface OpzioniOsservazioni {
  pacchettoId: number;
  momento: MomentoRisposta;
  /** false = solo lettura (preventivo, profili in sola lettura) */
  modifica: boolean;
  /** pagina a cui tornare dopo la risposta (solo /commesse/… o /preventivi/…) */
  torna?: string;
  /** riferimenti dei componenti: pulsanti nella pagina dei documenti, testo altrove */
  refs?: (refs: string[]) => Raw;
}

export function elencoOsservazioni(segnalazioni: Segnalazione[], o: OpzioniOsservazioni): Raw {
  const azione = `/preventivi/documenti/${o.pacchettoId}/rispondi`;
  const nascosti = (s: Segnalazione) => html`<input type="hidden" name="chiave" value="${chiaveSegnalazione(s)}"><input type="hidden" name="momento" value="${o.momento}">${o.torna ? html`<input type="hidden" name="torna" value="${o.torna}">` : ''}`;
  const etichetta = (s: Segnalazione) => s.accettata ? 'Risolta' : s.rimandata ? 'Per la produzione' : ETICHETTE_LIVELLO[s.livello];
  const esitoPredefinito = (s: Segnalazione) => s.esito && s.esito !== 'aperta' ? s.esito : 'va_bene';
  return html`<ul class="segnalazioni">${inOrdine(segnalazioni).map(s => html`
    <li class="${s.livello}${s.accettata ? ' accettata' : ''}${s.rimandata ? ' rimandata' : ''}"><span class="livello-segn">${etichetta(s)}</span> ${s.testo}${s.refs?.length
      ? (o.refs ? html` <span class="refs">${o.refs(s.refs)}</span>` : html` <small class="nota">(${s.refs.slice(0, 12).join(', ')}${s.refs.length > 12 ? '…' : ''})</small>`) : ''}
      ${s.accettata ? html`<small class="nota">— risolta per ${s.accettata.da}, ${data(s.accettata.il)}</small>` : ''}
      ${s.rimandata ? html`<small class="nota">— da vedere prima della produzione (${s.rimandata.da}, ${data(s.rimandata.il)})</small>` : ''}
      ${risposteOsservazione(s)}
      ${o.modifica ? html`<div class="azioni-osservazione">
        <form method="post" action="${azione}" class="inline">${nascosti(s)}${s.accettata || s.rimandata
          ? html`<button class="link" name="annulla" value="1" title="La segnalazione torna aperta; le risposte restano">riapri</button>`
          : html`<button class="link va-bene" title="Ho controllato: va bene così (non conta più tra gli errori e i componenti non sono più critici nelle stampe)">Va bene</button>`}</form>
        <details class="rispondi"><summary>Rispondi</summary>
          <form method="post" action="${azione}" class="stretto-form">${nascosti(s)}
            <label>Risposta <textarea name="testo" rows="2" maxlength="2000" required placeholder="es. confermato dal cliente: R13 non si monta; oppure: chiedere al cliente il file aggiornato"></textarea></label>
            <fieldset class="esito-osservazione"><legend>Come resta</legend>
              ${(['va_bene', 'produzione', 'aperta'] as const).map(e => html`<label class="spunta"><input type="radio" name="esito" value="${e}"${e === esitoPredefinito(s) ? html` checked` : ''}> ${ETICHETTE_ESITO[e]}${e === 'produzione' ? html` <small class="nota">(non cambia il prezzo: si vede dopo la conferma d'ordine)</small>` : ''}</label>`)}
            </fieldset>
            ${o.momento === 'preventivo' ? html`<label class="spunta"><input type="checkbox" name="prezzo" value="1"> Questa risposta cambia il prezzo: il preventivo va ricontrollato</label>` : ''}
            <button class="primario">Salva la risposta</button>
          </form></details></div>` : ''}</li>`)}</ul>`;
}

/**
 * Riquadro nel preventivo (sola lettura: la pagina è un unico modulo): osservazioni del pacchetto, anche per gli altri
 * preventivi della stessa quotazione. Avviso giallo se una risposta "cambia il prezzo" è più recente dell'ultimo salvataggio.
 */
export function riquadroOsservazioni(o: { id: number; nome: string; analisi: { segnalazioni: Segnalazione[] } } | null | undefined, salvatoIl: string | Date | null | undefined): Raw | string {
  const segnalazioni = o?.analisi.segnalazioni ?? [];
  if (!o || !segnalazioni.length) return '';
  const n = contaOsservazioni(segnalazioni);
  const daRivedere = risposteDaRivedere(segnalazioni, salvatoIl);
  const pezzi = [n.perIlPrezzo && `${n.perIlPrezzo} da chiarire prima del prezzo`, n.perLaProduzione && `${n.perLaProduzione} da vedere prima della produzione`,
    n.conRisposta && `${n.conRisposta} con risposta`].filter(Boolean);
  return html`<details class="blocco riquadro-osservazioni"${n.perIlPrezzo || daRivedere.length ? html` open` : ''}>
    <summary>Osservazioni sui documenti del cliente${pezzi.length ? html` <small class="nota">· ${pezzi.join(' · ')}</small>` : html` <small class="nota">· tutte chiarite</small>`}</summary>
    ${daRivedere.length ? html`<div class="avviso"><b>Risposte che cambiano il prezzo, scritte dopo l'ultimo salvataggio:</b> controlla i valori del preventivo e premi Salva
      (con più quantità, poi «Copia nelle altre quantità»).<ul>${daRivedere.map(x => html`<li>${x.testo} — <b>${x.risposta.da}</b>: ${x.risposta.testo}</li>`)}</ul></div>` : ''}
    <p class="nota">Valgono per tutti i preventivi della stessa quotazione e tornano nella pre-produzione della commessa.
      Per rispondere: <a href="/preventivi/documenti/${o.id}#da-controllare">${o.nome}</a>.</p>
    ${elencoOsservazioni(segnalazioni, { pacchettoId: o.id, momento: 'preventivo', modifica: false })}
  </details>`;
}
