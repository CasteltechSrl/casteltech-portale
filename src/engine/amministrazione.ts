/**
 * Amministrazione: regole di calcolo dei documenti (fatture, note di credito, autofatture, DDT…).
 * Niente database qui: solo regole, così si provano con i test.
 *
 * - Scadenze: data documento + giorni, poi fine mese se richiesto (come Fatture in Cloud:
 *   fattura del 09/10/2026 con 60 gg f.m. → 31/12/2026).
 * - Riepilogo IVA come nella fattura elettronica: un totale per aliquota/natura, imposta arrotondata al centesimo.
 * - Bollo da 2 € se gli importi senza IVA soggetti a bollo superano 77,47 €.
 * - Numerazione: il nuovo documento non può avere una data precedente all'ultimo della stessa serie, né un altro anno.
 */

export const SOGLIA_BOLLO = 77.47;
export const IMPORTO_BOLLO = 2;

/** Arrotondamento al centesimo (metà in su), senza gli errori dei decimali di JavaScript. */
export const arrotonda2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface CondizionePagamento { giorni: number; fine_mese: boolean }

/** Ultimo giorno del mese di una data AAAA-MM-GG. */
function fineMese(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

/** Data di scadenza (AAAA-MM-GG). */
export function calcolaScadenza(dataDocumento: string, c: CondizionePagamento): string {
  const d = new Date(dataDocumento + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) throw new Error(`Data non valida: ${dataDocumento}`);
  d.setUTCDate(d.getUTCDate() + (Number(c.giorni) || 0));
  return (c.fine_mese ? fineMese(d) : d).toISOString().slice(0, 10);
}

export interface Aliquota { codice: string; percentuale: number; natura: string | null; riferimento_normativo?: string | null; soggetta_bollo: boolean }
export interface RigaDocumento { quantita: number; prezzo: number; sconto?: number; aliquota_iva?: string | null; solo_descrizione?: boolean }

/** Importo della riga (PrezzoTotale della fattura elettronica), arrotondato al centesimo. */
export function importoRiga(r: RigaDocumento): number {
  if (r.solo_descrizione) return 0;
  return arrotonda2((Number(r.quantita) || 0) * (Number(r.prezzo) || 0) * (1 - (Number(r.sconto) || 0) / 100));
}

export interface VoceRiepilogo { aliquota: string; percentuale: number; natura: string | null; riferimento_normativo: string | null; imponibile: number; imposta: number }
export interface Totali { riepilogo: VoceRiepilogo[]; imponibile: number; imposta: number; bollo: number; totale: number; errori: string[] }

/**
 * Totali del documento. Le righe senza aliquota usano quella predefinita (di solito IVA22).
 * Il bollo, se dovuto, si aggiunge al totale (lo paga il cliente, come d'uso).
 */
export function calcolaTotali(righe: RigaDocumento[], aliquote: Aliquota[], predefinita = 'IVA22'): Totali {
  const perCodice = new Map(aliquote.map(a => [a.codice, a]));
  const gruppi = new Map<string, VoceRiepilogo>();
  const errori: string[] = [];
  let baseBollo = 0;
  righe.forEach((r, i) => {
    if (r.solo_descrizione) return;
    const codice = r.aliquota_iva || predefinita;
    const a = perCodice.get(codice);
    if (!a) { errori.push(`Riga ${i + 1}: aliquota IVA "${codice}" sconosciuta.`); return; }
    const importo = importoRiga(r);
    const g = gruppi.get(codice) ?? { aliquota: codice, percentuale: Number(a.percentuale), natura: a.natura, riferimento_normativo: a.riferimento_normativo ?? null, imponibile: 0, imposta: 0 };
    g.imponibile = arrotonda2(g.imponibile + importo);
    gruppi.set(codice, g);
    if (a.soggetta_bollo && !(Number(a.percentuale) > 0)) baseBollo += importo;
  });
  const riepilogo = [...gruppi.values()].map(g => ({ ...g, imposta: arrotonda2(g.imponibile * g.percentuale / 100) }));
  const imponibile = arrotonda2(riepilogo.reduce((s, g) => s + g.imponibile, 0));
  const imposta = arrotonda2(riepilogo.reduce((s, g) => s + g.imposta, 0));
  const bollo = arrotonda2(baseBollo) > SOGLIA_BOLLO ? IMPORTO_BOLLO : 0;
  return { riepilogo, imponibile, imposta, bollo, totale: arrotonda2(imponibile + imposta + bollo), errori };
}

/**
 * Controllo prima di dare il numero: stessa serie (tipo + sezionale) numerata per anno,
 * date in ordine (un documento non può essere datato prima dell'ultimo già emesso).
 */
export function controllaDataNumerazione(dataNuova: string, anno: number, ultimaData: string | null): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataNuova)) return `Data non valida: ${dataNuova}.`;
  if (Number(dataNuova.slice(0, 4)) !== anno) return `La data ${dataNuova} non è dell'anno ${anno}.`;
  if (ultimaData && dataNuova < ultimaData) return `La data ${dataNuova} è precedente all'ultimo documento della serie (${ultimaData}): le date devono essere in ordine.`;
  return null;
}

/** Numero come si stampa e come va nella fattura elettronica (es. 117 oppure 93/AF). */
export const numeroCompleto = (numero: number, sezionale = '') => (sezionale ? `${numero}/${sezionale}` : String(numero));

// ── Dati dell'azienda ──

export const REGIMI_FISCALI: Record<string, string> = {
  RF01: 'Ordinario', RF02: 'Contribuenti minimi', RF04: 'Agricoltura e pesca', RF19: 'Forfettario',
};

export const CAMPI_AZIENDA = ['ragione_sociale', 'partita_iva', 'codice_fiscale', 'regime_fiscale', 'indirizzo', 'cap', 'comune', 'provincia', 'nazione',
  'rea_ufficio', 'rea_numero', 'capitale_sociale', 'socio_unico', 'telefono', 'email', 'pec', 'banca', 'iban'] as const;
export type CampoAzienda = typeof CAMPI_AZIENDA[number];
export type DatiAzienda = Record<CampoAzienda, string>;

/** Scritture uniformi (MAIUSCOLO, email e PEC minuscolo, IBAN senza spazi) e controlli minimi per la fattura elettronica. */
export function preparaAzienda(input: Record<string, unknown>): { azienda: DatiAzienda; errori: string[] } {
  const a = {} as DatiAzienda;
  for (const c of CAMPI_AZIENDA) {
    let v = String(input[c] ?? '').trim().replace(/\s+/g, ' ');
    if (c === 'email' || c === 'pec') v = v.toLowerCase();
    else if (c === 'iban' || c === 'partita_iva' || c === 'codice_fiscale' || c === 'cap') v = v.toUpperCase().replace(/\s/g, '');
    else v = v.toUpperCase();
    a[c] = v;
  }
  if (!a.nazione) a.nazione = 'IT';
  const errori: string[] = [];
  if (!a.ragione_sociale) errori.push('Manca la ragione sociale.');
  if (!/^\d{11}$/.test(a.partita_iva)) errori.push('La partita IVA deve avere 11 cifre.');
  if (!(a.regime_fiscale in REGIMI_FISCALI)) errori.push('Regime fiscale non valido.');
  if (!a.indirizzo || !a.comune) errori.push('Mancano indirizzo o comune della sede.');
  if (!/^\d{5}$/.test(a.cap)) errori.push('Il CAP deve avere 5 cifre.');
  if (a.provincia && !/^[A-Z]{2}$/.test(a.provincia)) errori.push('La provincia va scritta con la sigla di 2 lettere (es. PC).');
  if (a.iban && !/^IT\d{2}[A-Z]\d{10}[0-9A-Z]{12}$/.test(a.iban)) errori.push('IBAN italiano non valido (27 caratteri, inizia con IT).');
  if (a.socio_unico && !['SU', 'SM'].includes(a.socio_unico)) errori.push('Socio unico: SU (socio unico), SM (più soci) o vuoto.');
  if ((a.rea_ufficio || a.rea_numero) && !(/^[A-Z]{2}$/.test(a.rea_ufficio) && a.rea_numero)) errori.push('REA: servono sigla della provincia dell\'ufficio e numero.');
  return { azienda: a, errori };
}
