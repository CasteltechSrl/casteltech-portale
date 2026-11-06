/**
 * Anagrafiche → Prodotti → "Documentazione" (Adriano 6/11/2026): le revisioni dei documenti del cliente (BOM, pick and place, Gerber)
 * di un prodotto, come riassunto. I file restano sul Drive. Una revisione nuova si carica dalla pagina (stesso caricamento dei
 * Documenti dei clienti: il pacchetto viene analizzato, il riassunto finisce qui e i file si tolgono dal database) e viene confrontata
 * con quella prima: componenti aggiunti, tolti, cambiati; se il progetto è stravolto lo dice e basta.
 *
 *   GET  /anagrafiche/prodotti/:id/documentazione                        pagina (?confronta=<id revisione> per confrontarla con la precedente)
 *   POST /anagrafiche/prodotti/:id/documentazione/da-pacchetto/:pid      { revisione?, conserva? } → riassunto dal pacchetto analizzato (JSON)
 *   POST /anagrafiche/prodotti/:id/documentazione/:rid/elimina
 */
import { Router, type Request } from 'express';
import { q1 } from '../db.js';
import { html, num, data, type Raw } from '../views/html.js';
import type { PaginaAnagrafiche } from './anagrafiche.js';
import { eliminaRevisione, revisioneDaPacchetto, revisioniDelProdotto, type RevisioneDocumenti } from '../documenti-prodotto-servizio.js';
import { confrontaRevisioni, testoConfronto, type Confronto } from '../../engine/documenti-prodotto.js';
import { ETICHETTE_TIPO, type TipoFile } from '../../engine/scheda/classifica.js';
import { linkAnalisiProdotto } from '../../engine/analisi-acquisti.js';

const kb = (b: number) => b >= 1048576 ? `${num(b / 1048576, 1)} MB` : `${num(b / 1024, 0)} KB`;
const testoLati = (n: number) => n === 2 ? 'TOP + BOT' : n === 1 ? 'un lato' : 'nessuno';

export function rotteDocumentiProdotto(pagina: PaginaAnagrafiche) {
  const r = Router({ mergeParams: true });
  const prodotto = (id: string) => q1<{ id: number; codice: string; descrizione: string | null; cliente_id: number | null; cliente: string | null }>(
    `SELECT p.id, p.codice, p.descrizione, p.cliente_id, c.ragione_sociale AS cliente FROM prodotti p LEFT JOIN clienti c ON c.id = p.cliente_id WHERE p.id = $1`, [id]);
  const indirizzo = (id: number | string, msg?: string) => `/anagrafiche/prodotti/${id}/documentazione${msg ? `?msg=${encodeURIComponent(msg)}` : ''}`;

  r.get('/', async (req: Request, res, next) => {
    const id = String((req.params as any).id);
    if (!/^\d+$/.test(id)) return next();
    const p = await prodotto(id);
    if (!p) return next();
    const revisioni = await revisioniDelProdotto(p.id);
    const ultima = revisioni.at(-1) ?? null;
    // confronto: la revisione scelta (?confronta=) con quella prima; senza scelta, l'ultima con la penultima
    const scelta = /^\d+$/.test(String(req.query.confronta ?? '')) ? revisioni.findIndex(x => x.id === Number(req.query.confronta)) : revisioni.length - 1;
    const nuova = scelta >= 1 ? revisioni[scelta] : null;
    const vecchia = scelta >= 1 ? revisioni[scelta - 1] : null;
    const confronto = nuova && vecchia ? confrontaRevisioni(vecchia.riassunto, nuova.riassunto) : null;
    const msg = req.query.msg ? String(req.query.msg) : undefined;
    res.send(await pagina(req, 'prodotti', html`
      <h1>Documentazione di ${p.codice} <small class="nota">${p.descrizione ?? ''}${p.cliente ? ` · ${p.cliente}` : ''}</small></h1>
      <p class="nota"><a href="/anagrafiche/prodotti${p.cliente_id ? `?cliente=${p.cliente_id}` : ''}">← Prodotti</a> · <a href="${linkAnalisiProdotto(p)}">Analisi del prodotto</a>
        · I file del cliente restano su Google Drive: qui c'è solo il riassunto di ogni revisione (componenti, lati, misure, strati Gerber), che non pesa sul portale.</p>
      ${tabellaRevisioni(p.id, revisioni)}
      ${confronto && nuova && vecchia ? sezioneConfronto(confronto, vecchia, nuova) : ''}
      ${ultima ? sezioneRiassunto(ultima) : html`<p class="vuoto">Nessuna revisione caricata: carica qui sotto i file della scheda (BOM, pick and place, Gerber).</p>`}
      ${moduloCaricamento(p, ultima)}`, msg, 'schede-cliente.js'));
  });

  r.post('/da-pacchetto/:pid', async (req: Request, res, next) => {
    const id = String((req.params as any).id), pid = String(req.params.pid);
    if (!/^\d+$/.test(id) || !/^\d+$/.test(pid)) return next();
    const p = await prodotto(id);
    if (!p) return res.status(404).json({ errore: 'Prodotto non trovato.' });
    try {
      const esito = await revisioneDaPacchetto({ prodottoId: p.id, pacchettoId: Number(pid), caricatoDa: req.session.utente?.nome ?? null,
        revisione: typeof req.body?.revisione === 'string' ? req.body.revisione : null, liberaFile: !req.body?.conserva, note: typeof req.body?.note === 'string' ? req.body.note.slice(0, 500) : null });
      const msg = esito.confronto && esito.precedente ? testoConfronto(esito.confronto, esito.precedente.revisione, esito.revisione) : `Revisione ${esito.revisione} salvata (la prima di questo prodotto).`;
      res.json({ ok: true, id: esito.id, revisione: esito.revisione, vai: indirizzo(p.id, msg) });
    } catch (e: any) { res.status(400).json({ errore: e.message }); }
  });

  r.post('/:rid/elimina', async (req: Request, res, next) => {
    const id = String((req.params as any).id), rid = String(req.params.rid);
    if (!/^\d+$/.test(id) || !/^\d+$/.test(rid)) return next();
    const ok = await eliminaRevisione(Number(id), Number(rid));
    res.redirect(indirizzo(id, ok ? 'Revisione eliminata.' : 'Revisione non trovata.'));
  });

  return r;
}

function tabellaRevisioni(prodottoId: number, revisioni: RevisioneDocumenti[]): Raw {
  if (!revisioni.length) return html``;
  return html`<h2>Revisioni</h2>
    <div class="tabella-scorre"><table class="elenco"><thead><tr><th>Revisione</th><th>Da dove</th><th>Caricata</th><th>Origine</th><th>Cartella sul Drive</th>
      <th class="n">SMD TOP</th><th class="n">SMD BOT</th><th class="n">THT</th><th class="n">Codici</th><th>File usati</th><th></th></tr></thead><tbody>
      ${revisioni.map((v, i) => html`<tr>
        <td><b>${v.revisione}</b></td><td class="nota">${v.revisione_da ?? ''}</td><td>${data(v.caricato_il)}${v.caricato_da ? html` <small class="nota">${v.caricato_da}</small>` : ''}</td>
        <td>${v.origine === 'drive' ? 'cartelle del Drive' : v.pacchetto_id ? html`<a href="/preventivi/documenti/${v.pacchetto_id}">pacchetto</a>` : 'portale'}</td>
        <td class="nota">${v.cartella ?? ''}</td>
        <td class="n">${v.riassunto.conteggi.smdTop}</td><td class="n">${v.riassunto.conteggi.smdBot}</td><td class="n">${v.riassunto.conteggi.tht}</td><td class="n">${v.riassunto.conteggi.codiciDiversi}</td>
        <td class="nota">${v.riassunto.file.filter(f => f.usato).map(f => f.nome.split('/').pop()).join(', ')}</td>
        <td class="nowrap">${i > 0 ? html`<a class="bottone" href="/anagrafiche/prodotti/${prodottoId}/documentazione?confronta=${v.id}#confronto">Confronta con ${revisioni[i - 1].revisione}</a> ` : ''}
          <form method="post" action="/anagrafiche/prodotti/${prodottoId}/documentazione/${v.id}/elimina" class="inline"
            data-conferma="${`Eliminare la revisione ${v.revisione}? I file sul Drive non si toccano.`}"><button class="link negativo">Elimina</button></form></td></tr>`)}
    </tbody></table></div>`;
}

function sezioneConfronto(c: Confronto, vecchia: RevisioneDocumenti, nuova: RevisioneDocumenti): Raw {
  const comp = (x: { ref: string; pn: string; valore: string; case: string; tipo: string; lato: string | null; montato: boolean }) =>
    html`<tr><td>${x.ref}</td><td>${x.pn}</td><td>${x.valore}</td><td>${x.case}</td><td>${x.tipo}${x.lato ? ` ${x.lato}` : ''}${x.montato ? '' : ' · non montato'}</td></tr>`;
  return html`<h2 id="confronto">Differenze tra la revisione ${vecchia.revisione} e la ${nuova.revisione}</h2>
    ${c.stravolto ? html`<p class="avviso">Progetto stravolto: ${c.motivo}. Qui sotto solo i numeri.</p>` : c.uguale ? html`<p class="ok">Nessuna differenza tra le due revisioni.</p>`
      : html`<p>${c.motivo}; ${c.inComune} riferimenti in comune.</p>`}
    ${c.conteggi.length ? html`<table class="elenco stretta"><thead><tr><th>Voce</th><th>Rev. ${vecchia.revisione}</th><th>Rev. ${nuova.revisione}</th></tr></thead>
      <tbody>${c.conteggi.map(v => html`<tr><td>${v.voce}</td><td>${String(v.prima)}</td><td>${String(v.dopo)}</td></tr>`)}</tbody></table>` : ''}
    ${c.strati.aggiunti.length || c.strati.tolti.length ? html`<p>Strati Gerber: ${c.strati.aggiunti.length ? `aggiunti ${c.strati.aggiunti.join(', ')}` : ''}${c.strati.aggiunti.length && c.strati.tolti.length ? '; ' : ''}${c.strati.tolti.length ? `tolti ${c.strati.tolti.join(', ')}` : ''}.</p>` : ''}
    ${c.stravolto ? '' : html`
      ${c.cambiati.length ? html`<h3>Componenti cambiati (${c.cambiati.length})</h3><div class="tabella-scorre limitata"><table class="elenco"><thead><tr><th>Riferimento</th><th>Cosa</th><th>Rev. ${vecchia.revisione}</th><th>Rev. ${nuova.revisione}</th></tr></thead>
        <tbody>${c.cambiati.map(d => html`<tr><td>${d.ref}</td><td>${d.campo}</td><td>${d.prima}</td><td>${d.dopo}</td></tr>`)}</tbody></table></div>` : ''}
      ${c.aggiunti.length ? html`<h3>Componenti aggiunti (${c.aggiunti.length})</h3><div class="tabella-scorre limitata"><table class="elenco"><thead><tr><th>Riferimento</th><th>P/N</th><th>Valore</th><th>Case</th><th>Montaggio</th></tr></thead>
        <tbody>${c.aggiunti.map(comp)}</tbody></table></div>` : ''}
      ${c.tolti.length ? html`<h3>Componenti tolti (${c.tolti.length})</h3><div class="tabella-scorre limitata"><table class="elenco"><thead><tr><th>Riferimento</th><th>P/N</th><th>Valore</th><th>Case</th><th>Montaggio</th></tr></thead>
        <tbody>${c.tolti.map(comp)}</tbody></table></div>` : ''}`}`;
}

function sezioneRiassunto(v: RevisioneDocumenti): Raw {
  const r = v.riassunto;
  const strati = r.strati.map(s => `${s.ruolo}${s.lato ? ' ' + s.lato : ''}`);
  return html`<h2>Ultima revisione: ${v.revisione}</h2>
    <div class="riquadri">
      <div class="riquadro"><b>${r.conteggi.smdTop}</b> SMD TOP · <b>${r.conteggi.smdBot}</b> SMD BOT · <b>${r.conteggi.tht}</b> THT${r.conteggi.nonMontati ? html` · ${r.conteggi.nonMontati} non montati` : ''}</div>
      <div class="riquadro"><b>${r.conteggi.codiciDiversi}</b> codici diversi · feeder ${r.conteggi.feederTop}${r.conteggi.feederBot ? ` + ${r.conteggi.feederBot}` : ''}${r.conteggi.refori != null ? html` · ${r.conteggi.refori} punti THT` : ''}</div>
      <div class="riquadro">Lati SMD: <b>${testoLati(r.lavorazione.latiSmd)}</b> · THT: <b>${r.lavorazione.saldaturaTht ?? '—'}</b>
        · Misure: <b>${r.dimensioni ? `${num(r.dimensioni.larghezza, 1)} × ${num(r.dimensioni.altezza, 1)} mm${r.dimensioni.stima ? ' (stima)' : ''}` : '—'}</b></div>
    </div>
    ${r.prodotto && (r.prodotto.codice || r.prodotto.revisione) ? html`<p class="nota">Letto dai file: ${r.prodotto.codice ? `codice ${r.prodotto.codice}` : ''}${r.prodotto.revisione ? ` · revisione ${r.prodotto.revisione}` : ''}${r.prodotto.descrizione ? ` · ${r.prodotto.descrizione}` : ''}.</p>` : ''}
    ${r.segnalazioni.errori || r.segnalazioni.avvisi ? html`<details><summary>Segnalazioni dell'analisi: ${r.segnalazioni.errori} errori, ${r.segnalazioni.avvisi} avvisi</summary>
      <ul>${r.segnalazioni.testi.map(t => html`<li>${t}</li>`)}</ul></details>` : ''}
    <details><summary>File (${r.file.length}; sul Drive${v.cartella ? `: ${v.cartella}` : ''})${strati.length ? ` · strati Gerber: ${strati.join(', ')}` : ''}</summary>
      <table class="elenco stretta"><thead><tr><th>File</th><th>Tipo</th><th class="n">Dimensione</th><th>Usato</th></tr></thead>
        <tbody>${r.file.map(f => html`<tr><td>${f.nome}</td><td>${ETICHETTE_TIPO[f.tipo as TipoFile] ?? f.tipo}</td><td class="n">${kb(f.byte)}</td><td>${f.usato ? '✓' : ''}</td></tr>`)}</tbody></table></details>
    <details open><summary>Componenti (${r.componenti.length})</summary>
      <div class="ricerca-veloce"><input type="search" data-filtra="tab-componenti" data-conta="conta-tab-componenti" placeholder="Cerca riferimento, P/N, valore…" autocomplete="off">
        <span class="nota">Trovati: <b id="conta-tab-componenti">${r.componenti.length}</b></span></div>
      <div class="tabella-scorre limitata"><table class="elenco" id="tab-componenti"><thead><tr><th>Riferimento</th><th>P/N</th><th>Valore</th><th>Case</th><th>Descrizione</th><th>Montaggio</th><th>Lato</th></tr></thead>
        <tbody>${r.componenti.map(c => html`<tr class="${c.montato ? '' : 'spenta'}"><td>${c.ref}</td><td>${c.pn}</td><td>${c.valore}</td><td>${c.case}</td><td class="nota">${c.descrizione}</td>
          <td>${c.tipo}${c.montato ? '' : ' · non montato'}</td><td>${c.lato ?? ''}</td></tr>`)}</tbody></table></div></details>`;
}

function moduloCaricamento(p: { id: number; codice: string; cliente_id: number | null }, ultima: RevisioneDocumenti | null): Raw {
  return html`<section class="riquadro">
    <h2>Carica una revisione nuova</h2>
    <p class="nota">Quando il cliente manda i file aggiornati: scegli i file (BOM, pick and place, Gerber, anche uno zip) o la cartella intera.
      Il portale li legge, scrive qui la revisione nuova${ultima ? html` e la confronta con la <b>${ultima.revisione}</b>: componenti aggiunti, tolti e cambiati` : ''}.
      La revisione si legge dai file; se non c'è, scrivila tu qui sotto. I file restano sul Drive: nel portale resta il riassunto.</p>
    <input type="hidden" id="nome-pacchetto" value="${p.codice}"><select id="cliente-pacchetto" hidden><option value="${p.cliente_id ?? ''}" selected></option></select>
    <label>Revisione <input id="revisione-doc" placeholder="vuota = letta dai file, altrimenti 0" maxlength="20" class="maiuscolo"></label>
    <label>File <input type="file" id="file-pacchetto" multiple></label>
    <label>oppure una cartella intera <input type="file" id="cartella-pacchetto" webkitdirectory></label>
    <label class="spunta"><input type="checkbox" id="conserva-file"> Tieni anche i file nel portale (servono solo per "Codifica la BOM" dai Documenti dei clienti; pesano su Neon)</label>
    <button class="primario" id="invia-pacchetto" data-prodotto="${p.id}">Carica e confronta</button>
    <output id="esito-pacchetto" class="nota"></output>
  </section>`;
}
