/**
 * Fattura del fornitore da leggere (Adriano 10/11/2026, "in fatture fornitori non c'è la possibilità di visualizzare la fattura per capire
 * che cos'è"): dall'XML FatturaPA i dati che servono a una persona (fornitore, righe, riepilogo IVA, pagamento, DDT e ordini citati,
 * causale) e l'elenco degli allegati (spesso il PDF del fornitore), senza database.
 */
import { leggiXml, trova, tutti, type Nodo } from './fattura-ricevuta.js';
import { righeFattureDaXml, type RigaFatturaXml } from './righe-fattura.js';

const t = (n: Nodo | undefined, percorso: string) => (trova(n, percorso)?.testo ?? '').replace(/\s+/g, ' ').trim();
const dataIt = (s: string) => /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10).split('-').reverse().join('/') : s;
const unici = (a: string[]) => [...new Set(a.filter(Boolean))];
const num = (s: string): number | null => { if (!s) return null; const v = Number(s); return Number.isFinite(v) ? v : null; };

export const TIPI_DOCUMENTO: Record<string, string> = {
  TD01: 'Fattura', TD02: 'Acconto su fattura', TD04: 'Nota di credito', TD05: 'Nota di debito', TD06: 'Parcella',
  TD16: 'Integrazione reverse charge interno', TD17: 'Autofattura servizi dall\'estero', TD18: 'Autofattura beni UE', TD19: 'Autofattura beni art. 17',
  TD20: 'Autofattura', TD24: 'Fattura differita', TD25: 'Fattura differita (triangolare)', TD26: 'Cessione beni ammortizzabili', TD27: 'Autoconsumo',
};
export const MODALITA_PAGAMENTO: Record<string, string> = {
  MP01: 'Contanti', MP02: 'Assegno', MP03: 'Assegno circolare', MP05: 'Bonifico', MP06: 'Vaglia cambiario', MP08: 'Carta di pagamento',
  MP09: 'RID', MP10: 'RID utenze', MP11: 'RID veloce', MP12: 'RiBa', MP13: 'MAV', MP15: 'Giroconto', MP16: 'Domiciliazione bancaria',
  MP17: 'Domiciliazione postale', MP19: 'SEPA Direct Debit', MP21: 'SEPA Direct Debit B2B', MP22: 'Trattenuta su somme già riscosse', MP23: 'PagoPA',
};

export interface AllegatoFattura { n: number; nome: string; formato: string; descrizione: string; byte: number }
export interface FatturaLeggibile {
  fornitore: { nome: string; partitaIva: string; indirizzo: string };
  tipo: string; numero: string; data: string; valuta: string; totale: number | null; causale: string[];
  righe: RigaFatturaXml[];
  riepilogo: { aliquota: number | null; natura: string; imponibile: number | null; imposta: number | null; norma: string }[];
  pagamenti: { modalita: string; scadenza: string; importo: number | null; iban: string; istituto: string }[];
  ddt: string[]; ordini: string[]; allegati: AllegatoFattura[];
}

const nomeSoggetto = (n: Nodo | undefined) => t(n, 'Anagrafica/Denominazione') || [t(n, 'Anagrafica/Nome'), t(n, 'Anagrafica/Cognome')].filter(Boolean).join(' ');

/** Primo corpo della fattura (un file può contenerne più d'uno: si mostra il primo, è quasi sempre l'unico). */
export function fatturaLeggibile(xml: string): FatturaLeggibile {
  const doc = leggiXml(xml);
  const cedente = trova(doc, 'CedentePrestatore');
  const corpo = trova(doc, 'FatturaElettronicaBody');
  const gen = trova(corpo, 'DatiGenerali/DatiGeneraliDocumento');
  const sede = trova(cedente, 'Sede');
  const piva = `${t(cedente, 'DatiAnagrafici/IdFiscaleIVA/IdPaese')}${t(cedente, 'DatiAnagrafici/IdFiscaleIVA/IdCodice')}` || t(cedente, 'DatiAnagrafici/CodiceFiscale');
  const tipo = t(gen, 'TipoDocumento');
  return {
    fornitore: { nome: nomeSoggetto(trova(cedente, 'DatiAnagrafici')), partitaIva: piva,
      indirizzo: [t(sede, 'Indirizzo'), t(sede, 'NumeroCivico'), t(sede, 'CAP'), t(sede, 'Comune'), t(sede, 'Provincia') ? `(${t(sede, 'Provincia')})` : '', t(sede, 'Nazione')].filter(Boolean).join(' ') },
    tipo: TIPI_DOCUMENTO[tipo] ? `${TIPI_DOCUMENTO[tipo]} (${tipo})` : tipo,
    numero: t(gen, 'Numero'), data: t(gen, 'Data'), valuta: t(gen, 'Divisa') || 'EUR', totale: num(t(gen, 'ImportoTotaleDocumento')),
    causale: tutti(gen, 'Causale').map(c => c.testo.replace(/\s+/g, ' ').trim()).filter(Boolean),
    righe: righeFattureDaXml(xml)[0] ?? [],
    riepilogo: tutti(trova(corpo, 'DatiBeniServizi'), 'DatiRiepilogo').map(r => ({ aliquota: num(t(r, 'AliquotaIVA')), natura: t(r, 'Natura'),
      imponibile: num(t(r, 'ImponibileImporto')), imposta: num(t(r, 'Imposta')), norma: t(r, 'RiferimentoNormativo') })),
    pagamenti: tutti(corpo, 'DettaglioPagamento').map(p => ({ modalita: MODALITA_PAGAMENTO[t(p, 'ModalitaPagamento')] ?? t(p, 'ModalitaPagamento'),
      scadenza: t(p, 'DataScadenzaPagamento'), importo: num(t(p, 'ImportoPagamento')), iban: t(p, 'IBAN'), istituto: t(p, 'IstitutoFinanziario') })),
    ddt: unici(tutti(trova(corpo, 'DatiGenerali'), 'DatiDDT').map(d => [t(d, 'NumeroDDT'), dataIt(t(d, 'DataDDT'))].filter(Boolean).join(' del '))),
    ordini: unici(tutti(trova(corpo, 'DatiGenerali'), 'DatiOrdineAcquisto').map(d => [t(d, 'IdDocumento'), dataIt(t(d, 'Data'))].filter(Boolean).join(' del '))),
    allegati: tutti(corpo, 'Allegati').map((a, i) => ({ n: i + 1, nome: t(a, 'NomeAttachment') || `allegato-${i + 1}`, formato: t(a, 'FormatoAttachment'),
      descrizione: t(a, 'DescrizioneAttachment'), byte: Math.floor((trova(a, 'Attachment')?.testo ?? '').replace(/\s+/g, '').length * 3 / 4) })),
  };
}

/** Allegato n (da 1) dell'XML: nome e contenuto. */
export function allegatoFattura(xml: string, n: number): { nome: string; tipo: string; dati: Buffer } | null {
  const a = tutti(trova(leggiXml(xml), 'FatturaElettronicaBody'), 'Allegati')[n - 1];
  if (!a) return null;
  const nome = (t(a, 'NomeAttachment') || `allegato-${n}`).replace(/[^\w.\- ]+/g, '_');
  const formato = (t(a, 'FormatoAttachment') || nome.split('.').pop() || '').toLowerCase();
  const tipo = formato.includes('pdf') || /\.pdf$/i.test(nome) ? 'application/pdf' : /^(png|jpe?g|gif)$/.test(formato) ? `image/${formato.replace('jpg', 'jpeg')}` : 'application/octet-stream';
  return { nome, tipo, dati: Buffer.from((trova(a, 'Attachment')?.testo ?? '').replace(/\s+/g, ''), 'base64') };
}
