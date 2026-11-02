/**
 * Componenti dei clienti (Adriano 2/11/2026): letture, aggiunta, caricamento da file, ricerca per le righe del DDT,
 * e la "traduzione" delle righe del DDT secondo la fonte scelta (prodotto, componente nostro, componente cliente, libero).
 * Regole in engine/componenti-clienti.ts.
 */
import { q, q1, transazione } from './db.js';
import { leggiFileBom } from './codifica-servizio.js';
import { cercaComponentiPerOrdine } from './prezzi-servizio.js';
import { pnKey } from '../engine/codifica/bom.js';
import { chiaveCodice, fonteRiga, leggiElencoComponentiCliente, maiuscoloPulito, rigaComponenteNostro, testoDaFile, type ComponenteClienteLetto } from '../engine/componenti-clienti.js';

export interface ComponenteCliente { id: number; cliente_id: number; cliente: string; codice: string; descrizione: string | null; famiglia: string | null; gruppo: string | null; usato: number }

export const elencoComponentiClienti = (clienteId: number | null) => q<ComponenteCliente>(
  `SELECT k.id, k.cliente_id, c.ragione_sociale AS cliente, k.codice, k.descrizione, k.famiglia, k.gruppo,
     (SELECT count(*)::int FROM documenti_righe r WHERE r.componente_cliente_id = k.id) AS usato
   FROM componenti_clienti k JOIN clienti c ON c.id = k.cliente_id
   WHERE ($1::int IS NULL OR k.cliente_id = $1) ORDER BY c.ragione_sociale, k.codice`, [clienteId]);

/** Clienti con quanti componenti hanno (per il menu della pagina). */
export const clientiConComponenti = () => q<{ id: number; ragione_sociale: string; n: number }>(
  `SELECT c.id, c.ragione_sociale, (SELECT count(*)::int FROM componenti_clienti k WHERE k.cliente_id = c.id) AS n
   FROM clienti c ORDER BY (SELECT count(*) FROM componenti_clienti k WHERE k.cliente_id = c.id) = 0, c.ragione_sociale`);

/** Componente nuovo a mano: codice obbligatorio, tutto MAIUSCOLO, stesso codice dello stesso cliente = errore. */
export async function aggiungiComponenteCliente(b: { cliente_id?: unknown; codice?: unknown; descrizione?: unknown; famiglia?: unknown }): Promise<string | null> {
  const clienteId = Number(b.cliente_id) || 0, codice = maiuscoloPulito(b.codice);
  if (!clienteId || !(await q1(`SELECT 1 FROM clienti WHERE id = $1`, [clienteId]))) return 'Scegli il cliente.';
  if (!codice) return 'Scrivi il codice del componente.';
  if (await q1(`SELECT 1 FROM componenti_clienti WHERE cliente_id = $1 AND codice = $2`, [clienteId, codice])) return `Il codice ${codice} c'è già per questo cliente.`;
  await q(`INSERT INTO componenti_clienti (cliente_id, codice, descrizione, famiglia) VALUES ($1, $2, $3, $4)`,
    [clienteId, codice, maiuscoloPulito(b.descrizione) || null, maiuscoloPulito(b.famiglia) || null]);
  return null;
}

export async function salvaComponenteCliente(id: number, b: { descrizione?: unknown; famiglia?: unknown; gruppo?: unknown }) {
  await q(`UPDATE componenti_clienti SET descrizione = $2, famiglia = $3, gruppo = $4, aggiornato_il = now() WHERE id = $1`,
    [id, maiuscoloPulito(b.descrizione) || null, maiuscoloPulito(b.famiglia) || null, maiuscoloPulito(b.gruppo) || null]);
}

/** Si elimina solo se non è in nessun documento (regola del tasto Elimina). */
export async function eliminaComponenteCliente(id: number): Promise<string | null> {
  if (await q1(`SELECT 1 FROM documenti_righe WHERE componente_cliente_id = $1 LIMIT 1`, [id])) return 'Il componente è già in un DDT: non si elimina.';
  await q(`DELETE FROM componenti_clienti WHERE id = $1`, [id]);
  return null;
}

/** Lettura del file del cliente (Excel o CSV, anche salvato da Excel italiano). */
export async function leggiFileComponentiCliente(nome: string, dati: Buffer): Promise<{ componenti: ComponenteClienteLetto[]; scartate: number }> {
  const n = nome.toLowerCase();
  const buffer = n.endsWith('.csv') || n.endsWith('.txt') ? Buffer.from(testoDaFile(dati), 'utf8') : dati;
  return leggiElencoComponentiCliente(await leggiFileBom(n.endsWith('.txt') ? n.replace(/\.txt$/, '.csv') : n, buffer));
}

/** Caricamento: anteprima (conferma = false) o scrittura. Aggiunge i codici nuovi e aggiorna descrizione/famiglia/gruppo degli altri; non toglie nulla. */
export async function caricaComponentiCliente(clienteId: number, letti: ComponenteClienteLetto[], conferma: boolean) {
  const esistenti = new Map((await q<{ codice: string; descrizione: string | null; famiglia: string | null; gruppo: string | null }>(
    `SELECT codice, descrizione, famiglia, gruppo FROM componenti_clienti WHERE cliente_id = $1`, [clienteId])).map(x => [x.codice, x]));
  const nuovi = letti.filter(x => !esistenti.has(x.codice));
  const cambiati = letti.filter(x => { const e = esistenti.get(x.codice); return e && (e.descrizione !== x.descrizione || e.famiglia !== x.famiglia || e.gruppo !== x.gruppo); });
  if (conferma) await transazione(async c => {
    for (const x of letti) await c.query(`INSERT INTO componenti_clienti (cliente_id, codice, descrizione, famiglia, gruppo) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (cliente_id, codice) DO UPDATE SET descrizione = EXCLUDED.descrizione, famiglia = EXCLUDED.famiglia, gruppo = EXCLUDED.gruppo, aggiornato_il = now()
      WHERE (componenti_clienti.descrizione, componenti_clienti.famiglia, componenti_clienti.gruppo) IS DISTINCT FROM (EXCLUDED.descrizione, EXCLUDED.famiglia, EXCLUDED.gruppo)`,
      [clienteId, x.codice, x.descrizione, x.famiglia, x.gruppo]);
  });
  return { totale: letti.length, nuovi: nuovi.length, aggiornati: cambiati.length, uguali: letti.length - nuovi.length - cambiati.length, esempi: nuovi.slice(0, 5) };
}

/** Ricerca per le righe del DDT: solo i componenti di quel cliente, per codice (anche senza trattini) o descrizione. */
export async function cercaComponentiCliente(clienteId: number, testo: string) {
  const t = testo.trim();
  if (!clienteId || t.length < 2) return [];
  return q<{ id: number; codice: string; descrizione: string | null }>(
    `SELECT id, codice, descrizione FROM componenti_clienti WHERE cliente_id = $1
       AND (regexp_replace(codice, '[^A-Z0-9]', '', 'g') LIKE '%' || $3 || '%' OR descrizione ILIKE '%' || $2 || '%')
     ORDER BY (codice = upper($2)) DESC, codice LIMIT 25`, [clienteId, t.replace(/[%_]/g, ''), chiaveCodice(t) || '@@']);
}

/** Ricerca dei nostri componenti per il DDT: come negli ordini a fornitore, con codice e descrizione già pronti per la riga. */
export async function cercaComponentiPerDdt(testo: string) {
  return (await cercaComponentiPerOrdine(testo)).map(c => ({ id: c.id, ...rigaComponenteNostro(c), descrizioneArchivio: c.descrizione }));
}

/**
 * Righe del DDT al salvataggio: codice e descrizione presi dall'anagrafica scelta. Prodotto: lo sistema completaDaListino.
 * Componente nostro / del cliente: scelto dal menu (id) o riconosciuto dal codice scritto; se non si trova, errore.
 * Libero: come scritto (MAIUSCOLO), senza collegamenti.
 */
export async function risolviFontiDdt(clienteId: number | null, righe: any): Promise<{ righe: any[]; errori: string[] }> {
  const elenco = (Array.isArray(righe) ? righe : Object.values(righe ?? {})) as any[];
  const errori: string[] = [];
  for (const [i, r] of elenco.entries()) {
    if (!r) continue;
    const fonte = fonteRiga({ fonte: r.fonte, prodotto_id: r.prodotto_id, codice: r.codice });
    r.fonte = fonte;
    const scritto = String(r.codice_testo ?? '').trim();
    if (fonte === 'prodotto') { r.componente_id = null; r.componente_cliente_id = null; continue; }
    r.prodotto_id = '';
    if (fonte === 'libero') {
      r.codice = maiuscoloPulito(scritto) || null; r.descrizione = maiuscoloPulito(r.descrizione); r.componente_id = null; r.componente_cliente_id = null;
      continue;
    }
    if (!scritto && !Number(r.componente_id) && !Number(r.componente_cliente_id)) {
      if (String(r.descrizione ?? '').trim() || String(r.quantita ?? '').trim()) errori.push(`Riga ${i + 1}: scegli il componente dall'elenco (o metti "Libero").`);
      r.codice = null;
      continue;
    }
    if (fonte === 'componente') {
      const c = Number(r.componente_id)
        ? await q1<any>(`SELECT id, pn, codice_gestionale, codice_produzione, descrizione FROM componenti WHERE id = $1`, [Number(r.componente_id)])
        : await q1<any>(`SELECT id, pn, codice_gestionale, codice_produzione, descrizione FROM componenti WHERE pn_key = $1 OR upper(codice_gestionale) = upper($2)
            OR upper(codice_produzione) = upper($2) ORDER BY (upper(codice_gestionale) = upper($2)) DESC LIMIT 1`, [pnKey(scritto) ?? '@@', scritto]);
      if (!c) { errori.push(`Riga ${i + 1}: il componente ${scritto} non è nell'archivio (Anagrafiche → Componenti).`); continue; }
      const x = rigaComponenteNostro(c);
      Object.assign(r, { componente_id: c.id, componente_cliente_id: null, codice: x.codice, descrizione: x.descrizione });
    } else {
      const c = !clienteId ? null : Number(r.componente_cliente_id)
        ? await q1<any>(`SELECT id, codice, descrizione FROM componenti_clienti WHERE id = $1 AND cliente_id = $2`, [Number(r.componente_cliente_id), clienteId])
        : await q1<any>(`SELECT id, codice, descrizione FROM componenti_clienti WHERE cliente_id = $1 AND codice = $2`, [clienteId, maiuscoloPulito(scritto)]);
      if (!c) { errori.push(`Riga ${i + 1}: il codice ${scritto} non è tra i componenti di questo cliente (Anagrafiche → Componenti clienti).`); continue; }
      Object.assign(r, { componente_cliente_id: c.id, componente_id: null, codice: c.codice, descrizione: c.descrizione || c.codice });
    }
  }
  return { righe: elenco, errori };
}
