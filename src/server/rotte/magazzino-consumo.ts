/**
 * Acquisti → Materiale di consumo (Adriano 13/11/2026): le voci della scheda di produzione con costo per unità e prezzo dall'ultimo acquisto,
 * giacenza (inventario + ordini a fornitore − consumi delle commesse) e cruscotto. Montata su /acquisti/materiale-consumo.
 * Regole in engine/magazzino-consumo.ts, letture in magazzino-consumo-servizio.ts.
 */
import { Router, type Request } from 'express';
import { layout, tastiAcquisti } from '../views/layout.js';
import { html, euro, euroUnitario, num, numCampo, data, raw, type Raw } from '../views/html.js';
import { VOCI_MAGAZZINO, numeroScritto, voceMagazzino } from '../../engine/magazzino-consumo.js';
import {
  datiMagazzinoConsumo, eliminaInventario, salvaArticoliVoce, salvaInventario, salvaScortaECosto, type VoceSituazione,
} from '../magazzino-consumo-servizio.js';

const BASE = '/acquisti/materiale-consumo';
const oggiRoma = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
const torna = (testo: string, dove = BASE) => `${dove}${dove.includes('?') ? '&' : '?'}msg=${encodeURIComponent(testo)}`;
const dataValida = (x: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(x ?? '')) ? String(x) : oggiRoma());
const quant = (n: number | null | undefined, u: string) => (n == null ? '' : `${num(n, 3)} ${u}`);
const mesi = (n: number | null) => (n == null ? '' : n >= 24 ? 'oltre 2 anni' : `${num(n, 1)} mesi`);

function cifre(c: Awaited<ReturnType<typeof datiMagazzinoConsumo>>['cruscotto']): Raw {
  return html`<div class="cifre">
    <div class="cifra"><span>Valore del materiale in casa</span><b>${euro(c.valore)}</b><small>${c.vociConGiacenza} voci con la giacenza${c.vociSenzaInventario ? ` · ${c.vociSenzaInventario} senza inventario` : ''}</small></div>
    <div class="cifra"><span>Giacenza media</span><b>${euro(c.valoreMedio)}</b><small>media nel tempo dall'inventario (max 12 mesi), ai costi di oggi</small></div>
    <div class="cifra"><span>Acquistato negli ultimi 12 mesi</span><b>${euro(c.acquistato12)}</b><small>ordini a fornitore e fatture dei fornitori</small></div>
    <div class="cifra"><span>Consumo all'anno</span><b>${c.consumato12 == null ? '—' : euro(c.consumato12)}</b><small>${c.stimati ? 'dalle commesse rientrate, in parte stimato dai preventivi' : 'dalle commesse rientrate'}</small></div>
    <div class="cifra"><span>Copertura</span><b>${c.copertura == null ? '—' : mesi(c.copertura)}</b><small>quanto dura il materiale in casa con il consumo di oggi</small></div>
    <div class="cifra"><span>Rotazione</span><b>${c.rotazione == null ? '—' : `${num(c.rotazione, 1)} volte l'anno`}</b><small>consumo annuo ÷ giacenza media</small></div>
  </div>
  ${c.sottoScorta || c.vociSenzaPrezzo ? html`<p class="avviso">${c.sottoScorta ? `${c.sottoScorta} ${c.sottoScorta === 1 ? 'voce è' : 'voci sono'} sotto la scorta minima. ` : ''}${c.vociSenzaPrezzo ? `${c.vociSenzaPrezzo} ${c.vociSenzaPrezzo === 1 ? 'voce non ha' : 'voci non hanno'} un costo: manca un acquisto o il contenuto della confezione (apri la voce).` : ''}</p>` : ''}`;
}

function ultimoTesto(v: VoceSituazione): Raw {
  if (!v.ultimo) return v.costoManuale ? html`<small class="nota">costo scritto a mano</small>` : html`<small class="nota">nessun acquisto</small>`;
  const u = v.ultimo;
  return html`<small>${data(u.data)} · ${u.fornitore ?? ''}<br>${u.href ? html`<a href="${u.href}">${u.documento}</a>` : u.documento} · ${u.codice}${u.articolo.contenuto ? ` (${num(u.articolo.contenuto, 3)} ${v.voce.unita} a ${(u.articolo.um ?? 'pz').toLowerCase()})` : ' — contenuto da scrivere'}</small>`;
}

export function rotteMagazzinoConsumo() {
  const r = Router();

  r.get('/', async (req: Request, res) => {
    const oggi = oggiRoma();
    const d = await datiMagazzinoConsumo(oggi);
    const anni = [...new Set(d.voci.flatMap(v => Object.keys(v.spesaAnni).map(Number)))].sort((a, b) => b - a).slice(0, 4);
    res.send(String(layout({ titolo: 'Materiale di consumo', utente: req.session.utente, attiva: 'acquisti', largo: true,
      avviso: req.query.msg ? String(req.query.msg) : undefined, contenuto: html`
      <div class="intestazione-pagina"><h1>Acquisti · Materiale di consumo</h1><a class="bottone" href="/anagrafiche/materiali">Anagrafica dei materiali</a></div>
      ${tastiAcquisti(BASE)}
      <p class="nota">Le voci del riquadro «Materiale di consumo» della scheda di produzione. <b>Prezzo</b> = quanto è costata una confezione (o un kg, un litro…)
        all'ultimo acquisto; <b>costo</b> = prezzo per unità di misura. Si aggiornano da soli a ogni ordine a fornitore o fattura del fornitore.
        <b>Giacenza</b> = ultimo inventario + ordini a fornitore emessi dopo − materiale usato nelle commesse rientrate dopo (quello scritto al rientro; se manca, il previsto dal preventivo).</p>
      ${cifre(d.cruscotto)}
      <section class="blocco"><h2>Voci</h2>
        <div class="tabella-scorre"><table class="elenco">
          <thead><tr><th>Voce</th><th>Ultimo acquisto</th><th class="n">Prezzo</th><th class="n">Costo</th><th class="n">Giacenza</th><th class="n">Valore</th>
            <th class="n">Giacenza media</th><th class="n">Consumo al mese</th><th class="n">Copertura</th><th class="n">Scorta minima</th><th>Inventario</th></tr></thead>
          <tbody>${d.voci.map(v => html`<tr class="${v.ind.sottoScorta ? 'riga-attenzione' : ''}">
            <td><a href="${BASE}/voce/${v.voce.codice}"><b>${v.voce.nome}</b></a><br><small class="nota">${v.articoli.length} articoli${v.senzaContenuto.length ? html` · <span class="negativo">${v.senzaContenuto.length} senza contenuto</span>` : ''}</small></td>
            <td>${ultimoTesto(v)}</td>
            <td class="n" data-valore="${v.prezzo ?? ''}">${v.prezzo == null ? '' : html`${euroUnitario(v.prezzo)}<br><small class="nota">a ${(v.ultimo?.um ?? v.ultimo?.articolo.um ?? 'pz').toLowerCase()}</small>`}</td>
            <td class="n" data-valore="${v.costo ?? ''}">${v.costo == null ? '—' : html`<b>${euroUnitario(v.costo)}</b><br><small class="nota">al ${v.voce.unita}</small>`}</td>
            <td class="n" data-valore="${v.ind.giacenza ?? ''}">${v.ind.giacenza == null ? html`<small class="nota">da caricare</small>` : html`<b>${quant(v.ind.giacenza, v.voce.unita)}</b>`}${v.ind.sottoScorta ? html`<br><small class="negativo">sotto scorta</small>` : ''}</td>
            <td class="n" data-valore="${v.ind.valore ?? ''}">${euro(v.ind.valore)}</td>
            <td class="n" data-valore="${v.ind.media ?? ''}">${quant(v.ind.media, v.voce.unita)}${v.ind.valoreMedio != null ? html`<br><small class="nota">${euro(v.ind.valoreMedio)}</small>` : ''}</td>
            <td class="n" data-valore="${v.ind.consumoMese ?? ''}">${quant(v.ind.consumoMese, v.voce.unita)}</td>
            <td class="n" data-valore="${v.ind.copertura ?? ''}">${mesi(v.ind.copertura)}</td>
            <td class="n">${quant(v.scorta, v.voce.unita)}</td>
            <td>${v.situazione.inventario ? data(v.situazione.inventario.data) : ''}</td></tr>`)}</tbody>
        </table></div>
      </section>
      <section class="blocco"><h2>Caricare la giacenza (inventario)</h2>
        <p class="nota">Scrivi quanto materiale c'è oggi in casa per ogni voce, nella sua unità (es. 2,5 kg di pasta = 5 vasetti da 500 g). Le caselle vuote non cambiano.
          Da qui in avanti la giacenza sale con gli ordini a fornitore e scende con le commesse rientrate; per contare i pezzi articolo per articolo apri la voce.</p>
        <form method="post" action="${BASE}/inventario" class="modulo">
          <label>Data dell'inventario <input type="date" name="data" value="${oggi}" required></label>
          <table class="elenco"><thead><tr><th>Voce</th><th class="n">Giacenza attuale nel portale</th><th>Quantità contata</th></tr></thead>
            <tbody>${d.voci.map(v => html`<tr><td>${v.voce.nome}</td><td class="n">${quant(v.ind.giacenza, v.voce.unita)}</td>
              <td><input name="q_${v.voce.codice}" inputmode="decimal" class="corto" autocomplete="off"> ${v.voce.unita}</td></tr>`)}</tbody></table>
          <label>Nota <input name="nota" placeholder="facoltativa (es. inventario di fine anno)"></label>
          <button>Salva l'inventario</button></form>
      </section>
      ${anni.length ? html`<section class="blocco"><h2>Spesa anno per anno</h2>
        <p class="nota">Fatture dei fornitori abbinate ai materiali (anche lo storico) e ordini a fornitore del portale non ancora in una fattura letta riga per riga.</p>
        <table class="elenco"><thead><tr><th>Voce</th>${anni.map(a => html`<th class="n">${a}</th>`)}</tr></thead>
          <tbody>${d.voci.map(v => html`<tr><td>${v.voce.nome}</td>${anni.map(a => html`<td class="n">${v.spesaAnni[a] ? euro(v.spesaAnni[a]) : ''}</td>`)}</tr>`)}
            <tr class="totale"><td><b>Totale</b></td>${anni.map(a => html`<td class="n"><b>${euro(d.voci.reduce((s, v) => s + (v.spesaAnni[a] ?? 0), 0))}</b></td>`)}</tr></tbody></table>
      </section>` : ''}` })));
  });

  r.post('/inventario', async (req, res) => {
    const b = req.body ?? {};
    const giorno = dataValida(b.data), nota = String(b.nota ?? '').trim().slice(0, 200) || null;
    const salvate: string[] = [], errori: string[] = [];
    for (const v of VOCI_MAGAZZINO) {
      const testo = String(b[`q_${v.codice}`] ?? '').trim();
      if (!testo) continue;
      const n = numeroScritto(testo);
      if (n == null) { errori.push(`${v.nome}: "${testo}" non è un numero`); continue; }
      await salvaInventario(v.codice, n, giorno, req.session.utente?.id ?? null, nota, null);
      salvate.push(v.nome);
    }
    res.redirect(torna([salvate.length ? `Inventario salvato: ${salvate.join(', ')}.` : 'Nessuna quantità scritta: niente da salvare.', ...errori].join(' ')));
  });

  r.get('/voce/:voce', async (req, res, next) => {
    const voce = voceMagazzino(String(req.params.voce));
    if (!voce) return next();
    const oggi = oggiRoma();
    const d = await datiMagazzinoConsumo(oggi);
    const v = d.voci.find(x => x.voce.codice === voce.codice)!;
    const s = v.situazione;
    const base = `${BASE}/voce/${voce.codice}`;
    res.send(String(layout({ titolo: `Materiale di consumo · ${voce.nome}`, utente: req.session.utente, attiva: 'acquisti', largo: true,
      avviso: req.query.msg ? String(req.query.msg) : undefined, contenuto: html`
      <div class="intestazione-pagina"><h1>Materiale di consumo · ${voce.nome}</h1><a class="bottone" href="${BASE}">← Tutte le voci</a></div>
      <div class="cifre">
        <div class="cifra"><span>Prezzo (ultimo acquisto)</span><b>${v.prezzo == null ? '—' : euroUnitario(v.prezzo)}</b>${ultimoTesto(v)}</div>
        <div class="cifra"><span>Costo al ${voce.unita}</span><b>${v.costo == null ? '—' : euroUnitario(v.costo)}</b><small>${v.costoManuale ? 'scritto a mano (nessun acquisto)' : v.costo == null ? 'manca un acquisto o il contenuto' : 'prezzo ÷ contenuto della confezione'}</small></div>
        <div class="cifra"><span>Giacenza</span><b>${s.giacenza == null ? '—' : quant(s.giacenza, voce.unita)}</b><small>${s.inventario ? `inventario del ${data(s.inventario.data)} + ${quant(s.caricato, voce.unita)} ordinati − ${quant(s.consumato, voce.unita)} usati` : 'manca l\'inventario'}</small></div>
        <div class="cifra"><span>Valore</span><b>${euro(v.ind.valore)}</b><small>giacenza × costo di oggi</small></div>
        <div class="cifra"><span>Giacenza media</span><b>${quant(s.media, voce.unita) || '—'}</b><small>${s.giorniMedia ? `negli ultimi ${s.giorniMedia} giorni` : ''}${v.ind.valoreMedio != null ? ` · ${euro(v.ind.valoreMedio)}` : ''}</small></div>
        <div class="cifra"><span>Consumo al mese</span><b>${quant(v.ind.consumoMese, voce.unita) || '—'}</b><small>${v.ind.copertura != null ? `copertura ${mesi(v.ind.copertura)}` : ''}${v.ind.rotazione != null ? ` · rotazione ${num(v.ind.rotazione, 1)}/anno` : ''}</small></div>
      </div>
      ${v.senzaContenuto.length ? html`<p class="avviso">Per ${v.senzaContenuto.map(a => a.codice).join(', ')} non si capisce quanto ${voce.unita} c'è in una confezione:
        scrivilo nella colonna «Contenuto», altrimenti gli ordini di questi articoli non entrano nella giacenza e il loro prezzo non dà il costo.</p>` : ''}

      <section class="blocco"><h2>Movimenti dall'ultimo inventario</h2>
        ${s.movimenti.length ? html`<table class="elenco"><thead><tr><th>Data</th><th>Movimento</th><th class="n">Quantità</th><th class="n">Giacenza</th><th></th></tr></thead>
          <tbody>${[...s.movimenti].reverse().map(m => html`<tr>
            <td>${data(m.data)}</td><td>${m.href ? html`<a href="${m.href}">${m.testo}</a>` : m.testo}</td>
            <td class="n">${m.tipo === 'inventario' ? quant(m.quantita, voce.unita) : m.tipo === 'carico' ? `+ ${quant(m.quantita, voce.unita)}` : html`<span class="${m.stimato ? 'nota' : ''}">− ${quant(m.quantita, voce.unita)}</span>`}</td>
            <td class="n"><b>${quant(m.saldo, voce.unita)}</b></td>
            <td>${m.inventarioId ? html`<form method="post" action="${BASE}/inventari/${m.inventarioId}/elimina" data-conferma="Eliminare questo inventario? La giacenza ripartirà da quello prima."><button class="piccolo secondario">Elimina</button></form>` : ''}</td></tr>`)}</tbody></table>`
          : html`<p class="nota">Nessun inventario: scrivi la giacenza qui sotto o nella pagina di tutte le voci.</p>`}
      </section>

      <section class="blocco"><h2>Inventario contando le confezioni</h2>
        <form method="post" action="${base}/inventario" class="modulo">
          <label>Data <input type="date" name="data" value="${oggi}" required></label>
          <table class="elenco"><thead><tr><th>Articolo</th><th class="n">Contenuto</th><th>In casa</th></tr></thead>
            <tbody>${v.articoli.filter(a => a.attivo && a.contenuto).map(a => html`<tr><td><b>${a.codice}</b> ${a.descrizione}</td>
              <td class="n">${num(a.contenuto, 3)} ${voce.unita} a ${(a.um ?? 'pz').toLowerCase()}</td>
              <td><input name="pz_${a.id}" inputmode="decimal" class="corto" autocomplete="off"> ${(a.um ?? 'pz').toLowerCase()}</td></tr>`)}
              <tr><td>Altro materiale sfuso o aperto</td><td></td><td><input name="sciolto" inputmode="decimal" class="corto" autocomplete="off"> ${voce.unita}</td></tr></tbody></table>
          <label>Nota <input name="nota" placeholder="facoltativa"></label>
          <button>Salva l'inventario</button></form>
      </section>

      <section class="blocco"><h2>Scorta minima e costo a mano</h2>
        <form method="post" action="${base}/impostazioni" class="riga-campi">
          <label>Scorta minima <input name="scorta" inputmode="decimal" class="corto" value="${numCampo(v.scorta)}"> ${voce.unita}</label>
          <label>Costo al ${voce.unita} scritto a mano <input name="costo" inputmode="decimal" class="corto" value="${numCampo(d.impostazioni.costi[voce.codice] ?? null)}"> €
            <small class="nota">(vale solo finché non c'è un acquisto: es. viteria)</small></label>
          <button>Salva</button></form>
      </section>

      <section class="blocco"><h2>Articoli di questa voce</h2>
        <p class="nota">Gli articoli di Anagrafiche → Materiali di consumo che il portale ha messo in questa voce. «Contenuto» = quanti ${voce.unita} ci sono in una unità
          dell'articolo (una confezione, un kg…): vuoto = quello letto dalla descrizione. Per togliere un articolo dalla voce scegli «nessuna».</p>
        <form method="post" action="${base}/articoli">
          <table class="elenco"><thead><tr><th>Codice</th><th>Descrizione</th><th>Um</th><th>Voce</th><th>Contenuto (${voce.unita})</th></tr></thead>
            <tbody>${v.articoli.map(a => html`<tr class="${a.attivo ? '' : 'nota'}"><td>${a.codice}</td><td>${a.descrizione}</td><td>${a.um ?? ''}</td>
              <td><select name="voce_${a.id}"><option value="">${a.voceScelta ? 'proposta dal portale' : `${voce.nome} (proposta)`}</option>
                ${VOCI_MAGAZZINO.map(x => html`<option value="${x.codice}" ${a.voceScelta === x.codice ? raw('selected') : ''}>${x.nome}</option>`)}
                <option value="-">nessuna</option></select></td>
              <td><input name="cont_${a.id}" inputmode="decimal" class="corto" value="${numCampo(a.contenutoScritto)}" placeholder="${a.contenuto != null ? numCampo(a.contenuto, 6) : 'da scrivere'}"></td></tr>`)}</tbody></table>
          <button>Salva gli articoli</button></form>
        ${d.senzaVoce.length ? html`<form method="post" action="${base}/articoli" class="riga-campi">
          <label>Aggiungi un articolo dell'anagrafica a questa voce <select name="aggiungi" required><option value="">— scegli —</option>
            ${d.senzaVoce.map(a => html`<option value="${a.id}">${a.codice} · ${a.descrizione}</option>`)}</select></label>
          <button>Aggiungi</button></form>` : ''}
        <p class="nota">Manca un articolo? Aggiungilo in <a href="/anagrafiche/materiali">Anagrafiche → Materiali di consumo</a>: entra da solo nella voce giusta se la categoria e la descrizione la indicano.</p>
      </section>

      <section class="blocco"><h2>Acquisti</h2>
        ${v.acquisti.length ? html`<table class="elenco"><thead><tr><th>Data</th><th>Documento</th><th>Fornitore</th><th>Articolo</th><th class="n">Quantità</th><th class="n">Prezzo</th><th class="n">Costo al ${voce.unita}</th></tr></thead>
          <tbody>${v.acquisti.slice(0, 50).map(a => html`<tr><td>${data(a.data)}</td><td>${a.href ? html`<a href="${a.href}">${a.documento}</a>` : a.documento}</td><td>${a.fornitore ?? ''}</td>
            <td>${a.codice}</td><td class="n">${num(a.quantita, 3)} ${(a.um ?? '').toLowerCase()}</td><td class="n">${euroUnitario(a.prezzo)}</td>
            <td class="n">${a.costo != null ? euroUnitario(a.costo) : html`<small class="nota">${a.um ? `fatturato a ${a.um.toLowerCase()}` : 'contenuto da scrivere'}</small>`}</td></tr>`)}</tbody></table>`
          : html`<p class="nota">Nessun acquisto trovato negli ordini a fornitore, nelle fatture dei fornitori o nell'anagrafica.</p>`}
      </section>` })));
  });

  r.post('/voce/:voce/inventario', async (req, res, next) => {
    const voce = voceMagazzino(String(req.params.voce));
    if (!voce) return next();
    const base = `${BASE}/voce/${voce.codice}`;
    const b = req.body ?? {};
    const d = await datiMagazzinoConsumo(oggiRoma());
    const v = d.voci.find(x => x.voce.codice === voce.codice)!;
    let totale = 0, scritto = false;
    const dettaglio: Record<string, number> = {};
    for (const a of v.articoli.filter(x => x.contenuto)) {
      const testo = String(b[`pz_${a.id}`] ?? '').trim();
      if (!testo) continue;
      const n = numeroScritto(testo);
      if (n == null) return res.redirect(torna(`${a.codice}: "${testo}" non è un numero.`, base));
      dettaglio[a.codice] = n; totale += n * a.contenuto!; scritto = true;
    }
    const sciolto = String(b.sciolto ?? '').trim();
    if (sciolto) {
      const n = numeroScritto(sciolto);
      if (n == null) return res.redirect(torna(`Materiale sfuso: "${sciolto}" non è un numero.`, base));
      dettaglio.sciolto = n; totale += n; scritto = true;
    }
    if (!scritto) return res.redirect(torna('Nessun pezzo scritto: niente da salvare.', base));
    await salvaInventario(voce.codice, Math.round(totale * 1e6) / 1e6, dataValida(b.data), req.session.utente?.id ?? null, String(b.nota ?? '').trim().slice(0, 200) || null, dettaglio);
    res.redirect(torna(`Inventario salvato: ${num(totale, 3)} ${voce.unita}.`, base));
  });

  r.post('/voce/:voce/impostazioni', async (req, res, next) => {
    const voce = voceMagazzino(String(req.params.voce));
    if (!voce) return next();
    await salvaScortaECosto(voce.codice, numeroScritto(req.body?.scorta), numeroScritto(req.body?.costo));
    res.redirect(torna('Salvato.', `${BASE}/voce/${voce.codice}`));
  });

  r.post('/voce/:voce/articoli', async (req, res, next) => {
    const voce = voceMagazzino(String(req.params.voce));
    if (!voce) return next();
    const b = req.body ?? {};
    const cambi = Object.keys(b).filter(k => /^voce_\d+$/.test(k)).map(k => {
      const id = Number(k.slice(5));
      return { id, voce: String(b[k] ?? ''), contenuto: numeroScritto(b[`cont_${id}`]) };
    });
    if (/^\d+$/.test(String(b.aggiungi ?? ''))) cambi.push({ id: Number(b.aggiungi), voce: voce.codice, contenuto: null });
    await salvaArticoliVoce(cambi);
    res.redirect(torna('Articoli salvati.', `${BASE}/voce/${voce.codice}`));
  });

  r.post('/inventari/:id/elimina', async (req, res) => {
    const id = Number(req.params.id);
    const voce = Number.isInteger(id) ? await eliminaInventario(id) : null;
    res.redirect(voce ? torna('Inventario eliminato.', `${BASE}/voce/${voce}`) : torna('Inventario non trovato.'));
  });

  return r;
}
