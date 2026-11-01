/**
 * Cruscotto dell'Amministrazione (Adriano, 27/10/2026: "una pagina iniziale in cui ho tutto sotto controllo").
 * Qui solo i conti, senza database: scadenze divise per urgenza, fatturato e acquisti per mese.
 */

export type Fascia = 'scaduta' | 'settimana' | 'mese' | 'oltre';
export const NOMI_FASCE: Record<Fascia, string> = {
  scaduta: 'Scadute', settimana: 'Entro 7 giorni', mese: 'Entro 30 giorni', oltre: 'Oltre 30 giorni',
};

const giorni = (da: string, a: string) => Math.round((Date.parse(a) - Date.parse(da)) / 86_400_000);

/** Urgenza di una scadenza non pagata rispetto a oggi (date aaaa-mm-gg): il giorno stesso non è ancora scaduta. */
export function fasciaScadenza(data: string, oggi: string): Fascia {
  const g = giorni(oggi, data);
  if (g < 0) return 'scaduta';
  if (g <= 7) return 'settimana';
  if (g <= 30) return 'mese';
  return 'oltre';
}

export interface ScadenzaAperta { data: string; importo: number }

/**
 * Note di credito nel "da incassare" (Adriano 1/11/2026): la rata aperta di una nota di credito toglie dal credito verso il cliente,
 * nella fascia della prima rata ancora aperta della fattura che storna (se non ce n'è, alla sua data). Si chiude da sola
 * ("Compensato con fattura") quando la fattura è tutta incassata. Espressioni SQL con gli alias `s` (documenti_scadenze) e `d` (documenti).
 */
export const SQL_IMPORTO_DA_INCASSARE = `CASE WHEN d.tipo = 'nota_credito' THEN -s.importo ELSE s.importo END`;
export const SQL_DATA_DA_INCASSARE = `CASE WHEN d.tipo = 'nota_credito' THEN coalesce((SELECT min(s2.data) FROM documenti_scadenze s2
  WHERE s2.documento_id = d.documento_origine_id AND s2.pagata_il IS NULL), s.data) ELSE s.data END`;

/** Totale e numero delle scadenze aperte per fascia (le note di credito tolgono dal totale ma non contano come rate). */
export function riepilogoScadenze(scadenze: ScadenzaAperta[], oggi: string) {
  const fasce = Object.fromEntries((Object.keys(NOMI_FASCE) as Fascia[]).map(f => [f, { totale: 0, quante: 0 }])) as Record<Fascia, { totale: number; quante: number }>;
  for (const s of scadenze) {
    const f = fasce[fasciaScadenza(s.data, oggi)];
    f.totale = Math.round((f.totale + s.importo) * 100) / 100;
    if (s.importo > 0) f.quante++;
  }
  const totale = Math.round(scadenze.reduce((t, s) => t + s.importo, 0) * 100) / 100;
  return { totale, fasce };
}

export interface MovimentoMese { tipo: string; data: string; imponibile: number }

/**
 * Imponibile per mese dell'anno (12 valori, gennaio = 0): le note di credito tolgono.
 * Con `finoA` (aaaa-mm-gg) conta solo fino a quel giorno, per confrontare lo stesso periodo dell'anno prima.
 */
export function imponibilePerMese(movimenti: MovimentoMese[], anno: number, finoA?: string): number[] {
  const mesi = Array(12).fill(0) as number[];
  for (const m of movimenti) {
    if (Number(m.data.slice(0, 4)) !== anno || (finoA && m.data.slice(5) > finoA.slice(5))) continue;
    const i = Number(m.data.slice(5, 7)) - 1;
    mesi[i] = Math.round((mesi[i] + (m.tipo === 'nota_credito' ? -1 : 1) * m.imponibile) * 100) / 100;
  }
  return mesi;
}

/** Variazione percentuale (arrotondata all'intero); null se l'anno prima non c'era nulla da confrontare. */
export function variazione(attuale: number, prima: number): number | null {
  return prima > 0 ? Math.round(((attuale - prima) / prima) * 100) : null;
}

/**
 * Acquisti dell'anno per fornitore e mese (Adriano 31/10/2026): colpo d'occhio su "cosa ho comprato quel mese", al posto
 * degli ordini a fornitore che in Fatture in Cloud si facevano dopo la fattura (Mouser, DigiKey, Anthropic…) solo per traccia.
 * Imponibile delle fatture dei fornitori, note di credito in negativo. Fornitori dal più grande.
 */
export interface RigaAcquistiFornitore { chiave: string; fornitoreId: number | null; nome: string; mesi: number[]; totale: number; documenti: number }
export function acquistiPerFornitore(docs: { fornitore_id: number | null; nome: string; tipo: string; data: string; imponibile: number }[]):
  { righe: RigaAcquistiFornitore[]; mesi: number[]; totale: number } {
  const perFornitore = new Map<string, RigaAcquistiFornitore>();
  const mesi = Array<number>(12).fill(0);
  const arr = (n: number) => Math.round(n * 100) / 100;
  for (const d of docs) {
    const chiave = d.fornitore_id ? `f${d.fornitore_id}` : `n${(d.nome || '?').toUpperCase()}`;
    const r = perFornitore.get(chiave) ?? { chiave, fornitoreId: d.fornitore_id, nome: d.nome || '(senza nome)', mesi: Array<number>(12).fill(0), totale: 0, documenti: 0 };
    const m = Number(d.data.slice(5, 7)) - 1, v = (d.tipo === 'nota_credito' ? -1 : 1) * (Number(d.imponibile) || 0);
    r.mesi[m] = arr(r.mesi[m] + v); r.totale = arr(r.totale + v); r.documenti++;
    mesi[m] = arr(mesi[m] + v);
    perFornitore.set(chiave, r);
  }
  const righe = [...perFornitore.values()].sort((a, b) => b.totale - a.totale || a.nome.localeCompare(b.nome));
  return { righe, mesi, totale: arr(mesi.reduce((s, x) => s + x, 0)) };
}

/** Rata non pagata di una fattura fornitore (riquadro "Scadute da pagare" in Fatture fornitori). */
export interface RataDaPagare { documento_id: number; nome: string; numero: string; tipo: string; scadenza: string; importo: number }
export interface FatturaScaduta { documento_id: number; nome: string; numero: string; scadenza: string; giorni: number; importo: number; rate: number }

/**
 * Fatture fornitori scadute e non pagate (Adriano 31/10/2026: riquadro tra il filtro e l'elenco).
 * Una riga per fattura con le sole rate già scadute (il giorno stesso non è ancora scaduta), la più vecchia in cima.
 * Le note di credito non sono pagamenti da fare: restano fuori.
 */
export function fattureScadute(rate: RataDaPagare[], oggi: string): { fatture: FatturaScaduta[]; totale: number } {
  const perDoc = new Map<number, FatturaScaduta>();
  for (const r of rate) {
    if (r.tipo === 'nota_credito' || !(r.importo > 0) || fasciaScadenza(r.scadenza, oggi) !== 'scaduta') continue;
    const f = perDoc.get(r.documento_id);
    if (f) {
      f.importo = Math.round((f.importo + r.importo) * 100) / 100;
      f.rate++;
      if (r.scadenza < f.scadenza) { f.scadenza = r.scadenza; f.giorni = giorni(r.scadenza, oggi); }
    } else {
      perDoc.set(r.documento_id, { documento_id: r.documento_id, nome: r.nome, numero: r.numero, scadenza: r.scadenza,
        giorni: giorni(r.scadenza, oggi), importo: Math.round(r.importo * 100) / 100, rate: 1 });
    }
  }
  const fatture = [...perDoc.values()].sort((a, b) => a.scadenza.localeCompare(b.scadenza) || a.documento_id - b.documento_id);
  return { fatture, totale: Math.round(fatture.reduce((t, f) => t + f.importo, 0) * 100) / 100 };
}
