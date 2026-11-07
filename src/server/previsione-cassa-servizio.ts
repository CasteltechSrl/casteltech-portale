/**
 * Letture per la previsione di cassa (Amministrazione → Analisi → Previsione di cassa; conti in `engine/previsione-cassa.ts`).
 * Solo lettura, all'apertura della pagina: niente controlli periodici (Neon).
 */
import { q, q1 } from './db.js';
import { SQL_DATA_DA_INCASSARE, SQL_IMPORTO_DA_INCASSARE } from '../engine/cruscotto-amministrazione.js';
import { numeroRegistro, periodoDa } from '../engine/registri-iva.js';
import { caricaLiquidazioniMensili } from './registri-iva-servizio.js';
import { contiConSaldo, fidoAnticipi } from './banca-servizio.js';
import { fattureAnticipate } from '../engine/anticipi.js';
import {
  leggiImpostazioniCassa, mediaUltimi, meseAnno, piuGiorni, previsioneCassa, usciteFisse,
  type AnticipiCassa, type ImpostazioniCassa, type IncassoStorico, type PagamentoAperto, type RataAperta, type UscitaPuntuale, type ValoriAutomatici,
} from '../engine/previsione-cassa.js';

const NOME_CLIENTE = `coalesce(c.ragione_sociale, d.intestatario->>'ragione_sociale', d.intestatario->>'nome', '(senza nome)')`;
const STATI_OK = `d.stato NOT IN ('bozza', 'annullato', 'scartato')`;
const dataIt = (d: string) => d.split('-').reverse().join('/');

export async function impostazioniCassa(): Promise<ImpostazioniCassa> {
  return leggiImpostazioniCassa((await q1<{ valore: unknown }>(`SELECT valore FROM impostazioni WHERE chiave = 'previsione_cassa'`))?.valore ?? {});
}
export async function salvaImpostazioniCassa(i: ImpostazioniCassa) {
  await q(`INSERT INTO impostazioni (chiave, valore) VALUES ('previsione_cassa', $1) ON CONFLICT (chiave) DO UPDATE SET valore = $1, aggiornato_il = now()`, [JSON.stringify(i)]);
}

/** IVA: versamento del mese chiuso (se non è ancora passata la scadenza) e media degli ultimi 3 mesi come stima per i mesi dopo. */
async function iva(oggi: string): Promise<{ puntuale: UscitaPuntuale | null; media: number | null; da: string | null }> {
  let anno = Number(oggi.slice(0, 4)), mese = Number(oggi.slice(5, 7)) - 1;
  if (!mese) { mese = 12; anno--; }
  try {
    const mensili = await caricaLiquidazioniMensili(periodoDa(anno, `M${String(mese).padStart(2, '0')}`, oggi));
    if (!mensili?.length) return { puntuale: null, media: null, da: null };
    const ultimo = mensili[mensili.length - 1];
    const puntuale = ultimo.daVersare > 0 && ultimo.scadenza >= oggi
      ? { chiave: 'iva', voce: `IVA di ${ultimo.nome} (codice ${ultimo.codiceTributo})`, data: ultimo.scadenza, importo: ultimo.daVersare } : null;
    const ultimi = mensili.slice(-3);
    return { puntuale, media: mediaUltimi(ultimi.map(m => m.daVersare)),
      da: `media dei versamenti di ${ultimi.map(m => m.nome).join(', ')} dai Registri IVA` };
  } catch {
    return { puntuale: null, media: null, da: null };   // registri non leggibili: l'IVA si scrive a mano
  }
}

export async function caricaPrevisione(oggi: string) {
  const unAnnoFa = piuGiorni(oggi, -365);
  const [imp, rate, storico, pagamenti, f24, f24Storico, stipendi, ivaDati] = await Promise.all([
    impostazioniCassa(),
    q<RataAperta & { numero_doc: number; sezionale: string; id: number; data_doc: string; modalita: string | null; tipo_doc: string }>(`SELECT s.id, ${NOME_CLIENTE} AS cliente, d.numero AS numero_doc, d.sezionale,
        to_char(d.data, 'YYYY-MM-DD') AS data_doc, s.modalita, d.tipo AS tipo_doc,
        (${SQL_DATA_DA_INCASSARE})::text AS scadenza, (${SQL_IMPORTO_DA_INCASSARE})::float AS importo
      FROM documenti_scadenze s JOIN documenti d ON d.id = s.documento_id LEFT JOIN clienti c ON c.id = d.cliente_id
      WHERE s.pagata_il IS NULL AND d.tipo IN ('fattura', 'nota_credito') AND ${STATI_OK} ORDER BY 4`),
    q<IncassoStorico>(`SELECT ${NOME_CLIENTE} AS cliente, to_char(d.data, 'YYYY-MM-DD') AS "dataFattura", to_char(s.data, 'YYYY-MM-DD') AS scadenza,
        to_char(s.pagata_il, 'YYYY-MM-DD') AS incassata, s.importo::float AS importo
      FROM documenti_scadenze s JOIN documenti d ON d.id = s.documento_id LEFT JOIN clienti c ON c.id = d.cliente_id
      WHERE d.tipo = 'fattura' AND ${STATI_OK} AND s.pagata_il BETWEEN $1 AND $2 AND s.importo > 0
        AND coalesce(s.modo, '') NOT IN ('Compensato con fattura', 'Stornato')`, [unAnnoFa, oggi]),
    q<PagamentoAperto>(`SELECT coalesce(f.ragione_sociale, d.intestatario->>'nome', d.intestatario->>'ragione_sociale', '(senza nome)') AS fornitore,
        coalesce(d.numero, '') AS numero, to_char(s.data, 'YYYY-MM-DD') AS scadenza, s.importo::float AS importo
      FROM documenti_ricevuti_scadenze s JOIN documenti_ricevuti d ON d.id = s.documento_id LEFT JOIN fornitori_anagrafica f ON f.id = d.fornitore_id
      WHERE s.pagata_il IS NULL AND d.tipo = 'fattura' AND s.importo > 0 ORDER BY s.data`),
    q<{ scadenza: string; totale: number; anno: number; mese: number }>(`SELECT to_char(scadenza, 'YYYY-MM-DD') AS scadenza, totale::float AS totale, anno, mese
      FROM paghe_documenti WHERE tipo = 'f24' AND totale > 0 AND pagato_il IS NULL AND scadenza >= $1 ORDER BY scadenza`, [oggi]),
    q<{ scadenza: string; totale: number }>(`SELECT to_char(scadenza, 'YYYY-MM-DD') AS scadenza, totale::float AS totale
      FROM paghe_documenti WHERE tipo = 'f24' AND totale > 0 AND scadenza IS NOT NULL ORDER BY scadenza DESC LIMIT 3`),
    q1<{ anno: number; mese: number; netto: number }>(`SELECT anno, mese, sum(netto)::float AS netto FROM costi_personale
      WHERE netto IS NOT NULL GROUP BY anno, mese HAVING sum(netto) > 0 ORDER BY anno DESC, mese DESC LIMIT 1`),
    iva(oggi),
  ]);

  const auto: ValoriAutomatici = {
    stipendi: stipendi?.netto ? Math.round(stipendi.netto * 100) / 100 : null,
    stipendiDa: stipendi ? `netto totale di ${meseAnno(stipendi.anno, stipendi.mese)} (Dipendenti → Costo del personale)` : null,
    f24: mediaUltimi(f24Storico.map(f => f.totale).reverse()),
    f24Da: f24Storico.length ? `media degli ultimi ${f24Storico.length} F24 dello studio paghe (${f24Storico.map(f => dataIt(f.scadenza)).join(', ')})` : null,
    iva: ivaDati.media, ivaDa: ivaDati.da,
  };
  const fisse = usciteFisse(imp, auto);
  const puntuali: UscitaPuntuale[] = [
    ...f24.map(f => ({ chiave: 'f24', voce: `F24 paghe di ${meseAnno(f.anno, f.mese)} (letto)`, data: f.scadenza, importo: f.totale })),
    ...(ivaDati.puntuale && imp.iva == null ? [ivaDati.puntuale] : []),
  ];
  // banca (Adriano 7/11/2026): saldo del conto ordinario dai movimenti caricati, se più recente di quello scritto qui; fatture anticipate dai conti tecnici
  const [conti, movTecnici] = await Promise.all([contiConSaldo(),
    q<{ data: string; importo: number; descrizione: string; conto: string }>(`SELECT to_char(data, 'YYYY-MM-DD') AS data, importo::float AS importo, descrizione, conto
      FROM banca_movimenti WHERE data >= $1`, [piuGiorni(oggi, -400)])]);
  const tecnici = new Set(conti.filter(c => c.tipo === 'anticipo').map(c => c.numero));
  const { anticipate, daRientrare } = fattureAnticipate(movTecnici.filter(m => tecnici.has(m.conto)),
    rate.filter(r => r.tipo_doc === 'fattura' && r.importo > 0).map(r => ({ id: r.id, numero: String(r.numero_doc), dataDoc: r.data_doc, scadenza: r.scadenza.slice(0, 10),
      importo: r.importo, riba: r.modalita === 'MP12' })), oggi);
  const anticipi: AnticipiCassa = { perRata: new Map(anticipate.flatMap(a => a.rate.map(r => [r.id, { tipo: a.tipo, anticipato: r.anticipato }] as const))), daRientrare };
  const ordinario = conti.find(c => c.tipo === 'ordinario' && c.saldoOggi != null);
  const dataBanca = ordinario?.ultimo || ordinario?.saldoData || null;
  const saldo = ordinario && dataBanca && (imp.saldo == null || !imp.dataSaldo || dataBanca >= imp.dataSaldo)
    ? { importo: ordinario.saldoOggi as number, data: dataBanca }
    : imp.saldo != null ? { importo: imp.saldo, data: imp.dataSaldo ?? oggi } : null;
  const previsione = previsioneCassa({
    oggi, saldo, storico, pagamenti, fisse, puntuali, minimoPagamenti: imp.minimoPagamenti, anticipi,
    rate: rate.map(r => ({ id: r.id, cliente: r.cliente, numero: numeroRegistro(r.numero_doc, r.sezionale), scadenza: r.scadenza.slice(0, 10), importo: r.importo })),
  });
  return { previsione, impostazioni: imp, auto, fisse, anticipate, conti, fidoAnticipi: await fidoAnticipi() };
}
