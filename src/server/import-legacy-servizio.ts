/**
 * Import dei preventivi del vecchio portale (usato dalla pagina Impostazioni → Importa e da tools/importa-legacy.ts).
 * - Clienti e prodotti vengono creati (stesso cliente scritto in maiuscolo/minuscolo = unico cliente).
 * - Ogni preventivo è ricalcolato con fasi e regole NUOVE; i totali del vecchio portale restano
 *   salvati a parte per confronto ("dati_vecchio_portale").
 * - Si può rilanciare: i preventivi già importati vengono saltati.
 */
import { unzipSync, strFromU8 } from 'fflate';
import { q, q1 } from './db.js';
import { caricaCatalogo, caricaTariffe } from './catalogo-db.js';
import { normalizza, salvaPreventivo } from './preventivi-servizio.js';
import { importaPreventivoLegacy } from '../catalogo/import-legacy.js';

/** Accetta preventivi.json oppure lo zip esportato (casteltech-json.zip) che lo contiene. */
export function leggiDocumenti(file: Buffer): any[] {
  let testo: string;
  if (file[0] === 0x50 && file[1] === 0x4b) { // "PK" = zip
    const contenuto = unzipSync(new Uint8Array(file), { filter: f => /(^|\/)preventivi\.json$/i.test(f.name) });
    const nome = Object.keys(contenuto)[0];
    if (!nome) throw new Error('Nello zip non c\'è il file preventivi.json');
    testo = strFromU8(contenuto[nome]);
  } else testo = file.toString('utf8');
  const docs = JSON.parse(testo);
  if (!Array.isArray(docs) || !docs.every(d => d?._id?.$oid && d?.pcb)) throw new Error('Il file non sembra l\'export dei preventivi del vecchio portale');
  return docs;
}

export interface Avanzamento { totale: number; fatti: number; importati: number; saltati: number; errori: string[]; finito: boolean }

export async function importaDocumenti(docs: any[], utenteId: number, avanz?: Avanzamento) {
  const stato: Avanzamento = avanz ?? { totale: 0, fatti: 0, importati: 0, saltati: 0, errori: [], finito: false };
  const cat = await caricaCatalogo();
  const tariffeAttuali = await caricaTariffe();
  const pulisci = (s: string) => s.replace(/\s+/g, ' ').trim();
  const ordinati = [...docs].sort((a, b) => (a.data?.$date ?? '').localeCompare(b.data?.$date ?? ''));
  stato.totale = ordinati.length;
  const gia = new Set((await q<{ legacy_id: string }>(`SELECT legacy_id FROM preventivi WHERE legacy_id IS NOT NULL`)).map(r => r.legacy_id));
  for (const d of ordinati) {
    stato.fatti++;
    const legacyId = d._id.$oid;
    if (gia.has(legacyId)) { stato.saltati++; continue; }
    try {
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
        dati, catalogo: cat, utenteId, origine: 'vecchio_portale', legacyId,
        datiVecchioPortale: d.totaliFinali ?? null, creatoIl: d.data?.$date,
      });
      stato.importati++;
    } catch (e: any) {
      stato.errori.push(`${d.cliente ?? ''} ${d.codice ?? ''}: ${e.message}`);
    }
  }
  await q(`UPDATE preventivi SET stato = 'archiviato' WHERE origine = 'vecchio_portale' AND stato = 'bozza'`);
  stato.finito = true;
  return stato;
}

export const primoUtenteUfficio = () => q1<{ id: number }>(`SELECT id FROM utenti WHERE ruolo = 'ufficio' ORDER BY id LIMIT 1`);
