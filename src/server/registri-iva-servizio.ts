/**
 * Registri IVA dal database: fatture e note di credito emesse, autofatture, fatture dei fornitori del periodo.
 * Dai file XML si legge solo il riepilogo IVA (DatiRiepilogo, estratto da PostgreSQL): i file dei fornitori possono avere
 * allegati PDF di qualche MB e non vanno caricati tutti in memoria. Export per il commercialista: Excel e pacchetto zip
 * con l'Excel e i file XML, scritto a pezzi (20 documenti per volta).
 */
import ExcelJS from 'exceljs';
import { Zip, ZipDeflate, strToU8 } from 'fflate';
import type { Response } from 'express';
import { q, q1 } from './db.js';
import { caricaAliquote } from './amministrazione-servizio.js';
import { siglaNazione } from '../engine/amministrazione.js';
import {
  NOMI_REGISTRO, STATI_ESCLUSI, controlliRegistro, liquidazione, nomeVoce, numeriMancanti, numeroRegistro, protocolla, riepilogoDocumento, riepilogoRegistro,
  segno, type Liquidazione, type Periodo, type Registro, type RigaRegistro,
} from '../engine/registri-iva.js';

/** Blocchi DatiRiepilogo del file XML, estratti dal database (non si legge tutto il file). */
const RIEPILOGO_XML = (colonna: string) => `(SELECT string_agg(m[1], '') FROM regexp_matches(coalesce(${colonna}, ''), '(<DatiRiepilogo>.*?</DatiRiepilogo>)', 'g') AS m)`;

export interface DatiRegistri {
  periodo: Periodo; vendite: RigaRegistro[]; acquisti: RigaRegistro[]; autofatture: RigaRegistro[];
  riepilogo: Record<Registro, ReturnType<typeof riepilogoRegistro>>; liquidazione: Liquidazione; controlli: string[];
}

export async function caricaRegistri(periodo: Periodo): Promise<DatiRegistri> {
  const aliquote = await caricaAliquote();
  const [emessi, righe, ricevuti, serie, scartati, bozze] = await Promise.all([
    q(`SELECT d.id, d.tipo, d.tipo_sdi, d.sezionale, d.numero, d.data, d.stato, d.origine, d.imponibile, d.imposta, d.totale,
        coalesce(d.intestatario->>'ragione_sociale', d.intestatario->>'nome', c.ragione_sociale, fa.ragione_sociale, '') AS nome,
        coalesce(nullif(d.intestatario->>'partita_iva', ''), c.partita_iva, fa.partita_iva, '') AS partita_iva,
        coalesce(nullif(d.intestatario->>'nazione', ''), c.nazione, fa.paese, 'IT') AS paese,
        c.aliquota_iva AS aliquota_cliente, coalesce(c.split_payment, false) AS split_payment, ${RIEPILOGO_XML('d.xml')} AS riepilogo_xml
      FROM documenti d LEFT JOIN clienti c ON c.id = d.cliente_id LEFT JOIN fornitori_anagrafica fa ON fa.id = d.fornitore_id
      WHERE d.tipo IN ('fattura', 'nota_credito', 'autofattura') AND d.numero IS NOT NULL AND d.stato <> ALL($3)
        AND d.data BETWEEN $1 AND $2
      ORDER BY d.tipo = 'autofattura', d.data, d.sezionale, d.numero`, [periodo.dal, periodo.al, STATI_ESCLUSI]),
    q(`SELECT r.documento_id, r.quantita, r.prezzo, r.sconto, r.aliquota_iva, r.solo_descrizione
      FROM documenti_righe r JOIN documenti d ON d.id = r.documento_id
      WHERE d.tipo IN ('fattura', 'nota_credito', 'autofattura') AND d.numero IS NOT NULL AND d.data BETWEEN $1 AND $2`, [periodo.dal, periodo.al]),
    // acquisti: tutto l'anno per il protocollo (progressivo nell'anno), poi si tengono quelli del periodo
    q(`SELECT r.id, r.tipo, r.tipo_sdi, r.numero, r.data, r.origine, r.imponibile, r.imposta, r.totale,
        coalesce(f.ragione_sociale, r.intestatario->>'nome', r.intestatario->>'ragione_sociale', '') AS nome,
        coalesce(nullif(r.intestatario->>'partita_iva', ''), f.partita_iva, '') AS partita_iva,
        coalesce(nullif(r.intestatario->>'paese', ''), nullif(r.intestatario->>'nazione', ''), f.paese, 'IT') AS paese,
        CASE WHEN r.data BETWEEN $2 AND $3 THEN ${RIEPILOGO_XML('r.xml')} END AS riepilogo_xml
      FROM documenti_ricevuti r LEFT JOIN fornitori_anagrafica f ON f.id = r.fornitore_id
      WHERE extract(year FROM r.data)::int = $1`, [periodo.anno, periodo.dal, periodo.al]),
    q<{ tipo: string; sezionale: string; numeri: number[] }>(`SELECT tipo, sezionale, array_agg(numero) AS numeri FROM documenti
      WHERE tipo IN ('fattura', 'nota_credito', 'autofattura') AND anno = $1 AND numero IS NOT NULL AND data <= $2 GROUP BY tipo, sezionale`, [periodo.anno, periodo.al]),
    q(`SELECT numero, sezionale, data FROM documenti WHERE tipo IN ('fattura', 'nota_credito', 'autofattura') AND stato = 'scartato' AND data BETWEEN $1 AND $2`, [periodo.dal, periodo.al]),
    q1<{ n: number }>(`SELECT count(*)::int AS n FROM documenti WHERE tipo IN ('fattura', 'nota_credito', 'autofattura') AND stato = 'bozza' AND data BETWEEN $1 AND $2`, [periodo.dal, periodo.al]),
  ]);
  const righePer = new Map<number, any[]>();
  for (const r of righe) righePer.set(r.documento_id, [...(righePer.get(r.documento_id) ?? []), r]);

  const daEmesso = (d: any): RigaRegistro => {
    const { voci, differenza } = riepilogoDocumento({ imponibile: d.imponibile, imposta: d.imposta, xml: d.riepilogo_xml, righe: righePer.get(d.id), aliquotaPredefinita: d.aliquota_cliente, splitPayment: d.tipo !== 'autofattura' && d.split_payment }, aliquote);
    return {
      id: d.id, registro: d.tipo === 'autofattura' ? 'autofatture' : 'vendite', protocollo: null, tipo: d.tipo, tipoSdi: d.tipo_sdi,
      numero: numeroRegistro(d.numero, d.sezionale), data: d.data, nome: d.nome, partitaIva: d.partita_iva ?? '', paese: siglaNazione(d.paese) ?? d.paese ?? '',
      imponibile: Number(d.imponibile), imposta: Number(d.imposta), totale: Number(d.totale), voci, differenza, origine: d.origine, stato: d.stato,
      link: `/amministrazione/documenti/${d.id}`,
    };
  };
  const vendite = emessi.filter(d => d.tipo !== 'autofattura').map(daEmesso);
  const autofatture = emessi.filter(d => d.tipo === 'autofattura').map(daEmesso);
  const acquisti = protocolla(ricevuti as any[]).filter(r => r.data >= periodo.dal && r.data <= periodo.al).map((d): RigaRegistro => {
    const { voci, differenza } = riepilogoDocumento({ imponibile: d.imponibile, imposta: d.imposta, xml: d.riepilogo_xml }, aliquote);
    return {
      id: d.id, registro: 'acquisti', protocollo: d.protocollo, tipo: d.tipo, tipoSdi: d.tipo_sdi, numero: d.numero || '(senza numero)', data: d.data,
      nome: d.nome, partitaIva: d.partita_iva ?? '', paese: siglaNazione(d.paese) ?? d.paese ?? '', imponibile: Number(d.imponibile), imposta: Number(d.imposta),
      totale: Number(d.totale), voci, differenza, origine: d.origine, link: `/amministrazione/ricevuti/${d.id}`,
    };
  });
  const NOMI_SERIE: Record<string, string> = { fattura: 'Fatture', nota_credito: 'Note di credito', autofattura: 'Autofatture' };
  const mancanti = serie.map(s => ({ serie: `${NOMI_SERIE[s.tipo]}${s.sezionale ? ` sezionale ${s.sezionale}` : ''} ${periodo.anno}`, numeri: numeriMancanti(s.numeri.map(Number)) }));
  return {
    periodo, vendite, acquisti, autofatture,
    riepilogo: { vendite: riepilogoRegistro(vendite), acquisti: riepilogoRegistro(acquisti), autofatture: riepilogoRegistro(autofatture) },
    liquidazione: liquidazione(vendite, acquisti, autofatture),
    controlli: controlliRegistro({ vendite, acquisti, autofatture, mancanti,
      scartati: scartati.map(s => ({ numero: numeroRegistro(s.numero, s.sezionale), data: s.data })), bozzeNelPeriodo: bozze?.n ?? 0 }),
  };
}

// ───────────────────────────── Excel per il commercialista ─────────────────────────────

const dataIt = (d: string) => d.split('-').reverse().join('/');
const TIPI: Record<string, string> = { fattura: 'Fattura', nota_credito: 'Nota di credito', autofattura: 'Autofattura' };

/** Excel dei registri: un foglio per registro (una riga per documento e aliquota), riepilogo IVA, liquidazione, controlli. */
export async function excelRegistri(d: DatiRegistri, azienda: { ragione_sociale?: string; partita_iva?: string }): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Portale Casteltech';
  const euro = '#,##0.00';
  const intestazione = (ws: ExcelJS.Worksheet) => {
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
  };
  for (const registro of ['vendite', 'acquisti', 'autofatture'] as Registro[]) {
    const ws = wb.addWorksheet(registro === 'vendite' ? 'Vendite' : registro === 'acquisti' ? 'Acquisti' : 'Autofatture');
    ws.columns = [
      ...(registro === 'acquisti' ? [{ header: 'Protocollo', key: 'protocollo', width: 10 }] : []),
      { header: 'Data documento', key: 'data', width: 13 }, { header: 'Numero', key: 'numero', width: 14 }, { header: 'Tipo', key: 'tipo', width: 15 },
      { header: 'Tipo SdI', key: 'tipoSdi', width: 9 }, { header: registro === 'vendite' ? 'Cliente' : 'Fornitore', key: 'nome', width: 40 },
      { header: 'Partita IVA', key: 'partitaIva', width: 16 }, { header: 'Paese', key: 'paese', width: 7 },
      { header: 'Aliquota %', key: 'percentuale', width: 10 }, { header: 'Natura', key: 'natura', width: 8 }, { header: 'Descrizione IVA', key: 'voce', width: 30 },
      { header: 'Imponibile', key: 'imponibile', width: 14, style: { numFmt: euro } }, { header: 'Imposta', key: 'imposta', width: 12, style: { numFmt: euro } },
      { header: 'Totale documento', key: 'totale', width: 15, style: { numFmt: euro } }, { header: 'Origine', key: 'origine', width: 10 },
    ];
    for (const r of d[registro]) r.voci.forEach((v, i) => {
      const s = segno(r.tipo);
      ws.addRow({
        protocollo: r.protocollo, data: dataIt(r.data), numero: r.numero, tipo: TIPI[r.tipo] ?? r.tipo, tipoSdi: r.tipoSdi ?? '', nome: r.nome,
        partitaIva: r.partitaIva, paese: r.paese, percentuale: v.percentuale, natura: v.natura ?? '', voce: nomeVoce(v),
        imponibile: s * v.imponibile, imposta: s * v.imposta, totale: i === 0 ? s * r.totale : null, origine: r.origine === 'fic' ? 'FIC' : r.origine,
      });
    });
    intestazione(ws);
  }
  const ws = wb.addWorksheet('Riepilogo IVA');
  ws.columns = [{ width: 34 }, { width: 30 }, { width: 14, style: { numFmt: euro } }, { width: 14, style: { numFmt: euro } }, { width: 11 }];
  ws.addRow([`${azienda.ragione_sociale ?? ''} · P.IVA ${azienda.partita_iva ?? ''}`]).font = { bold: true };
  ws.addRow([`Registri IVA · ${d.periodo.nome} (dal ${dataIt(d.periodo.dal)} al ${dataIt(d.periodo.al)})`]);
  ws.addRow([]);
  for (const registro of ['vendite', 'acquisti', 'autofatture'] as Registro[]) {
    ws.addRow([NOMI_REGISTRO[registro], 'Aliquota / natura', 'Imponibile', 'Imposta', 'Documenti']).font = { bold: true };
    for (const v of d.riepilogo[registro].voci) ws.addRow(['', nomeVoce(v), v.imponibile, v.imposta, v.documenti]);
    ws.addRow(['', 'Totale', d.riepilogo[registro].imponibile, d.riepilogo[registro].imposta, d.riepilogo[registro].documenti]).font = { bold: true };
    ws.addRow([]);
  }
  const l = d.liquidazione;
  ws.addRow(['Liquidazione indicativa', '', '', 'Euro']).font = { bold: true };
  for (const [nome, valore] of [...(l.splitPayment ? [['IVA in split payment (la versa la PA, non a debito)', l.splitPayment] as [string, number]] : []), ['IVA a debito sulle vendite', l.debitoVendite], ['IVA a debito sulle autofatture', l.debitoAutofatture],
    ['IVA a credito sugli acquisti', l.creditoAcquisti], ['IVA a credito sulle autofatture', l.creditoAutofatture],
    [l.saldo >= 0 ? 'IVA da versare' : 'IVA a credito', Math.abs(l.saldo)]] as [string, number][]) ws.addRow([nome, '', '', valore]);
  ws.addRow(['Indicativa: non comprende credito del periodo precedente, acconto, IVA indetraibile, interessi trimestrali. La liquidazione la fa il commercialista.']);
  const wc = wb.addWorksheet('Da controllare');
  wc.columns = [{ header: 'Segnalazione', width: 140 }];
  for (const c of d.controlli.length ? d.controlli : ['Nessuna segnalazione.']) wc.addRow([c]);
  wc.getRow(1).font = { bold: true };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export const nomeFileRegistri = (p: Periodo, estensione: string) => `Registri_IVA_${p.anno}_${p.codice}.${estensione}`;

/**
 * Pacchetto per il commercialista (zip): Excel dei registri + file XML delle fatture emesse, autofatture e fatture ricevute
 * del periodo. Scritto mentre si legge, 20 documenti per volta: con gli allegati PDF dei fornitori non sta tutto in memoria.
 */
export async function scriviPacchetto(res: Response, d: DatiRegistri, excel: Buffer) {
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${nomeFileRegistri(d.periodo, 'zip')}"`);
  const zip = new Zip((err, pezzo, fine) => {
    if (err) { res.destroy(err); return; }
    res.write(Buffer.from(pezzo));
    if (fine) res.end();
  });
  const aggiungi = (nome: string, dati: Uint8Array) => { const f = new ZipDeflate(nome, { level: 6 }); zip.add(f); f.push(dati, true); };
  aggiungi(nomeFileRegistri(d.periodo, 'xlsx'), excel);
  const pulito = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 60);
  const lotti = async (sql: string, ids: number[], cartella: string, nome: (r: any) => string) => {
    for (let i = 0; i < ids.length; i += 20) {
      const righe = await q(sql, [ids.slice(i, i + 20)]);
      for (const r of righe) if (r.xml) aggiungi(`${cartella}/${pulito(nome(r))}.xml`, strToU8(r.xml));
    }
  };
  await lotti(`SELECT id, tipo, numero, sezionale, anno, xml FROM documenti WHERE id = ANY($1) AND xml IS NOT NULL`,
    [...d.vendite, ...d.autofatture].map(r => r.id), 'Emesse', r => `${TIPI[r.tipo] ?? r.tipo}_${r.numero}${r.sezionale ? `-${r.sezionale}` : ''}_${r.anno}`);
  const protocolli = new Map(d.acquisti.map(r => [r.id, r.protocollo]));
  await lotti(`SELECT r.id, r.numero, coalesce(f.ragione_sociale, r.intestatario->>'nome', '') AS nome, r.xml FROM documenti_ricevuti r
      LEFT JOIN fornitori_anagrafica f ON f.id = r.fornitore_id WHERE r.id = ANY($1) AND r.xml IS NOT NULL`,
    d.acquisti.map(r => r.id), 'Ricevute', r => `${String(protocolli.get(r.id) ?? r.id).padStart(4, '0')}_${r.nome}_${r.numero}`);
  zip.end();
}
