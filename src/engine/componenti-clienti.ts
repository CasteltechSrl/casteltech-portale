import { corrispondeRicerca } from './ricerca.js';
/**
 * Componenti dei clienti e righe del DDT (Adriano 2/11/2026).
 * - Anagrafiche → Componenti clienti: i codici del materiale in conto lavoro, ognuno con il suo cliente, tutto in MAIUSCOLO;
 *   si caricano da Excel/CSV del cliente (codice, descrizione, famiglia, gruppo).
 * - Nel DDT ogni riga dice da dove viene il codice: prodotto del cliente, componente nostro (archivio Componenti),
 *   componente del cliente, oppure libero (codice e descrizione scritti a mano).
 */

export const FONTI_RIGA = ['prodotto', 'componente', 'componente_cliente', 'libero'] as const;
export type FonteRiga = typeof FONTI_RIGA[number];
export const NOMI_FONTI: Record<FonteRiga, string> = {
  prodotto: 'Prodotto', componente: 'Componente nostro', componente_cliente: 'Componente cliente', libero: 'Libero',
};

const pulito = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();
export const maiuscoloPulito = (s: unknown) => pulito(s).toUpperCase();
/** Codici confrontati senza spazi, trattini e punti: "rs-0603" = "RS0603". */
export const chiaveCodice = (s: unknown) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Fonte della riga: quella scelta, altrimenti dedotta dai collegamenti salvati (le righe vecchie). */
export function fonteRiga(r: { fonte?: string | null; prodotto_id?: unknown; componente_id?: unknown; componente_cliente_id?: unknown; codice?: string | null; solo_descrizione?: boolean }): FonteRiga {
  if ((FONTI_RIGA as readonly string[]).includes(String(r.fonte ?? ''))) return r.fonte as FonteRiga;
  if (Number(r.componente_cliente_id)) return 'componente_cliente';
  if (Number(r.componente_id)) return 'componente';
  if (Number(r.prodotto_id)) return 'prodotto';
  if (r.codice && String(r.codice).trim()) return 'libero';
  return 'prodotto';
}

/** Componente nostro sul DDT: codice = gestionale; descrizione = P/N (codice di produzione). Scelta di Adriano 2/11/2026. */
export function rigaComponenteNostro(c: { pn?: string | null; codice_gestionale?: string | null; codice_produzione?: string | null; descrizione?: string | null }) {
  const pn = pulito(c.pn), prod = pulito(c.codice_produzione);
  const codice = pulito(c.codice_gestionale) || pn || prod;
  const descrizione = pn ? (prod ? `${pn} (${prod})` : pn) : (prod || pulito(c.descrizione));
  return { codice: codice.toUpperCase(), descrizione: descrizione.toUpperCase() };
}

export interface ComponenteClienteLetto { codice: string; descrizione: string | null; famiglia: string | null; gruppo: string | null }

/**
 * Elenco del cliente letto dal file (righe già divise in celle). Riconosce le colonne dall'intestazione
 * (Cod/Codice/Articolo, Descrizione, DescrSFam/Famiglia, DescrGruppo/Gruppo); senza intestazione riconoscibile
 * (es. "Colonna1;Colonna2") la prima colonna è il codice e la seconda la descrizione. Righe senza codice saltate,
 * codici ripetuti: vale l'ultima riga.
 */
export function leggiElencoComponentiCliente(righe: string[][]): { componenti: ComponenteClienteLetto[]; scartate: number } {
  const testa = (righe[0] ?? []).map(x => pulito(x).toLowerCase());
  const trova = (re: RegExp, salta: number[] = []) => testa.findIndex((t, i) => re.test(t) && !salta.includes(i));
  let codice = trova(/^(cod|codice|cod\.|articolo|cod articolo|codice articolo|item|part ?number)$/);
  let famiglia = trova(/(sfam|famiglia|categoria)/);
  let gruppo = trova(/gruppo/, [famiglia]);
  let descrizione = trova(/^descr(izione)?$|^description$/);
  if (descrizione < 0) descrizione = trova(/descr/, [famiglia, gruppo]);
  let inizio = 1;
  if (codice < 0) {
    // niente intestazione riconoscibile: prima colonna codice, seconda descrizione (salta la riga di intestazione generica "Colonna1")
    codice = 0; descrizione = 1; famiglia = -1; gruppo = -1;
    inizio = testa.every(t => !t || /^colonna\s*\d+$|^column\s*\d+$/.test(t)) ? 1 : 0;
  }
  const perCodice = new Map<string, ComponenteClienteLetto>();
  let scartate = 0;
  for (const r of righe.slice(inizio)) {
    if (!r || r.every(c => !pulito(c))) continue;
    const c = maiuscoloPulito(r[codice]);
    if (!c) { scartate++; continue; }
    const cella = (i: number) => (i >= 0 ? maiuscoloPulito(r[i]) || null : null);
    perCodice.set(c, { codice: c, descrizione: cella(descrizione), famiglia: cella(famiglia), gruppo: cella(gruppo) });
  }
  return { componenti: [...perCodice.values()], scartate };
}

/** Testo da file: UTF-8 se valido, altrimenti Windows-1252 (i CSV salvati da Excel italiano). */
export function testoDaFile(b: Uint8Array): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(b).replace(/^﻿/, ''); }
  catch { return new TextDecoder('windows-1252').decode(b); }
}

/**
 * Ricerca nell'elenco dei componenti dei clienti (Adriano 11/11/2026, elenco a pagine): come la ricerca veloce delle anagrafiche
 * (più parole, accenti e trattini non contano) ma fatta sul server, così guarda tutti i codici e non solo la pagina aperta.
 */
export function filtraComponentiClienti<T extends { codice: string; cliente?: string | null; descrizione?: string | null; famiglia?: string | null; gruppo?: string | null }>(righe: T[], cerca: string): T[] {
  const testo = cerca.trim();
  if (!testo) return righe;
  return righe.filter(k => corrispondeRicerca([k.codice, k.descrizione, k.famiglia, k.gruppo, k.cliente].filter(Boolean).join(' '), testo));
}
