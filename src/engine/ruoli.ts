/**
 * Profili degli utenti del portale.
 * - amministratore (Adriano 3/11/2026, da dare all'account info@casteltech.net): tutto quello che fa l'ufficio, più è l'UNICO che sceglie
 *   o cambia il ruolo degli utenti (Impostazioni → Utenti) e che vede stipendi, buste paga e previsione di cassa senza permessi in più.
 * - ufficio: accesso completo, tranne ruoli degli utenti, buste paga e previsione di cassa (salvo il permesso "buste paga" dato dall'amministratore).
 * - produzione: inserimento tempi e note dal reparto.
 * - contabilita (Adriano 31/10/2026: il commercialista e Sonia di HTS che aiuta con la contabilità): SOLA LETTURA
 *   dell'Amministrazione (cruscotto, documenti, fatture fornitori, registri IVA, VIES, stampe, Excel e XML) e della Guida.
 *   Non può salvare, emettere, inviare né segnare pagamenti: ogni richiesta che non sia una lettura (GET) viene rifiutata.
 * - esterno (Adriano 2/11/2026: "un accesso per esterni che possono vedere tutto, ma senza poter modificare nulla"):
 *   vede tutte le pagine dell'ufficio (stesso menu) in SOLA LETTURA. Restano fuori solo Impostazioni (chiavi dei servizi,
 *   utenti, backup) e l'area riservata delle buste paga; ogni richiesta che non sia una lettura (GET) viene rifiutata.
 */
export const RUOLI = ['amministratore', 'ufficio', 'produzione', 'contabilita', 'esterno'] as const;
export type Ruolo = typeof RUOLI[number];

export const NOMI_RUOLI: Record<Ruolo, string> = {
  amministratore: 'Amministratore', ufficio: 'Ufficio', produzione: 'Produzione', contabilita: 'Contabilità (sola lettura)', esterno: 'Esterno (vede tutto, sola lettura)',
};
export const DESCRIZIONI_RUOLI: Record<Ruolo, string> = {
  amministratore: 'accesso completo; l\'unico che cambia i ruoli degli utenti e vede stipendi, buste paga e previsione di cassa',
  ufficio: 'accesso completo, tranne ruoli degli utenti, buste paga e previsione di cassa',
  produzione: 'solo inserimento tempi e note sulle schede',
  contabilita: 'solo lettura di Amministrazione e Guida, per il commercialista e chi aiuta con la contabilità',
  esterno: 'vede tutto il portale ma non modifica nulla (escluse Impostazioni e buste paga), per consulenti e visitatori esterni',
};

/** Profilo scritto nel modulo Utenti; un valore sconosciuto diventa "produzione" (il più ristretto tra quelli storici). */
export const ruoloDaModulo = (x: unknown): Ruolo => (RUOLI as readonly string[]).includes(String(x)) ? String(x) as Ruolo : 'produzione';

/** Profili con l'accesso completo dell'ufficio (l'amministratore fa tutto quello che fa l'ufficio). */
export const eUfficio = (ruolo: string | undefined) => ruolo === 'ufficio' || ruolo === 'amministratore';

/** Pagina iniziale dopo l'accesso: per l'ufficio il cruscotto generale (Adriano 31/10/2026). */
export const paginaIniziale = (ruolo: Ruolo) =>
  (eUfficio(ruolo) || ruolo === 'esterno' ? '/cruscotto' : ruolo === 'contabilita' ? '/amministrazione' : '/r');

/**
 * Chi vede stipendi e buste paga (Adriano 3/11/2026): l'amministratore, la contabilità (il commercialista) e gli utenti dell'ufficio
 * con il permesso "buste paga" dato dall'amministratore. Per i cedolini serve comunque anche la password delle buste paga.
 */
export const vedePaghe = (u: { ruolo: string; paghe?: boolean | null } | null | undefined) =>
  !!u && (u.ruolo === 'amministratore' || u.ruolo === 'contabilita' || (eUfficio(u.ruolo) && !!u.paghe));

/**
 * Impostazioni → Utenti (Adriano 3/11/2026): solo l'amministratore sceglie o cambia i ruoli. Gli altri dell'ufficio possono aggiungere solo
 * utenti della produzione e correggere nome, email, password e "attivo" di chi non è amministratore (così nessuno si dà più permessi da solo
 * o prende l'account dell'amministratore). Deve restare sempre almeno un amministratore attivo. Risposta: errore da mostrare, oppure null.
 */
export function controlloUtente(x: {
  chi: Ruolo; nuovo?: boolean; ruoloAttuale?: Ruolo; ruoloNuovo: Ruolo; attivoNuovo?: boolean; stessoUtente?: boolean; altriAmministratoriAttivi: number;
}): string | null {
  const admin = x.chi === 'amministratore';
  if (x.nuovo) return admin || x.ruoloNuovo === 'produzione' ? null : 'Solo l\'amministratore può aggiungere utenti con un ruolo diverso da Produzione.';
  if (!admin && x.ruoloAttuale === 'amministratore') return 'Solo l\'amministratore può modificare un utente amministratore.';
  if (!admin && x.ruoloNuovo !== x.ruoloAttuale) return 'Solo l\'amministratore può cambiare il ruolo degli utenti.';
  if (x.stessoUtente && (x.attivoNuovo === false || x.ruoloNuovo !== x.ruoloAttuale)) return 'Non puoi disattivare te stesso o cambiarti il ruolo.';
  const restaAdmin = x.ruoloNuovo === 'amministratore' && x.attivoNuovo !== false;
  if (x.ruoloAttuale === 'amministratore' && !restaAdmin && x.altriAmministratoriAttivi < 1) return 'Deve restare almeno un amministratore attivo.';
  return null;
}

/** Eliminare un utente: un amministratore lo elimina solo l'amministratore (e mai l'ultimo). */
export function controlloEliminaUtente(x: { chi: Ruolo; ruoloBersaglio: Ruolo; altriAmministratoriAttivi: number }): string | null {
  if (x.ruoloBersaglio !== 'amministratore') return null;
  if (x.chi !== 'amministratore') return 'Solo l\'amministratore può eliminare un utente amministratore.';
  return x.altriAmministratoriAttivi < 1 ? 'Deve restare almeno un amministratore attivo.' : null;
}

/** Previsione di cassa: si ricava il netto degli stipendi per differenza, quindi la vede solo chi vede le paghe. */
export const PERCORSO_CASSA = /^\/amministrazione\/analisi\/cassa(\.xlsx)?(\/|$)/;

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
  && !PERCORSO_CASSA.test(percorso)
  && !/\/nuovo(\/|$)/.test(percorso);

/**
 * La contabilità può solo leggere (GET/HEAD) le pagine dell'Amministrazione (e la ricerca in alto, che per lei trova solo documenti).
 * Dal 3/11/2026 (Adriano) anche le buste paga: legge l'area riservata e può solo aprirla con la password e richiuderla.
 */
export const contabilitaPuo = (metodo: string, percorso: string) =>
  ((metodo === 'GET' || metodo === 'HEAD')
    && (percorso === '/amministrazione' || percorso.startsWith('/amministrazione/') || percorso === '/cerca' || percorso === '/cerca/'
      || percorso === '/dipendenti/riservata' || percorso.startsWith('/dipendenti/riservata/'))
    && !/^\/amministrazione\/documenti\/nuovo(\/|\?|$)/.test(percorso))
  || (metodo === 'POST' && (percorso === '/dipendenti/riservata/sblocca' || percorso === '/dipendenti/riservata/chiudi'));

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
