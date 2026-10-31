/**
 * Spunte e pulsanti nell'elenco dei documenti emessi (Adriano 31/10/2026: "in tutti i documenti emessi manca l'opzione elimina o altro
 * con la casella di spunta a sinistra della riga"). Qui le regole: quali pulsanti per ogni tipo di documento e quali righe spuntate
 * vanno bene per ogni pulsante. Il resto (database, pagine) sta in `server/azioni-documenti-servizio.ts` e `rotte/amministrazione.ts`.
 *
 * Regole fiscali che non cambiano: si eliminano SOLO le bozze senza numero (la numerazione resta senza buchi); una fattura o nota di
 * credito emessa si storna con una nota di credito; un DDT emesso che non è partito si annulla (il numero resta usato);
 * i documenti dello storico di Fatture in Cloud non si toccano.
 */

export type TipoDocumentoElenco = 'fattura' | 'nota_credito' | 'autofattura' | 'ddt';

/** Il minimo di un documento dell'elenco che serve per decidere. */
export interface DocumentoElenco {
  id: number;
  tipo: string;
  numero: number | null;
  stato: string;
  origine: string;
  cliente_id?: number | null;
  fattura_id?: number | null;
  ha_xml?: boolean;
}

export interface PulsanteDocumenti {
  azione: AzioneDocumenti; testo: string; serve: '1' | '1+'; titolo?: string; pericolo?: boolean; chiedi?: string; nuovaScheda?: boolean;
}

export type AzioneDocumenti = 'stampa' | 'xml' | 'excel' | 'incassa' | 'duplica' | 'nota_credito' | 'fattura_ddt' | 'annulla' | 'elimina';

const P: Record<AzioneDocumenti, PulsanteDocumenti> = {
  stampa: { azione: 'stampa', testo: 'Stampa / PDF', serve: '1', nuovaScheda: true, titolo: 'Apre la stampa del documento spuntato (da salvare in PDF)' },
  xml: { azione: 'xml', testo: 'Scarica XML', serve: '1+', titolo: 'I file XML dei documenti emessi spuntati (più di uno: in un file zip)' },
  excel: { azione: 'excel', testo: 'Excel', serve: '1+', titolo: "Elenco dei documenti spuntati in un file Excel" },
  incassa: { azione: 'incassa', testo: 'Segna incassate', serve: '1+', titolo: 'Segna incassate le rate ancora aperte delle fatture spuntate (scegli data e modo nella pagina dopo)' },
  duplica: { azione: 'duplica', testo: 'Duplica', serve: '1', titolo: 'Nuova bozza con lo stesso cliente e le stesse righe (senza DDT e acconti)' },
  nota_credito: { azione: 'nota_credito', testo: 'Crea nota di credito', serve: '1', titolo: 'Storna la fattura emessa spuntata' },
  fattura_ddt: { azione: 'fattura_ddt', testo: 'Fattura i DDT', serve: '1+', titolo: 'Una fattura (bozza) con i DDT emessi spuntati dello stesso cliente' },
  annulla: { azione: 'annulla', testo: 'Annulla DDT', serve: '1+', pericolo: true, titolo: 'Per i DDT emessi la cui merce non è partita: il numero resta usato',
    chiedi: 'Annullare {n} DDT? Il numero resta usato e il DDT resta nell\'elenco come annullato.' },
  elimina: { azione: 'elimina', testo: 'Elimina', serve: '1+', pericolo: true, titolo: 'Si eliminano solo le bozze: i documenti emessi restano (si stornano o si annullano)',
    chiedi: 'Eliminare {n} document{o|i}? Si eliminano solo le bozze: quelli già emessi restano come sono.' },
};

/** Pulsanti in alto a destra secondo il tipo di documento dell'elenco. */
export function pulsantiDocumenti(tipo: string): PulsanteDocumenti[] {
  const a: AzioneDocumenti[] = tipo === 'fattura' ? ['stampa', 'xml', 'excel', 'incassa', 'duplica', 'nota_credito', 'elimina']
    : tipo === 'nota_credito' ? ['stampa', 'xml', 'excel', 'elimina']
    : tipo === 'autofattura' ? ['xml', 'excel', 'elimina']
    : tipo === 'ddt' ? ['stampa', 'excel', 'fattura_ddt', 'annulla', 'elimina']
    : ['excel'];
  return a.map(x => P[x]);
}

const emesso = (d: DocumentoElenco) => d.numero != null && !['bozza', 'annullato', 'scartato'].includes(d.stato);

/** Perché un documento non si elimina (null = è una bozza e si elimina). */
export function motivoNonEliminabile(d: DocumentoElenco): string | null {
  if (d.origine === 'fic') return 'viene dallo storico di Fatture in Cloud';
  if (d.stato === 'bozza' && d.numero == null) return null;
  if (d.stato === 'bozza') return 'ha già il numero (scartato e riaperto): si corregge e si riemette';
  if (d.tipo === 'ddt') return d.stato === 'annullato' ? 'è già annullato' : 'è emesso: se la merce non è partita si annulla';
  if (d.stato === 'annullato') return 'è annullato';
  return d.tipo === 'autofattura' ? 'è emessa: i documenti emessi non si eliminano' : 'è emesso: si storna con una nota di credito';
}

/** Perché un documento non va bene per il pulsante (null = va bene). */
export function motivoEscluso(azione: AzioneDocumenti, d: DocumentoElenco): string | null {
  switch (azione) {
    case 'elimina': return motivoNonEliminabile(d);
    case 'stampa': return ['fattura', 'nota_credito', 'ddt'].includes(d.tipo) ? null : 'non ha la stampa';
    case 'excel': return null;
    case 'xml': return d.ha_xml ? null : d.stato === 'bozza' ? 'è una bozza (l\'XML nasce con Emetti)' : 'non ha il file XML';
    case 'incassa': return d.tipo === 'fattura' && emesso(d) ? null : 'non è una fattura emessa';
    case 'duplica': return d.tipo === 'fattura' && d.cliente_id ? null : 'si duplicano solo le fatture con il cliente in anagrafica';
    case 'nota_credito': return d.tipo === 'fattura' && d.numero != null && d.stato !== 'annullato' ? null : 'si storna solo una fattura emessa';
    case 'fattura_ddt':
      if (d.tipo !== 'ddt' || d.stato !== 'emesso') return 'non è un DDT emesso';
      if (d.fattura_id) return 'è già fatturato';
      return d.cliente_id ? null : 'non ha il cliente in anagrafica';
    case 'annulla':
      if (d.tipo !== 'ddt' || d.origine !== 'portale') return 'si annullano solo i DDT emessi dal portale';
      if (d.stato !== 'emesso') return d.stato === 'bozza' ? 'è una bozza (si elimina)' : 'non è emesso';
      return d.fattura_id ? 'è già in una fattura' : null;
  }
}

/** Divide le righe spuntate: quelle su cui il pulsante agisce e quelle escluse, con il motivo. */
export function dividiPerAzione<T extends DocumentoElenco>(azione: AzioneDocumenti, docs: T[]): { si: T[]; no: { doc: T; motivo: string }[] } {
  const si: T[] = [], no: { doc: T; motivo: string }[] = [];
  for (const d of docs) { const m = motivoEscluso(azione, d); if (m) no.push({ doc: d, motivo: m }); else si.push(d); }
  return { si, no };
}

/** DDT da fatturare insieme: tutti dello stesso cliente (una fattura è per un cliente solo). */
export function controlloDdtStessoCliente(docs: DocumentoElenco[]): string | null {
  const clienti = new Set(docs.map(d => d.cliente_id));
  return clienti.size > 1 ? 'I DDT spuntati sono di clienti diversi: una fattura è per un cliente solo, spunta i DDT di un cliente per volta.' : null;
}

/** "fattura 12, bozza" per i messaggi. */
export const nomeDocumento = (d: Pick<DocumentoElenco, 'numero'> & { etichetta?: string }) => d.etichetta ?? (d.numero == null ? 'bozza' : `n. ${d.numero}`);

/** Le righe escluse, in una frase: "n. 12: è emesso: si storna con una nota di credito; bozza: …" (al massimo 5, poi "e altri N"). */
export function frasiEscluse(no: { doc: DocumentoElenco & { etichetta?: string }; motivo: string }[]): string {
  if (!no.length) return '';
  const elenco = no.slice(0, 5).map(x => `${nomeDocumento(x.doc)} ${x.motivo}`).join('; ');
  return `Non toccat${no.length === 1 ? 'o' : 'i'}: ${elenco}${no.length > 5 ? ` e altri ${no.length - 5}` : ''}.`;
}
