/**
 * Sede operativa del cliente diversa dalla sede legale (Adriano 4/11/2026, caso ELEXES: legale a Vertova, operativa a Stezzano).
 * La sede legale resta quella dei dati fiscali (fattura elettronica, intestazione del DDT); la sede operativa, se c'è,
 * è il luogo di destinazione proposto nei DDT nuovi. In Fatture in Cloud era il campo "Indirizzo di spedizione".
 */

export interface SedeOperativa {
  presso: string | null;      // facoltativo: "C/O INTERSAIL", "MAIL BOXES ETC", "SEDE OPERATIVA LAB16"
  indirizzo: string | null;
  cap: string | null;
  comune: string | null;
  provincia: string | null;
  nazione: string;            // sigla di 2 lettere, come nei dati fiscali
  note: string | null;        // per la consegna: "ATT. MASSIMILIANO REDOLFI", "CORRIERE GLS PORTO ASSEGNATO"
}

/** Nomi delle colonne di `clienti` (migrazione 072) per ogni campo della sede operativa. */
export const COLONNE_SEDE: Record<keyof SedeOperativa, string> = {
  presso: 'sede_op_presso', indirizzo: 'sede_op_indirizzo', cap: 'sede_op_cap', comune: 'sede_op_comune',
  provincia: 'sede_op_provincia', nazione: 'sede_op_nazione', note: 'sede_op_note',
};

const su = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim().toUpperCase() || null;

/** Pulisce una sede (dal modulo o dal file di FIC): tutto in MAIUSCOLO, nazione IT se vuota. */
export function pulisciSede(x: Partial<Record<keyof SedeOperativa, unknown>>): SedeOperativa {
  return {
    presso: su(x.presso), indirizzo: su(x.indirizzo), cap: (su(x.nazione) || 'IT') === 'IT' ? su(x.cap)?.replace(/\s/g, '') ?? null : su(x.cap), comune: su(x.comune),
    provincia: su(x.provincia), nazione: su(x.nazione) || 'IT', note: su(x.note),
  };
}

/** Controlli sulla sede operativa: servono almeno indirizzo e comune; in Italia CAP di 5 cifre e provincia di 2 lettere. */
export function controllaSede(s: SedeOperativa): string[] {
  const errori: string[] = [];
  if (!s.indirizzo || !s.comune) errori.push('Sede operativa: servono almeno indirizzo e comune (o togli la spunta).');
  if (!/^[A-Z]{2}$/.test(s.nazione)) errori.push('Sede operativa: nazione con la sigla di 2 lettere (IT, DE, FR…).');
  if (s.nazione === 'IT' && s.cap && !/^\d{5}$/.test(s.cap)) errori.push('Sede operativa: CAP di 5 cifre.');
  if (s.nazione === 'IT' && s.provincia && !/^[A-Z]{2}$/.test(s.provincia)) errori.push('Sede operativa: provincia con la sigla di 2 lettere.');
  return errori;
}

/**
 * Sede operativa dal modulo dei dati fiscali (campi `sede_op_*` e spunta `sede_operativa_diversa`).
 * Senza spunta la sede si conserva com'è nel database ma non vale (resta una sola sede: la legale).
 */
export function sedeDaModulo(b: Record<string, unknown>): { diversa: boolean; sede: SedeOperativa; errori: string[] } {
  const diversa = b.sede_operativa_diversa === 'on' || b.sede_operativa_diversa === '1' || b.sede_operativa_diversa === true;
  const sede = pulisciSede(Object.fromEntries(Object.entries(COLONNE_SEDE).map(([k, col]) => [k, b[col]])));
  return { diversa, sede, errori: diversa ? controllaSede(sede) : [] };
}

/** Sede operativa letta da una riga di `clienti` (null se la spunta non c'è). */
export function sedeDelCliente(c: Record<string, any> | null | undefined): SedeOperativa | null {
  if (!c?.sede_operativa_diversa) return null;
  return pulisciSede(Object.fromEntries(Object.entries(COLONNE_SEDE).map(([k, col]) => [k, c[col]])));
}

/** Sede su più righe, come va scritta nel luogo di destinazione del DDT. */
export function testoSede(s: SedeOperativa): string {
  const citta = [s.cap, s.comune, s.provincia ? `(${s.provincia})` : ''].filter(Boolean).join(' ');
  return [s.presso, s.indirizzo, citta, s.nazione !== 'IT' ? s.nazione : '', s.note].filter(Boolean).join('\n');
}

/**
 * Luogo di destinazione proposto in un DDT nuovo: la sede operativa del cliente se c'è,
 * altrimenti quella dell'ultimo DDT allo stesso cliente (vuota = sede del cliente).
 */
export function destinazioneProposta(cliente: Record<string, any> | null | undefined, ultimaDestinazione?: string | null): string {
  const s = sedeDelCliente(cliente);
  return s ? testoSede(s) : (ultimaDestinazione ?? '').trim();
}
