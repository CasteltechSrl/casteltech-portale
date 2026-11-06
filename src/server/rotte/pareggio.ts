/**
 * Amministrazione → Analisi → Punto di pareggio (Adriano 6/11/2026, dal file "Analisi CASTELTECH SRL" di un consulente esterno, solo indicativo):
 * la MEDIA mensile di tutte le voci (ricavi e costi) nel periodo scelto, il fatturato necessario per il pareggio, la verifica tra
 * i mesi del bilancino e i dati del portale, i bilanci ufficiali degli anni passati letti con la stessa regola.
 * Conti in `engine/pareggio.ts`, letture in `pareggio-servizio.ts`.
 */
import { Router, type Request } from 'express';
import { layout } from '../views/layout.js';
import { html, num, raw, type Raw } from '../views/html.js';
import { menuAmministrazione } from './cruscotto-amministrazione.js';
import { tastiAnalisi } from './analisi.js';
import { excelSemplice, inviaExcel, nomeExcel } from '../excel.js';
import {
  chiaveMese, confrontoConPortale, contoEconomico, MESI_PER_STIMA, nomeMeseIt, pareggioDaBilancio, periodoValido, utileConFatturato, type ContoEconomico, type Fonte,
} from '../../engine/pareggio.js';
import { bilanciUfficiali, mesiCaricati, mesiDalPortale, ultimoMeseConDati, vociCommercialista } from '../pareggio-servizio.js';

const oggiRoma = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
const euro = (n: number | null | undefined) => (n == null ? '—' : `${num(n, 0)} €`);
const pct = (v: number | null) => (v == null ? '—' : `${num(v * 100, 1)}%`);
const NOME_FONTE: Record<Fonte, string> = { commercialista: 'bilancino', portale: 'portale', stima: 'stima' };
const meseIt = (k: string) => `${nomeMeseIt(Number(k.slice(5, 7)))} ${k.slice(0, 4)}`;

/** Periodo scelto: `da` e `a` nel formato AAAA-MM; proposto = dal 1° gennaio all'ultimo mese chiuso con dati. */
async function periodoDa(req: Request) {
  const oggi = oggiRoma();
  const ultimo = (await ultimoMeseConDati()) ?? oggi.slice(0, 7);
  const meseScorso = oggi.slice(5, 7) === '01' ? `${Number(oggi.slice(0, 4)) - 1}-12` : `${oggi.slice(0, 4)}-${String(Number(oggi.slice(5, 7)) - 1).padStart(2, '0')}`;
  const aProposto = ultimo < meseScorso ? ultimo : meseScorso;
  let a = periodoValido(req.query.a) ? String(req.query.a) : aProposto;
  let da = periodoValido(req.query.da) ? String(req.query.da) : `${a.slice(0, 4)}-01`;
  if (da > a) [da, a] = [a, da];
  return { da, a };
}

async function calcola(periodo: { da: string; a: string }) {
  const [commercialista, portale, bilanci] = await Promise.all([vociCommercialista(), mesiDalPortale(periodo), bilanciUfficiali()]);
  const ce = contoEconomico({ periodo, commercialista, portale, bilanci });
  const confronto = confrontoConPortale(commercialista, portale);
  return { ce, confronto, bilanci, commercialista };
}

function pagina(req: Request, d: Awaited<ReturnType<typeof calcola>>, caricati: Awaited<ReturnType<typeof mesiCaricati>>, ipotesi: number | null): Raw {
  const { ce, confronto, bilanci } = d;
  const p = ce.pareggio;
  const ricavi = ce.famiglie.find(f => f.codice === 'ricavi');
  const costi = ce.famiglie.filter(f => f.tipo !== 'ricavo');
  const quota = (media: number) => (p.ricaviMedi > 0 ? `${num((media / p.ricaviMedi) * 100, 1)}%` : '');
  const nMesiFonte = (f: Fonte) => ce.mesi.filter(m => m.fonte === f).length;
  const fonteMesi = ce.mesi.length ? [nMesiFonte('commercialista') ? `${nMesiFonte('commercialista')} dal bilancino` : '', nMesiFonte('portale') ? `${nMesiFonte('portale')} dal portale (con stime per ${
    [...new Set(ce.mesi.flatMap(m => m.stime))].length} voci)` : ''].filter(Boolean).join(', ') : '';
  const utileIpotesi = ipotesi != null ? utileConFatturato(p, ipotesi) : null;
  const rigaFamiglia = (f: typeof ce.famiglie[number]) => html`
    <tr class="riga-famiglia ${f.tipo}"><th>${f.nome} <small class="tenue">${f.spiegazione}</small></th>
      <td class="num">${euro(f.media)}</td><td class="num">${euro(f.totale)}</td><td class="num">${f.codice === 'ricavi' ? '100%' : quota(f.media)}</td>
      <td>${f.tipo === 'variabile' ? html`<span class="etichetta">variabile</span>` : f.tipo === 'fisso' ? html`<span class="etichetta">fisso</span>` : ''}
        ${f.nota ? html`<small class="tenue">${f.nota}</small>` : ''}</td></tr>
    ${f.dettagli.map(x => html`<tr class="riga-dettaglio"><td>↳ ${x.voce}</td><td class="num">${euro(x.media)}</td><td class="num">${euro(x.totale)}</td>
      <td class="num">${f.codice === 'ricavi' ? '' : quota(x.media)}</td><td><small class="tenue">${x.mesi} ${x.mesi === 1 ? 'mese' : 'mesi'}${x.fonte !== 'commercialista' ? ` · ${NOME_FONTE[x.fonte]}` : ''}</small></td></tr>`)}`;

  return html`
    <div class="intestazione-pagina"><h1>Punto di pareggio</h1>
      <div class="azioni non-stampare"><a class="bottone" href="/amministrazione/analisi/pareggio.xlsx?da=${ce.periodo.da}&a=${ce.periodo.a}">Excel</a> <button type="button" id="stampa">Stampa</button></div></div>
    <div class="non-stampare">${menuAmministrazione('analisi')}</div>
    ${tastiAnalisi('pareggio')}
    <form class="cerca cerca-pareggio non-stampare" method="get">
      <label>Da <input type="month" name="da" value="${ce.periodo.da}"></label> <label>a <input type="month" name="a" value="${ce.periodo.a}"></label>
      <label>Ipotesi di fatturato al mese € <input name="ipotesi" inputmode="decimal" size="8" value="${ipotesi != null ? String(ipotesi) : ''}" placeholder="es. 58000"></label>
      <button>Mostra</button></form>
    <p class="nota">Media mensile di ogni voce nel periodo (${ce.nMesi} ${ce.nMesi === 1 ? 'mese' : 'mesi'}: ${fonteMesi || 'nessun dato'}), imponibili senza IVA.
      I mesi con il bilancino (il file del consulente, caricato con l'anno) valgono così come sono; per gli altri il portale mette fatture emesse, fatture ricevute e buste paga,
      e stima le voci che non ha (ammortamenti, oneri finanziari, imposte…) con la media degli ultimi ${MESI_PER_STIMA} mesi del bilancino o con il bilancio ufficiale.
      Ricarica il bilancino da <a href="/impostazioni/amministrazione#bilancino">Impostazioni → Amministrazione</a>.</p>
    ${ce.avvisi.map(a => html`<p class="avviso">${a}</p>`)}

    <div class="cifre cifre-pareggio">
      <div class="cifra"><span>Ricavi al mese</span><b>${euro(p.ricaviMedi)}</b><small>${euro(p.ricaviMedi * 12)} all'anno</small></div>
      <div class="cifra"><span>Costi fissi al mese</span><b>${euro(p.fissiMedi)}</b><small>tutto tranne le materie prime</small></div>
      <div class="cifra"><span>Margine</span><b>${pct(p.margineContribuzione)}</b><small>resta di ogni euro dopo le materie prime</small></div>
      <div class="cifra ${p.fatturatoPareggio != null && p.ricaviMedi < p.fatturatoPareggio ? 'allarme' : ''}"><span>Pareggio al mese</span><b>${euro(p.fatturatoPareggio)}</b>
        <small>${euro(p.fatturatoPareggioAnno)} all'anno</small></div>
      <div class="cifra ${p.utileMedio < 0 ? 'allarme' : ''}"><span>Utile al mese</span><b>${euro(p.utileMedio)}</b>
        <small>${p.fatturatoPareggio != null ? (p.ricaviMedi >= p.fatturatoPareggio ? `${euro(p.ricaviMedi - p.fatturatoPareggio)} sopra il pareggio` : `mancano ${euro(p.fatturatoPareggio - p.ricaviMedi)} al mese`) : 'prima delle imposte'}</small></div>
      ${ipotesi != null ? html`<div class="cifra ${(utileIpotesi ?? 0) < 0 ? 'allarme' : ''}"><span>Con ${euro(ipotesi)} al mese</span><b>${euro(utileIpotesi)}</b><small>utile con gli stessi costi fissi</small></div>` : ''}
    </div>
    <p class="nota">Pareggio = costi fissi ÷ margine di contribuzione: è il fatturato con cui si coprono tutti i costi del mese, senza utile (al pareggio le materie prime
      sarebbero ${euro(p.acquistiAlPareggio)} al mese). Le imposte sul reddito non sono comprese.</p>

    <h2>Conto economico medio del periodo</h2>
    <p class="non-stampare"><label><input type="checkbox" id="dettagli-pareggio"> Mostra le singole voci (conti del bilancino e categorie delle fatture)</label></p>
    <div class="tabella-scorre"><table class="elenco pareggio" data-non-ordinare>
      <thead><tr><th>Voce</th><th class="num">Media al mese</th><th class="num">Totale del periodo</th><th class="num">Sui ricavi</th><th>Fonte e note</th></tr></thead>
      <tbody>
        ${ricavi ? rigaFamiglia(ricavi) : ''}
        <tr class="riga-totale"><th>Totale ricavi</th><th class="num">${euro(p.ricaviMedi)}</th><th class="num">${euro(ricavi?.totale ?? 0)}</th><th class="num">100%</th><th></th></tr>
        ${costi.map(rigaFamiglia)}
        <tr class="riga-totale"><th>Totale costi</th><th class="num">${euro(p.variabiliMedi + p.fissiMedi)}</th><th class="num">${euro(costi.reduce((s, f) => s + f.totale, 0))}</th>
          <th class="num">${quota(p.variabiliMedi + p.fissiMedi)}</th><th><small class="tenue">variabili ${euro(p.variabiliMedi)} + fissi ${euro(p.fissiMedi)}</small></th></tr>
        <tr class="riga-totale ${p.utileMedio < 0 ? 'scaduta' : ''}"><th>Utile (perdita) prima delle imposte</th><th class="num">${euro(p.utileMedio)}</th>
          <th class="num">${euro((ricavi?.totale ?? 0) - costi.reduce((s, f) => s + f.totale, 0))}</th><th class="num">${quota(p.utileMedio)}</th><th></th></tr>
      </tbody></table></div>

    <h2>Mese per mese: da dove vengono i numeri</h2>
    <p class="mesi-fonte">${ce.mesi.map(m => html`<span class="etichetta ${m.fonte === 'commercialista' ? 'cliente' : ''}" title="${m.stime.length ? `stimati: ${m.stime.join(', ')}` : ''}">${nomeMeseIt(m.mese).slice(0, 3)} ${m.anno}: ${NOME_FONTE[m.fonte]}</span> `)}</p>

    ${confronto.length ? html`<h2>Verifica: bilancino contro portale</h2>
      <p class="nota">Per i mesi con il bilancino: ricavi contro le fatture emesse del mese, materie prime contro le fatture ricevute con categoria B6, personale contro
        le note contabili delle buste paga. In rosso le differenze oltre 500 € e 5 %: possono essere date diverse (competenza contro data della fattura), fatture
        registrate nel bilancino in un altro mese, o documenti che mancano nel portale.</p>
      <div class="tabella-scorre"><table class="elenco confronto-pareggio" data-non-ordinare>
        <thead><tr><th>Mese</th>${confronto[0].voci.map(v => html`<th class="num" colspan="3">${v.nome}</th>`)}</tr>
          <tr><th></th>${confronto[0].voci.map(() => html`<th class="num">bilancino</th><th class="num">portale</th><th class="num">differenza</th>`)}</tr></thead>
        <tbody>${confronto.map(m => html`<tr><td class="nowrap">${nomeMeseIt(m.mese).slice(0, 3)} ${m.anno}</td>${m.voci.map(v => html`<td class="num">${euro(v.commercialista)}</td><td class="num">${euro(v.portale)}</td>
          <td class="num ${v.segnala ? 'negativo' : ''}">${v.differenza > 0 ? '+' : ''}${euro(v.differenza)}${v.pct != null ? html` <small class="tenue">(${v.pct > 0 ? '+' : ''}${num(v.pct, 0)}%)</small>` : ''}</td>`)}</tr>`)}
        <tr class="riga-totale"><th>Totale</th>${confronto[0].voci.map((_, i) => { const c = confronto.reduce((s, m) => s + m.voci[i].commercialista, 0), pr = confronto.reduce((s, m) => s + m.voci[i].portale, 0);
          return html`<th class="num">${euro(c)}</th><th class="num">${euro(pr)}</th><th class="num ${Math.abs(pr - c) > 500 ? 'negativo' : ''}">${pr - c > 0 ? '+' : ''}${euro(pr - c)}</th>`; })}</tr>
        </tbody></table></div>` : ''}

    <h2>Bilanci ufficiali degli anni passati</h2>
    ${bilanci.length ? html`<p class="nota">Dai bilanci depositati (schema CEE): materie prime con la variazione delle rimanenze, ricavi con gli altri ricavi e le rimanenze di prodotti;
        nei servizi (B7) il bilancio comprende anche i compensi dell'amministratore. Pareggio calcolato con la stessa regola, sulle medie mensili dell'anno.</p>
      <div class="tabella-scorre"><table class="elenco bilanci-pareggio">
        <thead><tr><th>Anno</th><th class="num">Ricavi</th><th class="num">Materie prime</th><th class="num">Servizi</th><th class="num">Affitti, leasing</th><th class="num">Personale</th>
          <th class="num">Ammortam.</th><th class="num">Altri oneri</th><th class="num">On. finanziari</th><th class="num">Ante imposte</th><th class="num">Utile netto</th>
          <th class="num">Margine</th><th class="num">Pareggio/mese</th></tr></thead>
        <tbody>${bilanci.map(b => { const pb = pareggioDaBilancio(b); return html`<tr class="${b.utile < 0 ? 'scaduta' : ''}"><td class="nowrap">${b.anno}${b.dipendenti != null ? html` <small class="tenue">(${b.dipendenti} dip.)</small>` : ''}</td>
          <td class="num">${euro(b.ricavi + b.altriRicavi + b.variazioneRimanenzeProdotti)}</td><td class="num">${euro(b.materie + b.variazioneRimanenzeMaterie)}</td><td class="num">${euro(b.servizi)}</td>
          <td class="num">${euro(b.godimento)}</td><td class="num">${euro(b.personale)}</td><td class="num">${euro(b.ammortamenti)}</td><td class="num">${euro(b.oneriDiversi)}</td>
          <td class="num">${euro(b.oneriFinanziari)}</td><td class="num">${euro(pb.risultatoPrimaImposte)}</td><td class="num">${euro(b.utile)}</td>
          <td class="num">${pct(pb.margineContribuzione)}</td><td class="num">${euro(pb.fatturatoPareggio)}</td></tr>`; })}
        </tbody></table></div>`
      : html`<p class="nota">Nessun bilancio caricato: il file bilanci_ufficiali.json.gz si carica da <a href="/impostazioni/amministrazione#bilanci">Impostazioni → Amministrazione</a>.</p>`}

    <details class="non-stampare"><summary>Mesi del bilancino caricati</summary>
      ${caricati.length ? html`<ul>${caricati.map(c => html`<li>${c.anno}: ${c.mesi.map(m => nomeMeseIt(m)).join(', ')} <small class="tenue">(caricato il ${c.caricato_il.split('-').reverse().join('/')})</small></li>`)}</ul>`
        : html`<p class="nota">Nessuno: carica l'Excel del consulente da Impostazioni → Amministrazione → Bilancino mensile.</p>`}</details>
    <p class="nota">È un'analisi sui numeri disponibili, non il bilancio: per decisioni importanti sentite il commercialista.</p>`;
}

export function rottePareggio() {
  const r = Router();
  r.get('/pareggio', async (req: Request, res) => {
    const periodo = await periodoDa(req);
    const ipotesiTesto = String(req.query.ipotesi ?? '').replace(/\./g, '').replace(',', '.');
    const ipotesi = ipotesiTesto && Number.isFinite(Number(ipotesiTesto)) && Number(ipotesiTesto) > 0 ? Number(ipotesiTesto) : null;
    const [d, caricati] = await Promise.all([calcola(periodo), mesiCaricati()]);
    res.send(String(layout({ titolo: 'Punto di pareggio', utente: req.session.utente, attiva: 'amministrazione', contenuto: pagina(req, d, caricati, ipotesi), script: 'stampa.js', largo: true })));
  });
  r.get('/pareggio.xlsx', async (req: Request, res) => {
    const periodo = await periodoDa(req);
    const { ce } = await calcola(periodo);
    const righe: Record<string, unknown>[] = [];
    for (const f of ce.famiglie) {
      righe.push({ voce: f.nome, tipo: f.tipo, media: f.media, totale: f.totale, quota: ce.pareggio.ricaviMedi > 0 ? Math.round((f.media / ce.pareggio.ricaviMedi) * 1000) / 10 : null, fonte: f.nota ?? 'commercialista' });
      for (const x of f.dettagli) righe.push({ voce: `   ${x.voce}`, tipo: '', media: x.media, totale: x.totale, quota: null, fonte: `${x.mesi} mesi · ${NOME_FONTE[x.fonte]}` });
    }
    const p = ce.pareggio;
    righe.push({}, { voce: 'Costi fissi al mese', media: p.fissiMedi }, { voce: 'Costi variabili al mese', media: p.variabiliMedi },
      { voce: 'Margine di contribuzione %', media: p.margineContribuzione != null ? Math.round(p.margineContribuzione * 1000) / 10 : null },
      { voce: 'Fatturato di pareggio al mese', media: p.fatturatoPareggio }, { voce: 'Fatturato di pareggio all\'anno', media: p.fatturatoPareggioAnno }, { voce: 'Utile medio al mese', media: p.utileMedio });
    const dati = await excelSemplice(`Pareggio ${chiaveMese(Number(periodo.da.slice(0, 4)), Number(periodo.da.slice(5, 7)))}`, [
      { header: 'Voce', key: 'voce', width: 52 }, { header: 'Tipo', key: 'tipo', width: 10 }, { header: 'Media al mese €', key: 'media', width: 16, formato: 'euro' },
      { header: 'Totale periodo €', key: 'totale', width: 16, formato: 'euro' }, { header: 'Sui ricavi %', key: 'quota', width: 12, formato: 'numero' }, { header: 'Fonte', key: 'fonte', width: 40 },
    ], righe);
    inviaExcel(res, nomeExcel(`pareggio-${periodo.da}-${periodo.a}`), dati);
  });
  return r;
}

export { type ContoEconomico, meseIt };
