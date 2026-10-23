/**
 * Pagine dei preventivi: elenco, nuovo, modifica, calcolo in tempo reale, salvataggio, duplica.
 */
import { Router } from 'express';
import { q, q1 } from '../db.js';
import { maiuscolo, prodottiPerCliente } from '../anagrafiche-servizio.js';
import { caricaCatalogo, caricaTariffe, type Catalogo } from '../catalogo-db.js';
import { calcola, datiDaRiga, leggiPreventivo, normalizza, salvaPreventivo, nPannelli, type DatiPreventivo } from '../preventivi-servizio.js';
import { layout } from '../views/layout.js';
import { html, euro, data, num, ore, durata, raw, type Raw } from '../views/html.js';
import type { Risultato } from '../../engine/calcolo.js';

const PROVENIENZE: [number, string][] = [[1, 'Del cliente, da restituire'], [2, 'Del cliente, a nostro magazzino'], [3, 'Acquistato da noi'], [4, 'In parte del cliente, in parte acquistato da noi']];
const STATI = ['bozza', 'inviato', 'accettato', 'rifiutato', 'archiviato'];

export function rottePreventivi() {
  const r = Router();

  // ── Elenco ──
  r.get('/', async (req, res) => {
    const cerca = String(req.query.q ?? '').trim();
    const righe = await q(`
      SELECT id, numero, creato_il, intestazione, n_schede, totale_secondo_lotto, stato, origine,
        (tariffe->>'ricarico')::numeric AS ricarico,
        (risultato->'totali'->>'prezzoOrarioMedio')::numeric AS prezzo_orario,
        (risultato->'totali'->>'prezzoSchedaSecondoLotto')::numeric AS prezzo_scheda,
        (risultato->'totali'->>'costiUnaTantum')::numeric AS una_tantum
      FROM preventivi
      WHERE $1 = '' OR (intestazione->>'cliente') ILIKE '%'||$1||'%' OR (intestazione->>'codice') ILIKE '%'||$1||'%'
         OR (intestazione->>'descrizione') ILIKE '%'||$1||'%' OR numero ILIKE '%'||$1||'%'
      ORDER BY creato_il DESC, id DESC LIMIT 300`, [cerca]);
    res.send(String(layout({
      titolo: 'Preventivi', utente: req.session.utente, attiva: 'preventivi', largo: true,
      contenuto: html`
      <div class="intestazione-pagina">
        <h1>Preventivi</h1>
        <a class="bottone primario" href="/preventivi/nuovo">+ Nuovo preventivo</a>
      </div>
      <form class="cerca" method="get"><input name="q" value="${cerca}" placeholder="Cerca cliente, codice, descrizione, numero…" type="search"><button>Cerca</button></form>
      <div class="tabella-scorre"><table class="elenco preventivi">
        <thead><tr><th>Numero</th><th>Data</th><th>Cliente</th><th>Codice</th><th title="Revisione">Rev.</th><th>Descrizione</th><th class="n">Nr. PCB</th>
          <th class="n" title="Prezzo per ora di ciclo">€/h</th><th class="n">Ricarico</th><th class="n" title="Lotti successivi">€/PCB</th>
          <th class="n" title="Lotti successivi (senza costi una tantum)">Totale</th><th class="n" title="Costi una tantum (solo primo lotto)">Una tantum</th></tr></thead>
        <tbody>${righe.map(p => html`
          <tr class="cliccabile" data-href="/preventivi/${p.id}">
            <td class="nowrap"><a href="/preventivi/${p.id}">${p.numero}</a>${p.origine === 'vecchio_portale' ? html` <span class="etichetta" title="Importato dal vecchio portale">V</span>` : ''}</td>
            <td>${data(p.creato_il)}</td><td>${p.intestazione?.cliente}</td><td>${p.intestazione?.codice}</td><td>${p.intestazione?.revisione}</td>
            <td class="taglia">${p.intestazione?.descrizione}</td><td class="n">${num(p.n_schede, 0)}</td>
            <td class="n">${euro(p.prezzo_orario)}</td><td class="n">${p.ricarico ? num((p.ricarico - 1) * 100, 1) + '%' : ''}</td>
            <td class="n">${euro(p.prezzo_scheda)}</td><td class="n"><strong>${euro(p.totale_secondo_lotto)}</strong></td><td class="n">${euro(p.una_tantum)}</td>
          </tr>`)}
        </tbody></table></div>
      ${righe.length ? '' : html`<p class="vuoto">Nessun preventivo${cerca ? ' trovato' : ''}.</p>`}`,
      script: 'elenco.js',
    })));
  });

  // ── Nuovo ──
  r.get('/nuovo', async (req, res) => {
    const [cat, tariffe] = await Promise.all([caricaCatalogo(), caricaTariffe()]);
    // i valori standard sono già scritti nelle caselle (modificabili); le caselle sì/no partono spente
    const standard = Object.fromEntries(cat.parametri.filter(p => p.default != null && p.tipo !== 'si_no' && p.gruppo !== 'GENERALE' && p.gruppo !== 'PRE-PRODUZIONE').map(p => [p.codice, p.default]));
    const dati = normalizza({ tariffe, nSchedeInPCB: 1, parametri: standard }, cat);
    res.send(pagina(req.session.utente, cat, dati, calcola(cat, dati), undefined, await elencoClienti()));
  });

  // prodotti (prima di '/:id', altrimenti "prodotti" verrebbe letto come numero di preventivo)
  // selezionabili per il cliente scelto
  r.get('/prodotti', async (req, res) => {
    res.json(await prodottiPerCliente(Number(req.query.cliente) || 0));
  });

  // ── Apri esistente (calcolato col catalogo salvato nel preventivo) ──
  r.get('/:id', async (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return next();
    const p = await leggiPreventivo(Number(req.params.id));
    if (!p) return res.status(404).send('Preventivo non trovato');
    const cat: Catalogo = p.catalogo;
    const dati = datiDaRiga(p);
    res.send(pagina(req.session.utente, cat, dati, calcola(cat, dati), p, await elencoClienti(), dati.clienteId ? await prodottiPerCliente(dati.clienteId) : []));
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
    // cliente e prodotto SOLO dalle anagrafiche: i testi si prendono dal database, non dal browser
    const cliente = dati.clienteId ? await q1<{ ragione_sociale: string }>(`SELECT ragione_sociale FROM clienti WHERE id = $1`, [dati.clienteId]) : undefined;
    if (!cliente) return res.status(400).json({ errore: 'Scegli il cliente dall\'elenco' });
    const prodotto = dati.prodottoId ? await q1<{ codice: string; descrizione: string }>(
      `SELECT codice, descrizione FROM prodotti WHERE id = $1 AND (cliente_id = $2 OR cliente_id IS NULL)`, [dati.prodottoId, dati.clienteId]) : undefined;
    if (!prodotto) return res.status(400).json({ errore: 'Scegli il codice prodotto dall\'elenco del cliente' });
    Object.assign(dati, { cliente: maiuscolo(cliente.ragione_sociale), codice: maiuscolo(prodotto.codice), descrizione: maiuscolo(prodotto.descrizione) });
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

const elencoClienti = () => q<{ id: number; ragione_sociale: string }>(`SELECT id, ragione_sociale FROM clienti ORDER BY ragione_sociale`);

async function catalogoPer(id: unknown, attuale: unknown): Promise<Catalogo> {
  if (id && !attuale) {
    const p = await leggiPreventivo(Number(id));
    if (p) return p.catalogo;
  }
  return caricaCatalogo();
}

// ───────────────────────────── pagina del preventivo ─────────────────────────────

function pagina(utente: any, cat: Catalogo, d: DatiPreventivo, ris: Risultato, salvato?: any, clienti: { id: number; ragione_sociale: string }[] = [], prodotti: any[] = []): string {
  const gruppi = [...new Set(cat.parametri.map(p => p.gruppo))].filter(g => g !== 'GENERALE' && g !== 'LATI');
  const conLati = cat.parametri.some(p => p.codice === 'doppiaFaccia');
  const doppia = !!d.parametri.doppiaFaccia;
  const valore = (cod: string) => d.parametri[cod] ?? '';
  // campi che valgono solo per il lato BOT: nascosti (e svuotati) se il preventivo è "Solo TOP"
  const info = (p: Catalogo['parametri'][0]) => p.suggerimento ? html` <span class="info" title="${p.suggerimento}" aria-label="${p.suggerimento}">ⓘ</span>` : '';
  const soloBot = (p: Catalogo['parametri'][0]) => conLati && (p.gruppo === 'SMD BOT' || /LatoB$/.test(p.codice));
  // gestione materiale: etichettatura, stoccaggio ed estrazione non servono se il materiale del cliente va restituito
  const provenienza = Number(d.parametri.provenienzaMateriale ?? 1);
  const soloMagazzino = (p: Catalogo['parametri'][0]) => ['oreEtichettaturaMateriale', 'oreStoccaggioMateriale', 'oreEstrazioneMateriale'].includes(p.codice);
  const sceltaProvenienza = () => html`
    <div class="scelta-lati scelta-provenienza" role="radiogroup" aria-label="Provenienza del materiale">
      ${PROVENIENZE.map(([v, testo]) => html`<label class="spunta"><input type="radio" name="provenienza" data-param="provenienzaMateriale" value="${v}" ${provenienza === v ? raw('checked') : ''}> ${testo}</label>`)}
      <small class="nota">Tutto a ogni lotto. Materiale da restituire: non passa dal magazzino (niente etichettatura, stoccaggio ed estrazione) e si aggiunge il reso al cliente in imballaggio.</small>
    </div>`;
  const campoParametro = (p: Catalogo['parametri'][0]) => p.codice === 'provenienzaMateriale' ? sceltaProvenienza()
    : p.tipo === 'si_no'
    ? html`<label class="spunta ${soloBot(p) ? 'solo-bot' : ''}"><input type="checkbox" data-param="${p.codice}" ${valore(p.codice) ? raw('checked') : ''}> ${p.etichetta}</label>`
    : p.tipo === 'durata'
    ? html`<label class="${soloBot(p) ? 'solo-bot' : ''} ${soloMagazzino(p) ? 'solo-magazzino' : ''}">${p.etichetta} <span class="unita">ore:minuti</span>${info(p)}
        <input inputmode="text" data-param="${p.codice}" data-tipo="durata" value="${d.parametri[p.codice] == null ? '' : durata(d.parametri[p.codice])}" placeholder="${p.default != null ? durata(p.default) : '0:00'}"></label>`
    : html`<label class="${soloBot(p) ? 'solo-bot' : ''}">${p.etichetta} <span class="unita">${p.unita}</span>${info(p)}
        <input inputmode="decimal" data-param="${p.codice}" value="${valore(p.codice)}" placeholder="${p.default ?? ''}"></label>`;
  const compilati = (g: string) => cat.parametri.filter(p => p.gruppo === g && p.codice !== 'provenienzaMateriale' && d.parametri[p.codice]).length;

  return String(layout({
    titolo: salvato ? `Preventivo ${salvato.numero}` : 'Nuovo preventivo', utente, attiva: 'preventivi', script: 'preventivo.js',
    contenuto: html`
    <form id="preventivo" data-id="${salvato?.id ?? ''}" autocomplete="off" class="${conLati && !doppia ? 'solo-top' : ''} ${provenienza === 1 ? 'materiale-da-restituire' : ''}">
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
          <label class="largo">Cliente
            <select data-id="clienteId" id="sel-cliente" required>
              <option value="">— scegli dall'elenco —</option>
              ${clienti.map(c => html`<option value="${c.id}" ${c.id === d.clienteId ? raw('selected') : ''}>${c.ragione_sociale}</option>`)}
            </select></label>
          <label>Codice
            <select data-id="prodottoId" id="sel-prodotto" required>
              <option value="">${d.clienteId ? '— scegli il codice —' : '— prima scegli il cliente —'}</option>
              ${prodotti.map(x => html`<option value="${x.id}" data-descrizione="${x.descrizione}" ${x.id === d.prodottoId ? raw('selected') : ''}>${x.codice}${x.da_assegnare ? ' (non assegnato)' : ''}</option>`)}
            </select></label>
          <label class="stretto">Rev. <input data-campo="revisione" value="${d.revisione}" class="maiuscolo" maxlength="20"></label>
        </div>
        <label>Descrizione <input id="descrizione" value="${d.descrizione}" readonly tabindex="-1" class="sola-lettura"></label>
        ${!d.clienteId && d.cliente ? html`<p class="nota">Nel preventivo originale: <strong>${d.cliente}</strong> ${d.codice} — non presente nelle anagrafiche. Per salvarlo scegli cliente e codice dall'elenco.</p>` : ''}
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

      ${conLati ? html`
      <fieldset class="blocco">
        <legend>Lati da montare</legend>
        <div class="scelta-lati" role="radiogroup" aria-label="Lati da montare">
          <label class="spunta"><input type="radio" name="lati" value="0" ${!doppia ? raw('checked') : ''}> Solo TOP</label>
          <label class="spunta"><input type="radio" name="lati" value="1" ${doppia ? raw('checked') : ''}> TOP + BOT</label>
          <small class="nota">Con TOP + BOT raddoppiano i tempi di pre-produzione indicati "per lato" e si attivano le fasi BOT.</small>
        </div>
      </fieldset>` : ''}

      ${gruppi.map(g => html`
      <details class="blocco ${conLati && g === 'SMD BOT' ? 'solo-bot' : ''}" ${compilati(g) || g.startsWith('SMD TOP') || g === 'PRE-PRODUZIONE' || g === 'GESTIONE MATERIALE' ? raw('open') : ''}>
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
        ${[...new Set(cat.fasi.map(f => f.gruppo))].map(g => {
          const delGruppo = ris.fasi.filter(x => x.gruppo === g);
          const somma = (k: 'secondiCiclo' | 'secondiUomo' | 'costo' | 'prezzo') => delGruppo.reduce((a, x) => a + x[k], 0);
          return html`<tr class="riga-gruppo ${somma('secondiCiclo') ? '' : 'gruppo-vuoto'}" data-gruppo="${g}">
            <td colspan="3">${g}</td><td class="n" data-v="ciclo">${ore(somma('secondiCiclo'))}</td><td class="n" data-v="uomo">${ore(somma('secondiUomo'))}</td>
            <td class="n" data-v="costo">${euro(somma('costo'))}</td><td class="n" data-v="prezzo">${euro(somma('prezzo'))}</td></tr>
          ${cat.fasi.filter(f => f.gruppo === g).map(f => {
          const x = ris.fasi.find(y => y.codice === f.codice)!;
          return html`<tr data-fase="${f.codice}" class="${x.secondiCiclo ? '' : 'zero'} ${f.unaTantum ? 'una-tantum' : ''}">
            <td>${f.numero}</td><td>${f.nome}${f.unaTantum ? html` <span class="etichetta" title="Solo primo lotto">1° lotto</span>` : ''}${f.tariffa === 'ufficio' ? html` <span class="etichetta">ufficio</span>` : ''}</td>
            <td class="n"><input class="persone" inputmode="decimal" data-persone="${f.codice}" value="${d.personeFase[f.codice] ?? f.persone}"></td>
            <td class="n" data-v="ciclo">${ore(x.secondiCiclo)}</td><td class="n" data-v="uomo">${ore(x.secondiUomo)}</td>
            <td class="n" data-v="costo">${euro(x.costo)}</td><td class="n" data-v="prezzo">${euro(x.prezzo)}</td></tr>`;
          })}`;
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
        <a class="bottone primario" href="/commesse/nuova?preventivo=${salvato.id}">Crea commessa</a>
        <form method="post" action="/preventivi/${salvato.id}/duplica" class="inline">
          <button title="Nuovo preventivo con fasi, tariffe e prezzi attuali">Duplica con prezzi attuali</button>
        </form>
      </div>` : ''}
    </section>
    </div>
    </form>
`,
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
