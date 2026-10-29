/**
 * Amministrazione → Cruscotto (pagina iniziale del menu, Adriano 27/10/2026): fatturato e acquisti dell'anno,
 * incassi e pagamenti in scadenza, DDT da fatturare, bozze da finire. I conti stanno in engine/cruscotto-amministrazione.ts.
 */
import { q } from '../db.js';
import { html, data, euro, num, type Raw } from '../views/html.js';
import { numeroCompleto } from '../../engine/amministrazione.js';
import { NOMI_FASCE, fasciaScadenza, imponibilePerMese, riepilogoScadenze, variazione, type Fascia } from '../../engine/cruscotto-amministrazione.js';

const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const oggiRoma = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
const MOSTRATE = 12;   // scadenze elencate per riquadro (le altre sono nei totali)

/** Tasti in cima a tutte le pagine dell'Amministrazione. */
export function menuAmministrazione(attiva: 'cruscotto' | 'documenti' | 'ricevuti'): Raw {
  const voci = [['cruscotto', '/amministrazione', 'Cruscotto'], ['documenti', '/amministrazione/documenti', 'Documenti emessi'],
    ['ricevuti', '/amministrazione/ricevuti', 'Fatture fornitori']] as const;
  return html`<nav class="tasti-sezione">${voci.map(([k, href, nome]) => html`<a href="${href}" class="${k === attiva ? 'attivo' : ''}">${nome}</a>`)}
    <a href="/impostazioni/amministrazione">Impostazioni</a></nav>`;
}

interface Scadenza { id: number; data: string; importo: number; documento_id: number; numero: string; nome: string }

export async function contenutoCruscotto(): Promise<Raw> {
  const oggi = oggiRoma();
  const anno = Number(oggi.slice(0, 4));
  const meseCorrente = Number(oggi.slice(5, 7));
  const [emessi, ricevuti, incassi, pagamenti, ddt, bozze] = await Promise.all([
    q(`SELECT tipo, data, imponibile FROM documenti
      WHERE tipo IN ('fattura', 'nota_credito') AND stato NOT IN ('bozza', 'annullato') AND anno IN ($1::int, $1::int - 1)`, [anno]),
    q(`SELECT tipo, data, imponibile FROM documenti_ricevuti WHERE extract(year FROM data)::int IN ($1::int, $1::int - 1)`, [anno]),
    q<Scadenza & { numero_doc: number; sezionale: string; anno: number }>(`SELECT s.id, s.data, s.importo, d.id AS documento_id, d.numero AS numero_doc, d.sezionale, d.anno,
        coalesce(c.ragione_sociale, d.intestatario->>'ragione_sociale', d.intestatario->>'nome', '') AS nome
      FROM documenti_scadenze s JOIN documenti d ON d.id = s.documento_id LEFT JOIN clienti c ON c.id = d.cliente_id
      WHERE s.pagata_il IS NULL AND d.tipo = 'fattura' AND d.stato NOT IN ('bozza', 'annullato') ORDER BY s.data, d.numero`),
    q<Scadenza>(`SELECT s.id, s.data, s.importo, d.id AS documento_id, d.numero, coalesce(f.ragione_sociale, d.intestatario->>'nome', '') AS nome
      FROM documenti_ricevuti_scadenze s JOIN documenti_ricevuti d ON d.id = s.documento_id LEFT JOIN fornitori_anagrafica f ON f.id = d.fornitore_id
      WHERE s.pagata_il IS NULL AND d.tipo = 'fattura' ORDER BY s.data, d.id`),
    q<{ nome: string; quanti: number; ultimo: string }>(`SELECT coalesce(c.ragione_sociale, d.intestatario->>'ragione_sociale', d.intestatario->>'nome', '?') AS nome,
        count(*)::int AS quanti, max(d.data) AS ultimo
      FROM documenti d LEFT JOIN clienti c ON c.id = d.cliente_id
      WHERE d.tipo = 'ddt' AND d.fattura_id IS NULL AND d.stato NOT IN ('bozza', 'annullato') GROUP BY 1 ORDER BY 2 DESC, 1`),
    q(`SELECT d.id, d.tipo, d.data, coalesce(c.ragione_sociale, f.ragione_sociale, '') AS nome FROM documenti d LEFT JOIN clienti c ON c.id = d.cliente_id
      LEFT JOIN fornitori_anagrafica f ON f.id = d.fornitore_id WHERE d.stato = 'bozza' AND d.tipo <> 'conferma_ordine' ORDER BY d.creato_il DESC`),
  ]);

  const somma = (v: number[]) => Math.round(v.reduce((s, x) => s + x, 0) * 100) / 100;
  const fatturato = imponibilePerMese(emessi, anno), fatturatoPrima = imponibilePerMese(emessi, anno - 1, oggi);
  const acquisti = imponibilePerMese(ricevuti, anno), acquistiPrima = imponibilePerMese(ricevuti, anno - 1, oggi);
  const inc = riepilogoScadenze(incassi, oggi), pag = riepilogoScadenze(pagamenti, oggi);
  const confronto = (attuale: number, prima: number) => {
    const v = variazione(attuale, prima);
    return html`stesso periodo ${anno - 1}: ${euro(prima)}${v == null ? '' : html` <span class="${v >= 0 ? 'positivo' : 'negativo'}">(${v > 0 ? '+' : ''}${v} %)</span>`}`;
  };
  const rate = (n: number) => (n === 1 ? '1 rata' : `${n} rate`);
  const ddtTotale = ddt.reduce((s, x) => s + x.quanti, 0);

  return html`
    <div class="cifre">
      <div class="cifra"><span>Fatturato ${anno}</span><b>${euro(somma(fatturato))}</b><small>${confronto(somma(fatturato), somma(fatturatoPrima))}</small></div>
      <div class="cifra"><span>Acquisti ${anno}</span><b>${euro(somma(acquisti))}</b><small>${confronto(somma(acquisti), somma(acquistiPrima))}</small></div>
      <div class="cifra"><span>Da incassare</span><b>${euro(inc.totale)}</b><small>${inc.fasce.scaduta.quante
        ? html`<span class="negativo">${euro(inc.fasce.scaduta.totale)} scaduti</span> (${rate(inc.fasce.scaduta.quante)})` : 'nessuna rata scaduta'}</small></div>
      <div class="cifra"><span>Da pagare</span><b>${euro(pag.totale)}</b><small>${pag.fasce.scaduta.quante
        ? html`<span class="negativo">${euro(pag.fasce.scaduta.totale)} scaduti</span> (${rate(pag.fasce.scaduta.quante)})` : 'nessuna rata scaduta'}</small></div>
    </div>
    <h2>Fatturato e acquisti per mese (${anno})</h2>
    <div class="legenda"><span class="campione fatturato"></span> fatturato <span class="campione acquisti"></span> acquisti (imponibile, note di credito tolte)</div>
    <div class="tabella-scorre grafico">${graficoMesi(fatturato.slice(0, meseCorrente), acquisti.slice(0, meseCorrente))}</div>
    <div class="due-colonne">
      <section><h2>Incassi in scadenza</h2>${riquadroScadenze(inc.fasce, incassi.map(s => ({ ...s, numero: numeroCompleto(s.numero_doc, s.sezionale) + (s.anno === anno ? '' : ` del ${s.anno}`) })), oggi,
        '/amministrazione/documenti/', 'Nessun incasso aperto.')}</section>
      <section><h2>Pagamenti in scadenza</h2>${riquadroScadenze(pag.fasce, pagamenti, oggi, '/amministrazione/ricevuti/', 'Nessun pagamento aperto.')}
        <p class="nota"><a href="/amministrazione/ricevuti?da_pagare=1">Tutte le fatture fornitori da pagare →</a></p></section>
    </div>
    <div class="due-colonne">
      <section><h2>DDT da fatturare</h2>
        ${ddt.length ? html`<p class="nota">${ddtTotale} DDT di ${ddt.length} clienti (compresi resi e riparazioni non da fatturare).</p>
          <div class="tabella-scorre"><table class="elenco"><thead><tr><th>Cliente</th><th class="num">DDT</th><th>Ultimo</th></tr></thead>
          <tbody>${ddt.slice(0, MOSTRATE).map(x => html`<tr><td>${x.nome}</td><td class="num">${x.quanti}</td><td>${data(x.ultimo)}</td></tr>`)}</tbody></table></div>
          <p class="nota"><a href="/amministrazione/documenti?tipo=ddt">Elenco dei DDT →</a> · si fatturano da "+ Nuova fattura" scegliendo il cliente.</p>`
          : html`<p class="vuoto">Nessun DDT da fatturare.</p>`}</section>
      <section><h2>Bozze da finire</h2>
        ${bozze.length ? html`<ul>${bozze.map(b => html`<li><a href="/amministrazione/documenti/${b.id}">${({ nota_credito: 'Nota di credito', autofattura: 'Autofattura' } as Record<string, string>)[b.tipo] ?? 'Fattura'}
          ${b.nome}</a> <span class="nota">del ${data(b.data)}</span></li>`)}</ul>` : html`<p class="vuoto">Nessuna bozza.</p>`}
        <p><a href="/amministrazione/documenti/nuovo?tipo=fattura" class="bottone primario">+ Nuova fattura</a></p></section>
    </div>`;
}

function riquadroScadenze(fasce: Record<Fascia, { totale: number; quante: number }>, scadenze: Scadenza[], oggi: string, link: string, vuoto: string): Raw {
  if (!scadenze.length) return html`<p class="vuoto">${vuoto}</p>`;
  const vicine = scadenze.filter(s => fasciaScadenza(s.data, oggi) !== 'oltre').slice(0, MOSTRATE);
  return html`<p class="nota">${(Object.keys(NOMI_FASCE) as Fascia[]).filter(f => fasce[f].quante)
      .map((f, i) => html`${i ? ' · ' : ''}${NOMI_FASCE[f].toLowerCase()} ${euro(fasce[f].totale)}`)}</p>
    ${vicine.length ? html`<div class="tabella-scorre"><table class="elenco"><thead><tr><th>Scadenza</th><th>Intestatario</th><th>Documento</th><th class="num">Importo</th></tr></thead>
      <tbody>${vicine.map(s => html`<tr class="${fasciaScadenza(s.data, oggi) === 'scaduta' ? 'scaduta' : ''}"><td>${data(s.data)}</td><td>${s.nome}</td>
        <td><a href="${link}${s.documento_id}">n. ${s.numero}</a></td><td class="num">${euro(s.importo)}</td></tr>`)}</tbody></table></div>
      ${scadenze.length > vicine.length ? html`<p class="nota">Elencate le prime ${vicine.length} scadute o entro 30 giorni.</p>` : ''}`
      : html`<p class="nota">Niente di scaduto o in scadenza nei prossimi 30 giorni.</p>`}`;
}

/** Barre affiancate per mese (SVG, senza script), stessa grafica del cruscotto Ordini. */
function graficoMesi(fatturato: number[], acquisti: number[]): Raw {
  const L = 64, A = 240, passo = 60, barra = 20, W = L + fatturato.length * passo + 10, H = A + 30;
  const max = Math.max(1, ...fatturato, ...acquisti);
  const p = 10 ** Math.floor(Math.log10(max));
  const scala = [1, 2, 2.5, 5, 10].map(k => k * p).find(v => v >= max) ?? max;
  const y = (v: number) => A - (Math.max(0, v) / scala) * (A - 10);
  const etichetta = (v: number) => (v >= 1000 ? `${num(v / 1000, 0)}k` : num(v, 0));
  const colonna = (classe: string, x: number, v: number) => (v > 0 ? html`<rect class="${classe}" x="${x}" y="${y(v)}" width="${barra}" height="${Math.max(1, A - y(v))}" rx="2"/>` : '');
  return html`<svg class="grafico-mesi" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Fatturato e acquisti per mese">
    ${[0, 0.25, 0.5, 0.75, 1].map(f => html`<line class="griglia" x1="${L}" x2="${W - 5}" y1="${y(scala * f)}" y2="${y(scala * f)}"/>
      <text class="asse" x="${L - 6}" y="${y(scala * f) + 4}" text-anchor="end">${etichetta(scala * f)}</text>`)}
    ${fatturato.map((f, i) => {
      const x = L + i * passo + (passo - 2 * barra - 2) / 2;
      return html`<g class="mese"><title>${MESI[i]}: fatturato ${euro(f)}, acquisti ${euro(acquisti[i])}</title>
        <rect class="sfondo" x="${x - 6}" y="0" width="${2 * barra + 14}" height="${A}"/>
        ${colonna('fatturato', x, f)}${colonna('acquisti', x + barra + 2, acquisti[i])}
        <text class="asse" x="${x + barra + 1}" y="${A + 16}" text-anchor="middle">${MESI[i]}</text></g>`;
    })}
    <line class="base" x1="${L}" x2="${W - 5}" y1="${A}" y2="${A}"/>
  </svg>`;
}
