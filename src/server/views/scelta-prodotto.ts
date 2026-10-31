/**
 * Codice delle righe dei documenti scelto dall'anagrafica (Adriano 31/10/2026): fattura, nota di credito / debito, DDT, conferma d'ordine.
 * Menu Codice con SOLO i prodotti del cliente del documento (regola codice-cliente), voce "+ Nuovo prodotto…" che lo aggiunge
 * all'anagrafica senza uscire, "— senza codice —" per le righe di servizio scritte a parole. La descrizione arriva dall'anagrafica.
 * Un codice vecchio che non è in anagrafica (storico FIC, DDT di prima) resta visibile come "(non in anagrafica)".
 * Il comportamento sta in public/documenti.js.
 */
import { html, raw, type Raw } from './html.js';

export interface ProdottoScelta { id: number; codice: string; descrizione: string | null }

const chiave = (s: unknown) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Prodotto della riga: per id, altrimenti per codice uguale tra quelli del cliente. */
export function prodottoDellaRiga(x: { codice?: string | null; prodotto_id?: number | string | null }, prodotti: ProdottoScelta[]): ProdottoScelta | null {
  const id = Number(x.prodotto_id) || 0;
  return (id ? prodotti.find(p => p.id === id) : undefined) ?? (x.codice ? prodotti.find(p => chiave(p.codice) === chiave(x.codice)) : undefined) ?? null;
}

/** Cella Codice: menu dei prodotti del cliente + campo nascosto con il codice (quello che va nel documento). */
export function cellaCodice(x: { codice?: string | null; prodotto_id?: number | string | null }, i: number, prodotti: ProdottoScelta[]): Raw {
  const scelto = prodottoDellaRiga(x, prodotti);
  const libero = !scelto && x.codice ? String(x.codice) : '';
  return html`<select name="righe[${i}][prodotto_id]" class="scelta-prodotto" aria-label="Codice dall'anagrafica del cliente">
      <option value="" data-codice="">— senza codice —</option>
      ${libero ? html`<option value="" data-codice="${libero}" data-libero="1" selected>${libero} (non in anagrafica)</option>` : ''}
      ${prodotti.map(p => html`<option value="${p.id}" data-codice="${p.codice}" data-descrizione="${p.descrizione ?? ''}" ${scelto?.id === p.id ? raw('selected') : ''}>${p.codice}</option>`)}
      <option value="nuovo">+ Nuovo prodotto…</option>
    </select><input type="hidden" name="righe[${i}][codice]" value="${scelto?.codice ?? libero}">`;
}

/** Descrizione della riga: dal prodotto scelto (sola lettura), libera per le righe senza codice. */
export function cellaDescrizione(x: { codice?: string | null; prodotto_id?: number | string | null; descrizione?: string | null }, i: number, prodotti: ProdottoScelta[], classe = ''): Raw {
  const scelto = prodottoDellaRiga(x, prodotti);
  return html`<input name="righe[${i}][descrizione]" value="${x.descrizione || scelto?.descrizione || ''}" class="${classe}"
    ${scelto ? raw('readonly title="Descrizione dall\'anagrafica del prodotto (si cambia in Anagrafiche → Prodotti)"') : ''}>`;
}

/**
 * Riquadri sotto le righe: prodotto nuovo (codice + descrizione, MAIUSCOLO, va nell'anagrafica del cliente) e domanda
 * "aggiorno l'anagrafica?" quando un prezzo scritto a mano è diverso da quello del listino.
 */
export function riquadriSceltaProdotto(clienteId: number | null): Raw {
  return html`<div id="np-riga" class="nuovo-prodotto" data-cliente="${clienteId ?? ''}" hidden>
      <p class="nota">Prodotto nuovo per questo cliente: va subito in Anagrafiche → Prodotti (tutto in maiuscolo).</p>
      <div class="riga-campi">
        <label>Codice <input id="np-riga-codice" class="maiuscolo" maxlength="60"></label>
        <label class="largo">Descrizione <input id="np-riga-descrizione" class="maiuscolo" maxlength="200"></label>
      </div>
      <div class="azioni-riga"><button type="button" id="np-riga-aggiungi" class="primario">Aggiungi in anagrafica</button>
        <button type="button" id="np-riga-annulla" class="link">Annulla</button><span id="np-riga-esito" class="nota"></span></div>
    </div>
    <div id="domanda-prezzo" class="nuovo-prodotto" hidden>
      <p id="domanda-prezzo-testo"></p>
      <div class="azioni-riga"><button type="button" id="domanda-prezzo-si" class="primario">Sì, aggiorna l'anagrafica</button>
        <button type="button" id="domanda-prezzo-no">No, solo in questo documento</button><span id="domanda-prezzo-esito" class="nota"></span></div>
    </div>`;
}
