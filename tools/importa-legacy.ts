/**
 * Importa i preventivi del vecchio portale dalla riga di comando (in alternativa alla pagina Impostazioni → Importa).
 *   DATABASE_URL=... npx tsx tools/importa-legacy.ts percorso/preventivi.json   (oppure lo zip casteltech-json.zip)
 */
import { readFileSync } from 'node:fs';
import { pool, applicaMigrazioni } from '../src/server/db.js';
import { primoAvvio } from '../src/server/catalogo-db.js';
import { importaDocumenti, leggiDocumenti, primoUtenteUfficio } from '../src/server/import-legacy-servizio.js';

const file = process.argv[2];
if (!file) { console.error('Indica il file preventivi.json o casteltech-json.zip'); process.exit(1); }
await applicaMigrazioni();
await primoAvvio();
const admin = await primoUtenteUfficio();
if (!admin) { console.error('Serve almeno un utente ufficio'); process.exit(1); }
const esito = await importaDocumenti(leggiDocumenti(readFileSync(file)), admin.id);
console.log(`Importati ${esito.importati} preventivi, già presenti ${esito.saltati}, errori ${esito.errori.length}.`);
esito.errori.forEach(e => console.log('  ' + e));
await pool.end();
