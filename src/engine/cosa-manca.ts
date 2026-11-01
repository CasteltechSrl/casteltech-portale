/**
 * "Cosa manca" per la commessa (proposta della revisione, Adriano 1/11/2026): dalla BOM quotata collegata al preventivo
 * della commessa, i componenti da ordinare per quelle schede confrontati con gli ordini a fornitore già fatti per la
 * stessa BOM o per la commessa (righe ordinate e pezzi arrivati). Quello che manca diventa una bozza di ordine a fornitore.
 * Il confronto è per codice del distributore, altrimenti per P/N (prima parola della descrizione della riga d'ordine).
 */
export interface RigaDaOrdinare { codice: string | null; descrizione: string; quantita: number; prezzo: number; distributore: string }
export interface RigaOrdinata { codice: string | null; descrizione: string; quantita: number; arrivati: number; documento: string }
export type StatoManca = 'da_ordinare' | 'ordinato' | 'parziale' | 'arrivato';
export const NOMI_STATO_MANCA: Record<StatoManca, string> = { da_ordinare: 'da ordinare', ordinato: 'ordinato, da ricevere', parziale: 'in parte', arrivato: 'arrivato' };

export interface EsitoManca { riga: RigaDaOrdinare; ordinata: number; arrivata: number; mancante: number; stato: StatoManca; ordini: string[] }

const pulisci = (s: string | null | undefined) => String(s ?? '').trim().toUpperCase().replace(/\s+/g, ' ');

/** Chiavi con cui si riconosce lo stesso componente: codice del distributore e P/N (prima parola della descrizione). */
export function chiaviComponente(codice: string | null | undefined, descrizione: string | null | undefined): string[] {
  const out: string[] = [];
  const c = pulisci(codice);
  if (c) out.push(`C:${c}`);
  const pn = pulisci(descrizione).split(' ')[0];
  if (pn && pn.length >= 3) out.push(`P:${pn}`);
  return out;
}

export function cosaManca(daOrdinare: RigaDaOrdinare[], ordinate: RigaOrdinata[]): { righe: EsitoManca[]; conta: Record<StatoManca, number>; mancanti: number } {
  const perChiave = new Map<string, { quantita: number; arrivati: number; documenti: Set<string> }>();
  for (const o of ordinate) for (const k of chiaviComponente(o.codice, o.descrizione)) {
    const x = perChiave.get(k) ?? { quantita: 0, arrivati: 0, documenti: new Set<string>() };
    x.quantita += o.quantita; x.arrivati += o.arrivati; x.documenti.add(o.documento);
    perChiave.set(k, x);
  }
  const usate = new Set<string>();
  const righe: EsitoManca[] = daOrdinare.map(r => {
    // la prima chiave trovata (codice, poi P/N) vale per la riga; una riga d'ordine conta una volta sola
    const k = chiaviComponente(r.codice, r.descrizione).find(x => perChiave.has(x) && !usate.has(x));
    const o = k ? perChiave.get(k)! : null;
    if (k) usate.add(k);
    const ordinata = o?.quantita ?? 0, arrivata = o?.arrivati ?? 0;
    const mancante = Math.max(0, r.quantita - ordinata);
    const stato: StatoManca = ordinata <= 0 ? 'da_ordinare' : arrivata >= r.quantita ? 'arrivato' : mancante > 0 || arrivata > 0 ? 'parziale' : 'ordinato';
    return { riga: r, ordinata, arrivata, mancante, stato, ordini: o ? [...o.documenti] : [] };
  });
  const conta: Record<StatoManca, number> = { da_ordinare: 0, ordinato: 0, parziale: 0, arrivato: 0 };
  for (const x of righe) conta[x.stato]++;
  return { righe, conta, mancanti: righe.filter(x => x.mancante > 0).length };
}

/** Quantità della BOM da usare per la commessa: la più piccola tra quelle quotate che copre le schede, altrimenti la più grande. */
export function quantitaBomPerCommessa(quotate: number[], schede: number): number | null {
  const q = [...quotate].filter(n => n > 0).sort((a, b) => a - b);
  if (!q.length) return null;
  return q.find(n => n >= schede) ?? q[q.length - 1];
}
