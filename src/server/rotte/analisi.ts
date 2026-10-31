/**
 * Amministrazione → Analisi (Adriano 31/10/2026): andamento, clienti, prodotti, acquisti e commenti di aiuto.
 * Conti in `engine/analisi.ts`; qui le query (solo lettura, all'apertura della pagina: niente controlli periodici) e la pagina.
 */
import { Router, type Request } from 'express';
import { q } from '../db.js';
import { layout } from '../views/layout.js';
import { html, num, raw, type Raw } from '../views/html.js';
import { menuAmministrazione, graficoMesi } from './cruscotto-amministrazione.js';
import {
  analisiClienti, analisiProdotti, commentiAnalisi, marginePreventivo, nomeCategoria, nomeMese, perMese, quotaPrimi, raggruppaAcquisti, variazionePct,
  type AcquistoAnalisi, type FatturaAnalisi, type IncassoAnalisi, type PreventivoProdotto, type RigaAnalisi,
} from '../../engine/analisi.js';

const oggiRoma = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
const euro = (n: number) => `${num(n, 0)} €`;
const pct = (v: number | null) => (v == null ? '' : `${v > 0 ? '+' : ''}${v}%`);
const NOME_CLIENTE = `coalesce(c.ragione_sociale, d.intestatario->>'ragione_sociale', d.intestatario->>'nome', '(senza nome)')`;
const STATI_OK = `d.stato NOT IN ('bozza', 'annullato', 'scartato')`;

async function caricaDati(anno: number, oggi: string) {
  const unAnnoFa = `${Number(oggi.slice(0, 4)) - 1}${oggi.slice(4)}`;
  const [fatture, righe, preventivi, acquisti, incassi, aperte] = await Promise.all([
    q<FatturaAnalisi>(`SELECT ${NOME_CLIENTE} AS cliente, d.tipo, to_char(d.data, 'YYYY-MM-DD') AS data, d.imponibile::float AS imponibile
      FROM documenti d LEFT JOIN clienti c ON c.id = d.cliente_id
      WHERE d.tipo IN ('fattura', 'nota_credito') AND ${STATI_OK} AND d.numero IS NOT NULL AND extract(year FROM d.data)::int IN ($1::int, $1::int - 1)`, [anno]),
    q<RigaAnalisi>(`SELECT upper(trim(r.codice)) AS codice, max(r.descrizione) AS descrizione, ${NOME_CLIENTE} AS cliente, d.tipo, to_char(d.data, 'YYYY-MM-DD') AS data,
        sum(r.quantita)::float AS quantita, sum(round(r.quantita * r.prezzo * (1 - coalesce(r.sconto, 0) / 100), 2))::float AS importo
      FROM documenti_righe r JOIN documenti d ON d.id = r.documento_id LEFT JOIN clienti c ON c.id = d.cliente_id
      WHERE d.tipo IN ('fattura', 'nota_credito') AND ${STATI_OK} AND d.numero IS NOT NULL AND NOT r.solo_descrizione AND coalesce(trim(r.codice), '') <> ''
        AND r.acconto_id IS NULL AND extract(year FROM d.data)::int IN ($1::int, $1::int - 1)
      GROUP BY 1, 3, 4, 5, d.id`, [anno]),
    q<{ codice: string; totali: any }>(`SELECT DISTINCT ON (upper(p.codice)) upper(p.codice) AS codice, pr.risultato->'totali' AS totali
      FROM preventivi pr JOIN prodotti_revisioni rv ON rv.id = pr.revisione_id JOIN prodotti p ON p.id = rv.prodotto_id
      WHERE pr.stato <> 'rifiutato' ORDER BY upper(p.codice), (pr.stato = 'accettato') DESC, pr.creato_il DESC`),
    q<AcquistoAnalisi>(`SELECT coalesce(f.ragione_sociale, d.intestatario->>'nome', d.intestatario->>'ragione_sociale', '(senza nome)') AS fornitore, d.categoria, d.tipo,
        to_char(d.data, 'YYYY-MM-DD') AS data, d.imponibile::float AS imponibile
      FROM documenti_ricevuti d LEFT JOIN fornitori_anagrafica f ON f.id = d.fornitore_id WHERE extract(year FROM d.data)::int IN ($1::int, $1::int - 1)`, [anno]),
    q<IncassoAnalisi>(`SELECT ${NOME_CLIENTE} AS cliente, to_char(d.data, 'YYYY-MM-DD') AS "dataDocumento", to_char(s.data, 'YYYY-MM-DD') AS scadenza,
        to_char(s.pagata_il, 'YYYY-MM-DD') AS incassata, s.importo::float AS importo
      FROM documenti_scadenze s JOIN documenti d ON d.id = s.documento_id LEFT JOIN clienti c ON c.id = d.cliente_id
      WHERE d.tipo = 'fattura' AND ${STATI_OK} AND s.pagata_il BETWEEN $1 AND $2 AND s.importo > 0`, [unAnnoFa, oggi]),
    q<{ cliente: string; importo: number; oltre60: boolean }>(`SELECT ${NOME_CLIENTE} AS cliente, sum(s.importo)::float AS importo, bool_or(s.data < $1::date - 60) AS oltre60,
        sum(CASE WHEN s.data < $1::date - 60 THEN s.importo ELSE 0 END)::float AS importo60
      FROM documenti_scadenze s JOIN documenti d ON d.id = s.documento_id LEFT JOIN clienti c ON c.id = d.cliente_id
      WHERE d.tipo = 'fattura' AND ${STATI_OK} AND s.pagata_il IS NULL AND s.data < $1 GROUP BY 1 ORDER BY 2 DESC`, [oggi]),
  ]);
  const mappaPreventivi = new Map<string, PreventivoProdotto>(preventivi.map(p => [p.codice,
    { codice: p.codice, prezzoScheda: Number(p.totali?.prezzoSchedaSecondoLotto) || 0, marginePct: marginePreventivo(p.totali) }]));
  return { fatture, righe, preventivi: mappaPreventivi, acquisti, incassi, aperte: aperte as (typeof aperte[number] & { importo60: number })[] };
}

export function rotteAnalisi() {
  const r = Router();
  r.get('/', async (req: Request, res) => {
    const oggi = oggiRoma(), annoOggi = Number(oggi.slice(0, 4));
    const anno = Math.min(annoOggi, Math.max(2019, Number(req.query.anno) || annoOggi));
    const finoA = anno === annoOggi ? oggi : null;
    const periodo = { anno, finoA };
    const d = await caricaDati(anno, oggi);

    const fatturatoMesi = perMese(d.fatture, f => f.imponibile, anno), fatturatoPrimaMesi = perMese(d.fatture, f => f.imponibile, anno - 1);
    const acquistiMesi = perMese(d.acquisti, a => a.imponibile, anno);
    const somma = (v: number[], fino = 12) => v.slice(0, fino).reduce((s, x) => s + x, 0);
    const fatturato = somma(perMese(d.fatture, f => f.imponibile, anno, finoA)), fatturatoPrima = somma(perMese(d.fatture, f => f.imponibile, anno - 1, finoA));
    const acquisti = somma(perMese(d.acquisti, a => a.imponibile, anno, finoA)), acquistiPrima = somma(perMese(d.acquisti, a => a.imponibile, anno - 1, finoA));
    const mesiChiusi = finoA ? Number(oggi.slice(5, 7)) - 1 : 12;
    const clienti = analisiClienti(periodo, d.fatture, d.righe, d.preventivi, d.incassi);
    const prodotti = analisiProdotti(periodo, d.righe, d.preventivi);
    const categorie = raggruppaAcquisti(periodo, d.acquisti, a => nomeCategoria(a.categoria));
    const fornitori = raggruppaAcquisti(periodo, d.acquisti, a => a.fornitore);
    const scaduto = d.aperte.reduce((s, x) => s + x.importo, 0);
    const commenti = commentiAnalisi({ periodo, fatturato, fatturatoPrima, acquisti, acquistiPrima, mesiChiusi, fatturatoMesiChiusi: somma(fatturatoMesi, mesiChiusi),
      fatturatoAnnoPrima: somma(fatturatoPrimaMesi), clienti, prodotti, scaduto,
      scadutoOltre60: d.aperte.filter(x => x.oltre60 && x.importo60 > 0).map(x => ({ cliente: x.cliente, importo: x.importo60 })) });
    const confronto = finoA ? `stesso periodo ${anno - 1}` : `${anno - 1}`;
    const resta = fatturato - acquisti, restaPrima = fatturatoPrima - acquistiPrima;
    const anni = Array.from({ length: annoOggi - 2019 + 1 }, (_, i) => annoOggi - i);
    const ICONE = { critico: '●', attenzione: '●', bene: '●' };

    const contenuto: Raw = html`
      <div class="intestazione-pagina"><h1>Analisi ${anno}</h1>
        <div class="azioni non-stampare"><button type="button" id="stampa">Stampa</button></div></div>
      <div class="non-stampare">${menuAmministrazione('analisi')}</div>
      <form class="cerca non-stampare" method="get"><select name="anno">${anni.map(a => html`<option ${a === anno ? raw('selected') : ''}>${a}</option>`)}</select><button>Mostra</button></form>
      <p class="nota">${finoA ? html`Dal 1° gennaio a oggi, confrontato con lo stesso periodo del ${anno - 1}.` : html`Anno intero, confrontato con il ${anno - 1}.`}
        Dalle fatture emesse e ricevute (anche lo storico di Fatture in Cloud), imponibili senza IVA. Non è il bilancio: mancano personale, ammortamenti e banca.</p>
      <div class="cifre">
        <div class="cifra"><span>Fatturato</span><b>${euro(fatturato)}</b><small>${pct(variazionePct(fatturato, fatturatoPrima))} sul ${confronto} (${euro(fatturatoPrima)})</small></div>
        <div class="cifra"><span>Acquisti</span><b>${euro(acquisti)}</b><small>${pct(variazionePct(acquisti, acquistiPrima))} sul ${confronto} (${euro(acquistiPrima)})</small></div>
        <div class="cifra"><span>Resta dopo gli acquisti</span><b>${euro(resta)}</b><small>${fatturato > 0 ? `${Math.round((resta / fatturato) * 100)}% del fatturato` : ''}${fatturatoPrima > 0
          ? ` · anno prima ${Math.round((restaPrima / fatturatoPrima) * 100)}%` : ''}; da qui si pagano personale e spese generali</small></div>
        <div class="cifra"><span>Primi 3 clienti</span><b>${quotaPrimi(clienti, 3)}%</b><small>del fatturato · primi 5: ${quotaPrimi(clienti, 5)}%</small></div>
      </div>
      <h2>Cosa dicono i numeri</h2>
      ${commenti.length ? html`<ul class="commenti-analisi">${commenti.map(c => html`<li class="${c.livello}"><span class="pallino" aria-hidden="true">${ICONE[c.livello]}</span><div>${c.testo}
          ${c.consiglio ? html`<div class="consiglio">Cosa fare: ${c.consiglio}</div>` : ''}</div></li>`)}</ul>`
        : html`<p class="nota">Pochi dati per un commento.</p>`}
      <p class="nota">Sono indicazioni calcolate sui numeri: le scelte restano tue e del commercialista.</p>
      <h2>Fatturato per mese</h2>
      <p class="legenda"><span class="campione fatturato"></span> ${anno} <span class="campione anno-prima"></span> ${anno - 1}</p>
      <div class="tabella-scorre grafico">${graficoMesi(fatturatoMesi, fatturatoPrimaMesi, ['fatturato', 'anno-prima'], [String(anno), String(anno - 1)])}</div>
      <div class="tabella-scorre"><table class="elenco">
        <thead><tr><th>Mese</th><th class="num">Fatturato ${anno}</th><th class="num">${anno - 1}</th><th class="num">Variazione</th><th class="num">Acquisti ${anno}</th><th class="num">Resta</th></tr></thead>
        <tbody>${fatturatoMesi.map((f, i) => (finoA && i > mesiChiusi) ? '' : html`<tr><td>${nomeMese(i + 1)}${finoA && i === mesiChiusi ? ' (in corso)' : ''}</td>
          <td class="num">${euro(f)}</td><td class="num">${euro(fatturatoPrimaMesi[i])}</td><td class="num">${finoA && i === mesiChiusi ? '' : pct(variazionePct(f, fatturatoPrimaMesi[i]))}</td>
          <td class="num">${euro(acquistiMesi[i])}</td><td class="num">${euro(f - acquistiMesi[i])}</td></tr>`)}</tbody></table></div>

      <h2>Clienti · ${clienti.filter(c => c.fatturato > 0).length}</h2>
      <p class="nota">Margine stimato = fatturato dei prodotti × margine dell'ultimo preventivo (copertura = quanta parte del fatturato ha un preventivo).
        Giorni di incasso = dalla data della fattura all'incasso, ultimi 12 mesi; ritardo = giorni dopo la scadenza.</p>
      <div class="tabella-scorre"><table class="elenco">
        <thead><tr><th>Cliente</th><th class="num">Fatturato</th><th class="num">Peso</th><th class="num">${confronto}</th><th class="num">Variazione</th>
          <th class="num">Margine stimato</th><th class="num">Giorni incasso</th><th class="num">Ritardo</th></tr></thead>
        <tbody>${clienti.slice(0, 40).map(c => html`<tr class="${c.variazione != null && c.variazione <= -30 ? 'scaduta' : ''}"><td>${c.cliente}</td><td class="num">${euro(c.fatturato)}</td>
          <td class="num">${c.quota ? `${num(c.quota, 1)}%` : ''}</td><td class="num">${euro(c.primaStessoPeriodo)}</td><td class="num">${pct(c.variazione)}</td>
          <td class="num">${c.margineStimato != null ? html`${euro(c.margineStimato)} <small class="tenue">(${c.copertura}%)</small>` : ''}</td>
          <td class="num">${c.giorniIncasso ?? ''}</td><td class="num">${c.ritardoMedio ? c.ritardoMedio : ''}</td></tr>`)}</tbody></table></div>
      ${clienti.length > 40 ? html`<p class="nota">Elencati i primi 40 di ${clienti.length}.</p>` : ''}

      <h2>Prodotti · ${prodotti.filter(p => p.fatturato > 0).length}</h2>
      <p class="nota">Righe di fattura con il codice prodotto. Prezzo del preventivo e margine = ultimo preventivo del codice (lotti successivi, senza una tantum).</p>
      <div class="tabella-scorre"><table class="elenco">
        <thead><tr><th>Codice</th><th>Cliente</th><th class="num">Schede</th><th class="num">Fatturato</th><th class="num">Prezzo medio</th><th class="num">Prezzo preventivo</th>
          <th class="num">Scarto</th><th class="num">Margine preventivo</th><th class="num">${confronto}</th></tr></thead>
        <tbody>${prodotti.slice(0, 40).map(p => html`<tr class="${(p.scartoPrezzo ?? 0) <= -5 || (p.marginePct ?? 100) < 10 ? 'scaduta' : ''}">
          <td title="${p.descrizione}">${p.codice}</td><td>${p.cliente}</td><td class="num">${num(p.schede, 0)}</td><td class="num">${euro(p.fatturato)}</td>
          <td class="num">${p.prezzoMedio != null ? `${num(p.prezzoMedio, 2)} €` : ''}</td><td class="num">${p.prezzoPreventivo != null ? `${num(p.prezzoPreventivo, 2)} €` : ''}</td>
          <td class="num">${pct(p.scartoPrezzo)}</td><td class="num">${p.marginePct != null ? `${num(p.marginePct, 1)}%` : ''}</td><td class="num">${euro(p.fatturatoPrima)}</td></tr>`)}</tbody></table></div>
      ${prodotti.length > 40 ? html`<p class="nota">Elencati i primi 40 di ${prodotti.length}.</p>` : ''}

      <h2>Acquisti per categoria</h2>
      <div class="tabella-scorre"><table class="elenco">
        <thead><tr><th>Categoria</th><th class="num">${anno}</th><th class="num">Peso</th><th class="num">${confronto}</th><th class="num">Variazione</th></tr></thead>
        <tbody>${categorie.map(g => html`<tr><td>${g.nome}</td><td class="num">${euro(g.importo)}</td><td class="num">${g.quota ? `${num(g.quota, 1)}%` : ''}</td>
          <td class="num">${euro(g.prima)}</td><td class="num">${pct(g.variazione)}</td></tr>`)}</tbody></table></div>
      <h2>Primi fornitori</h2>
      <div class="tabella-scorre"><table class="elenco">
        <thead><tr><th>Fornitore</th><th class="num">${anno}</th><th class="num">Peso</th><th class="num">${confronto}</th><th class="num">Variazione</th></tr></thead>
        <tbody>${fornitori.slice(0, 15).map(g => html`<tr><td>${g.nome}</td><td class="num">${euro(g.importo)}</td><td class="num">${g.quota ? `${num(g.quota, 1)}%` : ''}</td>
          <td class="num">${euro(g.prima)}</td><td class="num">${pct(g.variazione)}</td></tr>`)}</tbody></table></div>
      <p class="nota">Per il dettaglio mese per mese: <a href="/amministrazione/ricevuti/mesi">Acquisti per fornitore e mese</a>.</p>`;
    res.send(String(layout({ titolo: `Analisi ${anno}`, utente: req.session.utente, attiva: 'amministrazione', contenuto, script: 'stampa.js', largo: true })));
  });
  return r;
}
