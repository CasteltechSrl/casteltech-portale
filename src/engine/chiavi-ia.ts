/**
 * Due chiavi dell'IA (Adriano 11/11/2026): il credito gratuito di 100 $ è sull'account Anthropic di adriano.gmb@gmail.com,
 * il portale usa la chiave di info@casteltech.net (ricarica automatica). Le organizzazioni non si uniscono, quindi:
 * ANTHROPIC_API_KEY_PRIMARIA (facoltativa) = chiave da usare per prima; quando risponde "credito finito", "tetto di spesa"
 * o "chiave non valida" il portale passa da solo ad ANTHROPIC_API_KEY e resta su quella fino al prossimo riavvio.
 * Senza ANTHROPIC_API_KEY_PRIMARIA tutto funziona come prima.
 */
import type { TipoErroreIa } from './servizi.js';

export interface ChiaveIa { nome: 'primaria' | 'riserva'; chiave: string }

/** Errori per cui la chiave primaria non serve più: si passa alla riserva (gli altri si riprovano con la stessa chiave). */
export const ERRORI_PASSA_ALLA_RISERVA: TipoErroreIa[] = ['credito', 'tetto', 'chiave'];

export const passaAllaRiserva = (tipo: TipoErroreIa) => ERRORI_PASSA_ALLA_RISERVA.includes(tipo);

/** Le chiavi da provare, nell'ordine. La primaria si salta se è già risultata esaurita (o se è uguale alla riserva). */
export function chiaviDaProvare(env: Record<string, string | undefined>, primariaEsaurita: boolean): ChiaveIa[] {
  const primaria = (env.ANTHROPIC_API_KEY_PRIMARIA ?? '').trim();
  const riserva = (env.ANTHROPIC_API_KEY ?? '').trim();
  const out: ChiaveIa[] = [];
  if (primaria && !(primariaEsaurita && riserva)) out.push({ nome: 'primaria', chiave: primaria });
  if (riserva && riserva !== primaria) out.push({ nome: 'riserva', chiave: riserva });
  return out;
}
