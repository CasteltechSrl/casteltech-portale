/**
 * Registri a sezioni (righe in qualita_voci: sezione + dati jsonb), usati dalla Qualità (31/10/2026) e dalla Sicurezza (12/11/2026):
 * <base>/<sezione> elenco con ricerca veloce e spunte (Fatto oggi, Duplica, Elimina…), /nuovo, /<id> scheda.
 * I campi di ogni sezione stanno in src/engine/qualita.ts (SEZIONI_QUALITA) e src/engine/sicurezza.ts (SEZIONI_SICUREZZA).
 */
import { Router, type Request } from 'express';
import { q, q1, transazione } from '../db.js';
import { layout } from '../views/layout.js';
import { casella, casellaTutti, conMessaggio, idsSpuntati, moduloAzioni } from '../views/azioni-elenco.js';
import { html, data, num, raw, type Raw } from '../views/html.js';
import {
  preparaVoce, prossimaScadenza, statoScadenza, ordinaVoci, punteggi, livelloRischio, prossimoNumeroNc, scriviMesi, chiaveImport, titoloVoce,
  type SezioneQualita, type DatiVoce, type CampoQualita, type FileQualita,
} from '../../engine/qualita.js';

export const oggiRoma = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
export interface Voce { id: number; sezione: string; dati: DatiVoce }

export interface ConfigRegistri {
  /** indirizzo del cruscotto: /qualita, /sicurezza */
  base: string;
  /** sezione del menu da accendere */
  attiva: string;
  /** titolo delle pagine: Qualità, Sicurezza */
  titolo: string;
  sezioni: SezioneQualita[];
  /** tasti in più in testa (dopo Cruscotto): [indirizzo, nome] */
  tastiExtra?: [string, string][];
}

export const vociDi = (sezioni: string[]) => q<Voce>(`SELECT id, sezione, dati FROM qualita_voci WHERE sezione = ANY($1)`, [sezioni]);
export const conteggiVoci = async () => Object.fromEntries((await q<{ sezione: string; n: number }>(`SELECT sezione, count(*)::int AS n FROM qualita_voci GROUP BY sezione`)).map(x => [x.sezione, x.n]));
const codiciDifetti = async () => Object.fromEntries((await vociDi(['difetti'])).map(v => [String(v.dati.codice), String(v.dati.descrizione ?? '')]));

/** Tasti delle sezioni in alto, con quante righe ha ognuna. */
export const tastiRegistri = (cfg: ConfigRegistri, conteggi: Record<string, number>, attiva?: string) => html`<nav class="tasti-anagrafiche">
    <a href="${cfg.base}" class="${attiva ? '' : 'attiva'}">Cruscotto</a>
    ${(cfg.tastiExtra ?? []).map(([h, t]) => html`<a href="${h}" class="${attiva === h ? 'attiva' : ''}">${t}</a>`)}
    ${cfg.sezioni.map(s => html`<a href="${cfg.base}/${s.chiave}" class="${attiva === s.chiave ? 'attiva' : ''}">${s.nome} <span class="conta">${conteggi[s.chiave] ?? 0}</span></a>`)}
  </nav>`;

export const scadenzaBadge = (s: SezioneQualita, sc: string | null, oggi: string) => {
    if (!sc) return '';
    const stato = statoScadenza(s, sc, oggi);
    const testo = s.scadenza === 'mesi_previsti' ? new Date(sc).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }) : data(sc);
    return html`<span class="scadenza ${stato === 'scaduta' ? 'scaduta' : stato === 'vicina' ? 'oggi' : ''}">${testo}</span>`;
  };

  /** Valore di una cella dell'elenco. */
const cella = (s: SezioneQualita, v: Voce, chiave: string, oggi: string, codici: Record<string, string>): Raw | string => {
    const d = v.dati;
    if (chiave === 'prossima') return scadenzaBadge(s, prossimaScadenza(s, d, oggi), oggi);
    if (chiave === 'opportunita' || chiave === 'rischio') {
      const p = punteggi(d)[chiave];
      return html`<span class="etichetta ${chiave === 'rischio' ? `rischio-${livelloRischio(p)}` : ''}">${p}</span>`;
    }
    const c = s.campi.find(x => x.chiave === chiave);
    const val = d[chiave];
    if (!c || val == null || val === '') return '';
    if (c.tipo === 'data') return data(String(val));
    if (c.tipo === 'mesi') return scriviMesi(val);
    if (c.tipo === 'numero') return num(Number(val), 2);
    if (c.tipo === 'scelta') return html`<span class="etichetta q-${String(val)}">${c.opzioni?.[String(val)] ?? String(val)}</span>`;
    if (c.tipo === 'difetto') return `${val} ${codici[String(val)] ?? ''}`.trim();
    const t = String(val);
    return c.tipo === 'testo_lungo' ? html`<span class="taglia">${t.length > 140 ? t.slice(0, 140) + '…' : t}</span>` : t;
  };


/** Carica le righe di un file { sezioni: { <sezione>: [ {campo: valore} ] } }: stessa chiave = si aggiorna, altrimenti si aggiunge. */
export async function importaVoci(file: FileQualita, sezioni: SezioneQualita[]) {
  return transazione(async c => {
    let aggiunte = 0, aggiornate = 0; const scartate: string[] = [];
    for (const [chiaveSez, righe] of Object.entries(file.sezioni)) {
      const s = sezioni.find(x => x.chiave === chiaveSez)!;
      const esistenti = new Map<string, number>();
      for (const v of (await c.query(`SELECT id, dati FROM qualita_voci WHERE sezione = $1`, [s.chiave])).rows) esistenti.set(chiaveImport(s, v.dati), v.id);
      for (const [i, riga] of righe.entries()) {
        const { dati, errore } = preparaVoce(s, riga);
        if (errore) { scartate.push(`${s.nome} riga ${i + 1}: ${errore}`); continue; }
        const k = chiaveImport(s, dati);
        const id = esistenti.get(k);
        if (id) { await c.query(`UPDATE qualita_voci SET dati = $2, aggiornato_il = now() WHERE id = $1`, [id, dati]); aggiornate++; }
        else {
          const nuovo = (await c.query(`INSERT INTO qualita_voci (sezione, dati, origine) VALUES ($1, $2, 'file') RETURNING id`, [s.chiave, dati])).rows[0];
          esistenti.set(k, nuovo.id); aggiunte++;
        }
      }
    }
    return { aggiunte, aggiornate, scartate };
  });
}

/** Le pagine dei registri: elenco, azioni con le spunte, nuova riga, scheda, elimina. */
export function rotteRegistri(cfg: ConfigRegistri) {
  const r = Router();
  const pagina = (req: Request, titolo: string, contenuto: Raw, avviso?: string, script: string[] = []) =>
    String(layout({ titolo, utente: req.session.utente, attiva: cfg.attiva, contenuto, avviso, script }));
  const msg = (req: Request) => (req.query.msg ? String(req.query.msg) : undefined);
  const voci = (sezione: string) => vociDi([sezione]);
  const difetti = async (s?: SezioneQualita) => (s && !s.campi.some(c => c.tipo === 'difetto') ? {} : codiciDifetti());

  // ── Registro di una sezione ──
  const sezioneDa = (req: Request) => cfg.sezioni.find(s => s.chiave === String(req.params.sezione));

  r.get('/:sezione', async (req, res, next) => {
    const s = sezioneDa(req);
    if (!s) return next();
    const oggi = oggiRoma();
    const [righe, n, codici] = [ordinaVoci(s, await voci(s.chiave)), await conteggiVoci(), await difetti(s)];
    const titoloColonna = (k: string) => (k === 'prossima' ? 'Prossima scadenza' : k === 'opportunita' ? 'Opportunità' : k === 'rischio' ? 'Rischio' : s.campi.find(c => c.chiave === k)?.nome ?? k);
    const azioni = moduloAzioni({
      azione: `${cfg.base}/${s.chiave}/azioni`, nome: { singolare: s.singolare, plurale: s.nome.toLowerCase(), femminile: s.femminile },
      pulsanti: [
        ...(s.scadenza === 'frequenza_mesi' || s.scadenza === 'mesi_previsti'
          ? [{ azione: 'fatta_oggi', testo: s.chiave === 'strumenti' ? 'Tarato oggi' : 'Fatto oggi', serve: '1+' as const, titolo: 'Segna oggi come ultima volta (esito positivo): la prossima scadenza si sposta da sola' }] : []),
        ...(s.chiave === 'non_conformita' ? [{ azione: 'chiudi', testo: 'Chiudi', serve: '1+' as const, titolo: 'Stato "Chiusa" con la data di oggi' }] : []),
        { azione: 'duplica', testo: 'Duplica', serve: '1' as const },
        { azione: 'elimina', testo: 'Elimina', serve: '1+' as const, pericolo: true, chiedi: `Eliminare {n} righe? Non si può annullare.` },
      ],
    });
    res.send(pagina(req, s.nome, html`
      <div class="intestazione-pagina"><h1>${cfg.titolo}</h1>
        <div class="azioni"><a href="${cfg.base}/${s.chiave}/nuovo" class="bottone primario">+ ${s.femminile ? 'Nuova' : 'Nuovo'} ${s.singolare}</a></div></div>
      ${tastiRegistri(cfg, n, s.chiave)}
      <p class="nota">${s.descrizione} <span class="nota">Dal vecchio Drive: ${s.daCartella}.</span></p>
      ${righe.length ? html`
        <div class="ricerca-veloce"><input type="search" data-filtra="tab-qualita" data-conta="conta-qualita" placeholder="Cerca mentre scrivi…" autocomplete="off">
          <span class="nota"><span id="conta-qualita">${righe.length}</span> righe</span></div>
        ${azioni.apri}<div class="tabella-scorre"><table class="elenco" id="tab-qualita">
        <thead><tr>${casellaTutti()}${s.colonne.map(k => html`<th>${titoloColonna(k)}</th>`)}</tr></thead>
        <tbody>${righe.map(v => {
          const sc = prossimaScadenza(s, v.dati, oggi);
          const stato = sc ? statoScadenza(s, sc, oggi) : 'ok';
          return html`<tr class="${stato === 'scaduta' ? 'scaduta' : ''}">${casella(v.id, titoloVoce(s, v.dati))}
            ${s.colonne.map((k, i) => html`<td>${i === 0 ? html`<a href="${cfg.base}/${s.chiave}/${v.id}"><strong>${cella(s, v, k, oggi, codici) || '—'}</strong></a>` : cella(s, v, k, oggi, codici)}</td>`)}</tr>`;
        })}</tbody></table></div>${azioni.chiudi}` : html`<p class="vuoto">Ancora nessuna riga. <a href="${cfg.base}/${s.chiave}/nuovo">Aggiungi la prima</a> o carica i dati del Drive dal <a href="${cfg.base}">cruscotto della ${cfg.titolo}</a>.</p>`}`,
      msg(req), ['ricerca.js', 'elenco.js']));
  });

  r.post('/:sezione/azioni', async (req, res, next) => {
    const s = sezioneDa(req);
    if (!s) return next();
    const ids = idsSpuntati(req.body);
    const torna = (m: string) => res.redirect(conMessaggio(`${cfg.base}/${s.chiave}`, m));
    if (!ids.length) return torna('Seleziona almeno una riga.');
    const azione = String(req.body?.azione ?? '');
    const oggi = oggiRoma();
    if (azione === 'elimina') {
      const n = (await q(`DELETE FROM qualita_voci WHERE sezione = $1 AND id = ANY($2) RETURNING id`, [s.chiave, ids])).length;
      return torna(n === 1 ? 'Riga eliminata.' : `Eliminate ${n} righe.`);
    }
    if (azione === 'fatta_oggi' && s.scadenza && s.scadenza !== 'campo') {
      const esito = s.campi.some(c => c.chiave === 'esito') ? { esito: 'positivo' } : {};
      const n = (await q(`UPDATE qualita_voci SET dati = dati || $3::jsonb, aggiornato_il = now() WHERE sezione = $1 AND id = ANY($2) RETURNING id`,
        [s.chiave, ids, JSON.stringify({ ultima: oggi, ...esito })])).length;
      return torna(`${n === 1 ? '1 riga segnata' : `${n} righe segnate`} come fatt${n === 1 ? 'a' : 'e'} oggi: la prossima scadenza è stata ricalcolata.`);
    }
    if (azione === 'chiudi' && s.chiave === 'non_conformita') {
      const n = (await q(`UPDATE qualita_voci SET dati = dati || jsonb_build_object('stato', 'chiusa', 'chiusa_il', coalesce(dati->>'chiusa_il', $3::text)), aggiornato_il = now()
        WHERE sezione = $1 AND id = ANY($2) RETURNING id`, [s.chiave, ids, oggi])).length;
      return torna(n === 1 ? 'Non conformità chiusa.' : `Chiuse ${n} non conformità.`);
    }
    if (azione === 'duplica') {
      if (ids.length !== 1) return torna('Per duplicare spunta una riga sola.');
      const v = await q1<Voce>(`SELECT id, sezione, dati FROM qualita_voci WHERE sezione = $1 AND id = $2`, [s.chiave, ids[0]]);
      if (!v) return torna('Riga non trovata.');
      const dati = { ...v.dati };
      if (s.chiave === 'non_conformita') { dati.numero = await nuovoNumeroNc(oggi); dati.stato = 'aperta'; dati.chiusa_il = null; dati.data = oggi; }
      const nuovo = await q1(`INSERT INTO qualita_voci (sezione, dati, creato_da) VALUES ($1, $2, $3) RETURNING id`, [s.chiave, dati, req.session.utente!.id]);
      return res.redirect(conMessaggio(`${cfg.base}/${s.chiave}/${nuovo.id}`, 'Copia creata: correggi quello che cambia e salva.'));
    }
    torna('Azione non riconosciuta.');
  });

  const nuovoNumeroNc = async (oggi: string) => prossimoNumeroNc(
    (await q<{ n: string }>(`SELECT dati->>'numero' AS n FROM qualita_voci WHERE sezione = 'non_conformita'`)).map(x => x.n), Number(oggi.slice(0, 4)));

  /** Una casella del modulo secondo il tipo del campo. */
  const casellaCampo = (c: CampoQualita, val: DatiVoce[string], codici: Record<string, string>) => {
    const v = val == null ? '' : c.tipo === 'mesi' ? (val as number[]).join(', ') : String(val);
    const ph = c.esempio ? html`placeholder="${c.esempio}"` : '';
    const req = c.obbligatorio ? raw('required') : '';
    if (c.tipo === 'testo_lungo') return html`<textarea name="${c.chiave}" rows="3" ${ph} ${req}>${v}</textarea>`;
    if (c.tipo === 'scelta') return html`<select name="${c.chiave}">${Object.entries(c.opzioni ?? {}).map(([k, t]) => html`<option value="${k}" ${k === v ? raw('selected') : ''}>${t}</option>`)}</select>`;
    if (c.tipo === 'difetto') return html`<select name="${c.chiave}"><option value="">—</option>${Object.entries(codici).map(([k, t]) => html`<option value="${k}" ${k === v ? raw('selected') : ''}>${k} ${t}</option>`)}
      ${v && !(v in codici) ? html`<option value="${v}" selected>${v} (non in codifica)</option>` : ''}</select>`;
    if (c.tipo === 'data') return html`<input type="date" name="${c.chiave}" value="${v}" ${req}>`;
    if (c.tipo === 'numero') return html`<input name="${c.chiave}" value="${v}" inputmode="decimal" ${ph} ${req}>`;
    return html`<input name="${c.chiave}" value="${v}" ${ph} ${req} ${c.maiuscolo ? raw('class="maiuscolo"') : ''}>`;
  };
  const modulo = (s: SezioneQualita, d: DatiVoce, azione: string, pulsante: string, codici: Record<string, string>) => html`
    <form method="post" action="${azione}" class="blocco modulo-qualita">
      ${s.campi.map(c => html`<label class="${c.tipo === 'testo_lungo' ? 'largo' : ''}">${c.nome}${c.obbligatorio ? ' *' : ''} ${casellaCampo(c, d[c.chiave] ?? null, codici)}</label>`)}
      <button class="primario">${pulsante}</button>
    </form>`;

  r.get('/:sezione/nuovo', async (req, res, next) => {
    const s = sezioneDa(req);
    if (!s) return next();
    const oggi = oggiRoma();
    const iniziale: DatiVoce = {};
    if (s.chiave === 'non_conformita') Object.assign(iniziale, { numero: await nuovoNumeroNc(oggi), data: oggi, stato: 'aperta' });
    if (s.chiave === 'formazione' || s.chiave === 'audit') iniziale.data = oggi;
    res.send(pagina(req, `${s.femminile ? 'Nuova' : 'Nuovo'} ${s.singolare}`, html`
      <p><a href="${cfg.base}/${s.chiave}">← ${s.nome}</a></p><h1>${s.femminile ? 'Nuova' : 'Nuovo'} ${s.singolare}</h1>
      ${modulo(s, iniziale, `${cfg.base}/${s.chiave}/nuovo`, 'Aggiungi', await difetti(s))}`));
  });

  r.post('/:sezione/nuovo', async (req, res, next) => {
    const s = sezioneDa(req);
    if (!s) return next();
    const { dati, errore } = preparaVoce(s, req.body ?? {});
    if (errore) return res.send(pagina(req, s.nome, html`<p><a href="${cfg.base}/${s.chiave}">← ${s.nome}</a></p><h1>${s.femminile ? 'Nuova' : 'Nuovo'} ${s.singolare}</h1>
      ${modulo(s, dati, `${cfg.base}/${s.chiave}/nuovo`, 'Aggiungi', await difetti(s))}`, errore));
    if (s.chiave === 'non_conformita' && !dati.numero) dati.numero = await nuovoNumeroNc(oggiRoma());
    const v = await q1(`INSERT INTO qualita_voci (sezione, dati, creato_da) VALUES ($1, $2, $3) RETURNING id`, [s.chiave, dati, req.session.utente!.id]);
    res.redirect(conMessaggio(`${cfg.base}/${s.chiave}/${v.id}`, 'Aggiunto.'));
  });

  const scheda = async (req: Request, s: SezioneQualita, id: number, d: DatiVoce, avviso?: string) => {
    const oggi = oggiRoma();
    const sc = prossimaScadenza(s, d, oggi);
    const p = s.chiave === 'rischi' ? punteggi(d) : null;
    return pagina(req, titoloVoce(s, d), html`
      <p><a href="${cfg.base}/${s.chiave}">← ${s.nome}</a></p>
      <h1>${titoloVoce(s, d)}</h1>
      ${sc ? html`<p>Prossima scadenza: ${scadenzaBadge(s, sc, oggi)}</p>` : ''}
      ${p ? html`<p>Punteggio opportunità <b>${p.opportunita}</b> · rischio <span class="etichetta rischio-${livelloRischio(p.rischio)}">${p.rischio}</span> <span class="nota">(valore × frequenza, massimo 100)</span></p>` : ''}
      ${modulo(s, d, `${cfg.base}/${s.chiave}/${id}`, 'Salva', await difetti(s))}
      <form method="post" action="${cfg.base}/${s.chiave}/${id}/elimina" data-conferma="Eliminare questa riga? Non si può annullare.">
        <button class="link negativo">Elimina</button></form>`, avviso);
  };

  r.get('/:sezione/:id', async (req, res, next) => {
    const s = sezioneDa(req);
    if (!s || !/^\d+$/.test(String(req.params.id))) return next();
    const v = await q1<Voce>(`SELECT id, sezione, dati FROM qualita_voci WHERE sezione = $1 AND id = $2`, [s.chiave, Number(req.params.id)]);
    if (!v) return res.redirect(conMessaggio(`${cfg.base}/${s.chiave}`, 'Riga non trovata.'));
    res.send(await scheda(req, s, v.id, v.dati, msg(req)));
  });

  r.post('/:sezione/:id', async (req, res, next) => {
    const s = sezioneDa(req);
    if (!s || !/^\d+$/.test(String(req.params.id))) return next();
    const id = Number(req.params.id);
    const { dati, errore } = preparaVoce(s, req.body ?? {});
    if (errore) return res.send(await scheda(req, s, id, dati, errore));
    const ok = await q1(`UPDATE qualita_voci SET dati = $3, aggiornato_il = now() WHERE sezione = $1 AND id = $2 RETURNING id`, [s.chiave, id, dati]);
    res.redirect(conMessaggio(ok ? `${cfg.base}/${s.chiave}/${id}` : `${cfg.base}/${s.chiave}`, ok ? 'Salvato.' : 'Riga non trovata.'));
  });

  // Elimina: le righe della Qualità non sono collegate ad altro, si possono sempre togliere
  r.post('/:sezione/:id/elimina', async (req, res, next) => {
    const s = sezioneDa(req);
    if (!s) return next();
    const v = await q1(`DELETE FROM qualita_voci WHERE sezione = $1 AND id = $2 RETURNING id`, [s.chiave, Number(req.params.id)]);
    res.redirect(conMessaggio(`${cfg.base}/${s.chiave}`, v ? 'Riga eliminata.' : 'Riga non trovata.'));
  });

  return r;
}
