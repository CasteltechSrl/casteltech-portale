/**
 * Modi di pagamento e banche/strumenti (Adriano 7/11/2026: "manca il RID e manca una sezione in impostazioni in cui si possa
 * modificare e/o aggiungere dei metodi di pagamento; stesso discorso per tramite cosa è avvenuto: banca, carta di credito, bancomat").
 * Due elenchi modificabili in Impostazioni → Amministrazione → Modi di pagamento e banche (impostazioni 'modi_pagamento'):
 * - modi: come è stata pagata/incassata la rata (Bonifico, Ri.Ba., RID…): menu obbligatorio quando si segna una rata;
 * - strumenti: con che cosa (Bper, Credit Agricole, carta di credito aziendale…): casella facoltativa con l'elenco proposto.
 * "Compensato con fattura" e "Stornato" li usa il portale da solo (note di credito compensate): restano sempre nell'elenco.
 * Cambiare un nome non tocca le rate già segnate (conservano il testo di allora).
 */
import { MODI_PAGAMENTO } from './amministrazione.js';

export const MODI_DI_SISTEMA = ['Compensato con fattura', 'Stornato'] as const;
export const MASSIMO_VOCI = 60;

export interface ModiPagamento { modi: string[]; strumenti: string[] }

/** Una voce per riga (le virgole possono stare nel nome), spazi in più tolti, doppioni tolti senza badare alle maiuscole. */
export function elencoDaTesto(testo: unknown): string[] {
  const visti = new Set<string>();
  const fuori: string[] = [];
  for (const riga of String(testo ?? '').split(/\r?\n/)) {
    const v = riga.trim().replace(/\s+/g, ' ').slice(0, 60);
    const k = v.toLowerCase();
    if (!v || visti.has(k)) continue;
    visti.add(k);
    fuori.push(v);
  }
  return fuori.slice(0, MASSIMO_VOCI);
}

/** Modi da usare: quelli salvati (o i predefiniti) + i due del portale in fondo se mancano. */
export function modiDaUsare(salvati: unknown): string[] {
  const base = Array.isArray(salvati) && salvati.length ? elencoDaTesto(salvati.join('\n')) : [...MODI_PAGAMENTO];
  for (const m of MODI_DI_SISTEMA) if (!base.some(x => x.toLowerCase() === m.toLowerCase())) base.push(m);
  return base;
}

/** Banche e strumenti: quelli salvati; finché l'ufficio non li ha scritti, quelli già usati nelle rate. */
export function strumentiDaUsare(salvati: unknown, usati: string[]): string[] {
  return Array.isArray(salvati) ? elencoDaTesto(salvati.join('\n')) : elencoDaTesto(usati.join('\n'));
}

/** Valore salvato in impostazioni → elenchi pronti. */
export function leggiModiPagamento(valore: unknown, usati: string[] = []): ModiPagamento {
  const v = (valore && typeof valore === 'object' ? valore : {}) as { modi?: unknown; strumenti?: unknown };
  return { modi: modiDaUsare(v.modi), strumenti: strumentiDaUsare(v.strumenti, usati) };
}
