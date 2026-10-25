/**
 * Sezione Componenti (solo ufficio): BOM con codifica e preventivo materiali, codifica di un P/N, archivio componenti.
 * Logica in src/server/codifica-servizio.ts; regole in src/engine/codifica/* e src/engine/acquisti.ts.
 */
import express, { Router, type Request } from 'express';
import ExcelJS from 'exceljs';
import { q, q1 } from '../db.js';
import { layout } from '../views/layout.js';
import { html, num, raw, type Raw } from '../views/html.js';
import {
  ATTR, ESITI, ETICHETTE, ETICHETTE_RUOLI, FAMIGLIE, FILE_SINGOLA, avanzamenti, avviaElaborazione, cercaComponenti, conteggiComponenti, correggiRiga,
  creaAnalisi, creaCodificaSingola, excelAnalisi, leggiFileBom, salvaInArchivio, type RigaBom, type Riepilogo,
} from '../codifica-servizio.js';
import { NOTA_DA_VALIDARE } from '../../engine/codifica/bom.js';
import { NOMI_FORNITORI, prezzoUnitario, type Offerta } from '../../engine/acquisti.js';
import type { Ruolo } from '../../engine/codifica/bom.js';
import { fornitoriConfigurati } from '../fornitori.js';
import { iaConfigurata } from '../lettura-ia.js';

const euro4 = (x: number | null | undefined) => x == null ? '' : new Intl.NumberFormat('it-IT', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(x);
const euro2 = (x: number | null | undefined) => x == null ? '' : new Intl.NumberFormat('it-IT', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(x) + ' €';
const CLASSE_ESITO: Record<string, string> = { [ESITI.DB]: 'archivio', [ESITI.DB_PROD]: 'archivio', [ESITI.DB_INC]: 'manca', [ESITI.DB_FATTO]: 'nuovo',
  [ESITI.NUOVO]: 'nuovo', [ESITI.NUOVO_VER]: 'verifica', [ESITI.INC]: 'manca', [ESITI.NON_MONTATO]: 'escluso', [ESITI.CLIENTE]: 'escluso' };
const leggiQuantita = (x: unknown) => [...new Set(String(x ?? '').split(/[;,\s]+/).map(s => parseInt(s, 10)).filter(n => n > 0 && n < 1e7))].slice(0, 4);

export function rotteComponenti() {
  const r = Router();
  const pag = (req: Request, titolo: string, attiva: string, contenuto: Raw, avviso?: string, script?: string) =>
    String(layout({ titolo, utente: req.session.utente, attiva: 'componenti', largo: true, avviso, script: script ?? 'componenti.js', contenuto: html`
      <nav class="schede">${[['bom', 'BOM e preventivo materiali'], ['codifica', 'Codifica un P/N'], ['archivio', 'Archivio componenti']]
        .map(([s, t]) => html`<a href="/componenti/${s}" class="${s === attiva ? 'attiva' : ''}">${t}</a>`)}</nav>${contenuto}` }));

  r.get('/', (_req, res) => res.redirect('/componenti/bom'));

  // ── BOM: elenco e caricamento ──
  r.get('/bom', async (req, res) => {
    const elenco = await q<any>(`SELECT b.id, b.nome, b.file_nome, b.quantita, b.stato, b.riepilogo, b.creato_il,
        (SELECT count(*)::int FROM preventivi p WHERE p.bom_id = b.id) AS preventivi FROM bom_analisi b
      WHERE b.file_nome IS DISTINCT FROM $1 ORDER BY b.creato_il DESC LIMIT 100`, [FILE_SINGOLA]);
    res.send(pag(req, 'BOM', 'bom', html`
      ${statoCollegamenti()}
      <section class="blocco stretto-form" id="carica-bom">
        <h2>Carica una BOM</h2>
        <p class="nota">Excel (.xlsx) o CSV. Il portale trova da solo l'intestazione e le colonne (P/N, quantità, designatori, valore, footprint,
          descrizione); se ne sbaglia una si corregge dopo. Per ogni riga: codici di produzione e gestionale, prezzi dai distributori, quantità
          da ordinare con lo scarto, componenti difficili da trovare.</p>
        <label>File <input type="file" id="file-bom" accept=".xlsx,.csv,.txt"></label>
        <label>Nome <input id="nome-bom" placeholder="vuoto = nome del file"></label>
        <label>Schede da produrre <small class="unita">anche più quantità, es. 100, 250, 500</small><input id="quantita-bom" value="100"></label>
        <button class="primario" id="invia-bom">Carica ed elabora</button>
        <output id="esito-bom" class="nota"></output>
      </section>
      <h2>BOM caricate</h2>
      ${elenco.length ? html`<div class="tabella-scorre"><table><thead><tr><th>Nome</th><th>File</th><th>Caricata</th><th class="n">Righe</th>
        <th class="n">Schede</th><th class="n">Materiali a scheda</th><th>Reperibilità</th><th>Stato</th><th class="n" title="Preventivi che prendono da questa BOM il costo componenti">Preventivi</th><th></th></tr></thead><tbody>
        ${elenco.map(a => { const rp: Riepilogo = a.riepilogo ?? {}; const p = rp.perQuantita?.[0]; return html`<tr>
          <td><a href="/componenti/bom/${a.id}">${a.nome}</a></td><td class="taglia">${a.file_nome}</td><td>${new Date(a.creato_il).toLocaleDateString('it-IT')}</td>
          <td class="n">${rp.righe ?? ''}</td><td class="n">${(a.quantita ?? []).join(', ')}</td><td class="n">${p ? euro2(p.aScheda) : ''}</td>
          <td>${rp.critici ? html`<span class="livello critico">${rp.critici} critici</span> ` : ''}${rp.attenzione ? html`<span class="livello attenzione">${rp.attenzione} attenzione</span>` : ''}</td>
          <td>${a.stato === 'pronta' ? '' : a.stato.replace('_', ' ')}</td><td class="n">${a.preventivi || ''}</td>
          <td><form method="post" action="/componenti/bom/${a.id}/elimina" class="inline conferma-elimina" data-preventivi="${a.preventivi}"><button class="link negativo">Elimina</button></form></td></tr>`; })}
        </tbody></table></div>` : html`<p class="vuoto">Nessuna BOM caricata.</p>`}`, req.query.errore ? String(req.query.errore) : undefined));
  });

  r.post('/bom', express.raw({ type: 'application/octet-stream', limit: '25mb' }), async (req, res) => {
    const fileNome = String(req.query.file ?? 'bom.xlsx');
    const quantita = leggiQuantita(req.query.quantita);
    if (!quantita.length) return res.status(400).json({ errore: 'Scrivi quante schede (es. 100 oppure 100, 250).' });
    try {
      const righe = await leggiFileBom(fileNome, req.body as Buffer);
      if (righe.length < 2) return res.status(400).json({ errore: 'Il file non contiene righe.' });
      const id = await creaAnalisi({ nome: String(req.query.nome ?? '').trim() || fileNome.replace(/\.[^.]+$/, ''), fileNome, righe, quantita, utenteId: req.session.utente!.id });
      avviaElaborazione(id);
      res.json({ id });
    } catch (e: any) { res.status(400).json({ errore: `File non leggibile: ${e.message}` }); }
  });

  // ── BOM: risultato ──
  r.get('/bom/:id', async (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return next();
    const a = await q1<any>(`SELECT * FROM bom_analisi WHERE id = $1`, [req.params.id]);
    if (!a) return res.status(404).send('BOM non trovata');
    res.send(pag(req, a.nome, a.file_nome === FILE_SINGOLA ? 'codifica' : 'bom', paginaAnalisi(a), req.query.msg ? String(req.query.msg) : undefined));
  });
  r.get('/bom/:id/stato', async (req, res) => {
    const id = Number(req.params.id);
    const av = avanzamenti.get(id);
    const a = av ? null : await q1<{ stato: string }>(`SELECT stato FROM bom_analisi WHERE id = $1`, [id]);
    res.json(av ? { inCorso: true, ...av } : { inCorso: false, stato: a?.stato });
  });
  r.post('/bom/:id/rielabora', async (req, res) => {
    avviaElaborazione(Number(req.params.id), { forzaPrezzi: !!req.body.prezzi });
    res.redirect(`/componenti/bom/${req.params.id}`);
  });
  r.post('/bom/:id/colonne', async (req, res) => {
    const a = await q1<any>(`SELECT colonne FROM bom_analisi WHERE id = $1`, [req.params.id]);
    if (!a) return res.status(404).send('BOM non trovata');
    const mappa: Partial<Record<Ruolo, string>> = {};
    for (const k of Object.keys(ETICHETTE_RUOLI) as Ruolo[]) { const v = String(req.body[k] ?? ''); if (v && a.colonne.includes(v)) mappa[k] = v; }
    await q(`UPDATE bom_analisi SET mappatura = $2 WHERE id = $1`, [req.params.id, JSON.stringify(mappa)]);
    avviaElaborazione(Number(req.params.id));
    res.redirect(`/componenti/bom/${req.params.id}`);
  });
  r.post('/bom/:id/quantita', async (req, res) => {
    const quantita = leggiQuantita(req.body.quantita);
    if (quantita.length) { await q(`UPDATE bom_analisi SET quantita = $2 WHERE id = $1`, [req.params.id, quantita]); avviaElaborazione(Number(req.params.id)); }
    res.redirect(`/componenti/bom/${req.params.id}`);
  });
  r.post('/bom/:id/salva', async (req, res) => {
    const x = await salvaInArchivio(Number(req.params.id), req.session.utente!.nome);
    res.redirect(`/componenti/bom/${req.params.id}?msg=${encodeURIComponent(`Archivio aggiornato: ${x.nuovi} componenti nuovi, ${x.aggiornati} completati.`)}`);
  });
  r.post('/bom/:id/elimina', async (req, res) => {
    await q(`DELETE FROM bom_analisi WHERE id = $1`, [req.params.id]);
    res.redirect('/componenti/bom');
  });
  r.get('/bom/:id/excel', async (req, res) => {
    const x = await excelAnalisi(Number(req.params.id));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${x.nome}"`);
    res.send(x.dati);
  });

  // ── BOM: correzione di una riga ──
  r.get('/bom/:id/riga/:n', async (req, res) => {
    const a = await q1<any>(`SELECT * FROM bom_analisi WHERE id = $1`, [req.params.id]);
    const riga: RigaBom | undefined = a?.righe?.find((x: RigaBom) => x.n === Number(req.params.n));
    if (!a || !riga) return res.status(404).send('Riga non trovata');
    res.send(pag(req, `Riga ${riga.n}`, a.file_nome === FILE_SINGOLA ? 'codifica' : 'bom', paginaRiga(a, riga)));
  });
  r.post('/bom/:id/riga/:n', async (req, res) => {
    const attributi: Record<string, string | null> = {};
    for (const k of [...ATTR, 'tecnologia']) attributi[k] = String(req.body[k] ?? '').trim() || null;
    const fam = String(req.body.famiglia ?? '').toUpperCase();
    await correggiRiga(Number(req.params.id), Number(req.params.n), { famiglia: fam in FAMIGLIE ? fam : null, attributi, clienteFornisce: !!req.body.cliente });
    res.redirect(`/componenti/bom/${req.params.id}#riga-${req.params.n}`);
  });

  // ── Codifica di un singolo P/N ──
  r.get('/codifica', (req, res) => res.send(pag(req, 'Codifica P/N', 'codifica', html`
    ${statoCollegamenti()}
    <form method="post" class="blocco stretto-form">
      <p class="nota">Scrivi il P/N del produttore. Per un componente senza P/N scrivi la descrizione (es. <code>resistenza 2,2k 0603</code>):
        la leggono le regole e, se serve, l'IA. Il risultato si può correggere e salvare nell'archivio.</p>
      <label>P/N <input name="pn" autofocus autocomplete="off"></label>
      <label>Descrizione / valore / case <input name="descrizione" autocomplete="off"></label>
      <label>Famiglia <small class="unita">facoltativa</small><select name="famiglia"><option value="">— riconosci da solo —</option>
        ${Object.entries(FAMIGLIE).map(([k, f]) => html`<option value="${k}">${k} · ${f.nome}</option>`)}</select></label>
      <label>Schede da produrre <small class="unita">per prezzo e scarto</small><input name="quantita" value="100"></label>
      <button class="primario">Codifica</button>
    </form>`)));
  r.post('/codifica', async (req, res) => {
    const pn = String(req.body.pn ?? '').trim(), descrizione = String(req.body.descrizione ?? '').trim();
    if (!pn && !descrizione) return res.redirect('/componenti/codifica');
    const fam = String(req.body.famiglia ?? '').toUpperCase();
    const id = await creaCodificaSingola({ pn, descrizione, famiglia: fam in FAMIGLIE ? fam : '', schede: leggiQuantita(req.body.quantita).length ? leggiQuantita(req.body.quantita) : [100], utenteId: req.session.utente!.id });
    avviaElaborazione(id);
    res.redirect(`/componenti/bom/${id}`);
  });

  // ── Archivio componenti ──
  r.get('/archivio', async (req, res) => {
    const testo = String(req.query.q ?? '').trim();
    const conti = await conteggiComponenti();
    const righe = testo ? await cercaComponenti(testo) : [];
    res.send(pag(req, 'Archivio componenti', 'archivio', html`
      <div class="intestazione-pagina"><p class="nota">${num(conti.totale, 0)} componenti in archivio, ${num(conti.gestionale, 0)} con codice gestionale.
        ${conti.totale ? '' : html` L'archivio si carica da <a href="/impostazioni/componenti">Impostazioni → Componenti</a>.`}</p>
        <a class="bottone" href="/componenti/archivio.xlsx">Scarica tutto in Excel</a></div>
      <form class="cerca"><input name="q" value="${testo}" placeholder="P/N, codice di produzione o gestionale, descrizione" autofocus><button>Cerca</button></form>
      ${testo ? (righe.length ? html`<div class="tabella-scorre"><table class="componenti"><thead><tr><th>P/N</th><th>Fam.</th><th>Codice produzione</th>
        <th>Codice gestionale</th><th>Descrizione</th><th>Stato</th><th>Fonte</th><th>Note</th></tr></thead><tbody>
        ${righe.map(c => html`<tr><td>${c.pn}</td><td>${c.famiglia}</td><td class="codice">${c.codice_produzione}</td><td class="codice">${c.codice_gestionale}</td>
          <td class="taglia">${c.descrizione}</td><td>${c.stato}</td><td class="taglia">${c.fonte}</td><td class="taglia" title="${c.note ?? ''}">${c.note}</td></tr>`)}
        </tbody></table></div>${righe.length === 200 ? html`<p class="nota">Mostrati i primi 200.</p>` : ''}` : html`<p class="vuoto">Nessun componente trovato.</p>`) : ''}`));
  });
  r.get('/archivio.xlsx', async (_req, res) => {
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

  return r;
}

// ───────────────────────────── pezzi di pagina ─────────────────────────────
function statoCollegamenti() {
  const f = fornitoriConfigurati();
  const attivi = (Object.keys(f) as (keyof typeof f)[]).filter(k => f[k]).map(k => NOMI_FORNITORI[k]);
  return html`<p class="nota collegamenti">Distributori collegati: <b>${attivi.length ? attivi.join(', ') : 'nessuno'}</b> · lettura con l'IA:
    <b>${iaConfigurata() ? 'attiva' : 'non attiva'}</b>${attivi.length < 4 || !iaConfigurata() ? html` · <a href="/impostazioni/componenti">come collegarli</a>` : ''}</p>`;
}

function badgeEsito(r: RigaBom) {
  const e = r.clienteFornisce ? ESITI.CLIENTE : r.esito;
  return html`<span class="esito ${CLASSE_ESITO[e] ?? ''}">${e}</span>`;
}
const badgeLivello = (r: RigaBom) => r.reperibilita ? html`<span class="livello ${r.reperibilita.livello}" title="${r.reperibilita.motivi.join('\n')}">${
  r.reperibilita.livello === 'ok' ? 'ok' : r.reperibilita.livello}</span>` : html``;

function paginaAnalisi(a: any): Raw {
  const righe: RigaBom[] = a.righe ?? []; const quantita: number[] = a.quantita ?? [];
  const rp: Riepilogo | undefined = a.riepilogo?.perQuantita ? a.riepilogo : undefined;
  const inCorso = a.stato === 'in_corso' || a.stato === 'da_elaborare' || avanzamenti.has(a.id);
  const singola = a.file_nome === FILE_SINGOLA;
  const daSalvare = righe.filter(r => r.esito === ESITI.NUOVO || r.esito === ESITI.NUOVO_VER || r.esito === ESITI.DB_FATTO).length;
  const mappa: Record<string, string> = a.mappatura ?? {};
  return html`
  <div class="intestazione-pagina"><h1>${a.nome}</h1>
    <div class="azioni">
      ${!inCorso && daSalvare ? html`<form method="post" action="/componenti/bom/${a.id}/salva" class="inline"><button class="primario" title="Mette nell'archivio i codici nuovi completi">Salva ${daSalvare} codici nell'archivio</button></form>` : ''}
      ${!inCorso && righe.length ? html`<a class="bottone" href="/componenti/bom/${a.id}/excel">Scarica Excel</a>` : ''}
      ${!inCorso ? html`<form method="post" action="/componenti/bom/${a.id}/rielabora" class="inline"><button name="prezzi" value="1" title="Rilegge prezzi e disponibilità dai distributori">Aggiorna prezzi</button></form>` : ''}
      <form method="post" action="/componenti/bom/${a.id}/elimina" class="inline conferma-elimina"><button class="pericolo">Elimina</button></form>
    </div></div>
  ${inCorso ? html`<div class="avviso info" id="avanzamento" data-id="${a.id}">Elaborazione in corso…</div>` : ''}
  ${a.stato === 'errore' ? html`<div class="avviso">${a.messaggio}</div>` : a.messaggio ? html`<div class="avviso info">${a.messaggio}</div>` : ''}
  ${rp ? html`<div class="totali materiali">
    ${rp.perQuantita.map((x, i) => html`<div class="totale ${i === 0 ? 'principale' : ''}"><span>Materiali per ${num(x.schede, 0)} schede</span>
      ${x.totale > 0 ? html`<strong>${euro2(x.totale)}</strong><small>${euro2(x.aScheda)} a scheda${x.senzaPrezzo ? ` · ${x.senzaPrezzo} righe senza prezzo` : ''}${x.nonDisponibili ? ` · ${x.nonDisponibili} non disponibili` : ''}</small>`
        : html`<strong>—</strong><small>${Object.values(fornitoriConfigurati()).some(Boolean) ? 'nessun prezzo trovato' : 'nessun distributore collegato'}</small>`}</div>`)}
    <div class="totale"><span>Righe</span><strong>${rp.righe}</strong><small>${rp.inArchivio} in archivio · ${rp.nuovi} nuovi · ${rp.daCompletare} da completare</small></div>
    <div class="totale"><span>Reperibilità</span><strong>${rp.critici ? html`<span class="negativo">${rp.critici} critici</span>` : 'nessun critico'}</strong><small>${rp.attenzione} da tenere d'occhio</small></div>
  </div>` : ''}
  ${!singola ? html`<details class="blocco"><summary>Colonne della BOM e quantità</summary>
    <form method="post" action="/componenti/bom/${a.id}/colonne" class="riga-campi">
      ${(Object.entries(ETICHETTE_RUOLI) as [Ruolo, string][]).map(([k, t]) => html`<label>${t}<select name="${k}"><option value="">—</option>
        ${(a.colonne as string[]).map(c => html`<option ${mappa[k] === c ? raw('selected') : ''}>${c}</option>`)}</select></label>`)}
      <button>Applica e rielabora</button></form>
    <form method="post" action="/componenti/bom/${a.id}/quantita" class="riga-campi"><label>Schede da produrre<input name="quantita" value="${quantita.join(', ')}"></label><button>Ricalcola</button></form>
  </details>` : ''}
  ${righe.length ? html`
  <div class="filtri" id="filtri"><button data-filtro="" class="attivo">Tutte (${righe.length})</button>
    <button data-filtro="manca">Da completare (${righe.filter(r => CLASSE_ESITO[r.esito] === 'manca').length})</button>
    <button data-filtro="nuovo verifica">Nuovi (${righe.filter(r => ['nuovo', 'verifica'].includes(CLASSE_ESITO[r.esito])).length})</button>
    <button data-filtro="critico attenzione">Reperibilità (${righe.filter(r => r.reperibilita && r.reperibilita.livello !== 'ok').length})</button></div>
  <div class="tabella-scorre"><table class="bom"><thead><tr><th>Riga</th><th>P/N</th><th class="n">Qtà</th><th>Esito</th><th>Codice produzione</th><th>Codice gestionale</th>
    <th>Descrizione</th><th>Reperib.</th>${quantita.map(s => html`<th class="n">${num(s, 0)} schede</th>`)}<th>Note</th><th></th></tr></thead><tbody>
    ${righe.map(r => html`<tr id="riga-${r.n}" data-classi="${CLASSE_ESITO[r.clienteFornisce ? ESITI.CLIENTE : r.esito] ?? ''} ${r.reperibilita?.livello ?? ''}">
      <td>${r.n}</td><td><b>${r.pn ?? ''}</b>${r.mpnAcquisto && !r.pn ? html`<br><small class="nota">→ ${r.mpnAcquisto}</small>` : ''}
        ${!r.pn && (r.valore || r.descrizioneBom) ? html`<br><small class="nota">${[r.valore, r.footprint].filter(Boolean).join(' · ') || r.descrizioneBom}</small>` : ''}</td>
      <td class="n">${num(r.qtaScheda, 2)}</td><td>${badgeEsito(r)}</td>
      <td class="codice">${r.codiceProduzione}</td><td class="codice">${r.codiceGestionale}</td><td class="taglia" title="${r.descrizione ?? ''}">${r.descrizione}</td>
      <td>${badgeLivello(r)}</td>
      ${quantita.map((_, i) => { const x = r.acquisti[i]; return html`<td class="acquisto">${x?.scelta ? html`<b>${num(x.scelta.qta, 0)}</b> pz · ${NOMI_FORNITORI[x.scelta.fornitore]}
        <br><small>${euro4(x.scelta.prezzo)} € → <b>${euro2(x.scelta.totale)}</b>${x.scarto ? ` · +${x.scarto} scarto` : ''}${!x.scelta.disponibile ? ' · NON DISPONIBILE' : ''}</small>`
        : x ? html`<small class="nota">${num(x.lorda, 0)} pz, prezzo non trovato</small>` : ''}</td>`; })}
      <td class="note" title="${[...r.note, ...(r.reperibilita?.motivi ?? [])].join('\n')}">${r.note.some(n => n.startsWith(NOTA_DA_VALIDARE)) ? html`<strong class="da-validare">⚠ codice da validare</strong> ` : ''}${[...r.note, ...(r.reperibilita?.livello !== 'ok' ? r.reperibilita?.motivi ?? [] : [])].join('; ')}</td>
      <td><a href="/componenti/bom/${a.id}/riga/${r.n}">${r.esito === ESITI.DB ? 'dettagli' : 'modifica'}</a></td></tr>`)}
  </tbody></table></div>
  <p class="nota">Esiti: <span class="esito archivio">in archivio</span> codici esistenti · <span class="esito nuovo">nuovo</span> codici calcolati, da salvare ·
    <span class="esito verifica">da verificare</span> ipotesi da controllare (vedi note) · <span class="esito manca">da completare</span> mancano dati: apri "modifica".
    Lo scarto: passivi economici +10%, sotto 1 € +5%, 1–3 € +1 pezzo, oltre 3 € nessuno.</p>` : inCorso ? '' : html`<p class="vuoto">Nessuna riga.</p>`}`;
}

function tabellaOfferte(offerte: Offerta[], qta: number) {
  if (!offerte.length) return html`<p class="nota">Nessuna offerta dai distributori.</p>`;
  return html`<div class="tabella-scorre"><table><thead><tr><th>Distributore</th><th>Codice</th><th>Confezione</th><th class="n">Disponibili</th><th class="n">Minimo</th>
    <th>Prezzi (€/pz per quantità)</th><th class="n">€/pz per ${num(qta, 0)}</th><th>Stato</th></tr></thead><tbody>
    ${offerte.map(o => html`<tr><td>${NOMI_FORNITORI[o.fornitore]}</td><td>${o.url ? html`<a href="${o.url}" target="_blank" rel="noopener">${o.codiceFornitore}</a>` : o.codiceFornitore}</td>
      <td>${o.confezione ?? ''}</td><td class="n">${num(o.stock, 0)}</td><td class="n">${num(o.moq, 0)}${o.multiplo > 1 ? ` ×${o.multiplo}` : ''}</td>
      <td><small>${o.scaglioni.slice(0, 8).map(s => `${num(s.qta, 0)}: ${euro4(s.prezzo)}`).join(' · ')}${o.valuta !== 'EUR' ? ` (${o.valuta})` : ''}</small></td>
      <td class="n">${euro4(prezzoUnitario(o, qta))}</td><td>${o.ciclo ?? ''}${o.consegnaSettimane ? ` · ${o.consegnaSettimane} sett.` : ''}</td></tr>`)}
  </tbody></table></div>`;
}

function paginaRiga(a: any, r: RigaBom): Raw {
  const bloccata = r.esito === ESITI.DB || r.esito === ESITI.NON_MONTATO;
  const qta = r.acquisti[r.acquisti.length - 1]?.lorda ?? 0;
  return html`
  <div class="intestazione-pagina"><h1>Riga ${r.n}: ${r.pn ?? r.mpnAcquisto ?? r.valore ?? ''} ${badgeEsito(r)}</h1>
    <a class="bottone" href="/componenti/bom/${a.id}#riga-${r.n}">← Torna alla BOM</a></div>
  <div class="griglia-preventivo">
    <form method="post" class="blocco">
      <p class="riepilogo">${r.designatori ? html`<b>Designatori:</b> ${r.designatori}<br>` : ''}
        ${r.valore || r.footprint || r.descrizioneBom ? html`<b>Dalla BOM:</b> ${[r.valore, r.footprint, r.descrizioneBom].filter(Boolean).join(' · ')}<br>` : ''}
        <b>Dati da:</b> ${r.fonti.join(' + ') || '—'}</p>
      <div class="codici"><div><span>Codice produzione</span><b class="codice">${r.codiceProduzione ?? '—'}</b></div>
        <div><span>Codice gestionale</span><b class="codice">${r.codiceGestionale ?? '—'}</b></div></div>
      <p>${r.descrizione}</p>
      ${r.note.length ? html`<ul class="note-riga">${r.note.map(n => html`<li>${n.startsWith(NOTA_DA_VALIDARE) ? html`<strong class="da-validare">${n}</strong>` : n}</li>`)}</ul>` : ''}
      ${bloccata ? html`<p class="nota">${r.esito === ESITI.DB ? 'Componente già in archivio: i codici non si cambiano da qui.' : ''}</p>` : html`
      <div class="riga-campi"><label>Famiglia<select name="famiglia"><option value="">—</option>
        ${Object.entries(FAMIGLIE).map(([k, f]) => html`<option value="${k}" ${r.famiglia === k ? raw('selected') : ''}>${k} · ${f.nome}</option>`)}</select></label>
        <label class="stretto">Tecnologia<select name="tecnologia"><option value=""></option>${['S', 'T'].map(t => html`<option ${r.attributi.tecnologia === t ? raw('selected') : ''}>${t}</option>`)}</select></label></div>
      <div class="campi-attributi">${ATTR.map(k => html`<label>${ETICHETTE[k]}<input name="${k}" value="${r.attributi[k] ?? ''}" autocomplete="off"></label>`)}</div>`}
      <label class="spunta"><input type="checkbox" name="cliente" ${r.clienteFornisce ? raw('checked') : ''}> Fornito dal cliente (non si acquista)</label>
      <button class="primario">Ricalcola</button>
    </form>
    <section>
      <h2>Acquisto</h2>
      ${r.reperibilita ? html`<p>${badgeLivello(r)} ${r.reperibilita.motivi.join(' · ')}</p>` : ''}
      ${r.acquisti.length ? html`<table class="acquisti"><thead><tr><th class="n">Schede</th><th class="n">Netta</th><th>Scarto</th><th class="n">Da ordinare</th><th>Fornitore</th><th class="n">€/pz</th><th class="n">Totale</th></tr></thead><tbody>
        ${r.acquisti.map(x => html`<tr><td class="n">${num(x.schede, 0)}</td><td class="n">${num(x.netta, 0)}</td><td>${x.scarto ? `+${x.scarto} ` : ''}<small>${x.regolaScarto}</small></td>
          <td class="n">${num(x.scelta?.qta ?? x.lorda, 0)}</td><td>${x.scelta ? html`${NOMI_FORNITORI[x.scelta.fornitore]} ${x.scelta.codice}${x.scelta.nota ? html`<br><small>${x.scelta.nota}</small>` : ''}` : '—'}</td>
          <td class="n">${euro4(x.scelta?.prezzo)}</td><td class="n">${euro2(x.scelta?.totale)}</td></tr>`)}</tbody></table>` : html`<p class="nota">Nessun acquisto (componente escluso o senza quantità).</p>`}
      <h2>Offerte dei distributori</h2>
      ${tabellaOfferte(r.offerte, qta)}
    </section>
  </div>`;
}
