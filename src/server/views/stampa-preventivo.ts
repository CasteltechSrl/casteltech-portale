/**
 * Stampa del preventivo per il cliente (Adriano, 28/10/2026): impaginazione come i preventivi di Fatture in Cloud
 * (logo e dati dell'azienda, destinatario, tabella Codice / Descrizione / Quantità / Prezzo unitario / Importo,
 * pagamento e totale in fondo), riquadro verde con i prezzi, condizioni generali e firma del cliente per accettazione.
 * A schermo, a sinistra, il pannello "Cosa stampare" con le quattro versioni (src/engine/stampa-preventivo.ts).
 */
import { html, euro, data, num, raw, type Raw } from './html.js';
import { VERSIONE } from './layout.js';
import { riquadroInvio } from './invio.js';
import type { Risultato } from '../../engine/calcolo.js';
import type { DatiAzienda } from '../../engine/amministrazione.js';
import { riepilogo } from '../../engine/riepilogo.js';
import { noteDaStampare } from '../../engine/non-quotati.js';
import {
  VERSIONI_STAMPA, CONDIZIONI_GENERALI, SETTIMANE_MAX, acquistoMateriale, contenutoStampa, materialeVenduto, testoConsegna, validitaOfferta,
  type Ritocchi, type VersioneStampa,
} from '../../engine/stampa-preventivo.js';
import { FOGLIO_COMPONENTI, fraseAlternative, type AlternativaDaConfermare, type ComponenteDaVerificare } from '../../engine/alternative-cliente.js';

export interface ClienteStampa {
  ragione_sociale: string; partita_iva?: string | null; codice_fiscale?: string | null;
  indirizzo?: string | null; cap?: string | null; comune?: string | null; provincia?: string | null; nazione?: string | null;
  codice_sdi?: string | null; pec?: string | null; pagamento?: string | null;
}

export interface EmailStampa {
  a: string; oggetto: string; testo: string; attivo: boolean; mittente: string; stato: string;
  richiesta: { mittente: string; oggetto: string } | null;
  email_a: string | null; email_inviata_il: Date | string | null; inviato_a_mano?: boolean;
}

/** ut = dettaglio dei costi una tantum (Adriano 4/11/2026; `?ut=0` lo toglie) */
/** allegato = ultima pagina con alternative da confermare e problemi di acquisto (Adriano 5/11/2026: sempre, `?allegato=0` la toglie) */
export interface OpzioniStampa { versione: VersioneStampa; condizioni: boolean; firma: boolean; ut: boolean; allegato?: boolean }

/** Scelte della stampa nell'indirizzo (solo quelle diverse dal solito). */
export function parametriStampa(x: OpzioniStampa): Record<string, string> {
  return { vista: x.versione, ...(x.condizioni ? {} : { condizioni: '0' }), ...(x.firma ? {} : { firma: '0' }), ...(x.ut ? {} : { ut: '0' }), ...(x.allegato === false ? { allegato: '0' } : {}) };
}
/** Righe vuote del modulo per aggiungere righe alla stampa. */
const RIGHE_VUOTE = 2;

/** Dati di Casteltech da usare se in Impostazioni → Amministrazione mancano (Adriano, 27/10/2026). */
export const AZIENDA_PREDEFINITA = {
  ragione_sociale: 'CASTELTECH S.R.L.', indirizzo: 'STRADA FIORENZUOLA, 8', cap: '29014', comune: "CASTELL'ARQUATO", provincia: 'PC',
  partita_iva: '01777320332', rea: 'PC-190591', telefono: '0523 190 24 64', email: 'info@casteltech.net', pec: 'casteltech@pec.it',
};

const VUOTO = '';

/**
 * Prezzi scritti a mano su un preventivo poi cambiato (controllo del 4/11/2026): quando si scrivono si ricorda il prezzo calcolato e le schede
 * di quel momento (`stampa.riferimento`); se oggi sono diversi, avviso rosso accanto alle caselle.
 */
function prezziDaRicontrollare(rif: { scheda?: number; n?: number } | undefined, rit: Ritocchi, scheda: number, n: number): Raw {
  if (!rif || (rit.prezzi.senza == null && rit.prezzi.con == null)) return html``;
  if (Math.abs(Number(rif.scheda) - scheda) < 0.005 && Number(rif.n) === n) return html``;
  return html`<p class="avviso">Il preventivo è cambiato dopo che hai scritto questi prezzi (allora ${num(Number(rif.n) || 0, 0)} schede a ${num(Number(rif.scheda) || 0, 2)} €,
    oggi ${num(n, 0)} schede a ${num(scheda, 2)} €): controllali, oppure svuota le caselle per usare quelli calcolati.</p>`;
}

export function stampaPreventivo(o: {
  p: any; d: { nSchede: number; nSchedeInPCB: number; note?: string };
  ris: Risultato; doppia: boolean; nLamine: number; nPannelli: number;
  azienda: Partial<DatiAzienda>; cliente: ClienteStampa | null; opz: OpzioniStampa; rit: Ritocchi;
  /** spunta "Componenti" del preventivo: proposta "il materiale lo compriamo noi" nei tempi di consegna */
  acquisto?: boolean;
  /** invio per email da preventivi@ (Adriano 4/11/2026): proposta dell'email; null = niente riquadro */
  email?: EmailStampa | null;
  /** messaggio dopo un'azione (email partita, errore) */
  messaggio?: string;
  /** componenti non quotati perché non disponibili: stampati sempre nelle note (Adriano 4/11/2026) */
  nonQuotati?: string[];
  /** codici alternativi alla BOM da far confermare al cliente (Adriano 5/11/2026): frase sotto le righe + foglio in coda */
  alternative?: AlternativaDaConfermare[];
  /** componenti non trovati o con problemi di acquisto (Adriano 5/11/2026), nello stesso foglio */
  problemiAcquisto?: ComponenteDaVerificare[];
}): Raw {
  const { p, d, ris, opz, nonQuotati } = o;
  const conAllegato = opz.allegato !== false;
  const alternative = conAllegato ? o.alternative ?? [] : [];
  const problemi = conAllegato ? o.problemiAcquisto ?? [] : [];
  const daComponenti = (o.alternative?.length ?? 0) + (o.problemiAcquisto?.length ?? 0);
  const validita = validitaOfferta(p.creato_il, materialeVenduto(ris));
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
  const salvatoIl = p.aggiornato_il ? new Date(p.aggiornato_il).toLocaleString('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', ' alle') : '';
  const qta = `${num(d.nSchede, 0)} pz`;
  // righe, riquadro verde e totale: gli stessi del PDF mandato per email (engine/stampa-preventivo.ts `contenutoStampa`)
  const rit = o.rit;
  const cont = contenutoStampa({ ris, nSchede: d.nSchede, doppia: o.doppia, nLamine: o.nLamine, versione: opz.versione, rit, descrizione: i.descrizione ?? '', dettaglioUnaTantum: opz.ut });
  const riquadro = cont.riquadro;
  const scontato = cont.scontato ? ' scontato' : '';
  // tempi di consegna (Adriano 4/11/2026): obbligatori prima di stampare o mandare, sempre "circa"
  const acquisto = acquistoMateriale(rit.consegna, !!o.acquisto);
  const consegna = testoConsegna(rit.consegna, !!o.acquisto);
  const menuSettimane = (nome: string, scelta: number | null, etichetta: string) => html`<select name="${nome}" aria-label="${etichetta}">
    <option value="">— scegli —</option>${Array.from({ length: SETTIMANE_MAX }, (_, k) => k + 1).map(n =>
      html`<option value="${n}"${scelta === n ? html` selected` : ''}>circa ${n} ${n === 1 ? 'settimana' : 'settimane'}</option>`)}</select>`;

  const link = (cambia: Partial<OpzioniStampa>) => {
    const x = { ...opz, ...cambia };
    return `?${new URLSearchParams(parametriStampa(x))}`;
  };

  const sotto = (t?: string) => (t ? html`<div class="sotto">${t}</div>` : VUOTO);
  const corpo = cont.righe.map(x => {
    switch (x.tipo) {
      case 'prodotto': return html`
    <tr class="prodotto"><td><b>${i.codice}</b>${i.revisione ? html`<br><small>rev. ${i.revisione}</small>` : ''}</td>
      <td><b>${i.descrizione}</b>${sotto(x.sotto)}</td><td class="n">${qta}</td><td class="n">${euro(x.prezzo)}</td><td class="n">${euro(x.importo)}</td></tr>`;
      case 'voce': return html`<tr class="${x.stile}"><td></td><td>${x.descrizione}${sotto(x.sotto)}</td><td></td>
        <td class="n">${x.prezzo == null ? '' : euro(x.prezzo)}</td><td class="n">${euro(x.importo)}</td></tr>`;
      case 'unaTantum': return html`
    <tr class="prodotto"><td></td><td><b>COSTI UNA TANTUM</b> (solo primo lotto)
      ${x.voci.length ? html`<table class="ut">${x.voci.map(v => html`<tr><td>${v.nome}</td><td class="n">${euro(v.prezzo)}</td></tr>`)}</table>` : ''}</td>
      <td class="n">1</td><td class="n">${euro(x.prezzo)}</td><td class="n">${euro(x.importo)}</td></tr>`;
      case 'aggiunta': return html`<tr class="prodotto"><td></td><td><b>${x.descrizione}</b></td><td class="n">${num(x.quantita, x.quantita % 1 ? 2 : 0)}</td>
      <td class="n">${euro(x.prezzo)}</td><td class="n">${euro(x.importo)}</td></tr>`;
      case 'sconto': return html`<tr class="prodotto sconto"><td></td><td><b>${x.descrizione}</b></td><td></td><td></td><td class="n">− ${euro(x.importo)}</td></tr>`;
    }
  });
  const noteStampate = noteDaStampare(rit.noteCliente, rit.noteInterne, d.note ?? '', nonQuotati ?? []);
  const valoreRiga = (k: number, campo: 'descrizione' | 'quantita' | 'prezzo') => {
    const x = rit.righe[k];
    if (!x) return '';
    return campo === 'descrizione' ? x.descrizione : String(x[campo]).replace('.', ',');
  };

  const firme = html`<div class="firme"><div><b>${az.nome}</b></div><div><b>Per accettazione del cliente</b>Data, timbro e firma</div></div>`;
  const piede = html`<footer class="piede"><span>Preventivo nr. ${numero}</span><span>${az.nome} · ${az.email} · ${az.tel}</span></footer>`;
  const indirizzoCliente = c && (c.indirizzo || c.comune) ? html`${c.indirizzo ?? ''}<br>${[c.cap, c.comune].filter(Boolean).join(' ')}${c.provincia ? ` (${c.provincia})` : ''}${c.nazione && c.nazione !== 'IT' ? ` · ${c.nazione}` : ''}` : '';

  return html`<!doctype html>
<html lang="it"><head><meta charset="utf-8"><title>Preventivo ${p.numero} · ${i.codice}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="/static/favicon.svg"><link rel="stylesheet" href="/static/stampa-preventivo.css?v=${VERSIONE}"></head>
<body data-versione-url="/preventivi/${p.id}/stampa/versione"${consegna ? '' : raw(' data-manca-consegna="1"')}>
<div class="barra-stampa"><button id="stampa">Stampa / salva PDF</button>
  ${o.email ? html`<a class="bottone-email" href="#invia-email">✉ Invia per email</a>` : ''}
  ${o.email?.email_inviata_il ? html`<span class="inviato" title="${o.email.email_a ?? ''}">✓ Inviato il ${new Date(o.email.email_inviata_il).toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' })}${o.email.email_a ? ` a ${o.email.email_a}` : ''}</span>` : ''}
  <a href="/preventivi/${p.id}">← torna al preventivo</a>
  ${salvatoIl ? html`<span class="salvato">Versione salvata il ${salvatoIl}: le modifiche non salvate nel preventivo non compaiono</span>` : ''}</div>
${o.messaggio ? html`<div class="messaggio-stampa">${o.messaggio}</div>` : ''}
${consegna ? '' : html`<div class="messaggio-stampa manca-consegna">Prima di stampare o mandare il preventivo scegli i <a href="#tempi-consegna">tempi di consegna</a> (a sinistra) e premi "Aggiorna la stampa".</div>`}
<div class="schermo">
<nav class="pannello-stampa" aria-label="Cosa stampare">
  <h2>Cosa stampare</h2>
  ${VERSIONI_STAMPA.map(v => html`<a class="versione${v.codice === opz.versione ? ' scelta' : ''}" href="${link({ versione: v.codice })}">
    <b>${v.nome}</b><small>${v.spiegazione}</small></a>`)}
  <div class="aggiunte">
    <a href="${link({ condizioni: !opz.condizioni })}" class="${opz.condizioni ? 'si' : ''}">Condizioni generali</a>
    <a href="${link({ firma: !opz.firma })}" class="${opz.firma ? 'si' : ''}">Spazio firma del cliente</a>
    ${r.unaTantum > 0 && opz.versione !== 'essenziale' ? html`<a href="${link({ ut: !opz.ut })}" class="${opz.ut ? 'si' : ''}" title="Voci sotto i costi una tantum (documentazione, programmazione, lamina…)">Dettaglio dei costi una tantum</a>` : ''}
    ${daComponenti ? html`<a href="${link({ allegato: !conAllegato })}" class="${conAllegato ? 'si' : ''}" title="Ultima pagina: codici alternativi da confermare e componenti non trovati o con problemi di acquisto">Pagina componenti (alternative e problemi di acquisto)</a>` : ''}
  </div>
  <form class="ritocchi" method="post" action="/preventivi/${p.id}/stampa">
    <h2>Ritocchi per il cliente</h2>
    <p class="aiuto">Valgono solo in questa stampa: il preventivo non cambia.</p>
    <input type="hidden" name="torna" value="${link({})}">
    <fieldset id="tempi-consegna" class="${consegna ? '' : 'da-scegliere'}"><legend>Tempi di consegna (obbligatori)</legend>
      <label class="spunta"><input type="radio" name="consegnaAcquisto" value="no"${acquisto ? '' : html` checked`}> Materiale del cliente (conto lavoro)</label>
      <label class="spunta"><input type="radio" name="consegnaAcquisto" value="si"${acquisto ? html` checked` : ''}> Il materiale lo compriamo noi</label>
      <label class="solo-acquisto">Arrivo del materiale ${menuSettimane('settimaneMateriale', rit.consegna.materiale, 'Settimane per l\'arrivo del materiale')}</label>
      <label><span class="solo-acquisto">Montaggio</span><span class="solo-conto-lavoro">Montaggio dall'arrivo del materiale</span> ${menuSettimane('settimaneMontaggio', rit.consegna.montaggio, 'Settimane per il montaggio')}</label>
      <small>${consegna ? html`In stampa: <b>${consegna}</b>.` : 'Da scegliere: senza i tempi non si stampa e non si manda.'}</small>
    </fieldset>
    <fieldset><legend>Prezzi a scheda</legend>
      <label>Senza una tantum <input name="prezzoSenza" inputmode="decimal" value="${rit.prezzi.senza != null ? String(rit.prezzi.senza).replace('.', ',') : ''}" placeholder="${num(r.prezzoScheda, 2)}"></label>
      ${r.unaTantum > 0 || rit.prezzi.con != null ? html`<label>Con le una tantum <input name="prezzoCon" inputmode="decimal" value="${rit.prezzi.con != null ? String(rit.prezzi.con).replace('.', ',') : ''}" placeholder="${num(r.prezzoSchedaConUnaTantum, 2)}"></label>` : ''}
      <small>Vuoto = prezzo calcolato (in grigio). Scrivi una cifra diversa (es. 174) e premi "Aggiorna la stampa": righe e totale cambiano di conseguenza.</small>
      ${prezziDaRicontrollare(p.stampa?.riferimento, rit, r.prezzoScheda, o.d.nSchede)}
    </fieldset>
    <label>Note per il cliente<textarea name="noteCliente" rows="4">${rit.noteCliente}</textarea></label>
    <label class="spunta"><input type="checkbox" name="noteInterne" value="si"${rit.noteInterne ? html` checked` : ''}> Stampa anche le note interne del preventivo</label>
    <fieldset><legend>Sconto</legend>
      <input name="scontoValore" inputmode="decimal" value="${rit.sconto ? String(rit.sconto.valore).replace('.', ',') : ''}" placeholder="0" aria-label="Sconto">
      <select name="scontoTipo" aria-label="Tipo di sconto"><option value="percento"${rit.sconto?.tipo !== 'euro' ? html` selected` : ''}>% su tutto</option>
        <option value="euro"${rit.sconto?.tipo === 'euro' ? html` selected` : ''}>€ sul totale</option></select>
    </fieldset>
    <fieldset><legend>Righe in più</legend>
      ${Array.from({ length: rit.righe.length + RIGHE_VUOTE }, (_, k) => html`<div class="riga-in-piu">
        <input name="rigaDescrizione" value="${valoreRiga(k, 'descrizione')}" placeholder="Descrizione" aria-label="Descrizione">
        <input name="rigaQuantita" inputmode="decimal" value="${valoreRiga(k, 'quantita')}" placeholder="Q.tà" aria-label="Quantità">
        <input name="rigaPrezzo" inputmode="decimal" value="${valoreRiga(k, 'prezzo')}" placeholder="€ cad." aria-label="Prezzo unitario"></div>`)}
      <small>Per togliere una riga cancella la descrizione.</small>
    </fieldset>
    <button type="submit">Aggiorna la stampa</button>
  </form>
  ${o.email ? html`<section class="invia-email" id="invia-email">
    <h2>Invia per email</h2>
    ${riquadroInvio({ tipo: 'preventivo', stato: o.email.stato, email_a: o.email.email_a, email_inviata_il: o.email.email_inviata_il, inviato_a_mano: o.email.inviato_a_mano },
      { segna: `/preventivi/${p.id}/segna-inviato`, torna: `/preventivi/${p.id}/stampa${link({})}`, cosa: 'preventivo' })}
    ${o.email.stato === 'da_validare' ? html`<p class="aiuto"><b>Preventivo da validare</b>: controllalo e salvalo, poi si può mandare.</p>` : html`
    <form method="post" action="/preventivi/${p.id}/email" data-conferma="Mandare il preventivo per email con il PDF allegato (${VERSIONI_STAMPA.find(v => v.codice === opz.versione)?.nome ?? ''})?">
      <input type="hidden" name="vista" value="${opz.versione}"><input type="hidden" name="condizioni" value="${opz.condizioni ? '1' : '0'}"><input type="hidden" name="firma" value="${opz.firma ? '1' : '0'}"><input type="hidden" name="ut" value="${opz.ut ? '1' : '0'}"><input type="hidden" name="allegato" value="${conAllegato ? '1' : '0'}">
      ${o.email.richiesta ? html`<p class="aiuto">Risposta alla richiesta "${o.email.richiesta.oggetto}" di ${o.email.richiesta.mittente}.</p>` : ''}
      <label>A <input name="a" value="${o.email.a}" placeholder="indirizzo@cliente.it (più indirizzi con la virgola)"></label>
      <label>Cc <input name="cc" value=""></label>
      <label>Oggetto <input name="oggetto" value="${o.email.oggetto}"></label>
      <label>Testo <textarea name="testo" rows="8">${o.email.testo}</textarea></label>
      <p class="aiuto">Allegato: il ${consegna ? html`<a href="/preventivi/${p.id}/pdf${link({})}" target="_blank" rel="noopener">PDF</a>` : 'PDF'} come questa stampa (versione, condizioni, firma, dettaglio una tantum e ritocchi salvati).
        ${o.email.attivo ? html`Parte da <b>${o.email.mittente}</b>.` : html`<b>Invio con Gmail non attivo</b> (mancano GMAIL_MITTENTE o la chiave Google su Render): scarica il PDF e mandalo dalla posta.`}</p>
      ${consegna ? '' : html`<p class="aiuto manca"><b>Mancano i tempi di consegna</b>: sceglili qui sopra e premi "Aggiorna la stampa".</p>`}
      <button type="submit" ${o.email.attivo && consegna ? '' : raw('disabled')}>${o.email.email_inviata_il ? 'Manda di nuovo' : 'Invia con Gmail'}</button>
    </form>`}
  </section>` : ''}
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

  <table class="righe">
    <thead><tr><th class="codice">Codice</th><th>Descrizione</th><th class="n">Quantità</th><th class="n">Prezzo unitario</th><th class="n">Importo</th></tr></thead>
    <tbody>${corpo}</tbody>
  </table>

  ${noteStampate ? html`<div class="etic titoletto">Note</div><p class="note">${noteStampate}</p>` : ''}
  ${alternative.length || problemi.length ? html`<p class="avviso-alternative">${fraseAlternative(alternative.length, problemi.length)}</p>` : ''}
  <div class="spinta"></div>
  <div class="riquadro-prezzi">
    <div><div class="etic">Prezzo a scheda${scontato}${riquadro.con != null ? ' senza costi una tantum' : ''}</div><strong>${euro(riquadro.senza)}</strong></div>
    ${riquadro.con != null ? html`<div><div class="etic">Prezzo a scheda${scontato} con i costi una tantum (primo lotto, ${num(d.nSchede, 0)} schede)</div><strong>${euro(riquadro.con)}</strong></div>` : ''}
  </div>
  <div class="consegna-validita">
    ${consegna ? html`<div class="consegna-stampa"><div class="etic">Tempi di consegna</div><b>${consegna}</b></div>` : ''}
    <div class="validita-stampa"><div class="etic">Validità dell'offerta</div>${validita.map((v, k) => html`${k ? html`<br>` : ''}<b>${v}</b>`)}</div>
  </div>
  <div class="fondo">
    <div><div class="etic">Modalità di pagamento</div><b>${c?.pagamento || 'Da concordare'}</b>
      ${a.iban ? html`<br>IBAN ${a.iban}${a.banca ? ` · ${a.banca}` : ''}` : ''}</div>
    <div class="totale"><div class="etic">Totale preventivo${r.unaTantum > 0 ? ' (primo lotto)' : ''}</div><strong>${euro(cont.totale)}</strong><small>IVA esclusa</small></div>
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
${alternative.length || problemi.length ? html`<section class="foglio alternative">
  <header class="testa"><img src="/static/logo-casteltech.png" alt="Casteltech" class="logo piccolo">
    <div class="titolo"><b>${FOGLIO_COMPONENTI.toUpperCase()}</b><br><small>allegato al preventivo nr. ${numero} · ${i.codice ?? ''}${i.revisione ? ` rev. ${i.revisione}` : ''}</small></div></header>
  ${alternative.length ? html`<h3 class="titolo-sezione">Codici alternativi da confermare</h3>
  <p class="spiega-alternative">Per questi componenti proponiamo un codice diverso da quello della BOM, con le stesse caratteristiche
    (non disponibile o più conveniente). Il prezzo del preventivo è calcolato con il codice alternativo. Indicate per ogni riga
    se lo accettate: senza conferma acquistiamo il codice della BOM, se disponibile, e il prezzo può cambiare.</p>
  <table class="righe tabella-alternative">
    <thead><tr><th>Riferimenti</th><th>Codice della BOM</th><th>Codice alternativo proposto</th><th>Descrizione</th><th class="n">Q.tà/scheda</th><th class="conferma">Confermato</th></tr></thead>
    <tbody>${alternative.map(x => html`<tr>
      <td>${x.riferimenti}</td>
      <td><b>${x.pnBom}</b>${x.produttoreBom ? html`<br><small>${x.produttoreBom}</small>` : ''}</td>
      <td><b>${x.alternativa}</b>${x.produttoreAlternativa ? html`<br><small>${x.produttoreAlternativa}</small>` : ''}</td>
      <td><small>${x.descrizione}</small></td><td class="n">${num(x.qtaScheda, x.qtaScheda % 1 ? 2 : 0)}</td>
      <td class="conferma">☐ Sì&nbsp;&nbsp;☐ No</td></tr>`)}</tbody>
  </table>` : ''}
  ${problemi.length ? html`<h3 class="titolo-sezione">Componenti non trovati o con problemi di acquisto</h3>
  <p class="spiega-alternative">Componenti della BOM che non abbiamo trovato o che hanno una disponibilità da verificare al momento dell'offerta.
    Quelli "non quotati" non sono compresi nel prezzo: potete fornirli voi, indicarci un codice equivalente o chiederci di cercarlo.</p>
  <table class="righe tabella-alternative">
    <thead><tr><th>Riferimenti</th><th>Codice della BOM</th><th>Descrizione</th><th class="n">Q.tà/scheda</th><th>Problema</th></tr></thead>
    <tbody>${problemi.map(x => html`<tr class="${x.quotato ? '' : 'non-quotato'}">
      <td>${x.riferimenti}</td>
      <td><b>${x.codice}</b>${x.produttore ? html`<br><small>${x.produttore}</small>` : ''}</td>
      <td><small>${x.descrizione}</small></td><td class="n">${num(x.qtaScheda, x.qtaScheda % 1 ? 2 : 0)}</td>
      <td>${x.problema}</td></tr>`)}</tbody>
  </table>` : ''}
  ${firme}
  <div class="spinta"></div>
  ${piede}
</section>` : ''}
</div>
</div>
<script src="/static/stampa.js?v=${VERSIONE}" defer></script>
<script src="/static/formati.js?v=${VERSIONE}" defer></script>
<script src="/static/conferma.js?v=${VERSIONE}" defer></script>
</body></html>`;
}
