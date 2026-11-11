/**
 * Collegamento riga d'ordine del cliente → preventivo (Adriano 11/11/2026).
 * "In Ordini clienti manca il collegamento al preventivo fatto (del vecchio portale o nuovo). Se non lo trova, un menu a tendina
 * con tutti i preventivi del cliente. Agganciato ordine/preventivo, ci si collega la commessa."
 *
 * Il portale propone da solo il preventivo (`propostaPreventivo`):
 *   1. stesso prodotto dell'anagrafica (preventivo → revisione → prodotto);
 *   2. altrimenti stesso codice scritto nel preventivo (intestazione), senza spazi/trattini/punti: i preventivi del vecchio portale
 *      spesso non sono collegati all'anagrafica perché lì i codici erano scritti in modo diverso;
 * a parità di codice vince la QUANTITÀ preventivata più vicina a quella dell'ordine (Adriano 11/11/2026: "possono esserci gli stessi codici
 * ripetuti con quantità diverse"); a pari quantità gli inviati/accettati sulle bozze, poi i fatti prima dell'ordine (al più 7 giorni dopo), poi il più recente. Il collegamento si salva solo con "Salva" dell'ordine: la proposta si vede preselezionata.
 */

export interface CandidatoPreventivo {
  id: number;
  numero: string;
  clienteId: number | null;
  prodottoId: number | null;
  /** codice scritto nel preventivo (intestazione.codice) */
  codice: string | null;
  descrizione?: string | null;
  stato: string;
  origine: string;
  nSchede: number;
  /** prezzo a scheda senza una tantum (scritto a mano nella stampa se c'è) */
  prezzoScheda: number | null;
  /** data di creazione aaaa-mm-gg */
  data: string;
}

export interface RigaDaCollegare {
  prodottoId: number | null;
  codici: (string | null | undefined)[];
  quantita: number;
  /** data dell'ordine aaaa-mm-gg */
  dataOrdine: string | null;
}

/** Codice senza spazi, trattini, punti e barre, in maiuscolo: "EA-1002.0" = "EA10020". */
export const codiceNormale = (s: string | null | undefined) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const piuGiorni = (data: string, giorni: number) => {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + giorni);
  return d.toISOString().slice(0, 10);
};

/** Preventivi dello stesso prodotto o con lo stesso codice scritto: prima lo stesso prodotto. */
export function preventiviDellaRiga(riga: RigaDaCollegare, candidati: CandidatoPreventivo[]): { candidati: CandidatoPreventivo[]; motivo: 'prodotto' | 'codice' | null } {
  if (riga.prodottoId) {
    const stessi = candidati.filter(c => c.prodottoId === riga.prodottoId);
    if (stessi.length) return { candidati: stessi, motivo: 'prodotto' };
  }
  const codici = new Set(riga.codici.map(codiceNormale).filter(c => c.length >= 3));
  if (codici.size) {
    const stessi = candidati.filter(c => codici.has(codiceNormale(c.codice)));
    if (stessi.length) return { candidati: stessi, motivo: 'codice' };
  }
  return { candidati: [], motivo: null };
}

/** Il preventivo da proporre per la riga d'ordine, o null se nessuno ha lo stesso prodotto o codice. */
export function propostaPreventivo(riga: RigaDaCollegare, candidati: CandidatoPreventivo[]): { id: number; motivo: 'prodotto' | 'codice' } | null {
  const { candidati: trovati, motivo } = preventiviDellaRiga(riga, candidati);
  if (!trovati.length || !motivo) return null;
  const limite = riga.dataOrdine ? piuGiorni(riga.dataOrdine, 7) : null;
  const punteggio = (c: CandidatoPreventivo) => [
    ['inviato', 'accettato'].includes(c.stato) ? 1 : 0,
    !limite || c.data <= limite ? 1 : 0,
  ];
  const ordinati = [...trovati].sort((a, b) => {
    const da = Math.abs(a.nSchede - riga.quantita), db = Math.abs(b.nSchede - riga.quantita);
    if (da !== db) return da - db;
    const pa = punteggio(a), pb = punteggio(b);
    for (let i = 0; i < pa.length; i++) if (pa[i] !== pb[i]) return pb[i] - pa[i];
    return b.data.localeCompare(a.data);
  });
  return { id: ordinati[0].id, motivo };
}

const euroBreve = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const dataBreve = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/** Testo della voce nel menu: "P2025-1916 · EA1002 · 100 pz · 12,34 €/scheda · 03/04/2025 (vecchio portale)". */
export function etichettaPreventivo(c: CandidatoPreventivo): string {
  return [c.numero, c.codice || '(senza codice)', `${c.nSchede} pz`, c.prezzoScheda != null ? `${euroBreve(c.prezzoScheda)} €/scheda` : null,
    dataBreve(c.data) + (c.origine === 'vecchio_portale' ? ' (vecchio portale)' : c.stato === 'bozza' ? ' (bozza)' : '')]
    .filter(Boolean).join(' · ');
}
