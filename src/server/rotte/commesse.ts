/**
 * Pagine delle commesse: elenco, nuova da preventivo, scheda della commessa (modificabile),
 * stampa della scheda di produzione (A4, con QR su ogni pagina).
 */
import { Router, type Request } from 'express';
import QRCode from 'qrcode';
import { q, q1, transazione } from '../db.js';
import { salvaBackupSuDisco } from '../backup.js';
import { confermaEliminaCommessa } from '../../engine/eliminazioni.js';
import { leggiPreventivo } from '../preventivi-servizio.js';
import {
  PROGRAMMI, STATI_COMMESSA, aggiungiTempi, fasiCommessa, fasiPreviste, haCommessePrecedenti, leggiCommessa, proponiNumero, rilevazioniCommessa,
  programmaForno, salvaCommessa, salvaRientro, schedaTecnica, schedaTecnicaDaProporre, caricaOperatori, numeriFasi, segnalazioniCommessa, segnalazioniProdotto,
  type DatiCommessa, type FaseScheda, type RigaRientro, type SchedaTecnica, type Spedizione,
} from '../commesse-servizio.js';
import { oreDa } from '../preventivi-servizio.js';
import { consumoReale, formatoQuantita, vociConsumo, type VoceConsumo } from '../../engine/consumi.js';
import { tempiRealiPerFase, type Rilevazione } from '../../engine/consuntivo.js';
import { controllaRientro, SOGLIA_SCOSTAMENTO } from '../../engine/rientro.js';
import { layout, VERSIONE } from '../views/layout.js';
import { fasiAperte, ricaricaPromemoria } from '../promemoria.js';
import { partiRoma } from '../../engine/promemoria.js';
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
      titolo: 'Commesse', utente: req.session.utente, attiva: 'commesse', largo: true, script: 'elenco.js', avviso: req.query.msg ? String(req.query.msg) : undefined,
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
    const dati: DatiCommessa = {
      numero: await proponiNumero(), ordineCliente: '', referenteCliente: '', dataOrdine: null, dataConsegna: null,
      quantita: prev.n_schede,
      // primo lotto: il preventivo è una prima produzione e il prodotto non ha ancora avuto commesse
      primoLotto: prev.parametri?.primaProduzione !== 0 && (prev.prodotto_id ? !(await haCommessePrecedenti(prev.prodotto_id)) : true),
      segnalazioni: '', scheda: await schedaTecnicaDaProporre(prev.revisione_id, prev.prodotto_id),
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
    const reali = tempiRealiPerFase(await rilevazioniCommessa(c.id));
    const catFasi = await fasiConNumeroAttuale(prev);
    const nomeFase = (cod: string) => catFasi.find(f => f.codice === cod) ?? { numero: '', nome: cod };
    res.send(String(schedaStampa(c, prev, fasi, storico, raw(qr), reali, nomeFase, await caricaOperatori())));
  });

  // ── Inserimento rapido dei tempi dalla pagina della commessa ──
  r.post('/:id/tempi', async (req, res) => {
    const c = await leggiCommessa(Number(req.params.id));
    if (!c) return res.status(404).send('Commessa non trovata');
    const prev = await leggiPreventivo(c.preventivo_id);
    const codici = new Set<string>((prev?.catalogo?.fasi ?? []).map((f: any) => f.codice));
    const persone = Object.fromEntries((await fasiCommessa(c)).map(f => [f.codice, f.persone]));
    const numero = (x: unknown) => { const n = Number(String(x ?? '').replace(',', '.')); return String(x ?? '').trim() !== '' && Number.isFinite(n) && n > 0 ? n : undefined; };
    const righe: { fase: string; durataMin: number; persone: number }[] = [];
    const leggi = (fase: string, x: any) => {
      const durataMin = String(x?.durata ?? '').trim() ? Math.round(oreDa(x.durata) * 60) : 0;
      if (codici.has(fase) && durataMin > 0) righe.push({ fase, durataMin, persone: numero(x?.persone) ?? persone[fase] ?? 1 });
    };
    for (const [fase, x] of Object.entries(req.body?.tempi ?? {})) leggi(fase, x);
    if (req.body?.nuova?.fase) leggi(String(req.body.nuova.fase), req.body.nuova);
    const n = await aggiungiTempi(c.id, righe, req.session.utente!);
    res.redirect(`/commesse/${c.id}?tempi=${n}`);
  });

  // ── Rientro della scheda (foglio tempi, materiale, spedizioni, segnalazioni) ──
  r.get('/:id/rientro', async (req, res) => {
    const c = await leggiCommessa(Number(req.params.id));
    if (!c) return res.status(404).send('Commessa non trovata');
    const msg = req.query.ok === 'conferma' ? 'Rientro confermato' : req.query.ok ? 'Salvato' : undefined;
    res.send(await paginaRientro(req, c, await rilevazioniCommessa(c.id), { messaggio: msg }));
  });

  r.post('/:id/rientro', async (req, res) => {
    const c = await leggiCommessa(Number(req.params.id));
    if (!c) return res.status(404).send('Commessa non trovata');
    const b = req.body ?? {};
    const fasi = await fasiCommessa(c);
    const righe = righeDaForm(b, Object.fromEntries(fasi.map(f => [f.codice, f.persone])));
    const consumi: Record<string, number> = {};
    for (const [k, v] of Object.entries(b.consumi ?? {})) {
      const n = Number(String(v).replace(',', '.'));
      if (String(v).trim() !== '' && Number.isFinite(n)) consumi[k] = n;
    }
    const spedizioni: Spedizione[] = [0, 1, 2].map(k => {
      const x = b.spedizioni?.[k] ?? {};
      const t = (y: unknown) => String(y ?? '').trim().slice(0, 60);
      return { qta: t(x.qta), colli: t(x.colli), bancali: t(x.bancali), peso: t(x.peso), dimensione: t(x.dimensione) };
    });
    const vuoleConferma = b.azione === 'conferma';
    const errori = controllaRientro(righe, fasi).filter(x => x.livello === 'errore');
    const conferma = vuoleConferma && !errori.length;
    const testoSegn = String(b.segnalazione?.testo ?? '').trim().slice(0, 2000);
    await salvaRientro({
      commessaId: c.id, righe, consumi, spedizioni, conferma, utenteId: req.session.utente!.id, prodottoId: c.prodotto_id, revisioneId: c.revisione_id,
      giaConfermata: ['rientrata', 'analizzata', 'chiusa'].includes(c.stato),
      segnalazione: testoSegn ? { testo: testoSegn, prossime: !!b.segnalazione?.prossime, faseCodice: String(b.segnalazione?.fase ?? '') || undefined } : undefined,
    });
    void ricaricaPromemoria().catch(e => console.error(e)); // le righe sono state riscritte: si rifanno i timer
    if (vuoleConferma && !conferma) {
      const agg = await leggiCommessa(c.id);
      return res.status(400).send(await paginaRientro(req, agg, await rilevazioniCommessa(c.id),
        { errore: `Salvato, ma non confermato: ci sono ${errori.length} errori da correggere (vedi Controlli).` }));
    }
    res.redirect(`/commesse/${c.id}/rientro?ok=${conferma ? 'conferma' : '1'}`);
  });

  // ── Elimina (commessa creata per errore) ──
  r.post('/:id/elimina', async (req, res) => {
    const id = Number(req.params.id);
    const c = await q1(`SELECT numero FROM commesse WHERE id = $1`, [id]);
    if (!c) return res.redirect('/commesse');
    await salvaBackupSuDisco('prima-di-eliminare-commessa').catch(() => null);
    await transazione(async t => {
      // tempi (anche dal telefono), scansioni, segnalazioni e analisi di questa commessa; le righe d'ordine restano, scollegate
      await t.query(`DELETE FROM rilevazioni WHERE commessa_id = $1`, [id]);
      await t.query(`DELETE FROM scansioni WHERE commessa_id = $1`, [id]);
      await t.query(`DELETE FROM segnalazioni WHERE commessa_id = $1`, [id]);
      await t.query(`DELETE FROM analisi_commesse WHERE commessa_id = $1`, [id]);
      await t.query(`DELETE FROM commesse WHERE id = $1`, [id]);
    });
    void ricaricaPromemoria().catch(e => console.error(e)); // niente promemoria per le fasi aperte della commessa eliminata
    res.redirect(`/commesse?msg=${encodeURIComponent(`Commessa ${c.numero} eliminata.`)}`);
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
  const storico = (prev.prodotto_id ? await segnalazioniProdotto(prev.prodotto_id) : []).filter(s => !salvata || s.numero !== salvata.numero || s.origine !== 'ufficio');
  const st = d.scheda;
  const aperte = salvata ? await fasiAperte({ commessaId: salvata.id }) : [];
  const nTempi = salvata ? (await q1(`SELECT count(*)::int AS n FROM rilevazioni WHERE commessa_id = $1`, [salvata.id]))!.n : 0;
  return String(layout({
    titolo: salvata ? `Commessa ${salvata.numero}` : 'Nuova commessa', utente: req.session.utente, attiva: 'commesse', avviso: errore,
    contenuto: html`
    <form method="post" action="/commesse/salva" autocomplete="off">
    <input type="hidden" name="id" value="${salvata?.id ?? ''}"><input type="hidden" name="preventivoId" value="${prev.id}">
    <div class="intestazione-pagina">
      <h1>${salvata ? html`Commessa ${salvata.numero} <span class="stato ${salvata.stato}">${STATI_TESTO[salvata.stato]}</span>` : 'Nuova commessa'}</h1>
      <div class="azioni">
        ${messaggio ? html`<span class="nota positivo">${messaggio}</span>` : ''}
        ${req.query.tempi ? html`<span class="nota positivo">Tempi aggiunti: ${String(req.query.tempi)}</span>` : ''}
        ${salvata ? html`<a class="bottone" href="/commesse/${salvata.id}/scheda" target="_blank" rel="noopener">Stampa scheda di produzione</a>
          <a class="bottone" href="/commesse/${salvata.id}/rientro">Rientro scheda</a>` : ''}
        <button class="primario">${salvata ? 'Salva' : 'Crea commessa'}</button>
        ${salvata ? html`<button form="elimina-commessa" class="pericolo" title="Elimina la commessa creata per errore"
          data-conferma="${confermaEliminaCommessa({ numero: salvata.numero, stato: STATI_TESTO[salvata.stato] ?? salvata.stato, tempi: nTempi })}">Elimina</button>` : ''}
      </div>
    </div>
    ${aperte.length ? html`<div class="avviso">Fasi aperte dal telefono e non ancora chiuse: ${aperte.map((f, k) => html`${k ? ', ' : ''}<b>${f.numero}</b> ${f.nome}
      (${f.sigla}, dalle ${f.inizio}${f.data !== partiRoma(new Date()).data ? ` del ${f.data.slice(8, 10)}/${f.data.slice(5, 7)}` : ''}) <a href="/r/chiudi/${f.id}">chiudi</a>`)}</div>` : ''}

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
            <td><input name="scheda[programmi][${k}][top]" value="${st.programmi[k]?.top}" maxlength="80" placeholder="${k === 'progForno' ? (doppia ? 'TOP+BOT STD' : 'TOP STD') : ''}"></td>
            ${doppia ? html`<td><input name="scheda[programmi][${k}][bot]" value="${st.programmi[k]?.bot}" maxlength="80" placeholder="${k === 'progForno' ? 'TOP STD' : ''}"></td>`
              : html`<input type="hidden" name="scheda[programmi][${k}][bot]" value="${st.programmi[k]?.bot}">`}</tr>`)}
          </tbody></table>
        <div class="riga-campi">
          <label>Pasta <input name="scheda[pasta]" value="${st.pasta}" maxlength="80"></label>
          <input type="hidden" name="scheda[forno]" value="${st.forno}">
        </div>
      </fieldset>

      <fieldset class="blocco">
        <legend>Note di montaggio</legend>
        <textarea name="scheda[noteMontaggio]" rows="4">${st.noteMontaggio}</textarea>
        <p class="nota">Programmi, lamine, materiali e note di montaggio si ripropongono alla prossima commessa dello stesso prodotto.</p>
      </fieldset>

      <fieldset class="blocco">
        <legend>Segnalazioni</legend>
        <textarea name="segnalazioni" rows="3" placeholder="Segnalazioni per questa commessa (restano nello storico del prodotto e si stampano anche sulle prossime schede)">${d.segnalazioni}</textarea>
        ${storico.length ? html`<p class="nota">Dallo storico del prodotto (stampate anche sulla scheda):</p>
          <ul class="storico">${storico.map(s => html`<li>${s.testo} <span class="nota">— ${s.origine}${s.numero ? `, commessa ${s.numero}` : ''}, ${data(s.creato_il)}</span></li>`)}</ul>` : ''}
      </fieldset>
    </section>

    <section class="colonna-risultati">
      <h2>Fasi sulla scheda ${salvata ? '' : html`<span class="nota">(anteprima: si aggiornano al salvataggio)</span>`}</h2>
      ${salvata ? await tabellaFasiConTempi(salvata, fasi, prev) : tabellaFasi(fasi)}
    </section>
    </div>
    </form>
    ${salvata ? html`<form id="tempi" method="post" action="/commesse/${salvata.id}/tempi"></form>
      <form id="elimina-commessa" method="post" action="/commesse/${salvata.id}/elimina"></form>` : ''}`,
  }));
}

/** Tabella fasi della commessa salvata: previsto, effettivo già registrato e caselle per aggiungere tempi. */
async function tabellaFasiConTempi(c: any, fasi: FaseScheda[], prev: any): Promise<Raw> {
  const reali = tempiRealiPerFase(await rilevazioniCommessa(c.id));
  const tutte = await fasiConNumeroAttuale(prev);
  const altre = [...Object.keys(reali).filter(k => !fasi.some(f => f.codice === k))];
  const nomeFase = (cod: string) => tutte.find(x => x.codice === cod) ?? { numero: '', nome: cod };
  const tot = (fs: FaseScheda[]) => fs.reduce((a, f) => a + f.cicloSec, 0);
  const totUomo = (fs: FaseScheda[]) => fs.reduce((a, f) => a + f.uomoSec, 0);
  const eff = (cod: string, k: 'cicloSec' | 'uomoSec') => (reali[cod] ? ore(reali[cod][k]) : '');
  const caselle = (cod: string, pers: number) => html`<td class="n"><input form="tempi" name="tempi[${cod}][durata]" class="corto" placeholder="h:mm" inputmode="text"></td>
    <td class="n"><input form="tempi" name="tempi[${cod}][persone]" class="cortissimo" placeholder="${num(pers, 1)}" inputmode="decimal"></td>`;
  return html`<p class="nota">Tempi totali dell'intero lotto in ore:minuti. Per aggiungere un tempo (pre-produzione, tempi dimenticati)
    scrivilo in "Aggiungi" e premi <strong>Aggiungi tempi</strong>: si somma all'effettivo. Per correggere righe già inserite usa
    <a href="/commesse/${c.id}/rientro">Rientro scheda</a>.</p>
  <div class="tabella-scorre"><table class="fasi tempi-commessa">
    <thead><tr><th rowspan="2">N.</th><th rowspan="2">Fase</th><th class="n" colspan="2">Previsto lotto (hh:mm)</th><th class="n" colspan="2">Effettivo lotto (hh:mm)</th><th class="n" colspan="2">Aggiungi</th></tr>
      <tr><th class="n">Ciclo</th><th class="n">Uomo</th><th class="n">Ciclo</th><th class="n">Uomo</th><th class="n">h:mm</th><th class="n">Pers.</th></tr></thead>
    <tbody>${perGruppo(fasi).map(g => html`
      <tr class="riga-gruppo"><td colspan="2">${g.gruppo}</td><td class="n">${ore(tot(g.fasi))}</td><td class="n">${ore(totUomo(g.fasi))}</td><td colspan="4"></td></tr>
      ${g.fasi.map(f => html`<tr><td>${f.numero}</td><td>${f.nome}${f.unaTantum ? html` <span class="etichetta ut">1° lotto</span>` : ''}</td>
        <td class="n">${ore(f.cicloSec)}</td><td class="n">${ore(f.uomoSec)}</td><td class="n"><strong>${eff(f.codice, 'cicloSec')}</strong></td><td class="n">${eff(f.codice, 'uomoSec')}</td>
        ${caselle(f.codice, f.persone)}</tr>`)}`)}
      ${altre.map(k => html`<tr><td>${nomeFase(k).numero}</td><td>${nomeFase(k).nome} <span class="etichetta">non prevista</span></td><td></td><td></td>
        <td class="n"><strong>${eff(k, 'cicloSec')}</strong></td><td class="n">${eff(k, 'uomoSec')}</td>${caselle(k, 1)}</tr>`)}
      <tr><td colspan="6"><select form="tempi" name="nuova[fase]" aria-label="Altra fase"><option value="">+ altra fase (non prevista)…</option>
        ${tutte.filter(f => !fasi.some(x => x.codice === f.codice) && !altre.includes(f.codice)).map(f => html`<option value="${f.codice}">${f.numero} ${f.nome}</option>`)}</select></td>
        <td class="n"><input form="tempi" name="nuova[durata]" class="corto" placeholder="h:mm"></td><td class="n"><input form="tempi" name="nuova[persone]" class="cortissimo" placeholder="1"></td></tr>
      <tr class="riga-gruppo"><td colspan="2">TOTALE</td><td class="n">${ore(tot(fasi))}</td><td class="n">${ore(totUomo(fasi))}</td>
        <td class="n">${ore(Object.values(reali).reduce((a, x) => a + x.cicloSec, 0))}</td><td class="n">${ore(Object.values(reali).reduce((a, x) => a + x.uomoSec, 0))}</td>
        <td colspan="2" class="n"><button form="tempi" class="primario">Aggiungi tempi</button></td></tr>
    </tbody></table></div>`;
}

function perGruppo(fasi: FaseScheda[]) {
  return [...new Set(fasi.map(f => f.gruppo))].map(g => ({ gruppo: g, fasi: fasi.filter(f => f.gruppo === g) }));
}

function tabellaFasi(fasi: FaseScheda[]): Raw {
  if (!fasi.length) return html`<p class="vuoto">Nessuna fase con un tempo nel preventivo.</p>`;
  const tot = (fs: FaseScheda[]) => fs.reduce((a, f) => a + f.cicloSec, 0);
  const totUomo = (fs: FaseScheda[]) => fs.reduce((a, f) => a + f.uomoSec, 0);
  return html`<div class="tabella-scorre"><table class="fasi">
    <thead><tr><th>N.</th><th>Fase</th><th class="n">Pers.</th><th class="n" title="Tempo ciclo previsto per l'intero lotto, ore:minuti">Ciclo lotto (hh:mm)</th><th class="n" title="Tempo uomo previsto per l'intero lotto = ciclo × persone, ore:minuti">Uomo lotto (hh:mm)</th></tr></thead>
    <tbody>${perGruppo(fasi).map(g => html`
      <tr class="riga-gruppo"><td colspan="3">${g.gruppo}</td><td class="n">${ore(tot(g.fasi))}</td><td class="n">${ore(totUomo(g.fasi))}</td></tr>
      ${g.fasi.map(f => html`<tr><td>${f.numero}</td><td>${f.nome}${f.unaTantum ? html` <span class="etichetta">1° lotto</span>` : ''}</td>
        <td class="n">${num(f.persone, 1)}</td><td class="n">${ore(f.cicloSec)}</td><td class="n">${ore(f.uomoSec)}</td></tr>`)}`)}
      <tr class="riga-gruppo"><td colspan="3">TOTALE</td><td class="n">${ore(tot(fasi))}</td><td class="n">${ore(totUomo(fasi))}</td></tr>
    </tbody></table></div>`;
}

// ───────────────────────────── rientro della scheda ─────────────────────────────

type RigaForm = Rilevazione & RigaRientro;

/** Righe del foglio tempi dal form: le righe completamente vuote si ignorano. */
function righeDaForm(b: any, personeFase: Record<string, number>): RigaForm[] {
  const ora = (x: unknown) => { const m = String(x ?? '').trim().replace('.', ':').match(/^(\d{1,2}):(\d{2})$/); return m ? `${m[1].padStart(2, '0')}:${m[2]}` : undefined; };
  const testo = (x: unknown) => String(x ?? '').trim().slice(0, 500);
  const numero = (x: unknown) => { const n = Number(String(x ?? '').replace(',', '.')); return String(x ?? '').trim() !== '' && Number.isFinite(n) ? n : undefined; };
  return Object.values(b?.righe ?? {}).flatMap((r: any) => {
    const fase = testo(r.fase), inizio = ora(r.apertura), fine = ora(r.chiusura);
    const totale = String(r.totale ?? '').trim() ? Math.round(oreDa(r.totale) * 60) : undefined;
    if (!fase && !inizio && !fine && totale == null && !testo(r.operatore) && !testo(r.note)) return [];
    const tipo: 'S' | 'P' = r.tipo === 'P' ? 'P' : 'S';
    return [{
      fase, operatore: testo(r.operatore).toUpperCase(), data: /^\d{4}-\d{2}-\d{2}$/.test(r.data ?? '') ? r.data : undefined, inizio, fine,
      durataMin: inizio && fine ? undefined : totale, totaleScrittoMin: inizio && fine ? totale : undefined,
      persone: numero(r.persone) ?? personeFase[fase] ?? 1, pezzi: numero(r.pezzi), tipo,
      causa: tipo === 'P' ? testo(r.note) : '', note: tipo === 'P' ? '' : testo(r.note), materiale: testo(r.materiale), resp: testo(r.resp),
    }];
  });
}

async function paginaRientro(req: Request, c: any, righe: RigaForm[], esito?: { messaggio?: string; errore?: string }): Promise<string> {
  const i = c.intestazione ?? {};
  const prev = await leggiPreventivo(c.preventivo_id);
  const fasi = await fasiCommessa(c);
  const tutte = await fasiConNumeroAttuale(prev);
  const altre = tutte.filter(f => !fasi.some(x => x.codice === f.codice));
  const nomeFase = (cod: string) => { const f = tutte.find(x => x.codice === cod); return f ? `${f.numero} ${f.nome}` : cod; };
  const controlli = controllaRientro(righe, fasi, nomeFase);
  const reali = tempiRealiPerFase(righe.filter(r => r.fase));
  const voci = vociConsumo(prev, c.quantita);
  const consumi: Record<string, number> = c.consumi ?? {};
  const sped: Spedizione[] = [0, 1, 2].map(k => c.spedizioni?.[k] ?? { qta: '', colli: '', bancali: '', peso: '', dimensione: '' });
  const segnalazioni = await segnalazioniCommessa(c.id);
  const opzioniFase = (sel: string) => html`<option value="">—</option>
    <optgroup label="Fasi della commessa">${fasi.map(f => html`<option value="${f.codice}" ${f.codice === sel ? raw('selected') : ''}>${f.numero} ${f.nome}</option>`)}</optgroup>
    <optgroup label="Altre fasi">${altre.map(f => html`<option value="${f.codice}" ${f.codice === sel ? raw('selected') : ''}>${f.numero} ${f.nome}</option>`)}</optgroup>`;
  const totaleTesto = (r: RigaForm) => { const m = r.inizio && r.fine ? r.totaleScrittoMin : r.durataMin; return m == null ? '' : ore(m * 60); };
  const riga = (r: Partial<RigaForm>, k: number | string, errore = false) => html`
    <tr class="${errore ? 'riga-errore' : ''}">
      <td class="n num-riga">${typeof k === 'number' ? k + 1 : ''}</td>
      <td><select name="righe[${k}][fase]">${opzioniFase(r.fase ?? '')}</select></td>
      <td><input name="righe[${k}][operatore]" value="${r.operatore ?? ''}" class="maiuscolo" list="operatori"></td>
      <td><input type="date" name="righe[${k}][data]" value="${r.data ?? ''}"></td>
      <td><input type="time" name="righe[${k}][apertura]" value="${r.inizio ?? ''}"></td>
      <td><input type="time" name="righe[${k}][chiusura]" value="${r.fine ?? ''}"></td>
      <td><input name="righe[${k}][totale]" value="${r.fase ? totaleTesto(r as RigaForm) : ''}" placeholder="h:mm" class="corto" data-totale></td>
      <td><input name="righe[${k}][persone]" value="${r.persone ?? ''}" inputmode="decimal" class="cortissimo"></td>
      <td><input name="righe[${k}][pezzi]" value="${r.pezzi ?? ''}" inputmode="numeric" class="cortissimo"></td>
      <td><select name="righe[${k}][tipo]"><option ${r.tipo !== 'P' ? raw('selected') : ''}>S</option><option ${r.tipo === 'P' ? raw('selected') : ''}>P</option></select></td>
      <td><input name="righe[${k}][resp]" value="${r.resp ?? ''}" class="corto"></td>
      <td><input name="righe[${k}][materiale]" value="${r.materiale ?? ''}"></td>
      <td><input name="righe[${k}][note]" value="${(r.tipo === 'P' ? r.causa : r.note) ?? ''}"></td>
      <td><button type="button" class="link togli-riga" title="Togli la riga">✕</button></td>
    </tr>`;
  const righeConErrore = new Set(controlli.filter(x => x.livello === 'errore' && x.riga != null).map(x => x.riga));
  const operatori = await caricaOperatori();
  const errori = controlli.filter(x => x.livello === 'errore'), avvisi = controlli.filter(x => x.livello === 'avviso');
  return String(layout({
    titolo: `Rientro ${c.numero}`, utente: req.session.utente, attiva: 'commesse', largo: true, script: 'rientro.js', avviso: esito?.errore,
    contenuto: html`
    <form method="post" action="/commesse/${c.id}/rientro" autocomplete="off" id="rientro">
    <div class="intestazione-pagina">
      <h1>Rientro scheda · <a href="/commesse/${c.id}">${c.numero}</a> <span class="stato ${c.stato}">${STATI_TESTO[c.stato]}</span></h1>
      <div class="azioni">
        ${esito?.messaggio ? html`<span class="nota positivo">${esito.messaggio}</span>` : ''}
        <a class="bottone" href="/commesse/${c.id}/scheda" target="_blank" rel="noopener">Scheda compilata</a>
        <button name="azione" value="salva">Salva</button>
        <button name="azione" value="conferma" class="primario" title="L'ufficio approva tempi e S/P: la commessa diventa rientrata e pronta per l'analisi">Salva e conferma rientro</button>
      </div>
    </div>
    <p class="riepilogo"><strong>${i.cliente}</strong> · ${i.codice}${i.revisione ? ` rev. ${i.revisione}` : ''} · ${i.descrizione} · <strong>${num(c.quantita, 0)} schede</strong>
      ${c.rientrata_il ? html` · <span class="nota">confermata il ${data(c.rientrata_il)}</span>` : ''}</p>

    <div class="griglia-rientro">
    <section>
      <h2>Foglio tempi</h2>
      <p class="nota">Apertura e chiusura, oppure solo il totale. Persone vuote = quelle previste per la fase. Righe P: la causa va nelle note.</p>
      <div class="tabella-scorre"><table class="rientro" id="tabella-righe">
        <thead><tr><th>#</th><th>Fase</th><th>Operatore</th><th>Data</th><th>Apertura</th><th>Chiusura</th><th>Totale</th><th>Pers.</th><th>Pz</th><th>S/P</th><th>Resp</th><th>Materiale impiegato</th><th>Note / causa</th><th></th></tr></thead>
        <tbody>${righe.map((r, k) => riga(r, k, righeConErrore.has(k)))}
          ${Array.from({ length: righe.length ? 2 : 8 }, (_, k) => riga({}, righe.length + k))}</tbody>
      </table></div>
      <template id="modello-riga">${riga({}, '__N__')}</template>
      <datalist id="operatori">${operatori.map(o => html`<option value="${o.sigla}">${o.nome}</option>`)}</datalist>
      <p><button type="button" id="aggiungi-riga">+ Aggiungi riga</button></p>

      <div class="due-colonne">
      <div>
        <h2>Materiale impiegato <span class="nota">(totale del lotto, dal foglio tempi)</span></h2>
        <table class="fasi">
          <thead><tr><th>Voce</th><th class="n">Totale lotto</th><th class="n">Reale</th><th class="n">Previsto</th></tr></thead>
          <tbody>${voci.map(v => {
            const reale = consumoReale(v, consumi[v.codice], c.quantita);
            return html`<tr><td>${v.nome}</td>
              <td class="n"><input name="consumi[${v.codice}]" value="${consumi[v.codice] ?? ''}" inputmode="decimal" class="corto"> <span class="unita">${v.unita}</span></td>
              <td class="n">${reale == null ? '' : `${formatoQuantita(reale)} ${v.unita}${v.perLotto ? '' : '/sch.'}`}</td>
              <td class="n">${v.previstoTesto}${v.previstoTesto && !v.perLotto ? '/sch.' : ''}</td></tr>`;
          })}</tbody></table>
      </div>
      <div>
        <h2>Spedizioni</h2>
        <table class="fasi">
          <thead><tr><th></th><th>Q.tà</th><th>Colli</th><th>Bancali</th><th>Peso</th><th>Dimensione</th></tr></thead>
          <tbody>${sped.map((x, k) => html`<tr><td>${k + 1}</td>${(['qta', 'colli', 'bancali', 'peso', 'dimensione'] as const).map(campo =>
            html`<td><input name="spedizioni[${k}][${campo}]" value="${x[campo] ?? ''}" class="${campo === 'dimensione' ? '' : 'corto'}"></td>`)}</tr>`)}</tbody></table>

        <h2>Segnalazioni dalla produzione</h2>
        ${segnalazioni.length ? html`<ul class="storico">${segnalazioni.map(x => html`<li>${x.fase_codice ? html`<strong>${nomeFase(x.fase_codice)}:</strong> ` : ''}${x.testo}
          <span class="nota">${x.rilevante_prossime ? '· sulle prossime schede' : ''}</span></li>`)}</ul>` : ''}
        <label>Nuova segnalazione <textarea name="segnalazione[testo]" rows="2"></textarea></label>
        <div class="riga-campi">
          <label>Fase <select name="segnalazione[fase]">${opzioniFase('')}</select></label>
          <label class="spunta"><input type="checkbox" name="segnalazione[prossime]" checked> Riporta sulle prossime schede di questo prodotto</label>
        </div>
      </div>
      </div>
    </section>

    <aside class="colonna-controlli">
      <div>
      <h2>Controlli</h2>
      ${!controlli.length ? html`<p class="positivo">Nessuna incongruenza.</p>` : ''}
      ${errori.length ? html`<ul class="controlli errori">${errori.map(x => html`<li>${x.testo}</li>`)}</ul>` : ''}
      ${avvisi.length ? html`<ul class="controlli avvisi">${avvisi.map(x => html`<li>${x.testo}</li>`)}</ul>` : ''}
      ${errori.length ? html`<p class="nota">Con errori il rientro si può salvare ma non confermare.</p>` : ''}
      </div>
      <div>
      <h2>Tempi per fase</h2>
      <table class="fasi">
        <thead><tr><th rowspan="2">Fase</th><th class="n" colspan="2">Previsto lotto (hh:mm)</th><th class="n" colspan="2">Effettivo lotto (hh:mm)</th><th class="n" rowspan="2" title="Scostamento del tempo ciclo">Scost.</th></tr>
          <tr><th class="n">Ciclo</th><th class="n">Uomo</th><th class="n">Ciclo</th><th class="n">Uomo</th></tr></thead>
        <tbody>${fasi.map(f => {
          const re = reali[f.codice];
          const sc = re && f.cicloSec ? Math.round((re.cicloSec / f.cicloSec - 1) * 100) : null;
          return html`<tr class="${re ? '' : 'zero'}"><td>${f.numero} ${f.nome}</td><td class="n">${ore(f.cicloSec)}</td><td class="n">${ore(f.uomoSec)}</td>
            <td class="n">${re ? ore(re.cicloSec) : '—'}</td><td class="n">${re ? ore(re.uomoSec) : ''}</td>
            <td class="n ${sc != null && Math.abs(sc) > SOGLIA_SCOSTAMENTO * 100 ? 'negativo' : ''}">${sc == null ? '' : `${sc > 0 ? '+' : ''}${sc}%`}</td></tr>`;
        })}
        ${Object.keys(reali).filter(k => !fasi.some(f => f.codice === k)).map(k => html`<tr><td>${nomeFase(k)} <span class="etichetta">non prevista</span></td><td class="n">—</td><td class="n">—</td>
          <td class="n">${ore(reali[k].cicloSec)}</td><td class="n">${ore(reali[k].uomoSec)}</td><td></td></tr>`)}</tbody>
      </table>
      </div>
    </aside>
    </div>
    </form>`,
  }));
}

// ───────────────────────────── stampa A4 ─────────────────────────────

const RIGHE_RILEVAZIONE = 14;
/** Segno prestampato in grigio al centro delle celle del foglio tempi: FASE e OPERATORE "+" (più fasi o più persone),
 *  DATA "/" (solo giorno e mese), APERTURA e CHIUSURA ":" (ore e minuti). */
const SEGNO_CELLA: Record<number, string> = { 0: '+', 1: '+', 2: '/', 3: ':', 4: ':' };

/** Fasi del catalogo del preventivo, con il numero di oggi (la numerazione può essere cambiata dopo il preventivo). */
async function fasiConNumeroAttuale(prev: any): Promise<{ codice: string; numero: string; nome: string }[]> {
  const numeri = await numeriFasi();
  return (prev?.catalogo?.fasi ?? []).map((f: any) => ({ codice: f.codice, nome: f.nome, numero: numeri.get(f.codice) ?? f.numero }));
}

function schedaStampa(c: any, prev: any, fasi: FaseScheda[], storico: { testo: string; numero: string | null }[], qr: Raw,
  reali: Record<string, { cicloSec: number; uomoSec: number }>, nomeFase: (cod: string) => { numero: string; nome: string }, operatori: { sigla: string; nome: string }[] = []): Raw {
  const i = c.intestazione ?? {};
  const st: SchedaTecnica = schedaTecnica(c.scheda_tecnica);
  const doppia = !!prev?.parametri?.doppiaFaccia;
  const bot = (v: string) => (doppia ? v : '—');
  const quantita = html`${num(c.quantita, 0)} / ${num(c.n_pannelli ?? c.quantita, 0)}`;
  // nomi lunghi dei programmi: carattere più piccolo, così restano su una riga accanto a TOP/BOT
  const misura = (t: string) => (t.length > 26 ? 'xs' : t.length > 21 ? 's' : t.length > 17 ? 'm' : '');
  const lato = (nome: string, t: string) => html`<div class="tb"><span>${nome}:</span><b class="${misura(t)}">${t}</b></div>`;
  const prog = (k: string) => html`${lato('TOP', st.programmi[k]?.top ?? '')}${lato('BOT', bot(st.programmi[k]?.bot ?? ''))}`;
  const forno = programmaForno(st, doppia);
  const cella = (etichetta: string, contenuto: unknown, cls = '', colonne = 1) => html`<td class="${cls}" colspan="${colonne}"><div class="etic">${etichetta}</div><div class="val">${contenuto}</div></td>`;
  const testata = html`
    <div class="testata-stampa">
      <img src="/static/logo-casteltech.png" alt="Casteltech" class="logo">
      <div class="titolo-stampa">SCHEDA DI PRODUZIONE<br><span>Commessa ${c.numero}</span></div>
      <div class="qr">${qr}<div>${c.numero}</div></div>
    </div>`;
  const tot = (fs: FaseScheda[]) => fs.reduce((a, f) => a + f.cicloSec, 0);
  const totReale = (codici: string[]) => codici.reduce((a, k) => a + (reali[k]?.cicloSec ?? 0), 0);
  const totUomo = (fs: FaseScheda[]) => fs.reduce((a, f) => a + f.uomoSec, 0);
  const totRealeUomo = (codici: string[]) => codici.reduce((a, k) => a + (reali[k]?.uomoSec ?? 0), 0);
  const haReali = Object.keys(reali).length > 0;
  const voci = vociConsumo(prev, c.quantita);
  const colonne = [...new Set(voci.map(v => v.colonna))];
  const consumi: Record<string, number> = c.consumi ?? {};
  const testoConsumo = (v: VoceConsumo) => { const r = consumoReale(v, consumi[v.codice], c.quantita); return r == null ? '' : `${formatoQuantita(r)} ${v.unita}`; };
  const nonPreviste = Object.keys(reali).filter(k => !fasi.some(f => f.codice === k));
  const sped: Partial<Spedizione>[] = [0, 1, 2].map(k => c.spedizioni?.[k] ?? {});
  const segnalazioni = storico.map(s => s.testo + (s.numero && s.numero !== c.numero ? ` (comm. ${s.numero})` : ''));
  return html`<!doctype html>
<html lang="it"><head><meta charset="utf-8"><title>Scheda ${c.numero} · ${i.codice}</title>
<link rel="icon" href="/static/favicon.svg"><link rel="stylesheet" href="/static/stampa.css?v=${VERSIONE}"></head>
<body>
<div class="barra-stampa"><button id="stampa">Stampa / salva PDF</button> <a href="/commesse/${c.id}">← torna alla commessa</a>
  ${haReali ? html`<span>Tempi effettivi e consumi compilati dal rientro${c.rientrata_il ? ` confermato il ${data(c.rientrata_il)}` : ' (non ancora confermato)'}</span>` : ''}</div>

<section class="pagina">
  ${testata}
  <table class="griglia"><colgroup><col class="c1"><col class="c2"><col class="c3"><col class="c4"></colgroup>
    <tr>${cella('CODICE', i.codice)}${cella('DESCRIZIONE', i.descrizione)}${cella('REV.', i.revisione)}${cella('NR. COMMESSA', c.numero, 'forte')}</tr>
    <tr>${cella('CLIENTE', i.cliente)}${cella('REFERENTE CLIENTE', c.referente_cliente)}${cella('NR. ORDINE CLIENTE', c.ordine_cliente)}${cella("QTA' / PANN.", quantita, 'forte')}</tr>
    <tr>${cella('DATA ORDINE', data(c.data_ordine))}${cella('CONSEGNA', data(c.data_consegna))}${cella('PREVENTIVO', c.numero_preventivo)}${cella('LOTTO', c.primo_lotto ? 'PRIMO LOTTO' : 'RIPETIZIONE')}</tr>
    <tr>${cella('PROG. ARMADIO', prog('progArmadio'))}${cella('PROG. SERIGRAFIA', prog('progSerigrafia'))}${cella('LAMINA', prog('lamina'))}${cella('PASTA', st.pasta)}</tr>
    <tr>${cella('PROG. P&P FOX', prog('progPePFox'))}${cella('PROG. P&P IPULSE', prog('progPePIpulse'))}${cella('PROG. AOI', prog('progAOI'))}${cella('PROG. FORNO', html`${lato('TOP', forno.top)}${lato('BOT', doppia ? forno.bot : '—')}`)}</tr>
  </table>
  <div class="riquadro note"><div class="etic">NOTE DI MONTAGGIO</div><div class="testo">${st.noteMontaggio}</div></div>
  <div class="riquadro segnalazioni"><div class="etic">SEGNALAZIONI</div>
    ${segnalazioni.length ? html`<ul>${segnalazioni.map(s => html`<li>${s}</li>`)}</ul>` : ''}</div>
  <table class="griglia spedizioni"><tr>${sped.map((x, k) => html`<td>
    <div class="etic centro"><u>SPEDIZIONE ${k + 1}</u></div>
    <div class="campi3"><span>QTA: <b>${x.qta}</b></span><span>COLLI: <b>${x.colli}</b></span><span>BANCALI: <b>${x.bancali}</b></span></div>
    <div class="campi2"><span>PESO: <b>${x.peso}</b></span><span>DIMENSIONE: <b>${x.dimensione}</b></span></div></td>`)}</tr></table>

  <h3 class="gruppo">MATERIALE DI CONSUMO <span>quantità a scheda (conformal coating: bombolette sul lotto)</span></h3>
  <table class="consumo"><tr>${colonne.map(col => html`<th>${col.toUpperCase()}</th>`)}</tr>
    <tr>${colonne.map(col => {
      const dellaColonna = voci.filter(v => v.colonna === col);
      const previsto = dellaColonna.map(v => v.previstoTesto).filter(Boolean).join(' + ');
      const consuntivo = dellaColonna.map(testoConsumo).filter(Boolean).join(' + ');
      return html`<td><div class="cons"><span>Da preventivo:</span> <b>${previsto || '—'}</b></div>
        <div class="cons"><span>A consuntivo:</span> <b>${consuntivo}</b></div></td>`;
    })}</tr></table>

  <h3 class="gruppo">FASI DI LAVORAZIONE <span>tempi totali per l'intero lotto di ${num(c.quantita, 0)} schede, in ore:minuti (hh:mm)</span></h3>
  <table class="fasi-stampa">
    <thead><tr><th class="nr" rowspan="2">NR</th><th rowspan="2">DESCRIZIONE FASE</th><th class="pers" rowspan="2">PERS.</th><th colspan="2">TEMPO PREVISTO LOTTO (hh:mm)</th><th colspan="2" class="eff">TEMPO EFFETTIVO LOTTO (hh:mm)</th></tr>
      <tr><th class="t">CICLO</th><th class="t">UOMO</th><th class="t eff">CICLO</th><th class="t eff">UOMO</th></tr></thead>
    <tbody>${perGruppo(fasi).map(g => html`
      <tr class="riga-gruppo"><td colspan="3">${g.gruppo}</td><td class="t">${ore(tot(g.fasi))}</td><td class="t">${ore(totUomo(g.fasi))}</td>
        <td class="t eff">${haReali ? ore(totReale(g.fasi.map(f => f.codice))) : ''}</td><td class="t eff">${haReali ? ore(totRealeUomo(g.fasi.map(f => f.codice))) : ''}</td></tr>
      ${g.fasi.map(f => html`<tr><td class="nr">${f.numero}</td><td>${f.nome}</td><td class="pers">${num(f.persone, 1)}</td>
        <td class="t">${ore(f.cicloSec)}</td><td class="t">${ore(f.uomoSec)}</td>
        <td class="t eff">${reali[f.codice] ? html`<b>${ore(reali[f.codice].cicloSec)}</b>` : ''}</td>
        <td class="t eff">${reali[f.codice] ? html`<b>${ore(reali[f.codice].uomoSec)}</b>` : ''}</td></tr>`)}`)}
    ${nonPreviste.length ? html`<tr class="riga-gruppo"><td colspan="7">ALTRE FASI (non previste)</td></tr>
      ${nonPreviste.map(k => html`<tr><td class="nr">${nomeFase(k).numero}</td><td>${nomeFase(k).nome}</td><td class="pers"></td>
        <td class="t"></td><td class="t"></td><td class="t eff"><b>${ore(reali[k].cicloSec)}</b></td><td class="t eff"><b>${ore(reali[k].uomoSec)}</b></td></tr>`)}` : ''}
      <tr class="riga-totale"><td colspan="3">TOTALE</td><td class="t">${ore(tot(fasi))}</td><td class="t">${ore(totUomo(fasi))}</td>
        <td class="t eff">${haReali ? ore(totReale(Object.keys(reali))) : ''}</td><td class="t eff">${haReali ? ore(totRealeUomo(Object.keys(reali))) : ''}</td></tr>
    </tbody>
  </table>
</section>

${[1, 2].map(n => html`
<section class="pagina rilevazioni">
  ${testata}
  <table class="griglia"><tr>${cella('CLIENTE', i.cliente)}${cella('CODICE / DESC.', html`${i.codice} — ${i.descrizione}`, 'larga')}${cella('NR. COMMESSA', c.numero, 'forte')}${cella('QTA', num(c.quantita, 0), 'forte')}</tr></table>
  ${n === 1 ? html`<table class="materiale-impiegato"><tr><th>MATERIALE IMPIEGATO<br><small>totale del lotto</small></th>
    ${colonne.map(col => html`<td><span>${col}</span></td>`)}</tr></table>` : ''}
  <table class="tabella-rilevazioni">
    <thead><tr><th>FASE</th><th>OPERATORE</th><th>DATA</th><th>APERTURA TEMPO</th><th>CHIUSURA TEMPO</th><th>TOTALE ORE</th><th>Nr. PERS FASE</th><th>PZ</th><th>S / P</th><th>RESP</th><th>NOTE</th></tr></thead>
    <tbody>${Array.from({ length: n === 1 ? RIGHE_RILEVAZIONE - 2 : RIGHE_RILEVAZIONE }, () => html`<tr>${Array.from({ length: 11 }, (_, i) => SEGNO_CELLA[i] ? html`<td class="segno">${SEGNO_CELLA[i]}</td>` : html`<td></td>`)}</tr>`)}</tbody>
  </table>
  <p class="legenda"><b>TEMPO</b>: apertura e chiusura oppure solo il totale ore · <b>DATA</b>: giorno/mese ·
    <b>FASE</b>: numero (più fasi insieme 10+12) · <b>OPERATORE</b>: sigla (più persone MM+NG) · <b>NR. PERS FASE</b>: persone sulla fase ·
    <b>S</b>: tempo standard · <b>P</b>: problema contingente (causa nelle note) · <b>MATERIALE IMPIEGATO</b> (foglio 1): totale usato nel lotto ·
    <b>OPERATORI</b>: ${operatori.length ? operatori.map((o, k) => html`${k ? ', ' : ''}<b>${o.sigla}</b> ${o.nome}`) : 'sigle da inserire in Impostazioni → Operatori'}</p>
  <p class="numero-foglio">Foglio tempi ${n} / 2</p>
</section>`)}
<script src="/static/stampa.js?v=${VERSIONE}" defer></script>
</body></html>`;
}
