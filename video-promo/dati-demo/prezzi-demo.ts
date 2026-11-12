/**
 * Prezzi INVENTATI dei distributori per la BOM demo (nessuna chiamata vera): si scrivono nella cache dei fornitori,
 * poi "Codifica la BOM" del pacchetto demo li usa come se fossero arrivati dai distributori.
 * Va lanciato con chiavi finte nell'ambiente (MOUSER_API_KEY=demo FARNELL_API_KEY=demo TME_APP_TOKEN=demo TME_APP_SECRET=demo).
 */
import { readFileSync } from 'node:fs';
import { q, q1, pool } from '../../src/server/db.js';
import { pnKey } from '../../src/engine/codifica/bom.js';
import { bomDelPacchetto } from '../../src/server/schede-cliente-servizio.js';

const bom = readFileSync(process.argv[2], 'utf8').trim().split('\n').slice(1).map(r => r.split('","').map(x => x.replace(/"/g, '')));
let seme = 7;
const caso = () => { seme = (seme * 1103515245 + 12345) % 2147483648; return seme / 2147483648; };
const base = (pn: string) => /^STM32/.test(pn) ? 3.9 : /^DRV/.test(pn) ? 2.6 : /^TJA/.test(pn) ? 0.62 : /^AP2112/.test(pn) ? 0.21 : /^BSC/.test(pn) ? 0.88
  : /^ABM8/.test(pn) ? 0.31 : /^EEU/.test(pn) ? 0.42 : /^6/.test(pn) ? 0.55 : /^150060/.test(pn) ? 0.06 : /^RC0603/.test(pn) ? 0.004 : 0.012;

async function main() {
  for (const r of bom) {
    const [, , , , produttore, mpn] = r;
    const k = pnKey(mpn)!;
    for (const [f, fattore] of [['mouser', 1], ['farnell', 1.07], ['tme', 0.97]] as const) {
      const p = base(mpn) * fattore * (0.95 + caso() * 0.1);
      const offerta = { fornitore: f, codiceFornitore: `${f.slice(0, 3).toUpperCase()}-${mpn}`, mpn, produttore, descrizione: mpn, stock: 2000 + Math.round(caso() * 40000),
        moq: 1, multiplo: 1, valuta: 'EUR', consegnaSettimane: null, scaglioni: [{ qta: 1, prezzo: +(p * 2.2).toFixed(4) }, { qta: 100, prezzo: +(p * 1.3).toFixed(4) }, { qta: 1000, prezzo: +p.toFixed(4) }] };
      await q(`INSERT INTO fornitori_cache (fornitore, chiave, dati, aggiornato_il) VALUES ($1,$2,$3, now()) ON CONFLICT (fornitore, chiave) DO UPDATE SET dati = $3, aggiornato_il = now()`,
        [f, k, JSON.stringify({ offerte: [offerta] })]);
    }
  }
  const utente = (await q1<{ id: number }>(`SELECT id FROM utenti ORDER BY id LIMIT 1`))!.id;
  const id = await bomDelPacchetto(1, 500, utente);
  for (let i = 0; i < 120; i++) {
    const s = await q1<{ stato: string; messaggio: string }>(`SELECT stato, messaggio FROM bom_analisi WHERE id = $1`, [id]);
    if (s?.stato === 'pronta' || s?.stato === 'errore') { console.log('BOM', id, s.stato, s.messaggio ?? ''); break; }
    await new Promise(r => setTimeout(r, 1000));
  }
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
