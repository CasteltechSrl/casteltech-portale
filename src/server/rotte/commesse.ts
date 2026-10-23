/**
 * Pagine delle commesse: elenco, nuova da preventivo, scheda della commessa (modificabile),
 * stampa della scheda di produzione (A4, con QR su ogni pagina).
 */
import { Router, type Request } from 'express';
import QRCode from 'qrcode';
import { q, q1 } from '../db.js';
import { leggiPreventivo } from '../preventivi-servizio.js';
import {
  MATERIALI_SALDATURA, PROGRAMMI, STATI_COMMESSA, fasiCommessa, fasiPreviste, haCommessePrecedenti, leggiCommessa,
  proponiNumero, salvaCommessa, schedaTecnica, segnalazioniProdotto, type DatiCommessa, type FaseScheda, type SchedaTecnica,
} from '../commesse-servizio.js';
import { layout } from '../views/layout.js';
import { html, data, num, ore, raw, type Raw } from '../views/html.js';

const STATI_TESTO: Record<string, string> = { aperta: 'aperta', in_produzione: 'in produzione', rientrata: 'rientrata', analizzata: 'analizzata', chiusa: 'chiusa' };

export function rotteCommesse() {
  const r = Router();

  // ── Elenco ──
  r.get('/', async (req, res) => {
    const cerca = String(req.query.q ?? '').trim();
    const righe = await q(`
      SELECT c.id, c.numero, c.creato_il, c.data_consegna, c.quantita, c.stato, c.ordine_cliente, c.intestazione, p.numero AS preventivo
      FROM commesse c LEFT JOIN preventivi p ON p.id = c.preventivo_id
      WHERE $1 = '' OR c.numero ILIKE '%'||$1||'%' OR (c.intestazione->>'cliente') ILIKE '%'||$1||'%'
        OR (c.intestazione->>'codice') ILIKE '%'||$1||'%' OR c.ordine_cliente ILIKE '%'||$1||'%'
      ORDER BY c.creato_il DESC, c.id DESC LIMIT 300`, [cerca]);
    res.send(String(layout({
      titolo: 'Commesse', utente: req.session.utente, attiva: 'commesse', largo: true, script: 'elenco.js',
      contenuto: html`
      <div class="intestazione-pagina"><h1>Commesse</h1></div>
      <p class="nota">Una commessa si crea da un preventivo: apri il preventivo e premi <strong>Crea commessa</strong>.</p>
      <form class="cerca" method="get"><input name="q" value="${cerca}" placeholder="Cerca numero, cliente, codice, ordine…" type="search"><button>Cerca</button></form>
      <div class="tabella-scorre"><table class="elenco">
        <thead><tr><th>Numero</th><th>Data</th><th>Cliente</th><th>Codice</th><th>Rev.</th><th>Descrizione</th><th class="n">Q.tà</th>
          <th>Ordine cliente</th><th>Consegna</th><th>Preventivo</th><th>Stato</th></tr></thead>
        <tbody>${righe.map(c => html`
          <tr class="cliccabile" data-href="/commesse/${c.id}">
            <td class="nowrap"><a href="/commesse/${c.id}">${c.numero}</a></td><td>${data(c.creato_il)}</td>
            <td>${c.intestazione?.cliente}</td><td>${c.intestazione?.codice}</td><td>${c.intestazione?.revisione}</td>
            <td class="taglia">${c.intestazione?.descrizione}</td><td class="n">${num(c.quantita, 0)}</td>
            <td>${c.ordine_cliente}</td><td>${data(c.data_consegna)}</td><td>${c.preventivo}</td>
            <td><span class="stato ${c.stato}">${STATI_TESTO[c.stato] ?? c.stato}</span></td>
          </tr>`)}</tbody></table></div>
      ${righe.length ? '' : html`<p class="vuoto">Nessuna commessa${cerca ? ' trovata' : ''}.</p>`}`,
    })));
  });

  // ── Nuova, da preventivo ──
  r.get('/nuova', async (req, res) => {
    const prev = await leggiPreventivo(Number(req.query.preventivo) || 0);
    if (!prev) return res.status(404).send('Preventivo non trovato');
    const ultimaScheda = prev.revisione_id ? await q1<{ scheda_tecnica: any }>(`SELECT scheda_tecnica FROM prodotti_revisioni WHERE id = $1`, [prev.revisione_id]) : null;
    const dati: DatiCommessa = {
      numero: await proponiNumero(), ordineCliente: '', referenteCliente: '', dataOrdine: null, dataConsegna: null,
      quantita: prev.n_schede, primoLotto: prev.prodotto_id ? !(await haCommessePrecedenti(prev.prodotto_id)) : true,
      segnalazioni: '', scheda: schedaTecnica(ultimaScheda?.scheda_tecnica),
    };
    res.send(await paginaCommessa(req, prev, dati));
  });

  r.post('/salva', async (req, res) => {
    const b = req.body ?? {};
    const id = b.id ? Number(b.id) : undefined;
    const dati = datiDaForm(b);
    const esito = await salvaCommessa({ id, preventivoId: Number(b.preventivoId), dati, utenteId: req.session.utente!.id });
    if (esito.errore) {
      const prev = await leggiPreventivo(Number(b.preventivoId));
      if (!prev) return res.status(404).send('Preventivo non trovato');
      const comm = id ? await leggiCommessa(id) : undefined;
      return res.status(400).send(await paginaCommessa(req, prev, dati, comm, esito.errore));
    }
    res.redirect(`/commesse/${esito.id}?salvata=1`);
  });

  // ── Apri ──
  r.get('/:id', async (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return next();
    const c = await leggiCommessa(Number(req.params.id));
    if (!c) return res.status(404).send('Commessa non trovata');
    const prev = await leggiPreventivo(c.preventivo_id);
    if (!prev) return res.status(404).send('Preventivo della commessa non trovato');
    const dati: DatiCommessa = {
      numero: c.numero, ordineCliente: c.ordine_cliente ?? '', referenteCliente: c.referente_cliente ?? '',
      dataOrdine: dataIso(c.data_ordine), dataConsegna: dataIso(c.data_consegna), quantita: c.quantita, primoLotto: c.primo_lotto,
      segnalazioni: c.segnalazioni ?? '', scheda: schedaTecnica(c.scheda_tecnica), stato: c.stato,
    };
    res.send(await paginaCommessa(req, prev, dati, c, undefined, req.query.salvata ? 'Commessa salvata' : undefined));
  });

  // ── Stampa della scheda di produzione ──
  r.get('/:id/scheda', async (req, res) => {
    const c = await leggiCommessa(Number(req.params.id));
    if (!c) return res.status(404).send('Commessa non trovata');
    const prev = await leggiPreventivo(c.preventivo_id);
    const fasi = await fasiCommessa(c);
    const storico = await segnalazioniProdotto(c.prodotto_id);
    const qr = await QRCode.toString(indirizzoQr(req, c.codice_qr), { type: 'svg', margin: 0, errorCorrectionLevel: 'M' });
    res.send(String(schedaStampa(c, prev, fasi, storico, raw(qr))));
  });

  return r;
}

/** Indirizzo aperto dal QR: porta alla commessa (anche da telefono o tablet). */
export const indirizzoQr = (req: Request, codice: string) => `${req.protocol}://${req.get('host')}/c/${codice}`;

const dataIso = (d: unknown) => (d ? new Date(d as string).toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' }) : null);

function datiDaForm(b: any): DatiCommessa {
  const dataOk = (x: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(x ?? '')) ? String(x) : null);
  return {
    numero: String(b.numero ?? '').trim(), ordineCliente: String(b.ordineCliente ?? '').trim(), referenteCliente: String(b.referenteCliente ?? '').trim(),
    dataOrdine: dataOk(b.dataOrdine), dataConsegna: dataOk(b.dataConsegna),
    quantita: Math.max(0, Math.round(Number(String(b.quantita ?? '').replace(',', '.')) || 0)),
    primoLotto: !!b.primoLotto, segnalazioni: String(b.segnalazioni ?? '').trim(), scheda: schedaTecnica(b.scheda),
    stato: STATI_COMMESSA.includes(b.stato) ? b.stato : undefined,
  };
}

// ───────────────────────────── pagina della commessa (form) ─────────────────────────────

async function paginaCommessa(req: Request, prev: any, d: DatiCommessa, salvata?: any, errore?: string, messaggio?: string): Promise<string> {
  const i = prev.intestazione ?? {};
  const doppia = !!prev.parametri?.doppiaFaccia;
  const fasi = salvata ? await fasiCommessa(salvata) : fasiPreviste(prev, d.quantita || prev.n_schede, d.primoLotto);
  const storico = prev.prodotto_id ? await segnalazioniProdotto(prev.prodotto_id) : [];
  const st = d.scheda;
  return String(layout({
    titolo: salvata ? `Commessa ${salvata.numero}` : 'Nuova commessa', utente: req.session.utente, attiva: 'commesse', avviso: errore,
    contenuto: html`
    <form method="post" action="/commesse/salva" autocomplete="off">
    <input type="hidden" name="id" value="${salvata?.id ?? ''}"><input type="hidden" name="preventivoId" value="${prev.id}">
    <div class="intestazione-pagina">
      <h1>${salvata ? html`Commessa ${salvata.numero} <span class="stato ${salvata.stato}">${STATI_TESTO[salvata.stato]}</span>` : 'Nuova commessa'}</h1>
      <div class="azioni">
        ${messaggio ? html`<span class="nota positivo">${messaggio}</span>` : ''}
        ${salvata ? html`<a class="bottone" href="/commesse/${salvata.id}/scheda" target="_blank" rel="noopener">Stampa scheda di produzione</a>` : ''}
        <button class="primario">${salvata ? 'Salva' : 'Crea commessa'}</button>
      </div>
    </div>

    <div class="griglia-preventivo">
    <section class="colonna-dati">
      <fieldset class="blocco">
        <legend>Prodotto</legend>
        <p class="riepilogo"><strong>${i.cliente}</strong> · ${i.codice}${i.revisione ? html` rev. ${i.revisione}` : ''}<br>${i.descrizione}<br>
          <span class="nota">Preventivo <a href="/preventivi/${prev.id}">${prev.numero}</a> · ${doppia ? 'TOP + BOT' : 'Solo TOP'} · ${num(prev.n_schede_pannello, 0)} schede per pannello</span></p>
      </fieldset>

      <fieldset class="blocco">
        <legend>Commessa</legend>
        <div class="riga-campi">
          <label>Nr. commessa <input name="numero" value="${d.numero}" class="maiuscolo" maxlength="30"></label>
          <label>Nr. ordine cliente <input name="ordineCliente" value="${d.ordineCliente}" maxlength="60"></label>
          <label class="largo">Referente cliente <input name="referenteCliente" value="${d.referenteCliente}" maxlength="80"></label>
        </div>
        <div class="riga-campi">
          <label>Data ordine <input type="date" name="dataOrdine" value="${d.dataOrdine ?? ''}"></label>
          <label>Data consegna <input type="date" name="dataConsegna" value="${d.dataConsegna ?? ''}"></label>
          <label>Quantità schede <input inputmode="numeric" name="quantita" value="${d.quantita || ''}" required></label>
          ${salvata ? html`<label>Stato <select name="stato">${STATI_COMMESSA.map(s => html`<option value="${s}" ${s === d.stato ? raw('selected') : ''}>${STATI_TESTO[s]}</option>`)}</select></label>` : ''}
        </div>
        <label class="spunta"><input type="checkbox" name="primoLotto" ${d.primoLotto ? raw('checked') : ''}> Primo lotto (sulla scheda anche le fasi una tantum: pre-produzione, programmazioni)</label>
      </fieldset>

      <fieldset class="blocco">
        <legend>Programmi e lamine</legend>
        <table class="tabella-programmi">
          <thead><tr><th></th><th>TOP</th>${doppia ? html`<th>BOT</th>` : ''}</tr></thead>
          <tbody>${PROGRAMMI.map(([k, nome]) => html`<tr><th>${nome}</th>
            <td><input name="scheda[programmi][${k}][top]" value="${st.programmi[k]?.top}" maxlength="80"></td>
            ${doppia ? html`<td><input name="scheda[programmi][${k}][bot]" value="${st.programmi[k]?.bot}" maxlength="80"></td>`
              : html`<input type="hidden" name="scheda[programmi][${k}][bot]" value="${st.programmi[k]?.bot}">`}</tr>`)}
          </tbody></table>
        <label>Pasta <input name="scheda[pasta]" value="${st.pasta}" maxlength="80"></label>
      </fieldset>

      <fieldset class="blocco">
        <legend>Materiali di saldatura</legend>
        <div class="campi-parametri">${MATERIALI_SALDATURA.map(([k, nome]) => html`
          <label>${nome} <input name="scheda[materiali][${k}]" value="${st.materiali[k]}" maxlength="80"></label>`)}</div>
        <p class="nota">Il lotto del materiale usato lo scrive l'operatore sulla scheda.</p>
      </fieldset>

      <fieldset class="blocco">
        <legend>Note di montaggio</legend>
        <textarea name="scheda[noteMontaggio]" rows="4">${st.noteMontaggio}</textarea>
        <p class="nota">Programmi, lamine, materiali e note di montaggio si ripropongono alla prossima commessa dello stesso prodotto.</p>
      </fieldset>

      <fieldset class="blocco">
        <legend>Segnalazioni</legend>
        <textarea name="segnalazioni" rows="3" placeholder="Segnalazioni per questa commessa">${d.segnalazioni}</textarea>
        ${storico.length ? html`<p class="nota">Dallo storico del prodotto (stampate anche sulla scheda):</p>
          <ul class="storico">${storico.map(s => html`<li>${s.testo} <span class="nota">— ${s.origine}${s.numero ? `, commessa ${s.numero}` : ''}, ${data(s.creato_il)}</span></li>`)}</ul>` : ''}
      </fieldset>
    </section>

    <section class="colonna-risultati">
      <h2>Fasi sulla scheda ${salvata ? '' : html`<span class="nota">(anteprima: si aggiornano al salvataggio)</span>`}</h2>
      ${tabellaFasi(fasi)}
    </section>
    </div>
    </form>`,
  }));
}

function perGruppo(fasi: FaseScheda[]) {
  return [...new Set(fasi.map(f => f.gruppo))].map(g => ({ gruppo: g, fasi: fasi.filter(f => f.gruppo === g) }));
}

function tabellaFasi(fasi: FaseScheda[]): Raw {
  if (!fasi.length) return html`<p class="vuoto">Nessuna fase con un tempo nel preventivo.</p>`;
  const tot = (fs: FaseScheda[]) => fs.reduce((a, f) => a + f.cicloSec, 0);
  return html`<div class="tabella-scorre"><table class="fasi">
    <thead><tr><th>N.</th><th>Fase</th><th class="n">Pers.</th><th class="n" title="Tempo ciclo da preventivo">Previsto</th><th class="n">Ultima prod.</th></tr></thead>
    <tbody>${perGruppo(fasi).map(g => html`
      <tr class="riga-gruppo"><td colspan="3">${g.gruppo}</td><td class="n">${ore(tot(g.fasi))}</td><td></td></tr>
      ${g.fasi.map(f => html`<tr><td>${f.numero}</td><td>${f.nome}${f.unaTantum ? html` <span class="etichetta">1° lotto</span>` : ''}</td>
        <td class="n">${num(f.persone, 1)}</td><td class="n">${ore(f.cicloSec)}</td><td class="n">${f.ultimaSec == null ? '—' : ore(f.ultimaSec)}</td></tr>`)}`)}
      <tr class="riga-gruppo"><td colspan="3">TOTALE</td><td class="n">${ore(tot(fasi))}</td><td></td></tr>
    </tbody></table></div>`;
}

// ───────────────────────────── stampa A4 ─────────────────────────────

const RIGHE_RILEVAZIONE = 14;

function schedaStampa(c: any, prev: any, fasi: FaseScheda[], storico: { testo: string; numero: string | null }[], qr: Raw): Raw {
  const i = c.intestazione ?? {};
  const st: SchedaTecnica = schedaTecnica(c.scheda_tecnica);
  const doppia = !!prev?.parametri?.doppiaFaccia;
  const bot = (v: string) => (doppia ? v : '—');
  const quantita = html`${num(c.quantita, 0)} / ${num(c.n_pannelli ?? c.quantita, 0)}`;
  const prog = (k: string) => html`<div class="tb"><span>TOP:</span> ${st.programmi[k]?.top}</div><div class="tb"><span>BOT:</span> ${bot(st.programmi[k]?.bot ?? '')}</div>`;
  const cella = (etichetta: string, contenuto: unknown, cls = '') => html`<td class="${cls}"><div class="etic">${etichetta}</div><div class="val">${contenuto}</div></td>`;
  const testata = html`
    <div class="testata-stampa">
      <img src="/static/logo-casteltech.png" alt="Casteltech" class="logo">
      <div class="titolo-stampa">SCHEDA DI PRODUZIONE<br><span>Commessa ${c.numero}</span></div>
      <div class="qr">${qr}<div>${c.numero}</div></div>
    </div>`;
  const tot = (fs: FaseScheda[]) => fs.reduce((a, f) => a + f.cicloSec, 0);
  const segnalazioni = [...(c.segnalazioni ? [c.segnalazioni] : []), ...storico.map(s => s.testo + (s.numero ? ` (comm. ${s.numero})` : ''))];
  return html`<!doctype html>
<html lang="it"><head><meta charset="utf-8"><title>Scheda ${c.numero} · ${i.codice}</title>
<link rel="icon" href="/static/favicon.svg"><link rel="stylesheet" href="/static/stampa.css"></head>
<body>
<div class="barra-stampa"><button id="stampa">Stampa / salva PDF</button> <a href="/commesse/${c.id}">← torna alla commessa</a></div>

<section class="pagina">
  ${testata}
  <table class="griglia"><colgroup><col class="c1"><col class="c2"><col class="c3"><col class="c4"></colgroup>
    <tr>${cella('CODICE', i.codice)}${cella('DESCRIZIONE', i.descrizione)}${cella('REV.', i.revisione)}${cella('NR. COMMESSA', c.numero, 'forte')}</tr>
    <tr>${cella('CLIENTE', i.cliente)}${cella('REFERENTE CLIENTE', c.referente_cliente)}${cella('NR. ORDINE CLIENTE', c.ordine_cliente)}${cella("QTA' / PANN.", quantita, 'forte')}</tr>
    <tr>${cella('DATA ORDINE', data(c.data_ordine))}${cella('CONSEGNA', data(c.data_consegna))}${cella('PREVENTIVO', c.numero_preventivo)}${cella('LOTTO', c.primo_lotto ? 'PRIMO LOTTO' : 'RIPETIZIONE')}</tr>
    <tr>${cella('PROG. ARMADIO', prog('progArmadio'))}${cella('PROG. SERIGRAFIA', prog('progSerigrafia'))}${cella('LAMINA', prog('lamina'))}${cella('PASTA', st.pasta)}</tr>
    <tr>${cella('PROG. P&P FOX', prog('progPePFox'))}${cella('PROG. P&P IPULSE', prog('progPePIpulse'))}${cella('PROG. FORNO', prog('progForno'))}${cella('PROG. AOI', prog('progAOI'))}</tr>
    <tr>${MATERIALI_SALDATURA.map(([k, nome]) => cella(nome.toUpperCase(), html`${st.materiali[k]}<div class="lotto">Lotto:</div>`))}</tr>
  </table>
  <div class="riquadro note"><div class="etic">NOTE DI MONTAGGIO</div><div class="testo">${st.noteMontaggio}</div></div>
  <div class="riquadro segnalazioni"><div class="etic">SEGNALAZIONI</div>
    ${segnalazioni.length ? html`<ul>${segnalazioni.map(s => html`<li>${s}</li>`)}</ul>` : ''}</div>
  <table class="griglia spedizioni"><tr>${[1, 2, 3].map(n => html`<td>
    <div class="etic centro"><u>SPEDIZIONE ${n}</u></div>
    <div class="campi3"><span>QTA:</span><span>COLLI:</span><span>BANCALI:</span></div>
    <div class="campi2"><span>PESO:</span><span>DIMENSIONE:</span></div></td>`)}</tr></table>

  ${perGruppo(fasi).map(g => html`
  <h3 class="gruppo">${g.gruppo} <span>previsto ${ore(tot(g.fasi))}</span></h3>
  <table class="fasi-stampa">
    <thead><tr><th class="nr">NR</th><th>DESCRIZIONE FASE</th><th class="pers">PERS.</th><th class="t">TEMPO PREV. (CICLO)</th><th class="t">TEMPO ULTIMA PRODUZIONE</th><th class="t eff">TEMPO EFFETTIVO</th><th class="ok">✓</th></tr></thead>
    <tbody>${g.fasi.map(f => html`<tr><td class="nr">${f.numero}</td><td>${f.nome}</td><td class="pers">${num(f.persone, 1)}</td>
      <td class="t">${ore(f.cicloSec)}</td><td class="t">${f.ultimaSec == null ? '' : ore(f.ultimaSec)}</td><td class="t eff"></td><td class="ok">☐</td></tr>`)}</tbody>
  </table>`)}
  <h3 class="gruppo">ALTRE FASI (non previste)</h3>
  <table class="fasi-stampa"><tbody>${[1, 2, 3].map(() => html`<tr><td class="nr"></td><td></td><td class="pers"></td><td class="t"></td><td class="t"></td><td class="t eff"></td><td class="ok">☐</td></tr>`)}</tbody></table>
  <p class="totale-stampa">Totale tempo previsto (ciclo): <strong>${ore(tot(fasi))}</strong></p>
</section>

${[1, 2].map(n => html`
<section class="pagina rilevazioni">
  ${testata}
  <table class="griglia"><tr>${cella('CLIENTE', i.cliente)}${cella('CODICE / DESC.', html`${i.codice} — ${i.descrizione}`, 'larga')}${cella('NR. COMMESSA', c.numero, 'forte')}${cella('QTA', num(c.quantita, 0), 'forte')}</tr></table>
  <table class="tabella-rilevazioni">
    <thead><tr><th>FASE</th><th>OPERATORE</th><th>DATA</th><th>APERTURA TEMPO</th><th>CHIUSURA TEMPO</th><th>TOTALE ORE</th><th>PERS.</th><th>PZ</th><th>S / P</th><th>RESP</th><th>MATERIALE IMPIEGATO</th><th>NOTE</th></tr></thead>
    <tbody>${Array.from({ length: RIGHE_RILEVAZIONE }, () => html`<tr>${Array.from({ length: 12 }, () => html`<td></td>`)}</tr>`)}</tbody>
  </table>
  <p class="legenda">S = tempo standard · P = problema contingente (indicare la causa nelle note) · PERS. = persone che lavorano sulla fase · Foglio ${n}</p>
</section>`)}
<script src="/static/stampa.js" defer></script>
</body></html>`;
}
