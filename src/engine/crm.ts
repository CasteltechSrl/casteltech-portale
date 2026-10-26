/**
 * CRM: regole senza database (stati, tipi di attività, scadenze della prossima azione,
 * confronto dei nomi e delle partite IVA per collegare le aziende all'anagrafica clienti).
 */

export const STATI_CRM = {
  da_contattare: 'Da contattare', contattato: 'Contattato', da_ricontattare: 'Da ricontattare', in_trattativa: 'In trattativa',
  offerta_inviata: 'Offerta inviata', cliente: 'Cliente', non_interessato: 'Non interessato', scartato: 'Scartato',
} as const;
export type StatoCrm = keyof typeof STATI_CRM;

export const TIPI_ATTIVITA = {
  telefonata: 'Telefonata', email: 'Email', visita: 'Appuntamento / visita', offerta: 'Offerta / quotazione', fiera: 'Fiera / evento', nota: 'Nota',
} as const;
export type TipoAttivita = keyof typeof TIPI_ATTIVITA;

export const PRIORITA = { alta: 'Alta', media: 'Media', bassa: 'Bassa' } as const;

/** Stato scritto come nel file Excel ("Offerta inviata") o già come chiave ("offerta_inviata"). */
export function statoDa(testo: unknown): StatoCrm | null {
  const t = String(testo ?? '').trim().toLowerCase().replace(/\s+/g, '_');
  if (t in STATI_CRM) return t as StatoCrm;
  const trovato = Object.entries(STATI_CRM).find(([, v]) => v.toLowerCase() === String(testo ?? '').trim().toLowerCase());
  return trovato ? (trovato[0] as StatoCrm) : null;
}

/**
 * Chiave per confrontare le ragioni sociali: maiuscolo, senza punteggiatura e senza forma giuridica
 * ("Audioscope 2K s.r.l." = "AUDIOSCOPE 2K S.R.L."; "C.M.C. S.R.L." = "CMC SRL").
 */
export function chiaveNome(s: unknown): string {
  let t = String(s ?? '').toUpperCase()
    .replace(/[ÀÁ]/g, 'A').replace(/[ÈÉ]/g, 'E').replace(/[ÌÍ]/g, 'I').replace(/[ÒÓ]/g, 'O').replace(/[ÙÚ]/g, 'U')
    .replace(/\./g, '')
    .replace(/[^A-Z0-9&]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
  // la forma giuridica si toglie solo in fondo al nome ("AB ELETTRONICA" resta com'è)
  const forma = / (SRLS|SRL|SPA|SNC|SAS|SAPA|SCPA|SCARL|SCRL|SRLCR|INC|LTD|GMBH|AG|AB|BV|SA|SOCIETA A RESPONSABILITA LIMITATA( SEMPLIFICATA)?|A SOCIO UNICO|SOCIO UNICO|UNIPERSONALE|IN LIQUIDAZIONE)$/;
  while (forma.test(t)) t = t.replace(forma, '').trim();
  return t;
}

/** Partita IVA italiana per il confronto: le ultime 11 cifre ("IT 01494460338" = "01494460338"), vuota se non è una P.IVA. */
export function chiavePiva(s: unknown): string {
  const cifre = String(s ?? '').replace(/\D/g, '');
  return cifre.length >= 11 ? cifre.slice(-11) : '';
}

/** Dove cade la data della prossima azione rispetto a oggi (date AAAA-MM-GG). */
export function scadenza(data: string | null | undefined, oggi: string): 'scaduta' | 'oggi' | 'settimana' | 'futura' | null {
  if (!data) return null;
  if (data < oggi) return 'scaduta';
  if (data === oggi) return 'oggi';
  const tra7 = new Date(oggi + 'T12:00:00Z');
  tra7.setUTCDate(tra7.getUTCDate() + 7);
  return data <= tra7.toISOString().slice(0, 10) ? 'settimana' : 'futura';
}

export interface ClientePerCollegamento { id: number; ragione_sociale: string; partita_iva: string | null; alias?: string[] }

/**
 * Cliente dell'anagrafica che corrisponde a un'azienda del CRM: prima per partita IVA, poi per nome uguale
 * (forma giuridica e punteggiatura a parte, anche tra i nomi "vecchi" collegati al cliente).
 */
export function trovaCliente(az: { ragione_sociale: string; partita_iva?: string | null }, clienti: ClientePerCollegamento[]):
  { cliente: ClientePerCollegamento; come: 'partita_iva' | 'nome' } | null {
  const p = chiavePiva(az.partita_iva);
  if (p) {
    const c = clienti.find(c => chiavePiva(c.partita_iva) === p);
    if (c) return { cliente: c, come: 'partita_iva' };
  }
  const n = chiaveNome(az.ragione_sociale);
  if (!n) return null;
  const c = clienti.find(c => chiaveNome(c.ragione_sociale) === n || (c.alias ?? []).some(a => chiaveNome(a) === n));
  return c ? { cliente: c, come: 'nome' } : null;
}

// ── Scritte uniformi per colonna (Adriano, 26/10/2026): ogni campo ha un solo formato, imposto anche quando si scrive; le note restano libere ──
const PARTICELLE = new Set(['di', 'del', 'della', 'dello', 'dei', 'degli', 'delle', 'da', 'dal', 'dalla', 'e', 'ed', 'il', 'la', 'le', 'lo', 'gli', 'in', 'nel', 'nella', 'sul', 'sulla', 'al', 'alla', 'a', 'de', 'des', 'du', 'van', 'von']);
const PARTICELLE_APOSTROFO = new Set(['d', 'l', 'nell', 'dell', 'all', 'sull', 'dall']);
const maiuscolaIniziale = (s: string) => s.replace(/\p{L}/u, c => c.toUpperCase());

/** "REGGIO NELL'EMILIA" → "Reggio nell'Emilia", "mario rossi" → "Mario Rossi", "FRIULI-VENEZIA GIULIA" → "Friuli-Venezia Giulia". */
export function iniziali(s: string): string {
  return s.toLowerCase().split(' ').map((parola, i) => {
    if (i > 0 && PARTICELLE.has(parola)) return parola;
    return parola.split('-').map(pezzo => {
      const ap = pezzo.match(/^(\p{L}+)['’](.*)$/u);
      if (ap) return `${i > 0 && PARTICELLE_APOSTROFO.has(ap[1]) ? ap[1] : maiuscolaIniziale(ap[1])}'${maiuscolaIniziale(ap[2])}`;
      return maiuscolaIniziale(pezzo);
    }).join('-');
  }).join(' ');
}

/** "AUTOMAZIONE INDUSTRIALE" → "Automazione industriale" (solo la prima lettera maiuscola). */
export const frase = (s: string) => maiuscolaIniziale(s.toLowerCase());

export type Formato = 'maiuscolo' | 'iniziali' | 'frase' | 'prima' | 'minuscolo' | 'libero';
export const FORMATI_CRM: Record<string, Formato> = {
  ragione_sociale: 'maiuscolo', altri_nomi: 'maiuscolo', provincia: 'maiuscolo', partita_iva: 'maiuscolo', cap: 'maiuscolo', responsabile: 'maiuscolo',
  citta: 'iniziali', regione: 'iniziali', paese: 'iniziali', indirizzo: 'iniziali', nome: 'iniziali', referente: 'iniziali',
  settore: 'frase', descrizione: 'frase', ateco: 'frase', ruolo: 'frase',
  // testi scritti come frasi (sigle come BOM o PCB restano): solo la prima lettera diventa maiuscola
  prossima_azione: 'prima', descrizione_attivita: 'prima',
  email: 'minuscolo', altre_email: 'minuscolo', sito: 'minuscolo',
  telefono: 'libero', altri_telefoni: 'libero', note: 'libero',
};

/** Testo pulito (spazi singoli, null se vuoto) nel formato della sua colonna. */
export function formatta(campo: string, v: unknown): string | null {
  const t = String(v ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  switch (FORMATI_CRM[campo] ?? 'libero') {
    case 'maiuscolo': return t.toUpperCase();
    case 'iniziali': return iniziali(t);
    case 'frase': return frase(t);
    case 'prima': return maiuscolaIniziale(t);
    case 'minuscolo': return t.toLowerCase();
    default: return t;
  }
}
