/**
 * Documentazione dei prodotti (Adriano 6/11/2026): per ogni codice prodotto si tengono le REVISIONI dei documenti del cliente
 * (BOM, pick and place, Gerber) come riassunto, non come file: "l'idea è quella di non pesare sul portale, ma solo su Google Drive".
 *  - La revisione si legge dai file (intestazione della BOM, Gerber X2, GenCAD, nomi di cartelle e file: "Rev.C", "V1.0.7", "r2"); se non c'è è "0".
 *  - Quando arriva una revisione nuova si confrontano i due riassunti componente per componente (riferimento): aggiunti, tolti, cambiati
 *    (P/N, valore, case, lato, montaggio), conteggi e misure. Se il progetto è stravolto (meno della metà dei riferimenti in comune,
 *    o misure molto diverse) il confronto non ha senso e si dice solo quello.
 * Nessun accesso al database.
 */
import type { AnalisiScheda } from './scheda/analisi.js';
import type { Lato } from './scheda/pick-place.js';
import { pulisciRevisione } from './scheda/prodotto.js';

export interface ComponenteRiassunto {
  ref: string;
  pn: string;
  valore: string;
  case: string;
  descrizione: string;
  tipo: 'SMD' | 'THT';
  lato: Lato | null;
  montato: boolean;
}

export interface FileRiassunto { nome: string; tipo: string; byte: number; usato: boolean }

export interface RiassuntoDocumenti {
  /** file del pacchetto: nome, tipo, dimensione, usato nell'analisi (il file resta sul Drive) */
  file: FileRiassunto[];
  fonti: { bom: string | null; pickPlace: string[]; gerber: string[]; cad: string | null; forature: string[] };
  componenti: ComponenteRiassunto[];
  conteggi: { smdTop: number; smdBot: number; tht: number; nonMontati: number; codiciDiversi: number; feederTop: number; feederBot: number; refori: number | null };
  lavorazione: { latiSmd: 0 | 1 | 2; saldaturaTht: 'onda' | 'mano' | null };
  dimensioni: { larghezza: number; altezza: number; stima: boolean } | null;
  /** strati Gerber trovati: ruolo e lato (rame TOP, pasta BOT, …) */
  strati: { nome: string; ruolo: string; lato: Lato | null }[];
  segnalazioni: { errori: number; avvisi: number; testi: string[] };
  prodotto: { codice: string | null; descrizione: string | null; revisione: string | null; fonti: Record<string, string> } | null;
}

const pulisci = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** Riassunto compatto dell'elaborazione di un pacchetto: quello che si conserva nel portale al posto dei file. */
export function riassuntoDaAnalisi(
  analisi: AnalisiScheda,
  file: { nome: string; tipo: string; byte: number; usato: boolean }[],
  fonti: { bom: string | null; pickPlace: string[]; gerber: string[]; cad: string | null; forature: string[] },
  strati: { nome: string; ruolo: string; lato: Lato | null }[],
): RiassuntoDocumenti {
  const componenti: ComponenteRiassunto[] = analisi.componenti.map(c => ({
    ref: c.ref, pn: pulisci(c.codiceCliente || c.bom?.pn || c.pp?.codice), valore: pulisci(c.bom?.valore || c.pp?.valore),
    case: pulisci(c.bom?.footprint || c.pp?.footprint), descrizione: pulisci(c.bom?.descrizione).slice(0, 120),
    tipo: c.tipo, lato: c.lato, montato: c.montato,
  })).sort((a, b) => a.ref.localeCompare(b.ref, 'it', { numeric: true }));
  const codici = new Set(componenti.filter(c => c.montato).map(c => c.pn || `${c.valore}|${c.case}`));
  const errori = analisi.segnalazioni.filter(s => s.livello === 'errore' && !s.accettata);
  const avvisi = analisi.segnalazioni.filter(s => s.livello === 'avviso' && !s.accettata);
  return {
    file: file.map(f => ({ nome: f.nome, tipo: f.tipo, byte: f.byte, usato: f.usato })),
    fonti: { bom: fonti.bom, pickPlace: fonti.pickPlace, gerber: fonti.gerber, cad: fonti.cad, forature: fonti.forature },
    componenti,
    conteggi: { smdTop: analisi.conteggi.smdTop, smdBot: analisi.conteggi.smdBot, tht: analisi.conteggi.tht, nonMontati: analisi.conteggi.nonMontati,
      codiciDiversi: codici.size, feederTop: analisi.conteggi.feederTop, feederBot: analisi.conteggi.feederBot, refori: analisi.conteggi.refori },
    lavorazione: { latiSmd: analisi.lavorazione.latiSmd, saldaturaTht: analisi.lavorazione.saldaturaTht },
    dimensioni: analisi.dimensioni,
    strati: strati.map(s => ({ nome: s.nome, ruolo: s.ruolo, lato: s.lato })),
    segnalazioni: { errori: errori.length, avvisi: avvisi.length, testi: [...errori, ...avvisi].slice(0, 30).map(s => s.testo.slice(0, 200)) },
    prodotto: analisi.prodotto ? { codice: analisi.prodotto.codice, descrizione: analisi.prodotto.descrizione, revisione: analisi.prodotto.revisione, fonti: { ...analisi.prodotto.fonti } } : null,
  };
}

// ───────────────────────────── revisione ─────────────────────────────

/** "Rev.C", "RevA", "rev 2026-M3", "_V4", "V1.0.7", "r2", "R03", "Rev_B": il pezzo dopo l'etichetta, senza l'estensione del file. */
// La lettera da sola ("Rev.C") vale solo dopo REV/VER: "RX8 PLUS" è il nome della scheda, non la revisione "X8" (Idea SL_0107, 7/11/2026).
const RE_REVISIONE = /(?:^|[\s_\-.(\[])(?:(?:REV(?:ISION[E]?)?|VERSION[E]?|VER)[\s_.:\-]?([0-9][0-9A-Z.\-]{0,12}|(?<!VERSION|REVISION)[A-Z][0-9]?)|[VR][\s_.:\-]?([0-9][0-9A-Z.\-]{0,12}))(?=$|[\s_\-.)\]/\\])/i;

/** "GA-634r2", "GA944r2": la "r" attaccata al codice, seguita da una o due cifre. */
const RE_REVISIONE_ATTACCATA = /(?<=\d)R(\d{1,2})(?=$|[\s_\-.)\]/\\])/i;

/**
 * Revisione dai nomi di cartelle e file (quando BOM, Gerber e GenCAD non la dicono): prima la cartella del pacchetto, poi i file usati
 * (BOM per prima), poi gli altri. Niente = null (chi chiama mette "0").
 */
export function revisioneDaNomi(nomi: string[]): { revisione: string; fonte: string } | null {
  for (const nome of nomi) {
    const pezzi = nome.replace(/\.[A-Za-z0-9]{1,6}$/, '').split(/[\\/]/).reverse();
    for (const pezzo of pezzi) {
      const m = RE_REVISIONE.exec(pezzo) ?? RE_REVISIONE_ATTACCATA.exec(pezzo);
      if (!m) continue;
      const rev = pulisciRevisione(m[1] ?? m[2]).replace(/[.\-]+$/, '');
      if (!rev || /^\d{4}$/.test(rev) && Number(rev) > 1990) continue;  // "V2026" è un anno, non una revisione
      return { revisione: rev, fonte: `nome "${pezzo}"` };
    }
  }
  return null;
}

/**
 * Revisione da scrivere sulla riga nuova: quella letta dai file (intestazione della BOM, Gerber, GenCAD), altrimenti dai nomi, altrimenti "0".
 * Se è già usata da una revisione dello stesso prodotto diventa "C-2", "C-3"… (stessa revisione del cliente, documenti ricaricati).
 */
export function revisioneProposta(opz: { daFile: string | null; fonteFile?: string; nomi: string[]; esistenti: string[] }): { revisione: string; fonte: string } {
  let base = opz.daFile ? { revisione: pulisciRevisione(opz.daFile), fonte: opz.fonteFile ?? 'documenti' } : null;
  if (!base?.revisione) base = revisioneDaNomi(opz.nomi);
  if (!base?.revisione) base = { revisione: '0', fonte: 'non trovata nei file: revisione 0' };
  const usate = new Set(opz.esistenti.map(r => r.toUpperCase()));
  if (!usate.has(base.revisione.toUpperCase())) return base;
  for (let n = 2; n < 100; n++) {
    const r = `${base.revisione}-${n}`;
    if (!usate.has(r.toUpperCase())) return { revisione: r, fonte: `${base.fonte}; già presente, documenti ricaricati` };
  }
  return base;
}

// ───────────────────────────── confronto ─────────────────────────────

export interface DifferenzaComponente { ref: string; campo: 'P/N' | 'valore' | 'case' | 'lato' | 'montaggio' | 'montato'; prima: string; dopo: string }

export interface Confronto {
  /** progetto stravolto: il confronto riga per riga non ha senso */
  stravolto: boolean;
  motivo: string;
  inComune: number;
  aggiunti: ComponenteRiassunto[];
  tolti: ComponenteRiassunto[];
  cambiati: DifferenzaComponente[];
  conteggi: { voce: string; prima: number | string; dopo: number | string }[];
  strati: { aggiunti: string[]; tolti: string[] };
  uguale: boolean;
}

/** Sotto questa quota di riferimenti in comune il progetto è "stravolto" (regola scelta il 6/11/2026). */
export const QUOTA_STRAVOLTO = 0.5;
/** Misure diverse di oltre il 20 % = scheda diversa. */
export const SCARTO_MISURE = 0.2;

const norm = (s: string) => s.replace(/[\s\-_.,/]/g, '').toUpperCase();
const testoLati = (n: number) => n === 2 ? 'TOP+BOT' : n === 1 ? '1 lato' : 'nessuno';
const misure = (d: RiassuntoDocumenti['dimensioni']) => d ? `${d.larghezza} × ${d.altezza} mm${d.stima ? ' (stima)' : ''}` : '—';

/** Confronto tra la revisione vecchia e quella nuova: componenti per riferimento, conteggi, strati Gerber. */
export function confrontaRevisioni(vecchia: RiassuntoDocumenti, nuova: RiassuntoDocumenti): Confronto {
  const prima = new Map(vecchia.componenti.map(c => [c.ref.toUpperCase(), c]));
  const dopo = new Map(nuova.componenti.map(c => [c.ref.toUpperCase(), c]));
  const perRef = (a: ComponenteRiassunto, b: ComponenteRiassunto) => a.ref.localeCompare(b.ref, 'it', { numeric: true });
  const aggiunti = nuova.componenti.filter(c => !prima.has(c.ref.toUpperCase())).sort(perRef);
  const tolti = vecchia.componenti.filter(c => !dopo.has(c.ref.toUpperCase())).sort(perRef);
  const cambiati: DifferenzaComponente[] = [];
  let inComune = 0;
  for (const [ref, v] of prima) {
    const n = dopo.get(ref);
    if (!n) continue;
    inComune++;
    if (v.pn && n.pn && norm(v.pn) !== norm(n.pn)) cambiati.push({ ref: n.ref, campo: 'P/N', prima: v.pn, dopo: n.pn });
    else if (!v.pn && !n.pn && norm(v.valore) !== norm(n.valore)) cambiati.push({ ref: n.ref, campo: 'valore', prima: v.valore, dopo: n.valore });
    if (v.case && n.case && norm(v.case) !== norm(n.case)) cambiati.push({ ref: n.ref, campo: 'case', prima: v.case, dopo: n.case });
    if (v.lato && n.lato && v.lato !== n.lato) cambiati.push({ ref: n.ref, campo: 'lato', prima: v.lato, dopo: n.lato });
    if (v.tipo !== n.tipo) cambiati.push({ ref: n.ref, campo: 'montaggio', prima: v.tipo, dopo: n.tipo });
    if (v.montato !== n.montato) cambiati.push({ ref: n.ref, campo: 'montato', prima: v.montato ? 'sì' : 'no', dopo: n.montato ? 'sì' : 'no' });
  }
  const conteggi: Confronto['conteggi'] = [];
  const voce = (nome: string, a: number | string | null, b: number | string | null) => { if (a !== b) conteggi.push({ voce: nome, prima: a ?? '—', dopo: b ?? '—' }); };
  voce('SMD TOP', vecchia.conteggi.smdTop, nuova.conteggi.smdTop);
  voce('SMD BOT', vecchia.conteggi.smdBot, nuova.conteggi.smdBot);
  voce('THT', vecchia.conteggi.tht, nuova.conteggi.tht);
  voce('Non montati', vecchia.conteggi.nonMontati, nuova.conteggi.nonMontati);
  voce('Codici diversi', vecchia.conteggi.codiciDiversi, nuova.conteggi.codiciDiversi);
  voce('Lati SMD', testoLati(vecchia.lavorazione.latiSmd), testoLati(nuova.lavorazione.latiSmd));
  voce('Saldatura THT', vecchia.lavorazione.saldaturaTht ?? '—', nuova.lavorazione.saldaturaTht ?? '—');
  voce('Misure', misure(vecchia.dimensioni), misure(nuova.dimensioni));
  const chiaveStrato = (s: { ruolo: string; lato: Lato | null }) => `${s.ruolo}${s.lato ? ' ' + s.lato : ''}`;
  const sPrima = new Set(vecchia.strati.map(chiaveStrato)), sDopo = new Set(nuova.strati.map(chiaveStrato));
  const strati = { aggiunti: [...sDopo].filter(s => !sPrima.has(s)), tolti: [...sPrima].filter(s => !sDopo.has(s)) };

  const massimo = Math.max(prima.size, dopo.size);
  let stravolto = false, motivo = '';
  if (massimo > 0 && inComune < massimo * QUOTA_STRAVOLTO) {
    stravolto = true;
    motivo = `solo ${inComune} riferimenti su ${massimo} sono in comune tra le due revisioni: il progetto è stato rifatto, il confronto riga per riga non ha senso`;
  } else if (vecchia.dimensioni && nuova.dimensioni && !vecchia.dimensioni.stima && !nuova.dimensioni.stima) {
    const dl = Math.abs(vecchia.dimensioni.larghezza - nuova.dimensioni.larghezza) / Math.max(1, vecchia.dimensioni.larghezza);
    const dh = Math.abs(vecchia.dimensioni.altezza - nuova.dimensioni.altezza) / Math.max(1, vecchia.dimensioni.altezza);
    if (dl > SCARTO_MISURE || dh > SCARTO_MISURE) {
      stravolto = true;
      motivo = `la scheda ha misure molto diverse (${misure(vecchia.dimensioni)} → ${misure(nuova.dimensioni)}): è un'altra scheda, il confronto riga per riga non ha senso`;
    }
  }
  const uguale = !aggiunti.length && !tolti.length && !cambiati.length && !conteggi.length && !strati.aggiunti.length && !strati.tolti.length;
  if (!stravolto) motivo = uguale ? 'nessuna differenza tra le due revisioni' : `${aggiunti.length} componenti aggiunti, ${tolti.length} tolti, ${cambiati.length} cambiati`;
  return { stravolto, motivo, inComune, aggiunti, tolti, cambiati, conteggi, strati, uguale };
}

/** Le prime righe del confronto in parole, per l'elenco e per il messaggio dopo il caricamento. */
export function testoConfronto(c: Confronto, revVecchia: string, revNuova: string): string {
  const testa = `Revisione ${revVecchia} → ${revNuova}: `;
  if (c.stravolto) return testa + c.motivo + '.';
  if (c.uguale) return testa + 'nessuna differenza.';
  const pezzi: string[] = [];
  if (c.aggiunti.length) pezzi.push(`${c.aggiunti.length} aggiunti (${c.aggiunti.slice(0, 6).map(x => x.ref).join(', ')}${c.aggiunti.length > 6 ? '…' : ''})`);
  if (c.tolti.length) pezzi.push(`${c.tolti.length} tolti (${c.tolti.slice(0, 6).map(x => x.ref).join(', ')}${c.tolti.length > 6 ? '…' : ''})`);
  if (c.cambiati.length) pezzi.push(`${c.cambiati.length} cambiati (${c.cambiati.slice(0, 6).map(x => `${x.ref} ${x.campo}`).join(', ')}${c.cambiati.length > 6 ? '…' : ''})`);
  for (const v of c.conteggi) pezzi.push(`${v.voce} ${v.prima} → ${v.dopo}`);
  return testa + pezzi.join('; ') + '.';
}
