/**
 * Cruscotto dell'Amministrazione (Adriano, 27/10/2026: "una pagina iniziale in cui ho tutto sotto controllo").
 * Qui solo i conti, senza database: scadenze divise per urgenza, fatturato e acquisti per mese.
 */

export type Fascia = 'scaduta' | 'settimana' | 'mese' | 'oltre';
export const NOMI_FASCE: Record<Fascia, string> = {
  scaduta: 'Scadute', settimana: 'Entro 7 giorni', mese: 'Entro 30 giorni', oltre: 'Oltre 30 giorni',
};

const giorni = (da: string, a: string) => Math.round((Date.parse(a) - Date.parse(da)) / 86_400_000);

/** Urgenza di una scadenza non pagata rispetto a oggi (date aaaa-mm-gg): il giorno stesso non è ancora scaduta. */
export function fasciaScadenza(data: string, oggi: string): Fascia {
  const g = giorni(oggi, data);
  if (g < 0) return 'scaduta';
  if (g <= 7) return 'settimana';
  if (g <= 30) return 'mese';
  return 'oltre';
}

export interface ScadenzaAperta { data: string; importo: number }

/** Totale e numero delle scadenze aperte per fascia. */
export function riepilogoScadenze(scadenze: ScadenzaAperta[], oggi: string) {
  const fasce = Object.fromEntries((Object.keys(NOMI_FASCE) as Fascia[]).map(f => [f, { totale: 0, quante: 0 }])) as Record<Fascia, { totale: number; quante: number }>;
  for (const s of scadenze) {
    const f = fasce[fasciaScadenza(s.data, oggi)];
    f.totale = Math.round((f.totale + s.importo) * 100) / 100;
    f.quante++;
  }
  const totale = Math.round(scadenze.reduce((t, s) => t + s.importo, 0) * 100) / 100;
  return { totale, fasce };
}

export interface MovimentoMese { tipo: string; data: string; imponibile: number }

/**
 * Imponibile per mese dell'anno (12 valori, gennaio = 0): le note di credito tolgono.
 * Con `finoA` (aaaa-mm-gg) conta solo fino a quel giorno, per confrontare lo stesso periodo dell'anno prima.
 */
export function imponibilePerMese(movimenti: MovimentoMese[], anno: number, finoA?: string): number[] {
  const mesi = Array(12).fill(0) as number[];
  for (const m of movimenti) {
    if (Number(m.data.slice(0, 4)) !== anno || (finoA && m.data.slice(5) > finoA.slice(5))) continue;
    const i = Number(m.data.slice(5, 7)) - 1;
    mesi[i] = Math.round((mesi[i] + (m.tipo === 'nota_credito' ? -1 : 1) * m.imponibile) * 100) / 100;
  }
  return mesi;
}

/** Variazione percentuale (arrotondata all'intero); null se l'anno prima non c'era nulla da confrontare. */
export function variazione(attuale: number, prima: number): number | null {
  return prima > 0 ? Math.round(((attuale - prima) / prima) * 100) : null;
}
