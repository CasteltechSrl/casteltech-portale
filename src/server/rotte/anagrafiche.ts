/**
 * Anagrafiche (solo ufficio): una sola sezione con tutte le anagrafiche (Adriano, 27/10/2026).
 * In alto i tasti Clienti / Fornitori / Prodotti / Componenti, sotto l'elenco con la ricerca veloce (public/ricerca.js).
 * Nei preventivi cliente e codice si scelgono SOLO da qui. Tutto in maiuscolo.
 */
import express, { Router, type Request } from 'express';
import { gunzipSync } from 'node:zlib';
import ExcelJS from 'exceljs';
import { q, q1, transazione } from '../db.js';
import { layout } from '../views/layout.js';
import { html, num, raw, euro, data, type Raw } from '../views/html.js';
import { caricaAnagrafiche, maiuscolo, chiaveCodice, type FileAnagrafiche } from '../anagrafiche-servizio.js';
import { cercaComponenti, conteggiComponenti } from '../codifica-servizio.js';
import { avvisoSenzaCliente, erroreClienteProdotto } from '../../engine/anagrafiche.js';
import { rotteFornitoriAnagrafica } from './fornitori-anagrafica.js';
import { datiFiscaliDaModulo } from '../../engine/tipi-fattura.js';
import { sezioneLettereIntento } from './fiscale.js';
import { caricaAliquote, caricaCondizioniPagamento } from '../amministrazione-servizio.js';
import { caricaPrezzi, scaglioniDi, salvaScaglioni, listinoProdotto, aggiornaPrezzoDaDocumento, cercaComponentiPerOrdine, domandaPrezzoComponente,
  aggiornaAcquistoDaOrdine } from '../prezzi-servizio.js';
import { leggiScaglioni, scrivi as scriviScaglioni } from '../../engine/listino.js';
import { leggiPrezzo, dataIt } from '../../engine/prezzi-fic.js';
import { datiSchedaCliente, type DatiSchedaCliente } from '../scheda-cliente-servizio.js';
import { excelSemplice, inviaExcel, nomeExcel } from '../excel.js';

export type SchedaAnagrafiche = 'clienti' | 'fornitori' | 'prodotti' | 'componenti';
const SCHEDE: [SchedaAnagrafiche, string][] = [['clienti', 'Clienti'], ['fornitori', 'Fornitori'], ['prodotti', 'Prodotti'], ['componenti', 'Componenti']];

/** Pagina della sezione: tasti in alto (con quanti sono) e il contenuto della scheda scelta. */
export type PaginaAnagrafiche = (req: Request, scheda: SchedaAnagrafiche, contenuto: Raw, avviso?: string, script?: string) => Promise<string>;
const paginaAnagrafiche: PaginaAnagrafiche = async (req, scheda, contenuto, avviso, script) => {
  const n = (await q1<Record<SchedaAnagrafiche | 'senza_cliente', number>>(`SELECT (SELECT count(*)::int FROM clienti) AS clienti,
    (SELECT count(*)::int FROM prodotti WHERE cliente_id IS NULL) AS senza_cliente,
    (SELECT count(*)::int FROM fornitori_anagrafica) AS fornitori, (SELECT count(*)::int FROM prodotti) AS prodotti,
    (SELECT count(*)::int FROM componenti) AS componenti`))!;
  const titolo = SCHEDE.find(([s]) => s === scheda)![1];
  return String(layout({ titolo, utente: req.session.utente, attiva: 'anagrafiche', avviso, script: ['ricerca.js', ...(script ? [script] : [])], contenuto: html`
    <h1>Anagrafiche</h1>
    <nav class="tasti-anagrafiche">${SCHEDE.map(([s, t]) => html`<a href="/anagrafiche/${s}" class="${s === scheda ? 'attiva' : ''}">${t} <span class="conta">${num(n[s], 0)}</span>${s === 'prodotti' && n.senza_cliente
      ? html` <span class="conta da-assegnare" title="Codici senza cliente: da assegnare o eliminare">${num(n.senza_cliente, 0)} senza cliente</span>` : ''}</a>`)}</nav>
    ${contenuto}` }));
};

/** Casella della ricerca veloce: filtra le righe della tabella `tabella` mentre si scrive. */
const ricercaVeloce = (tabella: string, segnaposto: string, totale: number, valore = '') => html`
  <div class="ricerca-veloce"><input type="search" data-filtra="${tabella}" data-conta="conta-${tabella}" placeholder="${segnaposto}" value="${valore}" autofocus autocomplete="off">
    <span class="nota">Trovati: <b id="conta-${tabella}">${totale}</b></span></div>`;

export function rotteAnagrafiche() {
  const r = Router();
  const pag = (req: Request, scheda: SchedaAnagrafiche, contenuto: Raw, avviso?: string) => paginaAnagrafiche(req, scheda, contenuto, avviso, 'anagrafiche.js');
  const torna = (msg: string, dove = '/clienti', extra = '') => `/anagrafiche${dove}?msg=${encodeURIComponent(msg)}${extra}`;
  const msg = (req: Request) => (req.query.msg ? String(req.query.msg) : undefined);

  r.get('/', (_req, res) => res.redirect('/anagrafiche/clienti'));
  r.use('/fornitori', rotteFornitoriAnagrafica(paginaAnagrafiche));

  const elencoClienti = () => q(`SELECT c.id, c.ragione_sociale, c.partita_iva,
      (SELECT count(*)::int FROM prodotti p WHERE p.cliente_id = c.id) AS prodotti,
      (SELECT count(*)::int FROM preventivi v WHERE v.cliente_id = c.id) AS preventivi,
      (SELECT count(*)::int FROM ordini o WHERE o.cliente_id = c.id) + (SELECT count(*)::int FROM commesse k WHERE k.cliente_id = c.id) AS altri
    FROM clienti c ORDER BY ragione_sociale`);

  // il file ufficiale porta insieme clienti e prodotti: lo stesso riquadro sta in tutte e due le schede
  const caricaFile = html`
    <details class="blocco">
      <summary>Carica l'elenco ufficiale di clienti e prodotti (file preparato da Claude)</summary>
      <div class="stretto-form dentro-blocco">
        <p class="nota">Aggiunge i clienti e i prodotti nuovi del file, aggiorna nomi e descrizioni di quelli esistenti
          (anche se li avevi corretti a mano) e collega i nomi scritti in modo diverso nei preventivi. Prima mostra un riepilogo e chiede conferma.</p>
        <label>File <input type="file" id="file-anagrafiche" accept=".gz,.json"></label>
        <label class="spunta"><input type="checkbox" id="togli-anagrafiche"> Togli anche i clienti e i prodotti che non sono nel file (solo quelli mai usati nei preventivi)</label>
        <button class="primario" type="button" id="carica-anagrafiche">Controlla il file</button>
        <output id="esito-anagrafiche"></output>
        <button class="primario" type="button" id="conferma-anagrafiche" hidden>Conferma e carica</button>
      </div>
    </details>`;

  // prezzi da Fatture in Cloud (Adriano 31/10/2026): stesso riquadro in Prodotti e Componenti
  const caricaPrezziFic = html`
    <details class="blocco">
      <summary>Carica i prezzi da Fatture in Cloud (file preparato da Claude)</summary>
      <div class="stretto-form dentro-blocco">
        <p class="nota">Prodotti: il prezzo di vendita più recente tra l'anagrafica prodotti di FIC e l'ultima fattura emessa al cliente.
          Componenti: il prezzo dell'ultimo ordine a fornitore con quel P/N o codice. I prezzi scritti a mano qui nel portale non vengono toccati.
          Prima mostra un riepilogo e chiede conferma; si può ricaricare.</p>
        <label>File <input type="file" id="file-prezzi" accept=".gz,.json"></label>
        <button class="primario" type="button" id="carica-prezzi">Controlla il file</button>
        <output id="esito-prezzi"></output>
        <button class="primario" type="button" id="conferma-prezzi" hidden>Conferma e carica</button>
      </div>
    </details>`;

  // ── Clienti ──
  r.get('/clienti.xlsx', async (_req, res) => {
    const righe = await q(`SELECT ragione_sociale, partita_iva, codice_fiscale, indirizzo, cap, comune, provincia, nazione, codice_sdi, pec, email_amministrazione, condizione_pagamento,
        (SELECT count(*)::int FROM prodotti p WHERE p.cliente_id = c.id) AS prodotti FROM clienti c ORDER BY ragione_sociale`);
    inviaExcel(res, nomeExcel('clienti'), await excelSemplice('Clienti', [
      { header: 'Ragione sociale', key: 'ragione_sociale', width: 40 }, { header: 'Partita IVA', key: 'partita_iva', width: 14 }, { header: 'Codice fiscale', key: 'codice_fiscale', width: 18 },
      { header: 'Indirizzo', key: 'indirizzo', width: 30 }, { header: 'CAP', key: 'cap', width: 8 }, { header: 'Comune', key: 'comune', width: 22 }, { header: 'Prov.', key: 'provincia', width: 6 },
      { header: 'Nazione', key: 'nazione', width: 8 }, { header: 'Codice SDI', key: 'codice_sdi', width: 12 }, { header: 'PEC', key: 'pec', width: 30 }, { header: 'Email amministrazione', key: 'email_amministrazione', width: 30 },
      { header: 'Pagamento', key: 'condizione_pagamento', width: 12 }, { header: 'Prodotti', key: 'prodotti', formato: 'intero' },
    ], righe));
  });
  r.get('/prodotti.xlsx', async (req, res) => {
    const filtro = Number(req.query.cliente) || 0;
    const righe = await q(`SELECT c.ragione_sociale AS cliente, p.codice, p.descrizione, p.prezzo_vendita::float AS prezzo, p.prezzo_fonte, p.prezzo_data::text AS prezzo_data,
        (SELECT string_agg(s.da || CASE WHEN s.a IS NULL THEN '+' ELSE '-' || s.a END || '=' || s.prezzo, '; ' ORDER BY s.da) FROM prodotti_scaglioni s WHERE s.prodotto_id = p.id) AS scaglioni
      FROM prodotti p LEFT JOIN clienti c ON c.id = p.cliente_id WHERE $1 = 0 OR p.cliente_id = $1 ORDER BY c.ragione_sociale NULLS FIRST, p.codice`, [filtro]).catch(() => q(
      `SELECT c.ragione_sociale AS cliente, p.codice, p.descrizione, p.prezzo_vendita::float AS prezzo, p.prezzo_fonte, p.prezzo_data::text AS prezzo_data, NULL AS scaglioni
       FROM prodotti p LEFT JOIN clienti c ON c.id = p.cliente_id WHERE $1 = 0 OR p.cliente_id = $1 ORDER BY c.ragione_sociale NULLS FIRST, p.codice`, [filtro]));
    inviaExcel(res, nomeExcel('prodotti'), await excelSemplice('Prodotti', [
      { header: 'Cliente', key: 'cliente', width: 36 }, { header: 'Codice', key: 'codice', width: 20 }, { header: 'Descrizione', key: 'descrizione', width: 44 },
      { header: 'Prezzo €', key: 'prezzo', formato: 'euro' }, { header: 'Scaglioni', key: 'scaglioni', width: 28 }, { header: 'Fonte prezzo', key: 'prezzo_fonte', width: 12 }, { header: 'Data prezzo', key: 'prezzo_data', formato: 'data' },
    ], righe));
  });

  r.get('/clienti', async (req, res) => {
    const clienti = await elencoClienti();
    res.send(await pag(req, 'clienti', html`
      <p class="nota">Nei preventivi il cliente si sceglie solo da qui. Tutto viene salvato in MAIUSCOLO.
        Il tasto <b>Elimina</b> compare solo sui clienti mai usati (preventivi, commesse, ordini): quelli inseriti per errore.</p>
      ${ricercaVeloce('tab-clienti', 'Cerca ragione sociale o partita IVA…', clienti.length)}
      <p class="nota"><a class="bottone" href="/anagrafiche/clienti.xlsx" title="Tutti i clienti con i dati fiscali in Excel">Excel</a></p>
      <div class="tabella-scorre limitata"><table class="editor" id="tab-clienti">
        <thead><tr><th>Ragione sociale</th><th>Partita IVA</th><th class="n">Prodotti</th><th class="n">Preventivi</th><th></th></tr></thead>
        <tbody>
          <tr class="nuova-riga">
            <td class="largo"><input name="ragione_sociale" form="c-nuovo" class="maiuscolo" required placeholder="NUOVO CLIENTE"></td>
            <td><input name="partita_iva" form="c-nuovo" class="maiuscolo"></td><td></td><td></td>
            <td><form method="post" action="/anagrafiche/clienti" id="c-nuovo"><button class="primario">Aggiungi</button></form></td>
          </tr>
          ${clienti.map(c => html`<tr>
            <td class="largo"><input name="ragione_sociale" form="c-${c.id}" value="${c.ragione_sociale}" class="maiuscolo"></td>
            <td><input name="partita_iva" form="c-${c.id}" value="${c.partita_iva ?? ''}" class="maiuscolo"></td>
            <td class="n"><a href="/anagrafiche/prodotti?cliente=${c.id}" title="Vedi i prodotti di questo cliente">${c.prodotti}</a></td><td class="n">${c.preventivi}</td>
            <td class="nowrap"><form method="post" action="/anagrafiche/clienti/${c.id}" id="c-${c.id}"><button>Salva</button></form>
              <a class="bottone" href="/anagrafiche/clienti/${c.id}" title="Scheda unica: preventivi, ordini aperti, commesse, DDT da fatturare, fatture e incassi, CRM, prezzi">Scheda</a>
              <a class="bottone" href="/anagrafiche/clienti/${c.id}/fiscali" title="Indirizzo, P.IVA, codice SDI, PEC, pubblica amministrazione, split payment">Dati fiscali</a>
              ${eliminabile(c) ? html`<form method="post" action="/anagrafiche/clienti/${c.id}/elimina" class="inline"
                data-conferma="${`Eliminare il cliente ${c.ragione_sociale} dall'anagrafica?`}"><button class="link negativo">Elimina</button></form>` : ''}</td></tr>`)}
        </tbody></table></div>
      ${caricaFile}`, msg(req)));
  });

  // ── Righe dei documenti (fattura, nota di credito, DDT, conferma d'ordine, ordine a fornitore; Adriano 31/10/2026) ──
  const numeroQs = (x: unknown) => leggiPrezzo(x) ?? NaN;   // virgola o punto, come nelle caselle
  // prezzo di listino per la quantità e, con ?prezzo=, la domanda "aggiorno l'anagrafica?"
  r.get('/prodotti/:id/listino', async (req, res) => {
    const prezzo = req.query.prezzo != null && String(req.query.prezzo).trim() ? numeroQs(req.query.prezzo) : null;
    const l = await listinoProdotto(Number(req.params.id), numeroQs(req.query.quantita) || 1, prezzo);
    res.status(l ? 200 : 404).json(l ?? {});
  });
  r.post('/prodotti/:id/prezzo-da-documento', async (req, res) => {
    const prezzo = numeroQs(req.body?.prezzo);
    if (!(prezzo >= 0)) return res.status(400).json({ errore: 'Prezzo non valido.' });
    try {
      res.json({ messaggio: await aggiornaPrezzoDaDocumento(Number(req.params.id), numeroQs(req.body?.quantita) || 1, prezzo, String(req.body?.documento ?? '')) });
    } catch (e: any) { res.status(400).json({ errore: e?.message ?? String(e) }); }
  });
  r.get('/componenti-cerca', async (req, res) => res.json(await cercaComponentiPerOrdine(String(req.query.q ?? ''))));
  r.get('/componenti-prezzo', async (req, res) =>
    res.json({ domanda: await domandaPrezzoComponente(String(req.query.codice ?? ''), numeroQs(req.query.prezzo)) }));
  r.post('/componenti-prezzo', async (req, res) => {
    const prezzo = numeroQs(req.body?.prezzo);
    if (!(prezzo >= 0)) return res.status(400).json({ errore: 'Prezzo non valido.' });
    try {
      res.json({ messaggio: await aggiornaAcquistoDaOrdine(String(req.body?.codice ?? ''), prezzo, numeroQs(req.body?.quantita) || null,
        String(req.body?.fornitore ?? '').trim() || null, String(req.body?.documento ?? '')) });
    } catch (e: any) { res.status(400).json({ errore: e?.message ?? String(e) }); }
  });

  // ── Prodotti ──
  r.get('/prodotti', async (req, res) => {
    const filtro = Number(req.query.cliente) || 0;
    const clienti = await elencoClienti();
    const prodotti = await q(`SELECT p.id, p.codice, p.descrizione, p.cliente_id, p.prezzo_vendita::float AS prezzo, p.prezzo_fonte, p.prezzo_nota, p.prezzo_data::text AS prezzo_data,
        (SELECT count(*)::int FROM prodotti_revisioni r JOIN preventivi v ON v.revisione_id = r.id WHERE r.prodotto_id = p.id) AS preventivi,
        (SELECT count(*)::int FROM ordini_righe o WHERE o.prodotto_id = p.id)
          + (SELECT count(*)::int FROM prodotti_revisioni r JOIN commesse k ON k.revisione_id = r.id WHERE r.prodotto_id = p.id) AS altri
      FROM prodotti p WHERE ($1 = 0 OR p.cliente_id = $1 OR ($1 = -1 AND p.cliente_id IS NULL))
      ORDER BY (p.cliente_id IS NULL) DESC, p.codice LIMIT 2000`, [filtro]);
    const scaglioni = await scaglioniDi(prodotti.map((p: any) => p.id));
    // regola codice-cliente (Adriano 29/10/2026): i codici senza cliente si vedono subito, in cima e in giallo
    const senzaCliente = (await q1<{ n: number }>(`SELECT count(*)::int AS n FROM prodotti WHERE cliente_id IS NULL`))!.n;
    const avvisoCodici = avvisoSenzaCliente(senzaCliente);
    // "— senza cliente —" solo per mostrare i codici ancora da assegnare: non si può salvare
    // la tendina completa dei clienti sta UNA volta sola nella pagina (modello): con centinaia di prodotti e di clienti
    // una tendina per riga pesava decine di MB (revisione 1/11/2026); anagrafiche.js la copia nella riga al primo clic
    const nomeCliente = new Map(clienti.map(c => [c.id, c.ragione_sociale] as const));
    const opzClienti = (sel: number | null, conVuoto = true) => html`
      ${conVuoto ? html`<option value="" disabled ${sel === null ? raw('selected') : ''}>— scegli il cliente —</option>` : ''}
      ${clienti.map(c => html`<option value="${c.id}" ${c.id === sel ? raw('selected') : ''}>${c.ragione_sociale}</option>`)}`;
    res.send(await pag(req, 'prodotti', html`
      <p class="nota">Nei preventivi codice e descrizione si scelgono solo da qui. Ogni codice deve avere il suo cliente. Tutto viene salvato in MAIUSCOLO.
        Il tasto <b>Elimina</b> compare solo sui prodotti mai usati (preventivi, commesse, ordini).</p>
      ${avvisoCodici ? html`<div class="avviso senza-cliente">${avvisoCodici}
        ${filtro === -1 ? '' : html` <a href="/anagrafiche/prodotti?cliente=-1">Mostra solo i codici senza cliente</a>`}</div>` : ''}
      <form method="get" class="cerca" action="/anagrafiche/prodotti">
        <select name="cliente" class="invia-subito"><option value="0">Tutti i clienti</option><option value="-1" ${filtro === -1 ? raw('selected') : ''}>— senza cliente (da assegnare) —</option>${opzClienti(filtro, false)}</select>
        <noscript><button>Filtra</button></noscript>
      </form>
      ${ricercaVeloce('tab-prodotti', 'Cerca codice, descrizione o cliente…', prodotti.length, String(req.query.q ?? ''))}
      <p class="nota"><a class="bottone" href="/anagrafiche/prodotti.xlsx${filtro > 0 ? `?cliente=${filtro}` : ''}" title="Prodotti e prezzi in Excel (del cliente scelto, o tutti)">Excel</a></p>
      <template id="modello-clienti">${opzClienti(null)}</template>
      <div class="tabella-scorre limitata"><table class="editor" id="tab-prodotti">
        <thead><tr><th>Codice</th><th>Descrizione</th><th>Cliente</th><th class="n" title="Prezzo di vendita a scheda, IVA esclusa">Prezzo €</th>
          <th title="Facoltativi: prezzi diversi per quantità, es. 1-5=10; 6-20=8; 21+=7">Scaglioni di quantità</th><th class="n">Preventivi</th><th></th></tr></thead>
        <tbody>
          <tr class="nuova-riga">
            <td><input name="codice" form="p-nuovo" class="maiuscolo" required placeholder="NUOVO CODICE"></td>
            <td class="largo"><input name="descrizione" form="p-nuovo" class="maiuscolo" required></td>
            <td><select name="cliente_id" form="p-nuovo" required>${opzClienti(filtro > 0 ? filtro : null)}</select></td>
            <td><input name="prezzo" form="p-nuovo" class="prezzo" inputmode="decimal"></td>
            <td><input name="scaglioni" form="p-nuovo" class="scaglioni" placeholder="es. 1-5=10; 6-20=8; 21+=7"></td><td></td>
            <td><form method="post" action="/anagrafiche/prodotti" id="p-nuovo"><input type="hidden" name="filtro" value="${filtro}"><button class="primario">Aggiungi</button></form></td>
          </tr>
          ${prodotti.map(p => html`<tr class="${p.cliente_id === null ? 'senza-cliente' : ''}" title="${p.cliente_id === null ? 'Codice senza cliente: assegnalo a un cliente o eliminalo' : ''}">
            <td><input name="codice" form="p-${p.id}" value="${p.codice}" class="maiuscolo"></td>
            <td class="largo"><input name="descrizione" form="p-${p.id}" value="${p.descrizione ?? ''}" class="maiuscolo"></td>
            <td><select name="cliente_id" form="p-${p.id}" required class="clienti-al-clic"><option value="${p.cliente_id ?? ''}" selected>${p.cliente_id === null ? '— scegli il cliente —' : nomeCliente.get(p.cliente_id) ?? ''}</option></select></td>
            <td><input name="prezzo" form="p-${p.id}" class="prezzo" inputmode="decimal" value="${p.prezzo == null ? '' : num(p.prezzo, 5)}"
              title="${testoPrezzo(p)}"></td>
            <td><input name="scaglioni" form="p-${p.id}" class="scaglioni" value="${scriviScaglioni(scaglioni.get(p.id) ?? [])}"
              placeholder="un prezzo per tutte le quantità" title="Facoltativi: es. 1-5=10; 6-20=8; 21+=7 (21+ = da 21 in su)"></td><td class="n">${p.preventivi}</td>
            <td class="nowrap"><form method="post" action="/anagrafiche/prodotti/${p.id}" id="p-${p.id}"><input type="hidden" name="filtro" value="${filtro}"><button>Salva</button></form>
              ${eliminabile(p) ? html`<form method="post" action="/anagrafiche/prodotti/${p.id}/elimina" class="inline"
                data-conferma="${`Eliminare il prodotto ${p.codice} dall'anagrafica?`}"><button class="link negativo">Elimina</button></form>` : ''}</td></tr>`)}
        </tbody></table></div>
      ${prodotti.length === 2000 ? html`<p class="nota">Mostrati i primi 2.000: scegli un cliente per vedere gli altri.</p>` : ''}
      <p class="nota">Prezzo: di vendita a scheda, IVA esclusa. Passa sopra la casella per vedere da dove arriva (fattura, anagrafica di Fatture in Cloud o scritto a mano).
        Scaglioni di quantità (facoltativi): <b>1-5=10; 6-20=8; 21+=7</b> vuol dire da 1 a 5 pezzi 10 €, da 6 a 20 pezzi 8 €, da 21 in su 7 €.
        In fattura, nota di credito e DDT, scrivendo codice e quantità senza prezzo, il portale mette da solo quello dello scaglione giusto; senza scaglioni vale il Prezzo €.</p>
      ${caricaFile}${caricaPrezziFic}`, msg(req)));
  });

  // ── Componenti: l'archivio della codifica (tanti: la ricerca si fa nel database, con Invio) ──
  r.get('/componenti', async (req, res) => {
    const testo = String(req.query.q ?? '').trim();
    const conti = await conteggiComponenti();
    const righe = testo ? await cercaComponenti(testo) : [];
    res.send(await paginaAnagrafiche(req, 'componenti', html`
      <div class="intestazione-pagina"><p class="nota">${num(conti.totale, 0)} componenti in archivio, ${num(conti.gestionale, 0)} con codice gestionale.
        I componenti nuovi entrano da soli quando si codifica una BOM (<a href="/quotazioni">Quotazioni</a>).
        ${conti.totale ? '' : html` L'archivio iniziale si carica da <a href="/impostazioni/componenti">Impostazioni → Componenti</a>.`}</p>
        <a class="bottone" href="/anagrafiche/componenti.xlsx">Scarica tutto in Excel</a></div>
      <form class="ricerca-veloce" method="get"><input type="search" name="q" value="${testo}" placeholder="Cerca P/N, codice di produzione o gestionale, descrizione… e premi Invio" autofocus>
        <button class="primario">Cerca</button></form>
      ${testo ? (righe.length ? html`<div class="tabella-scorre"><table class="componenti"><thead><tr><th>P/N</th><th>Fam.</th><th>Codice produzione</th>
        <th>Codice gestionale</th><th>Descrizione</th><th class="n" title="Prezzo dell'ultimo ordine a fornitore">Ultimo acquisto €</th><th>Fornitore</th><th>Stato</th><th>Fonte</th><th>Note</th><th></th></tr></thead><tbody>
        ${righe.map(c => html`<tr><td>${c.pn}</td><td>${c.famiglia}</td><td class="codice">${c.codice_produzione}</td><td class="codice">${c.codice_gestionale}</td>
          <td class="taglia">${c.descrizione}</td>
          <td class="n" title="${testoAcquisto(c)}">${c.prezzo_acquisto == null ? '' : num(Number(c.prezzo_acquisto), 5)}</td>
          <td class="taglia" title="${testoAcquisto(c)}">${c.prezzo_fornitore ?? ''}</td><td>${c.stato}</td><td class="taglia">${c.fonte}</td><td class="taglia" title="${c.note ?? ''}">${c.note}</td>
          <td><form method="post" action="/anagrafiche/componenti/${c.id}/elimina?q=${encodeURIComponent(testo)}" class="inline"
            data-conferma="${`Eliminare dall'archivio ${c.codice_gestionale || c.codice_produzione || c.pn}?` + (c.codice_gestionale ? `\n\nSe il codice ${c.codice_gestionale} è già stato creato in Moka, non eliminarlo: il suo numero verrebbe riassegnato al prossimo componente nuovo.` : '')}">
            <button class="link negativo">Elimina</button></form></td></tr>`)}
        </tbody></table></div>${righe.length === 200 ? html`<p class="nota">Mostrati i primi 200: scrivi qualcosa in più per restringere.</p>` : ''}`
        : html`<p class="vuoto">Nessun componente trovato.</p>`) : html`<p class="vuoto">Scrivi cosa cerchi e premi Invio.</p>`}
      ${caricaPrezziFic}`, msg(req), 'anagrafiche.js'));
  });
  // componente codificato per errore
  r.post('/componenti/:id/elimina', async (req, res) => {
    await q(`DELETE FROM componenti WHERE id = $1`, [Number(req.params.id)]);
    res.redirect(`/anagrafiche/componenti?q=${encodeURIComponent(String(req.query.q ?? ''))}&msg=${encodeURIComponent('Componente eliminato dall\'archivio.')}`);
  });
  r.get('/componenti.xlsx', async (_req, res) => {
    const righe = await q<any>(`SELECT pn, produttore, famiglia, codice_produzione, codice_gestionale, descrizione, stato, fonte, note, attributi,
      prezzo_acquisto::float AS prezzo_acquisto, prezzo_fornitore, prezzo_data::text AS prezzo_data, prezzo_quantita::float AS prezzo_quantita
      FROM componenti ORDER BY codice_gestionale NULLS LAST, id`);
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Componenti');
    ws.columns = [['P/N', 24], ['Produttore', 16], ['Famiglia', 8], ['Codice produzione', 32], ['Codice gestionale', 22], ['Descrizione', 40], ['Stato', 14], ['Fonte', 22], ['Note', 50], ['Attributi', 40],
      ['Ultimo acquisto €', 14], ['Fornitore', 28], ['Data acquisto', 12], ['Quantità ordinata', 10]]
      .map(([header, width]) => ({ header: header as string, width: width as number }));
    ws.getRow(1).font = { bold: true };
    for (const c of righe) ws.addRow([c.pn, c.produttore, c.famiglia, c.codice_produzione, c.codice_gestionale, c.descrizione, c.stato, c.fonte, c.note,
      Object.entries(c.attributi ?? {}).map(([k, v]) => `${k}=${v}`).join('; '), c.prezzo_acquisto, c.prezzo_fornitore, dataIt(c.prezzo_data), c.prezzo_quantita]);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="archivio_componenti_${new Date().toISOString().slice(0, 10)}.xlsx"`);
    res.send(Buffer.from(await wb.xlsx.writeBuffer()));
  });

  r.post('/carica', express.raw({ type: '*/*', limit: '20mb' }), async (req, res) => {
    let f: FileAnagrafiche;
    try {
      let b = req.body as Buffer;
      if (b[0] === 0x1f && b[1] === 0x8b) b = gunzipSync(b);
      f = JSON.parse(b.toString('utf8'));
      if (!Array.isArray(f.clienti) || !Array.isArray(f.prodotti)) throw new Error();
    } catch { return res.status(400).json({ errore: 'File non valido: serve anagrafiche_casteltech.json.gz' }); }
    res.json(await caricaAnagrafiche(f, { togli: req.query.togli === '1', anteprima: req.query.conferma !== '1' }));
  });

  r.post('/prezzi', express.raw({ type: '*/*', limit: '20mb' }), async (req, res) => {
    let f: any;
    try {
      let b = req.body as Buffer;
      if (b[0] === 0x1f && b[1] === 0x8b) b = gunzipSync(b);
      f = JSON.parse(b.toString('utf8'));
      if (!Array.isArray(f.prodotti) || !Array.isArray(f.componenti)) throw new Error();
    } catch { return res.status(400).json({ errore: 'File non valido: serve prezzi_fic.json.gz' }); }
    res.json(await caricaPrezzi(f, { anteprima: req.query.conferma !== '1' }));
  });

  const duplicatoCliente = async (nome: string, escludi = 0) =>
    q1(`SELECT 1 FROM clienti WHERE upper(ragione_sociale) = $1 AND id <> $2`, [nome, escludi]);
  r.post('/clienti', async (req, res) => {
    const nome = maiuscolo(req.body.ragione_sociale);
    if (!nome) return res.redirect(torna('Scrivi la ragione sociale.'));
    if (await duplicatoCliente(nome)) return res.redirect(torna(`${nome} esiste già.`));
    await q(`INSERT INTO clienti (ragione_sociale, partita_iva) VALUES ($1, nullif($2, ''))`, [nome, maiuscolo(req.body.partita_iva)]);
    res.redirect(torna(`${nome} aggiunto.`));
  });
  // ── Dati fiscali del cliente (fattura elettronica, pubblica amministrazione, split payment) ──
  const CAMPI_FISCALI: [string, string, string?][] = [['partita_iva', 'Partita IVA'], ['codice_fiscale', 'Codice fiscale'], ['indirizzo', 'Indirizzo'],
    ['cap', 'CAP'], ['comune', 'Comune'], ['provincia', 'Provincia (sigla)'], ['nazione', 'Nazione (sigla, IT)'],
    ['codice_sdi', 'Codice destinatario SDI', '7 caratteri; per la pubblica amministrazione il codice ufficio di 6'], ['pec', 'PEC'],
    ['email_amministrazione', 'Email per le fatture']];
  // ── Scheda unica del cliente (proposta della revisione, Adriano 1/11/2026): tutto quel che riguarda un cliente in una pagina ──
  r.get('/clienti/:id', async (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return next();
    const oggi = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
    const d = await datiSchedaCliente(Number(req.params.id), oggi);
    if (!d) return res.status(404).send('Cliente non trovato');
    res.send(await pag(req, 'clienti', schedaCliente(d, oggi), msg(req)));
  });
  r.get('/clienti/:id/fiscali', async (req, res) => {
    const c = await q1(`SELECT * FROM clienti WHERE id = $1`, [Number(req.params.id)]);
    if (!c) return res.status(404).send('Cliente non trovato');
    const [aliquote, condizioni] = await Promise.all([caricaAliquote(true), caricaCondizioniPagamento(true)]);
    res.send(await pag(req, 'clienti', html`
      <p><a href="/anagrafiche/clienti">← Clienti</a></p>
      <h2>${c.ragione_sociale}: dati fiscali</h2>
      <p class="nota">Servono per fatture, note di credito e DDT. Arrivano da Fatture in Cloud; qui si correggono o si completano
        (es. un ente pubblico come l'INFN: spunta "Pubblica amministrazione", codice ufficio di 6 caratteri e, quasi sempre, split payment).</p>
      <form method="post" action="/anagrafiche/clienti/${c.id}/fiscali" class="blocco">
        <div class="riga-campi">${CAMPI_FISCALI.map(([k, t, aiuto]) => html`<label>${t}
          <input name="${k}" value="${c[k] ?? (k === 'nazione' ? 'IT' : '')}" class="${['pec', 'email_amministrazione'].includes(k) ? '' : 'maiuscolo'}" ${aiuto ? raw(`title="${aiuto}"`) : ''}></label>`)}
          <label>IVA predefinita <select name="aliquota_iva"><option value="">22 %</option>${aliquote.map(a =>
            html`<option value="${a.codice}" ${c.aliquota_iva === a.codice ? raw('selected') : ''}>${a.descrizione}</option>`)}</select></label>
          <label>Pagamento <select name="condizione_pagamento"><option value="">Scegli…</option>${condizioni.map(p =>
            html`<option value="${p.codice}" ${c.condizione_pagamento === p.codice ? raw('selected') : ''}>${p.descrizione}</option>`)}</select></label>
        </div>
        <label class="spunta"><input type="checkbox" name="pubblica_amministrazione" ${c.pubblica_amministrazione ? raw('checked') : ''}>
          Pubblica amministrazione (fattura FPA12 al codice ufficio, con numero d'ordine e CIG)</label>
        <label class="spunta"><input type="checkbox" name="split_payment" ${c.split_payment ? raw('checked') : ''}>
          Split payment: il cliente paga solo imponibile e bollo, l'IVA la versa lui (art. 17-ter)</label>
        <div class="barra-azioni"><button class="primario">Salva</button></div>
      </form>
      ${await sezioneLettereIntento(c.id)}`, msg(req)));
  });
  r.post('/clienti/:id/fiscali', async (req, res) => {
    const id = Number(req.params.id);
    const { dati, errori } = datiFiscaliDaModulo(req.body ?? {});
    if (errori.length) return res.redirect(`/anagrafiche/clienti/${id}/fiscali?msg=${encodeURIComponent(`Non salvato: ${errori.join(' ')}`)}`);
    await q(`UPDATE clienti SET partita_iva = $2, codice_fiscale = $3, indirizzo = $4, cap = $5, comune = $6, provincia = $7, nazione = $8,
      codice_sdi = $9, pec = $10, email_amministrazione = $11, pubblica_amministrazione = $12, split_payment = $13,
      aliquota_iva = (SELECT codice FROM aliquote_iva WHERE codice = $14), condizione_pagamento = (SELECT codice FROM condizioni_pagamento WHERE codice = $15),
      aggiornato_il = now() WHERE id = $1`, [id, dati.partita_iva, dati.codice_fiscale, dati.indirizzo, dati.cap, dati.comune, dati.provincia, dati.nazione,
      dati.codice_sdi, dati.pec, dati.email_amministrazione, dati.pubblica_amministrazione, dati.split_payment, dati.aliquota_iva, dati.condizione_pagamento]);
    res.redirect(`/anagrafiche/clienti/${id}/fiscali?msg=${encodeURIComponent('Dati fiscali salvati.')}`);
  });

  r.post('/clienti/:id', async (req, res) => {
    const nome = maiuscolo(req.body.ragione_sociale), id = Number(req.params.id);
    if (!nome) return res.redirect(torna('La ragione sociale non può essere vuota.'));
    if (await duplicatoCliente(nome, id)) return res.redirect(torna(`${nome} esiste già.`));
    await q(`UPDATE clienti SET ragione_sociale = $2, partita_iva = nullif($3, ''), aggiornato_il = now() WHERE id = $1`, [id, nome, maiuscolo(req.body.partita_iva)]);
    // aggiorna il nome nei preventivi collegati
    await q(`UPDATE preventivi SET intestazione = jsonb_set(intestazione, '{cliente}', to_jsonb($2::text)) WHERE cliente_id = $1`, [id, nome]);
    res.redirect(torna(`${nome} salvato.`));
  });

  const duplicatoProdotto = async (codice: string, cliente: number | null, escludi = 0) =>
    q1(`SELECT 1 FROM prodotti WHERE regexp_replace(upper(codice), '[^A-Z0-9]', '', 'g') = $1 AND cliente_id IS NOT DISTINCT FROM $2 AND id <> $3`, [chiaveCodice(codice), cliente, escludi]);
  const idCliente = (x: unknown) => (Number(x) > 0 ? Number(x) : null);
  // dopo il salvataggio si torna all'elenco com'era (tutti i clienti o quello scelto), altrimenti al cliente del prodotto
  const dopoProdotto = (body: any, cliente: number | null) => `&cliente=${body.filtro !== undefined ? Number(body.filtro) || 0 : cliente ?? 0}`;
  r.post('/prodotti', async (req, res) => {
    const codice = maiuscolo(req.body.codice), descrizione = maiuscolo(req.body.descrizione), cliente = idCliente(req.body.cliente_id);
    if (!codice || !descrizione) return res.redirect(torna('Servono codice e descrizione.', '/prodotti'));
    const senza = erroreClienteProdotto(cliente);
    if (senza) return res.redirect(torna(senza, '/prodotti', dopoProdotto(req.body, null)));
    if (await duplicatoProdotto(codice, cliente)) return res.redirect(torna(`Il codice ${codice} esiste già per questo cliente.`, '/prodotti'));
    const prezzo = leggiPrezzo(req.body.prezzo);
    if (Number.isNaN(prezzo)) return res.redirect(torna('Prezzo non valido: scrivi un numero, es. 12,50.', '/prodotti', dopoProdotto(req.body, cliente)));
    const sc = leggiScaglioni(req.body.scaglioni);
    if (sc.errori.length) return res.redirect(torna(`Scaglioni non salvati: ${sc.errori.join(' ')}`, '/prodotti', dopoProdotto(req.body, cliente)));
    const nuovo = await q1<{ id: number }>(`INSERT INTO prodotti (codice, descrizione, cliente_id, prezzo_vendita, prezzo_fonte, prezzo_data, prezzo_nota)
      VALUES ($1,$2,$3,$4::numeric, CASE WHEN $4::numeric IS NULL THEN NULL ELSE 'manuale' END, CASE WHEN $4::numeric IS NULL THEN NULL ELSE current_date END,
        CASE WHEN $4::numeric IS NULL THEN NULL ELSE 'Scritto a mano nel portale' END) RETURNING id`, [codice, descrizione, cliente, prezzo]);
    if (sc.scaglioni.length) await salvaScaglioni(nuovo!.id, sc.scaglioni);
    res.redirect(torna(`${codice} aggiunto.`, '/prodotti', dopoProdotto(req.body, cliente)));
  });
  r.post('/prodotti/:id', async (req, res) => {
    const id = Number(req.params.id);
    const codice = maiuscolo(req.body.codice), descrizione = maiuscolo(req.body.descrizione), cliente = idCliente(req.body.cliente_id);
    if (!codice || !descrizione) return res.redirect(torna('Servono codice e descrizione.', '/prodotti'));
    const senza = erroreClienteProdotto(cliente);
    if (senza) return res.redirect(torna(senza, '/prodotti', dopoProdotto(req.body, null)));
    if (await duplicatoProdotto(codice, cliente, id)) return res.redirect(torna(`Il codice ${codice} esiste già per questo cliente.`, '/prodotti'));
    // il cliente di un codice già usato non si cambia: i preventivi, le commesse e gli ordini di quel cliente resterebbero con un codice di un altro
    const attuale = await q1<{ cliente_id: number | null; usi: number }>(`SELECT p.cliente_id,
        (SELECT count(*)::int FROM prodotti_revisioni r JOIN preventivi v ON v.revisione_id = r.id WHERE r.prodotto_id = p.id)
        + (SELECT count(*)::int FROM prodotti_revisioni r JOIN commesse k ON k.revisione_id = r.id WHERE r.prodotto_id = p.id)
        + (SELECT count(*)::int FROM ordini_righe o WHERE o.prodotto_id = p.id) AS usi FROM prodotti p WHERE p.id = $1`, [id]);
    if (attuale?.cliente_id && cliente && attuale.cliente_id !== cliente && attuale.usi > 0)
      return res.redirect(torna(`${codice} è già usato in ${attuale.usi} tra preventivi, commesse e ordini: il cliente non si cambia. Se serve, crea un nuovo codice per l'altro cliente.`, '/prodotti'));
    const prezzo = leggiPrezzo(req.body.prezzo);
    if (Number.isNaN(prezzo)) return res.redirect(torna('Prezzo non valido: scrivi un numero, es. 12,50.', '/prodotti', dopoProdotto(req.body, cliente)));
    const sc = leggiScaglioni(req.body.scaglioni);
    if (sc.errori.length) return res.redirect(torna(`${codice} non salvato: ${sc.errori.join(' ')}`, '/prodotti', dopoProdotto(req.body, cliente)));
    await q(`UPDATE prodotti SET codice = $2, descrizione = $3, cliente_id = $4 WHERE id = $1`, [id, codice, descrizione, cliente]);
    // prezzo cambiato a mano: da qui in poi vale quello (il caricamento da FIC non lo tocca più); casella vuotata = di nuovo senza prezzo
    if (req.body.prezzo !== undefined) await q(`UPDATE prodotti SET prezzo_vendita = $2::numeric,
        prezzo_fonte = CASE WHEN $2::numeric IS NULL THEN NULL ELSE 'manuale' END, prezzo_data = CASE WHEN $2::numeric IS NULL THEN NULL ELSE current_date END,
        prezzo_nota = CASE WHEN $2::numeric IS NULL THEN NULL ELSE 'Scritto a mano nel portale' END
      WHERE id = $1 AND prezzo_vendita IS DISTINCT FROM $2::numeric`, [id, prezzo]);
    if (req.body.scaglioni !== undefined) await salvaScaglioni(id, sc.scaglioni);
    await q(`UPDATE preventivi v SET intestazione = v.intestazione || jsonb_build_object('codice', $2::text, 'descrizione', $3::text)
      FROM prodotti_revisioni r WHERE r.id = v.revisione_id AND r.prodotto_id = $1`, [id, codice, descrizione]);
    res.redirect(torna(`${codice} salvato.`, '/prodotti', dopoProdotto(req.body, cliente)));
  });
  // ── Elimina (inseriti per errore, mai usati) ──
  r.post('/clienti/:id/elimina', async (req, res) => {
    const id = Number(req.params.id);
    const c = await q1(`SELECT ragione_sociale FROM clienti WHERE id = $1`, [id]);
    if (!c) return res.redirect(torna('Cliente non trovato.'));
    const uso = await q1(`SELECT (SELECT count(*)::int FROM prodotti WHERE cliente_id = $1) AS prodotti,
        (SELECT count(*)::int FROM preventivi WHERE cliente_id = $1) + (SELECT count(*)::int FROM commesse WHERE cliente_id = $1)
          + (SELECT count(*)::int FROM ordini WHERE cliente_id = $1) AS altri`, [id]);
    if (uso!.prodotti) return res.redirect(torna(`${c.ragione_sociale} non eliminato: ha ${uso!.prodotti} prodotti in anagrafica (eliminali o spostali prima).`));
    if (uso!.altri) return res.redirect(torna(`${c.ragione_sociale} non eliminato: è già usato in preventivi, commesse o ordini.`));
    try {
      await transazione(async t => {
        // nel CRM: l'azienda creata da sola per questo cliente (senza referenti né attività) va via; le altre restano, scollegate
        await t.query(`DELETE FROM crm_aziende a WHERE a.cliente_id = $1 AND a.codice IS NULL
          AND NOT EXISTS (SELECT 1 FROM crm_contatti k WHERE k.azienda_id = a.id) AND NOT EXISTS (SELECT 1 FROM crm_attivita x WHERE x.azienda_id = a.id)`, [id]);
        await t.query(`UPDATE crm_aziende SET cliente_id = NULL, stato = CASE WHEN stato = 'cliente' THEN 'da_contattare' ELSE stato END WHERE cliente_id = $1`, [id]);
        await t.query(`DELETE FROM clienti WHERE id = $1`, [id]);
      });
    } catch (e: any) {
      if (e?.code === '23503') return res.redirect(torna(`${c.ragione_sociale} non eliminato: è collegato a DDT o fatture già caricati.`));
      throw e;
    }
    res.redirect(torna(`${c.ragione_sociale} eliminato.`));
  });

  r.post('/prodotti/:id/elimina', async (req, res) => {
    const id = Number(req.params.id);
    const p = await q1(`SELECT codice, cliente_id FROM prodotti WHERE id = $1`, [id]);
    if (!p) return res.redirect(torna('Prodotto non trovato.', '/prodotti'));
    const dopo = `&cliente=${p.cliente_id ?? 0}`;
    try {
      await transazione(async t => {
        // le revisioni senza preventivi né commesse vanno via con il prodotto; se è usato, il database lo impedisce
        await t.query(`DELETE FROM prodotti_revisioni WHERE prodotto_id = $1`, [id]);
        await t.query(`DELETE FROM prodotti WHERE id = $1`, [id]);
      });
    } catch (e: any) {
      if (e?.code === '23503') return res.redirect(torna(`${p.codice} non eliminato: è già usato in preventivi, commesse, ordini o nello storico.`, '/prodotti', dopo));
      throw e;
    }
    res.redirect(torna(`${p.codice} eliminato.`, '/prodotti', dopo));
  });

  return r;
}

/** Il tasto Elimina compare solo se il cliente / prodotto non è mai stato usato. */
const eliminabile = (x: { preventivi: number; altri: number; prodotti?: number }) => !x.preventivi && !x.altri && !x.prodotti;

/** Da dove arriva il prezzo del prodotto (testo del suggerimento sulla casella). */
const testoPrezzo = (p: { prezzo: number | null; prezzo_nota: string | null; prezzo_data: string | null }) =>
  p.prezzo == null ? 'Nessun prezzo: scrivilo e premi Salva' : [p.prezzo_nota, p.prezzo_data && !String(p.prezzo_nota ?? '').includes(dataIt(p.prezzo_data)) ? `(${dataIt(p.prezzo_data)})` : ''].filter(Boolean).join(' ');
/** Ultimo acquisto del componente: fornitore, data, quantità e ordine. */
const testoAcquisto = (c: any) => c.prezzo_acquisto == null ? 'Nessun ordine a fornitore trovato'
  : `${c.prezzo_fornitore ?? ''}, ${dataIt(c.prezzo_data instanceof Date ? c.prezzo_data.toISOString() : c.prezzo_data)}, ${num(Number(c.prezzo_quantita), 0)} pz. ${c.prezzo_nota ?? ''}`.trim();

// ── Scheda unica del cliente (1/11/2026) ──
const STATI_COMMESSA_TESTO: Record<string, string> = { aperta: 'aperta', in_produzione: 'in produzione', rientrata: 'rientrata', analizzata: 'analizzata', chiusa: 'chiusa' };
const NOMI_DOC: Record<string, string> = { fattura: 'Fattura', nota_credito: 'Nota di credito', nota_debito: 'Nota di debito', ddt: 'DDT' };
function schedaCliente(d: DatiSchedaCliente, oggi: string): Raw {
  const c = d.cliente;
  const anno = Number(oggi.slice(0, 4));
  const f = (a: number) => d.fatturato.find(x => x.anno === a)?.importo ?? 0;
  const variazione = f(anno - 1) > 0 ? Math.round((f(anno) - f(anno - 1)) / f(anno - 1) * 100) : null;
  const numeroDoc = (x: { numero: number | null; sezionale: string | null }) => (x.numero == null ? 'bozza' : `${x.numero}${x.sezionale ? '/' + x.sezionale : ''}`);
  const riga = (testo: Raw | string, destra: Raw | string, link?: string, rosso = false) =>
    html`<li class="${rosso ? 'ritardo' : ''}">${link ? html`<a href="${link}">${testo}</a>` : html`<span>${testo}</span>`}<span class="d">${destra}</span></li>`;
  const elenco = (righe: Raw[], vuoto: string) => (righe.length ? html`<ul>${righe}</ul>` : html`<p class="nota">${vuoto}</p>`);
  const area = (titolo: string, link: string, testoLink: string, corpo: Raw) =>
    html`<section class="area"><header><h2>${titolo}</h2><a href="${link}">${testoLink} →</a></header>${corpo}</section>`;
  const crm = d.crm;
  const prossima = crm?.data_prossima_azione ? `${crm.prossima_azione ?? 'prossima azione'} · ${data(crm.data_prossima_azione)}` : null;
  return html`
    <div class="intestazione-pagina scheda-cliente">
      <div><h1>${c.ragione_sociale}</h1>
        <p class="nota">${[c.partita_iva ? `P.IVA ${c.partita_iva}` : '', [c.indirizzo, c.cap, c.comune, c.provincia ? `(${c.provincia})` : ''].filter(Boolean).join(' '),
          c.pec ? `PEC ${c.pec}` : '', c.email_amministrazione ? c.email_amministrazione : '', c.condizione_pagamento ? `pagamento ${c.condizione_pagamento}` : '',
          c.pubblica_amministrazione ? 'pubblica amministrazione' : '', c.split_payment ? 'split payment' : ''].filter(Boolean).join(' · ')}
          ${d.storico && d.storico.media > 0 ? html` · <span class="etichetta cliente" title="fatturato medio annuo dagli export di Fatture in Cloud">fascia ${d.storico.fascia}</span>` : ''}</p></div>
      <div class="azioni">
        <a class="bottone" href="/anagrafiche/clienti/${c.id}/fiscali">Dati fiscali</a>
        <a class="bottone" href="/anagrafiche/prodotti?cliente=${c.id}">Prodotti (${c.n_prodotti})</a>
        ${crm ? html`<a class="bottone" href="/crm/${crm.id}">CRM</a>` : ''}
        <a class="bottone primario" href="/preventivi/nuovo?cliente=${c.id}">+ Preventivo</a>
        <form method="post" action="/amministrazione/documenti/nuovo" class="inline"><input type="hidden" name="tipo" value="fattura"><input type="hidden" name="cliente_id" value="${c.id}"><button>+ Fattura</button></form>
        <form method="post" action="/amministrazione/documenti/nuovo" class="inline"><input type="hidden" name="tipo" value="ddt"><input type="hidden" name="cliente_id" value="${c.id}"><button>+ DDT</button></form>
      </div>
    </div>
    <div class="cifre cifre-sei">
      <a class="cifra" href="/amministrazione/documenti?tipo=fattura&q=${encodeURIComponent(c.ragione_sociale)}"><span>Fatturato ${anno}</span><b>${euro(f(anno))}</b>
        <small>${variazione == null ? `${anno - 1}: ${euro(f(anno - 1))}` : html`<span class="${variazione >= 0 ? 'positivo' : 'negativo'}">${variazione > 0 ? '+' : ''}${variazione} %</span> su ${anno - 1} (${euro(f(anno - 1))})`}</small></a>
      <a class="cifra ${d.incassi.scaduto > 0 ? 'allarme' : ''}" href="/amministrazione"><span>Da incassare</span><b>${euro(d.incassi.scaduto + d.incassi.aScadere)}</b>
        <small>${d.incassi.scaduto > 0 ? html`<span class="negativo">${euro(d.incassi.scaduto)} scaduti (${d.incassi.scaduteN})</span>` : 'nessuna rata scaduta'}${d.giorniIncasso != null ? ` · incassa in ${d.giorniIncasso} gg` : ''}</small></a>
      <a class="cifra" href="/ordini?q=${encodeURIComponent(c.ragione_sociale)}"><span>Ordini aperti</span><b>${euro(d.valoreOrdiniAperti)}</b><small>${d.ordiniAperti.length} righe da evadere</small></a>
      <a class="cifra" href="/commesse?q=${encodeURIComponent(c.ragione_sociale)}"><span>Commesse in corso</span><b>${d.commesse.length}</b><small>${d.commesse.filter(x => x.data_consegna && x.data_consegna < oggi).length ? html`<span class="negativo">${d.commesse.filter(x => x.data_consegna && x.data_consegna < oggi).length} oltre la consegna</span>` : 'nessuna oltre la consegna'}</small></a>
      <a class="cifra ${d.ddtDaFatturare.length ? 'allarme' : ''}" href="/amministrazione/differite"><span>DDT da fatturare</span><b>${d.ddtDaFatturare.length}</b><small>${d.ddtDaFatturare.length ? `dal ${data(d.ddtDaFatturare[0].data)}` : 'tutto fatturato'}</small></a>
      <a class="cifra" href="/preventivi?q=${encodeURIComponent(c.ragione_sociale)}"><span>Preventivi</span><b>${d.preventivi.length}${d.preventivi.length >= 12 ? '+' : ''}</b><small>${d.preventivi.filter(p => ['inviato', 'bozza', 'da_validare'].includes(p.stato)).length} aperti</small></a>
    </div>
    <div class="aree">
      ${area('Ordini aperti', `/ordini?q=${encodeURIComponent(c.ragione_sociale)}`, 'Ordini', elenco(d.ordiniAperti.slice(0, 8).map(r =>
        riga(`${r.numero}/${r.anno} · ${r.codice ?? r.descrizione ?? ''} · ${num(r.residuoQuantita, 0)} pz`, r.consegna ? data(r.consegna) : '', `/ordini/${r.ordineId}`, !!(r.consegna && r.consegna < oggi))), 'Nessuna riga d\'ordine da evadere.'))}
      ${area('Commesse in corso', `/commesse?q=${encodeURIComponent(c.ragione_sociale)}`, 'Commesse', elenco(d.commesse.slice(0, 8).map(x =>
        riga(`${x.numero} · ${x.codice ?? ''} · ${num(x.quantita, 0)} pz`, `${STATI_COMMESSA_TESTO[x.stato] ?? x.stato}${x.data_consegna ? ' · ' + data(x.data_consegna) : ''}`, `/commesse/${x.id}`, !!(x.data_consegna && x.data_consegna < oggi))), 'Nessuna commessa aperta.'))}
      ${area('DDT da fatturare', '/amministrazione/differite', 'Fatture differite', elenco(d.ddtDaFatturare.slice(0, 8).map(x =>
        riga(`DDT n. ${x.numero}`, data(x.data), `/amministrazione/documenti/${x.id}`)), 'Nessun DDT da fatturare.'))}
      ${area('Incassi scaduti', `/amministrazione/solleciti/${d.cliente.id}`, 'Sollecito', elenco(d.rateScadute.slice(0, 8).map(r =>
        riga(`Fattura ${numeroDoc(r)} · ${euro(r.importo)}`, `scaduta il ${data(r.data)}`, `/amministrazione/documenti/${r.documento_id}`, true)), 'Nessun incasso scaduto.'))}
      ${area('Ultimi documenti', `/amministrazione/documenti?tipo=fattura&q=${encodeURIComponent(c.ragione_sociale)}`, 'Documenti', elenco(d.documenti.slice(0, 10).map(x =>
        riga(`${NOMI_DOC[x.tipo] ?? x.tipo} ${numeroDoc(x)}${x.tipo === 'ddt' ? '' : ' · ' + euro(x.imponibile)}`, `${data(x.data)}${x.stato === 'bozza' ? ' · bozza' : x.stato === 'annullato' ? ' · annullato' : ''}`, `/amministrazione/documenti/${x.id}`)), 'Nessun documento.'))}
      ${area('Preventivi', `/preventivi?q=${encodeURIComponent(c.ragione_sociale)}`, 'Preventivi', elenco(d.preventivi.slice(0, 8).map(p =>
        riga(`${p.numero ?? p.id} · ${p.codice ?? ''} · ${num(p.n_schede, 0)} pz${p.prezzo_scheda ? ' · ' + euro(p.prezzo_scheda) + '/scheda' : ''}`, `${String(p.stato).replace(/_/g, ' ')} · ${data(p.creato_il)}`, `/preventivi/${p.id}`)), 'Nessun preventivo.'))}
      ${area('Prodotti e prezzi', `/anagrafiche/prodotti?cliente=${c.id}`, 'Prodotti', elenco(d.prodotti.slice(0, 10).map(p =>
        riga(`${p.codice} · ${p.descrizione ?? ''}`, p.prezzo != null ? html`${euro(p.prezzo)}${p.scaglioni ? ' + scaglioni' : ''}` : 'senza prezzo', `/anagrafiche/prodotti?cliente=${c.id}&q=${encodeURIComponent(p.codice)}`)), 'Nessun prodotto in anagrafica.'))}
      ${area('CRM', crm ? `/crm/${crm.id}` : '/crm', crm ? 'Scheda CRM' : 'CRM', crm ? html`
        ${prossima ? html`<p class="nota ${crm.data_prossima_azione < oggi ? 'negativo' : ''}"><b>Prossima azione:</b> ${prossima}</p>` : ''}
        ${crm.responsabile ? html`<p class="nota">Responsabile: ${crm.responsabile}</p>` : ''}
        ${(crm.contatti ?? []).length ? html`<div class="tit">Referenti</div><ul>${(crm.contatti as any[]).slice(0, 5).map(k => riga(`${k.nome}${k.ruolo ? ' · ' + k.ruolo : ''}`, [k.telefono, k.email].filter(Boolean).join(' · ')))}</ul>` : ''}
        <div class="tit">Ultime attività</div>${elenco((crm.attivita as any[] ?? []).map(t => riga(`${t.tipo}: ${String(t.descrizione ?? '').slice(0, 80)}`, data(t.data))), 'Nessuna attività registrata.')}`
        : html`<p class="nota">Il cliente non è ancora collegato a un'azienda del CRM.</p>`)}
    </div>`;
}
