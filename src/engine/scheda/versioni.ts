/**
 * Più versioni della stessa scheda in una richiesta (Adriano 29/10/2026, RFQ M0929-C: "167pz versione HELIOS, 90pz versione CRONOS",
 * stessa PCB, componenti diversi). Dal testo della mail si leggono quantità e versioni; ogni versione diventa un pacchetto a parte
 * con i file comuni (Gerber, forature, lamine…) e solo i file che nel nome portano la sua versione (BOM_HELIOS…, non BOM_CRONOS…).
 */

export interface Richiesta { quantita: number; descrizione: string; versione: string | null }

const UNITA = '(?:pz\\.?|pezzi|pcs\\.?|pc\\.?|schede|nr\\.?|n\\.|qt[aà]\\.?)';

/** Righe tipo "167pz M0929-C versione HELIOS", "M0929-C CRONOS: 90 pz", "n. 500 schede EA1002". Niente righe = nessuna richiesta letta. */
export function richiesteDaTesto(testo: string): Richiesta[] {
  const out: Richiesta[] = [];
  for (const grezza of testo.replace(/\r/g, '').split('\n')) {
    const riga = grezza.replace(/^[\s*•·\-–>]+/, '').replace(/\s+/g, ' ').trim();
    if (!riga || riga.length > 160) continue;
    const prima = new RegExp(`^(?:n\\.?\\s*)?(\\d{1,3}(?:\\.\\d{3})*|\\d+)\\s*${UNITA}\\s+(?:di\\s+|x\\s+)?(.+)$`, 'i').exec(riga);
    const dopo = new RegExp(`^(.+?)\\s*[:=\\-–x]?\\s+(?:n\\.?\\s*)?(\\d{1,3}(?:\\.\\d{3})*|\\d+)\\s*${UNITA}\\.?$`, 'i').exec(riga);
    const [q, d] = prima ? [prima[1], prima[2]] : dopo ? [dopo[2], dopo[1]] : [null, null];
    if (!q || !d) continue;
    const quantita = Number(q.replace(/\./g, ''));
    if (!(quantita > 0) || quantita > 1_000_000) continue;
    const descrizione = d.replace(/[.;,]+$/, '').trim();
    out.push({ quantita, descrizione, versione: versioneDa(descrizione) });
  }
  return out;
}

/** "M0929-C versione HELIOS" → "HELIOS"; senza la parola versione/variante/ver. resta null. */
export function versioneDa(descrizione: string): string | null {
  const m = /\b(?:versione|vers\.?|ver\.?|version|variante|var\.?|mod\.|modello)\s+([A-Za-z0-9][\w\-]*)/i.exec(descrizione);
  return m ? m[1].toUpperCase() : null;
}

const pulito = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Il file serve alla versione: non porta nel nome il nome di un'ALTRA versione (i file comuni, senza nomi di versione, servono a tutte). */
export function fileDellaVersione(nome: string, versione: string, tutte: string[]): boolean {
  const n = pulito(nome.split(/[\\/]/).pop() ?? nome);
  if (n.includes(pulito(versione))) return true;
  return !tutte.some(v => v !== versione && pulito(v).length >= 3 && n.includes(pulito(v)));
}

/** Le versioni diverse della richiesta (almeno due, altrimenti non c'è niente da dividere). */
export function versioniDaDividere(r: Richiesta[]): Richiesta[] {
  const viste = new Map<string, Richiesta>();
  for (const x of r) if (x.versione && !viste.has(x.versione)) viste.set(x.versione, x);
  return viste.size >= 2 ? [...viste.values()] : [];
}
