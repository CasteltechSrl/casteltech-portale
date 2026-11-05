/**
 * Codici alternativi da far confermare al cliente (Adriano 5/11/2026): "nel momento in cui prospettiamo delle alternative, sulla stampa
 * del preventivo deve comparire che rispetto alla BOM sono state individuate delle alternative da confermare", con l'elenco in un
 * foglio a parte in coda al preventivo.
 * Dalla BOM quotata collegata si prendono le righe in cui si compra un codice diverso da quello della BOM: alternativa scelta
 * dall'ufficio (`alternativaScelta`) o proposta dal portale per dare il prezzo (`alternativaProposta`). Per il cliente sono tutte
 * da confermare, anche quelle che l'ufficio ha già accettato. Stessa coppia P/N della BOM → alternativa su più righe = una riga sola
 * con tutti i riferimenti (le BOM ripetono lo stesso codice).
 */
export interface RigaPerAlternativa {
  pn: string | null; produttore?: string | null; designatori: string | null; valore?: string | null; descrizioneBom?: string | null;
  descrizione?: string | null; qtaScheda?: number; esito?: string; clienteFornisce?: boolean;
  alternativaScelta?: string | null; alternativaProposta?: string | null;
  alternative?: { mpn: string; produttore?: string; descrizione?: string }[];
}

export interface AlternativaDaConfermare {
  pnBom: string; produttoreBom: string; alternativa: string; produttoreAlternativa: string; descrizione: string;
  riferimenti: string; qtaScheda: number;
}

const pulito = (s: unknown) => String(s ?? '').trim();
const chiave = (s: string) => s.toUpperCase().replace(/[\s\-_.]/g, '');

export function alternativeDaConfermare(righe: RigaPerAlternativa[], nonMontato = 'NON MONTATO'): AlternativaDaConfermare[] {
  const perCoppia = new Map<string, AlternativaDaConfermare & { rif: string[] }>();
  for (const r of righe ?? []) {
    if (r.esito === nonMontato || r.clienteFornisce) continue;
    const alt = pulito(r.alternativaScelta || r.alternativaProposta);
    const pn = pulito(r.pn);
    if (!alt || (pn && chiave(pn) === chiave(alt))) continue;
    const dati = r.alternative?.find(x => chiave(x.mpn) === chiave(alt));
    const k = `${chiave(pn || pulito(r.valore) || pulito(r.descrizioneBom))}|${chiave(alt)}`;
    const rif = pulito(r.designatori).split(/[\s,;]+/).filter(Boolean);
    const gia = perCoppia.get(k);
    if (gia) {
      for (const x of rif) if (!gia.rif.includes(x)) gia.rif.push(x);
      gia.qtaScheda += Number(r.qtaScheda) || 0;
      continue;
    }
    perCoppia.set(k, {
      pnBom: pn || pulito(r.valore) || pulito(r.descrizioneBom) || 'senza P/N', produttoreBom: pulito(r.produttore),
      alternativa: alt, produttoreAlternativa: pulito(dati?.produttore),
      descrizione: pulito(dati?.descrizione) || pulito(r.descrizione) || pulito(r.descrizioneBom),
      riferimenti: '', qtaScheda: Number(r.qtaScheda) || 0, rif,
    });
  }
  return [...perCoppia.values()].map(({ rif, ...x }) => ({ ...x, riferimenti: rif.join(', ') }));
}

/**
 * Componenti con problemi di acquisto da segnalare al cliente nello stesso foglio (Adriano 5/11/2026: "inserisci anche eventuali componenti
 * non trovati, per codice o disponibilità, e qualsiasi tipo di anomalia lato acquisti"). Righe della BOM da comprare, senza alternativa
 * (quelle sono già nell'altro elenco) e senza prezzo scritto a mano (= problema risolto dall'ufficio). Testi per il cliente, senza le
 * istruzioni interne del portale ("premi Aggiorna prezzi").
 */
export interface RigaPerProblema extends RigaPerAlternativa {
  prezzoManuale?: number | null;
  acquisti?: { scelta?: { disponibile: boolean } }[];
  reperibilita?: { livello: string; motivi?: string[] };
}
export interface ComponenteDaVerificare {
  codice: string; produttore: string; descrizione: string; riferimenti: string; qtaScheda: number;
  /** cosa c'è che non va, in parole per il cliente */
  problema: string;
  /** false = non compreso nel prezzo del preventivo */
  quotato: boolean;
}

const FINE_VITA = /fine vita|obsolet|discontinued|end of life|eol|nrnd|not recommended|last time buy/i;

export function problemaAcquisto(r: RigaPerProblema): { problema: string; quotato: boolean } | null {
  const acq = r.acquisti ?? [];
  const senzaPrezzo = !acq.length || acq.some(x => !x.scelta);
  const motivi = (r.reperibilita?.motivi ?? []).filter(m => !/premi|non ha risposto/i.test(m));
  if (senzaPrezzo && !pulito(r.pn)) return { problema: 'Codice del componente non indicato nella BOM: non quotato', quotato: false };
  if (senzaPrezzo) return { problema: 'Codice non trovato presso i distributori: non quotato', quotato: false };
  if (r.reperibilita?.livello === 'critico' || acq.some(x => x.scelta && !x.scelta.disponibile)) {
    const dettaglio = motivi.find(m => /pz/.test(m));
    return { problema: `Non disponibile nella quantità richiesta${dettaglio ? ` (${dettaglio.replace(/^non disponibile da nessuna parte: /, '')})` : ''}: prezzo e consegna da riconfermare`, quotato: true };
  }
  if (r.reperibilita?.livello === 'attenzione') {
    const dettaglio = motivi.find(m => /distributor/i.test(m));
    return { problema: `Disponibilità da riconfermare al momento dell'ordine${dettaglio ? ` (${dettaglio})` : ''}`, quotato: true };
  }
  if (motivi.some(m => FINE_VITA.test(m))) return { problema: 'Componente a fine vita o non consigliato per nuovi progetti: consigliamo di valutare un sostituto', quotato: true };
  return null;
}

export function componentiDaVerificare(righe: RigaPerProblema[], nonMontato = 'NON MONTATO'): ComponenteDaVerificare[] {
  const perCodice = new Map<string, ComponenteDaVerificare & { rif: string[] }>();
  for (const r of righe ?? []) {
    if (r.esito === nonMontato || r.clienteFornisce || (r.prezzoManuale != null && r.prezzoManuale >= 0)) continue;
    if (pulito(r.alternativaScelta || r.alternativaProposta)) continue;
    const p = problemaAcquisto(r);
    if (!p) continue;
    const codice = pulito(r.pn) || pulito(r.valore) || pulito(r.descrizioneBom) || 'senza codice';
    const k = `${chiave(codice)}|${p.problema}`;
    const rif = pulito(r.designatori).split(/[\s,;]+/).filter(Boolean);
    const gia = perCodice.get(k);
    if (gia) { for (const x of rif) if (!gia.rif.includes(x)) gia.rif.push(x); gia.qtaScheda += Number(r.qtaScheda) || 0; continue; }
    perCodice.set(k, { codice, produttore: pulito(r.produttore), descrizione: pulito(r.descrizione) || pulito(r.descrizioneBom),
      riferimenti: '', qtaScheda: Number(r.qtaScheda) || 0, ...p, rif });
  }
  // prima i non quotati
  return [...perCodice.values()].map(({ rif, ...x }) => ({ ...x, riferimenti: rif.join(', ') })).sort((a, b) => Number(a.quotato) - Number(b.quotato));
}

/** Nome del foglio in coda al preventivo (anche nelle condizioni generali). */
export const FOGLIO_COMPONENTI = 'Componenti: alternative da confermare e problemi di acquisto';

/** Frase stampata sotto le righe del preventivo quando ci sono alternative da confermare o componenti con problemi di acquisto. */
export function fraseAlternative(n: number, problemi = 0): string {
  if (!n && !problemi) return '';
  const parti = [
    n ? `${n === 1 ? 'è stato individuato 1 codice alternativo' : `sono stati individuati ${n} codici alternativi`} da confermare` : '',
    problemi ? `${problemi === 1 ? '1 componente ha' : `${problemi} componenti hanno`} problemi di acquisto (non trovati o con disponibilità da verificare)` : '',
  ].filter(Boolean);
  return `Rispetto alla BOM ${parti.join(' e ')}: l'elenco è nel foglio "${FOGLIO_COMPONENTI}" in fondo al preventivo.`
    + (n ? ' I codici alternativi li acquistiamo solo dopo la vostra conferma.' : '');
}
