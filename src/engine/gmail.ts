/**
 * Pulsante "Portale Casteltech" dentro Gmail (Adriano, 29/10/2026): da una mail aperta il personale manda al portale
 * testo e allegati come Preventivo, Ordine o Fattura estera. Qui le regole senza database: chiave, mittente, nome del pacchetto.
 * Il pannello di Gmail è in tools/gmail-addon/ (Apps Script), le pagine che lo ricevono in src/server/rotte/gmail.ts.
 */
import { createHash, timingSafeEqual } from 'node:crypto';

export const TIPI_GMAIL = ['preventivo', 'ordine', 'fattura_estera'] as const;
export type TipoGmail = typeof TIPI_GMAIL[number];
export const ETICHETTE_GMAIL: Record<TipoGmail, string> = { preventivo: 'Preventivo', ordine: 'Ordine', fattura_estera: 'Fattura estera' };

/** La chiave del pannello di Gmail deve essere quella scritta su Render (GMAIL_ADDON_CHIAVE, almeno 20 caratteri). */
export function chiaveGiusta(data: string | undefined, attesa: string | undefined): boolean {
  if (!attesa || attesa.length < 20 || !data) return false;
  // confronto a tempo costante (sulle impronte, così anche lunghezze diverse non si notano)
  const a = createHash('sha256').update(data).digest(), b = createHash('sha256').update(attesa).digest();
  return timingSafeEqual(a, b);
}

/** "Mario Rossi <m.rossi@selea.it>" → "m.rossi@selea.it" (minuscolo). */
export function indirizzoDa(mittente: string): string {
  const m = /<([^<>\s]+@[^<>\s]+)>/.exec(mittente) ?? /([^\s<>"',;]+@[^\s<>"',;]+)/.exec(mittente);
  return m ? m[1].toLowerCase() : '';
}

/** Caselle di posta personali: il dominio non dice di che azienda è il mittente. */
const DOMINI_PERSONALI = new Set(['gmail.com', 'googlemail.com', 'libero.it', 'hotmail.com', 'hotmail.it', 'outlook.com', 'outlook.it', 'live.com', 'live.it',
  'yahoo.com', 'yahoo.it', 'icloud.com', 'me.com', 'virgilio.it', 'tiscali.it', 'alice.it', 'tim.it', 'fastwebnet.it', 'email.it', 'aruba.it', 'pec.it',
  'legalmail.it', 'casteltech.net']);

/** Dominio dell'azienda del mittente (es. "selea.it"), o null per le caselle personali e per Casteltech stessa. */
export function dominioAziendale(indirizzo: string): string | null {
  const d = indirizzo.split('@')[1]?.toLowerCase().trim();
  return d && d.includes('.') && !DOMINI_PERSONALI.has(d) ? d : null;
}

/** Oggetto senza "R:", "RE:", "I:", "FW:", "Fwd:" davanti. */
export function oggettoPulito(oggetto: string): string {
  let s = oggetto.trim();
  for (let i = 0; i < 5; i++) {
    const t = s.replace(/^\s*(re|r|i|fw|fwd|inoltro|aw|wg|tr)\s*(\[\d+\])?\s*:\s*/i, '');
    if (t === s) break;
    s = t;
  }
  return s.replace(/\s+/g, ' ').trim();
}

/** Nome del pacchetto dei documenti: l'oggetto della mail, altrimenti il primo allegato, altrimenti mittente e data. */
export function nomePacchettoDaEmail(e: { oggetto: string; mittente: string; data?: string; allegati: string[] }): string {
  const o = oggettoPulito(e.oggetto);
  if (o) return o.slice(0, 200);
  const primo = e.allegati.map(n => n.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, '')).find(Boolean);
  if (primo) return primo.slice(0, 200);
  return `Email di ${indirizzoDa(e.mittente) || e.mittente || 'cliente'}${e.data ? ` del ${e.data}` : ''}`.slice(0, 200);
}

/** Testo della richiesta da mettere nelle note del preventivo da validare (al massimo 3000 caratteri). */
export function notaRichiesta(e: { mittente: string; oggetto: string; data?: string; testo: string }): string {
  const testo = e.testo.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  const corto = testo.length > 3000 ? `${testo.slice(0, 3000)}…` : testo;
  return `Richiesta del cliente: email di ${e.mittente}${e.data ? ` del ${e.data}` : ''}, oggetto «${e.oggetto}».${corto ? `\n${corto}` : ''}`;
}

/** Nome del file .eml per l'acquisizione (Ordini → Da acquisire): l'oggetto senza caratteri che i nomi dei file non accettano. */
export function nomeFileEmail(oggetto: string): string {
  const base = oggettoPulito(oggetto).replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  return `${base || 'email'}.eml`;
}
