/**
 * Anagrafiche → Prodotti → "Programmi" (Adriano 13/11/2026; dal 13/11 sera anche le note di montaggio del prodotto e lo storico delle segnalazioni): i programmi delle macchine del prodotto (armadio, serigrafia, lamina,
 * P&P FOX, P&P iPulse, AOI, forno) con TOP e BOT. La commessa nuova li prende da sola nel riquadro "Programmi e lamine" per le caselle
 * che la sua revisione lascia vuote; salvando una commessa i programmi scritti lì tornano qui.
 *
 *   GET  /anagrafiche/prodotti/:id/programmi
 *   POST /anagrafiche/prodotti/:id/programmi   { programmi[chiave][top|bot] }
 */
import { Router, type Request } from 'express';
import { q1 } from '../db.js';
import { html } from '../views/html.js';
import type { PaginaAnagrafiche } from './anagrafiche.js';
import { PROGRAMMI } from '../commesse-servizio.js';
import { commesseApertePerProdotto, programmiDelProdotto, salvaProgrammiProdotto } from '../programmi-prodotto-servizio.js';
import { noteDelProdotto, salvaNoteProdotto, segnalazioniDelProdotto } from '../note-prodotto-servizio.js';

export function rotteProgrammiProdotto(pagina: PaginaAnagrafiche) {
  const r = Router({ mergeParams: true });
  const prodotto = (id: string) => q1<{ id: number; codice: string; descrizione: string | null; cliente_id: number | null; cliente: string | null }>(
    `SELECT p.id, p.codice, p.descrizione, p.cliente_id, c.ragione_sociale AS cliente FROM prodotti p LEFT JOIN clienti c ON c.id = p.cliente_id WHERE p.id = $1`, [id]);

  r.get('/', async (req: Request, res, next) => {
    const id = String((req.params as any).id);
    if (!/^\d+$/.test(id)) return next();
    const p = await prodotto(id);
    if (!p) return next();
    const prog = await programmiDelProdotto(p.id);
    const commesse = await commesseApertePerProdotto(p.id);
    const note = await noteDelProdotto(p.id);
    const storico = await segnalazioniDelProdotto(p.id);
    const msg = req.query.msg ? String(req.query.msg) : undefined;
    res.send(await pagina(req, 'prodotti', html`
      <h1>Programmi e note di ${p.codice} <small class="nota">${p.descrizione ?? ''}${p.cliente ? ` · ${p.cliente}` : ''}</small></h1>
      <p class="nota"><a href="/anagrafiche/prodotti${p.cliente_id ? `?cliente=${p.cliente_id}` : ''}">← Prodotti</a>
        · Ogni commessa nuova di questo prodotto prende da qui i programmi nelle caselle vuote del riquadro "Programmi e lamine".
        Quando salvi una commessa con un programma scritto, il programma torna anche qui.</p>
      <form method="post" class="blocco-modulo">
        <fieldset class="blocco">
          <legend>Programmi e lamine</legend>
          <table class="tabella-programmi" data-non-ordinare>
            <thead><tr><th></th><th>TOP</th><th>BOT</th></tr></thead>
            <tbody>${PROGRAMMI.map(([k, nome]) => html`<tr><th>${nome}</th>
              <td><input name="programmi[${k}][top]" value="${prog[k]?.top ?? ''}" maxlength="200"></td>
              <td><input name="programmi[${k}][bot]" value="${prog[k]?.bot ?? ''}" maxlength="200"></td></tr>`)}
            </tbody></table>
          <p class="nota">iPulse: se il programma c'è su tutte e due le macchine si scrive "M1: nome · M4: nome".</p>
        </fieldset>
        <fieldset class="blocco">
          <legend>Note di montaggio</legend>
          <textarea name="note_montaggio" rows="6" maxlength="2000" placeholder="Note che valgono per ogni lotto (non montare, componenti alternativi, attenzioni, separazione, imballo…)">${note}</textarea>
          <p class="nota">Una commessa nuova le prende se la sua scheda tecnica non ha note; quando salvi una commessa con le note scritte, tornano anche qui.
            Le cose di un solo ordine (quantità, date, prezzi) vanno nella commessa, non qui.</p>
        </fieldset>
        <button type="submit">Salva</button>
      </form>
      ${storico.length ? html`<h2>Segnalazioni dello storico</h2><p class="nota">Stampate sulle prossime schede di produzione.</p>
        <ul class="storico">${storico.map(s => html`<li>${s.testo}${s.numero ? html` <span class="nota">— commessa ${s.numero}</span>` : ''}</li>`)}</ul>` : ''}
      ${commesse.length ? html`<p class="nota">Commesse aperte di questo prodotto: ${commesse.map((c, i) => html`${i ? ', ' : ''}<a href="/commesse/${c.id}">${c.numero}</a>`)}
        (hanno la loro copia dei programmi: si correggono dalla commessa).</p>` : ''}`, msg));
  });

  r.post('/', async (req: Request, res, next) => {
    const id = String((req.params as any).id);
    if (!/^\d+$/.test(id)) return next();
    const p = await prodotto(id);
    if (!p) return next();
    await salvaProgrammiProdotto(p.id, req.body?.programmi);
    if (req.body && 'note_montaggio' in req.body) await salvaNoteProdotto(p.id, req.body.note_montaggio);
    res.redirect(`/anagrafiche/prodotti/${p.id}/programmi?msg=${encodeURIComponent('Programmi e note salvati.')}`);
  });
  return r;
}
