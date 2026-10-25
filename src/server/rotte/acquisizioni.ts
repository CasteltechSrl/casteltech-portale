/**
 * Ordini → Da acquisire: file arrivati (cartella Google Drive o caricati qui), lettura degli ordini con l'IA,
 * controllo e conferma dell'ufficio. L'ordine si crea solo con "Conferma".
 */
import express, { Router } from 'express';
import { q, q1 } from '../db.js';
import { aggiungiFile, conferma, elabora, salvaProposta, scarta, type PropostaDb } from '../acquisizioni-servizio.js';
import { iaConfigurata } from '../lettura-ordini-ia.js';
import { TIPI_ACQUISIZIONE, dataDa, numeroDa, type TipoAcquisizione } from '../../engine/acquisizioni.js';
import { maiuscolo } from '../anagrafiche-servizio.js';
import { pagina } from './ordini.js';
import { html, data, euro, num, raw } from '../views/html.js';

const STATI: Record<string, string> = { nuovo: 'in attesa', da_confermare: 'da confermare', confermato: 'ordine creato', scartato: 'scartato', errore: 'errore' };
const oggiRoma = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
const oraRoma = (d: Date | string | null) => (d ? new Date(d).toLocaleString('it-IT', { timeZone: 'Europe/Rome', dateStyle: 'short', timeStyle: 'short' }) : '');

/** Proposta dal modulo della pagina (chiavi "r<n>" per le righe, come nella scheda dell'ordine). */
function propostaDa(body: any, prima: PropostaDb | null): PropostaDb {
  const righe = Object.entries<any>(body?.righe ?? {})
    .filter(([k, x]) => /^r\d+$/.test(k) && !x?.togli)
    .sort(([a], [b]) => Number(a.slice(1)) - Number(b.slice(1)))
    .map(([, x]) => ({
      codice: maiuscolo(x?.codice), descrizione: maiuscolo(x?.descrizione), quantita: numeroDa(x?.quantita) ?? 0, prezzo: numeroDa(x?.prezzo),
      consegna: dataDa(x?.consegna), tipo: x?.tipo === 'servizio' ? 'servizio' as const : 'scheda' as const,
      // vuoto = "cerca dal codice": il prodotto si ritrova dall'anagrafica del cliente scelto
      prodottoId: Number(x?.prodotto) || (undefined as unknown as null),
    }))
    .filter(r => r.codice || r.descrizione || r.prodottoId);
  return {
    eOrdine: prima?.eOrdine ?? true, mittente: prima?.mittente, oggetto: prima?.oggetto,
    clienteId: Number(body?.cliente) || null, cliente: prima?.cliente ?? '', rifCliente: maiuscolo(body?.rif),
    dataOrdine: dataDa(body?.dataOrdine), note: String(body?.note ?? '').trim().slice(0, 500), righe,
  };
}

export function rotteAcquisizioni() {
  const r = Router();

  // ── Elenco dei file arrivati e caricamento ──
  r.get('/', async (req, res) => {
    const elenco = await q(`SELECT a.id, a.origine, a.nome_file, a.tipo, a.stato, a.errore, a.creato_il, a.ordine_id,
        a.proposta->>'cliente' AS cliente, jsonb_array_length(coalesce(a.proposta->'righe', '[]'::jsonb)) AS righe,
        (a.proposta->>'eOrdine')::boolean AS e_ordine, o.numero, o.anno
      FROM acquisizioni a LEFT JOIN ordini o ON o.id = a.ordine_id
      WHERE a.stato IN ('nuovo', 'da_confermare', 'errore') OR a.creato_il > now() - interval '60 days'
      ORDER BY (a.stato IN ('da_confermare', 'errore', 'nuovo')) DESC, a.creato_il DESC LIMIT 200`);
    const daFare = elenco.filter(a => a.stato === 'da_confermare').length;
    res.send(pagina(req.session.utente, 'Da acquisire', 'acquisire', html`
      <section class="blocco">
        <h2>Carica ordini</h2>
        <p class="nota">PDF o foto dell'ordine del cliente, email salvata (.eml, con il testo e gli allegati), testo (.txt).
          L'IA legge cliente, riferimento, righe, prezzi e consegne e prepara una proposta: l'ordine nasce solo quando lo confermi.
          ${iaConfigurata() ? '' : html`<b>La chiave dell'IA (ANTHROPIC_API_KEY) non è configurata: i file si registrano ma non si leggono.</b>`}
          Gli export di Fatture in Cloud si registrano qui; la lettura automatica dell'incrocio arriverà con il prossimo passo.</p>
        <label>File <input type="file" id="file-acquisizioni" multiple accept=".pdf,.eml,.txt,.png,.jpg,.jpeg,.webp,.xls,.xlsx,.csv"></label>
        <button id="avvia-acquisizioni" class="primario">Carica e leggi</button>
        <output id="esito-acquisizioni" class="nota"></output>
      </section>
      ${daFare ? html`<p><b>${daFare} ${daFare === 1 ? 'ordine da confermare' : 'ordini da confermare'}.</b></p>` : ''}
      ${elenco.length ? html`<div class="tabella-scorre"><table class="elenco">
        <thead><tr><th>Arrivato</th><th>File</th><th>Tipo</th><th>Da</th><th>Cliente letto</th><th class="n">Righe</th><th>Stato</th></tr></thead>
        <tbody>${elenco.map(a => html`<tr class="cliccabile" data-href="/ordini/acquisire/${a.id}">
          <td class="nowrap">${oraRoma(a.creato_il)}</td><td class="taglia"><a href="/ordini/acquisire/${a.id}">${a.nome_file}</a></td>
          <td>${TIPI_ACQUISIZIONE[a.tipo as TipoAcquisizione] ?? a.tipo}</td><td>${a.origine === 'drive' ? 'Drive' : 'caricato'}</td>
          <td class="taglia">${a.cliente}${a.e_ordine === false ? html` <span class="esito verifica">non sembra un ordine</span>` : ''}</td>
          <td class="n">${a.righe || ''}</td>
          <td><span class="stato acq-${a.stato}">${STATI[a.stato]}</span>${a.numero ? html` <a href="/ordini/${a.ordine_id}">${a.numero}/${a.anno}</a>` : ''}
            ${a.errore ? html`<br><small class="nota">${a.errore}</small>` : ''}</td></tr>`)}</tbody></table></div>`
        : html`<p class="vuoto">Nessun file arrivato.</p>`}`, { script: 'acquisizioni.js' }));
  });

  r.post('/carica', express.raw({ type: 'application/octet-stream', limit: '30mb' }), async (req, res) => {
    const nome = decodeURIComponent(String(req.get('x-nome-file') ?? '')).trim();
    const dati = req.body as Buffer;
    if (!nome || !Buffer.isBuffer(dati) || !dati.length) return res.status(400).json({ errore: 'file vuoto' });
    const id = (await aggiungiFile(nome, dati))!;
    await elabora(id);
    const a = await q1(`SELECT stato, errore FROM acquisizioni WHERE id = $1`, [id]);
    res.json({ id, stato: STATI[a.stato], errore: a.errore });
  });

  // ── Proposta: controllo e conferma ──
  r.get('/:id', async (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return next();
    const a = await q1(`SELECT a.*, o.numero, o.anno, u.nome AS confermato_nome FROM acquisizioni a
      LEFT JOIN ordini o ON o.id = a.ordine_id LEFT JOIN utenti u ON u.id = a.confermato_da WHERE a.id = $1`, [Number(req.params.id)]);
    if (!a) return res.status(404).send('Non trovato');
    const p: PropostaDb | null = a.proposta;
    const modificabile = ['da_confermare', 'errore'].includes(a.stato) && !!p;
    const clienti = await q(`SELECT id, ragione_sociale FROM clienti ORDER BY ragione_sociale`);
    const prodotti = p?.clienteId ? await q(`SELECT id, codice, descrizione FROM prodotti WHERE cliente_id = $1 OR cliente_id IS NULL ORDER BY codice`, [p.clienteId]) : [];
    const righe = [...(p?.righe ?? []), ...(modificabile ? [null, null] : [])];
    const totale = (p?.righe ?? []).reduce((s, x) => s + x.quantita * (x.prezzo ?? 0), 0);
    const avviso = req.query.errore ? String(req.query.errore) : req.query.salvato ? 'Salvato' : undefined;
    res.send(pagina(req.session.utente, a.nome_file, 'acquisire', html`
      <h2>${a.nome_file} <span class="stato acq-${a.stato}">${STATI[a.stato]}</span></h2>
      <dl class="dati-ordine">
        <dt>Arrivato</dt><dd>${oraRoma(a.creato_il)} · ${a.origine === 'drive' ? 'cartella Google Drive' : 'caricato dal portale'} · ${TIPI_ACQUISIZIONE[a.tipo as TipoAcquisizione] ?? a.tipo}</dd>
        ${p?.mittente ? html`<dt>Email</dt><dd>${p.mittente}${p.oggetto ? html` · «${p.oggetto}»` : ''}</dd>` : ''}
        ${a.contenuto ? html`<dt>File</dt><dd><a href="/ordini/acquisire/${a.id}/file" target="_blank" rel="noopener">apri il file originale</a></dd>` : ''}
        ${a.numero ? html`<dt>Ordine</dt><dd><a href="/ordini/${a.ordine_id}">${a.numero}/${a.anno}</a>${a.confermato_nome ? html` · confermato da ${a.confermato_nome}` : ''}</dd>` : ''}
        ${a.errore ? html`<dt>Errore</dt><dd>${a.errore}</dd>` : ''}
      </dl>
      ${p && !p.eOrdine ? html`<p class="avviso-riga">L'IA dice che questo documento <b>non sembra un ordine</b>. Controlla: se non lo è, scartalo.</p>` : ''}
      ${a.tipo !== 'ordine' && a.tipo !== 'email' ? html`<p class="nota">File registrato. Gli export di Fatture in Cloud si leggeranno con l'incrocio (prossimo passo).</p>` : ''}
      ${p ? html`<form method="post" action="/ordini/acquisire/${a.id}/conferma">
        <div class="campi-ordine">
          <label>Cliente (dall'anagrafica)
            <select name="cliente" ${modificabile ? '' : raw('disabled')}><option value="">— scegli —</option>
              ${clienti.map(c => html`<option value="${c.id}" ${c.id === p.clienteId ? raw('selected') : ''}>${c.ragione_sociale}</option>`)}</select>
            ${!p.clienteId && p.cliente ? html`<small class="nota">L'IA ha letto «${p.cliente}», che non è in anagrafica: sceglilo dall'elenco (se è un nome diverso, aggiungilo come alias in Impostazioni → Anagrafiche).</small>` : ''}</label>
          <label>N. ordine del cliente <input name="rif" value="${p.rifCliente}" ${modificabile ? '' : raw('disabled')}></label>
          <label>Data ordine del cliente <input type="date" name="dataOrdine" value="${p.dataOrdine ?? ''}" ${modificabile ? '' : raw('disabled')}></label>
          <label class="largo">Note <textarea name="note" rows="2" ${modificabile ? '' : raw('disabled')}>${p.note}</textarea></label>
        </div>
        <div class="tabella-scorre"><table class="elenco righe-ordine">
          <thead><tr><th>Codice letto</th><th>Descrizione</th><th>Prodotto in anagrafica</th><th>Tipo</th><th class="n">Q.tà</th><th class="n">Prezzo</th><th>Consegna</th>${modificabile ? html`<th>Togli</th>` : ''}</tr></thead>
          <tbody>${righe.map((x, i) => modificabile ? html`<tr>
            <td><input name="righe[r${i}][codice]" value="${x?.codice ?? ''}"></td>
            <td><input name="righe[r${i}][descrizione]" value="${x?.descrizione ?? ''}" class="lungo"></td>
            <td><select name="righe[r${i}][prodotto]"><option value="">${x && !x.prodottoId && x.codice ? 'non trovato: cerca dal codice' : '— cerca dal codice —'}</option>
              ${prodotti.map(k => html`<option value="${k.id}" ${k.id === x?.prodottoId ? raw('selected') : ''}>${k.codice} · ${k.descrizione ?? ''}</option>`)}</select></td>
            <td><select name="righe[r${i}][tipo]">${[['scheda', 'schede'], ['servizio', 'servizio']].map(([v, t]) => html`<option value="${v}" ${(x?.tipo ?? 'scheda') === v ? raw('selected') : ''}>${t}</option>`)}</select></td>
            <td class="n"><input name="righe[r${i}][quantita]" value="${x ? num(x.quantita, 0) : ''}" inputmode="decimal" class="corto"></td>
            <td class="n"><input name="righe[r${i}][prezzo]" value="${x?.prezzo != null ? num(x.prezzo, 4).replace(/,?0+$/, '') : ''}" inputmode="decimal" class="corto"></td>
            <td><input type="date" name="righe[r${i}][consegna]" value="${x?.consegna ?? ''}"></td>
            <td><input type="checkbox" name="righe[r${i}][togli]" value="1" aria-label="Togli la riga"></td></tr>`
          : html`<tr><td>${x!.codice}</td><td>${x!.descrizione}</td><td>${x!.prodottoId ? 'sì' : html`<span class="esito verifica">no</span>`}</td><td>${x!.tipo}</td>
            <td class="n">${num(x!.quantita, 0)}</td><td class="n">${euro(x!.prezzo)}</td><td>${data(x!.consegna)}</td></tr>`)}</tbody>
          <tfoot><tr><td colspan="5">Totale letto</td><td class="n"><b>${euro(totale)}</b></td><td colspan="${modificabile ? 2 : 1}"></td></tr></tfoot>
        </table></div>
        ${modificabile ? html`<p class="nota">Dopo aver cambiato il cliente premi «Salva le correzioni»: i prodotti si ricollegano alla sua anagrafica.
          Le righe con il prodotto non in anagrafica entrano nell'ordine con il codice del cliente (come nell'import).</p>
          <p class="pulsanti"><button class="primario">Conferma e crea l'ordine</button>
            <button formaction="/ordini/acquisire/${a.id}/salva">Salva le correzioni</button></p>` : ''}
      </form>` : ''}
      ${a.stato !== 'confermato' ? html`<p class="pulsanti">
        ${a.contenuto && ['ordine', 'email'].includes(a.tipo) ? html`<form method="post" action="/ordini/acquisire/${a.id}/rileggi" class="in-linea"><button>Rileggi con l'IA</button></form>` : ''}
        ${a.stato !== 'scartato' ? html`<form method="post" action="/ordini/acquisire/${a.id}/scarta" class="in-linea"><button class="pericolo">Scarta</button></form>` : ''}</p>` : ''}`,
      { avviso }));
  });

  r.get('/:id/file', async (req, res) => {
    const a = await q1(`SELECT nome_file, tipo, mime, contenuto FROM acquisizioni WHERE id = $1`, [Number(req.params.id)]);
    if (!a?.contenuto) return res.status(404).send('File non disponibile');
    // PDF e immagini si aprono nel browser; email e altri file si scaricano (mai mostrati come pagina)
    const inLinea = /^(application\/pdf|image\/(png|jpeg|webp))$/.test(a.mime ?? '') && a.tipo === 'ordine';
    res.setHeader('Content-Type', inLinea ? a.mime : a.mime === 'text/plain' ? 'text/plain; charset=utf-8' : 'application/octet-stream');
    res.setHeader('Content-Disposition', `${inLinea ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(a.nome_file)}`);
    res.send(a.contenuto);
  });

  r.post('/:id/salva', async (req, res) => {
    const id = Number(req.params.id);
    const a = await q1(`SELECT proposta FROM acquisizioni WHERE id = $1`, [id]);
    if (a) await salvaProposta(id, propostaDa(req.body, a.proposta));
    res.redirect(`/ordini/acquisire/${id}?salvato=1`);
  });

  r.post('/:id/conferma', async (req, res) => {
    const id = Number(req.params.id);
    const a = await q1(`SELECT proposta FROM acquisizioni WHERE id = $1`, [id]);
    if (!a) return res.status(404).send('Non trovato');
    const p = propostaDa(req.body, a.proposta);
    try {
      const ordineId = await conferma(id, p, req.session.utente!.id, oggiRoma());
      res.redirect(`/ordini/${ordineId}?salvato=1`);
    } catch (e: any) {
      await salvaProposta(id, p);   // le correzioni scritte non si perdono
      res.redirect(`/ordini/acquisire/${id}?errore=${encodeURIComponent(e.message)}`);
    }
  });

  r.post('/:id/rileggi', async (req, res) => {
    const id = Number(req.params.id);
    await q(`UPDATE acquisizioni SET stato = 'nuovo' WHERE id = $1 AND stato IN ('da_confermare', 'errore', 'scartato') AND contenuto IS NOT NULL`, [id]);
    await elabora(id);
    res.redirect(`/ordini/acquisire/${id}`);
  });

  r.post('/:id/scarta', async (req, res) => {
    await scarta(Number(req.params.id));
    res.redirect('/ordini/acquisire');
  });

  return r;
}
