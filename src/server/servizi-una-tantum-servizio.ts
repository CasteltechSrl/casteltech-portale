/**
 * Servizi una tantum (Adriano 3/11/2026): Anagrafiche → Servizi una tantum, voci nel menu Codice dei documenti per tutti i clienti,
 * venduto per codice. Regole in engine/servizi-una-tantum.ts.
 */
import { q, q1 } from './db.js';
import { controllaServizio, vendutoPerServizio, type RigaVenduta, type ServizioUnaTantum } from '../engine/servizi-una-tantum.js';

export interface ServizioElenco extends ServizioUnaTantum { usato: number }

/** Righe di documenti e ordini che usano il codice (per il tasto Elimina). */
const SQL_USATO = `((SELECT count(*)::int FROM documenti_righe r WHERE upper(r.codice) = s.codice)
  + (SELECT count(*)::int FROM ordini_righe r WHERE upper(r.codice) = s.codice))`;

/** Voci per i menu Codice dei documenti: solo le attive. */
export const serviziAttivi = () => q<ServizioUnaTantum>(
  `SELECT id, codice, descrizione, prezzo::float AS prezzo, attivo FROM servizi_una_tantum WHERE attivo ORDER BY codice`);

export const elencoServizi = () => q<ServizioElenco>(
  `SELECT s.id, s.codice, s.descrizione, s.prezzo::float AS prezzo, s.attivo, ${SQL_USATO} AS usato FROM servizi_una_tantum s ORDER BY s.codice`);

export const servizioPerCodice = (codice: string) => q1<ServizioUnaTantum>(
  `SELECT id, codice, descrizione, prezzo::float AS prezzo, attivo FROM servizi_una_tantum WHERE codice = upper(trim($1))`, [codice]);

export async function aggiungiServizio(x: any): Promise<{ errore: string; campo: string } | { servizio: ServizioUnaTantum }> {
  const v = controllaServizio(x);
  if ('errore' in v) return v;
  if (await servizioPerCodice(v.codice)) return { errore: `${v.codice} c'è già.`, campo: 'codice' };
  const servizio = (await q1<ServizioUnaTantum>(`INSERT INTO servizi_una_tantum (codice, descrizione, prezzo) VALUES ($1, $2, $3)
    RETURNING id, codice, descrizione, prezzo::float AS prezzo, attivo`, [v.codice, v.descrizione, v.prezzo]))!;
  return { servizio };
}

/** Correzione dall'anagrafica: descrizione, prezzo, Attivo. Il codice non cambia (è già nei documenti). */
export async function salvaServizio(id: number, x: any): Promise<string | null> {
  const s = await q1<{ codice: string }>(`SELECT codice FROM servizi_una_tantum WHERE id = $1`, [id]);
  if (!s) return 'Servizio non trovato.';
  const v = controllaServizio({ ...x, codice: s.codice });
  if ('errore' in v) return v.errore;
  await q(`UPDATE servizi_una_tantum SET descrizione = $2, prezzo = $3, attivo = coalesce($4, attivo), aggiornato_il = now() WHERE id = $1`,
    [id, v.descrizione, v.prezzo, x.attivo ?? null]);
  return null;
}

/** Si elimina solo se nessun documento o ordine lo usa (altrimenti si toglie la spunta "Attivo"). */
export async function eliminaServizio(id: number): Promise<string | null> {
  const s = await q1<{ codice: string; usato: number }>(`SELECT s.codice, ${SQL_USATO} AS usato FROM servizi_una_tantum s WHERE s.id = $1`, [id]);
  if (!s) return 'Servizio non trovato.';
  if (s.usato) return `${s.codice} è già in ${s.usato} righe di documenti od ordini: non si elimina, togli la spunta "Attivo".`;
  await q(`DELETE FROM servizi_una_tantum WHERE id = $1`, [id]);
  return null;
}

/**
 * Venduto per servizio e anno: righe delle fatture e note di credito emesse (storico FIC compreso; bozze, annullate e scartate escluse).
 * Si leggono solo le righe con un codice UT o con le parole dei servizi nella descrizione; l'attribuzione la fa engine/servizi-una-tantum.ts.
 */
export async function vendutoServizi(codici: string[]) {
  const righe = await q<RigaVenduta>(`SELECT r.codice, r.descrizione, extract(year FROM d.data)::int AS anno,
      (CASE WHEN d.tipo = 'nota_credito' THEN -1 ELSE 1 END * coalesce(r.quantita, 0))::float AS quantita,
      (CASE WHEN d.tipo = 'nota_credito' THEN -1 ELSE 1 END * round(coalesce(r.quantita, 0) * coalesce(r.prezzo, 0) * (1 - coalesce(r.sconto, 0) / 100), 2))::float AS importo
    FROM documenti_righe r JOIN documenti d ON d.id = r.documento_id
    WHERE d.tipo IN ('fattura', 'nota_credito') AND d.stato NOT IN ('bozza', 'annullato', 'scartato') AND d.numero IS NOT NULL
      AND NOT coalesce(r.solo_descrizione, false) AND r.acconto_id IS NULL
      AND (upper(r.codice) LIKE 'UT-%' OR r.descrizione ~* '(lamin[ae]|stencil|documentazione|programmazion|programming|attrezza)')`);
  return vendutoPerServizio(righe, codici);
}
