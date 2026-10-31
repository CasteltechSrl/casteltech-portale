/**
 * Ripristina un backup creato dal portale (file .json.gz) in un database VUOTO o da sovrascrivere.
 *   DATABASE_URL=... npx tsx tools/ripristina-backup.ts casteltech-backup-....json.gz --conferma
 * ATTENZIONE: cancella i dati attuali delle tabelle e li sostituisce con quelli del backup.
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { pool, transazione, applicaMigrazioni } from '../src/server/db.js';

const file = process.argv[2];
if (!file || !process.argv.includes('--conferma')) {
  console.error('Uso: npx tsx tools/ripristina-backup.ts <file.json.gz> --conferma   (sovrascrive i dati!)');
  process.exit(1);
}
const backup = JSON.parse(gunzipSync(readFileSync(file)).toString('utf8'));
await applicaMigrazioni();
await transazione(async c => {
  // tabelle nell'ordine del file (prima quelle a cui le altre rimandano); i backup vecchi hanno già l'ordine giusto
  const esistenti = new Set((await c.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`)).rows.map(r => r.tablename));
  const tabelle = Object.keys(backup.tabelle).filter(t => t !== 'migrazioni_applicate' && esistenti.has(t));
  for (const t of Object.keys(backup.tabelle)) if (!esistenti.has(t)) console.warn(`${t}: tabella non più presente, saltata`);
  await c.query(`TRUNCATE ${tabelle.map(t => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
  for (const t of tabelle) {
    const tipiJson = new Set((await c.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND data_type IN ('json','jsonb')`, [t])).rows.map(r => r.column_name));
    // righe che rimandano a un'altra riga della stessa tabella (es. nota di credito → fattura) non ancora inserita: si riprovano dopo
    let daFare = backup.tabelle[t] as Record<string, unknown>[];
    while (daFare.length) {
      const rimaste: Record<string, unknown>[] = [];
      let ultimoErrore: unknown = null;
      for (const riga of daFare) {
        const col = Object.keys(riga);
        const val = col.map(k => {
          const v: any = riga[k];
          if (v && typeof v === 'object' && '__bytea' in v) return Buffer.from(v.__bytea, 'base64');
          return tipiJson.has(k) && v != null ? JSON.stringify(v) : v;
        });
        await c.query('SAVEPOINT riga');
        try {
          await c.query(`INSERT INTO "${t}" (${col.map(k => `"${k}"`).join(', ')}) VALUES (${col.map((_, i) => `$${i + 1}`).join(', ')})`, val);
          await c.query('RELEASE SAVEPOINT riga');
        } catch (e: any) {
          await c.query('ROLLBACK TO SAVEPOINT riga');
          if (e?.code !== '23503') throw e;   // solo i rimandi mancanti si riprovano
          rimaste.push(riga); ultimoErrore = e;
        }
      }
      if (rimaste.length === daFare.length) throw ultimoErrore;
      daFare = rimaste;
    }
    // riallinea i contatori automatici (id)
    const haId = (await c.query(`SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = 'id'`, [t])).rowCount;
    const seq = haId ? (await c.query(`SELECT pg_get_serial_sequence($1, 'id') AS s`, [`"${t}"`])).rows[0]?.s : null;
    if (seq) await c.query(`SELECT setval($1, greatest((SELECT coalesce(max(id), 0) FROM "${t}"), 1))`, [seq]);
    console.log(`${t}: ${backup.tabelle[t].length} righe`);
  }
  const maxNum = await c.query(`SELECT max(substring(numero from '-(\\d+)$')::int) AS n FROM preventivi`);
  if (maxNum.rows[0]?.n) await c.query(`SELECT setval('numerazione_preventivi', $1)`, [maxNum.rows[0].n]);
  const maxComm = await c.query(`SELECT max(substring(numero from '^C\\d{4}-(\\d+)$')::int) AS n FROM commesse`);
  if (maxComm.rows[0]?.n) await c.query(`SELECT setval('numerazione_commesse', $1)`, [maxComm.rows[0].n]);
});
console.log(`Ripristino completato dal backup del ${backup.creato_il}`);
await pool.end();
