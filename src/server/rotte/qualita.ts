/**
 * Qualità (Adriano 31/10/2026; regole in src/engine/qualita.ts, tabella qualita_voci, migrazione 055).
 * /qualita = cruscotto (scadenze passate e vicine, non conformità aperte, difetti più frequenti), poi un registro per sezione:
 * /qualita/<sezione> elenco con ricerca veloce e spunte, /nuovo, /<id> scheda. Dati del vecchio Drive: "Carica i dati" (file .json.gz).
 */
import express, { Router, type Request } from 'express';
import { gunzipSync } from 'node:zlib';
import { layout } from '../views/layout.js';
import { html, data, type Raw } from '../views/html.js';
import { conteggiVoci, importaVoci, oggiRoma, rotteRegistri, scadenzaBadge, tastiRegistri, vociDi, type ConfigRegistri } from './registri.js';
import { SEZIONI_QUALITA, sezioneQualita, riepilogoQualita, ordinaVoci, difettiFrequenti, controllaFileQualita, titoloVoce } from '../../engine/qualita.js';

export const CONFIG_QUALITA: ConfigRegistri = { base: '/qualita', attiva: 'qualita', titolo: 'Qualità', sezioni: SEZIONI_QUALITA };

export function rotteQualita() {
  const r = Router();
  const pagina = (req: Request, titolo: string, contenuto: Raw, avviso?: string, script: string[] = []) =>
    String(layout({ titolo, utente: req.session.utente, attiva: 'qualita', contenuto, avviso, script }));
  const msg = (req: Request) => (req.query.msg ? String(req.query.msg) : undefined);
  const voci = () => vociDi(SEZIONI_QUALITA.map(s => s.chiave));
  const tasti = (conteggi: Record<string, number>) => tastiRegistri(CONFIG_QUALITA, conteggi);

  // ── Cruscotto della Qualità ──
  r.get('/', async (req, res) => {
    const oggi = oggiRoma();
    const tutte = await voci();
    const rie = riepilogoQualita(tutte, oggi);
    const codici = Object.fromEntries(tutte.filter(v => v.sezione === 'difetti').map(v => [String(v.dati.codice), String(v.dati.descrizione ?? '')]));
    const frequenti = difettiFrequenti(tutte.filter(v => v.sezione === 'non_conformita').map(v => v.dati)).slice(0, 8);
    const ncAperte = tutte.filter(v => v.sezione === 'non_conformita' && v.dati.stato !== 'chiusa');
    const riga = (x: { sezione: string; id: number; titolo: string; scadenza: string; stato: string }) => {
      const s = sezioneQualita(x.sezione)!;
      return html`<li class="${x.stato === 'scaduta' ? 'ritardo' : ''}"><a href="/qualita/${x.sezione}/${x.id}">${s.nome}: ${x.titolo}</a><span class="d">${scadenzaBadge(s, x.scadenza, oggi)}</span></li>`;
    };
    const vuoto = tutte.length === 0;
    res.send(pagina(req, 'Qualità', html`
      <div class="intestazione-pagina"><h1>Qualità</h1>
        <div class="azioni"><a href="/qualita/non_conformita/nuovo" class="bottone primario">+ Nuova non conformità</a></div></div>
      ${tasti(rie.conteggi)}
      <div class="oggi"><h3>Da fare</h3>
        ${rie.scadute.length || rie.vicine.length || rie.ncAperte ? html`<div class="chips">
          ${rie.scadute.length ? html`<a class="chip urgente" href="#scadenze"><b>${rie.scadute.length}</b> scadut${rie.scadute.length === 1 ? 'a' : 'e'}</a>` : ''}
          ${rie.vicine.length ? html`<a class="chip controllare" href="#scadenze"><b>${rie.vicine.length}</b> entro un mese</a>` : ''}
          ${rie.ncAperte ? html`<a class="chip" href="/qualita/non_conformita"><b>${rie.ncAperte}</b> non conformit${rie.ncAperte === 1 ? 'à aperta' : 'à aperte'}</a>` : ''}
        </div>` : html`<p class="nota">${vuoto ? 'La sezione è ancora vuota: carica i dati del Drive qui sotto o aggiungi le righe dai tasti in alto.' : 'Niente scaduto e niente in scadenza entro un mese.'}</p>`}
      </div>
      <div class="aree">
        <section class="area" id="scadenze"><header><h2>Scadenze</h2></header>
          <div class="tit">Scadute</div>${rie.scadute.length ? html`<ul>${rie.scadute.slice(0, 25).map(riga)}</ul>${rie.scadute.length > 25 ? html`<p class="nota">… e altre ${rie.scadute.length - 25}.</p>` : ''}` : html`<p class="nota">Nessuna.</p>`}
          <div class="tit">Entro un mese</div>${rie.vicine.length ? html`<ul>${rie.vicine.map(riga)}</ul>` : html`<p class="nota">Nessuna.</p>`}
          <p class="nota piccola">Tarature (ultima + ogni quanti mesi), manutenzioni e verifiche ESD (il mese previsto dopo l'ultima volta), azioni correttive, audit e riesami dei rischi.</p>
        </section>
        <section class="area"><header><h2>Non conformità aperte</h2><a href="/qualita/non_conformita">Tutte →</a></header>
          ${ncAperte.length ? html`<ul>${ordinaVoci(sezioneQualita('non_conformita')!, ncAperte).slice(0, 12).map(v => html`<li><a href="/qualita/non_conformita/${v.id}">${titoloVoce(sezioneQualita('non_conformita')!, v.dati)}</a><span class="d">${data(String(v.dati.data ?? ''))}</span></li>`)}</ul>` : html`<p class="nota">Nessuna.</p>`}
          <div class="tit">Difetti più frequenti</div>
          ${frequenti.length ? html`<ul>${frequenti.map(f => html`<li><span>${f.codice} ${codici[f.codice] ?? ''}</span><span class="d">${f.volte} volt${f.volte === 1 ? 'a' : 'e'}${f.pezzi ? `, ${f.pezzi} pz` : ''}</span></li>`)}</ul>` : html`<p class="nota">Nessun codice difetto nelle non conformità.</p>`}
        </section>
        <section class="area"><header><h2>Le sezioni</h2></header>
          <ul>${SEZIONI_QUALITA.map(s => html`<li><a href="/qualita/${s.chiave}">${s.nome}</a><span class="d">${rie.conteggi[s.chiave]}</span></li>`)}</ul>
          <p class="nota piccola">Prese dalla vecchia cartella 5_QUALITA del Drive. Le altre cartelle (IPC, GDPR, contratti, procedure dei clienti…) restano sul Drive.</p>
        </section>
      </div>
      <div class="blocco stretto-form carica-qualita">
        <h2>Carica i dati dal Drive</h2>
        <p class="nota">Si carica il file <code>qualita_esempio.json.gz</code> preparato da Claude dalla cartella 5_QUALITA (dati vecchi, per vedere la struttura).
          Si può ripetere: le righe con lo stesso codice (documenti, strumenti, difetti), la stessa macchina e intervento, lo stesso numero di non conformità…
          si aggiornano, le altre si aggiungono; quello che è stato scritto nel portale e non è nel file resta.</p>
        <label>File <input type="file" id="file-qualita" accept=".gz,.json"></label>
        <button id="carica-qualita" type="button">Carica</button>
        <output id="esito-qualita" class="nota"></output>
      </div>`, msg(req), ['qualita.js']));
  });


  r.post('/importa', express.raw({ type: 'application/octet-stream', limit: '10mb' }), async (req, res) => {
    try {
      const b = req.body as Buffer;
      const testo = b[0] === 0x1f && b[1] === 0x8b ? gunzipSync(b).toString('utf8') : b.toString('utf8');
      res.json(await importaVoci(controllaFileQualita(JSON.parse(testo)), SEZIONI_QUALITA));
    } catch (e: any) { res.status(400).json({ errore: 'File non valido: ' + (e?.message ?? e) }); }
  });

  // ── Registri delle sezioni (src/server/rotte/registri.ts, condivisi con la Sicurezza) ──
  r.use(rotteRegistri(CONFIG_QUALITA));
  return r;
}
