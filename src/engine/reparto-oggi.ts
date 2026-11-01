/**
 * Reparto da telefono: "Le mie fasi di oggi" e "Prossima fase" (proposta della revisione, Adriano 1/11/2026 "applica i suggerimenti").
 *
 * - In prima pagina l'operatore vede le fasi che ha aperto o chiuso oggi (commessa, fase, orari, pezzi) e il totale delle ore;
 *   una fase chiusa si riapre con un tocco (stessa commessa e fase, ora attuale) senza cercare di nuovo il QR.
 * - Chiusa una fase, la pagina della commessa propone la fase successiva: la prima delle fasi previste dopo quella chiusa che
 *   nessuno ha ancora fatto né ha aperta; se dopo non c'è più niente, la prima ancora da fare dall'inizio (es. una saltata).
 * Regole pure, senza database: le letture stanno in rotte/reparto.ts.
 */

export interface FaseElenco { codice: string; numero: string; nome: string }

/** La fase da proporre dopo `chiusa`; null se la commessa non ha più fasi previste da fare. */
export function faseSuccessiva(previste: FaseElenco[], chiusa: string, giaFatte: Iterable<string>, aperte: Iterable<string> = []): FaseElenco | null {
  const escluse = new Set([...giaFatte, ...aperte, chiusa]);
  const i = previste.findIndex(f => f.codice === chiusa);
  const dopo = i >= 0 ? previste.slice(i + 1) : [];
  const prima = i >= 0 ? previste.slice(0, i) : previste;
  return dopo.find(f => !escluse.has(f.codice)) ?? prima.find(f => !escluse.has(f.codice)) ?? null;
}

export interface RigaOggi {
  id: number; commessa: string; codice_qr: string; fase_codice: string; numero: string; nome: string;
  inizio: string | null;       // HH:MM
  fine: string | null;         // HH:MM, null se ancora aperta o scritta come totale
  minuti: number;              // durata (già calcolata; per le righe aperte: finora)
  pezzi: number | null; aperta: boolean;
}

/** Riepilogo della giornata: le aperte prima, poi le chiuse dalla più recente; totale in minuti e fasi chiuse. */
export function riepilogoOggi(righe: RigaOggi[]): { righe: RigaOggi[]; totaleMin: number; chiuse: number; aperte: number } {
  const ordinate = [...righe].sort((a, b) => Number(b.aperta) - Number(a.aperta) || (b.inizio ?? '').localeCompare(a.inizio ?? ''));
  return {
    righe: ordinate,
    totaleMin: Math.round(righe.reduce((s, r) => s + Math.max(0, r.minuti || 0), 0)),
    chiuse: righe.filter(r => !r.aperta).length,
    aperte: righe.filter(r => r.aperta).length,
  };
}

/** Le commesse toccate di recente dall'operatore, una volta sola, dalla più recente (per riaprirle senza QR). */
export function commesseRecenti<T extends { codice_qr: string }>(righe: T[], max = 5): T[] {
  const viste = new Set<string>();
  const out: T[] = [];
  for (const r of righe) { if (viste.has(r.codice_qr)) continue; viste.add(r.codice_qr); out.push(r); if (out.length >= max) break; }
  return out;
}
