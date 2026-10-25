/**
 * Ordini dei clienti: elenco delle righe (da evadere / evase), scheda dell'ordine con le date del foglio
 * "Schedulazione produzione", cruscotto (fatturato e previsione), Gantt della produzione, fatture senza ordine.
 */
import { Router } from 'express';
import { q, q1 } from '../db.js';
import { caricaOreGiorno, righeOrdini, secondiPerSchedaProdotti, type RigaElenco } from '../ordini-servizio.js';
import {
  STATI_ORDINE, caricoGiornaliero, consegneDaFare, cruscotto, differenzaGiorni, lavorativo, pianifica, piuGiorni, statoOrdine,
  type Barra, type DaPianificare,
} from '../../engine/ordini.js';
import { layout } from '../views/layout.js';
import { html, data, euro, num, raw, type Raw } from '../views/html.js';
import type { Utente } from '../views/layout.js';

const oggiRoma = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const nomeMese = (m: string) => `${MESI[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;

const VISTE = [['aperti', 'Da evadere'], ['evasi', 'Evasi'], ['tutti', 'Tutti'], ['cruscotto', 'Cruscotto'], ['gantt', 'Gantt'], ['fatture', 'Fatture senza ordine'], ['acquisire', 'Da acquisire']] as const;
function schede(attiva: string) {
  return html`<nav class="schede">${VISTE.map(([k, t]) => html`<a href="${k === 'aperti' ? '/ordini' : ['evasi', 'tutti'].includes(k) ? `/ordini?vista=${k}` : `/ordini/${k}`}"
    class="${k === attiva ? 'attiva' : ''}">${t}</a>`)}</nav>`;
}
export const pagina = (utente: Utente | undefined, titolo: string, attiva: string, contenuto: Raw, opz: { avviso?: string; script?: string } = {}) =>
  String(layout({ titolo, utente, attiva: 'ordini', largo: true, script: opz.script ?? 'elenco.js', avviso: opz.avviso,
    contenuto: html`<div class="intestazione-pagina"><h1>Ordini clienti</h1></div>${schede(attiva)}${contenuto}` }));

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
    res.send(pagina(req.session.utente, 'Ordini', vista, html`
      <form class="cerca" method="get">${vista !== 'aperti' ? html`<input type="hidden" name="vista" value="${vista}">` : ''}
        <input name="q" value="${req.query.q ?? ''}" placeholder="Cerca cliente, codice, n° ordine, rif. cliente…" type="search"><button>Cerca</button></form>
      ${tutte.length ? '' : html`<p class="vuoto">Nessun ordine nel portale. Si caricano da <a href="/impostazioni/ordini">Impostazioni → Ordini</a>.</p>`}
      <div class="tabella-scorre"><table class="elenco ordini">
        <thead><tr><th>Ordine</th><th>Data</th><th>Cliente</th><th>Rif. cliente</th><th>Codice</th><th>Descrizione</th>
          <th class="n">Q.tà</th><th class="n">Spedite</th><th class="n">Da fare</th><th class="n">Prezzo</th><th class="n">Valore da evadere</th>
          <th>Arrivo mat.</th><th>Consegna richiesta</th><th>Consegna prevista</th><th>Ritardo</th><th>Stato</th></tr></thead>
        <tbody>${righe.map(x => html`
          <tr class="cliccabile ${x.tipo === 'servizio' ? 'servizio' : ''} ${x.consegna && x.consegna < oggi && x.residuoQuantita > 0 ? 'scaduta' : ''}" data-href="/ordini/${x.ordineId}">
            <td class="nowrap"><a href="/ordini/${x.ordineId}">${x.numero}/${x.anno}</a></td><td>${data(x.dataOrdine)}</td>
            <td class="taglia">${x.cliente}</td><td>${x.rifCliente}</td><td class="nowrap">${x.codice}</td><td class="taglia">${x.descrizione}</td>
            <td class="n">${num(x.quantita, 0)}</td><td class="n">${x.tipo === 'scheda' ? num(x.quantitaSpedita, 0) : ''}</td>
            <td class="n">${x.residuoQuantita ? num(x.residuoQuantita, 0) : ''}</td><td class="n">${euro(x.prezzo)}</td>
            <td class="n">${x.residuoValore ? euro(x.residuoValore) : ''}</td>
            <td>${data(x.arrivoMateriale)}</td><td>${data(x.consegnaRichiesta)}${x.consegne?.length ? html` <small class="nota" title="consegne a programma">(${x.consegne.length} consegne)</small>` : ''}</td>
            <td>${data(x.prevista)}</td><td>${ritardo(x.ritardo)}</td>
            <td><span class="stato ${x.stato}">${STATI_ORDINE[x.stato]}</span></td>
          </tr>`)}</tbody>
        ${righe.length ? html`<tfoot><tr><td colspan="10">${righe.length} righe</td><td class="n"><b>${euro(totale)}</b></td><td colspan="5"></td></tr></tfoot>` : ''}
      </table></div>
      <p class="nota">Una riga è <b>evasa</b> quando le schede spedite con DDT arrivano alla quantità ordinata, <b>parziale</b> se ne è partita una parte.
        Le righe di servizio (attrezzaggio, lamine, programmazioni) sono evase quando sono fatturate o quando tutte le schede dell'ordine sono evase.
        Consegna prevista = arrivo materiale + ${3} gg + ${5} gg + ritardi di produzione, come nel foglio.</p>`));
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
    const mesi = Math.min(18, Math.max(1, Number(req.query.mesi) || 3));
    const fineVista = piuGiorni(oggi, mesi * 31);
    const barre = pianifica(daFare, oggi, oreGiorno).filter(b => b.inizio <= fineVista);
    const senzaData = righe.filter(x => !x.consegna).length;
    const carico = caricoGiornaliero(barre);
    const sovraccarichi = Object.entries(carico).filter(([d, o]) => d >= oggi && o > oreGiorno).length;
    res.send(pagina(req.session.utente, 'Gantt produzione', 'gantt', html`
      <form class="cerca" method="get"><label>Mostra <select name="mesi">${[1, 3, 6, 12, 18].map(m => html`<option value="${m}" ${m === mesi ? raw('selected') : ''}>${m} ${m === 1 ? 'mese' : 'mesi'}</option>`)}</select></label><button>Aggiorna</button></form>
      <p class="nota">Ogni barra è una consegna ancora da fare: finisce il giorno lavorativo prima della consegna (o parte dalla data di lavorazione = arrivo materiale + 3 gg)
        e dura le ore ciclo del preventivo × quantità ÷ ${num(oreGiorno)} ore al giorno (<a href="/impostazioni/ordini">Impostazioni → Ordini</a>).
        Barre tratteggiate: prodotto senza preventivo, durata di un giorno. ${senzaData ? html`<b>${senzaData} righe senza data di consegna</b> non sono nel Gantt.` : ''}
        ${sovraccarichi ? html`<b class="ritardo">${sovraccarichi} giorni con più ore di lavoro che ore disponibili.</b>` : ''}</p>
      <div class="legenda"><span class="campione barra"></span> lavorazione <span class="campione barra-ritardo"></span> in ritardo (doveva già iniziare) <span class="campione barra-stimata"></span> durata stimata
        <span class="campione consegna"></span> consegna</div>
      <div class="tabella-scorre grafico">${barre.length ? graficoGantt(barre, oggi, fineVista, carico, oreGiorno) : html`<p class="vuoto">Nessuna lavorazione da pianificare.</p>`}</div>
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
    const stato = statoOrdine(righe.map(x => x.stato));
    const campoData = (nome: string, v: string | null | undefined) => html`<input type="date" name="${nome}" value="${v ?? ''}">`;
    res.send(pagina(req.session.utente, `Ordine ${o.numero}/${o.anno}`, '', html`
      <h2>Ordine ${o.numero}/${o.anno} <span class="stato ${stato}">${STATI_ORDINE[stato]}</span></h2>
      <dl class="dati-ordine">
        <dt>Cliente</dt><dd>${o.cliente_nome}${o.cliente_id ? '' : html` <span class="esito verifica">non in anagrafica</span>`}</dd>
        <dt>Data ordine</dt><dd>${data(o.data_ordine)}</dd>
        <dt>Ordine del cliente</dt><dd>${o.rif_cliente}${o.data_ordine_cliente ? html` del ${data(o.data_ordine_cliente)}` : ''}${o.file ? html` <small class="nota">(${o.file})</small>` : ''}</dd>
        <dt>Origine</dt><dd>${({ fic: 'Fatture in Cloud', ordine_cliente: 'ordine del cliente (non in Fatture in Cloud)', foglio: 'foglio Schedulazione', manuale: 'inserito a mano', email: 'email' } as Record<string, string>)[o.origine] ?? o.origine}</dd>
        ${o.note ? html`<dt>Note</dt><dd>${o.note}</dd>` : ''}
      </dl>
      <form method="post" action="/ordini/${o.id}">
      <div class="tabella-scorre"><table class="elenco righe-ordine">
        <thead><tr><th>Codice</th><th>Descrizione</th><th class="n">Q.tà</th><th class="n">Spedite</th><th class="n">Prezzo</th><th class="n">Fatturato</th>
          <th>Consegna richiesta</th><th>Arrivo materiale</th><th>Lavorazione</th><th>Ritardi (gg)</th><th>Consegna prevista</th><th>Ritardo</th><th>Stato</th><th>Commessa</th><th>Note</th></tr></thead>
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
        </tr>`)}</tbody></table></div>
      <p><button class="primario">Salva</button></p>
      </form>
      <div class="due-colonne">
        <section><h2>DDT</h2>${ddt.length ? html`<table><thead><tr><th>DDT</th><th>Data</th><th>Codice</th><th class="n">Q.tà</th></tr></thead>
          <tbody>${ddt.map(d => html`<tr><td>${d.numero}</td><td>${data(d.data)}</td><td>${d.codice || d.descrizione}</td><td class="n">${num(d.quantita, 0)}</td></tr>`)}</tbody></table>` : html`<p class="nota">Nessun DDT.</p>`}</section>
        <section><h2>Fatture</h2>${fatture.length ? html`<table><thead><tr><th>Fattura</th><th>Data</th><th>Codice</th><th class="n">Imponibile</th></tr></thead>
          <tbody>${fatture.map(f => html`<tr><td>${f.numero}${f.ddt_numero ? html` <small class="nota">(DDT ${f.ddt_numero})</small>` : ''}</td><td>${data(f.data)}</td><td>${f.codice || f.descrizione}</td><td class="n">${euro(f.imponibile)}</td></tr>`)}</tbody></table>` : html`<p class="nota">Nessuna fattura.</p>`}</section>
      </div>`, { avviso: req.query.salvato ? 'Salvato' : undefined }));
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

  return r;
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

function graficoGantt(barre: Barra[], oggi: string, fineVista: string, carico: Record<string, number>, oreGiorno: number): Raw {
  // si parte dalla prima barra (al massimo un mese indietro: le lavorazioni in ritardo si vedono comunque)
  const prima = [oggi, ...barre.map(b => b.inizio)].sort()[0];
  const da = piuGiorni(prima < piuGiorni(oggi, -30) ? piuGiorni(oggi, -30) : prima, -2);
  const giorni = differenzaGiorni(fineVista, da) + 1;
  const G = 10, ET = 300, RIGA = 20, TESTA = 44;
  const W = ET + giorni * G + 10, H = TESTA + (barre.length + 1) * RIGA + 10;
  const x = (d: string) => ET + Math.max(0, Math.min(giorni, differenzaGiorni(d, da))) * G;
  const elencoGiorni = Array.from({ length: giorni }, (_, i) => piuGiorni(da, i));
  const taglia = (s: string) => (s.length > 44 ? s.slice(0, 43) + '…' : s);
  return html`<svg class="gantt" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Gantt della produzione">
    ${elencoGiorni.map(d => html`
      ${lavorativo(d) ? '' : html`<rect class="festivo" x="${x(d)}" y="${TESTA - 14}" width="${G}" height="${H - TESTA + 14}"/>`}
      ${d.endsWith('-01') ? html`<text class="asse mese" x="${x(d) + 2}" y="12">${nomeMese(d.slice(0, 7))}</text><line class="griglia" x1="${x(d)}" x2="${x(d)}" y1="0" y2="${H}"/>` : ''}
      ${new Date(d + 'T12:00:00Z').getUTCDay() === 1 ? html`<text class="asse" x="${x(d) + 1}" y="26">${Number(d.slice(8))}</text>` : ''}`)}
    <text class="asse" x="4" y="${TESTA + RIGA - 6}">Carico (ore/giorno, max ${num(oreGiorno)})</text>
    ${elencoGiorni.filter(d => carico[d]).map(d => html`<rect class="carico ${carico[d] > oreGiorno ? 'oltre' : ''}" x="${x(d) + 1}" y="${TESTA + RIGA - 2 - Math.min(1, carico[d] / (oreGiorno * 1.5)) * (RIGA - 4)}"
      width="${G - 2}" height="${Math.min(1, carico[d] / (oreGiorno * 1.5)) * (RIGA - 4)}"><title>${data(d)}: ${num(carico[d], 1)} ore</title></rect>`)}
    ${barre.map((b, i) => {
      const yy = TESTA + (i + 1) * RIGA;
      const x1 = x(b.inizio), x2 = x(piuGiorni(b.fine, 1));
      return html`<g><title>${b.etichetta}: ${data(b.inizio)} → ${data(b.fine)}${b.ore == null ? ' (senza preventivo)' : `, ${num(b.ore, 1)} ore`}, consegna ${data(b.consegna)}</title>
        <line class="riga" x1="0" x2="${W}" y1="${yy + RIGA}" y2="${yy + RIGA}"/>
        <text class="etichetta" x="4" y="${yy + 14}">${taglia(b.etichetta)}</text>
        <rect class="barra ${b.inRitardo ? 'ritardo' : ''} ${b.stimata ? 'stimata' : ''}" x="${x1}" y="${yy + 4}" width="${Math.max(3, x2 - x1 - 1)}" height="${RIGA - 8}" rx="3"/>
        ${b.consegna && b.consegna <= fineVista ? html`<path class="consegna" d="M${x(b.consegna) + G / 2} ${yy + 3} l4 7 l-4 7 l-4 -7 z"/>` : ''}</g>`;
    })}
    <line class="oggi" x1="${x(oggi) + G / 2}" x2="${x(oggi) + G / 2}" y1="${TESTA - 14}" y2="${H}"/>
    <text class="asse oggi" x="${x(oggi) + G / 2 + 3}" y="${TESTA - 4}">oggi</text>
  </svg>`;
}
