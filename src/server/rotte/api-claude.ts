/**
 * Indirizzi per il controllo settimanale dei suggerimenti fatto da Claude (Adriano 1/11/2026):
 * "una volta a settimana verifica la sezione suggerimenti e fai gli update".
 * Niente sessione del portale: Claude si presenta con la chiave creata in Suggerimenti (impostazioni 'claude_api'),
 * nell'intestazione x-chiave-portale o come Authorization: Bearer (Segreti di rete del progetto). Può solo leggere i suggerimenti e scrivere stato, domanda/risposta e una riga di note.
 *
 *   GET  /api/claude/suggerimenti            → aperti (con ?tutti=1 anche fatti e scartati)
 *   POST /api/claude/suggerimenti/:id        → { stato?, risposta?, nota? }
 *   GET  /api/claude/storico                 → quanti documenti per tipo, anno e origine (solo numeri)
 *   GET  /api/claude/storico/fic?anno=2026   → i documenti arrivati da Fatture in Cloud di un anno, uno per riga, con il loro fic_id
 *                                              (allineamento con FIC, Adriano 6/11/2026: solo numeri, importi, stati e scadenze, niente nomi)
 *   GET  /api/claude/documentazione?anno=    → prodotti venduti nell'anno con le revisioni dei documenti già caricate (Adriano 6/11/2026)
 *   POST /api/claude/documentazione          → { cliente, codice, riassunto, revisione?, cartella?, note?, sostituisci? } = revisione dalle cartelle del Drive
 *   GET  /api/claude/spazio                  → spazio occupato su Neon per tabella
 *   GET  /api/claude/banca                   → conti con il saldo di oggi, movimenti caricati per conto e stato (Adriano 7/11/2026)
 *   POST /api/claude/banca/conti             → { conti: [{numero, nome, tipo, saldoData, saldo, fido}], fidoAnticipi? }
 *   POST /api/claude/banca/movimenti         → { nome, base64, conto? } = estratto conto (CSV/CBI/Excel) mandato da Adriano, senza doppioni
 *   GET  /api/claude/caricamenti             → controllo dei file caricati dall'ufficio (Adriano 7/11/2026): sedi operative, componenti clienti,
 *                                              ordini da e-mail con righe di schede ancora senza prodotto e le loro conferme (solo conteggi e numeri)
 */
import { Router, type NextFunction, type Request, type Response } from 'express';
import { randomBytes } from 'node:crypto';
import { q, q1 } from '../db.js';
import { chiaveGiusta } from '../../engine/gmail.js';
import { statoInvoicetronic, ultimeRicevute } from '../invoicetronic.js';
import { aggiornamentoDaClaude, aggiungiNota, chiuso, ordinaSuggerimenti } from '../../engine/suggerimenti.js';
import { eliminaRevisione, prodottiVendutiNellAnno, salvaRevisione, spazioTabelle, trovaProdotto } from '../documenti-prodotto-servizio.js';
import { testoConfronto } from '../../engine/documenti-prodotto.js';
import { caricaMovimenti, contiConSaldo, fidoAnticipi, leggiEstrattoConto, salvaConti } from '../banca-servizio.js';
import { dataDa, numeroConto, type ContoBanca } from '../../engine/banca.js';

// la chiave si tiene in memoria dopo la prima lettura (Neon: niente query a ogni chiamata)
let chiaveInMemoria: string | null | undefined;

export async function leggiChiaveClaude(): Promise<string | null> {
  if (chiaveInMemoria !== undefined) return chiaveInMemoria;
  const r = await q1<{ valore: { chiave?: string } }>(`SELECT valore FROM impostazioni WHERE chiave = 'claude_api'`);
  chiaveInMemoria = r?.valore?.chiave ?? null;
  return chiaveInMemoria;
}

export async function nuovaChiaveClaude(): Promise<string> {
  const chiave = randomBytes(24).toString('base64url');
  await q(`INSERT INTO impostazioni (chiave, valore) VALUES ('claude_api', $1)
    ON CONFLICT (chiave) DO UPDATE SET valore = $1, aggiornato_il = now()`, [JSON.stringify({ chiave })]);
  chiaveInMemoria = chiave;
  return chiave;
}

/**
 * La chiave arriva nell'intestazione x-chiave-portale oppure come "Authorization: Bearer <chiave>":
 * i "Segreti di rete" del progetto la aggiungono da soli alle richieste verso il portale, così Claude non la vede mai.
 */
export function chiaveDallaRichiesta(req: Pick<Request, 'get'>): string | undefined {
  const diretta = req.get('x-chiave-portale');
  if (diretta) return diretta;
  const m = /^Bearer\s+(\S+)\s*$/i.exec(req.get('authorization') ?? '');
  return m?.[1];
}

const oggiIt = () => new Date().toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' });

export function rotteApiClaude() {
  const r = Router();

  r.use(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const attesa = await leggiChiaveClaude();
      if (!chiaveGiusta(chiaveDallaRichiesta(req), attesa ?? undefined))
        return res.status(401).json({ errore: attesa ? 'Chiave non valida.' : 'Chiave non ancora creata: Suggerimenti → Collegamento con Claude.' });
      next();
    } catch (e) { next(e); }
  });

  r.get('/suggerimenti', async (req, res) => {
    const righe = ordinaSuggerimenti(await q(`SELECT id, titolo, descrizione, area, proposto_da, to_char(proposto_il, 'YYYY-MM-DD') AS proposto_il,
        priorita, stato, note, risposta, risposta_da, risposta_il, aggiornato_il FROM suggerimenti`));
    res.json({ suggerimenti: req.query.tutti === '1' ? righe : righe.filter(s => !chiuso(s.stato)) });
  });

  // Avvii e arresti del portale su Render degli ultimi 7 giorni (Adriano 2/11/2026): Claude controlla se un riavvio
  // segnalato è memoria esaurita o un riavvio regolare. Solo lettura, niente dati dei clienti.
  r.get('/eventi-render', async (_req, res) => {
    res.json({ eventi: await q(`SELECT il, tipo, messaggio, dati FROM eventi_servizi WHERE servizio = 'render'
      AND il > now() - interval '7 days' ORDER BY il DESC, id DESC LIMIT 60`) });
  });

  // Quanto storico c'è nel portale (Adriano 5/11/2026, analisi di prodotti e clienti: "verificare che lo storico FIC degli anni passati
  // sia importato"): documenti emessi per tipo, anno e origine, e righe con codice prodotto. Solo numeri, niente dati dei clienti.
  r.get('/storico', async (_req, res) => {
    res.json({
      documenti: await q(`SELECT tipo, anno, origine, count(*)::int AS n, sum(imponibile)::float AS imponibile FROM documenti
        WHERE stato NOT IN ('bozza', 'annullato', 'scartato') AND numero IS NOT NULL GROUP BY 1, 2, 3 ORDER BY 2, 1, 3`),
      righeConCodice: await q(`SELECT d.anno, count(*)::int AS n, count(r.prodotto_id)::int AS "conProdotto" FROM documenti_righe r JOIN documenti d ON d.id = r.documento_id
        WHERE d.tipo IN ('fattura', 'nota_credito', 'ddt') AND NOT r.solo_descrizione AND coalesce(trim(r.codice), '') <> '' GROUP BY 1 ORDER BY 1`),
      ricevuti: await q(`SELECT extract(year FROM data)::int AS anno, origine, count(*)::int AS n FROM documenti_ricevuti GROUP BY 1, 2 ORDER BY 1, 2`),
    });
  });

  // Allineamento con Fatture in Cloud (Adriano 6/11/2026, "verifica che tutti i dati presenti in FIC siano allineati"):
  // per ogni documento emesso o ricevuto con fic_id dell'anno chiesto, numero, data, importi, stato e scadenze (importo, data, pagata il).
  // Niente intestatari né descrizioni: serve solo a confrontare id, numeri e totali con FIC.
  r.get('/storico/fic', async (req, res) => {
    const anno = Number(req.query.anno) || new Date().getFullYear();
    res.json({
      anno,
      documenti: await q(`SELECT d.fic_id AS "ficId", d.tipo, d.sezionale, d.numero, d.data::text, d.stato, d.sdi_stato AS "sdiStato",
          d.imponibile::float, d.imposta::float, d.totale::float, f.fic_id AS "fatturaFicId",
          (SELECT json_agg(json_build_object('importo', s.importo::float, 'data', s.data::text, 'pagataIl', s.pagata_il::text) ORDER BY s.data, s.id)
             FROM documenti_scadenze s WHERE s.documento_id = d.id) AS scadenze
        FROM documenti d LEFT JOIN documenti f ON f.id = d.fattura_id
        WHERE d.fic_id IS NOT NULL AND d.anno = $1 ORDER BY d.tipo, d.sezionale, d.numero`, [anno]),
      ricevuti: await q(`SELECT r.fic_id AS "ficId", r.tipo, r.numero, r.data::text, r.imponibile::float, r.imposta::float, r.totale::float, r.elettronica,
          (SELECT json_agg(json_build_object('importo', s.importo::float, 'data', s.data::text, 'pagataIl', s.pagata_il::text) ORDER BY s.data, s.id)
             FROM documenti_ricevuti_scadenze s WHERE s.documento_id = r.id) AS scadenze
        FROM documenti_ricevuti r WHERE r.fic_id IS NOT NULL AND extract(year FROM r.data) = $1 ORDER BY r.data, r.id`, [anno]),
    });
  });

  // Stato dell'invio allo SdI (Adriano 6/11/2026, passaggio alla chiave reale di Invoicetronic): ambiente della chiave, crediti, esiti collegati,
  // ultimi invii e ultime fatture ricevute, numerazioni dell'anno. Claude verifica da qui che invio e ricezione reali funzionino. Niente nomi di clienti né segreti.
  r.get('/sdi', async (_req, res) => {
    const stato = await statoInvoicetronic();
    const anno = new Date().getFullYear();
    res.json({
      ambiente: stato.ambiente, operazioni: stato.operazioni ?? null, errore: stato.errore ?? null,
      webhook: stato.webhook ? { url: stato.webhook.url, collegato_il: stato.webhook.collegato_il } : null,
      invii: await q(`SELECT i.id, i.documento_id, d.tipo, d.sezionale, d.numero, d.stato AS stato_documento, i.ambiente, i.stato, i.identificativo, i.messaggio, i.inviato_il, i.aggiornato_il
        FROM sdi_invii i JOIN documenti d ON d.id = i.documento_id ORDER BY i.id DESC LIMIT 20`),
      ricevute: await ultimeRicevute(),
      ricevuti_sdi: await q(`SELECT numero, data::text, totale::float, ricevuto_il::text FROM documenti_ricevuti WHERE origine = 'sdi' ORDER BY ricevuto_il DESC NULLS LAST, id DESC LIMIT 20`),
      numerazioni: await q(`SELECT tipo, sezionale, anno, ultimo_numero, ultima_data::text FROM numerazioni WHERE anno = $1 ORDER BY tipo, sezionale`, [anno]),
    });
  });

  // Documentazione dei prodotti dalle cartelle del Drive (Adriano 6/11/2026): Claude legge i file sul PC dell'ufficio, calcola il riassunto
  // con lo stesso motore del portale e lo manda qui; nel portale entra solo il riassunto (i file restano sul Drive, niente peso su Neon).
  r.get('/documentazione', async (req, res) => {
    const anno = /^\d{4}$/.test(String(req.query.anno ?? '')) ? Number(req.query.anno) : new Date().getFullYear();
    res.json({ anno, prodotti: await prodottiVendutiNellAnno(anno) });
  });

  r.post('/documentazione', async (req, res) => {
    const b = req.body ?? {};
    const cliente = String(b.cliente ?? '').trim(), codice = String(b.codice ?? '').trim();
    if (!cliente || !codice || !b.riassunto || !Array.isArray(b.riassunto.componenti)) return res.status(400).json({ errore: 'Servono cliente, codice e riassunto.' });
    const p = await trovaProdotto(cliente, codice);
    if (!p) return res.status(404).json({ errore: `Prodotto ${codice} di ${cliente} non trovato in anagrafica (o più di uno).` });
    // "sostituisci": id di una revisione dello stesso prodotto letta male (es. BOM .xls non letta la prima volta), tolta prima di salvare quella nuova
    const sostituisci = Number(b.sostituisci);
    if (Number.isInteger(sostituisci) && sostituisci > 0 && !(await eliminaRevisione(p.id, sostituisci)))
      return res.status(404).json({ errore: `Revisione ${sostituisci} del prodotto ${codice} non trovata.` });
    const esito = await salvaRevisione({ prodottoId: p.id, riassunto: b.riassunto, revisione: typeof b.revisione === 'string' ? b.revisione : null,
      nomi: Array.isArray(b.nomi) ? b.nomi.map(String) : undefined, caricatoDa: 'Claude', origine: 'drive',
      cartella: typeof b.cartella === 'string' ? b.cartella.slice(0, 500) : null, note: typeof b.note === 'string' ? b.note.slice(0, 500) : null });
    res.json({ ok: true, prodotto: p, id: esito.id, revisione: esito.revisione,
      confronto: esito.confronto && esito.precedente ? testoConfronto(esito.confronto, esito.precedente.revisione, esito.revisione) : null });
  });

  r.get('/caricamenti', async (_req, res) => {
    res.json({
      sediOperative: await q1(`SELECT count(*) FILTER (WHERE sede_operativa_diversa)::int AS "clientiConSede", count(*)::int AS clienti FROM clienti`),
      componentiClienti: await q(`SELECT c.ragione_sociale AS cliente, count(*)::int AS codici, max(k.aggiornato_il) AS "ultimoAggiornamento"
        FROM componenti_clienti k JOIN clienti c ON c.id = k.cliente_id GROUP BY c.ragione_sociale ORDER BY 2 DESC`),
      ordiniEmail: await q(`SELECT o.anno, o.numero, o.cliente_nome AS cliente,
          count(*) FILTER (WHERE r.tipo = 'scheda')::int AS schede, count(*) FILTER (WHERE r.tipo = 'scheda' AND r.prodotto_id IS NULL)::int AS "schedeSenzaProdotto",
          (SELECT string_agg(d.numero::text || ' (' || d.stato || ')', ', ') FROM documenti d WHERE d.ordine_id = o.id AND d.tipo = 'conferma_ordine') AS conferme
        FROM ordini o LEFT JOIN ordini_righe r ON r.ordine_id = o.id WHERE o.numero >= 9001 GROUP BY o.id ORDER BY o.anno, o.numero`),
    });
  });

  // Banca (Adriano 7/11/2026): Claude carica l'estratto conto mandato da Adriano nel progetto e scrive i conti (nomi, tipo, saldo dell'estratto conto, fido).
  // Nessun abbinamento da qui: le fatture le conferma l'ufficio nella pagina Banca.
  r.get('/banca', async (_req, res) => {
    res.json({ conti: await contiConSaldo(), fidoAnticipi: await fidoAnticipi(),
      movimenti: await q(`SELECT conto, stato, count(*)::int AS quanti, min(data)::text AS dal, max(data)::text AS al FROM banca_movimenti GROUP BY 1, 2 ORDER BY 1, 2`) });
  });
  r.post('/banca/conti', async (req, res) => {
    const b = req.body ?? {};
    if (!Array.isArray(b.conti)) return res.status(400).json({ errore: 'Serve conti: [{numero, nome, tipo, saldoData, saldo, fido}].' });
    const conti: ContoBanca[] = b.conti.map((c: any) => ({ numero: numeroConto(c.numero), nome: String(c.nome ?? '').toUpperCase().slice(0, 60) || numeroConto(c.numero),
      tipo: c.tipo === 'anticipo' ? 'anticipo' : 'ordinario', saldoData: dataDa(c.saldoData), saldo: typeof c.saldo === 'number' ? c.saldo : null,
      fido: typeof c.fido === 'number' ? c.fido : null }));
    await salvaConti(conti, typeof b.fidoAnticipi === 'number' ? b.fidoAnticipi : undefined);
    res.json({ ok: true, conti: await contiConSaldo() });
  });
  r.post('/banca/movimenti', async (req, res) => {
    const b = req.body ?? {};
    const nome = String(b.nome ?? '').trim();
    if (!nome || typeof b.base64 !== 'string') return res.status(400).json({ errore: 'Servono nome e base64 del file.' });
    const letti = await leggiEstrattoConto(nome, Buffer.from(b.base64, 'base64'));
    if (letti.errore) return res.status(400).json({ errore: letti.errore });
    res.json({ formato: letti.formato, letti: letti.movimenti.length, ...(await caricaMovimenti(letti.movimenti, String(b.conto ?? ''), nome)) });
  });

  r.get('/spazio', async (_req, res) => {
    const tabelle = await spazioTabelle();
    res.json({ totaleByte: tabelle.reduce((t, x) => t + x.byte, 0), tabelle });
  });

  r.post('/suggerimenti/:id', async (req, res) => {
    const id = Number(req.params.id);
    const { stato, risposta, nota, errore } = aggiornamentoDaClaude(req.body ?? {}, oggiIt());
    if (errore) return res.status(400).json({ errore });
    const s = await q1<{ note: string | null }>(`SELECT note FROM suggerimenti WHERE id = $1`, [id]);
    if (!s) return res.status(404).json({ errore: 'Suggerimento non trovato.' });
    const agg = await q1(`UPDATE suggerimenti SET stato = coalesce($2, stato), note = $3,
        risposta = coalesce($4, risposta),
        risposta_da = CASE WHEN $4::text IS NULL THEN risposta_da ELSE 'Claude' END,
        risposta_il = CASE WHEN $4::text IS NULL THEN risposta_il ELSE now() END,
        aggiornato_il = now()
      WHERE id = $1 RETURNING id, titolo, stato, note, risposta`, [id, stato, aggiungiNota(s.note, nota), risposta]);
    res.json({ ok: true, suggerimento: agg });
  });

  return r;
}
