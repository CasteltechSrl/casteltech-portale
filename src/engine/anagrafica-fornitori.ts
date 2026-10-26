/**
 * Anagrafica fornitori: controlli della partita IVA e scritte uniformi.
 * Regole (Adriano, 26/10/2026): senza P.IVA il fornitore non entra; niente doppioni (stessa P.IVA);
 * tutto in MAIUSCOLO; i dati che non convincono non si caricano. Email e PEC restano in minuscolo.
 */

/** Cifra di controllo della partita IVA italiana (11 cifre). */
export function partitaIvaItalianaValida(p: string): boolean {
  if (!/^\d{11}$/.test(p) || p === '00000000000') return false;
  let s = 0;
  for (let i = 0; i < 10; i++) {
    let n = Number(p[i]);
    if (i % 2) { n *= 2; if (n > 9) n -= 9; }
    s += n;
  }
  return (10 - (s % 10)) % 10 === Number(p[10]);
}

/** Formato della partita IVA estera, dopo il prefisso del paese. */
const FORMATI: Record<string, RegExp> = {
  DE: /^\d{9}$/, FR: /^[0-9A-Z]{2}\d{9}$/, PL: /^\d{10}$/, IE: /^(\d{7}[A-Z]{1,2}|\d[A-Z]\d{5}[A-Z])$/, NL: /^\d{9}B\d{2}$/,
  ES: /^[A-Z0-9]\d{7}[A-Z0-9]$/, SE: /^\d{12}$/, GB: /^(\d{9}|\d{12})$/, LU: /^\d{8}$/, AT: /^U\d{8}$/, BE: /^0?\d{9}$/,
  CZ: /^\d{8,10}$/, EU: /^\d{9}$/, CHE: /^\d{9}(MWST|TVA|IVA)?$/,
};
/** Prefisso della P.IVA per il paese scritto in anagrafica (in maiuscolo). */
const PREFISSI: Record<string, string> = {
  ITALIA: 'IT', GERMANIA: 'DE', FRANCIA: 'FR', POLONIA: 'PL', IRLANDA: 'IE', 'REGNO UNITO': 'GB', 'PAESI BASSI': 'NL', SPAGNA: 'ES',
  'ISOLE CANARIE (SPAGNA)': 'ES', LUSSEMBURGO: 'LU', SVEZIA: 'SE', SVIZZERA: 'CHE', AUSTRIA: 'AT', BELGIO: 'BE', 'REPUBBLICA CECA': 'CZ',
};

export interface EsitoPartitaIva { partitaIva: string; errore: string | null }

/**
 * Controlla e scrive la P.IVA in modo uniforme: italiana senza "IT", estera con il prefisso del paese.
 * Se il paese non ha un formato conosciuto (es. Cina, Stati Uniti) basta che ci siano dei numeri.
 */
export function controllaPartitaIva(valore: unknown, paese: unknown = 'ITALIA'): EsitoPartitaIva {
  const p = String(valore ?? '').toUpperCase().replace(/[\s.\-/]/g, '');
  const nazione = String(paese ?? '').trim().toUpperCase() || 'ITALIA';
  if (!p) return { partitaIva: '', errore: 'Manca la partita IVA: senza P.IVA il fornitore non si carica.' };
  if (!/\d{5}/.test(p)) return { partitaIva: p, errore: `"${p}" non è una partita IVA (non ci sono numeri).` };
  const m = /^(CHE|[A-Z]{2})(.*)$/.exec(p);
  const conPrefisso = !!m && (m[1] === 'IT' || m[1] in FORMATI);
  let pref = conPrefisso ? m![1] : (PREFISSI[nazione] ?? '');
  const num = conPrefisso ? m![2] : p;
  if (!conPrefisso && pref !== 'IT' && partitaIvaItalianaValida(num)) pref = 'IT';   // es. sede secondaria in Italia
  if (pref === 'IT') {
    return partitaIvaItalianaValida(num) ? { partitaIva: num, errore: null }
      : { partitaIva: num, errore: `La partita IVA italiana ${num} è sbagliata (la cifra di controllo non torna).` };
  }
  if (pref) {
    return FORMATI[pref].test(num) ? { partitaIva: pref + num, errore: null }
      : { partitaIva: p, errore: `La partita IVA ${p} non ha il formato di ${pref}.` };
  }
  return { partitaIva: p, errore: null };
}

export const CAMPI_FORNITORE = ['ragione_sociale', 'partita_iva', 'codice_fiscale', 'indirizzo', 'cap', 'comune', 'provincia', 'paese',
  'email', 'pec', 'telefono', 'referente', 'iban', 'codice_sdi', 'note'] as const;
export type CampoFornitore = typeof CAMPI_FORNITORE[number];
export type Fornitore = Record<CampoFornitore, string | null>;

const MINUSCOLO: CampoFornitore[] = ['email', 'pec'];
const SENZA_SPAZI: CampoFornitore[] = ['codice_fiscale', 'iban', 'codice_sdi'];

/** Scritte uniformi: MAIUSCOLO e spazi singoli; email e PEC in minuscolo; codice fiscale, IBAN e SDI senza spazi. */
export function uniformaFornitore(f: Partial<Record<CampoFornitore, unknown>>): Fornitore {
  const out = {} as Fornitore;
  for (const c of CAMPI_FORNITORE) {
    let v = String(f[c] ?? '').replace(/\s+/g, ' ').trim();
    v = MINUSCOLO.includes(c) ? v.toLowerCase().replace(/\s/g, '') : v.toUpperCase();
    if (SENZA_SPAZI.includes(c)) v = v.replace(/\s/g, '');
    out[c] = v || null;
  }
  if (!out.paese) out.paese = 'ITALIA';
  return out;
}

/** Uniforma e controlla un fornitore: errore se manca la ragione sociale o la P.IVA non va. */
export function preparaFornitore(f: Partial<Record<CampoFornitore, unknown>>): { fornitore: Fornitore; errore: string | null } {
  const fornitore = uniformaFornitore(f);
  if (!fornitore.ragione_sociale) return { fornitore, errore: 'Manca la ragione sociale.' };
  const pi = controllaPartitaIva(fornitore.partita_iva, fornitore.paese);
  fornitore.partita_iva = pi.partitaIva || null;
  return { fornitore, errore: pi.errore };
}
