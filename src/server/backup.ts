/**
 * Backup del database: tutte le tabelle in un unico file JSON compresso (.json.gz).
 * - ogni notte alle 02:30 (ora italiana) una copia in BACKUP_DIR (disco di Render), tenendo gli ultimi 30 giorni;
 * - in qualsiasi momento dal pannello Impostazioni → Backup (scarica il file).
 * Ripristino: tools/ripristina-backup.ts
 */
import { gzipSync } from 'node:zlib';
import { mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { q } from './db.js';

/** Tabelle in ordine di dipendenza (per il ripristino). Le sessioni di login non servono. */
export const TABELLE_BACKUP = [
  'utenti', 'impostazioni', 'parametri', 'fasi', 'voci_costo', 'materiali',
  'clienti', 'prodotti', 'prodotti_revisioni', 'preventivi', 'commesse', 'commesse_fasi',
  'scansioni', 'rilevazioni', 'segnalazioni', 'analisi_commesse', 'migrazioni_applicate',
];

export async function creaBackup(): Promise<Buffer> {
  const dati: Record<string, unknown[]> = {};
  for (const t of TABELLE_BACKUP) {
    const esiste = await q(`SELECT to_regclass($1) AS r`, [t]);
    // i file (bytea) diventano testo base64 per stare nel JSON
    if (esiste[0]?.r) dati[t] = (await q(`SELECT * FROM ${t}`)).map(r =>
      Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Buffer.isBuffer(v) ? { __bytea: v.toString('base64') } : v])));
  }
  const contenuto = { creato_il: new Date().toISOString(), versione: 1, tabelle: dati };
  return gzipSync(Buffer.from(JSON.stringify(contenuto)));
}

export const nomeFileBackup = () => `casteltech-backup-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json.gz`;

async function backupNotturno() {
  const cartella = process.env.BACKUP_DIR;
  if (!cartella) return;
  try {
    mkdirSync(cartella, { recursive: true });
    writeFileSync(join(cartella, nomeFileBackup()), await creaBackup());
    const limite = Date.now() - 30 * 24 * 3600_000;
    for (const f of readdirSync(cartella)) {
      if (f.startsWith('casteltech-backup-') && statSync(join(cartella, f)).mtimeMs < limite) unlinkSync(join(cartella, f));
    }
    console.log('Backup notturno salvato');
  } catch (e) {
    console.error('Backup notturno NON riuscito', e);
  }
}

export function elencoBackup(): { nome: string; kb: number }[] {
  const cartella = process.env.BACKUP_DIR;
  if (!cartella) return [];
  try {
    return readdirSync(cartella).filter(f => f.startsWith('casteltech-backup-')).sort().reverse()
      .map(nome => ({ nome, kb: Math.round(statSync(join(cartella, nome)).size / 1024) }));
  } catch { return []; }
}

/** Controlla ogni 10 minuti se è l'ora del backup (02:30–02:40 ora italiana). */
export function avviaBackupNotturno() {
  let ultimoGiorno = '';
  setInterval(() => {
    const ora = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const p = Object.fromEntries(ora.map(x => [x.type, x.value]));
    const giorno = `${p.year}-${p.month}-${p.day}`;
    if (p.hour === '02' && Number(p.minute) >= 30 && giorno !== ultimoGiorno) {
      ultimoGiorno = giorno;
      void backupNotturno();
    }
  }, 10 * 60_000).unref();
}
