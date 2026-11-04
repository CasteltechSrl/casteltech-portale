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

export interface RigaPerPrezzo {
  n: number; pn: string | null; alternativaScelta?: string | null; designatori: string | null; valore: string | null; descrizioneBom?: string | null;
  esito?: string; clienteFornisce?: boolean; qtaScheda?: number; acquisti: { scelta?: { disponibile: boolean } }[];
}
export interface DaPrezzare { n: number; nome: string; rif: string; qtaScheda: number; motivo: 'senza prezzo' | 'non disponibile' }

/**
 * Righe della BOM quotata senza prezzo o non disponibili (Adriano 4/11/2026: "senza dover scorrere tutta la lista").
 * Contano solo le righe da comprare; basta una quantità senza prezzo (o non disponibile) per finire nell'elenco.
 */
export function righeDaPrezzare(righe: RigaPerPrezzo[], nonMontato = 'NON MONTATO'): DaPrezzare[] {
  const uscita: DaPrezzare[] = [];
  for (const r of righe) {
    if (r.esito === nonMontato || r.clienteFornisce || !r.acquisti?.length) continue;
    const motivo = r.acquisti.some(x => !x.scelta) ? 'senza prezzo' : r.acquisti.some(x => x.scelta && !x.scelta.disponibile) ? 'non disponibile' : null;
    if (!motivo) continue;
    uscita.push({ n: r.n, nome: accorcia((r.alternativaScelta || r.pn || r.valore || r.descrizioneBom || 'senza P/N').trim(), 40),
      rif: accorcia((r.designatori ?? '').trim(), 30), qtaScheda: r.qtaScheda ?? 0, motivo });
  }
  return uscita;
}

/** Righe dei non quotati già scritte nelle note del preventivo. */
export const righeNonQuotateNelleNote = (note: string) =>
  String(note ?? '').split('\n').map(r => r.trim()).filter(r => r.toLowerCase().endsWith(FRASE_NON_QUOTATO.toLowerCase()));

/**
 * Note della stampa e del PDF per il cliente (Adriano 4/11/2026: "nella stampa non compare la nota"): note per il cliente,
 * note interne solo con la spunta, e SEMPRE i componenti non quotati perché non disponibili (senza ripeterli).
 */
export function noteDaStampare(noteCliente: string, noteInterne: boolean, note: string, nonQuotati: string[]): string {
  const interne = noteInterne ? aggiornaNoteNonQuotati(note, []) : '';
  const cliente = String(noteCliente ?? '');
  const mancanti = nonQuotati.filter(r => !cliente.includes(r));
  return [cliente, interne, mancanti.join('\n')].map(x => x.trim()).filter(Boolean).join('\n\n');
}
