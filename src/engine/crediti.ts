/**
 * Crediti verso i clienti (brief D di Adriano, confermato il 31/10/2026): quanto c'è da incassare, quanto è scaduto e da quanto,
 * per cliente l'esposizione e i giorni medi di incasso, le rate dei prossimi 14 giorni.
 * Qui solo i conti, senza database (letture in rotte/amministrazione.ts, pagina /amministrazione/crediti, calcolata all'apertura).
 * Le note di credito aperte arrivano con importo negativo e tolgono dal credito (stessa regola del cruscotto).
 * I solleciti stanno in engine/solleciti.ts: questa pagina ci rimanda.
 */
import { giorniMediIncasso } from './scheda-cliente.js';

export interface RataCredito {
  scadenzaId: number; documentoId: number; numero: string; dataFattura: string; scadenza: string; importo: number;
  clienteId: number | null; cliente: string; pagataIl: string | null;
}
export type FasciaScaduto = 'f30' | 'f60' | 'f90' | 'oltre90';
export const NOMI_FASCE_SCADUTO: Record<FasciaScaduto, string> = { f30: 'Fino a 30 giorni', f60: '31–60 giorni', f90: '61–90 giorni', oltre90: 'Oltre 90 giorni' };
const FASCE: FasciaScaduto[] = ['f30', 'f60', 'f90', 'oltre90'];

export interface CreditoCliente {
  chiave: string; clienteId: number | null; cliente: string;
  esposizione: number; scaduto: number; aScadere: number; fasce: Record<FasciaScaduto, number>;
  rateAperte: number; giorniMediIncasso: number | null; ritardoMax: number;
}
export interface RiepilogoCrediti {
  totale: number; scaduto: number; aScadere: number; fasce: Record<FasciaScaduto, number>;
  clienti: CreditoCliente[]; prossime: RataCredito[];
}

const r2 = (x: number) => Math.round(x * 100) / 100;
const giorno = (d: string) => Date.parse(`${d.slice(0, 10)}T00:00:00Z`);
/** Giorni di ritardo rispetto a oggi (0 se non è ancora scaduta: il giorno della scadenza non è ritardo). */
export const giorniScaduta = (scadenza: string, oggi: string) => Math.max(0, Math.round((giorno(oggi) - giorno(scadenza)) / 86_400_000));
export const piuGiorni = (d: string, n: number) => new Date(giorno(d) + n * 86_400_000).toISOString().slice(0, 10);

/** Fascia dello scaduto (null = non scaduta). */
export function fasciaScaduto(scadenza: string, oggi: string): FasciaScaduto | null {
  const g = giorniScaduta(scadenza, oggi);
  if (g <= 0) return null;
  return g <= 30 ? 'f30' : g <= 60 ? 'f60' : g <= 90 ? 'f90' : 'oltre90';
}
const fasceVuote = () => Object.fromEntries(FASCE.map(f => [f, 0])) as Record<FasciaScaduto, number>;

/**
 * Riepilogo dei crediti. `rate`: rate aperte (pagataIl null) di fatture e note di credito, più le rate di fattura pagate
 * (servono solo ai giorni medi di incasso, contati sulle rate pagate negli ultimi `mesiIncassi` mesi).
 * Clienti in ordine di scaduto, poi di esposizione; prossime = rate (non note di credito) che scadono da oggi a oggi + `giorniProssime`.
 */
export function riepilogoCrediti(rate: RataCredito[], oggi: string, o: { giorniProssime?: number; mesiIncassi?: number } = {}): RiepilogoCrediti {
  const fino = piuGiorni(oggi, o.giorniProssime ?? 14);
  const dal = piuGiorni(oggi, -Math.round((o.mesiIncassi ?? 12) * 365 / 12));
  const fasce = fasceVuote();
  let totale = 0, scaduto = 0, aScadere = 0;
  const clienti = new Map<string, CreditoCliente & { pagate: { dataFattura: string; pagataIl: string | null }[] }>();
  const prossime: RataCredito[] = [];
  for (const r of rate) {
    const chiave = r.clienteId != null ? `c${r.clienteId}` : `n:${r.cliente}`;
    let c = clienti.get(chiave);
    if (!c) {
      c = { chiave, clienteId: r.clienteId, cliente: r.cliente, esposizione: 0, scaduto: 0, aScadere: 0, fasce: fasceVuote(), rateAperte: 0, giorniMediIncasso: null, ritardoMax: 0, pagate: [] };
      clienti.set(chiave, c);
    }
    if (r.pagataIl) {
      if (r.importo > 0 && r.pagataIl.slice(0, 10) >= dal) c.pagate.push({ dataFattura: r.dataFattura, pagataIl: r.pagataIl });
      continue;
    }
    const imp = Number(r.importo);
    totale += imp; c.esposizione += imp;
    if (imp > 0) c.rateAperte++;
    const f = fasciaScaduto(r.scadenza, oggi);
    if (f) {
      scaduto += imp; c.scaduto += imp; fasce[f] += imp; c.fasce[f] += imp;
      if (imp > 0) c.ritardoMax = Math.max(c.ritardoMax, giorniScaduta(r.scadenza, oggi));
    } else {
      aScadere += imp; c.aScadere += imp;
      if (imp > 0 && r.scadenza.slice(0, 10) <= fino) prossime.push(r);
    }
  }
  const elenco = [...clienti.values()]
    .map(({ pagate, ...c }) => ({ ...c, esposizione: r2(c.esposizione), scaduto: r2(c.scaduto), aScadere: r2(c.aScadere),
      fasce: Object.fromEntries(FASCE.map(f => [f, r2(c.fasce[f])])) as Record<FasciaScaduto, number>, giorniMediIncasso: giorniMediIncasso(pagate) }))
    .filter(c => Math.abs(c.esposizione) >= 0.005 || c.rateAperte > 0)
    .sort((a, b) => b.scaduto - a.scaduto || b.esposizione - a.esposizione || a.cliente.localeCompare(b.cliente));
  return {
    totale: r2(totale), scaduto: r2(scaduto), aScadere: r2(aScadere),
    fasce: Object.fromEntries(FASCE.map(f => [f, r2(fasce[f])])) as Record<FasciaScaduto, number>,
    clienti: elenco, prossime: prossime.sort((a, b) => a.scadenza.localeCompare(b.scadenza) || a.cliente.localeCompare(b.cliente)),
  };
}

/** Indirizzo di ritorno dopo "Segna incassata": solo pagine dell'Amministrazione (mai un altro sito). */
export function ritornoSicuro(torna: unknown): string | null {
  const t = String(torna ?? '');
  return /^\/amministrazione(\/[\w\-/]*)?(\?[\w=&%-]*)?$/.test(t) ? t : null;
}
