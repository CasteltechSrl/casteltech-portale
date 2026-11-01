/** Letture per Amministrazione → Controlli (regole in engine/controlli.ts). Una lettura sola quando si apre la pagina: niente timer (Neon). */
import { q } from './db.js';
import { INIZIO_DDT_DA_FATTURARE, SQL_DDT_DA_FATTURARE } from '../engine/ddt.js';

import { GIORNI_PREVENTIVO_FERMO, GIORNI_TEMPO_APERTO, type DatiControlli } from '../engine/controlli.js';

const NOME_CLIENTE = `coalesce(c.ragione_sociale, d.intestatario->>'nome', '')`;

export async function datiControlli(oggi: string): Promise<DatiControlli> {
  const [ddt, ordini, prodotti, clienti, fornitori, preventivi, commesse, tempi] = await Promise.all([
    q<DatiControlli['ddtDaFatturare'][number]>(`SELECT d.id, d.numero::text AS numero, to_char(d.data, 'YYYY-MM-DD') AS data, ${NOME_CLIENTE} AS cliente
      FROM documenti d LEFT JOIN clienti c ON c.id = d.cliente_id
      WHERE d.tipo = 'ddt' AND d.stato = 'emesso' AND d.fattura_id IS NULL AND d.data >= $1 AND ${SQL_DDT_DA_FATTURARE}
      ORDER BY d.data, d.id`, [INIZIO_DDT_DA_FATTURARE]),
    q<DatiControlli['ordiniSenzaConsegna'][number]>(`SELECT o.id, o.numero::text AS numero, coalesce(c.ragione_sociale, o.cliente_nome, '') AS cliente, count(*)::int AS righe
      FROM ordini_righe r JOIN ordini o ON o.id = r.ordine_id LEFT JOIN clienti c ON c.id = o.cliente_id
      WHERE r.consegna_richiesta IS NULL AND r.consegna_prevista IS NULL AND coalesce(r.stato_manuale, '') NOT IN ('evaso', 'annullato')
        AND coalesce(r.quantita, 0) > coalesce(r.quantita_spedita, 0) AND r.tipo <> 'servizio'
      GROUP BY o.id, c.ragione_sociale, o.cliente_nome ORDER BY o.id DESC LIMIT 100`),
    q<DatiControlli['prodottiSenzaPrezzo'][number]>(`SELECT DISTINCT p.id, p.codice, coalesce(c.ragione_sociale, '') AS cliente, p.cliente_id AS "clienteId"
      FROM prodotti p LEFT JOIN clienti c ON c.id = p.cliente_id
      WHERE p.prezzo_vendita IS NULL AND EXISTS (SELECT 1 FROM ordini_righe r WHERE r.prodotto_id = p.id
        AND coalesce(r.stato_manuale, '') NOT IN ('evaso', 'annullato') AND coalesce(r.quantita, 0) > coalesce(r.quantita_spedita, 0))
      ORDER BY cliente, p.codice LIMIT 100`),
    q<DatiControlli['clientiSenzaRecapitoSdi'][number]>(`SELECT c.id, c.ragione_sociale AS nome, count(d.id)::int AS fatture
      FROM clienti c JOIN documenti d ON d.cliente_id = c.id AND d.tipo = 'fattura' AND d.stato NOT IN ('bozza', 'annullato', 'scartato') AND d.data >= $1::date - 365
      WHERE nullif(trim(coalesce(c.codice_sdi, '')), '') IS NULL AND nullif(trim(coalesce(c.pec, '')), '') IS NULL
        AND coalesce(c.nazione, 'IT') IN ('IT', 'ITALIA', '') AND NOT coalesce(c.pubblica_amministrazione, false)
      GROUP BY c.id ORDER BY fatture DESC, c.ragione_sociale`, [oggi]),
    q<DatiControlli['fattureFornitoriSenzaScadenza'][number]>(`SELECT d.id, d.numero, to_char(d.data, 'YYYY-MM-DD') AS data,
        coalesce(f.ragione_sociale, d.intestatario->>'nome', '') AS fornitore, coalesce(d.totale, 0)::float AS totale
      FROM documenti_ricevuti d LEFT JOIN fornitori_anagrafica f ON f.id = d.fornitore_id
      WHERE d.tipo = 'fattura' AND d.data >= $1::date - 365 AND coalesce(d.totale, 0) > 0
        AND NOT EXISTS (SELECT 1 FROM documenti_ricevuti_scadenze s WHERE s.documento_id = d.id)
      ORDER BY d.data DESC LIMIT 100`, [oggi]),
    q<DatiControlli['preventiviFermi'][number]>(`SELECT p.id, p.numero, coalesce(c.ragione_sociale, p.intestazione->>'cliente', '') AS cliente,
        to_char(coalesce(p.aggiornato_il, p.creato_il), 'YYYY-MM-DD') AS aggiornato
      FROM preventivi p LEFT JOIN clienti c ON c.id = p.cliente_id
      WHERE p.stato = 'bozza' AND coalesce(p.aggiornato_il, p.creato_il) < $1::date - $2::int AND p.origine <> 'vecchio_portale'
      ORDER BY coalesce(p.aggiornato_il, p.creato_il) LIMIT 100`, [oggi, GIORNI_PREVENTIVO_FERMO]),
    q<DatiControlli['commesseOltreConsegna'][number]>(`SELECT k.id, k.numero, coalesce(c.ragione_sociale, k.intestazione->>'cliente', '') AS cliente, to_char(k.data_consegna, 'YYYY-MM-DD') AS consegna
      FROM commesse k LEFT JOIN clienti c ON c.id = k.cliente_id
      WHERE k.stato IN ('aperta', 'in_produzione') AND k.data_consegna IS NOT NULL AND k.data_consegna < $1::date
      ORDER BY k.data_consegna LIMIT 100`, [oggi]),
    q<DatiControlli['tempiApertiVecchi'][number]>(`SELECT r.id, k.numero AS commessa, k.id AS "commessaId", coalesce(f.numero, r.fase_codice) AS fase,
        coalesce(r.operatore_nome, '') AS sigla, to_char(r.data, 'YYYY-MM-DD') AS data
      FROM rilevazioni r JOIN commesse k ON k.id = r.commessa_id LEFT JOIN fasi f ON f.codice = r.fase_codice
      WHERE r.aperta_il IS NOT NULL AND r.chiusa_il IS NULL AND r.data < $1::date - $2::int
      ORDER BY r.data LIMIT 100`, [oggi, GIORNI_TEMPO_APERTO]),
  ]);
  return { oggi, ddtDaFatturare: ddt, ordiniSenzaConsegna: ordini, prodottiSenzaPrezzo: prodotti, clientiSenzaRecapitoSdi: clienti,
    fattureFornitoriSenzaScadenza: fornitori, preventiviFermi: preventivi, commesseOltreConsegna: commesse, tempiApertiVecchi: tempi };
}

/** Ultimo preventivo salvato per codice prodotto di un cliente (prezzo a scheda dei lotti successivi e margine), per l'avviso in fattura. */
export async function riferimentiPreventivi(clienteId: number) {
  return q<{ codice: string; numero: string; id: number; prezzo_scheda: number | null; guadagno: number | null; totale: number | null }>(`
    SELECT DISTINCT ON (upper(p.intestazione->>'codice')) upper(p.intestazione->>'codice') AS codice, p.numero, p.id,
      (p.risultato->'totali'->>'prezzoSchedaSecondoLotto')::float AS prezzo_scheda,
      (p.risultato->'totali'->>'guadagnoLotto')::float AS guadagno, p.totale_secondo_lotto::float AS totale
    FROM preventivi p
    WHERE p.cliente_id = $1 AND p.stato NOT IN ('da_validare', 'rifiutato', 'scartato') AND p.intestazione->>'codice' IS NOT NULL
    ORDER BY upper(p.intestazione->>'codice'), coalesce(p.aggiornato_il, p.creato_il) DESC`, [clienteId]);
}
