/**
 * Amministrazione → Analisi → Fornitori e schede di analisi degli acquisti (Adriano 6/11/2026, "come per i prodotti"):
 *  - /amministrazione/analisi/fornitori    classifica dei fornitori di un anno (acquisti, variazione, peso, fatture, ultima fattura, fermi) + Excel;
 *  - /amministrazione/analisi/fornitore    scheda del fornitore: acquisti anno per anno, pagamenti, categorie, ordini del portale, ultime fatture;
 *  - /amministrazione/analisi/componente   scheda del componente: acquisti anno per anno dagli ordini a fornitore, prezzo, fornitori, BOM che lo usano;
 *  - /amministrazione/analisi/materiale    scheda del materiale di consumo: acquisti anno per anno dagli ordini a fornitore;
 *  - /amministrazione/analisi/acquisti     ricerca "dove l'ho comprato e a quanto" (Adriano 6/11/2026) nelle righe delle fatture dei fornitori.
 * Pulsante "Analisi" in Anagrafiche → Fornitori / Componenti / Materiali. Conti in engine/analisi-acquisti.ts, letture in analisi-acquisti-servizio.ts.
 * Le righe delle fatture dei fornitori (storico FIC dal 2019 e SdI) stanno in documenti_ricevuti_righe: engine/righe-fattura.ts, righe-fornitori-servizio.ts.
 */
import { Router, type Request } from 'express';
import { layout } from '../views/layout.js';
import { html, num, raw, euro, euroUnitario, data as dataIt, type Raw } from '../views/html.js';
import { menuAmministrazione } from './cruscotto-amministrazione.js';
import { tastiAnalisi } from './analisi.js';
import { excelSemplice, inviaExcel, nomeExcel } from '../excel.js';
import { CATEGORIE_MATERIALI, eCategoria } from '../../engine/materiali-consumo.js';
import { FAMIGLIE } from '../../engine/codifica/regole.js';
import { classificaFornitori, prezzoNetto, schedaArticolo, schedaFornitore, totaliAcquisti, type SchedaArticolo } from '../../engine/analisi-acquisti.js';
import {
  bomDelComponente, componentePerId, fattureFornitoriTutte, fornitoreDaChiave, materialePerId, ordiniFornitore, pagamentiFornitore,
  righeAcquistoComponente, righeAcquistoMateriale, ultimeFattureFornitore, type RigaAcquistoLetta,
} from '../analisi-acquisti-servizio.js';
import { cercaAcquisti, comeRigheAcquisto, righeFattureComponente, righeFattureFornitore, righeFattureMateriale, statoRighe } from '../righe-fornitori-servizio.js';
import { articoliComprati, prezzoRiga, type ArticoloComprato, type RigaAcquistoStorica } from '../../engine/righe-fattura.js';

const oggiRoma = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
const euro0 = (n: number | null | undefined) => (n == null ? '' : `${num(n, 0)} €`);
const pct = (v: number | null | undefined) => (v == null ? '' : `${v > 0 ? '+' : ''}${num(v, 0)}%`);
const mesiFa = (m: number) => (m === 0 ? 'questo mese' : m === 1 ? '1 mese fa' : `${m} mesi fa`);
/** Le descrizioni delle fatture di Fatture in Cloud hanno "P/N§Produttore". */
const pulita = (t: string | null | undefined) => (t ?? '').replace(/§/g, ' · ');
const testoFermo = (mesi: number | null) => (mesi == null ? '' : mesi >= 24 ? `da ${Math.floor(mesi / 12)} anni` : mesi >= 12 ? 'da oltre un anno' : `da ${mesi} mesi`);
const linkFornitore = (chiave: string) => `/amministrazione/analisi/fornitore?f=${encodeURIComponent(chiave)}`;

const pagina = (req: Request, titolo: string, contenuto: Raw, stato = 200) => ({ stato, html: String(layout({ titolo, utente: req.session.utente, attiva: 'amministrazione', contenuto, script: 'stampa.js', largo: true })) });
const nonTrovato = (req: Request, cosa: string, torna: string, testoTorna: string) => pagina(req, cosa, html`
  <div class="intestazione-pagina"><h1>${cosa} non trovato</h1></div>${tastiAnalisi('fornitori')}
  <p class="nota">Controlla l'indirizzo. <a href="${torna}">${testoTorna}</a>.</p>`, 404);

/** Tabella "anno per anno" di un componente o materiale (righe degli ordini a fornitore del portale). */
function tabellaArticolo(s: SchedaArticolo, um: string): Raw {
  if (!s.righe.length) return html`<p class="vuoto">Nessun acquisto riga per riga con questo codice: né nelle fatture dei fornitori (storico dal 2019) né negli ordini a fornitore del portale. Resta l'ultimo acquisto dell'anagrafica, se c'è.</p>`;
  return html`<div class="tabella-scorre"><table class="elenco" data-non-ordinare>
    <thead><tr><th>Anno</th><th class="num">${um}</th><th class="num">Spesa</th><th class="num">Var. spesa</th><th class="num">Prezzo medio</th><th class="num">Var. prezzo</th>
      <th class="num">Documenti</th><th>Fornitori</th><th>Ultimo acquisto</th></tr></thead>
    <tbody>${s.righe.map(r => html`<tr class="${r.variazionePrezzo != null && r.variazionePrezzo >= 10 ? 'scaduta' : ''}"><td>${r.anno}</td><td class="num">${num(r.pezzi, 0)}</td>
      <td class="num">${euro(r.spesa)}</td><td class="num">${pct(r.variazioneSpesa)}</td><td class="num">${euroUnitario(r.prezzoMedio)}</td><td class="num">${pct(r.variazionePrezzo)}</td>
      <td class="num">${r.ordini}</td><td>${r.fornitori.join(', ')}</td><td>${dataIt(r.ultimoAcquisto)}</td></tr>`)}
      <tr class="totale-riga"><td><strong>Totale</strong></td><td class="num"><strong>${num(s.totale.pezzi, 0)}</strong></td><td class="num"><strong>${euro(s.totale.spesa)}</strong></td><td></td>
        <td class="num"><strong>${euroUnitario(s.totale.prezzoMedio)}</strong></td><td></td><td class="num"><strong>${s.totale.ordini}</strong></td><td></td><td></td></tr>
    </tbody></table></div>`;
}

/** Elenco delle righe d'acquisto (le ultime 60: fatture dei fornitori e ordini del portale) di un componente o materiale. */
function tabellaRighe(righe: RigaAcquistoLetta[]): Raw {
  if (!righe.length) return html``;
  const ordinate = [...righe].sort((x, y) => y.data.localeCompare(x.data) || y.documentoId - x.documentoId);
  const ultime = ordinate.slice(0, 60);
  return html`<h2>Acquisti riga per riga${righe.length > 60 ? html` <span class="nota">(gli ultimi 60 di ${righe.length})</span>` : ''}</h2>
    <p class="nota">Fatture dei fornitori (anche lo storico di Fatture in Cloud dal 2019) e ordini a fornitore del portale non ancora fatturati; prezzo = imponibile della riga ÷ quantità.</p>
    <div class="tabella-scorre"><table class="elenco">
      <thead><tr><th>Data</th><th>Documento</th><th>Fornitore</th><th>Descrizione</th><th class="num">Quantità</th><th class="num">Prezzo netto</th><th class="num">Importo</th><th class="num">Arrivati</th><th>Commessa</th></tr></thead>
      <tbody>${ultime.map(r => html`<tr><td>${dataIt(r.data)}</td><td>${r.fonte === 'fattura' ? html`<a href="/amministrazione/ricevuti/${r.documentoId}">${r.quantita < 0 ? html`<span class="etichetta">NC</span> ` : ''}fattura ${r.numero}</a>` : html`<a href="/ordini/fornitori/${r.documentoId}">ordine ${r.numero}</a>`}</td><td>${r.fornitore}</td><td>${pulita(r.descrizione)}</td>
        <td class="num">${num(r.quantita, 0)}</td><td class="num">${euroUnitario(prezzoNetto(r))}</td><td class="num">${euro(r.quantita * prezzoNetto(r))}</td>
        <td class="num">${r.arrivati ? num(r.arrivati, 0) : ''}</td><td>${r.commessaId ? html`<a href="/commesse/${r.commessaId}">commessa</a>` : ''}</td></tr>`)}</tbody></table></div>`;
}

/** Riquadri in cima alla scheda di componente e materiale: totale, ultimo anno, ultimo acquisto (ordini o anagrafica), oscillazione del prezzo. */
function cifreArticolo(s: SchedaArticolo, um: string, anagrafica: { prezzo: number | null; fornitore: string | null; data: string | null; quantita: number | null; fonte: string | null }): Raw {
  const ultimo = s.righe[s.righe.length - 1], penultimo = s.righe[s.righe.length - 2];
  const ultimoAnagrafica = anagrafica.prezzo != null && (!s.ultimo || (anagrafica.data ?? '') > s.ultimo.data);
  return html`<div class="cifre">
    <div class="cifra"><span>Spesa totale</span><b>${euro(s.totale.spesa)}</b><small>${s.totale.ordini ? `${num(s.totale.pezzi, 0)} ${um} in ${s.totale.ordini} ${s.totale.ordini === 1 ? 'acquisto' : 'acquisti'} dal ${dataIt(s.primaData)}` : 'nessun acquisto riga per riga'}</small></div>
    <div class="cifra"><span>Ultimo anno ${ultimo?.anno ?? ''}</span><b>${euro(ultimo?.spesa ?? 0)}</b><small>${ultimo ? `${num(ultimo.pezzi, 0)} ${um}` : ''}${penultimo ? ` · ${pct(ultimo?.variazioneSpesa)} sul ${penultimo.anno}` : ''}</small></div>
    <div class="cifra"><span>Ultimo acquisto</span><b>${ultimoAnagrafica ? euroUnitario(anagrafica.prezzo) : s.ultimo ? euroUnitario(s.ultimo.prezzo) : '—'}</b>
      <small>${ultimoAnagrafica ? `${anagrafica.fornitore ?? ''}${anagrafica.data ? ` · ${dataIt(anagrafica.data)}` : ''}${anagrafica.quantita ? ` · ${num(anagrafica.quantita, 0)} ${um}` : ''}${anagrafica.fonte === 'manuale' ? ' · scritto a mano' : anagrafica.fonte === 'fic' ? ' · da Fatture in Cloud' : ''}`
        : s.ultimo ? `${s.ultimo.fornitore} · ${dataIt(s.ultimo.data)} · ${num(s.ultimo.quantita, 0)} ${um}` : 'mai comprato'}</small></div>
    <div class="cifra"><span>Prezzo medio</span><b>${s.totale.prezzoMedio != null ? euroUnitario(s.totale.prezzoMedio) : '—'}</b>
      <small>${s.minimo != null && s.massimo != null && s.minimo !== s.massimo ? `da ${euroUnitario(s.minimo)} a ${euroUnitario(s.massimo)}` : s.minimo != null ? 'sempre lo stesso prezzo' : ''}</small></div>
  </div>`;
}

/** Articoli trovati dalla ricerca negli acquisti, con i fornitori e i prezzi. */
function tabellaArticoli(articoli: ArticoloComprato[]): Raw {
  return html`<div class="tabella-scorre"><table class="elenco">
    <thead><tr><th>Articolo</th><th>Descrizione</th><th class="num">Volte</th><th class="num">Quantità</th><th class="num">Spesa</th><th class="num">Ultimo prezzo</th><th class="num">Min – max</th><th>Dove</th></tr></thead>
    <tbody>${articoli.slice(0, 200).map(a => html`<tr><td><b>${a.pn ?? ''}</b>${a.componenteId ? html`<br><a href="/amministrazione/analisi/componente?id=${a.componenteId}">scheda componente</a>` : ''}${a.materialeId ? html`<br><a href="/amministrazione/analisi/materiale?id=${a.materialeId}">scheda materiale</a>` : ''}</td>
      <td>${pulita(a.descrizione).slice(0, 110)}</td><td class="num">${a.volte}</td><td class="num">${num(a.pezzi, 0)}</td><td class="num">${euro(a.spesa)}</td>
      <td class="num">${euroUnitario(a.ultimoPrezzo)}<br><small>${a.ultimoFornitore} · ${dataIt(a.ultimaData)}</small></td>
      <td class="num">${a.minimo != null && a.massimo != null && a.minimo !== a.massimo ? `${euroUnitario(a.minimo)} – ${euroUnitario(a.massimo)}` : ''}</td>
      <td>${a.fornitori.slice(0, 5).map(f => html`<div><a href="${linkFornitore(f.fornitoreChiave)}">${f.fornitore}</a>: ${euroUnitario(f.ultimoPrezzo)} <small>${dataIt(f.ultimaData)}${f.volte > 1 ? ` · ${f.volte} volte` : ''}${f.minimo != null && f.ultimoPrezzo != null && f.minimo < f.ultimoPrezzo ? ` · min ${euroUnitario(f.minimo)}` : ''}</small></div>`)}${a.fornitori.length > 5 ? html`<small>e altri ${a.fornitori.length - 5}</small>` : ''}</td></tr>`)}</tbody></table></div>`;
}

/** Righe di fattura trovate, dalla più recente. */
function tabellaRigheStoriche(righe: RigaAcquistoStorica[]): Raw {
  return html`<div class="tabella-scorre"><table class="elenco">
    <thead><tr><th>Data</th><th>Fattura</th><th>Fornitore</th><th>Codice</th><th>Descrizione</th><th class="num">Quantità</th><th class="num">Prezzo</th><th class="num">Imponibile</th></tr></thead>
    <tbody>${righe.map(r => html`<tr><td>${dataIt(r.data)}</td><td><a href="/amministrazione/ricevuti/${r.documentoId}">${r.tipo === 'nota_credito' ? html`<span class="etichetta">NC</span> ` : ''}${r.numero || 'senza n.'}</a></td>
      <td><a href="${linkFornitore(r.fornitoreChiave)}">${r.fornitore}</a></td><td>${r.codice ?? ''}</td><td>${pulita(r.descrizione)}</td>
      <td class="num">${r.quantita != null ? `${num(r.quantita, 0)}${r.um ? ` ${r.um}` : ''}` : ''}</td><td class="num">${euroUnitario(prezzoRiga(r))}</td><td class="num">${euro((r.tipo === 'nota_credito' ? -1 : 1) * r.imponibile)}</td></tr>`)}</tbody></table></div>`;
}

export function rotteAnalisiAcquisti() {
  const r = Router();

  // ── Classifica dei fornitori di un anno ──
  async function datiClassifica(req: Request) {
    const oggi = oggiRoma(), annoOggi = Number(oggi.slice(0, 4));
    const anno = Math.min(annoOggi, Math.max(2019, Number(req.query.anno) || annoOggi));
    const cerca = String(req.query.cerca ?? '').trim().toUpperCase();
    const fatture = await fattureFornitoriTutte();
    let classifica = classificaFornitori(fatture, anno, oggi);
    if (cerca) classifica = classifica.filter(f => f.fornitore.toUpperCase().includes(cerca));
    const totale = totaliAcquisti(fatture);
    return { oggi, annoOggi, anno, cerca, classifica, totaleAnno: totale[anno] ?? 0, totalePrima: totale[anno - 1] ?? 0 };
  }

  r.get('/fornitori', async (req: Request, res) => {
    const d = await datiClassifica(req);
    const anni = Array.from({ length: d.annoOggi - 2019 + 1 }, (_, i) => d.annoOggi - i);
    const fermi = d.classifica.filter(f => f.fermo && f.acquistiPrima > 0 && f.acquisti === 0).length;
    const indirizzo = (extra: string) => `/amministrazione/analisi/fornitori?anno=${d.anno}${d.cerca ? `&cerca=${encodeURIComponent(d.cerca)}` : ''}${extra}`;
    const p = pagina(req, `Analisi fornitori ${d.anno}`, html`
      <div class="intestazione-pagina"><h1>Fornitori · ${d.anno}</h1>
        <div class="azioni non-stampare"><a class="bottone" href="${indirizzo('').replace('/fornitori?', '/fornitori.xlsx?')}">Excel</a> <button type="button" id="stampa">Stampa</button></div></div>
      <div class="non-stampare">${menuAmministrazione('analisi')}</div>
      ${tastiAnalisi('fornitori')}
      <form method="get" class="cerca non-stampare">
        <label>Anno <select name="anno">${anni.map(a => html`<option ${a === d.anno ? raw('selected') : ''}>${a}</option>`)}</select></label>
        <label>Cerca <input type="search" name="cerca" value="${d.cerca}" placeholder="nome del fornitore"></label>
        <button class="primario">Mostra</button></form>
      <div class="cifre">
        <div class="cifra"><span>Acquisti ${d.anno}</span><b>${euro0(d.totaleAnno)}</b><small>${d.totalePrima ? `${pct(d.totaleAnno && d.totalePrima ? ((d.totaleAnno - d.totalePrima) / d.totalePrima) * 100 : null)} sul ${d.anno - 1} (${euro0(d.totalePrima)})` : ''}</small></div>
        <div class="cifra"><span>Fornitori con acquisti</span><b>${d.classifica.filter(f => f.acquisti > 0).length}</b><small>${fermi ? `${fermi} usati nel ${d.anno - 1} e non nel ${d.anno}` : ''}</small></div>
        <div class="cifra"><span>Primi 3 fornitori</span><b>${(() => { const t = d.classifica.slice(0, 3).reduce((s, f) => s + Math.max(0, f.acquisti), 0); return d.totaleAnno > 0 ? `${num((t / d.totaleAnno) * 100, 0)}%` : '—'; })()}</b><small>degli acquisti dell'anno</small></div>
      </div>
      <p class="nota">Imponibile delle fatture dei fornitori (note di credito in negativo, anche lo storico di Fatture in Cloud dal 2019). Peso = quanto vale il fornitore sugli acquisti dell'anno.
        "Fermo" = nessuna fattura da oltre 6 mesi. Clic sul nome per la scheda anno per anno.</p>
      ${d.classifica.length ? html`<div class="tabella-scorre"><table class="elenco">
        <thead><tr><th>Fornitore</th><th class="num">Acquisti ${d.anno}</th><th class="num">${d.anno - 1}</th><th class="num">Variazione</th><th class="num">Peso</th><th class="num">Fatture</th><th>Ultima fattura</th><th></th></tr></thead>
        <tbody>${d.classifica.map(f => html`<tr class="${f.variazione != null && f.variazione <= -30 && f.acquistiPrima >= 1000 ? 'scaduta' : ''}">
          <td><a href="${linkFornitore(f.fornitoreChiave)}">${f.fornitore}</a>${f.fornitoreId ? '' : html` <span class="nota">(non in anagrafica)</span>`}</td>
          <td class="num">${euro(f.acquisti)}</td><td class="num">${f.acquistiPrima ? euro(f.acquistiPrima) : ''}</td><td class="num">${pct(f.variazione)}</td>
          <td class="num">${f.pesoTotale != null ? `${num(f.pesoTotale, 1)}%` : ''}</td><td class="num">${f.fatture || ''}</td>
          <td>${dataIt(f.ultimaFattura)}${f.fermo ? html` <span class="etichetta">fermo ${testoFermo(f.mesiFermo)}</span>` : ''}</td>
          <td class="non-stampare">${f.fornitoreId ? html`<a class="bottone" href="/anagrafiche/fornitori/${f.fornitoreId}">Anagrafica</a>` : ''}</td></tr>`)}</tbody></table></div>`
        : html`<p class="vuoto">Nessun acquisto nel ${d.anno}${d.cerca ? ` con "${d.cerca}"` : ''}.</p>`}`);
    res.status(p.stato).send(p.html);
  });

  r.get('/fornitori.xlsx', async (req: Request, res) => {
    const d = await datiClassifica(req);
    const dati = await excelSemplice(`Fornitori ${d.anno}`, [
      { header: 'Fornitore', key: 'fornitore', width: 36 }, { header: `Acquisti ${d.anno} €`, key: 'acquisti', width: 14, formato: 'euro' },
      { header: `Acquisti ${d.anno - 1} €`, key: 'acquistiPrima', width: 14, formato: 'euro' }, { header: 'Variazione %', key: 'variazione', width: 12, formato: 'intero' },
      { header: 'Peso %', key: 'pesoTotale', width: 10 }, { header: 'Fatture', key: 'fatture', width: 8, formato: 'intero' },
      { header: 'Ultima fattura', key: 'ultimaFattura', width: 14, formato: 'data' }, { header: 'Fermo', key: 'fermo', width: 8 },
    ], d.classifica.map(f => ({ ...f, fermo: f.fermo ? 'sì' : '' })));
    inviaExcel(res, nomeExcel(`fornitori-${d.anno}`), dati);
  });

  // ── Scheda del fornitore ──
  r.get('/fornitore', async (req: Request, res) => {
    const chiave = String(req.query.f ?? (req.query.id ? `f${req.query.id}` : '')).trim();
    const f = chiave ? await fornitoreDaChiave(chiave) : null;
    if (!f) { const p = nonTrovato(req, 'Fornitore', '/amministrazione/analisi/fornitori', 'Torna alla classifica dei fornitori'); return res.status(p.stato).send(p.html); }
    const oggi = oggiRoma();
    const [tutte, pagamenti, ordini, ultime, righeFatture] = await Promise.all([fattureFornitoriTutte(), pagamentiFornitore(f.chiave), ordiniFornitore(f.id), ultimeFattureFornitore(f.chiave), righeFattureFornitore(f.chiave)]);
    const articoli = articoliComprati(righeFatture).sort((a, b) => b.spesa - a.spesa).slice(0, 30);
    const s = schedaFornitore(tutte.filter(x => x.fornitoreChiave === f.chiave), { totali: totaliAcquisti(tutte), oggi, pagamenti, ordini });
    const ultimo = s.righe[s.righe.length - 1], penultimo = s.righe[s.righe.length - 2];
    const haOrdini = s.righe.some(r => r.ordini > 0);
    const p = pagina(req, `Analisi ${f.nome}`, html`
      <div class="intestazione-pagina"><div><h1>${f.nome}</h1><p class="nota">${f.piva ? `P.IVA ${f.piva} · ` : ''}${f.id ? html`<a href="/anagrafiche/fornitori/${f.id}">Anagrafica</a>` : html`<span class="etichetta">non in anagrafica</span>`}
        · <a href="/amministrazione/ricevuti?q=${encodeURIComponent(f.nome)}">Fatture fornitori</a>${f.id ? html` · <a href="/ordini/fornitori?q=${encodeURIComponent(f.nome)}">Ordini a fornitore</a>` : ''}</p></div>
        <div class="azioni non-stampare"><a class="bottone" href="/amministrazione/analisi/fornitori">Classifica dei fornitori</a> <button type="button" id="stampa">Stampa</button></div></div>
      <div class="non-stampare">${menuAmministrazione('analisi')}</div>
      ${tastiAnalisi('fornitori')}
      <div class="cifre">
        <div class="cifra"><span>Acquisti totali</span><b>${euro0(s.totale.acquisti)}</b><small>${s.totale.fatture} fatture dal ${dataIt(s.primaData)}</small></div>
        <div class="cifra"><span>Ultimo anno ${ultimo?.anno ?? ''}</span><b>${euro0(ultimo?.acquisti ?? 0)}</b><small>${ultimo ? `${ultimo.fatture} fatture` : ''}${penultimo ? ` · ${pct(ultimo?.variazione)} sul ${penultimo.anno}` : ''}${ultimo?.pesoTotale != null ? ` · ${num(ultimo.pesoTotale, 1)}% degli acquisti` : ''}</small></div>
        <div class="cifra ${s.fermo ? 'allarme' : ''}"><span>Ultima fattura</span><b>${dataIt(s.ultimaData) || '—'}</b><small>${s.fermo ? `fermo ${testoFermo(s.mesiFermo)}` : s.mesiFermo != null ? mesiFa(s.mesiFermo) : ''}</small></div>
        <div class="cifra"><span>Tempi di pagamento</span><b>${s.pagamenti.giorniMedi != null ? `${s.pagamenti.giorniMedi} gg` : '—'}</b>
          <small>${s.pagamenti.pagate ? `${s.pagamenti.pagate} rate pagate negli ultimi 12 mesi · ritardo medio ${s.pagamenti.ritardoMedio ?? 0} gg sulla scadenza` : 'nessuna rata pagata negli ultimi 12 mesi'}</small></div>
        <div class="cifra ${s.pagamenti.scaduto > 0 ? 'allarme' : ''}"><span>Da pagare</span><b>${euro0(s.pagamenti.daPagare)}</b><small>${s.pagamenti.scaduto > 0 ? `di cui scaduto ${euro0(s.pagamenti.scaduto)}` : s.pagamenti.daPagare > 0 ? 'niente di scaduto' : ''}</small></div>
      </div>

      <h2>Anno per anno</h2>
      <p class="nota">Acquisti = imponibile delle fatture del fornitore (note di credito in negativo); peso = quanto vale sugli acquisti di tutti i fornitori in quell'anno${haOrdini ? '; ordini = ordini a fornitore emessi dal portale' : ''}.</p>
      <div class="tabella-scorre"><table class="elenco" data-non-ordinare>
        <thead><tr><th>Anno</th><th class="num">Acquisti</th><th class="num">Variazione</th><th class="num">Peso sugli acquisti</th><th class="num">Fatture</th>${haOrdini ? html`<th class="num">Ordini portale</th><th class="num">Valore ordini</th>` : ''}<th>Ultima fattura</th></tr></thead>
        <tbody>${s.righe.map(r => html`<tr class="${r.variazione != null && r.variazione <= -30 ? 'scaduta' : ''}"><td>${r.anno}</td><td class="num">${euro(r.acquisti)}</td><td class="num">${pct(r.variazione)}</td>
          <td class="num">${r.pesoTotale != null ? `${num(r.pesoTotale, 1)}%` : ''}</td><td class="num">${r.fatture || ''}</td>
          ${haOrdini ? html`<td class="num">${r.ordini || ''}</td><td class="num">${r.ordini ? euro(r.ordiniTotale) : ''}</td>` : ''}<td>${dataIt(r.ultimaFattura)}</td></tr>`)}
          <tr class="totale-riga"><td><strong>Totale</strong></td><td class="num"><strong>${euro(s.totale.acquisti)}</strong></td><td></td><td></td><td class="num"><strong>${s.totale.fatture}</strong></td>${haOrdini ? html`<td></td><td></td>` : ''}<td></td></tr>
        </tbody></table></div>

      ${s.categorie.length ? html`<h2>Cosa si compra</h2>
        <p class="nota">Categorie di costo delle fatture (come in Fatture in Cloud), di tutti gli anni.</p>
        <table class="elenco stretta"><thead><tr><th>Categoria</th><th class="num">Importo</th><th class="num">Peso</th></tr></thead>
          <tbody>${s.categorie.map(c => html`<tr><td>${c.categoria}</td><td class="num">${euro(c.importo)}</td><td class="num">${s.totale.acquisti > 0 ? `${num((c.importo / s.totale.acquisti) * 100, 0)}%` : ''}</td></tr>`)}</tbody></table>` : ''}

      ${articoli.length ? html`<h2>Cosa compriamo da questo fornitore</h2>
        <p class="nota">Gli articoli con più spesa nelle righe delle sue fatture (storico dal 2019${righeFatture.length >= 4000 ? ', le ultime 4.000 righe' : ''}); clic sul codice per cercarlo in tutti i fornitori.</p>
        <div class="tabella-scorre"><table class="elenco">
          <thead><tr><th>Articolo</th><th>Descrizione</th><th class="num">Volte</th><th class="num">Quantità</th><th class="num">Spesa</th><th class="num">Ultimo prezzo</th><th>Ultimo acquisto</th></tr></thead>
          <tbody>${articoli.map(a => html`<tr><td>${a.pn ? html`<a href="/amministrazione/analisi/acquisti?q=${encodeURIComponent(a.pn)}">${a.pn}</a>` : ''}${a.componenteId ? html` <a class="nota" href="/amministrazione/analisi/componente?id=${a.componenteId}">scheda</a>` : ''}${a.materialeId ? html` <a class="nota" href="/amministrazione/analisi/materiale?id=${a.materialeId}">materiale</a>` : ''}</td>
            <td>${pulita(a.descrizione).slice(0, 90)}</td><td class="num">${a.volte}</td><td class="num">${num(a.pezzi, 0)}</td><td class="num">${euro(a.spesa)}</td><td class="num">${euroUnitario(a.ultimoPrezzo)}</td><td>${dataIt(a.ultimaData)}</td></tr>`)}</tbody></table></div>` : ''}

      ${ordini.length ? html`<h2>Ordini a fornitore del portale · ${ordini.length}</h2>
        <div class="tabella-scorre"><table class="elenco">
          <thead><tr><th>Data</th><th>Ordine</th><th>Righe</th><th class="num">Valore</th></tr></thead>
          <tbody>${ordini.slice(0, 30).map(o => html`<tr><td>${dataIt(o.data)}</td><td><a href="/ordini/fornitori/${o.id}">${o.numero}</a></td><td>${o.righe ?? ''}</td><td class="num">${euro(o.totale)}</td></tr>`)}</tbody></table></div>` : ''}

      <h2>Ultime fatture${ultime.length === 30 ? html` <span class="nota">(le ultime 30)</span>` : ''}</h2>
      ${ultime.length ? html`<div class="tabella-scorre"><table class="elenco">
        <thead><tr><th>Data</th><th>Numero</th><th>Descrizione</th><th>Categoria</th><th class="num">Imponibile</th></tr></thead>
        <tbody>${ultime.map(d => html`<tr><td>${dataIt(d.data)}</td><td><a href="/amministrazione/ricevuti/${d.id}">${d.tipo === 'nota_credito' ? html`<span class="etichetta">NC</span> ` : ''}${d.numero || 'senza n.'}</a></td>
          <td>${pulita(d.descrizione)}</td><td>${d.categoria ?? ''}</td><td class="num">${euro((d.tipo === 'nota_credito' ? -1 : 1) * d.imponibile)}</td></tr>`)}</tbody></table></div>`
        : html`<p class="vuoto">Nessuna fattura di questo fornitore nel portale.</p>`}`);
    res.status(p.stato).send(p.html);
  });

  // ── Ricerca negli acquisti: "dove l'ho comprato e a quanto" ──
  async function datiRicerca(req: Request) {
    const testo = String(req.query.q ?? '').trim().slice(0, 80);
    const righe = testo.length >= 2 ? await cercaAcquisti(testo) : [];
    return { testo, righe, articoli: articoliComprati(righe) };
  }

  r.get('/acquisti', async (req: Request, res) => {
    const d = await datiRicerca(req);
    const stato = await statoRighe();
    const p = pagina(req, d.testo ? `Acquisti di ${d.testo}` : 'Ricerca negli acquisti', html`
      <div class="intestazione-pagina"><h1>Dove l'ho comprato e a quanto</h1>
        <div class="azioni non-stampare">${d.righe.length ? html`<a class="bottone" href="/amministrazione/analisi/acquisti.xlsx?q=${encodeURIComponent(d.testo)}">Excel</a> ` : ''}<button type="button" id="stampa">Stampa</button></div></div>
      <div class="non-stampare">${menuAmministrazione('analisi')}</div>
      ${tastiAnalisi('acquisti')}
      <form method="get" class="cerca non-stampare">
        <label>Componente o materiale <input type="search" name="q" value="${d.testo}" placeholder="P/N, codice o parole della descrizione (es. STM32F103, 0603 10K, pasta saldante)" size="50" autofocus></label>
        <button class="primario">Cerca</button></form>
      <p class="nota">Cerca nelle righe delle fatture dei fornitori: storico di Fatture in Cloud dal 2019 e fatture arrivate dallo SdI (${stato ? `${num(stato.righe, 0)} righe di ${num(stato.conRighe, 0)} fatture` : ''}).
        Tutte le parole devono esserci; un P/N si trova anche scritto senza trattini. Prezzo = imponibile della riga ÷ quantità (note di credito in negativo).</p>
      ${!d.testo ? '' : !d.righe.length ? html`<p class="vuoto">Nessun acquisto con "${d.testo}".</p>` : html`
        <div class="cifre">
          <div class="cifra"><span>Articoli trovati</span><b>${d.articoli.length}</b><small>${d.righe.length}${d.righe.length >= 3000 ? '+' : ''} righe di fattura</small></div>
          <div class="cifra"><span>Spesa totale</span><b>${euro(d.articoli.reduce((s, a) => s + a.spesa, 0))}</b><small>dal ${dataIt(d.righe[d.righe.length - 1].data)} al ${dataIt(d.righe[0].data)}</small></div>
          <div class="cifra"><span>Fornitori</span><b>${new Set(d.righe.map(r => r.fornitoreChiave)).size}</b><small>${[...new Set(d.righe.map(r => r.fornitore))].slice(0, 4).join(', ')}</small></div>
        </div>
        <h2>Per articolo</h2>
        <p class="nota">Le righe con lo stesso componente (o P/N, codice del fornitore, descrizione) sono unite; i fornitori con l'ultimo prezzo pagato e il più basso. In cima gli acquisti più recenti.</p>
        ${tabellaArticoli(d.articoli)}
        <h2>Tutte le righe${d.righe.length > 300 ? html` <span class="nota">(le ultime 300 di ${d.righe.length})</span>` : ''}</h2>
        ${tabellaRigheStoriche(d.righe.slice(0, 300))}`}`);
    res.status(p.stato).send(p.html);
  });

  r.get('/acquisti.xlsx', async (req: Request, res) => {
    const d = await datiRicerca(req);
    const dati = await excelSemplice(`Acquisti ${d.testo}`.slice(0, 31), [
      { header: 'Data', key: 'data', width: 12, formato: 'data' }, { header: 'Tipo', key: 'tipo', width: 12 }, { header: 'Numero', key: 'numero', width: 14 },
      { header: 'Fornitore', key: 'fornitore', width: 32 }, { header: 'Codice', key: 'codice', width: 18 }, { header: 'P/N', key: 'pn', width: 20 },
      { header: 'Descrizione', key: 'descrizione', width: 60 }, { header: 'Quantità', key: 'quantita', width: 10 }, { header: 'UM', key: 'um', width: 6 },
      { header: 'Prezzo unitario €', key: 'prezzo', width: 14 }, { header: 'Imponibile €', key: 'imponibile', width: 14, formato: 'euro' },
    ], d.righe.map(r => ({ ...r, tipo: r.tipo === 'nota_credito' ? 'nota di credito' : 'fattura', prezzo: prezzoRiga(r), descrizione: pulita(r.descrizione) })));
    inviaExcel(res, nomeExcel(`acquisti-${d.testo.replace(/[^A-Za-z0-9]+/g, '-') || 'ricerca'}`), dati);
  });

  // ── Scheda del componente ──
  r.get('/componente', async (req: Request, res) => {
    const id = Number(req.query.id);
    const c = Number.isInteger(id) && id > 0 ? await componentePerId(id) : undefined;
    if (!c) { const p = nonTrovato(req, 'Componente', '/anagrafiche/componenti', 'Torna ai componenti'); return res.status(p.stato).send(p.html); }
    const oggi = oggiRoma();
    const [ordini, fatture, bom] = await Promise.all([righeAcquistoComponente(c), righeFattureComponente(c), bomDelComponente(c)]);
    const righe = [...ordini.map(r => ({ ...r, fonte: 'ordine' as const })), ...comeRigheAcquisto(fatture)];
    const s = schedaArticolo(righe, oggi);
    const titolo = c.pn || c.codice_gestionale || c.codice_produzione || `componente ${c.id}`;
    const p = pagina(req, `Analisi ${titolo}`, html`
      <div class="intestazione-pagina"><div><h1>${titolo}</h1><p class="nota">${c.descrizione ?? ''}${c.produttore ? ` · ${c.produttore}` : ''}
        ${c.famiglia ? ` · ${c.famiglia}${FAMIGLIE[c.famiglia] ? ` ${FAMIGLIE[c.famiglia].nome}` : ''}` : ''}<br>
        ${c.codice_gestionale ? html`gestionale <b>${c.codice_gestionale}</b> · ` : ''}${c.codice_produzione ? html`produzione <b>${c.codice_produzione}</b> · ` : ''}
        <a href="/anagrafiche/componenti?q=${encodeURIComponent(c.pn ?? c.codice_gestionale ?? '')}">Anagrafica</a>${c.pn ? html` · <a href="/quotazioni/prezzo?pn=${encodeURIComponent(c.pn)}">Miglior prezzo oggi</a> · <a href="/amministrazione/analisi/acquisti?q=${encodeURIComponent(c.pn)}">Cerca negli acquisti</a>` : ''}</p></div>
        <div class="azioni non-stampare"><button type="button" id="stampa">Stampa</button></div></div>
      <div class="non-stampare">${menuAmministrazione('analisi')}</div>
      ${tastiAnalisi('fornitori')}
      ${cifreArticolo(s, 'pezzi', { prezzo: c.prezzo_acquisto, fornitore: c.prezzo_fornitore, data: c.prezzo_data, quantita: c.prezzo_quantita, fonte: c.prezzo_fonte })}
      <h2>Anno per anno</h2>
      <p class="nota">Dalle righe delle fatture dei fornitori (storico di Fatture in Cloud dal 2019 e fatture dallo SdI) e degli ordini a fornitore del portale non ancora fatturati, con questo componente
        (P/N, codice gestionale o di produzione): pezzi, spesa, prezzo medio pesato sui pezzi e la sua variazione (riga in rosso se il prezzo sale del 10 % o più), fornitori usati, ultimo acquisto.</p>
      ${tabellaArticolo(s, 'Pezzi')}
      ${tabellaRighe(righe)}
      <h2>Schede che lo usano · ${bom.length}</h2>
      <p class="nota">BOM quotate o codificate in Quotazioni e Codifica componenti in cui compare il componente (stesso P/N o codice gestionale), con i pezzi a scheda.</p>
      ${bom.length ? html`<div class="tabella-scorre"><table class="elenco">
        <thead><tr><th>BOM</th><th>Cliente</th><th>Preventivo</th><th class="num">Pezzi a scheda</th><th>Aggiornata</th></tr></thead>
        <tbody>${bom.map(b => html`<tr><td><a href="/quotazioni/bom/${b.id}">${b.nome}</a>${b.solo_codifica ? html` <span class="etichetta">solo codifica</span>` : ''}</td>
          <td>${b.cliente ?? ''}</td><td>${b.preventivo ?? ''}</td><td class="num">${num(b.quantita, 0)}</td><td>${dataIt(b.data)}</td></tr>`)}</tbody></table></div>`
        : html`<p class="vuoto">Non compare in nessuna BOM del portale.</p>`}`);
    res.status(p.stato).send(p.html);
  });

  // ── Scheda del materiale di consumo ──
  r.get('/materiale', async (req: Request, res) => {
    const id = Number(req.query.id);
    const m = Number.isInteger(id) && id > 0 ? await materialePerId(id) : undefined;
    if (!m) { const p = nonTrovato(req, 'Materiale', '/anagrafiche/materiali', 'Torna ai materiali di consumo'); return res.status(p.stato).send(p.html); }
    const oggi = oggiRoma();
    const [ordini, fatture] = await Promise.all([righeAcquistoMateriale(m.codice), righeFattureMateriale(m.id)]);
    const righe = [...ordini.map(r => ({ ...r, fonte: 'ordine' as const })), ...comeRigheAcquisto(fatture)];
    const s = schedaArticolo(righe, oggi);
    const um = (m.um ?? 'PZ').toUpperCase();
    const p = pagina(req, `Analisi ${m.codice}`, html`
      <div class="intestazione-pagina"><div><h1>${m.codice}</h1><p class="nota">${m.descrizione} · ${eCategoria(m.categoria) ? CATEGORIE_MATERIALI[m.categoria] : m.categoria}${m.attivo ? '' : html` · <span class="etichetta">non attivo</span>`}
        · <a href="/anagrafiche/materiali?categoria=${encodeURIComponent(m.categoria)}">Anagrafica</a></p></div>
        <div class="azioni non-stampare"><button type="button" id="stampa">Stampa</button></div></div>
      <div class="non-stampare">${menuAmministrazione('analisi')}</div>
      ${tastiAnalisi('fornitori')}
      ${cifreArticolo(s, um, { prezzo: m.prezzo_acquisto, fornitore: m.prezzo_fornitore, data: m.prezzo_data, quantita: m.prezzo_quantita, fonte: m.prezzo_fonte })}
      <h2>Anno per anno</h2>
      <p class="nota">Dalle righe delle fatture dei fornitori abbinate a questo materiale (codice ${m.codice} o i codici del fornitore scritti tra parentesi nella descrizione) e dagli ordini
        a fornitore del portale non ancora fatturati: quantità (${um}), spesa, prezzo medio pesato e la sua variazione (riga in rosso se il prezzo sale del 10 % o più), fornitori usati, ultimo acquisto.</p>
      ${tabellaArticolo(s, um)}
      ${tabellaRighe(righe)}`);
    res.status(p.stato).send(p.html);
  });

  return r;
}
