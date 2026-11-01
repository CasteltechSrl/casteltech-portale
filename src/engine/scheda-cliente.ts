/**
 * Scheda unica del cliente (proposta della revisione, Adriano 1/11/2026): una pagina con tutto quel che riguarda un cliente
 * (preventivi, ordini aperti, commesse, DDT da fatturare, fatture e incassi, CRM, prodotti e prezzi). Qui i conti senza database;
 * le letture in server/scheda-cliente-servizio.ts, la pagina in rotte/anagrafiche.ts (/anagrafiche/clienti/:id).
 */

export interface DocumentoCliente { tipo: string; anno: number; data: string; stato: string; imponibile: number; totale: number }
export interface RataCliente { data: string; importo: number; pagata: boolean }

/** Fatturato per anno (fatture meno note di credito; fuori bozze, annullate e scartate), ultimi `quanti` anni fino a `anno`. */
export function fatturatoPerAnno(documenti: DocumentoCliente[], anno: number, quanti = 3): { anno: number; importo: number }[] {
  const out = new Map<number, number>();
  for (let a = anno - quanti + 1; a <= anno; a++) out.set(a, 0);
  for (const d of documenti) {
    if (!['fattura', 'nota_credito'].includes(d.tipo) || ['bozza', 'annullato', 'scartato'].includes(d.stato) || !out.has(d.anno)) continue;
    out.set(d.anno, out.get(d.anno)! + (d.tipo === 'nota_credito' ? -1 : 1) * Number(d.imponibile || 0));
  }
  return [...out].map(([anno, importo]) => ({ anno, importo }));
}

/** Incassi: scaduto (rate non pagate con data passata) e da incassare (non pagate ma non ancora scadute). */
export function situazioneIncassi(rate: RataCliente[], oggi: string): { scaduto: number; scaduteN: number; aScadere: number; aScadereN: number } {
  let scaduto = 0, scaduteN = 0, aScadere = 0, aScadereN = 0;
  for (const r of rate) {
    if (r.pagata) continue;
    if (r.data < oggi) { scaduto += Number(r.importo); scaduteN++; } else { aScadere += Number(r.importo); aScadereN++; }
  }
  return { scaduto, scaduteN, aScadere, aScadereN };
}

/** Giorni medi di incasso sulle rate pagate (data pagamento − data fattura); null se non ci sono rate pagate. */
export function giorniMediIncasso(rate: { dataFattura: string; pagataIl: string | null }[]): number | null {
  const pagate = rate.filter(r => r.pagataIl);
  if (!pagate.length) return null;
  const giorni = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86_400_000);
  return Math.round(pagate.reduce((t, r) => t + giorni(r.dataFattura, r.pagataIl!), 0) / pagate.length);
}
