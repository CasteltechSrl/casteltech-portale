/**
 * Consumi dei servizi nel database (tabelle consumi_servizi ed eventi_servizi, migrazione 045) e dati del riquadro
 * Impostazioni → Servizi. Regole per Neon gratuito: si scrive solo quando c'è stato un consumo (qualche secondo dopo
 * l'ultima chiamata, tutto insieme) o un errore; si legge all'avvio (che usa già il database) e quando si apre la pagina.
 * Le ore di calcolo di Neon e la spesa ufficiale di Anthropic si chiedono solo aprendo la pagina, e restano 10 minuti.
 */
import { q, q1 } from './db.js';
import { righeServizi, riavvioInatteso, type DatiServizi } from '../engine/servizi.js';
import {
  caricaContatori, daSalvare, database, datiInMemoria, ia, inizioMese, memoria, quandoCeUnErrore, quandoCiSonoConsumi, avviaMisuraMemoria,
} from './stato-servizi.js';

export interface ImpostazioniServizi { creditoIa?: number | null; creditoIaDal?: string | null; tettoIaMese?: number | null; oreNeonMese?: number | null }

const ORE_NEON_PREDEFINITE = 100;

// ───────────────────────────── salvataggio ─────────────────────────────
let programmato: NodeJS.Timeout | null = null;
function programma() {
  if (programmato) return;
  programmato = setTimeout(() => { programmato = null; salvaConsumi().catch(e => console.error('Consumi dei servizi non salvati:', e?.message ?? e)); }, 15_000);
  programmato.unref();
}

/** Scrive nel database i contatori in coda (somma alle righe esistenti). */
export async function salvaConsumi() {
  const righe = [...daSalvare]; daSalvare.clear();
  for (const [k, c] of righe) {
    const [giorno, servizio, voce] = k.split('|');
    try {
      await q(`INSERT INTO consumi_servizi (giorno, servizio, voce, chiamate, errori, token_ingresso, token_uscita, costo_usd)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (giorno, servizio, voce) DO UPDATE SET chiamate = consumi_servizi.chiamate + $4, errori = consumi_servizi.errori + $5,
          token_ingresso = consumi_servizi.token_ingresso + $6, token_uscita = consumi_servizi.token_uscita + $7, costo_usd = consumi_servizi.costo_usd + $8`,
        [giorno, servizio, voce, c.chiamate, c.errori, c.tokenIngresso ?? 0, c.tokenUscita ?? 0, c.costoUsd ?? 0]);
    } catch (e) {
      // database non raggiungibile: si riprova al prossimo salvataggio
      const prima = daSalvare.get(k);
      daSalvare.set(k, prima ? { chiamate: prima.chiamate + c.chiamate, errori: prima.errori + c.errori, tokenIngresso: (prima.tokenIngresso ?? 0) + (c.tokenIngresso ?? 0),
        tokenUscita: (prima.tokenUscita ?? 0) + (c.tokenUscita ?? 0), costoUsd: (prima.costoUsd ?? 0) + (c.costoUsd ?? 0) } : c);
      throw e;
    }
  }
}

// ───────────────────────────── impostazioni ─────────────────────────────
export async function caricaImpostazioniServizi(): Promise<ImpostazioniServizi> {
  return (await q1<{ valore: ImpostazioniServizi }>(`SELECT valore FROM impostazioni WHERE chiave = 'servizi'`))?.valore ?? {};
}

/** Credito e tetto dell'IA in memoria (per l'avviso): la spesa salvata prima del mese corrente si legge una volta. */
async function applicaImpostazioni(imp: ImpostazioniServizi) {
  const m = inizioMese();
  if (imp.creditoIa && imp.creditoIa > 0 && imp.creditoIaDal) {
    const r = await q1<{ s: number }>(`SELECT coalesce(sum(costo_usd), 0)::float AS s FROM consumi_servizi WHERE servizio = 'ia' AND giorno >= $1 AND giorno < $2`, [imp.creditoIaDal, m]);
    ia.credito = { importo: imp.creditoIa, dal: imp.creditoIaDal, spesoPrima: r?.s ?? 0, contaDa: m };
  } else ia.credito = null;
  ia.tettoMese = imp.tettoIaMese && imp.tettoIaMese > 0 ? imp.tettoIaMese : null;
}

export async function salvaImpostazioniServizi(imp: ImpostazioniServizi) {
  await q(`INSERT INTO impostazioni (chiave, valore) VALUES ('servizi', $1) ON CONFLICT (chiave) DO UPDATE SET valore = $1, aggiornato_il = now()`, [JSON.stringify(imp)]);
  await applicaImpostazioni(imp);
}

// ───────────────────────────── avvio ─────────────────────────────
/** All'avvio del portale (il database è già sveglio per le migrazioni): contatori del mese, avvio registrato, spazio occupato. */
export async function avviaConsumiServizi() {
  avviaMisuraMemoria();
  quandoCiSonoConsumi(programma);
  quandoCeUnErrore((servizio, e) => {
    q(`INSERT INTO eventi_servizi (il, servizio, tipo, messaggio) VALUES ($1,$2,$3,$4)`, [e.il, servizio, e.tipo, e.messaggio])
      .catch(err => console.error('Errore del servizio non salvato:', err?.message ?? err));
  });
  // salvare quello che resta quando Render ferma il portale (pubblicazione, riavvio)
  // e segnare che è stato fermato in modo regolare: al prossimo avvio non è un riavvio per memoria esaurita
  process.once('SIGTERM', () => {
    const arresto = q(`INSERT INTO eventi_servizi (servizio, tipo, messaggio) VALUES ('render', 'arresto', 'fermato da Render in modo regolare')`).catch(() => {});
    const fine = setTimeout(() => process.exit(0), 10_000);
    Promise.all([salvaConsumi().catch(() => {}), arresto]).finally(() => { clearTimeout(fine); process.exit(0); });
  });
  try {
    const righe = await q(`SELECT giorno::text AS giorno, servizio, voce, chiamate, errori, token_ingresso::float AS ti, token_uscita::float AS tu, costo_usd::float AS costo
      FROM consumi_servizi WHERE giorno >= $1`, [inizioMese()]);
    caricaContatori(righe.map(r => ({ giorno: r.giorno, servizio: r.servizio, voce: r.voce, c: { chiamate: r.chiamate, errori: r.errori, tokenIngresso: r.ti, tokenUscita: r.tu, costoUsd: r.costo } })));
    await applicaImpostazioni(await caricaImpostazioniServizi());
    await q(`DELETE FROM eventi_servizi WHERE il < now() - interval '90 days'`);
    // avvio: se la versione è la stessa dell'avvio precedente non è stata una pubblicazione (memoria esaurita, blocco, riavvio a mano)
    const versione = process.env.RENDER_GIT_COMMIT ?? null;
    if (versione) {
      const prima = await q1<{ v: string }>(`SELECT dati->>'versione' AS v FROM eventi_servizi WHERE servizio = 'render' AND tipo = 'avvio' ORDER BY il DESC LIMIT 1`);
      // l'ultimo evento di Render è un arresto regolare (Render ferma il vecchio portale prima di avviare il nuovo: c'è il disco)
      const ultimo = await q1<{ tipo: string }>(`SELECT tipo FROM eventi_servizi WHERE servizio = 'render' AND tipo IN ('avvio','arresto') ORDER BY il DESC, id DESC LIMIT 1`);
      const fermatoBene = ultimo?.tipo === 'arresto';
      const inatteso = riavvioInatteso(prima?.v, versione, fermatoBene);
      const stessa = !!prima?.v && prima.v === versione;
      await q(`INSERT INTO eventi_servizi (servizio, tipo, messaggio, dati) VALUES ('render', 'avvio', $1, $2)`,
        [inatteso ? 'riavvio senza pubblicazione (probabile memoria esaurita)' : stessa ? 'riavvio regolare (variabile cambiata o riavvio da Render)' : 'avvio dopo una pubblicazione',
          JSON.stringify({ versione, inatteso })]);
    }
    memoria.riavviiInattesi = (await q<{ il: string }>(`SELECT il FROM eventi_servizi WHERE servizio = 'render' AND tipo = 'avvio'
      AND (dati->>'inatteso')::boolean AND il > now() - interval '7 days' ORDER BY il DESC`)).map(r => new Date(r.il).toISOString());
    database.spazioMb = await spazioDatabaseMb();
  } catch (e: any) { console.error('Consumi dei servizi non caricati:', e?.message ?? e); }
}

async function spazioDatabaseMb() {
  return ((await q1<{ b: number }>(`SELECT pg_database_size(current_database())::float AS b`))?.b ?? 0) / 1024 / 1024;
}

// ───────────────────────────── servizi esterni (solo aprendo la pagina) ─────────────────────────────
const cache = new Map<string, { il: number; valore: any }>();
async function conCache<T>(chiave: string, fn: () => Promise<T>): Promise<T> {
  const c = cache.get(chiave);
  if (c && Date.now() - c.il < 10 * 60_000) return c.valore;
  const valore = await fn();
  cache.set(chiave, { il: Date.now(), valore });
  return valore;
}

/** Ore di calcolo di Neon nel periodo di fatturazione (servono NEON_API_KEY e NEON_PROJECT_ID). */
async function oreNeon(): Promise<{ ore: number | null; errore: string | null }> {
  const chiave = process.env.NEON_API_KEY, progetto = process.env.NEON_PROJECT_ID;
  if (!chiave || !progetto) return { ore: null, errore: null };
  return conCache('neon', async () => {
    try {
      const r = await fetch(`https://console.neon.tech/api/v2/projects/${encodeURIComponent(progetto)}`, {
        headers: { authorization: `Bearer ${chiave}`, accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
      const j: any = await r.json().catch(() => null);
      if (!r.ok) return { ore: null, errore: `Neon ha risposto ${r.status}${j?.message ? `: ${j.message}` : ''}` };
      const sec = Number(j?.project?.compute_time_seconds ?? j?.project?.active_time_seconds);
      return Number.isFinite(sec) ? { ore: sec / 3600, errore: null } : { ore: null, errore: 'risposta di Neon senza ore di calcolo' };
    } catch (e: any) { return { ore: null, errore: `Neon non raggiungibile: ${e?.message ?? e}` }; }
  });
}

/** Spesa del mese dal resoconto ufficiale di Anthropic (solo con ANTHROPIC_ADMIN_KEY, chiave di amministrazione sk-ant-admin…). */
async function spesaAnthropicMese(): Promise<number | null> {
  const chiave = process.env.ANTHROPIC_ADMIN_KEY;
  if (!chiave) return null;
  return conCache('anthropic-costi', async () => {
    try {
      let totale = 0, pagina: string | null = null, giri = 0;
      do {
        const par = new URLSearchParams({ starting_at: `${inizioMese()}T00:00:00Z`, limit: '31' });
        if (pagina) par.set('page', pagina);
        const r = await fetch(`https://api.anthropic.com/v1/organizations/cost_report?${par}`, {
          headers: { 'x-api-key': chiave, 'anthropic-version': '2023-06-01' }, signal: AbortSignal.timeout(10_000) });
        if (!r.ok) return null;
        const j: any = await r.json();
        // importi in centesimi di dollaro, scritti come testo
        for (const g of j?.data ?? []) for (const x of g?.results ?? []) totale += Number(x?.amount?.value ?? x?.amount ?? 0) / 100;
        pagina = j?.has_more ? j?.next_page ?? null : null;
      } while (pagina && ++giri < 5);
      return totale;
    } catch { return null; }
  });
}

// ───────────────────────────── pagina ─────────────────────────────
export interface PaginaServizi { dati: DatiServizi; impostazioni: ImpostazioniServizi; eventi: { il: string; servizio: string; tipo: string; messaggio: string }[];
  mesi: { mese: string; chiamate: number; costoUsd: number; tokenIngresso: number; tokenUscita: number }[] }

export async function datiPaginaServizi(): Promise<PaginaServizi> {
  await salvaConsumi().catch(() => {});
  const imp = await caricaImpostazioniServizi();
  const [spazio, tabelle, neon, spesa, eventi, mesi] = await Promise.all([
    spazioDatabaseMb(),
    q<{ nome: string; mb: number }>(`SELECT relname AS nome, pg_total_relation_size(relid)::float / 1048576 AS mb FROM pg_catalog.pg_statio_user_tables ORDER BY 2 DESC LIMIT 6`),
    oreNeon(), spesaAnthropicMese(),
    q(`SELECT il, servizio, tipo, messaggio FROM eventi_servizi WHERE tipo NOT IN ('avvio','arresto') OR (dati->>'inatteso')::boolean ORDER BY il DESC LIMIT 15`),
    q(`SELECT to_char(giorno, 'YYYY-MM') AS mese, sum(chiamate)::int AS chiamate, sum(costo_usd)::float AS costo, sum(token_ingresso)::float AS ti, sum(token_uscita)::float AS tu
      FROM consumi_servizi WHERE servizio = 'ia' AND giorno >= (date_trunc('month', now()) - interval '5 months') GROUP BY 1 ORDER BY 1 DESC`),
  ]);
  database.spazioMb = spazio;
  ia.spesaUfficialeMese = spesa;
  const dati = datiInMemoria();
  dati.database = { ...dati.database!, spazioMb: spazio, tabelle,
    ore: neon.ore != null ? { usate: neon.ore, limite: imp.oreNeonMese || ORE_NEON_PREDEFINITE } : null,
    neonCollegato: !!(process.env.NEON_API_KEY && process.env.NEON_PROJECT_ID), erroreNeon: neon.errore };
  // errori più vecchi dell'avvio (in memoria non ci sono più): si prendono dallo storico. Per l'IA no: dopo un riavvio non si sa
  // se nel frattempo ha funzionato, l'errore resta solo nell'elenco degli ultimi eventi
  for (const ev of eventi) {
    const e = { tipo: ev.tipo, messaggio: ev.messaggio, il: new Date(ev.il).toISOString() };
    const d = dati.distributori?.find(x => x.nome.toLowerCase() === ev.servizio);
    if (d && !d.ultimoErrore) d.ultimoErrore = e;
    if (ev.servizio === 'drive' && dati.drive && !dati.drive.ultimoErrore) dati.drive.ultimoErrore = e;
    if (ev.servizio === 'gmail' && dati.gmail && !dati.gmail.ultimoErrore) dati.gmail.ultimoErrore = e;
  }
  return { dati, impostazioni: imp, eventi: eventi.map(e => ({ ...e, il: new Date(e.il).toISOString() })),
    mesi: mesi.map(m => ({ mese: m.mese, chiamate: m.chiamate, costoUsd: m.costo, tokenIngresso: m.ti, tokenUscita: m.tu })) };
}

export const righePagina = (p: PaginaServizi) => righeServizi(p.dati);
