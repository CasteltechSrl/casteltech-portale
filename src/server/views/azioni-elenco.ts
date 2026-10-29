/**
 * Elenchi con le caselle di spunta e i pulsanti in alto a destra (Adriano, 29/10/2026: come l'elenco Preventivi,
 * anche in Ordini, Commesse e negli altri elenchi dove serve). Si spuntano le righe e si preme Elimina, Duplica…
 * senza aprire ogni riga. Il comportamento nel browser sta in `public/elenco.js`.
 *
 * Uso: `modulo.apri` prima della tabella, `casellaTutti()` come prima colonna dell'intestazione,
 * `casella(id, …)` come prima colonna di ogni riga, `modulo.chiudi` dopo la tabella.
 */
import { html, raw, type Raw } from './html.js';

/** Come si chiamano le righe dell'elenco (per "Nessun preventivo selezionato", "3 commesse selezionate"…). */
export interface NomeRighe { singolare: string; plurale: string; femminile?: boolean }

/** Un pulsante della barra. */
export interface PulsanteAzione {
  azione: string;
  testo: string;
  /** '1' = una sola riga (o un solo gruppo, es. un solo ordine), '1+' = una o più. */
  serve: '1' | '1+';
  titolo?: string;
  pericolo?: boolean;
  /** Domanda di conferma prima di inviare: {n} = righe spuntate, {g} = gruppi (es. ordini), {o|i} = singolare|plurale secondo {n}. */
  chiedi?: string;
  /** Apre il risultato in una scheda nuova (es. stampa). */
  nuovaScheda?: boolean;
}

/** Nome dei gruppi quando le righe appartengono a qualcosa di più grande (righe → ordini). */
export interface NomeGruppi { singolare: string; plurale: string }

/** Testo "Nessun … selezionato", "1 selezionato", "{n} selezionati" (anche al femminile). */
export function testiSelezione(nome: NomeRighe) {
  const f = nome.femminile;
  return {
    nessuno: `Nessun${f ? 'a' : ''} ${nome.singolare} selezionat${f ? 'a' : 'o'}`,
    uno: `1 ${nome.singolare} selezionat${f ? 'a' : 'o'}`,
    tanti: `{n} ${nome.plurale} selezionat${f ? 'e' : 'i'}`,
  };
}

/** Modulo con la barra dei pulsanti: `apri` va prima della tabella, `chiudi` dopo. */
export function moduloAzioni(opz: { azione: string; nome: NomeRighe; pulsanti: PulsanteAzione[]; gruppi?: NomeGruppi; extra?: Raw }): { apri: Raw; chiudi: Raw } {
  const t = testiSelezione(opz.nome);
  const apri = html`<form method="post" action="${opz.azione}" class="azioni-elenco" data-nessuno="${t.nessuno}" data-uno="${t.uno}" data-tanti="${t.tanti}"
      ${opz.gruppi ? html`data-gruppo-uno="${opz.gruppi.singolare}" data-gruppo-tanti="${opz.gruppi.plurale}"` : ''}>
    ${opz.extra ?? ''}
    <div class="barra-azioni">
      <span class="nota n-selezionati">${t.nessuno}</span>
      ${opz.pulsanti.map(p => html`<button name="azione" value="${p.azione}" data-serve="${p.serve}" disabled
        ${p.pericolo ? raw('class="pericolo"') : ''} ${p.titolo ? html`title="${p.titolo}"` : ''}
        ${p.chiedi ? html`data-chiedi="${p.chiedi}"` : ''} ${p.nuovaScheda ? raw('formtarget="_blank"') : ''}>${p.testo}</button>`)}
    </div>`;
  return { apri, chiudi: raw('</form>') };
}

/** Prima cella dell'intestazione: spunta tutte le righe. */
export const casellaTutti = () =>
  raw('<th class="selezione"><input type="checkbox" class="seleziona-tutti" title="Seleziona tutti" aria-label="Seleziona tutti"></th>');

/** Prima cella di una riga. `gruppo` = a cosa appartiene la riga (es. l'ordine), per i pulsanti che valgono per un gruppo solo. */
export const casella = (id: number | string, etichetta: string, gruppo?: number | string) =>
  html`<td class="selezione"><input type="checkbox" name="ids" value="${id}" aria-label="${`Seleziona ${etichetta}`}"${gruppo != null ? html` data-gruppo="${gruppo}"` : ''}></td>`;

/** Le righe spuntate arrivate dal modulo (numeri interi positivi, senza doppioni). */
export function idsSpuntati(body: unknown): number[] {
  const v = (body as { ids?: unknown } | undefined)?.ids;
  return [...new Set(([] as unknown[]).concat(v ?? []).map(Number).filter(n => Number.isInteger(n) && n > 0))];
}

/** Torna all'elenco da cui si è partiti (stessa vista e ricerca) con il messaggio dell'esito al posto di quello vecchio. */
export function conMessaggio(indirizzo: string, msg: string): string {
  const u = new URL(indirizzo, 'http://portale');
  u.searchParams.set('msg', msg);
  return u.pathname + u.search;
}
