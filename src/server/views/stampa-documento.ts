/**
 * Stampa del DDT (Adriano, 28/10/2026): pagina A4 da stampare o salvare in PDF dal browser ("Stampa / salva PDF").
 * Dati del D.P.R. 472/96: mittente, destinatario, luogo di destinazione, numero e data, causale, descrizione e quantità dei beni,
 * aspetto, colli, peso, trasporto a cura del, vettore, inizio del trasporto, firme. Senza prezzi (come il modello "DDT" di FIC).
 */
import { html, data, num, type Raw } from './html.js';
import { VERSIONE } from './layout.js';
import { indirizzoSu } from '../../engine/ddt.js';
import { numeroCompleto } from '../../engine/amministrazione.js';

const righeTesto = (s: string | null | undefined) => String(s ?? '').split('\n').filter(Boolean).map(r => html`${r}<br>`);

export function stampaDdt(d: any, righe: any[], azienda: any, destinatario: any): Raw {
  const t = d.dati_trasporto ?? {};
  const numero = d.numero == null ? 'BOZZA' : numeroCompleto(d.numero, d.sezionale);
  const inizio = t.inizio ? `${data(t.inizio.slice(0, 10))} ore ${t.inizio.slice(11, 16)}` : '';
  const mittente = [azienda.indirizzo, [azienda.cap, azienda.comune, azienda.provincia ? `(${azienda.provincia})` : ''].filter(Boolean).join(' ')].filter(Boolean).join(' - ');
  const timbro = d.numero == null ? 'BOZZA' : d.stato === 'annullato' ? 'ANNULLATO' : '';
  return html`<!doctype html>
<html lang="it"><head><meta charset="utf-8"><title>DDT ${numero} · ${destinatario.ragione_sociale ?? ''}</title>
<link rel="icon" href="/static/favicon.svg"><link rel="stylesheet" href="/static/stampa.css?v=${VERSIONE}"></head>
<body>
<div class="barra-stampa"><button id="stampa">Stampa / salva PDF</button>
  <a href="/amministrazione/documenti/${d.id}">← torna al DDT</a></div>
<section class="pagina ddt-stampa">
  ${timbro ? html`<div class="timbro-stampa">${timbro}</div>` : ''}
  <div class="testata-stampa">
    <div class="mittente-stampa"><img src="/static/logo-casteltech.png" alt="Casteltech" class="logo">
      <div><strong>${azienda.ragione_sociale ?? ''}</strong><br>${mittente}<br>
        P.IVA ${azienda.partita_iva ?? ''}${azienda.telefono ? ` · Tel. ${azienda.telefono}` : ''}${azienda.email ? ` · ${azienda.email}` : ''}</div></div>
    <div class="titolo-stampa">DOCUMENTO DI TRASPORTO<br><span>D.P.R. 472/96</span><br><span>N. <strong>${numero}</strong> del ${data(d.data)}</span></div>
  </div>
  <table class="griglia"><colgroup><col class="meta"><col class="meta"></colgroup>
    <tr><td><div class="etic">Destinatario</div><div class="val">${destinatario.ragione_sociale ?? ''}</div>
        <div class="indirizzo-stampa">${righeTesto(indirizzoSu(destinatario))}${destinatario.partita_iva ? html`P.IVA ${destinatario.partita_iva}` : ''}</div></td>
      <td><div class="etic">Luogo di destinazione</div>
        <div class="indirizzo-stampa">${t.destinazione ? righeTesto(t.destinazione) : 'COME DESTINATARIO'}</div></td></tr>
  </table>
  <table class="griglia"><colgroup><col class="c1"><col class="c2"><col class="c3"><col class="c4"></colgroup>
    <tr><td><div class="etic">Causale del trasporto</div><div class="val">${t.causale ?? ''}</div></td>
      <td><div class="etic">Riferimento</div><div class="val">${d.riferimento_esterno ?? ''}</div></td>
      <td><div class="etic">Porto</div><div class="val">${t.porto ?? ''}</div></td>
      <td><div class="etic">Trasporto a cura del</div><div class="val">${t.a_cura ?? ''}</div></td></tr>
  </table>
  <table class="righe-ddt">
    <thead><tr><th class="cod">Codice</th><th>Descrizione dei beni</th><th class="um">U.m.</th><th class="q">Quantità</th></tr></thead>
    <tbody>${righe.map(r => r.solo_descrizione
      ? html`<tr><td></td><td colspan="3"><em>${r.descrizione}</em></td></tr>`
      : html`<tr><td class="cod">${r.codice ?? ''}</td><td>${r.descrizione}</td><td class="um">${r.um ?? ''}</td><td class="q">${num(Number(r.quantita), Number(r.quantita) % 1 ? 2 : 0)}</td></tr>`)}</tbody>
  </table>
  <table class="griglia piede-ddt"><colgroup><col class="c1"><col class="c2"><col class="c3"><col class="c4"></colgroup>
    <tr><td><div class="etic">Aspetto esteriore dei beni</div><div class="val">${t.aspetto ?? ''}</div></td>
      <td><div class="etic">N. colli</div><div class="val">${t.colli ?? ''}</div></td>
      <td><div class="etic">Peso</div><div class="val">${t.peso ?? ''}</div></td>
      <td><div class="etic">Data e ora inizio trasporto</div><div class="val">${inizio}</div></td></tr>
    <tr><td colspan="2"><div class="etic">Vettore</div><div class="val">${t.trasportatore ?? ''}</div></td>
      <td><div class="etic">Firma del conducente / vettore</div><div class="firma"></div></td>
      <td><div class="etic">Firma del destinatario</div><div class="firma"></div></td></tr>
  </table>
</section>
<script src="/static/stampa.js?v=${VERSIONE}" defer></script>
</body></html>`;
}
