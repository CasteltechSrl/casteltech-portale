/**
 * Indirizzi che riceve il pulsante "Portale Casteltech" dentro Gmail (Adriano, 29/10/2026; pannello in tools/gmail-addon/).
 * Niente sessione del portale: il pannello si presenta con la chiave GMAIL_ADDON_CHIAVE (solo su Render e nelle proprietà
 * dello script Google) e con l'email di chi l'ha premuto, che se è un utente ufficio del portale firma il caricamento.
 *
 *  - Preventivo: nasce un pacchetto dei documenti del cliente con l'email della richiesta; il pannello manda prima nomi e
 *    dimensioni degli allegati, poi solo i file utili (stessa scelta della cartella), poi l'analisi parte da sola.
 *  - Ordine / Fattura estera: la mail intera (.eml, testo + allegati) va in Ordini → Da acquisire e la legge l'IA come sempre.
 *
 * Gmail aspetta al massimo 30 secondi: analisi e lettura dell'IA continuano dopo la risposta, il pannello dà subito il link.
 * Va montato PRIMA dei lettori dei moduli (express.json da 2 MB) e delle sessioni (index.ts).
 */
import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { q, q1 } from '../db.js';
import { caricamentoLimitato } from '../memoria.js';
import { aggiungiFile, analizzaPacchetto, creaPacchetto, scegliFileDaCaricare, sincronizzaVersioni } from '../schede-cliente-servizio.js';
import { aggiungiFile as aggiungiAcquisizione, elabora } from '../acquisizioni-servizio.js';
import { chiaveGiusta, dominioAziendale, indirizzoDa, nomeFileEmail, nomePacchettoDaEmail, TIPI_GMAIL, type TipoGmail } from '../../engine/gmail.js';

const testo = (x: unknown, max: number) => String(x ?? '').slice(0, max);
const indirizzoPortale = (req: Request) => `${req.protocol}://${req.get('host')}`;

/** Utente ufficio del portale con la stessa email di chi ha premuto il pulsante (altrimenti il caricamento resta senza firma). */
async function utenteDa(email: string): Promise<{ id: number; nome: string } | null> {
  if (!email) return null;
  return (await q1<{ id: number; nome: string }>(`SELECT id, nome FROM utenti WHERE email = lower($1) AND attivo AND ruolo = 'ufficio'`, [email])) ?? null;
}

/**
 * Cliente dell'anagrafica dal mittente: prima l'indirizzo uguale (referenti e aziende del CRM collegate, email amministrazione, PEC),
 * poi il dominio aziendale se porta a un solo cliente. Niente di sicuro = nessun cliente (lo sceglie l'ufficio).
 */
export async function clientePerMittente(mittente: string): Promise<number | null> {
  const ind = indirizzoDa(mittente);
  if (!ind) return null;
  const uguali = await q<{ id: number }>(`
    SELECT DISTINCT cliente_id AS id FROM (
      SELECT a.cliente_id FROM crm_aziende a WHERE a.cliente_id IS NOT NULL AND (lower(a.email) = $1 OR position($1 in lower(coalesce(a.altre_email, ''))) > 0)
      UNION SELECT a.cliente_id FROM crm_contatti k JOIN crm_aziende a ON a.id = k.azienda_id WHERE a.cliente_id IS NOT NULL AND lower(k.email) = $1
      UNION SELECT c.id FROM clienti c WHERE lower(c.email_amministrazione) = $1 OR lower(c.pec) = $1
    ) x`, [ind]);
  if (uguali.length === 1) return uguali[0].id;
  const dominio = dominioAziendale(ind);
  if (!dominio) return null;
  const perDominio = await q<{ id: number }>(`
    SELECT DISTINCT cliente_id AS id FROM (
      SELECT a.cliente_id FROM crm_aziende a WHERE a.cliente_id IS NOT NULL AND (lower(a.email) LIKE '%@' || $1 OR lower(coalesce(a.altre_email, '')) LIKE '%@' || $1 || '%'
        OR lower(coalesce(a.sito, '')) LIKE '%' || $1 || '%')
      UNION SELECT a.cliente_id FROM crm_contatti k JOIN crm_aziende a ON a.id = k.azienda_id WHERE a.cliente_id IS NOT NULL AND lower(k.email) LIKE '%@' || $1
      UNION SELECT c.id FROM clienti c WHERE lower(c.email_amministrazione) LIKE '%@' || $1
    ) x`, [dominio]);
  return perDominio.length === 1 ? perDominio[0].id : null;
}

export function rotteGmail() {
  const r = Router();

  // la chiave prima di tutto (anche prima di leggere i file)
  r.use((req: Request, res: Response, next: NextFunction) => {
    if (!chiaveGiusta(req.get('x-chiave-portale') ?? undefined, process.env.GMAIL_ADDON_CHIAVE))
      return res.status(401).json({ errore: process.env.GMAIL_ADDON_CHIAVE ? 'Chiave del portale non valida.' : 'Sul portale manca GMAIL_ADDON_CHIAVE.' });
    next();
  });

  // "Prova il collegamento" del pannello
  r.get('/prova', async (req, res) => {
    const u = await utenteDa(testo(req.query.utente, 200));
    res.json({ ok: true, utente: u?.nome ?? null });
  });

  // ── Preventivo: 1) email e nomi degli allegati → pacchetto e file da mandare ──
  r.post('/preventivo', express.json({ limit: '1mb' }), async (req, res) => {
    const b = req.body ?? {};
    const file = (Array.isArray(b.file) ? b.file : []).slice(0, 500)
      .map((f: any) => ({ nome: testo(f?.nome, 400).replace(/\\/g, '/').replace(/^\/+/, ''), byte: Math.max(0, Number(f?.byte) || 0) }))
      .filter((f: { nome: string }) => f.nome);
    const email = { mittente: testo(b.mittente, 300), oggetto: testo(b.oggetto, 300), data: testo(b.data, 40), testo: testo(b.testo, 20000), messaggioId: testo(b.messaggioId, 300) };
    const utente = await utenteDa(testo(b.utente, 200));
    const nome = nomePacchettoDaEmail({ ...email, allegati: file.map((f: { nome: string }) => f.nome) });
    const id = await creaPacchetto({ nome, clienteId: await clientePerMittente(email.mittente), utenteId: utente?.id ?? null });
    await q(`UPDATE pacchetti_scheda SET email = $2 WHERE id = $1`, [id, JSON.stringify(email)]);
    const scelta = await scegliFileDaCaricare(id, file);
    res.json({ id, nome, daMandare: scelta.carica, soloElenco: scelta.soloElenco.length, link: `${indirizzoPortale(req)}/preventivi/documenti/${id}` });
  });

  // ── Aggiungi a documenti già caricati: i pacchetti recenti, prima quelli dello stesso cliente o dello stesso mittente ──
  r.get('/pacchetti', async (req, res) => {
    const mittente = testo(req.query.mittente, 300);
    const clienteId = await clientePerMittente(mittente);
    const dominio = dominioAziendale(indirizzoDa(mittente)) ?? '';
    const elenco = await q<{ id: number; nome: string; creato_il: Date; cliente: string | null }>(`
      SELECT p.id, p.nome, p.creato_il, c.ragione_sociale AS cliente FROM pacchetti_scheda p LEFT JOIN clienti c ON c.id = p.cliente_id
      WHERE p.padre_id IS NULL AND p.creato_il > now() - interval '90 days'
      ORDER BY (p.cliente_id = $1 OR ($2 <> '' AND lower(p.email->>'mittente') LIKE '%@' || $2 || '%')) DESC NULLS LAST, p.creato_il DESC LIMIT 12`, [clienteId ?? -1, dominio]);
    res.json(elenco.map(p => ({ id: p.id, nome: p.nome, cliente: p.cliente, data: new Date(p.creato_il).toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' }) })));
  });

  // nomi degli allegati per un pacchetto già caricato; il testo della mail nuova si aggiunge sotto a quello di prima
  r.post('/preventivo/:id/aggiungi', express.json({ limit: '1mb' }), async (req, res) => {
    const id = String(req.params.id);
    const p = /^\d+$/.test(id) ? await q1<{ id: number; nome: string; email: any }>(`SELECT id, nome, email FROM pacchetti_scheda WHERE id = $1`, [id]) : undefined;
    if (!p) return res.status(404).json({ errore: 'Pacchetto non trovato.' });
    const b = req.body ?? {};
    const file = (Array.isArray(b.file) ? b.file : []).slice(0, 500)
      .map((f: any) => ({ nome: testo(f?.nome, 400).replace(/\\/g, '/').replace(/^\/+/, ''), byte: Math.max(0, Number(f?.byte) || 0) }))
      .filter((f: { nome: string }) => f.nome);
    const nuova = { mittente: testo(b.mittente, 300), oggetto: testo(b.oggetto, 300), data: testo(b.data, 40), testo: testo(b.testo, 20000), messaggioId: testo(b.messaggioId, 300) };
    const email = !p.email ? nuova : p.email.messaggioId && p.email.messaggioId === nuova.messaggioId ? p.email
      : { ...p.email, testo: `${p.email.testo}\n\n── Email successiva: ${nuova.mittente}${nuova.data ? `, ${nuova.data}` : ''}, «${nuova.oggetto}» ──\n${nuova.testo}`.slice(0, 40000) };
    await q(`UPDATE pacchetti_scheda SET email = $2 WHERE id = $1`, [p.id, JSON.stringify(email)]);
    const scelta = await scegliFileDaCaricare(p.id, file);
    res.json({ id: p.id, nome: p.nome, daMandare: scelta.carica, soloElenco: scelta.soloElenco.length, link: `${indirizzoPortale(req)}/preventivi/documenti/${p.id}` });
  });

  // 2) un allegato alla volta (si mettono in fila come quelli del browser)
  r.post('/preventivo/:id/file', caricamentoLimitato, express.raw({ type: () => true, limit: '60mb' }), async (req, res) => {
    const id = String(req.params.id);
    const nome = testo(req.query.nome, 400).replace(/\\/g, '/').replace(/^\/+/, '');
    if (!/^\d+$/.test(id) || !nome || !Buffer.isBuffer(req.body)) return res.status(400).json({ errore: 'File mancante.' });
    if (!await q1(`SELECT 1 FROM pacchetti_scheda WHERE id = $1`, [id])) return res.status(404).json({ errore: 'Pacchetto non trovato.' });
    await aggiungiFile(Number(id), nome, req.body);
    res.json({ ok: true });
  });

  // 3) analisi: parte qui e continua dopo la risposta (Gmail non aspetta più di 30 secondi)
  r.post('/preventivo/:id/analizza', async (req, res) => {
    const id = String(req.params.id);
    if (!/^\d+$/.test(id) || !await q1(`SELECT 1 FROM pacchetti_scheda WHERE id = $1`, [id])) return res.status(404).json({ errore: 'Pacchetto non trovato.' });
    await q(`UPDATE pacchetti_scheda SET stato = 'in_analisi', errore = NULL WHERE id = $1`, [id]);
    analizzaPacchetto(Number(id)).then(() => sincronizzaVersioni(Number(id))).catch(async (e: any) => {
      console.error(e);
      await q(`UPDATE pacchetti_scheda SET stato = 'caricamento', errore = $2 WHERE id = $1`, [id, `Analisi non riuscita: ${String(e?.message ?? e).slice(0, 400)}`]).catch(() => {});
    });
    res.json({ ok: true, link: `${indirizzoPortale(req)}/preventivi/documenti/${id}` });
  });

  // ── Ordine o fattura estera: la mail intera (.eml) va in Da acquisire ──
  r.post('/acquisisci', caricamentoLimitato, express.raw({ type: () => true, limit: '40mb' }), async (req, res) => {
    const tipo = String(req.query.tipo ?? '') as TipoGmail;
    if (!TIPI_GMAIL.includes(tipo) || tipo === 'preventivo') return res.status(400).json({ errore: 'Tipo non valido.' });
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ errore: 'Email mancante.' });
    const { id, doppioneDi } = await aggiungiAcquisizione(nomeFileEmail(testo(req.query.oggetto, 300)), req.body);
    const pagina = (n: number) => `${indirizzoPortale(req)}${tipo === 'fattura_estera' ? '/amministrazione/fatture-estere/' : '/ordini/acquisire/'}${n}`;
    if (!id) return res.json({ ok: true, doppione: true, link: doppioneDi ? pagina(doppioneDi) : `${indirizzoPortale(req)}/ordini/acquisire` });
    if (tipo === 'fattura_estera') await q(`UPDATE acquisizioni SET tipo = 'fattura_estera' WHERE id = $1`, [id]);
    elabora(id).catch(e => console.error(e));   // l'IA legge dopo la risposta
    res.json({ ok: true, link: pagina(id) });
  });

  return r;
}
