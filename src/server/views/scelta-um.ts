/**
 * Menu a tendina dell'unità di misura nelle righe dei documenti (Adriano 2/11/2026): fattura, nota di credito / debito, DDT.
 * Un valore vecchio che non è nell'elenco (storico FIC) resta visibile e salvato com'era, segnato "(com'era)".
 */
import { html, raw, type Raw } from './html.js';
import { UNITA_MISURA, UM_PREDEFINITA, siglaUm } from '../../engine/unita-misura.js';

export function sceltaUm(nome: string, valore: unknown, nuova = false): Raw {
  const scritto = String(valore ?? '').trim();
  const sigla = siglaUm(scritto) ?? (nuova && !scritto ? UM_PREDEFINITA : null);
  const vecchio = scritto && !siglaUm(scritto) ? scritto : '';
  return html`<select name="${nome}" class="scelta-um" data-predefinita="${UM_PREDEFINITA}" aria-label="Unità di misura">
      <option value="">—</option>
      ${vecchio ? html`<option value="${vecchio}" data-libero="1" selected>${vecchio} (com'era)</option>` : ''}
      ${UNITA_MISURA.map(u => html`<option value="${u.sigla}" title="${u.nome}" ${u.sigla === sigla ? raw('selected') : ''}>${u.sigla}</option>`)}
    </select>`;
}
