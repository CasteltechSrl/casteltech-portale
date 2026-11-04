/**
 * Pagina della bozza di fattura / nota / autofattura: campo "Esigibilità IVA" e riquadro "Attributi avanzati fattura elettronica"
 * (Adriano 4/11/2026, come in Fatture in Cloud). Regole e catalogo dei campi in src/engine/attributi-fatturapa.ts,
 * comportamento della pagina (spunta, ricerca) in public/attributi-fattura.js.
 */
import { html, raw, type Raw } from './html.js';
import { alberoAttributi, attributiAutomatici, confrontaChiavi, nomeAttributo } from '../../engine/attributi-fatturapa.js';
import { ESIGIBILITA_IVA } from '../../engine/fatturapa.js';

/** Menu "Esigibilità IVA": vuoto nel database = Immediata (o split payment se il cliente lo ha). */
export function campoEsigibilita(scelta: string | null | undefined, split: boolean): Raw {
  const attuale = scelta && ESIGIBILITA_IVA[scelta] ? scelta : split ? 'S' : 'I';
  return html`<label>Esigibilità IVA <select name="esigibilita_iva">${Object.entries(ESIGIBILITA_IVA).map(([k, v]) =>
    html`<option value="${k}" ${k === attuale ? raw('selected') : ''}>${v}</option>`)}</select></label>
    <span class="nota">Immediata = quasi sempre. Differita = IVA dovuta all'incasso (art. 6 c. 5 DPR 633/72, es. enti pubblici senza split).
      Split payment solo per i clienti con la spunta nei Dati fiscali.</span>`;
}

const elencoAutomatici = (xml: string) => attributiAutomatici(xml).map(a => `${a.chiave} - ${a.nome}: ${a.valore}`);

/** Riquadro apribile nel modulo della bozza: albero dei campi con spunta + valore e ricerca. */
export function riquadroAttributi(xmlBase: string | undefined, valori: Record<string, string> | null | undefined): Raw {
  if (!xmlBase) return html``;
  const salvati = valori ?? {};
  const righe = alberoAttributi(xmlBase, salvati);
  const impostati = Object.keys(salvati).length;
  const automatici = elencoAutomatici(xmlBase);
  return html`<details class="attributi-avanzati" ${impostati ? raw('open') : ''}>
    <summary>Attributi avanzati fattura elettronica${impostati ? ` (${impostati} impostati)` : ''}</summary>
    <input type="hidden" name="attributi_presenti" value="1">
    <p class="nota">Campi in più della fattura elettronica, per i clienti che li chiedono (contratto, trasporto, periodo di una riga, altri dati gestionali…).
      Spunta il campo e scrivi il valore: va nell'XML al posto giusto e vince su quello automatico (scritto in grigio). Date come gg/mm/aaaa.
      Importi, numero, date e tipo del documento li calcola il portale e non sono qui.</p>
    ${automatici.length ? html`<div class="nota attributi-automatici"><strong>Altri attributi (impostati in automatico):</strong>
      ${automatici.map(a => html`<br>${a}`)}</div>` : ''}
    <input type="search" class="cerca-attributi" placeholder="Cerca tra gli attributi (es. trasporto, 2.1.9, CIG)" aria-label="Cerca tra gli attributi">
    <div class="tabella-scorre"><table class="albero-attributi" data-non-ordinare>
      <tbody>${righe.map(r => r.foglia
        ? html`<tr class="foglia" data-chiave="${r.chiave}" data-cerca="${`${r.chiave} ${r.numero} ${r.nome} ${r.aiuto ?? ''}`.toLowerCase()}">
            <td class="liv-${Math.min(r.livello, 8)}" title="${r.aiuto ?? ''}">${r.chiave} - ${r.nome}</td>
            <td class="centro"><input type="checkbox" class="attr-spunta" ${r.valore ? raw('checked') : ''} aria-label="Usa ${r.nome}"></td>
            <td><input name="attributi[${r.chiave}]" value="${r.valore}" placeholder="${r.automatico}" class="attr-valore" ${r.valore ? '' : raw('disabled')}></td></tr>`
        : html`<tr class="gruppo" data-chiave="${r.chiave}" data-cerca="${`${r.chiave} ${r.numero} ${r.nome} ${r.aiuto ?? ''} ${r.nota ?? ''}`.toLowerCase()}">
            <td class="liv-${Math.min(r.livello, 8)}" colspan="3" title="${r.aiuto ?? ''}">${r.chiave} - ${r.nome}${r.nota ? html` <span class="nota">${r.nota === 'nuovo' ? '(nuovo)' : `(${r.nota})`}</span>` : ''}</td></tr>`)}
      </tbody></table></div>
  </details>`;
}

/** Documento emesso: esigibilità e attributi come sono finiti nell'XML. */
export function attributiEmesso(xml: string | null, valori: Record<string, string> | null | undefined): Raw {
  if (!xml) return html``;
  const scelti = Object.entries(valori ?? {}).sort(([x], [y]) => confrontaChiavi(x, y));
  const automatici = elencoAutomatici(xml);
  return html`<details class="nota"><summary>Attributi della fattura elettronica${scelti.length ? ` (${scelti.length} scritti a mano)` : ''}</summary>
    ${scelti.length ? html`<p><strong>Scritti a mano:</strong>${scelti.map(([k, v]) => html`<br>${k} - ${nomeAttributo(k)}: ${v}`)}</p>` : ''}
    <p><strong>Nel file XML:</strong>${automatici.map(a => html`<br>${a}`)}</p></details>`;
}
