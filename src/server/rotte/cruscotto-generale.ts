/**
 * Cruscotto generale = pagina iniziale dell'ufficio (Adriano 31/10/2026). Dall'8/11/2026 (Adriano, proposta A "fasce per ambito"):
 * una fascia per ambito (DA FARE OGGI, PRODUZIONE, COMMERCIALE, ORDINI CLIENTI, ACQUISTI, AMMINISTRAZIONE, CONTROLLI, SISTEMA) con il nome
 * grande a sinistra e riquadri tutti uguali (titolo, numero, una riga). "Apri" porta alla pagina, "dettagli" apre l'elenco sotto la fascia
 * (`?apri=<riquadro>`; per la produzione `?flusso=<finestra>`, come prima). Letture in cruscotto-generale-servizio.ts (una volta, all'apertura).
 */
import { testoDifferite } from '../../engine/fatture-differite.js';
import { Router } from 'express';
import { datiCruscottoGenerale, cosePerRiprendere, type DatiCruscottoGenerale } from '../cruscotto-generale-servizio.js';
import { quandoBreve, type VoceRiprendi } from '../../engine/riprendi.js';
import { euroBreve, saluto } from '../../engine/cruscotto-generale.js';
import { layout } from '../views/layout.js';
import { finestraValida } from '../../engine/flusso.js';
import { datiFlusso, type DatiFlusso } from '../flusso-servizio.js';
import { elencoFinestra } from './flusso.js';
import { FINESTRE, type Finestra } from '../../engine/flusso.js';
import type { DaFare } from '../../engine/cruscotto-generale.js';
import { html, data, euro, num, type Raw } from '../views/html.js';
import { elencoControlli, riepilogoControlli, type Controllo } from '../../engine/controlli.js';
import { datiControlli } from '../controlli-servizio.js';
import { annoRiferimento } from '../anno-riferimento.js';
import { sceltaAnno, tabellaClientiFatturato } from '../views/scelta-anno.js';

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
    const finestra = finestraValida(req.query.flusso);
    const apri = typeof req.query.apri === 'string' ? req.query.apri : finestra;
    const anno = annoRiferimento(req, oggi);
    const [d, riprendi, flusso, datiCtrl] = await Promise.all([datiCruscottoGenerale(oggi, anno), cosePerRiprendere(req.session.utente?.id ?? null), datiFlusso(oggi),
      datiControlli(oggi)]);
    res.send(String(layout({
      titolo: 'Cruscotto', utente: req.session.utente, attiva: 'cruscotto', largo: true,
      avviso: req.query.msg ? String(req.query.msg) : undefined,
      contenuto: pagina(d, oggi, req.session.utente?.nome ?? '', riprendi, flusso, elencoControlli(datiCtrl), apri, req.session.utente?.ruolo === 'esterno'),
    })));
  });
  return r;
}

const riga = (testo: Raw | string, destra: Raw | string, opz: { link?: string; rosso?: boolean } = {}) =>
  html`<li class="${opz.rosso ? 'ritardo' : ''}">${opz.link ? html`<a href="${opz.link}">${testo}</a>` : html`<span>${testo}</span>`}<span class="d">${destra}</span></li>`;
const elenco = (righe: Raw[], vuoto: string) => (righe.length ? html`<ul>${righe}</ul>` : html`<p class="nota">${vuoto}</p>`);
const tit = (t: Raw | string) => html`<div class="tit">${t}</div>`;
const primaMaiuscola = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Un riquadro della fascia: tutti uguali (titolo, numero grande, una riga sotto), "Apri" alla pagina e, se c'è, "dettagli" sotto la fascia. */
export interface Riquadro {
  chiave: string; titolo: string; numero: string | number; sotto?: Raw | string; link: string;
  livello?: 'urgente' | 'controllare' | 'normale'; dettaglio?: () => Raw; apriCon?: string;
}
/** Una fascia = un ambito, con il nome grande a sinistra. */
export interface Fascia { chiave: string; nome: string; riquadri: Riquadro[] }

/** Disegna le fasce; il dettaglio aperto (`apri` = chiave del riquadro) va sotto la sua fascia, a tutta larghezza. */
export function disegnaFasce(fasce: Fascia[], apri: string | null): Raw {
  return html`${fasce.map(f => {
    const aperto = f.riquadri.find(q => q.chiave === apri && q.dettaglio);
    return html`<section class="fascia fascia-${f.chiave}" id="fascia-${f.chiave}">
      <h2 class="ambito">${f.nome}</h2>
      <div class="riquadri">${f.riquadri.map(q => html`<div class="riquadro ${q.livello ?? ''} ${aperto === q ? 'aperto' : ''}">
        <a class="corpo" href="${q.link}"><h3>${q.titolo}</h3><b>${q.numero}</b>${q.sotto ? html`<small>${q.sotto}</small>` : ''}</a>
        <div class="piede"><a href="${q.link}">Apri ›</a>${q.dettaglio ? (aperto === q
          ? html`<a href="/cruscotto#fascia-${f.chiave}">▴ chiudi</a>`
          : html`<a href="${q.apriCon ?? `/cruscotto?apri=${q.chiave}`}#fascia-${f.chiave}">▾ dettagli</a>`) : ''}</div></div>`)}</div>
      ${aperto ? html`<div class="dettaglio-fascia">${aperto.dettaglio!()}</div>` : ''}
    </section>`;
  })}`;
}

function pagina(d: DatiCruscottoGenerale, oggi: string, nome: string, riprendi: VoceRiprendi[], flusso: DatiFlusso, controlli: Controllo[],
  apri: string | null, solaLettura: boolean): Raw {
  const primoNome = nome.split(' ')[0];
  const fasce: Fascia[] = [
    daFareOggi(d.daFare, riprendi, oggi), produzione(d, flusso, oggi, solaLettura), commerciale(d, oggi), ordini(d, oggi), acquisti(d),
    amministrazione(d, oggi), dipendenti(d), fasciaControlli(controlli), sistema(d),
  ];
  const a = d.anno.anno;
  return html`
    <div class="saluto"><h1>${saluto(oraRoma())}${primoNome ? `, ${primoNome}` : ''}</h1>
      <p class="nota">${giornoEsteso(oggi)} · dati letti all'apertura della pagina (ricarica per aggiornarli)</p>
      ${sceltaAnno(a, '/cruscotto', Number(oggi.slice(0, 4)))}
      <p class="nota">I riquadri con l'anno nel titolo usano il <b>${a}</b>${d.anno.inCorso ? ' (fino a oggi, confronto con lo stesso periodo dell\'anno prima)' : ` (anno intero, confronto con il ${a - 1})`};
        gli altri sono la situazione di oggi. L'anno scelto vale anche nei cruscotti di Ordini clienti, Amministrazione e Dipendenti.</p></div>
    ${disegnaFasce(fasce, apri)}
    <p class="nota piede">Clic su un riquadro = la pagina dove si lavora; "dettagli" = l'elenco qui sotto. I cruscotti completi restano in Ordini clienti e in Amministrazione.</p>`;
}

function daFareOggi(voci: DaFare[], riprendi: VoceRiprendi[], oggi: string): Fascia {
  const riquadri: Riquadro[] = voci.map(v => ({ chiave: `oggi-${v.chiave}`, titolo: primaMaiuscola(v.testo), numero: v.quanti, link: v.link, livello: v.livello }));
  if (!riquadri.length) riquadri.push({ chiave: 'oggi-niente', titolo: 'Niente in sospeso', numero: 0, sotto: 'Buon lavoro!', link: '/cruscotto' });
  if (riprendi.length) riquadri.push({ chiave: 'riprendi', titolo: 'Riprendi da dove eri', numero: riprendi.length, sotto: 'ultime cose aperte (14 giorni)', link: riprendi[0].href,
    dettaglio: () => html`${tit('Riprendi da dove eri')}<div class="chips">${riprendi.map(v => html`<a class="chip" href="${v.href}" title="${v.dettaglio ?? ''}"><b>${v.tipo}</b> ${v.titolo} <small class="nota">${quandoBreve(v.quando, oggi)}</small></a>`)}</div>` });
  return { chiave: 'oggi', nome: 'Da fare oggi', riquadri };
}

function produzione(d: DatiCruscottoGenerale, f: DatiFlusso, oggi: string, solaLettura: boolean): Fascia {
  const sotto: Record<Finestra, string> = {
    acquistare: f.inRitardo ? `${f.inRitardo} con consegna già passata` : 'cose da comprare per le schede',
    preparare: 'materiale da verificare per fase',
    produzione: f.parziali ? `${f.parziali} con fine lavorazione parziale` : 'fasi del ciclo in corso',
    spedire: f.inAttesaCorriere ? `${f.inAttesaCorriere} in attesa di corriere` : 'schede finite da mettere su DDT',
    spedite: `ultimi 30 giorni · ${num(f.schedeSpedite, 0)} schede`,
  };
  const x = d.produzione;
  const riquadri: Riquadro[] = FINESTRE.map(w => ({
    chiave: w.chiave, titolo: w.nome, numero: f.conta[w.chiave], sotto: sotto[w.chiave], link: `/cruscotto?flusso=${w.chiave}#fascia-produzione`,
    livello: w.chiave === 'acquistare' && f.inRitardo ? 'urgente' : undefined,
    apriCon: `/cruscotto?flusso=${w.chiave}`, dettaglio: () => elencoFinestra(f, w.chiave, oggi, solaLettura),
  }));
  riquadri.push({ chiave: 'commesse', titolo: 'Commesse e carico', numero: x.aperte, link: '/commesse', livello: d.cifre.commesseInRitardo ? 'urgente' : undefined,
    sotto: d.cifre.commesseInRitardo ? `${d.cifre.commesseInRitardo} oltre la consegna` : `${x.inProduzione} in produzione`,
    dettaglio: () => html`<div class="colonne-dettaglio"><div>
      ${tit('Carico delle prossime settimane (ore ciclo / disponibili)')}
      <div class="settimane">${x.settimane.map(s => html`<a href="/ordini/gantt?vista=settimana&da=${s.lunedi}" class="${s.piena ? 'piena' : ''}"
        title="Settimana dal ${data(s.lunedi)}: ${num(s.ore, 1)} ore di lavoro su ${num(s.disponibili, 0)} disponibili">sett. ${s.numero}<b>${num(s.ore, 0)}/${num(s.disponibili, 0)}</b></a>`)}</div>
      <p class="nota piccola">Dalle consegne aperte con preventivo, ${num(x.oreGiorno)} ore al giorno. Tempi aperti: ${x.tempiAperti}. <a href="/ordini/gantt">Gantt →</a></p></div><div>
      ${tit('Commesse in corso')}
      ${elenco(x.commesse.map(k => {
        const ferma = k.stato === 'in_produzione' && k.ultimo_tempo && k.ultimo_tempo < oggi ? Math.round((Date.parse(oggi) - Date.parse(k.ultimo_tempo)) / 86_400_000) : 0;
        const ritardo = k.data_consegna && k.data_consegna < oggi;
        return riga(`${k.numero} · ${k.intestazione?.cliente ?? ''} ${k.intestazione?.codice ?? ''}`,
          ritardo ? `consegna ${gm(k.data_consegna)}` : ferma >= 3 ? `ultimo tempo ${ferma} gg fa` : k.stato === 'in_produzione' ? 'in produzione' : k.data_consegna ? `consegna ${gm(k.data_consegna)}` : 'aperta',
          { link: `/commesse/${k.id}`, rosso: !!ritardo });
      }), 'Nessuna commessa aperta.')}</div></div>` });
  riquadri.push({ chiave: 'commesse-anno', titolo: `Commesse ${d.anno.anno}`, numero: d.anno.commesse.quanti, link: '/commesse',
    sotto: `${num(d.anno.commesse.schede, 0)} schede da produrre` });
  return { chiave: 'produzione', nome: 'Produzione', riquadri };
}

function commerciale(d: DatiCruscottoGenerale, oggi: string): Fascia {
  const x = d.commerciale, c = d.cifre;
  return { chiave: 'commerciale', nome: 'Commerciale', riquadri: [
    { chiave: 'preventivi', titolo: 'Preventivi aperti', numero: c.preventiviAperti, link: '/preventivi',
      sotto: c.preventiviInviati ? `${c.preventiviInviati} inviati · ${euro(c.valoreInviati)}` : `${x.bozze} in bozza`,
      dettaglio: () => html`${tit('Preventivi aperti')}${elenco(x.ultimi.map(p => riga(`${p.intestazione?.cliente ?? '?'} · ${p.intestazione?.codice ?? ''}${p.intestazione?.revisione ? ` rev ${p.intestazione.revisione}` : ''}`,
        `${STATI_PREVENTIVO[p.stato] ?? p.stato} · ${gm(new Date(p.creato_il).toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' }))}`,
        { link: `/preventivi/${p.id}` })), 'Nessun preventivo aperto.')}` },
    { chiave: 'da-validare', titolo: 'Da validare', numero: x.daValidare, sotto: 'preventivi dai documenti del cliente', link: '/preventivi',
      livello: x.daValidare ? 'controllare' : undefined },
    { chiave: 'crm', titolo: 'CRM: prossime azioni', numero: x.crmScadute || x.crmProssime.length, link: '/crm', livello: x.crmScadute ? 'controllare' : undefined,
      sotto: x.crmScadute ? 'azioni scadute' : 'nei prossimi 7 giorni',
      dettaglio: () => html`${tit('CRM: prossime azioni')}${elenco(x.crmProssime.map(a => riga(`${a.prossima_azione || 'Azione'} · ${a.ragione_sociale}`,
        a.data_prossima_azione < oggi ? `scaduta ${gm(a.data_prossima_azione)}` : gm(a.data_prossima_azione),
        { link: `/crm/${a.id}`, rosso: a.data_prossima_azione < oggi })), 'Nessuna azione nei prossimi 7 giorni.')}` },
    { chiave: 'preventivi-anno', titolo: `Preventivi ${d.anno.anno}`, numero: d.anno.preventivi.quanti, link: '/preventivi',
      sotto: `${d.anno.preventivi.accettati} accettati${d.anno.preventivi.valore ? ` · ${euroBreve(d.anno.preventivi.valore)}` : ''}` },
  ] };
}

/** Clienti con il fatturato dell'anno scelto (Adriano 10/11/2026): numero = clienti fatturati, dettaglio = elenco completo. */
function riquadroClienti(d: DatiCruscottoGenerale): Riquadro {
  const x = d.anno, fatturati = x.clienti.filter(c => c.fatturato > 0);
  return { chiave: 'clienti', titolo: `Clienti ${x.anno}`, numero: fatturati.length, link: '/ordini/cruscotto#clienti',
    sotto: fatturati[0] ? `primo: ${fatturati[0].cliente.slice(0, 22)} · ${euroBreve(fatturati[0].fatturato)}` : 'nessuna fattura',
    dettaglio: () => html`${tit(`Clienti e fatturato ${x.anno}`)}${tabellaClientiFatturato(x.clienti, x.anno, x.inCorso)}` };
}

function ordini(d: DatiCruscottoGenerale, oggi: string): Fascia {
  const x = d.ordini, c = d.cifre;
  const prossime = () => html`${tit('Consegne dei prossimi 14 giorni (e in ritardo)')}
    ${elenco(x.prossime.map(r => riga(`${r.cliente} · ${num(r.residuoQuantita, 0)} pz ${r.codice ?? r.descrizione ?? ''}`,
      r.consegna! < oggi ? `era il ${gm(r.consegna)}` : gm(r.consegna), { link: `/ordini/${r.ordineId}`, rosso: r.consegna! < oggi })), 'Nessuna consegna nei prossimi 14 giorni.')}
    ${x.altreProssime ? html`<p class="nota"><a href="/ordini">Altre ${x.altreProssime} →</a></p>` : ''}`;
  return { chiave: 'ordini', nome: 'Ordini clienti', riquadri: [
    { chiave: 'da-evadere', titolo: 'Da evadere', numero: euro(c.daEvadere), sotto: `${c.righeDaEvadere} righe`, link: '/ordini', dettaglio: prossime },
    { chiave: 'in-ritardo', titolo: 'In ritardo', numero: x.inRitardo, sotto: 'righe oltre la consegna', link: '/ordini?vista=ritardo', livello: x.inRitardo ? 'urgente' : undefined, dettaglio: prossime },
    { chiave: 'prossime', titolo: 'Prossimi 14 giorni', numero: c.consegne14, sotto: 'consegne', link: '/ordini/gantt', dettaglio: prossime },
    { chiave: 'da-acquisire', titolo: 'Da acquisire', numero: x.ordiniDaAcquisire, sotto: 'mail e cartella Drive', link: '/ordini/acquisire',
      livello: x.ordiniDaAcquisire ? 'controllare' : undefined },
    { chiave: 'ordini-anno', titolo: `Ordini ricevuti ${d.anno.anno}`, numero: euro(d.anno.ordini.valore), link: '/ordini?vista=tutti',
      sotto: `${d.anno.ordini.quanti} ordini${confronto(d.anno.ordini.variazione, d.anno.anno, d.anno.inCorso)}` },
    riquadroClienti(d),
  ] };
}

function acquisti(d: DatiCruscottoGenerale): Fascia {
  const x = d.acquisti, c = d.cifre;
  const ARRIVO: Record<string, string> = { da_ricevere: 'da ricevere', parziale: 'arrivo parziale' };
  return { chiave: 'acquisti', nome: 'Acquisti', riquadri: [
    { chiave: 'ordini-fornitore', titolo: 'Ordini a fornitore', numero: x.aperti, link: '/ordini/fornitori',
      sotto: `aperti · ${x.parziali} parziali · ${x.bozze} bozze`,
      dettaglio: () => html`${tit('Merce in arrivo')}${elenco(x.elenco.map(o => riga(`${o.fornitore ?? '?'} · n. ${o.numero ?? '—'}${o.commessa ? ` (comm. ${o.commessa})` : ''}`,
        o.prima_consegna ? `${ARRIVO[o.arrivo] ?? o.arrivo} · ${gm(o.prima_consegna)}` : ARRIVO[o.arrivo] ?? o.arrivo, { link: `/ordini/fornitori/${o.id}` })),
        'Nessun ordine a fornitore in attesa di merce.')}<p class="nota"><a href="/quotazioni/prezzo">Miglior prezzo di un P/N →</a></p>` },
    { chiave: 'da-pagare', titolo: 'Da pagare', numero: euro(c.daPagare), link: '/amministrazione/ricevuti?da_pagare=1', livello: c.pagamentiScaduti ? 'urgente' : undefined,
      sotto: c.pagamentiScaduti ? `${euro(c.pagamentiScaduti)} scaduti` : `${euro(c.pagamenti7)} entro 7 gg` },
    { chiave: 'acquisti-anno', titolo: `Acquisti ${d.anno.anno}`, numero: euro(d.anno.acquisti.totale), link: '/amministrazione/ricevuti/mesi',
      sotto: `fatture fornitori${confronto(d.anno.acquisti.variazione, d.anno.anno, d.anno.inCorso)}` },
  ] };
}

function amministrazione(d: DatiCruscottoGenerale, oggi: string): Fascia {
  const x = d.amministrazione, c = d.cifre;
  const sdi = x.sdi.map(s => riga(`${TIPI_DOC[s.tipo] ?? 'Documento'} ${s.numero} · ${s.nome}`, STATI_SDI[s.stato] ?? s.stato,
    { link: `/amministrazione/documenti/${s.id}`, rosso: s.stato === 'scartato' }));
  if (x.ricevutiSdi) sdi.push(riga(`${x.ricevutiSdi} ${x.ricevutiSdi === 1 ? 'fattura fornitore arrivata' : 'fatture fornitori arrivate'} dallo SdI`, 'ultimi 7 gg', { link: '/amministrazione/ricevuti' }));
  const differite = testoDifferite(x.differite);
  return { chiave: 'amministrazione', nome: 'Amministrazione', riquadri: [
    { chiave: 'fatturato', titolo: `Fatturato ${d.anno.anno}`, numero: euro(c.fatturato), link: '/amministrazione',
      sotto: c.variazioneFatturato == null ? (x.fatturatoMese == null ? 'fatture meno note di credito' : `${euroBreve(x.fatturatoMese)} nel mese`)
        : `${c.variazioneFatturato > 0 ? '+' : ''}${c.variazioneFatturato} % sul${d.anno.inCorso ? 'lo stesso periodo' : ''} ${d.anno.anno - 1}` },
    { chiave: 'da-incassare', titolo: 'Da incassare', numero: euro(c.daIncassare), link: '/amministrazione/crediti', livello: c.incassiScaduti ? 'urgente' : undefined,
      sotto: c.incassiScaduti ? `${euro(c.incassiScaduti)} scaduti` : 'nessuna rata scaduta',
      dettaglio: () => html`${tit('Incassi scaduti più vecchi')}${elenco(x.incassiScaduti.map(s => riga(`${s.nome} · fatt. ${s.numero} · ${euro(s.importo)}`, `da ${s.giorni} gg`,
        { link: `/amministrazione/documenti/${s.documento_id}`, rosso: true })), 'Nessun incasso scaduto.')}<p class="nota"><a href="/amministrazione/solleciti">Solleciti →</a></p>` },
    { chiave: 'ddt-da-fatturare', titolo: 'DDT da fatturare', numero: x.ddtDaFatturare, link: '/amministrazione/differite',
      livello: x.differite.scaduti ? 'urgente' : undefined, sotto: differite || 'fatture differite' },
    { chiave: 'sdi', titolo: 'SdI', numero: x.sdi.length, sotto: x.sdi.length ? 'scarti o esiti in attesa' : 'nessuno scarto', link: '/amministrazione/documenti',
      livello: x.sdi.some(s => s.stato === 'scartato') ? 'urgente' : undefined,
      dettaglio: () => html`${tit('SdI')}${elenco(sdi, 'Nessuna fattura in attesa di esito, nessuno scarto.')}` },
  ] };
}

/** Dipendenti (Adriano 10/11/2026): costo del personale dell'anno scelto (solo il totale, come la pagina Costo del personale). */
function dipendenti(d: DatiCruscottoGenerale): Fascia {
  const p = d.anno.personale;
  return { chiave: 'dipendenti', nome: 'Dipendenti', riquadri: [
    { chiave: 'personale', titolo: `Costo del personale ${d.anno.anno}`, numero: p.mesi ? euro(p.totale) : '—', link: '/dipendenti',
      sotto: p.mesi ? `${p.mesi} ${p.mesi === 1 ? 'mese caricato' : 'mesi caricati'}${p.variazione != null ? ` · ${p.variazione > 0 ? '+' : ''}${p.variazione} % sugli stessi mesi` : ''}` : 'nessun mese caricato' },
    { chiave: 'personale-peso', titolo: `Peso sul fatturato ${d.anno.anno}`, numero: p.peso != null ? `${String(p.peso).replace('.', ',')} %` : '—', link: '/dipendenti',
      sotto: 'costo del personale ÷ fatturato degli stessi mesi' },
  ] };
}

/** " · +12 % sullo stesso periodo 2025" (vuoto se non c'è nulla da confrontare). */
const confronto = (v: number | null, anno: number, inCorso: boolean) =>
  (v == null ? '' : ` · ${v > 0 ? '+' : ''}${v} % sul${inCorso ? 'lo stesso periodo' : ''} ${anno - 1}`);

function fasciaControlli(controlli: Controllo[]): Fascia {
  const r = riepilogoControlli(controlli);
  const riquadri: Riquadro[] = [{ chiave: 'controlli', titolo: 'Controlli settimanali', numero: r.totale, link: '/amministrazione/controlli',
    livello: r.urgenti ? 'urgente' : r.daControllare ? 'controllare' : undefined,
    sotto: r.totale ? `${r.urgenti} urgenti · ${r.daControllare} da controllare` : 'tutto a posto', dettaglio: () => sezioneControlli(controlli) }];
  return { chiave: 'controlli', nome: 'Controlli', riquadri };
}

function sistema(d: DatiCruscottoGenerale): Fascia {
  const x = d.sistema;
  // nome del file: casteltech-backup-AAAA-MM-GG-hh-mm.json.gz (ora UTC)
  const m = x.backup?.nome.match(/(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})/);
  const quando = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])).toLocaleString('it-IT', { timeZone: 'Europe/Rome', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  return { chiave: 'sistema', nome: 'Sistema', riquadri: [
    { chiave: 'scadenze', titolo: 'Scadenze del mese', numero: x.scadenze.length, sotto: x.scadenze[0] ? `prima: ${gm(x.scadenze[0].data)}` : 'nessuna nei prossimi giorni',
      link: '/cruscotto?apri=scadenze#fascia-sistema', dettaglio: () => html`${tit('Scadenze del mese')}${elenco(x.scadenze.map(s => riga(s.testo, gm(s.data))), 'Nessuna scadenza nei prossimi giorni.')}` },
    { chiave: 'servizi', titolo: 'Servizi', numero: x.servizi ? x.servizi.testi.length : 'ok', link: '/impostazioni/servizi',
      livello: x.servizi ? (x.servizi.livello === 'critico' ? 'urgente' : 'controllare') : undefined, sotto: x.servizi ? x.servizi.testi[0] : 'IA, database, memoria nei limiti' },
    { chiave: 'backup', titolo: 'Ultimo backup', numero: x.backup ? `${num(x.backup.kb / 1024, 0)} MB` : '—', link: '/impostazioni/backup',
      livello: x.backup ? undefined : 'controllare', sotto: x.backup ? quando : 'nessuna copia sul disco' },
    { chiave: 'suggerimenti', titolo: 'Suggerimenti', numero: x.suggerimenti, sotto: 'da valutare', link: '/suggerimenti' },
  ] };
}

/** Righe di ogni controllo mostrate nel cruscotto; il resto nella pagina dei controlli. */
export const RIGHE_CONTROLLO_CRUSCOTTO = 8;
const NOMI_LIVELLO: Record<string, string> = { urgente: 'urgente', controllare: 'da controllare', normale: 'quando c\'è tempo' };

/**
 * Controlli settimanali nel cruscotto (Adriano 7/11/2026; dall'8/11 nel dettaglio della fascia CONTROLLI): stessi controlli di
 * Amministrazione → Controlli (engine/controlli.ts), un riquadro chiudibile per controllo con le prime righe; gli urgenti si aprono da soli.
 */
export function sezioneControlli(controlli: Controllo[]): Raw {
  const r = riepilogoControlli(controlli);
  return html`<section class="oggi controlli-cruscotto" id="controlli"><h3>Controlli settimanali</h3>
    ${controlli.length ? html`<p class="nota">${r.totale} ${r.totale === 1 ? 'cosa lasciata a metà' : 'cose lasciate a metà'}${r.urgenti ? html`, <b class="negativo">${r.urgenti} urgenti</b>` : ''}${r.daControllare ? html`, ${r.daControllare} da controllare` : ''}
      · <a href="/amministrazione/controlli">pagina completa →</a></p>
      ${controlli.map(c => html`<details class="controllo ${c.livello}" ${c.livello === 'urgente' ? html`open` : ''}>
        <summary><b>${c.titolo}</b> <span class="etichetta ${c.livello}">${NOMI_LIVELLO[c.livello]}</span> <span class="conta">${c.righe.length}</span></summary>
        <p class="nota">${c.spiegazione}</p>
        <ul class="elenco-controllo">${c.righe.slice(0, RIGHE_CONTROLLO_CRUSCOTTO).map(v => html`<li>${v.link ? html`<a href="${v.link}">${v.testo}</a>` : v.testo}${v.dettaglio ? html` <small>· ${v.dettaglio}</small>` : ''}</li>`)}</ul>
        ${c.righe.length > RIGHE_CONTROLLO_CRUSCOTTO ? html`<p class="nota"><a href="/amministrazione/controlli#${c.chiave}">tutte le ${c.righe.length} →</a></p>` : ''}
      </details>`)}`
      : html`<p class="nota">Tutto a posto: nessuna cosa lasciata a metà.</p>`}
  </section>`;
}
