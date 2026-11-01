/**
 * Backup del database: tutte le tabelle in un unico file JSON compresso (.json.gz).
 * - dal lunedì al venerdì alle 20:30 (ora italiana, a fine giornata: il database Neon è ancora acceso e non
 *   va svegliato di notte) una copia in BACKUP_DIR (disco di Render), tenendo gli ultimi 30 giorni;
 * - in qualsiasi momento dal pannello Impostazioni → Backup (scarica il file).
 * Ripristino: tools/ripristina-backup.ts
 */
import { createGzip } from 'node:zlib';
import { createWriteStream, mkdirSync, readdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { Readable, type Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pool } from './db.js';

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

/** Legge `n` righe della tabella a partire dalla riga `da` (null = la tabella non esiste). */
export type LettoreTabelle = (tabella: string, da: number, n: number) => Promise<Record<string, unknown>[] | null>;

/**
 * Testo del backup un pezzo alla volta (stesso formato di sempre, letto da tools/ripristina-backup.ts):
 * { creato_il, versione: 1, tabelle: { nome: [righe] } }, tabelle in ordine di dipendenza. I file (bytea) diventano testo base64.
 * 30/10/2026: costruire tutto il JSON in una volta faceva uscire il portale per memoria esaurita (stato 134) alle 20:30.
 */
export async function* testoBackup(tabelle: string[], leggi: LettoreTabelle, creatoIl = new Date().toISOString()): AsyncGenerator<string> {
  yield `{"creato_il":${JSON.stringify(creatoIl)},"versione":1,"tabelle":{`;
  let primaTabella = true;
  for (const t of tabelle) {
    let righe = await leggi(t, 0, RIGHE_PER_VOLTA);
    if (!righe) continue;
    yield `${primaTabella ? '' : ','}${JSON.stringify(t)}:[`;
    primaTabella = false;
    let prima = true;
    for (let da = 0; righe; ) {
      if (righe.length) {
        yield (prima ? '' : ',') + righe.map(r => JSON.stringify(Object.fromEntries(Object.entries(r).map(([k, v]) =>
          [k, Buffer.isBuffer(v) ? { __bytea: v.toString('base64') } : v])))).join(',');
        prima = false;
      }
      if (righe.length < RIGHE_PER_VOLTA) break;
      da += RIGHE_PER_VOLTA;
      righe = await leggi(t, da, RIGHE_PER_VOLTA);
    }
    yield ']';
  }
  yield '}}';
}

/**
 * Scrive il backup compresso in `destinazione` (file o risposta del browser) mentre lo legge. Tutto da una sola
 * fotografia del database (transazione in sola lettura), così le righe cambiate durante il backup non si mescolano.
 */
export async function scriviBackup(destinazione: Writable): Promise<void> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const tabelle = (await c.query<{ t: string }>(`SELECT tablename AS t FROM pg_tables WHERE schemaname = 'public'`)).rows
      .map(r => r.t).filter(t => !TABELLE_ESCLUSE.includes(t));
    const legami = (await c.query<{ da: string; a: string }>(`SELECT conrelid::regclass::text AS da, confrelid::regclass::text AS a
      FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace`)).rows.map(r => [r.da, r.a] as [string, string]);
    const leggi: LettoreTabelle = async (t, da, n) => (await c.query(`SELECT * FROM "${t}" ORDER BY ctid LIMIT $1 OFFSET $2`, [n, da])).rows;
    await pipeline(Readable.from(testoBackup(ordinaPerDipendenze(tabelle, legami), leggi)), createGzip(), destinazione);
    await c.query('COMMIT');
  } catch (e) {
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

export function elencoBackup(): { nome: string; kb: number }[] {
  const cartella = process.env.BACKUP_DIR;
  if (!cartella) return [];
  try {
    return readdirSync(cartella).filter(f => f.startsWith('casteltech-backup-')).sort().reverse()
      .map(nome => ({ nome, kb: Math.round(statSync(join(cartella, nome)).size / 1024) }));
  } catch { return []; }
}

/** Controlla ogni 10 minuti se è l'ora del backup (20:30 ora italiana, lunedì–venerdì). Non tocca il database finché non è l'ora. */
export function avviaBackupNotturno() {
  let ultimoGiorno = '';
  setInterval(() => {
    const ora = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hourCycle: 'h23' }).formatToParts(new Date());
    const p = Object.fromEntries(ora.map(x => [x.type, x.value]));
    const giorno = `${p.year}-${p.month}-${p.day}`;
    const feriale = !['Sat', 'Sun'].includes(p.weekday);
    if (feriale && p.hour === '20' && Number(p.minute) >= 30 && giorno !== ultimoGiorno) {
      ultimoGiorno = giorno;
      // il portale è ripartito dopo le 20:30 (pubblicazione serale): la copia di oggi c'è già
      if (elencoBackup().some(b => b.nome.startsWith(`casteltech-backup-${giorno}`))) return;
      void backupNotturno();
    }
  }, 10 * 60_000).unref();
}
