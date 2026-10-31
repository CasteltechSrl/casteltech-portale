/**
 * Ordini dei clienti: elenco delle righe (da evadere / evase), scheda dell'ordine con le date del foglio
 * "Schedulazione produzione", cruscotto (fatturato e previsione), Gantt della produzione, fatture senza ordine.
 */
import { Router } from 'express';
import { q, q1, transazione } from '../db.js';
import { salvaBackupSuDisco } from '../backup.js';
import { caricaOreGiorno, righeOrdini, secondiPerSchedaProdotti, type RigaElenco } from '../ordini-servizio.js';
import {
  STATI_ORDINE, VISTE_GANTT, barreNelPeriodo, caricoGiornaliero, consegneDaFare, cruscotto, differenzaGiorni, lavorativo, periodoGantt, pianifica, piuGiorni, statoOrdine,
  type Barra, type DaPianificare, type VistaGantt,
} from '../../engine/ordini.js';
import { confermaEliminaOrdine } from '../../engine/eliminazioni.js';
import { confermeDellOrdine, creaConferma } from '../conferme-ordine-servizio.js';
import { rotteConferme, statoConferma } from './conferme-ordine.js';
import { layout } from '../views/layout.js';
import { casella, casellaTutti, conMessaggio, idsSpuntati, moduloAzioni } from '../views/azioni-elenco.js';
import { html, data, euro, num, raw, type Raw } from '../views/html.js';
import type { Utente } from '../views/layout.js';

const oggiRoma = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const nomeMese = (m: string) => `${MESI[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;

const VISTE = [['cruscotto', 'Cruscotto'], ['aperti', 'Da evadere'], ['evasi', 'Evasi'], ['tutti', 'Tutti'], ['gantt', 'Gantt'], ['fatture', 'Fatture senza ordine'], ['acquisire', 'Da acquisire']] as const;
function schede(attiva: string) {
  return html`<nav class="schede">${VISTE.map(([k, t]) => html`<a href="${k === 'aperti' ? '/ordini' : ['evasi', 'tutti'].includes(k) ? `/ordini?vista=${k}` : `/ordini/${k}`}"
    class="${k === attiva ? 'attiva' : ''}">${t}</a>`)}</nav>`;
}
export const pagina = (utente: Utente | undefined, titolo: string, attiva: string, contenuto: Raw, opz: { avviso?: string; script?: string | string[] } = {}) =>
  // menu a gruppi (31/10/2026): gli ordini a fornitore stanno negli Acquisti (senza le schede degli ordini clienti), il Gantt nella Produzione
  String(layout({ titolo, utente, attiva: attiva === 'fornitori' ? 'acquisti' : attiva === 'gantt' ? 'produzione' : 'ordini', largo: true,
    script: opz.script ?? 'elenco.js', avviso: opz.avviso,
    contenuto: attiva === 'fornitori' ? html`<div class="intestazione-pagina"><h1>Acquisti · Ordini a fornitore</h1></div>${contenuto}`
      : html`<div class="intestazione-pagina"><h1>Ordini clienti</h1></div>${schede(attiva)}${contenuto}` }));

const ritardo = (n: number | null) => (n == null ? '' : n > 0 ? html`<span class="ritardo">+${n} gg</span>` : html`<span class="nota">${n} gg</span>`);

export function rotteOrdini() {
  const r = Router();

  // ── Elenco delle righe ──
  r.get('/', async (req, res) => {
    const vista = ['evasi', 'tutti'].includes(String(req.query.vista)) ? String(req.query.vista) : 'aperti';
    const cerca = String(req.query.q ?? '').trim().toUpperCase();
    const tutte = await righeOrdini();
    let righe = tutte.filter(x =>
      (vista === 'tutti' || (vista === 'evasi' ? ['evaso', 'annullato'].includes(x.stato) : ['da_evadere', 'parziale'].includes(x.stato))) &&
      (!cerca || [x.cliente, x.codice, x.descrizione, x.codiceCliente, x.rifCliente, String(x.numero)].some(t => String(t ?? '').toUpperCase().includes(cerca))));
    righe = vista === 'aperti'
      ? righe.sort((a, b) => (a.consegna ?? '9999').localeCompare(b.consegna ?? '9999') || a.numero - b.numero)
      : righe.sort((a, b) => b.anno - a.anno || b.numero - a.numero);
    const totale = righe.reduce((a, x) => a + x.residuoValore, 0);
    const oggi = oggiRoma();
    const modulo = moduloAzioni({
      azione: '/ordini/azioni', nome: { singolare: 'riga', plurale: 'righe', femminile: true }, gruppi: { singolare: 'ordine', plurale: 'ordini' },
      extra: html`<input type="hidden" name="torna" value="${req.originalUrl}">`,
      pulsanti: [
        { azione: 'conferma', testo: "Conferma d'ordine", serve: '1', titolo: "Prepara la conferma d'ordine dell'ordine selezionato (righe di un solo ordine)" },
        { azione: 'evase', testo: 'Segna evase', serve: '1+', titolo: 'Segna come evase le righe spuntate (consegne non riconosciute dai DDT)',
          chiedi: 'Segnare come evas{a|e} {n} rig{a|he}? Lo stato si può cambiare di nuovo dalla pagina dell\'ordine o con «Stato dai DDT».' },
        { azione: 'automatico', testo: 'Stato dai DDT', serve: '1+', titolo: 'Toglie lo stato scritto a mano: la riga torna da evadere, parziale o evasa secondo i DDT' },
        { azione: 'elimina', testo: 'Elimina', serve: '1+', pericolo: true, titolo: 'Elimina gli ordini delle righe spuntate (tutto l\'ordine, con tutte le sue righe)',
          chiedi: 'Ordini da eliminare: {g}, con TUTTE le loro righe (non solo quelle spuntate). I DDT e le fatture collegate restano, tra le fatture senza ordine.\n\n'
            + 'Un ordine che viene dal file di Impostazioni → Ordini torna se ricarichi lo stesso file; uno letto dall\'IA torna in Da acquisire.\n\n'
            + 'Non si può annullare (prima viene salvato un backup).' },
      ],
    });
    res.send(pagina(req.session.utente, 'Ordini', vista, html`
      <form class="cerca" method="get">${vista !== 'aperti' ? html`<input type="hidden" name="vista" value="${vista}">` : ''}
        <input name="q" value="${req.query.q ?? ''}" placeholder="Cerca cliente, codice, n° ordine, rif. cliente…" type="search"><button>Cerca</button></form>
      ${tutte.length ? '' : html`<p class="vuoto">Nessun ordine nel portale. Si caricano da <a href="/impostazioni/ordini">Impostazioni → Ordini</a>.</p>`}
      ${modulo.apri}
      <div class="tabella-scorre"><table class="elenco ordini">
        <thead><tr>${casellaTutti()}<th>Ordine</th><th>Data</th><th>Cliente</th><th>Rif. cliente</th><th>Codice</th><th>Descrizione</th>
          <th class="n">Q.tà</th><th class="n">Spedite</th><th class="n">Da fare</th><th class="n">Prezzo</th><th class="n">Valore da evadere</th>
          <th>Arrivo mat.</th><th>Consegna richiesta</th><th>Consegna prevista</th><th>Ritardo</th><th>Stato</th></tr></thead>
        <tbody>${righe.map(x => html`
          <tr class="cliccabile ${x.tipo === 'servizio' ? 'servizio' : ''} ${x.consegna && x.consegna < oggi && x.residuoQuantita > 0 ? 'scaduta' : ''}" data-href="/ordini/${x.ordineId}">
            ${casella(x.id, `${x.numero}/${x.anno} ${x.codice ?? x.descrizione ?? ''}`, x.ordineId)}
            <td class="nowrap"><a href="/ordini/${x.ordineId}">${x.numero}/${x.anno}</a></td><td>${data(x.dataOrdine)}</td>
            <td class="taglia">${x.cliente}</td><td>${x.rifCliente}</td><td class="nowrap">${x.codice}</td><td class="taglia">${x.descrizione}</td>
            <td class="n">${num(x.quantita, 0)}</td><td class="n">${x.tipo === 'scheda' ? num(x.quantitaSpedita, 0) : ''}</td>
            <td class="n">${x.residuoQuantita ? num(x.residuoQuantita, 0) : ''}</td><td class="n">${euro(x.prezzo)}</td>
            <td class="n">${x.residuoValore ? euro(x.residuoValore) : ''}</td>
            <td>${data(x.arrivoMateriale)}</td><td>${data(x.consegnaRichiesta)}${x.consegne?.length ? html` <small class="nota" title="consegne a programma">(${x.consegne.length} consegne)</small>` : ''}</td>
            <td>${data(x.prevista)}</td><td>${ritardo(x.ritardo)}</td>
            <td><span class="stato ${x.stato}">${STATI_ORDINE[x.stato]}</span></td>
          </tr>`)}</tbody>
        ${righe.length ? html`<tfoot><tr><td colspan="11">${righe.length} righe</td><td class="n"><b>${euro(totale)}</b></td><td colspan="5"></td></tr></tfoot>` : ''}
      </table></div>
      ${modulo.chiudi}
      <p class="nota">Una riga è <b>evasa</b> quando le schede spedite con DDT arrivano alla quantità ordinata, <b>parziale</b> se ne è partita una parte.
        I DDT caricati nel portale si abbinano da soli (le fatture no: possono essere anticipi) alle righe aperte dello stesso cliente con lo stesso codice.
        Le righe di servizio (programmazione attrezzature, lamine, attrezzaggio, costi una tantum, trasporto) non sono da evadere da sole:
        sono evase quando sono fatturate o quando l'ordine non ha più schede da spedire.
        Consegna prevista = arrivo materiale + ${3} gg + ${5} gg + ritardi di produzione, come nel foglio.</p>`,
      { avviso: req.query.msg ? String(req.query.msg) : undefined }));
  });

  // ── Cruscotto ──
  r.get('/cruscotto', async (req, res) => {
    const oggi = oggiRoma();
    const anno = Number(req.query.anno) || Number(oggi.slice(0, 4));
    const fatture = await q(`SELECT data, imponibile, intestazione FROM fatture_righe WHERE anno = $1`, [anno]);
    const righe = await righeOrdini();
    const c = cruscotto(fatture, righe, oggi, anno);
    const perCliente = new Map<string, number>();
    for (const x of righe) if (x.residuoValore) perCliente.set(x.cliente, (perCliente.get(x.cliente) ?? 0) + x.residuoValore);
    const clienti = [...perCliente].sort((a, b) => b[1] - a[1]);
    const mesiFuturi = c.mesi.filter(m => m.mese >= oggi.slice(0, 7));
    res.send(pagina(req.session.utente, 'Cruscotto ordini', 'cruscotto', html`
      <div class="cifre">
        <div class="cifra"><span>Fatturato ${anno}</span><b>${euro(c.fatturato)}</b><small>fatture emesse fino a oggi</small></div>
        <div class="cifra"><span>Media mensile</span><b>${euro(c.mediaMensile)}</b><small>sui ${c.nMesiChiusi} mesi chiusi</small></div>
        <div class="cifra"><span>Ordini da evadere</span><b>${euro(c.daEvadere)}</b><small>${c.scaduto ? html`di cui ${euro(c.scaduto)} con consegna già passata` : 'nessuna consegna scaduta'}${c.senzaData ? html`, ${euro(c.senzaData)} senza data` : ''}</small></div>
        <div class="cifra"><span>Previsione ${anno}</span><b>${euro(c.previsioneAnno)}</b><small>fatturato + consegne previste entro dicembre</small></div>
      </div>
      <h2>Fatturato e ordini da evadere per mese</h2>
      <div class="legenda"><span class="campione fatturato"></span> fatturato <span class="campione da-evadere"></span> da evadere (consegna prevista o richiesta; le scadute nel mese corrente)</div>
      <div class="tabella-scorre grafico">${graficoMesi(c.mesi)}</div>
      <div class="due-colonne">
        <section><h2>Previsione per mese</h2>
          <div class="tabella-scorre"><table><thead><tr><th>Mese</th><th class="n">Fatturato</th><th class="n">Da evadere</th><th class="n">Totale</th></tr></thead>
          <tbody>${c.mesi.map(m => html`<tr class="${m.mese === oggi.slice(0, 7) ? 'corrente' : ''}"><td>${nomeMese(m.mese)}</td><td class="n">${m.fatturato ? euro(m.fatturato) : ''}</td>
            <td class="n">${m.daEvadere ? euro(m.daEvadere) : ''}</td><td class="n">${euro(m.fatturato + m.daEvadere)}</td></tr>`)}</tbody>
          <tfoot><tr><td>Da questo mese in poi</td><td></td><td class="n"><b>${euro(mesiFuturi.reduce((a, m) => a + m.daEvadere, 0))}</b></td><td></td></tr></tfoot></table></div></section>
        <section><h2>Da evadere per cliente</h2>
          <div class="tabella-scorre"><table><thead><tr><th>Cliente</th><th class="n">Valore</th></tr></thead>
          <tbody>${clienti.map(([n, v]) => html`<tr><td><a href="/ordini?q=${encodeURIComponent(n)}">${n}</a></td><td class="n">${euro(v)}</td></tr>`)}</tbody></table></div></section>
      </div>`));
  });

  // ── Gantt della produzione ──
  r.get('/gantt', async (req, res) => {
    const oggi = oggiRoma();
    const oreGiorno = await caricaOreGiorno();
    const tempi = await secondiPerSchedaProdotti();
    const righe = (await righeOrdini()).filter(x => x.tipo === 'scheda' && x.residuoQuantita > 0);
    const daFare: DaPianificare[] = [];
    const perId = new Map<number, RigaElenco>();
    let progressivo = 0;
    for (const x of righe) {
      for (const k of consegneDaFare(x, x.stato)) {
        const id = ++progressivo;
        perId.set(id, x);
        daFare.push({ id, etichetta: `${x.cliente} · ${x.codice ?? x.descrizione ?? ''}`, quantita: k.quantita, consegna: k.data,
          lavorazione: k.data === x.consegna ? x.lavorazione : null, secondiPerScheda: x.prodottoId ? tempi.get(x.prodottoId) : null });
      }
    }
    const p = periodoGantt(req.query.vista, oggi, req.query.da);
    const tutte = pianifica(daFare, oggi, oreGiorno);
    const barre = barreNelPeriodo(tutte, p);
    const senzaData = righe.filter(x => !x.consegna).length;
    const carico = caricoGiornaliero(tutte);
    const sovraccarichi = Object.entries(carico).filter(([d, o]) => d >= oggi && d >= p.da && d <= p.a && o > oreGiorno).length;
    const link = (vista: string, da?: string) => `/ordini/gantt?vista=${vista}${da ? `&da=${da}` : ''}`;
    res.send(pagina(req.session.utente, 'Gantt produzione', 'gantt', html`
      <div class="comandi-gantt">
        <nav class="scelta-vista">${Object.entries(VISTE_GANTT).map(([k, v]) => html`<a href="${link(k, p.contieneOggi ? undefined : p.da)}" class="${k === p.vista ? 'attiva' : ''}">${v.nome}</a>`)}</nav>
        <nav class="sposta"><a href="${link(p.vista, p.precedente)}" title="Periodo precedente">‹</a><a href="${link(p.vista)}" class="${p.contieneOggi ? 'attiva' : ''}">Oggi</a><a href="${link(p.vista, p.successivo)}" title="Periodo successivo">›</a></nav>
        <b>${data(p.da)} – ${data(p.a)}</b>
      </div>
      <p class="nota">Ogni barra è una consegna ancora da fare: finisce il giorno lavorativo prima della consegna (o parte dalla data di lavorazione = arrivo materiale + 3 gg)
        e dura le ore ciclo del preventivo × quantità ÷ ${num(oreGiorno)} ore al giorno (<a href="/impostazioni/ordini">Impostazioni → Ordini</a>).
        Barre tratteggiate: prodotto senza preventivo, durata di un giorno. ${senzaData ? html`<b>${senzaData} righe senza data di consegna</b> non sono nel Gantt.` : ''}
        ${sovraccarichi ? html`<b class="ritardo">${sovraccarichi} giorni con più ore di lavoro che ore disponibili.</b>` : ''}</p>
      <div class="legenda"><span class="campione barra"></span> lavorazione <span class="campione barra-ritardo"></span> in ritardo (doveva già iniziare) <span class="campione barra-stimata"></span> durata stimata
        <span class="campione consegna"></span> consegna</div>
      <div class="tabella-scorre grafico">${barre.length ? graficoGantt(barre, p, oggi, carico, oreGiorno, id => perId.get(id)!.ordineId) : html`<p class="vuoto">Nessuna lavorazione in questo periodo.</p>`}</div>
      <h2>Elenco</h2>
      <div class="tabella-scorre"><table class="elenco">
        <thead><tr><th>Ordine</th><th>Cliente · codice</th><th class="n">Q.tà</th><th class="n">Ore ciclo</th><th>Inizio</th><th>Fine</th><th>Consegna</th><th></th></tr></thead>
        <tbody>${barre.map(b => { const x = perId.get(b.id)!; return html`<tr class="cliccabile" data-href="/ordini/${x.ordineId}">
          <td><a href="/ordini/${x.ordineId}">${x.numero}/${x.anno}</a></td><td>${b.etichetta}</td><td class="n">${num(daFare[b.id - 1].quantita, 0)}</td>
          <td class="n">${b.ore == null ? html`<span class="nota">senza preventivo</span>` : num(b.ore, 1)}</td><td>${data(b.inizio)}</td><td>${data(b.fine)}</td><td>${data(b.consegna)}</td>
          <td>${b.inRitardo ? html`<span class="ritardo">in ritardo</span>` : ''}</td></tr>`; })}</tbody></table></div>`));
  });

  // ── Fatture senza ordine ──
  r.get('/fatture', async (req, res) => {
    const anno = Number(req.query.anno) || Number(oggiRoma().slice(0, 4));
    const fatture = await q(`
      SELECT numero, min(data) AS data, min(cliente_nome) AS cliente, sum(imponibile) AS imponibile,
        string_agg(coalesce(nullif(codice, ''), descrizione), ' · ' ORDER BY id) AS righe
      FROM fatture_righe WHERE anno = $1 AND NOT intestazione
      GROUP BY numero HAVING bool_and(riga_id IS NULL) AND sum(imponibile) <> 0
      ORDER BY numero`, [anno]);
    const totale = fatture.reduce((a, f) => a + f.imponibile, 0);
    res.send(pagina(req.session.utente, 'Fatture senza ordine', 'fatture', html`
      <p class="nota">Fatture ${anno} in cui nessuna riga è collegata a un ordine (direttamente o tramite il DDT). Possono essere ordini dell'anno prima,
        lavori fatti senza ordine scritto, o fatture da controllare.</p>
      <div class="tabella-scorre"><table class="elenco"><thead><tr><th>Fattura</th><th>Data</th><th>Cliente</th><th>Righe</th><th class="n">Imponibile</th></tr></thead>
        <tbody>${fatture.map(f => html`<tr><td>${f.numero}/${anno}</td><td>${data(f.data)}</td><td>${f.cliente}</td><td class="taglia">${f.righe}</td><td class="n">${euro(f.imponibile)}</td></tr>`)}</tbody>
        <tfoot><tr><td colspan="4">${fatture.length} fatture</td><td class="n"><b>${euro(totale)}</b></td></tr></tfoot></table></div>`));
  });

  // ── Scheda dell'ordine ──
  r.get('/:id', async (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return next();
    const o = await q1(`SELECT o.*, c.ragione_sociale FROM ordini o LEFT JOIN clienti c ON c.id = o.cliente_id WHERE o.id = $1`, [Number(req.params.id)]);
    if (!o) return res.status(404).send('Ordine non trovato');
    const righe = await righeOrdini(o.id);
    const ddt = await q(`SELECT d.*, r.chiave FROM ddt_righe d JOIN ordini_righe r ON r.id = d.riga_id WHERE r.ordine_id = $1 ORDER BY d.data, d.numero`, [o.id]);
    const fatture = await q(`SELECT f.*, r.chiave FROM fatture_righe f JOIN ordini_righe r ON r.id = f.riga_id WHERE r.ordine_id = $1 ORDER BY f.data, f.numero`, [o.id]);
    const commesse = await q(`SELECT id, numero FROM commesse WHERE cliente_id = $1 ORDER BY creato_il DESC LIMIT 50`, [o.cliente_id ?? -1]);
    const conferme = await confermeDellOrdine(o.id);
    const stato = statoOrdine(righe.map(x => x.stato));
    const spedizioni = righe.flatMap(x => x.spedizioni).sort((a, b) => a.data.localeCompare(b.data));
    const campoData = (nome: string, v: string | null | undefined) => html`<input type="date" name="${nome}" value="${v ?? ''}">`;
    const ddtPortale = await q(`SELECT DISTINCT d.id, d.numero, d.data, d.stato FROM documenti d LEFT JOIN documenti_righe x ON x.documento_id = d.id
      LEFT JOIN ordini_righe y ON y.id = x.riga_ordine_id
      WHERE d.tipo = 'ddt' AND d.stato <> 'annullato' AND (d.ordine_id = $1 OR y.ordine_id = $1) ORDER BY d.data, d.numero`, [o.id]);
    res.send(pagina(req.session.utente, `Ordine ${o.numero}/${o.anno}`, '', html`
      <div class="intestazione-pagina"><h2>Ordine ${o.numero}/${o.anno} <span class="stato ${stato}">${STATI_ORDINE[stato]}</span></h2>
        <form method="post" action="/ordini/${o.id}/conferme" class="inline">
          <button class="primario" title="Conferma d'ordine per il cliente con le righe e le date di consegna dell'ordine (modificabili)">${conferme.some(k => k.stato === 'bozza')
            ? "Riprendi la conferma d'ordine" : conferme.some(k => k.stato !== 'annullato') ? "Nuova conferma d'ordine" : "Conferma d'ordine"}</button></form>
        <form method="post" action="/ordini/${o.id}/elimina" class="inline"
          data-conferma="${confermaEliminaOrdine({ numero: o.numero, anno: o.anno, origine: o.origine, righe: righe.length, conDocumenti: ddt.length + fatture.length > 0 })}">
          <button class="pericolo" title="Elimina l'ordine inserito per errore">Elimina ordine</button></form>
        ${['da_evadere', 'parziale'].includes(stato) ? html`<form method="post" action="/ordini/${o.id}/evaso" class="inline"
          data-conferma="${`Segnare come evase tutte le righe ancora aperte dell'ordine ${o.numero}/${o.anno}? Usalo quando la merce è stata consegnata ma il DDT ha un codice diverso o manca. Si torna indietro scegliendo "automatico" nello stato delle righe.`}">
          <button title="Merce consegnata: tutte le righe aperte diventano evase">Segna tutto evaso</button></form>` : ''}
        ${['da_evadere', 'parziale'].includes(stato) && o.cliente_id ? html`<form method="post" action="/amministrazione/documenti/ddt-da-ordine/${o.id}" class="inline">
          <button class="primario" title="DDT (bozza) con le schede ancora da spedire">Crea DDT</button></form>` : ''}</div>
      ${ddtPortale.length ? html`<p class="nota">DDT del portale: ${ddtPortale.map((x, i) => html`${i ? ', ' : ''}<a href="/amministrazione/documenti/${x.id}">${x.numero == null ? 'bozza' : `n. ${x.numero}`} del ${data(x.data)}</a>`)}</p>` : ''}
      <dl class="dati-ordine">
        <dt>Cliente</dt><dd>${o.cliente_nome}${o.cliente_id ? '' : html` <span class="esito verifica">non in anagrafica</span>`}</dd>
        <dt>Data ordine</dt><dd>${data(o.data_ordine)}</dd>
        <dt>Ordine del cliente</dt><dd>${o.rif_cliente}${o.data_ordine_cliente ? html` del ${data(o.data_ordine_cliente)}` : ''}${o.file ? html` <small class="nota">(${o.file})</small>` : ''}</dd>
        <dt>Origine</dt><dd>${({ fic: 'Fatture in Cloud', ordine_cliente: 'ordine del cliente (non in Fatture in Cloud)', foglio: 'foglio Schedulazione', manuale: 'inserito a mano', email: 'email' } as Record<string, string>)[o.origine] ?? o.origine}</dd>
        ${o.note ? html`<dt>Note</dt><dd>${o.note}</dd>` : ''}
        ${conferme.length ? html`<dt>Conferme d'ordine</dt><dd>${conferme.map((k, i) => html`${i ? ' · ' : ''}<a href="/ordini/${o.id}/conferme/${k.id}">${k.numero ? `n. ${k.numero}/${k.anno}` : 'bozza'}</a>
          del ${data(k.data)} ${statoConferma(k.stato)}${k.email_inviata_il ? html` <small class="nota">a ${k.email_a}</small>` : ''}`)}</dd>` : ''}
      </dl>
      <form method="post" action="/ordini/${o.id}">
      <div class="tabella-scorre"><table class="elenco righe-ordine">
        <thead><tr><th>Codice</th><th>Descrizione</th><th class="n">Q.tà</th><th class="n">Spedite</th><th class="n">Prezzo</th><th class="n">Fatturato</th>
          <th>Consegna richiesta</th><th>Arrivo materiale</th><th>Lavorazione</th><th>Ritardi (gg)</th><th>Consegna prevista</th><th>Ritardo</th><th>Stato</th><th>Commessa</th><th>Note</th><th></th></tr></thead>
        <tbody>${righe.map(x => html`<tr class="${x.tipo === 'servizio' ? 'servizio' : ''}">
          <td class="nowrap">${x.codice}${x.codiceCliente && x.codiceCliente !== x.codice ? html`<br><small class="nota">cliente: ${x.codiceCliente}</small>` : ''}</td>
          <td class="taglia">${x.descrizione}</td><td class="n">${num(x.quantita, 0)}</td><td class="n">${x.tipo === 'scheda' ? num(x.quantitaSpedita, 0) : ''}</td>
          <td class="n">${euro(x.prezzo)}</td><td class="n">${x.importoFatturato ? euro(x.importoFatturato) : ''}</td>
          <td>${data(x.consegnaRichiesta)}${x.consegne?.length ? html`<details><summary>${x.consegne.length} consegne</summary>${x.consegne.map(k => html`${data(k.data)}: ${num(k.quantita, 0)}<br>`)}</details>` : ''}</td>
          <td>${campoData(`righe[r${x.id}][arrivo]`, x.arrivoMateriale)}</td>
          <td>${campoData(`righe[r${x.id}][lavorazione]`, (righeDb(x).dataLavorazione))}<br><small class="nota">${x.lavorazione && !righeDb(x).dataLavorazione ? `calcolata: ${data(x.lavorazione)}` : ''}</small></td>
          <td><input name="righe[r${x.id}][ritardi]" value="${x.ritardiProduzione || ''}" inputmode="numeric" class="corto"></td>
          <td>${campoData(`righe[r${x.id}][prevista]`, righeDb(x).consegnaPrevista)}<br><small class="nota">${x.prevista && !righeDb(x).consegnaPrevista ? `calcolata: ${data(x.prevista)}` : ''}</small></td>
          <td>${ritardo(x.ritardo)}</td>
          <td><span class="stato ${x.stato}">${STATI_ORDINE[x.stato]}</span><br>
            <select name="righe[r${x.id}][stato]" title="Stato deciso dall'ufficio (vince sul calcolo)">
              ${[['', 'automatico'], ['evaso', 'evaso'], ['da_evadere', 'da evadere'], ['annullato', 'annullato']].map(([v, t]) => html`<option value="${v}" ${(x.statoManuale ?? '') === v ? raw('selected') : ''}>${t}</option>`)}
            </select></td>
          <td><select name="righe[r${x.id}][commessa]"><option value="">—</option>${commesse.map(k => html`<option value="${k.id}" ${k.id === x.commessaId ? raw('selected') : ''}>${k.numero}</option>`)}</select></td>
          <td><input name="righe[r${x.id}][note]" value="${x.note ?? ''}"></td>
          <td><button form="elimina-riga-${x.id}" class="link negativo" title="Elimina questa riga"
            data-conferma="${`Eliminare la riga ${x.codice || x.descrizione || ''} (${num(x.quantita, 0)} pz) dall'ordine ${o.numero}/${o.anno}? Le modifiche non salvate delle altre righe si perdono.`}">Elimina</button></td>
        </tr>`)}</tbody></table></div>
      <p><button class="primario">Salva</button></p>
      </form>
      ${righe.map(x => html`<form method="post" action="/ordini/${o.id}/righe/${x.id}/elimina" id="elimina-riga-${x.id}" hidden></form>`)}
      <div class="due-colonne">
        <section><h2>DDT</h2>${ddt.length ? html`<table><thead><tr><th>DDT</th><th>Data</th><th>Codice</th><th class="n">Q.tà</th></tr></thead>
          <tbody>${ddt.map(d => html`<tr><td>${d.numero}</td><td>${data(d.data)}</td><td>${d.codice || d.descrizione}</td><td class="n">${num(d.quantita, 0)}</td></tr>`)}</tbody></table>` : spedizioni.length ? '' : html`<p class="nota">Nessun DDT.</p>`}
          ${spedizioni.length ? html`<h3>Abbinati in automatico</h3><p class="nota">DDT del portale con lo stesso cliente e lo stesso codice (o descrizione).
            Se un abbinamento è sbagliato, scegli lo stato della riga a mano.</p>
            <table><thead><tr><th>Documento</th><th>Codice</th><th class="n">Q.tà</th></tr></thead>
            <tbody>${spedizioni.map(a => html`<tr><td>${a.documento}</td><td>${a.codice}</td><td class="n">${num(a.quantita, 0)}</td></tr>`)}</tbody></table>` : ''}</section>
        <section><h2>Fatture</h2>${fatture.length ? html`<table><thead><tr><th>Fattura</th><th>Data</th><th>Codice</th><th class="n">Imponibile</th></tr></thead>
          <tbody>${fatture.map(f => html`<tr><td>${f.numero}${f.ddt_numero ? html` <small class="nota">(DDT ${f.ddt_numero})</small>` : ''}</td><td>${data(f.data)}</td><td>${f.codice || f.descrizione}</td><td class="n">${euro(f.imponibile)}</td></tr>`)}</tbody></table>` : html`<p class="nota">Nessuna fattura.</p>`}</section>
      </div>`, { avviso: req.query.salvato ? 'Salvato' : req.query.msg ? String(req.query.msg) : undefined }));
  });

  // ── Azioni dall'elenco sulle righe spuntate ──
  r.post('/azioni', async (req, res) => {
    const ids = idsSpuntati(req.body);
    const indietro = /^\/ordini(\?|$)/.test(String(req.body?.torna ?? '')) ? String(req.body.torna) : '/ordini';
    const torna = (msg: string) => res.redirect(conMessaggio(indietro, msg));
    if (!ids.length) return torna('Seleziona almeno una riga.');
    const righe = await q<{ id: number; ordine_id: number }>(`SELECT id, ordine_id FROM ordini_righe WHERE id = ANY($1)`, [ids]);
    const ordini = [...new Set(righe.map(x => x.ordine_id))];
    if (!righe.length) return torna('Righe non trovate.');
    const azione = String(req.body?.azione ?? '');
    if (azione === 'conferma') {
      if (ordini.length !== 1) return torna("La conferma d'ordine si prepara per un ordine alla volta: spunta righe di un solo ordine.");
      try {
        const cid = await creaConferma(ordini[0], req.session.utente?.id ?? null);
        return res.redirect(`/ordini/${ordini[0]}/conferme/${cid}?msg=${encodeURIComponent('Conferma preparata con le righe e le date dell\'ordine: controlla, correggi e poi Emetti.')}`);
      } catch (e: any) { return torna(e?.message ?? String(e)); }
    }
    if (azione === 'evase' || azione === 'automatico') {
      await q(`UPDATE ordini_righe SET stato_manuale = $2 WHERE id = ANY($1)`, [righe.map(x => x.id), azione === 'evase' ? 'evaso' : null]);
      await q(`UPDATE ordini SET aggiornato_il = now() WHERE id = ANY($1)`, [ordini]);
      return torna(azione === 'evase' ? `${righe.length === 1 ? '1 riga segnata come evasa' : `${righe.length} righe segnate come evase`}.`
        : `${righe.length === 1 ? '1 riga torna' : `${righe.length} righe tornano`} allo stato calcolato dai DDT.`);
    }
    if (azione === 'elimina') {
      const nomi: string[] = [];
      for (const id of ordini) { const o = await eliminaOrdine(id); if (o) nomi.push(`${o.numero}/${o.anno}`); }
      return torna(nomi.length === 1 ? `Ordine ${nomi[0]} eliminato.` : `Eliminati ${nomi.length} ordini: ${nomi.join(', ')}.`);
    }
    torna('Azione non riconosciuta.');
  });

  r.post('/:id', async (req, res) => {
    const id = Number(req.params.id);
    const dataO = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? String(v) : null);
    // chiavi "r<id>": con numeri piccoli il lettore del modulo creerebbe un elenco al posto delle righe per id
    for (const [chiave, x] of Object.entries<any>(req.body?.righe ?? {})) {
      const rigaId = /^r(\d+)$/.exec(chiave)?.[1];
      if (!rigaId) continue;
      const ritardi = Math.max(0, Math.min(365, Math.round(Number(String(x?.ritardi ?? '').replace(',', '.')) || 0)));
      const stato = ['evaso', 'da_evadere', 'annullato'].includes(x?.stato) ? x.stato : null;
      await q(`UPDATE ordini_righe SET arrivo_materiale = $3, data_lavorazione = $4, ritardi_produzione = $5, consegna_prevista = $6, stato_manuale = $7,
          commessa_id = (SELECT id FROM commesse WHERE id = $8), note = $9 WHERE id = $1 AND ordine_id = $2`,
        [Number(rigaId), id, dataO(x?.arrivo), dataO(x?.lavorazione), ritardi, dataO(x?.prevista), stato, Number(x?.commessa) || null, String(x?.note ?? '').trim() || null]);
    }
    await q(`UPDATE ordini SET aggiornato_il = now() WHERE id = $1`, [id]);
    res.redirect(`/ordini/${id}?salvato=1`);
  });

  // ── Ordine consegnato ma non riconosciuto dai DDT (codici diversi, consegna senza DDT): l'ufficio lo chiude ──
  r.post('/:id/evaso', async (req, res) => {
    const id = Number(req.params.id);
    const aperte = (await righeOrdini(id)).filter(x => ['da_evadere', 'parziale'].includes(x.stato)).map(x => x.id);
    if (aperte.length) {
      await q(`UPDATE ordini_righe SET stato_manuale = 'evaso' WHERE ordine_id = $1 AND id = ANY($2)`, [id, aperte]);
      await q(`UPDATE ordini SET aggiornato_il = now() WHERE id = $1`, [id]);
    }
    res.redirect(`/ordini/${id}?msg=${encodeURIComponent(aperte.length ? `${aperte.length} righe segnate come evase.` : 'Nessuna riga aperta.')}`);
  });

  // ── Elimina (righe inserite per errore) ──
  r.post('/:id/elimina', async (req, res) => {
    const o = await eliminaOrdine(Number(req.params.id));
    if (!o) return res.redirect('/ordini?vista=tutti');
    res.redirect(`/ordini?vista=tutti&msg=${encodeURIComponent(`Ordine ${o.numero}/${o.anno} eliminato.`)}`);
  });

  r.post('/:id/righe/:riga/elimina', async (req, res) => {
    const id = Number(req.params.id);
    const x = await q1(`DELETE FROM ordini_righe WHERE id = $1 AND ordine_id = $2 RETURNING coalesce(codice, descrizione, '') AS nome`, [Number(req.params.riga), id]);
    if (x) await q(`UPDATE ordini SET aggiornato_il = now() WHERE id = $1`, [id]);
    res.redirect(`/ordini/${id}?msg=${encodeURIComponent(x ? `Riga ${x.nome} eliminata.` : 'Riga non trovata.')}`);
  });

  r.use(rotteConferme());
  return r;
}

/** Elimina un ordine con righe e consegne (DDT e fatture restano, senza ordine). Prima un backup. */
async function eliminaOrdine(id: number): Promise<{ numero: number; anno: number } | null> {
  const o = await q1<{ numero: number; anno: number }>(`SELECT numero, anno FROM ordini WHERE id = $1`, [id]);
  if (!o) return null;
  await salvaBackupSuDisco('prima-di-eliminare-ordine').catch(() => null);
  await transazione(async c => {
    // ordine nato da un documento letto dall'IA: il documento torna "da confermare" (si corregge o si scarta)
    await c.query(`UPDATE acquisizioni SET stato = 'da_confermare', ordine_id = NULL, confermato_da = NULL WHERE ordine_id = $1 AND proposta IS NOT NULL`, [id]);
    await c.query(`DELETE FROM ordini WHERE id = $1`, [id]);   // righe e consegne vanno via con l'ordine; DDT e fatture restano senza ordine
  });
  return o;
}

/** Le date scritte a mano (non quelle calcolate) della riga. */
const righeDb = (x: RigaElenco) => ({ dataLavorazione: x.dataLavorazione, consegnaPrevista: x.consegnaPrevista });

// ───────────────────────────── grafici (SVG, senza script) ─────────────────────────────
function graficoMesi(mesi: { mese: string; fatturato: number; daEvadere: number }[]): Raw {
  if (!mesi.length) return html`<p class="vuoto">Nessun dato.</p>`;
  const L = 64, A = 260, passo = 46, barra = 26, W = L + mesi.length * passo + 10, H = A + 40;
  const max = Math.max(1, ...mesi.map(m => m.fatturato + m.daEvadere));
  const scala = gradini(max);
  const y = (v: number) => A - (v / scala) * (A - 10);
  const etichetta = (v: number) => (v >= 1000 ? `${num(v / 1000, 0)}k` : num(v, 0));
  return html`<svg class="grafico-mesi" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Fatturato e ordini da evadere per mese">
    ${[0, 0.25, 0.5, 0.75, 1].map(f => html`<line class="griglia" x1="${L}" x2="${W - 5}" y1="${y(scala * f)}" y2="${y(scala * f)}"/>
      <text class="asse" x="${L - 6}" y="${y(scala * f) + 4}" text-anchor="end">${etichetta(scala * f)}</text>`)}
    ${mesi.map((m, i) => {
      const x = L + i * passo + (passo - barra) / 2;
      const yF = y(m.fatturato), yE = y(m.fatturato + m.daEvadere);
      return html`<g class="mese"><title>${nomeMese(m.mese)}: fatturato ${euro(m.fatturato)}, da evadere ${euro(m.daEvadere)}</title>
        <rect class="sfondo" x="${x - 6}" y="0" width="${barra + 12}" height="${A}"/>
        ${m.fatturato ? html`<rect class="fatturato" x="${x}" y="${yF}" width="${barra}" height="${Math.max(1, A - yF)}" rx="2"/>` : ''}
        ${m.daEvadere ? html`<rect class="da-evadere" x="${x}" y="${yE}" width="${barra}" height="${Math.max(1, yF - yE - (m.fatturato ? 2 : 0))}" rx="2"/>` : ''}
        <text class="asse" x="${x + barra / 2}" y="${A + 16}" text-anchor="middle">${nomeMese(m.mese)}</text></g>`;
    })}
    <line class="base" x1="${L}" x2="${W - 5}" y1="${A}" y2="${A}"/>
  </svg>`;
}

/** Valore "tondo" sopra il massimo, per la scala dell'asse. */
function gradini(max: number) {
  const p = 10 ** Math.floor(Math.log10(max));
  return [1, 2, 2.5, 5, 10].map(k => k * p).find(v => v >= max) ?? max;
}

const GIORNI_SETTIMANA = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];

/**
 * Gantt a giorni su tutta la larghezza dello schermo: nomi a sinistra (HTML), giorni a destra in un SVG largo 100%
 * con posizioni in percentuale (niente stili in linea: li blocca la Content-Security-Policy).
 */
function graficoGantt(barre: Barra[], p: { vista: VistaGantt; da: string; a: string; giorni: number }, oggi: string,
  carico: Record<string, number>, oreGiorno: number, ordineDi: (id: number) => number): Raw {
  const RIGA = 22, TESTA = 46;
  const H = TESTA + (barre.length + 1) * RIGA + 4;
  const pc = (n: number) => `${Math.round(n * 10000) / 10000}%`;
  const col = 100 / p.giorni;
  const indice = (d: string) => Math.max(0, Math.min(p.giorni, differenzaGiorni(d, p.da)));
  const x = (d: string) => pc(indice(d) * col);
  const elencoGiorni = Array.from({ length: p.giorni }, (_, i) => piuGiorni(p.da, i));
  const etichettaGiorno = (d: string, i: number) => {
    const g = new Date(d + 'T12:00:00Z').getUTCDay(), n = Number(d.slice(8));
    if (p.vista === 'settimana') return html`<text class="asse giorno" x="${pc((i + .5) * col)}" y="${TESTA - 8}" text-anchor="middle">${GIORNI_SETTIMANA[g]} ${n}/${Number(d.slice(5, 7))}</text>`;
    if (p.vista === 'mese') return html`<text class="asse giorno" x="${pc((i + .5) * col)}" y="${TESTA - 20}" text-anchor="middle">${GIORNI_SETTIMANA[g].slice(0, 1).toUpperCase()}</text>
      <text class="asse giorno" x="${pc((i + .5) * col)}" y="${TESTA - 6}" text-anchor="middle">${n}</text>`;
    return g === 1 ? html`<text class="asse giorno" x="${pc(i * col)}" dx="2" y="${TESTA - 6}">${n}</text>` : '';
  };
  const mostraMese = (d: string, i: number) => p.vista !== 'settimana' && (d.endsWith('-01') || i === 0);
  return html`<div class="gantt vista-${p.vista}">
    <div class="nomi">
      <div class="testa"></div>
      <div class="nome tenue">Carico (max ${num(oreGiorno)} ore)</div>
      ${barre.map(b => html`<a class="nome" href="/ordini/${ordineDi(b.id)}" title="${b.etichetta}">${b.etichetta}</a>`)}
    </div>
    <svg class="tempo" width="100%" height="${H}" role="img" aria-label="Gantt della produzione">
      ${elencoGiorni.map(d => html`
        ${lavorativo(d) ? '' : html`<rect class="festivo" x="${x(d)}" y="0" width="${pc(col)}" height="${H}"/>`}
        ${d === oggi ? html`<rect class="oggi-sfondo" x="${x(d)}" y="0" width="${pc(col)}" height="${H}"/>` : ''}`)}
      ${elencoGiorni.map((d, i) => html`
        ${i > 0 && (p.vista !== 'trimestre' || new Date(d + 'T12:00:00Z').getUTCDay() === 1) ? html`<line class="griglia" x1="${x(d)}" x2="${x(d)}" y1="${TESTA - 4}" y2="${H}"/>` : ''}
        ${mostraMese(d, i) ? html`<text class="asse mese" x="${x(d)}" dx="2" y="11">${nomeMese(d.slice(0, 7))}</text><line class="griglia mese" x1="${x(d)}" x2="${x(d)}" y1="0" y2="${H}"/>` : ''}
        ${etichettaGiorno(d, i)}`)}
      ${elencoGiorni.filter(d => carico[d]).map(d => {
        const h = Math.min(1, carico[d] / (oreGiorno * 1.5)) * (RIGA - 6);
        return html`<rect class="carico ${carico[d] > oreGiorno ? 'oltre' : ''}" x="${pc(indice(d) * col + col * .1)}" y="${TESTA + RIGA - 3 - h}" width="${pc(col * .8)}" height="${h}"><title>${data(d)}: ${num(carico[d], 1)} ore</title></rect>`;
      })}
      <line class="riga" x1="0" x2="100%" y1="${TESTA + RIGA}" y2="${TESTA + RIGA}"/>
      ${barre.map((b, i) => {
        const yy = TESTA + (i + 1) * RIGA;
        const prima = b.fine < p.da, tagliataSx = b.inizio < p.da, tagliataDx = b.fine > p.a;
        const i1 = indice(b.inizio), i2 = prima ? 0 : indice(piuGiorni(b.fine, 1));
        const larghezza = prima ? col * .35 : Math.max(col * .35, (i2 - i1) * col - col * .08);
        const cons = b.consegna && b.consegna >= p.da && b.consegna <= p.a ? indice(b.consegna) : null;
        return html`<a href="/ordini/${ordineDi(b.id)}"><g><title>${b.etichetta}: ${data(b.inizio)} → ${data(b.fine)}${b.ore == null ? ' (senza preventivo)' : `, ${num(b.ore, 1)} ore`}, consegna ${data(b.consegna)}</title>
          <rect class="fondo-riga" x="0" y="${yy}" width="100%" height="${RIGA}"/>
          <line class="riga" x1="0" x2="100%" y1="${yy + RIGA}" y2="${yy + RIGA}"/>
          <rect class="barra ${b.inRitardo ? 'ritardo' : ''} ${b.stimata ? 'stimata' : ''}" x="${pc(i1 * col + (tagliataSx ? 0 : col * .04))}" y="${yy + 5}" width="${pc(larghezza)}" height="${RIGA - 10}" rx="${tagliataSx || tagliataDx ? 0 : 3}"/>
          ${cons != null ? html`<svg x="${pc((cons + .5) * col)}" y="${yy + 3}" width="1" height="1" overflow="visible"><path class="consegna" d="M0 0 l5 8 l-5 8 l-5 -8 z"/></svg>` : ''}</g></a>`;
      })}
      ${oggi >= p.da && oggi <= p.a ? html`<line class="oggi" x1="${pc((indice(oggi) + .5) * col)}" x2="${pc((indice(oggi) + .5) * col)}" y1="${TESTA - 2}" y2="${H}"/>` : ''}
    </svg>
  </div>`;
}
