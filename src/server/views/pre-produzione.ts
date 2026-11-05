/**
 * Pagina "Pre-produzione" della commessa (Adriano 5/11/2026): in una pagina sola cliente e preventivo, file del cliente,
 * segnalazioni, BOM con le offerte del preventivo e la situazione del materiale, cosa fare / non fare, checklist finale
 * con chi conferma e quando, via libera alla produzione. I dati arrivano da `pre-produzione-servizio.ts`.
 */
import { ETICHETTE_TIPO } from '../../engine/scheda/classifica.js';
import { TITOLI_FOGLIO, type Foglio } from '../../engine/scheda/documentazione.js';
import { NOMI_FORNITORI } from '../../engine/acquisti.js';
import { NOMI_ARRIVO } from '../../engine/ordini-fornitore.js';
import { NOMI_STATO_MATERIALE, firmaLeggibile, materialePronto, type StatoMateriale } from '../../engine/pre-produzione.js';
import type { DatiPreProduzione } from '../pre-produzione-servizio.js';
import { layout, type Utente } from './layout.js';
import { html, data, num, euro, euroUnitario, ore, raw } from './html.js';

const ETICHETTE_LIVELLO: Record<string, string> = { errore: 'Da chiarire', avviso: 'Attenzione', info: 'Nota' };
const CLASSE_STATO: Record<StatoMateriale, string> = { cliente: 'accettato', in_casa: 'evaso', arrivato: 'evaso', parziale: 'parziale', ordinato: 'inviato', da_ordinare: 'rifiutato', senza_prezzo: 'da_evadere', non_montato: 'annullato' };
const kb = (b: number) => b >= 1024 * 1024 ? `${num(b / 1024 / 1024, 1)} MB` : `${num(Math.max(1, b / 1024), 0)} KB`;
const NOMI_SPUNTE: [string, string][] = [
  ['primaProduzione', '1ª produzione'], ['doppiaFaccia', 'SMD TOP + BOT'], ['smdAMano', 'SMD a mano'], ['usaOnda', 'THT a onda'], ['presenteTht', 'THT a mano'],
  ['aoiTop', 'AOI TOP'], ['aoiBot', 'AOI BOT'], ['controlloVisivo', 'controllo visivo'], ['acquistoComponenti', 'componenti comprati da noi'], ['acquistoPcb', 'PCB comprati da noi'],
  ['acquistoLamina', 'lamina std'], ['laminaTrattamenti', 'lamina con trattamenti'], ['etichette', 'etichette'], ['puliziaSaldature', 'pulizia saldature'], ['lavaggioSchede', 'lavaggio'], ['usaSplicing', 'splicing'],
];

export function paginaPreProduzione(utente: Utente | undefined, d: DatiPreProduzione, opz: { messaggio?: string; errore?: string }): string {
  const c = d.commessa, prev = d.prev, i = c.intestazione ?? {}, a = d.pacchetto?.analisi ?? null;
  const viaLibera = d.pp.viaLibera;
  const spunte = NOMI_SPUNTE.filter(([k]) => Number(prev?.parametri?.[k] ?? 0) > 0).map(([, n]) => n);
  const cicloSec = d.fasi.reduce((s, f) => s + f.cicloSec, 0), uomoSec = d.fasi.reduce((s, f) => s + f.uomoSec, 0);
  const segnAperte = a ? a.segnalazioni.filter(s => s.livello !== 'info' && !s.accettata) : [];
  const sede = d.cliente?.sede_operativa_diversa
    ? [d.cliente.sede_op_presso, d.cliente.sede_op_indirizzo, [d.cliente.sede_op_cap, d.cliente.sede_op_comune, d.cliente.sede_op_provincia ? `(${d.cliente.sede_op_provincia})` : ''].filter(Boolean).join(' ')].filter(Boolean).join(', ')
    : [d.cliente?.indirizzo, [d.cliente?.cap, d.cliente?.comune, d.cliente?.provincia ? `(${d.cliente.provincia})` : ''].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const m = d.materiale;
  const storico = d.storico.filter(s => s.numero !== c.numero);
  const programmi = Object.entries(d.scheda.programmi).filter(([, v]) => v.top || v.bot);
  const contaMateriale = m ? (['da_ordinare', 'senza_prezzo', 'ordinato', 'parziale', 'arrivato', 'in_casa', 'cliente'] as StatoMateriale[]).filter(k => m.conta[k]).map(k => `${m.conta[k]} ${NOMI_STATO_MATERIALE[k]}`).join(' · ') : '';
  const fogli = a ? (['TOP', 'BOT', 'THT', 'protezioni'] as Foglio[]).filter(f => f === 'TOP' ? a.conteggi.smdTop > 0 : f === 'BOT' ? a.conteggi.smdBot > 0 : f === 'THT' ? a.conteggi.tht > 0 : a.lavorazione.saldaturaTht === 'onda') : [];
  const stato = viaLibera ? html`<span class="stato accettato" title="${firmaLeggibile(viaLibera)}">via libera alla produzione</span>`
    : html`<span class="stato da_evadere">da confermare: ${d.checklist.fatte}/${d.checklist.totale}</span>`;

  const contenuto = html`
    <div class="intestazione-pagina">
      <h1>Pre-produzione · Commessa ${c.numero} ${stato}</h1>
      <div class="azioni">
        ${opz.messaggio ? html`<span class="nota positivo">${opz.messaggio}</span>` : ''}
        <a class="bottone" href="/commesse/${c.id}">← Commessa</a>
        <a class="bottone" href="/commesse/${c.id}/scheda" target="_blank" rel="noopener">Stampa scheda di produzione</a>
        ${d.bom ? html`<a class="bottone" href="/ordini/fornitori/commessa/${c.id}" title="Componenti mancanti → bozze di ordine a fornitore">Cosa manca</a>` : ''}
        <button class="primario" form="pre-produzione" title="Salva checklist, cosa fare / non fare e materiale in casa">Salva</button>
      </div>
    </div>
    ${viaLibera ? html`<div class="avviso info">Via libera alla produzione dato da <b>${viaLibera.da}</b> il ${firmaLeggibile(viaLibera).split(', ')[1]}.${d.pp.aggiornata && d.pp.aggiornata.il > viaLibera.il ? ` Scheda aggiornata dopo (${firmaLeggibile(d.pp.aggiornata)}).` : ''}</div>`
      : html`<p class="nota">Prima del via libera: rileggi tutto qui sotto, scrivi cosa fare e cosa non fare, conferma ogni voce della checklist in fondo. Chi conferma e quando restano scritti.</p>`}
    <div class="cifre">
      <div class="cifra ${d.checklist.completa ? '' : 'allarme'}"><span>Checklist</span><b>${d.checklist.fatte} / ${d.checklist.totale}</b><small>${d.checklist.completa ? 'tutto confermato' : `${d.checklist.mancanti.length} da confermare`}</small></div>
      <div class="cifra ${segnAperte.length ? 'allarme' : ''}"><span>Segnalazioni aperte</span><b>${a ? segnAperte.length : '—'}</b><small>${a ? 'preanalisi dei documenti' : 'nessun documento del cliente'}</small></div>
      <div class="cifra ${m && !materialePronto(m.conta) ? 'allarme' : ''}"><span>Materiale</span><b>${m ? `${m.conta.da_ordinare + m.conta.senza_prezzo + m.conta.ordinato + m.conta.parziale}` : '—'}</b><small>${m ? `righe non ancora in casa · ${contaMateriale}` : 'nessuna BOM quotata collegata'}</small></div>
      <div class="cifra ${d.alternative.length || d.daVerificare.length ? 'allarme' : ''}"><span>Componenti da chiarire</span><b>${d.alternative.length + d.daVerificare.length}</b><small>${d.alternative.length} alternative da confermare · ${d.daVerificare.length} problemi di acquisto</small></div>
    </div>

    <div class="griglia-scheda-cliente">
      <section class="blocco">
        <h2>1. Cliente, ordine e preventivo</h2>
        <table class="dati-scheda"><tbody>
          <tr><th>Cliente</th><td><a href="/anagrafiche/clienti/${c.cliente_id}">${i.cliente ?? d.cliente?.ragione_sociale}</a>${sede ? html`<br><small class="nota">${d.cliente?.sede_operativa_diversa ? 'sede operativa: ' : ''}${sede}</small>` : ''}${d.cliente?.sede_op_note ? html`<br><small class="nota">${d.cliente.sede_op_note}</small>` : ''}</td></tr>
          <tr><th>Prodotto</th><td><b>${i.codice}</b>${i.revisione ? ` rev. ${i.revisione}` : ''}<br>${i.descrizione ?? ''}</td></tr>
          <tr><th>Commessa</th><td>${num(c.quantita, 0)} schede${c.n_pannelli ? ` · ${num(c.n_pannelli, 0)} pannelli (${num(c.n_schede_pannello, 0)} per pannello)` : ''}${c.primo_lotto ? html` · <span class="etichetta ut">primo lotto</span>` : ''}<br>
            <small class="nota">consegna ${c.data_consegna ? data(c.data_consegna) : 'da scrivere'} · ordine cliente ${c.ordine_cliente || '—'}${c.data_ordine ? ` del ${data(c.data_ordine)}` : ''}${c.referente_cliente ? ` · referente ${c.referente_cliente}` : ''}</small></td></tr>
          <tr><th>Ordine nel portale</th><td>${d.ordine ? html`<a href="/ordini/${d.ordine.id}">Ordine ${d.ordine.numero}/${d.ordine.anno}</a>${d.ordine.rif_cliente ? ` (rif. cliente ${d.ordine.rif_cliente})` : ''}: ${num(d.ordine.quantita, 0)} pz a ${euroUnitario(d.ordine.prezzo)}${d.ordine.consegna ? `, consegna ${data(d.ordine.consegna)}` : ''}
              ${Number(d.ordine.quantita) !== Number(c.quantita) ? html`<br><b class="negativo">Quantità diversa dalla commessa (${num(c.quantita, 0)})</b>` : ''}`
            : html`<span class="nota">nessuna riga d'ordine collegata a questa commessa (si collega dalla pagina dell'ordine, colonna Commessa)</span>`}
            ${d.conferme.length ? html`<br><small class="nota">Conferma d'ordine: ${d.conferme.map((k, n) => html`${n ? ', ' : ''}<a href="/amministrazione/documenti/${k.id}">${k.numero ? `n. ${k.numero}/${k.anno}` : 'bozza'}</a> del ${data(k.data)}`)}</small>` : d.ordine ? html`<br><small class="nota">nessuna conferma d'ordine emessa</small>` : ''}</td></tr>
          <tr><th>Preventivo</th><td>${prev ? html`<a href="/preventivi/${prev.id}">${prev.numero}</a> <span class="stato ${prev.stato}">${String(prev.stato).replace('_', ' ')}</span> · quotate ${num(prev.n_schede, 0)} schede
              ${d.totali ? html`<br>prezzo a scheda <b>${euro(d.totali.prezzoScheda)}</b>${d.totali.unaTantum ? html` · con una tantum ${euro(d.totali.prezzoSchedaConUnaTantum)} (una tantum ${euro(d.totali.unaTantum)})` : ''} · margine ${num(d.totali.margineScheda * 100, 0)} %` : ''}
              ${d.ordine && d.totali && Math.abs(d.ordine.prezzo - d.totali.prezzoScheda) > 0.005 ? html`<br><small class="${d.ordine.prezzo < d.totali.prezzoScheda ? 'negativo' : 'nota'}">prezzo dell'ordine ${euroUnitario(d.ordine.prezzo)} ≠ preventivo ${euroUnitario(d.totali.prezzoScheda)}</small>` : ''}` : '—'}</td></tr>
          <tr><th>Lavorazioni</th><td>${spunte.length ? spunte.join(' · ') : '—'}${a?.lavorazione.saldaturaTht ? html`<br><small class="nota">dai documenti: THT ${a.lavorazione.saldaturaTht === 'onda' ? 'a onda' : 'a mano'} (${a.lavorazione.motivo})</small>` : ''}</td></tr>
          <tr><th>Ore previste del lotto</th><td>ciclo ${ore(cicloSec)} · uomo ${ore(uomoSec)} <small class="nota">(${d.fasi.length} fasi sulla scheda)</small></td></tr>
          <tr><th>Scheda tecnica</th><td>${programmi.length
              ? html`${programmi.map(([k, v]) => html`<span class="etichetta">${k.replace('prog', '')}: ${[v.top, v.bot].filter(Boolean).join(' / ')}</span> `)}${d.scheda.pasta ? html`<span class="etichetta">pasta ${d.scheda.pasta}</span>` : ''}`
              : html`<span class="negativo">programmi e lamine non ancora scritti nella commessa</span>`}</td></tr>
        </tbody></table>
      </section>

      <section class="blocco">
        <h2>2. File Gerber e documentazione tecnica</h2>
        ${d.pacchetto ? html`
          <p>Pacchetto <a href="/preventivi/documenti/${d.pacchetto.id}">${d.pacchetto.nome}</a>${d.pacchetto.analizzato_il ? ` analizzato il ${data(d.pacchetto.analizzato_il)}` : ''}${d.pacchetto.stesso ? '' : html` <b class="negativo">(di un preventivo precedente della stessa revisione: controllare che i file siano gli stessi)</b>`}.</p>
          ${a ? html`<p class="nota">SMD TOP ${a.conteggi.smdTop} · BOT ${a.conteggi.smdBot} · THT ${a.conteggi.tht} · codici ${a.conteggi.item}${a.conteggi.nonMontati ? ` · ${a.conteggi.nonMontati} non montati` : ''}${a.dimensioni ? ` · ${num(a.dimensioni.larghezza, 1)} × ${num(a.dimensioni.altezza, 1)} mm` : ''}${a.lavorazione.saldaturaTht === 'onda' ? ` · protezioni per l'onda: ${d.contesto.protezioniOnda ?? 0} segnate` : ''}</p>` : ''}
          <div class="bottoni"><a class="bottone" href="/preventivi/documenti/${d.pacchetto.id}#visore">Disegno della scheda</a>
            ${fogli.map(f => html`<a class="bottone" href="/preventivi/documenti/${d.pacchetto!.id}/stampa?foglio=${f}" target="_blank" rel="noopener">${TITOLI_FOGLIO[f]}</a>`)}</div>
          <div class="tabella-scorre limitata"><table><thead><tr><th>File</th><th>Tipo</th><th class="n">Dimensione</th><th>Usato</th><th>Note</th></tr></thead><tbody>
            ${d.pacchetto.file.map(f => html`<tr class="${f.usato ? '' : 'non-usato'}"><td class="taglia">${f.byte > 0 && ['bom', 'pick-place', 'gerber', 'foratura', 'gencad'].includes(f.tipo) ? html`<a href="/preventivi/documenti/${d.pacchetto!.id}/file?nome=${encodeURIComponent(f.nome)}" title="Scarica il file conservato nel portale">${f.nome}</a>` : f.nome}</td>
              <td>${ETICHETTE_TIPO[f.tipo] ?? f.tipo}</td><td class="n">${kb(f.byte)}</td><td>${f.usato ? '✓' : ''}</td><td class="nota-file">${f.nota ?? (['pdf', 'disegno-3d', 'immagine', 'odb', 'archivio', 'altro'].includes(f.tipo) ? 'solo in elenco: il file resta sul Drive del cliente' : '')}</td></tr>`)}
          </tbody></table></div>`
        : html`<p class="vuoto">Nessun pacchetto di documenti del cliente collegato al preventivo${prev ? html`. Se i file ci sono, caricali in <a href="/preventivi/documenti">Documenti dei clienti</a> e crea da lì il preventivo, oppure tienili sul Drive e controllali a mano.` : '.'}</p>`}
      </section>
    </div>

    <section class="blocco">
      <h2>3. Note e segnalazioni (preanalisi, preventivo, storico del prodotto)</h2>
      <div class="griglia-scheda-cliente">
        <div>
          <h3>Preanalisi dei documenti</h3>
          ${a ? (a.segnalazioni.length ? html`<ul class="segnalazioni">${(['errore', 'avviso', 'info'] as const).flatMap(lv => [...a.segnalazioni.filter(s => s.livello === lv && !s.accettata), ...a.segnalazioni.filter(s => s.livello === lv && s.accettata)].map(s => html`
              <li class="${lv}${s.accettata ? ' accettata' : ''}"><span class="livello-segn">${s.accettata ? 'Controllata' : ETICHETTE_LIVELLO[lv]}</span> ${s.testo}${s.refs?.length ? html` <small class="nota">(${s.refs.slice(0, 12).join(', ')}${s.refs.length > 12 ? '…' : ''})</small>` : ''}${s.accettata ? html` <small class="nota">— va bene per ${s.accettata.da}, ${data(s.accettata.il)}</small>` : ''}</li>`))}</ul>
              ${segnAperte.length ? html`<p class="nota">Le segnalazioni si chiudono con «Va bene» nella <a href="/preventivi/documenti/${d.pacchetto!.id}#da-controllare">pagina dei documenti</a>, dopo averle chiarite con il cliente.</p>` : ''}`
            : html`<p class="nota">Nessuna incongruenza trovata nei documenti.</p>`) : html`<p class="nota">Nessun documento del cliente analizzato.</p>`}
          ${a?.noteCliente.length ? html`<h3>Note del cliente (dalla BOM)</h3><ul class="note-cliente">${a.noteCliente.map(n => html`<li><b>${n.refs.join(', ')}</b>: ${n.nota}</li>`)}</ul>` : ''}
        </div>
        <div>
          <h3>Note del preventivo</h3>
          ${prev?.note?.trim() ? html`<pre class="testo-note">${prev.note}</pre>` : html`<p class="nota">Nessuna nota nel preventivo.</p>`}
          <h3>Storico del prodotto (commesse precedenti)</h3>
          ${storico.length ? html`<ul class="storico">${storico.map(s => html`<li>${s.testo} <span class="nota">— ${s.origine}${s.numero ? `, commessa ${s.numero}` : ''}, ${data(s.creato_il)}</span></li>`)}</ul>` : html`<p class="nota">Nessuna segnalazione dalle commesse precedenti.</p>`}
          ${c.segnalazioni ? html`<h3>Segnalazioni di questa commessa</h3><p>${c.segnalazioni}</p>` : ''}
          ${d.scheda.noteMontaggio ? html`<h3>Note di montaggio (scheda tecnica)</h3><p>${d.scheda.noteMontaggio}</p>` : ''}
        </div>
      </div>
    </section>

    <form id="pre-produzione" method="post" action="/commesse/${c.id}/pre-produzione" autocomplete="off">
    <section class="blocco">
      <h2>4. BOM con le offerte del preventivo e situazione del materiale</h2>
      ${d.bom ? html`
        <p>BOM <a href="/quotazioni/bom/${d.bom.id}">${d.bom.nome}</a> · quantità quotata <b>${d.bom.schede != null ? num(d.bom.schede, 0) : '—'} schede</b>${d.bom.schede != null && d.bom.schede !== Number(c.quantita) ? html` <span class="nota">(la più vicina alle ${num(c.quantita, 0)} della commessa: quantità e scarti vanno riletti)</span>` : ''}
          · materiale da comprare ${euro(m?.totale ?? 0)}${d.ordiniFornitore.length ? html` · ordini a fornitore: ${d.ordiniFornitore.map((o, k) => html`${k ? ', ' : ''}<a href="/ordini/fornitori/${o.id}">${o.numero ? `${o.numero}/${o.anno}` : `bozza ${o.id}`}</a> ${o.fornitore ?? ''} (${NOMI_ARRIVO[o.arrivo as keyof typeof NOMI_ARRIVO] ?? o.arrivo})`)}` : ' · nessun ordine a fornitore per questa BOM o commessa'}.</p>
        <p class="nota">Stato del materiale: <b>dal cliente</b> = conto lavoro (riga segnata nella BOM o codice in Anagrafiche → Componenti clienti${d.codiciCliente ? `, ${d.codiciCliente} codici di questo cliente` : ''});
          <b>arrivato / ordinato / da ordinare</b> dagli ordini a fornitore collegati; <b>già in casa</b> lo spunti tu per il materiale che c'è già (avanzi, scorte): il portale non ha un magazzino.
          ${contaMateriale ? html`<br>${contaMateriale}.` : ''}</p>
        ${d.alternative.length ? html`<div class="avviso">${d.alternative.length} alternative da confermare con il cliente: ${d.alternative.map(x => `${x.pnBom} → ${x.alternativa}`).join('; ')}.</div>` : ''}
        ${d.daVerificare.length ? html`<div class="avviso">${d.daVerificare.length} componenti con problemi di acquisto: ${d.daVerificare.map(x => `${x.codice} (${x.problema}${x.quotato ? '' : ', non quotato'})`).join('; ')}.</div>` : ''}
        <div class="tabella-scorre limitata"><table class="elenco" data-ordina><thead><tr><th>Rif.</th><th>P/N</th><th>Produttore</th><th>Codice produzione</th><th class="n">Q/scheda</th><th class="n">Lotto</th><th>Distributore · codice</th><th class="n">€/pz</th><th class="n">Totale</th><th>Reperibilità</th><th>Stato</th><th title="Spunta se il materiale è già in azienda">In casa</th></tr></thead>
          <tbody>${m!.righe.map(r => html`<tr class="${r.stato === 'da_ordinare' || r.stato === 'senza_prezzo' ? 'scaduta' : r.stato === 'non_montato' ? 'servizio' : ''}">
            <td class="taglia" title="${r.riga.designatori ?? ''}">${r.riga.designatori ?? ''}</td>
            <td class="nowrap">${r.riga.pn ?? ''}${r.riga.alternativaScelta && r.riga.alternativaScelta !== r.riga.pn ? html`<br><small class="nota">→ ${r.riga.alternativaScelta}</small>` : r.riga.alternativaProposta ? html`<br><small class="negativo">→ ${r.riga.alternativaProposta} (da confermare)</small>` : ''}</td>
            <td>${r.riga.produttore ?? ''}</td><td class="nowrap">${r.riga.codiceProduzione ?? ''}</td>
            <td class="n">${num(r.riga.qtaScheda, 0)}</td><td class="n">${r.lotto != null ? num(r.lotto, 0) : ''}</td>
            <td>${r.scelta ? html`${NOMI_FORNITORI[r.scelta.fornitore as keyof typeof NOMI_FORNITORI] ?? r.scelta.fornitore} <small class="nota">${r.scelta.codice}</small>${r.scelta.disponibile ? '' : html` <span class="etichetta">non disponibile</span>`}` : r.stato === 'cliente' || r.stato === 'non_montato' ? '' : html`<span class="negativo">senza prezzo</span>`}</td>
            <td class="n">${r.scelta ? euroUnitario(r.scelta.prezzo) : ''}</td><td class="n">${r.scelta ? euro(r.scelta.totale) : ''}</td>
            <td>${r.riga.reperibilita ? html`<span class="etichetta ${r.riga.reperibilita.livello}">${r.riga.reperibilita.livello}</span>` : ''}</td>
            <td><span class="stato ${CLASSE_STATO[r.stato]}">${NOMI_STATO_MATERIALE[r.stato]}</span>${r.ordini.length ? html`<br><small class="nota">${r.ordini.join(', ')}${r.arrivata ? ` · arrivati ${num(r.arrivata, 0)}/${num(r.ordinata, 0)}` : ''}</small>` : ''}${r.inCasa ? html`<br><small class="nota">${firmaLeggibile(r.inCasa)}</small>` : ''}</td>
            <td>${r.stato === 'cliente' || r.stato === 'non_montato' ? '' : html`<input type="checkbox" name="inCasa" value="${r.chiave}" ${r.inCasa ? raw('checked') : ''}>`}</td></tr>`)}</tbody></table></div>`
      : html`<p class="vuoto">Nessuna BOM quotata collegata al preventivo${prev ? html`: si collega dal <a href="/preventivi/${prev.id}">preventivo ${prev.numero}</a> (gruppo ACQUISTI → BOM collegata, o spunta Componenti)` : ''}. Senza BOM il portale non sa quali componenti servono: il materiale si controlla a mano.</p>`}
    </section>

    <section class="blocco">
      <h2>5. Cosa fare e cosa non fare in produzione</h2>
      <div class="griglia-scheda-cliente">
        <div>
          <h3>Proposto dal portale</h3>
          <p class="nota">Dalle lavorazioni del preventivo, dalle note del cliente, dallo storico e dalle segnalazioni. Copia nelle caselle quello che vale e aggiungi il resto.</p>
          ${d.proposta.fare.length ? html`<p><b>Da fare</b></p><ul>${d.proposta.fare.map(x => html`<li>${x}</li>`)}</ul>` : ''}
          ${d.proposta.nonFare.length ? html`<p><b>Da non fare</b></p><ul>${d.proposta.nonFare.map(x => html`<li>${x}</li>`)}</ul>` : ''}
        </div>
        <div>
          <label>Cosa fare <textarea name="fare" rows="8" placeholder="Istruzioni per chi lavora la commessa: sequenza, attenzioni, controlli…">${d.pp.fare}</textarea></label>
          <label>Cosa non fare <textarea name="nonFare" rows="6" placeholder="Errori da evitare, componenti da non montare, lavorazioni escluse…">${d.pp.nonFare}</textarea></label>
          <p class="nota">Queste due caselle restano sulla commessa e si rileggono alla prossima pre-produzione dello stesso prodotto.</p>
        </div>
      </div>
    </section>

    <section class="blocco" id="checklist">
      <h2>6. Checklist finale prima del via libera</h2>
      <p class="nota">Ogni voce spuntata prende il nome di chi la conferma e la data al salvataggio. Le voci valgono per questa commessa (lavorazioni del preventivo); se una non si applica, spuntala comunque dopo averlo verificato.</p>
      <ul class="checklist">${d.checklist.voci.map(v => html`<li><label class="spunta"><input type="checkbox" name="spunte" value="${v.voce.chiave}" ${v.firma ? raw('checked') : ''}> ${v.voce.testo}</label>
        ${v.firma ? html`<small class="nota positivo">confermata da ${firmaLeggibile(v.firma)}</small>` : v.voce.nota ? html`<small class="nota">${v.voce.nota}</small>` : ''}</li>`)}</ul>
      <div class="barra-azioni">
        <span class="nota">${d.pp.aggiornata ? `Ultimo salvataggio: ${firmaLeggibile(d.pp.aggiornata)}.` : 'Mai salvata.'}</span>
        <button name="azione" value="salva" class="primario">Salva</button>
        ${viaLibera ? html`<button name="azione" value="togli-via-libera" class="pericolo" data-conferma="Togliere il via libera alla produzione? La commessa torna da confermare (lo stato della commessa non cambia).">Togli il via libera</button>`
          : html`<button name="azione" value="via-libera" class="${d.checklist.completa ? 'primario' : ''}" title="Si dà solo con tutte le voci confermate" data-conferma="Dare il via libera alla produzione della commessa ${c.numero}? Resta scritto chi lo dà e quando; la commessa aperta passa «in produzione».">Via libera alla produzione</button>`}
      </div>
    </section>
    </form>`;
  return String(layout({ titolo: `Pre-produzione · ${c.numero}`, utente, attiva: 'commesse', largo: true, avviso: opz.errore, contenuto }));
}

