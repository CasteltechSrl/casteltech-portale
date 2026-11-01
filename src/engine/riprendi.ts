/**
 * "Riprendi da dove eri" nel cruscotto generale (proposta della revisione, Adriano 1/11/2026): le ultime cose toccate e ancora
 * aperte (bozze di documenti, preventivi in bozza o da validare, commesse aperte, ordini a fornitore in bozza, pacchetti di
 * documenti del cliente). Prima quelle dell'utente collegato, poi quelle degli altri; al massimo `quante`.
 */
export interface VoceRiprendi { tipo: string; titolo: string; dettaglio?: string; href: string; quando: string; utenteId: number | null }

export function ordinaRiprendi(voci: VoceRiprendi[], utenteId: number | null, quante = 8): VoceRiprendi[] {
  const viste = new Set<string>();
  const mie = voci.filter(v => utenteId != null && v.utenteId === utenteId);
  const altre = voci.filter(v => !(utenteId != null && v.utenteId === utenteId));
  const perData = (a: VoceRiprendi, b: VoceRiprendi) => b.quando.localeCompare(a.quando);
  const out: VoceRiprendi[] = [];
  for (const v of [...mie.sort(perData), ...altre.sort(perData)]) {
    if (viste.has(v.href)) continue;
    viste.add(v.href);
    out.push(v);
    if (out.length >= quante) break;
  }
  return out;
}

/** "oggi 10:32", "ieri 16:05", "30/10 09:12" rispetto a `oggi` (aaaa-mm-gg), orari già in ora italiana. */
export function quandoBreve(quandoIso: string, oggi: string): string {
  const giorno = quandoIso.slice(0, 10), ora = quandoIso.slice(11, 16);
  const ieri = new Date(`${oggi}T00:00:00Z`); ieri.setUTCDate(ieri.getUTCDate() - 1);
  if (giorno === oggi) return `oggi ${ora}`;
  if (giorno === ieri.toISOString().slice(0, 10)) return `ieri ${ora}`;
  return `${giorno.slice(8, 10)}/${giorno.slice(5, 7)} ${ora}`;
}
