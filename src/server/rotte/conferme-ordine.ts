/**
 * Conferma d'ordine dalla scheda dell'ordine (Adriano, 28/10/2026): "Prepara conferma d'ordine" copia righe e date
 * di consegna dell'ordine in una bozza modificabile → Emetti (numero e PDF salvato) → Invia con Gmail in risposta
 * all'email dell'ordine. Senza la delega di Gmail il PDF si scarica e si manda a mano.
 */
import { Router } from 'express';
import { q1 } from '../db.js';
import { caricaCondizioniPagamento } from '../amministrazione-servizio.js';
import {
  creaConferma, eliminaOAnnulla, emettiConferma, inviaConferma, leggiConferma, pdfConferma, propostaEmail, salvaConferma,
} from '../conferme-ordine-servizio.js';
import { controlliEmissione, importoRigaConferma, totaleConferma } from '../../engine/conferme-ordine.js';
import { pagina } from './ordini.js';
import { html, data, euro, raw } from '../views/html.js';
import { prodottiPerCliente } from '../anagrafiche-servizio.js';
import { cellaCodice, cellaDescrizione, riquadriSceltaProdotto, type ProdottoScelta } from '../views/scelta-prodotto.js';

export const STATI_CONFERMA: Record<string, [string, string]> = {
  bozza: ['bozza', ''], emesso: ['emessa', 'accettato'], inviato: ['inviata', 'inviato'], annullato: ['annullata', 'rifiutato'],
};
export const statoConferma = (s: string) => { const [t, k] = STATI_CONFERMA[s] ?? [s, '']; return html`<span class="stato ${k}">${t}</span>`; };

export function rotteConferme() {
  const r = Router();
  const indirizzo = (ordine: number | string, id: number | string, msg?: string) =>
    `/ordini/${ordine}/conferme/${id}${msg ? `?msg=${encodeURIComponent(msg)}` : ''}`;

  r.post('/:id/conferme', async (req, res) => {
    try {
      const id = await creaConferma(Number(req.params.id), req.session.utente?.id ?? null);
      res.redirect(indirizzo(req.params.id, id, 'Conferma preparata con le righe e le date dell\'ordine: controlla, correggi e poi Emetti.'));
    } catch (e: any) {
      res.redirect(`/ordini/${req.params.id}?msg=${encodeURIComponent(e?.message ?? String(e))}`);
    }
  });

  r.get('/:id/conferme/:cid', async (req, res) => {
    const x = await leggiConferma(Number(req.params.cid));
    if (!x || x.d.ordine_id !== Number(req.params.id)) return res.status(404).send('Conferma non trovata');
    const { d, righe } = x;
    const o = await q1(`SELECT id, numero, anno FROM ordini WHERE id = $1`, [d.ordine_id]);
    const [condizioni, email] = await Promise.all([caricaCondizioniPagamento(true), d.numero ? propostaEmail(d.id) : Promise.resolve(null)]);
    const emessa = !!d.numero, annullata = d.stato === 'annullato';
    const errori = emessa ? [] : controlliEmissione(righe);
    const base = indirizzo(o.id, d.id);
    // codice solo dall'anagrafica del cliente (Adriano 31/10/2026)
    const prodotti = d.cliente_id ? await prodottiPerCliente(d.cliente_id) as ProdottoScelta[] : [];
    const rigaModulo = (x: any, i: number) => html`<tr>
      <td>${cellaCodice(x, i, prodotti)}<input type="hidden" name="righe[${i}][riga_ordine_id]" value="${x.riga_ordine_id ?? ''}"></td>
      <td class="largo">${cellaDescrizione(x, i, prodotti, 'maiuscolo')}</td>
      <td><input name="righe[${i}][quantita]" value="${x.quantita ?? ''}" class="corto" inputmode="decimal"></td>
      <td><input name="righe[${i}][prezzo]" value="${x.prezzo ?? ''}" class="corto" inputmode="decimal"></td>
      <td><input type="date" name="righe[${i}][consegna]" value="${x.consegna ?? ''}"></td>
      <td class="n">${x.quantita != null ? html`<span class="nota">${euro(importoRigaConferma(x))}</span>` : ''}</td>
      <td><input type="checkbox" name="righe[${i}][togli]" title="Togli questa riga al salvataggio"></td>
    </tr>`;
    const titolo = `Conferma d'ordine ${emessa ? `n. ${d.numero}/${d.anno}` : '(bozza)'}`;
    res.send(pagina(req.session.utente, titolo, '', html`
      <div class="intestazione-pagina"><h2>${titolo} ${statoConferma(d.stato)}</h2>
        <a href="/ordini/${o.id}">← Ordine ${o.numero}/${o.anno}</a></div>
      <p>Cliente <b>${d.intestatario?.ragione_sociale ?? d.ragione_sociale}</b>${d.email_inviata_il
        ? html` · inviata a ${d.email_a} il ${new Date(d.email_inviata_il).toLocaleString('it-IT', { timeZone: 'Europe/Rome', dateStyle: 'short', timeStyle: 'short' })}` : ''}</p>
      ${emessa && !annullata ? html`<p class="nota">La conferma è già emessa: se la correggi e salvi, il PDF si rifà con lo stesso numero${d.email_inviata_il ? ' (poi rimandala al cliente)' : ''}.</p>` : ''}
      <form method="post" action="${base}" class="blocco" id="modulo-documento">
        <div class="riga-campi">
          <label class="stretto">Data <input type="date" name="data" value="${d.data}" required></label>
          <label>Vostro ordine n. <input name="riferimento_esterno" value="${d.riferimento_esterno ?? ''}" class="maiuscolo"></label>
          <label class="stretto">del <input type="date" name="data_riferimento" value="${d.data_riferimento ?? ''}"></label>
          <label>Pagamento <select name="condizione_pagamento"><option value="">Da concordare</option>${condizioni.map(c =>
            html`<option value="${c.codice}" ${d.condizione_pagamento === c.codice ? raw('selected') : ''}>${c.descrizione}</option>`)}</select></label>
        </div>
        <label>Note (stampate sulla conferma) <textarea name="note" rows="2">${d.note ?? ''}</textarea></label>
        <div class="tabella-scorre"><table class="editor" id="righe-documento">
          <thead><tr><th>Codice</th><th>Descrizione</th><th>Q.tà</th><th>Prezzo €</th><th>Consegna</th><th class="n">Importo</th><th title="Togli la riga">Togli</th></tr></thead>
          <tbody>${[...righe, {}].map(rigaModulo)}</tbody>
        </table></div>
        ${riquadriSceltaProdotto(d.cliente_id)}
        <div class="barra-azioni"><button type="button" id="aggiungi-riga">+ Riga</button>
          <span class="nota">Righe e date vengono dall'ordine: si cambiano qui senza toccare l'ordine. Una riga per ogni consegna.</span>
          <button class="primario">Salva</button></div>
      </form>
      <div class="blocco">
        <p class="totali-documento"><strong>Totale ${euro(totaleConferma(righe))}</strong> IVA esclusa · ${righe.length} righe</p>
        ${errori.length ? html`<p><strong>Da sistemare prima di emettere:</strong></p><ul class="controlli errori">${errori.map(e => html`<li>${e}</li>`)}</ul>` : ''}
        <div class="azioni-secondarie">
          <a class="bottone" href="${base}/pdf" target="_blank" rel="noopener">${emessa ? 'Apri il PDF' : 'Anteprima PDF'}</a>
          ${emessa ? '' : html`<form method="post" action="${base}/emetti" class="inline"
            data-conferma="Emettere la conferma d'ordine? Prende il numero successivo e il PDF si salva (si potrà ancora correggere).">
            <button class="primario" ${errori.length ? raw('disabled') : ''}>Emetti</button></form>`}
          ${annullata ? '' : html`<form method="post" action="${base}/elimina" class="inline"
            data-conferma="${emessa ? 'Annullare questa conferma emessa? Resta nell\'elenco come annullata e il numero non si riusa.' : 'Eliminare questa bozza di conferma?'}">
            <button class="pericolo">${emessa ? 'Annulla conferma' : 'Elimina bozza'}</button></form>`}
        </div>
      </div>
      ${email && !annullata ? html`<form method="post" action="${base}/invia" class="blocco"
          data-conferma="Mandare la conferma d'ordine con il PDF allegato?">
        <h2>Invia al cliente</h2>
        ${email.origine ? html`<p class="nota">Risposta all'email dell'ordine "${email.origine.oggetto}" di ${email.origine.mittente}: arriva nella stessa conversazione.</p>`
          : html`<p class="nota">L'ordine non è arrivato da un'email letta dal portale: l'email parte nuova (destinatario proposto: email amministrativa del cliente).</p>`}
        <div class="riga-campi">
          <label class="largo">A <input name="a" value="${email.a}" placeholder="indirizzo@cliente.it (più indirizzi separati da virgola)"></label>
          <label>Cc <input name="cc" value=""></label>
        </div>
        <label>Oggetto <input name="oggetto" value="${email.oggetto}"></label>
        <label>Testo <textarea name="testo" rows="9">${email.testo}</textarea></label>
        <div class="barra-azioni">
          <span class="nota">${email.attivo ? html`Parte da ${email.mittente} con allegato il PDF della conferma.`
            : html`<b>Invio con Gmail non ancora attivo</b> (manca la delega di Google Workspace per info@): scarica il PDF e mandalo dalla posta. Quando la delega c'è, questo pulsante funziona da solo.`}</span>
          <button class="primario" ${email.attivo ? '' : raw('disabled')}>Invia con Gmail</button>
        </div>
      </form>` : ''}`, { avviso: req.query.msg ? String(req.query.msg) : undefined, script: 'documenti.js' }));
  });

  r.post('/:id/conferme/:cid', async (req, res) => {
    const errori = await salvaConferma(Number(req.params.cid), req.body);
    res.redirect(indirizzo(req.params.id, req.params.cid, errori.length ? `Non salvato: ${errori.join(' ')}` : 'Salvato.'));
  });

  r.get('/:id/conferme/:cid/pdf', async (req, res) => {
    try {
      const pdf = await pdfConferma(Number(req.params.cid));
      res.type('application/pdf').setHeader('Content-Disposition', `inline; filename="${pdf.nome}"`);
      res.send(pdf.dati);
    } catch (e: any) { res.status(404).send(e?.message ?? 'Conferma non trovata'); }
  });

  r.post('/:id/conferme/:cid/emetti', async (req, res) => {
    const esito = await emettiConferma(Number(req.params.cid));
    res.redirect(indirizzo(req.params.id, req.params.cid, 'errori' in esito ? `Non emessa: ${esito.errori.join(' ')}`
      : `Emessa con il n. ${esito.numero}: il PDF è salvato. Ora puoi mandarla al cliente.`));
  });

  r.post('/:id/conferme/:cid/invia', async (req, res) => {
    try {
      const a = await inviaConferma(Number(req.params.cid), req.body);
      res.redirect(indirizzo(req.params.id, req.params.cid, `Email inviata a ${a}.`));
    } catch (e: any) {
      res.redirect(indirizzo(req.params.id, req.params.cid, `Email non inviata: ${e?.message ?? e}`));
    }
  });

  r.post('/:id/conferme/:cid/elimina', async (req, res) => {
    const esito = await eliminaOAnnulla(Number(req.params.cid));
    if (esito === 'annullata') return res.redirect(indirizzo(req.params.id, req.params.cid, 'Conferma annullata.'));
    res.redirect(`/ordini/${req.params.id}?msg=${encodeURIComponent(esito ? 'Bozza della conferma eliminata.' : 'Conferma non trovata.')}`);
  });

  return r;
}
