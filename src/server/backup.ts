/**
 * Backup del database: tutte le tabelle in un unico file JSON compresso (.json.gz).
 * - dal lunedì al venerdì alle 18:00 (ora italiana, a fine giornata, Adriano 1/11/2026: il database Neon è ancora acceso e non
 *   va svegliato di notte) una copia in BACKUP_DIR (disco di Render), tenendo gli ultimi 30 giorni;
 * - in qualsiasi momento dal pannello Impostazioni → Backup (scarica il file).
 * Ripristino: tools/ripristina-backup.ts
 * Traffico di Neon (13/11/2026): con BACKUP_DIR le righe uguali all'ultimo backup si prendono dal disco (backup-cache.ts), da Neon solo impronte e righe cambiate.
 */
import { createGzip } from 'node:zlib';
import { createWriteStream, mkdirSync, readdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { Readable, type Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pool } from './db.js';
import { CacheRighe, impronta } from './backup-cache.js';

/**
 * Tabelle che NON vanno nel backup: le sessioni di login e la cache di 24 ore dei prezzi dei distributori.
 * Tutte le altre sì, anche quelle aggiunte in futuro (Adriano 31/10/2026: fatture, DDT, ordini, CRM… prima restavano fuori).
 */
export const TABELLE_ESCLUSE = ['sessioni', 'fornitori_cache'];

/**
 * Tabelle in ordine di dipendenza: prima quelle a cui le altre rimandano (clienti prima dei preventivi), così il ripristino
 * le reinserisce senza errori. A parità, in ordine alfabetico. `legami` = coppie [tabella, tabella a cui rimanda].
 */
export function ordinaPerDipendenze(tabelle: string[], legami: [string, string][]): string[] {
  const dentro = new Set(tabelle);
  const servono = new Map(tabelle.map(t => [t, new Set<string>()]));
  for (const [da, a] of legami) if (da !== a && dentro.has(da) && dentro.has(a)) servono.get(da)!.add(a);
  const fatte: string[] = [], messe = new Set<string>();
  while (fatte.length < tabelle.length) {
    const pronte = tabelle.filter(t => !messe.has(t) && [...servono.get(t)!].every(x => messe.has(x))).sort();
    // rimandi in cerchio (non dovrebbero esserci): si va avanti in ordine alfabetico
    const prossima = pronte[0] ?? tabelle.filter(t => !messe.has(t)).sort()[0];
    fatte.push(prossima); messe.add(prossima);
  }
  return fatte;
}

/** Righe lette dal database per volta: il backup non tiene mai tutto il database in memoria. */
export const RIGHE_PER_VOLTA = 100;

/**
 * Legge `n` righe della tabella a partire dalla riga `da` (null = la tabella non esiste). Una riga può arrivare già scritta
 * in JSON dal database (testo): così il portale non la trasforma in oggetti e poi di nuovo in testo (11/11/2026, vedi `scriviBackup`).
 */
export type LettoreTabelle = (tabella: string, da: number, n: number) => Promise<(Record<string, unknown> | string)[] | null>;

/** Testo JSON di una riga: i file (bytea) diventano { __bytea: base64 }. */
const rigaJson = (r: Record<string, unknown> | string) => typeof r === 'string' ? r
  : JSON.stringify(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Buffer.isBuffer(v) ? { __bytea: v.toString('base64') } : v])));

/** Memoria massima di un pezzo letto dal database: le tabelle con righe grandi (preventivi, documenti dei clienti) si leggono a meno righe per volta. */
export const BYTE_PER_VOLTA = 4 * 1024 * 1024;
/** Righe per volta di una tabella, dal peso medio di una riga (almeno 1, al massimo RIGHE_PER_VOLTA). */
export const righePerVolta = (byteMedi: number) => Math.max(1, Math.min(RIGHE_PER_VOLTA, Math.floor(BYTE_PER_VOLTA / Math.max(1, byteMedi))));

/**
 * Testo del backup un pezzo alla volta (stesso formato di sempre, letto da tools/ripristina-backup.ts):
 * { creato_il, versione: 1, tabelle: { nome: [righe] } }, tabelle in ordine di dipendenza. I file (bytea) diventano testo base64.
 * 30/10/2026: costruire tutto il JSON in una volta faceva uscire il portale per memoria esaurita (stato 134) alle 20:30.
 */
export async function* testoBackup(tabelle: string[], leggi: LettoreTabelle, creatoIl = new Date().toISOString(),
  quante: (tabella: string) => number | Promise<number> = () => RIGHE_PER_VOLTA): AsyncGenerator<string> {
  yield `{"creato_il":${JSON.stringify(creatoIl)},"versione":1,"tabelle":{`;
  let primaTabella = true;
  for (const t of tabelle) {
    const n = await quante(t);
    let righe = await leggi(t, 0, n);
    if (!righe) continue;
    yield `${primaTabella ? '' : ','}${JSON.stringify(t)}:[`;
    primaTabella = false;
    let prima = true;
    for (let da = 0; righe; ) {
      if (righe.length) {
        yield (prima ? '' : ',') + righe.map(rigaJson).join(',');
        prima = false;
      }
      if (righe.length < n) break;
      da += n;
      righe = await leggi(t, da, n);
    }
    yield ']';
  }
  yield '}}';
}

/**
 * Scrive il backup compresso in `destinazione` (file o risposta del browser) mentre lo legge. Tutto da una sola
 * fotografia del database (transazione in sola lettura), così le righe cambiate durante il backup non si mescolano.
 * Memoria (Adriano 11/11/2026, "memoria del server piena", picco 409 MB su 512): prima le righe arrivavano come oggetti (i jsonb dei
 * preventivi interi) e si riscrivevano in testo, con fino a 16 pezzi in coda prima della compressione: il backup aggiungeva ~200 MB.
 * Ora ogni riga arriva già in JSON da PostgreSQL (row_to_json, file in base64), i pezzi pesano al massimo ~4 MB e in coda ce n'è uno solo.
 */
export async function scriviBackup(destinazione: Writable, opz: { cache?: string | null } = {}): Promise<void> {
  // un backup alla volta: la copia delle righe sul disco (backup-cache.ts) non si usa da due backup insieme
  const prima = inCorso;
  let fine!: () => void;
  inCorso = new Promise<void>(r => { fine = r; });
  await prima;
  try { await scriviBackupDaSolo(destinazione, opz.cache === undefined ? cartellaCache() : opz.cache); } finally { fine(); }
}
let inCorso: Promise<void> = Promise.resolve();
/** Cartella della copia delle righe dell'ultimo backup (dentro BACKUP_DIR, sul disco di Render). */
export const cartellaCache = () => process.env.BACKUP_DIR ? join(process.env.BACKUP_DIR, 'cache-righe') : null;

async function scriviBackupDaSolo(destinazione: Writable, cartella: string | null): Promise<void> {
  const c = await pool.connect();
  const cache = cartella ? new CacheRighe(cartella) : null;
  try {
    await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const tabelle = (await c.query<{ t: string }>(`SELECT tablename AS t FROM pg_tables WHERE schemaname = 'public'`)).rows
      .map(r => r.t).filter(t => !TABELLE_ESCLUSE.includes(t));
    const legami = (await c.query<{ da: string; a: string }>(`SELECT conrelid::regclass::text AS da, confrelid::regclass::text AS a
      FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace`)).rows.map(r => [r.da, r.a] as [string, string]);
    const colonne = new Map<string, { nome: string; file: boolean }[]>();
    for (const r of (await c.query<{ t: string; nome: string; tipo: string }>(`SELECT table_name AS t, column_name AS nome, data_type AS tipo
      FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`)).rows) {
      if (!colonne.has(r.t)) colonne.set(r.t, []);
      colonne.get(r.t)!.push({ nome: r.nome, file: r.tipo === 'bytea' });
    }
    // colonne della riga come le scrive il backup (file in base64); `pre` = alias della tabella per la lettura con la copia
    const scelte = (t: string, pre = '') => (colonne.get(t) ?? []).map(k => { const nome = `"${k.nome.replace(/"/g, '""')}"`, q = pre + nome;
      return k.file ? `CASE WHEN ${q} IS NULL THEN NULL ELSE json_build_object('__bytea', translate(encode(${q}, 'base64'), E'\n', '')) END AS ${nome}` : `${q} AS ${nome}`; });
    const leggiDalDatabase: LettoreTabelle = async (t, da, n) =>
      (await c.query<{ j: string }>(`SELECT row_to_json(x)::text AS j FROM (SELECT ${scelte(t).join(', ') || '*'} FROM "${t}" ORDER BY ctid LIMIT $1 OFFSET $2) x`, [n, da])).rows.map(r => r.j);
    // con la copia sul disco: da Neon arrivano le impronte di tutte le righe, poi solo le righe nuove o cambiate
    let corrente: { t: string; righe: { k: string; h: string }[] } | null = null;
    const leggiConCopia: LettoreTabelle = async (t, da, n) => {
      if (!cache || cache.spenta) return leggiDalDatabase(t, da, n);
      const lat = `FROM "${t}" riga_, LATERAL (SELECT ${scelte(t, 'riga_.').join(', ') || 'riga_.*'}) x`;
      if (corrente?.t !== t) {
        corrente = { t, righe: (await c.query<{ k: string; h: string }>(`SELECT riga_.ctid::text AS k, md5(row_to_json(x)::text) AS h ${lat} ORDER BY riga_.ctid`)).rows };
        cache.apri(t);
      }
      const pezzo = corrente.righe.slice(da, da + n);
      const testi = pezzo.map(r => cache.leggi(r.h));
      const mancanti = pezzo.filter((_, i) => testi[i] == null).map(r => r.k);
      if (mancanti.length) {
        const dal = new Map((await c.query<{ k: string; j: string }>(`SELECT riga_.ctid::text AS k, row_to_json(x)::text AS j ${lat} WHERE riga_.ctid = ANY($1::tid[])`, [mancanti])).rows.map(r => [r.k, r.j]));
        pezzo.forEach((r, i) => { if (testi[i] == null) testi[i] = dal.get(r.k) ?? null; });
      }
      if (testi.some(x => x == null)) throw new Error(`Backup: righe di ${t} non lette`);
      cache.prese += pezzo.length - mancanti.length; cache.lette += mancanti.length;
      pezzo.forEach((r, i) => cache.scrivi(impronta(testi[i]!), testi[i]!));
      return testi as string[];
    };
    const quante = async (t: string) => {
      const r = (await c.query<{ b: string | null }>(`SELECT (pg_total_relation_size(c.oid) / greatest(c.reltuples, 1))::bigint AS b FROM pg_class c WHERE c.oid = $1::regclass`, [`"${t}"`])).rows[0];
      return righePerVolta(Number(r?.b ?? 0));
    };
    await pipeline(Readable.from(testoBackup(ordinaPerDipendenze(tabelle, legami), cache ? leggiConCopia : leggiDalDatabase, undefined, quante), { highWaterMark: 1 }), createGzip(), destinazione);
    await c.query('COMMIT');
    if (cache) { cache.conferma(); console.log(`Backup: ${cache.prese} righe dalla copia sul disco, ${cache.lette} lette dal database`); }
  } catch (e) {
    cache?.annulla();
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { c.release(); }
}

/** Backup in un file della cartella: si scrive con un nome provvisorio e si rinomina solo se è completo. */
async function scriviBackupSuFile(cartella: string, nome: string) {
  mkdirSync(cartella, { recursive: true });
  const provvisorio = join(cartella, `in-corso-${nome}`);
  try {
    await scriviBackup(createWriteStream(provvisorio));
    renameSync(provvisorio, join(cartella, nome));
  } catch (e) {
    try { unlinkSync(provvisorio); } catch { /* già tolto */ }
    throw e;
  }
}

export const nomeFileBackup = () => `casteltech-backup-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json.gz`;

async function backupNotturno() {
  const cartella = process.env.BACKUP_DIR;
  if (!cartella) return;
  try {
    await scriviBackupSuFile(cartella, nomeFileBackup());
    liberaSpazio(cartella);
    const limite = Date.now() - 30 * 24 * 3600_000;
    for (const f of readdirSync(cartella)) {
      // anche i file provvisori rimasti da un backup interrotto (più vecchi di un giorno)
      const vecchio = f.startsWith('in-corso-') ? Date.now() - 24 * 3600_000 : limite;
      if ((f.startsWith('casteltech-backup-') || f.startsWith('in-corso-')) && statSync(join(cartella, f)).mtimeMs < vecchio) unlinkSync(join(cartella, f));
    }
    console.log('Backup serale salvato');
  } catch (e) {
    console.error('Backup serale NON riuscito', e);
  }
}

/** Spazio massimo delle copie sul disco di Render (1 GB): oltre si tolgono le più vecchie, tenendone sempre almeno 5. */
export const SPAZIO_MASSIMO = 750 * 1024 * 1024;
export function copieDaTogliere(copie: { nome: string; byte: number }[], massimo = SPAZIO_MASSIMO, minimo = 5): string[] {
  const ordinate = [...copie].sort((a, b) => b.nome.localeCompare(a.nome));   // la più recente per prima (data nel nome)
  const via: string[] = [];
  let totale = ordinate.reduce((t, c) => t + c.byte, 0);
  for (let i = ordinate.length - 1; i >= minimo && totale > massimo; i--) { via.push(ordinate[i].nome); totale -= ordinate[i].byte; }
  return via;
}
function liberaSpazio(cartella: string) {
  const copie = readdirSync(cartella).filter(f => f.startsWith('casteltech-backup-')).map(nome => ({ nome, byte: statSync(join(cartella, nome)).size }));
  for (const nome of copieDaTogliere(copie)) unlinkSync(join(cartella, nome));
}

/** Salva subito una copia nella cartella dei backup (es. prima di un'operazione che cancella dati). */
export async function salvaBackupSuDisco(motivo: string): Promise<string | null> {
  const cartella = process.env.BACKUP_DIR;
  if (!cartella) return null;
  const nome = nomeFileBackup().replace('.json.gz', `-${motivo}.json.gz`);
  await scriviBackupSuFile(cartella, nome);
  return nome;
}

export function elencoBackup(): { nome: string; kb: number; byte: number }[] {
  const cartella = process.env.BACKUP_DIR;
  if (!cartella) return [];
  try {
    return readdirSync(cartella).filter(f => f.startsWith('casteltech-backup-')).sort().reverse()
      .map(nome => { const byte = statSync(join(cartella, nome)).size; return { nome, kb: Math.round(byte / 1024), byte }; });
  } catch { return []; }
}

/**
 * La copia serale di oggi manca? Contano SOLO le copie serali (nome senza motivo): quelle "prima-di-eliminare-…" del giorno
 * non la sostituiscono (3/11/2026: due copie prima di eliminare ordini e preventivi hanno fatto saltare la copia delle 18).
 * Il nome ha l'ora UTC: alle 18 italiane è sempre lo stesso giorno.
 */
export function backupSeraleDaFare(nomi: string[], giorno: string): boolean {
  const serale = new RegExp(`^casteltech-backup-${giorno}-(\\d\\d)-\\d\\d\\.json\\.gz$`);
  // copia serale = fatta dalle 16 UTC in poi (18 italiane d'inverno, 18 d'estate = 16 UTC); quelle del mattino non contano
  return !nomi.some(n => { const m = serale.exec(n); return m != null && Number(m[1]) >= 16; });
}

/** Controlla ogni 10 minuti se è l'ora del backup (18:00 ora italiana, lunedì–venerdì). Non tocca il database finché non è l'ora. */
export function avviaBackupNotturno() {
  let ultimoGiorno = '';
  setInterval(() => {
    const ora = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hourCycle: 'h23' }).formatToParts(new Date());
    const p = Object.fromEntries(ora.map(x => [x.type, x.value]));
    const giorno = `${p.year}-${p.month}-${p.day}`;
    const feriale = !['Sat', 'Sun'].includes(p.weekday);
    // dalle 18 alle 21: se il portale riparte dopo le 18 (pubblicazione serale) la copia si fa lo stesso
    if (feriale && Number(p.hour) >= 18 && Number(p.hour) < 22 && giorno !== ultimoGiorno) {
      ultimoGiorno = giorno;
      // dopo la copia: tariffe dei preventivi dal costo orario, se è arrivato un mese di cedolini nuovo (Adriano 12/11/2026)
      const tariffe = () => import('./costo-orario-servizio.js').then(m => m.aggiornaTariffeSeServe())
        .then(f => { if (f) console.log('Tariffe dei preventivi aggiornate dal costo orario'); })
        .catch(e => console.error('Aggiornamento automatico delle tariffe NON riuscito', e));
      if (!backupSeraleDaFare(elencoBackup().map(b => b.nome), giorno)) { void tariffe(); return; }
      void backupNotturno().then(tariffe);
    }
  }, 10 * 60_000).unref();
}
