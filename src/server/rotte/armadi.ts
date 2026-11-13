/**
 * Produzione → Stoccaggio componenti (Adriano 13/11/2026): contenuto degli armadi caricato dai file del programma degli armadi,
 * in attesa delle API. Valore dei componenti di Casteltech e, a parte, di quelli dei clienti con la % di riconoscimento.
 * Regole in engine/armadi.ts, letture in armadi-servizio.ts. Montata prima delle pagine delle macchine (rotte/macchine.ts).
 */
import express, { Router, type Request } from 'express';
import { PAGINE_MACCHINE } from '../../engine/macchine.js';
import { NOMI_FONTI, percentualeConPrezzo, percentualeValida, riconoscimentoDi, type FontePrezzo, type Quota } from '../../engine/armadi.js';
import { corrispondeRicerca } from '../../engine/ricerca.js';
import { layout } from '../views/layout.js';
import { html, euro, euroUnitario, num, raw } from '../views/html.js';
import { excelSemplice, inviaExcel, nomeExcel } from '../excel.js';
import {
  articoloArmadio, bobineDelCodice, caricaArmadi, cercaPrezziOnline, datiArmadi, dividiFile, impostazioniArmadi, ricalcolaPrezzi, salvaImpostazioniArmadi,
  salvaPrezzoManuale, statoRicercaOnline,
} from '../armadi-servizio.js';

const BASE = '/produzione/stoccaggio';
const msg = (req: Request) => (req.query.msg ? String(req.query.msg) : undefined);
const torna = (testo: string, dove = BASE) => `${dove}${dove.includes('?') ? '&' : '?'}msg=${encodeURIComponent(testo)}`;
const nomeFonte = (f: string | null) => (f ? NOMI_FONTI[f as FontePrezzo] ?? f : '');

type Dati = Awaited<ReturnType<typeof datiArmadi>>;
const nomeCliente = (d: Dati, id: number | null) => d.clienti.find(c => c.id === id)?.ragione_sociale ?? '?';
const etichetta = (d: Dati, x: Quota) => x.proprietario.tipo === 'casteltech'
  ? 'Casteltech'
  : x.proprietario.tipo === 'cliente' ? `${nomeCliente(d, x.proprietario.clienteId)}${x.proprietario.perConto ? ` (${x.proprietario.perConto})` : ''}` : `da chiarire${x.proprietario.sigla ? ` (${x.proprietario.sigla})` : ''}`;

/** Filtro di un elenco: di = casteltech | c<id> | da_chiarire, testo, prezzo = senza | con (vuoto = tutti). */
interface Filtro { di: string; testo: string; prezzo: '' | 'senza' | 'con' }
const vale = (di: string) => (x: Quota) => !di || (di === 'casteltech' ? x.proprietario.tipo === 'casteltech' : di === 'da_chiarire' ? x.proprietario.tipo === 'da_chiarire' : `c${x.proprietario.clienteId}` === di);
function filtra(d: Dati, f: Filtro) {
  const perCodice = new Map<string, Quota[]>();
  for (const x of d.quote) perCodice.set(x.codice, [...(perCodice.get(x.codice) ?? []), x]);
  return d.articoli.map(a => ({ a, quote: (perCodice.get(a.codice) ?? []).filter(vale(f.di)) }))
    .filter(r => r.quote.length && (!f.prezzo || (f.prezzo === 'senza') === (r.a.prezzo == null))
      && (!f.testo || corrispondeRicerca([r.a.codice, r.a.descrizione, r.a.pn, r.a.produttore, r.a.proprietario_file].join(' '), f.testo)));
}
/** Le due sezioni dell'elenco (Adriano 13/11/2026): senza prezzo e con prezzo, ognuna col suo filtro per proprietario (di_senza / di_con, q_senza / q_con). */
const SEZIONI = [{ chiave: 'senza', titolo: 'Componenti senza prezzo' }, { chiave: 'con', titolo: 'Componenti con il prezzo' }] as const;
const filtroDi = (q: Record<string, unknown>, sez: 'senza' | 'con'): Filtro => ({ di: String(q[`di_${sez}`] ?? ''), testo: String(q[`q_${sez}`] ?? '').trim(), prezzo: sez });
const RIGHE_VISTE = 100;
const perc = (p: number | null) => (p == null ? '' : `${num(p, 1)} %`);

export function rotteArmadi() {
  const r = Router();

  r.get('/stoccaggio', async (req, res) => {
    const d = await datiArmadi();
    const ricerca = statoRicercaOnline();
    const vuoto = !d.articoli.length;
    const rp = d.riepilogo;
    const valoreRiga = (q: Quota[]) => q.reduce((s, x) => s + x.valore, 0);
    const qs = (cambi: Record<string, string>) => { const p = new URLSearchParams(req.query as Record<string, string>); p.delete('pagina'); p.delete('msg'); for (const [k, v] of Object.entries(cambi)) v ? p.set(k, v) : p.delete(k); return `${BASE}?${p}`; };
    const menuProprietari = (nome: string, valore: string) => html`<select name="${nome}">
      <option value="" ${valore ? '' : raw('selected')}>— da chiarire —</option>
      <option value="casteltech" ${valore === 'casteltech' ? raw('selected') : ''}>Casteltech</option>
      ${d.clienti.map(c => html`<option value="c${c.id}" ${valore === `c${c.id}` ? raw('selected') : ''}>${c.ragione_sociale}</option>`)}</select>`;
    const totCodici = d.articoli.length, totSenza = d.articoli.filter(a => a.prezzo == null).length, totPezzi = d.articoli.reduce((s, a) => s + a.quantita, 0);
    // Menu del filtro "Proprietario" delle due sezioni: solo i proprietari che hanno codici
    const proprietariPresenti = [
      ...(rp.casteltech.codici ? [{ valore: 'casteltech', nome: 'Casteltech' }] : []),
      ...rp.clienti.map(c => ({ valore: `c${c.clienteId}`, nome: nomeCliente(d, c.clienteId) })),
      ...(rp.daChiarire.length ? [{ valore: 'da_chiarire', nome: 'Da chiarire' }] : []),
    ];
    const sezioneElenco = (sez: 'senza' | 'con', titolo: string) => {
      const f = filtroDi(req.query as Record<string, unknown>, sez);
      const tutte = filtra(d, f);
      const tutteVisibili = req.query[`tutte_${sez}`] === '1';
      const righe = tutteVisibili ? tutte : tutte.slice(0, RIGHE_VISTE);
      const altri = Object.entries(req.query as Record<string, string>).filter(([k]) => !k.endsWith(`_${sez}`) && k !== 'msg');
      return html`
      <section id="elenco-${sez}">
        <h2>${titolo} (${tutte.length})</h2>
        <form class="filtri-riga" method="get" action="${BASE}#elenco-${sez}">
          ${altri.map(([k, v]) => html`<input type="hidden" name="${k}" value="${v}">`)}
          <label>Proprietario <select name="di_${sez}"><option value="">Tutti</option>
            ${proprietariPresenti.map(p => html`<option value="${p.valore}" ${f.di === p.valore ? raw('selected') : ''}>${p.nome}</option>`)}</select></label>
          <input type="search" name="q_${sez}" value="${f.testo}" placeholder="Cerca codice, descrizione, P/N, produttore…" autocomplete="off">
          <button>Filtra</button>
          ${f.di || f.testo ? html`<a href="${qs({ [`di_${sez}`]: '', [`q_${sez}`]: '', [`tutte_${sez}`]: '' })}#elenco-${sez}">togli il filtro</a>` : ''}
        </form>
        <p>${tutte.length} codici${sez === 'con' ? html` · valore ${euro(tutte.reduce((s, x) => s + valoreRiga(x.quote), 0))}` : ''}
          · <a class="pulsante" href="${BASE}/elenco.xlsx?${new URLSearchParams({ prezzo: sez, di: f.di, q: f.testo })}">Excel</a></p>
        <table>
          <thead><tr><th>Codice</th><th>Descrizione</th><th>P/N</th><th>Proprietario</th><th class="num">Pezzi</th><th class="num">Bobine</th>
            ${sez === 'con' ? html`<th class="num">€ a pezzo</th><th>Prezzo da</th><th class="num">Valore</th>` : ''}</tr></thead>
          <tbody>${righe.map(({ a, quote }) => html`<tr>
            <td><a href="${BASE}/codice/${encodeURIComponent(a.codice)}">${a.codice}</a></td>
            <td>${a.descrizione ?? ''}${a.descrizione_fonte && a.descrizione_fonte !== 'armadi' ? html` <small class="nota">(${a.descrizione_fonte})</small>` : ''}</td>
            <td>${a.pn ?? ''}</td>
            <td>${quote.map((x, i) => html`${i ? html`<br>` : ''}${etichetta(d, x)}${quote.length > 1 ? html` <small>${num(x.quantita, 0)}</small>` : ''}`)}</td>
            <td class="num" data-valore="${quote.reduce((s, x) => s + x.quantita, 0)}">${num(quote.reduce((s, x) => s + x.quantita, 0), 0)}</td>
            <td class="num">${a.bobine || ''}</td>
            ${sez === 'con' ? html`<td class="num" data-valore="${a.prezzo ?? ''}">${a.prezzo != null ? euroUnitario(a.prezzo) : ''}</td>
            <td><small>${nomeFonte(a.prezzo_fonte)}${a.prezzo_data ? ` ${a.prezzo_data}` : ''}</small></td>
            <td class="num" data-valore="${valoreRiga(quote)}">${euro(valoreRiga(quote))}</td>` : ''}</tr>`)}</tbody>
        </table>
        ${tutte.length > righe.length ? html`<p><a href="${qs({ [`tutte_${sez}`]: '1' })}#elenco-${sez}">Mostra tutti i ${tutte.length} codici</a></p>` : ''}
      </section>`;
    };
    const pezziSigla = new Map<string, number>();
    for (const x of d.quote) if (x.proprietario.sigla) pezziSigla.set(x.proprietario.sigla, (pezziSigla.get(x.proprietario.sigla) ?? 0) + x.quantita);

    const carica = html`
      <details class="blocco" ${vuoto ? raw('open') : ''}>
        <summary>Carica i file degli armadi</summary>
        <div class="stretto-form dentro-blocco">
          <p class="nota">I due file esportati dal programma degli armadi: <b>ItemList_armadi.txt</b> (anagrafica dei codici con i pezzi) e <b>reel_archive.csv</b>
            (bobine con il codice univoco). Contano solo i codici con pezzi e le bobine non congelate. Ogni caricamento sostituisce il contenuto di prima;
            i prezzi scritti a mano e quelli trovati online restano. Prima mostra un riepilogo e chiede conferma.</p>
          <label>Anagrafica (ItemList) <input type="file" id="file-armadi-articoli" accept=".txt,.csv"></label>
          <label>Bobine (reel_archive) <input type="file" id="file-armadi-bobine" accept=".csv,.txt"></label>
          <button class="primario" type="button" id="carica-armadi">Controlla i file</button>
          <output id="esito-armadi"></output>
          <button class="primario" type="button" id="conferma-armadi" hidden>Conferma e carica</button>
        </div>
      </details>`;

    const contenuto = html`
      <nav class="tasti-sezione">${PAGINE_MACCHINE.map(x => html`<a href="/produzione/${x.chiave}" class="${x.chiave === 'stoccaggio' ? 'attivo' : ''}">${x.titolo}</a>`)}</nav>
      <h1>Stoccaggio componenti</h1>
      <p class="nota">Contenuto degli armadi caricato dai file del programma degli armadi${d.imp.caricato_il ? html` il ${new Date(d.imp.caricato_il).toLocaleString('it-IT', { timeZone: 'Europe/Rome', dateStyle: 'short', timeStyle: 'short' })}` : ''}.
        Quando gli armadi saranno collegati con le loro API si aggiornerà da solo. Il valore è pezzi × prezzo: prezzo scritto a mano, altrimenti l'ultimo acquisto,
        altrimenti i distributori online, altrimenti il prezzo scritto negli armadi.</p>
      ${vuoto ? carica : html`
      <div class="cifre">
        <div class="cifra"><span>Componenti di Casteltech</span><b>${euro(rp.casteltech.valore)}</b>
          <small>${num(rp.casteltech.codici, 0)} codici, ${num(rp.casteltech.pezzi, 0)} pezzi${rp.casteltech.senzaPrezzo ? html` · <a href="${qs({ di_senza: 'casteltech' })}#elenco-senza">${rp.casteltech.senzaPrezzo} senza prezzo</a>` : ''}</small></div>
        <div class="cifra"><span>Componenti dei clienti (riconosciuto)</span><b>${euro(rp.totaleClienti.riconosciuto)}</b>
          <small>valore di mercato ${euro(rp.totaleClienti.valore)}, ${rp.clienti.length} clienti</small></div>
        <div class="cifra"><span>Di chi non si sa</span><b>${num(rp.daChiarire.reduce((s, x) => s + x.pezzi, 0), 0)} pezzi</b>
          <small>${rp.daChiarire.length ? html`<a href="${qs({ di_senza: 'da_chiarire', di_con: 'da_chiarire' })}#elenco-senza">valore ${euro(rp.daChiarire.reduce((s, x) => s + x.valore, 0))}</a> · sigle qui sotto` : 'tutto assegnato'}</small></div>
        <div class="cifra"><span>Codici con il prezzo</span><b>${perc(percentualeConPrezzo(totCodici, totSenza))}</b>
          <small>${num(totCodici - totSenza, 0)} su ${num(totCodici, 0)} codici · <a href="#elenco-senza">${num(totSenza, 0)} senza prezzo</a></small></div>
      </div>

      <section class="riquadro">
        <h2>Componenti per proprietario</h2>
        <p class="nota">Il valore di mercato è pezzi × prezzo. "% con prezzo" = codici con un prezzo su tutti i codici del proprietario. La <b>% di riconoscimento</b> vale per i clienti:
          è la parte del loro valore che si conta, si cambia cliente per cliente (vuota = quella predefinita). Un codice con bobine di più proprietari conta per ognuno.</p>
        <form method="post" action="${BASE}/riconoscimento">
          <table>
            <thead><tr><th>Proprietario</th><th class="num">Codici</th><th class="num">Con prezzo</th><th class="num">Senza prezzo</th><th class="num">% con prezzo</th>
              <th class="num">Pezzi</th><th class="num">Valore di mercato</th><th class="num">% riconoscimento</th><th class="num">Valore contato</th></tr></thead>
            <tbody>
              <tr><td><a href="${qs({ di_senza: 'casteltech', di_con: 'casteltech' })}#elenco-senza"><b>Casteltech</b></a></td><td class="num">${rp.casteltech.codici}</td>
                <td class="num">${rp.casteltech.codici - rp.casteltech.senzaPrezzo}</td>
                <td class="num">${rp.casteltech.senzaPrezzo ? html`<a href="${qs({ di_senza: 'casteltech' })}#elenco-senza">${rp.casteltech.senzaPrezzo}</a>` : ''}</td>
                <td class="num">${perc(percentualeConPrezzo(rp.casteltech.codici, rp.casteltech.senzaPrezzo))}</td><td class="num">${num(rp.casteltech.pezzi, 0)}</td>
                <td class="num">${euro(rp.casteltech.valore)}</td><td class="num">—</td><td class="num">${euro(rp.casteltech.valore)}</td></tr>
              ${rp.clienti.map(c => html`<tr>
              <td><a href="${qs({ di_senza: `c${c.clienteId}`, di_con: `c${c.clienteId}` })}#elenco-senza">${nomeCliente(d, c.clienteId)}</a></td><td class="num">${c.codici}</td>
              <td class="num">${c.codici - c.senzaPrezzo}</td>
              <td class="num">${c.senzaPrezzo ? html`<a href="${qs({ di_senza: `c${c.clienteId}` })}#elenco-senza">${c.senzaPrezzo}</a>` : ''}</td>
              <td class="num">${perc(percentualeConPrezzo(c.codici, c.senzaPrezzo))}</td><td class="num">${num(c.pezzi, 0)}</td><td class="num">${euro(c.valore)}</td>
              <td class="num"><input name="c${c.clienteId}" inputmode="decimal" class="corto" value="${d.imp.riconoscimento.clienti[`c${c.clienteId}`] ?? ''}" placeholder="${d.imp.riconoscimento.predefinita}"> %</td>
              <td class="num">${euro(c.riconosciuto)}</td></tr>`)}
              ${rp.daChiarire.length ? html`<tr class="evidenza"><td><a href="${qs({ di_senza: 'da_chiarire', di_con: 'da_chiarire' })}#elenco-senza">Da chiarire</a></td>
                <td class="num">${rp.daChiarire.reduce((s, x) => s + x.codici, 0)}</td><td></td><td></td><td></td><td class="num">${num(rp.daChiarire.reduce((s, x) => s + x.pezzi, 0), 0)}</td>
                <td class="num">${euro(rp.daChiarire.reduce((s, x) => s + x.valore, 0))}</td><td></td><td></td></tr>` : ''}</tbody>
            <tfoot><tr><th>Totale (codici diversi)</th><th class="num">${totCodici}</th><th class="num">${totCodici - totSenza}</th><th class="num">${totSenza}</th>
              <th class="num">${perc(percentualeConPrezzo(totCodici, totSenza))}</th><th class="num">${num(totPezzi, 0)}</th>
              <th class="num">${euro(rp.casteltech.valore + rp.totaleClienti.valore + rp.daChiarire.reduce((s, x) => s + x.valore, 0))}</th><th></th>
              <th class="num">${euro(rp.casteltech.valore + rp.totaleClienti.riconosciuto)}</th></tr></tfoot>
          </table>
          <label>% predefinita per tutti i clienti <input name="predefinita" inputmode="decimal" class="corto" value="${d.imp.riconoscimento.predefinita}"> %</label>
          <button class="primario">Salva le %</button>
        </form>
      </section>

      <details class="blocco" ${rp.daChiarire.length ? raw('open') : ''}>
        <summary>Di chi sono: sigle degli armadi (${d.sigle.length}${rp.daChiarire.length ? `, ${rp.daChiarire.length} da chiarire` : ''})</summary>
        <form method="post" action="${BASE}/sigle" class="dentro-blocco">
          <p class="nota">Le sigle scritte negli armadi (colonna "fornitore" del codice e colonna Supplier della bobina). Fa fede la bobina: "CAST/LPS" e simili sono
            del cliente dopo la barra (comprati e già fatturati da Casteltech); solo "CASTELTECH" è nostro. Scegli a chi corrisponde ogni sigla.</p>
          <fieldset><legend>Se il codice dice una cosa e la bobina un'altra, vale</legend>
            <label class="spunta"><input type="radio" name="regola" value="bobina" ${d.imp.regola === 'bobina' ? raw('checked') : ''}> la sigla della bobina</label>
            <label class="spunta"><input type="radio" name="regola" value="articolo" ${d.imp.regola === 'articolo' ? raw('checked') : ''}> la sigla del codice (anagrafica degli armadi)</label>
          </fieldset>
          <table>
            <thead><tr><th>Sigla</th><th class="num">Pezzi</th><th>Di chi è</th></tr></thead>
            <tbody>${d.sigle.map(s => html`<tr class="${d.tabella[s] ? '' : 'evidenza'}"><td>${s}</td><td class="num">${num(pezziSigla.get(s) ?? 0, 0)}</td>
              <td>${menuProprietari(`s:${s}`, d.tabella[s] ?? '')}</td></tr>`)}</tbody>
          </table>
          <button class="primario">Salva</button>
        </form>
      </details>

      ${SEZIONI.map(z => sezioneElenco(z.chiave, z.titolo))}

      <section class="riquadro">
        <h2>Prezzi</h2>
        <p class="nota">"Cerca i prezzi online" chiede ai distributori collegati (DigiKey, Mouser, Farnell, TME…) i codici che hanno un P/N ma nessun acquisto:
          300 codici per volta, prima quelli di Casteltech, prezzo dello scaglione per i pezzi che abbiamo. Ogni richiesta consuma il limite giornaliero dei distributori.
          ${d.imp.online?.esito ? html`Ultima ricerca: ${d.imp.online.esito}.` : ''}</p>
        ${ricerca ? html`<p><b>Ricerca in corso:</b> ${ricerca.fatti} di ${ricerca.totale} codici. Ricarica la pagina tra qualche minuto.</p>` : html`
        <form method="post" action="${BASE}/cerca-prezzi" class="in-linea" data-conferma="Cerco i prezzi presso i distributori per un massimo di 300 codici?"><button class="primario">Cerca i prezzi online</button></form>`}
        <form method="post" action="${BASE}/ricalcola" class="in-linea"><button>Ricalcola i prezzi dagli acquisti</button></form>
      </section>
      ${carica}`}`;
    res.send(String(layout({ titolo: 'Stoccaggio componenti', utente: req.session.utente, attiva: 'produzione', contenuto, avviso: msg(req), script: 'armadi.js', largo: true })));
  });

  r.get('/stoccaggio/elenco.xlsx', async (req, res) => {
    const d = await datiArmadi();
    const q = req.query as Record<string, unknown>;
    const prezzo = q.prezzo === 'senza' || q.prezzo === 'con' ? q.prezzo : '';
    const righe = filtra(d, { di: String(q.di ?? ''), testo: String(q.q ?? '').trim(), prezzo }).flatMap(({ a, quote }) => quote.map(x => {
      const perc = x.proprietario.tipo === 'cliente' ? riconoscimentoDi(d.imp.riconoscimento, x.proprietario.clienteId!) : null;
      return { codice: a.codice, descrizione: a.descrizione, pn: a.pn, produttore: a.produttore, di: etichetta(d, x), sigla: x.proprietario.sigla, pezzi: x.quantita,
        prezzo: a.prezzo, fonte: nomeFonte(a.prezzo_fonte), nota: a.prezzo_nota, valore: x.valore, perc, riconosciuto: perc != null ? x.valore * perc / 100 : x.proprietario.tipo === 'casteltech' ? x.valore : null };
    }));
    inviaExcel(res, nomeExcel('stoccaggio-componenti'), await excelSemplice('Armadi', [
      { header: 'Codice', key: 'codice', width: 30 }, { header: 'Descrizione', key: 'descrizione', width: 50 }, { header: 'P/N', key: 'pn', width: 24 },
      { header: 'Produttore', key: 'produttore', width: 16 }, { header: 'Proprietario', key: 'di', width: 30 }, { header: 'Sigla', key: 'sigla', width: 14 },
      { header: 'Pezzi', key: 'pezzi', formato: 'intero' }, { header: '€ a pezzo', key: 'prezzo', formato: 'numero' }, { header: 'Prezzo da', key: 'fonte', width: 18 },
      { header: 'Nota prezzo', key: 'nota', width: 40 }, { header: 'Valore', key: 'valore', formato: 'euro' }, { header: '% riconoscimento', key: 'perc', formato: 'numero' },
      { header: 'Valore contato', key: 'riconosciuto', formato: 'euro' },
    ], righe));
  });

  r.get('/stoccaggio/codice/:codice', async (req, res) => {
    const a = await articoloArmadio(req.params.codice);
    if (!a) return res.status(404).send(String(layout({ titolo: 'Codice non trovato', utente: req.session.utente, attiva: 'produzione', contenuto: html`<h1>Codice non trovato</h1><p><a href="${BASE}">Torna allo stoccaggio</a></p>` })));
    const bobine = await bobineDelCodice(a.codice);
    const x = a as any;
    const contenuto = html`
      <p><a href="${BASE}">← Stoccaggio componenti</a></p>
      <h1>${a.codice}</h1>
      <p>${a.descrizione ?? ''}${a.descrizione_fonte && a.descrizione_fonte !== 'armadi' ? html` <small class="nota">(descrizione da ${a.descrizione_fonte})</small>` : ''}</p>
      <p>P/N: <b>${a.pn ?? '—'}</b> ${a.produttore ?? ''} · Pezzi: <b>${num(a.quantita, 0)}</b> · Sigla del codice: ${a.proprietario_file ?? '—'}
        ${a.componente_id ? html` · <a href="/amministrazione/analisi/componente?id=${a.componente_id}">archivio componenti e acquisti</a>` : ''}</p>
      <section class="riquadro">
        <h2>Prezzo</h2>
        <p>Usato: <b>${a.prezzo != null ? euroUnitario(a.prezzo) : 'nessuno'}</b> ${nomeFonte(a.prezzo_fonte)} ${a.prezzo_data ?? ''} ${a.prezzo_nota ? html`<small class="nota">(${a.prezzo_nota})</small>` : ''}</p>
        <p class="nota">Online: ${x.prezzo_online != null ? html`${euroUnitario(x.prezzo_online)} <small>(${x.prezzo_online_nota ?? ''})</small>` : x.cercato_online_il ? 'cercato, non trovato' : 'non cercato'}
          · negli armadi: ${a.prezzo_armadio != null ? euroUnitario(a.prezzo_armadio) : '—'}</p>
        <form method="post" action="${BASE}/codice/${encodeURIComponent(a.codice)}/prezzo" class="in-linea">
          <label>€ a pezzo scritto a mano <input name="prezzo" inputmode="decimal" class="corto" value="${a.prezzo_manuale ?? ''}"></label>
          <button class="primario">Salva</button> <small class="nota">vuoto = torna al prezzo automatico</small>
        </form>
      </section>
      <h2>Bobine (${bobine.length})</h2>
      <table>
        <thead><tr><th>Bobina</th><th class="num">Pezzi</th><th>Formato</th><th>Posizione</th><th>Sigla</th><th>Produttore</th><th>P/N</th><th>MSL</th><th>Ultimo uso</th></tr></thead>
        <tbody>${bobine.map((b: any) => html`<tr><td>${b.bobina}</td><td class="num">${num(b.quantita, 0)}</td><td>${b.formato ?? ''}</td><td>${b.posizione ?? ''}</td>
          <td>${b.sigla ?? ''}</td><td>${b.produttore ?? ''}</td><td>${b.pn ?? ''}</td><td>${b.msl ?? ''}</td><td>${b.ultimo_uso ?? ''}</td></tr>`)}</tbody>
      </table>`;
    res.send(String(layout({ titolo: a.codice, utente: req.session.utente, attiva: 'produzione', contenuto, avviso: msg(req) })));
  });

  r.post('/stoccaggio/codice/:codice/prezzo', async (req, res) => {
    const t = String(req.body.prezzo ?? '').trim().replace(',', '.');
    const p = t === '' ? null : Number(t);
    const dove = `${BASE}/codice/${encodeURIComponent(req.params.codice)}`;
    if (p != null && !(p >= 0)) return res.redirect(torna('Prezzo non valido.', dove));
    await salvaPrezzoManuale(req.params.codice, p);
    res.redirect(torna(p == null ? 'Prezzo a mano tolto.' : 'Prezzo salvato.', dove));
  });

  r.post('/stoccaggio/riconoscimento', async (req, res) => {
    const imp = await impostazioniArmadi();
    const predefinita = percentualeValida(req.body.predefinita);
    if (predefinita == null) return res.redirect(torna('La % predefinita va da 0 a 100.'));
    const clienti: Record<string, number> = { ...imp.riconoscimento.clienti };
    for (const [k, v] of Object.entries(req.body)) {
      if (!/^c\d+$/.test(k)) continue;
      const p = percentualeValida(v);
      if (p == null) delete clienti[k]; else clienti[k] = p;   // vuota = torna alla predefinita
    }
    await salvaImpostazioniArmadi({ riconoscimento: { predefinita, clienti } });
    res.redirect(torna('Percentuali salvate.'));
  });

  r.post('/stoccaggio/sigle', async (req, res) => {
    const imp = await impostazioniArmadi();
    const proprietari = { ...imp.proprietari };
    for (const [k, v] of Object.entries(req.body)) if (k.startsWith('s:')) proprietari[k.slice(2)] = String(v ?? '');
    await salvaImpostazioniArmadi({ proprietari, regola: req.body.regola === 'articolo' ? 'articolo' : 'bobina' });
    res.redirect(torna('Sigle salvate.'));
  });

  r.post('/stoccaggio/cerca-prezzi', async (_req, res) => res.redirect(torna(await cercaPrezziOnline(300))));
  r.post('/stoccaggio/ricalcola', async (_req, res) => res.redirect(torna(`Prezzi ricalcolati: ${await ricalcolaPrezzi()} codici con un prezzo.`)));

  r.post('/stoccaggio/carica', express.raw({ type: '*/*', limit: '40mb' }), async (req, res) => {
    try {
      res.json(await caricaArmadi(dividiFile(req.body as Buffer), req.query.conferma === '1'));
    } catch (e: any) { res.status(400).json({ errore: `File non letti: ${e?.message ?? e}` }); }
  });

  return r;
}
