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
 */
import { Router, type NextFunction, type Request, type Response } from 'express';
import { randomBytes } from 'node:crypto';
import { q, q1 } from '../db.js';
import { chiaveGiusta } from '../../engine/gmail.js';
import { statoInvoicetronic, ultimeRicevute } from '../invoicetronic.js';
import { aggiornamentoDaClaude, aggiungiNota, chiuso, ordinaSuggerimenti } from '../../engine/suggerimenti.js';

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
