/**
 * Componenti non quotati nelle note del preventivo (Adriano 4/11/2026).
 * I componenti della BOM collegata con reperibilità critica (non disponibili da nessuno degli shop interrogati) si scrivono
 * da soli nelle note del preventivo, una riga per componente che finisce con FRASE_NON_QUOTATO. Le note restano modificabili:
 * a ogni ricalcolo dalla BOM si tolgono solo le righe che finiscono con la frase e si rimettono quelle di adesso.
 * Un prezzo scritto a mano nella BOM rende il componente non più critico (vedi `calcolaAcquistiCon`), quindi sparisce dalla nota.
 */
export const FRASE_NON_QUOTATO = 'componente non quotato perché attualmente non disponibile';

export interface RigaPerNota {
  pn: string | null; alternativaScelta?: string | null; designatori: string | null; valore: string | null; descrizioneBom?: string | null;
  esito?: string; clienteFornisce?: boolean; prezzoManuale?: number | null; reperibilita?: { livello: string };
}

const accorcia = (s: string, max: number) => s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;

/** Righe della nota: "P/N (riferimenti): componente non quotato perché attualmente non disponibile". */
export function righeNonQuotate(righe: RigaPerNota[], nonMontato = 'NON MONTATO'): string[] {
  const uscita: string[] = [];
  for (const r of righe) {
    if (r.esito === nonMontato || r.clienteFornisce) continue;
    if (r.reperibilita?.livello !== 'critico' || (r.prezzoManuale != null && r.prezzoManuale >= 0)) continue;
    const nome = (r.alternativaScelta || r.pn || r.valore || r.descrizioneBom || 'componente senza P/N').trim();
    const rif = (r.designatori ?? '').trim();
    const riga = `${accorcia(nome, 60)}${rif ? ` (${accorcia(rif, 60)})` : ''}: ${FRASE_NON_QUOTATO}`;
    if (!uscita.includes(riga)) uscita.push(riga);
  }
  return uscita;
}

/** Note del preventivo con le righe dei non quotati aggiornate: il resto del testo non si tocca. */
export function aggiornaNoteNonQuotati(note: string, righe: string[]): string {
  const altre = String(note ?? '').split('\n').filter(r => !r.trimEnd().toLowerCase().endsWith(FRASE_NON_QUOTATO.toLowerCase()));
  while (altre.length && !altre[altre.length - 1].trim()) altre.pop();
  return [...altre, ...righe].join('\n');
}
