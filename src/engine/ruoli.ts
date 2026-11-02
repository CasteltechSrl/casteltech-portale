/**
 * Profili degli utenti del portale.
 * - ufficio: accesso completo.
 * - produzione: inserimento tempi e note dal reparto.
 * - contabilita (Adriano 31/10/2026: il commercialista e Sonia di HTS che aiuta con la contabilità): SOLA LETTURA
 *   dell'Amministrazione (cruscotto, documenti, fatture fornitori, registri IVA, VIES, stampe, Excel e XML) e della Guida.
 *   Non può salvare, emettere, inviare né segnare pagamenti: ogni richiesta che non sia una lettura (GET) viene rifiutata.
 * - esterno (Adriano 2/11/2026: "un accesso per esterni che possono vedere tutto, ma senza poter modificare nulla"):
 *   vede tutte le pagine dell'ufficio (stesso menu) in SOLA LETTURA. Restano fuori solo Impostazioni (chiavi dei servizi,
 *   utenti, backup) e l'area riservata delle buste paga; ogni richiesta che non sia una lettura (GET) viene rifiutata.
 */
export const RUOLI = ['ufficio', 'produzione', 'contabilita', 'esterno'] as const;
export type Ruolo = typeof RUOLI[number];

export const NOMI_RUOLI: Record<Ruolo, string> = {
  ufficio: 'Ufficio', produzione: 'Produzione', contabilita: 'Contabilità (sola lettura)', esterno: 'Esterno (vede tutto, sola lettura)',
};
export const DESCRIZIONI_RUOLI: Record<Ruolo, string> = {
  ufficio: 'accesso completo',
  produzione: 'solo inserimento tempi e note sulle schede',
  contabilita: 'solo lettura di Amministrazione e Guida, per il commercialista e chi aiuta con la contabilità',
  esterno: 'vede tutto il portale ma non modifica nulla (escluse Impostazioni e buste paga), per consulenti e visitatori esterni',
};

/** Profilo scritto nel modulo Utenti; un valore sconosciuto diventa "produzione" (il più ristretto tra quelli storici). */
export const ruoloDaModulo = (x: unknown): Ruolo => (RUOLI as readonly string[]).includes(String(x)) ? String(x) as Ruolo : 'produzione';

/** Pagina iniziale dopo l'accesso: per l'ufficio il cruscotto generale (Adriano 31/10/2026). */
export const paginaIniziale = (ruolo: Ruolo) =>
  (ruolo === 'ufficio' || ruolo === 'esterno' ? '/cruscotto' : ruolo === 'contabilita' ? '/amministrazione' : '/r');

/** Profili che vedono le pagine ma non modificano nulla (nella pagina: `body.sola-lettura` o `body.sola-lettura-tutto`). */
export const solaLettura = (ruolo: Ruolo | undefined) => ruolo === 'contabilita' || ruolo === 'esterno';

/**
 * L'esterno può solo leggere (GET/HEAD) tutte le pagine dell'ufficio, tranne Impostazioni (chiavi, utenti, backup),
 * l'area riservata delle buste paga e le pagine "nuovo…" (moduli vuoti da compilare).
 */
export const esternoPuo = (metodo: string, percorso: string) =>
  (metodo === 'GET' || metodo === 'HEAD')
  && !/^\/impostazioni(\/|$)/.test(percorso)
  && !/^\/dipendenti\/riservata(\/|$)/.test(percorso)
  && !/\/nuovo(\/|$)/.test(percorso);

/** La contabilità può solo leggere (GET/HEAD) le pagine dell'Amministrazione (e la ricerca in alto, che per lei trova solo documenti). */
export const contabilitaPuo = (metodo: string, percorso: string) =>
  (metodo === 'GET' || metodo === 'HEAD') && (percorso === '/amministrazione' || percorso.startsWith('/amministrazione/') || percorso === '/cerca' || percorso === '/cerca/')
  && !/^\/amministrazione\/documenti\/nuovo(\/|\?|$)/.test(percorso);

/**
 * Dove andare dopo l'accesso (Adriano 1/11/2026: il commercialista entra direttamente nel cruscotto dell'Amministrazione).
 * Si torna alla pagina chiesta prima del login solo se il profilo la può aprire; altrimenti la pagina iniziale del profilo.
 */
export function paginaDopoAccesso(ruolo: Ruolo, torna: unknown): string {
  const t = String(torna ?? '/');
  if (!t.startsWith('/') || t.startsWith('//') || t === '/') return paginaIniziale(ruolo);
  if (ruolo === 'contabilita' && !contabilitaPuo('GET', t.split(/[?#]/)[0])) return paginaIniziale(ruolo);
  // l'esterno non va nelle pagine del reparto (/r: sono per gli operatori con il PIN)
  if (ruolo === 'esterno' && (!esternoPuo('GET', t.split(/[?#]/)[0]) || /^\/r(\/|\?|#|$)/.test(t))) return paginaIniziale(ruolo);
  return t;
}
