/**
 * Domande alla guida con l'IA (API Anthropic): l'IA risponde SOLO con quello che c'è nella guida
 * (src/engine/guida.ts) e indica gli argomenti a cui rimandare. Senza ANTHROPIC_API_KEY la pagina usa solo la ricerca.
 * Nessuna lettura del database: la guida intera va all'IA a ogni domanda (è piccola).
 */
import { AREE_GUIDA, ARGOMENTI_GUIDA, testoArgomento } from '../engine/guida.js';
import { chiediTestoIa, iaConfigurata } from './ia.js';

export { iaConfigurata };

const ISTRUZIONI = `Sei l'assistente del Portale Casteltech, il gestionale interno di Casteltech (assemblaggio di schede elettroniche).
Rispondi alle domande di chi usa il portale (ufficio e produzione, persone non tecniche) usando SOLO la guida qui sotto.

Regole:
- Italiano semplice, frasi brevi, al massimo 6 righe. Se ci sono passi da fare, elencali numerati.
- Non inventare pagine, pulsanti o funzioni che la guida non nomina. Se la guida non risponde, dillo e consiglia di scrivere
  la richiesta in Suggerimenti o di chiedere in ufficio.
- Se una cosa non si può fare, dillo chiaramente e spiega perché (come scritto nella guida).
- Nell'ultima riga scrivi gli argomenti più utili, così: ARGOMENTI: id1, id2 (da 1 a 3 id tra parentesi quadre della guida).

GUIDA DEL PORTALE
${AREE_GUIDA.map(area => `## ${area.nome}\n${ARGOMENTI_GUIDA.filter(a => a.area === area.id).map(testoArgomento).join('\n\n')}`).join('\n\n')}`;

export interface RispostaGuida { risposta: string; argomenti: string[] }

/** Separa il testo della risposta dalla riga "ARGOMENTI: …" (solo gli id che esistono). */
export function leggiRispostaGuida(testo: string): RispostaGuida {
  const righe = testo.trim().split('\n');
  const i = righe.findLastIndex(r => /^\s*\**ARGOMENTI\**\s*:/i.test(r));
  const ids = i >= 0 ? righe[i].replace(/^[^:]*:/, '').split(/[,\s\[\]]+/).filter(Boolean) : [];
  const esistenti = new Set(ARGOMENTI_GUIDA.map(a => a.id));
  return {
    risposta: (i >= 0 ? righe.filter((_, k) => k !== i) : righe).join('\n').trim(),
    argomenti: [...new Set(ids.filter(id => esistenti.has(id)))].slice(0, 3),
  };
}

export async function chiediAllaGuida(domanda: string): Promise<RispostaGuida> {
  return leggiRispostaGuida(await chiediTestoIa('guida', { max_tokens: 1000, system: ISTRUZIONI, messages: [{ role: 'user', content: domanda }] }, 45_000));
}
