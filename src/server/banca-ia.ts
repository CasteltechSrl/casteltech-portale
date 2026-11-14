/**
 * Proposte dell'IA per i movimenti della banca che le regole non sanno abbinare (Adriano 14/11/2026). Regole e controllo della risposta
 * in `engine/banca-ia.ts`. Si chiede dopo ogni caricamento con movimenti nuovi (CSV o scarico automatico) e con il pulsante della pagina;
 * un movimento già guardato non si richiede (salvo `tutti`). Una richiesta sola per volta, al massimo 40 movimenti.
 */
import { q } from './db.js';
import { chiediTestoIa, iaConfigurata } from './ia.js';
import { contiBanca, movimentiDaAbbinare, rateCandidate } from './banca-servizio.js';
import { ISTRUZIONI_BANCA_IA, leggiRispostaIa, richiestaIa } from '../engine/banca-ia.js';
import { nomeConto, SOGLIA_SICURA } from '../engine/banca.js';
import { oggi } from './stato-servizi.js';

let inCorso = false;

export async function proponiConIa(tutti = false): Promise<{ chiesti: number; proposte: number; testo: string }> {
  if (!iaConfigurata()) return { chiesti: 0, proposte: 0, testo: "manca la chiave dell'IA" };
  if (inCorso) return { chiesti: 0, proposte: 0, testo: "l'IA sta già guardando i movimenti" };
  inCorso = true;
  try {
    const righe = (await movimentiDaAbbinare())
      .filter(x => (x.proposta?.punteggio ?? 0) < SOGLIA_SICURA && !(x.sicura && !x.ia) && (tutti || !x.ia))
      .slice(0, 40);
    if (!righe.length) return { chiesti: 0, proposte: 0, testo: 'nessun movimento da far guardare' };
    const movimenti = righe.map(x => x.m);
    const dal = new Date(Date.parse(movimenti[0].data) - 60 * 86400000).toISOString().slice(0, 10);
    const [rate, conti] = await Promise.all([rateCandidate(dal), contiBanca()]);
    const testo = await chiediTestoIa('abbinamento banca', {
      system: ISTRUZIONI_BANCA_IA, max_tokens: 6000,
      messages: [{ role: 'user', content: richiestaIa(movimenti, rate, n => nomeConto(n, conti)) }],
    }, 120_000);
    const esito = leggiRispostaIa(testo, movimenti, rate, oggi());
    // anche i movimenti senza risposta valida si segnano "guardati", così non si richiedono a ogni caricamento
    for (const m of movimenti)
      await q(`UPDATE banca_movimenti SET proposta_ia = $2 WHERE id = $1 AND stato = 'da_abbinare'`,
        [m.id, JSON.stringify(esito.get(m.id) ?? { rate: [], categoria: null, motivo: "l'IA non ha trovato nulla di sicuro", sicura: false, il: oggi() })]);
    return { chiesti: movimenti.length, proposte: esito.size, testo: `l'IA ha guardato ${movimenti.length} movimenti e ne ha proposti ${esito.size}` };
  } finally { inCorso = false; }
}
