/**
 * Ripristina un backup creato dal portale (file .json.gz) in un database VUOTO o da sovrascrivere.
 *   DATABASE_URL=... npx tsx tools/ripristina-backup.ts casteltech-backup-....json.gz --conferma
 * ATTENZIONE: cancella i dati attuali delle tabelle e li sostituisce con quelli del backup.
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { pool, transazione, applicaMigrazioni } from '../src/server/db.js';
import { TABELLE_BACKUP } from '../src/server/backup.js';

const file = process.argv[2];
if (!file || !process.argv.includes('--conferma')) {
  console.error('Uso: npx tsx tools/ripristina-backup.ts <file.json.gz> --conferma   (sovrascrive i dati!)');
  process.exit(1);
}
const backup = JSON.parse(gunzipSync(readFileSync(file)).toString('utf8'));
await applicaMigrazioni();
await transazione(async c => {
  const tabelle = TABELLE_BACKUP.filter(t => t !== 'migrazioni_applicate' && backup.tabelle[t]);
  await c.query(`TRUNCATE ${tabelle.join(', ')} RESTART IDENTITY CASCADE`);
  for (const t of tabelle) {
    const tipiJson = new Set((await c.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND data_type IN ('json','jsonb')`, [t])).rows.map(r => r.column_name));
    for (const riga of backup.tabelle[t] as Record<string, unknown>[]) {
      const col = Object.keys(riga);
      const val = col.map(k => {
        const v: any = riga[k];
        if (v && typeof v === 'object' && '__bytea' in v) return Buffer.from(v.__bytea, 'base64');
        return tipiJson.has(k) && v != null ? JSON.stringify(v) : v;
      });
      await c.query(`INSERT INTO ${t} (${col.join(', ')}) VALUES (${col.map((_, i) => `$${i + 1}`).join(', ')})`, val);
    }
    // riallinea i contatori automatici (id)
    const haId = (await c.query(`SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = 'id'`, [t])).rowCount;
    const seq = haId ? (await c.query(`SELECT pg_get_serial_sequence($1, 'id') AS s`, [t])).rows[0]?.s : null;
    if (seq) await c.query(`SELECT setval($1, greatest((SELECT coalesce(max(id), 0) FROM ${t}), 1))`, [seq]);
    console.log(`${t}: ${backup.tabelle[t].length} righe`);
  }
  const maxNum = await c.query(`SELECT max(substring(numero from '-(\\d+)$')::int) AS n FROM preventivi`);
  if (maxNum.rows[0]?.n) await c.query(`SELECT setval('numerazione_preventivi', $1)`, [maxNum.rows[0].n]);
  const maxComm = await c.query(`SELECT max(substring(numero from '^C\\d{4}-(\\d+)$')::int) AS n FROM commesse`);
  if (maxComm.rows[0]?.n) await c.query(`SELECT setval('numerazione_commesse', $1)`, [maxComm.rows[0].n]);
});
console.log(`Ripristino completato dal backup del ${backup.creato_il}`);
await pool.end();
