/**
 * XML delle fatture emesse con Fatture in Cloud (Adriano 9/11/2026, anticipo fatture in BPER: "Carica file .xml con Standard SdI").
 * Lo storico di FIC portava solo i dati: l'XML vero sta nell'export di FIC (Project Files → archivio-fic/export-fic-2026). Qui si legge
 * dall'XML quale documento è (tipo, numero, data) per attaccarlo al documento del portale giusto, così "Scarica XML" funziona anche per loro.
 */
export interface DatiXmlFattura { tipo: 'fattura' | 'nota_credito' | 'autofattura'; tipoSdi: string; numero: number; data: string; numeroTesto: string }

const tag = (xml: string, nome: string) => xml.match(new RegExp(`<(?:[\\w-]+:)?${nome}>\\s*([^<]*?)\\s*</(?:[\\w-]+:)?${nome}>`))?.[1] ?? null;

export function datiXmlFattura(xml: string): DatiXmlFattura | null {
  const generali = xml.match(/<(?:[\w-]+:)?DatiGeneraliDocumento>([\s\S]*?)<\/(?:[\w-]+:)?DatiGeneraliDocumento>/)?.[1];
  if (!generali) return null;
  const tipoSdi = tag(generali, 'TipoDocumento'), numeroTesto = tag(generali, 'Numero'), data = tag(generali, 'Data');
  if (!tipoSdi || !numeroTesto || !data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return null;
  const numero = Number(numeroTesto.match(/\d+/)?.[0]);
  if (!Number.isInteger(numero) || numero <= 0) return null;
  const tipo = tipoSdi === 'TD04' ? 'nota_credito' : ['TD17', 'TD18', 'TD19', 'TD16', 'TD20', 'TD21', 'TD27', 'TD28'].includes(tipoSdi) ? 'autofattura' : 'fattura';
  return { tipo, tipoSdi, numero, data, numeroTesto };
}
