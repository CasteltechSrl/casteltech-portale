/**
 * Excel su ogni elenco (proposta della revisione, Adriano 1/11/2026): un foglio con intestazioni in grassetto, date e importi
 * formattati; stesse righe (e stessi filtri) dell'elenco sullo schermo.
 */
import ExcelJS from 'exceljs';
import type { Response } from 'express';

export interface ColonnaExcel { header: string; key: string; width?: number; formato?: 'euro' | 'data' | 'numero' | 'intero' }

export async function excelSemplice(foglio: string, colonne: ColonnaExcel[], righe: Record<string, unknown>[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(foglio.slice(0, 31));
  ws.columns = colonne.map(c => ({ header: c.header, key: c.key, width: c.width ?? Math.max(10, Math.min(50, c.header.length + 4)) }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  for (const r of righe) {
    const riga: Record<string, unknown> = {};
    for (const c of colonne) {
      let v = r[c.key];
      if (c.formato === 'data' && v) { const t = v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10); v = /^\d{4}-\d{2}-\d{2}$/.test(t) ? new Date(`${t}T00:00:00Z`) : v; }
      else if ((c.formato === 'euro' || c.formato === 'numero' || c.formato === 'intero') && v != null && v !== '') v = Number(v);
      riga[c.key] = v ?? '';
    }
    ws.addRow(riga);
  }
  for (const c of colonne) {
    if (c.formato === 'euro') ws.getColumn(c.key).numFmt = '#,##0.00 €';
    else if (c.formato === 'data') ws.getColumn(c.key).numFmt = 'dd/mm/yyyy';
    else if (c.formato === 'numero') ws.getColumn(c.key).numFmt = '#,##0.##';
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Manda il file al browser con il nome dato (es. "preventivi-2026-11-02.xlsx"). */
export function inviaExcel(res: Response, nome: string, dati: Buffer) {
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .setHeader('Content-Disposition', `attachment; filename="${nome.replace(/[^\w.-]+/g, '_')}"`).send(dati);
}

export const nomeExcel = (base: string) => `${base}-${new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' })}.xlsx`;
