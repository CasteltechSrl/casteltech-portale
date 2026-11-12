/**
 * Sicurezza (Adriano 12/11/2026; regole in src/engine/sicurezza.ts, letture in src/server/sicurezza-servizio.ts, migrazione 094).
 * /sicurezza            cruscotto: scadenze del D.Lgs. 81/08, sostanze senza scheda, cosa tenere sotto controllo
 * /sicurezza/schede     schede di sicurezza (SDS) dei prodotti chimici, con il PDF e i pericoli; caricamento dei PDF
 * /sicurezza/controllo  materiali di consumo e righe di ordini a fornitore / DDT ricevuti con sostanze: scheda presente o da cercare
 * /sicurezza/<sezione>  registri dello scadenzario (formazione, visite, DPI, antincendio, impianti…), come la Qualità (rotte/registri.ts)
 */
import express, { Router, type Request } from 'express';
import { layout } from '../views/layout.js';
import { html, data, raw, type Raw } from '../views/html.js';
import { conMessaggio } from '../views/azioni-elenco.js';
import { oggiRoma, rotteRegistri, scadenzaBadge, tastiRegistri, vociDi, conteggiVoci, type ConfigRegistri } from './registri.js';
import { riepilogoQualita, titoloVoce } from '../../engine/qualita.js';
import {
  SEZIONI_SICUREZZA, sezioneSicurezza, OBBLIGHI_SICUREZZA, CATEGORIE_SOSTANZE, daCompilare, statoScheda, avvisiPericoli, descriviH, type CategoriaSostanza,
} from '../../engine/sicurezza.js';
import {
  elencoSchede, leggiScheda, fileScheda, ripulisciScheda, nuovaScheda, salvaScheda, sostituisciFile, eliminaScheda, leggiPdf, controllaRighe,
  righeDocumentiRecenti, materialiSostanze, cercaSchedaOnline, chiaveRicerca, MAX_PDF, type DatiScheda, type SchedaDb,
} from '../sicurezza-servizio.js';
import { etichettePericoli, statoBreve, linkScheda } from '../views/sicurezza.js';

export const CONFIG_SICUREZZA: ConfigRegistri = {
  base: '/sicurezza', attiva: 'sicurezza', titolo: 'Sicurezza', sezioni: SEZIONI_SICUREZZA,
  tastiExtra: [['/sicurezza/schede', 'Schede di sicurezza'], ['/sicurezza/controllo', 'Controllo ordini e DDT']],
};

const mb = (n: number | null) => (n == null ? '' : `${(n / 1024 / 1024).toLocaleString('it-IT', { maximumFractionDigits: 1 })} MB`);
const FONTI: Record<string, string> = { drive: 'Drive', internet: 'internet', caricata: 'caricata' };
const TIPI: Record<string, string> = { sds: 'Scheda di sicurezza', tds: 'Scheda tecnica (non basta)', altro: 'Altro documento' };
/** Ritorno sicuro dopo la ricerca: solo pagine del portale. */
const ritorno = (x: unknown) => (typeof x === 'string' && /^\/(sicurezza|ordini|acquisti)[\w\-/?=&#.]*$/.test(x) ? x : '/sicurezza/controllo');

export function rotteSicurezza() {
  const r = Router();
  const pagina = (req: Request, titolo: string, contenuto: Raw, avviso?: string, script: string[] = []) =>
    String(layout({ titolo, utente: req.session.utente, attiva: 'sicurezza', contenuto, avviso, script }));
  const msg = (req: Request) => (req.query.msg ? String(req.query.msg) : undefined);
  const tasti = async (attiva?: string) => tastiRegistri(CONFIG_SICUREZZA, await conteggiVoci(), attiva);

  // ── Cruscotto ──
  r.get('/', async (req, res) => {
    const oggi = oggiRoma();
    const [voci, schede, materiali, conteggi] = await Promise.all([vociDi(SEZIONI_SICUREZZA.map(s => s.chiave)), elencoSchede(), materialiSostanze(), conteggiVoci()]);
    const compilare = new Set(voci.filter(v => daCompilare(v.dati)).map(v => v.id));
    const rie = riepilogoQualita(voci, oggi, SEZIONI_SICUREZZA);
    const scadute = rie.scadute.filter(x => !compilare.has(x.id)), vicine = rie.vicine.filter(x => !compilare.has(x.id));
    const attive = schede.filter(s => s.attiva);
    const controllate = await controllaRighe(materiali.filter(m => m.attivo).map(m => ({ codice: m.codice, descrizione: m.descrizione })), schede);
    const senzaScheda = controllate.filter(x => !x.scheda);
    const daAggiornare = attive.filter(s => statoScheda(s, oggi).livello !== 'ok');
    const avvisi = [...new Set(attive.flatMap(s => avvisiPericoli(s.pericoli).map(a => a.split(':')[0])))];
    const cmr = attive.filter(s => avvisiPericoli(s.pericoli).some(a => a.startsWith('Cancerogeno')));
    const riga = (x: { sezione: string; id: number; titolo: string; scadenza: string; stato: string }) => {
      const s = sezioneSicurezza(x.sezione)!;
      return html`<li class="${x.stato === 'scaduta' ? 'ritardo' : ''}"><a href="/sicurezza/${x.sezione}/${x.id}">${s.nome}: ${x.titolo}</a><span class="d">${scadenzaBadge(s, x.scadenza, oggi)}</span></li>`;
    };
    const perSezione = (k: string) => voci.filter(v => v.sezione === k && compilare.has(v.id)).length;
    res.send(pagina(req, 'Sicurezza', html`
      <div class="intestazione-pagina"><h1>Sicurezza</h1>
        <div class="azioni"><a href="/sicurezza/schede" class="bottone primario">Schede di sicurezza</a></div></div>
      ${tastiRegistri(CONFIG_SICUREZZA, conteggi)}
      <div class="oggi"><h3>Da fare</h3>
        <div class="chips">
          ${scadute.length ? html`<a class="chip urgente" href="#scadenze"><b>${scadute.length}</b> scadut${scadute.length === 1 ? 'a' : 'e'}</a>` : ''}
          ${vicine.length ? html`<a class="chip controllare" href="#scadenze"><b>${vicine.length}</b> entro un mese</a>` : ''}
          ${senzaScheda.length ? html`<a class="chip urgente" href="/sicurezza/controllo"><b>${senzaScheda.length}</b> prodott${senzaScheda.length === 1 ? 'o' : 'i'} senza scheda di sicurezza</a>` : ''}
          ${daAggiornare.length ? html`<a class="chip controllare" href="/sicurezza/schede?mostra=aggiornare"><b>${daAggiornare.length}</b> sched${daAggiornare.length === 1 ? 'a' : 'e'} da aggiornare</a>` : ''}
          ${compilare.size ? html`<a class="chip" href="#obblighi"><b>${compilare.size}</b> righe dello scadenzario senza data</a>` : ''}
          ${!scadute.length && !vicine.length && !senzaScheda.length && !daAggiornare.length && !compilare.size ? html`<span class="nota">Niente in scadenza e tutte le schede presenti.</span>` : ''}
        </div>
      </div>
      <div class="aree">
        <section class="area" id="scadenze"><header><h2>Scadenze</h2></header>
          <div class="tit">Scadute</div>${scadute.length ? html`<ul>${scadute.slice(0, 25).map(riga)}</ul>` : html`<p class="nota">Nessuna.</p>`}
          <div class="tit">Entro un mese</div>${vicine.length ? html`<ul>${vicine.map(riga)}</ul>` : html`<p class="nota">Nessuna.</p>`}
          <p class="nota piccola">Le righe senza la data dell'ultima volta non sono contate qui: sono "senza data" finché non si scrive quando è stato fatto.</p>
        </section>
        <section class="area"><header><h2>Schede di sicurezza</h2><a href="/sicurezza/schede">Tutte →</a></header>
          <ul><li><span>Schede in archivio</span><span class="d">${attive.length}</span></li>
            <li><a href="/sicurezza/controllo">Materiali di consumo senza scheda</a><span class="d">${senzaScheda.length}</span></li>
            <li><a href="/sicurezza/schede?mostra=aggiornare">Da aggiornare o incomplete</a><span class="d">${daAggiornare.length}</span></li></ul>
          ${cmr.length ? html`<div class="tit">Attenzione</div><p class="nota">${cmr.length} prodott${cmr.length === 1 ? 'o' : 'i'} con frasi di pericolo per la fertilità, il feto o cancerogene
            (${cmr.map(s => s.prodotto).slice(0, 4).join(', ')}${cmr.length > 4 ? '…' : ''}): vanno nella valutazione del rischio chimico e segnalati al medico competente.</p>` : ''}
          ${avvisi.length && !cmr.length ? html`<p class="nota">${avvisi.join(' · ')}</p>` : ''}
          <p class="nota piccola">Ogni ordine a fornitore e ogni DDT ricevuto con paste, stagno, flussanti, solventi, coating o colle mostra le sue schede; quelle che mancano si cercano su internet da sole.</p>
        </section>
        <section class="area" id="obblighi"><header><h2>Cosa tenere sotto controllo</h2></header>
          <ul>${OBBLIGHI_SICUREZZA.map(o => html`<li><details><summary>${o.sezione === 'schede' ? html`<a href="/sicurezza/schede">${o.titolo}</a>` : html`<a href="/sicurezza/${o.sezione}">${o.titolo}</a>`}
            ${o.sezione !== 'schede' && perSezione(o.sezione) ? html` <small class="nota">(${perSezione(o.sezione)} senza data)</small>` : ''}</summary><p class="nota">${o.testo}</p></details></li>`)}</ul>
          <p class="nota piccola">Elenco preparato dal D.Lgs. 81/2008 per un'azienda di assemblaggio elettronico: non sostituisce l'RSPP, che conferma DVR, corsi e scadenze precise.</p>
        </section>
      </div>`, msg(req)));
  });

  // ── Schede di sicurezza ──
  r.get('/schede', async (req, res) => {
    const oggi = oggiRoma();
    const tutte = await elencoSchede();
    const mostra = String(req.query.mostra ?? '');
    const righe = mostra === 'aggiornare' ? tutte.filter(s => s.attiva && statoScheda(s, oggi).livello !== 'ok') : mostra === 'tutte' ? tutte : tutte.filter(s => s.attiva);
    const occupato = tutte.reduce((t, s) => t + (s.dimensione ?? 0), 0);
    res.send(pagina(req, 'Schede di sicurezza', html`
      <div class="intestazione-pagina"><h1>Sicurezza</h1></div>
      ${await tasti('/sicurezza/schede')}
      <p class="nota">Le schede di dati di sicurezza (SDS) dei prodotti chimici che usiamo: si aprono da qui, anche dal telefono. Le prime vengono dal Drive
        (4_PRODUZIONE/02_SCHEDE TECNICHE E SICUREZZA), le altre si caricano qui sotto o le trova il portale su internet quando un ordine o un DDT ha un prodotto senza scheda.
        I pericoli sono le frasi H della sezione 2 (passa con il mouse sull'etichetta per leggerle).</p>
      <nav class="filtri-rapidi"><a href="/sicurezza/schede" class="${mostra ? '' : 'attivo'}">In uso (${tutte.filter(s => s.attiva).length})</a>
        <a href="/sicurezza/schede?mostra=aggiornare" class="${mostra === 'aggiornare' ? 'attivo' : ''}">Da aggiornare</a>
        <a href="/sicurezza/schede?mostra=tutte" class="${mostra === 'tutte' ? 'attivo' : ''}">Tutte, anche non più usate (${tutte.length})</a></nav>
      ${righe.length ? html`
        <div class="ricerca-veloce"><input type="search" data-filtra="tab-sds" data-conta="conta-sds" placeholder="Cerca prodotto, produttore, codice…" autocomplete="off">
          <span class="nota"><span id="conta-sds">${righe.length}</span> schede</span></div>
        <div class="tabella-scorre"><table class="elenco" id="tab-sds">
          <thead><tr><th>Prodotto</th><th>Tipo</th><th>Produttore</th><th>Pericoli</th><th>Revisione</th><th>Stato</th><th>Fonte</th><th>PDF</th></tr></thead>
          <tbody>${righe.map(s => html`<tr class="${s.attiva ? '' : 'spento'}">
            <td><a href="/sicurezza/schede/${s.id}"><strong>${s.prodotto}</strong></a><br><small class="nota">${CATEGORIE_SOSTANZE[s.categoria as CategoriaSostanza] ?? s.categoria}</small>
              <span hidden>${s.parole ?? ''}</span></td>
            <td>${s.tipo === 'sds' ? 'SDS' : s.tipo === 'tds' ? 'tecnica' : 'altro'}</td>
            <td>${s.produttore ?? ''}</td>
            <td>${etichettePericoli(s.pericoli)}</td>
            <td data-valore="${s.data_revisione ?? ''}">${s.data_revisione ? data(s.data_revisione) : ''}</td>
            <td>${statoBreve(s)}</td>
            <td>${FONTI[s.fonte] ?? s.fonte}</td>
            <td>${s.ha_file ? html`<a href="/sicurezza/schede/${s.id}/pdf" target="_blank" rel="noopener">apri</a>` : s.url ? html`<a href="${s.url}" target="_blank" rel="noopener noreferrer">link</a>` : ''}</td></tr>`)}</tbody>
        </table></div>` : html`<p class="vuoto">${mostra === 'aggiornare' ? 'Nessuna scheda da aggiornare.' : 'Ancora nessuna scheda: caricale qui sotto.'}</p>`}
      <div class="blocco stretto-form">
        <h2>Carica schede di sicurezza</h2>
        <p class="nota">Uno o più PDF (fino a ${mb(MAX_PDF)} l'uno; spazio usato ora ${mb(occupato)}). Il portale legge da solo se è una scheda di sicurezza, i pericoli della sezione 2
          e la data di revisione; poi controlla il nome del prodotto e scrivi i codici con cui lo compriamo.</p>
        <label>File PDF <input type="file" id="file-sds" accept=".pdf,application/pdf" multiple></label>
        <button id="carica-sds" type="button" class="primario">Carica</button>
        <output id="esito-sds" class="nota"></output>
      </div>`, msg(req), ['ricerca.js', 'sicurezza.js']));
  });

  r.post('/schede/carica', express.raw({ type: 'application/octet-stream', limit: '6mb' }), async (req, res) => {
    const b = req.body as Buffer;
    const nome = decodeURIComponent(String(req.get('x-nome-file') ?? 'scheda.pdf')).replace(/[\\/]/g, '_').slice(0, 150);
    if (!Buffer.isBuffer(b) || b.subarray(0, 5).toString('latin1') !== '%PDF-') return res.status(400).json({ errore: `${nome}: non è un PDF.` });
    if (b.length > MAX_PDF) return res.status(400).json({ errore: `${nome}: troppo grande (${mb(b.length)}, massimo ${mb(MAX_PDF)}). Lascialo sul Drive e scrivi il percorso nella scheda.` });
    const letto = await leggiPdf(b);
    const d = ripulisciScheda({ prodotto: nome.replace(/\.pdf$/i, '').replace(/[_]+/g, ' '), tipo: letto.sds ? 'sds' : 'altro', pericoli: letto.pericoli, data_revisione: letto.dataRevisione }) as DatiScheda;
    const id = await nuovaScheda(d, { nome, dati: b }, 'caricata', req.session.utente!.nome);
    res.json({ id, sds: letto.sds });
  });

  // ── Controllo di materiali, ordini e DDT ──
  r.get('/controllo', async (req, res) => {
    const schede = await elencoSchede();
    const [materiali, documenti] = await Promise.all([materialiSostanze(), righeDocumentiRecenti(365)]);
    const mat = await controllaRighe(materiali.map(m => ({ codice: m.codice, descrizione: m.descrizione })), schede);
    const docControllate = await controllaRighe(documenti, schede);
    // una riga per prodotto (stessa descrizione), con l'ultimo documento in cui compare
    const visti = new Map<string, { riga: typeof docControllate[number]; doc: typeof documenti[number]; volte: number }>();
    for (const rc of docControllate) {
      const doc = documenti.find(x => x.descrizione === rc.descrizione && x.codice === rc.codice)!;
      const k = chiaveRicerca(`${rc.codice ?? ''} ${rc.descrizione}`);
      const v = visti.get(k);
      if (v) v.volte++; else visti.set(k, { riga: rc, doc, volte: 1 });
    }
    const docRighe = [...visti.values()].sort((a, b) => Number(!!a.riga.scheda) - Number(!!b.riga.scheda));
    const bottoneCerca = (codice: string | null, descrizione: string) => html`<form method="post" action="/sicurezza/controllo/cerca" class="in-linea"
      data-conferma="Cercare su internet la scheda di sicurezza? Costa circa 2 centesimi e può volerci un minuto.">
      <input type="hidden" name="codice" value="${codice ?? ''}"><input type="hidden" name="descrizione" value="${descrizione}"><input type="hidden" name="torna" value="/sicurezza/controllo">
      <button class="piccolo">Cerca su internet</button></form>`;
    const cellaScheda = (x: typeof mat[number]) => x.scheda ? html`${linkScheda(x.scheda)}<br>${statoBreve(x.scheda)}`
      : html`<span class="esito verifica">manca</span>${x.ricerca ? html`<br><small class="nota">${x.ricerca.nota ?? x.ricerca.esito}</small>` : ''}`;
    res.send(pagina(req, 'Controllo schede di sicurezza', html`
      <div class="intestazione-pagina"><h1>Sicurezza</h1></div>
      ${await tasti('/sicurezza/controllo')}
      <p class="nota">Per ogni prodotto chimico che compriamo serve la scheda di sicurezza aggiornata. Il portale riconosce le sostanze dalle righe (codici MC-PAS, FIL, BAR, FLU, PUL, COA
        dei materiali di consumo, oppure parole come pasta saldante, stagno, flussante, alcool, diluente, coating, colla) e le abbina alle schede con le "parole" scritte in ogni scheda.
        Se una riga è abbinata alla scheda sbagliata o non viene riconosciuta, aggiungi il codice o il nome nelle parole della scheda giusta.</p>
      <section class="blocco"><h2>Materiali di consumo con sostanze <span class="nota">(${mat.filter(x => !x.scheda).length} senza scheda su ${mat.length})</span></h2>
        ${mat.length ? html`<div class="tabella-scorre"><table class="elenco"><thead><tr><th>Codice</th><th>Descrizione</th><th>Tipo</th><th>Scheda</th><th>Pericoli</th><th></th></tr></thead>
          <tbody>${mat.sort((a, b) => Number(!!a.scheda) - Number(!!b.scheda)).map(x => html`<tr class="${x.scheda ? '' : 'da-controllare'}">
            <td>${x.codice}</td><td>${x.descrizione}</td><td>${CATEGORIE_SOSTANZE[x.categoria]}</td><td>${cellaScheda(x)}</td>
            <td>${x.scheda ? etichettePericoli(x.scheda.pericoli) : ''}</td><td>${x.scheda ? '' : bottoneCerca(x.codice, x.descrizione)}</td></tr>`)}</tbody></table></div>`
          : html`<p class="vuoto">Nessun materiale di consumo con sostanze.</p>`}
      </section>
      <section class="blocco"><h2>Ordini a fornitore e DDT ricevuti degli ultimi 12 mesi <span class="nota">(${docRighe.filter(x => !x.riga.scheda).length} prodotti senza scheda)</span></h2>
        ${docRighe.length ? html`<div class="tabella-scorre"><table class="elenco"><thead><tr><th>Riga</th><th>Tipo</th><th>Ultimo documento</th><th>Fornitore</th><th>Scheda</th><th></th></tr></thead>
          <tbody>${docRighe.map(({ riga: x, doc, volte }) => html`<tr class="${x.scheda ? '' : 'da-controllare'}">
            <td>${x.codice ? html`<b>${x.codice}</b> ` : ''}${x.descrizione}</td><td>${CATEGORIE_SOSTANZE[x.categoria]}</td>
            <td><a href="${doc.link}">${doc.documento}</a>${doc.data ? html` del ${data(doc.data)}` : ''}${volte > 1 ? html` <small class="nota">(${volte} righe)</small>` : ''}</td>
            <td>${doc.fornitore ?? ''}</td><td>${cellaScheda(x)}</td><td>${x.scheda ? '' : bottoneCerca(x.codice, x.descrizione)}</td></tr>`)}</tbody></table></div>`
          : html`<p class="vuoto">Nessuna sostanza negli ordini a fornitore e nei DDT ricevuti degli ultimi 12 mesi.</p>`}
      </section>`, msg(req)));
  });

  r.post('/controllo/cerca', async (req, res) => {
    const b = req.body ?? {};
    const descrizione = String(b.descrizione ?? '').trim().slice(0, 300);
    const torna = ritorno(b.torna);
    if (!descrizione) return res.redirect(conMessaggio(torna, 'Manca la descrizione della riga.'));
    const e = await cercaSchedaOnline({ codice: String(b.codice ?? '').trim() || null, descrizione }, { forza: true, da: req.session.utente!.nome });
    if (e.schedaId) return res.redirect(conMessaggio(`/sicurezza/schede/${e.schedaId}`, `${e.nota} Controlla nome, pericoli e parole e salva.`));
    res.redirect(conMessaggio(torna, e.nota));
  });

  // ── Una scheda ──
  const idOk = (req: Request) => (/^\d+$/.test(String(req.params.id)) ? Number(req.params.id) : null);

  const moduloScheda = (s: Partial<SchedaDb>) => html`
    <form method="post" action="/sicurezza/schede/${s.id}" class="blocco modulo-qualita">
      <label class="largo">Prodotto * <input name="prodotto" value="${s.prodotto ?? ''}" class="maiuscolo" required></label>
      <label>Tipo <select name="tipo">${Object.entries(TIPI).map(([k, t]) => html`<option value="${k}" ${s.tipo === k ? raw('selected') : ''}>${t}</option>`)}</select></label>
      <label>Categoria <select name="categoria">${Object.entries(CATEGORIE_SOSTANZE).map(([k, t]) => html`<option value="${k}" ${s.categoria === k ? raw('selected') : ''}>${t}</option>`)}</select></label>
      <label>Produttore <input name="produttore" value="${s.produttore ?? ''}" class="maiuscolo"></label>
      <label>Fornitore da cui lo compriamo <input name="fornitore" value="${s.fornitore ?? ''}" class="maiuscolo"></label>
      <label>Revisione <input name="revisione" value="${s.revisione ?? ''}"></label>
      <label>Data di revisione <input type="date" name="data_revisione" value="${s.data_revisione ?? ''}"></label>
      <label>Lingua <input name="lingua" value="${s.lingua ?? ''}" placeholder="it, en…"></label>
      <label class="largo">Pericoli (frasi H della sezione 2) <input name="pericoli" value="${(s.pericoli ?? []).join(' ')}" placeholder="H225 H319 H336"></label>
      <label class="largo">Parole per riconoscerla nelle righe (una per riga: codici MC-…, nomi e codici del prodotto)
        <textarea name="parole" rows="4" placeholder="MC-FLU-001&#10;MF210&#10;MF 210">${s.parole ?? ''}</textarea></label>
      <label class="largo">Percorso sul Drive <input name="percorso_drive" value="${s.percorso_drive ?? ''}"></label>
      <label class="largo">Link da cui è stata scaricata <input name="url" value="${s.url ?? ''}"></label>
      <label class="largo">Note <textarea name="note" rows="3">${s.note ?? ''}</textarea></label>
      <label><input type="checkbox" name="attiva" value="1" ${s.attiva !== false ? raw('checked') : ''}> Prodotto ancora in uso</label>
      <button class="primario">Salva</button>
    </form>`;

  r.get('/schede/:id', async (req, res, next) => {
    const id = idOk(req);
    if (!id) return next();
    const s = await leggiScheda(id);
    if (!s) return res.redirect(conMessaggio('/sicurezza/schede', 'Scheda non trovata.'));
    const st = statoScheda(s, oggiRoma());
    const avvisi = avvisiPericoli(s.pericoli);
    res.send(pagina(req, s.prodotto, html`
      <p><a href="/sicurezza/schede">← Schede di sicurezza</a></p>
      <h1>${s.prodotto}</h1>
      <p>${statoBreve(s)} ${s.ha_file ? html` · <a class="bottone" href="/sicurezza/schede/${s.id}/pdf" target="_blank" rel="noopener">Apri il PDF</a> <span class="nota">${s.nome_file ?? ''} ${mb(s.dimensione)}</span>`
        : s.url ? html` · <a class="bottone" href="${s.url}" target="_blank" rel="noopener noreferrer">Apri il link</a>` : ''}</p>
      ${st.livello !== 'ok' ? html`<p class="nota">${st.testo}.</p>` : ''}
      ${s.pericoli.length ? html`<div class="blocco"><h2>Pericoli</h2><p>${etichettePericoli(s.pericoli)}</p>
        <ul>${s.pericoli.map(h => html`<li><b>${h}</b> ${descriviH(h)}</li>`)}</ul>
        ${avvisi.length ? html`<ul class="avviso-riga">${avvisi.map(a => html`<li>${a}</li>`)}</ul>` : ''}</div>` : ''}
      ${moduloScheda(s)}
      <div class="blocco stretto-form"><h2>${s.ha_file ? 'Sostituisci il PDF' : 'Carica il PDF'}</h2>
        <p class="nota">Per una revisione nuova della stessa scheda: il PDF vecchio viene sostituito.</p>
        <input type="file" id="file-sds" accept=".pdf,application/pdf"> <button id="carica-sds" type="button" data-id="${s.id}">Carica</button>
        <output id="esito-sds" class="nota"></output></div>
      <p class="nota">Fonte: ${FONTI[s.fonte] ?? s.fonte}${s.creato_da ? ` (${s.creato_da})` : ''}.</p>
      <form method="post" action="/sicurezza/schede/${s.id}/elimina" data-conferma="Eliminare questa scheda e il suo PDF? Se il prodotto non si usa più basta togliere la spunta «ancora in uso».">
        <button class="link negativo">Elimina</button></form>`, msg(req), ['sicurezza.js']));
  });

  r.post('/schede/:id', async (req, res, next) => {
    const id = idOk(req);
    if (!id) return next();
    const d = ripulisciScheda({ ...req.body, attiva: req.body?.attiva === '1' });
    if (typeof d === 'string') return res.redirect(conMessaggio(`/sicurezza/schede/${id}`, d));
    const ok = await salvaScheda(id, d);
    res.redirect(conMessaggio(ok ? `/sicurezza/schede/${id}` : '/sicurezza/schede', ok ? 'Salvato.' : 'Scheda non trovata.'));
  });

  r.post('/schede/:id/file', express.raw({ type: 'application/octet-stream', limit: '6mb' }), async (req, res, next) => {
    const id = idOk(req);
    if (!id) return next();
    const b = req.body as Buffer;
    const nome = decodeURIComponent(String(req.get('x-nome-file') ?? 'scheda.pdf')).replace(/[\\/]/g, '_').slice(0, 150);
    if (!Buffer.isBuffer(b) || b.subarray(0, 5).toString('latin1') !== '%PDF-') return res.status(400).json({ errore: 'Non è un PDF.' });
    if (!(await sostituisciFile(id, nome, b))) return res.status(400).json({ errore: `PDF troppo grande (massimo ${mb(MAX_PDF)}) o scheda non trovata.` });
    const letto = await leggiPdf(b);
    const s = await leggiScheda(id);
    if (s) await salvaScheda(id, { ...s, data_revisione: letto.dataRevisione ?? s.data_revisione, pericoli: letto.pericoli.length ? letto.pericoli : s.pericoli,
      tipo: letto.sds ? 'sds' : s.tipo } as DatiScheda);
    res.json({ id });
  });

  r.get('/schede/:id/pdf', async (req, res, next) => {
    const id = idOk(req);
    if (!id) return next();
    const f = await fileScheda(id);
    if (!f?.file) return res.status(404).send('PDF non presente');
    res.type('application/pdf').setHeader('Content-Disposition', `inline; filename="${(f.nome_file ?? 'scheda.pdf').replace(/[^\w.\- ]/g, '_')}"`);
    res.send(f.file);
  });

  r.post('/schede/:id/elimina', async (req, res, next) => {
    const id = idOk(req);
    if (!id) return next();
    res.redirect(conMessaggio('/sicurezza/schede', (await eliminaScheda(id)) ? 'Scheda eliminata.' : 'Scheda non trovata.'));
  });

  // ── Registri dello scadenzario (stesse pagine della Qualità) ──
  r.use(rotteRegistri(CONFIG_SICUREZZA));
  return r;
}
