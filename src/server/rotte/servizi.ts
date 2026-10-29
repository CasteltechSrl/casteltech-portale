/**
 * Impostazioni → Servizi (Adriano 29/10/2026): riquadro con consumi e limiti dei servizi esterni del portale
 * (IA Anthropic, Render, Neon, distributori, Google, Invoicetronic) e il credito dell'IA scritto dall'ufficio.
 */
import { Router, type Request } from 'express';
import { html, type Raw } from '../views/html.js';
import { datiPaginaServizi, righePagina, salvaImpostazioniServizi, type ImpostazioniServizi } from '../consumi-servizi.js';
import type { StatoServizio } from '../../engine/servizi.js';

type Pagina = (req: Request, titolo: string, contenuto: Raw, avviso?: string, script?: string) => string;

const ETICHETTA: Record<StatoServizio, [classe: string, testo: string]> = {
  ok: ['nuovo', 'ok'], attenzione: ['verifica', 'attenzione'], critico: ['manca', 'critico'], spento: ['escluso', 'non attivo'], sconosciuto: ['escluso', 'non misurato'],
};
const nf = (x: number, dec = 2) => new Intl.NumberFormat('it-IT', { maximumFractionDigits: dec, minimumFractionDigits: dec }).format(x);
const quando = (iso: string) => new Date(iso).toLocaleString('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const NOMI_SERVIZI: Record<string, string> = { ia: 'IA', render: 'Render', drive: 'Google Drive', gmail: 'Gmail', digikey: 'DigiKey', mouser: 'Mouser', farnell: 'Farnell', tme: 'TME' };

export function rotteServizi(pagina: Pagina) {
  const r = Router();

  r.get('/', async (req, res) => {
    const p = await datiPaginaServizi();
    const righe = righePagina(p);
    const imp = p.impostazioni;
    res.send(pagina(req, 'Servizi', html`
      <section class="blocco">
        <h2>Consumi e limiti</h2>
        <p class="nota">Quanto il portale sta usando dei servizi esterni e quanto manca ai limiti. Quando un servizio supera l'80% (o si ferma,
          per esempio per credito dell'IA finito) tutti gli utenti dell'ufficio vedono un avviso in cima alle pagine.</p>
        <div class="tabella-scorre"><table class="tabella servizi"><thead><tr><th>Servizio</th><th>Stato</th><th>Uso</th><th>Limite</th><th></th></tr></thead><tbody>
        ${righe.map(x => html`<tr class="servizio-${x.stato}">
          <td><b>${x.servizio}</b><br><small class="nota">${x.cosa}</small></td>
          <td><span class="esito ${ETICHETTA[x.stato][0]}">${ETICHETTA[x.stato][1]}</span></td>
          <td>${x.uso}${x.nota ? html`<br><small class="nota">${x.nota}</small>` : ''}</td>
          <td>${x.limite}</td>
          <td class="numero">${x.percentuale != null ? html`<meter min="0" max="100" low="80" high="95" optimum="0" value="${Math.min(100, x.percentuale)}">${x.percentuale}%</meter> ${x.percentuale}%` : ''}</td>
        </tr>`)}
        </tbody></table></div>
        <p class="nota">Token, costo dell'IA e richieste ai distributori li conta il portale a ogni risposta (Anthropic non dice quanto credito resta):
          il costo è una stima con il listino Anthropic e può differire di poco dalla fattura. Memoria: misurata dal portale stesso.</p>
      </section>

      <section class="blocco">
        <h2>IA: per cosa si spende</h2>
        ${p.dati.ia?.perVoce?.length ? html`<table class="tabella"><thead><tr><th>Questo mese</th><th class="numero">Letture</th><th class="numero">Costo stimato</th></tr></thead><tbody>
          ${p.dati.ia.perVoce.map(v => html`<tr><td>${v.voce}</td><td class="numero">${v.chiamate}</td><td class="numero">${nf(v.costoUsd)} $</td></tr>`)}
        </tbody></table>` : html`<p class="nota">Nessuna lettura con l'IA questo mese.</p>`}
        ${p.mesi.length ? html`<table class="tabella"><thead><tr><th>Mese</th><th class="numero">Letture</th><th class="numero">Token letti</th><th class="numero">Token scritti</th><th class="numero">Costo stimato</th></tr></thead><tbody>
          ${p.mesi.map(m => html`<tr><td>${m.mese.split('-').reverse().join('/')}</td><td class="numero">${m.chiamate}</td><td class="numero">${nf(m.tokenIngresso, 0)}</td>
            <td class="numero">${nf(m.tokenUscita, 0)}</td><td class="numero">${nf(m.costoUsd)} $</td></tr>`)}
        </tbody></table>` : ''}
      </section>

      <form method="post" class="blocco stretto-form">
        <h2>Credito dell'IA</h2>
        <p class="nota">Anthropic è prepagato: quando il credito finisce l'IA smette di leggere i documenti. Scrivi qui quanto hai caricato
          (console.anthropic.com → Billing) e da quando: il portale sottrae la spesa stimata e avvisa quando ne resta meno del 20%.
          Dopo ogni ricarica aggiorna importo e data.</p>
        <label>Credito caricato <span class="unita">$</span><input name="creditoIa" inputmode="decimal" value="${imp.creditoIa ?? ''}" class="corto"></label>
        <label>Dal giorno <input type="date" name="creditoIaDal" value="${imp.creditoIaDal ?? ''}"></label>
        <label>Tetto di spesa mensile su Anthropic <span class="unita">$, facoltativo (console.anthropic.com → Limits)</span><input name="tettoIaMese" inputmode="decimal" value="${imp.tettoIaMese ?? ''}" class="corto"></label>
        <label>Ore di calcolo di Neon al mese <span class="unita">piano gratuito: 100</span><input name="oreNeonMese" inputmode="decimal" value="${imp.oreNeonMese ?? ''}" placeholder="100" class="corto"></label>
        <button class="primario">Salva</button>
      </form>

      <section class="blocco">
        <h2>Ultimi errori e riavvii</h2>
        ${p.eventi.length ? html`<table class="tabella"><thead><tr><th>Quando</th><th>Servizio</th><th>Cosa</th></tr></thead><tbody>
          ${p.eventi.map(e => html`<tr><td>${quando(e.il)}</td><td>${NOMI_SERVIZI[e.servizio] ?? e.servizio}</td><td>${e.messaggio}</td></tr>`)}
        </tbody></table>` : html`<p class="nota">Nessun errore registrato.</p>`}
      </section>

      <section class="blocco">
        <h2>Per vedere di più (facoltativo)</h2>
        <p class="nota">Le chiavi si mettono solo su Render (servizio casteltech-portale → Environment → Add Environment Variable), mai qui né in chat.</p>
        <ul class="nota">
          <li><code>ANTHROPIC_ADMIN_KEY</code>: chiave di amministrazione (console.anthropic.com → Settings → Admin keys, inizia con sk-ant-admin):
            il costo del mese diventa quello ufficiale di Anthropic invece della stima. Il credito rimasto Anthropic non lo dà a nessuno: resta la stima qui sopra.</li>
          <li><code>NEON_API_KEY</code> e <code>NEON_PROJECT_ID</code>: console.neon.tech → Account settings → API keys; l'ID del progetto è in Settings → General.
            Si vedono le ore di calcolo usate nel mese (limite del piano gratuito).</li>
          <li><code>RENDER_MEMORIA_MB</code> e <code>NEON_SPAZIO_MB</code>: solo se si cambia piano (oggi 512 MB di memoria e 512 MB di database).</li>
        </ul>
      </section>`, req.query.ok ? 'Salvato.' : undefined));
  });

  r.post('/', async (req, res) => {
    // "1.000,50" o "20.5": con la virgola i punti sono migliaia
    const n = (k: string) => {
      const t = String(req.body[k] ?? '').trim();
      const x = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
      return t && Number.isFinite(x) && x > 0 ? x : null;
    };
    const dal = String(req.body.creditoIaDal ?? '');
    const imp: ImpostazioniServizi = { creditoIa: n('creditoIa'), creditoIaDal: /^\d{4}-\d{2}-\d{2}$/.test(dal) ? dal : null, tettoIaMese: n('tettoIaMese'), oreNeonMese: n('oreNeonMese') };
    await salvaImpostazioniServizi(imp);
    res.redirect('/impostazioni/servizi?ok=1');
  });

  return r;
}
