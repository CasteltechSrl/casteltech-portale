/**
 * Anagrafica fornitori: caricamento del file preparato da Claude (fornitori_casteltech.json.gz).
 * Aggiunge i nuovi e aggiorna gli esistenti con la stessa P.IVA; non toglie niente. Le righe con dati che non vanno si saltano.
 */
import { transazione } from './db.js';
import { CAMPI_FORNITORE, preparaFornitore, type Fornitore } from '../engine/anagrafica-fornitori.js';
import { Anteprima } from './anagrafiche-servizio.js';

export interface EsitoFornitori { nuovi: number; aggiornati: number; uguali: number; saltati: { nome: string; motivo: string }[]; anteprima: boolean }

export async function caricaFornitori(righe: unknown[], opz: { anteprima?: boolean } = {}): Promise<EsitoFornitori> {
  try {
    return await transazione(async c => {
      const esito: EsitoFornitori = { nuovi: 0, aggiornati: 0, uguali: 0, saltati: [], anteprima: false };
      const visti = new Set<string>();
      for (const r of righe) {
        const { fornitore: f, errore } = preparaFornitore((r ?? {}) as any);
        if (errore) { esito.saltati.push({ nome: f.ragione_sociale ?? '?', motivo: errore }); continue; }
        if (visti.has(f.partita_iva!)) { esito.saltati.push({ nome: f.ragione_sociale!, motivo: `P.IVA ${f.partita_iva} già presente nel file (doppione).` }); continue; }
        visti.add(f.partita_iva!);
        const prima = (await c.query(`SELECT * FROM fornitori_anagrafica WHERE partita_iva = $1`, [f.partita_iva])).rows[0];
        const valori = CAMPI_FORNITORE.map(k => f[k]);
        if (!prima) {
          await c.query(`INSERT INTO fornitori_anagrafica (${CAMPI_FORNITORE.join(', ')}) VALUES (${CAMPI_FORNITORE.map((_, i) => `$${i + 1}`).join(', ')})`, valori);
          esito.nuovi++;
        } else if (CAMPI_FORNITORE.some(k => (prima[k] ?? null) !== f[k])) {
          await salvaFornitore(c, prima.id, f);
          esito.aggiornati++;
        } else esito.uguali++;
      }
      if (opz.anteprima) throw new Anteprima(esito);
      return esito;
    });
  } catch (e) {
    if (e instanceof Anteprima) return { ...e.esito, anteprima: true };
    throw e;
  }
}

/** Aggiorna tutti i campi di un fornitore. */
export async function salvaFornitore(c: { query: (s: string, p: unknown[]) => Promise<unknown> }, id: number, f: Fornitore) {
  await c.query(`UPDATE fornitori_anagrafica SET ${CAMPI_FORNITORE.map((k, i) => `${k} = $${i + 2}`).join(', ')}, aggiornato_il = now() WHERE id = $1`,
    [id, ...CAMPI_FORNITORE.map(k => f[k])]);
}
