/**
 * Collegamento al database PostgreSQL e aggiornamento automatico della struttura.
 *
 * All'avvio applica, in ordine, i file di db/migrazioni/ non ancora applicati.
 * Per cambiare la struttura del database: aggiungere un NUOVO file (es. 002_qualcosa.sql),
 * mai modificare quelli già applicati.
 */
import pg from 'pg';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// i numeri decimali (numeric) arrivano come numeri JavaScript, non come testo
pg.types.setTypeParser(1700, v => (v === null ? null : Number(v)));
// le date (date) restano testo AAAA-MM-GG, senza spostamenti di fuso orario
pg.types.setTypeParser(1082, v => v);

const url = process.env.DATABASE_URL;
if (!url) throw new Error('Manca la variabile DATABASE_URL');

const locale = /localhost|127\.0\.0\.1|@\/|host=\//.test(url) || process.env.DATABASE_SSL === 'no';
// Connessione cifrata con verifica del certificato (come già faceva "sslmode=require" della stringa Neon).
// Il parametro sslmode si toglie dalla stringa e la cifratura si imposta qui: così niente avviso
// "SECURITY WARNING" all'avvio e nessun cambio di comportamento con le prossime versioni della libreria.
const senzaSslmode = url.replace(/([?&])sslmode=[^&]*&?/, '$1').replace(/[?&]$/, '');
export const pool = new pg.Pool({
  connectionString: locale ? url : senzaSslmode,
  ssl: locale ? false : { rejectUnauthorized: true },
  max: 5,
});

export async function q<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await pool.query(sql, params)).rows as T[];
}
export async function q1<T = any>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  return (await q<T>(sql, params))[0];
}

/** Esegue più operazioni in un'unica transazione (tutto o niente). */
export async function transazione<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

export async function applicaMigrazioni(cartella = join(process.cwd(), 'db', 'migrazioni')) {
  await q(`CREATE TABLE IF NOT EXISTS migrazioni_applicate (nome text PRIMARY KEY, applicata_il timestamptz NOT NULL DEFAULT now())`);
  const fatte = new Set((await q<{ nome: string }>('SELECT nome FROM migrazioni_applicate')).map(r => r.nome));
  for (const f of readdirSync(cartella).filter(f => f.endsWith('.sql')).sort()) {
    if (fatte.has(f)) continue;
    await transazione(async c => {
      await c.query(readFileSync(join(cartella, f), 'utf8'));
      await c.query('INSERT INTO migrazioni_applicate (nome) VALUES ($1)', [f]);
    });
    console.log(`Database: applicata ${f}`);
  }
}
