/**
 * Risposte alle osservazioni dei documenti del cliente (Adriano 13/11/2026): letture e scritture su `pacchetti_scheda.accettate`.
 * Regole in `engine/scheda/accettate.ts`; viste in `views/osservazioni.ts`.
 */
import { q, q1 } from './db.js';
import { conAccettate, riapri, rispondi, type Accettate } from '../engine/scheda/accettate.js';
import type { AnalisiScheda } from '../engine/scheda/analisi.js';

/** Risposta (o "Va bene" se il testo è vuoto) a una segnalazione del pacchetto. */
export async function salvaRisposta(pacchettoId: number, chiave: string, r: { testo?: string; esito?: string; prezzo?: boolean; momento?: string }, utente: string): Promise<void> {
  const p = await q1<{ accettate: Accettate }>(`SELECT accettate FROM pacchetti_scheda WHERE id = $1`, [pacchettoId]);
  if (!p || !chiave) return;
  const voce = rispondi(p.accettate?.[chiave], { ...r, da: utente, il: new Date().toISOString() });
  await q(`UPDATE pacchetti_scheda SET accettate = accettate || jsonb_build_object($2::text, $3::jsonb) WHERE id = $1`, [pacchettoId, chiave, JSON.stringify(voce)]);
}

/** "annulla" del Va bene: torna aperta, le risposte restano. */
export async function riapriOsservazione(pacchettoId: number, chiave: string, utente: string): Promise<void> {
  const p = await q1<{ accettate: Accettate }>(`SELECT accettate FROM pacchetti_scheda WHERE id = $1`, [pacchettoId]);
  if (!p || !chiave) return;
  const voce = riapri(p.accettate?.[chiave], { da: utente, il: new Date().toISOString() });
  if (!voce) await q(`UPDATE pacchetti_scheda SET accettate = accettate - $2::text WHERE id = $1`, [pacchettoId, chiave]);
  else await q(`UPDATE pacchetti_scheda SET accettate = accettate || jsonb_build_object($2::text, $3::jsonb) WHERE id = $1`, [pacchettoId, chiave, JSON.stringify(voce)]);
}

/**
 * Pacchetto dei documenti del cliente del preventivo: collegato a lui o a un altro preventivo della stessa quotazione
 * (più quantità, `gruppo_quantita`): le osservazioni valgono per tutti.
 */
export async function osservazioniDelPreventivo(preventivoId: number): Promise<{ id: number; nome: string; analisi: AnalisiScheda } | null> {
  const p = await q1<{ id: number; nome: string; analisi: AnalisiScheda | null; accettate: Accettate }>(`SELECT p.id, p.nome, p.analisi, p.accettate FROM pacchetti_scheda p
    WHERE p.analisi IS NOT NULL AND (p.preventivo_id = $1 OR p.preventivo_id IN (SELECT g.id FROM preventivi g JOIN preventivi v ON v.id = $1
      WHERE v.gruppo_quantita IS NOT NULL AND g.gruppo_quantita = v.gruppo_quantita))
    ORDER BY (p.preventivo_id = $1) DESC, p.analizzato_il DESC NULLS LAST, p.id DESC LIMIT 1`, [preventivoId]);
  return p?.analisi ? { id: p.id, nome: p.nome, analisi: conAccettate(p.analisi, p.accettate) } : null;
}
