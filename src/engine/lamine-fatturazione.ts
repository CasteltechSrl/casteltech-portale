/**
 * Verifica della fatturazione delle lamine (Adriano 11/11/2026): "nel momento in cui acquistiamo una lamina, l'acquistiamo per un prodotto
 * e quindi va messa nella fattura... mettimi degli alert se vedi che ho acquistato delle lamine ma non le ho vendute nel giro di un mese".
 *
 * Senza magazzino non sappiamo per quale cliente è ogni lamina comprata (LOPAR non lo scrive sempre): il conto è a pezzi, in ordine di data.
 * Le lamine fatturate (a parte o dentro i costi una tantum, `lamineDellaRiga`) e quelle "non da fatturare" (a nostro carico, accordi, pacchetti:
 * impostazioni 'lamine_a_carico') coprono le comprate dalla più vecchia; quelle che restano sono da fatturare. Oltre `GIORNI_LAMINA` giorni = avviso.
 */
import { LAMINA_COMPRATA, lamineDellaRiga, type RigaClassificata, type RigaLamina } from './analisi-costi.js';

/** Da quando si contano (prima del 2026 il conto non torna: lamine fatturate nei forfait senza scriverlo). */
export const INIZIO_CONTROLLO_LAMINE = '2026-01-01';
export const GIORNI_LAMINA = 30;

export interface LaminaComprata { data: string; fornitore: string; descrizione: string; pezzi: number; importo: number }
/** Lamine che non si fatturano: rifatte a nostro carico, accordi col cliente, comprese in un pacchetto. */
export interface LaminaACarico { data: string; pezzi: number; motivo: string }
export interface LaminaDaFatturare extends LaminaComprata { giorni: number }
export interface SituazioneLamine {
  comprate: number; fatturate: number; aCarico: number;
  /** pezzi comprati ancora senza fattura, dalla più vecchia */
  daFatturare: LaminaDaFatturare[];
  /** di quelle sopra, comprate da più di GIORNI_LAMINA giorni */
  inRitardo: LaminaDaFatturare[];
}

const giorniTra = (da: string, a: string) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${da}T12:00:00Z`)) / 86_400_000);

/** Righe delle fatture dei fornitori che sono lamine comprate (stessa regola del confronto "Comprato e rivenduto"). */
export function lamineComprate(righe: RigaClassificata[], da = INIZIO_CONTROLLO_LAMINE): LaminaComprata[] {
  return righe.filter(r => r.categoria === 'lamine' && r.data >= da && r.importo > 0 && LAMINA_COMPRATA.test(r.descrizione))
    .map(r => ({ data: r.data, fornitore: r.fornitore, descrizione: r.descrizione.split('\n')[0].trim(), pezzi: Math.max(1, Math.round(Math.abs(r.quantita ?? 1))), importo: r.importo }))
    .sort((a, b) => a.data.localeCompare(b.data));
}

/** Pezzi di lamina fatturati (NC in negativo) dal giorno `da`. */
export function pezziFatturati(righe: RigaLamina[], da = INIZIO_CONTROLLO_LAMINE): number {
  return righe.filter(r => !r.data || r.data >= da).reduce((s, r) => s + lamineDellaRiga(r).pezzi, 0);
}

export function situazioneLamine(comprate: LaminaComprata[], fatturate: number, aCarico: LaminaACarico[], oggi: string, da = INIZIO_CONTROLLO_LAMINE): SituazioneLamine {
  const pezziACarico = aCarico.filter(a => a.data >= da).reduce((s, a) => s + a.pezzi, 0);
  let copertura = Math.max(0, fatturate) + pezziACarico;
  const daFatturare: LaminaDaFatturare[] = [];
  for (const c of [...comprate].sort((a, b) => a.data.localeCompare(b.data))) {
    const coperti = Math.min(copertura, c.pezzi);
    copertura -= coperti;
    if (coperti < c.pezzi) daFatturare.push({ ...c, pezzi: c.pezzi - coperti, importo: Math.round(c.importo * (c.pezzi - coperti) / c.pezzi * 100) / 100, giorni: giorniTra(c.data, oggi) });
  }
  return {
    comprate: comprate.reduce((s, c) => s + c.pezzi, 0), fatturate, aCarico: pezziACarico,
    daFatturare, inRitardo: daFatturare.filter(l => l.giorni > GIORNI_LAMINA),
  };
}

/** Elenco delle lamine non da fatturare letto dalle impostazioni (valori sbagliati scartati). */
export function leggiACarico(valore: unknown): LaminaACarico[] {
  if (!Array.isArray(valore)) return [];
  return valore.filter((x): x is LaminaACarico => !!x && typeof x === 'object' && /^\d{4}-\d{2}-\d{2}$/.test(String((x as LaminaACarico).data))
    && Number.isInteger((x as LaminaACarico).pezzi) && (x as LaminaACarico).pezzi > 0)
    .map(x => ({ data: x.data, pezzi: x.pezzi, motivo: String(x.motivo ?? '').slice(0, 200) }));
}

/** Controllo di una lamina "non da fatturare" scritta nella pagina: errore in parole o null. */
export function controllaACarico(data: string, pezzi: string, motivo: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || Number.isNaN(Date.parse(data))) return 'Scrivi la data della lamina.';
  const n = Number(pezzi);
  if (!Number.isInteger(n) || n < 1 || n > 50) return 'Scrivi quante lamine (da 1 a 50).';
  if (motivo.trim().length < 3) return 'Scrivi il motivo (es. "rifatta a nostro carico", "accordo con il cliente").';
  return null;
}

/** Toglie `pezzi` lamine dalle più vecchie (quelle già scritte nella bozza di fattura che si sta preparando). */
export function togliPezzi<T extends { pezzi: number }>(elenco: T[], pezzi: number): T[] {
  let resto = Math.max(0, pezzi);
  const fuori: T[] = [];
  for (const l of elenco) {
    const via = Math.min(resto, l.pezzi);
    resto -= via;
    if (via < l.pezzi) fuori.push({ ...l, pezzi: l.pezzi - via });
  }
  return fuori;
}
