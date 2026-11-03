/**
 * Anagrafiche → Materiali di consumo (Adriano 3/11/2026): lamine, pasta saldante, stagno, Kapton, punte… con i codici nostri (MC-…).
 * Si richiamano nelle righe degli ordini a fornitore scrivendo una parola; regole in engine/materiali-consumo.ts.
 */
import express, { Router, type Request } from 'express';
import { gunzipSync } from 'node:zlib';
import { html, raw, euro, data } from '../views/html.js';
import type { PaginaAnagrafiche } from './anagrafiche.js';
import { conCampo } from '../../engine/errori-campo.js';
import { CATEGORIE_MATERIALI, UM_MATERIALI, categoriaProposta, eCategoria, leggiFilePrezziMateriali } from '../../engine/materiali-consumo.js';
import { aggiungiMateriale, caricaPrezziMateriali, cercaArticoliOrdine, elencoMateriali, eliminaMateriale, salvaMateriale } from '../materiali-consumo-servizio.js';

export function rotteMateriali(pagina: PaginaAnagrafiche) {
  const r = Router();
  const torna = (msg: string, categoria = '') => `/anagrafiche/materiali?msg=${encodeURIComponent(msg)}${categoria ? `&categoria=${categoria}` : ''}`;
  const menuCategorie = (nome: string, valore: string, vuota: string | null, classe = '') => html`<select name="${nome}" class="${classe}" ${vuota ? '' : raw('required')}>
    ${vuota !== null ? html`<option value="">${vuota}</option>` : ''}${Object.entries(CATEGORIE_MATERIALI).map(([k, v]) =>
      html`<option value="${k}" ${k === valore ? raw('selected') : ''}>${v}</option>`)}</select>`;

  // righe dell'ordine a fornitore: materiali di consumo e componenti mentre si scrive ("lamina", "kapton 12", un P/N…)
  r.get('/cerca', async (req, res) => {
    const testo = String(req.query.q ?? '');
    res.json({ voci: await cercaArticoliOrdine(testo), categoria: categoriaProposta(testo) });
  });

  r.get('/', async (req: Request, res) => {
    const tutti = await elencoMateriali();
    const categoria = eCategoria(req.query.categoria) ? req.query.categoria : '';
    const righe = categoria ? tutti.filter(m => m.categoria === categoria) : tutti;
    const conteggio = (k: string) => tutti.filter(m => m.categoria === k).length;
    res.send(await pagina(req, 'materiali', html`
      <p class="nota">Quello che si compra per la produzione e non va sulla scheda del cliente: lamine serigrafiche, pasta saldante, barre e filo di stagno,
        Kapton, punte dei saldatori, flussanti… Codici <b>nostri</b> (MC-categoria-numero, li dà il portale): i codici del fornitore o del produttore stanno
        nella descrizione. Negli <a href="/ordini/fornitori">ordini a fornitore</a> si richiamano scrivendo una parola nel Codice ("lamina", "kapton 12", "filo 0,7"):
        la descrizione arriva da qui e nella riga si può completare (es. per quale prodotto serve la lamina, il modello della punta Weller).</p>
      <form method="get" class="riga-campi"><label>Categoria
        <select name="categoria" class="invia-subito"><option value="">Tutte (${tutti.length})</option>${Object.entries(CATEGORIE_MATERIALI).map(([k, v]) =>
          html`<option value="${k}" ${k === categoria ? raw('selected') : ''}>${v} (${conteggio(k)})</option>`)}</select></label></form>
      <div class="ricerca-veloce"><input type="search" data-filtra="materiali" data-conta="conta-materiali" placeholder="Cerca codice, descrizione, fornitore…" autofocus autocomplete="off">
        <span class="nota">Trovati: <b id="conta-materiali">${righe.length}</b></span></div>
      ${righe.length ? html`<div class="tabella-scorre"><table class="elenco" id="materiali"><thead><tr><th>Codice</th><th>Categoria</th><th>Descrizione</th><th>U.M.</th>
          <th class="n">Ultimo acquisto</th><th>Attivo</th><th class="n" title="Righe di ordini a fornitore che lo usano">Negli ordini</th><th></th></tr></thead><tbody>
        ${righe.map(m => html`<tr class="${m.attivo ? '' : 'spento'}"><td class="codice nowrap">${m.codice}</td>
          <td><select name="categoria" form="m-${m.id}">${Object.entries(CATEGORIE_MATERIALI).map(([k, v]) =>
            html`<option value="${k}" ${k === m.categoria ? raw('selected') : ''}>${v}</option>`)}</select></td>
          <td class="largo"><input name="descrizione" value="${m.descrizione}" class="maiuscolo" form="m-${m.id}" required></td>
          <td><input name="um" value="${m.um ?? ''}" class="maiuscolo corto" form="m-${m.id}" list="um-materiali"></td>
          <td class="n nowrap" title="${m.prezzo != null ? `${m.fornitore ?? ''}${m.data ? ` · ${data(m.data)}` : ''}${m.prezzo_fonte === 'manuale' ? ' · scritto a mano' : ''}` : ''}">${m.prezzo != null
            ? html`${euro(m.prezzo)}<br><span class="nota">${m.fornitore ?? ''}${m.data ? ` ${data(m.data)}` : ''}</span>` : ''}</td>
          <td><input type="checkbox" name="attivo" value="1" form="m-${m.id}" ${m.attivo ? raw('checked') : ''} title="Tolta la spunta non compare più negli ordini"></td>
          <td class="n">${m.usato || ''}</td>
          <td class="nowrap"><form method="post" action="/anagrafiche/materiali/${m.id}?categoria=${categoria}" id="m-${m.id}" class="inline"><input type="hidden" name="attivo_presente" value="1"><button>Salva</button></form>
            ${m.usato ? '' : html`<form method="post" action="/anagrafiche/materiali/${m.id}/elimina?categoria=${categoria}" class="inline"
              data-conferma="${`Eliminare ${m.codice}?`}"><button class="link negativo">Elimina</button></form>`}</td></tr>`)}
        </tbody></table></div>` : html`<p class="vuoto">Nessun materiale in questa categoria: aggiungilo qui sotto.</p>`}
      <datalist id="um-materiali">${UM_MATERIALI.map(u => html`<option value="${u}">`)}</datalist>
      <form method="post" action="/anagrafiche/materiali" class="blocco stretto-form" id="m-nuovo">
        <h2>+ Aggiungi materiale</h2>
        <p class="nota">Il codice lo dà il portale (il numero dopo l'ultimo della categoria). Se il fornitore ha un suo codice, scrivilo nella descrizione.</p>
        <div class="riga-campi"><label>Categoria ${menuCategorie('categoria', categoria, '— scegli —')}</label>
          <label class="largo">Descrizione <input name="descrizione" class="maiuscolo" required autocomplete="off" placeholder="es. LAMINA SERIGRAFICA … (I-TRONIK CM…)"></label>
          <label>U.M. <input name="um" class="maiuscolo corto" list="um-materiali" value="PZ"></label></div>
        <button class="primario">Aggiungi</button>
      </form>
      <details class="blocco">
        <summary>Carica gli ultimi prezzi d'acquisto (file da Fatture in Cloud)</summary>
        <div class="stretto-form dentro-blocco">
          <p class="nota">File materiali_prezzi.json.gz preparato da Claude con le fatture dei fornitori di Fatture in Cloud: per ogni materiale l'ultimo prezzo,
            il fornitore e la data. Prima un riepilogo, poi la conferma; si può ricaricare. I prezzi scritti a mano (anche dalla domanda negli ordini) non si toccano.</p>
          <label>File <input type="file" id="file-prezzi-materiali" accept=".gz,.json"></label>
          <button class="primario" type="button" id="carica-prezzi-materiali">Controlla il file</button>
          <output id="esito-prezzi-materiali"></output>
          <button class="primario" type="button" id="conferma-prezzi-materiali" hidden>Conferma e carica</button>
        </div>
      </details>`, req.query.msg ? String(req.query.msg) : undefined, 'anagrafiche.js'));
  });

  r.post('/', async (req, res) => {
    const e = await aggiungiMateriale(req.body);
    const categoria = eCategoria(req.body.categoria) ? req.body.categoria : '';
    if ('errore' in e) return res.redirect(conCampo(torna(e.errore, categoria), e.campo, 'm-nuovo'));
    res.redirect(torna(`Aggiunto ${e.materiale.codice} ${e.materiale.descrizione}.`, categoria));
  });

  // materiale nuovo dalla riga dell'ordine a fornitore (risposta JSON: la riga prende subito il codice nuovo)
  r.post('/nuovo-riga', async (req, res) => {
    const e = await aggiungiMateriale(req.body);
    if ('errore' in e) return res.status(400).json({ errore: e.errore });
    res.json(e.materiale);
  });

  r.post('/prezzi', express.raw({ type: '*/*', limit: '5mb' }), async (req, res) => {
    try {
      let b = req.body as Buffer;
      if (b[0] === 0x1f && b[1] === 0x8b) b = gunzipSync(b);
      const { prezzi, scartate } = leggiFilePrezziMateriali(JSON.parse(b.toString('utf8')));
      res.json({ ...(await caricaPrezziMateriali(prezzi, req.query.conferma === '1')), scartate });
    } catch (e: any) { res.status(400).json({ errore: e?.message?.startsWith('Non è') ? e.message : 'File non valido: serve materiali_prezzi.json.gz' }); }
  });

  r.post('/:id', async (req, res, next) => {
    if (!/^\d+$/.test(req.params.id)) return next();
    // la spunta "Attivo" non arriva quando è tolta: il campo nascosto dice che il modulo l'aveva
    const e = await salvaMateriale(Number(req.params.id), { ...req.body, attivo: req.body.attivo_presente ? req.body.attivo === '1' : undefined });
    const categoria = eCategoria(req.query.categoria) ? String(req.query.categoria) : '';
    res.redirect(torna(e?.errore ?? 'Salvato.', categoria));
  });
  r.post('/:id/elimina', async (req, res) => {
    const errore = await eliminaMateriale(Number(req.params.id));
    res.redirect(torna(errore ?? 'Materiale eliminato.', eCategoria(req.query.categoria) ? String(req.query.categoria) : ''));
  });
  return r;
}
