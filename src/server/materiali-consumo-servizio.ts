/**
 * Materiali di consumo (Adriano 3/11/2026): Anagrafiche → Materiali e scelta nelle righe degli ordini a fornitore.
 * Regole e calcoli in engine/materiali-consumo.ts.
 */
import { q, q1, transazione } from './db.js';
import { cercaComponentiPerOrdine } from './prezzi-servizio.js';
import { pnKey } from '../engine/codifica/bom.js';
import { CATEGORIE_MATERIALI, categoriaProposta, datiMateriale, descrizioneDaRiga, filtraMateriali, prossimoCodice, righeFuoriAnagrafica,
  type CategoriaMateriale, type MaterialeConsumo, type PrezzoMateriale } from '../engine/materiali-consumo.js';

export interface MaterialeElenco extends MaterialeConsumo { note: string | null; prezzo_fonte: string | null; usato: number }

/** Righe di ordini a fornitore che usano il codice (per il tasto Elimina e la colonna "Negli ordini"). */
const SQL_USATO = `(SELECT count(*)::int FROM documenti_righe r JOIN documenti d ON d.id = r.documento_id
  WHERE d.tipo = 'ordine_fornitore' AND upper(r.codice) = m.codice)`;

export const elencoMateriali = () => q<MaterialeElenco>(
  `SELECT m.id, m.codice, m.descrizione, m.categoria, m.um, m.note, m.attivo, m.prezzo_acquisto::float AS prezzo, m.prezzo_fornitore AS fornitore,
     to_char(m.prezzo_data, 'YYYY-MM-DD') AS data, m.prezzo_fonte, ${SQL_USATO} AS usato
   FROM materiali_consumo m ORDER BY m.categoria, m.codice`);

const tuttiMateriali = () => q<MaterialeConsumo>(
  `SELECT id, codice, descrizione, categoria, um, attivo, prezzo_acquisto::float AS prezzo, prezzo_fornitore AS fornitore, to_char(prezzo_data, 'YYYY-MM-DD') AS data
   FROM materiali_consumo`);

/** Aggiunge un materiale con il codice nostro dato dal portale. Ritorna il materiale o l'errore (con il campo da correggere). */
export async function aggiungiMateriale(b: Record<string, unknown>): Promise<{ materiale: { id: number; codice: string; descrizione: string; um: string | null } } | { errore: string; campo: string }> {
  const v = datiMateriale(b);
  if ('errore' in v) return v;
  const doppio = await q1<{ codice: string }>(`SELECT codice FROM materiali_consumo WHERE descrizione = $1`, [v.dati.descrizione]);
  if (doppio) return { errore: `C'è già ${doppio.codice} con la stessa descrizione: usa quello.`, campo: 'descrizione' };
  const materiale = await transazione(async c => {
    await c.query(`LOCK TABLE materiali_consumo IN SHARE ROW EXCLUSIVE MODE`);   // due aggiunte insieme non prendono lo stesso progressivo
    const codici = (await c.query(`SELECT codice FROM materiali_consumo WHERE categoria = $1`, [v.dati.categoria])).rows.map((x: any) => x.codice);
    const codice = prossimoCodice(v.dati.categoria, codici);
    return (await c.query(`INSERT INTO materiali_consumo (codice, descrizione, categoria, um, note) VALUES ($1, $2, $3, $4, $5)
      RETURNING id, codice, descrizione, um`, [codice, v.dati.descrizione, v.dati.categoria, v.dati.um, v.dati.note])).rows[0];
  });
  return { materiale };
}

/** Salva descrizione, unità, note, attivo. La categoria non cambia il codice (il codice non si cambia mai). */
export async function salvaMateriale(id: number, b: Record<string, unknown>): Promise<{ errore: string; campo: string } | null> {
  const attuale = await q1<{ categoria: string }>(`SELECT categoria FROM materiali_consumo WHERE id = $1`, [id]);
  if (!attuale) return { errore: 'Materiale non trovato.', campo: 'descrizione' };
  const v = datiMateriale({ ...b, categoria: b.categoria ?? attuale.categoria });
  if ('errore' in v) return v;
  await q(`UPDATE materiali_consumo SET descrizione = $2, categoria = $3, um = $4, note = $5, attivo = $6, aggiornato_il = now() WHERE id = $1`,
    [id, v.dati.descrizione, v.dati.categoria, v.dati.um, v.dati.note, b.attivo === undefined ? true : !!b.attivo && b.attivo !== '0']);
  return null;
}

/** Si elimina solo se nessun ordine a fornitore lo usa (altrimenti si toglie la spunta "Attivo"). */
export async function eliminaMateriale(id: number): Promise<string | null> {
  const m = await q1<{ codice: string; usato: number }>(`SELECT m.codice, ${SQL_USATO} AS usato FROM materiali_consumo m WHERE m.id = $1`, [id]);
  if (!m) return 'Materiale non trovato.';
  if (m.usato) return `${m.codice} è già in ${m.usato} righe di ordini a fornitore: non si elimina, togli la spunta "Attivo".`;
  await q(`DELETE FROM materiali_consumo WHERE id = $1`, [id]);
  return null;
}

/**
 * Articoli per la riga dell'ordine a fornitore: prima i materiali di consumo ("lamina" → MC-LAM-…), poi i componenti dell'archivio (P/N).
 * Ogni voce: codice da mettere nella riga, descrizione, ultimo prezzo, da dove viene.
 */
export async function cercaArticoliOrdine(testo: string) {
  const t = testo.trim();
  if (t.length < 2) return [];
  const [materiali, componenti] = await Promise.all([tuttiMateriali(), cercaComponentiPerOrdine(t)]);
  return [
    ...filtraMateriali(materiali, t).map(m => ({ tipo: 'materiale' as const, codice: m.codice, descrizione: m.descrizione, um: m.um,
      prezzo: m.prezzo ?? null, fornitore: m.fornitore ?? null, categoria: CATEGORIE_MATERIALI[m.categoria as CategoriaMateriale] ?? m.categoria })),
    ...componenti.slice(0, 15).map(c => ({ tipo: 'componente' as const, codice: (c.pn || c.codice_gestionale || '').toUpperCase(),
      descrizione: String(c.descrizione ?? '').toUpperCase(), um: null, prezzo: c.prezzo, fornitore: c.fornitore,
      categoria: ['Componente', c.codice_gestionale, c.codice_produzione].filter(Boolean).join(' · ') })).filter(c => c.codice),
  ];
}

/** Codici delle righe che sono in anagrafica: materiali (codice) e componenti (P/N, gestionale, produzione). */
async function codiciNoti(codici: string[]): Promise<Set<string>> {
  const c = [...new Set(codici.map(x => x.trim().toUpperCase()).filter(Boolean))];
  if (!c.length) return new Set();
  const chiavi = c.map(x => pnKey(x) ?? '');
  const righe = await q<{ codice: string }>(
    `SELECT x.codice FROM unnest($1::text[], $2::text[]) AS x(codice, chiave)
     WHERE EXISTS (SELECT 1 FROM materiali_consumo m WHERE m.codice = x.codice)
        OR EXISTS (SELECT 1 FROM componenti k WHERE (x.chiave <> '' AND k.pn_key = x.chiave) OR upper(k.codice_gestionale) = x.codice OR upper(k.codice_produzione) = x.codice)`,
    [c, chiavi]);
  return new Set(righe.map(r => r.codice));
}

/** Righe dell'ordine non in anagrafica, con la categoria proposta (riquadro "Righe non in anagrafica" della pagina dell'ordine). */
export async function righeOrdineFuoriAnagrafica<R extends { posizione: number; codice: string | null; descrizione: string }>(righe: R[]) {
  const noti = await codiciNoti(righe.map(r => r.codice ?? ''));
  return righeFuoriAnagrafica(righe, noti).map(r => ({ ...r, categoria: categoriaProposta(r.descrizione), nuovaDescrizione: descrizioneDaRiga(r) }));
}

/**
 * "Aggiungi ai materiali" su una riga libera dell'ordine: nuovo materiale con il codice nostro (il codice scritto va nella descrizione)
 * e la riga dell'ordine prende il codice nuovo. Si può fare anche su un ordine già emesso (il PDF si rifà al prossimo salvataggio).
 */
export async function rigaOrdineInAnagrafica(ordineId: number, posizione: number, b: Record<string, unknown>): Promise<{ messaggio: string } | { errore: string }> {
  const riga = await q1<{ codice: string | null; descrizione: string }>(
    `SELECT r.codice, r.descrizione FROM documenti_righe r JOIN documenti d ON d.id = r.documento_id
     WHERE d.id = $1 AND d.tipo = 'ordine_fornitore' AND r.posizione = $2`, [ordineId, posizione]);
  if (!riga) return { errore: 'Riga non trovata: salva prima l\'ordine.' };
  const esito = await aggiungiMateriale({ descrizione: b.descrizione ?? descrizioneDaRiga(riga), categoria: b.categoria, um: b.um });
  if ('errore' in esito) {
    // stessa descrizione già in anagrafica: la riga prende quel codice
    const gia = await q1<{ codice: string }>(`SELECT codice FROM materiali_consumo WHERE descrizione = upper(trim($1))`, [String(b.descrizione ?? descrizioneDaRiga(riga))]);
    if (!gia) return esito;
    await q(`UPDATE documenti_righe SET codice = $3 WHERE documento_id = $1 AND posizione = $2`, [ordineId, posizione, gia.codice]);
    return { messaggio: `Riga ${posizione}: c'era già ${gia.codice} con la stessa descrizione, la riga ora usa quel codice.` };
  }
  await q(`UPDATE documenti_righe SET codice = $3 WHERE documento_id = $1 AND posizione = $2`, [ordineId, posizione, esito.materiale.codice]);
  return { messaggio: `Aggiunto in Anagrafiche → Materiali con il codice ${esito.materiale.codice}; la riga ${posizione} ora usa questo codice.` };
}

// ───────────── ultimo prezzo d'acquisto (domanda "Aggiorno l'anagrafica?" e file da FIC) ─────────────

const materialeDaCodice = (codice: string) => q1<{ id: number; codice: string; prezzo: number | null }>(
  `SELECT id, codice, prezzo_acquisto::float AS prezzo FROM materiali_consumo WHERE codice = upper(trim($1))`, [codice]);

/** Domanda per il prezzo scritto nell'ordine: undefined = il codice non è un materiale (si prova con i componenti), null = niente da chiedere. */
export async function domandaPrezzoMateriale(codice: string, prezzo: number): Promise<string | null | undefined> {
  const m = await materialeDaCodice(codice);
  if (!m) return undefined;
  if (!Number.isFinite(prezzo) || (m.prezzo != null && Math.abs(m.prezzo - prezzo) < 0.0000005)) return null;
  const euro = (n: number) => new Intl.NumberFormat('it-IT', { maximumFractionDigits: 6 }).format(n) + ' €';
  return m.prezzo == null ? `${m.codice} non ha ancora un prezzo d'acquisto in anagrafica. Lo salvo a ${euro(prezzo)}?`
    : `${m.codice}: l'ultimo acquisto in anagrafica è ${euro(m.prezzo)}, qui hai scritto ${euro(prezzo)}. Aggiorno l'ultimo acquisto?`;
}

/** Aggiorna l'ultimo acquisto del materiale (fonte 'manuale'): null se il codice non è un materiale. */
export async function aggiornaPrezzoMateriale(codice: string, prezzo: number, quantita: number | null, fornitore: string | null, documento: string): Promise<string | null> {
  const m = await materialeDaCodice(codice);
  if (!m) return null;
  await q(`UPDATE materiali_consumo SET prezzo_acquisto = $2, prezzo_fornitore = coalesce($3, prezzo_fornitore), prezzo_quantita = $4, prezzo_fonte = 'manuale',
      prezzo_data = current_date, prezzo_nota = $5, aggiornato_il = now() WHERE id = $1`,
    [m.id, prezzo, fornitore || null, quantita || null, `Aggiornato da ${documento || 'un ordine a fornitore'}`.slice(0, 200)]);
  return `${m.codice}: ultimo acquisto aggiornato in anagrafica.`;
}

/** Ultimi prezzi dal file (anteprima o scrittura). I prezzi scritti a mano (fonte 'manuale') non si toccano. */
export async function caricaPrezziMateriali(prezzi: PrezzoMateriale[], conferma: boolean) {
  const esistenti = new Map((await q<{ codice: string; prezzo_fonte: string | null }>(`SELECT codice, prezzo_fonte FROM materiali_consumo`)).map(x => [x.codice, x]));
  const daScrivere = prezzi.filter(p => esistenti.has(p.codice) && esistenti.get(p.codice)!.prezzo_fonte !== 'manuale');
  if (conferma) await transazione(async c => {
    for (const p of daScrivere) await c.query(`UPDATE materiali_consumo SET prezzo_acquisto = $2, prezzo_fornitore = $3, prezzo_data = $4, prezzo_quantita = $5,
        prezzo_fonte = 'fic', prezzo_nota = $6, aggiornato_il = now() WHERE codice = $1 AND prezzo_fonte IS DISTINCT FROM 'manuale'`,
      [p.codice, p.prezzo, p.fornitore, p.data, p.quantita, p.nota]);
  });
  return { nelFile: prezzi.length, aggiornati: daScrivere.length, manuali: prezzi.filter(p => esistenti.get(p.codice)?.prezzo_fonte === 'manuale').length,
    nonTrovati: prezzi.filter(p => !esistenti.has(p.codice)).map(p => p.codice) };
}
