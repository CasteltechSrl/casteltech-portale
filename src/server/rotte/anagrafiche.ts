/**
 * Anagrafiche (solo ufficio): una sola sezione con tutte le anagrafiche (Adriano, 27/10/2026).
 * In alto i tasti Clienti / Fornitori / Prodotti / Componenti, sotto l'elenco con la ricerca veloce (public/ricerca.js).
 * Nei preventivi cliente e codice si scelgono SOLO da qui. Tutto in maiuscolo.
 */
import express, { Router, type Request } from 'express';
import { gunzipSync } from 'node:zlib';
import ExcelJS from 'exceljs';
import { q, q1, transazione } from '../db.js';
import { layout } from '../views/layout.js';
import { html, num, raw, type Raw } from '../views/html.js';
import { caricaAnagrafiche, maiuscolo, chiaveCodice, type FileAnagrafiche } from '../anagrafiche-servizio.js';
import { cercaComponenti, conteggiComponenti } from '../codifica-servizio.js';
import { rotteFornitoriAnagrafica } from './fornitori-anagrafica.js';

export type SchedaAnagrafiche = 'clienti' | 'fornitori' | 'prodotti' | 'componenti';
const SCHEDE: [SchedaAnagrafiche, string][] = [['clienti', 'Clienti'], ['fornitori', 'Fornitori'], ['prodotti', 'Prodotti'], ['componenti', 'Componenti']];

/** Pagina della sezione: tasti in alto (con quanti sono) e il contenuto della scheda scelta. */
export type PaginaAnagrafiche = (req: Request, scheda: SchedaAnagrafiche, contenuto: Raw, avviso?: string, script?: string) => Promise<string>;
const paginaAnagrafiche: PaginaAnagrafiche = async (req, scheda, contenuto, avviso, script) => {
  const n = (await q1<Record<SchedaAnagrafiche, number>>(`SELECT (SELECT count(*)::int FROM clienti) AS clienti,
    (SELECT count(*)::int FROM fornitori_anagrafica) AS fornitori, (SELECT count(*)::int FROM prodotti) AS prodotti,
    (SELECT count(*)::int FROM componenti) AS componenti`))!;
  const titolo = SCHEDE.find(([s]) => s === scheda)![1];
  return String(layout({ titolo, utente: req.session.utente, attiva: 'anagrafiche', avviso, script: ['ricerca.js', ...(script ? [script] : [])], contenuto: html`
    <h1>Anagrafiche</h1>
    <nav class="tasti-anagrafiche">${SCHEDE.map(([s, t]) => html`<a href="/anagrafiche/${s}" class="${s === scheda ? 'attiva' : ''}">${t} <span class="conta">${num(n[s], 0)}</span></a>`)}</nav>
    ${contenuto}` }));
};

/** Casella della ricerca veloce: filtra le righe della tabella `tabella` mentre si scrive. */
const ricercaVeloce = (tabella: string, segnaposto: string, totale: number) => html`
  <div class="ricerca-veloce"><input type="search" data-filtra="${tabella}" data-conta="conta-${tabella}" placeholder="${segnaposto}" autofocus autocomplete="off">
    <span class="nota">Trovati: <b id="conta-${tabella}">${totale}</b></span></div>`;

export function rotteAnagrafiche() {
  const r = Router();
  const pag = (req: Request, scheda: SchedaAnagrafiche, contenuto: Raw, avviso?: string) => paginaAnagrafiche(req, scheda, contenuto, avviso, 'anagrafiche.js');
  const torna = (msg: string, dove = '/clienti', extra = '') => `/anagrafiche${dove}?msg=${encodeURIComponent(msg)}${extra}`;
  const msg = (req: Request) => (req.query.msg ? String(req.query.msg) : undefined);

  r.get('/', (_req, res) => res.redirect('/anagrafiche/clienti'));
  r.use('/fornitori', rotteFornitoriAnagrafica(paginaAnagrafiche));

  const elencoClienti = () => q(`SELECT c.id, c.ragione_sociale, c.partita_iva,
      (SELECT count(*)::int FROM prodotti p WHERE p.cliente_id = c.id) AS prodotti,
      (SELECT count(*)::int FROM preventivi v WHERE v.cliente_id = c.id) AS preventivi,
      (SELECT count(*)::int FROM ordini o WHERE o.cliente_id = c.id) + (SELECT count(*)::int FROM commesse k WHERE k.cliente_id = c.id) AS altri
    FROM clienti c ORDER BY ragione_sociale`);

  // il file ufficiale porta insieme clienti e prodotti: lo stesso riquadro sta in tutte e due le schede
  const caricaFile = html`
    <details class="blocco">
      <summary>Carica l'elenco ufficiale di clienti e prodotti (file preparato da Claude)</summary>
      <div class="stretto-form dentro-blocco">
        <p class="nota">Aggiunge i clienti e i prodotti nuovi del file, aggiorna nomi e descrizioni di quelli esistenti
          (anche se li avevi corretti a mano) e collega i nomi scritti in modo diverso nei preventivi. Prima mostra un riepilogo e chiede conferma.</p>
        <label>File <input type="file" id="file-anagrafiche" accept=".gz,.json"></label>
        <label class="spunta"><input type="checkbox" id="togli-anagrafiche"> Togli anche i clienti e i prodotti che non sono nel file (solo quelli mai usati nei preventivi)</label>
        <button class="primario" type="button" id="carica-anagrafiche">Controlla il file</button>
        <output id="esito-anagrafiche"></output>
        <button class="primario" type="button" id="conferma-anagrafiche" hidden>Conferma e carica</button>
      </div>
    </details>`;

  // ── Clienti ──
  r.get('/clienti', async (req, res) => {
    const clienti = await elencoClienti();
    res.send(await pag(req, 'clienti', html`
      <p class="nota">Nei preventivi il cliente si sceglie solo da qui. Tutto viene salvato in MAIUSCOLO.
        Il tasto <b>Elimina</b> compare solo sui clienti mai usati (preventivi, commesse, ordini): quelli inseriti per errore.</p>
      ${ricercaVeloce('tab-clienti', 'Cerca ragione sociale o partita IVA…', clienti.length)}
      <div class="tabella-scorre limitata"><table class="editor" id="tab-clienti">
        <thead><tr><th>Ragione sociale</th><th>Partita IVA</th><th class="n">Prodotti</th><th class="n">Preventivi</th><th></th></tr></thead>
        <tbody>
          <tr class="nuova-riga">
            <td class="largo"><input name="ragione_sociale" form="c-nuovo" class="maiuscolo" required placeholder="NUOVO CLIENTE"></td>
            <td><input name="partita_iva" form="c-nuovo" class="maiuscolo"></td><td></td><td></td>
            <td><form method="post" action="/anagrafiche/clienti" id="c-nuovo"><button class="primario">Aggiungi</button></form></td>
          </tr>
          ${clienti.map(c => html`<tr>
            <td class="largo"><input name="ragione_sociale" form="c-${c.id}" value="${c.ragione_sociale}" class="maiuscolo"></td>
            <td><input name="partita_iva" form="c-${c.id}" value="${c.partita_iva ?? ''}" class="maiuscolo"></td>
            <td class="n"><a href="/anagrafiche/prodotti?cliente=${c.id}" title="Vedi i prodotti di questo cliente">${c.prodotti}</a></td><td class="n">${c.preventivi}</td>
            <td class="nowrap"><form method="post" action="/anagrafiche/clienti/${c.id}" id="c-${c.id}"><button>Salva</button></form>
              ${eliminabile(c) ? html`<form method="post" action="/anagrafiche/clienti/${c.id}/elimina" class="inline"
                data-conferma="${`Eliminare il cliente ${c.ragione_sociale} dall'anagrafica?`}"><button class="link negativo">Elimina</button></form>` : ''}</td></tr>`)}
        </tbody></table></div>
      ${caricaFile}`, msg(req)));
  });

  // ── Prodotti ──
  r.get('/prodotti', async (req, res) => {
    const filtro = Number(req.query.cliente) || 0;
    const clienti = await elencoClienti();
    const prodotti = await q(`SELECT p.id, p.codice, p.descrizione, p.cliente_id,
        (SELECT count(*)::int FROM prodotti_revisioni r JOIN preventivi v ON v.revisione_id = r.id WHERE r.prodotto_id = p.id) AS preventivi,
        (SELECT count(*)::int FROM ordini_righe o WHERE o.prodotto_id = p.id)
          + (SELECT count(*)::int FROM prodotti_revisioni r JOIN commesse k ON k.revisione_id = r.id WHERE r.prodotto_id = p.id) AS altri
      FROM prodotti p WHERE ($1 = 0 OR p.cliente_id = $1 OR ($1 = -1 AND p.cliente_id IS NULL))
      ORDER BY p.codice LIMIT 2000`, [filtro]);
    const opzClienti = (sel: number | null, conVuoto = true) => html`
      ${conVuoto ? html`<option value="">— senza cliente —</option>` : ''}
      ${clienti.map(c => html`<option value="${c.id}" ${c.id === sel ? raw('selected') : ''}>${c.ragione_sociale}</option>`)}`;
    res.send(await pag(req, 'prodotti', html`
      <p class="nota">Nei preventivi codice e descrizione si scelgono solo da qui. Tutto viene salvato in MAIUSCOLO.
        Il tasto <b>Elimina</b> compare solo sui prodotti mai usati (preventivi, commesse, ordini).</p>
      <form method="get" class="cerca" action="/anagrafiche/prodotti">
        <select name="cliente" class="invia-subito"><option value="0">Tutti i clienti</option><option value="-1" ${filtro === -1 ? raw('selected') : ''}>— senza cliente —</option>${opzClienti(filtro, false)}</select>
        <noscript><button>Filtra</button></noscript>
      </form>
      ${ricercaVeloce('tab-prodotti', 'Cerca codice, descrizione o cliente…', prodotti.length)}
      <div class="tabella-scorre limitata"><table class="editor" id="tab-prodotti">
        <thead><tr><th>Codice</th><th>Descrizione</th><th>Cliente</th><th class="n">Preventivi</th><th></th></tr></thead>
        <tbody>
          <tr class="nuova-riga">
            <td><input name="codice" form="p-nuovo" class="maiuscolo" required placeholder="NUOVO CODICE"></td>
            <td class="largo"><input name="descrizione" form="p-nuovo" class="maiuscolo" required></td>
            <td><select name="cliente_id" form="p-nuovo">${opzClienti(filtro > 0 ? filtro : null)}</select></td><td></td>
            <td><form method="post" action="/anagrafiche/prodotti" id="p-nuovo"><input type="hidden" name="filtro" value="${filtro}"><button class="primario">Aggiungi</button></form></td>
          </tr>
          ${prodotti.map(p => html`<tr>
            <td><input name="codice" form="p-${p.id}" value="${p.codice}" class="maiuscolo"></td>
            <td class="largo"><input name="descrizione" form="p-${p.id}" value="${p.descrizione ?? ''}" class="maiuscolo"></td>
            <td><select name="cliente_id" form="p-${p.id}">${opzClienti(p.cliente_id)}</select></td><td class="n">${p.preventivi}</td>
            <td class="nowrap"><form method="post" action="/anagrafiche/prodotti/${p.id}" id="p-${p.id}"><input type="hidden" name="filtro" value="${filtro}"><button>Salva</button></form>
              ${eliminabile(p) ? html`<form method="post" action="/anagrafiche/prodotti/${p.id}/elimina" class="inline"
                data-conferma="${`Eliminare il prodotto ${p.codice} dall'anagrafica?`}"><button class="link negativo">Elimina</button></form>` : ''}</td></tr>`)}
        </tbody></table></div>
      ${prodotti.length === 2000 ? html`<p class="nota">Mostrati i primi 2.000: scegli un cliente per vedere gli altri.</p>` : ''}
      ${caricaFile}`, msg(req)));
  });

  // ── Componenti: l'archivio della codifica (tanti: la ricerca si fa nel database, con Invio) ──
  r.get('/componenti', async (req, res) => {
    const testo = String(req.query.q ?? '').trim();
    const conti = await conteggiComponenti();
    const righe = testo ? await cercaComponenti(testo) : [];
    res.send(await paginaAnagrafiche(req, 'componenti', html`
      <div class="intestazione-pagina"><p class="nota">${num(conti.totale, 0)} componenti in archivio, ${num(conti.gestionale, 0)} con codice gestionale.
        I componenti nuovi entrano da soli quando si codifica una BOM (<a href="/componenti">Componenti</a>).
        ${conti.totale ? '' : html` L'archivio iniziale si carica da <a href="/impostazioni/componenti">Impostazioni → Componenti</a>.`}</p>
        <a class="bottone" href="/anagrafiche/componenti.xlsx">Scarica tutto in Excel</a></div>
      <form class="ricerca-veloce" method="get"><input type="search" name="q" value="${testo}" placeholder="Cerca P/N, codice di produzione o gestionale, descrizione… e premi Invio" autofocus>
        <button class="primario">Cerca</button></form>
      ${testo ? (righe.length ? html`<div class="tabella-scorre"><table class="componenti"><thead><tr><th>P/N</th><th>Fam.</th><th>Codice produzione</th>
        <th>Codice gestionale</th><th>Descrizione</th><th>Stato</th><th>Fonte</th><th>Note</th><th></th></tr></thead><tbody>
        ${righe.map(c => html`<tr><td>${c.pn}</td><td>${c.famiglia}</td><td class="codice">${c.codice_produzione}</td><td class="codice">${c.codice_gestionale}</td>
          <td class="taglia">${c.descrizione}</td><td>${c.stato}</td><td class="taglia">${c.fonte}</td><td class="taglia" title="${c.note ?? ''}">${c.note}</td>
          <td><form method="post" action="/anagrafiche/componenti/${c.id}/elimina?q=${encodeURIComponent(testo)}" class="inline"
            data-conferma="${`Eliminare dall'archivio ${c.codice_gestionale || c.codice_produzione || c.pn}?` + (c.codice_gestionale ? `\n\nSe il codice ${c.codice_gestionale} è già stato creato in Moka, non eliminarlo: il suo numero verrebbe riassegnato al prossimo componente nuovo.` : '')}">
            <button class="link negativo">Elimina</button></form></td></tr>`)}
        </tbody></table></div>${righe.length === 200 ? html`<p class="nota">Mostrati i primi 200: scrivi qualcosa in più per restringere.</p>` : ''}`
        : html`<p class="vuoto">Nessun componente trovato.</p>`) : html`<p class="vuoto">Scrivi cosa cerchi e premi Invio.</p>`}`, msg(req)));
  });
  // componente codificato per errore
  r.post('/componenti/:id/elimina', async (req, res) => {
    await q(`DELETE FROM componenti WHERE id = $1`, [Number(req.params.id)]);
    res.redirect(`/anagrafiche/componenti?q=${encodeURIComponent(String(req.query.q ?? ''))}&msg=${encodeURIComponent('Componente eliminato dall\'archivio.')}`);
  });
  r.get('/componenti.xlsx', async (_req, res) => {
    const righe = await q<any>(`SELECT pn, produttore, famiglia, codice_produzione, codice_gestionale, descrizione, stato, fonte, note, attributi FROM componenti ORDER BY codice_gestionale NULLS LAST, id`);
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Componenti');
    ws.columns = [['P/N', 24], ['Produttore', 16], ['Famiglia', 8], ['Codice produzione', 32], ['Codice gestionale', 22], ['Descrizione', 40], ['Stato', 14], ['Fonte', 22], ['Note', 50], ['Attributi', 40]]
      .map(([header, width]) => ({ header: header as string, width: width as number }));
    ws.getRow(1).font = { bold: true };
    for (const c of righe) ws.addRow([c.pn, c.produttore, c.famiglia, c.codice_produzione, c.codice_gestionale, c.descrizione, c.stato, c.fonte, c.note,
      Object.entries(c.attributi ?? {}).map(([k, v]) => `${k}=${v}`).join('; ')]);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="archivio_componenti_${new Date().toISOString().slice(0, 10)}.xlsx"`);
    res.send(Buffer.from(await wb.xlsx.writeBuffer()));
  });

  r.post('/carica', express.raw({ type: '*/*', limit: '20mb' }), async (req, res) => {
    let f: FileAnagrafiche;
    try {
      let b = req.body as Buffer;
      if (b[0] === 0x1f && b[1] === 0x8b) b = gunzipSync(b);
      f = JSON.parse(b.toString('utf8'));
      if (!Array.isArray(f.clienti) || !Array.isArray(f.prodotti)) throw new Error();
    } catch { return res.status(400).json({ errore: 'File non valido: serve anagrafiche_casteltech.json.gz' }); }
    res.json(await caricaAnagrafiche(f, { togli: req.query.togli === '1', anteprima: req.query.conferma !== '1' }));
  });

  const duplicatoCliente = async (nome: string, escludi = 0) =>
    q1(`SELECT 1 FROM clienti WHERE upper(ragione_sociale) = $1 AND id <> $2`, [nome, escludi]);
  r.post('/clienti', async (req, res) => {
    const nome = maiuscolo(req.body.ragione_sociale);
    if (!nome) return res.redirect(torna('Scrivi la ragione sociale.'));
    if (await duplicatoCliente(nome)) return res.redirect(torna(`${nome} esiste già.`));
    await q(`INSERT INTO clienti (ragione_sociale, partita_iva) VALUES ($1, nullif($2, ''))`, [nome, maiuscolo(req.body.partita_iva)]);
    res.redirect(torna(`${nome} aggiunto.`));
  });
  r.post('/clienti/:id', async (req, res) => {
    const nome = maiuscolo(req.body.ragione_sociale), id = Number(req.params.id);
    if (!nome) return res.redirect(torna('La ragione sociale non può essere vuota.'));
    if (await duplicatoCliente(nome, id)) return res.redirect(torna(`${nome} esiste già.`));
    await q(`UPDATE clienti SET ragione_sociale = $2, partita_iva = nullif($3, ''), aggiornato_il = now() WHERE id = $1`, [id, nome, maiuscolo(req.body.partita_iva)]);
    // aggiorna il nome nei preventivi collegati
    await q(`UPDATE preventivi SET intestazione = jsonb_set(intestazione, '{cliente}', to_jsonb($2::text)) WHERE cliente_id = $1`, [id, nome]);
    res.redirect(torna(`${nome} salvato.`));
  });

  const duplicatoProdotto = async (codice: string, cliente: number | null, escludi = 0) =>
    q1(`SELECT 1 FROM prodotti WHERE regexp_replace(upper(codice), '[^A-Z0-9]', '', 'g') = $1 AND cliente_id IS NOT DISTINCT FROM $2 AND id <> $3`, [chiaveCodice(codice), cliente, escludi]);
  const idCliente = (x: unknown) => (Number(x) > 0 ? Number(x) : null);
  // dopo il salvataggio si torna all'elenco com'era (tutti i clienti o quello scelto), altrimenti al cliente del prodotto
  const dopoProdotto = (body: any, cliente: number | null) => `&cliente=${body.filtro !== undefined ? Number(body.filtro) || 0 : cliente ?? 0}`;
  r.post('/prodotti', async (req, res) => {
    const codice = maiuscolo(req.body.codice), descrizione = maiuscolo(req.body.descrizione), cliente = idCliente(req.body.cliente_id);
    if (!codice || !descrizione) return res.redirect(torna('Servono codice e descrizione.', '/prodotti'));
    if (await duplicatoProdotto(codice, cliente)) return res.redirect(torna(`Il codice ${codice} esiste già per questo cliente.`, '/prodotti'));
    await q(`INSERT INTO prodotti (codice, descrizione, cliente_id) VALUES ($1,$2,$3)`, [codice, descrizione, cliente]);
    res.redirect(torna(`${codice} aggiunto.`, '/prodotti', dopoProdotto(req.body, cliente)));
  });
  r.post('/prodotti/:id', async (req, res) => {
    const id = Number(req.params.id);
    const codice = maiuscolo(req.body.codice), descrizione = maiuscolo(req.body.descrizione), cliente = idCliente(req.body.cliente_id);
    if (!codice || !descrizione) return res.redirect(torna('Servono codice e descrizione.', '/prodotti'));
    if (await duplicatoProdotto(codice, cliente, id)) return res.redirect(torna(`Il codice ${codice} esiste già per questo cliente.`, '/prodotti'));
    await q(`UPDATE prodotti SET codice = $2, descrizione = $3, cliente_id = $4 WHERE id = $1`, [id, codice, descrizione, cliente]);
    await q(`UPDATE preventivi v SET intestazione = v.intestazione || jsonb_build_object('codice', $2::text, 'descrizione', $3::text)
      FROM prodotti_revisioni r WHERE r.id = v.revisione_id AND r.prodotto_id = $1`, [id, codice, descrizione]);
    res.redirect(torna(`${codice} salvato.`, '/prodotti', dopoProdotto(req.body, cliente)));
  });
  // ── Elimina (inseriti per errore, mai usati) ──
  r.post('/clienti/:id/elimina', async (req, res) => {
    const id = Number(req.params.id);
    const c = await q1(`SELECT ragione_sociale FROM clienti WHERE id = $1`, [id]);
    if (!c) return res.redirect(torna('Cliente non trovato.'));
    const uso = await q1(`SELECT (SELECT count(*)::int FROM prodotti WHERE cliente_id = $1) AS prodotti,
        (SELECT count(*)::int FROM preventivi WHERE cliente_id = $1) + (SELECT count(*)::int FROM commesse WHERE cliente_id = $1)
          + (SELECT count(*)::int FROM ordini WHERE cliente_id = $1) AS altri`, [id]);
    if (uso!.prodotti) return res.redirect(torna(`${c.ragione_sociale} non eliminato: ha ${uso!.prodotti} prodotti in anagrafica (eliminali o spostali prima).`));
    if (uso!.altri) return res.redirect(torna(`${c.ragione_sociale} non eliminato: è già usato in preventivi, commesse o ordini.`));
    try {
      await transazione(async t => {
        // nel CRM: l'azienda creata da sola per questo cliente (senza referenti né attività) va via; le altre restano, scollegate
        await t.query(`DELETE FROM crm_aziende a WHERE a.cliente_id = $1 AND a.codice IS NULL
          AND NOT EXISTS (SELECT 1 FROM crm_contatti k WHERE k.azienda_id = a.id) AND NOT EXISTS (SELECT 1 FROM crm_attivita x WHERE x.azienda_id = a.id)`, [id]);
        await t.query(`UPDATE crm_aziende SET cliente_id = NULL, stato = CASE WHEN stato = 'cliente' THEN 'da_contattare' ELSE stato END WHERE cliente_id = $1`, [id]);
        await t.query(`DELETE FROM clienti WHERE id = $1`, [id]);
      });
    } catch (e: any) {
      if (e?.code === '23503') return res.redirect(torna(`${c.ragione_sociale} non eliminato: è collegato a DDT o fatture già caricati.`));
      throw e;
    }
    res.redirect(torna(`${c.ragione_sociale} eliminato.`));
  });

  r.post('/prodotti/:id/elimina', async (req, res) => {
    const id = Number(req.params.id);
    const p = await q1(`SELECT codice, cliente_id FROM prodotti WHERE id = $1`, [id]);
    if (!p) return res.redirect(torna('Prodotto non trovato.', '/prodotti'));
    const dopo = `&cliente=${p.cliente_id ?? 0}`;
    try {
      await transazione(async t => {
        // le revisioni senza preventivi né commesse vanno via con il prodotto; se è usato, il database lo impedisce
        await t.query(`DELETE FROM prodotti_revisioni WHERE prodotto_id = $1`, [id]);
        await t.query(`DELETE FROM prodotti WHERE id = $1`, [id]);
      });
    } catch (e: any) {
      if (e?.code === '23503') return res.redirect(torna(`${p.codice} non eliminato: è già usato in preventivi, commesse, ordini o nello storico.`, '/prodotti', dopo));
      throw e;
    }
    res.redirect(torna(`${p.codice} eliminato.`, '/prodotti', dopo));
  });

  return r;
}

/** Il tasto Elimina compare solo se il cliente / prodotto non è mai stato usato. */
const eliminabile = (x: { preventivi: number; altri: number; prodotti?: number }) => !x.preventivi && !x.altri && !x.prodotti;
