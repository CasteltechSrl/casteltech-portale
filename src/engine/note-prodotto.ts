/**
 * Note di montaggio e segnalazioni sul prodotto (Adriano 13/11/2026): le note delle vecchie schede di produzione (Word "spec_costruzione")
 * riportate sul prodotto, così ogni commessa futura le ritrova. Regole:
 * - le note si uniscono riga per riga: una riga già presente (stesse lettere e numeri, maiuscole e spazi non contano) non si ripete;
 * - la commessa nuova prende le note del prodotto solo se la sua scheda tecnica non ne ha;
 * - le segnalazioni delle schede vecchie stanno nello storico del prodotto (tabella segnalazioni, categoria `CATEGORIA_SCHEDE_VECCHIE`)
 *   in UNA riga per prodotto, così non riempiono le 10 righe dello storico stampate sulla scheda.
 */
export const CATEGORIA_SCHEDE_VECCHIE = 'schede vecchie';
export const MAX_NOTE = 2000;

const chiave = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Righe pulite di un testo o di un elenco: spazi tolti, trattini/puntini iniziali tolti, vuote e "/" tolte. */
export function righeNote(x: unknown): string[] {
  const testi = Array.isArray(x) ? x.map(v => String(v ?? '')) : String(x ?? '').split(/\r?\n/);
  return testi.flatMap(t => t.split(/\r?\n/))
    .map(r => r.replace(/^[\s\-–•·*]+/, '').replace(/\s+/g, ' ').trim())
    .filter(r => r && chiave(r) !== '');
}

/** Unisce le righe nuove a quelle già scritte, senza doppioni; le righe già scritte restano per prime. */
export function unisciNote(esistenti: string, nuove: unknown): { testo: string; aggiunte: number } {
  const righe = righeNote(esistenti);
  const viste = new Set(righe.map(chiave));
  let aggiunte = 0;
  for (const r of righeNote(nuove)) {
    if (viste.has(chiave(r))) continue;
    viste.add(chiave(r)); righe.push(r); aggiunte++;
  }
  return { testo: righe.join('\n').slice(0, MAX_NOTE), aggiunte };
}

/** Note di montaggio da proporre alla commessa: quelle della scheda tecnica, altrimenti quelle del prodotto. */
export function noteDaProporre(dellaScheda: string, delProdotto: string): string {
  return String(dellaScheda ?? '').trim() ? String(dellaScheda).trim() : String(delProdotto ?? '').trim().slice(0, MAX_NOTE);
}

/** Testo della segnalazione unica delle schede vecchie (righe separate da " · "), vuoto se non ci sono righe. */
export function testoSegnalazioniVecchie(righe: unknown): string {
  const r = righeNote(righe);
  const viste = new Set<string>();
  const uniche = r.filter(x => !viste.has(chiave(x)) && viste.add(chiave(x)));
  return uniche.length ? `Dalle schede di produzione vecchie: ${uniche.join(' · ')}`.slice(0, MAX_NOTE) : '';
}
