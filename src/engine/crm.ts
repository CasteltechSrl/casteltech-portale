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
