/**
 * Impostazioni → Amministrazione (solo ufficio): dati dell'azienda, numerazioni, aliquote IVA, condizioni di pagamento.
 * Sono i dati che finiscono su fatture, note di credito, autofatture e DDT emessi dal portale.
 * Aliquote e condizioni non si eliminano (possono essere già usate da clienti e documenti): si spengono con "Attiva".
 */
import express, { Router, type Request } from 'express';
import { gunzipSync } from 'node:zlib';
import { q, q1 } from '../db.js';
import { html, raw, data as dataIt, type Raw } from '../views/html.js';
import { CAMPI_AZIENDA, REGIMI_FISCALI, numeroCompleto, type CampoAzienda } from '../../engine/amministrazione.js';
import { collegaWebhook, statoInvoicetronic } from '../invoicetronic.js';
import { caricaAliquote, caricaAzienda, caricaClientiFiscali, caricaStoricoFic, caricaCondizioniPagamento, caricaNumerazioni, salvaAzienda } from '../amministrazione-servizio.js';

type Pagina = (req: Request, titolo: string, contenuto: Raw, avviso?: string, script?: string) => string;

const ETICHETTE: Record<CampoAzienda, string> = {
  ragione_sociale: 'Ragione sociale', partita_iva: 'Partita IVA', codice_fiscale: 'Codice fiscale', regime_fiscale: 'Regime fiscale',
  indirizzo: 'Indirizzo della sede', cap: 'CAP', comune: 'Comune', provincia: 'Provincia (sigla)', nazione: 'Nazione (sigla)',
  rea_ufficio: 'REA: provincia dell\'ufficio', rea_numero: 'REA: numero', capitale_sociale: 'Capitale sociale (€)',
  socio_unico: 'Socio unico (SU) / più soci (SM)', telefono: 'Telefono', email: 'Email', pec: 'PEC', banca: 'Banca', iban: 'IBAN',
};

const NOMI_TIPO: Record<string, string> = {
  fattura: 'Fatture', nota_credito: 'Note di credito', autofattura: 'Autofatture', ddt: 'DDT',
  conferma_ordine: 'Conferme d\'ordine', ordine_fornitore: 'Ordini a fornitore',
};

const NATURE = ['N1', 'N2.1', 'N2.2', 'N3.1', 'N3.2', 'N3.3', 'N3.4', 'N3.5', 'N3.6', 'N4', 'N5', 'N6.1', 'N6.2', 'N6.3', 'N6.4', 'N6.5', 'N6.6', 'N6.7', 'N6.8', 'N6.9', 'N7'];
const MODALITA: Record<string, string> = { MP01: 'Contanti', MP02: 'Assegno', MP05: 'Bonifico', MP08: 'Carta di pagamento', MP12: 'RiBa' };
const CODICE = /^[A-Z][A-Z0-9_]{1,20}$/;

const numero = (v: unknown) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
const spunta = (v: unknown) => v === 'on' || v === 'true';

export function rotteImpostazioniAmministrazione(pagina: Pagina) {
  const r = Router();
  const torna = (msg: string, ancora = '') => `/impostazioni/amministrazione?msg=${encodeURIComponent(msg)}${ancora}`;

  r.get('/', async (req, res) => {
    const [azienda, numerazioni, aliquote, condizioni, sdi] = await Promise.all([caricaAzienda(), caricaNumerazioni(), caricaAliquote(),
      caricaCondizioniPagamento(), statoInvoicetronic()]);
    const scelta = (nome: string, valori: Record<string, string> | string[], attuale: string | null, form?: string, vuota = false) => {
      const voci = Array.isArray(valori) ? valori.map(v => [v, v]) : Object.entries(valori);
      return html`<select name="${nome}" ${form ? raw(`form="${form}"`) : ''}>${vuota ? html`<option value="">—</option>` : ''}
        ${voci.map(([v, t]) => html`<option value="${v}" ${v === attuale ? raw('selected') : ''}>${v === t ? v : `${v} – ${t}`}</option>`)}</select>`;
    };
    res.send(pagina(req, 'Amministrazione', html`
      <p class="nota">Dati usati da fatture, note di credito, autofatture e DDT emessi dal portale. Valori iniziali presi da Fatture in Cloud il 27/10/2026.</p>

      <h2 id="azienda">Dati dell'azienda</h2>
      <form method="post" action="/impostazioni/amministrazione/azienda" class="blocco stretto-form">
        ${CAMPI_AZIENDA.map(c => html`<label>${ETICHETTE[c]}
          ${c === 'regime_fiscale' ? scelta(c, REGIMI_FISCALI, azienda[c])
            : html`<input name="${c}" value="${azienda[c]}" class="${c === 'email' || c === 'pec' ? '' : 'maiuscolo'}">`}</label>`)}
        <button class="primario">Salva i dati dell'azienda</button>
      </form>

      <h2 id="sdi">Invio allo SdI (Invoicetronic)</h2>
      <div class="blocco">
        ${!sdi.ambiente ? html`<p>Manca la chiave di Invoicetronic: va messa su Render come <code>INVOICETRONIC_API_KEY</code>.</p>` : html`
        <p>Chiave <strong>${sdi.ambiente === 'reale' ? 'REALE: le fatture vanno davvero allo SdI' : 'di PROVA: niente arriva allo SdI'}</strong>
          ${sdi.operazioni != null ? html` · operazioni rimaste: ${sdi.operazioni}` : ''}${sdi.errore ? html` · <span class="errore">${sdi.errore}</span>` : ''}</p>
        <p>Esiti e fatture ricevute: ${sdi.webhook ? html`collegati a <code>${sdi.webhook.url}</code> dal ${dataIt(sdi.webhook.collegato_il.slice(0, 10))}.`
          : html`<strong>non ancora collegati</strong> (gli esiti si leggono solo con "Aggiorna esito").`}</p>
        <form method="post" action="/impostazioni/amministrazione/sdi-webhook" class="inline"
          data-conferma="Collegare Invoicetronic a questo indirizzo del portale per ricevere esiti e fatture? Si fa una volta per ogni chiave (prova e reale).">
          <button>${sdi.webhook ? 'Collega di nuovo' : 'Collega esiti e fatture ricevute'}</button></form>`}
        <p class="nota">Il codice destinatario di Casteltech in Invoicetronic è 7HD37X0: si registra sul sito dell'Agenzia delle Entrate solo il giorno del passaggio,
          perché da quel momento le fatture dei fornitori arrivano qui e non più in Fatture in Cloud.</p>
      </div>

      <h2 id="numerazioni">Numerazioni</h2>
      <p class="nota">Ultimo numero usato per ogni serie. Il portale dà il numero successivo solo quando il documento viene emesso, con data non precedente all'ultima.
        Il giorno del passaggio da Fatture in Cloud questi numeri si riallineano con l'ultimo documento emesso là: <b>non cambiarli dopo aver emesso documenti dal portale</b>.</p>
      <div class="tabella-scorre"><table class="editor">
        <thead><tr><th>Serie</th><th>Sezionale</th><th>Anno</th><th>Ultimo numero</th><th>Data ultimo documento</th><th>Prossimo</th><th></th></tr></thead>
        <tbody>${numerazioni.map(n => {
          const id = `f-num-${n.tipo}-${n.sezionale || 'x'}-${n.anno}`;
          return html`<tr><td>${NOMI_TIPO[n.tipo] ?? n.tipo}</td><td>${n.sezionale || '—'}</td><td>${n.anno}</td>
            <td><input name="ultimo_numero" form="${id}" value="${n.ultimo_numero}" inputmode="numeric" class="corto"></td>
            <td><input name="ultima_data" form="${id}" type="date" value="${n.ultima_data ?? ''}"></td>
            <td>${numeroCompleto(n.ultimo_numero + 1, n.sezionale)}${n.ultima_data ? html` <span class="nota">(dal ${dataIt(n.ultima_data)})</span>` : ''}</td>
            <td><form method="post" action="/impostazioni/amministrazione/numerazioni" id="${id}"
                  data-conferma="${`Cambiare l'ultimo numero delle ${(NOMI_TIPO[n.tipo] ?? n.tipo).toLowerCase()} ${n.anno}? Un numero sbagliato crea doppioni o buchi nella numerazione.`}">
              <input type="hidden" name="tipo" value="${n.tipo}"><input type="hidden" name="sezionale" value="${n.sezionale}"><input type="hidden" name="anno" value="${n.anno}">
              <button>Salva</button></form></td></tr>`;
        })}</tbody></table></div>

      <h2 id="aliquote">Aliquote IVA</h2>
      <p class="nota">Con percentuale 0 serve la natura (N1, N2.1, N3.5…) e il riferimento normativo che si stampa in fattura.
        "Bollo": l'importo conta per il bollo da 2 € quando supera 77,47 € (da verificare con il commercialista per ogni natura).
        Le aliquote già usate non si eliminano: si spengono togliendo "Attiva".</p>
      <div class="tabella-scorre"><table class="editor">
        <thead><tr><th>Codice</th><th>Descrizione</th><th>%</th><th>Natura</th><th>Riferimento normativo</th><th>Bollo</th><th>Ordine</th><th>Attiva</th><th></th></tr></thead>
        <tbody>${aliquote.map(a => { const id = `f-iva-${a.codice}`; return html`<tr>
          <td><code>${a.codice}</code></td>
          <td class="largo"><input name="descrizione" form="${id}" value="${a.descrizione}"></td>
          <td><input name="percentuale" form="${id}" value="${a.percentuale}" inputmode="decimal" class="corto"></td>
          <td>${scelta('natura', NATURE, a.natura, id, true)}</td>
          <td class="largo"><input name="riferimento_normativo" form="${id}" value="${a.riferimento_normativo ?? ''}"></td>
          <td><input type="checkbox" name="soggetta_bollo" form="${id}" ${a.soggetta_bollo ? raw('checked') : ''}></td>
          <td><input name="ordine" form="${id}" value="${a.ordine}" inputmode="numeric" class="corto"></td>
          <td><input type="checkbox" name="attiva" form="${id}" ${a.attiva ? raw('checked') : ''}></td>
          <td><form method="post" action="/impostazioni/amministrazione/aliquote/${encodeURIComponent(a.codice)}" id="${id}"><button>Salva</button></form></td></tr>`; })}
        <tr class="nuova-riga">
          <td><input name="codice" form="f-iva-nuova" placeholder="CODICE" class="maiuscolo" required></td>
          <td class="largo"><input name="descrizione" form="f-iva-nuova"></td>
          <td><input name="percentuale" form="f-iva-nuova" inputmode="decimal" class="corto"></td>
          <td>${scelta('natura', NATURE, null, 'f-iva-nuova', true)}</td>
          <td class="largo"><input name="riferimento_normativo" form="f-iva-nuova"></td>
          <td><input type="checkbox" name="soggetta_bollo" form="f-iva-nuova"></td>
          <td><input name="ordine" form="f-iva-nuova" inputmode="numeric" class="corto"></td>
          <td><input type="checkbox" name="attiva" form="f-iva-nuova" checked></td>
          <td><form method="post" action="/impostazioni/amministrazione/aliquote" id="f-iva-nuova"><button class="primario">Aggiungi</button></form></td></tr>
        </tbody></table></div>

      <h2 id="pagamenti">Condizioni di pagamento</h2>
      <p class="nota">Scadenza = data del documento + giorni, poi fine mese se spuntato (es. fattura del 09/10 a 60 gg f.m. → 31/12).
        La condizione di ogni cliente si sceglie nella sua anagrafica.</p>
      <div class="tabella-scorre"><table class="editor">
        <thead><tr><th>Codice</th><th>Descrizione</th><th>Modalità</th><th>Giorni</th><th>Fine mese</th><th>Ordine</th><th>Attiva</th><th></th></tr></thead>
        <tbody>${condizioni.map(c => { const id = `f-pag-${c.codice}`; return html`<tr>
          <td><code>${c.codice}</code></td>
          <td class="largo"><input name="descrizione" form="${id}" value="${c.descrizione}"></td>
          <td>${scelta('modalita', MODALITA, c.modalita, id)}</td>
          <td><input name="giorni" form="${id}" value="${c.giorni}" inputmode="numeric" class="corto"></td>
          <td><input type="checkbox" name="fine_mese" form="${id}" ${c.fine_mese ? raw('checked') : ''}></td>
          <td><input name="ordine" form="${id}" value="${c.ordine}" inputmode="numeric" class="corto"></td>
          <td><input type="checkbox" name="attiva" form="${id}" ${c.attiva ? raw('checked') : ''}></td>
          <td><form method="post" action="/impostazioni/amministrazione/pagamenti/${encodeURIComponent(c.codice)}" id="${id}"><button>Salva</button></form></td></tr>`; })}
        <tr class="nuova-riga">
          <td><input name="codice" form="f-pag-nuova" placeholder="CODICE" class="maiuscolo" required></td>
          <td class="largo"><input name="descrizione" form="f-pag-nuova"></td>
          <td>${scelta('modalita', MODALITA, 'MP05', 'f-pag-nuova')}</td>
          <td><input name="giorni" form="f-pag-nuova" value="0" inputmode="numeric" class="corto"></td>
          <td><input type="checkbox" name="fine_mese" form="f-pag-nuova"></td>
          <td><input name="ordine" form="f-pag-nuova" inputmode="numeric" class="corto"></td>
          <td><input type="checkbox" name="attiva" form="f-pag-nuova" checked></td>
          <td><form method="post" action="/impostazioni/amministrazione/pagamenti" id="f-pag-nuova"><button class="primario">Aggiungi</button></form></td></tr>
        </tbody></table></div>

      <h2 id="clienti-fic">Dati fiscali dei clienti da Fatture in Cloud</h2>
      <details class="blocco">
        <summary>Carica il file clienti_fiscali_fic.json.gz (preparato da Claude)</summary>
        <div class="stretto-form dentro-blocco">
          <p class="nota">Porta nei clienti GIÀ in anagrafica indirizzo, codice SDI, PEC, condizione di pagamento, aliquota predefinita e lettere d'intento.
            I clienti di FIC che non sono in anagrafica si elencano e non si aggiungono. I campi vuoti nel file non cancellano quelli del portale.
            Prima mostra un riepilogo e chiede conferma.</p>
          <label>File <input type="file" id="file-clienti-fic" accept=".gz,.json"></label>
          <button class="primario" type="button" id="carica-clienti-fic">Controlla il file</button>
          <output id="esito-clienti-fic"></output>
          <button class="primario" type="button" id="conferma-clienti-fic" hidden>Conferma e carica</button>
        </div>
      </details>

      <h2 id="storico-fic">Storico dei documenti da Fatture in Cloud</h2>
      <details class="blocco">
        <summary>Carica il file storico_fic.json.gz (preparato da Claude)</summary>
        <div class="stretto-form dentro-blocco">
          <p class="nota">Fatture, note di credito, autofatture e DDT emessi dal 2025, con righe e scadenze (incassate o aperte), più le fatture
            e note di credito ricevute dai fornitori. Ricaricare il file aggiorna i documenti già caricati senza duplicarli; le numerazioni salgono
            all'ultimo numero di Fatture in Cloud (mai scendono). I documenti restano anche se il cliente non è in anagrafica (con i suoi dati).
            Prima mostra un riepilogo e chiede conferma.</p>
          <label>File <input type="file" id="file-storico-fic" accept=".gz,.json"></label>
          <button class="primario" type="button" id="carica-storico-fic">Controlla il file</button>
          <output id="esito-storico-fic"></output>
          <button class="primario" type="button" id="conferma-storico-fic" hidden>Conferma e carica</button>
        </div>
      </details>`, req.query.msg ? String(req.query.msg) : undefined, 'amministrazione.js'));
  });

  /** Legge il file caricato (JSON, anche compresso .gz). */
  const leggiFile = (body: unknown): any => {
    let b = body as Buffer;
    if (!Buffer.isBuffer(b) || !b.length) throw new Error();
    if (b[0] === 0x1f && b[1] === 0x8b) b = gunzipSync(b);
    return JSON.parse(b.toString('utf8'));
  };

  r.post('/clienti-fic', express.raw({ type: '*/*', limit: '20mb' }), async (req, res) => {
    let righe: unknown[];
    try {
      righe = leggiFile(req.body).clienti;
      if (!Array.isArray(righe)) throw new Error();
    } catch { return res.status(400).json({ errore: 'File non valido: serve clienti_fiscali_fic.json.gz' }); }
    res.json(await caricaClientiFiscali(righe, { anteprima: req.query.conferma !== '1' }));
  });

  r.post('/storico-fic', express.raw({ type: '*/*', limit: '30mb' }), async (req, res) => {
    let dati: { documenti?: unknown[]; ricevuti?: unknown[] };
    try {
      dati = leggiFile(req.body);
      if (!Array.isArray(dati.documenti) && !Array.isArray(dati.ricevuti)) throw new Error();
    } catch { return res.status(400).json({ errore: 'File non valido: serve storico_fic.json.gz' }); }
    res.json(await caricaStoricoFic(dati, { anteprima: req.query.conferma !== '1' }));
  });

  r.post('/sdi-webhook', async (req, res) => {
    // indirizzo pubblico del portale: su Render è https (dietro al proxy), in locale quello della richiesta
    const indirizzo = process.env.URL_PORTALE ?? `${req.get('x-forwarded-proto') ?? req.protocol}://${req.get('host')}`;
    try { await collegaWebhook(indirizzo); res.redirect(torna('Invoicetronic collegato: esiti e fatture ricevute arriveranno da soli.', '#sdi')); }
    catch (e: any) { res.redirect(torna(`Non collegato: ${e.message}`, '#sdi')); }
  });

  r.post('/azienda', async (req, res) => {
    const errori = await salvaAzienda(req.body);
    res.redirect(torna(errori.length ? `Non salvato: ${errori.join(' ')}` : 'Dati dell\'azienda salvati.', '#azienda'));
  });

  r.post('/numerazioni', async (req, res) => {
    const { tipo, sezionale = '', anno } = req.body;
    const ultimo = numero(req.body.ultimo_numero);
    const data = String(req.body.ultima_data ?? '') || null;
    if (!Number.isInteger(ultimo) || ultimo < 0) return res.redirect(torna('Numero non valido.', '#numerazioni'));
    if (data && !/^\d{4}-\d{2}-\d{2}$/.test(data)) return res.redirect(torna('Data non valida.', '#numerazioni'));
    // non si può tornare sotto un numero già usato da un documento emesso dal portale
    const usato = await q1<{ max: number | null }>(`SELECT max(numero) AS max FROM documenti WHERE tipo = $1 AND sezionale = $2 AND anno = $3`, [tipo, sezionale, Number(anno)]);
    if (usato?.max != null && ultimo < usato.max) return res.redirect(torna(`Non salvato: il portale ha già emesso il n. ${usato.max}.`, '#numerazioni'));
    await q(`UPDATE numerazioni SET ultimo_numero = $4, ultima_data = $5 WHERE tipo = $1 AND sezionale = $2 AND anno = $3`, [tipo, sezionale, Number(anno), ultimo, data]);
    res.redirect(torna(`${NOMI_TIPO[tipo] ?? tipo} ${anno}: prossimo numero ${numeroCompleto(ultimo + 1, sezionale)}.`, '#numerazioni'));
  });

  const valoriAliquota = (b: any) => {
    const percentuale = numero(b.percentuale || 0);
    const natura = String(b.natura ?? '') || null;
    if (!(percentuale >= 0 && percentuale < 100)) return { errore: 'Percentuale non valida.' };
    if (percentuale === 0 && !natura) return { errore: 'Con percentuale 0 serve la natura (N1, N2.1, N3.5…).' };
    if (percentuale > 0 && natura) return { errore: 'La natura si indica solo con percentuale 0.' };
    return { v: [String(b.descrizione ?? '').trim(), percentuale, natura, String(b.riferimento_normativo ?? '').trim() || null,
      spunta(b.soggetta_bollo), Math.trunc(numero(b.ordine || 0)) || 0, spunta(b.attiva)] };
  };
  r.post('/aliquote/:codice', async (req, res) => {
    const { v, errore } = valoriAliquota(req.body);
    if (errore) return res.redirect(torna(`${req.params.codice}: ${errore} Non salvato.`, '#aliquote'));
    await q(`UPDATE aliquote_iva SET descrizione = $2, percentuale = $3, natura = $4, riferimento_normativo = $5, soggetta_bollo = $6, ordine = $7, attiva = $8
      WHERE codice = $1`, [req.params.codice, ...v!]);
    res.redirect(torna(`${req.params.codice} salvata.`, '#aliquote'));
  });
  r.post('/aliquote', async (req, res) => {
    const codice = String(req.body.codice ?? '').trim().toUpperCase();
    if (!CODICE.test(codice)) return res.redirect(torna('Codice non valido: lettere maiuscole, numeri e _, iniziando con una lettera.', '#aliquote'));
    if (await q1(`SELECT 1 FROM aliquote_iva WHERE codice = $1`, [codice])) return res.redirect(torna(`Il codice ${codice} esiste già.`, '#aliquote'));
    const { v, errore } = valoriAliquota(req.body);
    if (errore) return res.redirect(torna(`${errore} Non aggiunta.`, '#aliquote'));
    if (!v![0]) v![0] = codice;
    await q(`INSERT INTO aliquote_iva (codice, descrizione, percentuale, natura, riferimento_normativo, soggetta_bollo, ordine, attiva)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [codice, ...v!]);
    res.redirect(torna(`${codice} aggiunta.`, '#aliquote'));
  });

  const valoriPagamento = (b: any) => {
    const giorni = numero(b.giorni || 0);
    if (!Number.isInteger(giorni) || giorni < 0 || giorni > 365) return { errore: 'Giorni non validi (da 0 a 365).' };
    const modalita = String(b.modalita ?? 'MP05');
    if (!(modalita in MODALITA)) return { errore: 'Modalità non valida.' };
    return { v: [String(b.descrizione ?? '').trim(), modalita, giorni, spunta(b.fine_mese), Math.trunc(numero(b.ordine || 0)) || 0, spunta(b.attiva)] };
  };
  r.post('/pagamenti/:codice', async (req, res) => {
    const { v, errore } = valoriPagamento(req.body);
    if (errore) return res.redirect(torna(`${req.params.codice}: ${errore} Non salvato.`, '#pagamenti'));
    await q(`UPDATE condizioni_pagamento SET descrizione = $2, modalita = $3, giorni = $4, fine_mese = $5, ordine = $6, attiva = $7 WHERE codice = $1`, [req.params.codice, ...v!]);
    res.redirect(torna(`${req.params.codice} salvata.`, '#pagamenti'));
  });
  r.post('/pagamenti', async (req, res) => {
    const codice = String(req.body.codice ?? '').trim().toUpperCase();
    if (!CODICE.test(codice)) return res.redirect(torna('Codice non valido: lettere maiuscole, numeri e _, iniziando con una lettera.', '#pagamenti'));
    if (await q1(`SELECT 1 FROM condizioni_pagamento WHERE codice = $1`, [codice])) return res.redirect(torna(`Il codice ${codice} esiste già.`, '#pagamenti'));
    const { v, errore } = valoriPagamento(req.body);
    if (errore) return res.redirect(torna(`${errore} Non aggiunta.`, '#pagamenti'));
    if (!v![0]) v![0] = codice;
    await q(`INSERT INTO condizioni_pagamento (codice, descrizione, modalita, giorni, fine_mese, ordine, attiva) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [codice, ...v!]);
    res.redirect(torna(`${codice} aggiunta.`, '#pagamenti'));
  });

  return r;
}
