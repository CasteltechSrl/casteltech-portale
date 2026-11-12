/**
 * Ordini dei clienti: elenco delle righe (da evadere / evase), scheda dell'ordine con le date del foglio
 * "Schedulazione produzione", cruscotto (fatturato e previsione), Gantt della produzione, fatture senza ordine.
 */
import { annoRiferimento, fatturatoClienti } from '../anno-riferimento.js';
import { sceltaAnno, tabellaClientiFatturato } from '../views/scelta-anno.js';
import { segnoInvioElenco } from '../views/invio.js';
import { INVIATO_TITOLO } from '../../engine/invii.js';
import { excelSemplice, inviaExcel, nomeExcel } from '../excel.js';
import { paginata } from '../views/paginazione.js';
import { Router } from 'express';
import { q, q1, transazione } from '../db.js';
import { salvaBackupSuDisco } from '../backup.js';
import { pianificaProduzione, righeOrdini, type RigaElenco } from '../ordini-servizio.js';
import {
  STATI_ORDINE, VISTE_GANTT, barreNelPeriodo, caricoGiornaliero, consegneInRitardo, cruscotto, daEvadere, differenzaGiorni, lavorativo, periodoGantt, piuGiorni, statoOrdine,
  type Barra, type VistaGantt,
} from '../../engine/ordini.js';
import { confermaEliminaOrdine } from '../../engine/eliminazioni.js';
import { confermeDellOrdine, creaConferma, duplicaConferma, eliminaOAnnulla } from '../conferme-ordine-servizio.js';
import { rotteConferme, statoConferma } from './conferme-ordine.js';
import { layout } from '../views/layout.js';
import { casella, casellaTutti, conMessaggio, idsSpuntati, moduloAzioni } from '../views/azioni-elenco.js';
import { ddtRicevutiPerOrdineCliente } from '../ddt-ricevuti-servizio.js';
import { html, data, euro, euroUnitario, num, numCampo, raw, type Raw } from '../views/html.js';
import { aggiungiProdottoCliente, prodottiPerCliente } from '../anagrafiche-servizio.js';
import { serviziAttivi, servizioPerCodice } from '../servizi-una-tantum-servizio.js';
import { opzioniServizi } from '../views/scelta-prodotto.js';
import { codiceProposto, numeroDa } from '../../engine/acquisizioni.js';
import type { Utente } from '../views/layout.js';
import { confrontoOrdiniFatturato, creaOrdiniPostumi } from '../ordini-postumi-servizio.js';
import { ETICHETTA_POSTUMO, FATTURE_STORNATE, fattureDaCoprire } from '../../engine/ordini-postumi.js';
import { collegaPreventivo, preventiviDelCliente } from '../preventivi-ordini-servizio.js';
import { sceltaPrezzoOrdine } from '../prezzo-anagrafica-servizio.js';
import { scaglioniDi } from '../prezzi-servizio.js';
import { differenzaOrdine } from '../../engine/prezzo-anagrafica.js';
import { etichettaPreventivo, preventiviDellaRiga, propostaPreventivo } from '../../engine/preventivi-ordini.js';

const oggiRoma = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const nomeMese = (m: string) => `${MESI[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;

const VISTE = [['cruscotto', 'Cruscotto'], ['aperti', 'Da evadere'], ['ritardo', 'In ritardo'], ['evasi', 'Evasi'], ['tutti', 'Tutti'], ['gantt', 'Gantt'], ['conferme', "Conferme d'ordine"], ['fatture', 'Ordini e fatturato'], ['acquisire', 'Ordini da e-mail e PDF']] as const;
function schede(attiva: string) {
  return html`<nav class="schede">${VISTE.map(([k, t]) => html`<a href="${k === 'aperti' ? '/ordini' : ['ritardo', 'evasi', 'tutti'].includes(k) ? `/ordini?vista=${k}` : `/ordini/${k}`}"
    class="${k === attiva ? 'attiva' : ''}">${t}</a>`)}</nav>`;
}
export const pagina = (utente: Utente | undefined, titolo: string, attiva: string, contenuto: Raw, opz: { avviso?: string; script?: string | string[] } = {}) =>
  // menu a gruppi (31/10/2026): gli ordini a fornitore stanno negli Acquisti (senza le schede degli ordini clienti), il Gantt nella Produzione
  String(layout({ titolo, utente, attiva: attiva === 'fornitori' ? 'acquisti' : attiva === 'gantt' ? 'produzione' : attiva === 'acquisire' ? 'documenti' : 'ordini', largo: true,
    script: opz.script ?? 'elenco.js', avviso: opz.avviso,
    contenuto: attiva === 'fornitori' ? html`<div class="intestazione-pagina"><h1>Acquisti · Ordini a fornitore</h1></div>${contenuto}`
      : html`<div class="intestazione-pagina"><h1>Ordini clienti</h1></div>${schede(attiva)}${contenuto}` }));

const ritardo = (n: number | null) => (n == null ? '' : n > 0 ? html`<span class="ritardo">+${n} gg</span>` : html`<span class="nota">${n} gg</span>`);

/** Da dove viene il prezzo in anagrafica (prodotti.prezzo_fonte). */
const FONTI_PREZZO_ANAGRAFICA: Record<string, string> = { manuale: 'scritto a mano', fic_anagrafica: 'anagrafica di Fatture in Cloud', fic_fattura: 'ultima fattura di Fatture in Cloud',
  preventivo: 'preventivo inviato', ordine: 'ordine del cliente' };

export function rotteOrdini() {
  const r = Router();

  // ── Elenco delle righe ──
  const righeFiltrate = async (query: Record<string, unknown>) => {
    const vista = ['ritardo', 'evasi', 'tutti'].includes(String(query.vista)) ? String(query.vista) : 'aperti';
    const cerca = String(query.q ?? '').trim().toUpperCase();
    const tutte = await righeOrdini();
    // "In ritardo" (controllo serale 10/11/2026) = le righe contate da "Consegne in ritardo" del cruscotto
    const ritardo = vista === 'ritardo' ? new Set(consegneInRitardo(tutte, oggiRoma())) : null;
    // "Da evadere" = solo schede (Adriano 6/11/2026): le righe di costo (una tantum, programmazioni, lamine, acquisti) si vedono in "Tutti"
    let righe = tutte.filter(x =>
      (ritardo ? ritardo.has(x) : vista === 'tutti' || (vista === 'evasi' ? ['evaso', 'annullato'].includes(x.stato) : daEvadere([x]).length > 0)) &&
      (!cerca || [x.cliente, x.codice, x.descrizione, x.codiceCliente, x.rifCliente, String(x.numero)].some(t => String(t ?? '').toUpperCase().includes(cerca))));
    righe = vista === 'aperti' || vista === 'ritardo'
      ? righe.sort((a, b) => (a.consegna ?? '9999').localeCompare(b.consegna ?? '9999') || a.numero - b.numero)
      : righe.sort((a, b) => b.anno - a.anno || b.numero - a.numero);
    return { vista, cerca, tutte, righe };
  };
  r.get('/elenco.xlsx', async (req, res) => {
    const { righe } = await righeFiltrate(req.query as Record<string, unknown>);
    inviaExcel(res, nomeExcel('ordini-clienti'), await excelSemplice('Ordini', [
      { header: 'Ordine', key: 'ordine', width: 12 }, { header: 'Data', key: 'dataOrdine', formato: 'data' }, { header: 'Cliente', key: 'cliente', width: 36 },
      { header: 'Rif. cliente', key: 'rifCliente', width: 18 }, { header: 'Codice', key: 'codice', width: 18 }, { header: 'Descrizione', key: 'descrizione', width: 40 },
      { header: 'Q.tà', key: 'quantita', formato: 'numero' }, { header: 'Spedite', key: 'quantitaSpedita', formato: 'numero' }, { header: 'Da fare', key: 'residuoQuantita', formato: 'numero' },
      { header: 'Prezzo', key: 'prezzo', formato: 'euro' }, { header: 'Valore da evadere', key: 'residuoValore', formato: 'euro' }, { header: 'Arrivo materiale', key: 'arrivoMateriale', formato: 'data' },
      { header: 'Consegna richiesta', key: 'consegnaRichiesta', formato: 'data' }, { header: 'Consegna prevista', key: 'prevista', formato: 'data' }, { header: 'Ritardo (gg)', key: 'ritardo', formato: 'intero' },
      { header: 'Stato', key: 'statoTesto', width: 14 },
    ], righe.map(x => ({ ...x, ordine: `${x.numero}/${x.anno}`, statoTesto: STATI_ORDINE[x.stato] ?? x.stato }))));
  });

  r.get('/', async (req, res) => {
    const { vista, cerca, tutte, righe: filtrate } = await righeFiltrate(req.query as Record<string, unknown>);
    const totale = filtrate.reduce((a, x) => a + x.residuoValore, 0);
    const { righe, barra, info } = paginata(filtrate, req.query as Record<string, unknown>);
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
        <input name="q" value="${req.query.q ?? ''}" placeholder="Cerca cliente, codice, n° ordine, rif. cliente…" type="search"><button>Cerca</button>
        <a class="bottone" href="/ordini/elenco.xlsx?vista=${vista}${cerca ? `&q=${encodeURIComponent(cerca)}` : ''}" title="Scarica queste righe in Excel">Excel</a>
        <a class="bottone" href="/ordini/acquisire#ordine-a-voce" title="Ordine ricevuto per telefono o a voce, senza documento">+ Nuovo ordine (telefono / a voce)</a></form>
      ${tutte.length ? '' : html`<p class="vuoto">Nessun ordine nel portale. Si caricano da <a href="/impostazioni/ordini">Impostazioni → Ordini</a>.</p>`}
      ${modulo.apri}
      <div class="tabella-scorre"><table class="elenco ordini">
        <thead><tr>${casellaTutti()}<th>Ordine</th><th>Data</th><th>Cliente</th><th>Rif. cliente</th><th>Codice</th><th>Descrizione</th>
          <th class="n">Q.tà</th><th class="n">Spedite</th><th class="n">Da fare</th><th class="n">Prezzo</th><th class="n">Valore da evadere</th>
          <th>Arrivo mat.</th><th>Consegna richiesta</th><th>Consegna prevista</th><th>Ritardo</th><th>Stato</th></tr></thead>
        <tbody>${righe.map(x => html`
          <tr class="cliccabile ${x.tipo === 'servizio' ? 'servizio' : ''} ${x.consegna && x.consegna < oggi && x.residuoQuantita > 0 ? 'scaduta' : ''}" data-href="/ordini/${x.ordineId}">
            ${casella(x.id, `${x.numero}/${x.anno} ${x.codice ?? x.descrizione ?? ''}`, x.ordineId)}
            <td class="nowrap"><a href="/ordini/${x.ordineId}">${x.numero}/${x.anno}</a>${x.origine === 'postumo' ? html` <span class="esito verifica" title="${ETICHETTA_POSTUMO}: copre una fattura senza ordine, non è un ordine del cliente">postumo</span>` : ''}</td><td>${data(x.dataOrdine)}</td>
            <td class="taglia">${x.cliente}</td><td>${x.rifCliente}</td><td class="nowrap">${x.codice}</td><td class="taglia">${x.descrizione}</td>
            <td class="n">${num(x.quantita, 0)}</td><td class="n">${x.tipo === 'scheda' ? num(x.quantitaSpedita, 0) : ''}</td>
            <td class="n">${x.residuoQuantita ? num(x.residuoQuantita, 0) : ''}</td><td class="n">${euroUnitario(x.prezzo)}</td>
            <td class="n">${x.residuoValore ? euro(x.residuoValore) : ''}</td>
            <td>${data(x.arrivoMateriale)}</td><td>${data(x.consegnaRichiesta)}${x.consegne?.length ? html` <small class="nota" title="consegne a programma">(${x.consegne.length} consegne)</small>` : ''}</td>
            <td>${data(x.prevista)}</td><td>${ritardo(x.ritardo)}</td>
            <td><span class="stato ${x.stato}">${STATI_ORDINE[x.stato]}</span></td>
          </tr>`)}</tbody>
        ${righe.length ? html`<tfoot><tr><td colspan="11">${filtrate.length} righe${info.pagine > 1 ? ` (${info.da}–${info.a} in questa pagina)` : ''}</td><td class="n"><b>${euro(totale)}</b></td><td colspan="5"></td></tr></tfoot>` : ''}
      </table></div>
      ${barra}
      ${modulo.chiudi}
      <p class="nota">Una riga è <b>evasa</b> quando le schede spedite con DDT arrivano alla quantità ordinata, <b>parziale</b> se ne è partita una parte.
        I DDT caricati nel portale si abbinano da soli (le fatture no: possono essere anticipi) alle righe aperte dello stesso cliente con lo stesso codice.
        Le righe di costo (programmazioni, lamine, attrezzaggio, costi una tantum, acquisto PCB e componenti, trasporto) non sono prodotti:
        non compaiono qui tra le righe da evadere (si vedono in "Tutti" e nell'ordine) e risultano evase quando sono fatturate o quando l'ordine non ha più schede da spedire.
        Consegna prevista = arrivo materiale + ${3} gg + ${5} gg + ritardi di produzione, come nel foglio.</p>`,
      { avviso: req.query.msg ? String(req.query.msg) : undefined }));
  });

  // ── Cruscotto ──
  r.get('/cruscotto', async (req, res) => {
    const oggi = oggiRoma();
    const anno = annoRiferimento(req, oggi);   // anno scelto in uno dei cruscotti (Adriano 10/11/2026)
    // fatturato dalle fatture emesse (Adriano 9/11/2026: con le righe dell'import di FIC ottobre risultava quasi vuoto, le fatture dopo il 25/10 mancavano)
    const fatture = (await q(`SELECT data, imponibile::float AS imponibile, numero FROM documenti
      WHERE tipo = 'fattura' AND anno = $1 AND numero IS NOT NULL AND stato NOT IN ('bozza', 'annullato', 'scartato')`, [anno]))
      .filter(f => !(FATTURE_STORNATE[anno] ?? []).includes(f.numero))
      .map(f => ({ data: typeof f.data === 'string' ? f.data.slice(0, 10) : new Date(f.data).toLocaleDateString('sv-SE'), imponibile: Number(f.imponibile ?? 0) }));
    const [righe, clientiAnno] = await Promise.all([righeOrdini(), fatturatoClienti(anno, oggi)]);
    const c = cruscotto(fatture, righe, oggi, anno);
    const perCliente = new Map<string, number>();
    for (const x of righe) if (x.residuoValore) perCliente.set(x.cliente, (perCliente.get(x.cliente) ?? 0) + x.residuoValore);
    const clienti = [...perCliente].sort((a, b) => b[1] - a[1]);
    const mesiFuturi = c.mesi.filter(m => m.mese >= oggi.slice(0, 7));
    res.send(pagina(req.session.utente, 'Cruscotto ordini', 'cruscotto', html`
      ${sceltaAnno(anno, '/ordini/cruscotto', Number(oggi.slice(0, 4)))}
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
      </div>
      <h2 id="clienti">Clienti e fatturato ${anno}</h2>
      ${tabellaClientiFatturato(clientiAnno, anno, anno === Number(oggi.slice(0, 4)))}`));
  });

  // ── Gantt della produzione ──
  r.get('/gantt', async (req, res) => {
    const oggi = oggiRoma();
    const { oreGiorno, righe, daFare, perId, barre: tutte } = await pianificaProduzione(oggi);
    const p = periodoGantt(req.query.vista, oggi, req.query.da);
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
          <td>${b.inRitardo ? html`<span class="ritardo" title="${b.oltreConsegna ? 'La lavorazione finisce dopo la consegna richiesta' : 'Doveva già cominciare'}">${b.oltreConsegna ? 'finisce dopo la consegna' : 'in ritardo'}</span>` : ''}</td></tr>`; })}</tbody></table></div>`));
  });

  // ── Ordini e fatturato (Adriano 9/11/2026; prima "Fatture senza ordine"): mese per mese quanto del fatturato ha un ordine, cosa manca, ordini postumi ──
  r.get('/fatture', async (req, res) => {
    const anno = Number(req.query.anno) || Number(oggiRoma().slice(0, 4));
    const { esiti, mesi } = await confrontoOrdiniFatturato(anno);
    const daCoprire = fattureDaCoprire(esiti);
    const totale = (k: 'fatturato' | 'coperto' | 'scoperto' | 'postumi' | 'ordinato') => mesi.reduce((t, m) => t + m[k], 0);
    const postumi = await q(`SELECT o.id, o.numero, o.data_ordine, o.cliente_nome, d.numero AS fattura,
        coalesce((SELECT sum(r.quantita * r.prezzo) FROM ordini_righe r WHERE r.ordine_id = o.id), 0)::float AS valore
      FROM ordini o LEFT JOIN documenti d ON d.id = o.fattura_id WHERE o.origine = 'postumo' AND o.anno = $1 ORDER BY o.numero`, [anno]);
    const mostrati = mesi.filter(m => m.fatturato || m.ordinato);
    const stornate = FATTURE_STORNATE[anno] ?? [];
    res.send(pagina(req.session.utente, 'Ordini e fatturato', 'fatture', html`
      <p>${[anno - 1, anno, anno + 1].map(a => html`<a href="/ordini/fatture?anno=${a}" class="${a === anno ? 'attiva' : ''}">${a}</a> `)}</p>
      <p class="nota">Per ogni fattura ${anno} si guarda se le righe hanno un ordine: collegamento già fatto (import da Fatture in Cloud, DDT o fattura fatti dall'ordine),
        altrimenti un ordine dello stesso cliente con lo stesso codice e quantità ancora libera (prima gli ordini più vecchi, anche dell'anno prima).
        "Senza ordine" = righe fatturate che nessun ordine copre. "Ordinato nel mese" = ordini veri ricevuti nel mese (data dell'ordine): non coincide col
        fatturato perché un ordine si fattura spesso nei mesi dopo. Note di credito escluse${stornate.length ? `; fatture ${stornate.join(', ')} escluse perché stornate (doppie)` : ''}.</p>
      <div class="tabella-scorre"><table class="elenco"><thead><tr><th>Mese</th><th class="n">Ordinato nel mese</th><th class="n">Fatturato</th>
        <th class="n">Con ordine</th><th class="n">Senza ordine</th><th class="n">Coperto da ordini postumi</th></tr></thead>
        <tbody>${mostrati.map(m => html`<tr><td><a href="#m${m.mese}">${nomeMese(m.mese)}</a></td>
          <td class="n">${m.ordinato ? euro(m.ordinato) : ''} <span class="nota">${m.ordini ? `(${m.ordini})` : ''}</span></td><td class="n">${euro(m.fatturato)}</td>
          <td class="n">${euro(m.coperto)}</td><td class="n">${m.scoperto ? html`<b class="ritardo">${euro(m.scoperto)}</b>` : ''}</td><td class="n">${m.postumi ? euro(m.postumi) : ''}</td></tr>`)}</tbody>
        <tfoot><tr><td>Totale</td><td class="n">${euro(totale('ordinato'))}</td><td class="n"><b>${euro(totale('fatturato'))}</b></td><td class="n">${euro(totale('coperto'))}</td>
          <td class="n"><b>${euro(totale('scoperto'))}</b></td><td class="n">${euro(totale('postumi'))}</td></tr></tfoot></table></div>
      ${daCoprire.length ? html`<form method="post" action="/ordini/postumi" class="inline"
          data-conferma="${`Creare ${daCoprire.length} ordini postumi (uno per fattura senza ordine, totale ${euro(daCoprire.reduce((t, e) => t + e.scoperto, 0))})? Saranno numerati dall'8001, segnati "${ETICHETTA_POSTUMO}" e già evasi: non vanno in produzione né negli acquisti.`}">
          <input type="hidden" name="anno" value="${anno}">
          <button class="primario" title="Un ordine per ogni fattura con righe senza ordine, già evaso e segnato come postumo">Crea gli ordini postumi (${daCoprire.length} fatture)</button></form>`
        : html`<p class="nota">Nessuna fattura ${anno} senza ordine da coprire.</p>`}
      ${mostrati.filter(m => m.clienti.length).map(m => html`<h2 id="m${m.mese}">${nomeMese(m.mese)}: ${m.scoperto ? html`mancano ordini per ${euro(m.scoperto)}` : 'tutto coperto'}</h2>
        <div class="tabella-scorre"><table class="elenco"><thead><tr><th>Cliente</th><th>Fattura</th><th>Righe senza ordine</th><th class="n">Senza ordine</th><th>Ordine postumo</th></tr></thead>
        <tbody>${m.clienti.flatMap(c => c.fatture.map(e => html`<tr><td>${c.cliente}</td>
          <td class="nowrap"><a href="/amministrazione/documenti/${e.fattura.id}">${e.fattura.numero}/${e.fattura.anno}</a> <span class="nota">${data(e.fattura.data)}</span></td>
          <td class="taglia">${e.postumo ? html`<span class="nota">coperta</span>` : e.scoperte.map((x, i) => html`${i ? ' · ' : ''}${x.codice || String(x.descrizione ?? '').split('\n')[0].slice(0, 40)} × ${num(x.quantitaScoperta, 0)}`)}</td>
          <td class="n">${e.scoperto ? euro(e.scoperto) : ''}</td>
          <td>${e.postumo ? (() => { const p = postumi.find(x => x.fattura === e.fattura.numero); return p ? html`<a href="/ordini/${p.id}">${p.numero}/${anno}</a>` : 'sì'; })() : ''}</td></tr>`))}</tbody></table></div>`)}
      ${postumi.length ? html`<h2>Ordini postumi ${anno}</h2>
        <p class="nota">${ETICHETTA_POSTUMO}: non sono ordini dei clienti, coprono fatture che non avevano un ordine. Già evasi, fuori da produzione, Gantt e acquisti.
          Si possono eliminare dalla pagina dell'ordine (la fattura torna "senza ordine").</p>
        <div class="tabella-scorre"><table class="elenco"><thead><tr><th>Ordine</th><th>Data</th><th>Cliente</th><th>Fattura</th><th class="n">Valore</th></tr></thead>
        <tbody>${postumi.map(p => html`<tr><td><a href="/ordini/${p.id}">${p.numero}/${anno}</a></td><td>${data(p.data_ordine)}</td><td>${p.cliente_nome}</td><td>${p.fattura ?? ''}</td><td class="n">${euro(p.valore)}</td></tr>`)}</tbody></table></div>` : ''}`,
      { avviso: req.query.msg ? String(req.query.msg) : undefined }));
  });

  r.post('/postumi', async (req, res) => {
    const anno = Number(req.body.anno) || Number(oggiRoma().slice(0, 4));
    const creati = await creaOrdiniPostumi(anno, oggiRoma());
    res.redirect(conMessaggio(`/ordini/fatture?anno=${anno}`, creati.length
      ? `Creati ${creati.length} ordini postumi (${creati[0].ordine}–${creati[creati.length - 1].ordine}/${anno}) per ${euro(creati.reduce((t, x) => t + x.valore, 0))}.`
      : 'Nessun ordine postumo da creare.'));
  });

  // ── Conferme d'ordine (Adriano 1/11/2026): elenco di tutte le conferme, dal menu Commerciale ──
  r.get('/conferme', async (req, res) => {
    const anno = Number(req.query.anno) || Number(oggiRoma().slice(0, 4));
    const conferme = await q(`
      SELECT d.id, d.tipo, d.numero, d.anno, d.data, d.stato, d.origine, d.email_a, d.email_inviata_il, d.inviato_a_mano, d.ordine_id,
        coalesce(nullif(d.imponibile, 0), (SELECT round(sum(r.quantita * r.prezzo), 2) FROM documenti_righe r WHERE r.documento_id = d.id), 0)::float AS imponibile,
        o.numero AS ordine_numero, o.anno AS ordine_anno, o.rif_cliente, c.ragione_sociale
      FROM documenti d LEFT JOIN ordini o ON o.id = d.ordine_id LEFT JOIN clienti c ON c.id = d.cliente_id
      WHERE d.tipo = 'conferma_ordine' AND (d.anno = $1 OR d.numero IS NULL)
      ORDER BY d.numero IS NOT NULL, d.numero DESC NULLS LAST, d.id DESC`, [anno]);
    const anni = await q<{ anno: number }>(`SELECT DISTINCT anno FROM documenti WHERE tipo = 'conferma_ordine' ORDER BY anno DESC`);
    const modulo = moduloAzioni({
      azione: '/ordini/conferme/azioni', nome: { singolare: "conferma d'ordine", plurale: "conferme d'ordine", femminile: true },
      pulsanti: [
        { azione: 'pdf', testo: 'Apri il PDF', serve: '1', nuovaScheda: true, titolo: 'PDF della conferma emessa' },
        { azione: 'duplica', testo: 'Duplica', serve: '1+', titolo: 'Nuova bozza con le stesse righe, da emettere con il numero successivo' },
        { azione: 'annulla', testo: 'Annulla / Elimina', serve: '1+', pericolo: true,
          chiedi: "Annullare {n} conferm{a|e} d'ordine? Le bozze si eliminano; quelle emesse restano nell'elenco come annullate e il numero non si riusa." },
      ] });
    res.send(pagina(req.session.utente, "Conferme d'ordine", 'conferme', html`
      <p class="nota">Le conferme d'ordine si preparano dalla pagina dell'ordine (pulsante "Conferma d'ordine"), qui c'è l'elenco di tutte.
        Le bozze stanno in cima. Il numero continua la serie "Ordini" di Fatture in Cloud.</p>
      ${anni.length > 1 ? html`<p>${anni.map(a => html`<a href="/ordini/conferme?anno=${a.anno}" class="${a.anno === anno ? 'attiva' : ''}">${a.anno}</a> `)}</p>` : ''}
      ${modulo.apri}
      <div class="tabella-scorre"><table class="elenco"><thead><tr>${casellaTutti()}<th>Numero</th><th>Data</th><th>Cliente</th><th>Ordine</th><th>Stato</th><th title="${INVIATO_TITOLO}">Inviata</th><th class="n">Imponibile</th></tr></thead>
        <tbody>${conferme.length ? conferme.map(k => html`<tr>
          ${casella(k.id, k.numero ? `conferma ${k.numero}/${k.anno}` : 'bozza')}
          <td><a href="/ordini/${k.ordine_id}/conferme/${k.id}">${k.numero ? `${k.numero}/${k.anno}` : 'bozza'}</a></td>
          <td>${data(k.data)}</td><td>${k.ragione_sociale ?? ''}</td>
          <td>${k.ordine_id ? html`<a href="/ordini/${k.ordine_id}">${k.ordine_numero}/${k.ordine_anno}</a>${k.rif_cliente ? html` <span class="nota">${k.rif_cliente}</span>` : ''}` : ''}</td>
          <td>${statoConferma(k.stato)}</td><td data-valore="${k.email_inviata_il ? new Date(k.email_inviata_il).toISOString() : ''}">${k.numero ? segnoInvioElenco(k) : ''}</td>
          <td class="n">${k.imponibile != null ? euro(k.imponibile) : ''}</td></tr>`)
          : html`<tr><td colspan="8" class="nota">Nessuna conferma d'ordine nel ${anno}.</td></tr>`}</tbody></table></div>
      ${modulo.chiudi}`));
  });

  // azioni sulle conferme spuntate: PDF, Duplica (nuova bozza), Annulla / Elimina (bozze eliminate, emesse annullate)
  r.post('/conferme/azioni', async (req, res) => {
    const ids = idsSpuntati(req.body), azione = String(req.body.azione ?? '');
    const torna = (msg: string) => res.redirect(conMessaggio(String(req.get('referer') ?? '/ordini/conferme').replace(/^https?:\/\/[^/]+/, '') || '/ordini/conferme', msg));
    if (!ids.length) return torna("Nessuna conferma d'ordine selezionata.");
    const righe = await q<{ id: number; ordine_id: number; numero: number | null; anno: number; stato: string }>(
      `SELECT id, ordine_id, numero, anno, stato FROM documenti WHERE tipo = 'conferma_ordine' AND id = ANY($1) ORDER BY id`, [ids]);
    if (azione === 'pdf') {
      if (righe.length !== 1) return torna('Il PDF si apre per una conferma alla volta.');
      if (!righe[0].numero) return torna('La bozza non ha ancora il PDF: aprila ed emettila.');
      return res.redirect(`/ordini/${righe[0].ordine_id}/conferme/${righe[0].id}/pdf`);
    }
    if (azione === 'duplica') {
      const nuove: number[] = [];
      for (const k of righe) { const id = await duplicaConferma(k.id, req.session.utente?.id ?? null); if (id) nuove.push(id); }
      if (nuove.length === 1) return res.redirect(`/ordini/${righe[0].ordine_id}/conferme/${nuove[0]}?msg=${encodeURIComponent('Copia pronta come bozza: controlla e premi Emetti (prende il numero successivo).')}`);
      return torna(`${nuove.length} copie create come bozze in cima all'elenco.`);
    }
    if (azione === 'annulla') {
      let eliminate = 0, annullate = 0, gia = 0;
      for (const k of righe) {
        if (k.stato === 'annullato') { gia++; continue; }
        const esito = await eliminaOAnnulla(k.id);
        if (esito === 'eliminata') eliminate++; else if (esito === 'annullata') annullate++;
      }
      return torna([annullate ? `${annullate} annullat${annullate === 1 ? 'a' : 'e'} (numero non riusato)` : '', eliminate ? `${eliminate} bozz${eliminate === 1 ? 'a eliminata' : 'e eliminate'}` : '',
        gia ? `${gia} già annullat${gia === 1 ? 'a' : 'e'}` : ''].filter(Boolean).join(', ') + '.');
    }
    return torna('Azione non riconosciuta.');
  });

  // ── Scheda dell'ordine ──
  r.get('/:id', async (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return next();
    const o = await q1(`SELECT o.*, c.ragione_sociale FROM ordini o LEFT JOIN clienti c ON c.id = o.cliente_id WHERE o.id = $1`, [Number(req.params.id)]);
    if (!o) return res.status(404).send('Ordine non trovato');
    const righe = await righeOrdini(o.id);
    const ddt = await q(`SELECT d.*, r.chiave FROM ddt_righe d JOIN ordini_righe r ON r.id = d.riga_id WHERE r.ordine_id = $1 ORDER BY d.data, d.numero`, [o.id]);
    const fatture = await q(`SELECT f.*, r.chiave FROM fatture_righe f JOIN ordini_righe r ON r.id = f.riga_id WHERE r.ordine_id = $1 ORDER BY f.data, f.numero`, [o.id]);
    const commesse = await q(`SELECT id, numero, preventivo_id FROM commesse WHERE cliente_id = $1 ORDER BY creato_il DESC LIMIT 50`, [o.cliente_id ?? -1]);
    // preventivo di ogni riga (Adriano 11/11/2026): salvato, oppure proposto (stesso prodotto o stesso codice); menu con tutti quelli del cliente
    const preventivi = o.cliente_id ? await preventiviDelCliente(o.cliente_id) : [];
    const dataOrd = o.data_ordine ? (typeof o.data_ordine === 'string' ? o.data_ordine.slice(0, 10) : new Date(o.data_ordine).toISOString().slice(0, 10)) : null;
    const preventivoDellaRiga = (x: RigaElenco) => {
      if (x.preventivoId) { const k = preventivi.find(p => p.id === x.preventivoId); return k ? { k, proposto: false } : null; }
      const pr = propostaPreventivo({ prodottoId: x.prodottoId, codici: [x.codice, x.codiceCliente], quantita: x.quantita, dataOrdine: dataOrd }, preventivi);
      const k = pr ? preventivi.find(p => p.id === pr.id) : undefined;
      return k ? { k, proposto: true } : null;
    };
    const sceltaPreventivo = (x: RigaElenco) => {
      const rigaP = { prodottoId: x.prodottoId, codici: [x.codice, x.codiceCliente], quantita: x.quantita, dataOrdine: dataOrd };
      const proposta = x.preventivoId ? null : propostaPreventivo(rigaP, preventivi);
      const scelto = x.preventivoId ?? proposta?.id ?? null;
      const stessi = new Set(preventiviDellaRiga(rigaP, preventivi).candidati.map(k => k.id));
      const voce = (k: (typeof preventivi)[number]) => html`<option value="${k.id}" ${k.id === scelto ? raw('selected') : ''}>${etichettaPreventivo(k)}</option>`;
      const salvato = x.preventivoId ? preventivi.find(k => k.id === x.preventivoId) : undefined;
      return html`<label class="nota">Preventivo
        <select name="righe[r${x.id}][preventivo]" class="cercabile" aria-label="Preventivo della riga">
          <option value="">— nessuno —</option>
          ${stessi.size ? html`<optgroup label="Stesso codice">${preventivi.filter(k => stessi.has(k.id)).map(voce)}</optgroup>` : ''}
          <optgroup label="${stessi.size ? 'Altri preventivi del cliente' : 'Preventivi del cliente'}">${preventivi.filter(k => !stessi.has(k.id)).map(voce)}</optgroup>
        </select></label>
        ${proposta ? html`<small class="esito verifica" title="Trovato dal portale: premi Salva per confermarlo">proposto (${proposta.motivo === 'prodotto' ? 'stesso prodotto' : 'stesso codice'}): Salva per confermare</small>` : ''}
        ${!scelto && x.tipo === 'scheda' && preventivi.length ? html`<small class="esito verifica">nessun preventivo con questo codice: sceglilo dal menu</small>` : ''}
        ${salvato ? html`<a href="/preventivi/${salvato.id}" class="nota">apri ${salvato.numero}</a>` : ''}`;
    };
    const conferme = await confermeDellOrdine(o.id);
    // codice delle righe solo dall'anagrafica del cliente (regola dei documenti, Adriano 31/10/2026)
    const prodotti: { id: number; codice: string; descrizione: string | null }[] = o.cliente_id ? await prodottiPerCliente(o.cliente_id) : [];
    // servizi una tantum (UT-…, Adriano 3/11/2026): stessi codici per tutti i clienti, in fondo al menu (valore "ut:CODICE")
    const servizi = await serviziAttivi();
    const sceltaProdotto = (nome: string, id: number | null | undefined, codiceVecchio?: string | null) => {
      const servizio = !id && codiceVecchio ? servizi.find(s => s.codice === String(codiceVecchio).trim().toUpperCase()) : undefined;
      return html`<select name="${nome}" class="cercabile" aria-label="Codice dall'anagrafica del cliente o servizio una tantum">
      <option value="">${codiceVecchio && !id && !servizio ? `${codiceVecchio} (non in anagrafica)` : '— senza codice —'}</option>
      ${prodotti.map(k => html`<option value="${k.id}" data-descrizione="${k.descrizione ?? ''}" ${k.id === id ? raw('selected') : ''}>${k.codice}</option>`)}
      ${opzioniServizi(servizi, servizio?.codice, s => `ut:${s.codice}`)}</select>`;
    };
    // prezzi diversi dall'anagrafica (Adriano 11/11/2026): righe ancora aperte con codice; l'ufficio sceglie quale tenere
    const idProdotti = [...new Set(righe.filter(x => x.prodottoId).map(x => x.prodottoId!))];
    const listino = new Map((idProdotti.length ? await q<{ id: number; codice: string; prezzo: number | null; fonte: string | null; data: string | null; nota: string | null }>(
      `SELECT id, codice, prezzo_vendita::float AS prezzo, prezzo_fonte AS fonte, prezzo_data::text AS data, prezzo_nota AS nota FROM prodotti WHERE id = ANY($1)`, [idProdotti]) : []).map(k => [k.id, k]));
    const scaglioniProdotti = await scaglioniDi(idProdotti);
    const prezziDiversi = righe.flatMap(x => {
      if (x.tipo !== 'scheda' || !x.prodottoId || !['da_evadere', 'parziale'].includes(x.stato)) return [];
      const d = differenzaOrdine(Number(x.prezzo), Number(x.quantita), listino.get(x.prodottoId)?.prezzo ?? null, scaglioniProdotti.get(x.prodottoId) ?? []);
      return d ? [{ riga: x, codice: listino.get(x.prodottoId)?.codice ?? x.codice ?? '', anagrafica: d.anagrafica, prodotto: listino.get(x.prodottoId) }] : [];
    });
    const stato = statoOrdine(righe.map(x => x.stato));
    const spedizioni = righe.flatMap(x => x.spedizioni).sort((a, b) => a.data.localeCompare(b.data));
    const campoData = (nome: string, v: string | null | undefined) => html`<input type="date" name="${nome}" value="${v ?? ''}">`;
    const ddtRicevuti = await ddtRicevutiPerOrdineCliente(o.id);
    const ddtPortale = await q(`SELECT DISTINCT d.id, d.numero, d.data, d.stato FROM documenti d LEFT JOIN documenti_righe x ON x.documento_id = d.id
      LEFT JOIN ordini_righe y ON y.id = x.riga_ordine_id
      WHERE d.tipo = 'ddt' AND d.stato <> 'annullato' AND (d.ordine_id = $1 OR y.ordine_id = $1) ORDER BY d.data, d.numero`, [o.id]);
    res.send(pagina(req.session.utente, `Ordine ${o.numero}/${o.anno}`, '', html`
      <div class="intestazione-pagina"><h2>Ordine ${o.numero}/${o.anno} <span class="stato ${stato}">${STATI_ORDINE[stato]}</span></h2>
        ${o.origine === 'postumo' ? '' : html`<form method="post" action="/ordini/${o.id}/conferme" class="inline">
          <button class="primario" title="Conferma d'ordine per il cliente con le righe e le date di consegna dell'ordine (modificabili)">${conferme.some(k => k.stato === 'bozza')
            ? "Riprendi la conferma d'ordine" : conferme.some(k => k.stato !== 'annullato') ? "Nuova conferma d'ordine" : "Conferma d'ordine"}</button></form>`}
        <form method="post" action="/ordini/${o.id}/elimina" class="inline"
          data-conferma="${confermaEliminaOrdine({ numero: o.numero, anno: o.anno, origine: o.origine, righe: righe.length, conDocumenti: ddt.length + fatture.length > 0 })}">
          <button class="pericolo" title="Elimina l'ordine inserito per errore">Elimina ordine</button></form>
        ${['da_evadere', 'parziale'].includes(stato) ? html`<form method="post" action="/ordini/${o.id}/evaso" class="inline"
          data-conferma="${`Segnare come evase tutte le righe ancora aperte dell'ordine ${o.numero}/${o.anno}? Usalo quando la merce è stata consegnata ma il DDT ha un codice diverso o manca. Si torna indietro scegliendo "automatico" nello stato delle righe.`}">
          <button title="Merce consegnata: tutte le righe aperte diventano evase">Segna tutto evaso</button></form>` : ''}
        ${['da_evadere', 'parziale'].includes(stato) && o.cliente_id ? html`<form method="post" action="/amministrazione/documenti/ddt-da-ordine/${o.id}" class="inline">
          <button class="primario" title="DDT (bozza) con le schede ancora da spedire">Crea DDT</button></form>` : ''}
        ${['da_evadere', 'parziale'].includes(stato) && o.cliente_id ? html`<form method="post" action="/amministrazione/documenti/acconto-da-ordine/${o.id}" class="inline"
          data-conferma="Preparare una fattura d'acconto (bozza) su questo ordine? Poi la scali sulla fattura di saldo."><button title="Anticipo chiesto al cliente prima della consegna (TD02)">Fattura d'acconto</button></form>` : ''}</div>
      ${o.origine === 'postumo' ? html`<p class="avviso postumo"><b>${ETICHETTA_POSTUMO}.</b> Non è un ordine del cliente: copre una fattura che non aveva un ordine registrato,
        così ordini e fatturato tornano. È già evaso e non va in produzione, nel Gantt o negli acquisti.
        ${o.fattura_id ? html`<a href="/amministrazione/documenti/${o.fattura_id}">Apri la fattura</a> · ` : ''}<a href="/ordini/fatture?anno=${o.anno}">Ordini e fatturato</a></p>` : ''}
      ${ddtPortale.length ? html`<p class="nota">DDT del portale: ${ddtPortale.map((x, i) => html`${i ? ', ' : ''}<a href="/amministrazione/documenti/${x.id}">${x.numero == null ? 'bozza' : `n. ${x.numero}`} del ${data(x.data)}</a>`)}</p>` : ''}
      <dl class="dati-ordine">
        <dt>Cliente</dt><dd>${o.cliente_nome}${o.cliente_id ? '' : html` <span class="esito verifica">non in anagrafica</span>`}</dd>
        <dt>Data ordine</dt><dd>${data(o.data_ordine)}</dd>
        <dt>Ordine del cliente</dt><dd>${o.rif_cliente}${o.data_ordine_cliente ? html` del ${data(o.data_ordine_cliente)}` : ''}${o.file ? html` <small class="nota">(${o.file})</small>` : ''}</dd>
        <dt>Origine</dt><dd>${({ fic: 'Fatture in Cloud', ordine_cliente: 'ordine del cliente (non in Fatture in Cloud)', foglio: 'foglio Schedulazione', manuale: 'inserito a mano', email: 'email', preventivo: 'dal preventivo', postumo: ETICHETTA_POSTUMO } as Record<string, string>)[o.origine] ?? o.origine}</dd>
        ${o.note ? html`<dt>Note</dt><dd>${o.note}</dd>` : ''}
        ${conferme.length ? html`<dt>Conferme d'ordine</dt><dd>${conferme.map((k, i) => html`${i ? ' · ' : ''}<a href="/ordini/${o.id}/conferme/${k.id}">${k.numero ? `n. ${k.numero}/${k.anno}` : 'bozza'}</a>
          del ${data(k.data)} ${statoConferma(k.stato)} ${k.numero ? segnoInvioElenco({ ...k, tipo: 'conferma_ordine' }) : ''}`)}</dd>` : ''}
      </dl>
      ${prezziDiversi.length ? html`<section class="avviso prezzi-ordine"><b>Prezzi dell'ordine diversi dall'anagrafica.</b> Scegli quale tenere per ogni riga:
        "Tieni l'anagrafica" mette il prezzo dell'anagrafica nella riga (conferma d'ordine e fattura usciranno così), "Aggiorna l'anagrafica" prende il prezzo dell'ordine.
        <table><thead><tr><th>Codice</th><th class="n">Q.tà</th><th class="n">Ordine</th><th class="n">Anagrafica</th><th>Da dove viene il prezzo</th><th>Preventivo della riga</th><th></th></tr></thead>
        <tbody>${prezziDiversi.map(k => {
          const pv = preventivoDellaRiga(k.riga);
          const fonte = k.prodotto?.fonte ? `${FONTI_PREZZO_ANAGRAFICA[k.prodotto.fonte] ?? k.prodotto.fonte}${k.prodotto.data ? ` del ${data(k.prodotto.data)}` : ''}` : '';
          return html`<tr><td>${k.codice}</td><td class="n">${num(Number(k.riga.quantita), 0)}</td>
          <td class="n">${euroUnitario(Number(k.riga.prezzo))}</td><td class="n">${k.anagrafica == null ? 'nessun prezzo' : euroUnitario(k.anagrafica)}</td>
          <td><small>${fonte}${k.prodotto?.nota ? html`<br><span class="nota">${k.prodotto.nota}</span>` : ''}</small></td>
          <td>${pv ? html`<a href="/preventivi/${pv.k.id}" target="_blank" rel="noopener" title="Apri il preventivo per controllare">${pv.k.numero}</a>
            <small class="nota">${pv.k.nSchede} pz${pv.k.prezzoScheda != null ? html` · ${euroUnitario(pv.k.prezzoScheda)} a scheda` : ''}${pv.proposto ? ' · proposto, da verificare' : ''}</small>`
            : html`<small class="nota">nessuno: sceglilo nella riga sotto</small>`}</td>
          <td class="nowrap">${k.anagrafica == null ? '' : html`<button form="prezzo-${k.riga.id}-anagrafica">Tieni l'anagrafica</button> `}
            <button form="prezzo-${k.riga.id}-ordine" class="primario">${k.anagrafica == null ? 'Salva in anagrafica' : "Aggiorna l'anagrafica"}</button></td></tr>`;
        })}</tbody></table>
        ${prezziDiversi.map(k => html`<form method="post" action="/ordini/${o.id}/righe/${k.riga.id}/prezzo" id="prezzo-${k.riga.id}-anagrafica" hidden><input type="hidden" name="scelta" value="anagrafica"></form>
          <form method="post" action="/ordini/${o.id}/righe/${k.riga.id}/prezzo" id="prezzo-${k.riga.id}-ordine" hidden><input type="hidden" name="scelta" value="ordine"></form>`)}</section>` : ''}
      <form method="post" action="/ordini/${o.id}">
      <div class="tabella-scorre"><table class="elenco righe-ordine">
        <thead><tr><th>Codice</th><th>Descrizione</th><th class="n">Q.tà</th><th class="n">Spedite</th><th class="n">Prezzo</th><th class="n">Fatturato</th>
          <th>Consegna richiesta</th><th>Arrivo materiale</th><th>Lavorazione</th><th>Ritardi (gg)</th><th>Consegna prevista</th><th>Ritardo</th><th>Stato</th><th>Commessa</th><th>Note</th><th></th></tr></thead>
        <tbody>${righe.map(x => html`<tr id="riga-${x.id}" class="${x.tipo === 'servizio' ? 'servizio' : ''}">
          <td class="nowrap">${sceltaProdotto(`righe[r${x.id}][prodotto]`, x.prodottoId, x.codice)}${!x.prodottoId && x.tipo !== 'servizio' && o.cliente_id ? html`<details class="nuovo-prodotto-riga"><summary>+ Nuovo prodotto</summary>
            <label>Codice <input name="righe[r${x.id}][np_codice]" value="${codiceProposto(x.codice, x.descrizione)}" class="maiuscolo"></label>
            <label>Descrizione <input name="righe[r${x.id}][np_descrizione]" value="${x.descrizione ?? ''}" class="maiuscolo lungo"></label>
            <button formaction="/ordini/${o.id}/prodotto?riga=${x.id}" title="Va in Anagrafiche → Prodotti del cliente e si collega a questa riga">Aggiungi in anagrafica</button></details>` : ''}${x.codiceCliente && x.codiceCliente !== x.codice ? html`<br><small class="nota">cliente: ${x.codiceCliente}</small>` : ''}
            ${x.tipo === 'scheda' || x.preventivoId ? html`<div class="preventivo-riga">${sceltaPreventivo(x)}</div>` : ''}</td>
          <td><input name="righe[r${x.id}][descrizione]" value="${x.descrizione ?? ''}" class="maiuscolo lungo">${x.descrizioneCliente && x.descrizioneCliente !== x.descrizione ? html`<br><small class="nota">cliente: ${x.descrizioneCliente}</small>` : ''}</td>
          <td class="n">${x.consegne?.length ? num(x.quantita, 0) : html`<input name="righe[r${x.id}][quantita]" value="${numCampo(x.quantita, 3)}" inputmode="decimal" class="corto">`}</td>
          <td class="n">${x.tipo === 'scheda' ? num(x.quantitaSpedita, 0) : ''}</td>
          <td class="n"><input name="righe[r${x.id}][prezzo]" value="${numCampo(x.prezzo, 5)}" inputmode="decimal" class="corto"></td><td class="n">${x.importoFatturato ? euro(x.importoFatturato) : ''}</td>
          <td>${x.consegne?.length ? data(x.consegnaRichiesta) : html`<input type="date" name="righe[r${x.id}][richiesta]" value="${x.consegnaRichiesta ?? ''}">`}${x.consegne?.length ? html`<details><summary>${x.consegne.length} consegne</summary>${x.consegne.map(k => html`${data(k.data)}: ${num(k.quantita, 0)}<br>`)}</details>` : ''}</td>
          <td>${campoData(`righe[r${x.id}][arrivo]`, x.arrivoMateriale)}</td>
          <td>${campoData(`righe[r${x.id}][lavorazione]`, (righeDb(x).dataLavorazione))}<br><small class="nota">${x.lavorazione && !righeDb(x).dataLavorazione ? `calcolata: ${data(x.lavorazione)}` : ''}</small></td>
          <td><input name="righe[r${x.id}][ritardi]" value="${x.ritardiProduzione || ''}" inputmode="numeric" class="corto"></td>
          <td>${campoData(`righe[r${x.id}][prevista]`, righeDb(x).consegnaPrevista)}<br><small class="nota">${x.prevista && !righeDb(x).consegnaPrevista ? `calcolata: ${data(x.prevista)}` : ''}</small></td>
          <td>${ritardo(x.ritardo)}</td>
          <td><span class="stato ${x.stato}">${STATI_ORDINE[x.stato]}</span><br>
            <select name="righe[r${x.id}][stato]" title="Stato deciso dall'ufficio (vince sul calcolo)">
              ${[['', 'automatico'], ['evaso', 'evaso'], ['da_evadere', 'da evadere'], ['annullato', 'annullato']].map(([v, t]) => html`<option value="${v}" ${(x.statoManuale ?? '') === v ? raw('selected') : ''}>${t}</option>`)}
            </select></td>
          <td class="preventivo-commessa"><label class="nota">Commessa <select name="righe[r${x.id}][commessa]"><option value="">—</option>${commesse.map(k => html`<option value="${k.id}" ${k.id === x.commessaId ? raw('selected') : ''}>${k.numero}</option>`)}</select></label>
            ${x.commessaId ? html`<a href="/commesse/${x.commessaId}" class="nota">apri</a>`
              : x.preventivoId && x.tipo === 'scheda' ? html`<a class="bottone piccolo" href="/commesse/nuova?preventivo=${x.preventivoId}&riga=${x.id}"
                title="Commessa con il preventivo collegato, quantità, ordine del cliente e consegna di questa riga">Crea commessa</a>` : ''}</td>
          <td><input name="righe[r${x.id}][note]" value="${x.note ?? ''}"></td>
          <td><button form="elimina-riga-${x.id}" class="link negativo" title="Elimina questa riga"
            data-conferma="${`Eliminare la riga ${x.codice || x.descrizione || ''} (${num(x.quantita, 0)} pz) dall'ordine ${o.numero}/${o.anno}? Le modifiche non salvate delle altre righe si perdono.`}">Elimina</button></td>
        </tr>`)}
        <tr class="riga-nuova"><td>${sceltaProdotto('nuova[prodotto]', null)}</td>
          <td><input name="nuova[descrizione]" class="maiuscolo lungo" placeholder="+ riga nuova: descrizione"></td>
          <td class="n"><input name="nuova[quantita]" inputmode="decimal" class="corto"></td><td></td>
          <td class="n"><input name="nuova[prezzo]" inputmode="decimal" class="corto"></td><td></td>
          <td><input type="date" name="nuova[richiesta]"></td>
          <td colspan="6"><select name="nuova[tipo]"><option value="scheda">schede</option><option value="servizio">servizio (una tantum, lamine…)</option></select></td>
          <td></td><td></td><td></td></tr></tbody></table></div>
      <p><button class="primario">Salva</button> <span class="nota">Codice, descrizione, quantità, prezzo e consegna si correggono qui; la conferma d'ordine già fatta non cambia da sola:
        aprila e premi «Riprendi le righe dall'ordine».</span></p>
      </form>
      ${righe.map(x => html`<form method="post" action="/ordini/${o.id}/righe/${x.id}/elimina" id="elimina-riga-${x.id}" hidden></form>`)}
      <div class="due-colonne">
        <section><h2>DDT</h2>${ddt.length ? html`<table><thead><tr><th>DDT</th><th>Data</th><th>Codice</th><th class="n">Q.tà</th></tr></thead>
          <tbody>${ddt.map(d => html`<tr><td>${d.numero}</td><td>${data(d.data)}</td><td>${d.codice || d.descrizione}</td><td class="n">${num(d.quantita, 0)}</td></tr>`)}</tbody></table>` : spedizioni.length ? '' : html`<p class="nota">Nessun DDT.</p>`}
          ${spedizioni.length ? html`<h3>Abbinati in automatico</h3><p class="nota">DDT del portale con lo stesso cliente e lo stesso codice (o descrizione).
            Se un abbinamento è sbagliato, scegli lo stato della riga a mano.</p>
            <table><thead><tr><th>Documento</th><th>Codice</th><th class="n">Q.tà</th></tr></thead>
            <tbody>${spedizioni.map(a => html`<tr><td>${a.documento}</td><td>${a.codice}</td><td class="n">${num(a.quantita, 0)}</td></tr>`)}</tbody></table>` : ''}</section>
        ${ddtRicevuti.length ? html`<section><h2>Materiale arrivato dal cliente</h2>
          <p class="nota">DDT del cliente letti da Da acquisire e collegati a quest'ordine (conto lavoro). Elenco in Acquisti → DDT ricevuti.</p>
          <table><thead><tr><th>DDT</th><th>Data</th><th>Codice</th><th class="n">Q.tà</th><th>Anomalia</th></tr></thead>
          <tbody>${ddtRicevuti.map(k => html`<tr><td>${k.acquisizione_id ? html`<a href="/ordini/acquisire/${k.acquisizione_id}">${k.numero ?? '?'}</a>` : k.numero ?? '?'}</td><td>${data(k.data)}</td>
            <td>${k.codice || k.descrizione}</td><td class="n">${num(Number(k.quantita), 0)}</td><td>${k.anomalia ? html`<span class="esito verifica">${k.anomalia}</span>` : ''}</td></tr>`)}</tbody></table></section>` : ''}
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
      const nomi: string[] = [], bloccati: string[] = [];
      await salvaBackupSuDisco('prima-di-eliminare-ordini').catch(() => null);   // una copia sola per tutti, non una per ordine
      for (const id of ordini) { const o = await eliminaOrdine(id, { senzaBackup: true }); if (o?.bloccato) bloccati.push(`${o.numero}/${o.anno} ${o.bloccato}`); else if (o) nomi.push(`${o.numero}/${o.anno}`); }
      const coda = bloccati.length ? ` Non eliminati: ${bloccati.join('; ')}.` : '';
      return torna((nomi.length === 1 ? `Ordine ${nomi[0]} eliminato.` : nomi.length ? `Eliminati ${nomi.length} ordini: ${nomi.join(', ')}.` : 'Nessun ordine eliminato.') + coda);
    }
    torna('Azione non riconosciuta.');
  });

  // prezzo della riga diverso dall'anagrafica (Adriano 11/11/2026): tieni l'anagrafica o aggiornala col prezzo dell'ordine
  r.post('/:id/righe/:riga/prezzo', async (req, res, next) => {
    if (!/^\d+$/.test(req.params.id) || !/^\d+$/.test(req.params.riga)) return next();
    const id = Number(req.params.id);
    const m = await sceltaPrezzoOrdine(id, Number(req.params.riga), req.body?.scelta === 'anagrafica' ? 'anagrafica' : 'ordine');
    res.redirect(`/ordini/${id}?msg=${encodeURIComponent(m)}`);
  });

  r.post('/:id', async (req, res) => {
    const id = Number(req.params.id);
    const messaggi = await salvaRigheOrdine(id, req.body);
    res.redirect(messaggi.length ? `/ordini/${id}?msg=${encodeURIComponent(`Salvato. ${messaggi.join(' ')}`)}` : `/ordini/${id}?salvato=1`);
  });

  // prodotto nuovo da una riga dell'ordine (Adriano 3/11/2026): va nell'anagrafica del cliente dell'ordine e si collega alla riga
  r.post('/:id/prodotto', async (req, res) => {
    const id = Number(req.params.id);
    const o = await q1<{ cliente_id: number | null }>(`SELECT cliente_id FROM ordini WHERE id = $1`, [id]);
    if (!o) return res.status(404).send('Ordine non trovato');
    const riga = req.body?.righe?.[`r${Number(req.query.riga)}`];
    const esito = riga ? await aggiungiProdottoCliente(o.cliente_id ?? 0, { codice: riga.np_codice, descrizione: riga.np_descrizione }) : { errore: 'Riga non trovata.' };
    if ('id' in esito) riga.prodotto = String(esito.id);
    await salvaRigheOrdine(id, req.body);
    res.redirect(`/ordini/${id}?msg=${encodeURIComponent('id' in esito
      ? `${esito.codice} ${esito.esisteva ? 'era già in anagrafica: collegato' : 'aggiunto in anagrafica e collegato'} alla riga.` : `Prodotto non aggiunto: ${esito.errore}`)}`);
  });

  async function salvaRigheOrdine(id: number, body: any): Promise<string[]> {
    const req = { body };
    const messaggi: string[] = [];
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
      // correzioni della riga (Adriano 3/11/2026): codice solo dai prodotti del cliente, descrizione, quantità, prezzo, consegna richiesta
      if (x && 'prezzo' in x) await correggiRiga(id, Number(rigaId), x);
      // preventivo della riga (Adriano 11/11/2026)
      if (x && 'preventivo' in x) { const m = await collegaPreventivo(id, Number(rigaId), Number(x.preventivo) || null); if (m) messaggi.push(m); }
    }
    const n = req.body?.nuova;
    const servizio = /^ut:/i.test(String(n?.prodotto ?? ''));     // servizio una tantum: senza quantità vale 1
    if (n && (String(n.descrizione ?? '').trim() || Number(n.prodotto) || servizio) && ((numeroDa(n.quantita) ?? 0) > 0 || (servizio && !String(n.quantita ?? '').trim())))
      await aggiungiRiga(id, n);
    await q(`UPDATE ordini SET aggiornato_il = now() WHERE id = $1`, [id]);
    return messaggi;
  }

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
    if (o.bloccato) return res.redirect(`/ordini/${req.params.id}?msg=${encodeURIComponent(`Ordine non eliminato: ${o.bloccato}.`)}`);
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

/** Prodotto della riga: solo se è del cliente dell'ordine. */
async function prodottoDelCliente(ordineId: number, prodottoId: unknown) {
  if (!Number(prodottoId)) return null;
  return q1<{ id: number; codice: string; descrizione: string | null }>(`SELECT p.id, p.codice, p.descrizione FROM prodotti p JOIN ordini o ON o.cliente_id = p.cliente_id
    WHERE p.id = $1 AND o.id = $2`, [Number(prodottoId), ordineId]);
}
const maiuscolo = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
const dataRichiesta = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? String(v) : null);

/** Servizio una tantum scelto nel menu Codice dell'ordine (valore "ut:CODICE"). */
const servizioScelto = (v: unknown) => (/^ut:/i.test(String(v ?? '')) ? servizioPerCodice(String(v).slice(3)) : Promise.resolve(null));

/**
 * Correzione di una riga dell'ordine dalla sua scheda. Senza prodotto il codice vecchio (non in anagrafica) resta, un servizio una tantum tolto no.
 * Servizio una tantum scelto: codice UT-…, riga di tipo servizio. Le righe con consegne a programma tengono la quantità.
 */
async function correggiRiga(ordineId: number, rigaId: number, x: any) {
  const p = await prodottoDelCliente(ordineId, x.prodotto);
  const s = p ? null : await servizioScelto(x.prodotto);
  const quantita = numeroDa(x.quantita);
  await q(`UPDATE ordini_righe SET prodotto_id = $3, codice = CASE WHEN $11::text IS NOT NULL THEN $11 WHEN $3::int IS NULL
        THEN (CASE WHEN prodotto_id IS NULL AND upper(coalesce(codice, '')) NOT LIKE 'UT-%' THEN codice ELSE NULL END) ELSE $4 END,
      tipo = CASE WHEN $11::text IS NOT NULL THEN 'servizio' ELSE tipo END,
      descrizione = coalesce(nullif($5, ''), $6, $12, descrizione), prezzo = coalesce($7, prezzo),
      quantita = CASE WHEN $8::numeric IS NULL OR EXISTS (SELECT 1 FROM ordini_consegne k WHERE k.riga_id = ordini_righe.id) THEN quantita ELSE $8 END,
      consegna_richiesta = CASE WHEN $9 THEN consegna_richiesta ELSE $10::date END
    WHERE id = $1 AND ordine_id = $2`,
    [rigaId, ordineId, p?.id ?? null, p?.codice ?? null, maiuscolo(x.descrizione), p?.descrizione ?? null, numeroDa(x.prezzo), quantita != null && quantita > 0 ? quantita : null,
      !('richiesta' in x), dataRichiesta(x.richiesta), s?.codice ?? null, s?.descrizione ?? null]);
}

/** Riga aggiunta a mano nella scheda dell'ordine (una riga che mancava nel documento letto). */
async function aggiungiRiga(ordineId: number, n: any) {
  const p = await prodottoDelCliente(ordineId, n.prodotto);
  const s = p ? null : await servizioScelto(n.prodotto);
  const posizione = (await q1<{ m: number | null }>(`SELECT max(posizione) AS m FROM ordini_righe WHERE ordine_id = $1`, [ordineId]))?.m ?? -1;
  await q(`INSERT INTO ordini_righe (ordine_id, chiave, posizione, prodotto_id, codice, descrizione, tipo, quantita, prezzo, consegna_richiesta)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [ordineId, `M${Date.now()}`, posizione + 1, p?.id ?? null, p?.codice ?? s?.codice ?? null, maiuscolo(n.descrizione) || p?.descrizione || s?.descrizione || null,
      n.tipo === 'servizio' || s ? 'servizio' : 'scheda', numeroDa(n.quantita) ?? (s ? 1 : null), numeroDa(n.prezzo) ?? s?.prezzo ?? 0, dataRichiesta(n.richiesta)]);
}

/** Elimina un ordine con righe e consegne (DDT e fatture restano, senza ordine). Prima un backup. */
async function eliminaOrdine(id: number, opz: { senzaBackup?: boolean } = {}): Promise<{ numero: number; anno: number; bloccato?: string } | null> {
  const o = await q1<{ numero: number; anno: number }>(`SELECT numero, anno FROM ordini WHERE id = $1`, [id]);
  if (!o) return null;
  // una conferma d'ordine emessa (numerata, con PDF) si raggiunge solo dall'ordine: prima si annulla quella
  const conferme = await q<{ numero: number; anno: number }>(`SELECT numero, anno FROM documenti WHERE ordine_id = $1 AND tipo = 'conferma_ordine' AND stato = 'emesso'`, [id]);
  if (conferme.length) return { ...o, bloccato: `ha la conferma d'ordine n. ${conferme.map(x => `${x.numero}/${x.anno}`).join(', ')} emessa: annullala prima` };
  if (!opz.senzaBackup) await salvaBackupSuDisco('prima-di-eliminare-ordine').catch(() => null);
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
