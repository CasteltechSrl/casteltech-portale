/**
 * Amministrazione (menu in alto): documenti emessi (fatture, note di credito, autofatture, DDT; anche lo storico di FIC)
 * e documenti ricevuti. Fatture e note di credito si scrivono qui: bozza → Emetti (numero, scadenze, XML FatturaPA).
 * Invio allo SdI con Invoicetronic (invoicetronic.ts): "Invia allo SdI" sui documenti emessi; con la chiave di prova
 * "Prova l'invio" anche dalle bozze. Gli esiti arrivano dal webhook o con "Aggiorna esito".
 */
import { prodottiPerCliente } from '../anagrafiche-servizio.js';
import { cellaCodice, cellaDescrizione, riquadriSceltaProdotto, type ProdottoScelta } from '../views/scelta-prodotto.js';
import { Router, type Request } from 'express';
import { q, q1 } from '../db.js';
import { layout } from '../views/layout.js';
import { html, data, euro, num, raw, type Raw } from '../views/html.js';
import { MODI_PAGAMENTO, modoPagamento, numeroCompleto } from '../../engine/amministrazione.js';
import { contenutoCruscotto, menuAmministrazione } from './cruscotto-amministrazione.js';
import { acquistiPerFornitore, fattureScadute, type RataDaPagare } from '../../engine/cruscotto-amministrazione.js';
import { riquadroVies, rotteRegistriIva, rotteVies } from './registri-iva.js';
import { riquadroFattureEstere, rotteAutofatture } from './autofatture.js';
import { TIPI_AUTOFATTURA } from '../../engine/autofatture.js';
import { caricaAliquote, caricaCondizioniPagamento } from '../amministrazione-servizio.js';
import { TIPI_SDI, aggiornaEsitiDocumento, ambienteAttuale, inviaDocumento, scaricaRicevute } from '../invoicetronic.js';
import { NOMI_STATI_SDI } from '../../engine/sdi.js';
import {
  TIPI_EMISSIBILI, accontiDaScalare, aggiungiDdt, annullaDdt, anteprimaDocumento, controllaDdt, creaAccontoDaOrdine, creaBozza, creaDdtDaOrdine,
  creaNotaCredito, creaNotaDebito, ddtDaFatturare, eliminaBozza, emettiDocumento, riapriScartato, salvaBozza, scalaAcconti, type TipoEmissibile,
} from '../documenti-servizio.js';
import { TIPI_SCEGLIBILI, TIPI_SDI_FATTURA, nomeTipoSdi, scadenzaF24, termineDifferita } from '../../engine/tipi-fattura.js';
import { CAUSALI_DDT, PORTI, TRASPORTO_A_CURA, indirizzoSu } from '../../engine/ddt.js';
import { stampaDdt, stampaFattura } from '../views/stampa-documento.js';
import { calcolaTotali } from '../../engine/amministrazione.js';

const NOMI: Record<string, { uno: string; tanti: string }> = {
  fattura: { uno: 'Fattura', tanti: 'Fatture' }, nota_credito: { uno: 'Nota di credito', tanti: 'Note di credito' },
  autofattura: { uno: 'Autofattura', tanti: 'Autofatture' }, ddt: { uno: 'DDT', tanti: 'DDT' },
};
const STATI: Record<string, string> = { bozza: 'Bozza', emesso: 'Emesso', inviato: 'Inviato allo SdI', consegnato: 'Consegnato',
  non_consegnato: 'Non consegnato', scartato: 'Scartato', annullato: 'Annullato' };
const RIGHE_VUOTE = 3;
const nuovoNome = (tipo: string) => (tipo === 'ddt' ? 'Nuovo DDT' : `Nuova ${NOMI[tipo].uno.toLowerCase()}`);
const oggiRoma = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
// tabelle delle rate: documenti emessi (incassi) e fatture dei fornitori (pagamenti)
const SCADENZE = { documenti: 'documenti_scadenze', ricevuti: 'documenti_ricevuti_scadenze' } as const;

/**
 * Riquadro SdI del documento: invii fatti (reali e di prova) con esito, e i pulsanti possibili con la chiave attuale.
 * Chiave reale: "Invia allo SdI" solo sui documenti emessi (o scartati). Chiave di prova: "Prova l'invio" anche dalle bozze.
 */
async function riquadroSdi(d: any, senzaErrori = true): Promise<Raw> {
  if (!TIPI_SDI.includes(d.tipo) || d.origine !== 'portale') return html``;
  const ambiente = ambienteAttuale();
  const invii = await q(`SELECT i.*, u.nome AS utente FROM sdi_invii i LEFT JOIN utenti u ON u.id = i.creato_da WHERE documento_id = $1 ORDER BY i.id DESC`, [d.id]);
  const aperti = invii.some(i => i.ambiente === ambiente && i.invoicetronic_id
    && !['Consegnato', 'Scartato', 'DecorrenzaTermini', 'AccettatoDalDestinatario', 'RifiutatoDalDestinatario'].includes(i.stato));
  const inCorsoReale = invii.some(i => i.ambiente === 'reale' && !['Scartato', 'errore'].includes(i.stato));
  const puoInviare = ambiente === 'reale' ? ['emesso', 'scartato'].includes(d.stato) && !inCorsoReale : ambiente === 'prova' && senzaErrori;
  if (!invii.length && !puoInviare) return ambiente ? html`` : html`<p class="nota">Invio allo SdI: manca la chiave di Invoicetronic su Render.</p>`;
  return html`<section class="blocco"><h2>SdI</h2>
    ${ambiente === 'prova' ? html`<p class="nota">Chiave di <strong>prova</strong>: gli invii restano in Invoicetronic e non arrivano allo SdI (esiti simulati, ogni ora alla mezza).</p>` : ''}
    ${invii.length ? html`<div class="tabella-scorre"><table class="elenco">
      <thead><tr><th>Inviato</th><th></th><th>File</th><th>Esito</th><th>Dettagli</th></tr></thead>
      <tbody>${invii.map(i => html`<tr class="${i.stato === 'Scartato' || i.stato === 'errore' ? 'scaduta' : ''}">
        <td>${new Date(i.inviato_il).toLocaleString('it-IT', { timeZone: 'Europe/Rome', dateStyle: 'short', timeStyle: 'short' })}${i.utente ? html`<br><span class="nota">${i.utente}</span>` : ''}</td>
        <td>${i.ambiente === 'prova' ? html`<span class="etichetta">prova</span>` : ''}</td>
        <td>${i.nome_file ?? ''}${i.identificativo ? html`<br><span class="nota">SdI ${i.identificativo}</span>` : ''}</td>
        <td>${NOMI_STATI_SDI[i.stato] ?? i.stato}</td><td>${i.messaggio ?? ''}</td></tr>`)}</tbody></table></div>` : ''}
    <div class="azioni-secondarie">
      ${puoInviare ? html`<form method="post" action="/amministrazione/documenti/${d.id}/invia" class="inline"
        data-conferma="${ambiente === 'reale' ? "Inviare il documento allo SdI? Diventa definitivo per il cliente e per l'Agenzia delle Entrate."
          : 'Mandare il documento a Invoicetronic in PROVA? Non arriva allo SdI.'}">
        <button class="${ambiente === 'reale' ? 'primario' : ''}">${ambiente === 'reale' ? (d.stato === 'scartato' ? 'Rimanda allo SdI' : 'Invia allo SdI') : 'Prova l\'invio'}</button></form>` : ''}
      ${aperti ? html`<form method="post" action="/amministrazione/documenti/${d.id}/aggiorna-sdi" class="inline"><button>Aggiorna esito</button></form>` : ''}
      ${d.stato === 'scartato' ? html`<form method="post" action="/amministrazione/documenti/${d.id}/correggi" class="inline"
        data-conferma="Riaprire il documento per correggerlo? Tiene lo stesso numero e la stessa data; poi Emetti e Rimanda allo SdI.">
        <button>Correggi</button></form>` : ''}
    </div></section>`;
}

/** Conti già usati per incassi e pagamenti (Bper, Carta di Credito…), da proporre quando si segna una rata. */
async function contiUsati(): Promise<string[]> {
  const righe = await q<{ conto: string }>(`SELECT conto FROM (SELECT conto FROM documenti_scadenze UNION ALL SELECT conto FROM documenti_ricevuti_scadenze) x
    WHERE coalesce(conto, '') <> '' GROUP BY conto ORDER BY count(*) DESC`);
  return righe.map(r => r.conto);
}

/** Rate di un documento con "Segna incassata/pagata" (data e conto) o "annulla". */
function elencoScadenze(scadenze: any[], sezione: keyof typeof SCADENZE, conti: string[]): Raw {
  if (!scadenze.length) return html``;
  const parola = sezione === 'documenti' ? 'incassata' : 'pagata';
  return html`<h2>Scadenze</h2><datalist id="conti">${conti.map(c => html`<option value="${c}">`)}</datalist>
    <ul class="scadenze">${scadenze.map(s => html`<li>${data(s.data)}: <strong>${euro(Number(s.importo))}</strong> ${s.pagata_il
      ? html`<span class="stato doc-consegnato">${parola} il ${data(s.pagata_il)}${s.modo || s.conto ? ` (${[s.modo, s.conto].filter(Boolean).join(' · ')})` : ''}</span>
        <form method="post" action="/amministrazione/${sezione}/scadenze/${s.id}" class="inline" data-conferma="Segnare la rata come non ${parola}?">
          <input type="hidden" name="annulla" value="1"><button class="link">annulla</button></form>`
      : html`<span class="stato doc-bozza">da ${sezione === 'documenti' ? 'incassare' : 'pagare'}</span>
        <form method="post" action="/amministrazione/${sezione}/scadenze/${s.id}" class="inline">
          <input type="date" name="pagata_il" value="${oggiRoma()}" required>
          <select name="modo" required title="Come è stata ${parola}"><option value="">Modo di pagamento…</option>${MODI_PAGAMENTO.map(m => html`<option>${m}</option>`)}</select>
          <input name="conto" list="conti" placeholder="Banca (es. Bper)" title="Facoltativo: banca o conto usato" class="corto">
          <button>Segna ${parola}</button></form>`}</li>`)}</ul>`;
}

const ETICHETTE_TRASPORTO: Record<string, string> = { causale: 'Causale', a_cura: 'Trasporto a cura del', trasportatore: 'Vettore', porto: 'Porto',
  colli: 'Colli', peso: 'Peso', aspetto: 'Aspetto dei beni', destinazione: 'Destinazione', inizio: 'Inizio trasporto' };

/** Bozza di DDT: trasporto, righe (il prezzo serve solo alla fattura, non si stampa), controlli, Emetti. */
async function moduloDdt(d: any, righe: any[]): Promise<Raw> {
  const t = d.dati_trasporto ?? {};
  const { errori, avvisi } = await controllaDdt(d.id);
  const cliente = d.cliente_id ? await q1(`SELECT indirizzo, cap, comune, provincia, nazione FROM clienti WHERE id = $1`, [d.cliente_id]) : null;
  const sede = cliente ? indirizzoSu(cliente) : '';
  const scelta = (nome: string, valori: readonly string[], attuale: string | undefined, vuota = true) => html`<select name="${nome}">
    ${vuota ? html`<option value=""></option>` : ''}${[...new Set([...valori, ...(attuale ? [attuale] : [])])].map(v =>
      html`<option ${v === attuale ? raw('selected') : ''}>${v}</option>`)}</select>`;
  const vuote = Array.from({ length: RIGHE_VUOTE }, () => ({}) as any);
  // codice solo dall'anagrafica del cliente (Adriano 31/10/2026)
  const prodotti = d.cliente_id ? await prodottiPerCliente(d.cliente_id) as ProdottoScelta[] : [];
  const rigaModulo = (x: any, i: number) => html`<tr class="${x.solo_descrizione ? 'riga-testo' : ''}">
    <td>${cellaCodice(x, i, prodotti)}<input type="hidden" name="righe[${i}][riga_ordine_id]" value="${x.riga_ordine_id ?? ''}"></td>
    <td>${cellaDescrizione(x, i, prodotti, 'maiuscolo')}${x.riga_ordine_id ? html`<span class="nota">dall'ordine</span>` : ''}</td>
    <td><input name="righe[${i}][quantita]" value="${x.quantita ?? ''}" class="corto" inputmode="decimal"></td>
    <td><input name="righe[${i}][um]" value="${x.um ?? ''}" class="cortissimo maiuscolo"></td>
    <td><input name="righe[${i}][prezzo]" value="${x.prezzo ?? ''}" class="corto" inputmode="decimal"></td>
    <td class="centro"><input type="checkbox" name="righe[${i}][solo_descrizione]" ${x.solo_descrizione ? raw('checked') : ''} title="Riga di solo testo"></td>
  </tr>`;
  return html`<form method="post" action="/amministrazione/documenti/${d.id}" class="blocco" id="modulo-documento">
      <div class="riga-campi">
        <label class="stretto">Data <input type="date" name="data" value="${d.data}" required></label>
        <label>Causale del trasporto <input name="causale_trasporto" value="${t.causale ?? ''}" list="causali-ddt" class="maiuscolo" required></label>
        <datalist id="causali-ddt">${CAUSALI_DDT.map(c => html`<option value="${c}">`)}</datalist>
        <label>Rif. ordine del cliente <input name="riferimento_esterno" value="${d.riferimento_esterno ?? ''}" class="maiuscolo"></label>
      </div>
      <div class="riga-campi">
        <label>Trasporto a cura del ${scelta('a_cura', TRASPORTO_A_CURA, t.a_cura)}</label>
        <label>Vettore (corriere) <input name="trasportatore" value="${t.trasportatore ?? ''}" class="maiuscolo" placeholder="es. BRT"></label>
        <label>Porto ${scelta('porto', PORTI, t.porto)}</label>
        <label class="stretto">Colli <input name="colli" value="${t.colli ?? ''}" class="corto maiuscolo" placeholder="es. 1"></label>
        <label class="stretto">Peso <input name="peso" value="${t.peso ?? ''}" class="corto maiuscolo" placeholder="es. 2 KG"></label>
      </div>
      <div class="riga-campi">
        <label>Aspetto dei beni <input name="aspetto" value="${t.aspetto ?? ''}" class="maiuscolo" placeholder="es. SCATOLA"></label>
        <label>Inizio trasporto <input type="datetime-local" name="inizio" value="${t.inizio ?? ''}"></label>
      </div>
      <label>Luogo di destinazione (vuoto = sede del cliente${sede ? `: ${sede.replace(/\n/g, ', ')}` : ''})
        <textarea name="destinazione" rows="3" class="maiuscolo">${t.destinazione ?? ''}</textarea></label>
      <label>Note interne (non vanno sul DDT) <input name="note" value="${d.note ?? ''}"></label>
      <div class="tabella-scorre"><table class="editor" id="righe-documento">
        <thead><tr><th>Codice</th><th>Descrizione</th><th>Q.tà</th><th>U.m.</th><th title="Non si stampa sul DDT: serve quando si fattura">Prezzo € (per la fattura)</th><th title="Solo testo">Testo</th></tr></thead>
        <tbody>${[...righe, ...vuote].map(rigaModulo)}</tbody>
      </table></div>
      ${riquadriSceltaProdotto(d.cliente_id)}
      <div class="barra-azioni"><button type="button" id="aggiungi-riga">+ Riga</button>
        <span class="nota">Il prezzo non si stampa sul DDT: passa nella fattura quando si fattura il DDT.</span>
        <button class="primario">Salva</button></div>
    </form>
    <div class="blocco">
      ${errori.length ? html`<p><strong>Da sistemare prima di emettere:</strong></p><ul class="controlli errori">${errori.map(e => html`<li>${e}</li>`)}</ul>`
        : html`<p class="nota">Controlli superati: si può emettere.</p>`}
      ${avvisi.length ? html`<ul class="controlli">${avvisi.map(e => html`<li>${e}</li>`)}</ul>` : ''}
      <div class="azioni-secondarie">
        <form method="post" action="/amministrazione/documenti/${d.id}/emetti" class="inline"
          data-conferma="Emettere il DDT? Prende il numero successivo e non si potrà più modificare (se la merce non parte si annulla).">
          <button class="primario" ${errori.length ? raw('disabled') : ''}>Emetti</button></form>
        <a class="bottone" href="/amministrazione/documenti/${d.id}/stampa" target="_blank" rel="noopener" title="Anteprima con la scritta BOZZA (salva prima le modifiche)">Anteprima di stampa</a>
        <form method="post" action="/amministrazione/documenti/${d.id}/elimina" class="inline" data-conferma="Eliminare questa bozza?">
          <button class="pericolo">Elimina bozza</button></form>
      </div>
    </div>`;
}

export function rotteAmministrazione() {
  const r = Router();
  const pagina = (req: Request, titolo: string, contenuto: Raw, avviso?: string, script?: string) =>
    String(layout({ titolo, utente: req.session.utente, attiva: 'amministrazione', contenuto, avviso, script, largo: true }));
  const msg = (req: Request) => (req.query.msg ? String(req.query.msg) : undefined);

  r.get('/', async (req, res) => {
    res.send(pagina(req, 'Amministrazione', html`<div class="intestazione-pagina"><h1>Amministrazione</h1></div>
      ${menuAmministrazione('cruscotto')}${await contenutoCruscotto()}`, msg(req)));
  });

  r.use('/fatture-estere', rotteAutofatture());
  r.use('/registri', rotteRegistriIva());
  r.use('/vies', rotteVies());

  r.get('/documenti', async (req, res) => {
    const tipo = String(req.query.tipo ?? 'fattura');
    const anno = Number(req.query.anno) || new Date().getFullYear();
    const cerca = String(req.query.q ?? '').trim();
    const righe = await q(`SELECT d.id, d.tipo, d.numero, d.sezionale, d.data, d.stato, d.origine, d.imponibile, d.totale, d.fattura_id,
        coalesce(c.ragione_sociale, fa.ragione_sociale, d.intestatario->>'ragione_sociale', d.intestatario->>'nome') AS intestatario
      FROM documenti d LEFT JOIN clienti c ON c.id = d.cliente_id LEFT JOIN fornitori_anagrafica fa ON fa.id = d.fornitore_id
      WHERE d.tipo = $1 AND (d.anno = $2 OR d.stato = 'bozza')
        AND ($3 = '' OR coalesce(c.ragione_sociale, fa.ragione_sociale, d.intestatario->>'ragione_sociale', '') ILIKE '%' || $3 || '%' OR d.numero::text = $3)
      ORDER BY d.numero IS NOT NULL, d.data DESC, d.numero DESC NULLS FIRST`, [tipo, anno, cerca]);
    const anni = (await q<{ anno: number }>(`SELECT DISTINCT anno FROM documenti ORDER BY anno DESC`)).map(a => a.anno);
    if (!anni.includes(anno)) anni.unshift(anno);
    const totale = righe.filter(d => d.stato !== 'bozza' && d.stato !== 'annullato').reduce((s, d) => s + Number(d.imponibile), 0);
    res.send(pagina(req, NOMI[tipo]?.tanti ?? 'Documenti', html`
      <div class="intestazione-pagina"><h1>Amministrazione</h1>
        <div class="azioni">
          ${tipo === 'ddt' ? html`<a href="/amministrazione/documenti/nuovo?tipo=ddt" class="bottone primario">+ Nuovo DDT</a>`
            : html`<a href="/amministrazione/documenti/nuovo?tipo=fattura" class="bottone primario">+ Nuova fattura</a>`}
        </div></div>
      ${menuAmministrazione('documenti')}
      <nav class="tasti-sezione">${Object.entries(NOMI).map(([k, v]) =>
        html`<a href="/amministrazione/documenti?tipo=${k}&anno=${anno}" class="${k === tipo ? 'attivo' : ''}">${v.tanti}</a>`)}</nav>
      <form class="cerca" method="get">
        <input type="hidden" name="tipo" value="${tipo}">
        <select name="anno">${anni.map(a => html`<option ${a === anno ? raw('selected') : ''}>${a}</option>`)}</select>
        <input name="q" value="${cerca}" placeholder="Cliente o numero">
        <button>Cerca</button>
      </form>
      ${tipo === 'autofattura' ? await riquadroFattureEstere() : ''}
      <p class="nota">${righe.length} documenti${tipo !== 'ddt' ? html` · imponibile ${euro(totale)}` : ''}. I documenti di Fatture in Cloud sono marcati FIC.</p>
      ${righe.length ? html`<div class="tabella-scorre"><table class="elenco">
        <thead><tr><th>Numero</th><th>Data</th><th>Intestatario</th><th class="num">Imponibile</th><th class="num">Totale</th><th>Stato</th></tr></thead>
        <tbody>${righe.map(d => html`<tr>
          <td><a href="/amministrazione/documenti/${d.id}"><strong>${d.numero == null ? 'bozza' : numeroCompleto(d.numero, d.sezionale)}</strong></a>
            ${d.origine === 'fic' ? html` <span class="etichetta">FIC</span>` : ''}</td>
          <td>${data(d.data)}</td><td>${d.intestatario ?? ''}</td>
          <td class="num">${tipo === 'ddt' ? '' : euro(Number(d.imponibile))}</td><td class="num">${tipo === 'ddt' ? '' : euro(Number(d.totale))}</td>
          <td><span class="stato doc-${d.stato}">${STATI[d.stato] ?? d.stato}</span>
            ${tipo === 'ddt' && !['bozza', 'annullato'].includes(d.stato) ? (d.fattura_id ? html` <a href="/amministrazione/documenti/${d.fattura_id}" class="nota">fatturato</a>` : html` <span class="nota">da fatturare</span>`) : ''}</td>
        </tr>`)}</tbody></table></div>` : html`<p class="vuoto">Nessun documento.</p>`}`, msg(req), tipo === 'autofattura' ? 'acquisizioni.js' : undefined));
  });

  r.get('/documenti/nuovo', async (req, res) => {
    const tipo = (TIPI_EMISSIBILI as readonly string[]).includes(String(req.query.tipo)) ? String(req.query.tipo) : 'fattura';
    const clienti = await q(`SELECT id, ragione_sociale FROM clienti ORDER BY ragione_sociale`);
    res.send(pagina(req, nuovoNome(tipo), html`
      <p><a href="/amministrazione/documenti?tipo=${tipo}">← ${NOMI[tipo].tanti}</a></p>
      <h1>${nuovoNome(tipo)}</h1>
      ${tipo === 'ddt' ? html`<p class="nota">Per spedire le schede di un ordine usa "Crea DDT" dalla pagina dell'ordine: righe, quantità da spedire e riferimento si compilano da soli.</p>` : ''}
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

  // DDT dalle righe ancora da spedire di un ordine (pulsante "Crea DDT" nella pagina dell'ordine)
  r.post('/documenti/ddt-da-ordine/:ordine', async (req, res) => {
    try {
      const id = await creaDdtDaOrdine(Number(req.params.ordine), req.session.utente?.id ?? null);
      res.redirect(`/amministrazione/documenti/${id}?msg=${encodeURIComponent('DDT preparato con le schede ancora da spedire: controlla quantità e trasporto, poi Emetti.')}`);
    } catch (e: any) {
      res.redirect(`/ordini/${Number(req.params.ordine)}?msg=${encodeURIComponent(e.message)}`);
    }
  });

  // fattura d'acconto (TD02) su un ordine (pulsante "Fattura d'acconto" nella pagina dell'ordine)
  r.post('/documenti/acconto-da-ordine/:ordine', async (req, res) => {
    try {
      const id = await creaAccontoDaOrdine(Number(req.params.ordine), req.session.utente?.id ?? null);
      res.redirect(`/amministrazione/documenti/${id}?msg=${encodeURIComponent('Fattura d\'acconto preparata: scrivi l\'importo dell\'acconto (imponibile) e controlla il pagamento, poi Emetti. Sulla fattura di saldo lo scali con "Scala gli acconti".')}`);
    } catch (e: any) {
      res.redirect(`/ordini/${Number(req.params.ordine)}?msg=${encodeURIComponent(e.message)}`);
    }
  });

  r.get('/documenti/:id/stampa', async (req, res) => {
    const id = Number(req.params.id);
    const d = await q1(`SELECT d.*, c.ragione_sociale AS c_ragione_sociale, c.partita_iva AS c_partita_iva, c.indirizzo AS c_indirizzo, c.cap AS c_cap,
        c.comune AS c_comune, c.provincia AS c_provincia, c.nazione AS c_nazione
      FROM documenti d LEFT JOIN clienti c ON c.id = d.cliente_id WHERE d.id = $1 AND d.tipo IN ('ddt', 'fattura', 'nota_credito')`, [id]);
    if (!d) return res.status(404).send('Stampa disponibile per DDT, fatture e note di credito');
    const righe = await q(`SELECT * FROM documenti_righe WHERE documento_id = $1 ORDER BY posizione`, [id]);
    const azienda = (await q1(`SELECT valore FROM impostazioni WHERE chiave = 'azienda'`))?.valore ?? {};
    if (d.tipo !== 'ddt') {
      // copia di cortesia: cliente come all'emissione (fotografia), in bozza i dati attuali; totali dalle righe con l'IVA predefinita del cliente
      const attuale = d.cliente_id ? await q1(`SELECT * FROM clienti WHERE id = $1`, [d.cliente_id]) : null;
      const cliente = d.intestatario && d.numero != null ? d.intestatario : attuale ?? {};
      const conIva = righe.map(r => ({ ...r, aliquota_iva: r.solo_descrizione ? null : r.aliquota_iva || attuale?.aliquota_iva || 'IVA22' }));
      const totali = calcolaTotali(conIva, await caricaAliquote());
      const scadenze = await q(`SELECT * FROM documenti_scadenze WHERE documento_id = $1 ORDER BY data`, [id]);
      const pagamento = d.condizione_pagamento ? await q1(`SELECT * FROM condizioni_pagamento WHERE codice = $1`, [d.condizione_pagamento]) : null;
      const intento = totali.riepilogo.some(g => g.natura === 'N3.5') ? await q1(d.dichiarazione_intento_id
        ? `SELECT * FROM dichiarazioni_intento WHERE id = $1` : `SELECT * FROM dichiarazioni_intento WHERE cliente_id = $1 ORDER BY data_protocollo DESC LIMIT 1`,
        [d.dichiarazione_intento_id ?? d.cliente_id]) : null;
      const conSplit = { ...cliente, split_payment: cliente.split_payment ?? attuale?.split_payment ?? false };
      return res.send(String(stampaFattura(d, conIva, azienda, conSplit, totali, scadenze, intento, pagamento)));
    }
    // destinatario: la fotografia fatta all'emissione; in bozza i dati attuali dell'anagrafica
    const dest = d.intestatario && d.numero != null ? d.intestatario : Object.fromEntries(Object.entries(d).filter(([k]) => k.startsWith('c_')).map(([k, v]) => [k.slice(2), v]));
    res.send(String(stampaDdt(d, righe, azienda, dest)));
  });

  r.post('/documenti/:id/annulla', async (req, res) => {
    const id = Number(req.params.id);
    const errore = await annullaDdt(id);
    res.redirect(`/amministrazione/documenti/${id}?msg=${encodeURIComponent(errore ?? 'DDT annullato: il numero resta usato e il DDT resta nell\'elenco come annullato.')}`);
  });

  // fattura (bozza) con le righe di questo DDT: poi si possono aggiungere altri DDT dello stesso cliente
  r.post('/documenti/:id/fattura', async (req, res) => {
    const id = Number(req.params.id);
    const d = await q1(`SELECT cliente_id, stato, fattura_id FROM documenti WHERE id = $1 AND tipo = 'ddt'`, [id]);
    if (!d?.cliente_id || d.fattura_id || !['emesso'].includes(d.stato)) return res.redirect(`/amministrazione/documenti/${id}?msg=${encodeURIComponent('Si fattura solo un DDT emesso e non ancora fatturato.')}`);
    const fattura = await creaBozza('fattura', d.cliente_id, req.session.utente?.id ?? null);
    await aggiungiDdt(fattura, [id]);
    res.redirect(`/amministrazione/documenti/${fattura}?msg=${encodeURIComponent('Fattura preparata con le righe del DDT: controlla prezzi e pagamento (in fondo puoi aggiungere altri DDT del cliente), poi Emetti.')}`);
  });

  r.get('/documenti/:id', async (req, res) => {
    const id = Number(req.params.id);
    const d = await q1(`SELECT d.*, coalesce(c.ragione_sociale, fa.ragione_sociale) AS ragione_sociale, o.numero AS origine_numero, o.sezionale AS origine_sezionale,
        o.data AS origine_data, f.numero AS fattura_numero, f.data AS fattura_data, ri.numero AS ricevuto_numero, ri.data AS ricevuto_data
      FROM documenti d LEFT JOIN clienti c ON c.id = d.cliente_id LEFT JOIN fornitori_anagrafica fa ON fa.id = d.fornitore_id
      LEFT JOIN documenti o ON o.id = d.documento_origine_id LEFT JOIN documenti f ON f.id = d.fattura_id
      LEFT JOIN documenti_ricevuti ri ON ri.id = d.ricevuto_id WHERE d.id = $1`, [id]);
    if (!d) return res.status(404).send('Documento non trovato');
    const righe = await q(`SELECT r.*, t.numero AS ddt_numero, t.data AS ddt_data FROM documenti_righe r LEFT JOIN documenti t ON t.id = r.ddt_id
      WHERE r.documento_id = $1 ORDER BY r.posizione`, [id]);
    const nome = nomeTipoSdi(d.tipo, d.tipo_sdi) ?? NOMI[d.tipo]?.uno ?? d.tipo;
    const titolo = `${nome} ${d.numero == null ? '(bozza)' : `n. ${numeroCompleto(d.numero, d.sezionale)}`}`;
    const intestatario = d.ragione_sociale ?? d.intestatario?.ragione_sociale ?? d.intestatario?.nome ?? '';
    const testa = html`<p><a href="/amministrazione/documenti?tipo=${d.tipo}&anno=${d.anno}">← ${NOMI[d.tipo]?.tanti ?? 'Documenti'}</a></p>
      <div class="intestazione-pagina"><h1>${titolo}</h1><div class="azioni"><span class="stato doc-${d.stato}">${STATI[d.stato] ?? d.stato}</span>
        ${d.origine === 'fic' ? html`<span class="etichetta">da Fatture in Cloud</span>` : ''}</div></div>
      <p><strong>${intestatario}</strong> · ${data(d.data)}
        ${d.origine_numero ? html` · ${d.tipo_sdi === 'TD05' ? 'aumenta' : 'storna'} la fattura <a href="/amministrazione/documenti/${d.documento_origine_id}">n. ${numeroCompleto(d.origine_numero, d.origine_sezionale)} del ${data(d.origine_data)}</a>` : ''}
        ${d.ricevuto_id ? html` · ${TIPI_AUTOFATTURA[d.tipo_sdi] ?? d.tipo_sdi} sulla <a href="/amministrazione/ricevuti/${d.ricevuto_id}">fattura del fornitore n. ${d.ricevuto_numero} del ${data(d.ricevuto_data)}</a>` : ''}
        ${d.tipo === 'ddt' && !['bozza', 'annullato'].includes(d.stato) ? (d.fattura_id ? html` · fatturato con la <a href="/amministrazione/documenti/${d.fattura_id}">fattura n. ${d.fattura_numero} del ${data(d.fattura_data)}</a>` : ' · da fatturare') : ''}</p>`;

    if (d.stato !== 'bozza') {
      const scadenze = await q(`SELECT * FROM documenti_scadenze WHERE documento_id = $1 ORDER BY data`, [id]);
      const trasporto = d.dati_trasporto ?? {};
      return res.send(pagina(req, titolo, html`${testa}
        ${d.causale ? html`<p class="nota">${d.causale}</p>` : ''}
        ${d.tipo === 'ddt' && Object.keys(trasporto).length ? html`<p class="nota">${Object.entries(ETICHETTE_TRASPORTO).filter(([k]) => trasporto[k])
          .map(([k, v]) => `${v}: ${k === 'inizio' ? `${data(trasporto[k].slice(0, 10))} ore ${trasporto[k].slice(11, 16)}` : trasporto[k]}`).join(' · ')}</p>` : ''}
        ${d.tipo === 'ddt' && d.riferimento_esterno ? html`<p class="nota">${d.riferimento_esterno}</p>` : ''}
        <div class="tabella-scorre"><table class="elenco">
          <thead><tr><th>Codice</th><th>Descrizione</th><th class="num">Q.tà</th><th>U.m.</th><th class="num">Prezzo</th><th class="num">Sconto</th><th class="num">Importo</th><th>IVA</th></tr></thead>
          <tbody>${righe.map(x => x.solo_descrizione ? html`<tr><td></td><td colspan="7"><em>${x.descrizione}</em></td></tr>` : html`<tr>
            <td>${x.codice ?? ''}</td><td>${x.descrizione}</td><td class="num">${num(x.quantita, 0)}</td><td>${x.um ?? ''}</td>
            <td class="num">${euro(x.prezzo)}</td><td class="num">${x.sconto ? `${num(x.sconto)} %` : ''}</td>
            <td class="num">${euro(Math.round(x.quantita * x.prezzo * (1 - x.sconto / 100) * 100) / 100)}</td><td>${x.aliquota_iva ?? ''}</td></tr>`)}</tbody>
        </table></div>
        ${d.tipo !== 'ddt' ? html`<p class="totali-documento">Imponibile ${euro(d.imponibile)} · IVA ${euro(d.imposta)}${d.bollo ? html` · bollo ${euro(d.bollo)}` : ''} · <strong>Totale ${euro(d.totale)}</strong></p>` : ''}
        ${d.sdi_messaggio && ['scartato', 'non_consegnato'].includes(d.stato) ? html`<p class="avviso">${d.sdi_messaggio}</p>` : ''}
        ${await riquadroSdi(d)}
        ${elencoScadenze(scadenze, 'documenti', await contiUsati())}
        <div class="azioni-secondarie">
          ${d.xml ? html`<a class="bottone" href="/amministrazione/documenti/${id}/xml">Scarica XML</a>` : ''}
          ${['ddt', 'fattura', 'nota_credito'].includes(d.tipo) && d.origine === 'portale' ? html`<a class="bottone ${d.tipo === 'ddt' ? 'primario' : ''}" href="/amministrazione/documenti/${id}/stampa" target="_blank" rel="noopener"
            title="${d.tipo === 'ddt' ? '' : 'Copia di cortesia per il cliente (il documento fiscale è l\'XML)'}">${d.tipo === 'ddt' ? 'Stampa / PDF' : 'PDF di cortesia'}</a>` : ''}
          ${d.tipo === 'ddt' && d.origine === 'portale' && d.stato === 'emesso' && !d.fattura_id ? html`
            <form method="post" action="/amministrazione/documenti/${id}/fattura" class="inline"><button>Fattura questo DDT</button></form>
            <form method="post" action="/amministrazione/documenti/${id}/annulla" class="inline"
              data-conferma="Annullare il DDT n. ${d.numero}? Usalo solo se la merce non è partita: il numero resta usato e il DDT resta nell'elenco come annullato.">
              <button class="pericolo">Annulla DDT</button></form>` : ''}
          ${d.tipo === 'fattura' && d.cliente_id ? html`<form method="post" action="/amministrazione/documenti/${id}/nota-credito" class="inline"
            data-conferma="Creare una nota di credito (bozza) che storna questa fattura?"><button>Crea nota di credito</button></form>
            ${d.tipo_sdi !== 'TD05' ? html`<form method="post" action="/amministrazione/documenti/${id}/nota-debito" class="inline"
            data-conferma="Creare una nota di debito (bozza) che aumenta l'importo di questa fattura?"><button title="Per aggiungere importi a questa fattura (costi dimenticati, adeguamenti)">Crea nota di debito</button></form>` : ''}` : ''}
        </div>`, msg(req)));
    }

    if (d.tipo === 'ddt') return res.send(pagina(req, titolo, html`${testa}${await moduloDdt(d, righe)}`, msg(req), 'documenti.js'));

    // bozza: modulo modificabile
    const [aliquote, condizioni, ddt, { esito, erroriExtra }, acconti, cliente] = await Promise.all([
      caricaAliquote(true), caricaCondizioniPagamento(true), d.cliente_id ? ddtDaFatturare(d.cliente_id, id) : Promise.resolve([]), anteprimaDocumento(id),
      d.cliente_id && d.tipo === 'fattura' && !['TD02', 'TD05'].includes(d.tipo_sdi) ? accontiDaScalare(d.cliente_id) : Promise.resolve([]),
      d.cliente_id ? q1(`SELECT pubblica_amministrazione, split_payment, codice_sdi FROM clienti WHERE id = $1`, [d.cliente_id]) : Promise.resolve(null)]);
    const dateDdt = righe.filter(x => x.ddt_id).map(x => x.ddt_data ? String(x.ddt_data) : '').filter(Boolean);
    const termine = esito.tipoSdi === 'TD24' ? termineDifferita(dateDdt) : null;
    const errori = [...esito.errori, ...erroriExtra];
    const t = esito.totali;
    const vuote = Array.from({ length: RIGHE_VUOTE }, () => ({}) as any);
    // fattura e note al cliente: codice solo dall'anagrafica del cliente (Adriano 31/10/2026); autofattura: righe del fornitore estero, libere
    const conAnagrafica = d.tipo !== 'autofattura' && !!d.cliente_id;
    const prodotti = conAnagrafica ? await prodottiPerCliente(d.cliente_id) as ProdottoScelta[] : [];
    const rigaModulo = (x: any, i: number) => html`<tr class="${x.solo_descrizione ? 'riga-testo' : ''}">
      <td>${conAnagrafica ? cellaCodice(x, i, prodotti) : html`<input name="righe[${i}][codice]" value="${x.codice ?? ''}" class="corto maiuscolo">
        <input type="hidden" name="righe[${i}][prodotto_id]" value="${x.prodotto_id ?? ''}">`}<input type="hidden" name="righe[${i}][ddt_id]" value="${x.ddt_id ?? ''}">
        <input type="hidden" name="righe[${i}][riga_ordine_id]" value="${x.riga_ordine_id ?? ''}">
        <input type="hidden" name="righe[${i}][acconto_id]" value="${x.acconto_id ?? ''}"></td>
      <td>${conAnagrafica ? cellaDescrizione(x, i, prodotti) : html`<input name="righe[${i}][descrizione]" value="${x.descrizione ?? ''}">`}${x.ddt_numero && !x.solo_descrizione ? html`<span class="nota">dal DDT n. ${x.ddt_numero}</span>` : ''}</td>
      <td><input name="righe[${i}][quantita]" value="${x.quantita ?? ''}" class="corto" inputmode="decimal"></td>
      <td><input name="righe[${i}][um]" value="${x.um ?? ''}" class="cortissimo"></td>
      <td><input name="righe[${i}][prezzo]" value="${x.prezzo ?? ''}" class="corto" inputmode="decimal"></td>
      <td><input name="righe[${i}][sconto]" value="${x.sconto || ''}" class="cortissimo" inputmode="decimal"></td>
      <td><select name="righe[${i}][aliquota_iva]"><option value="">predefinita</option>${aliquote.map(a =>
        html`<option value="${a.codice}" ${x.aliquota_iva === a.codice ? raw('selected') : ''}>${a.descrizione}</option>`)}</select></td>
      <td class="centro"><input type="checkbox" name="righe[${i}][solo_descrizione]" ${x.solo_descrizione ? raw('checked') : ''} title="Riga di solo testo, senza importo"></td>
    </tr>`;
    // cliente di un altro paese UE: ultimo controllo VIES (serve per fatturare non imponibile art. 41 / 7-ter)
    const clienteUe = d.tipo !== 'autofattura' && d.cliente_id ? await q1(`SELECT partita_iva, nazione FROM clienti WHERE id = $1`, [d.cliente_id]) : null;
    res.send(pagina(req, titolo, html`${testa}
      ${clienteUe ? await riquadroVies(clienteUe.partita_iva, clienteUe.nazione, `/amministrazione/documenti/${id}`) : ''}
      <form method="post" action="/amministrazione/documenti/${id}" class="blocco" id="modulo-documento">
        <div class="riga-campi">
          <label class="stretto">Data <input type="date" name="data" value="${d.data}" required ${d.numero != null ? raw('readonly title="Scartato dallo SdI: si rimanda con la stessa data"') : ''}></label>
          ${d.tipo === 'autofattura' ? html`<label>Fattura del fornitore <input name="riferimento_esterno" value="${d.riferimento_esterno ?? ''}"></label>`
          : html`<label>Pagamento <select name="condizione_pagamento"><option value="">Scegli…</option>${condizioni.map(c =>
            html`<option value="${c.codice}" ${d.condizione_pagamento === c.codice ? raw('selected') : ''}>${c.descrizione}</option>`)}</select></label>
          <label>Rif. ordine del cliente <input name="riferimento_esterno" value="${d.riferimento_esterno ?? ''}" maxlength="20" title="Numero dell'ordine (al massimo 20 caratteri)"></label>
          <label class="stretto">Data dell'ordine <input type="date" name="data_ordine" value="${d.data_ordine ? String(d.data_ordine).slice(0, 10) : ''}"></label>
          <label class="stretto">CIG <input name="cig" value="${d.cig ?? ''}" maxlength="10" class="maiuscolo" title="Codice identificativo gara: 10 caratteri, sull'ordine della pubblica amministrazione"></label>
          <label class="stretto">CUP <input name="cup" value="${d.cup ?? ''}" maxlength="15" class="maiuscolo" title="Codice unico di progetto: 15 caratteri, solo se l'ordine lo indica"></label>`}
        </div>
        ${d.tipo === 'fattura' ? html`<div class="riga-campi"><label>Tipo di fattura <select name="tipo_sdi">${TIPI_SCEGLIBILI.map(k =>
          html`<option value="${k}" ${(d.tipo_sdi === 'TD24' ? 'TD01' : d.tipo_sdi) === k ? raw('selected') : ''} ${k === 'TD05' && !d.documento_origine_id ? raw('disabled') : ''}>${TIPI_SDI_FATTURA[k].nome}</option>`)}</select></label>
          <span class="nota">${esito.tipoSdi ? `Si emette come ${esito.tipoSdi} (${TIPI_SDI_FATTURA[esito.tipoSdi]?.nome ?? ''}): ${TIPI_SDI_FATTURA[esito.tipoSdi]?.spiegazione ?? ''}` : ''}
            ${termine ? ` Da emettere entro il ${data(termine)}.` : ''} La nota di debito si crea dalla fattura emessa ("Crea nota di debito").</span></div>` : ''}
        ${cliente?.pubblica_amministrazione ? html`<p class="nota">Cliente pubblica amministrazione: fattura FPA12 al codice ufficio ${cliente.codice_sdi || '(manca: va in Anagrafiche → Clienti → Dati fiscali)'};
          servono numero dell'ordine e CIG${cliente.split_payment ? '. Split payment: il cliente paga solo imponibile e bollo, l\'IVA la versa lui.' : '.'}</p>`
          : cliente?.split_payment ? html`<p class="nota">Split payment: il cliente paga solo imponibile e bollo, l'IVA la versa lui.</p>` : ''}
        <label>Causale (stampata sulla fattura) <input name="causale" value="${d.causale ?? ''}"></label>
        <label>Note interne (non vanno in fattura) <input name="note" value="${d.note ?? ''}"></label>
        <div class="tabella-scorre"><table class="editor" id="righe-documento">
          <thead><tr><th>Codice</th><th>Descrizione</th><th>Q.tà</th><th>U.m.</th><th>Prezzo €</th><th>Sconto %</th><th>IVA</th><th title="Solo testo">Testo</th></tr></thead>
          <tbody>${[...righe, ...vuote].map(rigaModulo)}</tbody>
        </table></div>
        ${conAnagrafica ? riquadriSceltaProdotto(d.cliente_id) : ''}
        <div class="barra-azioni"><button type="button" id="aggiungi-riga">+ Riga</button>
          <span class="nota">${d.tipo === 'autofattura' ? 'Autofattura: IVA italiana (di solito 22 %) sulle righe della fattura estera, in euro.'
            : 'IVA "predefinita" = quella del cliente (lettera d\'intento, estero…) o 22 %.'}</span>
          <button class="primario">Salva</button></div>
      </form>
      ${ddt.length ? html`<form method="post" action="/amministrazione/documenti/${id}/ddt" class="blocco">
        <h2>DDT da fatturare di questo cliente</h2>
        ${ddt.map(x => html`<label class="riga-spunta"><input type="checkbox" name="ddt" value="${x.id}"> DDT n. ${x.numero} del ${data(x.data)}
          <span class="nota">${x.righe} righe${x.causale ? ` · ${x.causale}` : ''}</span></label>`)}
        <button>Aggiungi i DDT scelti</button> <span class="nota">Salva prima le modifiche alle righe: i DDT si aggiungono in fondo.</span>
      </form>` : ''}
      ${acconti.length ? html`<form method="post" action="/amministrazione/documenti/${id}/acconti" class="blocco">
        <h2>Fatture d'acconto da scalare</h2>
        ${acconti.map(x => html`<label class="riga-spunta"><input type="checkbox" name="acconto" value="${x.id}"> Acconto n. ${numeroCompleto(x.numero, x.sezionale)} del ${data(x.data)}
          <span class="nota">imponibile ${euro(x.imponibile)} · totale ${euro(x.totale)}</span></label>`)}
        <button>Scala gli acconti scelti</button> <span class="nota">Aggiunge in fondo una riga negativa per ogni acconto (salva prima le modifiche alle righe).</span>
      </form>` : ''}
      <div class="blocco">
        <p class="totali-documento">Imponibile ${euro(t.imponibile)} · IVA ${euro(t.imposta)}${t.bollo ? html` · bollo ${euro(t.bollo)}` : ''} · <strong>Totale ${euro(t.totale)}</strong>
          ${esito.daIncassare != null && Math.abs(esito.daIncassare - t.totale) > 0.005 ? html` · da incassare ${euro(esito.daIncassare)} (split payment)` : ''}</p>
        ${errori.length ? html`<p><strong>Da sistemare prima di emettere:</strong></p><ul class="controlli errori">${errori.map(e => html`<li>${e}</li>`)}</ul>`
          : html`<p class="nota">Controlli della fattura elettronica superati: si può emettere.</p>`}
        <div class="azioni-secondarie">
          <form method="post" action="/amministrazione/documenti/${id}/emetti" class="inline"
            data-conferma="Emettere il documento? Prende il numero successivo e non si potrà più modificare (si corregge con una nota di credito).">
            <button class="primario" ${errori.length ? raw('disabled') : ''}>Emetti</button></form>
          ${d.tipo !== 'autofattura' ? html`<a class="bottone" href="/amministrazione/documenti/${id}/stampa" target="_blank" rel="noopener" title="Anteprima con la scritta BOZZA (salva prima le modifiche)">Anteprima di stampa</a>` : ''}
          ${errori.length ? '' : html`<a class="bottone" href="/amministrazione/documenti/${id}/xml-prova" title="Stesso file che si emetterebbe, con numero 0: non consuma la numerazione">Scarica XML di prova</a>`}
          ${d.numero == null ? html`<form method="post" action="/amministrazione/documenti/${id}/elimina" class="inline" data-conferma="Eliminare questa bozza?">
            <button class="pericolo">Elimina bozza</button></form>` : ''}
        </div>
      </div>
      ${ambienteAttuale() === 'prova' || d.numero != null ? await riquadroSdi(d, !errori.length) : ''}`, msg(req), 'documenti.js'));
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
      ? `Non emesso: ${esito.errori.join(' ')}` : (await q1(`SELECT tipo FROM documenti WHERE id = $1`, [id]))?.tipo === 'ddt'
        ? `DDT emesso con il n. ${esito.numero}. Stampalo con "Stampa / PDF" (due copie: una viaggia con la merce).`
        : `Emesso con il n. ${esito.numero}. Ora mandalo allo SdI con "Invia allo SdI".`)}`);
  });

  r.post('/documenti/:id/invia', async (req, res) => {
    const id = Number(req.params.id);
    let testo: string;
    try { testo = (await inviaDocumento(id, req.session.utente?.id ?? null)).messaggio; } catch (e: any) { testo = `Non inviato: ${e.message}`; }
    res.redirect(`/amministrazione/documenti/${id}?msg=${encodeURIComponent(testo)}`);
  });

  r.post('/ricevuti/scarica', async (req, res) => {
    let testo: string;
    try {
      const esiti = await scaricaRicevute();
      testo = esiti.length ? `${esiti.length} file dallo SdI: ${esiti.join(' · ')}` : 'Nessuna fattura nuova dallo SdI.';
    } catch (e: any) { testo = e.message; }
    res.redirect(`/amministrazione/ricevuti?msg=${encodeURIComponent(testo.slice(0, 1500))}`);
  });

  r.post('/documenti/:id/correggi', async (req, res) => {
    const id = Number(req.params.id);
    const ok = await riapriScartato(id);
    res.redirect(`/amministrazione/documenti/${id}?msg=${encodeURIComponent(ok
      ? 'Documento riaperto con lo stesso numero e la stessa data: correggi (anche i dati del cliente in anagrafica), poi Emetti e Rimanda allo SdI.'
      : 'Si riaprono solo i documenti scartati dallo SdI.')}`);
  });

  r.post('/documenti/:id/aggiorna-sdi', async (req, res) => {
    const id = Number(req.params.id);
    let testo: string;
    try { const n = await aggiornaEsitiDocumento(id); testo = n ? 'Esito aggiornato.' : 'Nessun esito nuovo dallo SdI.'; } catch (e: any) { testo = e.message; }
    res.redirect(`/amministrazione/documenti/${id}?msg=${encodeURIComponent(testo)}`);
  });

  r.post('/documenti/:id/elimina', async (req, res) => {
    const tipo = (await q1(`SELECT tipo FROM documenti WHERE id = $1`, [Number(req.params.id)]))?.tipo ?? 'fattura';
    const ok = await eliminaBozza(Number(req.params.id));
    res.redirect(ok ? `/amministrazione/documenti?tipo=${tipo}&msg=` + encodeURIComponent('Bozza eliminata.')
      : `/amministrazione/documenti/${req.params.id}?msg=${encodeURIComponent('Solo le bozze si eliminano: un documento emesso si storna con una nota di credito.')}`);
  });

  r.post('/documenti/:id/acconti', async (req, res) => {
    const id = Number(req.params.id);
    const scelti = [req.body.acconto ?? []].flat().map(Number).filter(Boolean);
    let testo: string;
    try { const n = scelti.length ? await scalaAcconti(id, scelti) : 0; testo = n ? (n === 1 ? 'Acconto scalato.' : `Scalati ${n} acconti.`) : 'Nessun acconto scelto.'; } catch (e: any) { testo = e.message; }
    res.redirect(`/amministrazione/documenti/${id}?msg=${encodeURIComponent(testo)}`);
  });

  r.post('/documenti/:id/nota-debito', async (req, res) => {
    try {
      const id = await creaNotaDebito(Number(req.params.id), req.session.utente?.id ?? null);
      res.redirect(`/amministrazione/documenti/${id}?msg=${encodeURIComponent('Nota di debito creata come bozza: scrivi le righe con gli importi in più, poi Emetti.')}`);
    } catch (e: any) {
      res.redirect(`/amministrazione/documenti/${req.params.id}?msg=${encodeURIComponent(e.message)}`);
    }
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
    const daPagare = req.query.da_pagare === '1';
    // "da pagare": tutte quelle con rate aperte, di qualsiasi anno
    const righe = await q(`SELECT * FROM (SELECT d.*, f.ragione_sociale,
        (SELECT coalesce(sum(importo), 0) FROM documenti_ricevuti_scadenze s WHERE s.documento_id = d.id AND s.pagata_il IS NULL)::float AS da_pagare,
        (SELECT min(data) FROM documenti_ricevuti_scadenze s WHERE s.documento_id = d.id AND s.pagata_il IS NULL) AS prossima
      FROM documenti_ricevuti d LEFT JOIN fornitori_anagrafica f ON f.id = d.fornitore_id) d
      WHERE ($3 OR extract(year FROM d.data) = $1) AND (NOT $3 OR d.da_pagare <> 0)
        AND ($2 = '' OR coalesce(d.ragione_sociale, d.intestatario->>'nome', '') ILIKE '%' || $2 || '%' OR d.numero ILIKE $2)
      ORDER BY ${daPagare ? 'd.prossima, d.id' : 'd.data DESC, d.id DESC'}`, [anno, cerca, daPagare]);
    const anni = (await q<{ anno: number }>(`SELECT DISTINCT extract(year FROM data)::int AS anno FROM documenti_ricevuti ORDER BY 1 DESC`)).map(a => a.anno);
    if (!anni.includes(anno)) anni.unshift(anno);
    const segno = (d: any) => (d.tipo === 'nota_credito' ? -1 : 1);
    const totale = righe.reduce((s, d) => s + segno(d) * Number(d.imponibile), 0);
    const totaleDaPagare = righe.reduce((s, d) => s + segno(d) * d.da_pagare, 0);
    const oggi = oggiRoma();
    // riquadro "Scadute da pagare" (Adriano 31/10/2026): sempre tutte, di qualsiasi anno, qualunque sia il filtro
    const rate = await q<RataDaPagare>(`SELECT s.documento_id, coalesce(f.ragione_sociale, d.intestatario->>'nome', '') AS nome,
        coalesce(d.numero, '') AS numero, d.tipo, s.data::text AS scadenza, s.importo::float AS importo
      FROM documenti_ricevuti_scadenze s JOIN documenti_ricevuti d ON d.id = s.documento_id
      LEFT JOIN fornitori_anagrafica f ON f.id = d.fornitore_id
      WHERE s.pagata_il IS NULL AND s.data < $1::date`, [oggi]);
    const scadute = fattureScadute(rate, oggi);
    const filtrato = cerca !== '' || daPagare;
    res.send(pagina(req, 'Fatture fornitori', html`
      <div class="intestazione-pagina"><h1>Amministrazione</h1></div>
      ${menuAmministrazione('ricevuti')}
      <div class="barra-filtro">
        <form class="filtro-elenco" method="get">
          <label>Anno<select name="anno" ${daPagare ? raw('disabled title="Con «Solo da pagare» si vedono tutti gli anni"') : ''}>${anni.map(a => html`<option ${a === anno ? raw('selected') : ''}>${a}</option>`)}</select></label>
          <label class="largo">Cerca<input type="search" name="q" value="${cerca}" placeholder="Nome del fornitore o numero della fattura"></label>
          <label class="spunta"><input type="checkbox" name="da_pagare" value="1" ${daPagare ? raw('checked') : ''}> Solo da pagare <small>(tutti gli anni)</small></label>
          <button class="primario">Filtra</button>
          ${filtrato ? html`<a href="/amministrazione/ricevuti?anno=${anno}">Togli il filtro</a>` : ''}
        </form>
        <div class="collegamenti">
          <a href="/amministrazione/ricevuti/mesi?anno=${anno}">Acquisti per fornitore e mese →</a>
          ${ambienteAttuale() ? html`<form method="post" action="/amministrazione/ricevuti/scarica" class="inline"><button title="Se una fattura che aspetti non è ancora arrivata">Scarica dallo SdI</button></form>` : ''}
        </div>
      </div>
      <section class="riquadro-scadute ${scadute.fatture.length ? '' : 'tutto-ok'}">
        ${scadute.fatture.length ? html`
          <h2>Scadute da pagare <span>${scadute.fatture.length === 1 ? '1 fattura' : `${scadute.fatture.length} fatture`} · ${euro(scadute.totale)}</span></h2>
          <div class="tabella-scorre corta"><table class="elenco">
            <thead><tr><th>Scaduta il</th><th class="num">Giorni</th><th>Fornitore</th><th>Numero</th><th class="num">Da pagare</th></tr></thead>
            <tbody>${scadute.fatture.map(f => html`<tr><td>${data(f.scadenza)}</td><td class="num">${f.giorni}</td><td>${f.nome}</td>
              <td><a href="/amministrazione/ricevuti/${f.documento_id}">${f.numero || 'senza n.'}</a>${f.rate > 1 ? html` <span class="nota">(${f.rate} rate)</span>` : ''}</td>
              <td class="num">${euro(f.importo)}</td></tr>`)}</tbody></table></div>
          <p class="nota">Solo le rate già scadute e non segnate pagate, di tutti gli anni. Aprendo la fattura si segna pagata con data e conto.</p>`
          : html`<h2>Scadute da pagare</h2><p class="nota">Nessuna fattura fornitore scaduta da pagare.</p>`}
      </section>
      <p class="nota">${righe.length} documenti${daPagare ? html` · da pagare ${euro(totaleDaPagare)}` : html` · imponibile ${euro(totale)}`}.
        Le fatture elettroniche arrivano da sole dallo SdI (Invoicetronic); lo storico viene da Fatture in Cloud.</p>
      <div class="tabella-scorre limitata"><table class="elenco">
        <thead><tr><th>Data</th><th>Fornitore</th><th>Numero</th><th>Descrizione</th><th class="num">Imponibile</th><th class="num">Totale</th><th class="num">Da pagare</th><th>Scadenza</th></tr></thead>
        <tbody>${righe.map(d => html`<tr class="${d.prossima && d.prossima < oggi ? 'scaduta' : ''}">
          <td>${data(d.data)}</td><td>${d.ragione_sociale ?? d.intestatario?.nome ?? ''}</td>
          <td><a href="/amministrazione/ricevuti/${d.id}">${d.tipo === 'nota_credito' ? html`<span class="etichetta">NC</span> ` : ''}${d.numero || 'senza n.'}</a></td>
          <td><span class="nota taglia">${d.descrizione ?? ''}</span></td>
          <td class="num">${euro(Number(d.imponibile))}</td><td class="num">${euro(Number(d.totale))}</td>
          <td class="num">${d.da_pagare ? euro(d.da_pagare) : ''}</td><td>${d.prossima ? data(d.prossima) : ''}</td></tr>`)}</tbody></table></div>`, msg(req)));
  });

  // Acquisti per fornitore e mese (Adriano 31/10/2026): cosa si è comprato in un mese, al posto degli ordini "di traccia" di FIC
  r.get('/ricevuti/mesi', async (req, res) => {
    const anno = Number(req.query.anno) || Number(oggiRoma().slice(0, 4));
    const mese = Math.min(12, Math.max(0, Number(req.query.mese) || 0));
    const fornitore = String(req.query.fornitore ?? '');
    const docs = await q(`SELECT d.id, d.fornitore_id, d.tipo, d.numero, d.data, d.imponibile, d.totale, d.descrizione,
        coalesce(f.ragione_sociale, d.intestatario->>'nome', d.intestatario->>'ragione_sociale', '') AS nome
      FROM documenti_ricevuti d LEFT JOIN fornitori_anagrafica f ON f.id = d.fornitore_id
      WHERE extract(year FROM d.data)::int = $1 ORDER BY d.data, d.id`, [anno]);
    const { righe, mesi, totale } = acquistiPerFornitore(docs);
    const anni = (await q<{ anno: number }>(`SELECT DISTINCT extract(year FROM data)::int AS anno FROM documenti_ricevuti ORDER BY 1 DESC`)).map(a => a.anno);
    if (!anni.includes(anno)) anni.unshift(anno);
    const chiave = (d: any) => (d.fornitore_id ? `f${d.fornitore_id}` : `n${(d.nome || '?').toUpperCase()}`);
    const dettaglio = mese ? docs.filter(d => Number(d.data.slice(5, 7)) === mese && (!fornitore || chiave(d) === fornitore)) : [];
    // cosa c'era dentro: righe dell'autofattura (fornitori esteri) e ordini a fornitore collegati
    const ids = dettaglio.map(d => d.id);
    const collegati = ids.length ? await q(`SELECT d.ricevuto_id, d.id, d.tipo, d.numero, d.sezionale,
        (SELECT string_agg(r.descrizione, ' · ' ORDER BY r.posizione) FROM documenti_righe r WHERE r.documento_id = d.id AND NOT r.solo_descrizione) AS righe
      FROM documenti d WHERE d.ricevuto_id = ANY($1) AND d.tipo IN ('autofattura', 'ordine_fornitore')`, [ids]) : [];
    const perRicevuto = new Map<number, any[]>();
    for (const c of collegati) perRicevuto.set(c.ricevuto_id, [...(perRicevuto.get(c.ricevuto_id) ?? []), c]);
    const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
    const NOMI_MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
    const link = (m: number, f = '') => `/amministrazione/ricevuti/mesi?anno=${anno}&mese=${m}${f ? `&fornitore=${encodeURIComponent(f)}` : ''}#dettaglio`;
    const nomeFornitore = fornitore ? righe.find(r => r.chiave === fornitore)?.nome : null;
    res.send(pagina(req, `Acquisti per mese ${anno}`, html`
      <div class="intestazione-pagina"><h1>Acquisti per fornitore e mese · ${anno}</h1></div>
      ${menuAmministrazione('ricevuti')}
      <form class="cerca" method="get">
        <select name="anno">${anni.map(a => html`<option ${a === anno ? raw('selected') : ''}>${a}</option>`)}</select>
        <button>Mostra</button> <a href="/amministrazione/ricevuti?anno=${anno}">Elenco delle fatture fornitori →</a>
      </form>
      <p class="nota">Imponibile delle fatture dei fornitori (note di credito in negativo). Clicca un importo per vedere cosa c'era in quelle fatture.</p>
      ${righe.length ? html`<div class="tabella-scorre limitata"><table class="elenco compatta">
        <thead><tr><th>Fornitore</th>${MESI.map((m, i) => html`<th class="num"><a href="${link(i + 1)}">${m}</a></th>`)}<th class="num">Totale</th></tr></thead>
        <tbody>${righe.map(r => html`<tr><td>${r.fornitoreId ? html`<a href="/anagrafiche/fornitori/${r.fornitoreId}">${r.nome}</a>` : r.nome}</td>
            ${r.mesi.map((v, i) => html`<td class="num">${v ? html`<a href="${link(i + 1, r.chiave)}">${euro(v)}</a>` : ''}</td>`)}
            <td class="num"><strong>${euro(r.totale)}</strong></td></tr>`)}
          <tr class="totale-riga"><td><strong>Totale</strong></td>${mesi.map((v, i) => html`<td class="num"><a href="${link(i + 1)}"><strong>${v ? euro(v) : ''}</strong></a></td>`)}
            <td class="num"><strong>${euro(totale)}</strong></td></tr>
        </tbody></table></div>` : html`<p class="vuoto">Nessuna fattura fornitore nel ${anno}.</p>`}
      ${mese ? html`<h2 id="dettaglio">${NOMI_MESI[mese - 1]} ${anno}${nomeFornitore ? html` · ${nomeFornitore}` : ''} · ${dettaglio.length} documenti
          ${fornitore ? html` <a class="nota" href="${link(mese)}">tutti i fornitori del mese</a>` : ''}</h2>
        ${dettaglio.length ? html`<div class="tabella-scorre"><table class="elenco">
          <thead><tr><th>Data</th><th>Fornitore</th><th>Numero</th><th>Cosa</th><th class="num">Imponibile</th></tr></thead>
          <tbody>${dettaglio.map(d => html`<tr><td>${data(d.data)}</td><td>${d.nome}</td>
            <td><a href="/amministrazione/ricevuti/${d.id}">${d.tipo === 'nota_credito' ? html`<span class="etichetta">NC</span> ` : ''}${d.numero || 'senza n.'}</a></td>
            <td>${d.descrizione ?? ''}${(perRicevuto.get(d.id) ?? []).map((c, i) => html`${d.descrizione || i ? html`<br>` : ''}<span class="nota">${c.tipo === 'autofattura' ? 'autofattura' : 'ordine'}
              <a href="${c.tipo === 'autofattura' ? `/amministrazione/documenti/${c.id}` : `/ordini/fornitori/${c.id}`}">${c.numero == null ? 'bozza' : numeroCompleto(c.numero, c.sezionale)}</a>${c.righe ? `: ${c.righe}` : ''}</span>`)}</td>
            <td class="num">${euro((d.tipo === 'nota_credito' ? -1 : 1) * Number(d.imponibile))}</td></tr>`)}</tbody></table></div>`
          : html`<p class="vuoto">Nessun documento.</p>`}` : ''}`, msg(req)));
  });

  r.get('/ricevuti/:id', async (req, res) => {
    const id = Number(req.params.id);
    const d = await q1(`SELECT d.*, f.ragione_sociale, f.id AS anagrafica_id FROM documenti_ricevuti d
      LEFT JOIN fornitori_anagrafica f ON f.id = d.fornitore_id WHERE d.id = $1`, [id]);
    if (!d) return res.status(404).send('Documento non trovato');
    const scadenze = await q(`SELECT * FROM documenti_ricevuti_scadenze WHERE documento_id = $1 ORDER BY data`, [id]);
    const it = d.intestatario ?? {};
    const titolo = `${d.tipo === 'nota_credito' ? 'Nota di credito' : 'Fattura'} ${d.numero ? `n. ${d.numero}` : ''} di ${d.ragione_sociale ?? it.nome ?? ''}`;
    res.send(pagina(req, titolo, html`<p><a href="/amministrazione/ricevuti?anno=${d.data.slice(0, 4)}">← Fatture fornitori</a></p>
      <div class="intestazione-pagina"><h1>${titolo}</h1><div class="azioni">
        ${d.origine === 'fic' ? html`<span class="etichetta">da Fatture in Cloud</span>` : ''}${d.elettronica ? '' : html` <span class="etichetta">non elettronica</span>`}</div></div>
      <dl class="dati-ordine">
        <dt>Data</dt><dd>${data(d.data)}</dd>
        <dt>Fornitore</dt><dd>${d.anagrafica_id ? html`<a href="/anagrafiche/fornitori/${d.anagrafica_id}">${d.ragione_sociale}</a>`
          : html`${it.nome ?? ''} <span class="nota">(non in anagrafica)</span>`}</dd>
        ${it.partita_iva || it.codice_fiscale ? html`<dt>P.IVA / C.F.</dt><dd>${[...new Set([/^(IT|ITALIA)$/i.test(it.paese ?? '') ? '' : it.paese, it.partita_iva, it.codice_fiscale])].filter(Boolean).join(' · ')}</dd>` : ''}
        ${it.indirizzo ? html`<dt>Indirizzo</dt><dd>${[it.indirizzo, it.cap, it.comune, it.provincia].filter(Boolean).join(' ')}</dd>` : ''}
        ${d.descrizione ? html`<dt>Descrizione</dt><dd>${d.descrizione}</dd>` : ''}
        ${d.categoria ? html`<dt>Categoria</dt><dd>${d.categoria}</dd>` : ''}
      </dl>
      <p class="totali-documento">Imponibile ${euro(Number(d.imponibile))}${Number(d.cassa) ? html` (di cui cassa previdenziale ${euro(Number(d.cassa))})` : ''}
        · IVA ${euro(Number(d.imposta))} · <strong>Totale ${euro(Number(d.totale))}</strong>
        ${Number(d.ritenuta) ? html` · ritenuta d'acconto ${euro(Number(d.ritenuta))} · <strong>netto da pagare ${euro(Number(d.netto_a_pagare ?? Number(d.totale) - Number(d.ritenuta)))}</strong>` : ''}</p>
      ${Number(d.ritenuta) ? html`<p class="avviso">${(() => {
        const pagate = scadenze.filter((s: any) => s.pagata_il).map((s: any) => String(s.pagata_il).slice(0, 10)).sort();
        const tutte = scadenze.length > 0 && pagate.length === scadenze.length;
        return `Ritenuta d'acconto di ${euro(Number(d.ritenuta))}${d.tipo_ritenuta ? ` (${d.tipo_ritenuta}${d.causale_ritenuta ? `, causale ${d.causale_ritenuta}` : ''})` : ''}: `
          + `al fornitore si paga il netto, la ritenuta la versa Casteltech con F24 (codice tributo 1040 per i professionisti) `
          + (tutte ? `entro il ${data(scadenzaF24(pagate[pagate.length - 1]))}.` : 'entro il 16 del mese dopo il pagamento.');
      })()}</p>` : ''}
      ${elencoScadenze(scadenze, 'ricevuti', await contiUsati())}
      ${d.xml ? html`<p><a class="bottone" href="/amministrazione/ricevuti/${id}/xml">Scarica XML</a></p>` : ''}`, msg(req)));
  });

  r.get('/ricevuti/:id/xml', async (req, res) => {
    const d = await q1(`SELECT xml, id FROM documenti_ricevuti WHERE id = $1 AND xml IS NOT NULL`, [Number(req.params.id)]);
    if (!d) return res.status(404).send('XML non disponibile');
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="fattura_fornitore_${d.id}.xml"`);
    res.send(d.xml);
  });

  // rata incassata / pagata (data e conto) o annullata; poi si torna al documento
  for (const sezione of Object.keys(SCADENZE) as (keyof typeof SCADENZE)[]) r.post(`/${sezione}/scadenze/:id`, async (req, res) => {
    const annulla = req.body.annulla === '1';
    const giorno = String(req.body.pagata_il ?? '');
    if (!annulla && !/^\d{4}-\d{2}-\d{2}$/.test(giorno)) return res.redirect(req.get('referer') ?? '/amministrazione');
    const s = await q1<{ documento_id: number }>(`UPDATE ${SCADENZE[sezione]} SET pagata_il = $2, conto = $3, modo = $4 WHERE id = $1 RETURNING documento_id`,
      [Number(req.params.id), annulla ? null : giorno, annulla ? null : String(req.body.conto ?? '').trim() || null, annulla ? null : modoPagamento(req.body.modo)]);
    const parola = sezione === 'documenti' ? 'incassata' : 'pagata';
    res.redirect(s ? `/amministrazione/${sezione}/${s.documento_id}?msg=${encodeURIComponent(annulla ? `Rata segnata come non ${parola}.` : `Rata segnata come ${parola}.`)}`
      : '/amministrazione');
  });

  return r;
}
