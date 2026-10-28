/**
 * Stampa del preventivo per il cliente (Adriano, 28/10/2026): impaginazione come i preventivi di Fatture in Cloud
 * (logo e dati dell'azienda, destinatario, tabella Codice / Descrizione / Quantità / Prezzo unitario / Importo,
 * pagamento e totale in fondo), riquadro verde con i prezzi, condizioni generali e firma del cliente per accettazione.
 * A schermo, a sinistra, il pannello "Cosa stampare" con le quattro versioni (src/engine/stampa-preventivo.ts).
 */
import { html, euro, data, num, type Raw } from './html.js';
import { VERSIONE } from './layout.js';
import type { Risultato } from '../../engine/calcolo.js';
import type { DatiAzienda } from '../../engine/amministrazione.js';
import { riepilogo } from '../../engine/riepilogo.js';
import {
  VERSIONI_STAMPA, CONDIZIONI_GENERALI, righeDettaglio, righeUnaTantum, type VersioneStampa,
} from '../../engine/stampa-preventivo.js';

export interface ClienteStampa {
  ragione_sociale: string; partita_iva?: string | null; codice_fiscale?: string | null;
  indirizzo?: string | null; cap?: string | null; comune?: string | null; provincia?: string | null; nazione?: string | null;
  codice_sdi?: string | null; pec?: string | null; pagamento?: string | null;
}

export interface OpzioniStampa { versione: VersioneStampa; condizioni: boolean; firma: boolean }

/** Dati di Casteltech da usare se in Impostazioni → Amministrazione mancano (Adriano, 27/10/2026). */
const AZIENDA_PREDEFINITA = {
  ragione_sociale: 'CASTELTECH S.R.L.', indirizzo: 'STRADA FIORENZUOLA, 8', cap: '29014', comune: "CASTELL'ARQUATO", provincia: 'PC',
  partita_iva: '01777320332', rea: 'PC-190591', telefono: '0523 190 24 64', email: 'info@casteltech.net', pec: 'casteltech@pec.it',
};

const VUOTO = '';

export function stampaPreventivo(o: {
  p: any; d: { nSchede: number; nSchedeInPCB: number; note?: string };
  ris: Risultato; doppia: boolean; nLamine: number; nPannelli: number;
  azienda: Partial<DatiAzienda>; cliente: ClienteStampa | null; opz: OpzioniStampa;
}): Raw {
  const { p, d, ris, opz } = o;
  const r = riepilogo(ris);
  const i = p.intestazione ?? {};
  const a = o.azienda, c = o.cliente;
  const az = {
    nome: a.ragione_sociale || AZIENDA_PREDEFINITA.ragione_sociale,
    indirizzo: `${a.indirizzo || AZIENDA_PREDEFINITA.indirizzo} · ${a.cap || AZIENDA_PREDEFINITA.cap} ${a.comune || AZIENDA_PREDEFINITA.comune} (${a.provincia || AZIENDA_PREDEFINITA.provincia})`,
    piva: a.partita_iva || AZIENDA_PREDEFINITA.partita_iva,
    rea: a.rea_ufficio && a.rea_numero ? `${a.rea_ufficio}-${a.rea_numero}` : AZIENDA_PREDEFINITA.rea,
    tel: a.telefono || AZIENDA_PREDEFINITA.telefono, email: a.email || AZIENDA_PREDEFINITA.email, pec: a.pec || AZIENDA_PREDEFINITA.pec,
  };
  const numero = `${p.numero} del ${data(p.creato_il)}`;
  const qta = `${num(d.nSchede, 0)} pz`;
  const ut = righeUnaTantum(ris, { doppia: o.doppia, nLamine: o.nLamine });
  const essenziale = opz.versione === 'essenziale';
  // Essenziale: un solo prezzo; con la prima produzione comprende le una tantum (Adriano, 28/10/2026)
  const prezzoUnico = essenziale && r.unaTantum > 0;
  const totale = r.prezzoLottoConUnaTantum;

  const link = (cambia: Partial<OpzioniStampa>) => {
    const x = { ...opz, ...cambia };
    const q = new URLSearchParams({ vista: x.versione });
    if (!x.condizioni) q.set('condizioni', '0');
    if (!x.firma) q.set('firma', '0');
    return `?${q}`;
  };

  // righe della tabella principale, secondo la versione scelta
  const rigaProdotto = (prezzo: number, importo: number, sotto: Raw | string = VUOTO) => html`
    <tr class="prodotto"><td><b>${i.codice}</b>${i.revisione ? html`<br><small>rev. ${i.revisione}</small>` : ''}</td>
      <td><b>${i.descrizione}</b>${sotto}</td><td class="n">${qta}</td><td class="n">${euro(prezzo)}</td><td class="n">${euro(importo)}</td></tr>`;
  const gruppiDi = <T extends { gruppo: string; prezzo: number; nome: string }>(xs: T[]) =>
    [...new Set(xs.map(x => x.gruppo))].map(g => ({ g, righe: xs.filter(x => x.gruppo === g) }));
  const somma = (xs: { prezzo: number }[]) => xs.reduce((s, x) => s + x.prezzo, 0);
  const SIGLE: Record<string, string> = { 'COSTI UNA TANTUM': 'Acquisti (lamine, attrezzature)' };
  const nomeGruppo = (g: string) => SIGLE[g] ?? (g.charAt(0) + g.slice(1).toLowerCase()).replace(/\b(smd|tht|aoi|pcb|bot|top)\b/gi, x => x.toUpperCase());
  const n = d.nSchede || 1;

  let corpo: Raw;
  if (essenziale) {
    // sotto la descrizione solo la nota delle una tantum (Adriano, 28/10/2026: o il dettaglio con i prezzi o niente)
    corpo = rigaProdotto(prezzoUnico ? r.prezzoSchedaConUnaTantum : r.prezzoScheda, prezzoUnico ? totale : r.prezzoLotto,
      prezzoUnico ? html`<div class="sotto">Comprensivo dei costi una tantum (programmazione e attrezzaggio)</div>` : VUOTO);
  } else if (opz.versione === 'dettaglio') {
    corpo = html`${rigaProdotto(r.prezzoScheda, r.prezzoLotto)}
      ${righeDettaglio(ris).map(x => html`<tr><td></td><td>${x.nome}${x.sotto ? html`<div class="sotto">${x.sotto}</div>` : ''}</td><td></td>
        <td class="n">${euro(x.scheda)}</td><td class="n">${euro(x.lotto)}</td></tr>`)}`;
  } else {
    const fasi = ris.fasi.filter(f => !f.unaTantum && f.prezzo > 0);
    // energia insieme al materiale di consumo
    const voci = ris.voci.filter(x => !x.unaTantum && x.prezzo > 0).map(x => (x.gruppo === 'ENERGIA' ? { ...x, gruppo: 'MATERIALE DI CONSUMO' } : x));
    const gruppi = [...gruppiDi(fasi), ...gruppiDi(voci)];
    corpo = html`${rigaProdotto(r.prezzoScheda, r.prezzoLotto)}
      ${gruppi.map(({ g, righe }) => html`
        <tr class="${opz.versione === 'fasi' ? 'area' : ''}"><td></td><td>${nomeGruppo(g)}</td><td></td><td class="n">${euro(somma(righe) / n)}</td><td class="n">${euro(somma(righe))}</td></tr>
        ${opz.versione === 'fasi' ? righe.map(x => html`<tr class="fase"><td></td><td>${x.nome}</td><td></td><td></td><td class="n">${euro(x.prezzo)}</td></tr>`) : ''}`)}`;
  }
  const rigaUnaTantum = !prezzoUnico && r.unaTantum > 0 ? html`
    <tr class="prodotto"><td></td><td><b>COSTI UNA TANTUM</b> (solo primo lotto)
      <table class="ut">${ut.map(x => html`<tr><td>${x.nome}</td><td class="n">${euro(x.prezzo)}</td></tr>`)}</table></td>
      <td class="n">1</td><td class="n">${euro(r.unaTantum)}</td><td class="n">${euro(r.unaTantum)}</td></tr>` : '';

  const firme = html`<div class="firme"><div><b>${az.nome}</b></div><div><b>Per accettazione del cliente</b>Data, timbro e firma</div></div>`;
  const piede = html`<footer class="piede"><span>Preventivo nr. ${numero}</span><span>${az.nome} · ${az.email} · ${az.tel}</span></footer>`;
  const indirizzoCliente = c && (c.indirizzo || c.comune) ? html`${c.indirizzo ?? ''}<br>${[c.cap, c.comune].filter(Boolean).join(' ')}${c.provincia ? ` (${c.provincia})` : ''}${c.nazione && c.nazione !== 'IT' ? ` · ${c.nazione}` : ''}` : '';

  return html`<!doctype html>
<html lang="it"><head><meta charset="utf-8"><title>Preventivo ${p.numero} · ${i.codice}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="/static/favicon.svg"><link rel="stylesheet" href="/static/stampa-preventivo.css?v=${VERSIONE}"></head>
<body>
<div class="barra-stampa"><button id="stampa">Stampa / salva PDF</button><a href="/preventivi/${p.id}">← torna al preventivo</a></div>
<div class="schermo">
<nav class="pannello-stampa" aria-label="Cosa stampare">
  <h2>Cosa stampare</h2>
  ${VERSIONI_STAMPA.map(v => html`<a class="versione${v.codice === opz.versione ? ' scelta' : ''}" href="${link({ versione: v.codice })}">
    <b>${v.nome}</b><small>${v.spiegazione}</small></a>`)}
  <div class="aggiunte">
    <a href="${link({ condizioni: !opz.condizioni })}" class="${opz.condizioni ? 'si' : ''}">Condizioni generali</a>
    <a href="${link({ firma: !opz.firma })}" class="${opz.firma ? 'si' : ''}">Spazio firma del cliente</a>
  </div>
</nav>

<div class="fogli">
<section class="foglio">
  <header class="testa">
    <img src="/static/logo-casteltech.png" alt="Casteltech" class="logo">
    <div class="azienda"><b>${az.nome}</b><br>${az.indirizzo}<br>P.IVA e C.F. ${az.piva} · REA ${az.rea}<br>Tel. ${az.tel} · ${az.email} · PEC ${az.pec}</div>
  </header>
  <div class="titolo"><b>PREVENTIVO</b> nr. <b>${p.numero}</b> del <b>${data(p.creato_il)}</b></div>

  <div class="destinatario">
    <div><div class="etic">Destinatario</div><b>${c?.ragione_sociale ?? i.cliente}</b><br>${indirizzoCliente}</div>
    <div>${c?.partita_iva ? html`<div class="etic">Dati fiscali</div><b>P.IVA</b> ${c.partita_iva}<br>` : ''}
      ${c?.codice_fiscale && c.codice_fiscale !== c.partita_iva ? html`<b>C.F.</b> ${c.codice_fiscale}<br>` : ''}
      ${c?.codice_sdi ? html`<b>Codice SDI</b> ${c.codice_sdi}<br>` : ''}${c?.pec ? html`<b>PEC</b> ${c.pec}` : ''}</div>
  </div>

  <div class="riquadro-prezzi">
    <div><div class="etic">Prezzo a scheda${prezzoUnico ? ' (prima produzione)' : ''}</div><strong>${euro(prezzoUnico ? r.prezzoSchedaConUnaTantum : r.prezzoScheda)}</strong></div>
    <div><div class="etic">Totale lotto (${num(d.nSchede, 0)} schede${d.nSchedeInPCB > 1 ? `, ${num(o.nPannelli, 0)} pannelli` : ''})</div><strong>${euro(prezzoUnico ? totale : r.prezzoLotto)}</strong></div>
    ${!prezzoUnico && r.unaTantum > 0 ? html`<div><div class="etic">Una tantum (primo lotto)</div><strong>${euro(r.unaTantum)}</strong></div>` : ''}
  </div>

  <table class="righe">
    <thead><tr><th class="codice">Codice</th><th>Descrizione</th><th class="n">Quantità</th><th class="n">Prezzo unitario</th><th class="n">Importo</th></tr></thead>
    <tbody>${corpo}${rigaUnaTantum}</tbody>
  </table>

  ${d.note ? html`<div class="etic titoletto">Note</div><p class="note">${d.note}</p>` : ''}
  <div class="spinta"></div>
  <div class="fondo">
    <div><div class="etic">Modalità di pagamento</div><b>${c?.pagamento || 'Da concordare'}</b>
      ${a.iban ? html`<br>IBAN ${a.iban}${a.banca ? ` · ${a.banca}` : ''}` : ''}</div>
    <div class="totale"><div class="etic">Totale preventivo${r.unaTantum > 0 ? ' (primo lotto)' : ''}</div><strong>${euro(totale)}</strong><small>IVA esclusa</small></div>
  </div>
  ${opz.firma && !opz.condizioni ? firme : ''}
  ${piede}
</section>
${opz.condizioni ? html`<section class="foglio seconda">
  <header class="testa"><img src="/static/logo-casteltech.png" alt="Casteltech" class="logo piccolo">
    <div class="titolo"><b>CONDIZIONI GENERALI DI FORNITURA</b><br><small>allegate al preventivo nr. ${numero}</small></div></header>
  <ol class="condizioni">${CONDIZIONI_GENERALI.map(x => html`<li>${x}</li>`)}</ol>
  ${opz.firma ? html`<p class="accetto">Il cliente dichiara di aver letto e accettato il preventivo e le presenti condizioni generali.</p>${firme}` : ''}
  <div class="spinta"></div>
  ${piede}
</section>` : ''}
</div>
</div>
<script src="/static/stampa.js?v=${VERSIONE}" defer></script>
</body></html>`;
}
