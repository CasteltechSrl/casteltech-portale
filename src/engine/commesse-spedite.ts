/**
 * Commesse già spedite (Adriano 11/11/2026: "THS è già stato spedito, perché rimane nelle commesse?").
 * Il DDT spesso nasce dall'ordine o da "+ Nuovo DDT", non dalla commessa: il collegamento diretto manca.
 * Le schede spedite di una commessa si contano così (solo calcoli, in lettura, niente tabelle nuove):
 *  1. righe di DDT emessi collegate alla commessa (`documenti_righe.commessa_id`, riga d'ordine con `commessa_id`,
 *     oppure `documenti.commessa_id` se la riga è dello stesso prodotto della commessa);
 *  2. le altre righe di DDT dello stesso cliente e stesso prodotto (o stesso codice), datate dal giorno della commessa in poi
 *     (i DDT di prima sono lotti precedenti dello stesso ordine), si dividono tra le commesse ancora da spedire: prima quelle con la lavorazione finita
 *     (rientrate o con "fine lavorazione"), poi le più vecchie; mai oltre la quantità della commessa.
 * Spedita = schede spedite ≥ quantità, oppure lavorazione finita e spedite almeno il 90 % (il resto sono scarti o schede in più).
 */

export interface CommessaPerSpedizione {
  id: number; clienteId: number | null; prodottoId: number | null; codice: string | null; quantita: number;
  stato: string; dataInizio: string | null; finite: number;
}
export interface RigaDdtSpedita {
  ddtId: number; numero: number | null; data: string; clienteId: number | null; prodottoId: number | null; codice: string | null;
  quantita: number; commessaRiga: number | null; commessaDocumento: number | null; commessaRigaOrdine: number | null;
}
export interface SpedizioneCommessa { spedite: number; spedita: boolean; ddt: { id: number; numero: number | null; quantita: number }[] }

/** Stati in cui la lavorazione è finita (rientro confermato). */
export const STATI_FINITI = ['rientrata', 'analizzata', 'chiusa'];
/** Quota delle schede che basta spedire, a lavorazione finita, per considerare la commessa spedita. */
export const QUOTA_SPEDITA = 0.9;

const normale = (s: string | null | undefined) => String(s ?? '').toUpperCase().replace(/[\s\-_.]/g, '');
const lavorazioneFinita = (c: CommessaPerSpedizione) => STATI_FINITI.includes(c.stato) || (c.finite > 0 && c.finite >= c.quantita);
const stessoProdotto = (c: CommessaPerSpedizione, r: RigaDdtSpedita) =>
  (c.prodottoId != null && r.prodottoId != null) ? c.prodottoId === r.prodottoId : (!!normale(c.codice) && normale(c.codice) === normale(r.codice));

/** Commessa spedita: tutte le schede, o a lavorazione finita almeno il 90 %. */
export function eSpedita(c: Pick<CommessaPerSpedizione, 'quantita' | 'stato' | 'finite'>, spedite: number): boolean {
  if (spedite <= 0) return false;
  if (spedite >= c.quantita) return true;
  return lavorazioneFinita(c as CommessaPerSpedizione) && spedite >= c.quantita * QUOTA_SPEDITA;
}

export function spedizioniCommesse(commesse: CommessaPerSpedizione[], righe: RigaDdtSpedita[]): Map<number, SpedizioneCommessa> {
  const esito = new Map<number, SpedizioneCommessa>(commesse.map(c => [c.id, { spedite: 0, spedita: false, ddt: [] }]));
  const perId = new Map(commesse.map(c => [c.id, c]));
  const aggiungi = (c: CommessaPerSpedizione, r: RigaDdtSpedita, qta: number) => {
    const e = esito.get(c.id)!;
    e.spedite += qta;
    const g = e.ddt.find(x => x.id === r.ddtId);
    if (g) g.quantita += qta; else e.ddt.push({ id: r.ddtId, numero: r.numero, quantita: qta });
  };
  const libere: RigaDdtSpedita[] = [];
  for (const r of righe) {
    if (!(r.quantita > 0)) continue;
    const diretta = [r.commessaRiga, r.commessaRigaOrdine].map(id => id != null ? perId.get(id) : undefined).find(Boolean)
      ?? (r.commessaDocumento != null && perId.has(r.commessaDocumento) && stessoProdotto(perId.get(r.commessaDocumento)!, r) ? perId.get(r.commessaDocumento) : undefined);
    if (diretta) aggiungi(diretta, r, r.quantita); else libere.push(r);
  }
  // righe senza collegamento: dalla più vecchia, alle commesse dello stesso cliente e prodotto
  libere.sort((a, b) => a.data.localeCompare(b.data) || a.ddtId - b.ddtId);
  for (const r of libere) {
    let resto = r.quantita;
    const candidate = commesse
      .filter(c => c.clienteId != null && c.clienteId === r.clienteId && stessoProdotto(c, r) && (!c.dataInizio || r.data >= c.dataInizio))
      .sort((a, b) => Number(lavorazioneFinita(b)) - Number(lavorazioneFinita(a)) || String(a.dataInizio ?? '').localeCompare(String(b.dataInizio ?? '')) || a.id - b.id);
    for (const c of candidate) {
      if (resto <= 0) break;
      const manca = c.quantita - esito.get(c.id)!.spedite;
      if (manca <= 0) continue;
      const qta = Math.min(manca, resto);
      aggiungi(c, r, qta);
      resto -= qta;
    }
  }
  for (const c of commesse) { const e = esito.get(c.id)!; e.spedita = eSpedita(c, e.spedite); }
  return esito;
}

/** Viste dell'elenco commesse: da fare (predefinita: non spedite e non chiuse), spedite (o chiuse), tutte. */
export const VISTE_COMMESSE = [
  { valore: 'dafare', testo: 'Da fare' },
  { valore: 'spedite', testo: 'Spedite o chiuse' },
  { valore: 'tutte', testo: 'Tutte' },
] as const;
export type VistaCommesse = typeof VISTE_COMMESSE[number]['valore'];
export const vistaCommesse = (v: unknown): VistaCommesse => VISTE_COMMESSE.some(x => x.valore === v) ? v as VistaCommesse : 'dafare';
/** La commessa è conclusa: spedita o chiusa a mano. */
export const commessaConclusa = (stato: string, spedita: boolean) => spedita || stato === 'chiusa';
export const nellaVista = (vista: VistaCommesse, stato: string, spedita: boolean) =>
  vista === 'tutte' || (vista === 'spedite') === commessaConclusa(stato, spedita);
