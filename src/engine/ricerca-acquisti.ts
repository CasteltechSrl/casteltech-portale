/**
 * Ricerca negli acquisti più tollerante e risultati divisi per anno (Adriano 11/11/2026: "quanto ho comprato di lamine serigrafiche
 * nel 2026, 2025, 2024…" e "una ricerca più generica, magari sono state chiamate lamine, non vorrei che dimenticasse qualcosa").
 *
 * - singolare e plurale, maschile e femminile: si cerca la radice ("LAMINA" e "LAMINE" → "LAMIN", "SERIGRAFICHE" → "SERIGRAFIC");
 * - accenti non contano; parole vuote ("di", "per", "la"…) tolte;
 * - sinonimi (`SINONIMI`): "lamina" trova anche "stencil"; "serigrafica" accanto a "lamina" non è obbligatoria
 *   (molte righe dicono solo "LAMINA" o "STENCIL");
 * - errori di battitura: se la ricerca esatta non trova niente, si riprova con una lettera sbagliata, mancante o in più (`varianteConErrori`).
 *
 * Solo calcoli: le condizioni SQL le costruisce `cercaAcquisti` in `server/righe-fornitori-servizio.ts`.
 */
import type { RigaAcquistoStorica } from './righe-fattura.js';

/** Un termine della ricerca: la riga lo contiene se contiene ALMENO UNA delle varianti (testi in maiuscolo senza accenti). */
export interface TermineRicerca { parola: string; varianti: string[] }

/** Gruppi di sinonimi: radici (o frasi) equivalenti; `qualificatori` = parole che con il gruppo non servono ("lamina serigrafica"). */
export const SINONIMI: { nome: string; radici: string[]; qualificatori?: string[] }[] = [
  { nome: 'lamine', radici: ['LAMIN', 'STENCIL'], qualificatori: ['SERIGRAF', 'INOX', 'ACCIAI'] },
  { nome: 'pasta saldante', radici: ['PASTA SALD', 'PASTE SALD', 'CREMA SALD', 'SOLDER PAST', 'SOLDERPAST'] },
  { nome: 'stagno', radici: ['STAGN', 'SOLDER WIRE', 'SOLDER BAR', 'SAC305'] },
  { nome: 'flussante', radici: ['FLUSS', 'FLUX'] },
  { nome: 'kapton', radici: ['KAPTON', 'POLIIMMID', 'POLYIMID'] },
  { nome: 'punte', radici: ['PUNT', 'UGELL'] },
  { nome: 'circuiti stampati', radici: ['PCB', 'CIRCUITO STAMPAT', 'CIRCUITI STAMPAT', 'PRINTED CIRCUIT'] },
  { nome: 'alcool', radici: ['ALCOL', 'ALCOOL', 'ISOPROP'] },
  { nome: 'guanti', radici: ['GUANT', 'GLOVE'] },
  { nome: 'trasporto', radici: ['TRASPORT', 'SPEDIZ', 'SHIPPING', 'FREIGHT', 'CORRIER'] },
  { nome: 'connettori', radici: ['CONNETTOR', 'CONNECTOR'] },
  { nome: 'resistenze', radici: ['RESISTENZ', 'RESISTOR'] },
  { nome: 'condensatori', radici: ['CONDENSATOR', 'CAPACITOR'] },
  { nome: 'etichette', radici: ['ETICHETT', 'LABEL'] },
];

const PAROLE_VUOTE = new Set(['DI', 'DA', 'DEL', 'DELLA', 'DELLE', 'DEI', 'DEGLI', 'PER', 'IL', 'LO', 'LA', 'LE', 'GLI', 'I', 'E', 'ED', 'CON', 'IN', 'SU', 'A', 'AL', 'ALLA', 'UN', 'UNA', 'UNO']);

/** Maiuscolo, senza accenti; % e _ tolti (nel LIKE sono caratteri speciali). */
export const normalizzaAcquisti = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[%_\\]/g, ' ').replace(/\s+/g, ' ').trim();

/** Radice di una parola italiana (o inglese) per trovare singolare e plurale; i codici con cifre restano interi. */
export function radice(parola: string): string {
  const p = parola.toUpperCase();
  if (/\d/.test(p) || !/^[A-Z]+$/.test(p) || p.length < 5) return p;
  let r = p;
  if (/(CHE|GHE|CHI|GHI)$/.test(r)) r = r.slice(0, -2);         // SERIGRAFICHE → SERIGRAFIC, LUNGHE → LUNG
  else if (/[AEIOU]$/.test(r)) r = r.slice(0, -1);               // LAMINA / LAMINE → LAMIN
  else if (/[^S]S$/.test(r)) r = r.slice(0, -1);                 // STENCILS → STENCIL
  return r.length >= 4 ? r : p;
}

const gruppoDi = (r: string) => SINONIMI.find(g => g.radici.some(x => !x.includes(' ') && r.length >= 3 && (r.startsWith(x) || (r.length >= 4 && x.startsWith(r)))));

/** I termini della ricerca: frasi con sinonimi ("pasta saldante"), poi parola per parola; con `esatta` niente sinonimi né radici. */
export function terminiRicerca(testo: string, opz: { esatta?: boolean } = {}): TermineRicerca[] {
  let t = normalizzaAcquisti(testo);
  if (!t) return [];
  if (opz.esatta) return t.split(' ').slice(0, 6).map(p => ({ parola: p, varianti: [p] }));
  const termini: TermineRicerca[] = [];
  const gruppiUsati = new Set<string>();
  // frasi (più parole) riconosciute per prime
  for (const g of SINONIMI) {
    for (const frase of g.radici.filter(x => x.includes(' '))) {
      const parti = frase.split(' ');
      const re = new RegExp(`\\b${parti.map(x => `${x}\\w*`).join('\\s+')}`);
      const m = t.match(re);
      if (m) {
        if (!gruppiUsati.has(g.nome)) { termini.push({ parola: m[0], varianti: [...g.radici] }); gruppiUsati.add(g.nome); }
        t = t.replace(re, ' ');
      }
    }
  }
  const parole = t.split(' ').filter(p => p && !PAROLE_VUOTE.has(p));
  const qualificatori: string[] = [];
  for (const p of parole) {
    const r = radice(p);
    const g = gruppoDi(r);
    if (g) {
      if (!gruppiUsati.has(g.nome)) { termini.push({ parola: p, varianti: [...g.radici] }); gruppiUsati.add(g.nome); }
      continue;
    }
    qualificatori.push(p);
  }
  for (const p of qualificatori) {
    const r = radice(p);
    // "serigrafica" accanto a "lamina": non serve che la riga lo dica
    if (SINONIMI.some(g => gruppiUsati.has(g.nome) && g.qualificatori?.some(x => r.startsWith(x) || x.startsWith(r)))) continue;
    if (!termini.some(x => x.varianti.includes(r))) termini.push({ parola: p, varianti: [r] });
  }
  return termini.slice(0, 6);
}

/** Varianti con un errore di battitura (una lettera sbagliata, mancante o in più): `_` = una lettera qualsiasi nel LIKE. Solo parole di 5+ lettere. */
export function varianteConErrori(v: string): string[] {
  if (v.includes(' ') || !/^[A-Z]{5,}$/.test(v)) return [v];
  const out = new Set<string>([v]);
  for (let i = 0; i < v.length; i++) {
    out.add(v.slice(0, i) + '_' + v.slice(i + 1));                 // lettera sbagliata
    if (v.length >= 6) out.add(v.slice(0, i) + v.slice(i + 1));      // lettera in più nella ricerca
  }
  for (let i = 1; i < v.length; i++) out.add(v.slice(0, i) + '_' + v.slice(i));   // lettera mancante nella ricerca
  return [...out];
}

/** Termini con le varianti per gli errori di battitura (si usano solo se la ricerca normale non trova niente). */
export const terminiTolleranti = (termini: TermineRicerca[]): TermineRicerca[] =>
  termini.map(t => ({ parola: t.parola, varianti: [...new Set(t.varianti.flatMap(varianteConErrori))] }));

/** Testo per la pagina: cosa si è cercato davvero ("lamina → LAMIN, STENCIL"). */
export const spiegaTermini = (termini: TermineRicerca[]) =>
  termini.map(t => t.varianti.length > 1 ? `${t.parola.toLowerCase()} (= ${t.varianti.map(v => v.toLowerCase()).join(', ')})` : t.varianti[0].toLowerCase()).join(' + ');

// ── Totali per anno ──
export interface AnnoAcquisti {
  anno: number; righe: number; fatture: number; quantita: number; spesa: number; prezzoMedio: number | null;
  variazione: number | null; fornitori: { fornitore: string; fornitoreChiave: string; spesa: number }[];
}

const arr2 = (x: number) => Math.round(x * 100) / 100;

/** Le righe trovate divise per anno (il più recente in cima): spesa e quantità (note di credito in negativo), prezzo medio, fornitori, variazione sulla spesa. */
export function acquistiPerAnno(righe: RigaAcquistoStorica[]): AnnoAcquisti[] {
  const anni = new Map<number, { righe: number; doc: Set<number>; quantita: number; spesa: number; forn: Map<string, { fornitore: string; fornitoreChiave: string; spesa: number }> }>();
  for (const r of righe) {
    const anno = Number(r.data.slice(0, 4));
    if (!anno) continue;
    let a = anni.get(anno);
    if (!a) { a = { righe: 0, doc: new Set(), quantita: 0, spesa: 0, forn: new Map() }; anni.set(anno, a); }
    const segno = r.tipo === 'nota_credito' ? -1 : 1;
    a.righe++; a.doc.add(r.documentoId); a.quantita += segno * (r.quantita ?? 0); a.spesa += segno * r.imponibile;
    const f = a.forn.get(r.fornitoreChiave) ?? { fornitore: r.fornitore, fornitoreChiave: r.fornitoreChiave, spesa: 0 };
    f.spesa += segno * r.imponibile; a.forn.set(r.fornitoreChiave, f);
  }
  const elenco = [...anni.entries()].sort((x, y) => y[0] - x[0]).map(([anno, a]) => ({
    anno, righe: a.righe, fatture: a.doc.size, quantita: Math.round(a.quantita * 1000) / 1000, spesa: arr2(a.spesa),
    prezzoMedio: a.quantita > 0 ? Math.round((a.spesa / a.quantita) * 10000) / 10000 : null, variazione: null as number | null,
    fornitori: [...a.forn.values()].map(f => ({ ...f, spesa: arr2(f.spesa) })).sort((x, y) => y.spesa - x.spesa),
  }));
  for (const a of elenco) {
    const prima = elenco.find(x => x.anno === a.anno - 1);
    a.variazione = prima && prima.spesa > 0 ? Math.round(((a.spesa - prima.spesa) / prima.spesa) * 1000) / 10 : null;
  }
  return elenco;
}
