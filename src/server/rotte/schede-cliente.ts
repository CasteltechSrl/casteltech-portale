/**
 * Preventivi → Da documenti (solo ufficio; Adriano 27/10/2026): si carica il pacchetto del cliente (BOM, pick and place, Gerber,
 * forature, CAD, anche zip o cartella intera), il portale lo legge, incrocia i file e mostra i dati per il preventivo, le
 * segnalazioni e il disegno del Gerber. Logica in src/server/schede-cliente-servizio.ts, regole in src/engine/scheda/*.
 */
import express, { Router, type Request } from 'express';
import { q, q1 } from '../db.js';
import { layout } from '../views/layout.js';
import { data, html, num, type Raw } from '../views/html.js';
import { aggiungiFile, analizzaPacchetto, creaPacchetto, creaPreventivoDaPacchetto, fileBom, type FileElenco } from '../schede-cliente-servizio.js';
import { creaAnalisi, avviaElaborazione, leggiFileBom } from '../codifica-servizio.js';
import { CONSUMI, type AnalisiScheda, type Componente, type Segnalazione } from '../../engine/scheda/analisi.js';
import { ETICHETTE_TIPO } from '../../engine/scheda/classifica.js';
import { TITOLI_FOGLIO, type Foglio } from '../../engine/scheda/documentazione.js';
import { decomprimi, type Disegno } from '../schede-cliente-servizio.js';
import { paginaStampa, type Protezioni } from '../views/stampa-scheda-cliente.js';

const ETICHETTE_LIVELLO: Record<Segnalazione['livello'], string> = { errore: 'Da chiarire', avviso: 'Attenzione', info: 'Nota' };
const kb = (b: number) => b >= 1024 * 1024 ? `${num(b / 1024 / 1024, 1)} MB` : `${num(Math.max(1, b / 1024), 0)} KB`;

export function rotteSchedeCliente() {
  const r = Router();
  const pag = (req: Request, titolo: string, contenuto: Raw, avviso?: string) =>
    String(layout({ titolo, utente: req.session.utente, attiva: 'preventivi', largo: true, avviso, script: 'schede-cliente.js', contenuto }));

  // ── elenco e caricamento ──
  r.get('/', async (req, res) => {
    const elenco = await q<any>(`SELECT p.id, p.nome, p.stato, p.creato_il, p.analisi->'conteggi' AS conteggi, p.analisi->'lavorazione' AS lavorazione,
        (SELECT count(*)::int FROM jsonb_array_elements(p.analisi->'segnalazioni') s WHERE s->>'livello' = 'errore') AS errori,
        c.ragione_sociale AS cliente, u.nome AS utente
      FROM pacchetti_scheda p LEFT JOIN clienti c ON c.id = p.cliente_id LEFT JOIN utenti u ON u.id = p.creato_da
      ORDER BY p.creato_il DESC LIMIT 200`);
    const clienti = await q<{ id: number; ragione_sociale: string }>(`SELECT id, ragione_sociale FROM clienti ORDER BY ragione_sociale`);
    res.send(pag(req, 'Documenti del cliente', html`
      <div class="intestazione-pagina"><h1>Documenti del cliente</h1><a href="/preventivi">← Preventivi</a></div>
      <section class="blocco stretto-form" id="carica-pacchetto">
        <h2>Carica i documenti di una scheda</h2>
        <p class="nota">Un caricamento per scheda: BOM (Excel o CSV), pick and place (txt, csv), Gerber, forature, file CAD (GenCAD), anche in uno zip
          o scegliendo la cartella intera. Il portale riconosce i file da solo, li incrocia e segnala quello che non torna.
          I file originali restano sul Drive: nel portale si tengono solo quelli che servono a rileggere il pacchetto.
          Le cartelle chiamate OLD, VECCHI, ARCHIVIO o BACKUP si ignorano.</p>
        <label>Cliente <small class="unita">facoltativo, dall'anagrafica</small>
          <select id="cliente-pacchetto"><option value="">—</option>${clienti.map(c => html`<option value="${c.id}">${c.ragione_sociale}</option>`)}</select></label>
        <label>Nome <input id="nome-pacchetto" placeholder="es. codice della scheda e revisione; vuoto = nome della cartella o del primo file"></label>
        <label>File <input type="file" id="file-pacchetto" multiple></label>
        <label>oppure una cartella intera <input type="file" id="cartella-pacchetto" webkitdirectory></label>
        <button class="primario" id="invia-pacchetto">Carica e analizza</button>
        <output id="esito-pacchetto" class="nota"></output>
      </section>
      <h2>Pacchetti caricati</h2>
      ${elenco.length ? html`<div class="tabella-scorre"><table><thead><tr><th>Nome</th><th>Cliente</th><th>Caricato</th><th>Lati SMD</th>
        <th class="n">SMD TOP</th><th class="n">SMD BOT</th><th class="n">THT</th><th>Saldatura THT</th><th class="n">Da chiarire</th><th></th></tr></thead><tbody>
        ${elenco.map(p => html`<tr>
          <td><a href="/preventivi/documenti/${p.id}">${p.nome}</a></td><td>${p.cliente ?? ''}</td><td>${data(p.creato_il)}${p.utente ? html` <small class="nota">${p.utente}</small>` : ''}</td>
          ${p.stato === 'analizzato' ? html`<td>${testoLati(p.lavorazione)}</td><td class="n">${p.conteggi?.smdTop}</td><td class="n">${p.conteggi?.smdBot}</td><td class="n">${p.conteggi?.tht}</td>
            <td>${p.lavorazione?.saldaturaTht ?? ''}</td><td class="n">${p.errori ? html`<span class="livello critico">${p.errori}</span>` : ''}</td>`
          : html`<td colspan="6" class="nota">caricamento non finito</td>`}
          <td><form method="post" action="/preventivi/documenti/${p.id}/elimina" class="inline" data-conferma="Eliminare questo pacchetto e la sua analisi? I file originali sul Drive non cambiano."><button class="link negativo">Elimina</button></form></td></tr>`)}
        </tbody></table></div>` : html`<p class="vuoto">Nessun pacchetto caricato.</p>`}`, req.query.errore ? String(req.query.errore) : undefined));
  });

  r.post('/nuovo', async (req, res) => {
    const nome = String(req.body?.nome ?? '').trim().slice(0, 200);
    if (!nome) return res.status(400).json({ errore: 'Manca il nome.' });
    const clienteId = /^\d+$/.test(String(req.body?.cliente ?? '')) ? Number(req.body.cliente) : null;
    if (clienteId && !await q1(`SELECT 1 FROM clienti WHERE id = $1`, [clienteId])) return res.status(400).json({ errore: 'Cliente non trovato in anagrafica.' });
    res.json({ id: await creaPacchetto({ nome, clienteId, utenteId: req.session.utente!.id }) });
  });

  r.post('/:id/file', express.raw({ type: 'application/octet-stream', limit: '60mb' }), async (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return next();
    const nome = String(req.query.nome ?? '').replace(/\\/g, '/').replace(/^\/+/, '').slice(0, 400);
    if (!nome || !Buffer.isBuffer(req.body)) return res.status(400).json({ errore: 'File mancante.' });
    if (!await q1(`SELECT 1 FROM pacchetti_scheda WHERE id = $1`, [req.params.id])) return res.status(404).json({ errore: 'Pacchetto non trovato.' });
    await aggiungiFile(Number(req.params.id), nome, req.body);
    res.json({ ok: true });
  });

  r.post('/:id/analizza', async (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return next();
    try {
      await analizzaPacchetto(Number(req.params.id));
      if (req.is('application/json')) return res.json({ ok: true });
      res.redirect(`/preventivi/documenti/${req.params.id}`);
    } catch (e: any) {
      if (req.is('application/json')) return res.status(500).json({ errore: `Analisi non riuscita: ${e.message}` });
      res.redirect(`/preventivi/documenti?errore=${encodeURIComponent(`Analisi non riuscita: ${e.message}`)}`);
    }
  });

  // ── risultato ──
  r.get('/:id', async (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return next();
    const p = await q1<any>(`SELECT p.*, c.ragione_sociale AS cliente, b.nome AS bom_nome, v.numero AS preventivo_numero, v.stato AS preventivo_stato
      FROM pacchetti_scheda p LEFT JOIN clienti c ON c.id = p.cliente_id LEFT JOIN bom_analisi b ON b.id = p.bom_id
      LEFT JOIN preventivi v ON v.id = p.preventivo_id WHERE p.id = $1`, [req.params.id]);
    if (!p) return next();
    const a: AnalisiScheda | null = p.analisi;
    const file: FileElenco[] = p.file_elenco ?? [];
    if (!a) return res.send(pag(req, p.nome, html`
      <div class="intestazione-pagina"><h1>${p.nome}</h1><a href="/preventivi/documenti">← Documenti del cliente</a></div>
      <p class="vuoto">Il caricamento non è finito.</p>
      <form method="post" action="/preventivi/documenti/${p.id}/analizza"><button class="primario">Analizza i file caricati</button></form>`));
    const c = a.conteggi, l = a.lavorazione;
    const perLivello = (lv: Segnalazione['livello']) => a.segnalazioni.filter(s => s.livello === lv);
    res.send(pag(req, p.nome, html`
      <div class="intestazione-pagina">
        <h1>${p.nome}${p.cliente ? html` <small class="nota">${p.cliente}</small>` : ''}</h1>
        <div>
          <form method="post" action="/preventivi/documenti/${p.id}/analizza" class="inline"><button title="Rilegge i file conservati (dopo un aggiornamento del portale)">Rianalizza</button></form>
          ${p.fonti?.bom ? (p.bom_id
            ? html`<a class="bottone" href="/componenti/bom/${p.bom_id}">Codifica della BOM ↗</a>`
            : html`<form method="post" action="/preventivi/documenti/${p.id}/codifica" class="inline"><button title="Manda la BOM alla sezione Componenti: codici Casteltech, prezzi e reperibilità">Codifica la BOM</button></form>`) : ''}
          <a href="/preventivi/documenti">← Documenti del cliente</a>
        </div>
      </div>
      <div class="griglia-scheda-cliente">
        <section class="blocco">
          <h2>Per il preventivo</h2>
          ${p.preventivo_id
            ? html`<p class="avviso info">Preventivo <a href="/preventivi/${p.preventivo_id}">${p.preventivo_numero}</a> <span class="stato ${p.preventivo_stato}">${p.preventivo_stato.replace('_', ' ')}</span></p>`
            : html`<form method="post" action="/preventivi/documenti/${p.id}/preventivo" class="crea-preventivo">
                <label>Schede da quotare <input name="schede" inputmode="numeric" value="100" required></label>
                <button class="primario" title="Preventivo con i numeri qui sotto, da controllare e salvare">Crea il preventivo da validare</button></form>`}
          <table class="dati-scheda"><tbody>
            <tr><th>Lati SMD</th><td>${testoLati(l)}</td></tr>
            <tr><th>SMD</th><td>TOP ${c.smdTop} · BOT ${c.smdBot}</td></tr>
            <tr><th>Feeder (codici SMD diversi)</th><td>TOP ${c.feederTop} · BOT ${c.feederBot}</td></tr>
            <tr><th>THT</th><td>${c.tht} componenti, ${c.codiciTht} codici${l.latoCorpiTht ? html` · corpi lato ${l.latoCorpiTht}` : ''}</td></tr>
            <tr><th>Saldatura THT</th><td>${l.saldaturaTht ? html`<b>${l.saldaturaTht === 'onda' ? 'a onda' : 'a mano'}</b> · ` : ''}${l.motivo}</td></tr>
            <tr><th>Refori</th><td>${c.refori ?? '—'}${c.reforiDa ? html` <small class="nota">(da ${c.reforiDa === 'CAD' ? 'file CAD' : 'file di foratura'})</small>` : ''}${c.vias != null ? html` · vias ${c.vias}` : ''}${c.foriNonMetallizzati ? html` · non metallizzati ${c.foriNonMetallizzati}` : ''}</td></tr>
            <tr><th>Codici (item)</th><td>${c.item}${c.nonMontati ? html` · ${c.nonMontati} non montati` : ''}</td></tr>
            <tr><th>Fiducial</th><td>TOP ${c.fiducialTop} · BOT ${c.fiducialBot}</td></tr>
            ${a.piazzole ? html`<tr><th>Piazzole / case</th><td>${a.piazzole.misurati} componenti chip controllati su ${a.piazzole.controllati}${a.piazzole.diversi ? html` · <b class="negativo">${a.piazzole.diversi} con piazzole di un altro case</b>` : ' · tutto a posto'}</td></tr>` : ''}
            <tr><th>Misure scheda</th><td>${a.dimensioni ? html`${num(a.dimensioni.larghezza, 1)} × ${num(a.dimensioni.altezza, 1)} mm${a.dimensioni.stima ? html` <small class="nota">(stima dal rame: manca il contorno)</small>` : ''}` : '—'}</td></tr>
          </tbody></table>
          <h3>Consumi a scheda <small class="nota">(indicativi)</small></h3>
          <table class="dati-scheda"><tbody>
            <tr><th>Pasta saldante</th><td>${num(a.consumi.pastaGrammi, 2)} g <small class="nota">${num(CONSUMI.pastaGrammi, 1)} g ogni ${CONSUMI.pastaOgniComponenti} componenti</small></td></tr>
            ${a.consumi.stagnoOndaGrammi ? html`<tr><th>Stagno saldatrice</th><td>${num(a.consumi.stagnoOndaGrammi, 2)} g <small class="nota">${num(CONSUMI.ondaGrammiForo, 3)} g a foro + ${CONSUMI.ondaScorie * 100}% scorie</small></td></tr>` : ''}
            ${a.consumi.filoGrammi ? html`<tr><th>Filo di stagno</th><td>${num(a.consumi.filoGrammi, 2)} g <small class="nota">${num(CONSUMI.filoGrammiPiedino, 3)} g a piedino</small></td></tr>` : ''}
          </tbody></table>
          ${a.noteCliente.length ? html`<h3>Note del cliente</h3><ul class="note-cliente">${a.noteCliente.map(n => html`<li><b>${n.refs.join(', ')}</b>: ${n.nota}</li>`)}</ul>` : ''}
        </section>
        <section class="blocco">
          <h2>Da controllare</h2>
          ${a.segnalazioni.length ? html`<ul class="segnalazioni">${(['errore', 'avviso', 'info'] as const).flatMap(lv => perLivello(lv).map(s => html`
            <li class="${lv}"><span class="livello-segn">${ETICHETTE_LIVELLO[lv]}</span> ${s.testo}${s.refs?.length ? html` <span class="refs">${s.refs.map(x => html`<button type="button" class="link rif" data-ref="${x}">${x}</button> `)}</span>` : ''}</li>`))}</ul>`
          : html`<p class="nota">Nessuna incongruenza trovata.</p>`}
        </section>
      </div>

      <section class="blocco stampe-produzione">
        <h2>Documentazione per la produzione</h2>
        <p class="nota">Fogli A4 orizzontali con il disegno del lato, i riferimenti e la BOM di montaggio; in rosso i componenti con note del cliente o segnalazioni.</p>
        <div class="bottoni">${(['TOP', 'BOT', 'THT', 'protezioni'] as Foglio[])
          .filter(f => f === 'TOP' ? c.smdTop > 0 : f === 'BOT' ? c.smdBot > 0 : f === 'THT' ? c.tht > 0 : l.saldaturaTht === 'onda')
          .map(f => html`<a class="bottone" href="/preventivi/documenti/${p.id}/stampa?foglio=${f}" target="_blank" rel="noopener">${TITOLI_FOGLIO[f]}</a>`)}</div>
        ${l.saldaturaTht === 'onda' ? html`<p class="nota">Protezioni per l'onda: ${(p.protezioni?.fori?.length ?? 0)} fori e ${(p.protezioni?.zone?.length ?? 0)} zone segnate. Si segnano qui sotto con «Segna le protezioni».</p>` : ''}
      </section>

      <h2>Disegno della scheda</h2>
      <div class="visore" id="visore" data-id="${p.id}" data-lato-saldature="${l.latoCorpiTht === 'BOT' ? 'TOP' : 'BOT'}">
        <div class="visore-comandi">
          <span class="gruppo"><button type="button" data-vista="TOP" class="attivo">Lato TOP</button><button type="button" data-vista="BOT" title="Vista da sotto (specchiata)">Lato BOT</button></span>
          <span class="gruppo"><label class="spunta piccola"><input type="checkbox" id="mostra-componenti" checked> componenti</label>
            <label class="spunta piccola"><input type="checkbox" id="mostra-fori" checked> fori</label></span>
          ${l.saldaturaTht === 'onda' ? html`<span class="gruppo"><button type="button" id="modo-protezioni" title="Clic su un foro per proteggerlo, trascina per segnare una zona; clic su una zona per toglierla">Segna le protezioni</button>
            <button type="button" id="salva-protezioni" hidden class="primario">Salva protezioni</button></span>` : ''}
          <span class="gruppo"><button type="button" id="zoom-piu">+</button><button type="button" id="zoom-meno">−</button><button type="button" id="zoom-tutto">Adatta</button></span>
          <span id="strati" class="strati"></span>
        </div>
        <div class="visore-area" id="visore-area"><p class="nota">Caricamento del disegno…</p></div>
        <p class="nota" id="visore-info">Rotellina per ingrandire, trascina per spostare. Clic su un componente per vederlo nella tabella.</p>
      </div>

      <h2>Componenti <small class="nota">${a.componenti.length}</small></h2>
      <div class="filtri-componenti" id="filtri-componenti">
        <button type="button" data-filtro="" class="attivo">Tutti</button><button type="button" data-filtro="segnalato">Con segnalazioni</button>
        <button type="button" data-filtro="SMD-TOP">SMD TOP</button><button type="button" data-filtro="SMD-BOT">SMD BOT</button><button type="button" data-filtro="THT">THT</button>
        <input type="search" id="cerca-componente" placeholder="Cerca riferimento, valore, codice…">
      </div>
      <div class="tabella-scorre limitata"><table class="componenti-scheda" id="tabella-componenti"><thead><tr>
        <th>Rif.</th><th>Lato</th><th>Tipo</th><th>Valore BOM</th><th>Codice del cliente</th><th>Pick and place</th><th class="n">X</th><th class="n">Y</th><th class="n">Rot.</th><th>Segnalazioni</th></tr></thead><tbody>
        ${a.componenti.map(k => rigaComponente(k))}
      </tbody></table></div>

      <h2>File del pacchetto <small class="nota">${file.length}</small></h2>
      <div class="tabella-scorre limitata"><table><thead><tr><th>File</th><th>Tipo</th><th class="n">Dimensione</th><th>Usato</th><th>Note</th></tr></thead><tbody>
        ${file.map(f => html`<tr class="${f.usato ? '' : 'non-usato'}"><td class="taglia">${f.nome}</td><td>${ETICHETTE_TIPO[f.tipo] ?? f.tipo}</td><td class="n">${kb(f.byte)}</td>
          <td>${f.usato ? '✓' : ''}</td><td class="nota-file">${f.nota ?? ''}</td></tr>`)}
      </tbody></table></div>
      <p class="nota">Analizzato il ${data(p.analizzato_il)}. Il codice Casteltech dei componenti senza codice del cliente si ottiene con «Codifica la BOM»
        (sezione Componenti). Il preventivo compilato in automatico e le rotazioni per le macchine arriveranno nei prossimi passi.</p>`));
  });

  // disegno: JSON compresso così com'è salvato (gli strati Gerber in SVG e i fori), più le posizioni dei componenti
  r.get('/:id/disegno', async (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return next();
    const p = await q1<{ disegno: Buffer | null }>(`SELECT disegno FROM pacchetti_scheda WHERE id = $1`, [req.params.id]);
    if (!p?.disegno) return res.status(404).json({ errore: 'Disegno non disponibile.' });
    res.set({ 'Content-Type': 'application/json; charset=utf-8', 'Content-Encoding': 'gzip', 'Cache-Control': 'private, max-age=60' }).send(p.disegno);
  });
  r.get('/:id/componenti', async (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return next();
    const p = await q1<{ analisi: AnalisiScheda | null }>(`SELECT analisi FROM pacchetti_scheda WHERE id = $1`, [req.params.id]);
    res.json((p?.analisi?.componenti ?? []).filter(k => k.pp).map(k => ({ ref: k.ref, lato: k.lato, tipo: k.tipo, x: k.pp!.x, y: k.pp!.y, rot: k.pp!.rot, segnalato: k.segnalazioni.length > 0 })));
  });

  r.post('/:id/preventivo', async (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return next();
    const schede = Math.round(Number(String(req.body.schede ?? '').replace(',', '.')));
    if (!(schede > 0)) return res.redirect(`/preventivi/documenti/${req.params.id}`);
    const esistente = await q1<{ preventivo_id: number | null }>(`SELECT preventivo_id FROM pacchetti_scheda WHERE id = $1`, [req.params.id]);
    if (esistente?.preventivo_id) return res.redirect(`/preventivi/${esistente.preventivo_id}`);
    try { res.redirect(`/preventivi/${await creaPreventivoDaPacchetto(Number(req.params.id), schede, req.session.utente!.id)}`); }
    catch (e: any) { res.redirect(`/preventivi/documenti?errore=${encodeURIComponent(e.message)}`); }
  });

  // ── documentazione di produzione (stampa) ──
  r.get('/:id/stampa', async (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return next();
    const p = await q1<any>(`SELECT p.id, p.nome, p.analisi, p.disegno, p.protezioni, c.ragione_sociale AS cliente FROM pacchetti_scheda p
      LEFT JOIN clienti c ON c.id = p.cliente_id WHERE p.id = $1`, [req.params.id]);
    if (!p?.analisi) return next();
    const foglio = (['TOP', 'BOT', 'THT', 'protezioni'].includes(String(req.query.foglio)) ? String(req.query.foglio) : 'TOP') as Foglio;
    const d = decomprimi<Disegno>(p.disegno) ?? { strati: [], riquadro: null, forature: [] };
    res.send(paginaStampa({ id: p.id, nome: p.nome, cliente: p.cliente }, p.analisi, d, foglio, p.protezioni ?? null));
  });

  // ── zone da proteggere per l'onda: fori e aree segnate sul disegno ──
  r.get('/:id/protezioni', async (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return next();
    const p = await q1<{ protezioni: Protezioni | null }>(`SELECT protezioni FROM pacchetti_scheda WHERE id = $1`, [req.params.id]);
    res.json(p?.protezioni ?? { fori: [], zone: [] });
  });
  r.post('/:id/protezioni', async (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return next();
    const n = (x: unknown) => { const v = Number(x); return Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null; };
    const fori = (Array.isArray(req.body?.fori) ? req.body.fori : []).slice(0, 2000)
      .map((f: any) => ({ x: n(f?.x), y: n(f?.y), d: n(f?.d) })).filter((f: any) => f.x != null && f.y != null && f.d != null);
    const zone = (Array.isArray(req.body?.zone) ? req.body.zone : []).slice(0, 200)
      .map((z: any) => ({ x0: n(z?.x0), y0: n(z?.y0), x1: n(z?.x1), y1: n(z?.y1) }))
      .filter((z: any) => [z.x0, z.y0, z.x1, z.y1].every(v => v != null) && z.x1 > z.x0 && z.y1 > z.y0);
    await q(`UPDATE pacchetti_scheda SET protezioni = $2 WHERE id = $1`, [req.params.id, JSON.stringify({ fori, zone })]);
    res.json({ ok: true, fori: fori.length, zone: zone.length });
  });

  // BOM → sezione Componenti (codifica Casteltech, prezzi, reperibilità)
  r.post('/:id/codifica', async (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return next();
    const p = await q1<{ nome: string; bom_id: number | null }>(`SELECT nome, bom_id FROM pacchetti_scheda WHERE id = $1`, [req.params.id]);
    if (!p) return next();
    if (p.bom_id) return res.redirect(`/componenti/bom/${p.bom_id}`);
    const f = await fileBom(Number(req.params.id));
    if (!f) return res.redirect(`/preventivi/documenti/${req.params.id}`);
    const nomeFile = f.nome.split('/').pop()!;
    const righe = await leggiFileBom(nomeFile, f.dati);
    const bomId = await creaAnalisi({ nome: p.nome, fileNome: nomeFile, righe, quantita: [100], utenteId: req.session.utente!.id });
    await q(`UPDATE pacchetti_scheda SET bom_id = $2 WHERE id = $1`, [req.params.id, bomId]);
    avviaElaborazione(bomId);
    res.redirect(`/componenti/bom/${bomId}`);
  });

  r.post('/:id/elimina', async (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return next();
    await q(`DELETE FROM pacchetti_scheda WHERE id = $1`, [req.params.id]);
    res.redirect('/preventivi/documenti');
  });

  return r;
}

function testoLati(l: AnalisiScheda['lavorazione'] | null | undefined): string {
  if (!l) return '';
  if (l.latiSmd === 2) return 'TOP + BOT';
  if (l.latiSmd === 1) return l.latoSmdUnico === 'BOT' ? 'lato unico (SMD sul BOT del cliente)' : 'solo TOP';
  return 'nessun SMD';
}

function rigaComponente(k: Componente): Raw {
  const classi = [k.tipo === 'THT' ? 'THT' : `SMD-${k.lato ?? 'TOP'}`, k.segnalazioni.length ? 'segnalato' : '', k.montato ? '' : 'non-montato'].filter(Boolean).join(' ');
  const cerca = [k.ref, k.bom?.valore, k.codiceCliente, k.pp?.valore, k.pp?.footprint, k.bom?.descrizione].filter(Boolean).join(' ');
  return html`<tr data-ref="${k.ref}" data-classi="${classi}" data-cerca="${cerca}" class="${classi}">
    <td><b>${k.ref}</b></td><td>${k.lato ?? ''}</td><td title="da ${k.tipoDa}">${k.tipo}${k.montato ? '' : ' · non montare'}${k.piediniTht ? html` <small class="nota">${k.piediniTht} pin</small>` : ''}</td>
    <td>${k.bom?.valore ?? ''}${k.bom?.descrizione ? html`<br><small class="nota">${k.bom.descrizione}</small>` : ''}</td>
    <td class="codice">${k.codiceCliente}</td>
    <td>${k.pp ? html`${k.pp.valore}${k.pp.footprint ? html`<br><small class="nota">${k.pp.footprint}</small>` : ''}` : ''}</td>
    <td class="n">${k.pp ? num(k.pp.x, 2) : ''}</td><td class="n">${k.pp ? num(k.pp.y, 2) : ''}</td><td class="n">${k.pp ? num(k.pp.rot, 1) : ''}</td>
    <td class="segn">${k.segnalazioni.join(' · ')}</td></tr>`;
}
