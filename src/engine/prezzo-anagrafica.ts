/**
 * Prezzo in anagrafica dal preventivo e dall'ordine (Adriano 11/11/2026). Nessun accesso al database.
 * - Il preventivo mandato al cliente (email del portale o "Segna come inviato") scrive in anagrafica il prezzo a scheda SENZA una tantum,
 *   quello della stampa (prezzi riscritti a mano e sconto compresi). Un preventivo solo salvato non tocca l'anagrafica.
 * - Con la spunta "Variazione quantità", al salvataggio si sceglie: prezzo per tutte le quantità (`unico`: niente più scaglioni),
 *   solo per uno scaglione di pezzi (`scaglione`) o anagrafica intoccata (`nessuno`). La scelta vale subito e di nuovo all'invio.
 * - Ordine con un prezzo diverso dall'anagrafica: l'ufficio sceglie se la riga prende il prezzo dell'anagrafica o se l'anagrafica prende quello dell'ordine.
 */
import { prezzoPerQuantita, type Scaglione } from './listino.js';

export type ModoAnagrafica = 'unico' | 'scaglione' | 'nessuno';
export interface SceltaAnagrafica { modo: ModoAnagrafica; da?: number; a?: number | null }

/** Scelta letta dal modulo (o dal database): null se non valida. */
export function leggiSceltaAnagrafica(x: any): SceltaAnagrafica | null {
  if (!x || typeof x !== 'object') return null;
  const modo = x.modo;
  if (modo === 'unico' || modo === 'nessuno') return { modo };
  if (modo !== 'scaglione') return null;
  const da = Math.round(Number(String(x.da ?? '').replace(',', '.')));
  const aTesto = String(x.a ?? '').trim();
  const a = aTesto === '' ? null : Math.round(Number(aTesto.replace(',', '.')));
  if (!(da >= 1) || (a != null && !(a >= da))) return null;
  return { modo, da, a };
}

/**
 * Scaglioni dopo aver messo `prezzo` sui pezzi da `da` ad `a` (null = e oltre): gli scaglioni che si sovrappongono si accorciano o si dividono,
 * e le quantità oltre `a` continuano a costare quanto costavano prima (si aggiunge lo scaglione che serve, col prezzo di prima).
 */
export function inserisciScaglione(prezzoUnico: number | null, scaglioni: Scaglione[], da: number, a: number | null, prezzo: number): Scaglione[] {
  const ordinati = [...scaglioni].sort((x, y) => x.da - y.da);
  const fuori: Scaglione[] = [];
  for (const s of ordinati) {
    if (s.da < da) fuori.push({ ...s, a: s.a == null ? da - 1 : Math.min(s.a, da - 1) });
    if (a != null && (s.a == null || s.a > a)) {
      const inizio = Math.max(s.da, a + 1);
      if (s.a == null || inizio <= s.a) fuori.push({ ...s, da: inizio });
    }
  }
  const nuovi = [...fuori.filter(s => s.a == null || s.a >= s.da), { da, a, prezzo }].sort((x, y) => x.da - y.da);
  if (a != null && !nuovi.some(s => s.da === a + 1)) {
    const prima = prezzoPerQuantita(prezzoUnico, ordinati, a + 1).prezzo;
    if (prima != null) {
      const prossimo = nuovi.find(s => s.da > a + 1);
      nuovi.push({ da: a + 1, a: prossimo ? prossimo.da - 1 : null, prezzo: prima });
    }
  }
  // scaglioni uniti se di fila con lo stesso prezzo
  const finali: Scaglione[] = [];
  for (const s of nuovi.sort((x, y) => x.da - y.da)) {
    const u = finali[finali.length - 1];
    if (u && u.a != null && u.a + 1 === s.da && Math.abs(u.prezzo - s.prezzo) < 0.000005) u.a = s.a;
    else finali.push({ ...s });
  }
  return finali;
}

/** Differenza tra il prezzo della riga d'ordine e quello dell'anagrafica per la sua quantità: null se uguali o se manca il prezzo della riga. */
export function differenzaOrdine(rigaPrezzo: number, quantita: number, prezzoUnico: number | null, scaglioni: Scaglione[]): { anagrafica: number | null } | null {
  if (!(rigaPrezzo > 0)) return null;
  const an = prezzoPerQuantita(prezzoUnico, scaglioni, quantita).prezzo;
  if (an != null && Math.abs(an - rigaPrezzo) < 0.005) return null;
  return { anagrafica: an };
}
