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

// ── Dati fiscali dei clienti (dall'anagrafica di Fatture in Cloud) ──

/** Nome del paese (come in FIC) → sigla ISO della fattura elettronica. */
const NAZIONI: Record<string, string> = {
  ITALIA: 'IT', 'STATI UNITI': 'US', SVIZZERA: 'CH', CINA: 'CN', SVEZIA: 'SE', IRLANDA: 'IE', 'PAESI BASSI': 'NL', FRANCIA: 'FR',
  NORVEGIA: 'NO', GERMANIA: 'DE', SPAGNA: 'ES', AUSTRIA: 'AT', BELGIO: 'BE', POLONIA: 'PL', 'REGNO UNITO': 'GB', 'SAN MARINO': 'SM',
  'REPUBBLICA CECA': 'CZ', SLOVENIA: 'SI', ROMANIA: 'RO', UNGHERIA: 'HU', PORTOGALLO: 'PT', DANIMARCA: 'DK', FINLANDIA: 'FI', LUSSEMBURGO: 'LU',
  GRECIA: 'GR', BULGARIA: 'BG', SLOVACCHIA: 'SK', CROAZIA: 'HR', ESTONIA: 'EE', LETTONIA: 'LV', LITUANIA: 'LT', MALTA: 'MT', CIPRO: 'CY',
  'HONG KONG': 'HK', TAIWAN: 'TW', GIAPPONE: 'JP', 'COREA DEL SUD': 'KR', INDIA: 'IN', CANADA: 'CA', ISRAELE: 'IL', SINGAPORE: 'SG',
  TURCHIA: 'TR', AUSTRALIA: 'AU', THAILANDIA: 'TH', MALESIA: 'MY', VIETNAM: 'VN',
};
/** Nomi inglesi (come sulle fatture estere) → sigla ISO. */
const NAZIONI_INGLESE: Record<string, string> = {
  ITALY: 'IT', 'UNITED STATES': 'US', 'UNITED STATES OF AMERICA': 'US', USA: 'US', 'U.S.A.': 'US', SWITZERLAND: 'CH', CHINA: 'CN',
  "PEOPLE'S REPUBLIC OF CHINA": 'CN', PRC: 'CN', SWEDEN: 'SE', IRELAND: 'IE', NETHERLANDS: 'NL', 'THE NETHERLANDS': 'NL', HOLLAND: 'NL', FRANCE: 'FR',
  NORWAY: 'NO', GERMANY: 'DE', DEUTSCHLAND: 'DE', SPAIN: 'ES', BELGIUM: 'BE', POLAND: 'PL', 'UNITED KINGDOM': 'GB', UK: 'GB', 'GREAT BRITAIN': 'GB',
  ENGLAND: 'GB', 'CZECH REPUBLIC': 'CZ', CZECHIA: 'CZ', HUNGARY: 'HU', DENMARK: 'DK', FINLAND: 'FI', LUXEMBOURG: 'LU', GREECE: 'GR',
  SLOVAKIA: 'SK', CROATIA: 'HR', LATVIA: 'LV', LITHUANIA: 'LT', CYPRUS: 'CY', JAPAN: 'JP', 'SOUTH KOREA': 'KR', KOREA: 'KR', ISRAEL: 'IL',
  TURKEY: 'TR', THAILAND: 'TH', MALAYSIA: 'MY',
};
export function siglaNazione(paese: unknown): string | null {
  const p = String(paese ?? '').trim().toUpperCase();
  if (!p) return 'IT';
  if (/^[A-Z]{2}$/.test(p)) return p === 'UK' ? 'GB' : p === 'EL' ? 'GR' : p;
  return NAZIONI[p] ?? NAZIONI_INGLESE[p] ?? null;
}
/** Paesi in elenco (sigla e nome), per scegliere il paese di un fornitore. */
export const ELENCO_NAZIONI = Object.entries(NAZIONI).map(([nome, sigla]) => ({ sigla, nome })).sort((x, y) => x.nome.localeCompare(y.nome));
/** Sigla ISO → nome del paese in italiano (MAIUSCOLO, come nelle anagrafiche); la sigla stessa se il paese non è in elenco. */
export function nomeNazione(sigla: string): string {
  return Object.entries(NAZIONI).find(([, s]) => s === sigla)?.[0] ?? sigla;
}

export interface CondizioneDaFile { codice: string; descrizione: string; modalita: string; giorni: number; fine_mese: boolean }

/**
 * Condizione di pagamento dal metodo di FIC: "RI.BA. …" = RiBa, "Contanti", altrimenti bonifico.
 * I metodi RiBa "per cliente" di FIC (RI.BA LPS, RI.BA. ARTEL…) diventano la RiBa standard con gli stessi giorni.
 */
export function condizioneDaFic(metodo: unknown, giorni: unknown, fineMese: unknown): CondizioneDaFile | null {
  const m = String(metodo ?? '').toUpperCase();
  const g = Math.max(0, Math.trunc(Number(giorni) || 0));
  const fm = !!fineMese && g > 0;
  if (!m && !g) return null;
  if (m.includes('CONTANT')) return { codice: 'CONTANTI', descrizione: 'Contanti', modalita: 'MP01', giorni: 0, fine_mese: false };
  const riba = /RI\.?\s?BA/.test(m);
  const [sigla, nome, modalita] = riba ? ['RB', 'RiBa', 'MP12'] : ['BB', 'Bonifico bancario', 'MP05'];
  if (!riba && g === 0) return { codice: 'BB_VISTA', descrizione: 'Bonifico bancario a vista', modalita, giorni: 0, fine_mese: false };
  return { codice: `${sigla}_${g}${fm ? 'FM' : ''}`, descrizione: `${nome} ${g} gg${fm ? ' f.m.' : ' data fattura'}`, modalita, giorni: g, fine_mese: fm };
}

/** Aliquota predefinita del cliente dalla descrizione di FIC (null = IVA 22%, quella normale). */
export function aliquotaDaFic(descrizione: unknown, percentuale: unknown): { codice: string | null; avviso: string | null } {
  const d = String(descrizione ?? '').toUpperCase();
  if (Number(percentuale) > 0 || (!d && percentuale == null)) return { codice: null, avviso: null };
  if (/8\s*\/\s*C|LETTERA C|INTENTO/.test(d)) return { codice: 'INTENTO', avviso: null };
  if (/LETTERA A|LETTERA B|ESTERO/.test(d)) return { codice: 'EXPORT', avviso: null };
  if (/41/.test(d)) return { codice: 'UE_BENI', avviso: null };
  if (/ART\.?\s*72/.test(d)) return { codice: 'ART72', avviso: null };
  return { codice: null, avviso: `aliquota "${String(descrizione)}" non riconosciuta: lasciata IVA 22%, da scegliere a mano` };
}

export interface ClienteFiscale {
  ragione_sociale: string; partita_iva: string | null; codice_fiscale: string | null; indirizzo: string | null; cap: string | null;
  comune: string | null; provincia: string | null; nazione: string; codice_sdi: string | null; pec: string | null;
  email_amministrazione: string | null; banca_appoggio: string | null; condizione: CondizioneDaFile | null; aliquota_iva: string | null;
  intento: { protocollo: string; data: string } | null; pubblica_amministrazione: boolean;
}

const testo = (v: unknown) => { const s = String(v ?? '').replace(/\s+/g, ' ').trim(); return s || null; };
const maiusc = (v: unknown) => testo(v)?.toUpperCase() ?? null;

/** Riga del file (anagrafica clienti di FIC) → dati fiscali del cliente nel portale, con gli avvisi da mostrare. */
export function preparaClienteFiscale(x: any): { cliente: ClienteFiscale; avvisi: string[] } {
  const avvisi: string[] = [];
  const nazione = siglaNazione(x.paese);
  if (!nazione) avvisi.push(`paese "${x.paese}" sconosciuto: messo IT, da correggere`);
  const iva = aliquotaDaFic(x.iva?.descrizione, x.iva?.percentuale);
  if (iva.avviso) avvisi.push(iva.avviso);
  let sdi = maiusc(x.codice_sdi);
  const pa = String(x.tipo ?? '') === 'pa' || (!!sdi && sdi.length === 6);
  if (sdi && !(pa ? /^[A-Z0-9]{6}$/ : /^[A-Z0-9]{7}$/).test(sdi)) { avvisi.push(`codice SDI "${sdi}" non valido: tolto`); sdi = null; }
  const pec = testo(x.pec)?.toLowerCase() ?? null;
  if ((nazione ?? 'IT') === 'IT' && !sdi && !pec) avvisi.push('senza codice SDI né PEC: la fattura andrà nel cassetto fiscale (codice 0000000)');
  const piva = maiusc(x.partita_iva)?.replace(/[\s.\-]/g, '').replace(/^IT(?=\d{11}$)/, '') ?? null;
  const intento = x.intento?.protocollo && /^\d{4}-\d{2}-\d{2}$/.test(String(x.intento.data ?? ''))
    ? { protocollo: String(x.intento.protocollo).trim(), data: String(x.intento.data) } : null;
  return {
    cliente: {
      ragione_sociale: maiusc(x.ragione_sociale) ?? '', partita_iva: piva, codice_fiscale: maiusc(x.codice_fiscale)?.replace(/\s/g, '') ?? null,
      indirizzo: maiusc(x.indirizzo), cap: testo(x.cap), comune: maiusc(x.comune), provincia: maiusc(x.provincia), nazione: nazione ?? 'IT',
      codice_sdi: sdi, pec, email_amministrazione: testo(x.email)?.toLowerCase() ?? null,
      banca_appoggio: maiusc(x.iban)?.replace(/\s/g, '') ?? null,
      condizione: condizioneDaFic(x.pagamento?.metodo, x.pagamento?.giorni, x.pagamento?.fine_mese),
      aliquota_iva: iva.codice, intento, pubblica_amministrazione: pa,
    },
    avvisi,
  };
}

/**
 * Anno a cui vale una lettera d'intento: quelle protocollate a dicembre valgono di solito per l'anno dopo
 * (es. GALILEO 17/12/2025 → 2026). Si corregge a mano se serve.
 */
export const annoLetteraIntento = (data: string) => Number(data.slice(0, 4)) + (data.slice(5, 7) === '12' ? 1 : 0);

// ── Storico dei documenti da Fatture in Cloud ──

/** Codice dell'aliquota del portale per una riga di FIC (IVA 22/10/4 % o non imponibile riconosciuto); null se non si sa. */
export function aliquotaRigaFic(iva: { descrizione?: unknown; percentuale?: unknown } | null | undefined): string | null {
  const p = Number(iva?.percentuale ?? 0);
  if (p === 22 || p === 10 || p === 4) return `IVA${p}`;
  if (p > 0) return null;
  return aliquotaDaFic(iva?.descrizione, 0).codice;
}

/**
 * Numero e anno della fattura citata in una nota di credito ("relativa alla fattura nr. 11/2025 del 31/01/2025",
 * "Rif. Ns Fattura n.21/2025", "storno parziale Nostra Ft 52 del 30/04/2025"); null se il testo non ne cita una.
 */
export function fatturaCitata(testo: unknown): { numero: number; anno: number } | null {
  const m = /\b(?:fattura|ft)\.?\s*(?:nr?\.?|numero)?\s*(\d{1,6})(?:\s*\/\s*(\d{4}))?(?:\s+del\s+\d{1,2}[\/.-]\d{1,2}[\/.-](\d{4}))?/i.exec(String(testo ?? ''));
  if (!m) return null;
  const anno = Number(m[2] ?? m[3]);
  return anno ? { numero: Number(m[1]), anno } : null;
}

const TIPI_STORICO = ['fattura', 'nota_credito', 'autofattura', 'ddt'] as const;
export type TipoStorico = typeof TIPI_STORICO[number];
const dataIso = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const numeroO0 = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export interface ScadenzaStorico { data: string; importo: number; pagata_il: string | null; conto: string | null }
export interface RigaStorico { posizione: number; solo_descrizione: boolean; codice: string | null; descrizione: string; quantita: number; um: string | null; prezzo: number; sconto: number; aliquota_iva: string | null }
export interface DocumentoStorico {
  fic_id: number; tipo: TipoStorico; tipo_sdi: string | null; sezionale: string; anno: number; numero: number; data: string; stato: string;
  intestatario: Record<string, string>; causale: string | null; note: string | null; modalita: string | null;
  imponibile: number; imposta: number; bollo: number; totale: number; dati_trasporto: Record<string, unknown> | null;
  fattura_fic_id: number | null; fattura_citata: { numero: number; anno: number } | null;
  righe: RigaStorico[]; scadenze: ScadenzaStorico[];
}

/** Scadenze di FIC: quelle stornate (es. autofatture, che non si pagano al fornitore) non si portano. */
function scadenzeFic(lista: unknown): ScadenzaStorico[] {
  return (Array.isArray(lista) ? lista : [])
    .filter((p: any) => p && p.stato !== 'reversed' && dataIso(p.data))
    .map((p: any) => ({ data: p.data, importo: arrotonda2(numeroO0(p.importo)), pagata_il: p.stato === 'paid' ? dataIso(p.pagata_il) ?? p.data : null, conto: testo(p.conto) }));
}

/** Controlla e normalizza un documento emesso preso da FIC (file storico_fic.json.gz). */
export function preparaDocumentoFic(x: any): { documento: DocumentoStorico | null; errore: string | null } {
  const tipo = x?.tipo as TipoStorico;
  const nome = `${x?.tipo ?? '?'} n. ${x?.numero ?? '?'} del ${x?.data ?? '?'}`;
  if (!TIPI_STORICO.includes(tipo)) return { documento: null, errore: `${nome}: tipo non previsto` };
  const data = dataIso(x.data);
  const numero = Number(x.numero);
  if (!data || !Number.isInteger(numero) || numero < 1 || !Number.isFinite(Number(x.fic_id))) return { documento: null, errore: `${nome}: numero, data o id mancanti` };
  const intestatario = Object.fromEntries(Object.entries(x.intestatario ?? {}).map(([k, v]) => [k, String(v ?? '').trim()]).filter(([, v]) => v));
  const righe: RigaStorico[] = (Array.isArray(x.righe) ? x.righe : []).map((r: any, i: number) => {
    const descrizione = String(r?.descrizione ?? '').trim();
    const quantita = numeroO0(r?.quantita), prezzo = numeroO0(r?.prezzo);
    // righe di solo testo: "DDT n. 86 del 27/04/2026", note… (prezzo 0 e senza codice)
    const solo = prezzo === 0 && !testo(r?.codice) && (/^DDT\b/i.test(descrizione) || quantita <= 1) && tipo !== 'ddt';
    return { posizione: i + 1, solo_descrizione: solo, codice: testo(r?.codice), descrizione, quantita, um: testo(r?.um), prezzo, sconto: numeroO0(r?.sconto),
      aliquota_iva: solo ? null : aliquotaRigaFic(r?.iva) };
  });
  const stato = tipo === 'ddt' ? 'emesso' : (x.stato_sdi === 'sent' || x.stato_sdi === 'accepted' ? 'consegnato' : 'emesso');
  return { errore: null, documento: {
    fic_id: Number(x.fic_id), tipo, tipo_sdi: testo(x.tipo_sdi), sezionale: String(x.sezionale ?? '').trim().toUpperCase(),
    anno: Number(data.slice(0, 4)), numero, data, stato, intestatario,
    causale: testo(x.oggetto), note: testo(x.note), modalita: testo(x.pagamento?.modalita),
    imponibile: arrotonda2(numeroO0(x.imponibile)), imposta: arrotonda2(numeroO0(x.imposta)), bollo: arrotonda2(numeroO0(x.bollo)), totale: arrotonda2(numeroO0(x.totale)),
    dati_trasporto: tipo === 'ddt' && x.trasporto ? Object.fromEntries(Object.entries(x.trasporto).filter(([, v]) => v != null && v !== '')) : null,
    fattura_fic_id: Number(x.fattura_fic_id) || null,
    fattura_citata: tipo === 'nota_credito' ? fatturaCitata(x.oggetto) : null,
    righe, scadenze: tipo === 'autofattura' || tipo === 'ddt' ? [] : scadenzeFic(x.scadenze),
  } };
}

export interface RicevutoStorico {
  fic_id: number; tipo: 'fattura' | 'nota_credito'; numero: string; data: string; intestatario: Record<string, string>;
  partita_iva: string | null; descrizione: string | null; categoria: string | null;
  imponibile: number; imposta: number; totale: number; elettronica: boolean; scadenze: ScadenzaStorico[];
  ritenuta: number; netto_a_pagare: number | null;
}

/** Controlla e normalizza un documento ricevuto da un fornitore (fattura d'acquisto o nota di credito). */
export function preparaRicevutoFic(x: any): { documento: RicevutoStorico | null; errore: string | null } {
  const data = dataIso(x?.data);
  if (!data || !Number.isFinite(Number(x?.fic_id))) return { documento: null, errore: `documento ricevuto ${x?.numero ?? '?'}: data o id mancanti` };
  const f = x.fornitore ?? {};
  const intestatario = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, String(v ?? '').trim()]).filter(([, v]) => v));
  const piva = String(f.partita_iva ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^IT(?=\d{11}$)/, '');
  return { errore: null, documento: {
    fic_id: Number(x.fic_id), tipo: x.tipo === 'nota_credito' ? 'nota_credito' : 'fattura', numero: String(x.numero ?? '').trim(), data, intestatario,
    partita_iva: piva || null, descrizione: testo(x.descrizione), categoria: testo(x.categoria),
    imponibile: arrotonda2(numeroO0(x.imponibile)), imposta: arrotonda2(numeroO0(x.imposta)), totale: arrotonda2(numeroO0(x.totale)),
    elettronica: x.elettronica !== false, scadenze: scadenzeFic(x.scadenze),
    // ritenuta d'acconto del professionista: il totale è prima della ritenuta, si paga il netto
    ritenuta: arrotonda2(numeroO0(x.ritenuta)),
    netto_a_pagare: x.netto_a_pagare == null ? null : arrotonda2(numeroO0(x.netto_a_pagare)),
  } };
}

/** Modi di pagamento di una rata (Adriano 31/10/2026), scelti quando si segna pagata o incassata; il conto (es. Bper) resta a parte. */
export const MODI_PAGAMENTO = ['Bonifico', 'Ri.Ba.', 'Bancomat', 'Carta di credito', 'PayPal', 'Compensato con fattura', 'Stornato'] as const;

/** Il modo scritto nel modulo, solo se è uno di quelli previsti (maiuscole e spazi non contano); altrimenti null. */
export function modoPagamento(valore: unknown): string | null {
  const v = String(valore ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return MODI_PAGAMENTO.find(m => m.toLowerCase() === v) ?? null;
}
