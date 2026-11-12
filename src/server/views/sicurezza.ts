/**
 * Pezzi di pagina della Sicurezza usati anche altrove: il riquadro "Schede di sicurezza" nella pagina dell'ordine a fornitore
 * e del DDT ricevuto (Adriano 12/11/2026: "ogni volta che si fa un ordine o arriva un DDT, per le sostanze speciali verifica se ho la scheda").
 */
import { html, data, type Raw } from './html.js';
import { CATEGORIE_SOSTANZE, pittogrammi, statoScheda, descriviH, type CategoriaSostanza } from '../../engine/sicurezza.js';
import type { RigaControllata, SchedaDb } from '../sicurezza-servizio.js';

const oggi = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });

/** Etichette dei pericoli (pittogrammi) con il dettaglio delle frasi H nel titolo. */
export const etichettePericoli = (pericoli: string[]) => {
  const p = pittogrammi(pericoli);
  const titolo = pericoli.map(h => `${h} ${descriviH(h)}`.trim()).join('\n');
  return p.length ? html`<span class="pericoli" title="${titolo}">${p.map(x => html`<span class="etichetta pericolo-${x.codice}">${x.nome}</span> `)}</span>`
    : pericoli.length ? html`<span class="nota" title="${titolo}">${pericoli.join(' ')}</span>` : html`<span class="nota">non pericoloso</span>`;
};

/** Stato breve della scheda (in regola / revisione vecchia / solo scheda tecnica…). */
export const statoBreve = (s: SchedaDb) => {
  const st = statoScheda(s, oggi());
  return html`<span class="esito ${st.livello === 'ok' ? 'ok' : 'verifica'}">${st.testo}</span>`;
};

/** Link alla scheda: il PDF se c'è, altrimenti la pagina della scheda nel portale. */
export const linkScheda = (s: SchedaDb) => html`<a href="/sicurezza/schede/${s.id}">${s.prodotto}</a>${s.ha_file ? html` · <a href="/sicurezza/schede/${s.id}/pdf" target="_blank" rel="noopener">PDF</a>` : ''}`;

/** Riquadro nella pagina di un ordine a fornitore o di un DDT ricevuto. Niente sostanze = niente riquadro. */
export function riquadroSchede(righe: RigaControllata[], torna: string): Raw | string {
  if (!righe.length) return '';
  const mancano = righe.filter(r => !r.scheda);
  return html`<div class="blocco riquadro-sds" id="schede-sicurezza">
    <h2>Schede di sicurezza ${mancano.length ? html`<span class="esito verifica">${mancano.length} da trovare</span>` : html`<span class="esito ok">tutte presenti</span>`}</h2>
    <p class="nota">Le righe con sostanze (paste, stagno, flussanti, solventi, coating, colle) e la loro scheda di sicurezza. Quelle che mancano il portale le cerca su internet
      da solo quando l'ordine si emette o il DDT si conferma; puoi anche cercarle subito o caricare il PDF dal menu Sicurezza.</p>
    <table class="elenco"><thead><tr><th>Riga</th><th>Tipo</th><th>Scheda</th><th>Pericoli</th><th></th></tr></thead>
      <tbody>${righe.map(r => html`<tr>
        <td>${r.codice ? html`<b>${r.codice}</b> ` : ''}${r.descrizione}</td>
        <td>${CATEGORIE_SOSTANZE[r.categoria as CategoriaSostanza]}</td>
        <td>${r.scheda ? html`${linkScheda(r.scheda)}<br>${statoBreve(r.scheda)}`
          : html`<span class="esito verifica">manca</span>${r.ricerca ? html`<br><small class="nota">${r.ricerca.nota ?? r.ricerca.esito} (${data(String(r.ricerca.cercata_il).slice(0, 10))})</small>` : ''}`}</td>
        <td>${r.scheda ? etichettePericoli(r.scheda.pericoli) : ''}</td>
        <td>${r.scheda ? '' : html`<form method="post" action="/sicurezza/controllo/cerca" class="in-linea" data-conferma="Cercare su internet la scheda di sicurezza? Costa circa 2 centesimi e può volerci un minuto.">
          <input type="hidden" name="codice" value="${r.codice ?? ''}"><input type="hidden" name="descrizione" value="${r.descrizione}"><input type="hidden" name="torna" value="${torna}">
          <button class="piccolo">Cerca su internet</button></form>`}</td></tr>`)}</tbody></table>
  </div>`;
}
