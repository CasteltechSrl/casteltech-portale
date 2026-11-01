/**
 * Fase 1 della contabilità (Adriano 31/10/2026): bollo virtuale per trimestre, plafond delle lettere d'intento,
 * spese senza fattura elettronica (scontrini, affitto, polizze…). Conti in `engine/fiscale.ts`.
 * Pagine sotto /amministrazione (il profilo Contabilità le vede in sola lettura).
 */
import { Router, type Request } from 'express';
import { q, q1, transazione } from '../db.js';
import { layout } from '../views/layout.js';
import { html, data, euro, raw, type Raw } from '../views/html.js';
import { menuAmministrazione } from './cruscotto-amministrazione.js';
import { TIPI_SPESA, bolloPerTrimestre, spesaDaModulo, testoPlafond, usoPlafond, type UsoPlafond } from '../../engine/fiscale.js';
import { maiuscolo } from '../anagrafiche-servizio.js';
import { annoLetteraIntento } from '../../engine/amministrazione.js';

const oggiRoma = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
const pagina = (req: Request, titolo: string, contenuto: Raw, avviso?: string, script?: string) =>
  String(layout({ titolo, utente: req.session.utente, attiva: 'amministrazione', contenuto, avviso, script, largo: true }));
const msg = (req: Request) => (req.query.msg ? String(req.query.msg) : undefined);
const STATI_OK = `d.stato NOT IN ('bozza', 'annullato', 'scartato') AND d.numero IS NOT NULL`;

// ───────────────────────────── plafond ─────────────────────────────

/**
 * Fatturato senza IVA per lettera d'intento (N3.5) per cliente e anno, dalla data della prima lettera dell'anno.
 * Per documento: le righe con natura N3.5 (aliquota della riga o del cliente); se non ce ne sono e la fattura è senza IVA
 * (storico di Fatture in Cloud senza aliquote sulle righe) l'imponibile del documento.
 */
async function usatoPlafond(filtro: { clienteId?: number; anno: number }): Promise<Map<number, number>> {
  const righe = await q<{ cliente_id: number; usato: number }>(`
    WITH lettere AS (SELECT cliente_id, min(data_protocollo) AS dal FROM dichiarazioni_intento WHERE anno = $1 ${filtro.clienteId ? 'AND cliente_id = $2' : ''} GROUP BY cliente_id),
    doc AS (
      SELECT d.id, d.cliente_id, d.tipo, d.imponibile, d.imposta,
        (SELECT sum(round(r.quantita * r.prezzo * (1 - coalesce(r.sconto, 0) / 100), 2)) FROM documenti_righe r
          JOIN aliquote_iva a ON a.codice = coalesce(r.aliquota_iva, c.aliquota_iva) WHERE r.documento_id = d.id AND NOT r.solo_descrizione AND a.natura = 'N3.5') AS n35
      FROM documenti d JOIN lettere l ON l.cliente_id = d.cliente_id JOIN clienti c ON c.id = d.cliente_id
      WHERE d.tipo IN ('fattura', 'nota_credito') AND ${STATI_OK} AND d.data >= l.dal AND extract(year FROM d.data)::int = $1)
    SELECT cliente_id, sum(CASE WHEN tipo = 'nota_credito' THEN -1 ELSE 1 END * coalesce(nullif(n35, 0), CASE WHEN imposta = 0 THEN imponibile ELSE 0 END))::float AS usato
    FROM doc GROUP BY cliente_id`, filtro.clienteId ? [filtro.anno, filtro.clienteId] : [filtro.anno]);
  return new Map(righe.map(r => [r.cliente_id, Number(r.usato) || 0]));
}

/** Uso del plafond del cliente nell'anno (somma dei plafond delle sue lettere), con l'eventuale fattura nuova. Null se non ha lettere. */
export async function plafondCliente(clienteId: number, anno: number, nuovo = 0): Promise<UsoPlafond | null> {
  const l = await q1<{ n: number; plafond: number | null; senza: number }>(`SELECT count(*)::int AS n, sum(plafond)::float AS plafond, count(*) FILTER (WHERE plafond IS NULL)::int AS senza
    FROM dichiarazioni_intento WHERE cliente_id = $1 AND anno = $2`, [clienteId, anno]);
  if (!l?.n) return null;
  const usato = (await usatoPlafond({ clienteId, anno })).get(clienteId) ?? 0;
  return usoPlafond(l.senza ? null : l.plafond, usato, nuovo);
}

/** Riquadro per la bozza di fattura a un cliente con lettera d'intento (solo se la fattura ha righe N3.5). */
export async function riquadroPlafond(clienteId: number | null, dataDoc: string, nuovoN35: number): Promise<Raw> {
  if (!clienteId || !(nuovoN35 > 0)) return html``;
  const u = await plafondCliente(clienteId, Number(String(dataDoc).slice(0, 4)), nuovoN35);
  if (!u) return html`<div class="avviso">Fattura con lettera d'intento (N3.5), ma il cliente non ha una lettera registrata per il ${String(dataDoc).slice(0, 4)}:
    aggiungila in <a href="/anagrafiche/clienti/${clienteId}/fiscali">Anagrafiche → Clienti → Dati fiscali</a>.</div>`;
  return html`<div class="${u.stato === 'ok' ? 'avviso info' : 'avviso'}"><strong>Lettera d'intento, con questa fattura:</strong> ${testoPlafond(u, euro)}</div>`;
}

/** Sezione "Lettere d'intento" nella pagina Dati fiscali del cliente: elenco con l'uso del plafond, aggiungi, correggi, elimina. */
export async function sezioneLettereIntento(clienteId: number): Promise<Raw> {
  const lettere = await q(`SELECT l.*, (SELECT count(*)::int FROM documenti d WHERE d.dichiarazione_intento_id = l.id) AS usata
    FROM dichiarazioni_intento l WHERE cliente_id = $1 ORDER BY data_protocollo DESC`, [clienteId]);
  const anni = [...new Set(lettere.map((l: any) => Number(l.anno)))];
  const usi = new Map<number, UsoPlafond | null>();
  for (const a of anni) usi.set(a, await plafondCliente(clienteId, a));
  const oggi = oggiRoma();
  return html`<h3 id="lettere">Lettere d'intento</h3>
    <p class="nota">Il cliente esportatore abituale manda la lettera con il protocollo dell'Agenzia e l'importo massimo (plafond) che può comprare senza IVA.
      Il portale somma le fatture N3.5 dell'anno dalla data della lettera e avvisa dall'80 %.</p>
    ${lettere.length ? html`<div class="tabella-scorre"><table class="elenco">
      <thead><tr><th>Protocollo</th><th>Data</th><th>Anno</th><th class="num">Plafond</th><th>Uso nell'anno</th><th></th></tr></thead>
      <tbody>${lettere.map((l: any) => {
        const u = usi.get(Number(l.anno));
        return html`<tr><td>${l.protocollo}</td><td>${data(l.data_protocollo)}</td><td>${l.anno}</td>
          <td class="num"><form method="post" action="/amministrazione/lettere-intento/${l.id}" class="inline">
            <input name="plafond" value="${l.plafond != null ? String(l.plafond).replace('.', ',') : ''}" inputmode="decimal" size="10" placeholder="da scrivere"> <button>Salva</button></form></td>
          <td class="${u?.stato === 'superato' ? 'negativo' : ''}">${u ? testoPlafond(u, euro) : ''}</td>
          <td>${l.usata ? '' : html`<form method="post" action="/amministrazione/lettere-intento/${l.id}/elimina" class="inline" data-conferma="Eliminare la lettera ${l.protocollo}?"><button class="pericolo">Elimina</button></form>`}</td></tr>`;
      })}</tbody></table></div>` : html`<p class="vuoto">Nessuna lettera d'intento.</p>`}
    <form method="post" action="/amministrazione/lettere-intento" class="blocco">
      <input type="hidden" name="cliente_id" value="${clienteId}">
      <div class="riga-campi">
        <label>Protocollo dell'Agenzia <input name="protocollo" required placeholder="es. 26021609544759358-000006"></label>
        <label class="stretto">Data del protocollo <input type="date" name="data_protocollo" required value="${oggi}"></label>
        <label class="stretto">Plafond (€) <input name="plafond" inputmode="decimal"></label>
        <label>Note <input name="note"></label>
      </div>
      <div class="barra-azioni"><button>Aggiungi lettera</button></div>
    </form>`;
}

const numero = (v: unknown) => {
  const t = String(v ?? '').trim().replace(/\s|€/g, '');
  if (!t) return null;
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};

export function rotteFiscale() {
  const r = Router();

  // ── lettere d'intento ──
  r.get('/lettere-intento', async (req, res) => {
    const anno = Number(req.query.anno) || Number(oggiRoma().slice(0, 4));
    const [lettere, usati] = await Promise.all([
      q(`SELECT l.cliente_id, c.ragione_sociale, count(*)::int AS lettere, sum(l.plafond)::float AS plafond, count(*) FILTER (WHERE l.plafond IS NULL)::int AS senza,
          string_agg(l.protocollo, ', ' ORDER BY l.data_protocollo) AS protocolli, min(l.data_protocollo) AS dal
        FROM dichiarazioni_intento l JOIN clienti c ON c.id = l.cliente_id WHERE l.anno = $1 GROUP BY 1, 2 ORDER BY 2`, [anno]),
      usatoPlafond({ anno }),
    ]);
    const righe: (Record<string, any> & { uso: UsoPlafond })[] = lettere.map((l: any) => ({ ...l, uso: usoPlafond(l.senza ? null : l.plafond, usati.get(l.cliente_id) ?? 0) }));
    const ordine = { superato: 0, vicino: 1, senza_plafond: 2, ok: 3 } as const;
    righe.sort((a, b) => ordine[a.uso.stato] - ordine[b.uso.stato]);
    const anni = Array.from({ length: 4 }, (_, i) => Number(oggiRoma().slice(0, 4)) + 1 - i);
    res.send(pagina(req, `Lettere d'intento ${anno}`, html`
      <div class="intestazione-pagina"><h1>Lettere d'intento · ${anno}</h1></div>
      ${menuAmministrazione('fiscale')}
      ${menuFiscale('lettere')}
      <form class="cerca" method="get"><select name="anno">${anni.map(a => html`<option ${a === anno ? raw('selected') : ''}>${a}</option>`)}</select><button>Mostra</button></form>
      <p class="nota">Per ogni cliente esportatore abituale: plafond delle lettere dell'anno e fatture senza IVA (N3.5) emesse dalla data della prima lettera.
        Le lettere si aggiungono e si correggono in Anagrafiche → Clienti → Dati fiscali.</p>
      ${righe.length ? html`<div class="tabella-scorre"><table class="elenco">
        <thead><tr><th>Cliente</th><th>Protocolli</th><th class="num">Plafond</th><th class="num">Fatturato N3.5</th><th class="num">Resta</th><th class="num">Uso</th><th></th></tr></thead>
        <tbody>${righe.map(x => html`<tr class="${x.uso.stato === 'superato' ? 'scaduta' : ''}">
          <td>${x.ragione_sociale}</td><td><span class="nota taglia">${x.protocolli}</span></td>
          <td class="num">${x.uso.plafond != null ? euro(x.uso.plafond) : html`<span class="etichetta">da scrivere</span>`}</td>
          <td class="num">${euro(x.uso.usato)}</td><td class="num ${x.uso.residuo != null && x.uso.residuo < 0 ? 'negativo' : ''}">${x.uso.residuo != null ? euro(x.uso.residuo) : ''}</td>
          <td class="num">${x.uso.percentuale != null ? html`<strong class="${x.uso.stato === 'ok' ? '' : 'negativo'}">${x.uso.percentuale}%</strong>` : ''}</td>
          <td><a href="/anagrafiche/clienti/${x.cliente_id}/fiscali#lettere">Lettere</a></td></tr>`)}</tbody></table></div>`
        : html`<p class="vuoto">Nessuna lettera d'intento per il ${anno}.</p>`}`, msg(req)));
  });
  r.post('/lettere-intento', async (req, res) => {
    const b = req.body ?? {}, clienteId = Number(b.cliente_id);
    const torna = (m: string) => res.redirect(`/anagrafiche/clienti/${clienteId}/fiscali?msg=${encodeURIComponent(m)}#lettere`);
    const protocollo = String(b.protocollo ?? '').trim(), dataProt = String(b.data_protocollo ?? '');
    if (!clienteId || !protocollo || !/^\d{4}-\d{2}-\d{2}$/.test(dataProt)) return torna('Servono protocollo e data della lettera.');
    if (await q1(`SELECT 1 FROM dichiarazioni_intento WHERE protocollo = $1`, [protocollo])) return torna(`La lettera ${protocollo} è già registrata.`);
    await q(`INSERT INTO dichiarazioni_intento (cliente_id, protocollo, data_protocollo, anno, plafond, note) VALUES ($1, $2, $3, $4, $5, nullif($6, ''))`,
      [clienteId, protocollo, dataProt, annoLetteraIntento(dataProt), numero(b.plafond), String(b.note ?? '').trim()]);
    torna(`Lettera ${protocollo} aggiunta.`);
  });
  r.post('/lettere-intento/:id', async (req, res) => {
    const l = await q1(`UPDATE dichiarazioni_intento SET plafond = $2 WHERE id = $1 RETURNING cliente_id`, [Number(req.params.id), numero(req.body?.plafond)]);
    res.redirect(l ? `/anagrafiche/clienti/${l.cliente_id}/fiscali?msg=${encodeURIComponent('Plafond salvato.')}#lettere` : '/amministrazione/lettere-intento');
  });
  r.post('/lettere-intento/:id/elimina', async (req, res) => {
    const id = Number(req.params.id);
    const l = await q1(`SELECT cliente_id, protocollo, (SELECT count(*)::int FROM documenti WHERE dichiarazione_intento_id = $1) AS usata FROM dichiarazioni_intento WHERE id = $1`, [id]);
    if (!l) return res.redirect('/amministrazione/lettere-intento');
    if (l.usata) return res.redirect(`/anagrafiche/clienti/${l.cliente_id}/fiscali?msg=${encodeURIComponent('La lettera è citata in fatture emesse: non si elimina.')}#lettere`);
    await q(`DELETE FROM dichiarazioni_intento WHERE id = $1`, [id]);
    res.redirect(`/anagrafiche/clienti/${l.cliente_id}/fiscali?msg=${encodeURIComponent(`Lettera ${l.protocollo} eliminata.`)}#lettere`);
  });

  // ── bollo virtuale ──
  r.get('/bollo', async (req, res) => {
    const oggi = oggiRoma(), anno = Number(req.query.anno) || Number(oggi.slice(0, 4));
    const documenti = await q<{ id: number; tipo: string; numero: number; sezionale: string; data: string; bollo: number; nome: string }>(`
      SELECT d.id, d.tipo, d.numero, d.sezionale, to_char(d.data, 'YYYY-MM-DD') AS data, d.bollo::float AS bollo,
        coalesce(c.ragione_sociale, d.intestatario->>'ragione_sociale', d.intestatario->>'nome', '') AS nome
      FROM documenti d LEFT JOIN clienti c ON c.id = d.cliente_id
      WHERE d.tipo IN ('fattura', 'nota_credito') AND ${STATI_OK} AND d.bollo > 0 AND extract(year FROM d.data)::int = $1 ORDER BY d.data, d.numero`, [anno]);
    const trimestri = bolloPerTrimestre(anno, documenti, oggi);
    const anni = Array.from({ length: 3 }, (_, i) => Number(oggi.slice(0, 4)) - i);
    res.send(pagina(req, `Bollo virtuale ${anno}`, html`
      <div class="intestazione-pagina"><h1>Bollo virtuale · ${anno}</h1><div class="azioni non-stampare"><button type="button" id="stampa">Stampa</button></div></div>
      <div class="non-stampare">${menuAmministrazione('fiscale')}${menuFiscale('bollo')}</div>
      <form class="cerca non-stampare" method="get"><select name="anno">${anni.map(a => html`<option ${a === anno ? raw('selected') : ''}>${a}</option>`)}</select><button>Mostra</button></form>
      <p class="nota">Bollo da 2 € sulle fatture senza IVA oltre 77,47 € (es. lettera d'intento, non imponibili). Si versa con l'F24 ogni trimestre;
        l'Agenzia mette l'importo già calcolato nel portale Fatture e corrispettivi: questi sono i conti del portale per controllarlo.</p>
      <div class="tabella-scorre"><table class="elenco">
        <thead><tr><th>Trimestre</th><th class="num">Fatture</th><th class="num">Bollo</th><th>Codice tributo</th><th>Da versare entro</th><th></th></tr></thead>
        <tbody>${trimestri.map(t => html`<tr><td>${t.trimestre}° trimestre</td><td class="num">${t.documenti}</td><td class="num">${euro(t.importo)}</td>
          <td>${t.importo ? t.codice : ''}</td><td>${t.importo ? html`<strong>${data(t.scadenza)}</strong>` : ''}</td>
          <td><span class="nota">${t.rinviato ? 'sotto 5.000 €: si versa con il trimestre dopo (codice del suo trimestre)' : !t.chiuso ? 'trimestre in corso' : ''}</span></td></tr>`)}
          <tr class="totale-riga"><td><strong>Anno</strong></td><td class="num"><strong>${documenti.length}</strong></td><td class="num"><strong>${euro(trimestri.reduce((s, t) => s + t.importo, 0))}</strong></td><td colspan="3"></td></tr></tbody></table></div>
      <h2>Fatture con il bollo · ${documenti.length}</h2>
      ${documenti.length ? html`<div class="tabella-scorre limitata"><table class="elenco">
        <thead><tr><th>Data</th><th>Numero</th><th>Cliente</th><th class="num">Bollo</th></tr></thead>
        <tbody>${documenti.map(d => html`<tr><td>${data(d.data)}</td><td><a href="/amministrazione/documenti/${d.id}">${d.tipo === 'nota_credito' ? 'NC ' : ''}${d.numero}${d.sezionale ? `/${d.sezionale}` : ''}</a></td>
          <td>${d.nome}</td><td class="num">${euro(d.bollo)}</td></tr>`)}</tbody></table></div>` : html`<p class="vuoto">Nessuna fattura con il bollo nel ${anno}.</p>`}`, msg(req), 'stampa.js'));
  });

  // ── spese senza fattura elettronica ──
  r.get('/spese', async (req, res) => {
    const anno = Number(req.query.anno) || Number(oggiRoma().slice(0, 4));
    const spese = await q(`SELECT d.*, to_char(d.data, 'YYYY-MM-DD') AS data_testo, (SELECT bool_and(pagata_il IS NOT NULL) FROM documenti_ricevuti_scadenze s WHERE s.documento_id = d.id) AS pagata
      FROM documenti_ricevuti d WHERE NOT d.elettronica AND extract(year FROM d.data)::int = $1 ORDER BY d.data DESC, d.id DESC`, [anno]);
    const conti = (await q<{ conto: string }>(`SELECT conto FROM documenti_ricevuti_scadenze WHERE coalesce(conto, '') <> '' GROUP BY conto ORDER BY count(*) DESC LIMIT 10`)).map(c => c.conto);
    const anni = Array.from({ length: 3 }, (_, i) => Number(oggiRoma().slice(0, 4)) - i);
    res.send(pagina(req, `Spese senza fattura elettronica ${anno}`, html`
      <div class="intestazione-pagina"><h1>Spese senza fattura elettronica · ${anno}</h1></div>
      ${menuAmministrazione('fiscale')}
      ${menuFiscale('spese')}
      <p class="nota">Scontrini, affitto pagato a un privato, polizze, spese bancarie, imposte, valori bollati, fatture di carta: le spese che non arrivano dallo SdI.
        Entrano nelle fatture fornitori (scadenzario e analisi), non nel registro IVA, salvo una fattura cartacea con l'IVA.</p>
      <form method="post" action="/amministrazione/spese" class="blocco">
        <div class="riga-campi">
          <label class="stretto">Data <input type="date" name="data" required value="${oggiRoma()}"></label>
          <label>Tipo <select name="tipo">${TIPI_SPESA.map(t => html`<option>${t}</option>`)}</select></label>
          <label>A chi <input name="controparte" class="maiuscolo" required placeholder="negozio, proprietario, assicurazione…"></label>
          <label class="stretto">Numero <input name="numero" placeholder="facoltativo"></label>
          <label class="stretto">Totale (€) <input name="totale" inputmode="decimal" required></label>
          <label class="stretto" title="Solo per una fattura cartacea con l'IVA">IVA (€) <input name="imposta" inputmode="decimal" placeholder="0"></label>
        </div>
        <div class="riga-campi">
          <label class="largo">Descrizione <input name="descrizione" placeholder="es. affitto capannone novembre, polizza RC annuale"></label>
          <label class="spunta"><input type="checkbox" name="pagata" checked> Già pagata</label>
          <label class="stretto">Il <input type="date" name="pagata_il"></label>
          <label>Conto <input name="conto" list="conti-spese"><datalist id="conti-spese">${conti.map(c => html`<option value="${c}">`)}</datalist></label>
        </div>
        <div class="barra-azioni"><button class="primario">Registra la spesa</button></div>
      </form>
      <form class="cerca" method="get"><select name="anno">${anni.map(a => html`<option ${a === anno ? raw('selected') : ''}>${a}</option>`)}</select><button>Mostra</button></form>
      ${spese.length ? html`<div class="tabella-scorre limitata"><table class="elenco">
        <thead><tr><th>Data</th><th>Tipo</th><th>A chi</th><th>Descrizione</th><th class="num">Totale</th><th>Pagata</th><th></th></tr></thead>
        <tbody>${spese.map((s: any) => html`<tr><td>${data(s.data_testo)}</td><td>${s.categoria ?? ''}</td>
          <td><a href="/amministrazione/ricevuti/${s.id}">${s.intestatario?.nome ?? ''}</a>${s.origine === 'fic' ? html` <span class="etichetta">FIC</span>` : ''}</td>
          <td><span class="nota taglia">${s.descrizione ?? ''}</span></td><td class="num">${euro(Number(s.totale))}</td><td>${s.pagata ? 'sì' : html`<strong>no</strong>`}</td>
          <td>${s.origine === 'manuale' ? html`<form method="post" action="/amministrazione/spese/${s.id}/elimina" class="inline" data-conferma="Eliminare questa spesa?"><button class="pericolo">Elimina</button></form>` : ''}</td></tr>`)}</tbody></table></div>`
        : html`<p class="vuoto">Nessuna spesa senza fattura elettronica nel ${anno}.</p>`}`, msg(req)));
  });
  r.post('/spese', async (req, res) => {
    const { spesa: s, errori } = spesaDaModulo(req.body ?? {});
    if (errori.length) return res.redirect(`/amministrazione/spese?msg=${encodeURIComponent(`Non registrata: ${errori.join(' ')}`)}`);
    await transazione(async c => {
      const { rows: [d] } = await c.query(`INSERT INTO documenti_ricevuti (tipo, numero, data, intestatario, descrizione, categoria, imponibile, imposta, totale, elettronica, origine)
        VALUES ('fattura', $1, $2, $3, nullif($4, ''), $5, $6, $7, $8, false, 'manuale') RETURNING id`,
        [s.numero, s.data, JSON.stringify({ nome: maiuscolo(s.controparte) }), s.descrizione, s.tipo, s.imponibile, s.imposta, s.totale]);
      await c.query(`INSERT INTO documenti_ricevuti_scadenze (documento_id, data, importo, pagata_il, conto) VALUES ($1, $2, $3, $4, $5)`,
        [d.id, s.data, s.totale, s.pagataIl, s.pagataIl ? s.conto : null]);
    });
    res.redirect(`/amministrazione/spese?anno=${s.data.slice(0, 4)}&msg=${encodeURIComponent(`Spesa di ${euro(s.totale)} registrata.`)}`);
  });
  r.post('/spese/:id/elimina', async (req, res) => {
    const d = await q1(`DELETE FROM documenti_ricevuti WHERE id = $1 AND origine = 'manuale' AND NOT elettronica RETURNING data`, [Number(req.params.id)]);
    res.redirect(`/amministrazione/spese${d ? `?anno=${String(d.data instanceof Date ? d.data.toISOString() : d.data).slice(0, 4)}&msg=${encodeURIComponent('Spesa eliminata.')}` : ''}`);
  });

  return r;
}

/** Tasti della sezione "Adempimenti": bollo, lettere d'intento, spese senza fattura elettronica. */
function menuFiscale(attiva: 'bollo' | 'lettere' | 'spese'): Raw {
  const voci = [['spese', '/amministrazione/spese', 'Spese senza fattura elettronica'], ['bollo', '/amministrazione/bollo', 'Bollo virtuale'],
    ['lettere', '/amministrazione/lettere-intento', "Lettere d'intento"]] as const;
  return html`<nav class="tasti-sezione secondari">${voci.map(([k, href, nome]) => html`<a href="${href}" class="${k === attiva ? 'attivo' : ''}">${nome}</a>`)}</nav>`;
}
