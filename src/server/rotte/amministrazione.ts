/**
 * Amministrazione (menu in alto): documenti emessi (fatture, note di credito, autofatture, DDT; anche lo storico di FIC)
 * e documenti ricevuti. Fatture e note di credito si scrivono qui: bozza → Emetti (numero, scadenze, XML FatturaPA).
 * Invio allo SdI con Invoicetronic (invoicetronic.ts): "Invia allo SdI" sui documenti emessi; con la chiave di prova
 * "Prova l'invio" anche dalle bozze. Gli esiti arrivano dal webhook o con "Aggiorna esito".
 */
import { sedeDelCliente, testoSede } from '../../engine/sede-operativa.js';
import { sceltaUm } from '../views/scelta-um.js';
import { prodottiPerCliente } from '../anagrafiche-servizio.js';
import { serviziAttivi } from '../servizi-una-tantum-servizio.js';
import { cellaCodice, cellaCodiceDdt, cellaDescrizione, cellaDescrizioneDdt, cellaTipoDdt, riquadriSceltaProdotto, type ProdottoScelta } from '../views/scelta-prodotto.js';
import { Router, type Request } from 'express';
import { q, q1 } from '../db.js';
import { layout, tastiAcquisti } from '../views/layout.js';
import { analisiPermessa } from '../../engine/ruoli.js';
import { differitePerCliente } from '../../engine/fatture-differite.js';
import { gruppiSolleciti, inviaSollecito, propostaSollecito, registraSollecito } from '../solleciti-servizio.js';
import { NOMI_LIVELLO, giorniRitardo } from '../../engine/solleciti.js';
import { NOMI_FASCE_SCADUTO, riepilogoCrediti, ritornoSicuro, type FasciaScaduto, type RataCredito } from '../../engine/crediti.js';
import { eAutosalvataggio, rispondiSalvataggio } from '../autosalva.js';
import { paginata } from '../views/paginazione.js';
import { excelSemplice, inviaExcel, nomeExcel } from '../excel.js';
import { html, data, euro, euroUnitario, num, raw, type Raw, numCampo } from '../views/html.js';
import { modoPagamento, numeroCompleto } from '../../engine/amministrazione.js';
import { caricaModiPagamento } from '../modi-pagamento-servizio.js';
import type { ModiPagamento } from '../../engine/modi-pagamento.js';
import { contenutoCruscotto, menuAmministrazione } from './cruscotto-amministrazione.js';
import { SQL_DATA_DA_INCASSARE, SQL_IMPORTO_DA_INCASSARE, acquistiPerFornitore, fattureScadute, type RataDaPagare } from '../../engine/cruscotto-amministrazione.js';
import { riquadroVies, rotteRegistriIva, rotteVies } from './registri-iva.js';
import { rotteAnalisi } from './analisi.js';
import { riquadroPlafond, rotteFiscale } from './fiscale.js';
import { riquadroFattureEstere, rotteAutofatture } from './autofatture.js';
import { TIPI_AUTOFATTURA } from '../../engine/autofatture.js';
import { caricaAliquote, caricaCondizioniPagamento } from '../amministrazione-servizio.js';
import { TIPI_SDI, aggiornaEsitiDocumento, ambienteAttuale, inviaDocumento, scaricaRicevute } from '../invoicetronic.js';
import { NOMI_STATI_SDI } from '../../engine/sdi.js';
import {
  TIPI_EMISSIBILI, accontiDaScalare, aggiungiDdt, aggiungiRigheOrdine, righeOrdineDaFatturare, annullaDdt, bloccoDdt, anteprimaDocumento, controllaDdt, creaAccontoDaOrdine, creaBozza, creaDdtDaOrdine, creaDdtDaCommessa,
  creaNotaCredito, creaNotaDebito, ddtDaFatturare, ddtDaFatturareTutti, fatturaTuttiIDdt, eliminaBozza, emettiDocumento, riapriScartato, salvaBozza, scalaAcconti, type TipoEmissibile,
} from '../documenti-servizio.js';
import { TIPI_SCEGLIBILI, TIPI_SDI_FATTURA, nomeTipoSdi, scadenzaF24, termineDifferita } from '../../engine/tipi-fattura.js';
import { controlloStorno } from '../../engine/analisi.js';
import { CAUSALI_DDT, PORTI, TRASPORTO_A_CURA, indirizzoSu } from '../../engine/ddt.js';
import { stampaDdt, stampaFattura } from '../views/stampa-documento.js';
import { attributiEmesso, campoEsigibilita, riquadroAttributi } from '../views/attributi-fattura.js';
import { inviaDdtEmail, pdfDelDdt, propostaEmailDdt } from '../ddt-email-servizio.js';
import { datiStampaFattura, inviaFatturaEmail, pdfDellaFattura, propostaEmailFattura } from '../fattura-email-servizio.js';
import { TIPI_CORTESIA, nomeDocumento } from '../../engine/fattura-email.js';
import { calcolaTotali } from '../../engine/amministrazione.js';
import { avvisiRighe, riepilogoAvvisi, type RiferimentoPreventivo } from '../../engine/avviso-margine.js';
import { marginePreventivo } from '../../engine/analisi.js';
import { elencoControlli, riepilogoControlli } from '../../engine/controlli.js';
import { datiControlli, riferimentiPreventivi } from '../controlli-servizio.js';
import { casella, casellaTutti, conMessaggio, idsSpuntati, moduloAzioni } from '../views/azioni-elenco.js';
import { riquadroInvio, segnoInvioElenco } from '../views/invio.js';
import { segnaDocumentoInviato } from '../invii-servizio.js';
import { INVIATO_TITOLO, SQL_SDI_INVIATO_IL } from '../../engine/invii.js';
import { SCHEDE_DOCUMENTI, controlloDdtStessoCliente, type TipoDocumentoElenco, dividiPerAzione, frasiEscluse, motivoEscluso, pulsantiDocumenti, type AzioneDocumenti } from '../../engine/azioni-documenti.js';
import { compensaNoteCredito, documentiSpuntati, duplicaFattura, eliminaBozze, excelDocumenti, rateAperte, rimettiDaFatturare, scriviXml, segnaGiaFatturati, segnaIncassate } from '../azioni-documenti-servizio.js';

// schede nell'ordine scelto da Adriano (1/11/2026): DDT, Fatture, Autofatture, Note di credito
const NOMI: Record<string, { uno: string; tanti: string }> = Object.fromEntries(SCHEDE_DOCUMENTI.map(s => [s.tipo, { uno: s.uno, tanti: s.tanti }]));
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

/** Rate di un documento con "Segna incassata/pagata" (data e conto) o "annulla". */
function elencoScadenze(scadenze: any[], sezione: keyof typeof SCADENZE, { modi, strumenti: conti }: ModiPagamento): Raw {
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
          <select name="modo" required title="Come è stata ${parola}"><option value="">Modo di pagamento…</option>${modi.map(m => html`<option>${m}</option>`)}</select>
          <input name="conto" list="conti" placeholder="Banca (es. Bper)" title="Facoltativo: banca o conto usato" class="corto">
          <button>Segna ${parola}</button></form>`}</li>`)}</ul>`;
}

const ETICHETTE_TRASPORTO: Record<string, string> = { causale: 'Causale', a_cura: 'Trasporto a cura del', trasportatore: 'Vettore', porto: 'Porto',
  colli: 'Colli', peso: 'Peso', aspetto: 'Aspetto dei beni', destinazione: 'Destinazione', inizio: 'Inizio trasporto' };

/** Bozza di DDT: trasporto, righe (il prezzo serve solo alla fattura, non si stampa), controlli, Emetti. */
async function moduloDdt(d: any, righe: any[]): Promise<Raw> {
  // DDT già emesso che si corregge (Adriano 2/11/2026): stesso numero e stessa data, niente Emetti/Elimina
  const emesso = d.stato !== 'bozza';
  const t = d.dati_trasporto ?? {};
  const { errori, avvisi } = await controllaDdt(d.id);
  const cliente = d.cliente_id ? await q1(`SELECT * FROM clienti WHERE id = $1`, [d.cliente_id]) : null;
  const sede = cliente ? indirizzoSu(cliente) : '';
  const operativa = sedeDelCliente(cliente);
  const scelta = (nome: string, valori: readonly string[], attuale: string | undefined, vuota = true) => html`<select name="${nome}">
    ${vuota ? html`<option value=""></option>` : ''}${[...new Set([...valori, ...(attuale ? [attuale] : [])])].map(v =>
      html`<option ${v === attuale ? raw('selected') : ''}>${v}</option>`)}</select>`;
  const vuote = Array.from({ length: RIGHE_VUOTE }, () => ({}) as any);
  // codice solo dall'anagrafica del cliente (Adriano 31/10/2026)
  const prodotti = d.cliente_id ? await prodottiPerCliente(d.cliente_id) as ProdottoScelta[] : [];
  const servizi = await serviziAttivi();     // servizi una tantum (UT-…): per tutti i clienti
  // ogni riga sceglie l'anagrafica: prodotto, componente nostro, componente del cliente o libero (Adriano 2/11/2026)
  const rigaModulo = (x: any, i: number) => html`<tr class="${x.solo_descrizione ? 'riga-testo' : ''}">
    <td class="tipo-riga">${cellaTipoDdt(x, i)}</td>
    <td>${cellaCodiceDdt(x, i, prodotti, servizi)}<input type="hidden" name="righe[${i}][riga_ordine_id]" value="${x.riga_ordine_id ?? ''}"></td>
    <td>${cellaDescrizioneDdt(x, i, prodotti)}${x.riga_ordine_id ? html`<span class="nota">dall'ordine</span>` : ''}</td>
    <td><input name="righe[${i}][quantita]" value="${numCampo(x.quantita)}" class="corto" inputmode="decimal"></td>
    <td>${sceltaUm(`righe[${i}][um]`, x.um, !x.descrizione && !x.codice)}</td>
    <td><input name="righe[${i}][prezzo]" value="${numCampo(x.prezzo)}" class="corto" inputmode="decimal"></td>
    <td class="centro"><input type="checkbox" name="righe[${i}][solo_descrizione]" ${x.solo_descrizione ? raw('checked') : ''} title="Riga di solo testo"></td>
    <td class="centro"><button type="button" class="link negativo togli-riga" title="Togli questa riga (poi Salva)" aria-label="Togli la riga">✕</button></td>
  </tr>`;
  return html`<form method="post" action="/amministrazione/documenti/${d.id}" class="blocco" id="modulo-documento" data-autosalva="${d.stato === 'bozza' ? '1' : ''}">
      <div class="riga-campi">
        <label class="stretto">Data <input type="date" name="data" value="${d.data}" required ${emesso ? raw('readonly title="La data di un DDT emesso non cambia (va con il numero)"') : ''}></label>
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
      <label>Luogo di destinazione (vuoto = sede legale del cliente${sede ? `: ${sede.replace(/\n/g, ', ')}` : ''})
        <textarea name="destinazione" rows="3" class="maiuscolo">${t.destinazione ?? ''}</textarea></label>
      ${operativa ? html`<p class="nota">Sede operativa del cliente (Anagrafiche → Clienti → Dati fiscali): ${testoSede(operativa).replace(/\n/g, ', ')}.
        ${(t.destinazione ?? '').trim() === testoSede(operativa) ? '' : html`<b>Il luogo di destinazione qui sopra è diverso: controllalo.</b>`}</p>` : ''}
      <label>Note interne (non vanno sul DDT) <input name="note" value="${d.note ?? ''}"></label>
      <div class="tabella-scorre"><table class="editor" id="righe-documento" data-cliente="${d.cliente_id ?? ''}">
        <thead><tr><th title="Da quale anagrafica viene il codice (non si stampa)">Tipo</th><th>Codice</th><th>Descrizione</th><th>Q.tà</th><th>U.m.</th><th title="Non si stampa sul DDT: serve quando si fattura">Prezzo € (per la fattura)</th><th title="Solo testo">Testo</th><th></th></tr></thead>
        <tbody>${[...righe, ...vuote].map(rigaModulo)}</tbody>
      </table></div>
      <p class="nota">Tipo (non si stampa): <b>Prodotto</b> = codici del cliente · <b>Componente nostro</b> = archivio Componenti (cerca per P/N, codice gestionale o di produzione) ·
        <b>Componente cliente</b> = materiale in conto lavoro del cliente (Anagrafiche → Componenti clienti) · <b>Libero</b> = codice e descrizione scritti a mano.
        Il codice che non c'è si aggiunge dall'elenco ("+ Nuovo…"); ✕ toglie la riga.</p>
      ${riquadriSceltaProdotto(d.cliente_id)}
      <div class="barra-azioni"><button type="button" id="aggiungi-riga">+ Riga</button>
        <span class="nota">Il prezzo non si stampa sul DDT: passa nella fattura quando si fattura il DDT.</span>
        <button class="primario">Salva</button></div>
    </form>
    ${emesso ? html`<div class="blocco"><p class="nota">Stai correggendo il DDT n. ${numeroCompleto(d.numero, d.sezionale)} già emesso: numero e data restano gli stessi.
        Se il DDT è già in una fattura non ancora mandata allo SdI, la fattura non cambia da sola: correggi anche lei.</p>
      ${avvisi.length ? html`<ul class="controlli">${avvisi.map(e => html`<li>${e}</li>`)}</ul>` : ''}
      <div class="azioni-secondarie"><a class="bottone" href="/amministrazione/documenti/${d.id}">Fine modifiche</a>
        <a class="bottone" href="/amministrazione/documenti/${d.id}/stampa" target="_blank" rel="noopener">Stampa / PDF</a></div></div>` : html`
    <div class="blocco">
      ${errori.length ? html`<p><strong>Da sistemare prima di emettere:</strong></p><ul class="controlli errori">${errori.map(e => html`<li>${e}</li>`)}</ul>`
        : html`<p class="nota">Controlli superati: si può emettere.</p>`}
      ${avvisi.length ? html`<ul class="controlli">${avvisi.map(e => html`<li>${e}</li>`)}</ul>` : ''}
      <div class="azioni-secondarie">
        <form method="post" action="/amministrazione/documenti/${d.id}/emetti" class="inline"
          data-conferma="Emettere il DDT? Prende il numero successivo; si potrà ancora correggere finché non è in una fattura mandata allo SdI (se la merce non parte si annulla).">
          <button class="primario" ${errori.length ? raw('disabled') : ''}>Emetti</button></form>
        <a class="bottone" href="/amministrazione/documenti/${d.id}/stampa" target="_blank" rel="noopener" title="Anteprima con la scritta BOZZA (salva prima le modifiche)">Anteprima di stampa</a>
        <form method="post" action="/amministrazione/documenti/${d.id}/elimina" class="inline" data-conferma="Eliminare questa bozza?">
          <button class="pericolo">Elimina bozza</button></form>
      </div>
    </div>`}`;
}

/** Nota di credito emessa senza fattura collegata: menu con le fatture emesse del cliente (non dopo la nota) per dire quale storna. */
async function riquadroStorno(d: { id: number; cliente_id: number; data: string }) {
  const fatture = await q<{ id: number; numero: number; sezionale: string | null; data: string; totale: number }>(
    `SELECT id, numero, sezionale, data::text AS data, totale::float AS totale FROM documenti
     WHERE tipo = 'fattura' AND cliente_id = $1 AND numero IS NOT NULL AND stato NOT IN ('bozza', 'annullato', 'scartato') AND data <= $2
     ORDER BY data DESC, numero DESC LIMIT 60`, [d.cliente_id, d.data]);
  if (!fatture.length) return '';
  return html`<form method="post" action="/amministrazione/documenti/${d.id}/storna" class="riquadro-storno">
    <label>Storna la fattura <select name="fattura_id" required><option value="">— scegli —</option>
      ${fatture.map(f => html`<option value="${f.id}">n. ${numeroCompleto(f.numero, f.sezionale ?? undefined)} del ${data(f.data)} · ${euro(f.totale)}</option>`)}</select></label>
    <button>Collega</button>
    <span class="nota">Serve all'Analisi: la nota di credito conta nel mese della fattura stornata (es. nota di febbraio su una fattura di dicembre).</span></form>`;
}

export function rotteAmministrazione() {
  const r = Router();
  const pagina = (req: Request, titolo: string, contenuto: Raw, avviso?: string, script?: string | string[]) =>
    // Fatture fornitori e Acquisti per mese accendono il gruppo Acquisti (Adriano 7/11/2026); indirizzi invariati
    String(layout({ titolo, utente: req.session.utente, attiva: req.path.startsWith('/ricevuti') ? 'acquisti' : 'amministrazione', contenuto, avviso, script, largo: true }));
  const msg = (req: Request) => (req.query.msg ? String(req.query.msg) : undefined);

  r.get('/', async (req, res) => {
    res.send(pagina(req, 'Amministrazione', html`<div class="intestazione-pagina"><h1>Amministrazione</h1></div>
      ${menuAmministrazione('cruscotto')}${await contenutoCruscotto()}`, msg(req)));
  });

  r.use('/fatture-estere', rotteAutofatture());
  r.use('/registri', rotteRegistriIva());
  // Analisi riservata (Adriano 6/11/2026): solo amministratore ed esterno; la Previsione di cassa decide da sola (vedePaghe)
  r.use('/analisi', (req, res, next) => {
    if (analisiPermessa(req.session.utente?.ruolo, req.baseUrl + req.path)) return next();
    res.status(403).send(String(layout({ titolo: 'Analisi', utente: req.session.utente, attiva: 'amministrazione', contenuto: html`<h1>Analisi riservata</h1>
      <p>L'Analisi (andamento, prodotti, clienti, fornitori, punto di pareggio) la vedono solo l'amministratore e il profilo esterno.</p>
      <p><a href="/amministrazione">← Amministrazione</a></p>` })));
  }, rotteAnalisi());
  r.use('/', rotteFiscale());
  r.use('/vies', rotteVies());

  // ── Fatture differite (1/11/2026): DDT da fatturare per cliente, "Fattura tutti" = una bozza per cliente (TD24 da sola all'emissione) ──
  // ── Controlli settimanali (proposta della revisione, Adriano 1/11/2026; regole in engine/controlli.ts) ──
  r.get('/controlli', async (req, res) => {
    const oggi = oggiRoma();
    const controlli = elencoControlli(await datiControlli(oggi));
    const r2 = riepilogoControlli(controlli);
    const NOMI: Record<string, string> = { urgente: 'urgente', controllare: 'da controllare', normale: 'quando c\'è tempo' };
    res.send(pagina(req, 'Controlli', html`
      <div class="intestazione-pagina"><h1>Controlli settimanali</h1><div class="azioni"><a class="bottone" href="/amministrazione">Cruscotto</a></div></div>
      <p class="nota">Le cose lasciate a metà che nessun cruscotto mostra insieme: da guardare una volta la settimana (es. il lunedì). Ogni riga porta alla pagina dove si sistema.
        Si calcola quando apri la pagina, niente controlli automatici.</p>
      ${controlli.length ? html`<p class="riepilogo-controlli">${r2.totale} ${r2.totale === 1 ? 'cosa da sistemare' : 'cose da sistemare'}${r2.urgenti ? html`, <b class="negativo">${r2.urgenti} urgenti</b>` : ''}${r2.daControllare ? html`, ${r2.daControllare} da controllare` : ''}.</p>
        ${controlli.map(c => html`<section class="blocco controllo ${c.livello}" id="${c.chiave}">
          <h2>${c.titolo} <span class="etichetta ${c.livello}">${NOMI[c.livello]}</span> <span class="conta">${c.righe.length}</span></h2>
          <p class="nota">${c.spiegazione}</p>
          <ul class="elenco-controllo">${c.righe.map(v => html`<li>${v.link ? html`<a href="${v.link}">${v.testo}</a>` : v.testo}${v.dettaglio ? html` <small>· ${v.dettaglio}</small>` : ''}</li>`)}</ul>
        </section>`)}`
        : html`<p class="avviso info"><b>Tutto a posto.</b> Nessun DDT vecchio da fatturare, nessuna commessa oltre la consegna, ordini con le date, prodotti con il prezzo, clienti con il recapito SdI, fatture fornitori con la scadenza, nessuna bozza di preventivo ferma.</p>`}`));
  });

  // ── Crediti verso clienti (brief D, Adriano 31/10/2026): calcolati solo all'apertura della pagina, conti in engine/crediti.ts ──
  r.get('/crediti', async (req, res) => {
    const oggi = oggiRoma();
    const { modi } = await caricaModiPagamento();
    const righe = await q<any>(`SELECT s.id, d.id AS documento_id, d.tipo, d.numero, d.sezionale, d.anno, d.data::text AS data_fattura,
        (${SQL_DATA_DA_INCASSARE})::text AS scadenza, (${SQL_IMPORTO_DA_INCASSARE})::float AS importo, s.pagata_il::text AS pagata_il, d.cliente_id,
        coalesce(c.ragione_sociale, d.intestatario->>'ragione_sociale', d.intestatario->>'nome', '?') AS cliente
      FROM documenti_scadenze s JOIN documenti d ON d.id = s.documento_id LEFT JOIN clienti c ON c.id = d.cliente_id
      WHERE d.tipo IN ('fattura', 'nota_credito') AND d.stato NOT IN ('bozza', 'annullato', 'scartato')
        AND (s.pagata_il IS NULL OR (d.tipo = 'fattura' AND s.pagata_il >= $1::date - 366))`, [oggi]);
    const rate: RataCredito[] = righe.map(x => ({
      scadenzaId: x.id, documentoId: x.documento_id, numero: `${x.tipo === 'nota_credito' ? 'NC ' : ''}${numeroCompleto(x.numero, x.sezionale)}/${x.anno}`,
      dataFattura: x.data_fattura, scadenza: x.scadenza, importo: Number(x.importo), clienteId: x.cliente_id, cliente: x.cliente, pagataIl: x.pagata_il,
    }));
    const c = riepilogoCrediti(rate, oggi);
    const fasce = Object.keys(NOMI_FASCE_SCADUTO) as FasciaScaduto[];
    const cifra = (v: number) => (Math.abs(v) < 0.005 ? html`<span class="nota">–</span>` : euro(v));
    res.send(pagina(req, 'Crediti verso clienti', html`
      <div class="intestazione-pagina"><h1>Crediti verso clienti</h1><div class="azioni"><a class="bottone" href="/amministrazione/crediti">Aggiorna</a>
        <a class="bottone" href="/amministrazione/solleciti">Solleciti incassi</a></div></div>
      <p class="nota">Rate non incassate delle fatture emesse (anche lo storico di Fatture in Cloud); le note di credito aperte tolgono dal credito.
        Giorni medi di incasso = dalla data della fattura al pagamento, sulle rate pagate negli ultimi 12 mesi. Conti fatti all'apertura della pagina.</p>
      <div class="cifre">
        <div class="cifra"><span>Da incassare</span><b>${euro(c.totale)}</b><small>${c.clienti.length} clienti</small></div>
        <div class="cifra"><span>Scaduto</span><b class="${c.scaduto > 0 ? 'negativo' : ''}">${euro(c.scaduto)}</b></div>
        <div class="cifra"><span>A scadere</span><b>${euro(c.aScadere)}</b></div>
      </div>
      <div class="cifre">${fasce.map(f => html`<div class="cifra"><span>Scaduto ${NOMI_FASCE_SCADUTO[f].toLowerCase()}</span><b class="${c.fasce[f] > 0 && f !== 'f30' ? 'negativo' : ''}">${euro(c.fasce[f])}</b></div>`)}</div>
      <h2>Per cliente</h2>
      ${c.clienti.length ? html`<div class="tabella-scorre"><table class="elenco crediti"><thead><tr><th>Cliente</th><th class="n">Esposizione</th><th class="n">A scadere</th>
        ${fasce.map(f => html`<th class="n">${NOMI_FASCE_SCADUTO[f]}</th>`)}<th class="n">Ritardo max</th><th class="n">Giorni medi di incasso</th><th></th></tr></thead>
        <tbody>${c.clienti.map(k => html`<tr>
          <td>${k.clienteId ? html`<a href="/anagrafiche/clienti/${k.clienteId}">${k.cliente}</a>` : k.cliente}</td>
          <td class="n"><b>${euro(k.esposizione)}</b></td><td class="n">${cifra(k.aScadere)}</td>
          ${fasce.map(f => html`<td class="n ${k.fasce[f] > 0 && f !== 'f30' ? 'negativo' : ''}">${cifra(k.fasce[f])}</td>`)}
          <td class="n">${k.ritardoMax ? `${k.ritardoMax} gg` : ''}</td><td class="n">${k.giorniMediIncasso == null ? html`<span class="nota">–</span>` : `${k.giorniMediIncasso} gg`}</td>
          <td>${k.scaduto > 0 && k.clienteId ? html`<a class="bottone piccolo" href="/amministrazione/solleciti/${k.clienteId}">Sollecito</a>` : ''}</td></tr>`)}</tbody></table></div>`
        : html`<p class="vuoto">Nessun credito aperto.</p>`}
      <h2>Scadenze dei prossimi 14 giorni</h2>
      ${c.prossime.length ? html`<div class="tabella-scorre"><table class="elenco"><thead><tr><th>Scadenza</th><th>Cliente</th><th>Fattura</th><th class="n">Importo</th><th></th></tr></thead>
        <tbody>${c.prossime.map(p => html`<tr><td>${data(p.scadenza)}</td><td>${p.cliente}</td><td><a href="/amministrazione/documenti/${p.documentoId}">${p.numero}</a> del ${data(p.dataFattura)}</td>
          <td class="n"><b>${euro(p.importo)}</b></td>
          <td><form method="post" action="/amministrazione/documenti/scadenze/${p.scadenzaId}" class="inline">
            <input type="hidden" name="torna" value="/amministrazione/crediti">
            <input type="date" name="pagata_il" value="${oggi}" required>
            <select name="modo" required title="Come è stata incassata"><option value="">Modo di pagamento…</option>${modi.map(m => html`<option>${m}</option>`)}</select>
            <button>Segna incassata</button></form></td></tr>`)}</tbody></table></div>`
        : html`<p class="vuoto">Nessuna rata in scadenza nei prossimi 14 giorni.</p>`}
      <p class="nota">Le rate già scadute si segnano incassate dalla fattura o da Amministrazione → Fatture → Segna incassate.</p>`, msg(req)));
  });

  // ── Solleciti incassi (proposta della revisione, Adriano 1/11/2026) ──
  r.get('/solleciti', async (req, res) => {
    const oggi = oggiRoma();
    const gruppi = await gruppiSolleciti(oggi);
    const totale = gruppi.reduce((s, g) => s + g.totale, 0);
    res.send(pagina(req, 'Solleciti incassi', html`
      <div class="intestazione-pagina"><h1>Solleciti incassi · rate scadute per cliente</h1><div class="azioni"><a class="bottone" href="/amministrazione">Cruscotto</a></div></div>
      <p class="nota">Tutte le rate scadute e non incassate delle fatture emesse, un gruppo per cliente. <b>Prepara il sollecito</b> scrive l'email con l'elenco delle fatture, gli importi e l'IBAN:
        la controlli e la mandi (con Gmail quando la delega è attiva, altrimenti con la tua posta). Il tono sale con il ritardo: primo sollecito sotto i 30 giorni, secondo fino a 60, poi ultimo avviso.
        Una rata incassata si segna dalla fattura (o da Amministrazione → Fatture → Segna incassate) e sparisce da qui.</p>
      ${gruppi.length ? html`<p class="nota">${gruppi.length} clienti, ${euro(totale)} scaduti.</p>
      <div class="tabella-scorre"><table class="elenco solleciti"><thead><tr><th>Cliente</th><th class="n">Rate</th><th class="n">Scaduto</th><th class="n">Ritardo max</th><th>Livello</th><th>Email</th><th></th></tr></thead>
        <tbody>${gruppi.map(g => html`<tr class="livello-${g.livello}">
          <td><a href="/anagrafiche/clienti/${g.clienteId}">${g.cliente}</a></td><td class="n">${g.rate.length}</td><td class="n"><b>${euro(g.totale)}</b></td>
          <td class="n">${g.giorniMax} gg</td><td>${NOMI_LIVELLO[g.livello]}</td><td>${g.email ?? html`<span class="nota">manca (Dati fiscali del cliente)</span>`}</td>
          <td><a class="bottone ${g.livello === 'ultimo' ? 'primario' : ''}" href="/amministrazione/solleciti/${g.clienteId}">Prepara il sollecito</a></td></tr>`)}</tbody></table></div>`
        : html`<p class="vuoto">Nessuna rata scaduta: niente da sollecitare.</p>`}`));
  });
  r.get('/solleciti/:cliente', async (req, res, next) => {
    if (!/^\d+$/.test(req.params.cliente)) return next();
    const oggi = oggiRoma();
    const p = await propostaSollecito(Number(req.params.cliente), oggi);
    if (!p) return res.redirect(`/amministrazione/solleciti?msg=${encodeURIComponent('Il cliente non ha rate scadute.')}`);
    const g = p.gruppo;
    res.send(pagina(req, `Sollecito · ${g.cliente}`, html`
      <div class="intestazione-pagina"><h1>Sollecito incassi · ${g.cliente} <small class="nota">${NOMI_LIVELLO[g.livello]}</small></h1>
        <div class="azioni"><a class="bottone" href="/amministrazione/solleciti">Tutti i clienti</a> <a class="bottone" href="/anagrafiche/clienti/${g.clienteId}">Scheda cliente</a></div></div>
      ${p.ultimo ? html`<div class="avviso info">Ultimo sollecito registrato nel CRM il ${data(p.ultimo.data)}: ${p.ultimo.descrizione}</div>` : ''}
      <table class="elenco"><thead><tr><th>Fattura</th><th>Data</th><th>Scadenza</th><th class="n">Ritardo</th><th class="n">Importo</th></tr></thead>
        <tbody>${g.rate.map(r => html`<tr><td><a href="/amministrazione/documenti/${r.documentoId}">n. ${r.numero}</a></td><td>${data(r.dataFattura)}</td><td>${data(r.scadenza)}</td>
          <td class="n">${giorniRitardo(r.scadenza, oggi)} gg</td><td class="n">${euro(r.importo)}</td></tr>`)}</tbody>
        <tfoot><tr><td colspan="4">Totale scaduto</td><td class="n"><b>${euro(g.totale)}</b></td></tr></tfoot></table>
      <form method="post" action="/amministrazione/solleciti/${g.clienteId}/invia" class="blocco" data-conferma="Mandare il sollecito al cliente?">
        <h2>Email al cliente</h2>
        <div class="riga-campi">
          <label class="largo">A <input name="a" value="${p.a}" placeholder="amministrazione@cliente.it (più indirizzi separati da virgola)"></label>
          <label>Cc <input name="cc" value=""></label>
        </div>
        <label>Oggetto <input name="oggetto" value="${p.oggetto}"></label>
        <label>Testo <textarea name="testo" class="testo-sollecito">${p.testo}</textarea></label>
        <div class="barra-azioni">
          <span class="nota">${p.attivo ? html`Parte da ${p.mittente}; il sollecito resta registrato nel CRM del cliente.`
            : html`<b>Invio con Gmail non ancora attivo</b> (manca la delega di Google Workspace per info@): usa <a href="${p.mailto}">Apri nella posta</a> o <button type="button" class="collegamento" data-copia-sollecito>Copia il testo</button>, poi <button formaction="/amministrazione/solleciti/${g.clienteId}/registra" formnovalidate data-conferma="Segnare nel CRM che il sollecito è stato mandato dalla tua posta?">Segna come mandato</button>.`}</span>
          <button class="primario" ${p.attivo ? '' : raw('disabled')}>Invia con Gmail</button>
        </div>
      </form>`, msg(req), 'solleciti.js'));
  });
  r.post('/solleciti/:cliente/invia', async (req, res) => {
    try {
      const a = await inviaSollecito(Number(req.params.cliente), req.body ?? {}, req.session.utente?.id ?? null, oggiRoma());
      res.redirect(`/amministrazione/solleciti?msg=${encodeURIComponent(`Sollecito inviato a ${a}.`)}`);
    } catch (e: any) {
      res.redirect(`/amministrazione/solleciti/${req.params.cliente}?msg=${encodeURIComponent(`Sollecito non inviato: ${e?.message ?? e}`)}`);
    }
  });
  r.post('/solleciti/:cliente/registra', async (req, res) => {
    const oggi = oggiRoma();
    const p = await propostaSollecito(Number(req.params.cliente), oggi);
    if (!p) return res.redirect('/amministrazione/solleciti');
    const fatto = await registraSollecito(p.gruppo.clienteId, p.gruppo, String(req.body?.a ?? p.a ?? 'posta'), req.session.utente?.id ?? null, oggi);
    res.redirect(`/amministrazione/solleciti?msg=${encodeURIComponent(fatto ? `Sollecito a ${p.gruppo.cliente} registrato nel CRM.` : 'Il cliente non è nel CRM: niente da registrare.')}`);
  });

  r.get('/differite', async (req, res) => {
    const oggi = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
    const gruppi = differitePerCliente(await ddtDaFatturareTutti(), oggi);
    const totale = gruppi.reduce((n, g) => n + g.ddt.length, 0);
    const daFareOra = gruppi.filter(g => g.scaduto || g.inScadenza);
    const g = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
    res.send(pagina(req, 'Fatture differite', html`
      <div class="intestazione-pagina"><h1>Fatture differite · DDT da fatturare</h1>
        <div class="azioni">${daFareOra.length ? html`<form method="post" action="/amministrazione/differite/fattura-tutti" class="inline"
          data-conferma="${`Preparare ${daFareOra.length} ${daFareOra.length === 1 ? 'bozza di fattura' : 'bozze di fattura'} (una per cliente) con i DDT in scadenza o scaduti? Le controlli e le emetti una per una.`}">
          <button class="primario">Fattura tutti i clienti in scadenza (${daFareOra.length})</button></form>` : ''}</div></div>
      <p class="nota">I DDT di vendita e reso lavorato di un mese si fatturano <b>entro il 15 del mese dopo</b> (fattura differita TD24, scelta da sola all'emissione).
        Qui ci sono tutti i DDT emessi e non ancora fatturati, un gruppo per cliente: <b>Fattura tutti i DDT</b> prepara una bozza con le righe di tutti i DDT del cliente,
        da controllare ed emettere. Il cruscotto avvisa dal 1° del mese (giallo) e dal 16 (rosso).</p>
      ${gruppi.length === 0 ? html`<p class="vuoto">Nessun DDT da fatturare.</p>` : html`<p class="nota">${totale} DDT di ${gruppi.length} clienti.</p>
      ${gruppi.map(x => html`<section class="blocco differite ${x.scaduto ? 'scaduto' : x.inScadenza ? 'in-scadenza' : ''}">
        <div class="intestazione-pagina"><h2>${x.cliente} <small class="nota">${x.ddt.length} DDT · entro il ${g(x.termine)}${x.scaduto ? ' · termine superato' : x.inScadenza ? ' · da fare questo mese' : ''}</small></h2>
          <form method="post" action="/amministrazione/differite/fattura" class="inline"><input type="hidden" name="cliente_id" value="${x.clienteId}">
            ${x.ddt.map(d => html`<input type="hidden" name="ddt[]" value="${d.id}">`)}
            <button class="${x.scaduto || x.inScadenza ? 'primario' : ''}">Fattura tutti i DDT</button></form></div>
        <table class="elenco"><thead><tr><th>DDT</th><th>Data</th><th class="num">Righe</th><th class="num">Importo</th></tr></thead>
          <tbody>${x.ddt.map(d => html`<tr><td><a href="/amministrazione/documenti/${d.id}">n. ${numeroCompleto(d.numero, d.sezionale ?? undefined)}</a></td><td>${data(d.data)}</td>
            <td class="num">${d.righe ?? ''}</td><td class="num">${d.totale != null ? euro(d.totale) : ''}</td></tr>`)}</tbody></table></section>`)}`}`, msg(req)));
  });
  r.post('/differite/fattura', async (req, res) => {
    const clienteId = Number(req.body.cliente_id);
    const ids = [req.body.ddt ?? []].flat().map(Number).filter(n => n > 0);
    try {
      const id = await fatturaTuttiIDdt(clienteId, ids, req.session.utente?.id ?? null);
      res.redirect(`/amministrazione/documenti/${id}?msg=${encodeURIComponent(`Fattura preparata con ${ids.length} DDT: controlla prezzi e pagamento, poi Emetti (diventa differita TD24 da sola).`)}`);
    } catch (e: any) {
      res.redirect(`/amministrazione/differite?msg=${encodeURIComponent(e.message)}`);
    }
  });
  r.post('/differite/fattura-tutti', async (req, res) => {
    const oggi = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
    const gruppi = differitePerCliente(await ddtDaFatturareTutti(), oggi).filter(x => x.scaduto || x.inScadenza);
    let fatte = 0;
    const errori: string[] = [];
    for (const x of gruppi) {
      try { await fatturaTuttiIDdt(x.clienteId, x.ddt.map(d => d.id), req.session.utente?.id ?? null); fatte++; } catch (e: any) { errori.push(`${x.cliente}: ${e.message}`); }
    }
    res.redirect(`/amministrazione/documenti?tipo=fattura&msg=${encodeURIComponent(`${fatte} ${fatte === 1 ? 'bozza preparata' : 'bozze preparate'} (una per cliente): controllale ed emettile una per una.${errori.length ? ' Non riuscite: ' + errori.join('; ') : ''}`)}`);
  });

  r.get('/documenti', async (req, res) => {
    const tipo = String(req.query.tipo ?? SCHEDE_DOCUMENTI[0].tipo);
    const anno = Number(req.query.anno) || new Date().getFullYear();
    const cerca = String(req.query.q ?? '').trim();
    // le bozze hanno gli importi solo all'emissione: nell'elenco si calcolano dalle righe (IVA dall'aliquota della riga;
    // riga con l'IVA "predefinita" = quella del cliente, poi 22 %: prima contava 0 %, controllo del 4/11/2026)
    const righe = await q(`SELECT d.id, d.tipo, d.numero, d.sezionale, d.data, d.stato, d.origine, d.fattura_id, d.sdi_stato,
        d.email_a, d.email_inviata_il, d.inviato_a_mano, ${SQL_SDI_INVIATO_IL} AS sdi_inviato_il,
        CASE WHEN d.stato = 'bozza' THEN coalesce(b.imponibile, 0) ELSE d.imponibile END AS imponibile,
        CASE WHEN d.stato = 'bozza' THEN coalesce(b.totale, 0) ELSE d.totale END AS totale,
        coalesce(c.ragione_sociale, fa.ragione_sociale, d.intestatario->>'ragione_sociale', d.intestatario->>'nome') AS intestatario
      FROM documenti d LEFT JOIN clienti c ON c.id = d.cliente_id LEFT JOIN fornitori_anagrafica fa ON fa.id = d.fornitore_id
      LEFT JOIN LATERAL (SELECT sum(round(r.quantita * r.prezzo * (1 - coalesce(r.sconto, 0) / 100), 2)) AS imponibile,
          sum(round(round(r.quantita * r.prezzo * (1 - coalesce(r.sconto, 0) / 100), 2) * (1 + coalesce(a.percentuale, 0) / 100), 2)) AS totale
        FROM documenti_righe r LEFT JOIN aliquote_iva a ON a.codice = coalesce(r.aliquota_iva, c.aliquota_iva, 'IVA22')
        WHERE r.documento_id = d.id AND d.stato = 'bozza' AND NOT r.solo_descrizione) b ON true
      WHERE d.tipo = $1 AND (d.anno = $2 OR d.stato = 'bozza')
        AND ($3 = '' OR coalesce(c.ragione_sociale, fa.ragione_sociale, d.intestatario->>'ragione_sociale', '') ILIKE '%' || $3 || '%' OR d.numero::text = $3)
      ORDER BY d.numero IS NOT NULL, d.data DESC, d.numero DESC NULLS FIRST`, [tipo, anno, cerca]);
    const pag = paginata(righe, req.query as Record<string, unknown>);
    const anni = (await q<{ anno: number }>(`SELECT DISTINCT anno FROM documenti ORDER BY anno DESC`)).map(a => a.anno);
    if (!anni.includes(anno)) anni.unshift(anno);
    const totale = righe.filter(d => d.stato !== 'bozza' && d.stato !== 'annullato').reduce((s, d) => s + Number(d.imponibile), 0);
    // spunte e pulsanti in alto a destra (Adriano 31/10/2026); il profilo Contabilità (sola lettura) vede l'elenco senza
    const spunte = req.session.utente?.ruolo !== 'contabilita' && req.session.utente?.ruolo !== 'esterno' && tipo in NOMI;
    const modulo = spunte ? moduloAzioni({
      azione: '/amministrazione/documenti/azioni', nome: { singolare: 'documento', plurale: 'documenti' }, pulsanti: pulsantiDocumenti(tipo)
        // "Invia allo SdI" solo se nell'elenco c'è qualcosa da mandare (quelli di FIC sono già partiti da lì; Adriano 4/11/2026)
        .filter(p => p.azione !== 'invia' || righe.some(d => !motivoEscluso('invia', d))),
      extra: html`<input type="hidden" name="tipo" value="${tipo}"><input type="hidden" name="torna" value="${req.originalUrl}">`,
    }) : { apri: html``, chiudi: html`` };
    res.send(pagina(req, NOMI[tipo]?.tanti ?? 'Documenti', html`
      <div class="intestazione-pagina"><h1>Amministrazione</h1>
        <div class="azioni">
          ${tipo === 'ddt' ? html`<a href="/amministrazione/documenti/nuovo?tipo=ddt" class="bottone primario">+ Nuovo DDT</a>`
            : html`<a href="/amministrazione/documenti/nuovo?tipo=fattura" class="bottone primario">+ Nuova fattura</a>`}
        </div></div>
      ${menuAmministrazione(tipo as TipoDocumentoElenco)}
      <form class="cerca" method="get">
        <input type="hidden" name="tipo" value="${tipo}">
        <select name="anno">${anni.map(a => html`<option ${a === anno ? raw('selected') : ''}>${a}</option>`)}</select>
        <input name="q" value="${cerca}" placeholder="Cliente o numero">
        <button>Cerca</button>
      </form>
      ${tipo === 'autofattura' ? await riquadroFattureEstere(spunte) : ''}
      <p class="nota">${righe.length} documenti${tipo !== 'ddt' ? html` · imponibile ${euro(totale)}` : ''}. I documenti di Fatture in Cloud sono marcati FIC.</p>
      ${righe.length ? html`${modulo.apri}<div class="tabella-scorre"><table class="elenco">
        <thead><tr>${spunte ? casellaTutti() : ''}<th>Numero</th><th>Data</th><th>Intestatario</th><th class="num">Imponibile</th><th class="num">Totale</th><th>Stato</th><th title="${INVIATO_TITOLO}">Inviato</th></tr></thead>
        <tbody>${pag.righe.map(d => html`<tr>
          ${spunte ? casella(d.id, d.numero == null ? 'bozza' : `${NOMI[tipo]?.uno ?? 'documento'} ${numeroCompleto(d.numero, d.sezionale)}`) : ''}
          <td><a href="/amministrazione/documenti/${d.id}"><strong>${d.numero == null ? 'bozza' : numeroCompleto(d.numero, d.sezionale)}</strong></a>
            ${d.origine === 'fic' ? html` <span class="etichetta">FIC</span>` : ''}</td>
          <td>${data(d.data)}</td><td>${d.intestatario ?? ''}</td>
          <td class="num">${tipo === 'ddt' ? '' : euro(Number(d.imponibile))}</td><td class="num">${tipo === 'ddt' ? '' : euro(Number(d.totale))}</td>
          <td><span class="stato doc-${d.stato}">${STATI[d.stato] ?? d.stato}</span>
            ${tipo === 'ddt' && !['bozza', 'annullato'].includes(d.stato) ? (d.fattura_id ? html` <a href="/amministrazione/documenti/${d.fattura_id}" class="nota">fatturato</a>` : html` <span class="nota">da fatturare</span>`) : ''}</td>
          <td data-valore="${d.email_inviata_il ? new Date(d.email_inviata_il).toISOString() : d.sdi_inviato_il ? new Date(d.sdi_inviato_il).toISOString() : ''}">${d.stato === 'bozza' ? '' : segnoInvioElenco(d)}</td>
        </tr>`)}</tbody></table></div>${pag.barra}${modulo.chiudi}` : html`<p class="vuoto">Nessun documento.</p>`}`, msg(req),
      [...(tipo === 'autofattura' ? ['acquisizioni.js'] : []), ...(spunte ? ['elenco.js'] : [])]));
  });

  // pulsanti in alto a destra dell'elenco (righe spuntate): regole in engine/azioni-documenti.ts
  r.post('/documenti/azioni', async (req, res) => {
    const tipo = String(req.body?.tipo ?? '');
    const indietro = /^\/amministrazione\/documenti(\?|$)/.test(String(req.body?.torna ?? '')) ? String(req.body.torna) : `/amministrazione/documenti?tipo=${encodeURIComponent(tipo)}`;
    const torna = (t: string) => res.redirect(conMessaggio(indietro, t));
    const azione = String(req.body?.azione ?? '') as AzioneDocumenti;
    if (!pulsantiDocumenti(tipo).some(p => p.azione === azione)) return torna('Azione non riconosciuta.');
    const docs = await documentiSpuntati(idsSpuntati(req.body), tipo);
    if (!docs.length) return torna('Seleziona almeno un documento.');
    const { si, no } = dividiPerAzione(azione, docs);
    const esclusi = frasiEscluse(no);
    const utente = req.session.utente?.id ?? null;
    if (!si.length) return torna(`Nessun documento adatto. ${esclusi}`);
    const vaiA = (indirizzo: string, t: string) => res.redirect(`${indirizzo}?msg=${encodeURIComponent(t)}`);
    try {
      switch (azione) {
        case 'stampa': return res.redirect(`/amministrazione/documenti/${si[0].id}/stampa`);
        case 'xml': return await scriviXml(res, si, tipo);
        case 'excel': {
          const file = await excelDocumenti(si, tipo);
          res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          res.setHeader('Content-Disposition', `attachment; filename="${NOMI[tipo].tanti.replace(/ /g, '_')}_${si.length}.xlsx"`);
          return res.send(file);
        }
        case 'elimina': {
          const n = await eliminaBozze(si.map(d => d.id));
          return torna(`${n === 1 ? '1 bozza eliminata' : `${n} bozze eliminate`}. ${esclusi}`.trim());
        }
        case 'invia': {
          // uno per volta, come il pulsante "Invia allo SdI" della pagina del documento (Adriano 4/11/2026)
          // le bozze prima si emettono (numero, XML): se l'emissione ha errori la bozza resta e non parte
          // controllo del 4/11/2026: senza chiave non si emette nulla; con la chiave di prova le bozze NON si emettono
          // (prenderebbero il numero vero senza arrivare allo SdI): per provarle c'è "Prova l'invio" nella pagina della bozza
          const ambiente = ambienteAttuale();
          if (!ambiente) return torna('Invio allo SdI non attivo (manca la chiave di Invoicetronic): nessun documento emesso né inviato.');
          let n = 0; const errori: string[] = [];
          for (const d of si) {
            let nome = d.etichetta;
            if (d.stato === 'bozza' && ambiente === 'prova') {
              errori.push(`${d.etichetta} (${d.intestatario ?? ''}) non emessa: con la chiave di prova le bozze si provano con "Prova l'invio" nella loro pagina, senza usare la numerazione.`);
              continue;
            }
            if (d.stato === 'bozza') {
              const em = await emettiDocumento(d.id);
              if ('errori' in em) { errori.push(`${d.etichetta} (${d.intestatario ?? ''}) non emessa: ${em.errori.join(' ')}`); continue; }
              nome = `n. ${em.numero}`;
            }
            try { await inviaDocumento(d.id, utente); n++; } catch (e: any) { errori.push(`${nome}: emesso ma non inviato: ${e?.message ?? e}`); }
          }
          return torna(`${n === 1 ? '1 documento inviato allo SdI' : `${n} documenti inviati allo SdI`}${ambienteAttuale() === 'prova' ? ' in PROVA (chiave di prova: non arrivano davvero allo SdI)' : ": l'esito arriva di solito in pochi minuti"}. ${[esclusi, ...errori].filter(Boolean).join(' ')}`.trim());
        }
        case 'gia_fatturato': {
          const n = await segnaGiaFatturati(si.map(d => d.id), req.session.utente?.nome ?? 'ufficio');
          return torna(`${n === 1 ? '1 DDT segnato già fatturato' : `${n} DDT segnati già fatturati`}: non sono più tra i DDT da fatturare. ${esclusi}`.trim());
        }
        case 'annulla': {
          let n = 0; const errori: string[] = [];
          for (const d of si) { const e = await annullaDdt(d.id); if (e) errori.push(`${d.etichetta}: ${e}`); else n++; }
          return torna(`${n === 1 ? '1 DDT annullato' : `${n} DDT annullati`} (il numero resta usato). ${[esclusi, ...errori].filter(Boolean).join(' ')}`.trim());
        }
        case 'duplica': {
          const id = await duplicaFattura(si[0].id, utente);
          return id ? vaiA(`/amministrazione/documenti/${id}`, 'Copia creata come bozza con la data di oggi: controlla righe, prezzi e pagamento, poi Emetti.') : torna('Fattura non trovata.');
        }
        case 'nota_credito': {
          const id = await creaNotaCredito(si[0].id, utente);
          return vaiA(`/amministrazione/documenti/${id}`, 'Nota di credito creata come bozza: controlla righe e importi (per uno storno parziale togli o cambia le righe).');
        }
        case 'fattura_ddt': {
          const diversi = controlloDdtStessoCliente(si);
          if (diversi) return torna(diversi);
          const fattura = await creaBozza('fattura', si[0].cliente_id!, utente);
          const n = await aggiungiDdt(fattura, si.map(d => d.id));
          return vaiA(`/amministrazione/documenti/${fattura}`, `Fattura preparata con ${n === 1 ? 'le righe del DDT' : `le righe di ${n} DDT`}: controlla prezzi e pagamento, poi Emetti. ${esclusi}`.trim());
        }
        case 'incassa': {
          const rate = await rateAperte(si.map(d => d.id));
          if (!rate.length) return torna(`Le fatture spuntate non hanno rate da incassare. ${esclusi}`.trim());
          const perDoc = new Map(si.map(d => [d.id, d]));
          const { modi, strumenti: conti } = await caricaModiPagamento();
          return res.send(pagina(req, 'Segna incassate', html`
            <p><a href="${indietro}">← ${NOMI[tipo].tanti}</a></p>
            <h1>Segna incassate</h1>
            ${esclusi ? html`<p class="nota">${esclusi}</p>` : ''}
            <form method="post" action="/amministrazione/documenti/incassa" class="blocco">
              <input type="hidden" name="torna" value="${indietro}">
              <div class="tabella-scorre"><table class="elenco">
                <thead><tr><th></th><th>Fattura</th><th>Cliente</th><th>Scadenza</th><th class="num">Importo</th></tr></thead>
                <tbody>${rate.map(s => html`<tr><td class="selezione"><input type="checkbox" name="rate" value="${s.id}" checked aria-label="Rata da segnare"></td>
                  <td><a href="/amministrazione/documenti/${s.documento_id}">${perDoc.get(s.documento_id)?.etichetta}</a></td><td>${perDoc.get(s.documento_id)?.intestatario ?? ''}</td>
                  <td>${data(s.data)}</td><td class="num">${euro(s.importo)}</td></tr>`)}</tbody>
                <tfoot><tr><td></td><td colspan="3"><strong>Totale</strong></td><td class="num"><strong>${euro(rate.reduce((t, s) => t + s.importo, 0))}</strong></td></tr></tfoot>
              </table></div>
              <datalist id="conti">${conti.map(c => html`<option value="${c}">`)}</datalist>
              <div class="riga-campi">
                <label class="stretto">Incassate il <input type="date" name="pagata_il" value="${oggiRoma()}" required></label>
                <label>Modo di pagamento <select name="modo" required><option value="">Scegli…</option>${modi.map(m => html`<option>${m}</option>`)}</select></label>
                <label>Banca o conto (facoltativo) <input name="conto" list="conti" placeholder="es. Bper"></label>
              </div>
              <div class="barra-azioni"><span class="nota">Togli la spunta alle rate non ancora incassate. Si annulla dalla pagina della fattura.</span>
                <button class="primario">Segna incassate</button></div>
            </form>`));
        }
      }
    } catch (e: any) {
      return torna(e.message);
    }
    torna('Azione non riconosciuta.');
  });

  r.post('/documenti/incassa', async (req, res) => {
    const indietro = /^\/amministrazione\/documenti(\?|$)/.test(String(req.body?.torna ?? '')) ? String(req.body.torna) : '/amministrazione/documenti';
    const giorno = String(req.body?.pagata_il ?? '');
    const rate = [...new Set([req.body?.rate ?? []].flat().map(Number).filter(n => Number.isInteger(n) && n > 0))];
    const modo = modoPagamento(req.body?.modo, (await caricaModiPagamento()).modi);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(giorno) || !modo) return res.redirect(conMessaggio(indietro, 'Servono la data e il modo di pagamento.'));
    const n = await segnaIncassate(rate, giorno, modo, String(req.body?.conto ?? '').trim() || null);
    res.redirect(conMessaggio(indietro, n ? `${n === 1 ? '1 rata segnata incassata' : `${n} rate segnate incassate`} il ${data(giorno)}.` : 'Nessuna rata segnata.'));
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
  // filiera commessa → DDT → fattura (1/11/2026): dalla pagina della commessa o dal rientro
  r.post('/documenti/ddt-da-commessa/:commessa', async (req, res) => {
    const commessa = Number(req.params.commessa);
    try {
      const id = await creaDdtDaCommessa(commessa, req.session.utente?.id ?? null);
      res.redirect(`/amministrazione/documenti/${id}?msg=${encodeURIComponent('DDT preparato con le schede della commessa: controlla quantità, prezzo e trasporto, poi Emetti. Dal DDT emesso, "Fattura questo DDT" prepara la fattura.')}`);
    } catch (e: any) {
      res.redirect(`/commesse/${commessa}?msg=${encodeURIComponent(e.message)}`);
    }
  });
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
      // copia di cortesia: stessi dati del PDF che parte per email (fattura-email-servizio.ts)
      const x = (await datiStampaFattura(id))!;
      return res.send(String(stampaFattura(x.d, x.righe, x.azienda, x.cliente, x.totali, x.scadenze, x.intento, x.pagamento)));
    }
    // destinatario: la fotografia fatta all'emissione; in bozza i dati attuali dell'anagrafica
    const dest = d.intestatario && d.numero != null ? d.intestatario : Object.fromEntries(Object.entries(d).filter(([k]) => k.startsWith('c_')).map(([k, v]) => [k.slice(2), v]));
    res.send(String(stampaDdt(d, righe, azienda, dest)));
  });

  // PDF del DDT o della fattura / nota di credito di cortesia (lo stesso che parte allegato all'email)
  r.get('/documenti/:id/pdf', async (req, res) => {
    const id = Number(req.params.id);
    const pdf = (await pdfDelDdt(id)) ?? (await pdfDellaFattura(id));
    if (!pdf) return res.status(404).send('PDF disponibile per DDT, fatture e note di credito');
    res.type('application/pdf').setHeader('Content-Disposition', `inline; filename="${pdf.nome}"`);
    res.send(pdf.dati);
  });

  // invio per email con Gmail: DDT (Adriano 2/11/2026), fattura e nota di credito di cortesia (Adriano 4/11/2026)
  r.post('/documenti/:id/email', async (req, res) => {
    const id = Number(req.params.id);
    try {
      const tipo = (await q1<{ tipo: string }>(`SELECT tipo FROM documenti WHERE id = $1`, [id]))?.tipo;
      const a = tipo === 'ddt' ? await inviaDdtEmail(id, req.body) : await inviaFatturaEmail(id, req.body);
      const cosa = tipo === 'ddt' ? 'DDT mandato' : tipo === 'nota_credito' ? 'Nota di credito mandata' : 'Fattura mandata';
      res.redirect(`/amministrazione/documenti/${id}?msg=${encodeURIComponent(`${cosa} a ${a} con il PDF allegato.`)}`);
    } catch (e: any) {
      res.redirect(`/amministrazione/documenti/${id}?msg=${encodeURIComponent(`Email non inviata: ${e?.message ?? e}`)}`);
    }
  });

  r.post('/documenti/:id/gia-fatturato', async (req, res) => {
    const id = Number(req.params.id);
    const n = await segnaGiaFatturati([id], req.session.utente?.nome ?? 'ufficio');
    res.redirect(`/amministrazione/documenti/${id}?msg=${encodeURIComponent(n ? 'DDT segnato già fatturato: non è più tra i DDT da fatturare.' : 'Il DDT è già fatturato o già segnato.')}`);
  });

  r.post('/documenti/:id/da-fatturare', async (req, res) => {
    const id = Number(req.params.id);
    await rimettiDaFatturare(id);
    res.redirect(`/amministrazione/documenti/${id}?msg=${encodeURIComponent('Il DDT è di nuovo tra i DDT da fatturare.')}`);
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

  // Nota di credito emessa (anche da Fatture in Cloud) senza fattura collegata: "Storna la fattura n. …" (Adriano 6/11/2026,
  // NC 2/2026 JOX su una fattura del dicembre 2025). Nell'Analisi la nota conta poi nel mese della fattura stornata.
  r.post('/documenti/:id/storna', async (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return next();
    const id = Number(req.params.id);
    const nota = await q1(`SELECT tipo, stato, cliente_id, data::text AS data, documento_origine_id FROM documenti WHERE id = $1`, [id]);
    if (!nota) return res.status(404).send('Documento non trovato');
    if (req.body?.togli === '1') {
      await q(`UPDATE documenti SET documento_origine_id = NULL WHERE id = $1 AND tipo = 'nota_credito'`, [id]);
      return res.redirect(conMessaggio(`/amministrazione/documenti/${id}`, 'Collegamento alla fattura tolto.'));
    }
    const fid = Number(req.body?.fattura_id);
    const fattura = fid ? await q1(`SELECT tipo, stato, cliente_id, numero, data::text AS data FROM documenti WHERE id = $1`, [fid]) : null;
    const errore = controlloStorno(nota, fattura, nota.data);
    if (errore) return res.redirect(conMessaggio(`/amministrazione/documenti/${id}`, errore));
    await q(`UPDATE documenti SET documento_origine_id = $2 WHERE id = $1`, [id, fid]);
    res.redirect(conMessaggio(`/amministrazione/documenti/${id}`, 'Fattura collegata: nell\'Analisi la nota di credito conta nel mese della fattura stornata.'));
  });

  // "Segna come inviato" per un documento mandato da fuori del portale (posta, PEC, a mano) o "Togli il segno" (Adriano 4/11/2026)
  r.post('/documenti/:id/segna-inviato', async (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return next();
    const id = Number(req.params.id);
    const togli = req.body?.togli === '1';
    await segnaDocumentoInviato(id, String(req.body?.a ?? ''), togli);
    const torna = String(req.body?.torna ?? '');
    const indirizzo = /^\/[a-z]/.test(torna) && !torna.includes('//') ? torna : `/amministrazione/documenti/${id}`;
    res.redirect(conMessaggio(indirizzo, togli ? 'Segno "inviato" tolto.' : 'Documento segnato come inviato.'));
  });

  r.get('/documenti/:id', async (req, res) => {
    const id = Number(req.params.id);
    const d = await q1(`SELECT d.*, ${SQL_SDI_INVIATO_IL} AS sdi_inviato_il, coalesce(c.ragione_sociale, fa.ragione_sociale) AS ragione_sociale, o.numero AS origine_numero, o.sezionale AS origine_sezionale,
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
        ${d.origine_numero ? html` · ${d.tipo_sdi === 'TD05' ? 'aumenta' : 'storna'} la fattura <a href="/amministrazione/documenti/${d.documento_origine_id}">n. ${numeroCompleto(d.origine_numero, d.origine_sezionale)} del ${data(d.origine_data)}</a>${
          d.tipo === 'nota_credito' && d.stato !== 'bozza' ? html` <form method="post" action="/amministrazione/documenti/${id}/storna" class="in-linea" data-conferma="Togliere il collegamento alla fattura stornata?"><input type="hidden" name="togli" value="1"><button class="link">togli</button></form>` : ''}` : ''}
        ${d.ricevuto_id ? html` · ${TIPI_AUTOFATTURA[d.tipo_sdi] ?? d.tipo_sdi} sulla <a href="/amministrazione/ricevuti/${d.ricevuto_id}">fattura del fornitore n. ${d.ricevuto_numero} del ${data(d.ricevuto_data)}</a>` : ''}
        ${d.tipo === 'ddt' && !['bozza', 'annullato'].includes(d.stato) ? (d.fattura_id ? html` · fatturato con la <a href="/amministrazione/documenti/${d.fattura_id}">fattura n. ${d.fattura_numero} del ${data(d.fattura_data)}</a>`
          : d.fatturato_altrove ? html` · ${d.fatturato_altrove}` : ' · da fatturare') : ''}</p>
      ${!['bozza', 'annullato'].includes(d.stato) ? riquadroInvio(d, { segna: d.tipo === 'autofattura' ? undefined : `/amministrazione/documenti/${id}/segna-inviato`,
        cosa: NOMI[d.tipo]?.uno ?? 'documento' }) : ''}
      ${d.tipo === 'nota_credito' && d.stato !== 'bozza' && !d.documento_origine_id && d.cliente_id ? await riquadroStorno(d) : ''}`;

    // DDT emesso: "Modifica" finché non è in una fattura già allo SdI (Adriano 2/11/2026)
    const bloccoModifica = d.tipo === 'ddt' && d.stato !== 'bozza' ? await bloccoDdt(id) : null;
    if (d.tipo === 'ddt' && d.stato !== 'bozza' && req.query.modifica === '1' && !bloccoModifica)
      return res.send(pagina(req, `Modifica ${titolo}`, html`${testa}${await moduloDdt(d, righe)}`, msg(req), ['documenti.js']));
    if (d.stato !== 'bozza') {
      const scadenze = await q(`SELECT * FROM documenti_scadenze WHERE documento_id = $1 ORDER BY data`, [id]);
      const trasporto = d.dati_trasporto ?? {};
      const email = d.tipo === 'ddt' && d.stato !== 'annullato' && d.numero != null ? await propostaEmailDdt(id)
        : TIPI_CORTESIA.includes(d.tipo) ? await propostaEmailFattura(id) : null;
      // "DDT", "fattura", "nota di credito": per i testi del riquadro email
      const cosaEmail = d.tipo === 'ddt' ? 'DDT' : nomeDocumento(d.tipo, d.tipo_sdi);
      const pdfEmail = d.tipo === 'ddt' ? 'PDF del DDT' : `PDF di cortesia`;
      return res.send(pagina(req, titolo, html`${testa}
        ${d.causale ? html`<p class="nota">${d.causale}</p>` : ''}
        ${d.tipo === 'ddt' && Object.keys(trasporto).length ? html`<p class="nota">${Object.entries(ETICHETTE_TRASPORTO).filter(([k]) => trasporto[k])
          .map(([k, v]) => `${v}: ${k === 'inizio' ? `${data(trasporto[k].slice(0, 10))} ore ${trasporto[k].slice(11, 16)}` : trasporto[k]}`).join(' · ')}</p>` : ''}
        ${d.tipo === 'ddt' && d.riferimento_esterno ? html`<p class="nota">${d.riferimento_esterno}</p>` : ''}
        <div class="tabella-scorre"><table class="elenco">
          <thead><tr><th>Codice</th><th>Descrizione</th><th class="num">Q.tà</th><th>U.m.</th><th class="num">Prezzo</th><th class="num">Sconto</th><th class="num">Importo</th><th>IVA</th></tr></thead>
          <tbody>${righe.map(x => x.solo_descrizione ? html`<tr><td></td><td colspan="7"><em>${x.descrizione}</em></td></tr>` : html`<tr>
            <td>${x.codice ?? ''}</td><td>${x.descrizione}</td><td class="num">${num(x.quantita, 0)}</td><td>${x.um ?? ''}</td>
            <td class="num">${euroUnitario(x.prezzo)}</td><td class="num">${x.sconto ? `${num(x.sconto)} %` : ''}</td>
            <td class="num">${euro(Math.round(x.quantita * x.prezzo * (1 - x.sconto / 100) * 100) / 100)}</td><td>${x.aliquota_iva ?? ''}</td></tr>`)}</tbody>
        </table></div>
        ${d.tipo !== 'ddt' ? html`<p class="totali-documento">Imponibile ${euro(d.imponibile)} · IVA ${euro(d.imposta)}${d.bollo ? html` · bollo ${euro(d.bollo)}` : ''} · <strong>Totale ${euro(d.totale)}</strong></p>` : ''}
        ${d.sdi_messaggio && ['scartato', 'non_consegnato'].includes(d.stato) ? html`<p class="avviso">${d.sdi_messaggio}</p>` : ''}
        ${['fattura', 'nota_credito', 'autofattura'].includes(d.tipo) && d.origine === 'portale' ? attributiEmesso(d.xml, d.attributi_xml) : ''}
        ${await riquadroSdi(d)}
        ${elencoScadenze(scadenze, 'documenti', await caricaModiPagamento())}
        <div class="azioni-secondarie">
          ${d.xml ? html`<a class="bottone" href="/amministrazione/documenti/${id}/xml">Scarica XML</a>` : ''}
          ${email ? html`<a class="bottone primario" href="#invia-email">✉ Invia per email</a>` : ''}
          ${['ddt', 'fattura', 'nota_credito'].includes(d.tipo) && d.origine === 'portale' ? html`<a class="bottone ${d.tipo === 'ddt' && !email ? 'primario' : ''}" href="/amministrazione/documenti/${id}/stampa" target="_blank" rel="noopener"
            title="${d.tipo === 'ddt' ? '' : 'Copia di cortesia per il cliente (il documento fiscale è l\'XML)'}">${d.tipo === 'ddt' ? 'Stampa / PDF' : 'PDF di cortesia'}</a>` : ''}
          ${d.tipo === 'ddt' && d.stato !== 'annullato' && d.origine === 'portale' ? (bloccoModifica
            ? html`<span class="nota" title="${bloccoModifica}">Non modificabile: fattura già allo SdI</span>`
            : html`<a class="bottone" href="/amministrazione/documenti/${id}?modifica=1">Modifica DDT</a>`) : ''}
          ${d.tipo === 'ddt' && d.origine === 'portale' && d.stato === 'emesso' && !d.fattura_id ? html`
            <form method="post" action="/amministrazione/documenti/${id}/fattura" class="inline"><button>Fattura questo DDT</button></form>
            <form method="post" action="/amministrazione/documenti/${id}/annulla" class="inline"
              data-conferma="Annullare il DDT n. ${d.numero}? Usalo solo se la merce non è partita: il numero resta usato e il DDT resta nell'elenco come annullato.">
              <button class="pericolo">Annulla DDT</button></form>` : ''}
          ${d.tipo === 'ddt' && d.numero != null && !['bozza', 'annullato'].includes(d.stato) && !d.fattura_id ? (d.fatturato_altrove
            ? html`<form method="post" action="/amministrazione/documenti/${id}/da-fatturare" class="inline"><button>Rimetti tra i da fatturare</button></form>`
            : html`<form method="post" action="/amministrazione/documenti/${id}/gia-fatturato" class="inline"
                data-conferma="Segnare il DDT n. ${d.numero} come già fatturato (anticipo, proforma o Fatture in Cloud)? Esce dai DDT da fatturare.">
                <button title="Merce già fatturata prima (anticipo, proforma) o in Fatture in Cloud senza collegamento">Già fatturato</button></form>`) : ''}
          ${d.tipo === 'fattura' && d.cliente_id && !['scartato', 'annullato'].includes(d.stato) ? html`<form method="post" action="/amministrazione/documenti/${id}/nota-credito" class="inline"
            data-conferma="Creare una nota di credito (bozza) che storna questa fattura?"><button>Crea nota di credito</button></form>
            ${d.tipo_sdi !== 'TD05' ? html`<form method="post" action="/amministrazione/documenti/${id}/nota-debito" class="inline"
            data-conferma="Creare una nota di debito (bozza) che aumenta l'importo di questa fattura?"><button title="Per aggiungere importi a questa fattura (costi dimenticati, adeguamenti)">Crea nota di debito</button></form>` : ''}` : ''}
        </div>
        ${email ? html`<form method="post" action="/amministrazione/documenti/${id}/email" class="blocco" id="invia-email" data-conferma="Mandare ${d.tipo === 'ddt' ? 'il DDT' : `la ${cosaEmail}`} n. ${d.numero} per email con il PDF allegato?">
          <h2>Invia ${d.tipo === 'ddt' ? 'il DDT' : `la ${cosaEmail} di cortesia`} per email</h2>
          ${d.tipo !== 'ddt' ? html`<p class="nota">Copia di cortesia per il cliente: la ${cosaEmail} vera è l'XML che arriva al cliente dallo SdI.</p>` : ''}
          ${d.email_inviata_il ? html`<p class="nota">Già inviato a ${d.email_a} il ${new Date(d.email_inviata_il).toLocaleString('it-IT', { timeZone: 'Europe/Rome', dateStyle: 'short', timeStyle: 'short' })}.</p>` : ''}
          <div class="riga-campi">
            <label class="largo">A <input name="a" value="${email.a}" placeholder="${d.tipo === 'ddt' ? 'magazzino' : 'amministrazione'}@cliente.it (più indirizzi separati da virgola)"></label>
            <label>Cc <input name="cc" value=""></label>
          </div>
          <label>Oggetto <input name="oggetto" value="${email.oggetto}"></label>
          <label>Testo <textarea name="testo" rows="7">${email.testo}</textarea></label>
          <div class="barra-azioni">
            <span class="nota">${email.attivo ? html`Parte da ${email.mittente} con allegato il <a href="/amministrazione/documenti/${id}/pdf" target="_blank" rel="noopener">${pdfEmail}</a>.`
              : html`<b>Invio con Gmail non attivo</b> (mancano GMAIL_MITTENTE o la chiave Google su Render): scarica il <a href="/amministrazione/documenti/${id}/pdf" target="_blank" rel="noopener">${pdfEmail}</a> e mandalo dalla posta.`}</span>
            <button class="primario" ${email.attivo ? '' : raw('disabled')}>${d.email_inviata_il && !d.inviato_a_mano ? 'Manda di nuovo' : 'Invia con Gmail'}</button>
          </div>
        </form>` : ''}`, msg(req)));
    }

    if (d.tipo === 'ddt') return res.send(pagina(req, titolo, html`${testa}${await moduloDdt(d, righe)}`, msg(req), ['documenti.js', 'autosalva.js']));

    // bozza: modulo modificabile
    const [aliquote, condizioni, ddt, { esito, erroriExtra }, acconti, cliente, servizOrdine] = await Promise.all([
      caricaAliquote(true), caricaCondizioniPagamento(true), d.cliente_id ? ddtDaFatturare(d.cliente_id, id) : Promise.resolve([]), anteprimaDocumento(id),
      d.cliente_id && d.tipo === 'fattura' && !['TD02', 'TD05'].includes(d.tipo_sdi) ? accontiDaScalare(d.cliente_id) : Promise.resolve([]),
      d.cliente_id ? q1(`SELECT pubblica_amministrazione, split_payment, codice_sdi FROM clienti WHERE id = $1`, [d.cliente_id]) : Promise.resolve(null),
      d.cliente_id && d.tipo === 'fattura' && !['TD02'].includes(d.tipo_sdi) ? righeOrdineDaFatturare(d.cliente_id, id) : Promise.resolve([])]);
    const dateDdt = righe.filter(x => x.ddt_id).map(x => x.ddt_data ? String(x.ddt_data) : '').filter(Boolean);
    const termine = esito.tipoSdi === 'TD24' ? termineDifferita(dateDdt) : null;
    const errori = [...esito.errori, ...erroriExtra];
    const t = esito.totali;
    const vuote = Array.from({ length: RIGHE_VUOTE }, () => ({}) as any);
    // fattura e note al cliente: codice solo dall'anagrafica del cliente (Adriano 31/10/2026); autofattura: righe del fornitore estero, libere
    const conAnagrafica = d.tipo !== 'autofattura' && !!d.cliente_id;
    const prodotti = conAnagrafica ? await prodottiPerCliente(d.cliente_id) as ProdottoScelta[] : [];
    const servizi = conAnagrafica ? await serviziAttivi() : [];     // servizi una tantum (UT-…): per tutti i clienti
    // avviso margine (engine/avviso-margine.ts): prezzo sotto l'ultimo preventivo del codice o margine del preventivo sotto il 10 % → riga gialla
    const riferimenti = new Map<string, RiferimentoPreventivo>();
    if (conAnagrafica && d.tipo === 'fattura') {
      for (const r of await riferimentiPreventivi(d.cliente_id)) if (r.prezzo_scheda) riferimenti.set(r.codice, { numero: r.numero, preventivoId: r.id, prezzoScheda: r.prezzo_scheda,
        marginePct: marginePreventivo({ guadagnoLotto: r.guadagno ?? undefined, totaleSecondoLotto: r.totale ?? undefined }) });
    }
    const avvisiMargine = avvisiRighe(righe, riferimenti);
    const rigaModulo = (x: any, i: number) => html`<tr class="${x.solo_descrizione ? 'riga-testo' : ''} ${avvisiMargine.has(i) ? `riga-margine ${avvisiMargine.get(i)!.livello}` : ''}">
      <td>${conAnagrafica ? cellaCodice(x, i, prodotti, servizi) : html`<input name="righe[${i}][codice]" value="${x.codice ?? ''}" class="corto maiuscolo">
        <input type="hidden" name="righe[${i}][prodotto_id]" value="${x.prodotto_id ?? ''}">`}<input type="hidden" name="righe[${i}][ddt_id]" value="${x.ddt_id ?? ''}">
        <input type="hidden" name="righe[${i}][riga_ordine_id]" value="${x.riga_ordine_id ?? ''}">
        <input type="hidden" name="righe[${i}][acconto_id]" value="${x.acconto_id ?? ''}"></td>
      <td>${conAnagrafica ? cellaDescrizione(x, i, prodotti) : html`<input name="righe[${i}][descrizione]" value="${x.descrizione ?? ''}">`}${x.ddt_numero && !x.solo_descrizione ? html`<span class="nota">dal DDT n. ${x.ddt_numero}</span>` : ''}</td>
      <td><input name="righe[${i}][quantita]" value="${numCampo(x.quantita)}" class="corto" inputmode="decimal"></td>
      <td>${sceltaUm(`righe[${i}][um]`, x.um, !x.descrizione && !x.codice)}</td>
      <td><input name="righe[${i}][prezzo]" value="${numCampo(x.prezzo)}" class="corto" inputmode="decimal">${avvisiMargine.has(i) ? html`<small class="avviso-margine" title="${avvisiMargine.get(i)!.testo}">⚠ ${avvisiMargine.get(i)!.livello === 'critico' ? 'sotto il preventivo' : 'margine basso'}</small>` : ''}</td>
      <td><input name="righe[${i}][sconto]" value="${x.sconto || ''}" class="cortissimo" inputmode="decimal"></td>
      <td><select name="righe[${i}][aliquota_iva]"><option value="">predefinita</option>${aliquote.map(a =>
        html`<option value="${a.codice}" ${x.aliquota_iva === a.codice ? raw('selected') : ''}>${a.descrizione}</option>`)}</select></td>
      <td class="centro"><input type="checkbox" name="righe[${i}][solo_descrizione]" ${x.solo_descrizione ? raw('checked') : ''} title="Riga di solo testo, senza importo"></td>
    </tr>`;
    // cliente di un altro paese UE: ultimo controllo VIES (serve per fatturare non imponibile art. 41 / 7-ter)
    const clienteUe = d.tipo !== 'autofattura' && d.cliente_id ? await q1(`SELECT partita_iva, nazione FROM clienti WHERE id = $1`, [d.cliente_id]) : null;
    res.send(pagina(req, titolo, html`${testa}
      ${clienteUe ? await riquadroVies(clienteUe.partita_iva, clienteUe.nazione, `/amministrazione/documenti/${id}`) : ''}
      ${d.tipo === 'fattura' || d.tipo === 'nota_credito' ? await riquadroPlafond(d.cliente_id, String(d.data), (d.tipo === 'nota_credito' ? -1 : 1) * t.riepilogo.filter((g: any) => g.natura === 'N3.5').reduce((s: number, g: any) => s + Number(g.imponibile), 0)) : ''}
      <form method="post" action="/amministrazione/documenti/${id}" class="blocco" id="modulo-documento" data-autosalva="${d.stato === 'bozza' ? '1' : ''}">
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
        ${d.tipo === 'fattura' || d.tipo === 'nota_credito' ? html`<div class="riga-campi">${campoEsigibilita(d.esigibilita_iva, !!cliente?.split_payment)}</div>` : ''}
        <label>Causale (stampata sulla fattura) <input name="causale" value="${d.causale ?? ''}"></label>
        <label>Note interne (non vanno in fattura) <input name="note" value="${d.note ?? ''}"></label>
        ${riepilogoAvvisi(avvisiMargine) ? html`<p class="avviso margine">${riepilogoAvvisi(avvisiMargine)} ${[...avvisiMargine.values()].map(a => a.testo).join(' ')}</p>` : ''}
        <div class="tabella-scorre"><table class="editor" id="righe-documento">
          <thead><tr><th>Codice</th><th>Descrizione</th><th>Q.tà</th><th>U.m.</th><th>Prezzo €</th><th>Sconto %</th><th>IVA</th><th title="Solo testo">Testo</th></tr></thead>
          <tbody>${[...righe, ...vuote].map(rigaModulo)}</tbody>
        </table></div>
        ${conAnagrafica ? riquadriSceltaProdotto(d.cliente_id) : ''}
        ${riquadroAttributi(esito.xmlBase, d.attributi_xml)}
        <div class="barra-azioni"><button type="button" id="aggiungi-riga">+ Riga</button>
          <span class="nota">${d.tipo === 'autofattura' ? 'Autofattura: IVA italiana (di solito 22 %) sulle righe della fattura estera, in euro.'
            : 'IVA "predefinita" = quella del cliente (lettera d\'intento, estero…) o 22 %.'}</span>
          <button class="primario">Salva</button></div>
      </form>
      ${ddt.length ? html`<form method="post" action="/amministrazione/documenti/${id}/ddt" class="blocco">
        <h2>DDT da fatturare di questo cliente</h2>
        ${ddt.filter(x => x.daFatturare).map(x => html`<label class="riga-spunta"><input type="checkbox" name="ddt" value="${x.id}"> DDT n. ${x.numero} del ${data(x.data)}
          <span class="nota">${x.righe} righe${x.causale ? ` · ${x.causale}` : ''}</span></label>`)}
        ${ddt.some(x => !x.daFatturare) ? html`<details class="nota"><summary>Altri ${ddt.filter(x => !x.daFatturare).length} DDT senza fattura (resi non lavorati, garanzie, conto visione: di solito non si fatturano)</summary>
          ${ddt.filter(x => !x.daFatturare).map(x => html`<label class="riga-spunta"><input type="checkbox" name="ddt" value="${x.id}"> DDT n. ${x.numero} del ${data(x.data)}
            <span class="nota">${x.righe} righe${x.causale ? ` · ${x.causale}` : ''}</span></label>`)}</details>` : ''}
        <button>Aggiungi i DDT scelti</button> <span class="nota">Salva prima le modifiche alle righe: i DDT si aggiungono in fondo.</span>
      </form>` : ''}
      ${servizOrdine.length ? html`<form method="post" action="/amministrazione/documenti/${id}/righe-ordine" class="blocco da-verificare">
        <h2>Servizi degli ordini non ancora fatturati</h2>
        <p class="nota">Lamine, programmazioni e altre una tantum degli ordini di questo cliente che non viaggiano con un DDT: se vanno in questa fattura, spuntale e aggiungile.
          Una volta emessa la fattura il servizio risulta fatturato (e la riga dell'ordine evasa).</p>
        ${servizOrdine.map(x => html`<label class="riga-spunta"><input type="checkbox" name="riga" value="${x.id}"> Ordine ${x.ordine} · ${x.codice ? `${x.codice} · ` : ''}${x.descrizione}
          <span class="nota">${x.quantita} × ${euro(x.prezzo)}</span></label>`)}
        <button>Aggiungi le righe scelte</button> <span class="nota">Salva prima le modifiche alle righe: le righe si aggiungono in fondo.</span>
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
      ${ambienteAttuale() === 'prova' || d.numero != null ? await riquadroSdi(d, !errori.length) : ''}`, msg(req), ['documenti.js', 'autosalva.js', 'attributi-fattura.js']));
  });

  r.post('/documenti/:id', async (req, res) => {
    const id = Number(req.params.id);
    let errori: string[];
    try { errori = await salvaBozza(id, req.body); } catch (e: any) { if (!eAutosalvataggio(req) && !/modifica/.test(String(e?.message))) throw e; errori = [e.message]; }
    const ddtEmesso = await q1(`SELECT 1 FROM documenti WHERE id = $1 AND tipo = 'ddt' AND stato <> 'bozza'`, [id]);
    rispondiSalvataggio(req, res, errori, `/amministrazione/documenti/${id}?${ddtEmesso && errori.length ? 'modifica=1&' : ''}msg=${encodeURIComponent(errori.length
      ? `Non salvato: ${errori.join(' ')}` : ddtEmesso ? 'DDT corretto (stesso numero e data). Se l\'avevi già mandato, rimandalo.' : 'Salvato.')}`);
  });

  r.post('/documenti/:id/ddt', async (req, res) => {
    const id = Number(req.params.id);
    const scelti = [req.body.ddt ?? []].flat().map(Number).filter(Boolean);
    const n = scelti.length ? await aggiungiDdt(id, scelti) : 0;
    res.redirect(`/amministrazione/documenti/${id}?msg=${encodeURIComponent(n ? `Aggiunti ${n} DDT.` : 'Nessun DDT scelto.')}`);
  });

  r.post('/documenti/:id/righe-ordine', async (req, res) => {
    const id = Number(req.params.id);
    const scelte = [req.body.riga ?? []].flat().map(Number).filter(Boolean);
    const n = scelte.length ? await aggiungiRigheOrdine(id, scelte) : 0;
    res.redirect(`/amministrazione/documenti/${id}?msg=${encodeURIComponent(n ? `Aggiunte ${n} righe dell'ordine.` : 'Nessuna riga scelta.')}`);
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
    if (req.query.formato === 'xlsx') return inviaExcel(res, nomeExcel('fatture-fornitori'), await excelSemplice('Fatture fornitori', [
      { header: 'Data', key: 'data', formato: 'data' }, { header: 'Fornitore', key: 'fornitore', width: 40 }, { header: 'Tipo', key: 'tipo', width: 14 }, { header: 'Numero', key: 'numero', width: 16 },
      { header: 'Descrizione', key: 'descrizione', width: 40 }, { header: 'Imponibile', key: 'imponibile', formato: 'euro' }, { header: 'IVA', key: 'imposta', formato: 'euro' }, { header: 'Totale', key: 'totale', formato: 'euro' },
      { header: 'Da pagare', key: 'da_pagare', formato: 'euro' }, { header: 'Prossima scadenza', key: 'prossima', formato: 'data' }, { header: 'Origine', key: 'origine', width: 10 },
    ], righe.map(d => ({ ...d, fornitore: d.ragione_sociale ?? d.intestatario?.nome ?? '', tipo: d.tipo === 'nota_credito' ? 'Nota di credito' : 'Fattura' }))));
    const pag = paginata(righe, req.query as Record<string, unknown>);
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
      ${tastiAcquisti('/amministrazione/ricevuti')}
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
          <a href="/amministrazione/spese">+ Spesa senza fattura elettronica</a>
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
        <tbody>${pag.righe.map(d => html`<tr class="${d.prossima && d.prossima < oggi ? 'scaduta' : ''}">
          <td>${data(d.data)}</td><td>${d.ragione_sociale ?? d.intestatario?.nome ?? ''}</td>
          <td><a href="/amministrazione/ricevuti/${d.id}">${d.tipo === 'nota_credito' ? html`<span class="etichetta">NC</span> ` : ''}${d.numero || 'senza n.'}</a></td>
          <td><span class="nota taglia">${d.descrizione ?? ''}</span></td>
          <td class="num">${euro(Number(d.imponibile))}</td><td class="num">${euro(Number(d.totale))}</td>
          <td class="num">${d.da_pagare ? euro(d.da_pagare) : ''}</td><td>${d.prossima ? data(d.prossima) : ''}</td></tr>`)}</tbody></table></div>${pag.barra}`, msg(req)));
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
      ${tastiAcquisti('/amministrazione/ricevuti/mesi')}
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
      ${elencoScadenze(scadenze, 'ricevuti', await caricaModiPagamento())}
      ${d.xml ? html`<p><a class="bottone" href="/amministrazione/ricevuti/${id}/xml">Scarica XML</a></p>` : ''}
      ${d.origine === 'manuale' && !d.elettronica ? html`<form method="post" action="/amministrazione/spese/${id}/elimina" data-conferma="Eliminare questa spesa?"><button class="pericolo">Elimina la spesa</button></form>` : ''}`, msg(req)));
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
    const { modi } = annulla ? { modi: [] as string[] } : await caricaModiPagamento();
    const s = await q1<{ documento_id: number }>(`UPDATE ${SCADENZE[sezione]} SET pagata_il = $2, conto = $3, modo = $4 WHERE id = $1 RETURNING documento_id`,
      [Number(req.params.id), annulla ? null : giorno, annulla ? null : String(req.body.conto ?? '').trim() || null, annulla ? null : modoPagamento(req.body.modo, modi)]);
    const parola = sezione === 'documenti' ? 'incassata' : 'pagata';
    // fattura tutta incassata: le sue note di credito aperte si chiudono come "Compensato con fattura"
    const compensate = s && sezione === 'documenti' && !annulla ? await compensaNoteCredito([s.documento_id]) : 0;
    const torna = ritornoSicuro(req.body.torna);
    if (s && torna) return res.redirect(`${torna}${torna.includes('?') ? '&' : '?'}msg=${encodeURIComponent(annulla ? `Rata segnata come non ${parola}.` : `Rata segnata come ${parola}.${compensate ? ' Nota di credito chiusa: compensata con questa fattura.' : ''}`)}`);
    res.redirect(s ? `/amministrazione/${sezione}/${s.documento_id}?msg=${encodeURIComponent(annulla ? `Rata segnata come non ${parola}.` : `Rata segnata come ${parola}.${compensate ? ' Nota di credito chiusa: compensata con questa fattura.' : ''}`)}`
      : '/amministrazione');
  });

  return r;
}
