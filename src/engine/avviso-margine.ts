/**
 * Avviso margine nella bozza di fattura (proposta della revisione, Adriano 1/11/2026 "applica i suggerimenti").
 *
 * Per ogni riga con un codice prodotto si confronta il prezzo scritto con l'ultimo preventivo salvato di quel codice
 * (prezzo a scheda dei lotti successivi) e con il suo margine:
 *  - prezzo netto (dopo lo sconto) sotto il prezzo del preventivo di oltre l'1 % → riga gialla "sotto il preventivo";
 *  - prezzo in linea ma margine del preventivo sotto il 10 % → riga gialla "margine basso".
 * È solo un avviso: la fattura si emette lo stesso. Senza preventivo del codice non si dice niente.
 */

export interface RiferimentoPreventivo { numero: string; prezzoScheda: number; marginePct: number | null; preventivoId?: number }
export interface RigaDaControllare { codice?: string | null; prezzo?: number | null; sconto?: number | null; solo_descrizione?: boolean | null }
export interface AvvisoMargine { livello: 'critico' | 'attenzione'; testo: string }

export const MARGINE_MINIMO_PCT = 10;
const TOLLERANZA = 0.01;   // 1 %: arrotondamenti del listino

const euroIt = (n: number) => n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' €';

export function avvisoMargine(riga: RigaDaControllare, rif: RiferimentoPreventivo | undefined | null): AvvisoMargine | null {
  if (!rif || riga.solo_descrizione || !riga.codice || !(rif.prezzoScheda > 0)) return null;
  const prezzo = Number(riga.prezzo);
  if (!Number.isFinite(prezzo) || prezzo <= 0) return null;
  const sconto = Number(riga.sconto) || 0;
  const netto = prezzo * (1 - sconto / 100);
  if (netto < rif.prezzoScheda * (1 - TOLLERANZA)) {
    const pct = Math.round((1 - netto / rif.prezzoScheda) * 100);
    return { livello: 'critico', testo: `Sotto il preventivo ${rif.numero}: lì ${euroIt(rif.prezzoScheda)} a scheda, qui ${euroIt(netto)} (−${pct} %).` };
  }
  if (rif.marginePct != null && rif.marginePct < MARGINE_MINIMO_PCT) {
    return { livello: 'attenzione', testo: `Margine del preventivo ${rif.numero} solo ${Math.round(rif.marginePct)} %: prezzo in linea ma guadagno basso.` };
  }
  return null;
}

/** Gli avvisi di tutte le righe, per indice di riga (solo quelle che ne hanno uno). */
export function avvisiRighe(righe: RigaDaControllare[], riferimenti: Map<string, RiferimentoPreventivo>): Map<number, AvvisoMargine> {
  const out = new Map<number, AvvisoMargine>();
  righe.forEach((r, i) => {
    const a = avvisoMargine(r, r.codice ? riferimenti.get(String(r.codice).toUpperCase()) : null);
    if (a) out.set(i, a);
  });
  return out;
}

/** Frase di riepilogo sopra la tabella (null se non c'è niente da dire). */
export function riepilogoAvvisi(avvisi: Map<number, AvvisoMargine>): string | null {
  if (!avvisi.size) return null;
  const sotto = [...avvisi.values()].filter(a => a.livello === 'critico').length;
  const parti: string[] = [];
  if (sotto) parti.push(sotto === 1 ? '1 riga sotto il prezzo del preventivo' : `${sotto} righe sotto il prezzo del preventivo`);
  const bassi = avvisi.size - sotto;
  if (bassi) parti.push(bassi === 1 ? '1 riga con margine del preventivo sotto il 10 %' : `${bassi} righe con margine del preventivo sotto il 10 %`);
  return `Controlla i prezzi: ${parti.join(' e ')} (righe in giallo). La fattura si può emettere comunque.`;
}
