/**
 * Bozze che si salvano da sole (proposta della revisione, Adriano 1/11/2026): fattura / nota di credito / DDT, conferma d'ordine,
 * ordine a fornitore. Il modulo con `data-autosalva="1"` viene inviato da public/autosalva.js 2 secondi dopo l'ultima modifica
 * con l'intestazione X-Autosalva: lo stesso salvataggio del pulsante Salva, ma la risposta è JSON (esito e ora) invece del
 * ricaricamento della pagina. Il pulsante Salva continua a funzionare come prima (e Ctrl+S lo preme).
 */
import type { Request, Response } from 'express';

export const eAutosalvataggio = (req: Request) => req.get('x-autosalva') === '1';

/** Esito per lo script: ok, errori in parole, ora italiana del salvataggio. */
export function esitoAutosalvataggio(errori: string[], adesso = new Date()) {
  return { ok: errori.length === 0, errori, ora: adesso.toLocaleTimeString('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' }) };
}

/** Salvataggio automatico → JSON; salvataggio con il pulsante → pagina ricaricata con il messaggio. */
export function rispondiSalvataggio(req: Request, res: Response, errori: string[], indirizzoDopo: string) {
  if (eAutosalvataggio(req)) return res.json(esitoAutosalvataggio(errori));
  res.redirect(indirizzoDopo);
}
