/**
 * Ricerca unica in alto (proposta della revisione del 1/11/2026, scelta da Adriano): una sola casella nella testata,
 * tasto "/" o Ctrl+K, che trova clienti, prodotti, commesse, ordini, documenti, preventivi, fornitori, aziende del CRM
 * e componenti e porta DIRITTO alla pagina. Qui le regole senza database (interpretazione di quel che si scrive, ordine
 * dei risultati); le letture stanno in server/ricerca-globale-servizio.ts.
 *
 * Cosa capisce:
 * - "C2026-0012" o "2026-0012" → numero di commessa;
 * - "12/2026", "12-2026", "2026/12" → numero e anno (ordini, fatture, DDT, note di credito, conferme, ordini a fornitore);
 * - "12" da solo → numero in qualsiasi anno (prima l'anno in corso);
 * - 11 cifre → partita IVA;
 * - il resto è testo: ragioni sociali, codici prodotto, descrizioni, P/N (stesse regole della ricerca veloce: accenti,
 *   trattini e maiuscole non contano, più parole devono esserci tutte).
 */
import { corrispondeRicerca, normalizzaRicerca } from './ricerca.js';

export type TipoRisultato = 'cliente' | 'prodotto' | 'commessa' | 'ordine' | 'documento' | 'ricevuto' | 'preventivo' | 'fornitore' | 'crm' | 'componente' | 'guida';

export interface RisultatoRicerca {
  tipo: TipoRisultato;
  /** cosa si è trovato: "ROSSI S.R.L.", "Commessa C2026-0012", "Fattura 12/2026" */
  titolo: string;
  /** riga sotto: cliente, data, stato… */
  dettaglio?: string;
  href: string;
  /** testo su cui misurare quanto corrisponde (titolo + dettaglio se manca) */
  chiave?: string;
}

/** Nomi dei gruppi nella pagina dei risultati, nell'ordine in cui compaiono. */
export const GRUPPI_RICERCA: { tipo: TipoRisultato; nome: string }[] = [
  { tipo: 'cliente', nome: 'Clienti' },
  { tipo: 'prodotto', nome: 'Prodotti' },
  { tipo: 'commessa', nome: 'Commesse' },
  { tipo: 'ordine', nome: 'Ordini clienti' },
  { tipo: 'documento', nome: 'Documenti emessi' },
  { tipo: 'ricevuto', nome: 'Fatture fornitori' },
  { tipo: 'preventivo', nome: 'Preventivi' },
  { tipo: 'fornitore', nome: 'Fornitori' },
  { tipo: 'crm', nome: 'CRM' },
  { tipo: 'componente', nome: 'Componenti' },
  { tipo: 'guida', nome: 'Guida' },
];

export interface RicercaInterpretata {
  /** testo pulito (spazi in più tolti) */
  testo: string;
  /** numero di commessa completo, es. C2026-0012 */
  commessa?: string;
  /** numero (e anno se scritto) di un documento o ordine */
  numero?: { numero: number; anno?: number };
  /** partita IVA (11 cifre) */
  partitaIva?: string;
}

export function interpretaRicerca(q: string): RicercaInterpretata {
  const testo = q.replace(/\s+/g, ' ').trim();
  const r: RicercaInterpretata = { testo };
  if (!testo) return r;
  let m = /^c?\s*(20\d{2})[-/ ](\d{1,4})$/i.exec(testo);
  if (m) {
    r.commessa = `C${m[1]}-${m[2].padStart(4, '0')}`;
    if (Number(m[2]) > 0 && !/^c/i.test(testo)) r.numero = { numero: Number(m[2]), anno: Number(m[1]) };   // "2026/12" può essere anche fattura 12/2026
    return r;
  }
  m = /^(\d{1,6})\s*[/-]\s*(\d{2}|20\d{2})$/.exec(testo);
  if (m) {
    const anno = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
    r.numero = { numero: Number(m[1]), anno };
    return r;
  }
  if (/^\d{11}$/.test(testo)) { r.partitaIva = testo; return r; }
  if (/^\d{1,6}$/.test(testo)) { r.numero = { numero: Number(testo) }; return r; }
  m = /^it\s*(\d{11})$/i.exec(testo);
  if (m) { r.partitaIva = m[1]; return r; }
  return r;
}

/** "2026/5", "5-2026", "5/26" scritti come li tiene il portale: "5/2026"; "5" da solo resta "5". */
export function chiaveNumero(q: string): string | undefined {
  const n = interpretaRicerca(q).numero;
  return n ? (n.anno ? `${n.numero}/${n.anno}` : String(n.numero)) : undefined;
}

/**
 * Quanto un risultato corrisponde a quel che si è scritto: uguale > comincia così > contiene tutte le parole.
 * Un numero senza anno ("204") è "uguale" a tutti i 204/anno: con più anni si vede l'elenco, non si salta a uno a caso.
 */
export function puntiRisultato(r: RisultatoRicerca, q: string): number {
  const cerca = normalizzaRicerca(q.trim());
  const chiave = normalizzaRicerca(r.chiave ?? r.titolo);
  if (!cerca) return 0;
  const numero = chiaveNumero(q);
  if (chiave === cerca || (numero && (chiave === numero || (!numero.includes('/') && chiave.startsWith(numero + '/'))))) return 100;
  if (chiave.startsWith(cerca)) return 80;
  if (normalizzaRicerca(r.titolo).includes(cerca)) return 60;
  if (corrispondeRicerca(`${r.titolo} ${r.dettaglio ?? ''}`, cerca)) return 40;
  return 10;
}

/** Ordina per corrispondenza e poi per gruppo (clienti, prodotti, commesse…); nei pareggi resta l'ordine di arrivo. */
export function ordinaRisultati(risultati: RisultatoRicerca[], q: string): RisultatoRicerca[] {
  const posto = (t: TipoRisultato) => GRUPPI_RICERCA.findIndex(g => g.tipo === t);
  return risultati
    .map((r, i) => ({ r, i, p: puntiRisultato(r, q) }))
    .sort((a, b) => b.p - a.p || posto(a.r.tipo) - posto(b.r.tipo) || a.i - b.i)
    .map(x => x.r);
}

/** Raggruppa per tipo nell'ordine di GRUPPI_RICERCA (per la pagina dei risultati). */
export function raggruppaRisultati(risultati: RisultatoRicerca[]): { nome: string; tipo: TipoRisultato; voci: RisultatoRicerca[] }[] {
  return GRUPPI_RICERCA.map(g => ({ ...g, voci: risultati.filter(r => r.tipo === g.tipo) })).filter(g => g.voci.length > 0);
}

/**
 * Con un solo risultato (o uno che corrisponde esattamente a quel che si è scritto, es. il numero di una commessa)
 * si va dritti alla pagina senza passare dall'elenco.
 */
export function risultatoDiretto(risultati: RisultatoRicerca[], q: string): RisultatoRicerca | undefined {
  if (risultati.length === 1) return risultati[0];
  const esatti = risultati.filter(r => puntiRisultato(r, q) === 100);
  return esatti.length === 1 ? esatti[0] : undefined;
}

/** Nomi dei documenti nei risultati. */
export const NOME_DOCUMENTO: Record<string, string> = {
  fattura: 'Fattura', nota_credito: 'Nota di credito', nota_debito: 'Nota di debito', ddt: 'DDT', autofattura: 'Autofattura',
  conferma_ordine: 'Conferma d\'ordine', ordine_fornitore: 'Ordine a fornitore',
};
