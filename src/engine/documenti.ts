/**
 * Righe di fattura / nota di credito scritte nel modulo della bozza: numeri all'italiana, righe vuote tolte, controlli.
 */

export interface RigaModulo {
  codice?: string; descrizione?: string; quantita?: string | number; um?: string; prezzo?: string | number; sconto?: string | number;
  aliquota_iva?: string; solo_descrizione?: string | boolean; ddt_id?: string | number; prodotto_id?: string | number; riga_ordine_id?: string | number;
  acconto_id?: string | number;
  fonte?: string | null; componente_id?: string | number | null; componente_cliente_id?: string | number | null;   // DDT (Adriano 2/11/2026)
  note?: string | null;            // note del singolo lotto (Adriano 9/11/2026): non vanno in anagrafica
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
  riga_ordine_id: number | null;   // riga dell'ordine evasa da questa riga (DDT, e fattura che viene dal DDT)
  acconto_id: number | null;       // fattura d'acconto (TD02) scalata da questa riga negativa
  fonte: string | null;            // DDT: prodotto / componente / componente_cliente / libero
  componente_id: number | null; componente_cliente_id: number | null;
  note: string | null;             // note della riga per questo lotto (DDT → fattura), stampate sotto la descrizione
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
        ddt_id: Number(r.ddt_id) || null, prodotto_id: Number(r.prodotto_id) || null, riga_ordine_id: Number(r.riga_ordine_id) || null,
        acconto_id: solo ? null : Number(r.acconto_id) || null,
        fonte: solo ? null : String(r.fonte ?? '').trim() || null,
        componente_id: solo ? null : Number(r.componente_id) || null, componente_cliente_id: solo ? null : Number(r.componente_cliente_id) || null,
        note: solo ? null : notaRiga(r.note),
      };
    });
  return { righe: out, errori };
}

// ───────────── Note per riga (Adriano 9/11/2026, DDT 222) ─────────────
// Informazioni del singolo lotto scritte nella riga: l'anagrafica del prodotto non cambia, la fattura fatta dal DDT le riprende,
// stampa, PDF e XML le mettono dopo la descrizione.

/** Nota della riga come scritta nel modulo: spazi tolti, MAIUSCOLO come il resto delle righe, vuota = null. */
export function notaRiga(v: unknown): string | null {
  const t = String(v ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
  return t ? t.slice(0, 500) : null;
}

/** Descrizione con la nota del lotto (XML e PDF): "DESCRIZIONE - NOTA"; senza nota resta la descrizione. */
export function descrizioneConNota(descrizione: string | null | undefined, note: string | null | undefined): string {
  const d = String(descrizione ?? '').trim(), n = String(note ?? '').trim();
  return n ? (d ? `${d} - ${n}` : n) : d;
}
