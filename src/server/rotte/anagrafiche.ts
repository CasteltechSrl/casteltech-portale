/**
 * Impostazioni → Anagrafiche: clienti e prodotti (solo ufficio).
 * Nei preventivi cliente e codice si scelgono SOLO da qui. Tutto in maiuscolo.
 */
import express, { Router, type Request } from 'express';
import { gunzipSync } from 'node:zlib';
import { q, q1, transazione } from '../db.js';
import { layout } from '../views/layout.js';
import { html, raw, type Raw } from '../views/html.js';
import { caricaAnagrafiche, maiuscolo, chiaveCodice, type FileAnagrafiche } from '../anagrafiche-servizio.js';

export function rotteAnagrafiche(menu: (t: string) => Raw) {
  const r = Router();
  const pag = (req: Request, contenuto: Raw, avviso?: string) =>
    String(layout({ titolo: 'Anagrafiche', utente: req.session.utente, attiva: 'impostazioni', contenuto: html`${menu('Anagrafiche')}${contenuto}`, avviso, script: 'anagrafiche.js' }));
  const torna = (msg: string, extra = '') => `/impostazioni/anagrafiche?msg=${encodeURIComponent(msg)}${extra}`;

  r.get('/', async (req, res) => {
    const filtro = Number(req.query.cliente) || 0;
    const clienti = await q(`SELECT c.id, c.ragione_sociale, c.partita_iva,
        (SELECT count(*)::int FROM prodotti p WHERE p.cliente_id = c.id) AS prodotti,
        (SELECT count(*)::int FROM preventivi v WHERE v.cliente_id = c.id) AS preventivi,
        (SELECT count(*)::int FROM ordini o WHERE o.cliente_id = c.id) + (SELECT count(*)::int FROM commesse k WHERE k.cliente_id = c.id) AS altri
      FROM clienti c ORDER BY ragione_sociale`);
    const prodotti = await q(`SELECT p.id, p.codice, p.descrizione, p.cliente_id,
        (SELECT count(*)::int FROM prodotti_revisioni r JOIN preventivi v ON v.revisione_id = r.id WHERE r.prodotto_id = p.id) AS preventivi,
        (SELECT count(*)::int FROM ordini_righe o WHERE o.prodotto_id = p.id)
          + (SELECT count(*)::int FROM prodotti_revisioni r JOIN commesse k ON k.revisione_id = r.id WHERE r.prodotto_id = p.id) AS altri
      FROM prodotti p WHERE ($1 = 0 OR p.cliente_id = $1 OR ($1 = -1 AND p.cliente_id IS NULL))
      ORDER BY p.codice LIMIT 1000`, [filtro]);
    const opzClienti = (sel: number | null, conVuoto = true) => html`
      ${conVuoto ? html`<option value="">— senza cliente —</option>` : ''}
      ${clienti.map(c => html`<option value="${c.id}" ${c.id === sel ? raw('selected') : ''}>${c.ragione_sociale}</option>`)}`;
    res.send(pag(req, html`
      <p class="nota">Nei preventivi cliente, codice e descrizione si scelgono solo da queste anagrafiche. Tutto viene salvato in MAIUSCOLO.
        Quando collegheremo mOKa, queste anagrafiche si sincronizzeranno da sole.</p>

      <details class="blocco">
        <summary>Carica l'elenco ufficiale (file preparato da Claude)</summary>
        <div class="stretto-form" style="padding: 0 1rem 1rem">
          <p class="nota">Aggiunge i clienti e i prodotti nuovi del file, aggiorna nomi e descrizioni di quelli esistenti
            (anche se li avevi corretti a mano) e collega i nomi scritti in modo diverso nei preventivi. Prima mostra un riepilogo e chiede conferma.</p>
          <label>File <input type="file" id="file-anagrafiche" accept=".gz,.json"></label>
          <label class="spunta"><input type="checkbox" id="togli-anagrafiche"> Togli anche i clienti e i prodotti che non sono nel file (solo quelli mai usati nei preventivi)</label>
          <button class="primario" type="button" id="carica-anagrafiche">Controlla il file</button>
          <output id="esito-anagrafiche"></output>
          <button class="primario" type="button" id="conferma-anagrafiche" hidden>Conferma e carica</button>
        </div>
      </details>

      <p class="nota">Il tasto <b>Elimina</b> compare solo su clienti e prodotti mai usati (preventivi, commesse, ordini): quelli inseriti per errore.</p>
      <h2>Clienti <span class="nota">(${clienti.length})</span></h2>
      <div class="tabella-scorre limitata"><table class="editor">
        <thead><tr><th>Ragione sociale</th><th>Partita IVA</th><th class="n">Prodotti</th><th class="n">Preventivi</th><th></th></tr></thead>
        <tbody>
          <tr class="nuova-riga">
            <td class="largo"><input name="ragione_sociale" form="c-nuovo" class="maiuscolo" required placeholder="NUOVO CLIENTE"></td>
            <td><input name="partita_iva" form="c-nuovo" class="maiuscolo"></td><td></td><td></td>
            <td><form method="post" action="/impostazioni/anagrafiche/clienti" id="c-nuovo"><button class="primario">Aggiungi</button></form></td>
          </tr>
          ${clienti.map(c => html`<tr>
            <td class="largo"><input name="ragione_sociale" form="c-${c.id}" value="${c.ragione_sociale}" class="maiuscolo"></td>
            <td><input name="partita_iva" form="c-${c.id}" value="${c.partita_iva ?? ''}" class="maiuscolo"></td>
            <td class="n"><a href="/impostazioni/anagrafiche?cliente=${c.id}#prodotti">${c.prodotti}</a></td><td class="n">${c.preventivi}</td>
            <td class="nowrap"><form method="post" action="/impostazioni/anagrafiche/clienti/${c.id}" id="c-${c.id}"><button>Salva</button></form>
              ${eliminabile(c) ? html`<form method="post" action="/impostazioni/anagrafiche/clienti/${c.id}/elimina" class="inline"
                data-conferma="${`Eliminare il cliente ${c.ragione_sociale} dall'anagrafica?`}"><button class="link negativo">Elimina</button></form>` : ''}</td></tr>`)}
        </tbody></table></div>

      <h2 id="prodotti">Prodotti</h2>
      <form method="get" class="cerca" action="/impostazioni/anagrafiche#prodotti">
        <select name="cliente"><option value="0">Tutti i clienti</option><option value="-1" ${filtro === -1 ? raw('selected') : ''}>— senza cliente —</option>${opzClienti(filtro, false)}</select>
        <button>Filtra</button>
      </form>
      <div class="tabella-scorre limitata"><table class="editor">
        <thead><tr><th>Codice</th><th>Descrizione</th><th>Cliente</th><th class="n">Preventivi</th><th></th></tr></thead>
        <tbody>
          <tr class="nuova-riga">
            <td><input name="codice" form="p-nuovo" class="maiuscolo" required placeholder="NUOVO CODICE"></td>
            <td class="largo"><input name="descrizione" form="p-nuovo" class="maiuscolo" required></td>
            <td><select name="cliente_id" form="p-nuovo">${opzClienti(filtro > 0 ? filtro : null)}</select></td><td></td>
            <td><form method="post" action="/impostazioni/anagrafiche/prodotti" id="p-nuovo"><button class="primario">Aggiungi</button></form></td>
          </tr>
          ${prodotti.map(p => html`<tr>
            <td><input name="codice" form="p-${p.id}" value="${p.codice}" class="maiuscolo"></td>
            <td class="largo"><input name="descrizione" form="p-${p.id}" value="${p.descrizione ?? ''}" class="maiuscolo"></td>
            <td><select name="cliente_id" form="p-${p.id}">${opzClienti(p.cliente_id)}</select></td><td class="n">${p.preventivi}</td>
            <td class="nowrap"><form method="post" action="/impostazioni/anagrafiche/prodotti/${p.id}" id="p-${p.id}"><button>Salva</button></form>
              ${eliminabile(p) ? html`<form method="post" action="/impostazioni/anagrafiche/prodotti/${p.id}/elimina" class="inline"
                data-conferma="${`Eliminare il prodotto ${p.codice} dall'anagrafica?`}"><button class="link negativo">Elimina</button></form>` : ''}</td></tr>`)}
        </tbody></table></div>`, req.query.msg ? String(req.query.msg) : undefined));
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
  r.post('/prodotti', async (req, res) => {
    const codice = maiuscolo(req.body.codice), descrizione = maiuscolo(req.body.descrizione), cliente = idCliente(req.body.cliente_id);
    if (!codice || !descrizione) return res.redirect(torna('Servono codice e descrizione.', '#prodotti'));
    if (await duplicatoProdotto(codice, cliente)) return res.redirect(torna(`Il codice ${codice} esiste già per questo cliente.`, '#prodotti'));
    await q(`INSERT INTO prodotti (codice, descrizione, cliente_id) VALUES ($1,$2,$3)`, [codice, descrizione, cliente]);
    res.redirect(torna(`${codice} aggiunto.`, `&cliente=${cliente ?? 0}#prodotti`));
  });
  r.post('/prodotti/:id', async (req, res) => {
    const id = Number(req.params.id);
    const codice = maiuscolo(req.body.codice), descrizione = maiuscolo(req.body.descrizione), cliente = idCliente(req.body.cliente_id);
    if (!codice || !descrizione) return res.redirect(torna('Servono codice e descrizione.', '#prodotti'));
    if (await duplicatoProdotto(codice, cliente, id)) return res.redirect(torna(`Il codice ${codice} esiste già per questo cliente.`, '#prodotti'));
    await q(`UPDATE prodotti SET codice = $2, descrizione = $3, cliente_id = $4 WHERE id = $1`, [id, codice, descrizione, cliente]);
    await q(`UPDATE preventivi v SET intestazione = v.intestazione || jsonb_build_object('codice', $2::text, 'descrizione', $3::text)
      FROM prodotti_revisioni r WHERE r.id = v.revisione_id AND r.prodotto_id = $1`, [id, codice, descrizione]);
    res.redirect(torna(`${codice} salvato.`, `&cliente=${cliente ?? 0}#prodotti`));
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
    if (!p) return res.redirect(torna('Prodotto non trovato.', '#prodotti'));
    const dopo = `&cliente=${p.cliente_id ?? 0}#prodotti`;
    try {
      await transazione(async t => {
        // le revisioni senza preventivi né commesse vanno via con il prodotto; se è usato, il database lo impedisce
        await t.query(`DELETE FROM prodotti_revisioni WHERE prodotto_id = $1`, [id]);
        await t.query(`DELETE FROM prodotti WHERE id = $1`, [id]);
      });
    } catch (e: any) {
      if (e?.code === '23503') return res.redirect(torna(`${p.codice} non eliminato: è già usato in preventivi, commesse, ordini o nello storico.`, dopo));
      throw e;
    }
    res.redirect(torna(`${p.codice} eliminato.`, dopo));
  });

  return r;
}

/** Il tasto Elimina compare solo se il cliente / prodotto non è mai stato usato. */
const eliminabile = (x: { preventivi: number; altri: number; prodotti?: number }) => !x.preventivi && !x.altri && !x.prodotti;
