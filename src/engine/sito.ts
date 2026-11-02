/**
 * Moduli del sito casteltech.net (Adriano, 2/11/2026: il sito passa da WordPress su Noamweb a pagine statiche su Render).
 * Le pagine statiche non hanno un programma dietro: i due moduli (Contatti e Richiedi un preventivo) li riceve il portale
 * con gli indirizzi /api/sito/contatto e /api/sito/preventivo (rotte/sito.ts). Qui solo le regole, senza database:
 *  - da quali siti si accettano i moduli (casteltech.net e l'anteprima su Render),
 *  - controlli contro i robot (casella trappola nascosta, modulo inviato troppo in fretta, troppi invii dallo stesso indirizzo),
 *  - campi obbligatori e testo dell'email che arriva a info@.
 */

/** Siti da cui il portale accetta i moduli (CORS). L'anteprima su Render ha l'indirizzo casteltech-sito*.onrender.com. */
export function origineSitoAmmessa(origine: string | undefined | null): boolean {
  if (!origine) return false;
  let u: URL;
  try { u = new URL(origine); } catch { return false; }
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && u.hostname === 'localhost')) return false;
  return u.hostname === 'casteltech.net' || u.hostname === 'www.casteltech.net' || u.hostname === 'localhost'
    || /^casteltech-sito[a-z0-9-]*\.onrender\.com$/.test(u.hostname);
}

/** Campo di testo pulito: niente caratteri di controllo, spazi in fila ridotti, lunghezza massima. */
export function campo(x: unknown, max = 300): string {
  return String(Array.isArray(x) ? x[0] ?? '' : x ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/[ \t]+/g, ' ').trim().slice(0, max);
}

export const emailValida = (e: string) => /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[a-z]{2,}$/i.test(e);

/**
 * Controlli contro i robot: la casella "sito_web" è nascosta alle persone (se è piena l'ha scritta un programma) e
 * "aperto_il" è l'ora in cui la pagina ha preparato il modulo: meno di 3 secondi per compilarlo = programma.
 * Un modulo senza "aperto_il" (browser senza JavaScript non arriva qui: il modulo parte solo dallo script) è rifiutato.
 */
export function sembraRobot(campi: Record<string, unknown>, adesso = Date.now()): boolean {
  if (campo(campi.sito_web)) return true;
  const aperto = Number(campo(campi.aperto_il));
  if (!aperto || !Number.isFinite(aperto)) return true;
  const passati = adesso - aperto;
  return passati < 3000 || passati > 1000 * 60 * 60 * 24;
}

/** Al massimo `massimo` invii per indirizzo IP nell'ultima ora (contatore in memoria, niente database). */
export function troppiInvii(registro: Map<string, number[]>, ip: string, adesso = Date.now(), massimo = 5): boolean {
  const ora = adesso - 60 * 60 * 1000;
  const invii = (registro.get(ip) ?? []).filter(t => t > ora);
  if (invii.length >= massimo) { registro.set(ip, invii); return true; }
  invii.push(adesso);
  registro.set(ip, invii);
  if (registro.size > 5000) for (const [k, v] of registro) if (!v.some(t => t > ora)) registro.delete(k);
  return false;
}

export interface Contatto { nome: string; cognome: string; email: string; oggetto: string; messaggio: string; privacy: boolean; lingua: 'it' | 'en' }

/** Modulo Contatti del sito (campi come nel vecchio WordPress: your-name, your-surname, your-email, your-subject, your-message). */
export function leggiContatto(c: Record<string, unknown>): { contatto: Contatto; errori: string[] } {
  const contatto: Contatto = {
    nome: campo(c['your-name'], 100), cognome: campo(c['your-surname'], 100), email: campo(c['your-email'], 200).toLowerCase(),
    oggetto: campo(c['your-subject'], 200), messaggio: campo(c['your-message'], 5000).replace(/\r\n/g, '\n'),
    privacy: !!campo(c['checkbox-361[]'] ?? c['checkbox-361'] ?? c.privacy), lingua: campo(c.lingua) === 'en' ? 'en' : 'it',
  };
  const errori: string[] = [];
  if (!contatto.nome) errori.push('nome');
  if (!emailValida(contatto.email)) errori.push('email');
  if (!contatto.messaggio) errori.push('messaggio');
  if (!contatto.privacy) errori.push('privacy');
  return { contatto, errori };
}

export function testoContatto(c: Contatto): { oggetto: string; testo: string } {
  return {
    oggetto: `Sito casteltech.net – Contatto: ${c.oggetto || `${c.nome} ${c.cognome}`.trim()}`,
    testo: [`Messaggio dal modulo Contatti del sito${c.lingua === 'en' ? ' (versione inglese)' : ''}.`, '',
      `Nome: ${`${c.nome} ${c.cognome}`.trim()}`, `Email: ${c.email}`, `Oggetto: ${c.oggetto || '—'}`, '', c.messaggio, '',
      'Per rispondere basta "Rispondi": la risposta va al mittente.'].join('\n'),
  };
}

/** Campi del modulo "Richiedi un preventivo" con la loro etichetta, nell'ordine della pagina. */
export const CAMPI_PREVENTIVO: [string, string][] = [
  ['company', 'Azienda'], ['companymail', 'Email'], ['schede', 'Quantità schede'], ['radio-schede', 'Fornitura schede'],
  ['pannelli', 'Schede per pannello'], ['radio-componenti', 'Fornitura componenti'], ['radio-montaggio', 'Montaggio'],
  ['componentiSMDTop', 'Componenti SMD TOP'], ['tipologieSMDTop', 'Tipologie SMD TOP'],
  ['componentiTHTTop', 'Componenti THT TOP'], ['tipologieTHTTop', 'Tipologie THT TOP'],
  ['componentiSMDTopDoppi', 'Componenti SMD TOP (doppia faccia)'], ['tipologieSMDTopDoppi', 'Tipologie SMD TOP (doppia faccia)'],
  ['componentiTHTTopDoppi', 'Componenti THT TOP (doppia faccia)'], ['tipologieTHTTopDoppi', 'Tipologie THT TOP (doppia faccia)'],
  ['componentiSMDBottom', 'Componenti SMD BOTTOM'], ['tipologieSMDBottom', 'Tipologie SMD BOTTOM'],
  ['componentiTHTBottom', 'Componenti THT BOTTOM'], ['tipologieTHTBottom', 'Tipologie THT BOTTOM'],
  ['totaleComponenti', 'Totale componenti'], ['your-note', 'Note'],
];

export interface RichiestaPreventivo { azienda: string; email: string; righe: [string, string][]; note: string; privacy: boolean; lingua: 'it' | 'en' }

export function leggiPreventivo(c: Record<string, unknown>): { richiesta: RichiestaPreventivo; errori: string[] } {
  const righe = CAMPI_PREVENTIVO.filter(([k]) => k !== 'your-note')
    .map(([k, etichetta]) => [etichetta, campo(c[k], 200)] as [string, string]).filter(([, v]) => v);
  const richiesta: RichiestaPreventivo = {
    azienda: campo(c.company, 200), email: campo(c.companymail, 200).toLowerCase(), righe,
    note: campo(c['your-note'], 5000).replace(/\r\n/g, '\n'), privacy: !!campo(c['checkbox-361[]'] ?? c['checkbox-361'] ?? c.privacy),
    lingua: campo(c.lingua) === 'en' ? 'en' : 'it',
  };
  const errori: string[] = [];
  if (!richiesta.azienda) errori.push('azienda');
  if (!emailValida(richiesta.email)) errori.push('email');
  if (!richiesta.privacy) errori.push('privacy');
  return { richiesta, errori };
}

/** Testo della richiesta: va nell'email a info@ e nel pacchetto dei Documenti dei clienti (come il testo di un'email). */
export function testoPreventivo(r: RichiestaPreventivo, file: string[]): { oggetto: string; testo: string } {
  return {
    oggetto: `Sito casteltech.net – Richiesta preventivo: ${r.azienda}`,
    testo: [`Richiesta dal modulo "Richiedi un preventivo" del sito${r.lingua === 'en' ? ' (versione inglese)' : ''}.`, '',
      ...r.righe.map(([k, v]) => `${k}: ${v}`), '', ...(r.note ? ['Note:', r.note, ''] : []),
      file.length ? `File allegati: ${file.join(', ')}` : 'Nessun file allegato.'].join('\n'),
  };
}

/** Nome del pacchetto nei Documenti dei clienti: "SITO – AZIENDA" in maiuscolo come le anagrafiche. */
export const nomePacchettoSito = (azienda: string) => `SITO – ${azienda.toUpperCase()}`.slice(0, 120);

/** Nome di file sicuro (niente cartelle, niente caratteri strani), come lo vede il pacchetto. */
export function nomeFileSicuro(nome: string): string {
  const base = nome.replace(/\\/g, '/').split('/').pop() ?? '';
  return base.replace(/[\u0000-\u001f<>:"|?*]/g, '_').replace(/^\.+/, '').slice(0, 200) || 'file';
}
