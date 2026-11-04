/**
 * Sezione Quotazioni (fino al 28/10/2026 "Componenti"; solo ufficio): BOM con codifica e preventivo materiali, codifica di un P/N (l'archivio sta in Anagrafiche → Componenti).
 * Logica in src/server/codifica-servizio.ts; regole in src/engine/codifica/* e src/engine/acquisti.ts.
 */
import { righeDaPrezzare } from '../../engine/non-quotati.js';
import express, { Router, type Request } from 'express';
import { q, q1 } from '../db.js';
import { layout } from '../views/layout.js';
import { casella, casellaTutti, idsSpuntati, moduloAzioni } from '../views/azioni-elenco.js';
import { html, num, raw, type Raw } from '../views/html.js';
import {
  ATTR, ESITI, ETICHETTE, ETICHETTE_RUOLI, FAMIGLIE, FILE_SINGOLA, avanzamenti, avviaElaborazione, correggiRiga,
  aggiungiRigaBom, creaAnalisi, creaCodificaSingola, modificaRigaAMano, excelAnalisi, impostaPrezzoManuale, leggiFileBom, nomeFornitore, problemiBom, salvaInArchivio, scegliAlternativa, verificaRiga, togliRiga, valoriArchivioFamiglia, esitoRicalcolo, type RigaBom, type Riepilogo,
} from '../codifica-servizio.js';
import { unisciAlternative } from '../../engine/codifica/alternative-bom.js';
import { NOTA_DA_VALIDARE } from '../../engine/codifica/bom.js';
import { campiFamiglia, esempioCampo, mappaCampiFamiglie } from '../../engine/codifica/campi-famiglia.js';
import { suggerimentiRiga, valoriTabella, type ValoriArchivio } from '../../engine/codifica/valori-tabella.js';
import { NOMI_FORNITORI, confrontaOfferte, leggiPrezzo, prezzoUnitario, sceltaMigliore, type Fornitore, type Offerta } from '../../engine/acquisti.js';
import type { Ruolo } from '../../engine/codifica/bom.js';
import { cercaPn, fornitoriConfigurati } from '../fornitori.js';
import { pnKey } from '../../engine/codifica/bom.js';
import { iaConfigurata } from '../lettura-ia.js';
import { testoScarto } from '../../engine/codifica/modifiche-mano.js';
import { componentiInComune, feederFissi, type BomPerComuni } from '../../engine/componenti-comuni.js';

const euro4 = (x: number | null | undefined) => x == null ? '' : new Intl.NumberFormat('it-IT', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(x);
const euro2 = (x: number | null | undefined) => x == null ? '' : new Intl.NumberFormat('it-IT', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(x) + ' €';
const CLASSE_ESITO: Record<string, string> = { [ESITI.DB]: 'archivio', [ESITI.DB_PROD]: 'archivio', [ESITI.DB_INC]: 'manca', [ESITI.DB_FATTO]: 'nuovo',
  [ESITI.NUOVO]: 'nuovo', [ESITI.NUOVO_VER]: 'verifica', [ESITI.INC]: 'manca', [ESITI.NON_MONTATO]: 'escluso', [ESITI.CLIENTE]: 'escluso' };
/** Pagina della codifica BOM senza prezzi (Produzione → Codifica componenti, Adriano 4/11/2026) e chiave di `pag` per le sue BOM. */
export const PAGINA_SOLO_CODIFICA = '/produzione/codifica-componenti';
const SOLO_CODIFICA = 'solo-codifica';
export const leggiQuantita = (x: unknown) => [...new Set(String(x ?? '').split(/[;,\s]+/).map(s => parseInt(s, 10)).filter(n => n > 0 && n < 1e7))].slice(0, 4);

const paginaProduzione = (req: Request, titolo: string, contenuto: Raw, avviso?: string) =>
  String(layout({ titolo, utente: req.session.utente, attiva: 'produzione', largo: true, avviso, script: ['componenti.js', 'elenco.js', 'campi-famiglia.js'], contenuto: html`
    <nav class="schede"><a href="${PAGINA_SOLO_CODIFICA}" class="attiva">Codifica componenti</a>
      <a href="/anagrafiche/componenti" title="Archivio dei componenti codificati">Archivio componenti ↗</a></nav>${contenuto}` }));

/**
 * Produzione → Codifica componenti (Adriano 4/11/2026): si carica una BOM (Excel: il foglio "BOM") e si danno i codici di produzione e gestionale
 * con la stessa codifica di Quotazioni, ma senza chiedere prezzi ai distributori. Il risultato si scarica in Excel (si apre anche in Google Sheets).
 */
export function rotteCodificaComponenti() {
  const r = Router();
  r.get('/', async (req, res) => {
    const elenco = await q<any>(`SELECT id, nome, file_nome, stato, riepilogo, creato_il FROM bom_analisi WHERE solo_codifica ORDER BY creato_il DESC LIMIT 100`);
    res.send(paginaProduzione(req, 'Codifica componenti', html`
      <h1>Codifica componenti</h1>
      <section class="blocco stretto-form" id="carica-bom">
        <h2>Codifica una BOM</h2>
        <p class="nota">Excel (.xlsx) o CSV. Se il file Excel ha più fogli si legge quello che si chiama <b>BOM</b>. Per ogni riga il portale dà il
          <b>codice di produzione</b> (armadio) e il <b>codice gestionale</b> (Moka) come in Quotazioni: prima l'archivio, poi il P/N, le colonne della BOM e l'IA.
          <b>I prezzi non si cercano</b> (niente distributori): è più veloce. Il risultato si scarica in Excel, che si apre anche in Google Sheets.
          "Salva … codici nell'archivio" mette i componenti nuovi in Anagrafiche → Componenti.</p>
        <label>File <input type="file" id="file-bom" accept=".xlsx,.csv,.txt"></label>
        <label>Nome <input id="nome-bom" placeholder="vuoto = nome del file"></label>
        <button class="primario" id="invia-bom" data-solo="1">Carica e codifica</button>
        <output id="esito-bom" class="nota"></output>
      </section>
      <h2>BOM codificate</h2>
      ${elenco.length ? html`<div class="tabella-scorre"><table class="elenco"><thead><tr><th>Nome</th><th>File</th><th>Caricata</th><th class="n">Righe</th>
        <th class="n">In archivio</th><th class="n">Nuovi</th><th class="n">Da completare</th><th>Stato</th><th></th></tr></thead><tbody>
        ${elenco.map(b => { const rp = b.riepilogo ?? {}; return html`<tr>
          <td><a href="/quotazioni/bom/${b.id}">${b.nome}</a></td><td class="taglia">${b.file_nome}</td><td>${new Date(b.creato_il).toLocaleDateString('it-IT')}</td>
          <td class="n">${rp.righe ?? ''}</td><td class="n">${rp.inArchivio ?? ''}</td><td class="n">${rp.nuovi ?? ''}</td><td class="n">${rp.daCompletare || ''}</td>
          <td>${b.stato === 'pronta' ? '' : String(b.stato).replace('_', ' ')}</td>
          <td>${b.stato === 'pronta' ? html`<a href="/quotazioni/bom/${b.id}/excel">Excel</a>` : ''}</td></tr>`; })}
        </tbody></table></div>` : html`<p class="vuoto">Nessuna BOM codificata.</p>`}`, req.query.msg ? String(req.query.msg) : undefined));
  });
  return r;
}

export function rotteComponenti() {
  const r = Router();
  const pag = (req: Request, titolo: string, attiva: string, contenuto: Raw, avviso?: string, script?: string) =>
    attiva === SOLO_CODIFICA
      // BOM codificata senza prezzi: sta in Produzione → Codifica componenti (Adriano 4/11/2026)
      ? paginaProduzione(req, titolo, contenuto, avviso)
      : String(layout({ titolo, utente: req.session.utente, attiva: 'quotazioni', largo: true, avviso, script: script ?? ['componenti.js', 'elenco.js', 'campi-famiglia.js'], contenuto: html`
      <nav class="schede">${[['bom', 'BOM e preventivo materiali'], ['prezzo', 'Miglior prezzo di un P/N'], ['codifica', 'Codifica un P/N'], ['comuni', 'Componenti in comune']]
        .map(([s, t]) => html`<a href="/quotazioni/${s}" class="${s === attiva ? 'attiva' : ''}">${t}</a>`)}
        <a href="/anagrafiche/componenti" title="L'archivio sta in Anagrafiche → Componenti">Archivio componenti ↗</a></nav>${contenuto}` }));

  r.get('/', (_req, res) => res.redirect('/quotazioni/bom'));

  // ── BOM: elenco e caricamento ──
  r.get('/bom', async (req, res) => {
    const elenco = await q<any>(`SELECT b.id, b.nome, b.file_nome, b.quantita, b.stato, b.riepilogo, b.creato_il,
        (SELECT count(*)::int FROM preventivi p WHERE p.bom_id = b.id) AS preventivi FROM bom_analisi b
      WHERE b.file_nome IS DISTINCT FROM $1 AND NOT b.solo_codifica ORDER BY b.creato_il DESC LIMIT 100`, [FILE_SINGOLA]);
    const modulo = moduloAzioni({
      azione: '/quotazioni/bom/azioni', nome: { singolare: 'BOM', plurale: 'BOM', femminile: true },
      pulsanti: [
        { azione: 'excel', testo: 'Excel', serve: '1', titolo: 'Scarica l\'Excel con codifica e acquisti della BOM selezionata' },
        { azione: 'elimina', testo: 'Elimina', serve: '1+', pericolo: true,
          chiedi: 'Eliminare {n} BOM e il loro risultato? L\'archivio componenti non cambia.\n\nNei preventivi collegati il costo componenti già scritto resta, ma non si aggiornerà più dalla BOM.' },
      ],
    });
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
      ${elenco.length ? html`${modulo.apri}<div class="tabella-scorre"><table class="elenco"><thead><tr>${casellaTutti()}<th>Nome</th><th>File</th><th>Caricata</th><th class="n">Righe</th>
        <th class="n">Schede</th><th class="n">Materiali a scheda</th><th>Reperibilità</th><th>Stato</th><th class="n" title="Preventivi che prendono da questa BOM il costo componenti">Preventivi</th></tr></thead><tbody>
        ${elenco.map(a => { const rp: Riepilogo = a.riepilogo ?? {}; const p = rp.perQuantita?.[0]; return html`<tr class="cliccabile" data-href="/quotazioni/bom/${a.id}">
          ${casella(a.id, a.nome)}
          <td><a href="/quotazioni/bom/${a.id}">${a.nome}</a></td><td class="taglia">${a.file_nome}</td><td>${new Date(a.creato_il).toLocaleDateString('it-IT')}</td>
          <td class="n">${rp.righe ?? ''}</td><td class="n">${(a.quantita ?? []).join(', ')}</td><td class="n">${p ? euro2(p.aScheda) : ''}</td>
          <td>${rp.critici ? html`<span class="livello critico">${rp.critici} critici</span> ` : ''}${rp.attenzione ? html`<span class="livello attenzione">${rp.attenzione} attenzione</span>` : ''}</td>
          <td>${a.stato === 'pronta' ? '' : a.stato.replace('_', ' ')}</td><td class="n">${a.preventivi || ''}</td></tr>`; })}
        </tbody></table></div>${modulo.chiudi}` : html`<p class="vuoto">Nessuna BOM caricata.</p>`}`, req.query.errore ? String(req.query.errore) : undefined));
  });

  r.post('/bom', express.raw({ type: 'application/octet-stream', limit: '25mb' }), async (req, res) => {
    const fileNome = String(req.query.file ?? 'bom.xlsx');
    const soloCodifica = req.query.solo === '1'; // Anagrafiche → Componenti → Codifica una BOM: senza quantità e senza prezzi
    const quantita = leggiQuantita(req.query.quantita);
    if (!quantita.length && !soloCodifica) return res.status(400).json({ errore: 'Scrivi quante schede (es. 100 oppure 100, 250).' });
    try {
      const righe = unisciAlternative(await leggiFileBom(fileNome, req.body as Buffer)); // alternative del cliente in una colonna
      if (righe.length < 2) return res.status(400).json({ errore: 'Il file non contiene righe.' });
      const id = await creaAnalisi({ nome: String(req.query.nome ?? '').trim() || fileNome.replace(/\.[^.]+$/, ''), fileNome, righe, quantita, utenteId: req.session.utente!.id, soloCodifica });
      avviaElaborazione(id);
      res.json({ id });
    } catch (e: any) { res.status(400).json({ errore: `File non leggibile: ${e.message}` }); }
  });

  // ── BOM: risultato ──
  r.get('/bom/:id', async (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return next();
    const a = await q1<any>(`SELECT * FROM bom_analisi WHERE id = $1`, [req.params.id]);
    if (!a) return res.status(404).send('BOM non trovata');
    // BOM quotata per un preventivo (spunta Componenti dai documenti del cliente): da qui si torna al preventivo per la quota
    const chiesto = Number(req.query.preventivo) || 0;
    const prev = await q1<{ id: number; numero: string }>(`SELECT id, numero FROM preventivi WHERE bom_id = $1 ORDER BY (id = $2) DESC, id DESC LIMIT 1`, [a.id, chiesto]);
    res.send(pag(req, a.nome, a.solo_codifica ? SOLO_CODIFICA : a.file_nome === FILE_SINGOLA ? 'codifica' : 'bom', html`${prev ? rimandoPreventivo(a, prev) : ''}${paginaAnalisi(a, chiesto)}`, req.query.msg ? String(req.query.msg) : undefined));
  });
  r.get('/bom/:id/stato', async (req, res) => {
    const id = Number(req.params.id);
    const av = avanzamenti.get(id);
    const a = av ? null : await q1<{ stato: string }>(`SELECT stato FROM bom_analisi WHERE id = $1`, [id]);
    res.json(av ? { inCorso: true, ...av } : { inCorso: false, stato: a?.stato });
  });
  r.post('/bom/:id/rielabora', async (req, res) => {
    // "Rielabora" = solo codifica con i prezzi già letti, nessuna richiesta ai distributori; "Aggiorna prezzi" = li rilegge tutti (Adriano 4/11/2026)
    avviaElaborazione(Number(req.params.id), req.body.prezzi ? { forzaPrezzi: true } : { soloCache: true });
    res.redirect(`/quotazioni/bom/${req.params.id}`);
  });
  r.post('/bom/:id/colonne', async (req, res) => {
    const a = await q1<any>(`SELECT colonne FROM bom_analisi WHERE id = $1`, [req.params.id]);
    if (!a) return res.status(404).send('BOM non trovata');
    const mappa: Partial<Record<Ruolo, string>> = {};
    for (const k of Object.keys(ETICHETTE_RUOLI) as Ruolo[]) { const v = String(req.body[k] ?? ''); if (v && a.colonne.includes(v)) mappa[k] = v; }
    await q(`UPDATE bom_analisi SET mappatura = $2 WHERE id = $1`, [req.params.id, JSON.stringify(mappa)]);
    avviaElaborazione(Number(req.params.id));
    res.redirect(`/quotazioni/bom/${req.params.id}`);
  });
  // BOM codificata senza prezzi → "Cerca anche i prezzi": diventa una BOM di Quotazioni con le schede scritte e si rielabora con i distributori
  r.post('/bom/:id/prezzi', async (req, res) => {
    const quantita = leggiQuantita(req.body.quantita);
    if (!quantita.length) return res.redirect(`/quotazioni/bom/${req.params.id}?msg=${encodeURIComponent('Scrivi quante schede (es. 100 oppure 100, 250).')}`);
    await q(`UPDATE bom_analisi SET quantita = $2, solo_codifica = false WHERE id = $1`, [req.params.id, quantita]);
    avviaElaborazione(Number(req.params.id));
    res.redirect(`/quotazioni/bom/${req.params.id}`);
  });
  r.post('/bom/:id/quantita', async (req, res) => {
    const quantita = leggiQuantita(req.body.quantita);
    if (quantita.length) { await q(`UPDATE bom_analisi SET quantita = $2 WHERE id = $1`, [req.params.id, quantita]); avviaElaborazione(Number(req.params.id), { soloCache: true }); } // prezzi già letti: cambiano solo le quantità
    res.redirect(`/quotazioni/bom/${req.params.id}`);
  });
  r.post('/bom/:id/salva', async (req, res) => {
    const x = await salvaInArchivio(Number(req.params.id), req.session.utente!.nome);
    // codifica di un solo P/N (anche da Anagrafiche → Componenti → + Aggiungi componente): si torna all'archivio con il componente nuovo
    const a = await q1<any>(`SELECT file_nome, righe FROM bom_analisi WHERE id = $1`, [Number(req.params.id)]);
    const riga = a?.file_nome === FILE_SINGOLA ? (a.righe as RigaBom[])[0] : null;
    const cerca = riga?.codiceGestionale || riga?.pn || riga?.codiceProduzione;
    if (x.nuovi && cerca) return res.redirect(`/anagrafiche/componenti?q=${encodeURIComponent(cerca)}&msg=${encodeURIComponent(`Componente ${cerca} aggiunto all'archivio.`)}`);
    res.redirect(`/quotazioni/bom/${req.params.id}?msg=${encodeURIComponent(`Archivio aggiornato: ${x.nuovi} componenti nuovi, ${x.aggiornati} completati.`)}`);
  });
  // azioni dall'elenco sulle BOM spuntate
  r.post('/bom/azioni', async (req, res) => {
    const ids = idsSpuntati(req.body);
    if (!ids.length) return res.redirect('/quotazioni/bom');
    const azione = String(req.body?.azione ?? '');
    if (azione === 'excel' && ids.length === 1) return res.redirect(`/quotazioni/bom/${ids[0]}/excel`);
    if (azione === 'elimina') await q(`DELETE FROM bom_analisi WHERE id = ANY($1)`, [ids]);
    res.redirect('/quotazioni/bom');
  });
  r.post('/bom/:id/elimina', async (req, res) => {
    const x = await q1<{ solo_codifica: boolean }>(`DELETE FROM bom_analisi WHERE id = $1 RETURNING solo_codifica`, [req.params.id]);
    res.redirect(x?.solo_codifica ? PAGINA_SOLO_CODIFICA : '/quotazioni/bom');
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
    const archivio = await valoriArchivioFamiglia(riga.famiglia);
    res.send(pag(req, `Riga ${riga.n}`, a.solo_codifica ? SOLO_CODIFICA : a.file_nome === FILE_SINGOLA ? 'codifica' : 'bom', paginaRiga(a, riga, archivio), req.query.msg ? String(req.query.msg) : undefined));
  });
  // prezzo scritto a mano (Adriano 28/10/2026): vale al posto di quello proposto; vuoto = di nuovo quello dei distributori
  r.post('/bom/:id/riga/:n/prezzo', async (req, res) => {
    const testo = String(req.body.prezzo ?? '').trim();
    const prezzo = req.body.togli || !testo ? null : leggiPrezzo(testo);
    const msg = prezzo != null && !(prezzo >= 0) ? 'Prezzo non valido.'
      : testo && prezzo == null && !req.body.togli ? 'Prezzo non valido: scrivi ad esempio 0,125.'
      : await impostaPrezzoManuale(Number(req.params.id), Number(req.params.n), prezzo);
    // dal riquadro "senza prezzo" in cima alla BOM si torna lì (Adriano 4/11/2026)
    if (req.body.torna === 'bom') return res.redirect(`/quotazioni/bom/${req.params.id}?${Number(req.body.preventivo) > 0 ? `preventivo=${Number(req.body.preventivo)}&` : ''}msg=${encodeURIComponent(msg)}#da-prezzare`);
    res.redirect(`/quotazioni/bom/${req.params.id}/riga/${req.params.n}?msg=${encodeURIComponent(msg)}#prezzo-manuale`);
  });
  // alternative al P/N (Adriano 28/10/2026): usa una proposta, scrivine una a mano, torna al P/N della BOM
  r.post('/bom/:id/riga/:n/alternativa', async (req, res) => {
    const msg = await scegliAlternativa(Number(req.params.id), Number(req.params.n), {
      usa: String(req.body.usa ?? '').trim() || undefined, nuova: String(req.body.nuova ?? '').trim() || undefined,
      togli: String(req.body.togli ?? '').trim() || undefined, originale: !!req.body.originale });
    res.redirect(`/quotazioni/bom/${req.params.id}/riga/${req.params.n}?msg=${encodeURIComponent(msg)}#alternative`);
  });
  // modifiche a mano della riga: P/N, quantità, scarto, nota (Federico, 2/11/2026)
  r.post('/bom/:id/riga/:n/mano', async (req, res) => {
    const id = Number(req.params.id), n = Number(req.params.n);
    const x = await modificaRigaAMano(id, n, { pn: req.body.pn == null ? undefined : String(req.body.pn), qta: req.body.qta == null ? undefined : String(req.body.qta),
      scarto: String(req.body.scarto ?? ''), nota: String(req.body.nota ?? '') });
    if (x.rielabora) { avviaElaborazione(id); return res.redirect(`/quotazioni/bom/${id}?msg=${encodeURIComponent(x.messaggio)}#riga-${n}`); }
    res.redirect(`/quotazioni/bom/${id}/riga/${n}?msg=${encodeURIComponent(x.messaggio)}#modifica-mano`);
  });
  // riga aggiunta a mano: componente che manca nella BOM o comprato altrove (Federico, 2/11/2026)
  r.post('/bom/:id/aggiungi', async (req, res) => {
    const id = Number(req.params.id);
    const b = req.body ?? {};
    const x = await aggiungiRigaBom(id, { pn: b.pn, descrizione: b.descrizione, designatori: b.designatori, qta: b.qta, prezzo: b.prezzo, dove: b.dove, nota: b.nota });
    if (x.n) avviaElaborazione(id);
    res.redirect(`/quotazioni/bom/${id}?msg=${encodeURIComponent(x.messaggio)}${x.n ? '' : '&aggiungi=1'}#aggiungi-riga`);
  });
  // codice "da verificare" controllato dall'ufficio: si conferma e va nell'archivio (Adriano 4/11/2026)
  r.post('/bom/:id/riga/:n/verificata', async (req, res) => {
    const msg = await verificaRiga(Number(req.params.id), Number(req.params.n), req.session.utente!.nome);
    res.redirect(`/quotazioni/bom/${req.params.id}/riga/${req.params.n}?msg=${encodeURIComponent(msg)}`);
  });
  r.post('/bom/:id/riga/:n/elimina', async (req, res) => {
    const msg = await togliRiga(Number(req.params.id), Number(req.params.n));
    res.redirect(`/quotazioni/bom/${req.params.id}?msg=${encodeURIComponent(msg)}`);
  });
  r.post('/bom/:id/riga/:n', async (req, res) => {
    const attributi: Record<string, string | null> = {};
    for (const k of [...ATTR, 'tecnologia']) attributi[k] = String(req.body[k] ?? '').trim() || null;
    const fam = String(req.body.famiglia ?? '').toUpperCase();
    const riga = await correggiRiga(Number(req.params.id), Number(req.params.n), { famiglia: fam in FAMIGLIE ? fam : null, attributi, clienteFornisce: !!req.body.cliente });
    // si resta sulla pagina della riga con il risultato o l'errore (Adriano 4/11/2026: "in BOM ci ritorno io con il pulsante")
    res.redirect(`/quotazioni/bom/${req.params.id}/riga/${req.params.n}?msg=${encodeURIComponent(esitoRicalcolo(riga))}`);
  });

  // ── Miglior prezzo di un P/N: tutti gli shop affiancati (Adriano 28/10/2026) ──
  r.get('/prezzo', async (req, res) => {
    const pn = String(req.query.pn ?? '').trim().slice(0, 80);
    const qta = Math.min(Math.max(parseInt(String(req.query.qta ?? ''), 10) || 1, 1), 1e7);
    const esito = pn && pnKey(pn) ? await cercaPn([pn], { forza: req.query.aggiorna === '1' }) : null;
    const perFornitore = esito?.perPn.get(pnKey(pn)!) ?? {};
    const offerte = Object.values(perFornitore).flatMap(x => x?.offerte ?? []);
    const attivi = (Object.keys(fornitoriConfigurati()) as Fornitore[]).filter(f => fornitoriConfigurati()[f]);
    const mancanti = esito ? attivi.filter(f => !esito.errori[f] && !perFornitore[f]?.offerte.length).map(f => NOMI_FORNITORI[f]) : [];
    res.send(pag(req, 'Miglior prezzo', 'prezzo', html`
      ${statoCollegamenti()}
      <form method="get" class="blocco stretto-form">
        <p class="nota">Scrivi il P/N del produttore e quanti pezzi servono: il portale chiede prezzo e disponibilità a tutti gli shop collegati
          e mette in cima il più conveniente (minimi d'ordine, multipli e scaglioni compresi). Le risposte restano in memoria 24 ore.</p>
        <label>P/N <input name="pn" value="${pn}" autofocus autocomplete="off" required></label>
        <label>Pezzi da comprare <input name="qta" value="${String(qta)}" inputmode="numeric"></label>
        <button class="primario">Cerca il prezzo</button>
      </form>
      ${esito ? html`<section class="blocco"><h2>${pn} <small class="nota">${num(qta, 0)} pz</small></h2>
        ${attivi.map(f => esito.errori[f] ? html`<p class="avviso">${esito.errori[f]}</p>` : '')}
        ${tabellaConfronto(offerte, qta)}
        <p class="nota">${mancanti.length ? `Non lo hanno: ${mancanti.join(', ')}. ` : ''}
          <a href="https://www.lcsc.com/search?q=${encodeURIComponent(pn)}" target="_blank" rel="noopener">Cerca su LCSC ↗</a> (non ancora collegato: si apre il sito) ·
          <a href="/quotazioni/prezzo?pn=${encodeURIComponent(pn)}&amp;qta=${String(qta)}&amp;aggiorna=1">Aggiorna prezzi</a></p>
      </section>` : ''}`));
  });

  // ── Componenti in comune tra le BOM di un cliente (Adriano Croci, 29/10/2026: stessi feeder su FOX e iPulse, niente cambi macchina) ──
  r.get('/comuni', async (req, res) => {
    const clienteId = parseInt(String(req.query.cliente ?? ''), 10) || null;
    const scelte = [...new Set([req.query.bom ?? []].flat().map(x => parseInt(String(x), 10)).filter(n => n > 0))];
    const clienti = await q<{ id: number; ragione_sociale: string }>(`SELECT DISTINCT c.id, c.ragione_sociale FROM clienti c
      WHERE c.id IN (SELECT cliente_id FROM preventivi WHERE bom_id IS NOT NULL UNION SELECT cliente_id FROM pacchetti_scheda WHERE bom_id IS NOT NULL)
      ORDER BY c.ragione_sociale`);
    const elenco = await q<{ id: number; nome: string; creato_il: string; del_cliente: boolean }>(`SELECT b.id, b.nome, b.creato_il,
        coalesce($2::int IN (SELECT cliente_id FROM preventivi WHERE bom_id = b.id UNION SELECT cliente_id FROM pacchetti_scheda WHERE bom_id = b.id), false) AS del_cliente
      FROM bom_analisi b WHERE b.file_nome IS DISTINCT FROM $1 AND b.stato = 'pronta' ORDER BY b.creato_il DESC LIMIT 200`, [FILE_SINGOLA, clienteId]);
    // scelte esplicite dell'ufficio; altrimenti tutte le BOM collegate al cliente (preventivi o documenti del cliente)
    const ids = scelte.length ? scelte : elenco.filter(b => b.del_cliente).map(b => b.id);
    const boms: BomPerComuni[] = ids.length ? (await q<{ id: number; nome: string; righe: RigaBom[] }>(
      `SELECT id, nome, righe FROM bom_analisi WHERE id = ANY($1::int[]) ORDER BY nome`, [ids]))
      .map(b => ({ id: b.id, nome: b.nome, righe: (b.righe ?? []).map(x => ({ pn: x.mpnAcquisto ?? x.pn, codiceProduzione: x.codiceProduzione,
        descrizione: x.descrizione ?? x.descrizioneBom, valore: x.valore, footprint: x.footprint, qtaScheda: x.qtaScheda, nonMontato: x.esito === ESITI.NON_MONTATO })) })) : [];
    const minimo = boms.length < 2 ? 1 : 2;
    const comuni = componentiInComune(boms, minimo);
    const fissi = feederFissi(comuni, req.query.feeder);
    res.send(pag(req, 'Componenti in comune', 'comuni', html`
      <form method="get" class="blocco">
        <p class="nota">Scegli un cliente (es. Selea): il portale prende le sue BOM quotate (collegate a un preventivo o ai documenti del cliente) e
          mette in cima i componenti che compaiono in più schede. Sono quelli da tenere fissi sui feeder di FOX e iPulse per passare da una produzione
          all'altra senza cambiarli. Puoi anche spuntare tu le BOM da confrontare. Solo consultazione: BOM, archivio e preventivi non cambiano.</p>
        <label>Cliente <select name="cliente"><option value="">— scegli —</option>
          ${clienti.map(c => html`<option value="${String(c.id)}" ${c.id === clienteId ? raw('selected') : ''}>${c.ragione_sociale}</option>`)}</select></label>
        <label>Feeder fissi <small class="unita">facoltativo: segna i primi N</small><input name="feeder" value="${String(req.query.feeder ?? '')}" inputmode="numeric"></label>
        <details ${scelte.length ? raw('open') : ''}><summary>Scegli le BOM a mano (${String(elenco.length)})</summary>
          <div class="tabella-scorre"><table class="elenco"><tbody>${elenco.map(b => html`<tr><td><label><input type="checkbox" name="bom" value="${String(b.id)}"
            ${ids.includes(b.id) ? raw('checked') : ''}> ${b.nome}</label></td><td>${new Date(b.creato_il).toLocaleDateString('it-IT')}</td>
            <td>${b.del_cliente ? 'del cliente' : ''}</td></tr>`)}</tbody></table></div></details>
        <button class="primario">Mostra i componenti</button>
      </form>
      ${!boms.length ? html`<p class="vuoto">${clienteId ? 'Questo cliente non ha BOM quotate: caricale in Quotazioni → BOM o spuntale a mano.' : 'Scegli un cliente o spunta le BOM.'}</p>` : html`
      <section class="blocco"><h2>${String(comuni.length)} componenti ${minimo === 2 ? 'in almeno 2 schede' : ''} <small class="nota">su ${String(boms.length)} BOM: ${boms.map(b => b.nome).join(', ')}</small></h2>
        ${fissi.size ? html`<p class="nota">In verde i primi ${String(fissi.size)}: proposta di feeder fissi.</p>` : ''}
        <div class="tabella-scorre"><table class="elenco"><thead><tr><th>Codice di produzione</th><th>P/N</th><th>Descrizione</th><th class="n">Schede</th>
          <th class="n">Pezzi a scheda (totale)</th><th>In quali BOM</th></tr></thead><tbody>
          ${comuni.map(c => html`<tr class="${fissi.has(c.chiave) ? 'fisso' : ''}"><td>${c.codiceProduzione ?? ''}</td><td>${c.pn.join(', ')}</td><td class="taglia">${c.descrizione ?? ''}</td>
            <td class="n">${String(c.bom.length)}</td><td class="n">${num(c.pezziTotali, 0)}</td>
            <td>${c.bom.map((b, i) => html`${i ? ', ' : ''}<a href="/quotazioni/bom/${String(b.id)}">${b.nome}</a> (${num(b.qtaScheda, 0)})`)}</td></tr>`)}
        </tbody></table></div></section>`}`));
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
    if (!pn && !descrizione) return res.redirect('/quotazioni/codifica');
    const fam = String(req.body.famiglia ?? '').toUpperCase();
    const id = await creaCodificaSingola({ pn, descrizione, famiglia: fam in FAMIGLIE ? fam : '', schede: leggiQuantita(req.body.quantita).length ? leggiQuantita(req.body.quantita) : [100], utenteId: req.session.utente!.id });
    avviaElaborazione(id);
    res.redirect(`/quotazioni/bom/${id}`);
  });

  // ── Archivio componenti: ora sta in Anagrafiche → Componenti (27/10/2026) ──
  r.get('/archivio', (req, res) => res.redirect('/anagrafiche/componenti' + (req.query.q ? `?q=${encodeURIComponent(String(req.query.q))}` : '')));
  r.get('/archivio.xlsx', (_req, res) => res.redirect('/anagrafiche/componenti.xlsx'));

  return r;
}

// ───────────────────────────── pezzi di pagina ─────────────────────────────
function statoCollegamenti() {
  const f = fornitoriConfigurati();
  const attivi = (Object.keys(f) as (keyof typeof f)[]).filter(k => f[k]).map(k => NOMI_FORNITORI[k]);
  return html`<p class="nota collegamenti">Distributori collegati: <b>${attivi.length ? attivi.join(', ') : 'nessuno'}</b> · lettura con l'IA:
    <b>${iaConfigurata() ? 'attiva' : 'non attiva'}</b>${attivi.length < Object.keys(f).length || !iaConfigurata() ? html` · <a href="/impostazioni/componenti">come collegarli</a>` : ''}</p>`;
}

function badgeEsito(r: RigaBom, aVerifica = '#verifica') {
  const e = r.clienteFornisce ? ESITI.CLIENTE : r.esito;
  return e === ESITI.NUOVO_VER ? html`<a href="${aVerifica}" class="esito ${CLASSE_ESITO[e] ?? ''}" title="Apri la riga e premi Verificato">${e}</a>`
    : html`<span class="esito ${CLASSE_ESITO[e] ?? ''}">${e}</span>`;
}
const badgeLivello = (r: RigaBom) => r.reperibilita ? html`<span class="livello ${r.reperibilita.livello}" title="${r.reperibilita.motivi.join('\n')}">${
  r.reperibilita.livello === 'ok' ? 'ok' : r.reperibilita.livello}</span>` : html``;

/** Banner della BOM quotata per un preventivo: problemi ancora aperti e ritorno al preventivo (Adriano 28/10/2026). */
function rimandoPreventivo(a: any, prev: { id: number; numero: string }): Raw {
  const inCorso = a.stato === 'in_corso' || a.stato === 'da_elaborare' || avanzamenti.has(a.id);
  const costo = a.riepilogo?.perQuantita?.[0] ?? { senzaPrezzo: 0, nonDisponibili: 0 };
  const problemi = inCorso ? [] : problemiBom(a.righe ?? [], costo);
  return html`<div class="avviso ${problemi.length || inCorso ? '' : 'info'} rimando-preventivo">
    <span>BOM quotata per il preventivo <a href="/preventivi/${prev.id}">${prev.numero}</a>.
      ${inCorso ? 'Quotazione in corso: quando finisce, controlla le righe segnalate.'
        : problemi.length ? html`Da sistemare: ${problemi.join(' · ')}. Quando hai finito torna al preventivo per la quota.`
        : 'Nessun problema aperto: torna al preventivo per la quota.'}</span>
    <a class="bottone primario" href="/preventivi/${prev.id}?quota-bom=1">Torna al preventivo per la quota</a></div>`;
}

/** Righe non montate (DNP), PCB e simili in evidenza sopra la tabella: non si comprano, ma è bene vederle (Adriano Croci). */
function avvisoNonMontati(righe: RigaBom[]): Raw {
  const nm = righe.filter(r => r.esito === ESITI.NON_MONTATO);
  if (!nm.length) return html``;
  return html`<div class="avviso info"><b>${nm.length === 1 ? '1 riga non si monta' : `${nm.length} righe non si montano`}</b> e non si comprano:
    ${nm.map((r, i) => html`${i ? ' · ' : ''}<a href="#riga-${r.n}">riga ${r.n}</a> ${r.designatori ? `(${r.designatori.length > 30 ? r.designatori.slice(0, 30) + '…' : r.designatori})` : ''}
      <small>${r.note.find(x => /non montare|escluso|PCB|fiducial/i.test(x)) ?? ''}</small>`)}.
    Se una voce non serve proprio, "togli" in fondo alla riga la toglie dalla BOM.</div>`;
}

/**
 * Riquadro con SOLO le righe senza prezzo o non disponibili (Adriano 4/11/2026: "fammi vedere solo le righe con i prezzi mancanti"):
 * una tabella piccola in cima alla BOM, con la casella per scrivere il prezzo a mano senza aprire la riga.
 */
function riquadroDaPrezzare(a: any, righe: RigaBom[], preventivo = 0): Raw {
  const x = righeDaPrezzare(righe);
  if (!x.length) return html``;
  const senza = x.filter(r => r.motivo === 'senza prezzo').length, nd = x.length - senza;
  return html`<section class="blocco riquadro-da-prezzare" id="da-prezzare">
    <h2>${[senza ? (senza === 1 ? '1 componente senza prezzo' : `${senza} componenti senza prezzo`) : '',
      nd ? (nd === 1 ? '1 non disponibile' : `${nd} non disponibili`) : ''].filter(Boolean).join(' e ')}</h2>
    <p class="nota">Scrivi il prezzo €/pz e premi Salva: da quel momento vale quello e la riga esce da qui. Per un'alternativa o altre modifiche apri la riga.</p>
    <div class="tabella-scorre"><table data-non-ordinare><thead><tr><th>Riga</th><th>P/N</th><th>Riferimenti</th><th class="n">Qtà a scheda</th><th>Problema</th><th>Prezzo a mano €/pz</th><th></th></tr></thead><tbody>
    ${x.map(r => html`<tr><td><a href="#riga-${r.n}">${r.n}</a></td><td><b>${r.nome}</b></td><td>${r.rif}</td><td class="n">${num(r.qtaScheda, 2)}</td>
      <td><span class="livello critico">${r.motivo}</span></td>
      <td><form method="post" action="/quotazioni/bom/${a.id}/riga/${r.n}/prezzo" class="inline prezzo-veloce">
        <input type="hidden" name="torna" value="bom">${preventivo ? html`<input type="hidden" name="preventivo" value="${preventivo}">` : ''}<input name="prezzo" inputmode="decimal" placeholder="es. 0,125" size="8" aria-label="Prezzo €/pz riga ${r.n}">
        <button>Salva</button></form></td>
      <td><a href="/quotazioni/bom/${a.id}/riga/${r.n}">modifica</a></td></tr>`)}
    </tbody></table></div></section>`;
}

function paginaAnalisi(a: any, preventivo = 0): Raw {
  const righe: RigaBom[] = a.righe ?? []; const quantita: number[] = a.quantita ?? [];
  const rp: Riepilogo | undefined = a.riepilogo?.perQuantita ? a.riepilogo : undefined;
  const inCorso = a.stato === 'in_corso' || a.stato === 'da_elaborare' || avanzamenti.has(a.id);
  const singola = a.file_nome === FILE_SINGOLA;
  const solo = !!a.solo_codifica; // codifica senza prezzi: niente totali, acquisti, reperibilità né compatibili
  const daSalvare = righe.filter(r => r.esito === ESITI.NUOVO || r.esito === ESITI.NUOVO_VER || r.esito === ESITI.DB_FATTO).length;
  const mappa: Record<string, string> = a.mappatura ?? {};
  const daPrezzare = new Set(solo || inCorso ? [] : righeDaPrezzare(righe).map(x => x.n));
  return html`
  <div class="intestazione-pagina"><h1>${a.nome}</h1>
    <div class="azioni">
      ${!inCorso && daSalvare ? html`<form method="post" action="/quotazioni/bom/${a.id}/salva" class="inline"><button class="primario" title="Mette nell'archivio i codici nuovi completi">Salva ${daSalvare} codici nell'archivio</button></form>` : ''}
      ${!inCorso && righe.length ? html`<a class="bottone" href="/quotazioni/bom/${a.id}/excel" title="${solo ? 'File Excel: si apre anche in Google Sheets (caricalo nel Drive e aprilo con Fogli Google)' : 'Codifica e acquisti in Excel'}">Scarica Excel</a>` : ''}
      ${!inCorso && rp?.perQuantita.some(x => x.totale > 0) ? html`<a class="bottone" href="/ordini/fornitori/bom/${a.id}" title="Prepara gli ordini a fornitore, uno per distributore">Ordina i componenti</a>` : ''}
      ${inCorso ? '' : solo ? html`<form method="post" action="/quotazioni/bom/${a.id}/rielabora" class="inline"><button title="Rifà la codifica (archivio aggiornato, regole nuove); i prezzi non si cercano">Rielabora</button></form>`
        : html`<form method="post" action="/quotazioni/bom/${a.id}/rielabora" class="inline"><button title="Rifà la codifica con le regole nuove e l'archivio aggiornato usando i prezzi già letti: nessuna richiesta ai distributori">Rielabora</button>
          <button name="prezzi" value="1" title="Rilegge prezzi e disponibilità da tutti i distributori (consuma le richieste del giorno)" data-conferma="Rileggo prezzi e disponibilità di tutte le righe da tutti i distributori? Consuma le richieste del giorno (Farnell: 1.000).">Aggiorna prezzi</button></form>`}
      <form method="post" action="/quotazioni/bom/${a.id}/elimina" class="inline conferma-elimina"><button class="pericolo">Elimina</button></form>
    </div></div>
  ${inCorso ? html`<div class="avviso info" id="avanzamento" data-id="${a.id}">Elaborazione in corso…</div>` : ''}
  ${a.stato === 'errore' ? html`<div class="avviso">${a.messaggio}</div>` : a.messaggio ? html`<div class="avviso info">${a.messaggio}</div>` : ''}
  ${solo ? html`<p class="nota">Codifica senza prezzi: codici di produzione e gestionale dall'archivio, dal P/N, dalle colonne della BOM e dall'IA;
    i distributori non vengono interpellati. Se un codice non si completa, apri "modifica" sulla riga.</p>
    ${rp ? html`<div class="totali materiali"><div class="totale principale"><span>Righe</span><strong>${rp.righe}</strong><small>${rp.inArchivio} in archivio · ${rp.nuovi} nuovi · ${rp.daCompletare} da completare</small></div></div>` : ''}`
  : rp ? html`<div class="totali materiali">
    ${rp.perQuantita.map((x, i) => html`<div class="totale ${i === 0 ? 'principale' : ''}"><span>Materiali per ${num(x.schede, 0)} schede</span>
      ${x.totale > 0 ? html`<strong>${euro2(x.totale)}</strong><small>${euro2(x.aScheda)} a scheda${x.senzaPrezzo ? ` · ${x.senzaPrezzo} righe senza prezzo` : ''}${x.nonDisponibili ? ` · ${x.nonDisponibili} non disponibili` : ''}</small>`
        : html`<strong>—</strong><small>${Object.values(fornitoriConfigurati()).some(Boolean) ? 'nessun prezzo trovato' : 'nessun distributore collegato'}</small>`}</div>`)}
    <div class="totale"><span>Righe</span><strong>${rp.righe}</strong><small>${rp.inArchivio} in archivio · ${rp.nuovi} nuovi · ${rp.daCompletare} da completare</small></div>
    <div class="totale"><span>Reperibilità</span><strong>${rp.critici ? html`<span class="negativo">${rp.critici} critici</span>` : 'nessun critico'}</strong><small>${rp.attenzione} da tenere d'occhio</small></div>
  </div>` : ''}
  ${!singola ? html`<details class="blocco"><summary>${solo ? 'Colonne della BOM' : 'Colonne della BOM e quantità'}</summary>
    <form method="post" action="/quotazioni/bom/${a.id}/colonne" class="riga-campi">
      ${(Object.entries(ETICHETTE_RUOLI) as [Ruolo, string][]).map(([k, t]) => html`<label>${t}<select name="${k}"><option value="">—</option>
        ${(a.colonne as string[]).map(c => html`<option ${mappa[k] === c ? raw('selected') : ''}>${c}</option>`)}</select></label>`)}
      <button>Applica e rielabora</button></form>
    ${solo ? '' : html`<form method="post" action="/quotazioni/bom/${a.id}/quantita" class="riga-campi"><label>Schede da produrre<input name="quantita" value="${quantita.join(', ')}"></label><button>Ricalcola</button></form>`}
  </details>` : ''}
  ${solo && !inCorso ? html`<details class="blocco"><summary>Cerca anche i prezzi (passa a Quotazioni)</summary>
    <form method="post" action="/quotazioni/bom/${a.id}/prezzi" class="riga-campi"><label>Schede da produrre <small class="unita">anche più quantità, es. 100, 250</small><input name="quantita" value="100"></label>
      <button title="La BOM va in Quotazioni e si rielabora con prezzi e disponibilità dai distributori">Cerca i prezzi</button></form></details>` : ''}
  ${righe.length ? html`
  ${avvisoNonMontati(righe)}
  ${solo || inCorso ? '' : riquadroDaPrezzare(a, righe, preventivo)}
  ${solo ? '' : bloccoCompatibili(a, righe)}
  <div class="filtri" id="filtri"><button data-filtro="" class="attivo">Tutte (${righe.length})</button>
    <button data-filtro="manca">Da completare (${righe.filter(r => CLASSE_ESITO[r.esito] === 'manca').length})</button>
    <button data-filtro="nuovo verifica">Nuovi (${righe.filter(r => ['nuovo', 'verifica'].includes(CLASSE_ESITO[r.esito])).length})</button>
    <button data-filtro="escluso" title="Non montati (DNP), PCB, fiducial, forniti dal cliente">Esclusi (${righe.filter(r => r.esito === ESITI.NON_MONTATO || r.clienteFornisce).length})</button>
    ${solo ? '' : html`<button data-filtro="da-prezzare" title="Righe da comprare senza prezzo o non disponibili">Senza prezzo (${daPrezzare.size})</button>`}
    ${solo ? '' : html`<button data-filtro="critico attenzione">Reperibilità (${righe.filter(r => r.reperibilita && r.reperibilita.livello !== 'ok').length})</button>`}</div>
  <div class="tabella-scorre"><table class="bom"><thead><tr><th>Riga</th><th>P/N</th><th class="n">Qtà</th><th>Esito</th><th>Codice produzione</th><th>Codice gestionale</th>
    <th>Descrizione</th>${solo ? '' : html`<th>Reperib.</th>`}${quantita.map(s => html`<th class="n">${num(s, 0)} schede</th>`)}<th>Note</th><th></th></tr></thead><tbody>
    ${righe.map(r => html`<tr id="riga-${r.n}"${daPrezzare.has(r.n) ? raw(' class="da-prezzare"') : ''} data-classi="${CLASSE_ESITO[r.clienteFornisce ? ESITI.CLIENTE : r.esito] ?? ''} ${r.reperibilita?.livello ?? ''}${daPrezzare.has(r.n) ? ' da-prezzare' : ''}">
      <td>${r.n}</td><td><b>${r.pn ?? ''}</b>${r.mpnAcquisto && !r.pn && !r.alternativaScelta ? html`<br><small class="nota">→ ${r.mpnAcquisto}</small>` : ''}
        ${r.alternativaScelta ? html`<br><small class="alternativa-scelta" title="Si compra l'alternativa scelta">→ ${r.alternativaScelta}</small>`
          : r.alternativaProposta ? html`<br><a class="compatibile-da-verificare" href="#compatibili" title="P/N non trovato: il prezzo è quello di un compatibile, da verificare">→ ${r.alternativaProposta} <b>compatibile da verificare</b></a>`
          : r.alternative?.length ? html`<br><a class="alternative-pronte" href="/quotazioni/bom/${a.id}/riga/${r.n}#alternative">${r.alternative.length === 1 ? '1 alternativa' : `${r.alternative.length} alternative`}: scegli</a>` : ''}
        ${!r.pn && (r.valore || r.descrizioneBom) ? html`<br><small class="nota">${[r.valore, r.footprint].filter(Boolean).join(' · ') || r.descrizioneBom}</small>` : ''}</td>
      <td class="n">${num(r.qtaScheda, 2)}</td><td>${badgeEsito(r, `/quotazioni/bom/${a.id}/riga/${r.n}#verifica`)}</td>
      <td class="codice">${r.codiceProduzione}</td><td class="codice">${r.codiceGestionale}</td><td class="taglia" title="${r.descrizione ?? ''}">${r.descrizione}</td>
      ${solo ? '' : html`<td>${badgeLivello(r)}</td>`}
      ${quantita.map((_, i) => { const x = r.acquisti[i]; return html`<td class="acquisto">${x?.scelta ? html`<b>${num(x.scelta.qta, 0)}</b> pz · ${nomeFornitore(x.scelta.fornitore)}
        <br><small>${euro4(x.scelta.prezzo)} € → <b>${euro2(x.scelta.totale)}</b>${x.scarto ? ` · +${x.scarto} scarto` : ''}${!x.scelta.disponibile ? ' · NON DISPONIBILE' : ''}</small>`
        : x ? html`<small class="nota">${num(x.lorda, 0)} pz, prezzo non trovato</small>` : ''}</td>`; })}
      <td class="note" title="${[...r.note, ...(r.reperibilita?.motivi ?? [])].join('\n')}">${r.aggiuntaAMano ? html`<span class="esito nuovo" title="Riga aggiunta a mano dall'ufficio">aggiunta</span> ` : ''}${r.notaOperatore ? html`<b class="nota-ufficio">Nota: ${r.notaOperatore}</b> ` : ''}${r.note.some(n => n.startsWith(NOTA_DA_VALIDARE)) ? html`<strong class="da-validare">⚠ codice da validare</strong> ` : ''}${[...r.note, ...(r.reperibilita?.livello !== 'ok' ? r.reperibilita?.motivi ?? [] : [])].join('; ')}</td>
      <td><a href="/quotazioni/bom/${a.id}/riga/${r.n}">${r.esito === ESITI.DB ? 'dettagli' : 'modifica'}</a>
        ${inCorso ? '' : html`<form method="post" action="/quotazioni/bom/${a.id}/riga/${r.n}/elimina" class="inline" data-conferma="${`Togliere la riga ${r.n} dalla BOM? Non torna nemmeno con Rielabora.`}">
          <button class="link negativo" title="Toglie la riga dalla BOM (voce che non serve)">togli</button></form>`}</td></tr>`)}
  </tbody></table></div>
  ${!singola && !inCorso ? bloccoAggiungiRiga(a) : ''}
  <p class="nota">Esiti: <span class="esito archivio">in archivio</span> codici esistenti · <span class="esito nuovo">nuovo</span> codici calcolati, da salvare ·
    <span class="esito verifica">da verificare</span> ipotesi da controllare (vedi note) · <span class="esito manca">da completare</span> mancano dati: apri "modifica".
    ${solo ? '' : 'Lo scarto: passivi economici +10%, sotto 1 € +5%, 1–3 € +1 pezzo, oltre 3 € nessuno.'}</p>` : inCorso ? '' : html`<p class="vuoto">Nessuna riga.</p>`}`;
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

/** Confronto tra gli shop per il "Miglior prezzo di un P/N": migliore in verde, quanto costano in più gli altri. */
export function tabellaConfronto(offerte: Offerta[], qta: number) {
  if (!offerte.length) return html`<p class="vuoto">Nessuno shop collegato ha questo P/N.</p>`;
  return html`<div class="tabella-scorre"><table class="confronto"><thead><tr><th>Shop</th><th>Codice</th><th>Produttore · P/N</th><th>Confezione</th>
    <th class="n">Disponibili</th><th class="n">Minimo</th><th class="n">Da ordinare</th><th class="n">€/pz</th><th class="n">Totale</th><th class="n">In più</th><th>Note</th></tr></thead><tbody>
    ${confrontaOfferte(offerte, qta).map(({ offerta: o, acquisto: a, disponibile, migliore, differenza }) => html`<tr class="${migliore ? 'migliore' : ''}">
      <td>${NOMI_FORNITORI[o.fornitore]}${migliore ? html` <span class="esito nuovo">migliore</span>` : ''}</td>
      <td>${o.url ? html`<a href="${o.url}" target="_blank" rel="noopener">${o.codiceFornitore}</a>` : o.codiceFornitore}</td>
      <td>${o.produttore} · ${o.mpn}</td><td>${o.confezione ?? ''}</td>
      <td class="n">${num(o.stock, 0)}</td><td class="n">${num(o.moq, 0)}${o.multiplo > 1 ? ` ×${o.multiplo}` : ''}</td>
      <td class="n">${a ? num(a.qta, 0) : ''}</td><td class="n">${a ? euro4(a.prezzo) : ''}${o.valuta && o.valuta !== 'EUR' ? ` ${o.valuta}` : ''}</td>
      <td class="n"><b>${a ? euro2(a.totale) : ''}</b></td><td class="n">${differenza != null ? (differenza > 0.005 ? '+' + euro2(differenza) : 'uguale') : ''}</td>
      <td><small>${[a?.nota, !disponibile && a ? 'pezzi non sufficienti' : '', !a ? 'senza prezzo' : '', o.ciclo ?? '', o.consegnaSettimane ? `${o.consegnaSettimane} sett.` : '']
        .filter(Boolean).join(' · ')}</small></td></tr>`)}
  </tbody></table></div>`;
}

/**
 * Sezione "Codici compatibili da verificare" (Adriano 1/11/2026): righe il cui P/N non si trova da nessun distributore. Il portale prezza
 * la riga con un compatibile "al 100%" in teoria e lo segna; qui si vedono tutti insieme e si confermano, o si sceglie un'altra alternativa.
 */
function bloccoCompatibili(a: any, righe: RigaBom[]): Raw {
  const elenco = righe.filter(r => r.esito !== ESITI.NON_MONTATO && !r.clienteFornisce
    && (r.alternativaProposta || (!r.alternativaScelta && r.alternative?.length && r.reperibilita?.livello === 'critico')));
  const verificati = righe.filter(r => r.alternativaScelta).length;
  if (!elenco.length) return verificati ? html`<p class="nota" id="compatibili">${verificati === 1 ? '1 riga compra' : `${verificati} righe comprano`} un'alternativa scelta al posto del P/N della BOM (→ nella colonna P/N).</p>` : html``;
  return html`<section class="blocco compatibili" id="compatibili"><h2>Codici compatibili da verificare <small class="nota">${elenco.length}</small></h2>
    <p class="nota">Questi P/N non si trovano presso nessun distributore collegato. Dove c'è un compatibile al 100% (in teoria: stesso P/N con altra
      confezione, stesse caratteristiche, sostituto diretto DigiKey o proposta pin-to-pin dell'IA trovata dai distributori) il prezzo della riga è il suo,
      ma va controllato sul datasheet: "Confermo" lo rende definitivo, "altre" apre tutte le alternative della riga.</p>
    <div class="tabella-scorre"><table><thead><tr><th>Riga</th><th>P/N della BOM</th><th>Compatibile proposto</th><th>Come è stato trovato</th>
      <th>Prezzo</th><th class="n">Alternative</th><th></th></tr></thead><tbody>
      ${elenco.map(r => {
        const p = r.alternative?.find(x => x.mpn === r.alternativaProposta);
        const x = r.acquisti[0]?.scelta;
        const azione = `/quotazioni/bom/${a.id}/riga/${r.n}/alternativa`;
        return html`<tr><td><a href="#riga-${r.n}">${r.n}</a></td><td><b>${r.pn ?? r.mpnAcquisto}</b><br><small class="nota">${r.descrizione ?? r.descrizioneBom ?? ''}</small></td>
          <td>${p ? html`<b>${p.mpn}</b> <small>${p.produttore}</small><br><small class="nota">${p.descrizione}</small>` : html`<span class="livello critico">nessuno sicuramente uguale</span>`}</td>
          <td>${p ? html`${p.fonte}${p.nota ? html`<br><small>${p.nota}</small>` : ''}` : ''}</td>
          <td>${p && x ? html`${nomeFornitore(x.fornitore)} · ${euro4(x.prezzo)} €/pz${!x.disponibile ? ' · NON DISPONIBILE' : ''}` : ''}</td>
          <td class="n"><a href="/quotazioni/bom/${a.id}/riga/${r.n}#alternative">${r.alternative?.length ?? 0} altre</a></td>
          <td>${p ? html`<form method="post" action="${azione}" class="inline"><button name="usa" value="${p.mpn}" class="primario" title="Controllato sul datasheet: si compra questo">Confermo</button></form>` : ''}</td></tr>`; })}
    </tbody></table></div></section>`;
}

/** Alternative al P/N: proposte dal portale e scritte a mano; l'operatore sceglie quale comprare (Adriano 28/10/2026). */
function bloccoAlternative(a: any, r: RigaBom, qta: number): Raw {
  if (r.esito === ESITI.NON_MONTATO || r.clienteFornisce) return html``;
  const alternative = r.alternative ?? [];
  const azione = `/quotazioni/bom/${a.id}/riga/${r.n}/alternativa`;
  const critico = r.reperibilita?.livello === 'critico';
  return html`<section class="blocco" id="alternative"><h2>Alternative</h2>
    ${r.alternativaScelta ? html`<div class="riga-campi">Si compra <b>${r.alternativaScelta}</b> al posto di ${r.pn ?? r.mpnAcquisto ?? 'quello della BOM'}.
      <form method="post" action="${azione}" class="inline"><button name="originale" value="1">Torna al P/N della BOM</button></form></div>`
      : r.alternativaProposta ? html`<div class="avviso">Il P/N non si trova da nessun distributore: il prezzo è quello del compatibile <b>${r.alternativaProposta}</b>,
        DA VERIFICARE sul datasheet. <form method="post" action="${azione}" class="inline"><button name="usa" value="${r.alternativaProposta}" class="primario">Confermo</button></form>
        <form method="post" action="${azione}" class="inline"><button name="originale" value="1">Non va bene</button></form></div>`
      : critico ? html`<p class="nota">Il P/N non si trova da nessun distributore: scegli un'alternativa o scrivila qui sotto.</p>` : ''}
    ${alternative.length ? html`<div class="tabella-scorre"><table><thead><tr><th>P/N</th><th>Produttore</th><th>Descrizione</th><th>Come è stata trovata</th>
      <th class="n">Disponibili</th><th>Miglior offerta per ${num(qta, 0)}</th><th></th></tr></thead><tbody>
      ${alternative.map(x => {
        const s = sceltaMigliore(x.offerte, Math.max(1, qta));
        const stock = Math.max(0, ...x.offerte.map(o => o.stock));
        return html`<tr class="${x.mpn === r.alternativaScelta ? 'scelta' : ''}"><td><b>${x.mpn}</b></td><td>${x.produttore}</td><td class="taglia" title="${x.descrizione}">${x.descrizione}</td>
          <td>${x.fonte}${x.nota ? html`<br><small>${x.nota}</small>` : ''}${x.mpn === r.alternativaProposta ? html` <span class="livello attenzione">prezzo in uso, da verificare</span>` : ''}${x.identica === true ? html` <span class="livello ok" title="Stesso codice di produzione della riga">stesse caratteristiche</span>`
            : x.identica === false ? html` <span class="livello critico">caratteristiche diverse</span>` : html` <span class="livello attenzione">da controllare</span>`}</td>
          <td class="n">${num(stock, 0)}</td>
          <td>${s ? html`${NOMI_FORNITORI[s.offerta.fornitore]} · ${euro4(s.acquisto.prezzo)} €/pz → <b>${euro2(s.acquisto.totale)}</b>${s.disponibile ? '' : ' · NON DISPONIBILE'}` : html`<small class="nota">nessun prezzo</small>`}</td>
          <td>${x.mpn === r.alternativaScelta ? html`<b>in uso</b>` : x.offerte.length ? html`<form method="post" action="${azione}" class="inline"><button name="usa" value="${x.mpn}" class="primario">Usa questa</button></form>` : ''}
            <form method="post" action="${azione}" class="inline"><button name="togli" value="${x.mpn}" class="link negativo" title="Toglie l'alternativa dall'elenco">togli</button></form></td></tr>`; })}
    </tbody></table></div>` : ''}
    <form method="post" action="${azione}" class="riga-campi"><label>Alternativa scritta a mano <small class="unita">P/N del produttore</small>
      <input name="nuova" autocomplete="off" placeholder="es. RC0603FR-072K2L"></label><button>Cerca e usa</button></form>
    <p class="nota">Il P/N scritto si cerca presso tutti i distributori collegati; se si trova diventa quello da comprare. Il portale controlla anche se ha le stesse caratteristiche della riga.</p>
  </section>`;
}

/** Modifiche a mano della riga (Federico, 2/11/2026): P/N sbagliato nella BOM, quantità, scarto, nota. */
function bloccoModificaMano(a: any, r: RigaBom): Raw {
  return html`<form method="post" action="/quotazioni/bom/${a.id}/riga/${r.n}/mano" class="blocco" id="modifica-mano">
    <h3>Modifica a mano</h3>
    <p class="nota">Se nella BOM il P/N o la quantità sono sbagliati correggili qui: la BOM si rielabora (codici e prezzi del P/N giusto) e la correzione resta
      anche con "Aggiorna prezzi". Lo scarto scritto vale al posto di quello standard: pezzi in più per lotto (es. <code>10</code>) o percentuale (es. <code>5%</code>); vuoto = standard.</p>
    <div class="riga-campi">
      <label>P/N <input name="pn" value="${r.pn ?? ''}" autocomplete="off" class="codice"></label>
      <label class="stretto">Pezzi a scheda <input name="qta" value="${String(r.qtaScheda).replace('.', ',')}" inputmode="decimal" autocomplete="off"></label>
      <label class="stretto">Scarto <input name="scarto" value="${testoScarto(r.scartoManuale)}" placeholder="standard" autocomplete="off"></label>
    </div>
    <label>Nota <textarea name="nota" rows="2" placeholder="Commento dell'ufficio sulla riga (si vede nella BOM)">${r.notaOperatore ?? ''}</textarea></label>
    <button class="primario">Salva le modifiche</button>
  </form>`;
}

/** Riga aggiunta a mano (Federico, 2/11/2026): componente che manca nella BOM o che si compra altrove. */
function bloccoAggiungiRiga(a: any): Raw {
  return html`<details class="blocco" id="aggiungi-riga"><summary>+ Aggiungi una riga</summary>
    <form method="post" action="/quotazioni/bom/${a.id}/aggiungi">
      <p class="nota">Per un componente che non è nella BOM del cliente o che si compra altrove (magazzino, altro fornitore). Con il P/N il portale lo codifica e cerca
        i prezzi come le altre righe; se scrivi il prezzo vale quello. Entra nei totali e quindi nel costo componenti del preventivo collegato.</p>
      <div class="riga-campi">
        <label>P/N <input name="pn" autocomplete="off" class="codice"></label>
        <label>Descrizione <input name="descrizione" autocomplete="off" placeholder="es. DISSIPATORE TO-220"></label>
        <label>Designatori <input name="designatori" autocomplete="off" placeholder="facoltativo"></label>
      </div>
      <div class="riga-campi">
        <label class="stretto">Pezzi a scheda <input name="qta" inputmode="decimal" autocomplete="off" required></label>
        <label class="stretto">Prezzo €/pz <input name="prezzo" inputmode="decimal" autocomplete="off" placeholder="facoltativo"></label>
        <label>Si compra da <input name="dove" autocomplete="off" placeholder="facoltativo, es. magazzino"></label>
      </div>
      <label>Nota <input name="nota" autocomplete="off"></label>
      <button class="primario">Aggiungi la riga</button>
    </form></details>`;
}

/**
 * Riquadro "Da verificare" (Adriano 4/11/2026: "come faccio a verificarlo? dove devo cliccare?"): dice cosa controllare
 * (le note della riga) e il pulsante che conferma il codice e lo salva nell'archivio.
 */
function riquadroVerifica(a: any, r: RigaBom): Raw {
  if (r.esito !== ESITI.NUOVO_VER || r.clienteFornisce) return html``;
  return html`<section class="blocco da-verificare" id="verifica">
    <h2>Codice da verificare</h2>
    <p>Il portale ha calcolato i codici ma non è sicuro di tutto: leggi le note qui sopra (es. case simile a uno già in tabella, valori standard usati).</p>
    <ol class="nota"><li>Controlla famiglia e campi con il datasheet; se qualcosa è sbagliato correggilo e premi <b>Ricalcola</b>.</li>
      <li>Se i codici vanno bene premi <b>Verificato</b>: la riga diventa "NUOVO" e il componente entra subito nell'archivio componenti con questi codici.</li></ol>
    ${r.codiceGestionale ? html`<form method="post" action="/quotazioni/bom/${a.id}/riga/${r.n}/verificata" class="inline"
        data-conferma="Confermi i codici ${r.codiceProduzione ?? ''} / ${r.codiceGestionale} e li salvi nell'archivio componenti?">
      <button class="primario">✓ Verificato, salva nell'archivio</button></form>`
      : html`<p class="avviso">Manca il codice gestionale: completa i dati e premi Ricalcola.</p>`}
  </section>`;
}

/** Voci dell'elenco di una casella: prima i valori già usati nell'archivio per la famiglia, poi quelli della tabella. */
function elencoCampo(k: (typeof ATTR)[number], famiglia: string | null, archivio: ValoriArchivio): { valore: string; etichetta: string }[] {
  const usati = (archivio[k] ?? []).map(x => ({ valore: x.valore, etichetta: `${x.valore} · in archivio ${x.volte} ${x.volte === 1 ? 'volta' : 'volte'}` }));
  const giaQui = new Set(usati.map(x => x.valore));
  const tabella = valoriTabella(k, famiglia).filter(v => !giaQui.has(v)).map(v => ({ valore: v, etichetta: `${v} · in tabella` }));
  // per i campi liberi (tensione, corrente…) si mostrano solo i valori dell'archivio
  return [...usati, ...tabella];
}

/** Suggerimenti quando la riga ha un problema (Adriano 4/11/2026). */
function riquadroSuggerimenti(r: RigaBom, archivio: ValoriArchivio): Raw {
  if (r.codiceGestionale && r.codiceProduzione) return html``;
  const s = suggerimentiRiga(r, archivio);
  if (!s.length) return html``;
  return html`<div class="suggerimenti-riga"><b>Suggerimenti</b><ul>${s.map(x => html`<li>${x}</li>`)}</ul></div>`;
}

function paginaRiga(a: any, r: RigaBom, archivio: ValoriArchivio = {}): Raw {
  const bloccata = r.esito === ESITI.DB || r.esito === ESITI.NON_MONTATO;
  const qta = r.acquisti[r.acquisti.length - 1]?.lorda ?? 0;
  return html`
  <div class="intestazione-pagina"><h1>Riga ${r.n}: ${r.pn ?? r.mpnAcquisto ?? r.valore ?? ''} ${badgeEsito(r)}</h1>
    <a class="bottone" href="/quotazioni/bom/${a.id}#riga-${r.n}">← Torna alla BOM</a></div>
  ${riquadroVerifica(a, r)}
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
      <p class="nota campi-spiegazione"></p>
      <div class="campi-attributi" data-campi="${JSON.stringify(mappaCampiFamiglie())}">${ATTR.map(k => {
        const elenco = elencoCampo(k, r.famiglia, archivio);
        return html`<label data-campo="${k}" data-nome="${ETICHETTE[k]}" ${r.famiglia && !campiFamiglia(r.famiglia).includes(k) ? raw('hidden') : ''}>${ETICHETTE[k]}<input name="${k}" value="${r.attributi[k] ?? ''}" placeholder="${esempioCampo(r.famiglia, k, r.attributi.tecnologia) ? `es. ${esempioCampo(r.famiglia, k, r.attributi.tecnologia)}` : ''}" autocomplete="off" ${elenco.length ? raw(`list="elenco-${k}"`) : ''}>${elenco.length ? html`<datalist id="elenco-${k}">${elenco.map(x => html`<option value="${x.valore}">${x.etichetta}</option>`)}</datalist>` : ''}</label>`;
      })}</div>
      ${riquadroSuggerimenti(r, archivio)}
      <p><a href="#" class="campi-tutti nota" hidden>Mostra tutti i campi</a></p>`}
      <label class="spunta"><input type="checkbox" name="cliente" ${r.clienteFornisce ? raw('checked') : ''}> Fornito dal cliente (non si acquista)</label>
      <button class="primario">Ricalcola</button>
    </form>
    ${a.solo_codifica ? html`<section>${bloccoModificaMano(a, r)}</section>` : html`<section>
      <h2>Acquisto</h2>
      ${r.reperibilita ? html`<p>${badgeLivello(r)} ${r.reperibilita.motivi.join(' · ')}</p>` : ''}
      ${r.esito === ESITI.NON_MONTATO || r.clienteFornisce ? '' : html`<form method="post" action="/quotazioni/bom/${a.id}/riga/${r.n}/prezzo" class="riga-campi" id="prezzo-manuale">
        <label>Prezzo a mano <small class="unita">€/pz, vale al posto di quello proposto</small>
          <input name="prezzo" inputmode="decimal" autocomplete="off" value="${r.prezzoManuale != null ? String(r.prezzoManuale).replace('.', ',') : ''}" placeholder="es. 0,125"></label>
        <button class="primario">Salva prezzo</button>${r.prezzoManuale != null ? html`<button name="togli" value="1">Torna al prezzo proposto</button>` : ''}</form>`}
      ${a.file_nome === FILE_SINGOLA ? '' : bloccoModificaMano(a, r)}
      ${bloccoAlternative(a, r, qta)}
      ${r.acquisti.length ? html`<table class="acquisti"><thead><tr><th class="n">Schede</th><th class="n">Netta</th><th>Scarto</th><th class="n">Da ordinare</th><th>Fornitore</th><th class="n">€/pz</th><th class="n">Totale</th></tr></thead><tbody>
        ${r.acquisti.map(x => html`<tr><td class="n">${num(x.schede, 0)}</td><td class="n">${num(x.netta, 0)}</td><td>${x.scarto ? `+${x.scarto} ` : ''}<small>${x.regolaScarto}</small></td>
          <td class="n">${num(x.scelta?.qta ?? x.lorda, 0)}</td><td>${x.scelta ? html`${nomeFornitore(x.scelta.fornitore)} ${x.scelta.codice}${x.scelta.nota ? html`<br><small>${x.scelta.nota}</small>` : ''}` : '—'}</td>
          <td class="n">${euro4(x.scelta?.prezzo)}</td><td class="n">${euro2(x.scelta?.totale)}</td></tr>`)}</tbody></table>` : html`<p class="nota">Nessun acquisto (componente escluso o senza quantità).</p>`}
      <h2>Offerte dei distributori</h2>
      ${tabellaOfferte(r.offerte, qta)}
    </section>`}
  </div>`;
}
