/**
 * Azioni con le spunte nell'elenco dei documenti emessi (Amministrazione → Documenti emessi): letture e scritture.
 * Le regole (chi va bene per quale pulsante) stanno in `engine/azioni-documenti.ts`.
 */
import ExcelJS from 'exceljs';
import { Zip, ZipDeflate, strToU8 } from 'fflate';
import type { Response } from 'express';
import { q, transazione } from './db.js';
import { numeroCompleto } from '../engine/amministrazione.js';
import type { DocumentoElenco } from '../engine/azioni-documenti.js';
import { creaBozza } from './documenti-servizio.js';

export interface DocumentoSpuntato extends DocumentoElenco {
  sezionale: string | null; anno: number; data: string; intestatario: string | null; imponibile: number; totale: number; etichetta: string;
}

/** I documenti spuntati (solo del tipo dell'elenco, così da un elenco non si tocca altro). */
export async function documentiSpuntati(ids: number[], tipo: string): Promise<DocumentoSpuntato[]> {
  if (!ids.length) return [];
  const righe = await q(`SELECT d.id, d.tipo, d.numero, d.sezionale, d.anno, d.data, d.stato, d.origine, d.cliente_id, d.fattura_id, d.fatturato_altrove,
      d.imponibile::float AS imponibile, d.totale::float AS totale, d.xml IS NOT NULL AS ha_xml,
      coalesce(c.ragione_sociale, fa.ragione_sociale, d.intestatario->>'ragione_sociale', d.intestatario->>'nome') AS intestatario
    FROM documenti d LEFT JOIN clienti c ON c.id = d.cliente_id LEFT JOIN fornitori_anagrafica fa ON fa.id = d.fornitore_id
    WHERE d.id = ANY($1) AND d.tipo = $2 ORDER BY d.data, d.numero NULLS LAST, d.id`, [ids, tipo]);
  return righe.map(r => ({ ...r, etichetta: r.numero == null ? 'bozza' : `n. ${numeroCompleto(r.numero, r.sezionale ?? undefined)}` }));
}

/** DDT segnati "Già fatturato" (anticipo, proforma o fattura di FIC senza collegamento): escono dai DDT da fatturare. */
export async function segnaGiaFatturati(ids: number[], chi: string): Promise<number> {
  if (!ids.length) return 0;
  const nota = `Già fatturato (anticipo o Fatture in Cloud), segnato da ${chi} il ${new Date().toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' })}`;
  const r = await q(`UPDATE documenti SET fatturato_altrove = $2 WHERE id = ANY($1) AND tipo = 'ddt' AND fattura_id IS NULL AND fatturato_altrove IS NULL RETURNING id`, [ids, nota]);
  return r.length;
}

/** Toglie il segno "Già fatturato": il DDT torna tra quelli da fatturare. */
export async function rimettiDaFatturare(id: number): Promise<void> {
  await q(`UPDATE documenti SET fatturato_altrove = NULL WHERE id = $1 AND tipo = 'ddt'`, [id]);
}

/** Elimina le bozze (stessa regola di "Elimina bozza": stato bozza e nessun numero). */
export async function eliminaBozze(ids: number[]): Promise<number> {
  if (!ids.length) return 0;
  return (await q(`DELETE FROM documenti WHERE id = ANY($1) AND stato = 'bozza' AND numero IS NULL RETURNING id`, [ids])).length;
}

const NOMI_TIPO: Record<string, string> = { fattura: 'Fattura', nota_credito: 'Nota_di_credito', autofattura: 'Autofattura', ddt: 'DDT' };
const pulito = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 60);
export const nomeFileXml = (d: { tipo: string; numero: number | null; sezionale: string | null; anno: number; intestatario?: string | null }) =>
  pulito(`${NOMI_TIPO[d.tipo] ?? d.tipo}_${d.numero ?? 'bozza'}${d.sezionale ? `-${d.sezionale}` : ''}_${d.anno}${d.intestatario ? `_${d.intestatario}` : ''}`) + '.xml';

/** XML dei documenti spuntati: uno solo = il file, più di uno = zip scritto a pezzi (20 per volta, come i registri IVA). */
export async function scriviXml(res: Response, docs: DocumentoSpuntato[], tipo: string) {
  if (docs.length === 1) {
    const [r] = await q(`SELECT xml FROM documenti WHERE id = $1`, [docs[0].id]);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${nomeFileXml(docs[0])}"`);
    return res.send(r.xml);
  }
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${NOMI_TIPO[tipo] ?? 'Documenti'}_XML_${docs.length}.zip"`);
  const zip = new Zip((err, pezzo, fine) => {
    if (err) { res.destroy(err); return; }
    res.write(Buffer.from(pezzo));
    if (fine) res.end();
  });
  const perId = new Map(docs.map(d => [d.id, d]));
  for (let i = 0; i < docs.length; i += 20) {
    const righe = await q(`SELECT id, xml FROM documenti WHERE id = ANY($1) AND xml IS NOT NULL`, [docs.slice(i, i + 20).map(d => d.id)]);
    for (const r of righe) { const f = new ZipDeflate(nomeFileXml(perId.get(r.id)!), { level: 6 }); zip.add(f); f.push(strToU8(r.xml), true); }
  }
  zip.end();
}

const STATI: Record<string, string> = { bozza: 'Bozza', emesso: 'Emesso', inviato: 'Inviato allo SdI', consegnato: 'Consegnato',
  non_consegnato: 'Non consegnato', scartato: 'Scartato', annullato: 'Annullato' };

/** Excel con l'elenco dei documenti spuntati (e, per le fatture, quanto resta da incassare). */
export async function excelDocumenti(docs: DocumentoSpuntato[], tipo: string): Promise<Buffer> {
  const aperti = new Map((await q(`SELECT documento_id, sum(importo)::float AS aperto FROM documenti_scadenze
    WHERE documento_id = ANY($1) AND pagata_il IS NULL GROUP BY documento_id`, [docs.map(d => d.id)])).map(r => [r.documento_id, r.aperto]));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(NOMI_TIPO[tipo]?.replace(/_/g, ' ') ?? 'Documenti');
  const conImporti = tipo !== 'ddt';
  ws.columns = [
    { header: 'Numero', key: 'numero', width: 12 }, { header: 'Data', key: 'data', width: 12 }, { header: 'Intestatario', key: 'intestatario', width: 40 },
    ...(conImporti ? [{ header: 'Imponibile', key: 'imponibile', width: 14 }, { header: 'IVA', key: 'iva', width: 12 }, { header: 'Totale', key: 'totale', width: 14 },
      { header: 'Da incassare', key: 'aperto', width: 14 }] : [{ header: 'Fatturato', key: 'fatturato', width: 12 }]),
    { header: 'Stato', key: 'stato', width: 16 }, { header: 'Origine', key: 'origine', width: 10 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const d of docs) ws.addRow({
    numero: d.numero == null ? 'bozza' : numeroCompleto(d.numero, d.sezionale ?? undefined), data: new Date(`${d.data}T00:00:00Z`), intestatario: d.intestatario ?? '',
    imponibile: d.imponibile, iva: Math.round((d.totale - d.imponibile) * 100) / 100, totale: d.totale, aperto: aperti.get(d.id) ?? 0,
    fatturato: d.fattura_id ? 'sì' : '', stato: STATI[d.stato] ?? d.stato, origine: d.origine === 'fic' ? 'FIC' : 'portale',
  });
  ws.getColumn('data').numFmt = 'dd/mm/yyyy';
  if (conImporti) for (const k of ['imponibile', 'iva', 'totale', 'aperto']) ws.getColumn(k).numFmt = '#,##0.00 €';
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Rate ancora da incassare delle fatture spuntate (per la pagina "Segna incassate"). */
export async function rateAperte(ids: number[]) {
  if (!ids.length) return [];
  return q(`SELECT s.id, s.documento_id, s.data, s.importo::float AS importo FROM documenti_scadenze s
    WHERE s.documento_id = ANY($1) AND s.pagata_il IS NULL ORDER BY s.data, s.id`, [ids]);
}

/** Segna incassate le rate scelte (solo di fatture emesse, solo quelle ancora aperte). */
export async function segnaIncassate(rate: number[], giorno: string, modo: string, conto: string | null): Promise<number> {
  if (!rate.length) return 0;
  const fatte = await q<{ documento_id: number }>(`UPDATE documenti_scadenze s SET pagata_il = $2, modo = $3, conto = $4 FROM documenti d
    WHERE s.id = ANY($1) AND s.pagata_il IS NULL AND d.id = s.documento_id AND d.tipo = 'fattura' AND d.numero IS NOT NULL
    RETURNING s.documento_id`, [rate, giorno, modo, conto]);
  await compensaNoteCredito(fatte.map(r => r.documento_id));
  return fatte.length;
}

/**
 * Note di credito compensate (Adriano 1/11/2026, come in Fatture in Cloud): quando la fattura stornata è tutta incassata, le rate ancora
 * aperte delle sue note di credito si chiudono da sole con modo "Compensato con fattura" e la scritta "Compensazione con fattura n. X",
 * alla data dell'ultimo incasso della fattura (o della nota, se è più recente). Restituisce quante rate ha chiuso.
 */
export async function compensaNoteCredito(fattureIds: number[]): Promise<number> {
  const ids = [...new Set(fattureIds)];
  if (!ids.length) return 0;
  return (await q(`UPDATE documenti_scadenze s SET pagata_il = greatest(nc.data, (SELECT max(x.pagata_il) FROM documenti_scadenze x WHERE x.documento_id = f.id)),
      modo = 'Compensato con fattura', conto = 'Compensazione con fattura n. ' || f.numero || coalesce(nullif('/' || f.sezionale, '/'), '') || ' del ' || to_char(f.data, 'DD/MM/YYYY')
    FROM documenti nc JOIN documenti f ON f.id = nc.documento_origine_id
    WHERE s.documento_id = nc.id AND s.pagata_il IS NULL AND nc.tipo = 'nota_credito' AND nc.stato NOT IN ('bozza', 'annullato', 'scartato')
      AND f.id = ANY($1) AND f.tipo = 'fattura'
      AND NOT EXISTS (SELECT 1 FROM documenti_scadenze y WHERE y.documento_id = f.id AND y.pagata_il IS NULL)
    RETURNING s.id`, [ids])).length;
}

/**
 * Copia di una fattura come nuova bozza con la data di oggi: stesso cliente, pagamento, tipo (differita e nota di debito tornano
 * fattura normale), riferimenti del cliente (ordine, CIG/CUP) e righe. Restano fuori i DDT, gli acconti scalati e i collegamenti a ordine e
 * commessa, che valgono una volta sola.
 */
export async function duplicaFattura(id: number, creatoDa: number | null): Promise<number | null> {
  const [f] = await q(`SELECT * FROM documenti WHERE id = $1 AND tipo = 'fattura' AND cliente_id IS NOT NULL`, [id]);
  if (!f) return null;
  const tipoSdi = ['TD24', 'TD05'].includes(f.tipo_sdi) ? 'TD01' : f.tipo_sdi ?? 'TD01';
  const nuova = await creaBozza('fattura', f.cliente_id, creatoDa, undefined, { tipo_sdi: tipoSdi, riferimento_esterno: f.riferimento_esterno });
  await transazione(async c => {
    await c.query(`UPDATE documenti SET condizione_pagamento = $2, cig = $3, cup = $4, data_ordine = $5, note = $6 WHERE id = $1`,
      [nuova, f.condizione_pagamento, f.cig ?? null, f.cup ?? null, f.data_ordine ?? null, f.note ?? null]);
    await c.query(`INSERT INTO documenti_righe (documento_id, posizione, solo_descrizione, prodotto_id, codice, descrizione, quantita, um, prezzo, sconto, aliquota_iva)
      SELECT $1, row_number() OVER (ORDER BY posizione), solo_descrizione, prodotto_id, codice, descrizione, quantita, um, prezzo, sconto, aliquota_iva
      FROM documenti_righe WHERE documento_id = $2 AND ddt_id IS NULL AND acconto_id IS NULL ORDER BY posizione`, [nuova, id]);
  });
  return nuova;
}
