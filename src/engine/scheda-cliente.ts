/**
 * Scheda unica del cliente (proposta della revisione, Adriano 1/11/2026): una pagina con tutto quel che riguarda un cliente
 * (preventivi, ordini aperti, commesse, DDT da fatturare, fatture e incassi, CRM, prodotti e prezzi). Qui i conti senza database;
 * le letture in server/scheda-cliente-servizio.ts, la pagina in rotte/anagrafiche.ts (/anagrafiche/clienti/:id).
 */
import { eServizio } from './ordini.js';
import { causaleDaFatturare } from './ddt.js';

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
    // le note di credito (importo negativo) tolgono dal totale ma non contano come rate
    const conta = Number(r.importo) > 0 ? 1 : 0;
    if (r.data < oggi) { scaduto += Number(r.importo); scaduteN += conta; } else { aScadere += Number(r.importo); aScadereN += conta; }
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

// ── Codici prodotti per anno (Adriano 5/11/2026: "quanti codici diversi ho fatto di Selea nel 2026? e nel 2025?") ──

export interface RigaConsegna {
  tipo: string;                 // 'ddt' o 'fattura'
  anno: number;
  codice: string | null;
  descrizione: string | null;
  descrizioneAnagrafica?: string | null; // descrizione del prodotto in anagrafica, se la riga è collegata
  quantita: number;
  prodottoId?: number | null;
  causale?: string | null;      // causale del trasporto (DDT)
  ddtId?: number | null;        // riga di fattura nata da un DDT del portale
  citaDdt?: boolean;            // la fattura ha una riga "DDT n. X del …" (storico FIC): le schede sono già nel DDT
}
export interface CodiceAnno { codice: string; descrizione: string; senzaCodice: boolean; pezzi: Record<number, number> }

/**
 * Codici prodotto diversi consegnati al cliente per anno, con i pezzi. Contano le righe dei DDT con causale di vendita o
 * reso lavorato (fuori resi non lavorati, garanzie, conto visione…: `causaleDaFatturare`) e le righe delle fatture emesse
 * senza DDT (fatture dirette). Fuori i servizi (lamine, programmazione, attrezzaggio, trasporto, sconti: `eServizio`),
 * salvo che la riga sia collegata a un prodotto dell'anagrafica. Una riga senza codice conta con la prima riga della
 * descrizione, segnata "senza codice". Descrizione: quella del prodotto in anagrafica, altrimenti della riga più recente (righe
 * passate dalla più recente). Anni: gli ultimi `quanti` fino a `anno` (tutti con `quanti` = 0).
 */
export function codiciPerAnno(righe: RigaConsegna[], anno: number, quanti = 3): { anni: number[]; codici: CodiceAnno[] } {
  const anni: number[] = [];
  if (quanti > 0) for (let a = anno - quanti + 1; a <= anno; a++) anni.push(a);
  else for (const a of new Set(righe.map(r => r.anno))) if (a <= anno) anni.push(a);
  anni.sort((a, b) => a - b);
  const per = new Map<string, CodiceAnno>();
  for (const r of righe) {
    if (!anni.includes(r.anno) || !(Number(r.quantita) > 0)) continue;
    if (r.tipo === 'ddt') { if (!causaleDaFatturare(r.causale)) continue; }
    else if (r.tipo === 'fattura') { if (r.ddtId || r.citaDdt) continue; }
    else continue;
    const primaRiga = String(r.descrizione ?? '').split('\n')[0].trim();
    const codice = String(r.codice ?? '').trim().toUpperCase();
    if (!codice && !primaRiga) continue;
    if (!r.prodottoId && eServizio(codice, primaRiga)) continue;
    const chiave = codice || `~${primaRiga.toUpperCase()}`;
    let c = per.get(chiave);
    if (!c) { c = { codice: codice || primaRiga, descrizione: codice ? primaRiga : '', senzaCodice: !codice, pezzi: {} }; per.set(chiave, c); }
    c.pezzi[r.anno] = (c.pezzi[r.anno] ?? 0) + Number(r.quantita);
    if (codice && r.descrizioneAnagrafica) c.descrizione = r.descrizioneAnagrafica;
  }
  const ultimo = anni[anni.length - 1];
  const codici = [...per.values()].sort((a, b) => (b.pezzi[ultimo] ?? 0) - (a.pezzi[ultimo] ?? 0) || a.codice.localeCompare(b.codice));
  return { anni, codici };
}

/** Quanti codici diversi in ogni anno. */
export function codiciDiversiPerAnno(r: { anni: number[]; codici: CodiceAnno[] }): Record<number, number> {
  const out: Record<number, number> = {};
  for (const a of r.anni) out[a] = r.codici.filter(c => (c.pezzi[a] ?? 0) > 0).length;
  return out;
}
