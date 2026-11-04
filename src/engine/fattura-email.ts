/**
 * Fattura e nota di credito di cortesia per email (Adriano 4/11/2026, "come per i preventivi"): PDF di cortesia allegato
 * (pdf-fattura.ts, stessi dati della stampa dal browser), parte da amministrazione@ (`mittentePer('fattura')`).
 * Il documento fiscale resta l'XML mandato allo SdI: l'email è solo una copia per il cliente. Qui solo le regole, niente database.
 */
import { numeroCompleto } from './amministrazione.js';

const dataIt = (d: string | Date | null | undefined) => {
  if (!d) return '';
  const x = d instanceof Date ? d : new Date(String(d).length === 10 ? `${d}T12:00:00` : String(d));
  return Number.isNaN(x.getTime()) ? '' : x.toLocaleDateString('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric' });
};
/** 1.220,00 € (con il punto delle migliaia anche sotto 10.000, come nel resto del portale) */
const euroIt = (n: number) => {
  const [intero, dec] = Math.abs(n).toFixed(2).split('.');
  return `${n < 0 ? '−' : ''}${intero.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec} €`;
};

/** Tipi che si mandano come copia di cortesia (le autofatture no: sono documenti nostri verso noi stessi). */
export const TIPI_CORTESIA = ['fattura', 'nota_credito'];

/** Nome del documento nell'email e nel PDF: "fattura", "nota di credito", "nota di debito", "fattura d'acconto". */
export function nomeDocumento(tipo: string, tipoSdi?: string | null): string {
  if (tipo === 'nota_credito') return 'nota di credito';
  if (tipoSdi === 'TD05') return 'nota di debito';
  if (tipoSdi === 'TD02') return "fattura d'acconto";
  return 'fattura';
}

/** Si può mandare: fattura o nota di credito emessa dal portale, con numero, non annullata né scartata. Null = sì, altrimenti il motivo. */
export function bloccoInvioCortesia(d: { tipo: string; numero?: number | string | null; stato?: string | null; origine?: string | null }): string | null {
  if (!TIPI_CORTESIA.includes(d.tipo)) return 'Per email si mandano solo fatture e note di credito.';
  if (d.origine === 'fic') return 'Documento di Fatture in Cloud: la copia di cortesia è stata mandata da lì.';
  if (d.numero == null || d.stato === 'bozza') return 'Emetti prima il documento: la bozza non si manda.';
  if (d.stato === 'annullato' || d.stato === 'scartato') return 'Documento annullato o scartato dallo SdI: correggilo e riemettilo prima di mandarlo.';
  return null;
}

/**
 * Indirizzo proposto, nell'ordine: l'email per fatture e DDT dell'anagrafica del cliente (anche più indirizzi), quello a cui è stata mandata
 * l'ultima fattura dello stesso cliente, l'email del CRM. La PEC no: la fattura vera ci arriva già dallo SdI. Vuoto = da scrivere.
 */
export function destinatarioFattura(c: { amministrazione?: string | null; ultimaFattura?: string | null; crm?: string | null }): string {
  for (const x of [c.amministrazione, c.ultimaFattura, c.crm]) if (x && /@/.test(x)) return x.trim();
  return '';
}

/** Oggetto e testo proposti; con le scadenze ancora da incassare, l'elenco e l'IBAN per il bonifico. */
export function emailFattura(o: { tipo: string; tipoSdi?: string | null; numero: number | string; sezionale?: string | null; data: string | Date; azienda: string;
  totale: number; scadenze?: { data: string | Date; importo: number }[]; iban?: string | null }) {
  const nome = nomeDocumento(o.tipo, o.tipoSdi);
  const n = numeroCompleto(Number(o.numero), o.sezionale ?? '');
  const Nome = nome.charAt(0).toUpperCase() + nome.slice(1);
  const scad = (o.scadenze ?? []).filter(s => Number(s.importo) > 0);
  const pagamento = o.tipo === 'nota_credito' ? '' : scad.length
    ? `\n${scad.length === 1 ? 'Scadenza' : 'Scadenze'}: ${scad.map(s => `${dataIt(s.data)} ${euroIt(Number(s.importo))}`).join(', ')}.${o.iban ? `\nIBAN per il bonifico: ${o.iban}` : ''}\n`
    : '';
  return {
    oggetto: `${Nome} n. ${n} del ${dataIt(o.data)} - ${o.azienda}`,
    testo: `Buongiorno,\n\nin allegato la copia di cortesia della nostra ${nome} n. ${n} del ${dataIt(o.data)}, totale ${euroIt(Number(o.totale) || 0)}.\n`
      + `Il documento fiscale è il file XML trasmesso al Sistema di Interscambio.\n${pagamento}\nCordiali saluti\n\n${o.azienda}`,
  };
}

/** Nome del file PDF: Fattura_126_2026_CLIENTE.pdf / Nota_di_credito_5_2026_CLIENTE.pdf. */
export function nomeFilePdfFattura(tipo: string, tipoSdi: string | null | undefined, numero: string | number | null, anno: number, cliente: string): string {
  const pulito = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const nome = pulito(nomeDocumento(tipo, tipoSdi));
  const n = numero == null ? 'bozza' : pulito(String(numero));
  const c = pulito(cliente).slice(0, 40);
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)}_${n}_${anno}${c ? `_${c}` : ''}.pdf`;
}
