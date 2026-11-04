/** Testo di una cella letta con ExcelJS (BOM, componenti dei clienti): testo ricco, formule, collegamenti, date, errori. */
export function testoCella(v: any): string {
  if (v == null) return '';
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((x: any) => x.text).join('');
    if ('result' in v) return testoCella(v.result);
    if ('text' in v) return String(v.text);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    // formula senza risultato salvato o cella in errore (#N/D, #RIF!): prima diventava "[object Object]" (BOM 15, 4/11/2026)
    if ('error' in v) return String(v.error ?? '');
    return '';
  }
  return String(v).trim();
}
