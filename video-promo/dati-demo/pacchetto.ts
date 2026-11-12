/**
 * Richiesta d'offerta DEMO: carica la scheda finta (file creati da scheda_demo.py) come "Documenti dei clienti",
 * la fa analizzare dal portale e prepara il preventivo "da validare". Dati INVENTATI.
 *   python3 video-promo/dati-demo/scheda_demo.py /tmp/scheda-demo
 *   DATABASE_URL=... npx tsx video-promo/dati-demo/pacchetto.ts /tmp/scheda-demo
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { q1, pool } from '../../src/server/db.js';
import { creaPacchetto, aggiungiFile, analizzaPacchetto, creaPreventivoDaPacchetto } from '../../src/server/schede-cliente-servizio.js';

const cartella = process.argv[2];
const EMAIL = `From: Marco Rinaldi <acquisti@nordelettra.example>
To: ufficio@esempio.example
Subject: Richiesta offerta NE-MC410 rev. B - 500 pz
Date: Thu, 12 Nov 2026 08:41:00 +0100
Message-ID: <demo-ne-mc410@nordelettra.example>
Content-Type: text/plain; charset=utf-8

Buongiorno,
vi chiediamo la migliore offerta per il montaggio della scheda NE-MC410 rev. B,
quantità 500 pezzi, componenti a vostro carico, consegna entro gennaio.
In allegato BOM, pick and place e Gerber.

Cordiali saluti
Marco Rinaldi - Ufficio acquisti Nordelettra
`;

async function main() {
  const cliente = (await q1<{ id: number }>(`SELECT id FROM clienti WHERE ragione_sociale = 'NORDELETTRA S.R.L.'`))!.id;
  const utente = (await q1<{ id: number }>(`SELECT id FROM utenti ORDER BY id LIMIT 1`))!.id;
  const id = await creaPacchetto({ nome: 'NE-MC410 rev B - richiesta 500 pz', clienteId: cliente, utenteId: utente });
  for (const f of readdirSync(cartella)) await aggiungiFile(id, f, readFileSync(join(cartella, f)));
  await aggiungiFile(id, 'Richiesta offerta NE-MC410.eml', Buffer.from(EMAIL.replace(/\n/g, '\r\n')));
  await analizzaPacchetto(id);
  const prev = await creaPreventivoDaPacchetto(id, 500, utente);
  console.log(`Pacchetto ${id}, preventivo da validare ${prev}`);
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
