/**
 * Amministrazione → Analisi → Costo orario (Adriano 12/11/2026): l'ora azienda e l'ora operatore (produzione / ufficio) mese per mese e
 * come media annua (ultimi 12 mesi e anno per anno), confrontate con le tariffe dei preventivi, con "Usa nei preventivi nuovi".
 * Conti in `engine/costo-orario.ts`, letture in `costo-orario-servizio.ts`. Riservata come la Previsione di cassa: dai costi per reparto
 * si ricavano gli stipendi, quindi solo chi vede le buste paga (e l'Analisi).
 */
import { Router, type Request } from 'express';
import { layout } from '../views/layout.js';
import { html, num } from '../views/html.js';
import { q, q1 } from '../db.js';
import { menuAmministrazione } from './cruscotto-amministrazione.js';
import { tastiAnalisi } from './analisi.js';
import { vedePaghe } from '../../engine/ruoli.js';
import { nomeMeseIt } from '../../engine/pareggio.js';
import { famiglia } from '../../engine/pareggio.js';
import { media, mediaDodiciMesi, mediePerAnno, tariffeProposte, CATEGORIE_ESCLUSE, DIVISORE_TFR, ORE_MESE_PIENO, SCARTO_MAX, STIMATE_MAX, type MediaCostoOrario, type Valore } from '../../engine/costo-orario.js';
import { categoria } from '../../engine/categorie-acquisti.js';
import { datiCostoOrario, mesiConOre } from '../costo-orario-servizio.js';
import { caricaTariffe } from '../catalogo-db.js';

const ora = (n: number | null | undefined) => (n == null ? '—' : `${num(n, 2)} €/h`);
const euro = (n: number) => `${num(n, 0)} €`;
const ore = (n: number) => num(n, 0);

async function puoVedere(req: Request): Promise<boolean> {
  const u = await q1<{ ruolo: string; paghe: boolean }>(`SELECT ruolo, paghe FROM utenti WHERE id = $1 AND attivo`, [req.session.utente?.id ?? 0]);
  return vedePaghe(u);
}

const pagina = (req: Request, titolo: string, contenuto: ReturnType<typeof html>) =>
  String(layout({ titolo, utente: req.session.utente, attiva: 'amministrazione', contenuto: html`
    <div class="intestazione-pagina"><h1>${titolo}</h1></div>
    <div class="non-stampare">${menuAmministrazione('analisi')}</div>
    ${tastiAnalisi('costo-orario')}
    ${contenuto}`, largo: true }));

export function rotteCostoOrario() {
  const r = Router();

  r.get('/costo-orario', async (req: Request, res) => {
    if (!(await puoVedere(req))) {
      return res.status(403).send(pagina(req, '🔒 Costo orario', html`<p class="avviso">Pagina riservata: dai costi per reparto si ricavano gli stipendi,
        quindi la vede solo chi ha il permesso delle buste paga.</p>`));
    }
    const periodo = await mesiConOre();
    if (!periodo) return res.send(pagina(req, 'Costo orario', html`<p class="avviso">Nessun cedolino nel portale: carica le buste paga da Dipendenti → Buste paga.</p>`));
    const { mesi, escluse, tariffe } = await datiCostoOrario({ da: periodo.primo, a: periodo.ultimo });
    const anni = mediePerAnno(mesi);
    const annoScelto = Number(req.query.anno) || anni[0]?.anno || Number(periodo.ultimo.slice(0, 4));
    const dodici = mediaDodiciMesi(mesi, periodo.ultimo);
    const proposte = tariffeProposte(dodici);
    const mesiAnno = mesi.filter(m => m.anno === annoScelto);
    const msg = typeof req.query.msg === 'string' ? req.query.msg : '';
    const cella = (v: Valore) => html`<td class="num">${ore(v.ore)}</td><td class="num">${euro(v.costo)}</td><td class="num"><b>${ora(v.orario)}</b></td>`;
    const rigaMedia = (etichetta: string, m: MediaCostoOrario, href?: string) => html`<tr>
      <th>${href ? html`<a href="${href}">${etichetta}</a>` : etichetta} <small class="tenue">${m.mesi} ${m.mesi === 1 ? 'mese' : 'mesi'}</small></th>
      <td class="num"><b>${ora(m.azienda.orario)}</b></td><td class="num">${ora(m.produzione.orario)}</td><td class="num">${ora(m.ufficio.orario)}</td>
      <td class="num">${ora(m.azienda.orario != null && m.produzione.orario != null ? m.azienda.orario + m.produzione.orario : null)}</td>
      <td class="num">${euro(m.azienda.costo)}</td><td class="num">${euro(m.produzione.costo + m.ufficio.costo)}</td><td class="num">${ore(m.produzione.ore + m.ufficio.ore)}</td>
      <td>${m.attendibile ? '' : m.sociAlLavoro ? html`<small class="tenue">non confrontabile: soci al lavoro in produzione pagati come soci</small>`
        : m.oreStimate > STIMATE_MAX ? html`<small class="tenue">da prendere con cautela: ore stimate per ${num(m.oreStimate * 100, 0)} % dei cedolini</small>` : html`<small class="tenue">da prendere con cautela: lordo dei cedolini ${m.scarto == null ? 'senza note contabili' : `${m.scarto > 0 ? '+' : ''}${num(m.scarto * 100, 0)} %`} rispetto alle note contabili</small>`}</td></tr>`;

    res.send(pagina(req, 'Costo orario', html`
      ${msg ? html`<p class="messaggio chiudibile">${msg}</p>` : ''}
      <p class="nota">Le due tariffe del preventivo (costo di una fase = ore ciclo × <b>ora azienda</b> + ore ciclo × persone × <b>ora operatore</b>) calcolate dai costi veri,
        come se ci fosse sempre una persona al lavoro: ogni costo diviso per le ore lavorate dei cedolini.</p>

      <div class="cifre">
        <div class="cifra"><span>Ora azienda</span><b>${ora(dodici.azienda.orario)}</b><small>media degli ultimi 12 mesi (${dodici.daA}) · nei preventivi ${ora(tariffe.costoAziendaH)}</small></div>
        <div class="cifra"><span>Ora operatore produzione</span><b>${ora(dodici.produzione.orario)}</b><small>nei preventivi ${ora(tariffe.costoOperatoreProduzioneH)}</small></div>
        <div class="cifra"><span>Ora operatore ufficio</span><b>${ora(dodici.ufficio.orario)}</b><small>nei preventivi ${ora(tariffe.costoOperatoreUfficioH)}</small></div>
        <div class="cifra"><span>Un'ora di produzione</span><b>${ora(dodici.azienda.orario != null && dodici.produzione.orario != null ? dodici.azienda.orario + dodici.produzione.orario : null)}</b>
          <small>azienda + operatore: sotto questo prezzo all'ora si perde</small></div>
      </div>

      <form method="post" action="/amministrazione/analisi/costo-orario/tariffe" class="riquadro non-stampare"
        data-conferma="Scrivo nelle Tariffe: ora azienda ${String(proposte.costoAziendaH ?? '—')} €, operatore produzione ${String(proposte.costoOperatoreProduzioneH ?? '—')} €, ufficio ${String(proposte.costoOperatoreUfficioH ?? '—')} €. Valgono solo per i preventivi nuovi o ricalcolati: quelli già salvati non cambiano. Continuo?">
        <b>Usa la media dei 12 mesi nei preventivi nuovi</b> (arrotondata al mezzo euro): azienda ${ora(proposte.costoAziendaH)}, produzione ${ora(proposte.costoOperatoreProduzioneH)},
        ufficio ${ora(proposte.costoOperatoreUfficioH)}. Il ricarico non cambia; i preventivi già salvati tengono le loro tariffe.
        <button>Usa nei preventivi nuovi</button> <a href="/impostazioni/tariffe">Tariffe in Impostazioni</a>
      </form>

      <h2>Anno per anno</h2>
      <table><thead><tr><th>Anno</th><th class="num">Ora azienda</th><th class="num">Operatore produzione</th><th class="num">Operatore ufficio</th>
        <th class="num">Azienda + produzione</th><th class="num">Spese di gestione</th><th class="num">Costo dipendenti</th><th class="num">Ore lavorate</th><th>Note</th></tr></thead>
        <tbody>${rigaMedia('Ultimi 12 mesi', dodici)}
          ${anni.map(a => rigaMedia(String(a.anno), a.media, `/amministrazione/analisi/costo-orario?anno=${a.anno}`))}</tbody></table>

      <h2>Mese per mese: ${annoScelto}</h2>
      <nav class="pagine anni non-stampare"><span class="nota">Anno:</span>
        ${anni.map(a => a.anno === annoScelto ? html`<b aria-current="page">${a.anno}</b>` : html`<a href="/amministrazione/analisi/costo-orario?anno=${a.anno}">${a.anno}</a>`)}</nav>
      <table><thead><tr><th rowspan="2">Mese</th><th colspan="3">Produzione</th><th colspan="3">Ufficio</th><th colspan="3">Azienda (spese di gestione ÷ ore di tutti)</th>
          <th rowspan="2" class="num">Media 12 mesi azienda</th><th rowspan="2" class="num">Media 12 mesi produzione</th><th rowspan="2">Note</th></tr>
        <tr><th class="num">Ore</th><th class="num">Costo</th><th class="num">€/h</th><th class="num">Ore</th><th class="num">Costo</th><th class="num">€/h</th>
          <th class="num">Ore</th><th class="num">Spese</th><th class="num">€/h</th></tr></thead>
        <tbody>${mesiAnno.map(m => {
          const d12 = mediaDodiciMesi(mesi, m.chiave);
          const note = [
            m.azienda.fonte === 'bilancino' ? 'spese dal bilancino' : '',
            m.tfrLiquidato ? `TFR liquidato ${euro(m.tfrLiquidato)} escluso` : '',
            m.cedoliniSenzaOre ? `ore stimate per ${m.cedoliniSenzaOre} ${m.cedoliniSenzaOre === 1 ? 'cedolino' : 'cedolini'}` : '',
            escluse[m.chiave] ? `lavorazioni rivendute ${euro(escluse[m.chiave])} escluse` : '',
            !m.valido ? 'senza cedolini: fuori dalle medie' : '',
          ].filter(Boolean).join(' · ');
          return html`<tr><td>${nomeMeseIt(m.mese)}</td>${cella(m.produzione)}${cella(m.ufficio)}${cella(m.azienda)}
            <td class="num">${m.valido ? ora(d12.azienda.orario) : '—'}</td><td class="num">${m.valido ? ora(d12.produzione.orario) : '—'}</td><td><small class="tenue">${note}</small></td></tr>`;
        })}</tbody>
        <tfoot>${(() => { const t = media(mesiAnno); return html`<tr><th>Anno ${annoScelto}</th>${cella(t.produzione)}${cella(t.ufficio)}${cella(t.azienda)}<td></td><td></td><td></td></tr>`; })()}</tfoot></table>

      <h2>Spese di gestione dell'anno ${annoScelto}</h2>
      <table><thead><tr><th>Voce</th><th class="num">Totale</th><th class="num">Al mese</th></tr></thead>
        <tbody>${(() => {
          const tot: Record<string, number> = {};
          for (const m of mesiAnno.filter(x => x.valido)) for (const [k, v] of Object.entries(m.azienda.famiglie)) tot[k] = (tot[k] ?? 0) + (v ?? 0);
          const n = mesiAnno.filter(x => x.valido).length || 1;
          return Object.entries(tot).sort((a, b) => b[1] - a[1]).map(([k, v]) => html`<tr><td>${famiglia(k as never).nome} <small class="tenue">${famiglia(k as never).spiegazione}</small></td>
            <td class="num">${euro(v)}</td><td class="num">${euro(v / n)}</td></tr>`);
        })()}</tbody></table>

      <h2>Come si calcola</h2>
      <ul class="nota">
        <li><b>Ora operatore</b> = costo dei dipendenti ÷ ore lavorate dei cedolini. Costo = lordo + INPS e INAIL dell'azienda + enti + TFR che matura (lordo ÷ ${num(DIVISORE_TFR, 1)}).
          Il TFR <b>liquidato</b> a chi esce non conta: è maturato negli anni prima. Operai, apprendisti e tirocinanti = produzione; impiegati = ufficio.</li>
        <li><b>Ora azienda</b> = spese di gestione ÷ ore lavorate di tutti i dipendenti. Spese = servizi (energia, commercialista, pulizie, trasporti, consulenze…), affitto e leasing,
          il compenso dell'amministratore con l'INPS, ammortamenti, imposte e oneri, interessi: i costi fissi del Punto di pareggio senza i dipendenti.</li>
        <li>Fuori dall'ora azienda il materiale che si rivende o si consuma (componenti, PCB, lamine, stagno…: nel preventivo sono voci a parte) e le lavorazioni comprate
          e rivendute (${CATEGORIE_ESCLUSE.map(c => categoria(c).nome.toLowerCase()).join(', ')}). Nei mesi con il bilancino le lavorazioni non si separano.</li>
        <li>Cedolini senza ore (soprattutto quelli del vecchio studio, 2019–2021, e i mesi con la liquidazione): ore stimate dal lordo con le ore per euro dei colleghi dello stesso
          reparto, al massimo un mese pieno (${ORE_MESE_PIENO} ore). Fino al 2021 la nota contabile non divide operai e impiegati: tutto in produzione.</li>
        <li>Fino al 2023 alcuni soci lavoravano in produzione e venivano pagati come soci o collaboratori: quei compensi stanno nell'ora azienda e le loro ore mancano,
          quindi quegli anni non sono confrontabili. Un anno è "da prendere con cautela" se il lordo dei cedolini e quello delle note contabili differiscono più del ${num(SCARTO_MAX * 100, 0)} %.</li>
        <li>Media = somma dei costi ÷ somma delle ore: la tredicesima di dicembre o un mese con poche ore non pesano più degli altri. Mesi senza cedolini restano fuori.</li>
        <li>Le ore dei cedolini comprendono le ore pagate di festività; ferie e permessi di solito no. Se una parte delle ore non si vende (pulizie, attese, riunioni),
          l'ora venduta deve costare di più: con il 75 % di ore vendute l'ora azienda va divisa per 0,75.</li>
      </ul>`));
  });

  r.post('/costo-orario/tariffe', async (req: Request, res) => {
    if (!(await puoVedere(req))) return res.status(403).send('Pagina riservata');
    const periodo = await mesiConOre();
    if (!periodo) return res.redirect('/amministrazione/analisi/costo-orario');
    const { mesi } = await datiCostoOrario({ da: periodo.primo, a: periodo.ultimo });
    const p = tariffeProposte(mediaDodiciMesi(mesi, periodo.ultimo));
    const attuali = await caricaTariffe();
    const nuove = {
      ...attuali,
      costoAziendaH: p.costoAziendaH ?? attuali.costoAziendaH,
      costoOperatoreProduzioneH: p.costoOperatoreProduzioneH ?? attuali.costoOperatoreProduzioneH,
      costoOperatoreUfficioH: p.costoOperatoreUfficioH ?? attuali.costoOperatoreUfficioH,
    };
    await q(`INSERT INTO impostazioni (chiave, valore) VALUES ('tariffe', $1) ON CONFLICT (chiave) DO UPDATE SET valore = $1, aggiornato_il = now()`, [JSON.stringify(nuove)]);
    res.redirect(`/amministrazione/analisi/costo-orario?msg=${encodeURIComponent(`Tariffe aggiornate: azienda ${nuove.costoAziendaH} €/h, produzione ${nuove.costoOperatoreProduzioneH} €/h, ufficio ${nuove.costoOperatoreUfficioH} €/h. Valgono per i preventivi nuovi.`)}`);
  });

  return r;
}
