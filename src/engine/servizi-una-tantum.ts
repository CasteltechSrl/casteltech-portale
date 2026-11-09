/**
 * Servizi una tantum (Adriano 3/11/2026): lamina serigrafica, preparazione della documentazione, programmazione attrezzature,
 * attrezzaggio PCB. Sono uguali per tutti i clienti: codici Casteltech (UT-…) validi per qualunque cliente, eccezione voluta
 * alla regola "ogni codice prodotto ha il suo cliente" (per questo stanno in un'anagrafica a parte, non tra i Prodotti).
 * Servono a contare il venduto per codice ("quante lamine ho venduto"): le righe vecchie senza codice UT (storico di
 * Fatture in Cloud, codici 001/007…) si attribuiscono dalla descrizione, solo se citano UN servizio solo.
 */

export const PREFISSO_SERVIZI = 'UT-';

export interface ServizioUnaTantum { id: number; codice: string; descrizione: string; prezzo: number | null; attivo: boolean }

/** Le voci di partenza (migrazione 066). Il prezzo della lamina è quello standard del preventivo (con trattamenti 165 €, si scrive nella riga). */
export const SERVIZI_INIZIALI = [
  { codice: 'UT-LAMINA', descrizione: 'LAMINA SERIGRAFICA', prezzo: 110 },
  { codice: 'UT-DOCUMENTAZIONE', descrizione: 'PREPARAZIONE DOCUMENTAZIONE DI PRODUZIONE', prezzo: null },
  { codice: 'UT-PROGRAMMAZIONE', descrizione: 'PROGRAMMAZIONE ATTREZZATURE', prezzo: null },
  { codice: 'UT-ATTREZZAGGIO-PCB', descrizione: 'ATTREZZAGGIO PCB', prezzo: null },
  // generico (Adriano 9/11/2026, migrazione 083): tutti i costi una tantum insieme senza dividerli (lamina, programmazioni…)
  { codice: 'UT-COSTI-UNA-TANTUM', descrizione: 'COSTI UNA TANTUM', prezzo: null },
];

/** Servizio generico che raccoglie più costi una tantum nella stessa riga (Adriano 9/11/2026). */
export const SERVIZIO_GENERICO = 'UT-COSTI-UNA-TANTUM';

/** Parole che dicono di quale servizio parla una descrizione (righe senza codice UT). */
const PAROLE: Record<string, RegExp> = {
  'UT-LAMINA': /\b(LAMIN[AE]|STENCIL)\b/,
  'UT-DOCUMENTAZIONE': /\bDOCUMENTAZIONE\b/,
  'UT-PROGRAMMAZIONE': /\bPROGRAMMAZION[EI]\s+(ATTREZZATUR[AE]|MACCHIN[AE]|P\s*&\s*P|PICK|AOI|SERIGRAFIA)|\bPROGRAMMING\b/,
  'UT-ATTREZZAGGIO-PCB': /\bATTREZZAGGIO\b(?!\s+MACCHIN)|\bATTREZZATURA\s+PER\s+(PCB|MONTAGGIO)\b/,
};

const pulito = (s: unknown) => String(s ?? '').toUpperCase().replace(/\s+/g, ' ').trim();

/** Codice di un servizio una tantum? (UT-…) */
export const eCodiceServizio = (codice: unknown) => pulito(codice).startsWith(PREFISSO_SERVIZI);

/** Servizi citati in una descrizione (anche più di uno: "LAMINA + PROGRAMMAZIONE ATTREZZATURE"). */
export function serviziNellaDescrizione(descrizione: unknown): string[] {
  const t = pulito(descrizione);
  if (/\bCOMPRENSIV[IOAE]\b/.test(t)) return [];      // "schede … comprensive dei costi di attrezzaggio": è la riga del prodotto
  return Object.entries(PAROLE).filter(([, re]) => re.test(t)).map(([k]) => k);
}

/**
 * Servizio di una riga: il codice UT scritto nella riga, altrimenti quello dalla descrizione se ce n'è uno solo
 * (fra quelli in anagrafica). Una riga che ne unisce più ("costi una tantum: lamina, programmazione…") non si attribuisce.
 */
export function servizioDellaRiga(codice: unknown, descrizione: unknown, codiciValidi: string[]): string | null {
  const c = pulito(codice);
  if (eCodiceServizio(c)) return codiciValidi.includes(c) ? c : null;
  const trovati = serviziCitati(descrizione).filter(k => codiciValidi.includes(k));
  return trovati.length === 1 ? trovati[0] : null;
}

/**
 * Servizi citati da una riga di documento. Conta la PRIMA riga della descrizione: le righe del prodotto spesso elencano sotto
 * cosa comprende il prezzo ("PCB CONTROLLO MOTORE / - LAMINA SERIGRAFICA"); tutto il testo solo se la prima riga dice "una tantum".
 */
function serviziCitati(descrizione: unknown): string[] {
  const testo = String(descrizione ?? '');
  const prima = testo.split(/\r?\n/).find(r => r.trim()) ?? '';
  return serviziNellaDescrizione(/\bUNA\s+TANTUM\b/i.test(prima) ? testo : prima);
}

/** Controllo di una voce nuova o corretta: codice UT-…, MAIUSCOLO, descrizione obbligatoria, prezzo facoltativo ≥ 0. */
export function controllaServizio(x: { codice?: unknown; descrizione?: unknown; prezzo?: unknown }):
  { errore: string; campo: string } | { codice: string; descrizione: string; prezzo: number | null } {
  let codice = pulito(x.codice).replace(/\s+/g, '-');
  if (codice && !eCodiceServizio(codice)) codice = PREFISSO_SERVIZI + codice;
  if (!/^UT-[A-Z0-9][A-Z0-9-]{1,38}$/.test(codice)) return { errore: 'Codice non valido: UT- seguito da lettere, numeri e trattini (es. UT-COLLAUDO).', campo: 'codice' };
  const descrizione = pulito(x.descrizione);
  if (!descrizione) return { errore: 'Scrivi la descrizione.', campo: 'descrizione' };
  const testo = String(x.prezzo ?? '').trim().replace(/[€\s]/g, '');
  let prezzo: number | null = null;
  if (testo) {
    prezzo = Number(testo.includes(',') ? testo.replace(/\./g, '').replace(',', '.') : testo);
    if (!Number.isFinite(prezzo) || prezzo < 0) return { errore: 'Prezzo non valido.', campo: 'prezzo' };
  }
  return { codice, descrizione, prezzo };
}

export interface RigaVenduta { codice: string | null; descrizione: string | null; anno: number; quantita: number; importo: number }
export interface Venduto { codice: string; anni: Record<number, { quantita: number; importo: number; righe: number }> }

/**
 * Venduto per servizio e per anno dalle righe delle fatture emesse (note di credito in negativo, già con il segno nelle righe).
 * Le righe che uniscono più servizi finiscono in "insieme" (si vedono a parte, non si dividono a caso).
 */
export function vendutoPerServizio(righe: RigaVenduta[], codiciValidi: string[]): { perCodice: Venduto[]; insieme: { anno: number; righe: number; importo: number }[] } {
  const mappa = new Map<string, Venduto>(codiciValidi.map(c => [c, { codice: c, anni: {} }]));
  const insieme = new Map<number, { anno: number; righe: number; importo: number }>();
  for (const r of righe) {
    const s = servizioDellaRiga(r.codice, r.descrizione, codiciValidi);
    if (s) {
      const a = (mappa.get(s)!.anni[r.anno] ??= { quantita: 0, importo: 0, righe: 0 });
      a.quantita += r.quantita; a.importo += r.importo; a.righe++;
    } else if (!eCodiceServizio(r.codice) && serviziCitati(r.descrizione).length > 1) {
      const a = insieme.get(r.anno) ?? { anno: r.anno, righe: 0, importo: 0 };
      a.righe++; a.importo += r.importo; insieme.set(r.anno, a);
    }
  }
  return { perCodice: [...mappa.values()], insieme: [...insieme.values()].sort((a, b) => b.anno - a.anno) };
}

/**
 * Ordine da e-mail e PDF: servizio proposto per una riga di servizio (se la descrizione ne cita uno solo); una riga che dice
 * "una tantum" e ne cita nessuno o più d'uno ("COSTO UNA TANTUM - SPESE REALIZZAZIONE…") = il generico UT-COSTI-UNA-TANTUM.
 */
export function servizioProposto(descrizione: unknown, servizi: Pick<ServizioUnaTantum, 'codice' | 'attivo'>[]): string | null {
  const attivi = servizi.filter(s => s.attivo).map(s => s.codice);
  const uno = servizioDellaRiga(null, descrizione, attivi);
  if (uno) return uno;
  const t = pulito(descrizione);
  return attivi.includes(SERVIZIO_GENERICO) && /\bUNA\s+TANTUM\b/.test(t) && !/\bCOMPRENSIV[IOAE]\b/.test(t) ? SERVIZIO_GENERICO : null;
}
