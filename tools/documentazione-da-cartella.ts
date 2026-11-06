/**
 * Documentazione dei prodotti dalle cartelle del Drive (Adriano 6/11/2026): legge una cartella (o uno zip) con i file del cliente
 * con lo stesso motore dei Documenti dei clienti e scrive il RIASSUNTO (niente file) per la pagina Documentazione del prodotto.
 * I file restano sul Drive, il portale riceve solo il riassunto.
 *
 *   npx tsx tools/documentazione-da-cartella.ts <cartella o zip> [--cliente "SELEA" --codice WPACAMJR3 --cartella "G:\...\CAMJR3" --revisione C]
 *     [--invia https://casteltech-portale.onrender.com --chiave <chiave di Suggerimenti → Collegamento con Claude>] [--json esito.json]
 *
 * Senza --invia stampa il riassunto (conteggi, revisione proposta) e lo salva in --json. Con --invia manda il riassunto a
 * POST /api/claude/documentazione (cliente e codice servono a trovare il prodotto in anagrafica).
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, basename } from 'node:path';
import { elaboraPacchetto, type FileCaricato } from '../src/server/schede-cliente-servizio.js';
import { riassuntoDaAnalisi, revisioneProposta } from '../src/engine/documenti-prodotto.js';
import { scegliFile } from '../src/engine/scheda/scelta-file.js';

const arg = (nome: string) => { const i = process.argv.indexOf(`--${nome}`); return i > 0 ? process.argv[i + 1] : undefined; };

function leggiCartella(radice: string): FileCaricato[] {
  const out: FileCaricato[] = [];
  const visita = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const p = join(dir, nome);
      const st = statSync(p);
      if (st.isDirectory()) visita(p);
      else out.push({ nome: relative(radice, p).replace(/\\/g, '/'), dati: readFileSync(p), byte: st.size });
    }
  };
  visita(radice);
  return out;
}

async function main() {
  const sorgente = process.argv[2];
  if (!sorgente) { console.error('Serve la cartella o lo zip.'); process.exit(1); }
  const st = statSync(sorgente);
  const tutti = st.isDirectory() ? leggiCartella(sorgente) : [{ nome: basename(sorgente), dati: readFileSync(sorgente), byte: st.size }];
  // stessa scelta del caricamento dal browser: PDF, 3D, immagini, file troppo grandi e cartelle OLD restano con il solo nome
  const scelta = scegliFile(tutti.map(f => ({ nome: f.nome, byte: f.byte ?? f.dati.length })));
  const daCaricare = new Set(scelta.carica);
  const file = tutti.map(f => daCaricare.has(f.nome) ? f : { nome: f.nome, dati: Buffer.alloc(0), byte: f.byte ?? f.dati.length, conservato: false as const });
  const nome = basename(sorgente).replace(/\.zip$/i, '');
  const el = await elaboraPacchetto(file, nome);
  const riassunto = riassuntoDaAnalisi(el.analisi, el.file, el.fonti, el.disegno.strati.map(s => ({ nome: s.nome, ruolo: s.ruolo, lato: s.lato })));
  const nomi = [arg('cartella') ?? nome, ...(el.fonti.bom ? [el.fonti.bom] : []), ...el.file.filter(f => f.usato).map(f => f.nome), ...el.file.map(f => f.nome)];
  const proposta = arg('revisione') ? { revisione: arg('revisione')!, fonte: 'scritta a mano' } : revisioneProposta({ daFile: riassunto.prodotto?.revisione ?? null, fonteFile: riassunto.prodotto?.fonti?.revisione, nomi, esistenti: [] });
  const esito = { nome, revisione: proposta, conteggi: riassunto.conteggi, lavorazione: riassunto.lavorazione, dimensioni: riassunto.dimensioni,
    fonti: riassunto.fonti, strati: riassunto.strati.length, componenti: riassunto.componenti.length, segnalazioni: riassunto.segnalazioni, prodotto: riassunto.prodotto };
  console.log(JSON.stringify(esito, null, 1));
  if (arg('json')) writeFileSync(arg('json')!, JSON.stringify({ ...esito, riassunto, nomi }, null, 1));
  if (arg('invia')) {
    const corpo = { cliente: arg('cliente'), codice: arg('codice'), riassunto, nomi, revisione: arg('revisione') ?? null, cartella: arg('cartella') ?? null, note: arg('note') ?? null };
    const r = await fetch(`${arg('invia')}/api/claude/documentazione`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(arg('chiave') ? { 'x-chiave-portale': arg('chiave')! } : {}) }, body: JSON.stringify(corpo) });
    console.log(r.status, await r.text());
  }
}

main().catch(e => { console.error(e); process.exit(1); });
