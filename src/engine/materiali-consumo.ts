/**
 * Materiali di consumo (Adriano 3/11/2026): quello che si compra per la produzione e non va sulla scheda del cliente
 * (lamine serigrafiche, pasta saldante, barre e filo di stagno, Kapton, punte dei saldatori, flussanti…).
 * Anagrafiche → Materiali; negli ordini a fornitore si richiamano scrivendo una parola ("lamina").
 *
 * Regole di Adriano:
 * - si usano SOLO codici nostri: MC-<categoria>-<progressivo> (es. MC-LAM-001), creati dal portale;
 *   i codici del fornitore o del produttore vanno nella descrizione;
 * - punte Weller: un solo codice, il modello del produttore si scrive nella descrizione della riga;
 * - la descrizione della riga dell'ordine resta modificabile (si aggiunge, per esempio, il codice del prodotto per cui serve la lamina);
 * - la riga libera resta sempre possibile; per un articolo nuovo il portale propone di aggiungerlo all'anagrafica.
 * Solo calcoli: niente database.
 */
import { corrispondeRicerca, normalizzaRicerca } from './ricerca.js';

export const CATEGORIE_MATERIALI = {
  LAM: 'Lamine serigrafiche',
  PAS: 'Pasta saldante',
  BAR: 'Barre di stagno',
  FIL: 'Filo di stagno',
  KAP: 'Kapton',
  PUN: 'Punte e accessori saldatori',
  FLU: 'Flussanti',
  PUL: 'Pulizia e lavaggio',
  COA: 'Coating e mascherature',
  IMB: 'Imballaggio',
  ESD: 'ESD e protezione',
  PCB: 'PCB (circuiti stampati)',   // Adriano 10/11/2026: un codice nostro, il prodotto e le specifiche nelle note della riga
  VAR: 'Varie',
} as const;
export type CategoriaMateriale = keyof typeof CATEGORIE_MATERIALI;
export const eCategoria = (x: unknown): x is CategoriaMateriale => typeof x === 'string' && x in CATEGORIE_MATERIALI;

/** Unità di misura proposte (si può scrivere anche altro). */
export const UM_MATERIALI = ['PZ', 'CF', 'KG', 'G', 'L', 'M', 'RT'];

export interface MaterialeConsumo {
  id: number; codice: string; descrizione: string; categoria: string; um: string | null; attivo: boolean;
  prezzo?: number | null; fornitore?: string | null; data?: string | null;
}

const maiuscolo = (x: unknown) => String(x ?? '').replace(/\s+/g, ' ').trim().toUpperCase();

/** Codice nuovo della categoria: il progressivo dopo il più alto già usato (MC-LAM-007 → MC-LAM-008). */
export function prossimoCodice(categoria: CategoriaMateriale, codiciEsistenti: Iterable<string>): string {
  const re = new RegExp(`^MC-${categoria}-(\\d+)$`);
  let max = 0;
  for (const c of codiciEsistenti) { const m = re.exec(String(c).toUpperCase()); if (m) max = Math.max(max, Number(m[1])); }
  return `MC-${categoria}-${String(max + 1).padStart(3, '0')}`;
}

/** Dati del modulo (Anagrafiche o riga dell'ordine): descrizione e categoria obbligatorie, tutto MAIUSCOLO. */
export function datiMateriale(b: { descrizione?: unknown; categoria?: unknown; um?: unknown; note?: unknown }):
  { dati: { descrizione: string; categoria: CategoriaMateriale; um: string | null; note: string | null } } | { errore: string; campo: string } {
  const descrizione = maiuscolo(b.descrizione), categoria = maiuscolo(b.categoria);
  if (!eCategoria(categoria)) return { errore: 'Scegli la categoria del materiale.', campo: 'categoria' };
  if (descrizione.length < 3) return { errore: 'Scrivi la descrizione del materiale (es. LAMINA SERIGRAFICA…).', campo: 'descrizione' };
  return { dati: { descrizione, categoria, um: maiuscolo(b.um) || null, note: String(b.note ?? '').trim() || null } };
}

/** Testo su cui si cerca: codice, descrizione e nome della categoria ("kapton", "stagno", "lamina"). */
const testoRicerca = (m: Pick<MaterialeConsumo, 'codice' | 'descrizione' | 'categoria'>) =>
  `${m.codice} ${m.descrizione} ${CATEGORIE_MATERIALI[m.categoria as CategoriaMateriale] ?? ''}`;

/**
 * Materiali che corrispondono a quello che si scrive (stessa regola della ricerca veloce: più parole, accenti e trattini non contano).
 * Solo gli attivi. In cima il codice uguale, poi la categoria che comincia con la parola scritta ("pasta" → Pasta saldante),
 * poi le descrizioni che cominciano con la parola ("lamina" → LAMINA SERIGRAFICA…).
 */
export function filtraMateriali<T extends Pick<MaterialeConsumo, 'codice' | 'descrizione' | 'categoria' | 'attivo'>>(elenco: T[], testo: string, max = 15): T[] {
  const t = testo.trim();
  if (t.length < 2) return [];
  const n = normalizzaRicerca(t), prima = n.split(/\s+/)[0];
  const categoria = (m: T) => normalizzaRicerca(CATEGORIE_MATERIALI[m.categoria as CategoriaMateriale] ?? '');
  // "pasta" → prima la pasta saldante (nome della categoria), poi le altre paste (spellicolabile, flussante…)
  const punti = (m: T) => (normalizzaRicerca(m.codice) === n ? 0 : categoria(m).startsWith(prima) ? 1 : normalizzaRicerca(m.descrizione).startsWith(prima) ? 2 : 3);
  return elenco.filter(m => m.attivo && corrispondeRicerca(testoRicerca(m), t))
    .sort((a, b) => punti(a) - punti(b) || a.codice.localeCompare(b.codice))
    .slice(0, max);
}

/**
 * Righe dell'ordine a fornitore che non sono in anagrafica: codice che non è né un materiale né un componente, o senza codice.
 * Il portale propone di aggiungerle ai materiali (la riga prende il codice nostro, quello scritto finisce nella descrizione).
 */
export function righeFuoriAnagrafica<R extends { posizione: number; codice: string | null; descrizione: string }>(righe: R[], codiciNoti: Set<string>): R[] {
  return righe.filter(r => {
    const c = maiuscolo(r.codice);
    if (!c) return maiuscolo(r.descrizione) !== '';
    return !codiciNoti.has(c);
  });
}

/** Descrizione del materiale nuovo da una riga libera: il codice scritto (del fornitore) va nella descrizione. */
export function descrizioneDaRiga(r: { codice: string | null; descrizione: string }): string {
  const d = maiuscolo(r.descrizione), c = maiuscolo(r.codice);
  if (!c || d.includes(c)) return d || c;
  return d ? `${d} (COD. FORNITORE ${c})` : c;
}

/** Categoria proposta per una riga libera, dalle parole della descrizione (l'ufficio la può cambiare). */
export function categoriaProposta(descrizione: string): CategoriaMateriale {
  const d = normalizzaRicerca(descrizione);
  const regole: [RegExp, CategoriaMateriale][] = [
    [/\bpcb\b|circuit\w* stampat|attrezzatura test|test elettric/, 'PCB'], [/lamin|stencil/, 'LAM'], [/pasta sald|crema sald|solder paste/, 'PAS'], [/barr|vergh|verghe|lingott/, 'BAR'],
    [/filo|wire/, 'FIL'], [/kapton|poliimm/, 'KAP'], [/punt|ugell|weller|tip\b/, 'PUN'], [/fluss|flux/, 'FLU'],
    [/alcol|isoprop|ipa\b|detergent|cleaner|remover|pann|lavagg/, 'PUL'], [/coating|vernic|diluent|spellicol|mascher/, 'COA'],
    [/bust|pluriboll|scatol|imball/, 'IMB'], [/esd|guant|camic/, 'ESD'],
  ];
  return regole.find(([re]) => re.test(d))?.[1] ?? 'VAR';
}

// ───────────────── ultimi prezzi dal file preparato con lo storico di Fatture in Cloud ─────────────────

export interface PrezzoMateriale { codice: string; prezzo: number; fornitore: string | null; data: string | null; quantita: number | null; nota: string | null }

/** Righe del file materiali_prezzi.json(.gz): { tipo: 'prezzi_materiali', prezzi: [...] }. Prezzi non validi scartati. */
export function leggiFilePrezziMateriali(json: unknown): { prezzi: PrezzoMateriale[]; scartate: number } {
  const elenco = (json as any)?.prezzi;
  if ((json as any)?.tipo !== 'prezzi_materiali' || !Array.isArray(elenco)) throw new Error('Non è il file dei prezzi dei materiali (materiali_prezzi.json.gz).');
  const prezzi: PrezzoMateriale[] = [];
  let scartate = 0;
  for (const x of elenco) {
    const codice = maiuscolo(x?.codice), prezzo = Number(x?.prezzo);
    if (!/^MC-[A-Z]{3}-\d+$/.test(codice) || !(prezzo > 0)) { scartate++; continue; }
    prezzi.push({ codice, prezzo, fornitore: maiuscolo(x.fornitore) || null, data: /^\d{4}-\d{2}-\d{2}$/.test(String(x.data ?? '')) ? String(x.data) : null,
      quantita: Number(x.quantita) > 0 ? Number(x.quantita) : null, nota: String(x.nota ?? '').trim().slice(0, 200) || null });
  }
  return { prezzi, scartate };
}
