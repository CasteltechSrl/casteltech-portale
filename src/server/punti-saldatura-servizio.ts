/**
 * Punti di saldatura THT per il preventivo (Adriano 4/11/2026): dai documenti del cliente collegati al preventivo
 * (piedini dal CAD o dalle impronte, confrontati con i fori del Gerber) oppure dalla BOM collegata in Quotazioni
 * (righe con tecnologia T, piedini dal case, dai poli o dalla descrizione). Solo lettura, all'apertura o col pulsante.
 */
import { q1 } from './db.js';
import { ESITI, type RigaBom } from './codifica-servizio.js';
import { contaPuntiSaldatura, puntiDaBom, STAGNO_A_PUNTO, type PuntiSaldatura } from '../engine/scheda/piedini.js';
import type { AnalisiScheda } from '../engine/scheda/analisi.js';

export interface EsitoPunti extends PuntiSaldatura {
  origine: 'documenti' | 'bom';
  nome: string;
  /** saldatura proposta dai documenti (SMD su due lati = a mano, altrimenti onda) */
  saldatura: 'onda' | 'mano' | null;
  grammi: typeof STAGNO_A_PUNTO;
}

export async function puntiSaldaturaPreventivo(preventivoId: number | null, bomId: number | null): Promise<EsitoPunti | null> {
  const pac = await q1<{ nome: string; analisi: AnalisiScheda | null }>(
    `SELECT nome, analisi FROM pacchetti_scheda
      WHERE analisi IS NOT NULL AND ((preventivo_id IS NOT NULL AND preventivo_id = $1) OR (bom_id IS NOT NULL AND bom_id = $2))
      ORDER BY (preventivo_id IS NOT DISTINCT FROM $1) DESC, id DESC LIMIT 1`, [preventivoId ?? 0, bomId ?? 0]);
  if (pac?.analisi?.componenti) {
    const a = pac.analisi;
    // pacchetti analizzati prima del 4/11/2026: si contano dai componenti salvati (senza il confronto con i fori)
    const p = a.puntiSaldatura ?? contaPuntiSaldatura(a.componenti);
    return { ...p, origine: 'documenti', nome: pac.nome, saldatura: a.lavorazione?.saldaturaTht ?? null, grammi: STAGNO_A_PUNTO };
  }
  if (!bomId) return null;
  const b = await q1<{ nome: string; righe: RigaBom[] | null }>(`SELECT nome, righe FROM bom_analisi WHERE id = $1`, [bomId]);
  if (!b) return null;
  const p = puntiDaBom((b.righe ?? []).map(r => ({
    designatori: r.designatori, qtaScheda: Number(r.qtaScheda) || 0, montata: r.esito !== ESITI.NON_MONTATO,
    tecnologia: r.attributi?.tecnologia ?? null, poli: r.famiglia === 'CN' || r.famiglia === 'TI' ? r.attributi?.poli ?? null : null,
    testi: [r.attributi?.case, r.footprint, r.descrizioneBom, r.descrizione, r.valore],
  })));
  return { ...p, origine: 'bom', nome: b.nome, saldatura: null, grammi: STAGNO_A_PUNTO };
}
