/**
 * Anno di riferimento dei cruscotti (Adriano 10/11/2026: "cambiare l'anno di riferimento non solo del commerciale ma di tutte le opzioni:
 * commerciale, acquisti, produzione, amministrazione, dipendenti"). L'anno scelto in un cruscotto vale anche negli altri
 * (cruscotto generale, Ordini clienti → Cruscotto, Amministrazione → Cruscotto, Dipendenti → Costo del personale) finché non si cambia:
 * si ricorda nella sessione (server/anno-riferimento.ts). Qui solo le regole, senza database.
 */

/** Primo anno con dati nel portale (storico di Fatture in Cloud dal 2019). */
export const ANNO_MINIMO = 2019;

/** Anno valido (dal 2019 all'anno in corso), altrimenti null. */
export function annoValido(v: unknown, annoOggi: number): number | null {
  const n = Number(Array.isArray(v) ? v[0] : v);
  return Number.isInteger(n) && n >= ANNO_MINIMO && n <= annoOggi ? n : null;
}

/** Anni che si possono scegliere, dal più recente. */
export function anniScelta(annoOggi: number): number[] {
  return Array.from({ length: annoOggi - ANNO_MINIMO + 1 }, (_, i) => annoOggi - i);
}

/**
 * Periodo di confronto: per l'anno in corso lo stesso periodo dell'anno prima (fino al giorno di oggi), per un anno passato l'anno prima intero.
 * Restituisce la data limite (aaaa-mm-gg) dell'anno prima, o null = anno intero.
 */
export function limiteConfronto(anno: number, oggi: string): string | null {
  return anno === Number(oggi.slice(0, 4)) ? `${anno - 1}${oggi.slice(4, 10)}` : null;
}

/** Una fattura o nota di credito emessa, con l'anno e la data con cui conta (le NC collegate contano nella data della fattura stornata). */
export interface FatturaPerCliente { chiave: string; cliente: string; clienteId: number | null; tipo: string; data: string; imponibile: number }

export interface ClienteFatturato {
  chiave: string; cliente: string; clienteId: number | null;
  fatturato: number; fatture: number; prima: number; variazione: number | null; peso: number;
}

const arr = (n: number) => Math.round(n * 100) / 100;

/**
 * Elenco dei clienti con il fatturato dell'anno (fatture meno note di credito), il confronto con l'anno prima (stesso periodo se è l'anno in corso)
 * e il peso sul totale. Dentro anche chi aveva comprato l'anno prima e quest'anno no (fatturato 0, in fondo). Dal più grande.
 */
export function fatturatoPerCliente(documenti: FatturaPerCliente[], anno: number, oggi: string): ClienteFatturato[] {
  const limite = limiteConfronto(anno, oggi);
  const mappa = new Map<string, ClienteFatturato>();
  for (const d of documenti) {
    const a = Number(d.data.slice(0, 4));
    const nelPeriodoPrima = a === anno - 1 && (!limite || d.data <= limite);
    if (a !== anno && !nelPeriodoPrima) continue;
    let c = mappa.get(d.chiave);
    if (!c) mappa.set(d.chiave, c = { chiave: d.chiave, cliente: d.cliente, clienteId: d.clienteId, fatturato: 0, fatture: 0, prima: 0, variazione: null, peso: 0 });
    if (d.clienteId && !c.clienteId) c.clienteId = d.clienteId;
    const segno = d.tipo === 'nota_credito' ? -1 : 1;
    if (a === anno) { c.fatturato += segno * d.imponibile; if (d.tipo === 'fattura') c.fatture++; } else c.prima += segno * d.imponibile;
  }
  const righe = [...mappa.values()].filter(c => Math.abs(c.fatturato) >= 0.005 || Math.abs(c.prima) >= 0.005);
  const totale = righe.reduce((s, c) => s + Math.max(0, c.fatturato), 0);
  for (const c of righe) {
    c.fatturato = arr(c.fatturato); c.prima = arr(c.prima);
    c.variazione = c.prima > 0 ? Math.round(((c.fatturato - c.prima) / c.prima) * 100) : null;
    c.peso = totale > 0 && c.fatturato > 0 ? Math.round((c.fatturato / totale) * 1000) / 10 : 0;
  }
  return righe.sort((a, b) => b.fatturato - a.fatturato || b.prima - a.prima || a.cliente.localeCompare(b.cliente));
}
