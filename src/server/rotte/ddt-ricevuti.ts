/**
 * Acquisti → DDT ricevuti (Adriano 6/11/2026): i DDT arrivati dai fornitori (merce ordinata) e dai clienti (materiale per i loro
 * ordini), letti da Da acquisire e confermati dall'ufficio, con le anomalie trovate dall'incrocio con gli ordini.
 * I DDT ancora da confermare stanno in cima e portano alla pagina di controllo in Ordini da e-mail e PDF.
 */
import { annoScelto, contaPerAnno, filtraPerAnno } from '../../engine/anni-elenco.js';
import { barraAnni } from '../views/barra-anni.js';
import { Router } from 'express';
import { layout } from '../views/layout.js';
import { html, data, num, raw } from '../views/html.js';
import { ddtRicevutiDaConfermare, elencoDdtRicevuti, eliminaDdtRicevuto } from '../ddt-ricevuti-servizio.js';
import { NOMI_MITTENTE, riassuntoAnomalie } from '../../engine/ddt-ricevuti.js';

const oraRoma = (d: Date | string | null) => (d ? new Date(d).toLocaleString('it-IT', { timeZone: 'Europe/Rome', dateStyle: 'short', timeStyle: 'short' }) : '');

export function rotteDdtRicevuti() {
  const r = Router();

  r.get('/', async (req, res) => {
    const [daConfermare, elenco] = await Promise.all([ddtRicevutiDaConfermare(), elencoDdtRicevuti()]);
    const filtro = String(req.query.mittente ?? '');
    const anno = annoScelto(req.query);
    const delMittente = elenco.filter(x => !filtro || x.mittente === filtro);
    const righe = filtraPerAnno(delMittente, x => x.data, anno);
    const conAnomalie = righe.filter(x => x.anomalie.length).length;
    res.send(String(layout({ titolo: 'DDT ricevuti', utente: req.session.utente, attiva: 'acquisti', largo: true, script: 'elenco.js',
      avviso: req.query.msg ? String(req.query.msg) : undefined, contenuto: html`
      <div class="intestazione-pagina"><h1>Acquisti · DDT ricevuti</h1>
        <a class="bottone" href="/ordini/acquisire">Carica un DDT (Da acquisire)</a></div>
      <p class="nota">I DDT dei fornitori e dei clienti si scansionano e si mettono nella cartella Google Drive «Da acquisire» (o si caricano da Ordini da e-mail e PDF):
        l'IA li legge, il portale incrocia le righe con gli ordini a fornitore (merce ordinata, pezzi attesi) o con l'anagrafica e gli ordini del cliente
        (materiale in conto lavoro) e segnala le anomalie; alla conferma gli arrivi si scrivono sull'ordine a fornitore.</p>
      ${daConfermare.length ? html`<section class="blocco">
        <h2>Da confermare (${daConfermare.length})</h2>
        <table class="elenco"><thead><tr><th>Arrivato</th><th>File</th><th>Mittente letto</th><th>N. DDT</th><th>Anomalie</th><th>Stato</th></tr></thead>
          <tbody>${daConfermare.map(a => html`<tr class="cliccabile" data-href="/ordini/acquisire/${a.id}">
            <td class="nowrap">${oraRoma(a.creato_il)}</td><td><a href="/ordini/acquisire/${a.id}">${a.nome_file}</a></td>
            <td>${a.proposta?.mittente ?? ''}${a.proposta?.mittenteTipo ? html` <small class="nota">(${NOMI_MITTENTE[a.proposta.mittenteTipo]})</small>` : ''}</td>
            <td>${a.proposta?.numero ?? ''}${a.proposta?.data ? html` del ${data(a.proposta.data)}` : ''}</td>
            <td>${a.proposta?.anomalie?.length ? html`<span class="esito verifica">${riassuntoAnomalie(a.proposta.anomalie)}</span>` : ''}</td>
            <td><span class="stato acq-${a.stato}">${a.stato === 'errore' ? `errore: ${a.errore ?? ''}` : a.stato === 'nuovo' ? 'in lettura' : 'da confermare'}</span></td></tr>`)}</tbody></table>
      </section>` : ''}
      <section class="blocco">
        <h2>Registrati</h2>
        <form method="get" class="filtri"><label>Mittente <select name="mittente">
          <option value="">tutti</option><option value="fornitore" ${filtro === 'fornitore' ? raw('selected') : ''}>fornitori</option><option value="cliente" ${filtro === 'cliente' ? raw('selected') : ''}>clienti</option></select></label>
          ${anno != null ? html`<input type="hidden" name="anno" value="${anno}">` : ''}<button>Filtra</button> ${conAnomalie ? html`<span class="nota">${conAnomalie} con anomalie</span>` : ''}</form>
        ${barraAnni(contaPerAnno(delMittente, x => x.data), anno, '/acquisti/ddt', req.query as Record<string, unknown>)}
        ${righe.length ? html`<div class="tabella-scorre"><table class="elenco">
          <thead><tr><th>Data</th><th>N. DDT</th><th>Mittente</th><th>Da</th><th>Ordine citato</th><th>Ordini collegati</th><th class="n">Righe</th><th>Anomalie</th><th>File</th><th></th></tr></thead>
          <tbody>${righe.map(x => {
            const ordiniFornitore = [...new Set(x.righe.map(k => k.ordine).filter(Boolean))];
            return html`<tr>
              <td>${data(x.data)}</td><td>${x.numero ?? ''}</td>
              <td>${x.mittente === 'fornitore' && x.fornitore_id ? html`<a href="/anagrafiche/fornitori/${x.fornitore_id}">${x.mittente_nome}</a>`
                : x.mittente === 'cliente' && x.cliente_id ? html`<a href="/anagrafiche/clienti/${x.cliente_id}">${x.mittente_nome}</a>` : x.mittente_nome}</td>
              <td>${NOMI_MITTENTE[x.mittente]}</td><td>${x.rif_ordine ?? ''}</td>
              <td>${x.mittente === 'fornitore' ? ordiniFornitore.map(o => html`<a href="/ordini/fornitori/${x.righe.find(k => k.ordine === o)!.ordineId}">${o}</a> `)
                : x.ordine_id ? html`<a href="/ordini/${x.ordine_id}">${x.ordine_numero}/${x.ordine_anno}</a>` : ''}</td>
              <td class="n" data-valore="${x.righe.length}">${x.righe.length}</td>
              <td>${x.anomalie.length ? html`<details><summary class="esito verifica">${riassuntoAnomalie(x.anomalie)}</summary><ul class="nota">${x.anomalie.map(k => html`<li>${k.testo}</li>`)}</ul></details>` : html`<span class="esito ok">ok</span>`}</td>
              <td>${x.acquisizione_id ? html`<a href="/ordini/acquisire/${x.acquisizione_id}">${x.nome_file ?? 'apri'}</a>` : ''}</td>
              <td><form method="post" action="/acquisti/ddt/${x.id}/elimina" class="in-linea"
                data-conferma="Eliminare il DDT ${x.numero ?? ''} di ${x.mittente_nome}? ${x.mittente === 'fornitore' ? "I pezzi tolti dagli arrivati dell'ordine a fornitore." : ''} Il file torna «da confermare» in Da acquisire."><button class="pericolo piccolo">Elimina</button></form></td></tr>`;
          })}</tbody></table></div>
          <p class="nota">Righe: quante righe ha il DDT. «Elimina» serve per un DDT registrato per errore: il file torna da confermare in Ordini da e-mail e PDF.</p>`
        : html`<p class="vuoto">Nessun DDT ricevuto registrato${filtro ? ' per questo filtro' : ''}.</p>`}
      </section>` })));
  });

  r.post('/:id/elimina', async (req, res) => {
    if (/^\d+$/.test(req.params.id)) await eliminaDdtRicevuto(Number(req.params.id));
    res.redirect(`/acquisti/ddt?msg=${encodeURIComponent('DDT eliminato: il file è di nuovo da confermare in Ordini da e-mail e PDF.')}`);
  });

  return r;
}
