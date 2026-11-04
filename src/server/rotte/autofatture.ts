/**
 * Amministrazione → Autofatture: fatture dei fornitori esteri da controllare (lette dall'IA dalla cartella Drive / Da acquisire
 * o caricate qui) e preparazione della bozza di autofattura (TD17/18/19). Montate in /amministrazione/fatture-estere.
 */
import express, { Router, type Request } from 'express';
import { q, q1 } from '../db.js';
import { layout } from '../views/layout.js';
import { html, data, euro, raw, type Raw } from '../views/html.js';
import { ELENCO_NAZIONI } from '../../engine/amministrazione.js';
import {
  TIPI_AUTOFATTURA, controllaFatturaEstera, motivoNonScartabile, normalizzaFatturaEstera, paeseFiscale, righeInEuro, sommaRighe, stessaFatturaEstera,
  type FatturaEstera,
} from '../../engine/autofatture.js';
import { aggiungiFile, elabora, scarta } from '../acquisizioni-servizio.js';
import { iaConfigurata } from '../lettura-ordini-ia.js';
import {
  autofatturaGiaFatta, confermaFatturaEstera, descriviCaricata, fatturaEsteraGiaCaricata, salvaFatturaEstera, type FatturaEsteraDb,
} from '../autofatture-servizio.js';
import { casella, casellaTutti, conMessaggio, idsSpuntati, moduloAzioni } from '../views/azioni-elenco.js';

const STATI: Record<string, string> = { nuovo: 'in lettura', da_confermare: 'da controllare', confermato: 'autofattura preparata', scartato: 'scartata', errore: 'errore' };
const RIGHE_VUOTE = 2;
const oraRoma = (d: Date | string | null) => (d ? new Date(d).toLocaleString('it-IT', { timeZone: 'Europe/Rome', dateStyle: 'short', timeStyle: 'short' }) : '');
/** Numero nel modulo: virgola decimale, senza separatore delle migliaia (che si leggerebbe come decimale). */
const numeroModulo = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','));

/** Fatture estere ancora da controllare, per l'elenco Autofatture (Documenti emessi → Autofatture). */
export async function riquadroFattureEstere(spunte = true): Promise<Raw> {
  const elenco = await q(`SELECT id, nome_file, stato, errore, creato_il, origine, proposta->'fornitore'->>'ragione_sociale' AS fornitore,
      proposta->>'numero' AS numero, proposta->>'data' AS data
    FROM acquisizioni WHERE tipo = 'fattura_estera' AND stato IN ('nuovo', 'da_confermare', 'errore') ORDER BY creato_il`);
  // la stessa fattura due volte (stesso fornitore, numero e data): la seconda si segna in rosso
  const doppioni = new Set<number>();
  elenco.forEach((a, i) => {
    const x = { fornitore: { ragione_sociale: a.fornitore }, numero: a.numero, data: a.data };
    if (elenco.slice(0, i).some(b => stessaFatturaEstera({ fornitore: { ragione_sociale: b.fornitore }, numero: b.numero, data: b.data }, x))) doppioni.add(a.id);
  });
  const modulo = spunte ? moduloAzioni({
    azione: '/amministrazione/fatture-estere/azioni', nome: { singolare: 'fattura', plurale: 'fatture', femminile: true },
    pulsanti: [{ azione: 'prepara', testo: "Prepara l'autofattura", serve: '1+',
      titolo: "Per le fatture spuntate già controllate: fornitore in anagrafica, fattura tra le fatture fornitori e bozza dell'autofattura da emettere",
      chiedi: "Preparare l'autofattura per {n} fattur{a|e} ester{a|e}? Nasce una bozza per ognuna (si controlla e si emette dall'elenco Autofatture)." },
    { azione: 'elimina', testo: 'Elimina', serve: '1+', pericolo: true,
      titolo: "Toglie le fatture estere spuntate (caricate per errore o doppie): non si prepara l'autofattura e il file non si conserva",
      chiedi: "Eliminare {n} fattur{a|e} ester{a|e}? Non si prepara l'autofattura e il file non si conserva." }],
  }) : { apri: html``, chiudi: html`` };
  return html`<section class="blocco">
    <h2>Fatture dei fornitori esteri</h2>
    <p class="nota">Carica qui il PDF della fattura estera (Mouser, DigiKey, Amazon, abbonamenti…), oppure mettila nella cartella Google Drive degli ordini:
      l'IA la riconosce, legge fornitore e righe e prepara la proposta. Controlli, confermi e nasce la bozza dell'autofattura da emettere.
      ${iaConfigurata() ? '' : html`<b>La chiave dell'IA (ANTHROPIC_API_KEY) non è configurata: i file si registrano ma non si leggono.</b>`}</p>
    <label>File <input type="file" id="file-acquisizioni" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.eml"></label>
    <button id="avvia-acquisizioni" class="primario" data-url="/amministrazione/fatture-estere/carica">Carica e leggi</button>
    <output id="esito-acquisizioni" class="nota"></output>
    ${elenco.length ? html`${modulo.apri}<div class="tabella-scorre"><table class="elenco">
      <thead><tr>${spunte ? casellaTutti() : ''}<th>Arrivata</th><th>File</th><th>Fornitore letto</th><th>Fattura</th><th>Stato</th></tr></thead>
      <tbody>${elenco.map(a => html`<tr class="cliccabile" data-href="/amministrazione/fatture-estere/${a.id}">
        ${spunte ? casella(a.id, a.nome_file) : ''}<td class="nowrap">${oraRoma(a.creato_il)}</td><td class="taglia"><a href="/amministrazione/fatture-estere/${a.id}">${a.nome_file}</a></td>
        <td>${a.fornitore ?? ''}</td><td>${a.numero ? html`n. ${a.numero}${a.data ? html` del ${data(a.data)}` : ''}` : ''}</td>
        <td><span class="stato acq-${a.stato}">${STATI[a.stato]}</span>${doppioni.has(a.id) ? html` <span class="stato acq-errore">doppione</span>` : ''}
          ${a.errore ? html`<br><small class="nota">${a.errore}</small>` : ''}</td></tr>`)}</tbody>
    </table></div>${modulo.chiudi}` : html`<p class="nota">Nessuna fattura estera da controllare.</p>`}
  </section>`;
}

/** Fattura dal modulo della pagina (righe "r<n>", come negli ordini da acquisire). */
function fatturaDa(body: any, prima: FatturaEsteraDb | null): FatturaEstera {
  const righe = Object.entries<any>(body?.righe ?? {})
    .filter(([k, x]) => /^r\d+$/.test(k) && !x?.togli)
    .sort(([a], [b]) => Number(a.slice(1)) - Number(b.slice(1)))
    .map(([, x]) => x);
  return normalizzaFatturaEstera({
    fornitore: body?.fornitore ?? {}, numero: body?.numero, data: body?.data, valuta: body?.valuta, cambio: body?.cambio,
    servizi: body?.tipo === 'TD17', pagata: body?.pagata === '1', tipo: body?.tipo, righe,
    imponibile: prima?.imponibileLetto, iva: prima?.ivaLetta, totale: prima?.totaleLetto, note: body?.note ?? prima?.note,
  });
}

export function rotteAutofatture() {
  const r = Router();
  const pagina = (req: Request, titolo: string, contenuto: Raw, avviso?: string) =>
    String(layout({ titolo, utente: req.session.utente, attiva: 'amministrazione', contenuto, avviso, largo: true }));

  // caricamento da Amministrazione: si sa già che è una fattura estera, l'IA fa solo la lettura della fattura
  // La guida e i vecchi collegamenti puntano qui senza id: si va all'elenco delle autofatture (con il riquadro delle fatture estere).
  r.get('/', (_req, res) => res.redirect('/amministrazione/documenti?tipo=autofattura'));
  r.post('/carica', express.raw({ type: 'application/octet-stream', limit: '30mb' }), async (req, res) => {
    const nome = decodeURIComponent(String(req.get('x-nome-file') ?? '')).trim();
    const dati = req.body as Buffer;
    if (!nome || !Buffer.isBuffer(dati) || !dati.length) return res.status(400).json({ errore: 'file vuoto' });
    const { id, doppioneDi } = await aggiungiFile(nome, dati);
    if (!id) return res.json({ id: doppioneDi, stato: 'già arrivato prima: non riletto' });
    await q(`UPDATE acquisizioni SET tipo = 'fattura_estera' WHERE id = $1`, [id]);
    await elabora(id);
    const a = await q1(`SELECT stato, errore FROM acquisizioni WHERE id = $1`, [id]);
    // doppione di una fattura già caricata: scartata da sola in `elabora`
    res.json({ id, stato: a.stato === 'scartato' ? 'NON caricata' : STATI[a.stato], errore: a.errore });
  });

  // spunte dell'elenco "Fatture dei fornitori esteri" (Adriano 4/11/2026): Elimina = scarta, solo quelle senza autofattura preparata
  r.post('/azioni', async (req, res) => {
    const torna = (t: string) => res.redirect(conMessaggio('/amministrazione/documenti?tipo=autofattura', t));
    const azione = String(req.body?.azione ?? '');
    if (!['elimina', 'prepara'].includes(azione)) return torna('Azione non riconosciuta.');
    const ids = idsSpuntati(req.body);
    if (!ids.length) return torna('Seleziona almeno una fattura.');
    if (azione === 'prepara') {
      // come "Prepara l'autofattura" nella pagina di ogni fattura, con gli stessi controlli: chi ha errori resta da sistemare
      const daFare = await q<{ id: number; nome_file: string; stato: string; proposta: FatturaEsteraDb | null }>(`SELECT id, nome_file, stato, proposta
        FROM acquisizioni WHERE id = ANY($1) AND tipo = 'fattura_estera' ORDER BY id`, [ids]);
      let fatte = 0; const problemi: string[] = [];
      for (const a of daFare) {
        const nome = a.proposta?.numero ? `n. ${a.proposta.numero}` : a.nome_file;
        if (a.stato === 'confermato') { problemi.push(`${nome}: autofattura già preparata`); continue; }
        if (a.stato !== 'da_confermare' || !a.proposta) { problemi.push(`${nome}: non ancora letta (apri e controlla)`); continue; }
        const caricata = await fatturaEsteraGiaCaricata(a.id, a.proposta);
        if (caricata) { problemi.push(`${nome}: doppione di quella caricata ${descriviCaricata(caricata)}`); continue; }
        try { await confermaFatturaEstera(a.id, a.proposta, a.proposta.fornitoreId ?? null, req.session.utente?.id ?? null); fatte++; }
        catch (e: any) { problemi.push(`${nome}: ${e?.message ?? e}`); }
      }
      return torna(`${fatte === 1 ? "1 autofattura preparata" : `${fatte} autofatture preparate`} in bozza: controllale ed emettile dall'elenco qui sotto.`
        + (problemi.length ? ` Da sistemare aprendo la fattura: ${problemi.join('; ')}.` : ''));
    }
    const righe = await q<{ id: number; nome_file: string; stato: string }>(`SELECT id, nome_file, stato FROM acquisizioni
      WHERE id = ANY($1) AND tipo = 'fattura_estera'`, [ids]);
    const no = righe.map(x => ({ x, motivo: motivoNonScartabile(x.stato) })).filter(y => y.motivo);
    const si = righe.filter(x => !motivoNonScartabile(x.stato));
    for (const x of si) await scarta(x.id);
    const esclusi = no.length ? ` Non toccate: ${no.map(y => `${y.x.nome_file} ${y.motivo}`).join('; ')}.` : '';
    torna(`${si.length === 1 ? '1 fattura estera eliminata' : `${si.length} fatture estere eliminate`}.${esclusi}`);
  });

  r.get('/:id', async (req, res) => {
    const a = await q1(`SELECT a.*, u.nome AS confermato_nome FROM acquisizioni a LEFT JOIN utenti u ON u.id = a.confermato_da
      WHERE a.id = $1 AND a.tipo = 'fattura_estera'`, [Number(req.params.id)]);
    if (!a) return res.status(404).send('Fattura non trovata');
    const f: FatturaEsteraDb | null = a.proposta;
    const modificabile = ['da_confermare', 'errore'].includes(a.stato) && !!f;
    const dis = modificabile ? '' : raw('disabled');
    const fornitori = modificabile ? await q(`SELECT id, ragione_sociale, partita_iva FROM fornitori_anagrafica ORDER BY ragione_sociale`) : [];
    const controlli: { errori: (string | Raw)[]; avvisi: string[] } = f ? controllaFatturaEstera(f) : { errori: [], avvisi: [] };
    const doppione = modificabile && f ? await autofatturaGiaFatta(f.numero) : null;
    if (doppione) controlli.errori.unshift(`${doppione} Se è un doppione, scarta questo file.`);
    const caricata = modificabile && f ? await fatturaEsteraGiaCaricata(a.id, f) : null;
    if (caricata) controlli.errori.unshift(html`La stessa fattura (fornitore, numero e data) è già stata caricata ${descriviCaricata(caricata)}:
      <a href="/amministrazione/fatture-estere/${caricata.id}">apri l'altra</a>. Tienine una sola: scarta il doppione.`);
    if (modificabile && f?.partitaIvaDa) controlli.avvisi.unshift(f.partitaIvaDa);
    const autofattura = f?.autofatturaId ? await q1(`SELECT id, numero, sezionale, stato FROM documenti WHERE id = $1`, [f.autofatturaId]) : null;
    const somma = f ? sommaRighe(f.righe) : 0;
    let inEuro: number | null = null;
    try { inEuro = f ? sommaRighe(righeInEuro(f.righe, f.valuta, f.cambio)) : null; } catch { inEuro = null; }
    const righe = [...(f?.righe ?? []), ...(modificabile ? Array(RIGHE_VUOTE).fill(null) : [])];
    const paese = f ? paeseFiscale(f.fornitore.partita_iva, f.fornitore.paese) : '';
    const titolo = f?.fornitore.ragione_sociale ? `Fattura ${f.numero ? `n. ${f.numero} ` : ''}di ${f.fornitore.ragione_sociale}` : a.nome_file;
    res.send(pagina(req, titolo, html`
      <p><a href="/amministrazione/documenti?tipo=autofattura">← Autofatture</a></p>
      <div class="intestazione-pagina"><h1>${titolo}</h1><div class="azioni"><span class="stato acq-${a.stato}">${STATI[a.stato]}</span></div></div>
      <dl class="dati-ordine">
        <dt>Arrivata</dt><dd>${oraRoma(a.creato_il)} · ${a.origine === 'drive' ? 'cartella Google Drive' : 'caricata dal portale'}</dd>
        ${a.contenuto ? html`<dt>File</dt><dd><a href="/ordini/acquisire/${a.id}/file" target="_blank" rel="noopener">apri ${a.nome_file}</a></dd>` : ''}
        ${autofattura ? html`<dt>Autofattura</dt><dd><a href="/amministrazione/documenti/${autofattura.id}">${autofattura.numero
          ? `n. ${autofattura.numero}/${autofattura.sezionale}` : 'bozza da controllare ed emettere'}</a>${a.confermato_nome ? html` · preparata da ${a.confermato_nome}` : ''}</dd>` : ''}
        ${f?.ricevutoId ? html`<dt>Fattura fornitore</dt><dd><a href="/amministrazione/ricevuti/${f.ricevutoId}">registrata tra le fatture fornitori</a></dd>` : ''}
        ${a.errore ? html`<dt>Errore</dt><dd>${a.errore}</dd>` : ''}
      </dl>
      ${f?.note ? html`<p class="nota">Note della lettura: ${f.note}</p>` : ''}
      ${modificabile && controlli.errori.length ? html`<p><strong>Da sistemare prima di preparare l'autofattura:</strong></p>
        <ul class="controlli errori">${controlli.errori.map(e => html`<li>${e}</li>`)}</ul>` : ''}
      ${modificabile && controlli.avvisi.length ? html`<ul class="controlli avvisi">${controlli.avvisi.map(e => html`<li>${e}</li>`)}</ul>` : ''}
      ${f ? html`<form method="post" action="/amministrazione/fatture-estere/${a.id}">
        <section class="blocco"><h2>Fornitore</h2>
          <div class="campi-ordine">
            <label>In anagrafica <select name="fornitore_id" ${dis}>
              <option value="0">${f.fornitoreId ? '— nessuno (aggiungi come nuovo) —' : '— nuovo: si aggiunge in anagrafica —'}</option>
              ${fornitori.map(x => html`<option value="${x.id}" ${x.id === f.fornitoreId ? raw('selected') : ''}>${x.ragione_sociale} · ${x.partita_iva}</option>`)}</select>
              ${!f.fornitoreId && modificabile ? html`<small class="nota">Non trovato per P.IVA né per nome: con la conferma si aggiunge all'anagrafica con questi dati.</small>` : ''}</label>
            <label>Ragione sociale <input name="fornitore[ragione_sociale]" value="${f.fornitore.ragione_sociale}" class="maiuscolo" ${dis}></label>
            <label>P.IVA (con il prefisso del paese) <input name="fornitore[partita_iva]" value="${f.fornitore.partita_iva}" class="maiuscolo" ${dis}></label>
            <label>Indirizzo <input name="fornitore[indirizzo]" value="${f.fornitore.indirizzo}" class="maiuscolo" ${dis}></label>
            <label>CAP <input name="fornitore[cap]" value="${f.fornitore.cap}" ${dis}></label>
            <label>Città <input name="fornitore[comune]" value="${f.fornitore.comune}" class="maiuscolo" ${dis}></label>
            <label>Provincia / stato <input name="fornitore[provincia]" value="${f.fornitore.provincia}" class="maiuscolo" ${dis}></label>
            <label>Paese dell'indirizzo <select name="fornitore[paese]" ${dis}><option value="">— scegli —</option>
              ${ELENCO_NAZIONI.map(n => html`<option value="${n.sigla}" ${n.sigla === f.fornitore.paese ? raw('selected') : ''}>${n.nome}</option>`)}
              ${f.fornitore.paese && !ELENCO_NAZIONI.some(n => n.sigla === f.fornitore.paese) ? html`<option value="${f.fornitore.paese}" selected>${f.fornitore.paese}</option>` : ''}</select>
              ${paese && paese !== f.fornitore.paese ? html`<small class="nota">Paese fiscale (dalla P.IVA): ${paese}</small>` : ''}</label>
          </div>
        </section>
        <section class="blocco"><h2>Fattura</h2>
          <div class="campi-ordine">
            <label>Numero <input name="numero" value="${f.numero}" ${dis}></label>
            <label>Data <input type="date" name="data" value="${f.data ?? ''}" ${dis}></label>
            <label>Valuta <input name="valuta" value="${f.valuta}" class="corto maiuscolo" maxlength="3" ${dis}></label>
            ${f.valuta !== 'EUR' ? html`<label>Cambio BCE (${f.valuta} per 1 €) <input name="cambio" value="${numeroModulo(f.cambio)}" inputmode="decimal" ${dis}>
              <small class="nota">Preso dalla BCE alla data della fattura; vuoto = si riprende.</small></label>` : ''}
            <label>Tipo di autofattura <select name="tipo" ${dis}>${Object.entries(TIPI_AUTOFATTURA).map(([k, v]) =>
              html`<option value="${k}" ${k === f.tipo ? raw('selected') : ''}>${v}</option>`)}</select></label>
            <label class="riga-spunta"><input type="checkbox" name="pagata" value="1" ${f.pagata ? raw('checked') : ''} ${dis}> già pagata (carta, PayPal…)</label>
          </div>
        </section>
        <div class="tabella-scorre"><table class="elenco">
          <thead><tr><th>Codice</th><th>Descrizione</th><th class="n">Q.tà</th><th class="n">Prezzo ${f.valuta}</th><th class="n">Importo</th>${modificabile ? html`<th>Togli</th>` : ''}</tr></thead>
          <tbody>${righe.map((x, i) => modificabile ? html`<tr>
            <td><input name="righe[r${i}][codice]" value="${x?.codice ?? ''}" class="maiuscolo"></td>
            <td><input name="righe[r${i}][descrizione]" value="${x?.descrizione ?? ''}" class="lungo"></td>
            <td class="n"><input name="righe[r${i}][quantita]" value="${numeroModulo(x?.quantita)}" inputmode="decimal" class="corto"></td>
            <td class="n"><input name="righe[r${i}][prezzo]" value="${numeroModulo(x?.prezzo)}" inputmode="decimal" class="corto"></td>
            <td class="n">${x ? (x.quantita * x.prezzo).toFixed(2).replace('.', ',') : ''}</td>
            <td><input type="checkbox" name="righe[r${i}][togli]" value="1" aria-label="Togli la riga"></td></tr>`
          : html`<tr><td>${x!.codice}</td><td>${x!.descrizione}</td><td class="n">${numeroModulo(x!.quantita)}</td><td class="n">${numeroModulo(x!.prezzo)}</td>
            <td class="n">${(x!.quantita * x!.prezzo).toFixed(2).replace('.', ',')}</td></tr>`)}</tbody>
          <tfoot><tr><td colspan="4">Totale righe${f.imponibileLetto != null ? html` <span class="nota">(imponibile scritto in fattura: ${f.imponibileLetto.toFixed(2).replace('.', ',')} ${f.valuta})</span>` : ''}</td>
            <td class="n"><b>${somma.toFixed(2).replace('.', ',')} ${f.valuta}</b></td>${modificabile ? html`<td></td>` : ''}</tr>
            ${inEuro != null ? html`<tr><td colspan="4">Autofattura: imponibile${f.valuta !== 'EUR' ? ' in euro' : ''} · IVA 22 %</td>
              <td class="n">${euro(inEuro)} · ${euro(Math.round(inEuro * 22) / 100)}</td>${modificabile ? html`<td></td>` : ''}</tr>` : ''}</tfoot>
        </table></div>
        ${modificabile ? html`<p class="nota">Con «Prepara l'autofattura»: il fornitore nuovo entra in anagrafica, la fattura si registra tra le fatture fornitori
            e nasce la bozza dell'autofattura (sezionale AF) con queste righe in euro. La bozza si controlla e si emette da Amministrazione → Autofatture.</p>
          <p class="pulsanti"><button class="primario" name="azione" value="conferma" ${controlli.errori.length ? raw('disabled') : ''}>Prepara l'autofattura</button>
            <button name="azione" value="salva">Salva le correzioni</button></p>` : ''}
      </form>` : ''}
      ${a.stato !== 'confermato' ? html`<p class="pulsanti">
        ${a.contenuto ? html`<form method="post" action="/ordini/acquisire/${a.id}/rileggi" class="inline"><button>Rileggi con l'IA</button></form>` : ''}
        ${a.stato !== 'scartato' ? html`<form method="post" action="/amministrazione/fatture-estere/${a.id}/scarta" class="inline"
          data-conferma="Scartare questa fattura? Non si prepara l'autofattura e il file non si conserva."><button class="pericolo">Scarta</button></form>` : ''}</p>` : ''}`,
      req.query.msg ? String(req.query.msg) : undefined));
  });

  r.post('/:id', async (req, res) => {
    const id = Number(req.params.id);
    const a = await q1(`SELECT proposta FROM acquisizioni WHERE id = $1 AND tipo = 'fattura_estera'`, [id]);
    if (!a) return res.status(404).send('Fattura non trovata');
    const f = fatturaDa(req.body, a.proposta);
    // cambio cancellato o valuta cambiata: si riprende dalla BCE
    if (f.valuta !== a.proposta?.valuta) f.cambio = null;
    const fornitoreId = Number(req.body.fornitore_id) || null;
    if (req.body.azione === 'conferma') {
      const caricata = await fatturaEsteraGiaCaricata(id, f);
      if (caricata) {
        await salvaFatturaEstera(id, f, fornitoreId);
        return res.redirect(`/amministrazione/fatture-estere/${id}?msg=${encodeURIComponent(`Non preparata: la stessa fattura è già stata caricata ${descriviCaricata(caricata)}.`)}`);
      }
      try {
        const autofatturaId = await confermaFatturaEstera(id, f, fornitoreId, req.session.utente?.id ?? null);
        return res.redirect(`/amministrazione/documenti/${autofatturaId}?msg=${encodeURIComponent('Bozza dell\'autofattura preparata: controlla ed emetti.')}`);
      } catch (e: any) {
        await salvaFatturaEstera(id, f, fornitoreId);
        return res.redirect(`/amministrazione/fatture-estere/${id}?msg=${encodeURIComponent(`Non preparata: ${e?.message ?? e}`)}`);
      }
    }
    await salvaFatturaEstera(id, f, fornitoreId);
    res.redirect(`/amministrazione/fatture-estere/${id}?msg=${encodeURIComponent('Salvato.')}`);
  });

  r.post('/:id/scarta', async (req, res) => {
    await scarta(Number(req.params.id));
    res.redirect(`/amministrazione/documenti?tipo=autofattura&msg=${encodeURIComponent('Fattura scartata.')}`);
  });

  return r;
}
