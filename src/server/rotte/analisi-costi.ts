/**
 * Amministrazione → Analisi → Costi per categoria (Adriano 6/11/2026): ogni riga delle fatture dei fornitori con le SUE categorie
 * (materiale da rivendere, consumo, lavorazioni esterne, spese di gestione per tipo), anno per anno; comprato contro rivenduto;
 * riassunto, opinione e proposte. Regole in `engine/analisi-costi.ts` e `engine/categorie-acquisti.ts`, letture in `analisi-costi-servizio.ts`.
 */
import { Router, type Request } from 'express';
import { layout } from '../views/layout.js';
import { html, num, type Raw } from '../views/html.js';
import { menuAmministrazione } from './cruscotto-amministrazione.js';
import { tastiAnalisi } from './analisi.js';
import { excelSemplice, inviaExcel, nomeExcel } from '../excel.js';
import { eUfficio } from '../../engine/ruoli.js';
import { CATEGORIE, NOMI_MACRO, SPIEGAZIONE_MACRO, categoria as categoriaDaCodice, type Macro } from '../../engine/categorie-acquisti.js';
import {
  classificaCosti, confrontoRivendita, costiPerAnno, fornitoriDaControllare, riassuntoCosti, type CostiPerAnno, type Livello, type RigaClassificata, type RivenditaAnno,
} from '../../engine/analisi-costi.js';
import { copertureRighe, lamineVendute, materialeDeiPreventivi, regoleCategorie, ricaviPerAnno, righeCosti, salvaRegola, venditePerProdotto } from '../analisi-costi-servizio.js';

const oggiRoma = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
const euro = (n: number | null | undefined) => (n == null ? '—' : `${num(n, 0)} €`);
const pct = (v: number | null | undefined, segno = true) => (v == null ? '—' : `${segno && v > 0 ? '+' : ''}${num(v, 0)}%`);
const ANNO_MINIMO = 2019;
const ICONE: Record<Livello, string> = { critico: '●', attenzione: '●', bene: '●', nota: '○' };
const linkFornitore = (chiave: string) => `/amministrazione/analisi/fornitore?f=${encodeURIComponent(chiave)}`;
const linkRighe = (anno: number, categoria: string, f?: string) => `/amministrazione/analisi/costi/righe?anno=${anno}&categoria=${encodeURIComponent(categoria)}${f ? `&f=${encodeURIComponent(f)}` : ''}`;

function annoScelto(req: Request): number {
  const oggi = Number(oggiRoma().slice(0, 4));
  const a = Number(req.query.anno);
  return Number.isInteger(a) && a >= ANNO_MINIMO && a <= oggi ? a : oggi;
}

/** Tutto quello che serve alla pagina: tre anni (l'anno scelto e i due prima), stesso periodo se l'anno è in corso. */
async function calcola(anno: number) {
  const oggi = oggiRoma();
  const inCorso = anno === Number(oggi.slice(0, 4));
  const finoA = inCorso ? oggi.slice(5) : '';
  const anni = [anno, anno - 1, anno - 2].filter(a => a >= ANNO_MINIMO);
  const [righeTutte, regole, vendite, preventivi, lamine, ricavi, coperture] = await Promise.all([
    righeCosti(anni), regoleCategorie(), venditePerProdotto(anni, finoA), materialeDeiPreventivi(), lamineVendute(anni, finoA), ricaviPerAnno(anni, finoA), copertureRighe(anni),
  ]);
  // anno in corso: gli anni prima contano fino allo stesso giorno
  const righe = classificaCosti(righeTutte, regole).filter(r => !finoA || r.anno === anno || r.data.slice(5) <= finoA);
  const costi = costiPerAnno(righe, anni);
  const rivendita = confrontoRivendita({ righe, vendite, preventivi, lamine, anni });
  const riassunto = riassuntoCosti({ costi, rivendita, ricavi, mesi: inCorso ? Number(oggi.slice(5, 7)) : 12 });
  return { anno, anni, inCorso, finoA, righe, costi, rivendita, riassunto, ricavi, coperture, daControllare: fornitoriDaControllare(righe.filter(r => r.anno === anno)), nPreventivi: preventivi.length };
}

const sceltaCategoria = (nome: string, scelta?: string) => html`<select name="${nome}">
  <option value="">— automatica —</option>
  ${(Object.keys(NOMI_MACRO) as Macro[]).map(m => html`<optgroup label="${NOMI_MACRO[m]}">${CATEGORIE.filter(c => c.macro === m).map(c => html`<option value="${c.codice}" ${c.codice === scelta ? 'selected' : ''}>${c.nome}</option>`)}</optgroup>`)}
</select>`;

function tabellaCategorie(d: Awaited<ReturnType<typeof calcola>>): Raw {
  const { costi, anno, anni } = d;
  const annoPrima = anno - 1;
  return html`<div class="tabella-scorre"><table class="elenco costi-categorie">
    <thead><tr><th>Categoria</th>${anni.map(a => html`<th class="num">${a}${d.inCorso && a !== anno ? html` <small class="tenue">stesso periodo</small>` : ''}</th>`)}
      <th class="num">Var. ${annoPrima}→${anno}</th><th class="num">Peso ${anno}</th><th>Fornitori principali ${anno}</th></tr></thead>
    <tbody>
    ${costi.macro.filter(m => anni.some(a => m.perAnno[a].importo)).map(m => html`
      <tr class="riga-famiglia"><th>${m.nome}<br><small class="tenue">${SPIEGAZIONE_MACRO[m.macro]}</small></th>
        ${anni.map(a => html`<td class="num">${euro(m.perAnno[a].importo)}</td>`)}
        <td class="num">${pct(m.variazione)}</td><td class="num">${pct(m.perAnno[anno].quota, false)}</td><td></td></tr>
      ${m.categorie.map(c => html`<tr class="riga-dettaglio ${c.codice === 'altro' ? 'da-verificare' : ''}">
        <td>↳ <a href="${linkRighe(anno, c.codice)}">${c.nome}</a>${c.codice === 'altro' ? html` <small class="tenue">(senza una categoria sicura)</small>` : ''}</td>
        ${anni.map(a => html`<td class="num">${c.perAnno[a].importo ? euro(c.perAnno[a].importo) : ''}</td>`)}
        <td class="num ${c.variazione != null && c.variazione >= 25 && c.perAnno[anno].importo >= 3000 ? 'rosso' : ''}">${pct(c.variazione)}</td>
        <td class="num">${c.perAnno[anno].importo ? pct(c.perAnno[anno].quota, false) : ''}</td>
        <td class="fornitori">${c.fornitori.slice(0, 3).map(f => html`<div><a href="${linkFornitore(f.chiave)}">${f.nome}</a> <span class="tenue">${euro(f.importo)}</span></div>`)}</td></tr>`)}`)}
    <tr class="riga-totale"><th>Totale fatture dei fornitori</th>${anni.map(a => html`<td class="num">${euro(costi.totale[a])}</td>`)}
      <td class="num">${pct(costi.totale[annoPrima] ? Math.round(((costi.totale[anno] - costi.totale[annoPrima]) / Math.abs(costi.totale[annoPrima])) * 100) : null)}</td><td class="num">100%</td><td></td></tr>
    </tbody></table></div>`;
}

function tabellaRivendita(riv: RivenditaAnno[], anno: number, inCorso: boolean): Raw {
  const riga = (nome: string, v: (r: RivenditaAnno) => Raw | string, classe = '') => html`<tr class="${classe}"><th>${nome}</th>${riv.map(r => html`<td class="num">${v(r)}</td>`)}</tr>`;
  const segno = (n: number) => html`<span class="${n < 0 ? 'rosso' : 'verde'}">${euro(n)}</span>`;
  return html`<div class="tabella-scorre"><table class="elenco rivendita-costi">
    <thead><tr><th></th>${riv.map(r => html`<th class="num">${r.anno}${inCorso && r.anno !== anno ? html` <small class="tenue">stesso periodo</small>` : ''}</th>`)}</tr></thead>
    <tbody>
    ${riga('Comprato: componenti', r => euro(r.compratoComponenti))}
    ${riga('Comprato: PCB', r => euro(r.compratoPcb))}
    ${riga('Comprato: meccanica e altro materiale', r => euro(r.compratoMeccanica))}
    ${riga('Comprato per le schede', r => euro(r.compratoComponenti + r.compratoPcb + r.compratoMeccanica), 'riga-famiglia')}
    ${riga('Rivenduto nelle schede: componenti (dai preventivi)', r => euro(r.rivendutoComponenti))}
    ${riga('Rivenduto nelle schede: PCB (dai preventivi)', r => euro(r.rivendutoPcb))}
    ${riga('Rivenduto nelle schede', r => euro(r.rivenduto), 'riga-famiglia')}
    ${riga('Guadagno della rivendita (rivenduto − comprato)', r => r.rivenduto ? html`${segno(r.margineSchede)} <small class="tenue">${pct(r.margineSchedePct, false)}</small>` : '—', 'riga-famiglia')}
    ${riga('Materiale previsto nei preventivi (costo)', r => euro(r.costoPrevisto))}
    ${riga('Comprato oltre il previsto', r => r.costoPrevisto ? segno(-r.materialeOltrePreventivo) : '—')}
    ${riga('Pezzi fatturati con un preventivo', r => `${num(r.pezziConPreventivo, 0)} su ${num(r.pezziConPreventivo + r.pezziSenzaPreventivo, 0)}`)}
    ${riga('Lamine comprate', r => euro(r.compratoLamine))}
    ${riga('Lamine fatturate ai clienti', r => html`${euro(r.lamineVendute)}${r.lamineVendutePezzi ? html` <small class="tenue">(${num(r.lamineVendutePezzi, 0)})</small>` : ''}`)}
    ${riga('Guadagno sulle lamine', r => (r.compratoLamine || r.lamineVendute) ? segno(r.margineLamine) : '—', 'riga-famiglia')}
    </tbody></table></div>`;
}

function pagina(req: Request, d: Awaited<ReturnType<typeof calcola>>): Raw {
  const { anno, costi, riassunto, rivendita, coperture } = d;
  const oggi = Number(oggiRoma().slice(0, 4));
  const m = (k: Macro) => costi.macro.find(x => x.macro === k)!;
  const cifra = (nome: string, v: number, sotto: Raw | string) => html`<div class="cifra"><span>${nome}</span><b>${euro(v)}</b><small class="tenue">${sotto}</small></div>`;
  const varTot = costi.totale[anno - 1] ? Math.round(((costi.totale[anno] - costi.totale[anno - 1]) / Math.abs(costi.totale[anno - 1])) * 100) : null;
  const ricavi = d.ricavi[anno] ?? 0;
  const ufficio = eUfficio(req.session.utente?.ruolo);
  return html`${menuAmministrazione('analisi')}
    <div class="intestazione-pagina"><div><h1>Costi per categoria · ${anno}</h1>
      <p class="nota">Ogni riga delle fatture dei fornitori con le categorie di Casteltech: materiale da rivendere, consumo, lavorazioni esterne, spese di gestione per tipo.
        ${d.inCorso ? `Anno in corso: gli anni prima sono fermati allo stesso giorno (${d.finoA.split('-').reverse().join('/')}).` : ''}</p></div>
      <div class="azioni non-stampare"><a class="bottone" href="/amministrazione/analisi/costi.xlsx?anno=${anno}">Excel</a> <button type="button" id="stampa">Stampa</button></div></div>
    ${tastiAnalisi('costi')}
    <form method="get" action="/amministrazione/analisi/costi" class="cerca cerca-pareggio">
      <label>Anno <select name="anno">${Array.from({ length: oggi - ANNO_MINIMO + 1 }, (_, i) => oggi - i).map(a => html`<option value="${a}" ${a === anno ? 'selected' : ''}>${a}</option>`)}</select></label>
      <button type="submit">Mostra</button></form>
    <div class="cifre cifre-pareggio">
      ${cifra('Fatture dei fornitori', costi.totale[anno], html`${varTot != null ? `${pct(varTot)} sul ${anno - 1}` : ''}${ricavi ? ` · ${pct(Math.round((costi.totale[anno] / ricavi) * 100), false)} del fatturato` : ''}`)}
      ${cifra('Materiale da rivendere', m('rivendita').perAnno[anno].importo, `${pct(m('rivendita').perAnno[anno].quota, false)} delle fatture`)}
      ${cifra('Materiale di consumo', m('consumo').perAnno[anno].importo, `${pct(m('consumo').perAnno[anno].quota, false)} delle fatture`)}
      ${cifra('Lavorazioni esterne', m('lavorazioni').perAnno[anno].importo, `${pct(m('lavorazioni').perAnno[anno].quota, false)} delle fatture`)}
      ${cifra('Spese di gestione', m('gestione').perAnno[anno].importo, `${pct(m('gestione').perAnno[anno].quota, false)} delle fatture`)}
    </div>

    <section class="riquadro riassunto-costi"><h2>Riassunto, opinione e proposte</h2>
      <ul class="commenti-analisi">${riassunto.frasi.map(f => html`<li class="${f.livello}"><span class="pallino">${ICONE[f.livello]}</span><span>${f.testo}</span></li>`)}</ul>
      ${riassunto.opinione ? html`<p><b>Opinione.</b> ${riassunto.opinione}</p>` : ''}
      ${riassunto.proposte.length ? html`<p><b>Proposte</b></p><ol>${riassunto.proposte.map(p => html`<li>${p}</li>`)}</ol>` : ''}
      <p class="nota">Scritto dal portale sui numeri qui sotto: è un aiuto per ragionare, non un giudizio del commercialista.</p></section>

    <h2>Le categorie, anno per anno</h2>
    <p class="nota">Clic su una categoria per vedere le righe. ${coperture.conRighe ? `${coperture.conRighe} fatture lette riga per riga` : 'Nessuna fattura letta riga per riga'}${coperture.senzaRighe ? `, ${coperture.senzaRighe} prese intere (solo PDF, o righe non ancora caricate: Impostazioni → Amministrazione → Righe delle fatture dei fornitori)` : ''}.
      Note di credito in negativo. Non comprende stipendi, F24 e quello che non passa da una fattura.</p>
    ${tabellaCategorie(d)}

    <h2>Comprato e rivenduto</h2>
    <p class="nota">Comprato = fatture dei fornitori nelle categorie di rivendita. Rivenduto = pezzi fatturati × valore dei componenti e dei PCB a scheda nel preventivo più recente del prodotto
      (${d.nPreventivi} preventivi nel portale): è una stima, vale per i pezzi che hanno un preventivo. Le lamine si confrontano con quelle fatturate (UT-LAMINA). Senza magazzino, il materiale comprato e non rivenduto è un costo.</p>
    ${tabellaRivendita(rivendita, anno, d.inCorso)}
    ${rivendita[0]?.prodottiSenzaPreventivo.length ? html`<p class="nota">Prodotti fatturati nel ${anno} senza un preventivo nel portale (i più venduti): ${rivendita[0].prodottiSenzaPreventivo.join(', ')}.</p>` : ''}

    <h2>Da controllare</h2>
    ${d.daControllare.length ? html`<p class="nota">Fornitori con fatture del ${anno} che nessuna regola ha riconosciuto (stanno in "Altre spese"): scegli la categoria e vale per tutte le loro fatture, di ogni anno.</p>
      <div class="tabella-scorre"><table class="elenco da-controllare-costi"><thead><tr><th>Fornitore</th><th class="num">${anno}</th><th class="num">Righe</th><th>Esempi</th>${ufficio ? html`<th>Categoria</th>` : ''}</tr></thead>
      <tbody>${d.daControllare.map(f => html`<tr><td><a href="${linkFornitore(f.chiave)}">${f.nome}</a></td><td class="num">${euro(f.importo)}</td><td class="num">${f.righe}</td>
        <td><small>${f.esempi.join(' · ')}</small></td>
        ${ufficio ? html`<td><form method="post" action="/amministrazione/analisi/costi/regola" class="in-riga"><input type="hidden" name="tipo" value="fornitore"><input type="hidden" name="chiave" value="${f.nome}">
          <input type="hidden" name="anno" value="${anno}">${sceltaCategoria('categoria')} <button type="submit">Salva</button></form></td>` : ''}</tr>`)}</tbody></table></div>`
      : html`<p class="nota">Tutte le fatture del ${anno} hanno una categoria.</p>`}
    <p class="nota">Le categorie scritte a mano (per fornitore, per fattura o per riga) vincono sulle regole automatiche; dalla pagina delle righe si corregge una riga sola.</p>`;
}

function paginaRighe(req: Request, anno: number, categoria: string, chiaveF: string, righe: RigaClassificata[]): Raw {
  const cat = categoriaDaCodice(categoria);
  const ufficio = eUfficio(req.session.utente?.ruolo);
  const scelte = righe.filter(r => r.anno === anno && r.categoria === categoria && (!chiaveF || r.fornitoreChiave === chiaveF)).sort((a, b) => Math.abs(b.importo) - Math.abs(a.importo));
  const totale = scelte.reduce((s, r) => s + r.importo, 0);
  const mostrate = scelte.slice(0, 400);
  const COME: Record<RigaClassificata['come'], string> = { regola: 'scritta', parola: 'dalla descrizione', fornitore: 'dal fornitore', fic: 'dalla categoria FIC', nessuna: 'nessuna regola' };
  return html`${menuAmministrazione('analisi')}
    <div class="intestazione-pagina"><div><h1>${cat.nome} · ${anno}</h1><p class="nota">${NOMI_MACRO[cat.macro]} · ${scelte.length} righe, ${euro(totale)}${chiaveF ? ' · un solo fornitore' : ''}</p></div>
      <div class="azioni non-stampare"><a class="bottone" href="/amministrazione/analisi/costi?anno=${anno}">← Costi per categoria</a></div></div>
    ${tastiAnalisi('costi')}
    <div class="tabella-scorre"><table class="elenco righe-costi"><thead><tr><th>Data</th><th>Fornitore</th><th>Descrizione</th><th class="num">Importo</th><th>Come</th>${ufficio ? html`<th>Cambia categoria</th>` : ''}</tr></thead>
    <tbody>${mostrate.map(r => html`<tr><td class="nowrap">${r.data.split('-').reverse().join('/')}</td><td><a href="${linkFornitore(r.fornitoreChiave)}">${r.fornitore}</a></td>
      <td>${r.descrizione.slice(0, 120)}${r.codici.length ? html` <small class="tenue">${r.codici.join(' · ')}</small>` : ''}${r.rigaId == null ? html` <span class="etichetta">fattura intera</span>` : ''}${r.accessoria ? html` <small class="tenue">(spesa accessoria)</small>` : ''}</td>
      <td class="num">${euro(r.importo)}</td><td><small class="tenue">${COME[r.come]}</small></td>
      ${ufficio ? html`<td><form method="post" action="/amministrazione/analisi/costi/regola" class="in-riga">
        <input type="hidden" name="tipo" value="${r.rigaId != null ? 'riga' : 'documento'}"><input type="hidden" name="chiave" value="${r.rigaId ?? r.documentoId}">
        <input type="hidden" name="anno" value="${anno}"><input type="hidden" name="torna" value="${linkRighe(anno, categoria, chiaveF || undefined)}">
        ${sceltaCategoria('categoria', r.come === 'regola' ? r.categoria : undefined)} <button type="submit">Salva</button></form></td>` : ''}</tr>`)}</tbody></table></div>
    ${scelte.length > mostrate.length ? html`<p class="nota">Mostrate le prime ${mostrate.length} righe per importo.</p>` : ''}`;
}

export function rotteAnalisiCosti() {
  const r = Router();
  const invia = (req: Request, res: any, titolo: string, contenuto: Raw) =>
    res.send(String(layout({ titolo, utente: req.session.utente, attiva: 'amministrazione', contenuto, script: 'stampa.js', largo: true })));

  r.get('/costi', async (req: Request, res) => {
    const d = await calcola(annoScelto(req));
    invia(req, res, 'Costi per categoria', pagina(req, d));
  });

  r.get('/costi/righe', async (req: Request, res) => {
    const anno = annoScelto(req);
    const categoria = categoriaDaCodice(String(req.query.categoria ?? '')).codice;
    const chiaveF = String(req.query.f ?? '');
    const [righeTutte, regole] = await Promise.all([righeCosti([anno]), regoleCategorie()]);
    invia(req, res, 'Righe della categoria', paginaRighe(req, anno, categoria, chiaveF, classificaCosti(righeTutte, regole)));
  });

  r.post('/costi/regola', async (req: Request, res) => {
    if (!eUfficio(req.session.utente?.ruolo)) return res.status(403).send('Solo l\'ufficio può scrivere le categorie.');
    const b = req.body ?? {};
    const tipo = ['fornitore', 'documento', 'riga'].includes(String(b.tipo)) ? (String(b.tipo) as 'fornitore' | 'documento' | 'riga') : 'fornitore';
    const msg = await salvaRegola(tipo, String(b.chiave ?? ''), String(b.categoria ?? ''));
    const torna = /^\/amministrazione\/analisi\/costi/.test(String(b.torna ?? '')) ? String(b.torna) : `/amministrazione/analisi/costi?anno=${Number(b.anno) || ''}`;
    res.redirect(`${torna}${torna.includes('?') ? '&' : '?'}msg=${encodeURIComponent(msg)}`);
  });

  r.get('/costi.xlsx', async (req: Request, res) => {
    const d = await calcola(annoScelto(req));
    const righe: Record<string, unknown>[] = [];
    for (const m of d.costi.macro) {
      righe.push({ categoria: m.nome, ...Object.fromEntries(d.anni.map(a => [`a${a}`, m.perAnno[a].importo])), variazione: m.variazione, peso: m.perAnno[d.anno].quota });
      for (const c of m.categorie) righe.push({ categoria: `   ${c.nome}`, ...Object.fromEntries(d.anni.map(a => [`a${a}`, c.perAnno[a].importo])), variazione: c.variazione, peso: c.perAnno[d.anno].quota,
        fornitori: c.fornitori.map(f => `${f.nome} ${Math.round(f.importo)} €`).join(' · ') });
    }
    righe.push({ categoria: 'Totale', ...Object.fromEntries(d.anni.map(a => [`a${a}`, d.costi.totale[a]])) }, {});
    const riv = d.rivendita;
    const rr = (nome: string, v: (r: RivenditaAnno) => number) => righe.push({ categoria: nome, ...Object.fromEntries(riv.map(r => [`a${r.anno}`, v(r)])) });
    rr('Comprato per le schede', r => r.compratoComponenti + r.compratoPcb + r.compratoMeccanica); rr('Rivenduto nelle schede (preventivi)', r => r.rivenduto);
    rr('Guadagno della rivendita', r => r.margineSchede); rr('Materiale previsto nei preventivi', r => r.costoPrevisto); rr('Lamine comprate', r => r.compratoLamine);
    rr('Lamine fatturate', r => r.lamineVendute); rr('Guadagno sulle lamine', r => r.margineLamine);
    righe.push({}, ...d.riassunto.frasi.map(f => ({ categoria: `${f.livello}: ${f.testo}` })), { categoria: `Opinione: ${d.riassunto.opinione}` }, ...d.riassunto.proposte.map(p => ({ categoria: `Proposta: ${p}` })));
    const dati = await excelSemplice(`Costi ${d.anno}`, [
      { header: 'Categoria', key: 'categoria', width: 60 }, ...d.anni.map(a => ({ header: `${a} €`, key: `a${a}`, width: 14, formato: 'euro' as const })),
      { header: 'Variazione %', key: 'variazione', width: 12, formato: 'numero' as const }, { header: 'Peso %', key: 'peso', width: 10, formato: 'numero' as const }, { header: 'Fornitori principali', key: 'fornitori', width: 60 },
    ], righe);
    inviaExcel(res, nomeExcel(`costi-categorie-${d.anno}`), dati);
  });
  return r;
}

export { type CostiPerAnno };
