/**
 * Preventivi → Da documenti (solo ufficio; Adriano 27/10/2026): si carica il pacchetto del cliente (BOM, pick and place, Gerber,
 * forature, CAD, anche zip o cartella intera), il portale lo legge, incrocia i file e mostra i dati per il preventivo, le
 * segnalazioni e il disegno del Gerber. Logica in src/server/schede-cliente-servizio.ts, regole in src/engine/scheda/*.
 */
import express, { Router, type Request } from 'express';
import { q, q1 } from '../db.js';
import { layout } from '../views/layout.js';
import { data, html, num, type Raw } from '../views/html.js';
import { aggiungiFile, analizzaPacchetto, bomDelPacchetto, creaPacchetto, creaPreventivoDaPacchetto, dividiPerVersioni, scegliFileDaCaricare, sincronizzaVersioni, type FileElenco } from '../schede-cliente-servizio.js';
import { richiesteDaEmail, versioniDaDividere } from '../../engine/scheda/versioni.js';
import { creaAnalisi, avviaElaborazione, leggiFileBom } from '../codifica-servizio.js';
import { caricamentoLimitato } from '../memoria.js';
import { CONSUMI, type AnalisiScheda, type Componente, type Segnalazione } from '../../engine/scheda/analisi.js';
import { ETICHETTE_TIPO } from '../../engine/scheda/classifica.js';
import { TITOLI_FOGLIO, type Foglio } from '../../engine/scheda/documentazione.js';
import { decomprimi, type Disegno } from '../schede-cliente-servizio.js';
import { paginaStampa, type Protezioni } from '../views/stampa-scheda-cliente.js';
import { chiaveSegnalazione, conAccettate } from '../../engine/scheda/accettate.js';

const ETICHETTE_LIVELLO: Record<Segnalazione['livello'], string> = { errore: 'Da chiarire', avviso: 'Attenzione', info: 'Nota' };
/** Email della richiesta del cliente (pacchetto mandato dal pulsante di Gmail): mittente, oggetto e testo da leggere. */
const riquadroEmail = (e: { mittente: string; oggetto: string; data?: string; testo: string } | null) => e ? html`
  <details class="blocco email-richiesta" open><summary><b>Email del cliente</b> · ${e.mittente}${e.data ? ` · ${e.data}` : ''} · «${e.oggetto}»</summary>
    <pre class="testo-email">${e.testo || '(senza testo)'}</pre></details>` : '';
const kb = (b: number) => b >= 1024 * 1024 ? `${num(b / 1024 / 1024, 1)} MB` : `${num(Math.max(1, b / 1024), 0)} KB`;

export function rotteSchedeCliente() {
  const r = Router();
  const pag = (req: Request, titolo: string, contenuto: Raw, avviso?: string) =>
    String(layout({ titolo, utente: req.session.utente, attiva: 'preventivi', largo: true, avviso, script: 'schede-cliente.js', contenuto }));

  // ── elenco e caricamento ──
  r.get('/', async (req, res) => {
    const elenco = await q<any>(`SELECT p.id, p.nome, p.stato, p.creato_il, p.analisi->'conteggi' AS conteggi, p.analisi->'lavorazione' AS lavorazione,
        (SELECT count(*)::int FROM jsonb_array_elements(p.analisi->'segnalazioni') s WHERE s->>'livello' = 'errore' AND NOT p.accettate ? (s->>'livello' || '|' || (s->>'testo'))) AS errori,
        c.ragione_sociale AS cliente, u.nome AS utente, p.email IS NOT NULL AS da_gmail
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
          Scegliendo una cartella il portale guarda prima nomi e dimensioni e carica solo i file utili: PDF, modelli 3D (STEP), immagini,
          ODB++ e file oltre 25 MB restano sul Drive e compaiono solo nell'elenco. Le cartelle chiamate OLD, VECCHI, ARCHIVIO o BACKUP si ignorano.</p>
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
          : html`<td colspan="6" class="nota">${p.stato === 'in_analisi' ? 'analisi in corso' : 'caricamento non finito'}${p.da_gmail ? ' · da Gmail' : ''}</td>`}
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

  // cartella: prima nomi e dimensioni, il portale risponde con i soli file da mandare (gli altri restano sul Drive, solo il nome)
  r.post('/:id/scelta', async (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return next();
    const file = (Array.isArray(req.body?.file) ? req.body.file : []).slice(0, 5000)
      .map((f: any) => ({ nome: String(f?.nome ?? '').replace(/\\/g, '/').replace(/^\/+/, '').slice(0, 400), byte: Math.max(0, Number(f?.byte) || 0) }))
      .filter((f: { nome: string }) => f.nome);
    if (!await q1(`SELECT 1 FROM pacchetti_scheda WHERE id = $1`, [req.params.id])) return res.status(404).json({ errore: 'Pacchetto non trovato.' });
    res.json(await scegliFileDaCaricare(Number(req.params.id), file));
  });

  // caricamentoLimitato: il file si legge solo quando c'è memoria libera (i 4 invii del browser si mettono in fila)
  r.post('/:id/file', caricamentoLimitato, express.raw({ type: 'application/octet-stream', limit: '60mb' }), async (req, res, next) => {
    const id = String(req.params.id);
    if (!/^\d+$/.test(id)) return next();
    const nome = String(req.query.nome ?? '').replace(/\\/g, '/').replace(/^\/+/, '').slice(0, 400);
    if (!nome || !Buffer.isBuffer(req.body)) return res.status(400).json({ errore: 'File mancante.' });
    if (!await q1(`SELECT 1 FROM pacchetti_scheda WHERE id = $1`, [id])) return res.status(404).json({ errore: 'Pacchetto non trovato.' });
    await aggiungiFile(Number(id), nome, req.body);
    res.json({ ok: true });
  });

  r.post('/:id/analizza', async (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return next();
    try {
      await analizzaPacchetto(Number(req.params.id));
      await sincronizzaVersioni(Number(req.params.id));   // file aggiunti dopo la divisione per versione
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
    const a: AnalisiScheda | null = p.analisi ? conAccettate(p.analisi, p.accettate) : null;
    const file: FileElenco[] = p.file_elenco ?? [];
    const versioni = await q<any>(`SELECT f.id, f.nome, f.versione, f.quantita, f.stato, v.id AS preventivo_id, v.numero AS preventivo_numero, v.stato AS preventivo_stato
      FROM pacchetti_scheda f LEFT JOIN preventivi v ON v.id = f.preventivo_id WHERE f.padre_id = $1 ORDER BY f.id`, [p.id]);
    const padre = p.padre_id ? await q1<{ id: number; nome: string }>(`SELECT id, nome FROM pacchetti_scheda WHERE id = $1`, [p.padre_id]) : null;
    const richieste = richiesteDaEmail(p.email);
    const daDividere = versioni.length || padre ? [] : versioniDaDividere(richieste);
    const schedeProposte = p.quantita ?? (richieste.length === 1 ? richieste[0].quantita : 100);
    const riquadroVersioni = html`
      ${padre ? html`<p class="avviso info">Versione <b>${p.versione}</b> di <a href="/preventivi/documenti/${padre.id}">${padre.nome}</a>: file comuni più quelli con «${p.versione}» nel nome.${p.quantita ? ` Richieste ${p.quantita} schede.` : ''}</p>` : ''}
      ${richieste.length && !padre ? html`<p class="nota">Richiesta del cliente: ${richieste.map(x => `${x.quantita} pz ${x.descrizione}`).join(' · ')}</p>` : ''}
      ${daDividere.length ? html`<form method="post" action="/preventivi/documenti/${p.id}/dividi" class="inline"
          data-conferma="Creare un pacchetto per ogni versione (${daDividere.map(v => v.versione).join(', ')})? I file comuni vanno in tutti, quelli con il nome della versione solo nella sua.">
          <button class="primario" title="Un pacchetto e un preventivo per ogni versione, con la sua quantità">Dividi per versione: ${daDividere.map(v => `${v.versione} ${v.quantita} pz`).join(' · ')}</button></form>` : ''}
      ${versioni.length ? html`<table class="dati-scheda"><tbody>${versioni.map(v => html`<tr><th><a href="/preventivi/documenti/${v.id}">${v.versione}</a></th>
          <td>${v.quantita ? `${v.quantita} pz` : ''}${v.preventivo_id ? html` · preventivo <a href="/preventivi/${v.preventivo_id}">${v.preventivo_numero}</a> <span class="stato ${v.preventivo_stato}">${String(v.preventivo_stato).replace('_', ' ')}</span>`
            : html` · <a href="/preventivi/documenti/${v.id}">crea il preventivo</a>`}</td></tr>`)}</tbody></table>
          <p class="nota">I file aggiunti qui vanno anche nelle versioni (quelli con il nome di una versione solo nella sua).</p>` : ''}`;
    const aggiungiFileForm = html`
      <details class="blocco"><summary>Aggiungi file a questo pacchetto</summary>
        <div class="stretto-form">
          <p class="nota">Per i file arrivati dopo (es. BOM e pick and place in formato testo): si aggiungono a quelli già caricati e il pacchetto si rianalizza.</p>
          <label>File <input type="file" id="file-aggiunti" multiple></label>
          <button class="primario" id="aggiungi-file" data-id="${p.id}">Aggiungi e rianalizza</button>
          <output id="esito-aggiunti" class="nota"></output>
        </div></details>`;
    if (!a) return res.send(pag(req, p.nome, html`
      <div class="intestazione-pagina"><h1>${p.nome}${p.cliente ? html` <small class="nota">${p.cliente}</small>` : ''}</h1><a href="/preventivi/documenti">← Documenti del cliente</a></div>
      ${p.errore ? html`<p class="avviso">${p.errore}</p>` : ''}
      ${p.stato === 'in_analisi'
        ? html`<p class="avviso info">Analisi in corso: ricarica la pagina tra qualche secondo. Se dopo un paio di minuti è ancora così, premi «Analizza di nuovo».</p>`
        : html`<p class="vuoto">${p.email ? 'Dalla mail non è ancora arrivato nessun documento analizzato.' : 'Il caricamento non è finito.'}</p>`}
      <form method="post" action="/preventivi/documenti/${p.id}/analizza"><button class="${p.stato === 'in_analisi' ? '' : 'primario'}">${p.stato === 'in_analisi' ? 'Analizza di nuovo' : 'Analizza i file caricati'}</button></form>
      ${riquadroEmail(p.email)}
      ${riquadroVersioni}
      ${aggiungiFileForm}
      ${file.length ? html`<h2>File</h2><ul>${file.map(f => html`<li>${f.nome} <small class="nota">${kb(f.byte)}${f.nota ? ` · ${f.nota}` : ''}</small></li>`)}</ul>` : ''}`, req.query.errore ? String(req.query.errore) : undefined));
    const c = a.conteggi, l = a.lavorazione;
    const perLivello = (lv: Segnalazione['livello']) => [...a.segnalazioni.filter(s => s.livello === lv && !s.accettata), ...a.segnalazioni.filter(s => s.livello === lv && s.accettata)];
    res.send(pag(req, p.nome, html`
      <div class="intestazione-pagina">
        <h1>${p.nome}${p.cliente ? html` <small class="nota">${p.cliente}</small>` : ''}</h1>
        <div>
          <form method="post" action="/preventivi/documenti/${p.id}/analizza" class="inline"><button title="Rilegge i file conservati (dopo un aggiornamento del portale)">Rianalizza</button></form>
          ${p.fonti?.bom ? (p.bom_id
            ? html`<a class="bottone" href="/quotazioni/bom/${p.bom_id}">Codifica della BOM ↗</a>`
            : html`<form method="post" action="/preventivi/documenti/${p.id}/codifica" class="inline"><button title="Manda la BOM alla sezione Quotazioni: codici Casteltech, prezzi e reperibilità">Codifica la BOM</button></form>`) : ''}
          <a href="/preventivi/documenti">← Documenti del cliente</a>
        </div>
      </div>
      ${riquadroEmail(p.email)}
      ${aggiungiFileForm}
      <div class="griglia-scheda-cliente">
        <section class="blocco">
          <h2>Per il preventivo</h2>
          ${riquadroVersioni}
          ${versioni.length ? '' : p.preventivo_id
            ? html`<p class="avviso info">Preventivo <a href="/preventivi/${p.preventivo_id}">${p.preventivo_numero}</a> <span class="stato ${p.preventivo_stato}">${p.preventivo_stato.replace('_', ' ')}</span></p>`
            : html`<form method="post" action="/preventivi/documenti/${p.id}/preventivo" class="crea-preventivo">
                <label>Schede da quotare <input name="schede" inputmode="numeric" value="${schedeProposte}" required></label>
                <button class="primario" title="Preventivo con i numeri qui sotto, da controllare e salvare">Crea il preventivo da validare</button></form>`}
          <table class="dati-scheda"><tbody>
            ${a.prodotto ? html`<tr><th>Prodotto letto dai file <small class="nota">(da convalidare)</small></th><td>${[
              a.prodotto.codice && `codice ${a.prodotto.codice}`, a.prodotto.descrizione && `descrizione ${a.prodotto.descrizione}`,
              a.prodotto.revisione && `rev. ${a.prodotto.revisione}`].filter(Boolean).join(' · ')}
              <small class="nota">${new Set(Object.values(a.prodotto.fonti)).size === 1 ? `da ${Object.values(a.prodotto.fonti)[0]}`
                : Object.entries(a.prodotto.fonti).map(([k, v]) => `${k} da ${v}`).join('; ')}</small></td></tr>` : ''}
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
        <section class="blocco" id="da-controllare">
          <h2>Da controllare</h2>
          ${a.segnalazioni.length ? html`<ul class="segnalazioni">${(['errore', 'avviso', 'info'] as const).flatMap(lv => perLivello(lv).map(s => html`
            <li class="${lv}${s.accettata ? ' accettata' : ''}"><span class="livello-segn">${s.accettata ? 'Controllata' : ETICHETTE_LIVELLO[lv]}</span> ${s.testo}${s.refs?.length ? html` <span class="refs">${s.refs.map(x => html`<button type="button" class="link rif" data-ref="${x}">${x}</button> `)}</span>` : ''}
              <form method="post" action="/preventivi/documenti/${p.id}/accetta" class="inline"><input type="hidden" name="chiave" value="${chiaveSegnalazione(s)}">${s.accettata
                ? html`<small class="nota">va bene per ${s.accettata.da}, ${data(s.accettata.il)}</small> <button class="link" name="annulla" value="1">annulla</button>`
                : html`<button class="link va-bene" title="Ho controllato: va bene così (non conta più tra gli errori e i componenti non sono più critici nelle stampe)">Va bene</button>`}</form></li>`))}</ul>`
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
        (sezione Quotazioni). Il preventivo compilato in automatico e le rotazioni per le macchine arriveranno nei prossimi passi.</p>`, req.query.errore ? String(req.query.errore) : undefined));
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
    const p = await q1<{ analisi: AnalisiScheda | null; accettate: any }>(`SELECT analisi, accettate FROM pacchetti_scheda WHERE id = $1`, [req.params.id]);
    res.json(((p?.analisi ? conAccettate(p.analisi, p.accettate) : null)?.componenti ?? []).filter(k => k.pp).map(k => ({ ref: k.ref, lato: k.lato, tipo: k.tipo, x: k.pp!.x, y: k.pp!.y, rot: k.pp!.rot, segnalato: k.segnalazioni.length > 0 })));
  });

  r.post('/:id/preventivo', async (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return next();
    const schede = Math.round(Number(String(req.body.schede ?? '').replace(',', '.')));
    if (!(schede > 0)) return res.redirect(`/preventivi/documenti/${req.params.id}`);
    const esistente = await q1<{ preventivo_id: number | null }>(`SELECT preventivo_id FROM pacchetti_scheda WHERE id = $1`, [req.params.id]);
    // già creato (pagina vecchia rimasta aperta, doppio clic): si riapre quello, con le schede scritte qui se è ancora da validare
    if (esistente?.preventivo_id) {
      await q(`UPDATE preventivi SET n_schede = $2 WHERE id = $1 AND stato = 'da_validare'`, [esistente.preventivo_id, schede]);
      return res.redirect(`/preventivi/${esistente.preventivo_id}`);
    }
    try { res.redirect(`/preventivi/${await creaPreventivoDaPacchetto(Number(req.params.id), schede, req.session.utente!.id)}`); }
    catch (e: any) { res.redirect(`/preventivi/documenti?errore=${encodeURIComponent(e.message)}`); }
  });

  // "Va bene" su una segnalazione (o annulla): chiave livello|testo, chi e quando
  r.post('/:id/accetta', async (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return next();
    const chiave = String(req.body.chiave ?? '').slice(0, 2000);
    if (chiave) {
      if (req.body.annulla) await q(`UPDATE pacchetti_scheda SET accettate = accettate - $2::text WHERE id = $1`, [req.params.id, chiave]);
      else await q(`UPDATE pacchetti_scheda SET accettate = accettate || jsonb_build_object($2::text, jsonb_build_object('da', $3::text, 'il', now())) WHERE id = $1`,
        [req.params.id, chiave, req.session.utente!.nome]);
    }
    res.redirect(`/preventivi/documenti/${req.params.id}#da-controllare`);
  });

  // ── documentazione di produzione (stampa) ──
  r.get('/:id/stampa', async (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return next();
    const p = await q1<any>(`SELECT p.id, p.nome, p.analisi, p.accettate, p.disegno, p.protezioni, c.ragione_sociale AS cliente FROM pacchetti_scheda p
      LEFT JOIN clienti c ON c.id = p.cliente_id WHERE p.id = $1`, [req.params.id]);
    if (!p?.analisi) return next();
    const foglio = (['TOP', 'BOT', 'THT', 'protezioni'].includes(String(req.query.foglio)) ? String(req.query.foglio) : 'TOP') as Foglio;
    const d = decomprimi<Disegno>(p.disegno) ?? { strati: [], riquadro: null, forature: [] };
    res.send(paginaStampa({ id: p.id, nome: p.nome, cliente: p.cliente }, conAccettate(p.analisi, p.accettate), d, foglio, p.protezioni ?? null));
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

  // BOM → sezione Quotazioni (codifica Casteltech, prezzi, reperibilità)
  r.post('/:id/codifica', async (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return next();
    const bomId = await bomDelPacchetto(Number(req.params.id), 100, req.session.utente!.id);
    res.redirect(bomId ? `/quotazioni/bom/${bomId}` : `/preventivi/documenti/${req.params.id}`);
  });

  // più versioni nella richiesta del cliente: un pacchetto per versione (Adriano 29/10/2026)
  r.post('/:id/dividi', async (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return next();
    try { await dividiPerVersioni(Number(req.params.id), req.session.utente!.id); res.redirect(`/preventivi/documenti/${req.params.id}`); }
    catch (e: any) { res.redirect(`/preventivi/documenti/${req.params.id}?errore=${encodeURIComponent(e.message)}`); }
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
