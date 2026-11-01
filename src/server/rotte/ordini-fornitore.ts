/**
 * Ordini a fornitore (Adriano, 31/10/2026): Ordini → Ordini a fornitore. Elenco con le spunte (Duplica, Elimina),
 * "+ Nuovo ordine" con il fornitore SOLO dall'anagrafica, bozza → Emetti (numero e PDF) → Invia con Gmail,
 * arrivo della merce riga per riga, fattura del fornitore collegata. Dalla BOM quotata: un ordine per distributore.
 */
import { Router } from 'express';
import { caricaCondizioniPagamento } from '../amministrazione-servizio.js';
import { riquadriSceltaProdotto } from '../views/scelta-prodotto.js';
import {
  anteprimaOrdiniDaBom, collegaFattura, commessePerOrdini, creaOrdineFornitore, csvOrdine, duplicaOrdineFornitore, elencoOrdiniFornitore, eliminaOAnnullaOrdine,
  emettiOrdineFornitore, fattureCollegabili, fornitoriPerOrdini, inviaOrdineFornitore, leggiOrdineFornitore, ordiniDaBom, pdfOrdineFornitore, propostaEmailOrdine,
  salvaOrdineFornitore, segnaArrivi, ultimoNumeroOrdini,
} from '../ordini-fornitore-servizio.js';
import { controlliEmissioneOrdine, avvisoNumerazione, NOMI_ARRIVO, type StatoArrivo } from '../../engine/ordini-fornitore.js';
import { importoRigaConferma, totaleConferma } from '../../engine/conferme-ordine.js';
import { nomeFornitore } from '../codifica-servizio.js';
import { pagina } from './ordini.js';
import { casella, casellaTutti, conMessaggio, idsSpuntati, moduloAzioni } from '../views/azioni-elenco.js';
import { html, data, euro, num, raw, numCampo } from '../views/html.js';

const STATI: Record<string, [string, string]> = {
  bozza: ['bozza', ''], emesso: ['emesso', 'accettato'], inviato: ['inviato', 'inviato'], annullato: ['annullato', 'rifiutato'],
};
const stato = (s: string) => { const [t, k] = STATI[s] ?? [s, '']; return html`<span class="stato ${k}">${t}</span>`; };
const CLASSE_ARRIVO: Record<StatoArrivo, string> = { da_ricevere: '', parziale: 'parziale', arrivato: 'accettato' };
const arrivo = (a: StatoArrivo) => html`<span class="stato ${CLASSE_ARRIVO[a]}">${NOMI_ARRIVO[a]}</span>`;
const oggiRoma = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
const msg = (base: string, testo: string) => `${base}?msg=${encodeURIComponent(testo)}`;

export function rotteOrdiniFornitore() {
  const r = Router();

  // ── elenco ──
  r.get('/', async (req, res) => {
    const cerca = String(req.query.q ?? '').trim().toUpperCase();
    const vista = String(req.query.vista ?? 'aperti');
    const [tutti, fornitori, ultimo] = await Promise.all([elencoOrdiniFornitore(), fornitoriPerOrdini(), ultimoNumeroOrdini(Number(oggiRoma().slice(0, 4)))]);
    const elenco = tutti.filter(o =>
      (vista === 'tutti' || (o.stato !== 'annullato' && (o.stato === 'bozza' || o.arrivo !== 'arrivato' || !o.fattura))) &&
      (!cerca || [o.fornitore, o.riferimento_esterno, o.commessa, o.numero ? `${o.numero}/${o.anno}` : ''].some(t => String(t ?? '').toUpperCase().includes(cerca))));
    const avviso = avvisoNumerazione(Number(oggiRoma().slice(0, 4)), ultimo);
    const modulo = moduloAzioni({
      azione: '/ordini/fornitori/azioni', nome: { singolare: 'ordine', plurale: 'ordini' },
      extra: html`<input type="hidden" name="torna" value="${req.originalUrl}">`,
      pulsanti: [
        { azione: 'duplica', testo: 'Duplica', serve: '1', titolo: "Nuova bozza con lo stesso fornitore e le stesse righe" },
        { azione: 'elimina', testo: 'Elimina', serve: '1+', pericolo: true, titolo: 'Le bozze si eliminano, gli ordini emessi si annullano (il numero non si riusa)',
          chiedi: 'Eliminare {n} ordin{e|i}? Le bozze spariscono, gli ordini già emessi restano come annullati.' },
      ],
    });
    res.send(pagina(req.session.utente, 'Ordini a fornitore', 'fornitori', html`
      ${avviso ? html`<div class="avviso info">${avviso}</div>` : ''}
      <div class="blocco">
        <form method="post" action="/ordini/fornitori/nuovo" class="riga-campi">
          <label class="largo">Fornitore (dall'anagrafica) <select name="fornitore_id" required><option value="">— scegli —</option>
            ${fornitori.map(f => html`<option value="${f.id}">${f.ragione_sociale}</option>`)}</select></label>
          <button class="primario">+ Nuovo ordine</button>
          <span class="nota">Il fornitore non c'è? Aggiungilo in <a href="/anagrafiche/fornitori">Anagrafiche → Fornitori</a>.
            Per i componenti di una BOM: Quotazioni → apri la BOM → «Ordina i componenti».</span>
        </form>
      </div>
      <form method="get" class="filtri">
        <input name="q" value="${String(req.query.q ?? '')}" placeholder="Cerca fornitore, numero, offerta, commessa">
        <select name="vista"><option value="aperti">Da completare (bozze, merce da ricevere o senza fattura)</option>
          <option value="tutti" ${vista === 'tutti' ? raw('selected') : ''}>Tutti</option></select>
        <button>Filtra</button>
      </form>
      ${modulo.apri}
      <table class="elenco">
        <thead><tr>${casellaTutti()}<th>N.</th><th>Data</th><th>Fornitore</th><th>Vostra offerta</th><th>Commessa</th><th>Consegna</th>
          <th class="n">Totale</th><th>Stato</th><th>Merce</th><th>Fattura</th></tr></thead>
        <tbody>${elenco.length ? elenco.map(o => html`<tr>
          ${casella(o.id, o.numero ? `ordine ${o.numero}/${o.anno}` : 'bozza')}
          <td><a href="/ordini/fornitori/${o.id}">${o.numero ? `${o.numero}/${o.anno}` : 'bozza'}</a></td>
          <td>${data(o.data)}</td><td>${o.fornitore ?? html`<span class="nota">da scegliere</span>`}</td>
          <td>${o.riferimento_esterno ?? ''}</td><td>${o.commessa ?? ''}</td><td>${o.prima_consegna ? data(o.prima_consegna) : ''}</td>
          <td class="n">${euro(o.totale)}</td><td>${stato(o.stato)}</td>
          <td>${o.stato === 'bozza' || o.stato === 'annullato' ? '' : arrivo(o.arrivo)}</td><td>${o.fattura ?? ''}</td>
        </tr>`) : html`<tr><td colspan="11" class="nota">Nessun ordine${vista === 'tutti' ? '' : ' da completare'}.</td></tr>`}</tbody>
      </table>
      ${modulo.chiudi}`, { avviso: req.query.msg ? String(req.query.msg) : undefined }));
  });

  r.post('/nuovo', async (req, res) => {
    const id = await creaOrdineFornitore(Number(req.body.fornitore_id) || null, req.session.utente?.id ?? null);
    res.redirect(msg(`/ordini/fornitori/${id}`, 'Bozza creata: scrivi le righe, salva e poi Emetti.'));
  });

  r.post('/azioni', async (req, res) => {
    const ids = idsSpuntati(req.body);
    const indietro = /^\/ordini\/fornitori(\?|$)/.test(String(req.body?.torna ?? '')) ? String(req.body.torna) : '/ordini/fornitori';
    const torna = (t: string) => res.redirect(conMessaggio(indietro, t));
    if (!ids.length) return torna('Seleziona almeno un ordine.');
    const azione = String(req.body?.azione ?? '');
    if (azione === 'duplica') {
      const id = await duplicaOrdineFornitore(ids[0], req.session.utente?.id ?? null);
      return id ? res.redirect(msg(`/ordini/fornitori/${id}`, 'Copia creata come bozza con la data di oggi: controlla quantità e prezzi.')) : torna('Ordine non trovato.');
    }
    if (azione === 'elimina') {
      let eliminati = 0, annullati = 0;
      for (const id of ids) { const e = await eliminaOAnnullaOrdine(id); if (e === 'eliminato') eliminati++; if (e === 'annullato') annullati++; }
      return torna([eliminati ? `${eliminati} bozz${eliminati === 1 ? 'a eliminata' : 'e eliminate'}` : '', annullati ? `${annullati} ordin${annullati === 1 ? 'e annullato' : 'i annullati'}` : '']
        .filter(Boolean).join(', ') + '.');
    }
    torna('Azione non riconosciuta.');
  });

  // ── dalla BOM quotata (Quotazioni → BOM → «Ordina i componenti») ──
  r.get('/bom/:bom', async (req, res) => {
    const x = await anteprimaOrdiniDaBom(Number(req.params.bom), Number(req.query.schede) || 0);
    if (!x) return res.status(404).send('BOM non trovata');
    res.send(pagina(req.session.utente, 'Ordini dalla BOM', 'fornitori', html`
      <div class="intestazione-pagina"><h2>Ordina i componenti della BOM ${x.bom.nome}</h2><a href="/quotazioni/bom/${x.bom.id}">← BOM</a></div>
      ${x.bom.quantita.length > 1 ? html`<form method="get" class="filtri"><label>Per <select name="schede">${x.bom.quantita.map(n =>
        html`<option value="${n}" ${n === x.schede ? raw('selected') : ''}>${num(n, 0)} schede</option>`)}</select></label><button>Cambia</button></form>` : ''}
      <p>Righe e quantità (con lo scarto) vengono dalla quotazione per <b>${num(x.schede ?? 0, 0)} schede</b>, divise per il distributore che costa meno.
        Si crea una bozza per ogni distributore spuntato: la controlli, la emetti e la usi per l'ordine sul sito (c'è il file per il carrello).</p>
      ${x.senzaPrezzo.length ? html`<div class="avviso info">${x.senzaPrezzo.length} righe senza prezzo restano fuori: ${x.senzaPrezzo.slice(0, 15).join(', ')}${x.senzaPrezzo.length > 15 ? '…' : ''}.</div>` : ''}
      ${x.gruppi.length ? html`<form method="post" class="blocco">
        <input type="hidden" name="schede" value="${x.schede}">
        <table class="elenco"><thead><tr><th></th><th>Distributore</th><th class="n">Righe</th><th class="n">Totale</th><th>Fornitore in anagrafica</th></tr></thead>
        <tbody>${x.gruppi.map(g => html`<tr>
          <td><input type="checkbox" name="distributore" value="${g.distributore}" ${g.distributore === 'manuale' ? '' : raw('checked')}></td>
          <td>${nomeFornitore(g.distributore as any)}${g.nonDisponibili ? html` <span class="nota">· ${g.nonDisponibili} non disponibili in quantità</span>` : ''}</td>
          <td class="n">${g.righe.length}</td><td class="n">${euro(g.totale)}</td>
          <td><select name="fornitore_${g.distributore}"><option value="">— scegli —</option>${x.fornitori.map(f =>
            html`<option value="${f.id}" ${g.fornitore?.id === f.id ? raw('selected') : ''}>${f.ragione_sociale}</option>`)}</select></td>
        </tr>`)}</tbody></table>
        <div class="barra-azioni"><span class="nota">Le righe "prezzo a mano" non hanno un distributore: se le spunti scegli tu il fornitore.</span>
          <button class="primario">Crea le bozze degli ordini</button></div>
      </form>` : html`<p class="nota">Nessuna riga con un prezzo da ordinare per questa quantità.</p>`}`));
  });

  r.post('/bom/:bom', async (req, res) => {
    const e = await ordiniDaBom(Number(req.params.bom), req.body, req.session.utente?.id ?? null);
    if (e.errori.length) return res.redirect(msg(`/ordini/fornitori/bom/${req.params.bom}`, e.errori.join(' ')) + `&schede=${Number(req.body.schede) || ''}`);
    if (e.ids.length === 1) return res.redirect(msg(`/ordini/fornitori/${e.ids[0]}`, 'Bozza creata dalla BOM: controlla e poi Emetti.'));
    res.redirect(msg('/ordini/fornitori', `Create ${e.ids.length} bozze dalla BOM, una per distributore.`));
  });

  // ── un ordine ──
  r.get('/:id', async (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return next();
    const x = await leggiOrdineFornitore(Number(req.params.id));
    if (!x) return res.status(404).send('Ordine non trovato');
    const { d, righe } = x;
    const emesso = !!d.numero, annullato = d.stato === 'annullato';
    const [condizioni, fornitori, commesse, email, fatture, ultimo] = await Promise.all([
      caricaCondizioniPagamento(true), emesso ? Promise.resolve([]) : fornitoriPerOrdini(), commessePerOrdini(),
      emesso && !annullato ? propostaEmailOrdine(d.id) : Promise.resolve(null),
      emesso && d.fornitore_id ? fattureCollegabili(d.fornitore_id, d.data, d.id) : Promise.resolve([]),
      emesso ? Promise.resolve(null) : ultimoNumeroOrdini(d.anno),
    ]);
    const errori = emesso ? [] : controlliEmissioneOrdine({ fornitoreId: d.fornitore_id }, righe);
    const avviso = emesso ? null : avvisoNumerazione(d.anno, ultimo);
    const base = `/ordini/fornitori/${d.id}`;
    const rigaModulo = (x: any, i: number) => html`<tr>
      <td><input name="righe[${i}][codice]" value="${x.codice ?? ''}" class="codice maiuscolo cerca-componente" list="componenti-trovati" autocomplete="off"
        title="Scrivi il P/N o il codice: il menu propone i componenti dell'archivio (Anagrafiche → Componenti)"></td>
      <td class="largo"><input name="righe[${i}][descrizione]" value="${x.descrizione ?? ''}" class="maiuscolo"></td>
      <td><input name="righe[${i}][quantita]" value="${numCampo(x.quantita)}" class="corto" inputmode="decimal"></td>
      <td><input name="righe[${i}][prezzo]" value="${numCampo(x.prezzo)}" class="corto" inputmode="decimal"></td>
      <td><input type="date" name="righe[${i}][consegna]" value="${x.consegna ?? ''}"></td>
      <td class="n">${x.quantita != null ? html`<span class="nota">${euro(importoRigaConferma(x))}</span>` : ''}</td>
      <td><input type="checkbox" name="righe[${i}][togli]" title="Togli questa riga al salvataggio"></td>
    </tr>`;
    const titolo = `Ordine a fornitore ${emesso ? `n. ${d.numero}/${d.anno}` : '(bozza)'}`;
    const nomeFornitoreOrdine = d.intestatario?.ragione_sociale ?? d.ragione_sociale;
    res.send(pagina(req.session.utente, titolo, 'fornitori', html`
      <div class="intestazione-pagina"><h2>${titolo} ${stato(d.stato)} ${emesso && !annullato ? arrivo(x.arrivo) : ''}</h2>
        <a href="/ordini/fornitori">← Ordini a fornitore</a></div>
      ${avviso ? html`<div class="avviso info">${avviso}</div>` : ''}
      <p>${nomeFornitoreOrdine ? html`Fornitore <b>${nomeFornitoreOrdine}</b>` : html`<b>Fornitore da scegliere</b>`}${d.bom_id
        ? html` · dalla BOM <a href="/quotazioni/bom/${d.bom_id}">${d.bom_nome ?? d.bom_id}</a>` : ''}${d.email_inviata_il
        ? html` · inviato a ${d.email_a} il ${new Date(d.email_inviata_il).toLocaleString('it-IT', { timeZone: 'Europe/Rome', dateStyle: 'short', timeStyle: 'short' })}` : ''}</p>
      ${emesso && !annullato ? html`<p class="nota">L'ordine è già emesso: se lo correggi e salvi, il PDF si rifà con lo stesso numero${d.email_inviata_il ? ' (poi rimandalo al fornitore)' : ''}. Il fornitore non si cambia più.</p>` : ''}
      <form method="post" action="${base}" class="blocco" id="modulo-documento">
        <div class="riga-campi">
          ${emesso ? html`<input type="hidden" name="fornitore_id" value="${d.fornitore_id ?? ''}">` : html`<label class="largo">Fornitore
            <select name="fornitore_id"><option value="">— scegli dall'anagrafica —</option>${fornitori.map(f =>
              html`<option value="${f.id}" ${d.fornitore_id === f.id ? raw('selected') : ''}>${f.ragione_sociale}</option>`)}</select></label>`}
          <label class="stretto">Data <input type="date" name="data" value="${d.data}" required></label>
          <label>Vostra offerta n. <input name="riferimento_esterno" value="${d.riferimento_esterno ?? ''}" class="maiuscolo"></label>
          <label class="stretto">del <input type="date" name="data_riferimento" value="${d.data_riferimento ?? ''}"></label>
        </div>
        <div class="riga-campi">
          <label>Pagamento <select name="condizione_pagamento"><option value="">Da concordare</option>${condizioni.map(c =>
            html`<option value="${c.codice}" ${d.condizione_pagamento === c.codice ? raw('selected') : ''}>${c.descrizione}</option>`)}</select></label>
          <label>Per la commessa <select name="commessa_id"><option value="">—</option>${[...commesse, ...(d.commessa_id && !commesse.some(c => c.id === d.commessa_id)
            ? [{ id: d.commessa_id, numero: d.commessa, cliente: '' }] : [])].map(c =>
            html`<option value="${c.id}" ${d.commessa_id === c.id ? raw('selected') : ''}>${c.numero}${c.cliente ? ` · ${c.cliente}` : ''}</option>`)}</select></label>
        </div>
        <label>Note (stampate sull'ordine) <textarea name="note" rows="2">${d.note ?? ''}</textarea></label>
        <div class="tabella-scorre"><table class="editor" id="righe-documento">
          <thead><tr><th>Codice</th><th>Descrizione</th><th>Q.tà</th><th>Prezzo €</th><th>Consegna</th><th class="n">Importo</th><th title="Togli la riga">Togli</th></tr></thead>
          <tbody>${[...righe, {}].map(rigaModulo)}</tbody>
        </table></div>
        <datalist id="componenti-trovati"></datalist>
        ${riquadriSceltaProdotto(null)}
        <div class="barra-azioni"><button type="button" id="aggiungi-riga">+ Riga</button>
          <span class="nota">Codice: scrivi il P/N e scegli il componente dal menu (archivio di Anagrafiche → Componenti: descrizione e ultimo prezzo arrivano da soli),
            oppure il codice del fornitore. La consegna richiesta non è obbligatoria.</span>
          <button class="primario">Salva</button></div>
      </form>
      <div class="blocco">
        <p class="totali-documento"><strong>Totale ${euro(totaleConferma(righe))}</strong> IVA esclusa · ${righe.length} righe</p>
        ${errori.length ? html`<p><strong>Da sistemare prima di emettere:</strong></p><ul class="controlli errori">${errori.map(e => html`<li>${e}</li>`)}</ul>` : ''}
        <div class="azioni-secondarie">
          <a class="bottone" href="${base}/pdf" target="_blank" rel="noopener">${emesso ? 'Apri il PDF' : 'Anteprima PDF'}</a>
          ${righe.some(k => k.codice) ? html`<a class="bottone" href="${base}/carrello.csv" title="Codice e quantità per caricare il carrello sul sito del distributore">File per il carrello</a>` : ''}
          ${emesso ? '' : html`<form method="post" action="${base}/emetti" class="inline"
            data-conferma="Emettere l'ordine? Prende il numero successivo e il PDF si salva (si potrà ancora correggere).">
            <button class="primario" ${errori.length ? raw('disabled') : ''}>Emetti</button></form>`}
          ${annullato ? '' : html`<form method="post" action="${base}/elimina" class="inline"
            data-conferma="${emesso ? 'Annullare questo ordine emesso? Resta nell\'elenco come annullato e il numero non si riusa.' : 'Eliminare questa bozza?'}">
            <button class="pericolo">${emesso ? 'Annulla ordine' : 'Elimina bozza'}</button></form>`}
        </div>
      </div>
      ${emesso && !annullato ? html`<form method="post" action="${base}/arrivi" class="blocco">
        <h2>Arrivo della merce</h2>
        <table class="elenco"><thead><tr><th>Codice</th><th>Descrizione</th><th class="n">Ordinati</th><th>Arrivati</th><th>Ultimo arrivo</th></tr></thead>
          <tbody>${righe.map(k => html`<tr><td>${k.codice ?? ''}</td><td>${k.descrizione}</td><td class="n">${num(k.quantita, 3)}</td>
            <td><input name="arrivati[p${k.posizione}]" value="${k.arrivati || ''}" class="corto" inputmode="decimal" placeholder="0"></td>
            <td>${k.arrivati_il ? data(k.arrivati_il) : ''}</td></tr>`)}</tbody></table>
        <div class="barra-azioni"><label class="stretto">Arrivati il <input type="date" name="data_arrivo" value="${oggiRoma()}"></label>
          <button name="tutto" value="1" title="Segna tutte le righe come arrivate per intero">Tutto arrivato</button>
          <button class="primario">Salva gli arrivi</button></div>
      </form>
      <form method="post" action="${base}/fattura" class="blocco">
        <h2>Fattura del fornitore</h2>
        ${d.ricevuto_id ? html`<p>Collegata: fattura <a href="/amministrazione/ricevuti/${d.ricevuto_id}">${d.fattura_numero || '?'} del ${data(d.fattura_data)}</a>
          (imponibile ${euro(Number(d.fattura_imponibile))}${Math.abs(Number(d.fattura_imponibile) - Number(d.imponibile)) > 0.01
            ? html`, <b>diverso dall'ordine ${euro(Number(d.imponibile))}</b>` : ''}).</p>` : ''}
        <div class="riga-campi"><label class="largo">Fattura <select name="ricevuto_id"><option value="">— nessuna —</option>${fatture.map(f =>
          html`<option value="${f.id}" ${d.ricevuto_id === f.id ? raw('selected') : ''}>${f.numero || '?'} del ${data(f.data)} · ${euro(Number(f.imponibile))}</option>`)}
          ${d.ricevuto_id && !fatture.some(f => f.id === d.ricevuto_id) ? html`<option value="${d.ricevuto_id}" selected>${d.fattura_numero}</option>` : ''}</select></label>
          <button>Collega</button></div>
        <p class="nota">Le fatture arrivano dallo SdI in Amministrazione → Fatture fornitori; qui compaiono quelle dello stesso fornitore non ancora collegate.</p>
      </form>` : ''}
      ${email ? html`<form method="post" action="${base}/invia" class="blocco" data-conferma="Mandare l'ordine al fornitore con il PDF allegato?">
        <h2>Invia al fornitore</h2>
        <div class="riga-campi">
          <label class="largo">A <input name="a" value="${email.a}" placeholder="ordini@fornitore.it (più indirizzi separati da virgola)"></label>
          <label>Cc <input name="cc" value=""></label>
        </div>
        <label>Oggetto <input name="oggetto" value="${email.oggetto}"></label>
        <label>Testo <textarea name="testo" rows="8">${email.testo}</textarea></label>
        <div class="barra-azioni">
          <span class="nota">${email.attivo ? html`Parte da ${email.mittente} con allegato il PDF dell'ordine.`
            : html`<b>Invio con Gmail non ancora attivo</b> (manca la delega di Google Workspace per info@): scarica il PDF e mandalo dalla posta.`}</span>
          <button class="primario" ${email.attivo ? '' : raw('disabled')}>Invia con Gmail</button>
        </div>
      </form>` : ''}`, { avviso: req.query.msg ? String(req.query.msg) : undefined, script: 'documenti.js' }));
  });

  r.post('/:id', async (req, res) => {
    const errori = await salvaOrdineFornitore(Number(req.params.id), req.body);
    res.redirect(msg(`/ordini/fornitori/${req.params.id}`, errori.length ? `Non salvato: ${errori.join(' ')}` : 'Salvato.'));
  });

  r.get('/:id/pdf', async (req, res) => {
    try {
      const pdf = await pdfOrdineFornitore(Number(req.params.id));
      res.type('application/pdf').setHeader('Content-Disposition', `inline; filename="${pdf.nome}"`);
      res.send(pdf.dati);
    } catch (e: any) { res.status(404).send(e?.message ?? 'Ordine non trovato'); }
  });

  r.get('/:id/carrello.csv', async (req, res) => {
    const f = await csvOrdine(Number(req.params.id));
    if (!f) return res.status(404).send('Ordine non trovato');
    res.type('text/csv; charset=utf-8').setHeader('Content-Disposition', `attachment; filename="${f.nome}"`);
    res.send('﻿' + f.testo);
  });

  r.post('/:id/emetti', async (req, res) => {
    const e = await emettiOrdineFornitore(Number(req.params.id));
    res.redirect(msg(`/ordini/fornitori/${req.params.id}`, 'errori' in e ? `Non emesso: ${e.errori.join(' ')}` : `Emesso con il n. ${e.numero}: il PDF è salvato. Ora puoi mandarlo al fornitore.`));
  });

  r.post('/:id/elimina', async (req, res) => {
    const e = await eliminaOAnnullaOrdine(Number(req.params.id));
    if (e === 'annullato') return res.redirect(msg(`/ordini/fornitori/${req.params.id}`, 'Ordine annullato.'));
    res.redirect(msg('/ordini/fornitori', e ? 'Bozza eliminata.' : 'Ordine non trovato.'));
  });

  r.post('/:id/arrivi', async (req, res) => {
    const e = await segnaArrivi(Number(req.params.id), req.body);
    res.redirect(msg(`/ordini/fornitori/${req.params.id}`, e.errori.length ? `Non salvato: ${e.errori.join(' ')}` : ['Arrivi salvati.', ...e.avvisi].join(' ')));
  });

  r.post('/:id/fattura', async (req, res) => {
    const e = await collegaFattura(Number(req.params.id), Number(req.body.ricevuto_id) || null);
    res.redirect(msg(`/ordini/fornitori/${req.params.id}`, e ?? (Number(req.body.ricevuto_id) ? 'Fattura collegata.' : 'Fattura scollegata.')));
  });

  r.post('/:id/invia', async (req, res) => {
    try {
      const a = await inviaOrdineFornitore(Number(req.params.id), req.body);
      res.redirect(msg(`/ordini/fornitori/${req.params.id}`, `Email inviata a ${a}.`));
    } catch (e: any) {
      res.redirect(msg(`/ordini/fornitori/${req.params.id}`, `Email non inviata: ${e?.message ?? e}`));
    }
  });

  return r;
}
