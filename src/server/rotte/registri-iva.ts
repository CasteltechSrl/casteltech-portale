/**
 * Amministrazione → Registri IVA e Controllo VIES (Adriano 31/10/2026).
 * Registri: periodo (mese, trimestre, anno), riepilogo per aliquota/natura, liquidazione indicativa, controlli, elenco dei documenti;
 * Excel e pacchetto zip (Excel + XML) per il commercialista; stampa dal browser.
 * VIES: clienti e fornitori con partita IVA di un altro paese UE, ultimo controllo, "Controlla" uno o tutti.
 */
import { Router, type Request } from 'express';
import { q1 } from '../db.js';
import { layout } from '../views/layout.js';
import { html, data, euro, raw, type Raw } from '../views/html.js';
import { menuAmministrazione } from './cruscotto-amministrazione.js';
import { CODICI_PERIODO, MINIMO_VERSAMENTO_IVA, NOMI_REGISTRO, meseDaLiquidare, nomeVoce, periodoDa, segno, type Registro, type RigaRegistro } from '../../engine/registri-iva.js';
import { caricaLiquidazioniMensili, caricaRegistri, excelRegistri, nomeFileRegistri, salvaCreditoIvaIniziale, scriviPacchetto } from '../registri-iva-servizio.js';
import { controllaVies, soggettiUe, ultimiControlli, ultimoControllo } from '../vies.js';
import { GIORNI_VALIDITA_VIES, partitaIvaPerVies, statoControllo } from '../../engine/vies.js';

const oggiRoma = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
const pagina = (req: Request, titolo: string, contenuto: Raw, avviso?: string, script?: string) =>
  String(layout({ titolo, utente: req.session.utente, attiva: 'amministrazione', contenuto, avviso, script, largo: true }));
const msg = (req: Request) => (req.query.msg ? String(req.query.msg) : undefined);
const periodoRichiesta = (req: Request) => {
  const oggi = oggiRoma();
  return periodoDa(Number(req.query.anno) || meseDaLiquidare(oggi).anno, req.query.periodo ? String(req.query.periodo) : undefined, oggi);
};

function tabellaRegistro(registro: Registro, righe: RigaRegistro[]): Raw {
  if (!righe.length) return html`<p class="vuoto">Nessun documento nel periodo.</p>`;
  return html`<div class="tabella-scorre"><table class="elenco">
    <thead><tr>${registro === 'acquisti' ? html`<th>Prot.</th>` : ''}<th>Data</th><th>Numero</th><th>Tipo</th><th>${registro === 'vendite' ? 'Cliente' : 'Fornitore'}</th>
      <th>P.IVA</th><th>IVA</th><th class="num">Imponibile</th><th class="num">Imposta</th><th class="num">Totale</th></tr></thead>
    <tbody>${righe.map(r => {
      const s = segno(r.tipo);
      return html`<tr class="${r.differenza ? 'scaduta' : ''}">
        ${registro === 'acquisti' ? html`<td>${r.protocollo}</td>` : ''}
        <td>${data(r.data)}</td><td><a href="${r.link}">${r.numero}</a>${r.origine === 'fic' ? html` <span class="etichetta">FIC</span>` : ''}</td>
        <td>${r.tipo === 'nota_credito' ? 'Nota di credito' : r.tipoSdi ?? (r.tipo === 'autofattura' ? 'Autofattura' : 'Fattura')}</td>
        <td>${r.nome}</td><td>${r.paese && r.paese !== 'IT' && !r.partitaIva.startsWith(r.paese) ? `${r.paese} ` : ''}${r.partitaIva}</td>
        <td>${r.voci.map((v, i) => html`${i ? html`<br>` : ''}${nomeVoce(v)}`)}</td>
        <td class="num">${r.voci.map((v, i) => html`${i ? html`<br>` : ''}${euro(s * v.imponibile)}`)}</td>
        <td class="num">${r.voci.map((v, i) => html`${i ? html`<br>` : ''}${euro(s * v.imposta)}`)}</td>
        <td class="num">${euro(s * r.totale)}</td></tr>`;
    })}</tbody></table></div>`;
}

export function rotteRegistriIva() {
  const r = Router();

  r.get('/', async (req, res) => {
    const p = periodoRichiesta(req);
    const d = await caricaRegistri(p);
    const mensili = await caricaLiquidazioniMensili(p, d);
    const lm = mensili?.[mensili.length - 1];
    const l = d.liquidazione;
    const anni = Array.from({ length: Number(oggiRoma().slice(0, 4)) - 2024 }, (_, i) => Number(oggiRoma().slice(0, 4)) - i);
    const qs = `anno=${p.anno}&periodo=${p.codice}`;
    res.send(pagina(req, `Registri IVA · ${p.nome}`, html`
      <div class="intestazione-pagina"><h1>Registri IVA · ${p.nome}</h1>
        <div class="azioni non-stampare">
          <a class="bottone" href="/amministrazione/registri/excel?${qs}">Excel dei registri</a>
          <a class="bottone primario" href="/amministrazione/registri/pacchetto?${qs}">Pacchetto per il commercialista (zip)</a>
          <button type="button" id="stampa">Stampa</button>
        </div></div>
      <div class="non-stampare">${menuAmministrazione('registri')}</div>
      <form class="cerca non-stampare" method="get">
        <select name="anno">${anni.map(a => html`<option ${a === p.anno ? raw('selected') : ''}>${a}</option>`)}</select>
        <select name="periodo">${CODICI_PERIODO.map(([c, n]) => html`<option value="${c}" ${c === p.codice ? raw('selected') : ''}>${n}</option>`)}</select>
        <button>Mostra</button>
      </form>
      <p class="nota">Dal ${data(p.dal)} al ${data(p.al)}. Entrano le fatture e le note di credito emesse (anche lo storico di Fatture in Cloud), le autofatture
        e le fatture dei fornitori con data nel periodo. Bozze, documenti annullati e scartati dallo SdI non entrano. Note di credito in negativo.</p>
      <div class="cifre">
        <div class="cifra"><span>IVA a debito</span><b>${euro(l.debito)}</b><small>vendite ${euro(l.debitoVendite)} · autofatture ${euro(l.debitoAutofatture)}${l.splitPayment ? html` · split payment ${euro(l.splitPayment)} non a debito` : ''}</small></div>
        <div class="cifra"><span>IVA a credito</span><b>${euro(l.credito)}</b><small>acquisti ${euro(l.creditoAcquisti)} · autofatture ${euro(l.creditoAutofatture)}</small></div>
        ${lm ? html`<div class="cifra"><span>${lm.daVersare ? html`Da versare entro il ${data(lm.scadenza)}` : lm.creditoRiportato ? 'Credito per il mese dopo' : 'Niente da versare'}</span>
            <b class="${lm.daVersare ? 'negativo' : ''}">${euro(lm.daVersare || lm.creditoRiportato || lm.rinviata)}</b>
            <small>${lm.daVersare ? html`F24, codice tributo ${lm.codiceTributo}` : lm.rinviata ? html`sotto ${euro(MINIMO_VERSAMENTO_IVA)}: si somma al mese dopo` : html`saldo del mese ${euro(lm.saldo)}`}${lm.riporto
              ? html` · ${lm.riporto < 0 ? 'credito' : 'rinviata'} dal mese prima ${euro(Math.abs(lm.riporto))}` : ''}</small></div>`
          : html`<div class="cifra"><span>${l.saldo >= 0 ? 'Saldo IVA del periodo' : 'Credito IVA del periodo'}</span><b class="${l.saldo > 0 ? 'negativo' : ''}">${euro(Math.abs(l.saldo))}</b>
            <small>la liquidazione è mensile: scegli un mese per il versamento</small></div>`}
      </div>
      ${mensili ? html`<details class="non-stampare"${mensili.length > 1 ? '' : raw(' open')}><summary>Liquidazioni mensili ${p.anno} (da gennaio)</summary>
        <div class="tabella-scorre"><table class="elenco">
          <thead><tr><th>Mese</th><th class="num">A debito</th><th class="num">A credito</th><th class="num">Dal mese prima</th><th class="num">Da versare</th><th>Entro il</th><th>Codice</th><th class="num">Al mese dopo</th></tr></thead>
          <tbody>${mensili.map(m => html`<tr><td><a href="/amministrazione/registri?anno=${p.anno}&periodo=M${String(m.mese).padStart(2, '0')}">${m.nome}</a></td>
            <td class="num">${euro(m.debito)}</td><td class="num">${euro(m.credito)}</td><td class="num">${m.riporto < 0 ? html`credito ${euro(-m.riporto)}` : m.riporto ? html`rinviata ${euro(m.riporto)}` : ''}</td>
            <td class="num">${m.daVersare ? html`<strong>${euro(m.daVersare)}</strong>` : ''}</td><td>${m.daVersare ? data(m.scadenza) : ''}</td><td>${m.daVersare ? m.codiceTributo : ''}</td>
            <td class="num">${m.creditoRiportato ? html`credito ${euro(m.creditoRiportato)}` : m.rinviata ? html`rinviata ${euro(m.rinviata)}` : ''}</td></tr>`)}</tbody></table></div>
        <form method="post" action="/amministrazione/registri/credito-iniziale" class="cerca">
          <input type="hidden" name="anno" value="${p.anno}"><input type="hidden" name="periodo" value="${p.codice}">
          <label>Credito IVA dal ${p.anno - 1} (dalla dichiarazione IVA) <input name="credito" inputmode="decimal" value="${mensili[0].riporto ? String(-mensili[0].riporto).replace('.', ',') : ''}" size="10"></label>
          <button>Salva</button></form>
        <p class="nota">Il credito passa da un mese all'altro; sotto ${euro(MINIMO_VERSAMENTO_IVA)} non si versa e si somma al mese dopo.
          Acconto di dicembre (entro il 27/12, codice 6013) e compensazioni nell'F24 restano al commercialista.</p></details>` : ''}
      ${d.controlli.length ? html`<h2>Da controllare (${d.controlli.length})</h2><ul class="segnalazioni">${d.controlli.map(c => html`<li>${c}</li>`)}</ul>` : ''}
      <h2>Riepilogo per aliquota</h2>
      <div class="tabella-scorre"><table class="elenco">
        <thead><tr><th>Registro</th><th>Aliquota / natura</th><th class="num">Documenti</th><th class="num">Imponibile</th><th class="num">Imposta</th></tr></thead>
        <tbody>${(['vendite', 'acquisti', 'autofatture'] as Registro[]).map(reg => {
          const rr = d.riepilogo[reg];
          return html`${rr.voci.map((v, i) => html`<tr><td>${i ? '' : NOMI_REGISTRO[reg]}</td><td>${nomeVoce(v)}</td><td class="num">${v.documenti}</td>
              <td class="num">${euro(v.imponibile)}</td><td class="num">${euro(v.imposta)}</td></tr>`)}
            <tr class="totale-riga"><td>${rr.voci.length ? '' : NOMI_REGISTRO[reg]}</td><td><strong>Totale</strong></td><td class="num"><strong>${rr.documenti}</strong></td>
              <td class="num"><strong>${euro(rr.imponibile)}</strong></td><td class="num"><strong>${euro(rr.imposta)}</strong></td></tr>`;
        })}</tbody></table></div>
      ${(['vendite', 'acquisti', 'autofatture'] as Registro[]).map(reg => html`
        <h2>${NOMI_REGISTRO[reg]} · ${d[reg].length}</h2>
        ${reg === 'acquisti' ? html`<p class="nota">Protocollo: progressivo nell'anno in ordine di data del documento (calcolato, non fisso).</p>` : ''}
        ${reg === 'autofatture' ? html`<p class="nota">L'IVA delle autofatture (TD16–TD19) va sia a debito sia a credito: nella liquidazione si annulla.</p>` : ''}
        ${tabellaRegistro(reg, d[reg])}`)}
      <p class="nota">I numeri sono quelli del portale; la liquidazione e i registri ufficiali li controlla il commercialista. Il pacchetto zip contiene l'Excel
        e i file XML delle fatture emesse e ricevute del periodo.</p>`, msg(req), 'stampa.js'));
  });

  r.post('/credito-iniziale', async (req, res) => {
    const anno = Number(req.body?.anno), credito = Number(String(req.body?.credito ?? '').replace(/\./g, '').replace(',', '.')) || 0;
    if (!anno) return res.redirect('/amministrazione/registri');
    await salvaCreditoIvaIniziale(anno, credito);
    res.redirect(`/amministrazione/registri?anno=${anno}&periodo=${encodeURIComponent(String(req.body?.periodo ?? 'M01'))}&msg=${encodeURIComponent(`Credito IVA dal ${anno - 1} salvato.`)}`);
  });

  r.get('/excel', async (req, res) => {
    const p = periodoRichiesta(req);
    const d = await caricaRegistri(p);
    const azienda = (await q1(`SELECT valore FROM impostazioni WHERE chiave = 'azienda'`))?.valore ?? {};
    const file = await excelRegistri(d, azienda, await caricaLiquidazioniMensili(p, d));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nomeFileRegistri(p, 'xlsx')}"`);
    res.send(file);
  });

  r.get('/pacchetto', async (req, res) => {
    const p = periodoRichiesta(req);
    const d = await caricaRegistri(p);
    const azienda = (await q1(`SELECT valore FROM impostazioni WHERE chiave = 'azienda'`))?.valore ?? {};
    await scriviPacchetto(res, d, await excelRegistri(d, azienda, await caricaLiquidazioniMensili(p, d)));
  });

  return r;
}

// ───────────────────────────── VIES ─────────────────────────────

/** Riquadro VIES per la pagina di una fattura a un cliente UE (cliente con P.IVA di un altro paese dell'Unione). */
export async function riquadroVies(piva: string | null | undefined, paese: string | null | undefined, ritorno: string): Promise<Raw> {
  if (!partitaIvaPerVies(piva, paese)) return html``;
  const c = await ultimoControllo(piva, paese);
  const s = statoControllo(c);
  const classe = s.stato === 'valida' ? 'avviso info' : 'avviso';
  return html`<div class="${classe}">
    <strong>VIES:</strong> ${piva} ${s.stato === 'mai' ? html`non ancora controllata.` : html`${s.testo}${c ? html` (controllo del ${data(c.controllato_il)}${c.consultazione ? html`, consultazione ${c.consultazione}` : ''})` : ''}.`}
    ${s.stato === 'non_valida' ? html` Senza iscrizione al VIES la fattura non può essere non imponibile UE: va con l'IVA italiana.` : ''}
    ${c?.errore && c.valida == null ? html` ${c.errore}` : ''}
    <form method="post" action="/amministrazione/vies/controlla" class="inline">
      <input type="hidden" name="partita_iva" value="${piva ?? ''}"><input type="hidden" name="paese" value="${paese ?? ''}"><input type="hidden" name="ritorno" value="${ritorno}">
      <button class="link">Controlla adesso</button></form>
  </div>`;
}

export function rotteVies() {
  const r = Router();

  r.get('/', async (req, res) => {
    const [soggetti, controlli] = await Promise.all([soggettiUe(), ultimiControlli()]);
    const conStato = soggetti.map(s => ({ ...s, c: controlli.get(s.chiave) ?? null, s: statoControllo(controlli.get(s.chiave)) }));
    const ordine = { non_valida: 0, errore: 1, mai: 2, scaduta: 3, valida: 4 };
    conStato.sort((a, b) => ordine[a.s.stato] - ordine[b.s.stato] || a.nome.localeCompare(b.nome));
    const daFare = conStato.filter(x => x.s.stato !== 'valida').length;
    res.send(pagina(req, 'Controllo VIES', html`
      <div class="intestazione-pagina"><h1>Controllo VIES delle partite IVA europee</h1>
        ${daFare ? html`<div class="azioni"><form method="post" action="/amministrazione/vies/tutti" class="inline">
          <button class="primario">${daFare === 1 ? 'Controlla quella da controllare' : `Controlla le ${daFare} da controllare`}</button></form></div>` : ''}</div>
      ${menuAmministrazione('vies')}
      <p class="nota">Per fatturare senza IVA a un cliente di un altro paese UE (cessioni art. 41, servizi art. 7-ter) il cliente deve essere iscritto al VIES.
        Il controllo si fa sul sito della Commissione europea con la nostra partita IVA: il numero di consultazione è la prova da conservare (resta qui).
        Un controllo valido più vecchio di ${GIORNI_VALIDITA_VIES} giorni va rifatto. Le partite IVA italiane non passano dal VIES.</p>
      <form method="post" action="/amministrazione/vies/controlla" class="cerca">
        <input name="partita_iva" placeholder="Partita IVA con il prefisso del paese (es. DE811193231)" required>
        <input type="hidden" name="ritorno" value="/amministrazione/vies">
        <button>Controlla</button>
      </form>
      ${conStato.length ? html`<div class="tabella-scorre"><table class="elenco">
        <thead><tr><th>Nome</th><th>Anagrafica</th><th>Partita IVA</th><th>Esito</th><th>Controllo</th><th>Nome nel VIES</th><th></th></tr></thead>
        <tbody>${conStato.map(x => html`<tr class="${x.s.stato === 'non_valida' ? 'scaduta' : ''}">
          <td><a href="${x.tipo === 'cliente' ? '/anagrafiche/clienti' : `/anagrafiche/fornitori/${x.id}`}">${x.nome}</a></td><td>${x.tipo}</td><td>${x.partita_iva}</td>
          <td><span class="stato ${x.s.stato === 'valida' ? 'doc-consegnato' : x.s.stato === 'non_valida' ? 'doc-scartato' : 'doc-bozza'}">${x.s.testo}</span>
            ${x.c?.errore ? html`<br><span class="nota">${x.c.errore}</span>` : ''}</td>
          <td>${x.c ? html`${data(x.c.controllato_il)}${x.c.consultazione ? html`<br><span class="nota">${x.c.consultazione}</span>` : ''}` : ''}</td>
          <td>${x.c?.nome ?? ''}</td>
          <td><form method="post" action="/amministrazione/vies/controlla" class="inline">
            <input type="hidden" name="partita_iva" value="${x.partita_iva}"><input type="hidden" name="paese" value="${x.paese}">
            <input type="hidden" name="ritorno" value="/amministrazione/vies"><button class="link">Controlla</button></form></td>
        </tr>`)}</tbody></table></div>` : html`<p class="vuoto">Nessun cliente o fornitore con partita IVA di un altro paese UE.</p>`}`, msg(req)));
  });

  r.post('/controlla', async (req, res) => {
    const ritorno = /^\/[a-z0-9/_-]*$/i.test(String(req.body.ritorno ?? '')) ? String(req.body.ritorno) : '/amministrazione/vies';
    let testo: string;
    try {
      const c = await controllaVies(String(req.body.partita_iva ?? ''), req.body.paese ? String(req.body.paese) : null, req.session.utente?.id ?? null);
      testo = c.valida === true ? `${c.paese}${c.numero}: VALIDA nel VIES${c.nome ? ` (${c.nome})` : ''}${c.consultazione ? `, consultazione ${c.consultazione}` : ''}.`
        : c.valida === false ? `${c.paese}${c.numero}: NON valida nel VIES.` : `${c.paese}${c.numero}: ${c.errore}`;
    } catch (e: any) { testo = e.message; }
    res.redirect(`${ritorno}${ritorno.includes('?') ? '&' : '?'}msg=${encodeURIComponent(testo)}`);
  });

  // tutte quelle da controllare, una dopo l'altra (il VIES non vuole richieste in parallelo), al massimo 40 per volta
  r.post('/tutti', async (req, res) => {
    const [soggetti, controlli] = await Promise.all([soggettiUe(), ultimiControlli()]);
    const daFare = [...new Map(soggetti.filter(s => statoControllo(controlli.get(s.chiave)).stato !== 'valida').map(s => [s.chiave, s])).values()].slice(0, 40);
    let valide = 0, nonValide = 0, errori = 0;
    for (const s of daFare) {
      const c = await controllaVies(s.partita_iva, s.paese, req.session.utente?.id ?? null).catch(() => null);
      if (c?.valida === true) valide++; else if (c?.valida === false) nonValide++; else errori++;
      await new Promise(ok => setTimeout(ok, 700));
    }
    res.redirect(`/amministrazione/vies?msg=${encodeURIComponent(`Controllate ${daFare.length}: valide ${valide}, non valide ${nonValide}${errori ? `, non verificabili ora ${errori} (riprova più tardi)` : ''}.`)}`);
  });

  return r;
}
