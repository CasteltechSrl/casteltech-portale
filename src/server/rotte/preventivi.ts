/**
 * Pagine dei preventivi: elenco, nuovo, modifica, calcolo in tempo reale, salvataggio, duplica.
 */
import { Router } from 'express';
import { q } from '../db.js';
import { caricaCatalogo, caricaTariffe, type Catalogo } from '../catalogo-db.js';
import { calcola, datiDaRiga, leggiPreventivo, normalizza, salvaPreventivo, nPannelli, type DatiPreventivo } from '../preventivi-servizio.js';
import { layout } from '../views/layout.js';
import { html, euro, data, num, ore, raw, type Raw } from '../views/html.js';
import type { Risultato } from '../../engine/calcolo.js';

const STATI = ['bozza', 'inviato', 'accettato', 'rifiutato', 'archiviato'];

export function rottePreventivi() {
  const r = Router();

  // ── Elenco ──
  r.get('/', async (req, res) => {
    const cerca = String(req.query.q ?? '').trim();
    const righe = await q(`
      SELECT id, numero, creato_il, intestazione, n_schede, totale_primo_lotto, totale_secondo_lotto, stato, origine
      FROM preventivi
      WHERE $1 = '' OR (intestazione->>'cliente') ILIKE '%'||$1||'%' OR (intestazione->>'codice') ILIKE '%'||$1||'%'
         OR (intestazione->>'descrizione') ILIKE '%'||$1||'%' OR numero ILIKE '%'||$1||'%'
      ORDER BY creato_il DESC LIMIT 300`, [cerca]);
    res.send(String(layout({
      titolo: 'Preventivi', utente: req.session.utente, attiva: 'preventivi',
      contenuto: html`
      <div class="intestazione-pagina">
        <h1>Preventivi</h1>
        <a class="bottone primario" href="/preventivi/nuovo">+ Nuovo preventivo</a>
      </div>
      <form class="cerca" method="get"><input name="q" value="${cerca}" placeholder="Cerca cliente, codice, descrizione, numero…" type="search"><button>Cerca</button></form>
      <div class="tabella-scorre"><table class="elenco">
        <thead><tr><th>Numero</th><th>Data</th><th>Cliente</th><th>Codice</th><th>Descrizione</th><th class="n">Schede</th><th class="n">1° lotto</th><th class="n">€/scheda</th><th class="n">Lotti succ.</th><th>Stato</th></tr></thead>
        <tbody>${righe.map(p => html`
          <tr class="cliccabile" data-href="/preventivi/${p.id}">
            <td><a href="/preventivi/${p.id}">${p.numero}</a>${p.origine === 'vecchio_portale' ? html` <span class="etichetta">vecchio</span>` : ''}</td>
            <td>${data(p.creato_il)}</td><td>${p.intestazione?.cliente}</td><td>${p.intestazione?.codice}</td>
            <td class="taglia">${p.intestazione?.descrizione}</td><td class="n">${num(p.n_schede, 0)}</td>
            <td class="n">${euro(p.totale_primo_lotto)}</td><td class="n">${euro(p.n_schede ? p.totale_primo_lotto / p.n_schede : 0)}</td>
            <td class="n">${euro(p.totale_secondo_lotto)}</td><td><span class="stato ${p.stato}">${p.stato}</span></td>
          </tr>`)}
        </tbody></table></div>
      ${righe.length ? '' : html`<p class="vuoto">Nessun preventivo${cerca ? ' trovato' : ''}.</p>`}`,
      script: 'elenco.js',
    })));
  });

  // ── Nuovo ──
  r.get('/nuovo', async (req, res) => {
    const [cat, tariffe] = await Promise.all([caricaCatalogo(), caricaTariffe()]);
    const dati = normalizza({ tariffe, nSchedeInPCB: 1 }, cat);
    res.send(pagina(req.session.utente, cat, dati, calcola(cat, dati), undefined, await nomiClienti()));
  });

  // ── Apri esistente (calcolato col catalogo salvato nel preventivo) ──
  r.get('/:id', async (req, res) => {
    const p = await leggiPreventivo(Number(req.params.id));
    if (!p) return res.status(404).send('Preventivo non trovato');
    const cat: Catalogo = p.catalogo;
    const dati = datiDaRiga(p);
    res.send(pagina(req.session.utente, cat, dati, calcola(cat, dati), p, await nomiClienti()));
  });

  // ── Calcolo in tempo reale (non salva) ──
  r.post('/calcola', async (req, res) => {
    const cat = await catalogoPer(req.body.id, req.body.catalogoAttuale);
    const dati = normalizza(req.body.dati, cat);
    const ris = calcola(cat, dati);
    res.json({ risultato: ris, nPCB: nPannelli(dati.nSchede, dati.nSchedeInPCB) });
  });

  // ── Salva ──
  r.post('/salva', async (req, res) => {
    const id = req.body.id ? Number(req.body.id) : undefined;
    const cat = await catalogoPer(id, req.body.catalogoAttuale);
    const dati = normalizza(req.body.dati, cat);
    if (!dati.cliente) return res.status(400).json({ errore: 'Indica il cliente' });
    if (!dati.codice && !dati.descrizione) return res.status(400).json({ errore: 'Indica almeno il codice o la descrizione' });
    if (!dati.nSchede) return res.status(400).json({ errore: 'Indica la quantità di schede' });
    if (!(dati.tariffe.ricarico > 0)) return res.status(400).json({ errore: 'Il ricarico deve essere maggiore di zero' });
    const nuovoId = await salvaPreventivo({ id, dati, catalogo: cat, utenteId: req.session.utente!.id });
    res.json({ id: nuovoId });
  });

  r.post('/:id/stato', async (req, res) => {
    const stato = String(req.body.stato);
    if (STATI.includes(stato)) await q(`UPDATE preventivi SET stato = $2, aggiornato_il = now() WHERE id = $1`, [Number(req.params.id), stato]);
    res.redirect(`/preventivi/${req.params.id}`);
  });

  // duplica con catalogo, tariffe e prezzi materiali ATTUALI
  r.post('/:id/duplica', async (req, res) => {
    const p = await leggiPreventivo(Number(req.params.id));
    if (!p) return res.status(404).send('Preventivo non trovato');
    const cat = await caricaCatalogo();
    const vecchi = datiDaRiga(p);
    const dati = normalizza({ ...vecchi, prezziMateriali: undefined, tariffe: await caricaTariffe() }, cat);
    const id = await salvaPreventivo({ dati, catalogo: cat, utenteId: req.session.utente!.id });
    res.redirect(`/preventivi/${id}`);
  });

  return r;
}

const nomiClienti = async () => (await q<{ r: string }>(`SELECT ragione_sociale AS r FROM clienti ORDER BY 1`)).map(x => x.r);

async function catalogoPer(id: unknown, attuale: unknown): Promise<Catalogo> {
  if (id && !attuale) {
    const p = await leggiPreventivo(Number(id));
    if (p) return p.catalogo;
  }
  return caricaCatalogo();
}

// ───────────────────────────── pagina del preventivo ─────────────────────────────

function pagina(utente: any, cat: Catalogo, d: DatiPreventivo, ris: Risultato, salvato?: any, clienti: string[] = []): string {
  const gruppi = [...new Set(cat.parametri.map(p => p.gruppo))].filter(g => g !== 'GENERALE');
  const valore = (cod: string) => d.parametri[cod] ?? '';
  const campoParametro = (p: Catalogo['parametri'][0]) => p.tipo === 'si_no'
    ? html`<label class="spunta"><input type="checkbox" data-param="${p.codice}" ${valore(p.codice) ? raw('checked') : ''}> ${p.etichetta}</label>`
    : html`<label>${p.etichetta} <span class="unita">${p.unita}</span>
        <input inputmode="decimal" data-param="${p.codice}" value="${valore(p.codice)}" placeholder="${p.default ?? ''}">
        ${p.suggerimento ? html`<small>${p.suggerimento}</small>` : ''}</label>`;
  const compilati = (g: string) => cat.parametri.filter(p => p.gruppo === g && d.parametri[p.codice]).length;

  return String(layout({
    titolo: salvato ? `Preventivo ${salvato.numero}` : 'Nuovo preventivo', utente, attiva: 'preventivi', script: 'preventivo.js',
    contenuto: html`
    <form id="preventivo" data-id="${salvato?.id ?? ''}" autocomplete="off">
    <div class="intestazione-pagina">
      <h1>${salvato ? html`Preventivo ${salvato.numero} <span class="stato ${salvato.stato}">${salvato.stato}</span>` : 'Nuovo preventivo'}</h1>
      <div class="azioni">
        <span id="stato-salvataggio" class="nota"></span>
        <button type="button" id="salva" class="primario">Salva</button>
      </div>
    </div>
    ${salvato?.origine === 'vecchio_portale' && salvato.dati_vecchio_portale ? html`
      <p class="avviso info">Importato dal vecchio portale. Lì il totale 1° lotto era ${euro(salvato.dati_vecchio_portale.totalePrimoLotto)};
      qui è ricalcolato con le fasi e le regole nuove.</p>` : ''}

    <div class="griglia-preventivo">
    <section class="colonna-dati">
      <fieldset class="blocco">
        <legend>Prodotto</legend>
        <div class="riga-campi">
          <label class="largo">Cliente <input data-campo="cliente" value="${d.cliente}" required list="elenco-clienti"></label>
          <label>Codice <input data-campo="codice" value="${d.codice}"></label>
          <label class="stretto">Rev. <input data-campo="revisione" value="${d.revisione}"></label>
        </div>
        <label>Descrizione <input data-campo="descrizione" value="${d.descrizione}"></label>
        <div class="riga-campi">
          <label>Schede <input inputmode="numeric" data-campo="nSchede" value="${d.nSchede || ''}" required></label>
          <label>Schede per pannello <input inputmode="numeric" data-campo="nSchedeInPCB" value="${d.nSchedeInPCB}"></label>
          <label>Pannelli <output id="nPCB">${nPannelli(d.nSchede, d.nSchedeInPCB)}</output></label>
        </div>
      </fieldset>

      <fieldset class="blocco">
        <legend>Tariffe e ricarico</legend>
        <div class="riga-campi">
          <label>Costo azienda <span class="unita">€/h</span><input inputmode="decimal" data-tariffa="costoAziendaH" value="${d.tariffe.costoAziendaH}"></label>
          <label>Operatore produz. <span class="unita">€/h</span><input inputmode="decimal" data-tariffa="costoOperatoreProduzioneH" value="${d.tariffe.costoOperatoreProduzioneH}"></label>
          <label>Ufficio <span class="unita">€/h</span><input inputmode="decimal" data-tariffa="costoOperatoreUfficioH" value="${d.tariffe.costoOperatoreUfficioH}"></label>
          <label>Ricarico <input inputmode="decimal" data-tariffa="ricarico" value="${d.tariffe.ricarico}"></label>
        </div>
      </fieldset>

      ${gruppi.map(g => html`
      <details class="blocco" ${compilati(g) || g.startsWith('SMD TOP') ? raw('open') : ''}>
        <summary>${g} ${compilati(g) ? html`<span class="conta">${compilati(g)}</span>` : ''}</summary>
        <div class="campi-parametri">${cat.parametri.filter(p => p.gruppo === g).map(campoParametro)}</div>
      </details>`)}

      <details class="blocco">
        <summary>Prezzi materiali di consumo (di questo preventivo)</summary>
        <div class="campi-parametri">${cat.materiali.map(m => html`
          <label>${m.descrizione} <span class="unita">€/${m.um}</span>
          <input inputmode="decimal" data-materiale="${m.codice}" value="${d.prezziMateriali[m.codice] ?? m.costo}"></label>`)}</div>
      </details>

      <fieldset class="blocco">
        <legend>Note</legend>
        <textarea data-campo="note" rows="3">${d.note}</textarea>
      </fieldset>
    </section>

    <section class="colonna-risultati">
      <div class="totali" id="totali">${totali(ris, d)}</div>
      <label class="target">Prezzo target cliente a scheda <span class="unita">€</span>
        <input inputmode="decimal" data-campo="prezzoTargetScheda" value="${d.prezzoTargetScheda ?? ''}">
        <output id="diff-target"></output></label>

      <h2>Fasi <label class="spunta piccola"><input type="checkbox" id="mostra-tutte"> mostra anche le fasi a zero</label></h2>
      <div class="tabella-scorre"><table class="fasi" id="tabella-fasi">
        <thead><tr><th>N.</th><th>Fase</th><th class="n" title="Persone">Pers.</th><th class="n" title="Tempo ciclo: impegno della fase">Ciclo</th><th class="n" title="Tempo uomo = ciclo × persone">Uomo</th><th class="n">Costo</th><th class="n">Prezzo</th></tr></thead>
        <tbody>
        ${cat.fasi.map(f => {
          const x = ris.fasi.find(y => y.codice === f.codice)!;
          return html`<tr data-fase="${f.codice}" class="${x.secondiCiclo ? '' : 'zero'} ${f.unaTantum ? 'una-tantum' : ''}">
            <td>${f.numero}</td><td>${f.nome}${f.unaTantum ? html` <span class="etichetta" title="Solo primo lotto">1° lotto</span>` : ''}${f.tariffa === 'ufficio' ? html` <span class="etichetta">ufficio</span>` : ''}</td>
            <td class="n"><input class="persone" inputmode="decimal" data-persone="${f.codice}" value="${d.personeFase[f.codice] ?? f.persone}"></td>
            <td class="n" data-v="ciclo">${ore(x.secondiCiclo)}</td><td class="n" data-v="uomo">${ore(x.secondiUomo)}</td>
            <td class="n" data-v="costo">${euro(x.costo)}</td><td class="n" data-v="prezzo">${euro(x.prezzo)}</td></tr>`;
        })}
        </tbody></table></div>

      <h2>Altri costi</h2>
      <table class="fasi" id="tabella-voci">
        <thead><tr><th>Voce</th><th class="n">Costo</th><th class="n">Prezzo</th></tr></thead>
        <tbody>${ris.voci.map(v => html`<tr data-voce="${v.codice}" class="${v.unaTantum ? 'una-tantum' : ''}"><td>${v.nome}${v.unaTantum ? html` <span class="etichetta">1° lotto</span>` : ''}</td>
          <td class="n" data-v="costo">${euro(v.costo)}</td><td class="n" data-v="prezzo">${euro(v.prezzo)}</td></tr>`)}</tbody>
      </table>

      ${salvato ? html`
      <div class="azioni-secondarie">
        <form method="post" action="/preventivi/${salvato.id}/stato" class="inline">
          <label>Stato <select name="stato">${STATI.map(s => html`<option ${s === salvato.stato ? raw('selected') : ''}>${s}</option>`)}</select></label>
          <button>Aggiorna stato</button>
        </form>
        <form method="post" action="/preventivi/${salvato.id}/duplica" class="inline">
          <button title="Nuovo preventivo con fasi, tariffe e prezzi attuali">Duplica con prezzi attuali</button>
        </form>
      </div>` : ''}
    </section>
    </div>
    </form>
    <datalist id="elenco-clienti">${clienti.map(c => html`<option value="${c}">`)}</datalist>`,
  }));
}

export function totali(ris: Risultato, d: DatiPreventivo): Raw {
  const t = ris.totali;
  return html`
    <div class="totale principale"><span>Totale 1° lotto</span><strong data-t="totalePrimoLotto">${euro(t.totalePrimoLotto)}</strong>
      <small data-t="prezzoSchedaPrimoLotto">${euro(t.prezzoSchedaPrimoLotto)} a scheda</small></div>
    <div class="totale"><span>Lotti successivi</span><strong data-t="totaleSecondoLotto">${euro(t.totaleSecondoLotto)}</strong>
      <small data-t="prezzoSchedaSecondoLotto">${euro(t.prezzoSchedaSecondoLotto)} a scheda</small></div>
    <div class="totale"><span>Costi una tantum</span><strong data-t="costiUnaTantum">${euro(t.costiUnaTantum)}</strong></div>
    <div class="totale"><span>Margine (lotti succ.)</span><strong data-t="guadagnoLotto">${euro(t.guadagnoLotto)}</strong></div>
    <div class="totale"><span>Ore ciclo / uomo</span><strong data-t="ore">${ore(t.secondiCicloPrimoLotto)} / ${ore(t.secondiUomoPrimoLotto)}</strong>
      <small data-t="prezzoOrarioMedio">${euro(t.prezzoOrarioMedio)} per ora di ciclo</small></div>`;
}
