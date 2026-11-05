/**
 * Elenco Preventivi: colonna "€/PCB con u.t." (Adriano 5/11/2026).
 * Prezzo a scheda del PRIMO lotto, cioè comprensivo dei costi una tantum: (totale lotti successivi + una tantum) ÷ nr. PCB.
 * Nel calcolo è `totali.prezzoSchedaPrimoLotto`; se nei ritocchi della stampa il prezzo a scheda con le una tantum
 * è stato scritto a mano (`stampa.prezzi.con`, PR #139), vale quello: è il prezzo che il cliente ha visto.
 */
export interface RigaElencoPrezzi {
  /** totali.prezzoSchedaPrimoLotto del calcolo salvato (null nei preventivi senza risultato) */
  prezzo_scheda_ut: number | string | null;
  /** stampa.prezzi.con scritto a mano nei ritocchi, altrimenti null */
  prezzo_scheda_ut_mano: number | string | null;
}

const numero = (x: number | string | null | undefined): number | null => {
  if (x == null || x === '') return null;
  const n = typeof x === 'number' ? x : Number(String(x).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/** Prezzo a scheda con le una tantum da mostrare nell'elenco e nell'Excel, con l'indicazione se è scritto a mano. */
export function prezzoSchedaConUnaTantumElenco(r: RigaElencoPrezzi): { valore: number | null; aMano: boolean } {
  const mano = numero(r.prezzo_scheda_ut_mano);
  if (mano != null && mano > 0) return { valore: mano, aMano: true };
  return { valore: numero(r.prezzo_scheda_ut), aMano: false };
}
