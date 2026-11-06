/**
 * Amministrazione → Analisi (Adriano 31/10/2026): andamento, clienti, prodotti, acquisti e commenti di aiuto.
 * Conti in `engine/analisi.ts`; qui le query (solo lettura, all'apertura della pagina: niente controlli periodici) e la pagina.
 */
import { Router, type Request } from 'express';
import { q, q1 } from '../db.js';
import { eUfficio, vedePaghe } from '../../engine/ruoli.js';
import { layout } from '../views/layout.js';
import { html, num, raw, type Raw } from '../views/html.js';
import { menuAmministrazione, graficoMesi } from './cruscotto-amministrazione.js';
import {
  analisiClienti, analisiProdotti, commentiAnalisi, marginePreventivo, nomeMese, perMese, quotaPrimi, raggruppaAcquisti, variazionePct,
  type AcquistoAnalisi, type FatturaAnalisi, type IncassoAnalisi, type PreventivoProdotto, type RigaAnalisi,
} from '../../engine/analisi.js';
import { leggiImpostazioniCassa, NOMI_FINESTRE, type CodiceFinestra, type Movimento } from '../../engine/previsione-cassa.js';
import { caricaPrevisione, salvaImpostazioniCassa } from '../previsione-cassa-servizio.js';
import { excelSemplice, inviaExcel, nomeExcel } from '../excel.js';
import { rotteAnalisiProdotti } from './analisi-prodotti.js';
import { rotteAnalisiAcquisti } from './analisi-acquisti.js';
import { rottePareggio } from './pareggio.js';
import { rotteAnalisiCosti } from './analisi-costi.js';
import { classificaCosti } from '../../engine/analisi-costi.js';
import { categoria as categoriaCosto, NOMI_MACRO } from '../../engine/categorie-acquisti.js';
import { regoleCategorie, righeCosti } from '../analisi-costi-servizio.js';

const oggiRoma = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
const euro = (n: number) => `${num(n, 0)} €`;
const pct = (v: number | null) => (v == null ? '' : `${v > 0 ? '+' : ''}${v}%`);
const NOME_CLIENTE = `coalesce(c.ragione_sociale, d.intestatario->>'ragione_sociale', d.intestatario->>'nome', '(senza nome)')`;
const STATI_OK = `d.stato NOT IN ('bozza', 'annullato', 'scartato')`;

export async function caricaDatiAnalisi(anno: number, oggi: string) {
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

/** Le pagine dell'Analisi: andamento, prodotti e clienti (Adriano 5/11/2026), fornitori e punto di pareggio (6/11/2026) e previsione di cassa. */
export function tastiAnalisi(attiva: 'andamento' | 'prodotti' | 'clienti' | 'fornitori' | 'acquisti' | 'pareggio' | 'costi' | 'cassa'): Raw {
  return html`<nav class="tasti-sezione non-stampare">
    <a href="/amministrazione/analisi" class="${attiva === 'andamento' ? 'attivo' : ''}">Andamento</a>
    <a href="/amministrazione/analisi/prodotti" class="${attiva === 'prodotti' ? 'attivo' : ''}">Prodotti</a>
    <a href="/amministrazione/analisi/clienti" class="${attiva === 'clienti' ? 'attivo' : ''}">Clienti</a>
    <a href="/amministrazione/analisi/fornitori" class="${attiva === 'fornitori' ? 'attivo' : ''}">Fornitori</a>
    <a href="/amministrazione/analisi/acquisti" class="${attiva === 'acquisti' ? 'attivo' : ''}">Acquisti</a>
    <a href="/amministrazione/analisi/pareggio" class="${attiva === 'pareggio' ? 'attivo' : ''}">Punto di pareggio</a>
    <a href="/amministrazione/analisi/costi" class="${attiva === 'costi' ? 'attivo' : ''}">Costi per categoria</a>
    <a href="/amministrazione/analisi/cassa" class="${attiva === 'cassa' ? 'attivo' : ''}">🔒 Previsione di cassa</a></nav>`;
}

const euroCent = (n: number) => `${num(n, 2)} €`;
const dataIt = (d: string) => d.slice(0, 10).split('-').reverse().join('/');
const scritto = (n: number | null) => (n == null ? '' : String(n).replace('.', ','));
const conSegno = (n: number) => (n > 0 ? `+${euro(n)}` : euro(n));
const NOMI_TIPO: Record<Movimento['tipo'], string> = { incasso: 'Incasso', pagamento: 'Fornitore', uscita: 'Uscita fissa' };

function paginaCassa(req: Request, d: Awaited<ReturnType<typeof caricaPrevisione>>): Raw {
  const { previsione: p, impostazioni: i, auto } = d;
  const sola = !eUfficio(req.session.utente?.ruolo);
  const ICONE = { critico: '●', attenzione: '●', nota: '●' };
  const LIVELLO = { critico: 'critico', attenzione: 'attenzione', nota: 'bene' };
  const righeFinestra = (codice: CodiceFinestra) => p.movimenti.filter(m => m.finestra === codice);
  const tabellaMovimenti = (mv: Movimento[]) => html`<div class="tabella-scorre"><table class="elenco">
    <thead><tr><th>Data attesa</th><th>Tipo</th><th>Chi / voce</th><th>Documento</th><th>Scadenza</th><th class="num">Ritardo usato</th><th class="num">Importo</th></tr></thead>
    <tbody>${mv.map(m => html`<tr class="${m.scaduta ? 'scaduta' : ''}"><td>${dataIt(m.data)}</td><td>${NOMI_TIPO[m.tipo]}</td>
      <td>${m.nome} ${m.stima ? html`<span class="etichetta">stima</span>` : ''} ${m.scaduta ? html`<span class="etichetta prio-alta">scaduta</span>` : ''}</td>
      <td>${m.riferimento}</td><td>${m.scadenza ? dataIt(m.scadenza) : ''}</td><td class="num">${m.tipo === 'incasso' ? `${m.ritardo} gg` : ''}</td>
      <td class="num">${euroCent(m.importo)}</td></tr>`)}</tbody></table></div>`;
  const fissa = (nome: string, campo: string, valore: number | null, automatico: number | null, da: string | null, giorno?: [string, number]) => html`
    <label>${nome} € <input name="${campo}" inputmode="decimal" size="10" value="${scritto(valore)}" placeholder="${automatico != null ? scritto(automatico) : ''}"></label>
    ${giorno ? html`<label>giorno del mese <input name="${giorno[0]}" inputmode="numeric" size="3" value="${giorno[1]}"></label>` : ''}
    <small class="tenue">${valore != null ? 'scritto da voi' : automatico != null ? html`vuoto = stima ${euro(automatico)}: ${da}` : 'nessun dato nel portale: scrivilo tu'}</small>`;
  const altre = [...i.altre, ...Array(Math.max(0, 5 - i.altre.length)).fill({ voce: '', importo: 0, giorno: 1 })].slice(0, 5);

  return html`
    <div class="intestazione-pagina"><h1>Previsione di cassa</h1>
      <div class="azioni non-stampare"><a class="bottone" href="/amministrazione/analisi/cassa.xlsx">Excel</a> <button type="button" id="stampa">Stampa</button></div></div>
    <div class="non-stampare">${menuAmministrazione('analisi')}</div>
    ${tastiAnalisi('cassa')}
    <p class="nota">Prossimi 90 giorni da oggi (${dataIt(p.oggi)}), importi IVA compresa perché sono soldi che entrano ed escono.
      Incassi: rate aperte delle fatture spostate del ritardo medio di ogni cliente. Fornitori: rate aperte delle fatture ricevute.
      Uscite fisse: stipendi, F24 e IVA (veri quando ci sono, altrimenti stimati), più quelle che scrivete voi.</p>
    <div class="cifre">
      <div class="cifra"><span>Saldo banca</span><b>${p.saldo ? euro(p.saldo.importo) : '—'}</b><small>${p.saldo ? `al ${dataIt(p.saldo.data)}` : 'da scrivere qui sotto'}</small></div>
      ${p.finestre.map(f => html`<div class="cifra ${f.cassaFine != null && f.cassaFine < 0 ? 'allarme' : ''}"><span>${f.nome}</span>
        <b>${f.cassaFine != null ? euro(f.cassaFine) : conSegno(f.netto)}</b>
        <small>${f.cassaFine != null ? html`cassa al ${dataIt(f.fino)} · netto ${conSegno(f.netto)}` : html`netto fino al ${dataIt(f.fino)}`}
          · scenario basso ${f.cassaFineBassa != null ? euro(f.cassaFineBassa) : conSegno(f.basso)}</small></div>`)}
      ${p.puntoMinimo ? html`<div class="cifra ${p.puntoMinimo.cassa < 0 ? 'allarme' : ''}"><span>Punto più basso</span><b>${euro(p.puntoMinimo.cassa)}</b>
        <small>il ${dataIt(p.puntoMinimo.data)}${p.puntoMinimoBasso ? ` · scenario basso ${euro(p.puntoMinimoBasso.cassa)} il ${dataIt(p.puntoMinimoBasso.data)}` : ''}</small></div>` : ''}
    </div>

    <h2>Da sapere</h2>
    ${p.rischi.length ? html`<ul class="commenti-analisi">${p.rischi.map(x => html`<li class="${LIVELLO[x.livello]}"><span class="pallino" aria-hidden="true">${ICONE[x.livello]}</span>
      <div>${x.testo}${x.link ? html` <a href="${x.link[0]}">${x.link[1]} →</a>` : ''}</div></li>`)}</ul>` : html`<p class="nota">Niente di particolare.</p>`}

    <h2>Per finestra</h2>
    <div class="tabella-scorre"><table class="elenco">
      <thead><tr><th></th>${p.finestre.map(f => html`<th class="num">${f.nome}<br><small class="tenue">fino al ${dataIt(f.fino)}</small></th>`)}</tr></thead>
      <tbody>
        <tr><td>Incassi dai clienti</td>${p.finestre.map(f => html`<td class="num">${euro(f.incassi)}</td>`)}</tr>
        <tr><td>Pagamenti ai fornitori</td>${p.finestre.map(f => html`<td class="num">${euro(f.pagamenti)}</td>`)}</tr>
        <tr><td>Uscite fisse</td>${p.finestre.map(f => html`<td class="num">${euro(f.uscite)}</td>`)}</tr>
        <tr><th>Netto</th>${p.finestre.map(f => html`<th class="num">${conSegno(f.netto)}</th>`)}</tr>
        <tr><td>Scenario basso / alto</td>${p.finestre.map(f => html`<td class="num">${conSegno(f.basso)} / ${conSegno(f.alto)}</td>`)}</tr>
        ${p.saldo ? html`<tr><th>Cassa a fine finestra</th>${p.finestre.map(f => html`<th class="num">${euro(f.cassaFine ?? 0)}</th>`)}</tr>
          <tr><td>Cassa, scenario basso</td>${p.finestre.map(f => html`<td class="num">${euro(f.cassaFineBassa ?? 0)}</td>`)}</tr>` : ''}
      </tbody></table></div>
    <p class="nota">Scenario basso e alto: incassi ± ${Math.round(p.banda * 100)} % (quanto variano i ritardi dei clienti rispetto ai ${p.giorniMediIncasso ?? '—'} giorni medi
      dalla fattura all'incasso). Ritardo medio di tutti: ${num(p.ritardoGenerale, 1)} giorni dopo la scadenza (ultimi 12 mesi).
      Non ci sono le fatture che emetterete o riceverete da oggi in poi: oltre i 30 giorni gli incassi sono prudenti.</p>

    <details class="non-stampare" ${!p.saldo ? raw('open') : ''}><summary><b>Saldo della banca e uscite fisse</b>${sola ? ' (solo lettura)' : ''}</summary>
      <form method="post" action="/amministrazione/analisi/cassa" class="modulo-qualita">
        <label>Saldo banca (tutti i conti) € <input name="saldo" inputmode="decimal" size="12" value="${scritto(i.saldo)}"></label>
        <label>alla data <input name="dataSaldo" type="date" value="${i.dataSaldo ?? p.oggi}"></label>
        <small class="tenue largo">Il portale non legge ancora la banca: scrivete il saldo quando aprite la pagina, la previsione parte da lì.</small>
        ${fissa('Stipendi netti al mese', 'stipendi', i.stipendi, auto.stipendi, auto.stipendiDa, ['giornoStipendi', i.giornoStipendi])}
        ${fissa('F24 paghe al mese', 'f24', i.f24, auto.f24, auto.f24Da, ['giornoF24', i.giornoF24])}
        ${fissa('IVA al mese', 'iva', i.iva, auto.iva, auto.ivaDa)}
        <small class="tenue largo">L'IVA si versa il 16 (luglio: 20 agosto). Lasciando vuoto: l'IVA del mese chiuso si prende dai Registri IVA, poi la media.
          Un F24 vero letto dalla cartella "Da acquisire" prende il posto della stima di quel mese.</small>
        <b class="largo">Altre uscite di ogni mese (affitto, leasing, finanziamenti, addebito della carta…)</b>
        ${altre.map((a, n) => html`<label>Voce <input name="altra${n}_voce" value="${a.voce}" size="22"></label>
          <label>€ <input name="altra${n}_importo" inputmode="decimal" size="9" value="${a.importo ? scritto(a.importo) : ''}"></label>
          <label>giorno <input name="altra${n}_giorno" inputmode="numeric" size="3" value="${a.voce ? a.giorno : ''}"></label>`)}
        <label>Pagamenti minimi per usare il ritardo del cliente <input name="minimoPagamenti" inputmode="numeric" size="3" value="${i.minimoPagamenti}"></label>
        ${sola ? '' : html`<button>Salva e ricalcola</button>`}
      </form></details>

    <h2>Come pagano i clienti con rate aperte</h2>
    <div class="tabella-scorre"><table class="elenco">
      <thead><tr><th>Cliente</th><th class="num">Da incassare</th><th class="num">Incassi (12 mesi)</th><th class="num">Ritardo medio</th><th class="num">Ritardo max</th><th class="num">Ritardo usato</th></tr></thead>
      <tbody>${p.clienti.map(c => html`<tr class="${c.usato >= 10 ? 'scaduta' : ''}"><td>${c.cliente}</td><td class="num">${euro(c.aperto)}</td><td class="num">${c.pagamenti}</td>
        <td class="num">${c.ritardo != null ? `${c.ritardo} gg` : ''}</td><td class="num">${c.ritardoMax != null ? `${c.ritardoMax} gg` : ''}</td>
        <td class="num">${c.usato} gg${c.daStorico ? '' : html` <small class="tenue">(media di tutti)</small>`}</td></tr>`)}</tbody></table></div>

    ${(['f30', 'f60', 'f90'] as CodiceFinestra[]).map(c => html`<h2>${NOMI_FINESTRE[c]} · ${righeFinestra(c).length} movimenti</h2>
      ${righeFinestra(c).length ? tabellaMovimenti(righeFinestra(c)) : html`<p class="nota">Nessun movimento.</p>`}`)}
    ${righeFinestra('oltre').length ? html`<details><summary>Oltre 90 giorni · ${righeFinestra('oltre').length} movimenti
      (${euro(righeFinestra('oltre').reduce((s, m) => s + m.importo, 0))})</summary>${tabellaMovimenti(righeFinestra('oltre'))}</details>` : ''}
    <p class="nota">È una previsione calcolata sui documenti del portale, non un consiglio finanziario: per finanziamenti e scelte importanti sentite il commercialista.</p>`;
}

/**
 * Previsione di cassa riservata (Adriano 3/11/2026): dai totali si ricava il netto degli stipendi, quindi la vede solo chi vede le paghe
 * (amministratore, contabilità, ufficio con il permesso "buste paga"). Ruolo e permesso letti dal database, non dalla sessione.
 */
async function vedeCassa(req: Request): Promise<boolean> {
  const u = await q1<{ ruolo: string; paghe: boolean }>(`SELECT ruolo, paghe FROM utenti WHERE id = $1 AND attivo`, [req.session.utente?.id ?? 0]);
  return vedePaghe(u);
}
function cassaRiservata(req: Request): string {
  return String(layout({ titolo: 'Previsione di cassa', utente: req.session.utente, attiva: 'amministrazione', contenuto: html`
    <div class="intestazione-pagina"><h1>🔒 Previsione di cassa</h1></div>
    <div class="non-stampare">${menuAmministrazione('analisi')}</div>
    ${tastiAnalisi('cassa')}
    <p class="avviso">Pagina riservata: dai totali si ricavano gli stipendi, quindi la vedono solo l'amministratore, la contabilità e chi ha il permesso
      delle buste paga. Per il permesso chiedi all'amministratore.</p>` }));
}

export function rotteAnalisi() {
  const r = Router();
  r.use(rotteAnalisiProdotti());   // Prodotti e Clienti (Adriano 5/11/2026)
  r.use(rotteAnalisiAcquisti());   // Fornitori, componenti e materiali (Adriano 6/11/2026)
  r.use(rottePareggio());          // Punto di pareggio (Adriano 6/11/2026)
  r.use(rotteAnalisiCosti());      // Costi per categoria (Adriano 6/11/2026)

  // ── Previsione di cassa (Adriano 3/11/2026) ──
  r.get('/cassa', async (req: Request, res) => {
    if (!(await vedeCassa(req))) return res.status(403).send(cassaRiservata(req));
    const d = await caricaPrevisione(oggiRoma());
    res.send(String(layout({ titolo: 'Previsione di cassa', utente: req.session.utente, attiva: 'amministrazione', contenuto: paginaCassa(req, d), script: 'stampa.js', largo: true })));
  });
  r.post('/cassa', async (req: Request, res) => {
    if (!(await vedeCassa(req)) || !eUfficio(req.session.utente?.ruolo)) return res.status(403).send(cassaRiservata(req));
    const b = req.body ?? {};
    const altre = [0, 1, 2, 3, 4].map(n => ({ voce: b[`altra${n}_voce`], importo: b[`altra${n}_importo`], giorno: b[`altra${n}_giorno`] }));
    const i = leggiImpostazioniCassa({ ...b, altre, dataSaldo: b.dataSaldo || oggiRoma() });
    if (i.saldo == null) i.dataSaldo = null;
    await salvaImpostazioniCassa(i);
    res.redirect(`/amministrazione/analisi/cassa?msg=${encodeURIComponent('Salvato: previsione ricalcolata.')}`);
  });
  r.get('/cassa.xlsx', async (req: Request, res) => {
    if (!(await vedeCassa(req))) return res.status(403).send(cassaRiservata(req));
    const { previsione: p } = await caricaPrevisione(oggiRoma());
    const dati = await excelSemplice('Previsione di cassa', [
      { header: 'Data attesa', key: 'data', width: 12, formato: 'data' }, { header: 'Finestra', key: 'finestra', width: 16 },
      { header: 'Tipo', key: 'tipo', width: 14 }, { header: 'Chi / voce', key: 'nome', width: 36 }, { header: 'Documento', key: 'riferimento', width: 14 },
      { header: 'Scadenza', key: 'scadenza', width: 12, formato: 'data' }, { header: 'Ritardo usato (gg)', key: 'ritardo', width: 12, formato: 'intero' },
      { header: 'Importo €', key: 'importo', width: 14, formato: 'euro' }, { header: 'Note', key: 'note', width: 22 },
    ], p.movimenti.map(m => ({ ...m, finestra: NOMI_FINESTRE[m.finestra], tipo: NOMI_TIPO[m.tipo], scadenza: m.scadenza ?? null,
      ritardo: m.tipo === 'incasso' ? m.ritardo : null, note: [m.scaduta ? 'scaduta' : '', m.stima ? 'stima' : ''].filter(Boolean).join(', ') })));
    inviaExcel(res, nomeExcel('previsione-cassa'), dati);
  });

  r.get('/', async (req: Request, res) => {
    const oggi = oggiRoma(), annoOggi = Number(oggi.slice(0, 4));
    const anno = Math.min(annoOggi, Math.max(2019, Number(req.query.anno) || annoOggi));
    const finoA = anno === annoOggi ? oggi : null;
    const periodo = { anno, finoA };
    const [d, righeCosto, regole] = await Promise.all([caricaDatiAnalisi(anno, oggi), righeCosti([anno, anno - 1]), regoleCategorie()]);

    const fatturatoMesi = perMese(d.fatture, f => f.imponibile, anno), fatturatoPrimaMesi = perMese(d.fatture, f => f.imponibile, anno - 1);
    // Fatture lorde e note di credito separate (Adriano 6/11/2026: il grafico di Fatture in Cloud mostra solo le fatture, senza togliere le note di credito)
    const soloFattureMesi = perMese(d.fatture.filter(f => f.tipo !== 'nota_credito'), f => f.imponibile, anno);
    const noteCreditoMesi = perMese(d.fatture.filter(f => f.tipo === 'nota_credito'), f => f.imponibile, anno).map(v => -v);
    const ciSonoNote = noteCreditoMesi.some(v => v > 0);
    const acquistiMesi = perMese(d.acquisti, a => a.imponibile, anno);
    const somma = (v: number[], fino = 12) => v.slice(0, fino).reduce((s, x) => s + x, 0);
    const fatturato = somma(perMese(d.fatture, f => f.imponibile, anno, finoA)), fatturatoPrima = somma(perMese(d.fatture, f => f.imponibile, anno - 1, finoA));
    const acquisti = somma(perMese(d.acquisti, a => a.imponibile, anno, finoA)), acquistiPrima = somma(perMese(d.acquisti, a => a.imponibile, anno - 1, finoA));
    const mesiChiusi = finoA ? Number(oggi.slice(5, 7)) - 1 : 12;
    const clienti = analisiClienti(periodo, d.fatture, d.righe, d.preventivi, d.incassi);
    const prodotti = analisiProdotti(periodo, d.righe, d.preventivi);
    // Acquisti per categoria con le categorie di Casteltech (Adriano 6/11/2026: niente più "senza categoria"): le righe delle fatture dei
    // fornitori classificate come in Costi per categoria, raggruppate per categoria con lo stesso confronto dell'anno prima
    const classificate = classificaCosti(righeCosto, regole);
    const categorie = raggruppaAcquisti(periodo, classificate.map(r => ({ fornitore: r.fornitore, categoria: r.categoria, tipo: 'fattura', data: r.data, imponibile: r.importo })),
      a => a.categoria ?? 'altro');
    const senzaRegola = raggruppaAcquisti(periodo, classificate.filter(r => r.come === 'nessuna').map(r => ({ fornitore: r.fornitore, categoria: null, tipo: 'fattura', data: r.data, imponibile: r.importo })), () => 'x')[0];
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
      ${tastiAnalisi('andamento')}
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
      ${ciSonoNote ? html`<p class="nota">Fatturato = fatture meno le note di credito del mese (il grafico per mese di Fatture in Cloud mostra solo le fatture).</p>` : ''}
      <p class="legenda"><span class="campione fatturato"></span> ${anno} <span class="campione anno-prima"></span> ${anno - 1}</p>
      <div class="tabella-scorre grafico">${graficoMesi(fatturatoMesi, fatturatoPrimaMesi, ['fatturato', 'anno-prima'], [String(anno), String(anno - 1)])}</div>
      <div class="tabella-scorre"><table class="elenco">
        <thead><tr><th>Mese</th>${ciSonoNote ? html`<th class="num">Fatture ${anno}</th><th class="num">Note di credito</th>` : ''}<th class="num">Fatturato ${anno}</th><th class="num">${anno - 1}</th><th class="num">Variazione</th><th class="num">Acquisti ${anno}</th><th class="num">Resta</th></tr></thead>
        <tbody>${fatturatoMesi.map((f, i) => (finoA && i > mesiChiusi) ? '' : html`<tr><td>${nomeMese(i + 1)}${finoA && i === mesiChiusi ? ' (in corso)' : ''}</td>
          ${ciSonoNote ? html`<td class="num">${euro(soloFattureMesi[i])}</td><td class="num">${noteCreditoMesi[i] ? '− ' + euro(noteCreditoMesi[i]) : ''}</td>` : ''}<td class="num">${euro(f)}</td><td class="num">${euro(fatturatoPrimaMesi[i])}</td><td class="num">${finoA && i === mesiChiusi ? '' : pct(variazionePct(f, fatturatoPrimaMesi[i]))}</td>
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
      <p class="nota">Righe di fattura con il codice prodotto. Prezzo del preventivo e margine = ultimo preventivo del codice (lotti successivi, senza una tantum).
        Clic sul codice per la scheda di analisi del prodotto (anno per anno); la classifica completa con il filtro per cliente è in <a href="/amministrazione/analisi/prodotti">Prodotti</a>.</p>
      <div class="tabella-scorre"><table class="elenco">
        <thead><tr><th>Codice</th><th>Cliente</th><th class="num">Schede</th><th class="num">Fatturato</th><th class="num">Prezzo medio</th><th class="num">Prezzo preventivo</th>
          <th class="num">Scarto</th><th class="num">Margine preventivo</th><th class="num">${confronto}</th></tr></thead>
        <tbody>${prodotti.slice(0, 40).map(p => html`<tr class="${(p.scartoPrezzo ?? 0) <= -5 || (p.marginePct ?? 100) < 10 ? 'scaduta' : ''}">
          <td title="${p.descrizione}"><a href="/amministrazione/analisi/prodotto?codice=${encodeURIComponent(p.codice)}&cliente=${encodeURIComponent(p.cliente)}">${p.codice}</a></td><td>${p.cliente}</td><td class="num">${num(p.schede, 0)}</td><td class="num">${euro(p.fatturato)}</td>
          <td class="num">${p.prezzoMedio != null ? `${num(p.prezzoMedio, 2)} €` : ''}</td><td class="num">${p.prezzoPreventivo != null ? `${num(p.prezzoPreventivo, 2)} €` : ''}</td>
          <td class="num">${pct(p.scartoPrezzo)}</td><td class="num">${p.marginePct != null ? `${num(p.marginePct, 1)}%` : ''}</td><td class="num">${euro(p.fatturatoPrima)}</td></tr>`)}</tbody></table></div>
      ${prodotti.length > 40 ? html`<p class="nota">Elencati i primi 40 di ${prodotti.length}.</p>` : ''}

      <h2>Acquisti per categoria</h2>
      <p class="nota">Le categorie di Casteltech, lette riga per riga dalle fatture dei fornitori (descrizione, fornitore, tipo di fattura e storico del fornitore).
        Clic sulla categoria per le righe; regole e riassunto in <a href="/amministrazione/analisi/costi?anno=${anno}">Costi per categoria</a>.
        ${senzaRegola?.importo ? html`Ancora senza una categoria sicura: ${euro(senzaRegola.importo)} in "Altre spese" (fornitori mai visti prima: si sistemano lì).` : ''}</p>
      <div class="tabella-scorre"><table class="elenco">
        <thead><tr><th>Gruppo</th><th>Categoria</th><th class="num">${anno}</th><th class="num">Peso</th><th class="num">${confronto}</th><th class="num">Variazione</th></tr></thead>
        <tbody>${categorie.map(g => html`<tr><td>${NOMI_MACRO[categoriaCosto(g.nome).macro]}</td>
          <td><a href="/amministrazione/analisi/costi/righe?anno=${anno}&categoria=${encodeURIComponent(g.nome)}">${categoriaCosto(g.nome).nome}</a></td>
          <td class="num">${euro(g.importo)}</td><td class="num">${g.quota ? `${num(g.quota, 1)}%` : ''}</td>
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
