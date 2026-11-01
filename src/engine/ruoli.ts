/**
 * Profili degli utenti del portale.
 * - ufficio: accesso completo.
 * - produzione: inserimento tempi e note dal reparto.
 * - contabilita (Adriano 31/10/2026: il commercialista e Sonia di HTS che aiuta con la contabilità): SOLA LETTURA
 *   dell'Amministrazione (cruscotto, documenti, fatture fornitori, registri IVA, VIES, stampe, Excel e XML) e della Guida.
 *   Non può salvare, emettere, inviare né segnare pagamenti: ogni richiesta che non sia una lettura (GET) viene rifiutata.
 */
export const RUOLI = ['ufficio', 'produzione', 'contabilita'] as const;
export type Ruolo = typeof RUOLI[number];

export const NOMI_RUOLI: Record<Ruolo, string> = { ufficio: 'Ufficio', produzione: 'Produzione', contabilita: 'Contabilità (sola lettura)' };
export const DESCRIZIONI_RUOLI: Record<Ruolo, string> = {
  ufficio: 'accesso completo',
  produzione: 'solo inserimento tempi e note sulle schede',
  contabilita: 'solo lettura di Amministrazione e Guida, per il commercialista e chi aiuta con la contabilità',
};

/** Profilo scritto nel modulo Utenti; un valore sconosciuto diventa "produzione" (il più ristretto tra quelli storici). */
export const ruoloDaModulo = (x: unknown): Ruolo => (RUOLI as readonly string[]).includes(String(x)) ? String(x) as Ruolo : 'produzione';

/** Pagina iniziale dopo l'accesso: per l'ufficio il cruscotto generale (Adriano 31/10/2026). */
export const paginaIniziale = (ruolo: Ruolo) => (ruolo === 'ufficio' ? '/cruscotto' : ruolo === 'contabilita' ? '/amministrazione' : '/r');

/** La contabilità può solo leggere (GET/HEAD) le pagine dell'Amministrazione (e la ricerca in alto, che per lei trova solo documenti). */
export const contabilitaPuo = (metodo: string, percorso: string) =>
  (metodo === 'GET' || metodo === 'HEAD') && (percorso === '/amministrazione' || percorso.startsWith('/amministrazione/') || percorso === '/cerca' || percorso === '/cerca/')
  && !/^\/amministrazione\/documenti\/nuovo(\/|\?|$)/.test(percorso);
