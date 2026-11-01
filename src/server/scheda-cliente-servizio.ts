/**
 * Letture della scheda unica del cliente (regole in engine/scheda-cliente.ts): tutte in parallelo, una volta sola all'apertura.
 */
import { SQL_DATA_DA_INCASSARE, SQL_IMPORTO_DA_INCASSARE } from '../engine/cruscotto-amministrazione.js';
import { q, q1 } from './db.js';
import { righeOrdini } from './ordini-servizio.js';
import { ddtDaFatturare } from './documenti-servizio.js';
import { fatturatoClienti } from './crm-servizio.js';
import { fatturatoPerAnno, giorniMediIncasso, situazioneIncassi } from '../engine/scheda-cliente.js';

export async function datiSchedaCliente(id: number, oggi: string) {
  const cliente = await q1(`SELECT c.*, (SELECT count(*)::int FROM prodotti p WHERE p.cliente_id = c.id) AS n_prodotti FROM clienti c WHERE c.id = $1`, [id]);
  if (!cliente) return null;
  const anno = Number(oggi.slice(0, 4));
  const [prodotti, preventivi, righe, commesse, ddt, documenti, rate, crm, storico] = await Promise.all([
    q(`SELECT p.id, p.codice, p.descrizione, p.prezzo_vendita::float AS prezzo, p.prezzo_fonte, p.prezzo_data::text AS prezzo_data,
        (SELECT count(*)::int FROM prodotti_scaglioni s WHERE s.prodotto_id = p.id) AS scaglioni,
        (SELECT max(v.creato_il)::text FROM prodotti_revisioni r JOIN preventivi v ON v.revisione_id = r.id WHERE r.prodotto_id = p.id) AS ultimo_preventivo
      FROM prodotti p WHERE p.cliente_id = $1 ORDER BY p.codice`, [id]),
    q(`SELECT id, numero, stato, creato_il::text AS creato_il, n_schede, intestazione->>'codice' AS codice, intestazione->>'descrizione' AS descrizione,
        (risultato->'totali'->>'prezzoSchedaSecondoLotto')::float AS prezzo_scheda, totale_secondo_lotto::float AS totale
      FROM preventivi WHERE cliente_id = $1 ORDER BY creato_il DESC LIMIT 12`, [id]),
    righeOrdini().then(r => r.filter(x => x.clienteId === id)),
    q(`SELECT c.id, c.numero, c.stato, c.quantita, c.data_consegna::text AS data_consegna, c.intestazione->>'codice' AS codice
      FROM commesse c WHERE c.cliente_id = $1 AND c.stato NOT IN ('chiusa') ORDER BY c.data_consegna NULLS LAST, c.numero`, [id]),
    ddtDaFatturare(id, 0),
    q(`SELECT id, tipo, anno, numero, sezionale, data::text AS data, stato, imponibile::float AS imponibile, totale::float AS totale, fattura_id
      FROM documenti WHERE cliente_id = $1 AND tipo IN ('fattura', 'nota_credito', 'nota_debito', 'ddt') ORDER BY data DESC, id DESC`, [id]),
    q(`SELECT s.documento_id, (${SQL_DATA_DA_INCASSARE})::text AS data, (${SQL_IMPORTO_DA_INCASSARE})::float AS importo, s.pagata_il::text AS pagata_il,
        d.data::text AS data_fattura, d.numero, d.sezionale, d.tipo
      FROM documenti_scadenze s JOIN documenti d ON d.id = s.documento_id
      WHERE d.cliente_id = $1 AND (d.tipo = 'fattura' OR (d.tipo = 'nota_credito' AND s.pagata_il IS NULL)) AND d.stato NOT IN ('bozza', 'annullato', 'scartato') ORDER BY 2`, [id]),
    q1(`SELECT a.id, a.stato, a.responsabile, a.prossima_azione, a.data_prossima_azione::text AS data_prossima_azione, a.telefono, a.email, a.sito,
        (SELECT json_agg(json_build_object('nome', k.nome, 'ruolo', k.ruolo, 'telefono', k.telefono, 'email', k.email) ORDER BY k.id) FROM crm_contatti k WHERE k.azienda_id = a.id) AS contatti,
        (SELECT json_agg(json_build_object('data', t.data, 'tipo', t.tipo, 'descrizione', t.descrizione) ORDER BY t.data DESC) FROM (SELECT * FROM crm_attivita WHERE azienda_id = a.id ORDER BY data DESC LIMIT 5) t) AS attivita
      FROM crm_aziende a WHERE a.cliente_id = $1 ORDER BY a.id LIMIT 1`, [id]),
    fatturatoClienti([id]).then(f => f.perCliente.get(id) ?? null),
  ]);
  const ordiniAperti = righe.filter(r => r.tipo === 'scheda' && r.residuoQuantita > 0 && !['evaso', 'annullato'].includes(r.stato));
  return {
    cliente, prodotti, preventivi, ordiniAperti, commesse, ddtDaFatturare: ddt.filter(d => d.daFatturare), documenti: documenti.slice(0, 15),
    fatturato: fatturatoPerAnno(documenti, anno), incassi: situazioneIncassi(rate.map(r => ({ data: r.data, importo: r.importo, pagata: !!r.pagata_il })), oggi),
    rateScadute: rate.filter(r => !r.pagata_il && r.data < oggi && r.importo > 0),
    giorniIncasso: giorniMediIncasso(rate.map(r => ({ dataFattura: r.data_fattura, pagataIl: r.pagata_il }))),
    crm, storico,
    valoreOrdiniAperti: ordiniAperti.reduce((t, r) => t + (r.residuoValore || 0), 0),
  };
}
export type DatiSchedaCliente = NonNullable<Awaited<ReturnType<typeof datiSchedaCliente>>>;
