/**
 * Cruscotto generale = pagina iniziale dell'ufficio (Adriano 31/10/2026): "Da fare oggi", sei numeri chiave e un riquadro per area.
 * Ogni numero e ogni riga portano alla pagina dove si lavora. Letture in cruscotto-generale-servizio.ts (una volta, all'apertura).
 */
import { testoDifferite } from '../../engine/fatture-differite.js';
import { Router } from 'express';
import { datiCruscottoGenerale, cosePerRiprendere, type DatiCruscottoGenerale } from '../cruscotto-generale-servizio.js';
import { quandoBreve, type VoceRiprendi } from '../../engine/riprendi.js';
import { euroBreve, saluto } from '../../engine/cruscotto-generale.js';
import { layout } from '../views/layout.js';
import { html, data, euro, num, type Raw } from '../views/html.js';

const oggiRoma = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
const oraRoma = () => Number(new Date().toLocaleString('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', hourCycle: 'h23' }));
const giornoEsteso = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const gm = (d: string | null | undefined) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '');
const STATI_PREVENTIVO: Record<string, string> = { da_validare: 'da validare', bozza: 'bozza', inviato: 'inviato' };
const STATI_SDI: Record<string, string> = { scartato: 'scartata', non_consegnato: 'non recapitata', inviato: 'esito in attesa' };
const TIPI_DOC: Record<string, string> = { fattura: 'Fattura', nota_credito: 'Nota di credito', autofattura: 'Autofattura' };

export function rotteCruscottoGenerale() {
  const r = Router();
  r.get('/', async (req, res) => {
    const oggi = oggiRoma();
    const [d, riprendi] = await Promise.all([datiCruscottoGenerale(oggi), cosePerRiprendere(req.session.utente?.id ?? null)]);
    res.send(String(layout({
      titolo: 'Cruscotto', utente: req.session.utente, attiva: 'cruscotto', largo: true,
      contenuto: pagina(d, oggi, req.session.utente?.nome ?? '', riprendi),
    })));
  });
  return r;
}

const mini = (voci: [string, string | number, boolean?][]) =>
  html`<div class="mini">${voci.map(([t, v, rosso]) => html`<div><span>${t}</span><b class="${rosso ? 'negativo' : ''}">${v}</b></div>`)}</div>`;
const riga = (testo: Raw | string, destra: Raw | string, opz: { link?: string; rosso?: boolean } = {}) =>
  html`<li class="${opz.rosso ? 'ritardo' : ''}">${opz.link ? html`<a href="${opz.link}">${testo}</a>` : html`<span>${testo}</span>`}<span class="d">${destra}</span></li>`;
const elenco = (righe: Raw[], vuoto: string) => (righe.length ? html`<ul>${righe}</ul>` : html`<p class="nota">${vuoto}</p>`);
const riquadro = (titolo: string, link: string, testoLink: string, corpo: Raw) =>
  html`<section class="area"><header><h2>${titolo}</h2><a href="${link}">${testoLink} →</a></header>${corpo}</section>`;

function pagina(d: DatiCruscottoGenerale, oggi: string, nome: string, riprendi: VoceRiprendi[] = []): Raw {
  const c = d.cifre;
  const primoNome = nome.split(' ')[0];
  return html`
    <div class="saluto"><h1>${saluto(oraRoma())}${primoNome ? `, ${primoNome}` : ''}</h1>
      <p class="nota">${giornoEsteso(oggi)} · dati letti all'apertura della pagina (ricarica per aggiornarli)</p></div>

    <div class="oggi"><h3>Da fare oggi</h3>
      ${d.daFare.length ? html`<div class="chips">${d.daFare.map(v => html`<a class="chip ${v.livello}" href="${v.link}"><b>${v.quanti}</b> ${v.testo}</a>`)}</div>`
        : html`<p class="nota">Niente in sospeso. Buon lavoro!</p>`}
      ${riprendi.length ? html`<div class="riprendi"><h3>Riprendi da dove eri</h3>
        <div class="chips">${riprendi.map(v => html`<a class="chip" href="${v.href}" title="${v.dettaglio ?? ''}"><b>${v.tipo}</b> ${v.titolo} <small class="nota">${quandoBreve(v.quando, oggi)}</small></a>`)}</div></div>` : ''}</div>

    <div class="cifre cifre-sei">
      <a class="cifra" href="/amministrazione"><span>Fatturato ${oggi.slice(0, 4)}</span><b>${euro(c.fatturato)}</b>
        <small>${c.variazioneFatturato == null ? 'imponibile, note di credito tolte' : html`<span class="${c.variazioneFatturato >= 0 ? 'positivo' : 'negativo'}">${c.variazioneFatturato > 0 ? '+' : ''}${c.variazioneFatturato} %</span> sullo stesso periodo ${Number(oggi.slice(0, 4)) - 1}`}</small></a>
      <a class="cifra" href="/ordini"><span>Ordini da evadere</span><b>${euro(c.daEvadere)}</b><small>${c.righeDaEvadere} righe · ${c.consegne14} consegne entro 14 gg</small></a>
      <a class="cifra" href="/preventivi"><span>Preventivi aperti</span><b>${c.preventiviAperti}</b><small>${c.preventiviInviati ? html`${c.preventiviInviati} inviati, ${euro(c.valoreInviati)}` : 'nessuno inviato in attesa'}</small></a>
      <a class="cifra ${c.commesseInRitardo ? 'allarme' : ''}" href="/commesse"><span>Commesse in corso</span><b>${c.commesseAperte}</b><small>${c.commesseInRitardo ? html`<span class="negativo">${c.commesseInRitardo} oltre la consegna</span>` : 'nessuna oltre la consegna'}</small></a>
      <a class="cifra ${c.incassiScaduti ? 'allarme' : ''}" href="/amministrazione"><span>Da incassare</span><b>${euro(c.daIncassare)}</b><small>${c.incassiScaduti ? html`<span class="negativo">${euro(c.incassiScaduti)} scaduti</span>` : 'nessuna rata scaduta'}</small></a>
      <a class="cifra" href="/amministrazione/ricevuti?da_pagare=1"><span>Da pagare</span><b>${euro(c.daPagare)}</b><small>${c.pagamentiScaduti ? html`<span class="negativo">${euro(c.pagamentiScaduti)} scaduti</span>` : html`${euro(c.pagamenti7)} entro 7 gg`}</small></a>
    </div>

    <div class="aree">
      ${commerciale(d, oggi)}${ordini(d, oggi)}${produzione(d, oggi)}${acquisti(d)}${amministrazione(d)}${sistema(d)}
    </div>
    <p class="nota piede">Ogni numero e ogni riga portano alla pagina dove si lavora. I cruscotti di dettaglio restano in Ordini clienti e in Amministrazione.</p>`;
}

function commerciale(d: DatiCruscottoGenerale, oggi: string) {
  const x = d.commerciale;
  return riquadro('Commerciale', '/preventivi', 'Preventivi', html`
    ${mini([['Da validare', x.daValidare, x.daValidare > 0], ['Bozze', x.bozze], ['Inviati', x.inviati]])}
    <div class="tit">Preventivi aperti</div>
    ${elenco(x.ultimi.map(p => riga(`${p.intestazione?.cliente ?? '?'} · ${p.intestazione?.codice ?? ''}${p.intestazione?.revisione ? ` rev ${p.intestazione.revisione}` : ''}`,
      `${STATI_PREVENTIVO[p.stato] ?? p.stato} · ${gm(new Date(p.creato_il).toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' }))}`,
      { link: `/preventivi/${p.id}` })), 'Nessun preventivo aperto.')}
    <div class="tit">CRM: prossime azioni${x.crmScadute ? html` · <span class="negativo">${x.crmScadute} scadute</span>` : ''}</div>
    ${elenco(x.crmProssime.map(a => riga(`${a.prossima_azione || 'Azione'} · ${a.ragione_sociale}`,
      a.data_prossima_azione < oggi ? `scaduta ${gm(a.data_prossima_azione)}` : gm(a.data_prossima_azione),
      { link: `/crm/${a.id}`, rosso: a.data_prossima_azione < oggi })), 'Nessuna azione nei prossimi 7 giorni.')}`);
}

function ordini(d: DatiCruscottoGenerale, oggi: string) {
  const x = d.ordini;
  return riquadro('Ordini clienti', '/ordini/cruscotto', 'Cruscotto ordini', html`
    ${mini([['Righe da evadere', x.daEvadere], ['In ritardo', x.inRitardo, x.inRitardo > 0], ['Valore', euroBreve(x.valore)]])}
    <div class="tit">Consegne dei prossimi 14 giorni (e in ritardo)</div>
    ${elenco(x.prossime.map(r => riga(`${r.cliente} · ${num(r.residuoQuantita, 0)} pz ${r.codice ?? r.descrizione ?? ''}`,
      r.consegna! < oggi ? `era il ${gm(r.consegna)}` : gm(r.consegna), { link: `/ordini/${r.ordineId}`, rosso: r.consegna! < oggi })), 'Nessuna consegna nei prossimi 14 giorni.')}
    ${x.altreProssime ? html`<p class="nota"><a href="/ordini">Altre ${x.altreProssime} →</a></p>` : ''}
    <div class="tit">Da acquisire (mail e cartella Drive)</div>
    ${elenco(x.ordiniDaAcquisire ? [riga(`${x.ordiniDaAcquisire} ${x.ordiniDaAcquisire === 1 ? 'documento in attesa' : 'documenti in attesa'} di conferma`, html`<a href="/ordini/acquisire">Apri →</a>`)] : [],
      'Niente da acquisire.')}`);
}

function produzione(d: DatiCruscottoGenerale, oggi: string) {
  const x = d.produzione;
  return riquadro('Produzione', '/ordini/gantt', 'Gantt', html`
    ${mini([['Commesse aperte', x.aperte], ['In produzione', x.inProduzione], ['Tempi aperti', x.tempiAperti]])}
    <div class="tit">Carico delle prossime settimane (ore ciclo / disponibili)</div>
    <div class="settimane">${x.settimane.map(s => html`<a href="/ordini/gantt?vista=settimana&da=${s.lunedi}" class="${s.piena ? 'piena' : ''}"
      title="Settimana dal ${data(s.lunedi)}: ${num(s.ore, 1)} ore di lavoro su ${num(s.disponibili, 0)} disponibili">sett. ${s.numero}<b>${num(s.ore, 0)}/${num(s.disponibili, 0)}</b></a>`)}</div>
    <p class="nota piccola">Dalle consegne aperte con preventivo, ${num(x.oreGiorno)} ore al giorno.</p>
    <div class="tit">Commesse in corso</div>
    ${elenco(x.commesse.map(k => {
      const ferma = k.stato === 'in_produzione' && k.ultimo_tempo && k.ultimo_tempo < oggi ? Math.round((Date.parse(oggi) - Date.parse(k.ultimo_tempo)) / 86_400_000) : 0;
      const ritardo = k.data_consegna && k.data_consegna < oggi;
      return riga(`${k.numero} · ${k.intestazione?.cliente ?? ''} ${k.intestazione?.codice ?? ''}`,
        ritardo ? `consegna ${gm(k.data_consegna)}` : ferma >= 3 ? `ultimo tempo ${ferma} gg fa` : k.stato === 'in_produzione' ? 'in produzione' : k.data_consegna ? `consegna ${gm(k.data_consegna)}` : 'aperta',
        { link: `/commesse/${k.id}`, rosso: !!ritardo });
    }), 'Nessuna commessa aperta.')}`);
}

function acquisti(d: DatiCruscottoGenerale) {
  const x = d.acquisti;
  const ARRIVO: Record<string, string> = { da_ricevere: 'da ricevere', parziale: 'arrivo parziale' };
  return riquadro('Acquisti', '/ordini/fornitori', 'Ordini a fornitore', html`
    ${mini([['Ordini aperti', x.aperti], ['Arrivo parziale', x.parziali], ['Bozze', x.bozze]])}
    <div class="tit">Merce in arrivo</div>
    ${elenco(x.elenco.map(o => riga(`${o.fornitore ?? '?'} · n. ${o.numero ?? '—'}${o.commessa ? ` (comm. ${o.commessa})` : ''}`,
      o.prima_consegna ? `${ARRIVO[o.arrivo] ?? o.arrivo} · ${gm(o.prima_consegna)}` : ARRIVO[o.arrivo] ?? o.arrivo, { link: `/ordini/fornitori/${o.id}` })),
      'Nessun ordine a fornitore in attesa di merce.')}
    <p class="nota"><a href="/quotazioni/prezzo">Miglior prezzo di un P/N →</a></p>`);
}

function amministrazione(d: DatiCruscottoGenerale) {
  const x = d.amministrazione;
  const sdi = x.sdi.map(s => riga(`${TIPI_DOC[s.tipo] ?? 'Documento'} ${s.numero} · ${s.nome}`, STATI_SDI[s.stato] ?? s.stato,
    { link: `/amministrazione/documenti/${s.id}`, rosso: s.stato === 'scartato' }));
  if (x.ricevutiSdi) sdi.push(riga(`${x.ricevutiSdi} ${x.ricevutiSdi === 1 ? 'fattura fornitore arrivata' : 'fatture fornitori arrivate'} dallo SdI`, 'ultimi 7 gg', { link: '/amministrazione/ricevuti' }));
  return riquadro('Amministrazione', '/amministrazione', 'Cruscotto', html`
    ${mini([['Fatturato del mese', euroBreve(x.fatturatoMese)], ['Scaduto clienti', euroBreve(x.scadutoClienti), x.scadutoClienti > 0], ['DDT da fatturare', x.ddtDaFatturare]])}
    ${testoDifferite(x.differite) ? html`<p class="nota ${x.differite.scaduti ? 'negativo' : ''}"><a href="/amministrazione/differite">${testoDifferite(x.differite)} → Fattura tutti</a></p>` : ''}
    <div class="tit">SdI</div>
    ${elenco(sdi, 'Nessuna fattura in attesa di esito, nessuno scarto.')}
    <div class="tit">Incassi scaduti più vecchi</div>
    ${elenco(x.incassiScaduti.map(s => riga(`${s.nome} · fatt. ${s.numero} · ${euro(s.importo)}`, `da ${s.giorni} gg`, { link: `/amministrazione/documenti/${s.documento_id}`, rosso: true })),
      'Nessun incasso scaduto.')}`);
}

function sistema(d: DatiCruscottoGenerale) {
  const x = d.sistema;
  // nome del file: casteltech-backup-AAAA-MM-GG-hh-mm.json.gz (ora UTC)
  const m = x.backup?.nome.match(/(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})/);
  const quando = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])).toLocaleString('it-IT', { timeZone: 'Europe/Rome', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  return riquadro('Promemoria e sistema', '/impostazioni/servizi', 'Servizi', html`
    <div class="tit">Scadenze del mese</div>
    ${elenco(x.scadenze.map(s => riga(s.testo, gm(s.data))), 'Nessuna scadenza nei prossimi giorni.')}
    <div class="tit">Servizi (IA, database, memoria…)</div>
    ${x.servizi ? elenco(x.servizi.testi.map(t => riga(t, x.servizi!.livello === 'critico' ? 'fermo' : 'attenzione', { link: '/impostazioni/servizi', rosso: true })), '')
      : html`<ul>${riga('Tutto nei limiti', 'ok', { link: '/impostazioni/servizi' })}</ul>`}
    <div class="tit">Ultimo backup</div>
    ${x.backup ? html`<ul>${riga(`${quando} · ${num(x.backup.kb / 1024, 0)} MB`, 'ok', { link: '/impostazioni/backup' })}</ul>`
      : html`<p class="nota">Nessuna copia sul disco del portale. <a href="/impostazioni/backup">Backup →</a></p>`}
    <div class="tit">Suggerimenti del team</div>
    ${elenco(x.suggerimenti ? [riga(`${x.suggerimenti} da valutare`, html`<a href="/suggerimenti">Apri →</a>`)] : [], 'Nessun suggerimento da valutare.')}`);
}
