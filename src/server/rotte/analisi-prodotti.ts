/**
 * Amministrazione → Analisi → Prodotti e Clienti (Adriano 5/11/2026):
 *  - /amministrazione/analisi/prodotti   classifica dei prodotti con filtro per cliente e anno (+ Excel);
 *  - /amministrazione/analisi/prodotto   scheda di analisi di un prodotto: pezzi, fatturato e variazione per anno, peso sul cliente e
 *                                        sull'azienda, prezzo medio, lotti e lotto medio, ultimo ordine, margine preventivo e consuntivo;
 *  - /amministrazione/analisi/clienti    visione d'insieme dei clienti: classifica con peso, chi sale e chi scende, concentrazione,
 *                                        fermi da oltre 6 mesi, nuovi e persi, margine medio, tempi di pagamento e insoluti (→ Crediti).
 * Conti in engine/analisi-prodotti.ts, letture in analisi-prodotti-servizio.ts; tutto letto all'apertura della pagina.
 */
import { Router, type Request } from 'express';
import { layout } from '../views/layout.js';
import { html, num, raw, type Raw } from '../views/html.js';
import { menuAmministrazione } from './cruscotto-amministrazione.js';
import { analisiClienti } from '../../engine/analisi.js';
import { causaleDaFatturare } from '../../engine/ddt.js';
import {
  classificaProdotti, margineMedioConsuntivi, riepilogoProdotti, schedaProdotto, totaliFatturato, visioneClienti, MESI_FERMO,
  type DatiExtraCliente, type ProdottoAnalisi, type RigaVisioneCliente,
} from '../../engine/analisi-prodotti.js';
import {
  clientiConVendite, commesseProdotto, consegneClienti, creditiPerCliente, fattureTutte, ordiniProdottoPerAnno, preventiviProdotto, prodottoDaCodice, righeVendite,
} from '../analisi-prodotti-servizio.js';
import { caricaDatiAnalisi, tastiAnalisi } from './analisi.js';
import { excelSemplice, inviaExcel, nomeExcel } from '../excel.js';

const oggiRoma = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
const euro = (n: number | null | undefined) => (n == null ? '' : `${num(n, 0)} €`);
const euroCent = (n: number | null | undefined) => (n == null ? '' : `${num(n, 2)} €`);
const pct = (v: number | null | undefined) => (v == null ? '' : `${v > 0 ? '+' : ''}${num(v, 0)}%`);
const pctDec = (v: number | null | undefined) => (v == null ? '' : `${num(v, 1)}%`);
const dataIt = (d: string | null | undefined) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '');
const testoFermo = (mesi: number | null) => (mesi == null ? '' : mesi >= 24 ? `da ${Math.floor(mesi / 12)} anni` : mesi >= 12 ? 'da oltre un anno' : `da ${mesi} mesi`);
const linkScheda = (codice: string, cliente: string) => `/amministrazione/analisi/prodotto?codice=${encodeURIComponent(codice)}&cliente=${encodeURIComponent(cliente)}`;
const linkCliente = (c: { clienteId: number | null; cliente: string }): Raw => (c.clienteId ? html`<a href="/anagrafiche/clienti/${c.clienteId}">${c.cliente}</a>` : html`${c.cliente}`);

/** Anno scelto nell'indirizzo, tra il 2019 e quest'anno. */
function annoScelto(req: Request, annoOggi: number): number {
  return Math.min(annoOggi, Math.max(2019, Number(req.query.anno) || annoOggi));
}
const anniScelta = (annoOggi: number) => Array.from({ length: annoOggi - 2019 + 1 }, (_, i) => annoOggi - i);

/** Dati comuni della classifica dei prodotti (anche per l'Excel). */
async function datiClassifica(req: Request) {
  const oggi = oggiRoma(), annoOggi = Number(oggi.slice(0, 4));
  const anno = annoScelto(req, annoOggi);
  const cliente = String(req.query.cliente ?? '').trim() || null;
  const cerca = String(req.query.cerca ?? '').trim().toUpperCase();
  const [righe, fatture, clienti] = await Promise.all([righeVendite(), fattureTutte(), clientiConVendite()]);
  const prodotti = riepilogoProdotti(righe);
  let classifica = classificaProdotti(prodotti.values(), totaliFatturato(fatture), anno, oggi, cliente);
  if (cerca) classifica = classifica.filter(p => p.codice.includes(cerca) || p.descrizione.toUpperCase().includes(cerca) || p.cliente.toUpperCase().includes(cerca));
  return { oggi, annoOggi, anno, cliente, cerca, clienti, classifica };
}

function paginaClassifica(d: Awaited<ReturnType<typeof datiClassifica>>, tutti: boolean): Raw {
  const { anno, annoOggi, cliente, cerca, clienti, classifica } = d;
  const mostra = tutti ? classifica : classifica.slice(0, 100);
  const nomeCliente = clienti.find(c => c.chiave === cliente)?.nome;
  const totFatturato = classifica.reduce((t, p) => t + p.fatturato, 0), totPezzi = classifica.reduce((t, p) => t + p.pezzi, 0);
  const fermi = classifica.filter(p => p.fermo && (p.fatturato > 0 || p.fatturatoPrima > 0)).length;
  const inCalo = classifica.filter(p => p.variazione != null && p.variazione <= -30 && p.fatturatoPrima >= 1000).length;
  const indirizzo = (extra: string) => `/amministrazione/analisi/prodotti?anno=${anno}${cliente ? `&cliente=${encodeURIComponent(cliente)}` : ''}${cerca ? `&cerca=${encodeURIComponent(cerca)}` : ''}${extra}`;
  return html`
    <div class="intestazione-pagina"><h1>Classifica dei prodotti ${anno}${nomeCliente ? html` · ${nomeCliente}` : ''}</h1>
      <div class="azioni non-stampare"><a class="bottone" href="${indirizzo('').replace('/prodotti?', '/prodotti.xlsx?')}">Excel</a> <button type="button" id="stampa">Stampa</button></div></div>
    <div class="non-stampare">${menuAmministrazione('analisi')}</div>
    ${tastiAnalisi('prodotti')}
    <form class="cerca-crm non-stampare" method="get" action="/amministrazione/analisi/prodotti">
      <label>Anno <select name="anno">${anniScelta(annoOggi).map(a => html`<option ${a === anno ? raw('selected') : ''}>${a}</option>`)}</select></label>
      <label>Cliente <select name="cliente"><option value="">Tutti i clienti</option>
        ${clienti.map(c => html`<option value="${c.chiave}" ${c.chiave === cliente ? raw('selected') : ''}>${c.nome}</option>`)}</select></label>
      <input type="search" name="cerca" value="${cerca}" placeholder="Codice o descrizione">
      <button>Mostra</button></form>
    <p class="nota">Dalle righe delle fatture emesse (anche lo storico di Fatture in Cloud dal 2019), note di credito in negativo; fuori servizi e lamine.
      Lotti = consegne (DDT di vendita e fatture senza DDT). Peso = quanto vale il prodotto sul fatturato del suo cliente e su tutto il fatturato dell'anno.
      Clic sul codice per la scheda del prodotto; le colonne si ordinano cliccando l'intestazione.</p>
    <div class="cifre">
      <div class="cifra"><span>Prodotti venduti</span><b>${classifica.filter(p => p.fatturato > 0).length}</b><small>${num(totPezzi, 0)} pezzi · ${euro(totFatturato)}</small></div>
      <div class="cifra ${inCalo ? 'allarme' : ''}"><span>In calo forte</span><b>${inCalo}</b><small>fatturato −30 % o più sull'anno prima</small></div>
      <div class="cifra"><span>Fermi</span><b>${fermi}</b><small>nessuna consegna da oltre ${MESI_FERMO} mesi</small></div>
    </div>
    <div class="tabella-scorre"><table class="elenco">
      <thead><tr><th>Codice</th><th>Descrizione</th><th>Cliente</th><th class="num">Pezzi</th><th class="num">Fatturato</th><th class="num">${anno - 1}</th><th class="num">Variazione</th>
        <th class="num">Peso cliente</th><th class="num">Peso totale</th><th class="num">Prezzo medio</th><th class="num">Lotti</th><th class="num">Lotto medio</th><th>Ultima consegna</th></tr></thead>
      <tbody>${mostra.map(p => html`<tr class="${p.variazione != null && p.variazione <= -30 && p.fatturatoPrima >= 1000 ? 'scaduta' : ''}">
        <td><a href="${linkScheda(p.codice, p.clienteChiave)}">${p.codice}</a></td><td>${p.descrizione}</td><td>${linkCliente(p)}</td>
        <td class="num">${num(p.pezzi, 0)}</td><td class="num">${euro(p.fatturato)}</td><td class="num">${euro(p.fatturatoPrima)}</td><td class="num">${pct(p.variazione)}</td>
        <td class="num">${pctDec(p.pesoCliente)}</td><td class="num">${pctDec(p.pesoTotale)}</td><td class="num">${euroCent(p.prezzoMedio)}</td>
        <td class="num">${p.lotti || ''}</td><td class="num">${p.lottoMedio != null ? num(p.lottoMedio, 0) : ''}</td>
        <td data-valore="${p.ultimaConsegna ?? ''}">${dataIt(p.ultimaConsegna)}${p.fermo ? html` <span class="etichetta">fermo ${testoFermo(p.mesiFermo)}</span>` : ''}</td></tr>`)}</tbody></table></div>
    ${classifica.length > mostra.length ? html`<p class="nota">Elencati i primi ${mostra.length} di ${classifica.length}. <a href="${indirizzo('&tutti=1')}">Mostra tutti</a></p>` : ''}
    ${!classifica.length ? html`<p class="nota">Nessun prodotto venduto in questo anno${nomeCliente ? ' a questo cliente' : ''}.</p>` : ''}`;
}

/** Trova il prodotto della scheda: `cliente` può essere la chiave (c12, n:NOME) o il nome del cliente. */
function trovaProdotto(prodotti: Map<string, ProdottoAnalisi>, codice: string, cliente: string): ProdottoAnalisi | null {
  const cod = codice.trim().toUpperCase(), cl = cliente.trim();
  const diretto = prodotti.get(`${cl}|${cod}`);
  if (diretto) return diretto;
  const stessoCodice = [...prodotti.values()].filter(p => p.codice === cod);
  return stessoCodice.find(p => p.cliente.toUpperCase() === cl.toUpperCase()) ?? (stessoCodice.length === 1 ? stessoCodice[0] : null);
}

function paginaScheda(p: ProdottoAnalisi, s: ReturnType<typeof schedaProdotto>, preventivi: Awaited<ReturnType<typeof preventiviProdotto>>,
  commesse: Awaited<ReturnType<typeof commesseProdotto>>, prodottoId: number | null): Raw {
  const ultimoPrev = preventivi[0] ?? null;
  const consuntivi = margineMedioConsuntivi(commesse.map(c => c.consuntivo).filter((c): c is NonNullable<typeof c> => !!c));
  const ultimo = s.righe[s.righe.length - 1], penultimo = s.righe[s.righe.length - 2];
  const haOrdini = s.righe.some(r => r.ordini != null);
  const STATI: Record<string, string> = { bozza: 'bozza', inviato: 'inviato', accettato: 'accettato', archiviato: 'archiviato', da_validare: 'da validare' };
  const STATI_COMMESSA: Record<string, string> = { aperta: 'aperta', in_produzione: 'in produzione', rientrata: 'rientrata', analizzata: 'analizzata', chiusa: 'chiusa' };
  return html`
    <div class="intestazione-pagina"><div><h1>${p.codice}</h1><p class="nota">${p.descrizione} · ${linkCliente(p)}
      ${prodottoId ? html` · <a href="/anagrafiche/prodotti/${prodottoId}">Anagrafica</a>` : html` · <span class="etichetta">non in anagrafica</span>`}</p></div>
      <div class="azioni non-stampare"><a class="bottone" href="/amministrazione/analisi/prodotti?cliente=${encodeURIComponent(p.clienteChiave)}">Prodotti del cliente</a> <button type="button" id="stampa">Stampa</button></div></div>
    <div class="non-stampare">${menuAmministrazione('analisi')}</div>
    ${tastiAnalisi('prodotti')}
    <div class="cifre">
      <div class="cifra"><span>Fatturato totale</span><b>${euro(s.totale.fatturato)}</b><small>${num(s.totale.pezzi, 0)} pezzi dal ${dataIt(s.primaData)} · prezzo medio ${euroCent(s.totale.prezzoMedio)}</small></div>
      <div class="cifra"><span>Ultimo anno ${ultimo?.anno ?? ''}</span><b>${euro(ultimo?.fatturato ?? 0)}</b><small>${ultimo ? `${num(ultimo.pezzi, 0)} pezzi` : ''}${penultimo ? ` · ${pct(ultimo?.variazione)} sul ${penultimo.anno}` : ''}</small></div>
      <div class="cifra ${s.fermo ? 'allarme' : ''}"><span>Ultima consegna</span><b>${dataIt(s.ultimaData) || '—'}</b><small>${s.fermo ? `fermo ${testoFermo(s.mesiFermo)}` : s.mesiFermo != null ? `${s.mesiFermo} mesi fa` : ''}</small></div>
      <div class="cifra"><span>Lotti</span><b>${s.totale.lotti}</b><small>${s.totale.lottoMedio != null ? `lotto medio ${num(s.totale.lottoMedio, 0)} pezzi` : 'nessuna consegna registrata'}</small></div>
      <div class="cifra"><span>Margine preventivo</span><b>${ultimoPrev?.marginePct != null ? pctDec(ultimoPrev.marginePct) : '—'}</b>
        <small>${ultimoPrev ? `${ultimoPrev.numero}, ${dataIt(ultimoPrev.data)}, prezzo a scheda ${euroCent(ultimoPrev.prezzoScheda)}` : 'nessun preventivo nel portale'}</small></div>
      <div class="cifra ${consuntivi.realePct != null && consuntivi.previstoPct != null && consuntivi.realePct < consuntivi.previstoPct - 5 ? 'allarme' : ''}"><span>Margine consuntivo</span>
        <b>${consuntivi.realePct != null ? pctDec(consuntivi.realePct) : '—'}</b>
        <small>${consuntivi.commesse ? `${consuntivi.commesse} ${consuntivi.commesse === 1 ? 'commessa' : 'commesse'} con i tempi · previsto ${pctDec(consuntivi.previstoPct)}` : 'nessuna commessa con i tempi di produzione'}</small></div>
    </div>

    <h2>Anno per anno</h2>
    <p class="nota">Pezzi e fatturato dalle righe delle fatture (note di credito in negativo); peso = quanto vale il prodotto sul fatturato del cliente e dell'azienda in quell'anno;
      lotti = consegne (DDT di vendita e fatture senza DDT), lotto medio = pezzi consegnati ÷ lotti${haOrdini ? '; ordini = ordini del portale (dal 2025)' : ''}.</p>
    <div class="tabella-scorre"><table class="elenco" data-non-ordinare>
      <thead><tr><th>Anno</th><th class="num">Pezzi</th><th class="num">Var. pezzi</th><th class="num">Fatturato</th><th class="num">Variazione</th><th class="num">Peso cliente</th><th class="num">Peso totale</th>
        <th class="num">Prezzo medio</th><th class="num">Lotti</th><th class="num">Lotto medio</th>${haOrdini ? html`<th class="num">Ordini</th>` : ''}<th>Ultima consegna</th></tr></thead>
      <tbody>${s.righe.map(r => html`<tr class="${r.variazione != null && r.variazione <= -30 ? 'scaduta' : ''}"><td>${r.anno}</td><td class="num">${num(r.pezzi, 0)}</td><td class="num">${pct(r.variazionePezzi)}</td>
        <td class="num">${euro(r.fatturato)}</td><td class="num">${pct(r.variazione)}</td><td class="num">${pctDec(r.pesoCliente)}</td><td class="num">${pctDec(r.pesoTotale)}</td>
        <td class="num">${euroCent(r.prezzoMedio)}</td><td class="num">${r.lotti || ''}</td><td class="num">${r.lottoMedio != null ? num(r.lottoMedio, 0) : ''}</td>
        ${haOrdini ? html`<td class="num">${r.ordini ?? ''}</td>` : ''}<td>${dataIt(r.ultimaData)}</td></tr>`)}
        <tr><th>Totale</th><th class="num">${num(s.totale.pezzi, 0)}</th><th></th><th class="num">${euro(s.totale.fatturato)}</th><th></th><th></th><th></th>
          <th class="num">${euroCent(s.totale.prezzoMedio)}</th><th class="num">${s.totale.lotti || ''}</th><th class="num">${s.totale.lottoMedio != null ? num(s.totale.lottoMedio, 0) : ''}</th>${haOrdini ? html`<th></th>` : ''}<th></th></tr></tbody></table></div>

    <h2>Margine: preventivo e consuntivo</h2>
    ${preventivi.length ? html`<p class="nota">Preventivi del prodotto nel portale: prezzo a scheda e margine dei lotti successivi (senza una tantum).</p>
      <div class="tabella-scorre"><table class="elenco"><thead><tr><th>Preventivo</th><th>Data</th><th>Stato</th><th class="num">Schede</th><th class="num">Prezzo a scheda</th><th class="num">Margine</th></tr></thead>
        <tbody>${preventivi.map(v => html`<tr><td><a href="/preventivi/${v.id}">${v.numero}</a></td><td>${dataIt(v.data)}</td><td>${STATI[v.stato] ?? v.stato}</td><td class="num">${num(v.nSchede, 0)}</td>
          <td class="num">${euroCent(v.prezzoScheda)}</td><td class="num">${pctDec(v.marginePct)}</td></tr>`)}</tbody></table></div>`
      : html`<p class="nota">Nessun preventivo di questo prodotto nel portale: il margine si vedrà dal primo preventivo.</p>`}
    ${commesse.length ? html`<p class="nota">Commesse: costo delle fasi previsto dal preventivo contro i tempi scritti sulla scheda di produzione (le fasi senza tempi restano al previsto;
        "copertura" = fasi con i tempi su quelle previste). Margine = prezzo del lotto − fasi − materiali e consumi del preventivo.</p>
      <div class="tabella-scorre"><table class="elenco"><thead><tr><th>Commessa</th><th>Stato</th><th class="num">Schede</th><th class="num">Prezzo lotto</th><th class="num">Fasi previste</th><th class="num">Fasi reali</th>
        <th class="num">Scostamento</th><th class="num">Ore ciclo prev. / reali</th><th class="num">Margine previsto</th><th class="num">Margine reale</th><th class="num">Copertura</th></tr></thead>
        <tbody>${commesse.map(c => { const k = c.consuntivo; const conTempi = !!k && k.fasiConTempi > 0; return html`<tr class="${conTempi && k!.margineRealePct != null && k!.marginePrevistoPct != null && k!.margineRealePct < k!.marginePrevistoPct - 5 ? 'scaduta' : ''}">
          <td><a href="/commesse/${c.id}">${c.numero}</a></td><td>${STATI_COMMESSA[c.stato] ?? c.stato}</td><td class="num">${num(c.quantita, 0)}</td>
          <td class="num">${k ? euro(k.prezzoLotto) : ''}</td><td class="num">${k ? euro(k.costoFasiPrevisto) : ''}</td><td class="num">${conTempi ? euro(k!.costoFasiReale) : ''}</td>
          <td class="num">${conTempi ? pct(k!.scostamentoFasiPct) : ''}</td><td class="num">${k ? `${num(k.oreCicloPreviste, 1)}${conTempi ? ` / ${num(k.oreCicloReali, 1)}` : ''}` : ''}</td>
          <td class="num">${k ? html`${euro(k.marginePrevisto)} <small class="tenue">${pctDec(k.marginePrevistoPct)}</small>` : ''}</td>
          <td class="num">${conTempi ? html`${euro(k!.margineReale)} <small class="tenue">${pctDec(k!.margineRealePct)}</small>` : html`<small class="tenue">senza tempi</small>`}</td>
          <td class="num">${k ? `${k.fasiConTempi}/${k.fasiTotali}` : ''}</td></tr>`; })}</tbody></table></div>`
      : html`<p class="nota">Nessuna commessa di questo prodotto nel portale: il consuntivo arriva con i tempi della scheda di produzione.</p>`}`;
}

function paginaClienti(v: ReturnType<typeof visioneClienti>, annoOggi: number): Raw {
  const { anno, finoA } = v;
  const confronto = finoA ? `stesso periodo ${anno - 1}` : `${anno - 1}`;
  const SEGNALI: Record<string, string> = { 'calo forte': 'calo forte', 'in calo': 'in calo', 'in crescita': 'in crescita', nuovo: 'nuovo', perso: 'perso', fermo: 'fermo' };
  const elencoClienti = (xs: RigaVisioneCliente[], testo: (c: RigaVisioneCliente) => string) => (xs.length
    ? html`<ul class="elenco-semplice">${xs.slice(0, 12).map(c => html`<li>${linkCliente(c)} <small class="tenue">${testo(c)}</small></li>`)}${xs.length > 12 ? html`<li class="nota">e altri ${xs.length - 12}</li>` : ''}</ul>`
    : html`<p class="nota">Nessuno.</p>`);
  const conPagamenti = v.clienti.filter(c => c.giorniIncasso != null && c.fatturato > 0);
  const mediaGiorni = conPagamenti.length ? Math.round(conPagamenti.reduce((t, c) => t + (c.giorniIncasso ?? 0) * c.fatturato, 0) / conPagamenti.reduce((t, c) => t + c.fatturato, 0)) : null;
  const scadutoTot = v.clienti.reduce((t, c) => t + Math.max(0, c.scaduto), 0);
  return html`
    <div class="intestazione-pagina"><h1>Clienti ${anno}: visione d'insieme</h1>
      <div class="azioni non-stampare"><a class="bottone" href="/amministrazione/analisi/clienti.xlsx?anno=${anno}">Excel</a> <button type="button" id="stampa">Stampa</button></div></div>
    <div class="non-stampare">${menuAmministrazione('analisi')}</div>
    ${tastiAnalisi('clienti')}
    <form class="cerca non-stampare" method="get" action="/amministrazione/analisi/clienti"><select name="anno">${anniScelta(annoOggi).map(a => html`<option ${a === anno ? raw('selected') : ''}>${a}</option>`)}</select><button>Mostra</button></form>
    <p class="nota">${finoA ? html`Dal 1° gennaio a oggi, confrontato con lo stesso periodo del ${anno - 1}.` : html`Anno intero, confrontato con il ${anno - 1}.`}
      Fatturato = imponibile delle fatture emesse meno le note di credito (anche lo storico di Fatture in Cloud dal 2019). Per il dettaglio di un cliente: clic sul nome (scheda del cliente).</p>
    <div class="cifre">
      <div class="cifra"><span>Fatturato</span><b>${euro(v.totale)}</b><small>${pct(v.variazione)} sul ${confronto} (${euro(v.totalePrima)}) · ${v.clienti.filter(c => c.fatturato > 0).length} clienti</small></div>
      <div class="cifra ${v.primi3 >= 50 ? 'allarme' : ''}"><span>Concentrazione</span><b>${num(v.primi3, 1)}%</b><small>primi 3 clienti · primi 5: ${num(v.primi5, 1)}%</small></div>
      <div class="cifra ${v.inCaloForte.length ? 'allarme' : ''}"><span>In calo forte</span><b>${v.inCaloForte.length}</b><small>−30 % o più sul ${confronto}</small></div>
      <div class="cifra"><span>Fermi</span><b>${v.fermi.length}</b><small>nessuna vendita da oltre ${MESI_FERMO} mesi</small></div>
      <div class="cifra"><span>Nuovi / persi</span><b>${v.nuovi.length} / ${v.persi.length}</b><small>prima vendita nel ${anno} / compravano nel ${anno - 1}, niente nel ${anno}</small></div>
      <div class="cifra ${scadutoTot > 0 ? 'allarme' : ''}"><span>Insoluti</span><b>${euro(scadutoTot)}</b><small>scaduto da incassare${mediaGiorni != null ? ` · incasso medio ${mediaGiorni} giorni` : ''} · <a href="/amministrazione/crediti">Crediti →</a></small></div>
    </div>

    <div class="colonne-analisi">
      <section><h2>Calo forte</h2>${elencoClienti(v.inCaloForte, c => `${euro(c.prima)} → ${euro(c.fatturato)} (${pct(c.variazione)})`)}</section>
      <section><h2>Fermi da oltre ${MESI_FERMO} mesi</h2>${elencoClienti(v.fermi, c => `ultima vendita ${dataIt(c.ultimaVendita)} · ${euro(c.primaAnnoIntero)} nel ${anno - 1}`)}</section>
      <section><h2>Nuovi del ${anno}</h2>${elencoClienti(v.nuovi, c => euro(c.fatturato))}</section>
      <section><h2>Persi (niente nel ${anno})</h2>${elencoClienti(v.persi, c => `${euro(c.primaAnnoIntero)} nel ${anno - 1} · ultima vendita ${dataIt(c.ultimaVendita)}`)}</section>
    </div>

    <h2>Classifica · ${v.clienti.filter(c => c.fatturato > 0).length} clienti con fatturato</h2>
    <p class="nota">Margine medio = margine dell'ultimo preventivo di ogni codice, pesato sul fatturato dei prodotti con preventivo (copertura tra parentesi).
      Giorni di incasso = dalla fattura all'incasso negli ultimi 12 mesi; ritardo = giorni oltre la scadenza. Scaduto = rate non incassate oltre la scadenza (<a href="/amministrazione/crediti">Crediti</a>).</p>
    <div class="tabella-scorre"><table class="elenco">
      <thead><tr><th>#</th><th>Cliente</th><th class="num">Fatturato</th><th class="num">Peso</th><th class="num">${confronto}</th><th class="num">Variazione</th><th>Segnale</th>
        <th>Ultima vendita</th><th class="num">Margine medio</th><th class="num">Giorni incasso</th><th class="num">Ritardo</th><th class="num">Scaduto</th></tr></thead>
      <tbody>${v.clienti.map((c, i) => html`<tr class="${c.segnale === 'calo forte' ? 'scaduta' : ''}"><td class="num">${c.fatturato > 0 ? i + 1 : ''}</td><td>${linkCliente(c)}</td>
        <td class="num">${euro(c.fatturato)}</td><td class="num">${pctDec(c.quota)}</td><td class="num">${euro(c.prima)}</td><td class="num">${pct(c.variazione)}</td>
        <td>${c.segnale ? html`<span class="etichetta ${c.segnale === 'calo forte' || c.segnale === 'perso' ? 'prio-alta' : c.segnale === 'in crescita' || c.segnale === 'nuovo' ? 'cliente' : ''}">${SEGNALI[c.segnale]}</span>` : ''}</td>
        <td data-valore="${c.ultimaVendita ?? ''}">${dataIt(c.ultimaVendita)}</td>
        <td class="num">${c.marginePct != null ? html`${pctDec(c.marginePct)} <small class="tenue">(${c.copertura}%)</small>` : ''}</td>
        <td class="num">${c.giorniIncasso ?? ''}</td><td class="num">${c.ritardoMedio ? c.ritardoMedio : ''}</td>
        <td class="num">${c.scaduto > 0 ? html`<a href="/amministrazione/crediti">${euro(c.scaduto)}</a>` : ''}</td></tr>`)}</tbody></table></div>`;
}

/** Visione d'insieme dei clienti: fatture di tutti gli anni + margini, incassi e crediti. */
async function datiVisioneClienti(req: Request) {
  const oggi = oggiRoma(), annoOggi = Number(oggi.slice(0, 4));
  const anno = annoScelto(req, annoOggi);
  const finoA = anno === annoOggi ? oggi : null;
  const [fatture, consegne, crediti, dati] = await Promise.all([fattureTutte(), consegneClienti(anno - 2), creditiPerCliente(oggi), caricaDatiAnalisi(anno, oggi)]);
  const extra = new Map<string, DatiExtraCliente>();
  for (const c of analisiClienti({ anno, finoA }, dati.fatture, dati.righe, dati.preventivi, dati.incassi))
    extra.set(c.cliente, { margineStimato: c.margineStimato, copertura: c.copertura, giorniIncasso: c.giorniIncasso, ritardoMedio: c.ritardoMedio });
  for (const [nome, k] of crediti) extra.set(nome, { ...(extra.get(nome) ?? {}), scaduto: k.scaduto, esposizione: k.esposizione });
  const v = visioneClienti(fatture, anno, oggi, { finoA, extra, consegne: consegne.filter(k => causaleDaFatturare(k.causale)) });
  return { v, annoOggi };
}

export function rotteAnalisiProdotti() {
  const r = Router();

  r.get('/prodotti', async (req: Request, res) => {
    const d = await datiClassifica(req);
    res.send(String(layout({ titolo: `Classifica dei prodotti ${d.anno}`, utente: req.session.utente, attiva: 'amministrazione', contenuto: paginaClassifica(d, req.query.tutti === '1'), script: 'stampa.js', largo: true })));
  });
  r.get('/prodotti.xlsx', async (req: Request, res) => {
    const d = await datiClassifica(req);
    const dati = await excelSemplice(`Prodotti ${d.anno}`, [
      { header: 'Codice', key: 'codice', width: 18 }, { header: 'Descrizione', key: 'descrizione', width: 36 }, { header: 'Cliente', key: 'cliente', width: 30 },
      { header: 'Pezzi', key: 'pezzi', width: 10, formato: 'intero' }, { header: 'Fatturato €', key: 'fatturato', width: 14, formato: 'euro' },
      { header: `Fatturato ${d.anno - 1} €`, key: 'fatturatoPrima', width: 14, formato: 'euro' }, { header: 'Variazione %', key: 'variazione', width: 12, formato: 'intero' },
      { header: 'Peso sul cliente %', key: 'pesoCliente', width: 12 }, { header: 'Peso sul totale %', key: 'pesoTotale', width: 12 },
      { header: 'Prezzo medio €', key: 'prezzoMedio', width: 12, formato: 'euro' }, { header: 'Lotti', key: 'lotti', width: 8, formato: 'intero' },
      { header: 'Lotto medio', key: 'lottoMedio', width: 10, formato: 'intero' }, { header: 'Ultima consegna', key: 'ultimaConsegna', width: 14, formato: 'data' },
      { header: 'Fermo', key: 'fermo', width: 8 },
    ], d.classifica.map(p => ({ ...p, fermo: p.fermo ? 'sì' : '' })));
    inviaExcel(res, nomeExcel(`prodotti-${d.anno}`), dati);
  });

  r.get('/prodotto', async (req: Request, res) => {
    const codice = String(req.query.codice ?? '').trim(), cliente = String(req.query.cliente ?? '').trim();
    const oggi = oggiRoma();
    const [righe, fatture] = await Promise.all([righeVendite(), fattureTutte()]);
    const p = codice ? trovaProdotto(riepilogoProdotti(righe), codice, cliente) : null;
    if (!p) {
      return res.status(404).send(String(layout({ titolo: 'Prodotto', utente: req.session.utente, attiva: 'amministrazione', contenuto: html`
        <div class="intestazione-pagina"><h1>Prodotto non trovato</h1></div>${tastiAnalisi('prodotti')}
        <p class="nota">Nessuna vendita con il codice "${codice}"${cliente ? ` per ${cliente}` : ''}. <a href="/amministrazione/analisi/prodotti">Torna alla classifica</a>.</p>` })));
    }
    const prodottoId = p.prodottoId ?? (await prodottoDaCodice(p.clienteId, p.codice));
    const [preventivi, commesse, ordini] = await Promise.all([
      prodottoId ? preventiviProdotto(prodottoId) : Promise.resolve([]), prodottoId ? commesseProdotto(prodottoId) : Promise.resolve([]),
      ordiniProdottoPerAnno(prodottoId, p.clienteId, p.codice),
    ]);
    const s = schedaProdotto(p, totaliFatturato(fatture), oggi, ordini);
    res.send(String(layout({ titolo: `Analisi ${p.codice}`, utente: req.session.utente, attiva: 'amministrazione', contenuto: paginaScheda(p, s, preventivi, commesse, prodottoId), script: 'stampa.js', largo: true })));
  });

  r.get('/clienti', async (req: Request, res) => {
    const { v, annoOggi } = await datiVisioneClienti(req);
    res.send(String(layout({ titolo: `Clienti ${v.anno}: visione d'insieme`, utente: req.session.utente, attiva: 'amministrazione', contenuto: paginaClienti(v, annoOggi), script: 'stampa.js', largo: true })));
  });
  r.get('/clienti.xlsx', async (req: Request, res) => {
    const { v } = await datiVisioneClienti(req);
    const dati = await excelSemplice(`Clienti ${v.anno}`, [
      { header: 'Cliente', key: 'cliente', width: 34 }, { header: 'Fatturato €', key: 'fatturato', width: 14, formato: 'euro' }, { header: 'Peso %', key: 'quota', width: 9 },
      { header: `${v.anno - 1} €`, key: 'prima', width: 14, formato: 'euro' }, { header: 'Variazione %', key: 'variazione', width: 12, formato: 'intero' }, { header: 'Segnale', key: 'segnale', width: 12 },
      { header: 'Ultima vendita', key: 'ultimaVendita', width: 14, formato: 'data' }, { header: 'Margine medio %', key: 'marginePct', width: 12 }, { header: 'Copertura %', key: 'copertura', width: 10, formato: 'intero' },
      { header: 'Giorni incasso', key: 'giorniIncasso', width: 10, formato: 'intero' }, { header: 'Ritardo medio', key: 'ritardoMedio', width: 10, formato: 'intero' },
      { header: 'Scaduto €', key: 'scaduto', width: 12, formato: 'euro' }, { header: 'Esposizione €', key: 'esposizione', width: 12, formato: 'euro' },
    ], v.clienti.map(c => ({ ...c, segnale: c.segnale ?? '' })));
    inviaExcel(res, nomeExcel(`clienti-${v.anno}`), dati);
  });
  return r;
}
