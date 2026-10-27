/**
 * Righe di fattura / nota di credito scritte nel modulo della bozza: numeri all'italiana, righe vuote tolte, controlli.
 */

export interface RigaModulo {
  codice?: string; descrizione?: string; quantita?: string | number; um?: string; prezzo?: string | number; sconto?: string | number;
  aliquota_iva?: string; solo_descrizione?: string | boolean; ddt_id?: string | number; prodotto_id?: string | number;
}

/** Numero scritto all'italiana (1.234,5) o con il punto (1234.5). */
export function numeroModulo(v: unknown): number {
  const s = String(v ?? '').trim();
  if (!s) return 0;
  const n = Number(/,/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s);
  return Number.isFinite(n) ? n : NaN;
}

export interface RigaBozza {
  posizione: number; solo_descrizione: boolean; codice: string | null; descrizione: string; quantita: number; um: string | null;
  prezzo: number; sconto: number; aliquota_iva: string | null; ddt_id: number | null; prodotto_id: number | null;
}

/** Righe del modulo → righe del documento (quelle completamente vuote si tolgono). Restituisce anche gli errori di scrittura. */
export function righeDaModulo(righe: RigaModulo[]): { righe: RigaBozza[]; errori: string[] } {
  const errori: string[] = [];
  const out = (Array.isArray(righe) ? righe : Object.values(righe ?? {}) as RigaModulo[])
    .filter(r => r && (String(r.descrizione ?? '').trim() || String(r.codice ?? '').trim() || String(r.prezzo ?? '').trim()))
    .map((r, i) => {
      const solo = r.solo_descrizione === true || r.solo_descrizione === 'on' || r.solo_descrizione === '1';
      const quantita = solo ? 1 : numeroModulo(r.quantita === '' || r.quantita == null ? 1 : r.quantita);
      const prezzo = solo ? 0 : numeroModulo(r.prezzo);
      const sconto = solo ? 0 : numeroModulo(r.sconto);
      if ([quantita, prezzo, sconto].some(Number.isNaN)) errori.push(`Riga ${i + 1}: quantità, prezzo o sconto non sono numeri.`);
      if (sconto < 0 || sconto > 100) errori.push(`Riga ${i + 1}: lo sconto va da 0 a 100 %.`);
      if (!String(r.descrizione ?? '').trim()) errori.push(`Riga ${i + 1}: manca la descrizione.`);
      return {
        posizione: i + 1, solo_descrizione: solo, codice: String(r.codice ?? '').trim().toUpperCase() || null,
        descrizione: String(r.descrizione ?? '').trim(), quantita, um: String(r.um ?? '').trim() || null, prezzo, sconto,
        aliquota_iva: solo ? null : String(r.aliquota_iva ?? '').trim() || null,
        ddt_id: Number(r.ddt_id) || null, prodotto_id: Number(r.prodotto_id) || null,
      };
    });
  return { righe: out, errori };
}
