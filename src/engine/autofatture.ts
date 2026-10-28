/**
 * Autofatture (integrazione IVA) per le fatture dei fornitori esteri (Adriano, 28/10/2026): la fattura estera (PDF) arriva
 * dalla cartella Drive o si carica in Amministrazione, l'IA la legge, l'ufficio controlla fornitore e righe, il portale
 * prepara l'autofattura (bozza) che si emette con numero del sezionale AF e va allo SdI.
 * Qui solo regole e conti, senza database.
 *
 * Tipo del documento per lo SdI:
 * - TD17 servizi da fornitore estero (UE o extra UE), es. abbonamenti software;
 * - TD18 beni da fornitore UE (P.IVA comunitaria), es. Mouser (P.IVA francese), DigiKey (tedesca), Amazon EU;
 * - TD19 beni da fornitore extra UE già in Italia (art. 17 c. 2): se la merce è arrivata con la dogana l'IVA si è pagata
 *   in dogana e l'autofattura non serve.
 */
import { siglaNazione } from './amministrazione.js';

export const TIPI_AUTOFATTURA: Record<string, string> = {
  TD17: 'TD17 · servizi dall\'estero', TD18: 'TD18 · beni da fornitore UE', TD19: 'TD19 · beni extra UE già in Italia',
};
export type TipoAutofattura = 'TD17' | 'TD18' | 'TD19';
export const SEZIONALE_AUTOFATTURE = 'AF';

/** Paesi dell'Unione europea (sigle ISO; la Grecia nella P.IVA è "EL"). */
export const PAESI_UE = new Set(['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU',
  'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK']);

/** Sigla del paese dalla P.IVA scritta con il prefisso (FR27512466913 → FR, EL… → GR); vuoto se non c'è prefisso. */
export function paeseDaPartitaIva(piva: string | null | undefined): string {
  const m = /^([A-Z]{2})[0-9A-Z]/.exec(String(piva ?? '').toUpperCase().replace(/[\s.\-]/g, ''));
  if (!m) return '';
  const p = m[1] === 'EL' ? 'GR' : m[1];
  return PAESI_UE.has(p) || ['GB', 'CH', 'NO'].includes(p) ? p : '';
}

/**
 * Paese "fiscale" del fornitore: quello della P.IVA se ha il prefisso (Mouser ha sede in USA ma P.IVA francese),
 * altrimenti quello dell'indirizzo.
 */
export const paeseFiscale = (piva: string | null | undefined, paese: string | null | undefined) =>
  paeseDaPartitaIva(piva) || siglaNazione(paese) || '';

/** Tipo proposto: servizi → TD17; beni da P.IVA UE → TD18; beni extra UE → TD19. */
export function tipoAutofattura(paese: string, servizi: boolean): TipoAutofattura {
  if (servizi) return 'TD17';
  return PAESI_UE.has(paese) ? 'TD18' : 'TD19';
}

export interface RigaEstera { codice: string; descrizione: string; quantita: number; prezzo: number }
export interface FornitoreLetto {
  ragione_sociale: string; partita_iva: string; codice_fiscale: string; indirizzo: string; cap: string; comune: string; provincia: string;
  paese: string;   // sigla ISO dell'indirizzo
}
/** Fattura estera come letta dall'IA e corretta dall'ufficio (prezzi nella valuta della fattura). */
export interface FatturaEstera {
  fornitore: FornitoreLetto; numero: string; data: string | null; valuta: string; cambio: number | null;
  servizi: boolean; pagata: boolean; tipo: TipoAutofattura | null; righe: RigaEstera[];
  imponibileLetto: number | null; ivaLetta: number | null; totaleLetto: number | null; note: string;
}

const testo = (v: unknown, max = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const numero = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/[^\d,.\-]/g, '');
  // 1.234,56 → 1234.56; 1,234.56 → 1234.56; 12,5 → 12.5
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) && s !== '' ? n : null;
};
const MESI_INGLESE = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
/** Data in AAAA-MM-GG da 2026-10-21, 21/10/2026, 21-OCT-26 (Mouser), October 24, 2026 / Oct 21, 2026 (Anthropic, DigiKey). */
const dataIso = (v: unknown): string | null => {
  const s = testo(v, 30).toUpperCase().replace(/\u00AD/g, '-');   // trattino "morbido" dei PDF
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const due = (n: string) => n.padStart(2, '0');
  const anno = (a: string) => a.length === 2 ? `20${a}` : a;
  let m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${due(m[2])}-${due(m[1])}`;
  m = /^(\d{1,2})[\s\-]([A-Z]{3})[A-Z]*[\s\-,]+(\d{2}|\d{4})$/.exec(s);
  if (m && MESI_INGLESE.includes(m[2])) return `${anno(m[3])}-${due(String(MESI_INGLESE.indexOf(m[2]) + 1))}-${due(m[1])}`;
  m = /^([A-Z]{3})[A-Z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s);
  if (m && MESI_INGLESE.includes(m[1])) return `${m[3]}-${due(String(MESI_INGLESE.indexOf(m[1]) + 1))}-${due(m[2])}`;
  return null;
};

/** Forme societarie che non contano nel confronto dei nomi ("MOUSER ELECTRONICS, INC." = "MOUSER ELECTRONICS"). */
const FORME_SOCIETARIE = new Set(['INC', 'LTD', 'LIMITED', 'PBC', 'LLC', 'CORP', 'CORPORATION', 'CO', 'GMBH', 'AG', 'SA', 'SARL', 'SAS', 'BV',
  'NV', 'SRL', 'SRLS', 'SPA', 'KG', 'AB', 'OY', 'AS', 'PLC', 'SL', 'SP', 'ZOO', 'UAB', 'EK', 'RL']);
/** Nome del fornitore da confrontare: maiuscolo, senza punteggiatura né trattini (DIGI-KEY = DIGIKEY), senza forme societarie. */
export function nomeConfrontabile(nome: string | null | undefined): string {
  return String(nome ?? '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/(\w)[\-'.](\w)/g, '$1$2').replace(/(\w)[\-'.](\w)/g, '$1$2').replace(/[^A-Z0-9]+/g, ' ').trim()
    .split(' ').filter(p => p && !FORME_SOCIETARIE.has(p)).join(' ');
}
/** Stesso fornitore a giudicare dal nome: uguali, o uno è l'inizio dell'altro ("ANTHROPIC" e "ANTHROPIC IRELAND"), almeno 5 lettere. */
export function stessoNomeFornitore(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = nomeConfrontabile(a), y = nomeConfrontabile(b);
  if (!x || !y) return false;
  const [corto, lungo] = x.length <= y.length ? [x, y] : [y, x];
  return corto === lungo || (corto.replace(/ /g, '').length >= 5 && lungo.startsWith(`${corto} `));
}

/** Pulisce quello che restituisce l'IA (o il modulo della pagina): testi, numeri, date, paese, valuta. */
export function normalizzaFatturaEstera(x: any): FatturaEstera {
  const f = x?.fornitore ?? {};
  const fornitore: FornitoreLetto = {
    ragione_sociale: testo(f.ragione_sociale ?? f.nome, 120).toUpperCase(),
    partita_iva: testo(f.partita_iva, 30).toUpperCase().replace(/[\s.\-]/g, ''),
    codice_fiscale: testo(f.codice_fiscale, 30).toUpperCase().replace(/\s/g, ''),
    indirizzo: testo(f.indirizzo, 120).toUpperCase(), cap: testo(f.cap, 12).toUpperCase(), comune: testo(f.comune ?? f.citta, 60).toUpperCase(),
    provincia: testo(f.provincia, 30).toUpperCase(), paese: siglaNazione(testo(f.paese, 40)) ?? '',
  };
  const righe = (Array.isArray(x?.righe) ? x.righe : []).map((r: any) => ({
    codice: testo(r?.codice, 60).toUpperCase(), descrizione: testo(r?.descrizione, 300),
    quantita: numero(r?.quantita) ?? 1, prezzo: numero(r?.prezzo) ?? 0,
  })).filter((r: RigaEstera) => r.descrizione || r.codice || r.prezzo);
  const valuta = testo(x?.valuta, 3).toUpperCase().replace('€', 'EUR') || 'EUR';
  const cambio = numero(x?.cambio);
  const tipo = String(x?.tipo ?? '').toUpperCase();
  return {
    fornitore, numero: testo(x?.numero, 40), data: dataIso(x?.data), valuta: /^[A-Z]{3}$/.test(valuta) ? valuta : 'EUR',
    cambio: cambio && cambio > 0 ? cambio : null, servizi: x?.servizi === true || x?.servizi === 'true' || x?.servizi === '1',
    pagata: x?.pagata === true || x?.pagata === 'true' || x?.pagata === '1',
    tipo: tipo in TIPI_AUTOFATTURA ? tipo as TipoAutofattura : null, righe,
    imponibileLetto: numero(x?.imponibile), ivaLetta: numero(x?.iva), totaleLetto: numero(x?.totale), note: testo(x?.note, 500),
  };
}

const arrotonda = (n: number, cifre = 2) => Math.round(n * 10 ** cifre) / 10 ** cifre;
/** Somma delle righe nella valuta della fattura, ogni riga arrotondata al centesimo come sulla fattura e nell'XML (DigiKey: 50 × 22,86167 = 1143,08). */
export const sommaRighe = (righe: RigaEstera[]) => arrotonda(righe.reduce((s, r) => s + arrotonda(r.quantita * r.prezzo), 0));

/** Prezzi in euro: cambio BCE = unità di valuta per 1 euro (es. 1,1215 USD); i prezzi unitari tengono 5 decimali. */
export function righeInEuro(righe: RigaEstera[], valuta: string, cambio: number | null): RigaEstera[] {
  if (valuta === 'EUR') return righe;
  if (!cambio) throw new Error(`Manca il cambio ${valuta}/EUR.`);
  return righe.map(r => ({ ...r, prezzo: arrotonda(r.prezzo / cambio, 5) }));
}

/** Controlli prima di preparare l'autofattura: gli errori la bloccano, gli avvisi no. */
export function controllaFatturaEstera(f: FatturaEstera): { errori: string[]; avvisi: string[] } {
  const errori: string[] = [], avvisi: string[] = [];
  const paese = paeseFiscale(f.fornitore.partita_iva, f.fornitore.paese);
  if (!f.fornitore.ragione_sociale) errori.push('Manca il nome del fornitore.');
  if (!f.fornitore.partita_iva) errori.push('Manca la partita IVA (o il codice fiscale estero) del fornitore: scrivila come sul documento.');
  if (paese === 'IT' || /^IT\d{11}$/.test(f.fornitore.partita_iva) || /^\d{11}$/.test(f.fornitore.partita_iva))
    errori.push('Il fornitore è italiano: la sua fattura arriva dallo SdI e l\'autofattura non serve.');
  if (!paese) errori.push('Scegli il paese del fornitore.');
  if (!f.fornitore.indirizzo || !f.fornitore.comune) errori.push('Mancano indirizzo o città del fornitore.');
  if (!f.numero) errori.push('Manca il numero della fattura del fornitore.');
  if (!f.data) errori.push('Manca la data della fattura del fornitore.');
  if (!f.righe.length) errori.push('Nessuna riga letta: aggiungi le righe della fattura.');
  if (f.valuta !== 'EUR' && !f.cambio) errori.push(`Fattura in ${f.valuta}: serve il cambio con l'euro (si prende dalla BCE alla data della fattura).`);
  const tipo = f.tipo ?? (paese ? tipoAutofattura(paese, f.servizi) : null);
  if (tipo === 'TD18' && paese && !PAESI_UE.has(paese)) errori.push('TD18 è solo per fornitori con P.IVA dell\'Unione europea.');
  if (tipo === 'TD19') avvisi.push('TD19 solo se la merce era già in Italia: se è arrivata con la dogana (bolletta doganale) l\'IVA si è pagata lì e l\'autofattura non serve.');
  const somma = sommaRighe(f.righe);
  if (f.imponibileLetto != null && Math.abs(somma - f.imponibileLetto) > 0.02)
    avvisi.push(`Le righe sommano ${somma.toFixed(2)} ${f.valuta} ma l'imponibile della fattura è ${f.imponibileLetto.toFixed(2)}: controlla le righe (spese di trasporto, sconti).`);
  if (f.ivaLetta) avvisi.push(`Il fornitore ha addebitato IVA (${f.ivaLetta.toFixed(2)} ${f.valuta}): di solito in questo caso l'autofattura non serve, controlla.`);
  return { errori, avvisi };
}

/** "Relativo a fattura n. 93174181 del 21/10/2026": causale dell'autofattura, come in Fatture in Cloud. */
export const causaleAutofattura = (numero: string, data: string) => `Relativo a fattura n. ${numero} del ${data.split('-').reverse().join('/')}`;

/**
 * Cambio BCE dal file CSV della BCE (EXR, giornaliero): l'ultimo pubblicato fino alla data (i fine settimana e i festivi non hanno cambio).
 * Restituisce unità di valuta per 1 euro, o null.
 */
export function cambioDaCsv(csv: string, data: string): number | null {
  const righe = csv.trim().split(/\r?\n/);
  const testa = (righe.shift() ?? '').split(',');
  const iData = testa.indexOf('TIME_PERIOD'), iValore = testa.indexOf('OBS_VALUE');
  if (iData < 0 || iValore < 0) return null;
  let migliore: { data: string; valore: number } | null = null;
  for (const r of righe) {
    const c = r.split(',');
    const v = Number(c[iValore]);
    if (!c[iData] || c[iData] > data || !(v > 0)) continue;
    if (!migliore || c[iData] > migliore.data) migliore = { data: c[iData], valore: v };
  }
  return migliore?.valore ?? null;
}
