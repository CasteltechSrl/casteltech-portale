import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

/**
 * Excel con filtri per colore nelle tabelle (BOM Selea CAMJIO_R2_BOM_DS52, 7/11/2026): ExcelJS non li conosce e rifiuta tutto il file.
 * I filtri non servono a leggere la BOM: si tolgono dalla copia in memoria e si riprova.
 */
export function senzaFiltriTabelle(contenuto: Buffer): Buffer {
  const file = unzipSync(new Uint8Array(contenuto));
  for (const nome of Object.keys(file)) {
    if (!/^xl\/(tables|worksheets)\/[^/]+\.xml$/i.test(nome)) continue;
    const xml = strFromU8(file[nome]);
    const pulito = xml.replace(/<filterColumn\b[^>]*\/>/g, '').replace(/<filterColumn\b[\s\S]*?<\/filterColumn>/g, '');
    if (pulito !== xml) file[nome] = strToU8(pulito);
  }
  return Buffer.from(zipSync(file));
}
