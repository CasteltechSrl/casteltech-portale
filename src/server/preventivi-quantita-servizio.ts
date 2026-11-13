/**
 * Una quotazione per più quantità (Adriano 13/11/2026): un preventivo per quantità, collegati con `preventivi.gruppo_quantita`
 * (= id del primo). Si lavora su UN preventivo e su UNA BOM; le altre quantità si creano e si riallineano da lì.
 * Regole delle fasce in engine/fasce-quantita.ts.
 */
import { q, q1 } from './db.js';
import type { Catalogo } from './catalogo-db.js';
import { datiDaRiga, leggiPreventivo, normalizza, salvaPreventivo, type DatiPreventivo } from './preventivi-servizio.js';
import { costoBomPerPreventivo } from './codifica-servizio.js';
import { leggiFasce, parametriCopiati, parametriPerQuantita, type FasceQuantita } from '../engine/fasce-quantita.js';
import { riepilogo } from '../engine/riepilogo.js';

export async function caricaFasce(): Promise<FasceQuantita> {
  return leggiFasce((await q1<{ valore: unknown }>(`SELECT valore FROM impostazioni WHERE chiave = 'fasce_quantita'`))?.valore);
}

export async function salvaFasce(f: FasceQuantita) {
  await q(`INSERT INTO impostazioni (chiave, valore) VALUES ('fasce_quantita', $1) ON CONFLICT (chiave) DO UPDATE SET valore = $1, aggiornato_il = now()`, [JSON.stringify(f)]);
}

export interface QuantitaGruppo { id: number; numero: string; stato: string; nSchede: number; prezzoScheda: number; prezzoSchedaConUnaTantum: number; ricarico: number }

/** Preventivi della stessa quotazione (questo compreso), dalla quantità più piccola. Vuoto se il preventivo è da solo. */
export async function quantitaDelGruppo(id: number): Promise<QuantitaGruppo[]> {
  const righe = await q<any>(`SELECT p.id, p.numero, p.stato, p.n_schede, p.risultato, p.tariffe FROM preventivi p
    WHERE p.gruppo_quantita IS NOT NULL AND p.gruppo_quantita = (SELECT gruppo_quantita FROM preventivi WHERE id = $1)
    ORDER BY p.n_schede, p.id`, [id]);
  if (righe.length < 2) return [];
  return righe.map(r => {
    const rp = r.risultato ? riepilogo(r.risultato) : null;
    return { id: r.id, numero: r.numero, stato: r.stato, nSchede: r.n_schede, prezzoScheda: rp?.prezzoScheda ?? 0,
      prezzoSchedaConUnaTantum: rp?.prezzoSchedaConUnaTantum ?? 0, ricarico: Number(r.tariffe?.ricarico ?? 0) };
  });
}

/** Costo componenti a scheda dalla BOM collegata per queste schede (null = BOM non pronta o senza prezzi: resta il valore copiato). */
async function costoComponenti(bomId: number | null, schede: number): Promise<number | null> {
  if (!bomId) return null;
  const b = await costoBomPerPreventivo(bomId, schede).catch(() => null);
  return b && b.stato === 'pronta' && b.aScheda > 0 ? Math.round(b.aScheda * 10000) / 10000 : null;
}

/** La BOM collegata compra i componenti anche per queste quantità (pagina della BOM con una colonna per quantità; prezzi già letti). */
export async function quantitaNellaBom(bomId: number | null, quantita: number[]) {
  if (!bomId) return;
  const b = await q1<{ quantita: number[] }>(`SELECT quantita FROM bom_analisi WHERE id = $1`, [bomId]);
  if (!b) return;
  const tutte = [...new Set([...(b.quantita ?? []), ...quantita])].sort((x, y) => x - y).slice(0, 6);
  if (tutte.join() === (b.quantita ?? []).join()) return;
  await q(`UPDATE bom_analisi SET quantita = $2 WHERE id = $1`, [bomId, tutte]);
  const { avviaElaborazione } = await import('./codifica-servizio.js');
  avviaElaborazione(bomId, { soloCache: true });   // prezzi già letti: cambiano solo le colonne delle quantità
}

/** BOM appena collegata a un preventivo con altre quantità: le colonne della BOM per tutte le quantità della quotazione. */
export async function bomPerLeQuantita(preventivoId: number, bomId: number) {
  const g = await q<{ n_schede: number }>(`SELECT n_schede FROM preventivi WHERE gruppo_quantita IS NOT NULL
    AND gruppo_quantita = (SELECT gruppo_quantita FROM preventivi WHERE id = $1)`, [preventivoId]);
  if (g.length > 1) await quantitaNellaBom(bomId, g.map(x => x.n_schede));
}

/** Dati di un'altra quantità partendo dalla sorgente: fasce, proporzioni, costo componenti della BOM per quella quantità. */
async function datiPerQuantita(sorgente: DatiPreventivo, schede: number, fasce: FasceQuantita, cat: Catalogo): Promise<DatiPreventivo> {
  const x = parametriPerQuantita({ nSchede: sorgente.nSchede, parametri: sorgente.parametri, ricarico: sorgente.tariffe.ricarico }, schede, fasce);
  const costo = await costoComponenti(sorgente.bomId, schede);
  if (costo != null) x.parametri.costoComponentiScheda = costo;
  return normalizza({ ...sorgente, nSchede: schede, parametri: x.parametri, tariffe: { ...sorgente.tariffe, ricarico: x.ricarico } }, cat);
}

/** Ritocchi della stampa che valgono per tutte le quantità (note, tempi di consegna, righe in più); i prezzi scritti a mano no. */
function stampaComune(stampa: any) {
  if (!stampa) return null;
  const { prezzi, riferimento, ...resto } = stampa;
  return resto;
}

/**
 * Crea i preventivi delle altre quantità (Adriano 13/11/2026): stessi dati, catalogo e BOM del preventivo di partenza,
 * velocità P&P e ricarico dalle fasce, buste e cartoni in proporzione, costo componenti per quantità. Le quantità già nel gruppo si saltano.
 * Ritorna gli id creati.
 */
export async function creaAltreQuantita(id: number, quantita: number[], utenteId: number): Promise<number[]> {
  const p = await leggiPreventivo(id);
  if (!p) throw new Error('Preventivo non trovato.');
  const gruppo = p.gruppo_quantita ?? p.id;
  const giaDentro = new Set((await q<{ n_schede: number }>(`SELECT n_schede FROM preventivi WHERE id = $1 OR gruppo_quantita = $2`, [id, gruppo])).map(r => r.n_schede));
  const nuove = quantita.filter(n => n > 0 && !giaDentro.has(n));
  if (!nuove.length) return [];
  const cat: Catalogo = p.catalogo;
  const fasce = await caricaFasce();
  const sorgente = datiDaRiga(p);
  await q(`UPDATE preventivi SET gruppo_quantita = $2 WHERE id = $1`, [id, gruppo]);
  await quantitaNellaBom(sorgente.bomId, [sorgente.nSchede, ...nuove]);
  const creati: number[] = [];
  for (const n of nuove) {
    const dati = await datiPerQuantita(sorgente, n, fasce, cat);
    const nuovo = await salvaPreventivo({ dati, catalogo: cat, utenteId });
    await q(`UPDATE preventivi SET gruppo_quantita = $2, stato = CASE WHEN $3 = 'da_validare' THEN 'da_validare' ELSE stato END, stampa = $4 WHERE id = $1`,
      [nuovo, gruppo, p.stato, JSON.stringify(stampaComune(p.stampa))]);
    creati.push(nuovo);
  }
  return creati;
}

/**
 * "Copia nelle altre quantità": le modifiche fatte su questo preventivo (spunte, tempi, tariffe, prezzi dei materiali, persone,
 * prodotto, BOM, note) passano agli altri preventivi del gruppo, che tengono la loro quantità; velocità P&P, ricarico, buste e
 * cartoni si rifanno con le fasce, il costo componenti dalla BOM. Restano fermi i preventivi già accettati, rifiutati o archiviati.
 * Ritorna i numeri aggiornati e quelli saltati.
 */
export async function copiaNelleAltreQuantita(id: number, utenteId: number): Promise<{ aggiornati: string[]; saltati: string[] }> {
  const p = await leggiPreventivo(id);
  if (!p?.gruppo_quantita) throw new Error('Questo preventivo non ha altre quantità.');
  const altri = await q<any>(`SELECT p.*, r.prodotto_id FROM preventivi p LEFT JOIN prodotti_revisioni r ON r.id = p.revisione_id
    WHERE p.gruppo_quantita = $1 AND p.id <> $2 ORDER BY p.n_schede`, [p.gruppo_quantita, id]);
  const cat: Catalogo = p.catalogo;
  const fasce = await caricaFasce();
  const sorgente = datiDaRiga(p);
  const aggiornati: string[] = [], saltati: string[] = [];
  await quantitaNellaBom(sorgente.bomId, [sorgente.nSchede, ...altri.map(a => a.n_schede)]);
  for (const a of altri) {
    if (!['bozza', 'da_validare', 'inviato'].includes(a.stato)) { saltati.push(`${a.numero} (${a.stato})`); continue; }
    const x = parametriCopiati({ nSchede: sorgente.nSchede, parametri: sorgente.parametri, ricarico: sorgente.tariffe.ricarico }, a.n_schede, fasce);
    const costo = await costoComponenti(sorgente.bomId, a.n_schede);
    if (costo != null) x.parametri.costoComponentiScheda = costo;
    const dati = normalizza({ ...sorgente, nSchede: a.n_schede, parametri: x.parametri, tariffe: { ...sorgente.tariffe, ricarico: x.ricarico } }, cat);
    await salvaPreventivo({ id: a.id, dati, catalogo: cat, utenteId });
    // stato come la sorgente se questa è già validata (da validare → bozza); i prezzi scritti a mano nella stampa restano i loro
    if (p.stato !== 'da_validare') await q(`UPDATE preventivi SET stato = 'bozza' WHERE id = $1 AND stato = 'da_validare'`, [a.id]);
    await q(`UPDATE preventivi SET stampa = coalesce(stampa, '{}'::jsonb) || $2::jsonb WHERE id = $1`, [a.id, JSON.stringify(stampaComune(p.stampa) ?? {})]);
    aggiornati.push(a.numero);
  }
  return { aggiornati, saltati };
}
