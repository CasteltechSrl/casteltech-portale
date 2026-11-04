/**
 * Registro delle attività: chi ha cambiato cosa e quando (Adriano, settimana 2–9/11/2026; eliminazioni comprese, lista del 4/11).
 * Qui solo le regole, senza database: da una richiesta che modifica dati (POST) si ricava la riga del registro.
 * Una riga per ogni salvataggio riuscito: niente trigger sulle tabelle (Neon gratuito: poche scritture, solo quando qualcuno salva).
 * Mai i valori scritti nei moduli (password, IBAN, stipendi…): solo sezione, azione e quali righe sono state toccate.
 */

export type TipoRegistro = 'modifica' | 'eliminazione' | 'accesso' | 'accesso_fallito';

export interface VoceRegistro {
  tipo: TipoRegistro;
  sezione: string;
  azione: string;
  percorso: string;
  oggetto: string | null;   // id o numeri delle righe toccate ("12" o "12, 13, 14")
  link: string | null;      // pagina dove vedere la riga (se c'è)
}

/** Nome della sezione dal primo pezzo dell'indirizzo. */
const SEZIONI: [string, string][] = [
  ['/preventivi/documenti', 'Documenti dei clienti'],
  ['/preventivi', 'Preventivi'],
  ['/ordini/acquisire', 'Ordini da e-mail e PDF'],
  ['/ordini/fornitori', 'Ordini a fornitore'],
  ['/ordini/conferme', 'Conferme d\'ordine'],
  ['/ordini', 'Ordini clienti'],
  ['/commesse', 'Commesse'],
  ['/anagrafiche', 'Anagrafiche'],
  ['/impostazioni/utenti', 'Utenti'],
  ['/impostazioni', 'Impostazioni'],
  ['/produzione', 'Produzione'],
  ['/quotazioni', 'Quotazioni'],
  ['/crm', 'CRM'],
  ['/suggerimenti', 'Suggerimenti'],
  ['/qualita', 'Qualità'],
  ['/amministrazione', 'Amministrazione'],
  ['/dipendenti', 'Dipendenti'],
];

export function sezioneDi(percorso: string): string {
  for (const [p, nome] of SEZIONI) if (percorso === p || percorso.startsWith(p + '/')) return nome;
  return percorso.split('/')[1] || 'Portale';
}

/** Parole che indicano un'eliminazione (o un annullo / scarto, che per il registro vale uguale). */
const PAROLE_ELIMINA = /(^|[-_])(elimin\w*|annull\w*|scart\w*|cancell\w*|togli\w*)/i;

/** Azioni fatte in automatico mentre si scrive (bozze che si salvano da sole): stessa riga per 10 minuti. */
export const RIPETIZIONE_MINUTI = 10;

function testo(v: unknown): string { return Array.isArray(v) ? v.map(String).join(' ') : v == null ? '' : String(v); }

/** Elenco delle righe toccate: id nell'indirizzo + caselle spuntate degli elenchi (campo "ids"). */
function righeToccate(percorso: string, corpo: Record<string, unknown>): string[] {
  const nel = percorso.split('/').filter(p => /^\d+$/.test(p));
  const spunte = corpo.ids == null ? [] : (Array.isArray(corpo.ids) ? corpo.ids : [corpo.ids]).map(String).filter(x => /^[\w-]{1,40}$/.test(x));
  return [...new Set([...nel, ...spunte])];
}

/**
 * Riga del registro per una richiesta, o null se non va registrata (letture, errori, richieste senza utente).
 * `stato` = codice HTTP della risposta: si registra solo quello che è andato a buon fine (< 400; i redirect con messaggio contano).
 */
export function voceRegistro(r: { metodo: string; percorso: string; corpo?: Record<string, unknown> | null; stato: number }): VoceRegistro | null {
  if (r.metodo === 'GET' || r.metodo === 'HEAD' || r.metodo === 'OPTIONS') return null;
  if (r.stato >= 400) return null;
  const percorso = r.percorso.split('?')[0].replace(/\/+$/, '') || '/';
  if (percorso === '/login' || percorso === '/esci' || percorso.startsWith('/api/') || percorso.startsWith('/r/') || percorso === '/r') return null;
  const corpo = r.corpo ?? {};
  const pezzi = percorso.split('/').filter(Boolean);
  const ultimo = pezzi[pezzi.length - 1] ?? '';
  // azione: pulsante degli elenchi (name="azione"), altrimenti l'ultima parola dell'indirizzo se non è un numero
  const scelta = testo(corpo.azione).trim();
  let azione = scelta || (/^\d+$/.test(ultimo) ? 'salva' : ultimo.replace(/-/g, ' '));
  if (!azione) azione = 'salva';
  const elimina = PAROLE_ELIMINA.test(scelta) || PAROLE_ELIMINA.test(ultimo);
  const righe = righeToccate(percorso, corpo);
  // pagina della riga: l'indirizzo fino al numero (es. /preventivi/12/elimina → /preventivi/12), non per le eliminazioni
  let link: string | null = null;
  const iNum = pezzi.findIndex(p => /^\d+$/.test(p));
  if (iNum >= 0 && !elimina) link = '/' + pezzi.slice(0, iNum + 1).join('/');
  return {
    tipo: elimina ? 'eliminazione' : 'modifica',
    sezione: sezioneDi(percorso),
    azione: azione.slice(0, 80),
    percorso: percorso.slice(0, 300),
    oggetto: righe.length ? righe.slice(0, 50).join(', ') + (righe.length > 50 ? ` … (${righe.length})` : '') : null,
    link,
  };
}

/** Chiave per non scrivere una riga a ogni salvataggio automatico: stessa persona, stesso indirizzo. */
export function chiaveRipetizione(utenteId: number, v: VoceRegistro): string { return `${utenteId}|${v.percorso}|${v.azione}`; }

/** Il salvataggio automatico (X-Autosalva) si registra una volta ogni RIPETIZIONE_MINUTI per la stessa pagina. */
export function daSaltare(autosalva: boolean, ultimaVolta: number | undefined, adesso: number): boolean {
  return autosalva && ultimaVolta != null && adesso - ultimaVolta < RIPETIZIONE_MINUTI * 60_000;
}

export const ETICHETTE_TIPO: Record<TipoRegistro, string> = {
  modifica: 'Modifica', eliminazione: 'Eliminazione', accesso: 'Accesso', accesso_fallito: 'Accesso non riuscito',
};

/**
 * Dopo una modifica dell'utente in Impostazioni → Utenti: chiudere subito le sue sessioni aperte?
 * Sì se è stato disattivato, se ha cambiato ruolo o password (chi lascia l'azienda esce SUBITO, non dopo 12 ore; lista del 4/11).
 */
export function chiudereSessioni(p: { attivoPrima: boolean; attivoDopo: boolean; ruoloPrima: string; ruoloDopo: string; passwordCambiata: boolean }): boolean {
  return (p.attivoPrima && !p.attivoDopo) || p.ruoloPrima !== p.ruoloDopo || p.passwordCambiata;
}

/** Password troppo deboli: motivo del no, oppure null. Almeno 10 caratteri come prima, più i casi facili da indovinare. */
const COMUNI = ['password', 'casteltech', 'qwerty', 'asdfgh', 'abcdef', '123456', 'abc123', 'admin', 'portale', 'iloveyou', 'welcome', 'benvenuto'];
export function problemaPassword(pwd: string, chi: { email?: string | null; nome?: string | null } = {}): string | null {
  if (pwd.length < 10) return 'la password deve avere almeno 10 caratteri';
  const p = pwd.toLowerCase();
  if (new Set(p).size < 4) return 'la password ripete sempre gli stessi caratteri';
  if (/^\d+$/.test(p)) return 'la password non può essere fatta di soli numeri';
  const sequenza = '0123456789012345678901234567890abcdefghijklmnopqrstuvwxyzqwertyuiopasdfghjklzxcvbnm';
  if (p.length <= 14 && sequenza.includes(p)) return 'la password è una sequenza di tasti';
  for (const c of COMUNI) if (p.includes(c) && p.replace(c, '').replace(/[\d\W_]/g, '').length < 3) return `la password è troppo simile a "${c}"`;
  const locale = (chi.email ?? '').split('@')[0].toLowerCase();
  if (locale.length >= 3 && p.includes(locale)) return 'la password non può contenere l\'email';
  for (const parola of (chi.nome ?? '').toLowerCase().split(/\s+/)) if (parola.length >= 3 && p.includes(parola) && p.replace(parola, '').replace(/[\d\W_]/g, '').length < 3) return 'la password non può essere il proprio nome';
  return null;
}
