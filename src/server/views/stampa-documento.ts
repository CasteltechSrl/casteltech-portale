/**
 * Stampe dei documenti emessi: DDT e copia di cortesia di fatture e note di credito.
 * Stampa del DDT (Adriano, 28/10/2026): pagina A4 da stampare o salvare in PDF dal browser ("Stampa / salva PDF").
 * Dati del D.P.R. 472/96: mittente, destinatario, luogo di destinazione, numero e data, causale, descrizione e quantità dei beni,
 * aspetto, colli, peso, trasporto a cura del, vettore, inizio del trasporto, firme. Senza prezzi (come il modello "DDT" di FIC).
 */
import { html, data, euro, num, type Raw } from './html.js';
import { VERSIONE } from './layout.js';
import { indirizzoSu } from '../../engine/ddt.js';
import { importoRiga, numeroCompleto, type Totali } from '../../engine/amministrazione.js';
import { importoDaIncassare, nomeTipoSdi } from '../../engine/tipi-fattura.js';

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

const MODALITA: Record<string, string> = { MP01: 'Contanti', MP02: 'Assegno', MP05: 'Bonifico', MP08: 'Carta di pagamento', MP12: 'RiBa' };

/**
 * Copia di cortesia di fattura o nota di credito (Adriano, 31/10/2026: PDF da mandare al cliente, dal browser con "Stampa / salva PDF").
 * Il documento fiscale resta l'XML inviato allo SdI: lo dice il piede. In bozza la scritta BOZZA.
 */
export function stampaFattura(d: any, righe: any[], azienda: any, cliente: any, totali: Totali, scadenze: any[], intento: any, pagamento: any): Raw {
  const titolo = d.tipo === 'nota_credito' ? 'NOTA DI CREDITO' : (nomeTipoSdi(d.tipo, d.tipo_sdi) ?? 'Fattura').toUpperCase();
  const split = !!cliente.split_payment;
  const numero = d.numero == null ? 'BOZZA' : numeroCompleto(d.numero, d.sezionale);
  const mittente = [azienda.indirizzo, [azienda.cap, azienda.comune, azienda.provincia ? `(${azienda.provincia})` : ''].filter(Boolean).join(' ')].filter(Boolean).join(' - ');
  const rea = azienda.rea_numero ? `REA ${azienda.rea_ufficio ? `${azienda.rea_ufficio}-` : ''}${azienda.rea_numero}` : '';
  const timbro = d.numero == null ? 'BOZZA' : d.stato === 'scartato' ? 'SCARTATA' : '';
  const percentuale = (codice: string | null) => totali.riepilogo.find(g => g.aliquota === codice);
  return html`<!doctype html>
<html lang="it"><head><meta charset="utf-8"><title>${titolo} ${numero} · ${cliente.ragione_sociale ?? ''}</title>
<link rel="icon" href="/static/favicon.svg"><link rel="stylesheet" href="/static/stampa.css?v=${VERSIONE}"></head>
<body>
<div class="barra-stampa"><button id="stampa">Stampa / salva PDF</button>
  <a href="/amministrazione/documenti/${d.id}">← torna al documento</a></div>
<section class="pagina ddt-stampa fattura-stampa">
  ${timbro ? html`<div class="timbro-stampa">${timbro}</div>` : ''}
  <div class="testata-stampa">
    <div class="mittente-stampa"><img src="/static/logo-casteltech.png" alt="Casteltech" class="logo">
      <div><strong>${azienda.ragione_sociale ?? ''}</strong><br>${mittente}<br>
        P.IVA ${azienda.partita_iva ?? ''}${azienda.codice_fiscale && azienda.codice_fiscale !== azienda.partita_iva ? ` · C.F. ${azienda.codice_fiscale}` : ''}${rea ? ` · ${rea}` : ''}<br>
        ${[azienda.telefono && `Tel. ${azienda.telefono}`, azienda.email, azienda.pec && `PEC ${azienda.pec}`].filter(Boolean).join(' · ')}</div></div>
    <div class="titolo-stampa">${titolo}<br><span>N. <strong>${numero}</strong> del ${data(d.data)}</span></div>
  </div>
  <table class="griglia"><colgroup><col class="meta"><col class="meta"></colgroup>
    <tr><td><div class="etic">Cliente</div><div class="val">${cliente.ragione_sociale ?? ''}</div>
        <div class="indirizzo-stampa">${righeTesto(indirizzoSu(cliente))}${cliente.partita_iva ? html`P.IVA ${cliente.partita_iva}<br>` : ''}${cliente.codice_fiscale && cliente.codice_fiscale !== cliente.partita_iva ? html`C.F. ${cliente.codice_fiscale}` : ''}</div></td>
      <td><div class="etic">Recapito per la fattura elettronica</div>
        <div class="indirizzo-stampa">${cliente.codice_sdi ? html`Codice destinatario ${cliente.codice_sdi}<br>` : ''}${cliente.pec ? html`PEC ${cliente.pec}<br>` : ''}
          ${d.riferimento_esterno ? html`<br>Rif. ordine: ${d.riferimento_esterno}${d.data_ordine ? ` del ${data(String(d.data_ordine).slice(0, 10))}` : ''}` : ''}
          ${d.cig ? html`<br>CIG ${d.cig}` : ''}${d.cup ? html` · CUP ${d.cup}` : ''}</div></td></tr>
  </table>
  ${d.causale ? html`<p class="causale-stampa">${d.causale}</p>` : ''}
  <table class="righe-ddt righe-fattura">
    <thead><tr><th class="cod">Codice</th><th>Descrizione</th><th class="um">U.m.</th><th class="q">Q.tà</th><th class="q">Prezzo</th><th class="um">Sc. %</th><th class="q">Importo</th><th class="um">IVA</th></tr></thead>
    <tbody>${righe.map(r => r.solo_descrizione
      ? html`<tr><td></td><td colspan="7"><em>${r.descrizione}</em></td></tr>`
      : html`<tr><td class="cod">${r.codice ?? ''}</td><td>${r.descrizione}</td><td class="um">${r.um ?? ''}</td>
        <td class="q">${num(Number(r.quantita), Number(r.quantita) % 1 ? 2 : 0)}</td><td class="q">${euro(Number(r.prezzo))}</td>
        <td class="um">${Number(r.sconto) ? num(Number(r.sconto)) : ''}</td><td class="q">${euro(importoRiga(r))}</td>
        <td class="um">${(() => { const g = percentuale(r.aliquota_iva); return g ? (g.percentuale ? `${num(g.percentuale, 0)}%` : g.natura) : ''; })()}</td></tr>`)}</tbody>
  </table>
  <div class="totali-fattura">
    <table class="riepilogo-iva">
      <thead><tr><th>Aliquota / natura</th><th class="q">Imponibile</th><th class="q">Imposta</th></tr></thead>
      <tbody>${totali.riepilogo.map(g => html`<tr><td>${g.percentuale ? `IVA ${num(g.percentuale, 0)}%` : `${g.natura} - ${g.riferimento_normativo ?? ''}`}</td>
        <td class="q">${euro(g.imponibile)}</td><td class="q">${euro(g.imposta)}</td></tr>`)}</tbody>
    </table>
    <table class="somme">
      <tr><td>Imponibile</td><td class="q">${euro(totali.imponibile)}</td></tr>
      <tr><td>IVA</td><td class="q">${euro(totali.imposta)}</td></tr>
      ${totali.bollo ? html`<tr><td>Bollo virtuale</td><td class="q">${euro(totali.bollo)}</td></tr>` : ''}
      <tr class="totale"><td>Totale documento</td><td class="q">${euro(totali.totale)}</td></tr>
      ${split ? html`<tr><td>IVA versata dal cliente (split payment)</td><td class="q">- ${euro(totali.imposta)}</td></tr>
      <tr class="totale"><td>Netto da pagare</td><td class="q">${euro(importoDaIncassare(totali, true))}</td></tr>` : ''}
    </table>
  </div>
  ${intento ? html`<p class="nota-stampa">Operazione non imponibile art. 8 c. 1 lett. c D.P.R. 633/72: lettera d'intento prot. ${intento.protocollo} del ${data(intento.data_protocollo)}.</p>` : ''}
  ${split ? html`<p class="nota-stampa">Scissione dei pagamenti (split payment) art. 17-ter D.P.R. 633/72: l'IVA è versata dal cliente all'Erario.</p>` : ''}
  ${totali.bollo ? html`<p class="nota-stampa">Imposta di bollo assolta in modo virtuale ai sensi del D.M. 17/06/2014.</p>` : ''}
  ${d.tipo === 'fattura' ? html`<table class="griglia"><colgroup><col class="meta"><col class="meta"></colgroup>
    <tr><td><div class="etic">Pagamento</div><div class="val">${pagamento?.descrizione ?? ''}</div>
        ${scadenze.length ? html`<div class="indirizzo-stampa">${scadenze.map(x => html`Scadenza ${data(x.data)}: ${euro(Number(x.importo))}<br>`)}</div>` : ''}</td>
      <td><div class="etic">Coordinate bancarie</div><div class="indirizzo-stampa">${pagamento?.modalita === 'MP05' || !pagamento ? html`${azienda.banca ?? ''}<br>IBAN ${azienda.iban ?? ''}`
        : MODALITA[pagamento.modalita] ?? ''}</div></td></tr>
  </table>` : ''}
  <p class="piede">Copia di cortesia: il documento fiscale è il file XML trasmesso al Sistema di Interscambio ed è disponibile nell'area riservata del sito dell'Agenzia delle Entrate.</p>
</section>
<script src="/static/stampa.js?v=${VERSIONE}" defer></script>
</body></html>`;
}
