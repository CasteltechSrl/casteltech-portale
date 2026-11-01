/**
 * Sezione Dipendenti (Adriano 1/11/2026; menu in alto, solo ufficio):
 * - Costo del personale: totale del mese (dipendenti e soci) e confronto con il fatturato, visibile a tutto l'ufficio;
 * - Buste paga (area riservata): cedolini, riepiloghi, note contabili, F24 e costo per qualifica, solo con il permesso
 *   dell'amministratore E la password delle buste paga (resta aperta 15 minuti);
 * - Nota spese: rimborso chilometrico come il "Modulo rimborso km" in Excel (anche importandolo), pagamenti e riepilogo dell'anno;
 * - Persone: dipendenti e soci con le loro auto e la tariffa al km.
 * I documenti dello studio paghe arrivano anche dalla cartella Drive "Da acquisire" (`server/drive.ts`) e non passano da Ordini → Da acquisire.
 */
import express, { Router, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { gunzipSync } from 'node:zlib';
import { q, q1, transazione } from '../db.js';
import { layout } from '../views/layout.js';
import { html, data, euro, num, raw, type Raw } from '../views/html.js';
import { maiuscolo } from '../anagrafiche-servizio.js';
import {
  TIPI_PAGHE, TIPI_RISERVATI, MINUTI_SBLOCCO, controllaPasswordPaghe, costoAzienda, kmRiga, nomeMeseMaiuscolo, puoAprireRiservata, riepilogoAnno,
  rigaNotaDaModulo, rimborsoRiga, sbloccoValido, tabellaCosti, tipoDocumentoPaghe, totaliNotaSpese, type TipoPaghe,
} from '../../engine/dipendenti.js';
import { caricaStoricoCosti, importaModuloKm, leggiDocumentoPaghe, registraDocumentoPaghe, totaliNoteAnno } from '../dipendenti-servizio.js';

declare module 'express-session' { interface SessionData { pagheSbloccate?: number } }

const oggiRoma = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
const annoOggi = () => Number(oggiRoma().slice(0, 4));
const pagina = (req: Request, titolo: string, contenuto: Raw, opz: { avviso?: string; script?: string } = {}) =>
  String(layout({ titolo, utente: req.session.utente, attiva: 'dipendenti', contenuto, avviso: opz.avviso ?? (req.query.msg ? String(req.query.msg) : undefined), script: opz.script, largo: true }));
const vai = (res: Response, dove: string, msg?: string) => res.redirect(msg ? `${dove}${dove.includes('?') ? '&' : '?'}msg=${encodeURIComponent(msg)}` : dove);

const numero = (v: unknown): number | null => {
  const t = String(v ?? '').trim().replace(/\s|€/g, '');
  if (!t) return null;
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) ? n : null;
};

function menuDipendenti(attiva: 'costi' | 'note' | 'persone' | 'riservata'): Raw {
  const voci = [['costi', '/dipendenti', 'Costo del personale'], ['note', '/dipendenti/note-spese', 'Nota spese'],
    ['persone', '/dipendenti/persone', 'Persone e auto'], ['riservata', '/dipendenti/riservata', '🔒 Buste paga']] as const;
  return html`<nav class="tasti-sezione">${voci.map(([k, h, n]) => html`<a href="${h}" class="${k === attiva ? 'attivo' : ''}">${n}</a>`)}</nav>`;
}

/** Utente con email e permesso, per l'area riservata. */
async function utenteCompleto(req: Request) {
  return q1<{ id: number; email: string; paghe: boolean }>(`SELECT id, email, paghe FROM utenti WHERE id = $1 AND attivo`, [req.session.utente?.id ?? 0]);
}
const amministratore = (email?: string | null) => !!email && !!process.env.ADMIN_EMAIL && email.toLowerCase() === process.env.ADMIN_EMAIL.toLowerCase();

/** Area riservata aperta: permesso + password scritta da meno di 15 minuti (ogni pagina vista la tiene aperta). */
async function riservataAperta(req: Request): Promise<boolean> {
  const u = await utenteCompleto(req);
  if (!u || !puoAprireRiservata(u, process.env.ADMIN_EMAIL)) return false;
  if (!sbloccoValido(req.session.pagheSbloccate, Date.now())) return false;
  req.session.pagheSbloccate = Date.now();
  return true;
}

/** Fatturato per anno e mese (fatture meno note di credito emesse, anche lo storico di Fatture in Cloud). */
async function fatturatoMesi(): Promise<Map<string, number>> {
  const r = await q<{ anno: number; mese: number; v: number }>(`SELECT extract(year FROM data)::int AS anno, extract(month FROM data)::int AS mese,
      sum(CASE WHEN tipo = 'nota_credito' THEN -imponibile ELSE imponibile END)::float AS v
    FROM documenti WHERE tipo IN ('fattura', 'nota_credito') AND stato NOT IN ('bozza', 'annullato', 'scartato') AND numero IS NOT NULL GROUP BY 1, 2`);
  return new Map(r.map(x => [`${x.anno}-${x.mese}`, Number(x.v) || 0]));
}

export function rotteDipendenti() {
  const r = Router();

  // ───────────────────────────── costo del personale (tutto l'ufficio) ─────────────────────────────
  r.get('/', async (req, res) => {
    const [costi, fatturato, f24, ultimi] = await Promise.all([
      q<{ anno: number; mese: number; costo: number }>(`SELECT anno, mese, sum(lordo + contributi + tfr + altri)::float AS costo FROM costi_personale GROUP BY 1, 2`),
      fatturatoMesi(),
      q(`SELECT id, anno, mese, to_char(scadenza, 'YYYY-MM-DD') AS scadenza, totale::float AS totale, pagato_il, stato FROM paghe_documenti
        WHERE tipo = 'f24' ORDER BY scadenza DESC NULLS LAST, id DESC LIMIT 6`),
      q(`SELECT tipo, nome_file, stato, errore, creato_il FROM paghe_documenti ORDER BY id DESC LIMIT 8`),
    ]);
    const tabella = tabellaCosti(costi.map(c => ({ anno: c.anno, mese: c.mese, costo: Number(c.costo) })));
    const fattAnno = (anno: number, mesi: (number | null)[]) => mesi.reduce<number>((s, v, i) => s + (v == null ? 0 : fatturato.get(`${anno}-${i + 1}`) ?? 0), 0);
    const ultimo = costi.length ? costi.reduce((a, b) => (a.anno * 100 + a.mese > b.anno * 100 + b.mese ? a : b)) : null;
    const corrente = tabella[0];
    res.send(pagina(req, 'Costo del personale', html`
      <div class="intestazione-pagina"><h1>Dipendenti · costo del personale</h1></div>
      ${menuDipendenti('costi')}
      <div class="cifre">
        <div class="cifra"><span>Ultimo mese caricato</span><b>${ultimo ? euro(Number(ultimo.costo)) : '—'}</b><small>${ultimo ? `${nomeMeseMaiuscolo(ultimo.mese)} ${ultimo.anno}` : 'nessuna nota contabile'}</small></div>
        <div class="cifra"><span>Media mensile ${corrente?.anno ?? ''}</span><b>${corrente ? euro(corrente.media) : '—'}</b><small>${corrente ? `${corrente.mesiCaricati} mesi caricati` : ''}</small></div>
        <div class="cifra"><span>Totale ${corrente?.anno ?? ''}</span><b>${corrente ? euro(corrente.totale) : '—'}</b>
          <small>${corrente?.variazione != null ? `${corrente.variazione > 0 ? '+' : ''}${num(corrente.variazione, 1)} % sugli stessi mesi del ${corrente.anno - 1}` : ''}</small></div>
        ${corrente ? (() => { const f = fattAnno(corrente.anno, corrente.mesi); return html`<div class="cifra"><span>Peso sul fatturato ${corrente.anno}</span>
          <b>${f > 0 ? `${num(corrente.totale / f * 100, 1)} %` : '—'}</b><small>${f > 0 ? `fatturato degli stessi mesi ${euro(f)}` : 'fatturato non disponibile'}</small></div>`; })() : ''}
      </div>
      <p class="nota">Costo per l'azienda di dipendenti e soci: retribuzioni lorde + contributi INPS a carico dell'azienda + TFR + enti bilaterali e assistenza sanitaria,
        dalle note contabili dello studio paghe (2019–2021 dal "bilancino" del vecchio studio). L'INAIL si paga una volta l'anno con l'F24 di febbraio e non è nei mesi.
        Il dettaglio per qualifica e le buste paga sono nell'area <a href="/dipendenti/riservata">🔒 Buste paga</a>.</p>
      ${tabella.length ? html`<div class="tabella-scorre"><table class="elenco">
        <thead><tr><th>Anno</th>${Array.from({ length: 12 }, (_, i) => html`<th class="num">${nomeMeseMaiuscolo(i + 1).slice(0, 3)}</th>`)}<th class="num">Totale</th><th class="num">Media</th>
          <th class="num" title="Sugli stessi mesi dell'anno prima">Rispetto all'anno prima</th><th class="num" title="Costo del personale ÷ fatturato degli stessi mesi">Sul fatturato</th></tr></thead>
        <tbody>${tabella.map(t => { const f = fattAnno(t.anno, t.mesi); return html`<tr><td><b>${t.anno}</b></td>
          ${t.mesi.map(v => html`<td class="num">${v == null ? '' : num(v, 0)}</td>`)}
          <td class="num"><b>${num(t.totale, 0)}</b></td><td class="num">${num(t.media, 0)}</td>
          <td class="num ${t.variazione != null && t.variazione > 10 ? 'negativo' : ''}">${t.variazione == null ? '' : `${t.variazione > 0 ? '+' : ''}${num(t.variazione, 1)} %`}</td>
          <td class="num">${f > 0 ? `${num(t.totale / f * 100, 1)} %` : ''}</td></tr>`; })}</tbody></table></div>`
        : html`<p class="vuoto">Nessun costo caricato. Metti le note contabili nella cartella Drive "Da acquisire" o caricale qui sotto; lo storico si carica dall'area riservata.</p>`}
      <h2>F24 delle paghe</h2>
      ${f24.length ? html`<table class="elenco"><thead><tr><th>Scadenza</th><th>Paghe di</th><th class="num">Totale</th><th>Stato</th></tr></thead>
        <tbody>${f24.map((f: any) => html`<tr><td>${data(f.scadenza)}</td><td>${f.mese ? `${nomeMeseMaiuscolo(f.mese)} ${f.anno}` : ''}</td>
          <td class="num">${f.totale != null ? euro(f.totale) : f.stato === 'errore' ? 'non letto' : ''}</td>
          <td>${f.pagato_il ? html`<span class="etichetta cliente">pagato il ${data(f.pagato_il)}</span>` : f.scadenza && f.scadenza < oggiRoma() ? html`<span class="etichetta prio-alta">scaduto</span>` : 'da pagare'}</td></tr>`)}</tbody></table>`
        : html`<p class="vuoto">Nessun F24 caricato.</p>`}
      <h2>Carica documenti dello studio paghe</h2>
      <p class="nota">Cedolini, riepiloghi, note contabili e F24 in PDF (anche più file insieme). Arrivano anche da soli dalla cartella Google Drive "Da acquisire" se il nome
        è quello dello studio paghe (es. "Casteltech - ced 08-2026.pdf", "Casteltech - nc 08-2026.pdf", "Casteltech - f24 del 16-09-26.pdf").
        I cedolini e i riepiloghi si aprono solo dall'area riservata; la nota contabile e l'F24 li legge l'IA per il costo del mese e la scadenza.</p>
      <div class="blocco"><input type="file" id="file-acquisizioni" multiple accept=".pdf">
        <button class="primario" id="avvia-acquisizioni" data-url="/dipendenti/carica">Carica</button> <span id="esito-acquisizioni" class="nota"></span></div>
      ${ultimi.length ? html`<p class="nota">Ultimi arrivati: ${ultimi.map((u: any, i: number) => html`${i ? ' · ' : ''}${TIPI_PAGHE[u.tipo as TipoPaghe]} ${u.stato === 'errore' ? html`<span class="negativo">(${u.errore})</span>` : ''}`)}</p>` : ''}
    `, { script: 'acquisizioni.js' }));
  });

  r.post('/carica', express.raw({ type: 'application/octet-stream', limit: '30mb' }), async (req, res) => {
    const nome = decodeURIComponent(String(req.get('x-nome-file') ?? '')).trim();
    const dati = req.body as Buffer;
    if (!nome || !Buffer.isBuffer(dati) || !dati.length) return res.status(400).json({ errore: 'file vuoto' });
    if (!/\.pdf$/i.test(nome)) return res.status(400).json({ errore: 'serve un PDF' });
    // dal nome; se il nome non dice nulla si chiede di rinominarlo (un ordine caricato qui per errore non deve finire tra le paghe)
    const tipo = tipoDocumentoPaghe(nome);
    if (!tipo) return res.status(400).json({ errore: 'dal nome non si capisce se è un cedolino, un riepilogo, una nota contabile o un F24: rinominalo come lo manda lo studio (es. "Casteltech - nc 08-2026.pdf")' });
    const { id, doppione } = await registraDocumentoPaghe(nome, dati, { tipo, utenteId: req.session.utente!.id });
    if (doppione) return res.json({ id, stato: 'già caricato prima' });
    if (id) await leggiDocumentoPaghe(id);
    const d = await q1(`SELECT stato, errore FROM paghe_documenti WHERE id = $1`, [id]);
    res.json({ id, stato: d?.stato === 'errore' ? 'caricato, ma non letto' : `${TIPI_PAGHE[tipo]} caricato`, errore: d?.errore ?? undefined });
  });

  // ───────────────────────────── persone e auto ─────────────────────────────
  r.get('/persone', async (req, res) => {
    const [persone, veicoli] = await Promise.all([
      q(`SELECT d.*, (SELECT count(*)::int FROM note_spese n WHERE n.dipendente_id = d.id) AS note FROM dipendenti d ORDER BY d.attivo DESC, d.nome`),
      q(`SELECT v.*, (SELECT count(*)::int FROM note_spese n WHERE n.veicolo_id = v.id) AS note FROM rimborsi_veicoli v ORDER BY v.anno DESC NULLS LAST`),
    ]);
    const tipi = ['dipendente', 'socio', 'collaboratore', 'tirocinante'];
    const opz = (sel: string) => tipi.map(t => html`<option value="${t}" ${t === sel ? raw('selected') : ''}>${t}</option>`);
    res.send(pagina(req, 'Persone e auto', html`
      <div class="intestazione-pagina"><h1>Dipendenti · persone e auto</h1></div>
      ${menuDipendenti('persone')}
      <p class="nota">Dipendenti, soci, collaboratori e tirocinanti che chiedono il rimborso chilometrico, con le loro auto e la tariffa al km (tabelle ACI).
        Qui non ci sono stipendi né dati personali: quelli stanno nelle buste paga dell'area riservata.</p>
      <div class="tabella-scorre"><table class="editor">
        <thead><tr><th>Nome</th><th>Tipo</th><th>Qualifica</th><th>Attivo</th><th>Note</th><th></th></tr></thead>
        <tbody>
          <tr class="nuova-riga"><td><input name="nome" form="p-nuova" class="maiuscolo" required placeholder="NOME COGNOME"></td>
            <td><select name="tipo" form="p-nuova">${opz('dipendente')}</select></td><td><input name="qualifica" form="p-nuova" class="maiuscolo"></td><td></td>
            <td><input name="note" form="p-nuova"></td><td><form method="post" action="/dipendenti/persone" id="p-nuova"><button class="primario">Aggiungi</button></form></td></tr>
          ${persone.map((p: any) => html`<tr class="${p.attivo ? '' : 'tenue'}"><td><input name="nome" form="p-${p.id}" value="${p.nome}" class="maiuscolo" required></td>
            <td><select name="tipo" form="p-${p.id}">${opz(p.tipo)}</select></td><td><input name="qualifica" form="p-${p.id}" value="${p.qualifica ?? ''}" class="maiuscolo"></td>
            <td><input type="checkbox" name="attivo" value="1" form="p-${p.id}" ${p.attivo ? raw('checked') : ''}></td><td><input name="note" form="p-${p.id}" value="${p.note ?? ''}"></td>
            <td class="nowrap"><form method="post" action="/dipendenti/persone/${p.id}" id="p-${p.id}"><button>Salva</button></form>
              ${p.note ? '' : html`<form method="post" action="/dipendenti/persone/${p.id}/elimina" class="inline" data-conferma="${`Eliminare ${p.nome}?`}"><button class="link negativo">Elimina</button></form>`}</td></tr>`)}
        </tbody></table></div>
      ${persone.length ? html`<p class="nota">Una persona con note spese non si elimina: togli la spunta "Attivo".</p>` : ''}
      <h2>Auto e tariffa al km</h2>
      <p class="nota">La tariffa si copia nella nota spese quando la nota si crea: cambiarla qui non cambia le note già fatte.</p>
      <div class="tabella-scorre"><table class="editor">
        <thead><tr><th>Persona</th><th>Marca</th><th>Modello</th><th>Anno</th><th>€/km</th><th>Attiva</th><th></th></tr></thead>
        <tbody>
          ${persone.length ? html`<tr class="nuova-riga"><td><select name="dipendente_id" form="v-nuova" required>${persone.filter((p: any) => p.attivo).map((p: any) => html`<option value="${p.id}">${p.nome}</option>`)}</select></td>
            <td><input name="marca" form="v-nuova" class="maiuscolo"></td><td><input name="modello" form="v-nuova" class="maiuscolo"></td>
            <td><input name="anno" form="v-nuova" inputmode="numeric" size="5"></td><td><input name="tariffa_km" form="v-nuova" inputmode="decimal" size="6" required placeholder="0,46"></td><td></td>
            <td><form method="post" action="/dipendenti/veicoli" id="v-nuova"><button class="primario">Aggiungi</button></form></td></tr>` : ''}
          ${veicoli.map((v: any) => html`<tr class="${v.attivo ? '' : 'tenue'}"><td>${persone.find((p: any) => p.id === v.dipendente_id)?.nome ?? ''}</td>
            <td><input name="marca" form="v-${v.id}" value="${v.marca ?? ''}" class="maiuscolo"></td><td><input name="modello" form="v-${v.id}" value="${v.modello ?? ''}" class="maiuscolo"></td>
            <td><input name="anno" form="v-${v.id}" value="${v.anno ?? ''}" inputmode="numeric" size="5"></td>
            <td><input name="tariffa_km" form="v-${v.id}" value="${num(Number(v.tariffa_km), 4).replace(/0+$/, '').replace(/,$/, ',00')}" inputmode="decimal" size="6" required></td>
            <td><input type="checkbox" name="attivo" value="1" form="v-${v.id}" ${v.attivo ? raw('checked') : ''}></td>
            <td class="nowrap"><form method="post" action="/dipendenti/veicoli/${v.id}" id="v-${v.id}"><button>Salva</button></form>
              ${v.note ? '' : html`<form method="post" action="/dipendenti/veicoli/${v.id}/elimina" class="inline" data-conferma="Eliminare questa auto?"><button class="link negativo">Elimina</button></form>`}</td></tr>`)}
        </tbody></table></div>`));
  });
  const datiPersona = (b: any) => ({ nome: maiuscolo(String(b.nome ?? '').trim()), tipo: ['dipendente', 'socio', 'collaboratore', 'tirocinante'].includes(b.tipo) ? b.tipo : 'dipendente',
    qualifica: maiuscolo(String(b.qualifica ?? '').trim()) || null, note: String(b.note ?? '').trim() || null });
  r.post('/persone', async (req, res) => {
    const p = datiPersona(req.body);
    if (!p.nome) return vai(res, '/dipendenti/persone', 'Scrivi il nome.');
    if (await q1(`SELECT 1 FROM dipendenti WHERE nome = $1`, [p.nome])) return vai(res, '/dipendenti/persone', `${p.nome} c'è già.`);
    await q(`INSERT INTO dipendenti (nome, tipo, qualifica, note) VALUES ($1,$2,$3,$4)`, [p.nome, p.tipo, p.qualifica, p.note]);
    vai(res, '/dipendenti/persone', `${p.nome} aggiunto.`);
  });
  r.post('/persone/:id', async (req, res) => {
    const p = datiPersona(req.body);
    if (!p.nome) return vai(res, '/dipendenti/persone', 'Il nome non può essere vuoto.');
    if (await q1(`SELECT 1 FROM dipendenti WHERE nome = $1 AND id <> $2`, [p.nome, Number(req.params.id)])) return vai(res, '/dipendenti/persone', `${p.nome} c'è già.`);
    await q(`UPDATE dipendenti SET nome = $2, tipo = $3, qualifica = $4, note = $5, attivo = $6 WHERE id = $1`, [Number(req.params.id), p.nome, p.tipo, p.qualifica, p.note, req.body.attivo === '1']);
    vai(res, '/dipendenti/persone', 'Salvato.');
  });
  r.post('/persone/:id/elimina', async (req, res) => {
    const id = Number(req.params.id);
    if (await q1(`SELECT 1 FROM note_spese WHERE dipendente_id = $1 UNION SELECT 1 FROM note_spese_pagamenti WHERE dipendente_id = $1`, [id]))
      return vai(res, '/dipendenti/persone', 'Ha note spese o rimborsi pagati: non si elimina, togli la spunta "Attivo".');
    await q(`DELETE FROM dipendenti WHERE id = $1`, [id]);
    vai(res, '/dipendenti/persone', 'Eliminato.');
  });
  const datiVeicolo = (b: any) => ({ marca: maiuscolo(String(b.marca ?? '').trim()) || null, modello: maiuscolo(String(b.modello ?? '').trim()) || null,
    anno: numero(b.anno), tariffa: numero(b.tariffa_km) });
  r.post('/veicoli', async (req, res) => {
    const v = datiVeicolo(req.body);
    if (v.tariffa == null || v.tariffa <= 0 || v.tariffa > 5) return vai(res, '/dipendenti/persone', 'Scrivi la tariffa al km (es. 0,46).');
    await q(`INSERT INTO rimborsi_veicoli (dipendente_id, marca, modello, anno, tariffa_km) VALUES ($1,$2,$3,$4,$5)`, [Number(req.body.dipendente_id), v.marca, v.modello, v.anno, v.tariffa]);
    vai(res, '/dipendenti/persone', 'Auto aggiunta.');
  });
  r.post('/veicoli/:id', async (req, res) => {
    const v = datiVeicolo(req.body);
    if (v.tariffa == null || v.tariffa <= 0 || v.tariffa > 5) return vai(res, '/dipendenti/persone', 'Scrivi la tariffa al km (es. 0,46).');
    await q(`UPDATE rimborsi_veicoli SET marca = $2, modello = $3, anno = $4, tariffa_km = $5, attivo = $6 WHERE id = $1`, [Number(req.params.id), v.marca, v.modello, v.anno, v.tariffa, req.body.attivo === '1']);
    vai(res, '/dipendenti/persone', 'Auto salvata.');
  });
  r.post('/veicoli/:id/elimina', async (req, res) => {
    if (await q1(`SELECT 1 FROM note_spese WHERE veicolo_id = $1`, [Number(req.params.id)])) return vai(res, '/dipendenti/persone', 'Usata in una nota spese: togli la spunta "Attiva".');
    await q(`DELETE FROM rimborsi_veicoli WHERE id = $1`, [Number(req.params.id)]);
    vai(res, '/dipendenti/persone', 'Auto eliminata.');
  });

  // ───────────────────────────── nota spese ─────────────────────────────
  r.get('/note-spese', async (req, res) => {
    const anno = Number(req.query.anno) || annoOggi();
    const [note, pagamenti, persone, veicoli] = await Promise.all([
      totaliNoteAnno(anno),
      q(`SELECT p.*, d.nome, to_char(p.data, 'YYYY-MM-DD') AS data_testo FROM note_spese_pagamenti p JOIN dipendenti d ON d.id = p.dipendente_id WHERE p.anno = $1 ORDER BY p.data`, [anno]),
      q(`SELECT id, nome FROM dipendenti WHERE attivo ORDER BY nome`),
      q(`SELECT id, dipendente_id, marca, modello, anno, tariffa_km::float AS tariffa FROM rimborsi_veicoli WHERE attivo ORDER BY anno DESC NULLS LAST`),
    ]);
    const perPersona = new Map<string, { id: number; note: typeof note; pagato: number }>();
    for (const n of note) { const p = perPersona.get(n.nome) ?? { id: n.dipendente_id, note: [], pagato: 0 }; p.note.push(n); perPersona.set(n.nome, p); }
    for (const p of pagamenti as any[]) { const x = perPersona.get(p.nome) ?? { id: p.dipendente_id, note: [], pagato: 0 }; x.pagato += Number(p.importo); perPersona.set(p.nome, x); }
    const meseOggi = Number(oggiRoma().slice(5, 7));
    res.send(pagina(req, `Nota spese ${anno}`, html`
      <div class="intestazione-pagina"><h1>Dipendenti · nota spese ${anno}</h1></div>
      ${menuDipendenti('note')}
      <form class="cerca" method="get"><select name="anno">${Array.from({ length: 6 }, (_, i) => annoOggi() + 1 - i).map(a => html`<option ${a === anno ? raw('selected') : ''}>${a}</option>`)}</select><button>Mostra</button>
        <a href="/dipendenti/note-spese/destinazioni">Destinazioni e km</a></form>
      <p class="nota">Come il "Modulo rimborso km": una nota al mese per persona, una riga per viaggio (km di andata dall'elenco delle destinazioni, andata e ritorno = km × 2)
        più le altre spese. Rimborso = km × tariffa dell'auto + altre spese.</p>
      ${persone.length ? html`<form method="post" action="/dipendenti/note-spese" class="blocco"><div class="riga-campi">
        <label>Persona <select name="dipendente_id" required>${persone.map((p: any) => html`<option value="${p.id}">${p.nome}</option>`)}</select></label>
        <label class="stretto">Mese <select name="mese">${Array.from({ length: 12 }, (_, i) => html`<option value="${i + 1}" ${i + 1 === meseOggi ? raw('selected') : ''}>${nomeMeseMaiuscolo(i + 1)}</option>`)}</select></label>
        <label class="stretto">Anno <input name="anno" value="${anno}" inputmode="numeric" size="5"></label>
        <label>Auto <select name="veicolo_id"><option value="">— senza auto (solo spese) —</option>${veicoli.map((v: any) => html`<option value="${v.id}" data-persona="${v.dipendente_id}">${persone.find((p: any) => p.id === v.dipendente_id)?.nome ?? ''} · ${[v.marca, v.modello, v.anno].filter(Boolean).join(' ')} · ${num(v.tariffa, 2)} €/km</option>`)}</select></label>
      </div><div class="barra-azioni"><button class="primario">Nuova nota spese</button></div></form>`
        : html`<p class="avviso">Prima aggiungi le persone e le loro auto in <a href="/dipendenti/persone">Persone e auto</a>, oppure importa il modulo Excel qui sotto.</p>`}
      ${perPersona.size ? [...perPersona.entries()].map(([nome, p]) => {
        const rie = riepilogoAnno(p.note.map(n => ({ mese: n.mese, totale: n.totale, pagato: 0 })));
        const daPagare = Math.round((rie.totale - p.pagato) * 100) / 100;
        return html`<h2>${nome}</h2>
        <div class="tabella-scorre"><table class="elenco"><thead><tr><th>Mese</th><th class="num">Km</th><th class="num">Altre spese</th><th class="num">Rimborso</th><th></th></tr></thead>
          <tbody>${p.note.map(n => html`<tr data-href="/dipendenti/note-spese/${n.nota_id}"><td><a href="/dipendenti/note-spese/${n.nota_id}">${nomeMeseMaiuscolo(n.mese)}</a></td>
            <td class="num">${num(n.km, 0)}</td><td class="num">${euro(n.altre)}</td><td class="num">${euro(n.totale)}</td>
            <td><a href="/dipendenti/note-spese/${n.nota_id}/stampa">Stampa</a></td></tr>`)}</tbody>
          <tfoot><tr><th>Totale ${anno}</th><th></th><th></th><th class="num">${euro(rie.totale)}</th><th></th></tr>
            <tr><th>Pagato</th><th></th><th></th><th class="num">${euro(p.pagato)}</th><th></th></tr>
            <tr><th>Da pagare</th><th></th><th></th><th class="num ${daPagare > 0 ? 'negativo' : ''}">${euro(daPagare)}</th><th></th></tr></tfoot></table></div>
        ${(pagamenti as any[]).filter(x => x.dipendente_id === p.id).length ? html`<p class="nota">Pagamenti: ${(pagamenti as any[]).filter(x => x.dipendente_id === p.id).map((x, i) => html`${i ? ' · ' : ''}${data(x.data_testo)} ${euro(Number(x.importo))}${x.note ? ` (${x.note})` : ''}
          <form method="post" action="/dipendenti/note-spese/pagamenti/${x.id}/elimina" class="inline" data-conferma="Eliminare questo pagamento?"><button class="link negativo">×</button></form>`)}</p>` : ''}
        <form method="post" action="/dipendenti/note-spese/pagamenti" class="riga-campi"><input type="hidden" name="dipendente_id" value="${p.id}"><input type="hidden" name="anno" value="${anno}">
          <label class="stretto">Pagato il <input type="date" name="data" value="${oggiRoma()}" required></label>
          <label class="stretto">Importo € <input name="importo" inputmode="decimal" size="8" required value="${daPagare > 0 ? num(daPagare, 2) : ''}"></label>
          <label>Note <input name="note" placeholder="es. bonifico"></label><button>Segna pagato</button></form>`;
      }) : html`<p class="vuoto">Nessuna nota spese nel ${anno}.</p>`}
      <h2>Importa il modulo Excel</h2>
      <p class="nota">Il file "Modulo rimborso km" di un anno: dal foglio DATI arrivano destinazioni con i km e le persone con l'auto e la tariffa,
        dai fogli dei mesi le note spese della persona scritta nel primo foglio. I mesi che hanno già una nota non si toccano.</p>
      <form method="post" action="/dipendenti/note-spese/importa" class="blocco" id="importa-km">
        <input type="file" id="file-km" accept=".xlsx"> <button type="button" class="primario" id="avvia-km">Importa</button> <span id="esito-km" class="nota"></span></form>
    `, { script: 'dipendenti.js' }));
  });

  r.post('/note-spese/importa', express.raw({ type: 'application/octet-stream', limit: '10mb' }), async (req, res) => {
    try {
      const e = await importaModuloKm(req.body as Buffer);
      res.json({ messaggio: `${e.persona} ${e.anno}: ${e.note} note spese con ${e.righe} viaggi, ${e.destinazioni} destinazioni nuove, ${e.veicoli} auto nuove${e.saltati.length ? `; saltati: ${e.saltati.join(', ')}` : ''}.`, anno: e.anno });
    } catch (e: any) { res.status(400).json({ errore: String(e?.message ?? e) }); }
  });

  r.post('/note-spese', async (req, res) => {
    const dip = Number(req.body.dipendente_id), anno = Number(req.body.anno), mese = Number(req.body.mese);
    if (!(dip > 0 && anno >= 2000 && mese >= 1 && mese <= 12)) return vai(res, '/dipendenti/note-spese', 'Scegli persona, mese e anno.');
    const gia = await q1<{ id: number }>(`SELECT id FROM note_spese WHERE dipendente_id = $1 AND anno = $2 AND mese = $3`, [dip, anno, mese]);
    if (gia) return res.redirect(`/dipendenti/note-spese/${gia.id}`);
    const v = req.body.veicolo_id ? await q1(`SELECT * FROM rimborsi_veicoli WHERE id = $1 AND dipendente_id = $2`, [Number(req.body.veicolo_id), dip]) : null;
    if (req.body.veicolo_id && !v) return vai(res, `/dipendenti/note-spese?anno=${anno}`, "L'auto scelta è di un'altra persona.");
    const n = await q1<{ id: number }>(`INSERT INTO note_spese (dipendente_id, veicolo_id, anno, mese, tariffa_km, veicolo_testo) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [dip, v?.id ?? null, anno, mese, v?.tariffa_km ?? 0, v ? [v.marca, v.modello, v.anno].filter(Boolean).join(' ') : null]);
    res.redirect(`/dipendenti/note-spese/${n!.id}`);
  });

  const leggiNota = async (id: number) => {
    const n = await q1(`SELECT n.*, n.tariffa_km::float AS tariffa, d.nome FROM note_spese n JOIN dipendenti d ON d.id = n.dipendente_id WHERE n.id = $1`, [id]);
    if (!n) return null;
    const righe = await q(`SELECT *, to_char(data, 'YYYY-MM-DD') AS data_testo, km_andata::float AS km, altre_spese::float AS altre FROM note_spese_righe WHERE nota_id = $1 ORDER BY data, id`, [id]);
    return { n, righe: righe.map((r: any) => ({ ...r, kmAndata: r.km, altreSpese: r.altre, andataRitorno: r.andata_ritorno })) };
  };

  r.get('/note-spese/destinazioni', async (req, res) => {
    const d = await q(`SELECT *, km_andata::float AS km, (SELECT count(*)::int FROM note_spese_righe r WHERE r.destinazione = x.nome) AS usi FROM rimborsi_destinazioni x ORDER BY nome`);
    res.send(pagina(req, 'Destinazioni e km', html`
      <div class="intestazione-pagina"><h1>Nota spese · destinazioni e km</h1></div>
      ${menuDipendenti('note')}
      <p class="nota">Km di sola andata dalla sede: nella nota spese basta scegliere la destinazione e i km si scrivono da soli (andata e ritorno = × 2).</p>
      <div class="tabella-scorre limitata"><table class="editor"><thead><tr><th>Destinazione</th><th>Km andata</th><th>Provincia</th><th class="num">Viaggi</th><th></th></tr></thead><tbody>
        <tr class="nuova-riga"><td><input name="nome" form="d-nuova" class="maiuscolo" required></td><td><input name="km_andata" form="d-nuova" inputmode="decimal" size="6" required></td>
          <td><input name="provincia" form="d-nuova" class="maiuscolo" size="4"></td><td></td><td><form method="post" action="/dipendenti/note-spese/destinazioni" id="d-nuova"><button class="primario">Aggiungi</button></form></td></tr>
        ${d.map((x: any) => html`<tr><td><input name="nome" form="d-${x.id}" value="${x.nome}" class="maiuscolo" required></td><td><input name="km_andata" form="d-${x.id}" value="${num(x.km, 1)}" inputmode="decimal" size="6"></td>
          <td><input name="provincia" form="d-${x.id}" value="${x.provincia ?? ''}" class="maiuscolo" size="4"></td><td class="num">${x.usi}</td>
          <td class="nowrap"><form method="post" action="/dipendenti/note-spese/destinazioni/${x.id}" id="d-${x.id}"><button>Salva</button></form>
            <form method="post" action="/dipendenti/note-spese/destinazioni/${x.id}/elimina" class="inline" data-conferma="${`Eliminare ${x.nome}? Le note già fatte restano con i loro km.`}"><button class="link negativo">Elimina</button></form></td></tr>`)}
      </tbody></table></div>`));
  });
  r.post('/note-spese/destinazioni', async (req, res) => {
    const nome = maiuscolo(String(req.body.nome ?? '').trim()), km = numero(req.body.km_andata);
    if (!nome || km == null || km < 0) return vai(res, '/dipendenti/note-spese/destinazioni', 'Scrivi destinazione e km.');
    await q(`INSERT INTO rimborsi_destinazioni (nome, km_andata, provincia) VALUES ($1,$2,$3) ON CONFLICT (nome) DO UPDATE SET km_andata = excluded.km_andata, provincia = excluded.provincia`,
      [nome, km, maiuscolo(String(req.body.provincia ?? '').trim()) || null]);
    vai(res, '/dipendenti/note-spese/destinazioni', `${nome} salvata.`);
  });
  r.post('/note-spese/destinazioni/:id', async (req, res) => {
    const nome = maiuscolo(String(req.body.nome ?? '').trim()), km = numero(req.body.km_andata);
    if (!nome || km == null || km < 0) return vai(res, '/dipendenti/note-spese/destinazioni', 'Scrivi destinazione e km.');
    if (await q1(`SELECT 1 FROM rimborsi_destinazioni WHERE nome = $1 AND id <> $2`, [nome, Number(req.params.id)])) return vai(res, '/dipendenti/note-spese/destinazioni', `${nome} c'è già.`);
    await q(`UPDATE rimborsi_destinazioni SET nome = $2, km_andata = $3, provincia = $4 WHERE id = $1`, [Number(req.params.id), nome, km, maiuscolo(String(req.body.provincia ?? '').trim()) || null]);
    vai(res, '/dipendenti/note-spese/destinazioni', 'Salvata.');
  });
  r.post('/note-spese/destinazioni/:id/elimina', async (req, res) => {
    await q(`DELETE FROM rimborsi_destinazioni WHERE id = $1`, [Number(req.params.id)]);
    vai(res, '/dipendenti/note-spese/destinazioni', 'Eliminata.');
  });

  r.post('/note-spese/pagamenti', async (req, res) => {
    const importo = numero(req.body.importo), anno = Number(req.body.anno);
    if (!importo || importo <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(String(req.body.data))) return vai(res, `/dipendenti/note-spese?anno=${anno}`, 'Scrivi data e importo.');
    await q(`INSERT INTO note_spese_pagamenti (dipendente_id, anno, data, importo, note) VALUES ($1,$2,$3,$4,$5)`,
      [Number(req.body.dipendente_id), anno, req.body.data, importo, String(req.body.note ?? '').trim() || null]);
    vai(res, `/dipendenti/note-spese?anno=${anno}`, `Pagamento di ${euro(importo)} registrato.`);
  });
  r.post('/note-spese/pagamenti/:id/elimina', async (req, res) => {
    const p = await q1(`DELETE FROM note_spese_pagamenti WHERE id = $1 RETURNING anno`, [Number(req.params.id)]);
    vai(res, `/dipendenti/note-spese?anno=${p?.anno ?? annoOggi()}`, 'Pagamento eliminato.');
  });

  r.get('/note-spese/:id', async (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return next();
    const x = await leggiNota(Number(req.params.id));
    if (!x) return res.status(404).send('Non trovata');
    const { n, righe } = x;
    const dest = await q(`SELECT nome, km_andata::float AS km FROM rimborsi_destinazioni ORDER BY nome`);
    const t = totaliNotaSpese(righe, n.tariffa);
    const vuote = Math.max(5, 12 - righe.length);
    const primo = `${n.anno}-${String(n.mese).padStart(2, '0')}-01`;
    const riga = (r: any, i: number) => html`<tr>
      <td><input type="date" name="righe[${i}][data]" value="${r?.data_testo ?? ''}" min="${primo}"></td>
      <td><input name="righe[${i}][partenza]" value="${r?.partenza ?? 'SEDE'}" class="maiuscolo" size="10"></td>
      <td><input name="righe[${i}][destinazione]" value="${r?.destinazione ?? ''}" class="maiuscolo destinazione" list="destinazioni"></td>
      <td><input name="righe[${i}][km_andata]" value="${r ? num(r.kmAndata, 1) : ''}" inputmode="decimal" size="5" class="km-andata" title="Vuoto = km dall'elenco delle destinazioni"></td>
      <td><input type="hidden" name="righe[${i}][andata_ritorno]" value="0"><input type="checkbox" name="righe[${i}][andata_ritorno]" value="1" ${!r || r.andataRitorno ? raw('checked') : ''}></td>
      <td><input name="righe[${i}][altre_spese]" value="${r?.altreSpese ? num(r.altreSpese, 2) : ''}" inputmode="decimal" size="7"></td>
      <td><input name="righe[${i}][note]" value="${r?.note ?? ''}"></td>
      <td class="num">${r ? num(kmRiga(r), 0) : ''}</td><td class="num">${r ? euro(rimborsoRiga(r, n.tariffa)) : ''}</td></tr>`;
    res.send(pagina(req, `Nota spese ${n.nome}`, html`
      <div class="intestazione-pagina"><h1>Nota spese · ${n.nome} · ${nomeMeseMaiuscolo(n.mese)} ${n.anno}</h1>
        <div class="barra-azioni"><a class="bottone" href="/dipendenti/note-spese/${n.id}/stampa">Stampa</a> <a href="/dipendenti/note-spese?anno=${n.anno}">← Note spese</a></div></div>
      ${menuDipendenti('note')}
      <div class="cifre">
        <div class="cifra"><span>Auto</span><b>${n.veicolo_testo ?? 'nessuna'}</b><small>${num(n.tariffa, 2)} €/km</small></div>
        <div class="cifra"><span>Km totali</span><b>${num(t.km, 0)}</b><small>rimborso km ${euro(t.rimborsoKm)}</small></div>
        <div class="cifra"><span>Altre spese</span><b>${euro(t.altre)}</b></div>
        <div class="cifra"><span>Totale rimborso</span><b>${euro(t.totale)}</b></div>
      </div>
      <datalist id="destinazioni">${dest.map((d: any) => html`<option value="${d.nome}" data-km="${d.km}">${num(d.km, 0)} km</option>`)}</datalist>
      <form method="post" action="/dipendenti/note-spese/${n.id}">
        <div class="tabella-scorre"><table class="editor">
          <thead><tr><th>Data</th><th>Partenza</th><th>Destinazione</th><th title="Sola andata">Km andata</th><th title="Andata e ritorno: km × 2">A/R</th><th>Altre spese €</th><th>Note</th><th class="num">Km</th><th class="num">Rimborso</th></tr></thead>
          <tbody>${righe.map((r, i) => riga(r, i))}${Array.from({ length: vuote }, (_, i) => riga(null, righe.length + i))}</tbody>
        </table></div>
        <label>Note della nota spese <input name="note" value="${n.note ?? ''}"></label>
        <div class="barra-azioni"><button class="primario">Salva</button></div>
      </form>
      <p class="nota">Lascia vuoti i km: si prendono dall'elenco delle <a href="/dipendenti/note-spese/destinazioni">destinazioni</a> (una destinazione nuova con i km scritti si aggiunge all'elenco).
        Per togliere una riga cancella destinazione, km e spese.</p>
      <form method="post" action="/dipendenti/note-spese/${n.id}/elimina" data-conferma="Eliminare tutta la nota spese di questo mese?"><button class="pericolo">Elimina la nota spese</button></form>
    `, { script: 'dipendenti.js' }));
  });

  r.post('/note-spese/:id', async (req, res) => {
    const id = Number(req.params.id);
    const x = await leggiNota(id);
    if (!x) return res.status(404).send('Non trovata');
    const dest = new Map((await q<{ nome: string; km: number }>(`SELECT nome, km_andata::float AS km FROM rimborsi_destinazioni`)).map(d => [d.nome, d.km]));
    const errori: string[] = [];
    const righe = (Object.values(req.body.righe ?? {}) as Record<string, unknown>[]).map((r, i) => {
      const e = rigaNotaDaModulo(r, nome => dest.get(nome) ?? null);
      if (e.errore) errori.push(`riga ${i + 1}: ${e.errore}`);
      return e.riga;
    }).filter(r => r != null);
    const fuori = righe.filter(r => Number(r.data.slice(0, 4)) !== x.n.anno || Number(r.data.slice(5, 7)) !== x.n.mese);
    if (fuori.length) errori.push(`${fuori.length} righe con la data fuori da ${nomeMeseMaiuscolo(x.n.mese)} ${x.n.anno}`);
    if (errori.length) return vai(res, `/dipendenti/note-spese/${id}`, `Non salvata: ${errori.join('; ')}.`);
    await transazione(async c => {
      await c.query(`DELETE FROM note_spese_righe WHERE nota_id = $1`, [id]);
      for (const r of righe) {
        await c.query(`INSERT INTO note_spese_righe (nota_id, data, partenza, destinazione, km_andata, andata_ritorno, altre_spese, note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [id, r.data, r.partenza, r.destinazione || null, r.kmAndata, r.andataRitorno, r.altreSpese, r.note || null]);
        // destinazione nuova con i km scritti: entra nell'elenco per le prossime volte
        if (r.destinazione && r.kmAndata > 0 && !dest.has(r.destinazione)) {
          await c.query(`INSERT INTO rimborsi_destinazioni (nome, km_andata) VALUES ($1,$2) ON CONFLICT (nome) DO NOTHING`, [r.destinazione, r.kmAndata]);
          dest.set(r.destinazione, r.kmAndata);
        }
      }
      await c.query(`UPDATE note_spese SET note = $2 WHERE id = $1`, [id, String(req.body.note ?? '').trim() || null]);
    });
    vai(res, `/dipendenti/note-spese/${id}`, `Salvata: ${righe.length} righe.`);
  });

  r.post('/note-spese/:id/elimina', async (req, res) => {
    const n = await q1(`DELETE FROM note_spese WHERE id = $1 RETURNING anno`, [Number(req.params.id)]);
    vai(res, `/dipendenti/note-spese?anno=${n?.anno ?? annoOggi()}`, 'Nota spese eliminata.');
  });

  r.get('/note-spese/:id/stampa', async (req, res) => {
    const x = await leggiNota(Number(req.params.id));
    if (!x) return res.status(404).send('Non trovata');
    const { n, righe } = x;
    const t = totaliNotaSpese(righe, n.tariffa);
    res.send(String(html`<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Rimborso km ${n.nome} ${nomeMeseMaiuscolo(n.mese)} ${n.anno}</title>
      <link rel="stylesheet" href="/static/stile.css"></head><body class="stampa-semplice"><main>
      <p class="non-stampa"><button id="stampa" class="primario">Stampa o salva in PDF</button></p>
      <h1>Modulo rimborso chilometrico Casteltech</h1>
      <table class="elenco"><tbody>
        <tr><th>Nome richiedente rimborso</th><td>${n.nome}</td></tr>
        <tr><th>Veicolo</th><td>${n.veicolo_testo ?? '—'}</td></tr>
        <tr><th>Tariffa per chilometro</th><td>${num(n.tariffa, 2)} €/km</td></tr>
        <tr><th>Mese di riferimento</th><td>${nomeMeseMaiuscolo(n.mese)} ${n.anno}</td></tr>
        <tr><th>Totale chilometraggio</th><td>${num(t.km, 0)} km</td></tr>
        <tr><th>Totale rimborso</th><td><b>${euro(t.totale)}</b></td></tr></tbody></table>
      <table class="elenco"><thead><tr><th>Data</th><th>Partenza</th><th>Destinazione</th><th class="num">Altre spese</th><th class="num">Km andata</th><th>Note</th><th class="num">Totale km</th><th class="num">Rimborso</th></tr></thead>
        <tbody>${righe.map((r: any) => html`<tr><td>${data(r.data_testo)}</td><td>${r.partenza}</td><td>${r.destinazione ?? ''}</td><td class="num">${r.altreSpese ? euro(r.altreSpese) : ''}</td>
          <td class="num">${num(r.kmAndata, 0)}</td><td>${r.note ?? ''}${r.andataRitorno ? '' : ' (sola andata)'}</td><td class="num">${num(kmRiga(r), 0)}</td><td class="num">${euro(rimborsoRiga(r, n.tariffa))}</td></tr>`)}</tbody>
        <tfoot><tr><th colspan="6">Totale</th><th class="num">${num(t.km, 0)}</th><th class="num">${euro(t.totale)}</th></tr></tfoot></table>
      <p class="firma">Firma ______________________________</p>
      <script src="/static/stampa.js"></script></main></body></html>`));
  });

  // ───────────────────────────── area riservata: buste paga ─────────────────────────────
  r.get('/riservata', async (req, res) => {
    const u = await utenteCompleto(req);
    const ammesso = !!u && puoAprireRiservata(u, process.env.ADMIN_EMAIL);
    const impostata = await q1(`SELECT 1 FROM impostazioni WHERE chiave = 'paghe_password'`);
    const admin = amministratore(u?.email);
    if (!ammesso) return res.send(pagina(req, 'Buste paga', html`<div class="intestazione-pagina"><h1>🔒 Buste paga</h1></div>${menuDipendenti('riservata')}
      <p class="avviso">Area riservata: cedolini e costi per persona li vede solo chi ha il permesso dell'amministratore. Il costo totale del mese è in
        <a href="/dipendenti">Costo del personale</a>.</p>`));
    if (!impostata) return res.send(pagina(req, 'Buste paga', html`<div class="intestazione-pagina"><h1>🔒 Buste paga</h1></div>${menuDipendenti('riservata')}
      ${admin ? html`<p>Prima volta: scegli la password delle buste paga (almeno 8 caratteri con lettere e numeri). È diversa da quella per entrare nel portale: chi non la conosce non apre i cedolini anche se usa il tuo computer.</p>
        <form method="post" action="/dipendenti/riservata/password" class="blocco"><div class="riga-campi">
          <label>Nuova password <input type="password" name="nuova" required minlength="8" autocomplete="new-password"></label>
          <label>Ripeti <input type="password" name="ripeti" required minlength="8" autocomplete="new-password"></label></div>
          <div class="barra-azioni"><button class="primario">Imposta la password</button></div></form>`
        : html`<p class="avviso">La password delle buste paga non è ancora stata scelta: la imposta l'amministratore del portale.</p>`}`));
    if (!(await riservataAperta(req))) return res.send(pagina(req, 'Buste paga', html`<div class="intestazione-pagina"><h1>🔒 Buste paga</h1></div>${menuDipendenti('riservata')}
      <form method="post" action="/dipendenti/riservata/sblocca" class="scheda-login">
        <p>Scrivi la password delle buste paga. L'area si richiude da sola dopo ${MINUTI_SBLOCCO} minuti senza aprire pagine.</p>
        <label>Password delle buste paga <input type="password" name="password" required autofocus autocomplete="off"></label>
        <button class="primario">Apri</button></form>`));

    const anno = Number(req.query.anno) || annoOggi();
    const [costi, documenti, utenti, anni] = await Promise.all([
      q(`SELECT mese, qualifica, lordo::float, contributi::float, tfr::float, altri::float, netto::float, origine FROM costi_personale WHERE anno = $1 ORDER BY mese, qualifica`, [anno]),
      q(`SELECT id, tipo, anno, mese, nome_file, stato, errore, totale::float AS totale, to_char(scadenza, 'YYYY-MM-DD') AS scadenza, pagato_il, origine FROM paghe_documenti
        WHERE anno = $1 OR (anno IS NULL AND extract(year FROM creato_il) = $1) ORDER BY mese DESC NULLS LAST, tipo`, [anno]),
      admin ? q(`SELECT id, nome, email, paghe FROM utenti WHERE attivo AND ruolo = 'ufficio' ORDER BY nome`) : Promise.resolve([]),
      q<{ anno: number }>(`SELECT DISTINCT anno FROM costi_personale UNION SELECT DISTINCT anno FROM paghe_documenti WHERE anno IS NOT NULL ORDER BY 1 DESC`),
    ]);
    const qualifiche = [...new Set(costi.map((c: any) => c.qualifica))];
    const perMese = Array.from({ length: 12 }, (_, i) => costi.filter((c: any) => c.mese === i + 1));
    const elencoAnni = [...new Set([annoOggi(), ...anni.map(a => a.anno)])].sort((a, b) => b - a);
    res.send(pagina(req, 'Buste paga', html`
      <div class="intestazione-pagina"><h1>🔒 Buste paga · ${anno}</h1>
        <form method="post" action="/dipendenti/riservata/chiudi" class="inline"><button>Chiudi l'area riservata</button></form></div>
      ${menuDipendenti('riservata')}
      <form class="cerca" method="get"><select name="anno">${elencoAnni.map(a => html`<option ${a === anno ? raw('selected') : ''}>${a}</option>`)}</select><button>Mostra</button></form>
      <h2>Costo per qualifica</h2>
      ${costi.length ? html`<div class="tabella-scorre"><table class="elenco">
        <thead><tr><th>Mese</th><th>Qualifica</th><th class="num">Lordo</th><th class="num">Contributi azienda</th><th class="num">TFR</th><th class="num">Altri</th><th class="num">Costo azienda</th><th class="num">Netto in busta</th><th>Da</th></tr></thead>
        <tbody>${perMese.map((righe, i) => righe.map((c: any, j: number) => html`<tr>
          <td>${j === 0 ? nomeMeseMaiuscolo(i + 1) : ''}</td><td>${c.qualifica}</td><td class="num">${euro(c.lordo)}</td><td class="num">${euro(c.contributi)}</td><td class="num">${euro(c.tfr)}</td>
          <td class="num">${euro(c.altri)}</td><td class="num"><b>${euro(costoAzienda(c))}</b></td><td class="num">${c.netto != null ? euro(c.netto) : ''}</td>
          <td><span class="etichetta">${c.origine === 'archivio' ? 'archivio' : c.origine === 'nota_contabile' ? 'nota contabile' : 'a mano'}</span></td></tr>`))}</tbody>
        <tfoot>${qualifiche.map(qq => { const rr = costi.filter((c: any) => c.qualifica === qq); return html`<tr><th></th><th>${qq}</th>
          <th class="num">${euro(rr.reduce((s: number, c: any) => s + c.lordo, 0))}</th><th class="num">${euro(rr.reduce((s: number, c: any) => s + c.contributi, 0))}</th>
          <th class="num">${euro(rr.reduce((s: number, c: any) => s + c.tfr, 0))}</th><th class="num">${euro(rr.reduce((s: number, c: any) => s + c.altri, 0))}</th>
          <th class="num">${euro(rr.reduce((s: number, c: any) => s + costoAzienda(c), 0))}</th><th class="num">${euro(rr.reduce((s: number, c: any) => s + (c.netto ?? 0), 0))}</th><th></th></tr>`; })}</tfoot>
      </table></div>` : html`<p class="vuoto">Nessun costo nel ${anno}.</p>`}
      <h2>Documenti dello studio paghe</h2>
      ${documenti.length ? html`<div class="tabella-scorre"><table class="elenco"><thead><tr><th>Mese</th><th>Documento</th><th>File</th><th>Lettura</th><th></th></tr></thead>
        <tbody>${documenti.map((d: any) => html`<tr><td>${d.mese ? nomeMeseMaiuscolo(d.mese) : ''}</td><td>${TIPI_PAGHE[d.tipo as TipoPaghe]}${d.tipo === 'f24' && d.scadenza ? ` · scadenza ${data(d.scadenza)}` : ''}</td>
          <td><a href="/dipendenti/riservata/documenti/${d.id}" target="_blank">${d.nome_file}</a></td>
          <td>${d.stato === 'errore' ? html`<span class="negativo">${d.errore}</span>` : d.tipo === 'f24' && d.totale != null ? euro(d.totale) : d.stato === 'letto' ? 'letto' : ''}</td>
          <td class="nowrap">${['nota_contabile', 'f24'].includes(d.tipo) ? html`<form method="post" action="/dipendenti/riservata/documenti/${d.id}/rileggi" class="inline"><button class="link">Rileggi</button></form>` : ''}
            ${d.tipo === 'f24' ? html`<form method="post" action="/dipendenti/riservata/documenti/${d.id}/pagato" class="inline"><button class="link">${d.pagato_il ? 'Da pagare' : 'Segna pagato'}</button></form>` : ''}
            <form method="post" action="/dipendenti/riservata/documenti/${d.id}/elimina" class="inline" data-conferma="${`Eliminare ${d.nome_file}?`}"><button class="link negativo">Elimina</button></form></td></tr>`)}</tbody></table></div>`
        : html`<p class="vuoto">Nessun documento nel ${anno}.</p>`}
      <h2>Storico dall'archivio</h2>
      <p class="nota">File costi_personale.json.gz preparato da Claude dalle note contabili della cartella "7_DIPENDENTI E SOCI" (2019–2026). Prima mostra quanti mesi carica, poi chiede conferma.
        I mesi già letti dal portale dalla nota contabile o corretti a mano non si toccano.</p>
      <div class="blocco"><input type="file" id="file-storico" accept=".gz,.json"> <button class="primario" id="avvia-storico">Carica lo storico</button> <span id="esito-storico" class="nota"></span></div>
      ${admin ? html`<h2>Chi può aprire le buste paga</h2>
        <p class="nota">Solo tu (amministratore) e gli utenti dell'ufficio con la spunta; tutti devono scrivere la password delle buste paga.</p>
        <form method="post" action="/dipendenti/riservata/permessi" class="blocco">
          ${(utenti as any[]).filter(x => !amministratore(x.email)).map(x => html`<label class="spunta"><input type="checkbox" name="paghe" value="${x.id}" ${x.paghe ? raw('checked') : ''}> ${x.nome} (${x.email})</label>`)}
          ${(utenti as any[]).filter(x => !amministratore(x.email)).length ? html`<div class="barra-azioni"><button>Salva i permessi</button></div>` : html`<p class="vuoto">Non ci sono altri utenti dell'ufficio.</p>`}</form>
        <h2>Cambia la password delle buste paga</h2>
        <form method="post" action="/dipendenti/riservata/password" class="blocco"><div class="riga-campi">
          <label>Password attuale <input type="password" name="attuale" required autocomplete="off"></label>
          <label>Nuova <input type="password" name="nuova" required minlength="8" autocomplete="new-password"></label>
          <label>Ripeti <input type="password" name="ripeti" required minlength="8" autocomplete="new-password"></label></div>
          <div class="barra-azioni"><button>Cambia</button></div></form>` : ''}
    `, { script: 'dipendenti.js' }));
  });

  // tentativi sbagliati: 5 ogni 15 minuti per utente
  const tentativi = new Map<number, { n: number; fino: number }>();
  r.post('/riservata/sblocca', async (req, res) => {
    const u = await utenteCompleto(req);
    if (!u || !puoAprireRiservata(u, process.env.ADMIN_EMAIL)) return vai(res, '/dipendenti/riservata');
    const t = tentativi.get(u.id);
    if (t && t.n >= 5 && t.fino > Date.now()) return vai(res, '/dipendenti/riservata', 'Troppi tentativi: riprova tra 15 minuti.');
    const p = await q1<{ valore: { hash: string } }>(`SELECT valore FROM impostazioni WHERE chiave = 'paghe_password'`);
    if (!p || !(await bcrypt.compare(String(req.body.password ?? ''), p.valore.hash))) {
      tentativi.set(u.id, { n: (t && t.fino > Date.now() ? t.n : 0) + 1, fino: Date.now() + 15 * 60_000 });
      return vai(res, '/dipendenti/riservata', 'Password delle buste paga non corretta.');
    }
    tentativi.delete(u.id);
    req.session.pagheSbloccate = Date.now();
    res.redirect('/dipendenti/riservata');
  });
  r.post('/riservata/chiudi', (req, res) => { delete req.session.pagheSbloccate; vai(res, '/dipendenti', 'Area riservata chiusa.'); });
  r.post('/riservata/password', async (req, res) => {
    const u = await utenteCompleto(req);
    if (!amministratore(u?.email)) return res.status(403).send('Solo l\'amministratore');
    const p = await q1<{ valore: { hash: string } }>(`SELECT valore FROM impostazioni WHERE chiave = 'paghe_password'`);
    if (p && !(await bcrypt.compare(String(req.body.attuale ?? ''), p.valore.hash))) return vai(res, '/dipendenti/riservata', 'La password attuale non è corretta.');
    const nuova = String(req.body.nuova ?? '');
    const errore = controllaPasswordPaghe(nuova) ?? (nuova !== String(req.body.ripeti ?? '') ? 'le due password non sono uguali' : null);
    if (errore) return vai(res, '/dipendenti/riservata', `Password non cambiata: ${errore}.`);
    await q(`INSERT INTO impostazioni (chiave, valore) VALUES ('paghe_password', $1) ON CONFLICT (chiave) DO UPDATE SET valore = excluded.valore, aggiornato_il = now()`,
      [JSON.stringify({ hash: await bcrypt.hash(nuova, 12) })]);
    req.session.pagheSbloccate = Date.now();
    vai(res, '/dipendenti/riservata', 'Password delle buste paga salvata.');
  });

  // da qui in poi: solo con l'area aperta
  const aperta = async (req: Request, res: Response): Promise<boolean> => {
    if (await riservataAperta(req)) return true;
    if (req.accepts('html')) vai(res, '/dipendenti/riservata', 'Area riservata chiusa: scrivi di nuovo la password delle buste paga.');
    else res.status(403).json({ errore: 'area riservata chiusa: scrivi di nuovo la password' });
    return false;
  };
  r.post('/riservata/permessi', async (req, res) => {
    const u = await utenteCompleto(req);
    if (!amministratore(u?.email) || !(await aperta(req, res))) return res.headersSent ? undefined : res.status(403).send('Solo l\'amministratore');
    const scelti = [req.body.paghe ?? []].flat().map(Number).filter(n => n > 0);
    await q(`UPDATE utenti SET paghe = (id = ANY($1::int[])) WHERE ruolo = 'ufficio'`, [scelti]);
    vai(res, '/dipendenti/riservata', 'Permessi salvati.');
  });
  r.get('/riservata/documenti/:id', async (req, res) => {
    if (!(await aperta(req, res))) return;
    const d = await q1(`SELECT nome_file, contenuto FROM paghe_documenti WHERE id = $1`, [Number(req.params.id)]);
    if (!d?.contenuto) return res.status(404).send('Non trovato');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(d.nome_file)}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(d.contenuto);
  });
  r.post('/riservata/documenti/:id/rileggi', async (req, res) => {
    if (!(await aperta(req, res))) return;
    await leggiDocumentoPaghe(Number(req.params.id));
    const d = await q1(`SELECT anno, stato, errore FROM paghe_documenti WHERE id = $1`, [Number(req.params.id)]);
    vai(res, `/dipendenti/riservata?anno=${d?.anno ?? annoOggi()}`, d?.stato === 'errore' ? `Non letto: ${d.errore}` : 'Riletto.');
  });
  r.post('/riservata/documenti/:id/pagato', async (req, res) => {
    if (!(await aperta(req, res))) return;
    const d = await q1(`UPDATE paghe_documenti SET pagato_il = CASE WHEN pagato_il IS NULL THEN $2::date END WHERE id = $1 AND tipo = 'f24' RETURNING anno`, [Number(req.params.id), oggiRoma()]);
    vai(res, `/dipendenti/riservata?anno=${d?.anno ?? annoOggi()}`, 'F24 aggiornato.');
  });
  r.post('/riservata/documenti/:id/elimina', async (req, res) => {
    if (!(await aperta(req, res))) return;
    const d = await q1(`DELETE FROM paghe_documenti WHERE id = $1 RETURNING anno`, [Number(req.params.id)]);
    vai(res, `/dipendenti/riservata?anno=${d?.anno ?? annoOggi()}`, 'Documento eliminato (i costi già letti restano).');
  });
  r.post('/riservata/storico', express.raw({ type: '*/*', limit: '10mb' }), async (req, res) => {
    if (!(await aperta(req, res))) return;
    let f: unknown;
    try {
      let b = req.body as Buffer;
      if (b[0] === 0x1f && b[1] === 0x8b) b = gunzipSync(b);
      f = JSON.parse(b.toString('utf8'));
    } catch { return res.status(400).json({ errore: 'File non valido: serve costi_personale.json.gz' }); }
    const e = await caricaStoricoCosti(f, { anteprima: req.query.conferma !== '1' });
    const periodo = e.dal && e.al ? `da ${String(e.dal).slice(4)}/${String(e.dal).slice(0, 4)} a ${String(e.al).slice(4)}/${String(e.al).slice(0, 4)}` : '';
    res.json({ anteprima: e.anteprima, messaggio: e.anteprima
      ? `Nel file ${e.mesi} mesi ${periodo}: ne carico ${e.caricati}${e.saltati ? `, ${e.saltati} restano come sono (già letti dalla nota contabile o corretti a mano)` : ''}. Confermi?`
      : `Caricati ${e.caricati} mesi ${periodo}.` });
  });

  return r;
}
