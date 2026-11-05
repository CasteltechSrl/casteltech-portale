/**
 * Unica porta verso l'API Anthropic (lettura di BOM, ordini, DDT, fatture estere, fogli tempi; guida).
 * Ogni risposta riuscita conta token e costo (Impostazioni → Servizi); ogni errore diventa un messaggio chiaro
 * (credito finito, tetto di spesa, chiave non valida, troppe richieste) e resta nello storico dei servizi.
 * Chiave: ANTHROPIC_API_KEY (solo su Render). Modello: ANTHROPIC_MODEL (default claude-sonnet-5-5).
 * Ricerca su internet (Adriano 5/11/2026, componenti non trovati): `strumenti: [STRUMENTO_RICERCA_WEB]` fa cercare l'IA sul web
 * (strumento web_search di Anthropic, nessun servizio in più); ogni ricerca costa 1 centesimo di dollaro e si conta nei consumi.
 */
import { erroreIa, type TipoErroreIa } from '../engine/servizi.js';
import { erroreServizio, modelloIa, rispostaIa } from './stato-servizi.js';

export const iaConfigurata = () => !!process.env.ANTHROPIC_API_KEY;

export class ErroreIa extends Error {
  constructor(public tipo: TipoErroreIa, messaggio: string) { super(messaggio); }
}

/**
 * Manda una richiesta a /v1/messages e restituisce il testo della risposta.
 * `voce` dice a cosa serve (es. "lettura ordini"): i consumi si vedono anche divisi così.
 */
/** Strumento di ricerca su internet di Anthropic: `maxRicerche` = quante ricerche al massimo in una richiesta. */
export const strumentoRicercaWeb = (maxRicerche: number) => ({ type: 'web_search_20260209', name: 'web_search', max_uses: maxRicerche });

export async function chiediTestoIa(voce: string, corpo: { system: string; max_tokens: number; messages: unknown[]; strumenti?: unknown[] }, attesaMs: number): Promise<string> {
  if (!iaConfigurata()) throw new ErroreIa('chiave', "manca la chiave dell'IA (ANTHROPIC_API_KEY su Render)");
  const modello = modelloIa();
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), attesaMs);
  const { strumenti, ...resto } = corpo;
  const messages = [...corpo.messages];
  let testo = '';
  try {
    // con la ricerca su internet l'IA può fermarsi a metà (pause_turn): si continua la stessa conversazione, al massimo 3 volte
    for (let giro = 0; giro < 3; giro++) {
      let r: Response;
      try {
        r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST', signal: ctrl.signal,
          headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({ model: modello, ...resto, messages, ...(strumenti?.length ? { tools: strumenti } : {}) }),
        });
      } catch (e: any) {
        const msg = e?.name === 'AbortError' ? "l'IA non ha risposto in tempo: riprova" : `l'IA non è raggiungibile: ${e?.message ?? e}`;
        erroreServizio('ia', 'tempo', msg);
        throw new ErroreIa('tempo', msg);
      }
      const j: any = await r.json().catch(() => null);
      if (!r.ok) {
        const e = erroreIa(r.status, j);
        erroreServizio('ia', e.tipo, e.messaggio);
        throw new ErroreIa(e.tipo, e.messaggio);
      }
      rispostaIa(voce, String(j?.model ?? modello), j?.usage, r.headers);
      testo += (j?.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('');
      if (j?.stop_reason !== 'pause_turn' || !strumenti?.length) break;
      messages.push({ role: 'assistant', content: j.content });
    }
    return testo;
  } finally { clearTimeout(t); }
}
