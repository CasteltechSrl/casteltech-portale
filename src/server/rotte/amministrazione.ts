/**
 * Amministrazione (menu in alto): documenti emessi (fatture, note di credito, autofatture, DDT; anche lo storico di FIC)
 * e documenti ricevuti. Fatture e note di credito si scrivono qui: bozza → Emetti (numero, scadenze, XML FatturaPA).
 * L'invio allo SdI (Invoicetronic) arriva nel passo successivo: per ora l'XML si scarica.
 */
import { Router, type Request } from 'express';
import { q, q1 } from '../db.js';
import { layout } from '../views/layout.js';
import { html, data, euro, num, raw, type Raw } from '../views/html.js';
import { numeroCompleto } from '../../engine/amministrazione.js';
import { caricaAliquote, caricaCondizioniPagamento } from '../amministrazione-servizio.js';
import {
  TIPI_EMISSIBILI, aggiungiDdt, anteprimaDocumento, creaBozza, creaNotaCredito, ddtDaFatturare, eliminaBozza, emettiDocumento, salvaBozza,
  type TipoEmissibile,
} from '../documenti-servizio.js';

const NOMI: Record<string, { uno: string; tanti: string }> = {
  fattura: { uno: 'Fattura', tanti: 'Fatture' }, nota_credito: { uno: 'Nota di credito', tanti: 'Note di credito' },
  autofattura: { uno: 'Autofattura', tanti: 'Autofatture' }, ddt: { uno: 'DDT', tanti: 'DDT' },
};
const STATI: Record<string, string> = { bozza: 'Bozza', emesso: 'Emesso', inviato: 'Inviato allo SdI', consegnato: 'Consegnato',
  non_consegnato: 'Non consegnato', scartato: 'Scartato', annullato: 'Annullato' };
const RIGHE_VUOTE = 3;

export function rotteAmministrazione() {
  const r = Router();
  const pagina = (req: Request, titolo: string, contenuto: Raw, avviso?: string, script?: string) =>
    String(layout({ titolo, utente: req.session.utente, attiva: 'amministrazione', contenuto, avviso, script, largo: true }));
  const msg = (req: Request) => (req.query.msg ? String(req.query.msg) : undefined);

  r.get('/', (_req, res) => res.redirect('/amministrazione/documenti'));

  r.get('/documenti', async (req, res) => {
    const tipo = String(req.query.tipo ?? 'fattura');
    const anno = Number(req.query.anno) || new Date().getFullYear();
    const cerca = String(req.query.q ?? '').trim();
    const righe = await q(`SELECT d.id, d.tipo, d.numero, d.sezionale, d.data, d.stato, d.origine, d.imponibile, d.totale, d.fattura_id,
        coalesce(c.ragione_sociale, d.intestatario->>'ragione_sociale', d.intestatario->>'nome') AS intestatario
      FROM documenti d LEFT JOIN clienti c ON c.id = d.cliente_id
      WHERE d.tipo = $1 AND (d.anno = $2 OR d.stato = 'bozza')
        AND ($3 = '' OR coalesce(c.ragione_sociale, d.intestatario->>'ragione_sociale', '') ILIKE '%' || $3 || '%' OR d.numero::text = $3)
      ORDER BY d.numero IS NOT NULL, d.data DESC, d.numero DESC NULLS FIRST`, [tipo, anno, cerca]);
    const anni = (await q<{ anno: number }>(`SELECT DISTINCT anno FROM documenti ORDER BY anno DESC`)).map(a => a.anno);
    if (!anni.includes(anno)) anni.unshift(anno);
    const totale = righe.filter(d => d.stato !== 'bozza' && d.stato !== 'annullato').reduce((s, d) => s + Number(d.imponibile), 0);
    res.send(pagina(req, NOMI[tipo]?.tanti ?? 'Documenti', html`
      <div class="intestazione-pagina"><h1>Amministrazione</h1>
        <div class="azioni">
          <a href="/amministrazione/documenti/nuovo?tipo=fattura" class="bottone primario">+ Nuova fattura</a>
          <a href="/amministrazione/ricevuti" class="bottone">Documenti ricevuti</a>
        </div></div>
      <nav class="tasti-sezione">${Object.entries(NOMI).map(([k, v]) =>
        html`<a href="/amministrazione/documenti?tipo=${k}&anno=${anno}" class="${k === tipo ? 'attivo' : ''}">${v.tanti}</a>`)}</nav>
      <form class="cerca" method="get">
        <input type="hidden" name="tipo" value="${tipo}">
        <select name="anno">${anni.map(a => html`<option ${a === anno ? raw('selected') : ''}>${a}</option>`)}</select>
        <input name="q" value="${cerca}" placeholder="Cliente o numero">
        <button>Cerca</button>
      </form>
      <p class="nota">${righe.length} documenti${tipo !== 'ddt' ? html` · imponibile ${euro(totale)}` : ''}. I documenti di Fatture in Cloud sono marcati FIC.</p>
      ${righe.length ? html`<div class="tabella-scorre"><table class="elenco">
        <thead><tr><th>Numero</th><th>Data</th><th>Intestatario</th><th class="num">Imponibile</th><th class="num">Totale</th><th>Stato</th></tr></thead>
        <tbody>${righe.map(d => html`<tr>
          <td><a href="/amministrazione/documenti/${d.id}"><strong>${d.numero == null ? 'bozza' : numeroCompleto(d.numero, d.sezionale)}</strong></a>
            ${d.origine === 'fic' ? html` <span class="etichetta">FIC</span>` : ''}</td>
          <td>${data(d.data)}</td><td>${d.intestatario ?? ''}</td>
          <td class="num">${tipo === 'ddt' ? '' : euro(Number(d.imponibile))}</td><td class="num">${tipo === 'ddt' ? '' : euro(Number(d.totale))}</td>
          <td><span class="stato doc-${d.stato}">${STATI[d.stato] ?? d.stato}</span>
            ${tipo === 'ddt' ? (d.fattura_id ? html` <a href="/amministrazione/documenti/${d.fattura_id}" class="nota">fatturato</a>` : html` <span class="nota">da fatturare</span>`) : ''}</td>
        </tr>`)}</tbody></table></div>` : html`<p class="vuoto">Nessun documento.</p>`}`, msg(req)));
  });

  r.get('/documenti/nuovo', async (req, res) => {
    const tipo = (TIPI_EMISSIBILI as readonly string[]).includes(String(req.query.tipo)) ? String(req.query.tipo) : 'fattura';
    const clienti = await q(`SELECT id, ragione_sociale FROM clienti ORDER BY ragione_sociale`);
    res.send(pagina(req, `Nuova ${NOMI[tipo].uno.toLowerCase()}`, html`
      <p><a href="/amministrazione/documenti?tipo=${tipo}">← ${NOMI[tipo].tanti}</a></p>
      <h1>Nuova ${NOMI[tipo].uno.toLowerCase()}</h1>
      ${tipo === 'nota_credito' ? html`<p class="nota">Per stornare una fattura usa "Crea nota di credito" dalla fattura: righe e collegamento si compilano da soli.</p>` : ''}
      <form method="post" action="/amministrazione/documenti/nuovo" class="blocco stretto-form">
        <input type="hidden" name="tipo" value="${tipo}">
        <label>Cliente (dall'anagrafica)
          <select name="cliente_id" required><option value="">Scegli…</option>${clienti.map(c => html`<option value="${c.id}">${c.ragione_sociale}</option>`)}</select></label>
        <button class="primario">Crea la bozza</button>
      </form>`));
  });

  r.post('/documenti/nuovo', async (req, res) => {
    const tipo = String(req.body.tipo) as TipoEmissibile;
    if (!TIPI_EMISSIBILI.includes(tipo) || !Number(req.body.cliente_id)) return res.redirect('/amministrazione/documenti/nuovo');
    const id = await creaBozza(tipo, Number(req.body.cliente_id), req.session.utente?.id ?? null);
    res.redirect(`/amministrazione/documenti/${id}`);
  });

  r.get('/documenti/:id', async (req, res) => {
    const id = Number(req.params.id);
    const d = await q1(`SELECT d.*, c.ragione_sociale, o.numero AS origine_numero, o.sezionale AS origine_sezionale, o.data AS origine_data,
        f.numero AS fattura_numero, f.data AS fattura_data
      FROM documenti d LEFT JOIN clienti c ON c.id = d.cliente_id LEFT JOIN documenti o ON o.id = d.documento_origine_id
      LEFT JOIN documenti f ON f.id = d.fattura_id WHERE d.id = $1`, [id]);
    if (!d) return res.status(404).send('Documento non trovato');
    const righe = await q(`SELECT r.*, t.numero AS ddt_numero FROM documenti_righe r LEFT JOIN documenti t ON t.id = r.ddt_id
      WHERE r.documento_id = $1 ORDER BY r.posizione`, [id]);
    const nome = NOMI[d.tipo]?.uno ?? d.tipo;
    const titolo = `${nome} ${d.numero == null ? '(bozza)' : `n. ${numeroCompleto(d.numero, d.sezionale)}`}`;
    const intestatario = d.ragione_sociale ?? d.intestatario?.ragione_sociale ?? d.intestatario?.nome ?? '';
    const testa = html`<p><a href="/amministrazione/documenti?tipo=${d.tipo}&anno=${d.anno}">← ${NOMI[d.tipo]?.tanti ?? 'Documenti'}</a></p>
      <div class="intestazione-pagina"><h1>${titolo}</h1><div class="azioni"><span class="stato doc-${d.stato}">${STATI[d.stato] ?? d.stato}</span>
        ${d.origine === 'fic' ? html`<span class="etichetta">da Fatture in Cloud</span>` : ''}</div></div>
      <p><strong>${intestatario}</strong> · ${data(d.data)}
        ${d.origine_numero ? html` · storna la fattura <a href="/amministrazione/documenti/${d.documento_origine_id}">n. ${numeroCompleto(d.origine_numero, d.origine_sezionale)} del ${data(d.origine_data)}</a>` : ''}
        ${d.tipo === 'ddt' ? (d.fattura_id ? html` · fatturato con la <a href="/amministrazione/documenti/${d.fattura_id}">fattura n. ${d.fattura_numero} del ${data(d.fattura_data)}</a>` : ' · da fatturare') : ''}</p>`;

    if (d.stato !== 'bozza') {
      const scadenze = await q(`SELECT * FROM documenti_scadenze WHERE documento_id = $1 ORDER BY data`, [id]);
      const trasporto = d.dati_trasporto ?? {};
      return res.send(pagina(req, titolo, html`${testa}
        ${d.causale ? html`<p class="nota">${d.causale}</p>` : ''}
        ${d.tipo === 'ddt' && Object.keys(trasporto).length ? html`<p class="nota">${['causale', 'colli', 'peso', 'trasportatore'].filter(k => trasporto[k])
          .map(k => `${k}: ${trasporto[k]}`).join(' · ')}</p>` : ''}
        <div class="tabella-scorre"><table class="elenco">
          <thead><tr><th>Codice</th><th>Descrizione</th><th class="num">Q.tà</th><th>U.m.</th><th class="num">Prezzo</th><th class="num">Sconto</th><th class="num">Importo</th><th>IVA</th></tr></thead>
          <tbody>${righe.map(x => x.solo_descrizione ? html`<tr><td></td><td colspan="7"><em>${x.descrizione}</em></td></tr>` : html`<tr>
            <td>${x.codice ?? ''}</td><td>${x.descrizione}</td><td class="num">${num(x.quantita, 0)}</td><td>${x.um ?? ''}</td>
            <td class="num">${euro(x.prezzo)}</td><td class="num">${x.sconto ? `${num(x.sconto)} %` : ''}</td>
            <td class="num">${euro(Math.round(x.quantita * x.prezzo * (1 - x.sconto / 100) * 100) / 100)}</td><td>${x.aliquota_iva ?? ''}</td></tr>`)}</tbody>
        </table></div>
        ${d.tipo !== 'ddt' ? html`<p class="totali-documento">Imponibile ${euro(d.imponibile)} · IVA ${euro(d.imposta)}${d.bollo ? html` · bollo ${euro(d.bollo)}` : ''} · <strong>Totale ${euro(d.totale)}</strong></p>` : ''}
        ${scadenze.length ? html`<h2>Scadenze</h2><ul>${scadenze.map(s => html`<li>${data(s.data)}: ${euro(s.importo)} ${s.pagata_il
          ? html`<span class="stato doc-consegnato">pagata il ${data(s.pagata_il)}${s.conto ? ` (${s.conto})` : ''}</span>` : html`<span class="stato doc-bozza">aperta</span>`}</li>`)}</ul>` : ''}
        <div class="azioni-secondarie">
          ${d.xml ? html`<a class="bottone" href="/amministrazione/documenti/${id}/xml">Scarica XML</a>` : ''}
          ${d.tipo === 'fattura' && d.cliente_id ? html`<form method="post" action="/amministrazione/documenti/${id}/nota-credito" class="inline"
            data-conferma="Creare una nota di credito (bozza) che storna questa fattura?"><button>Crea nota di credito</button></form>` : ''}
        </div>`, msg(req)));
    }

    // bozza: modulo modificabile
    const [aliquote, condizioni, ddt, { esito, erroriExtra }] = await Promise.all([
      caricaAliquote(true), caricaCondizioniPagamento(true), d.cliente_id ? ddtDaFatturare(d.cliente_id, id) : Promise.resolve([]), anteprimaDocumento(id)]);
    const errori = [...esito.errori, ...erroriExtra];
    const t = esito.totali;
    const vuote = Array.from({ length: RIGHE_VUOTE }, () => ({}) as any);
    const rigaModulo = (x: any, i: number) => html`<tr class="${x.solo_descrizione ? 'riga-testo' : ''}">
      <td><input name="righe[${i}][codice]" value="${x.codice ?? ''}" class="corto maiuscolo"><input type="hidden" name="righe[${i}][ddt_id]" value="${x.ddt_id ?? ''}">
        <input type="hidden" name="righe[${i}][prodotto_id]" value="${x.prodotto_id ?? ''}"></td>
      <td><input name="righe[${i}][descrizione]" value="${x.descrizione ?? ''}">${x.ddt_numero && !x.solo_descrizione ? html`<span class="nota">dal DDT n. ${x.ddt_numero}</span>` : ''}</td>
      <td><input name="righe[${i}][quantita]" value="${x.quantita ?? ''}" class="corto" inputmode="decimal"></td>
      <td><input name="righe[${i}][um]" value="${x.um ?? ''}" class="cortissimo"></td>
      <td><input name="righe[${i}][prezzo]" value="${x.prezzo ?? ''}" class="corto" inputmode="decimal"></td>
      <td><input name="righe[${i}][sconto]" value="${x.sconto || ''}" class="cortissimo" inputmode="decimal"></td>
      <td><select name="righe[${i}][aliquota_iva]"><option value="">predefinita</option>${aliquote.map(a =>
        html`<option value="${a.codice}" ${x.aliquota_iva === a.codice ? raw('selected') : ''}>${a.descrizione}</option>`)}</select></td>
      <td class="centro"><input type="checkbox" name="righe[${i}][solo_descrizione]" ${x.solo_descrizione ? raw('checked') : ''} title="Riga di solo testo, senza importo"></td>
    </tr>`;
    res.send(pagina(req, titolo, html`${testa}
      <form method="post" action="/amministrazione/documenti/${id}" class="blocco" id="modulo-documento">
        <div class="riga-campi">
          <label class="stretto">Data <input type="date" name="data" value="${d.data}" required></label>
          <label>Pagamento <select name="condizione_pagamento"><option value="">Scegli…</option>${condizioni.map(c =>
            html`<option value="${c.codice}" ${d.condizione_pagamento === c.codice ? raw('selected') : ''}>${c.descrizione}</option>`)}</select></label>
          <label>Rif. ordine del cliente <input name="riferimento_esterno" value="${d.riferimento_esterno ?? ''}"></label>
        </div>
        <label>Causale (stampata sulla fattura) <input name="causale" value="${d.causale ?? ''}"></label>
        <label>Note interne (non vanno in fattura) <input name="note" value="${d.note ?? ''}"></label>
        <div class="tabella-scorre"><table class="editor" id="righe-documento">
          <thead><tr><th>Codice</th><th>Descrizione</th><th>Q.tà</th><th>U.m.</th><th>Prezzo €</th><th>Sconto %</th><th>IVA</th><th title="Solo testo">Testo</th></tr></thead>
          <tbody>${[...righe, ...vuote].map(rigaModulo)}</tbody>
        </table></div>
        <div class="barra-azioni"><button type="button" id="aggiungi-riga">+ Riga</button>
          <span class="nota">IVA "predefinita" = quella del cliente (lettera d'intento, estero…) o 22 %.</span>
          <button class="primario">Salva</button></div>
      </form>
      ${ddt.length ? html`<form method="post" action="/amministrazione/documenti/${id}/ddt" class="blocco">
        <h2>DDT da fatturare di questo cliente</h2>
        ${ddt.map(x => html`<label class="riga-spunta"><input type="checkbox" name="ddt" value="${x.id}"> DDT n. ${x.numero} del ${data(x.data)}
          <span class="nota">${x.righe} righe${x.causale ? ` · ${x.causale}` : ''}</span></label>`)}
        <button>Aggiungi i DDT scelti</button> <span class="nota">Salva prima le modifiche alle righe: i DDT si aggiungono in fondo.</span>
      </form>` : ''}
      <div class="blocco">
        <p class="totali-documento">Imponibile ${euro(t.imponibile)} · IVA ${euro(t.imposta)}${t.bollo ? html` · bollo ${euro(t.bollo)}` : ''} · <strong>Totale ${euro(t.totale)}</strong></p>
        ${errori.length ? html`<p><strong>Da sistemare prima di emettere:</strong></p><ul class="controlli errori">${errori.map(e => html`<li>${e}</li>`)}</ul>`
          : html`<p class="nota">Controlli della fattura elettronica superati: si può emettere.</p>`}
        <div class="azioni-secondarie">
          <form method="post" action="/amministrazione/documenti/${id}/emetti" class="inline"
            data-conferma="Emettere il documento? Prende il numero successivo e non si potrà più modificare (si corregge con una nota di credito).">
            <button class="primario" ${errori.length ? raw('disabled') : ''}>Emetti</button></form>
          ${errori.length ? '' : html`<a class="bottone" href="/amministrazione/documenti/${id}/xml-prova" title="Stesso file che si emetterebbe, con numero 0: non consuma la numerazione">Scarica XML di prova</a>`}
          <form method="post" action="/amministrazione/documenti/${id}/elimina" class="inline" data-conferma="Eliminare questa bozza?">
            <button class="pericolo">Elimina bozza</button></form>
        </div>
      </div>`, msg(req), 'documenti.js'));
  });

  r.post('/documenti/:id', async (req, res) => {
    const id = Number(req.params.id);
    const errori = await salvaBozza(id, req.body);
    res.redirect(`/amministrazione/documenti/${id}?msg=${encodeURIComponent(errori.length ? `Non salvato: ${errori.join(' ')}` : 'Salvato.')}`);
  });

  r.post('/documenti/:id/ddt', async (req, res) => {
    const id = Number(req.params.id);
    const scelti = [req.body.ddt ?? []].flat().map(Number).filter(Boolean);
    const n = scelti.length ? await aggiungiDdt(id, scelti) : 0;
    res.redirect(`/amministrazione/documenti/${id}?msg=${encodeURIComponent(n ? `Aggiunti ${n} DDT.` : 'Nessun DDT scelto.')}`);
  });

  r.post('/documenti/:id/emetti', async (req, res) => {
    const id = Number(req.params.id);
    const esito = await emettiDocumento(id);
    res.redirect(`/amministrazione/documenti/${id}?msg=${encodeURIComponent('errori' in esito
      ? `Non emesso: ${esito.errori.join(' ')}` : `Emesso con il n. ${esito.numero}. Scarica l'XML (l'invio allo SdI dal portale arriva a breve).`)}`);
  });

  r.post('/documenti/:id/elimina', async (req, res) => {
    const ok = await eliminaBozza(Number(req.params.id));
    res.redirect(ok ? '/amministrazione/documenti?msg=' + encodeURIComponent('Bozza eliminata.')
      : `/amministrazione/documenti/${req.params.id}?msg=${encodeURIComponent('Solo le bozze si eliminano: un documento emesso si storna con una nota di credito.')}`);
  });

  r.post('/documenti/:id/nota-credito', async (req, res) => {
    try {
      const id = await creaNotaCredito(Number(req.params.id), req.session.utente?.id ?? null);
      res.redirect(`/amministrazione/documenti/${id}?msg=${encodeURIComponent('Nota di credito creata come bozza: controlla righe e importi (per uno storno parziale togli o cambia le righe).')}`);
    } catch (e: any) {
      res.redirect(`/amministrazione/documenti/${req.params.id}?msg=${encodeURIComponent(e.message)}`);
    }
  });

  r.get('/documenti/:id/xml', async (req, res) => {
    const d = await q1(`SELECT xml, numero, sezionale, id FROM documenti WHERE id = $1 AND xml IS NOT NULL`, [Number(req.params.id)]);
    if (!d) return res.status(404).send('XML non disponibile');
    const piva = (await q1(`SELECT valore->>'partita_iva' AS p FROM impostazioni WHERE chiave = 'azienda'`))?.p ?? '';
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="IT${piva}_${d.id.toString(36).toUpperCase().padStart(5, '0').slice(-5)}.xml"`);
    res.send(d.xml);
  });

  // bozza: l'XML che si emetterebbe, con numero 0, per controllarlo (es. sul sito dell'Agenzia) senza consumare la numerazione
  r.get('/documenti/:id/xml-prova', async (req, res) => {
    const id = Number(req.params.id);
    const d = await q1(`SELECT stato FROM documenti WHERE id = $1`, [id]);
    if (d?.stato !== 'bozza') return res.status(404).send('XML di prova solo per le bozze');
    const { esito } = await anteprimaDocumento(id);
    if (esito.errori.length) return res.status(400).send(`Da sistemare prima: ${esito.errori.join(' ')}`);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${esito.nomeFile.replace('.xml', '_PROVA.xml')}"`);
    res.send(esito.xml);
  });

  r.get('/ricevuti', async (req, res) => {
    const anno = Number(req.query.anno) || new Date().getFullYear();
    const cerca = String(req.query.q ?? '').trim();
    const righe = await q(`SELECT d.*, f.ragione_sociale,
        (SELECT coalesce(sum(importo), 0) FROM documenti_ricevuti_scadenze s WHERE s.documento_id = d.id AND s.pagata_il IS NULL)::float AS da_pagare
      FROM documenti_ricevuti d LEFT JOIN fornitori_anagrafica f ON f.id = d.fornitore_id
      WHERE extract(year FROM d.data) = $1 AND ($2 = '' OR coalesce(f.ragione_sociale, d.intestatario->>'nome', '') ILIKE '%' || $2 || '%' OR d.numero ILIKE $2)
      ORDER BY d.data DESC, d.id DESC`, [anno, cerca]);
    const totale = righe.reduce((s, d) => s + (d.tipo === 'nota_credito' ? -1 : 1) * Number(d.imponibile), 0);
    res.send(pagina(req, 'Documenti ricevuti', html`
      <p><a href="/amministrazione/documenti">← Amministrazione</a></p>
      <h1>Documenti ricevuti</h1>
      <form class="cerca" method="get">
        <input name="anno" value="${anno}" class="corto" inputmode="numeric">
        <input name="q" value="${cerca}" placeholder="Fornitore o numero"><button>Cerca</button>
      </form>
      <p class="nota">${righe.length} documenti · imponibile ${euro(totale)}. Per ora dallo storico di Fatture in Cloud; poi arriveranno dallo SdI.</p>
      <div class="tabella-scorre limitata"><table class="elenco">
        <thead><tr><th>Data</th><th>Fornitore</th><th>Numero</th><th>Descrizione</th><th class="num">Imponibile</th><th class="num">Totale</th><th class="num">Da pagare</th></tr></thead>
        <tbody>${righe.map(d => html`<tr>
          <td>${data(d.data)}</td><td>${d.ragione_sociale ?? d.intestatario?.nome ?? ''}</td>
          <td>${d.tipo === 'nota_credito' ? html`<span class="etichetta">NC</span> ` : ''}${d.numero}</td>
          <td><span class="nota taglia">${d.descrizione ?? ''}</span></td>
          <td class="num">${euro(Number(d.imponibile))}</td><td class="num">${euro(Number(d.totale))}</td>
          <td class="num">${d.da_pagare ? euro(d.da_pagare) : ''}</td></tr>`)}</tbody></table></div>`, msg(req)));
  });

  return r;
}
