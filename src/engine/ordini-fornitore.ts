/**
 * Ordini a fornitore (Adriano, 31/10/2026): in Fatture in Cloud se ne fanno circa 20 al mese (n. 204 del 30/10/2026);
 * dal 10/11 si fanno nel portale. Bozza → Emetti (numero della serie "ordine_fornitore" e PDF) → Invia con Gmail →
 * arrivo della merce riga per riga → fattura del fornitore collegata.
 * Dalla BOM quotata (Quotazioni) si preparano in un colpo gli ordini per ogni distributore scelto, con il file per il carrello.
 * Solo calcoli e testi: niente database e niente rete.
 */
import { arrotonda2 } from './amministrazione.js';
import { numeroDa } from './acquisizioni.js';
import type { RigaConferma } from './conferme-ordine.js';

/** Riga dell'ordine a fornitore: come quella della conferma d'ordine, più i pezzi arrivati. */
export interface RigaOrdineFornitore extends RigaConferma { arrivati?: number; arrivati_il?: string | null }

export type StatoArrivo = 'da_ricevere' | 'parziale' | 'arrivato';
export const NOMI_ARRIVO: Record<StatoArrivo, string> = { da_ricevere: 'da ricevere', parziale: 'arrivato in parte', arrivato: 'arrivato' };

/** Stato dell'arrivo della merce: arrivato quando ogni riga ha tutti i pezzi, parziale se ne è arrivata una parte. */
export function statoArrivo(righe: { quantita: number; arrivati?: number | null }[]): StatoArrivo {
  const conPezzi = righe.filter(r => Number(r.quantita) > 0);
  if (!conPezzi.length) return 'da_ricevere';
  const arrivati = conPezzi.map(r => Math.max(0, Number(r.arrivati) || 0));
  if (conPezzi.every((r, i) => arrivati[i] >= Number(r.quantita))) return 'arrivato';
  return arrivati.some(x => x > 0) ? 'parziale' : 'da_ricevere';
}

/** Pezzi arrivati scritti nel modulo: numero da 0 alla quantità ordinata (di più si accetta, con avviso: il fornitore ne ha mandati in più). */
export function arriviDaModulo(input: Record<string, unknown>, righe: { posizione: number; quantita: number; codice: string | null; descrizione: string }[]):
  { arrivi: Map<number, number>; errori: string[]; avvisi: string[] } {
  const arrivi = new Map<number, number>(), errori: string[] = [], avvisi: string[] = [];
  for (const r of righe) {
    // nel modulo le caselle si chiamano arrivati[p1], arrivati[p2]… (con i soli numeri il browser le compatterebbe in un elenco)
    const v = input?.[`p${r.posizione}`] ?? input?.[r.posizione];
    const testo = String(v ?? '').trim();
    if (!testo) continue;
    // scritto a mano: "1.200" sono milleduecento pezzi, la virgola i decimali; un numero arriva già pronto ("Tutto arrivato")
    const n = typeof v === 'number' ? v : (numeroDa(testo) ?? NaN);
    const nome = r.codice ?? r.descrizione;
    if (!Number.isFinite(n) || n < 0) { errori.push(`Riga ${r.posizione} (${nome}): i pezzi arrivati devono essere un numero.`); continue; }
    if (n > r.quantita) avvisi.push(`Riga ${r.posizione} (${nome}): arrivati ${n} pezzi su ${r.quantita} ordinati.`);
    arrivi.set(r.posizione, n);
  }
  return { arrivi, errori, avvisi };
}

/** Controlli prima di emettere: un fornitore in anagrafica e almeno una riga (le date di consegna non sono obbligatorie). */
export function controlliEmissioneOrdine(o: { fornitoreId: number | null }, righe: RigaConferma[]): string[] {
  const errori: string[] = [];
  if (!o.fornitoreId) errori.push('Scegli il fornitore dall\'anagrafica.');
  if (!righe.length) errori.push('Serve almeno una riga.');
  return errori;
}

/**
 * In Fatture in Cloud la numerazione degli ordini a fornitore del 2026 è arrivata al 204 (30/10/2026). Se nel portale
 * parte ancora da 0 il primo ordine prenderebbe il n. 1: avviso per allinearla da Impostazioni → Amministrazione.
 */
export const ULTIMO_ORDINE_FIC_2026 = 204;
export function avvisoNumerazione(anno: number, ultimoNumero: number | null | undefined): string | null {
  if (anno !== 2026 || (ultimoNumero ?? 0) >= ULTIMO_ORDINE_FIC_2026) return null;
  return `La numerazione degli ordini a fornitore 2026 nel portale è al n. ${ultimoNumero ?? 0}, in Fatture in Cloud all'ultimo controllo era al ${ULTIMO_ORDINE_FIC_2026}: `
    + 'il giorno del passaggio scrivi l\'ultimo numero di FIC in Impostazioni → Amministrazione → Numerazioni, prima di emettere.';
}

// ───────────────────────────── dalla BOM quotata ─────────────────────────────

/** Riga della BOM quotata come la legge il portale (solo quello che serve per ordinare). */
export interface RigaBomPerOrdine {
  n: number; pn: string | null; produttore: string | null; designatori: string | null; descrizione: string | null; codiceProduzione: string | null;
  esito?: string; clienteFornisce?: boolean;
  acquisti?: { schede: number; lorda: number; scelta?: { fornitore: string; codice: string; mpn: string; qta: number; prezzo: number; totale: number; disponibile: boolean } }[];
}

export interface GruppoOrdineBom {
  distributore: string;              // digikey, mouser, farnell, tme (o 'manuale' = prezzo scritto a mano: da scegliere)
  righe: RigaConferma[];
  totale: number;
  nonDisponibili: number;            // righe che il distributore non ha in quantità sufficiente
}

/**
 * Righe da ordinare per una quantità di schede della BOM, divise per distributore scelto dal portale (`sceltaMigliore`).
 * Codice = codice del distributore (quello che si mette nel carrello), descrizione = P/N, produttore e riferimenti.
 * Restano fuori le righe non montate, fornite dal cliente o senza prezzo (le conta `senzaPrezzo`).
 */
export function righeOrdineDaBom(righe: RigaBomPerOrdine[], schede: number): { gruppi: GruppoOrdineBom[]; senzaPrezzo: string[] } {
  const gruppi = new Map<string, GruppoOrdineBom>(), senzaPrezzo: string[] = [];
  for (const r of righe) {
    if (r.esito === 'NON MONTATO' || r.esito === 'FORNITO DAL CLIENTE' || r.clienteFornisce) continue;
    const a = (r.acquisti ?? []).find(x => x.schede === schede);
    if (!a) continue;
    const s = a.scelta;
    if (!s || !(s.qta > 0)) { senzaPrezzo.push(r.pn ?? r.codiceProduzione ?? `riga ${r.n}`); continue; }
    const g = gruppi.get(s.fornitore) ?? { distributore: s.fornitore, righe: [], totale: 0, nonDisponibili: 0 };
    const mpn = s.mpn || r.pn || '';
    const descrizione = [mpn, r.produttore, r.codiceProduzione && r.codiceProduzione !== mpn ? `(${r.codiceProduzione})` : '', r.designatori ? `RIF. ${r.designatori}` : '']
      .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().toUpperCase().slice(0, 300);
    g.righe.push({ posizione: g.righe.length + 1, codice: (s.codice || mpn || '').toUpperCase() || null, descrizione: descrizione || `RIGA ${r.n} DELLA BOM`,
      quantita: s.qta, prezzo: s.prezzo, consegna: null, prodotto_id: null, riga_ordine_id: null });
    g.totale = arrotonda2(g.totale + s.qta * s.prezzo);
    if (!s.disponibile) g.nonDisponibili++;
    gruppi.set(s.fornitore, g);
  }
  return { gruppi: [...gruppi.values()].sort((a, b) => b.totale - a.totale), senzaPrezzo };
}

/** Parole con cui si riconosce il distributore nell'anagrafica fornitori (ragione sociale). */
export const NOMI_DISTRIBUTORE: Record<string, string[]> = {
  digikey: ['DIGI-KEY', 'DIGIKEY', 'DIGI KEY'], mouser: ['MOUSER'], farnell: ['FARNELL', 'PREMIER FARNELL'], tme: ['TME', 'TRANSFER MULTISORT'], arrow: ['ARROW'],
};

/**
 * Fornitore dell'anagrafica per un distributore: il primo con il nome che contiene la parola (la lista arriva dal database
 * con prima il fornitore usato più spesso negli ordini, così con più sedi, es. MOUSER ELECTRONICS e MOUSER ELECTRONICS ITALY,
 * si propone quella solita). null se non c'è: l'ufficio lo sceglie a mano.
 */
export function fornitorePerDistributore<T extends { id: number; ragione_sociale: string }>(distributore: string, fornitori: T[]): T | null {
  const parole = NOMI_DISTRIBUTORE[distributore] ?? [];
  const nome = (s: string) => ` ${s.toUpperCase().replace(/[^A-Z0-9-]+/g, ' ')} `;
  return fornitori.find(f => parole.some(p => nome(f.ragione_sociale).includes(` ${p} `))) ?? null;
}

/** File CSV per il carrello del distributore (DigiKey, Mouser, TME e Farnell accettano codice e quantità): codice;quantità;riferimento. */
export function csvCarrello(righe: { codice: string | null; descrizione: string; quantita: number }[], riferimento: string): string {
  const cella = (s: string) => /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  return ['Codice;Quantita;Riferimento', ...righe.filter(r => r.codice).map(r => [r.codice!, String(r.quantita), riferimento].map(cella).join(';'))].join('\r\n') + '\r\n';
}

// ───────────────────────────── email e nomi ─────────────────────────────

const dataIt = (d: string | null | undefined) => (d ? d.split('-').reverse().join('/') : '');

/** Oggetto e testo proposti dell'email al fornitore (l'ufficio li può cambiare prima di inviare). */
export function emailOrdineFornitore(o: { numero: string; data: string; rifFornitore?: string | null; azienda: string; consegna?: string | null }) {
  const offerta = o.rifFornitore ? `, relativo alla vostra offerta ${o.rifFornitore}` : '';
  return {
    oggetto: `Ordine n. ${o.numero} del ${dataIt(o.data)} - ${o.azienda}`,
    testo: `Buongiorno,\n\nin allegato il nostro ordine n. ${o.numero} del ${dataIt(o.data)}${offerta}.\n`
      + `${o.consegna ? `Consegna richiesta: ${dataIt(o.consegna)}.\n` : ''}Vi chiediamo di confermarci prezzi e data di consegna.\n\nCordiali saluti\n\n${o.azienda}`,
  };
}

/** Nome del file PDF: Ordine_fornitore_205_2026_FORNITORE.pdf (solo lettere, numeri e trattini bassi). */
export function nomeFilePdfOrdine(numero: number | null, anno: number, fornitore: string): string {
  const pulito = fornitore.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
  return `Ordine_fornitore_${numero ?? 'bozza'}_${anno}${pulito ? `_${pulito}` : ''}.pdf`;
}
