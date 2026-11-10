/** Scelta dell'anno di riferimento dei cruscotti (Adriano 10/11/2026) e tabella dei clienti con il fatturato. */
import { html, euro, type Raw } from './html.js';
import { anniScelta, type ClienteFatturato } from '../../engine/anno-riferimento.js';

/** Tasti degli anni: il clic ricarica la pagina con `?anno=` (l'anno resta scelto anche negli altri cruscotti). */
export function sceltaAnno(anno: number, percorso: string, annoOggi: number): Raw {
  const sep = percorso.includes('?') ? '&' : '?';
  return html`<nav class="scelta-anno" aria-label="Anno di riferimento"><span>Anno:</span>${anniScelta(annoOggi).map(a =>
    html`<a href="${percorso}${sep}anno=${a}" class="${a === anno ? 'attivo' : ''}">${a}</a>`)}</nav>`;
}

/** Clienti con il fatturato dell'anno, confronto con l'anno prima e peso sul totale (link alla scheda del cliente). */
export function tabellaClientiFatturato(righe: ClienteFatturato[], anno: number, annoInCorso: boolean): Raw {
  if (!righe.length) return html`<p class="vuoto">Nessuna fattura nel ${anno} né nel ${anno - 1}.</p>`;
  const totale = righe.reduce((s, c) => s + c.fatturato, 0), prima = righe.reduce((s, c) => s + c.prima, 0);
  const clienti = righe.filter(c => c.fatturato > 0).length;
  const etPrima = annoInCorso ? `Stesso periodo ${anno - 1}` : `${anno - 1}`;
  return html`<p class="nota">${clienti} clienti fatturati nel ${anno}: fatture meno note di credito (una nota collegata conta nell'anno della fattura che storna),
      imponibile senza IVA${annoInCorso ? ', confronto con lo stesso periodo dell\'anno prima' : ''}.</p>
    <div class="tabella-scorre"><table class="elenco clienti-fatturato">
    <thead><tr><th>Cliente</th><th class="num">Fatturato ${anno}</th><th class="num">Fatture</th><th class="num">${etPrima}</th><th class="num">Variazione</th><th class="num">Peso</th></tr></thead>
    <tbody>${righe.map(c => html`<tr><td>${c.clienteId ? html`<a href="/anagrafiche/clienti/${c.clienteId}">${c.cliente}</a>` : c.cliente}</td>
      <td class="num"><b>${euro(c.fatturato)}</b></td><td class="num">${c.fatture || ''}</td><td class="num">${c.prima ? euro(c.prima) : ''}</td>
      <td class="num ${c.variazione != null && c.variazione < 0 ? 'negativo' : c.variazione != null && c.variazione > 0 ? 'positivo' : ''}">${c.variazione == null ? (c.fatturato > 0 && !c.prima ? 'nuovo' : '') : `${c.variazione > 0 ? '+' : ''}${c.variazione} %`}</td>
      <td class="num">${c.peso ? `${String(c.peso).replace('.', ',')} %` : ''}</td></tr>`)}</tbody>
    <tfoot><tr><td>Totale</td><td class="num"><b>${euro(totale)}</b></td><td></td><td class="num">${euro(prima)}</td><td></td><td></td></tr></tfoot></table></div>`;
}
