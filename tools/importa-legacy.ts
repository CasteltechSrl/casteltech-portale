/**
 * Importa i preventivi del vecchio portale nel nuovo database.
 *   DATABASE_URL=... npx tsx tools/importa-legacy.ts percorso/preventivi.json [--dal=2024-01-01]
 *
 * - Clienti e prodotti vengono creati (stesso cliente scritto in modi diversi = unico cliente).
 * - Ogni preventivo è ricalcolato con fasi e regole NUOVE; i totali del vecchio portale restano
 *   salvati a parte per confronto ("dati_vecchio_portale").
 * - Si può rilanciare: i preventivi già importati vengono saltati.
 */
import { readFileSync } from 'node:fs';
import { pool, q1, applicaMigrazioni } from '../src/server/db.js';
import { caricaCatalogo, caricaTariffe, primoAvvio } from '../src/server/catalogo-db.js';
import { normalizza, salvaPreventivo } from '../src/server/preventivi-servizio.js';
import { importaPreventivoLegacy } from '../src/catalogo/import-legacy.js';

const file = process.argv[2];
const dal = process.argv.find(a => a.startsWith('--dal='))?.slice(6) ?? '';
if (!file) { console.error('Indica il file preventivi.json'); process.exit(1); }

await applicaMigrazioni();
await primoAvvio();
const admin = await q1<{ id: number }>(`SELECT id FROM utenti WHERE ruolo = 'ufficio' ORDER BY id LIMIT 1`);
if (!admin) { console.error('Serve almeno un utente ufficio'); process.exit(1); }
const cat = await caricaCatalogo();
const tariffeAttuali = await caricaTariffe();
const docs: any[] = JSON.parse(readFileSync(file, 'utf8'));
const pulisci = (s: string) => s.replace(/\s+/g, ' ').trim();

let importati = 0, saltati = 0;
for (const d of docs.sort((a, b) => (a.data?.$date ?? '').localeCompare(b.data?.$date ?? ''))) {
  if (dal && (d.data?.$date ?? '') < dal) continue;
  const legacyId = d._id.$oid;
  if (await q1('SELECT 1 FROM preventivi WHERE legacy_id = $1', [legacyId])) { saltati++; continue; }
  const imp = importaPreventivoLegacy(d);
  const dati = normalizza({
    cliente: pulisci(imp.cliente) || 'Cliente sconosciuto', codice: pulisci(imp.codice), revisione: '', descrizione: pulisci(imp.descrizione),
    nSchede: imp.nSchede, nSchedeInPCB: imp.nSchedeInPCB,
    tariffe: { ...imp.tariffe, costoOperatoreUfficioH: tariffeAttuali.costoOperatoreUfficioH },
    parametri: imp.parametri, prezziMateriali: imp.prezziMateriali, note: d.note ?? '',
  }, cat);
  // nei vecchi preventivi un campo vuoto valeva 0: niente valori di default
  for (const p of cat.parametri) if (!(p.codice in dati.parametri) && p.default) dati.parametri[p.codice] = 0;
  await salvaPreventivo({
    dati, catalogo: cat, utenteId: admin.id, origine: 'vecchio_portale', legacyId,
    datiVecchioPortale: d.totaliFinali ?? null, creatoIl: d.data?.$date,
  });
  importati++;
}
await pool.query(`UPDATE preventivi SET stato = 'archiviato' WHERE origine = 'vecchio_portale' AND stato = 'bozza'`);
console.log(`Importati ${importati} preventivi, già presenti ${saltati}.`);
await pool.end();
