/**
 * Flusso di produzione nel cruscotto (Adriano 6/11/2026): le cinque finestre in cima alla pagina iniziale (`finestreFlusso`, usata da
 * rotte/cruscotto-generale.ts) e le azioni (spunte, priorità, passaggio in produzione, fine lavorazione, "Spedito") montate su
 * /produzione/flusso. Letture in flusso-servizio.ts, regole in engine/flusso.ts.
 */
import { Router } from 'express';
import { FINESTRE, finestraValida, quandoFirma, type Finestra } from '../../engine/flusso.js';
import { cambiaPriorita, chiudiRiga, dichiaraFineLavorazione, passaInProduzione, segnaSpedito, spunta, togliSpedito, type DatiFlusso, type RigaCruscottoFlusso } from '../flusso-servizio.js';
import { html, data, num, type Raw } from '../views/html.js';

const gm = (d: string | null | undefined) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '');
const ritornoSicuro = (x: unknown, predefinito: string) => (typeof x === 'string' && x.startsWith('/cruscotto') ? x : predefinito);

export function rotteFlusso() {
  const r = Router();
  const utente = (req: any) => String(req.session.utente?.nome ?? 'ufficio');
  const torna = (req: any, rigaId?: number, msg?: string) => {
    const base = ritornoSicuro(req.body?.torna, '/cruscotto?flusso=preparare');
    return `${base}${msg ? `${base.includes('?') ? '&' : '?'}msg=${encodeURIComponent(msg)}` : ''}${rigaId ? `#riga-${rigaId}` : ''}`;
  };

  r.post('/riga/:id/spunta', async (req, res) => {
    const id = Number(req.params.id);
    await spunta(id, String(req.body.gruppo ?? ''), String(req.body.chiave ?? ''), String(req.body.valore) === '1', utente(req));
    res.redirect(torna(req, id));
  });
  r.post('/riga/:id/priorita', async (req, res) => {
    const id = Number(req.params.id);
    await cambiaPriorita(id, String(req.body.azione ?? 'numero'), Number(req.body.posizione) || 1, req.body.numero, Number(req.body.totale) || Infinity);
    res.redirect(torna(req, id));
  });
  r.post('/riga/:id/in-produzione', async (req, res) => {
    const id = Number(req.params.id);
    await passaInProduzione(id, Number(req.body.commessa) || null, utente(req));
    res.redirect(torna(req, id, 'Riga passata in produzione.'));
  });
  r.post('/riga/:id/fine-lavorazione', async (req, res) => {
    const id = Number(req.params.id);
    const commessa = Number(req.body.commessa);
    if (!commessa) return res.redirect(torna(req, id, 'La riga non ha una commessa: la fine lavorazione si dichiara sulla commessa.'));
    const e = await dichiaraFineLavorazione(commessa, req.body.quantita, String(req.body.totale) === '1', utente(req), 'ufficio');
    res.redirect(torna(req, id, e.errore ?? `Fine lavorazione: ${num(e.finite, 0)} schede finite su ${num(e.quantita, 0)}.`));
  });
  r.post('/riga/:id/spedito', async (req, res) => {
    const id = Number(req.params.id);
    const ids = [req.body.ddt ?? []].flat().map(Number).filter(n => n > 0);
    const n = await segnaSpedito(ids, utente(req));
    res.redirect(torna(req, id, n ? `Spedito: ${n} DDT ${n === 1 ? 'partito' : 'partiti'} (ora in "Spedite nel mese").` : 'Nessun DDT da segnare.'));
  });
  // Riga con le ultime schede che non partiranno (scarto, consegna con un altro DDT): la riga diventa evasa, come "Segna evase" degli Ordini
  r.post('/riga/:id/evasa', async (req, res) => {
    const id = Number(req.params.id);
    await chiudiRiga(id);
    res.redirect(torna(req, undefined, 'Riga chiusa: segnata come evasa (si torna indietro dall\'ordine con "Stato dai DDT").'));
  });
  r.post('/ddt/:id/annulla-spedito', async (req, res) => {
    await togliSpedito(Number(req.params.id));
    res.redirect(torna(req, undefined, 'Il DDT torna in attesa di corriere.'));
  });
  return r;
}

// ───────────────────────────── pagina ─────────────────────────────

/** Le cinque finestre in cima al cruscotto e, sotto, l'elenco della finestra aperta. */
export function finestreFlusso(d: DatiFlusso, aperta: Finestra | null, oggi: string, solaLettura = false): Raw {
  const sotto: Record<Finestra, string> = {
    acquistare: d.inRitardo ? `${d.inRitardo} con consegna già passata` : 'cose da comprare per le schede',
    preparare: 'materiale da verificare per fase',
    produzione: d.parziali ? `${d.parziali} con fine lavorazione parziale` : 'fasi del ciclo in corso',
    spedire: d.inAttesaCorriere ? `${d.inAttesaCorriere} in attesa di corriere (DDT fatto)` : 'schede finite da mettere su DDT',
    spedite: `ultimi 30 giorni · ${num(d.schedeSpedite, 0)} schede`,
  };
  const link = (f: Finestra) => `/cruscotto?flusso=${f}`;
  return html`
    <div class="flusso">${FINESTRE.map(f => html`<a class="finestra ${aperta === f.chiave ? 'aperta' : ''} ${d.conta[f.chiave] ? '' : 'vuota'}" href="${link(f.chiave)}">
      <span>${f.numero} · ${f.nome}</span><b>${d.conta[f.chiave]}</b><small class="${f.chiave === 'acquistare' && d.inRitardo ? 'negativo' : ''}">${sotto[f.chiave]}</small></a>`)}</div>
    ${aperta ? elencoFinestra(d, aperta, oggi, solaLettura) : ''}`;
}

const chip = (testo: string, cls: string, titolo = '') => html`<span class="spunta ${cls}" title="${titolo}">${testo}</span>`;

/** Una spunta = un piccolo modulo: premendo si segna (o si toglie), con chi e quando. */
function spuntaForm(riga: number, gruppo: string, chiave: string, testo: string, firma: { da: string; il: string } | null, torna: string, opz: { cls?: string; auto?: boolean; manca?: boolean; titolo?: string; solaLettura?: boolean } = {}) {
  const fatta = !!firma || !!opz.auto;
  const titolo = opz.auto ? 'Fatta: ci sono tempi del reparto per questa fase' : firma ? `Spuntata da ${quandoFirma(firma)} (premi per togliere)` : opz.titolo ?? 'Premi per spuntare';
  if (opz.solaLettura) return chip(`${fatta ? '✓ ' : ''}${testo}`, `${fatta ? (opz.auto ? 'auto' : 'si') : opz.manca ? 'manca' : ''} ${opz.cls ?? ''}`, titolo);
  return html`<form method="post" action="/produzione/flusso/riga/${riga}/spunta" class="spunta-form">
    <input type="hidden" name="torna" value="${torna}"><input type="hidden" name="gruppo" value="${gruppo}"><input type="hidden" name="chiave" value="${chiave}">
    <input type="hidden" name="valore" value="${firma ? '0' : '1'}">
    <button class="spunta ${fatta ? (opz.auto && !firma ? 'auto' : 'si') : opz.manca ? 'manca' : ''} ${opz.cls ?? ''}" title="${titolo}">${fatta ? '✓' : '☐'} ${testo}</button></form>`;
}

export function elencoFinestra(d: DatiFlusso, f: Finestra, oggi: string, solaLettura: boolean): Raw {
  const def = FINESTRE.find(x => x.chiave === f)!;
  const torna = `/cruscotto?flusso=${f}`;
  const righe = d.perFinestra[f];
  const testata = html`<h2>${def.numero} · ${def.nome} <span class="nota">${f === 'spedite' ? `— partite negli ultimi 30 giorni` : `— in ordine di priorità: consegna richiesta, poi data dell'ordine; il numero si cambia a mano (▲ ▼ o scrivendolo), "auto" lo rimette automatico`}</span></h2>`;
  if (f === 'spedite') return html`<section class="elenco-flusso">${testata}${tabellaSpedite(d, torna, solaLettura)}</section>`;
  if (!righe.length) return html`<section class="elenco-flusso">${testata}<p class="nota">Niente in questa finestra.</p></section>`;
  const prio = (r: RigaCruscottoFlusso) => solaLettura ? html`<b>${r.posizione}</b>` : html`<form method="post" action="/produzione/flusso/riga/${r.id}/priorita" class="prio">
    <input type="hidden" name="torna" value="${torna}"><input type="hidden" name="posizione" value="${r.posizione}"><input type="hidden" name="totale" value="${d.righe.length}">
    <button name="azione" value="su" title="Più urgente">▲</button>
    <input name="numero" value="${r.posizione}" inputmode="numeric" title="Scrivi la posizione e premi Invio" class="${r.flusso.priorita != null ? 'mano' : ''}">
    <button name="azione" value="giu" title="Meno urgente">▼</button>
    ${r.flusso.priorita != null ? html`<button name="azione" value="auto" class="auto" title="Torna alla priorità automatica (consegna richiesta)">auto</button>` : ''}</form>`;
  // preventivo della riga (Adriano 11/11/2026): collegato, proposto da verificare nell'ordine, o da fare
  const statoPreventivo = (r: RigaCruscottoFlusso) => {
    const ordine = `/ordini/${r.ordineId}#riga-${r.id}`;
    if (!r.preventivo) return html`<br><small class="esito critico">nessun preventivo:</small> ${solaLettura ? '' : html`<a class="bottone piccolo" href="/preventivi/nuovo${r.clienteId ? `?cliente=${r.clienteId}` : ''}" title="Preventivo nuovo per questo cliente">Fai il preventivo</a>
      <a href="${ordine}" class="nota" title="Se il preventivo c'è già (scritto con un altro codice), sceglilo dal menu Preventivo nella riga dell'ordine">o collegalo nell'ordine</a>`}`;
    if (r.preventivo.proposto) return html`<br><small class="esito verifica" title="Trovato dal portale (stesso codice, quantità più vicina): confermalo o cambialo nell'ordine">preventivo da verificare: ${r.preventivo.numero}</small>
      ${solaLettura ? '' : html`<a class="bottone piccolo" href="${ordine}">Verifica nell'ordine</a>`}`;
    return html`<br><small class="nota">prev. <a href="/preventivi/${r.preventivo.id}">${r.preventivo.numero}</a></small>${!r.commessaId && !solaLettura
      ? html` <a class="bottone piccolo" href="/commesse/nuova?preventivo=${r.preventivo.id}&riga=${r.id}" title="Commessa con quantità, ordine del cliente e consegna di questa riga">Crea commessa</a>` : ''}`;
  };
  const intestazione = (r: RigaCruscottoFlusso) => html`
    <td class="prio-cella">${prio(r)}</td>
    <td><a href="/ordini/${r.ordineId}">${r.numero}/${r.anno}</a><br><small class="nota">${r.cliente} · ${gm(r.dataOrdine)}</small></td>
    <td><b>${r.codice ?? ''}</b><br><small class="nota">${r.descrizione ?? ''}${r.commessaId ? html` · <a href="/commesse/${r.commessaId}">comm. ${r.commessaNumero}</a>` : html` · <span class="nota">nessuna commessa</span>`}</small>
      ${statoPreventivo(r)}</td>
    <td class="n">${num(r.quantita, 0)}${r.quantitaSpedita ? html`<br><small class="nota">${num(r.quantitaSpedita, 0)} già partite</small>` : ''}</td>
    <td class="${r.consegna && r.consegna < oggi ? 'negativo' : ''}">${data(r.consegna)}${r.prevista && r.prevista !== r.consegna ? html`<br><small class="nota">prevista ${gm(r.prevista)}${r.ritardo ? ` (${r.ritardo > 0 ? '+' : ''}${r.ritardo})` : ''}</small>` : ''}</td>`;
  const colonne = (pz: string) => html`<th>Priorità</th><th>Ordine · cliente</th><th>Codice · descrizione</th><th class="n">${pz}</th><th>Consegna</th>`;
  const colonneBase = colonne('Pz');
  const acquisti = (r: RigaCruscottoFlusso) => r.valutazione.acquisti.length
    ? html`<div class="spunte">${r.valutazione.acquisti.map(a => spuntaForm(r.id, 'acquisti', a.voce.chiave, a.voce.nome, a.firma, torna, { manca: !a.firma, solaLettura, titolo: `${a.voce.fonte === 'preventivo' ? 'Dal preventivo' : 'Dalla riga dell\'ordine'}: premi quando è acquistato` }))}</div>`
    : html`<span class="nota">niente da comprare</span>`;
  const chiQuando = (voci: { firma: { da: string; il: string } | null; nome: string }[]) => {
    const con = voci.filter(v => v.firma);
    if (!con.length) return '';
    const ultima = con.reduce((a, b) => (a.firma!.il > b.firma!.il ? a : b));
    return html`<small class="nota">${con.length === voci.length ? 'tutto verificato: ' : `${ultima.nome}: `}${quandoFirma(ultima.firma)}</small>`;
  };

  let corpo: Raw;
  if (f === 'acquistare') {
    corpo = html`<thead><tr>${colonneBase}<th>Da acquistare (spunta quando è fatto)</th><th>Chi / quando</th><th></th></tr></thead>
      <tbody>${righe.map(r => html`<tr id="riga-${r.id}" class="${r.consegna && r.consegna < oggi ? 'scaduta' : ''}">${intestazione(r)}
        <td>${acquisti(r)}</td><td>${chiQuando(r.valutazione.acquisti.map(a => ({ firma: a.firma, nome: a.voce.nome })))}</td>
        <td class="azioni-riga">${r.commessaId ? html`<a class="bottone piccolo" href="/ordini/fornitori/commessa/${r.commessaId}" title="Componenti della BOM non ancora ordinati">Cosa manca</a>` : ''}
          ${r.prodottoId ? html`<a class="bottone piccolo" href="/quotazioni" title="BOM quotate">Quotazioni</a>` : ''}</td></tr>`)}</tbody>`;
  } else if (f === 'preparare') {
    corpo = html`<thead><tr>${colonneBase}<th>Da acquistare (dal punto 1)</th><th>Materiale pronto per fase (spunta = verificato)</th><th>Chi / quando</th><th></th></tr></thead>
      <tbody>${righe.map(r => {
        const v = r.valutazione;
        return html`<tr id="riga-${r.id}" class="${r.consegna && r.consegna < oggi ? 'scaduta' : ''}">${intestazione(r)}
        <td>${v.acquisti.length ? html`<div class="spunte">${v.acquisti.map(a => chip(`${a.firma ? '✓' : '✗'} ${a.voce.nome}`, a.firma ? 'ok' : 'manca', a.firma ? `acquistato: ${quandoFirma(a.firma)}` : 'non ancora acquistato (finestra 1)'))}</div>` : html`<span class="nota">niente da comprare</span>`}</td>
        <td>${v.materiale.length ? html`<div class="spunte">${v.materiale.map(m => spuntaForm(r.id, 'materiale', m.fase, m.nome, m.firma, torna, { manca: m.manca && !m.firma, solaLettura, titolo: `${m.nota}${m.manca ? ' — manca ancora un acquisto' : ''}. Premi quando hai verificato che c'è tutto il materiale per questa fase` }))}</div>
          <small class="nota">${v.materiale.map(m => `${m.nome}: ${m.nota}`).filter(x => !x.endsWith(': ')).join(' · ')}</small>`
          : html`<span class="nota">fasi non note: collega o fai il preventivo (sotto il codice)</span>`}</td>
        <td>${chiQuando(v.materiale)}</td>
        <td class="azioni-riga">${r.commessaId ? html`<a class="bottone piccolo" href="/commesse/${r.commessaId}/pre-produzione" title="Scheda di pre-produzione: documenti, BOM, materiale, checklist">Pre-produzione</a>` : html`<a class="bottone piccolo" href="/commesse" title="La commessa non c'è ancora: si crea dal preventivo">Commesse</a>`}
          ${solaLettura ? '' : html`<form method="post" action="/produzione/flusso/riga/${r.id}/in-produzione"><input type="hidden" name="torna" value="${torna}"><input type="hidden" name="commessa" value="${r.commessaId ?? ''}">
            <button class="piccolo ${v.materialePronto ? 'primario' : ''}" title="Passa la riga in produzione anche senza tutte le spunte">Passa in produzione →</button></form>`}</td></tr>`;
      })}</tbody>`;
  } else if (f === 'produzione') {
    corpo = html`<thead><tr>${colonneBase}<th>Avanzamento (dal ciclo del preventivo; ✓ blu = tempi del reparto)</th><th>Fine lavorazione</th><th></th></tr></thead>
      <tbody>${righe.map(r => {
        const v = r.valutazione;
        return html`<tr id="riga-${r.id}" class="${r.consegna && r.consegna < oggi ? 'scaduta' : ''}">${intestazione(r)}
        <td>${v.produzione.length ? html`<div class="spunte">${v.produzione.map(p => spuntaForm(r.id, 'produzione', p.fase, p.nome, p.firma, torna, { auto: p.auto, solaLettura }))}</div>` : html`<span class="nota">fasi non note: collega o fai il preventivo (sotto il codice)</span>`}</td>
        <td>${v.finite ? html`<b>${num(v.finite, 0)} su ${num(r.quantita, 0)}</b> <small class="nota">${v.finite < r.quantita ? 'parziale' : 'totale'}</small>${v.pronte ? html`<br><small class="nota">${num(v.pronte, 0)} in "Da spedire"</small>` : ''}` : html`<span class="nota">—</span>`}
          ${solaLettura || !r.commessaId ? (r.commessaId ? '' : html`<br><small class="nota">serve la commessa</small>`) : html`<form method="post" action="/produzione/flusso/riga/${r.id}/fine-lavorazione" class="fine-lav"><input type="hidden" name="torna" value="${torna}"><input type="hidden" name="commessa" value="${r.commessaId}">
            <input name="quantita" inputmode="numeric" placeholder="schede" title="Schede finite (parziale)"><button class="piccolo" name="totale" value="0">Fine parziale</button><button class="piccolo primario" name="totale" value="1" title="Tutte le schede che mancano sono finite">Fine lavorazione</button></form>`}</td>
        <td class="azioni-riga">${r.commessaId ? html`<a class="bottone piccolo" href="/commesse/${r.commessaId}">Commessa</a> <a class="bottone piccolo" href="/commesse/${r.commessaId}/rientro">Rientro</a>` : ''}</td></tr>`;
      })}</tbody>`;
  } else {
    corpo = html`<thead><tr>${colonne('Pz ordinate')}<th class="n">Pz pronte</th><th>Stato</th><th></th></tr></thead>
      <tbody>${righe.map(r => {
        const v = r.valutazione;
        const inAttesa = (r.ddt ?? []).filter(x => !x.partitoIl);
        return html`<tr id="riga-${r.id}">${intestazione(r)}
        <td class="n">${num(v.pronte + v.inAttesaCorriere, 0)}${v.finite < r.quantita ? html`<br><small class="nota">${num(r.quantita - v.finite, 0)} ancora in produzione</small>` : ''}</td>
        <td>${inAttesa.length ? html`${chip('✓ In attesa di corriere', 'si')} <small class="nota">${inAttesa.map(x => html`<a href="/amministrazione/documenti/${x.id}">DDT ${x.numero ?? 'bozza'}${x.sezionale ? '/' + x.sezionale : ''}</a> del ${gm(x.data)} (${num(x.quantita, 0)} pz)`)}</small>`
          : html`${chip('☐ In attesa di corriere', '')} <small class="nota">${(r.giaPartiti ?? []).length ? `nessun DDT per ${v.pronte === 1 ? "l'ultima scheda" : `le ultime ${num(v.pronte, 0)} schede`}` : 'nessun DDT ancora'}</small>`}
          ${(r.giaPartiti ?? []).length ? html`<br><small class="nota">già partite: ${(r.giaPartiti ?? []).map((g, i) => html`${i ? ', ' : ''}${g.documento} (${num(g.quantita, 0)} pz)`)}</small>` : ''}</td>
        <td class="azioni-riga">${solaLettura ? '' : inAttesa.length ? html`<form method="post" action="/produzione/flusso/riga/${r.id}/spedito"><input type="hidden" name="torna" value="${torna}">${inAttesa.map(x => html`<input type="hidden" name="ddt" value="${x.id}">`)}
            <button class="piccolo primario" title="Il corriere è passato: passa in «Spedite nel mese»">Spedito ✓</button></form>`
          : html`${r.quantitaSpedita > 0 ? html`<form method="post" action="/produzione/flusso/riga/${r.id}/evasa" data-conferma="${`Chiudere la riga ${r.numero}/${r.anno} ${r.codice ?? ''}? Le ${num(v.pronte, 0)} schede che mancano non partiranno (scarto, o consegnate con un altro DDT). Si torna indietro dall'ordine scegliendo "Stato dai DDT".`}"><input type="hidden" name="torna" value="${torna}"><button class="piccolo" title="Le schede che mancano non partiranno: la riga diventa evasa">Chiudi riga</button></form> ` : ''}${r.commessaId ? html`<form method="post" action="/amministrazione/documenti/ddt-da-commessa/${r.commessaId}"><button class="piccolo" title="Prepara il DDT con le schede della commessa">Crea DDT</button></form>`
          : html`<form method="post" action="/amministrazione/documenti/ddt-da-ordine/${r.ordineId}"><button class="piccolo" title="Prepara il DDT con le schede dell'ordine">Crea DDT</button></form>`}`}</td></tr>`;
      })}</tbody>`;
  }
  return html`<section class="elenco-flusso">${testata}<div class="tabella-scorre"><table class="elenco flusso-tabella" data-non-ordinare>${corpo}</table></div>
    ${f === 'preparare' ? html`<p class="nota legenda-flusso"><span class="spunta manca">✗ rosso</span> manca ancora un acquisto · <span class="spunta si">✓ verde</span> verificato (nome e data di chi ha spuntato) · tutte le spunte di una riga → la riga passa da sola in "In produzione".</p>` : ''}
    ${f === 'produzione' ? html`<p class="nota legenda-flusso"><span class="spunta auto">✓ blu</span> fase con tempi registrati dal reparto (telefono o scheda scansionata) · <span class="spunta si">✓ verde</span> spuntata a mano · "Fine lavorazione" si dà anche dal telefono e dalla scheda di produzione stampata.</p>` : ''}
    </section>`;
}

function tabellaSpedite(d: DatiFlusso, torna: string, solaLettura: boolean): Raw {
  if (!d.spedite.length) return html`<p class="nota">Nessuna spedizione partita negli ultimi 30 giorni.</p>`;
  return html`<div class="tabella-scorre"><table class="elenco flusso-tabella">
    <thead><tr><th>Spedita il</th><th>Ordine · cliente</th><th>Codice</th><th class="n">Pz</th><th>DDT</th><th>Consegna richiesta</th><th>Ritardo</th><th></th></tr></thead>
    <tbody>${d.spedite.map(s => html`<tr><td>${data(s.data)}</td>
      <td>${s.ordineId ? html`<a href="/ordini/${s.ordineId}">${s.numero}/${s.anno}</a> · ` : ''}${s.cliente}</td>
      <td><b>${s.codice ?? ''}</b> <small class="nota">${s.descrizione ?? ''}${s.commessaNumero ? ` · comm. ${s.commessaNumero}` : ''}</small></td>
      <td class="n">${num(s.quantita, 0)}</td><td><a href="/amministrazione/documenti/${s.ddtId}">${s.ddt}</a></td><td>${data(s.consegnaRichiesta)}</td>
      <td class="${s.ritardo != null && s.ritardo > 0 ? 'negativo' : ''}">${s.ritardo == null ? '' : s.ritardo > 0 ? `+${s.ritardo} gg` : s.ritardo < 0 ? `${s.ritardo} gg` : 'in tempo'}</td>
      <td class="azioni-riga">${solaLettura ? '' : html`<form method="post" action="/produzione/flusso/ddt/${s.ddtId}/annulla-spedito"><input type="hidden" name="torna" value="${torna}"><button class="piccolo" title="Segnato per sbaglio: torna in attesa di corriere">Non partito</button></form>`}</td></tr>`)}</tbody>
  </table></div>`;
}
