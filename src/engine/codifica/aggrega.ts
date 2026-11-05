/**
 * BOM quotata = pagina di acquisto (Adriano 5/11/2026).
 *  1. Codici uguali uniti: le righe della BOM con lo stesso P/N diventano UNA riga (quantità a scheda sommata, riferimenti uniti),
 *     così acquisto e scarto si calcolano sul totale e non riga per riga; un prezzo scritto a mano vale per tutte.
 *  2. Alternative: per i codici senza prezzo o non disponibili si cerca un componente con le stesse caratteristiche, il più economico
 *     tra quelli disponibili. Passivi (resistenze, condensatori, induttanze, ferriti, termistori) e altri componenti NON attivi
 *     "uguali in tutto e per tutto" (stesso codice di produzione) si comprano da soli: la riga lo segnala e basta. Gli attivi
 *     (semiconduttori, integrati, oscillatori…) e le alternative non sicuramente uguali chiedono sempre la conferma.
 *  L'elenco per il cliente nella stampa del preventivo lo fa `alternativeDaConfermare` (engine/alternative-cliente.ts) da
 *  `alternativaScelta` / `alternativaProposta`: le alternative scelte qui da sole ci finiscono anche loro.
 * Nessun accesso alla rete né al database.
 */
import { sceltaMigliore, type Offerta } from '../acquisti.js';

/** Famiglie dei passivi: l'alternativa con le stesse caratteristiche si usa senza conferma. */
export const FAMIGLIE_PASSIVE = ['RS', 'RR', 'CC', 'CE', 'CT', 'CF', 'ID', 'FR', 'NT'];
/** Famiglie dei componenti attivi: l'alternativa va SEMPRE confermata. Una famiglia sconosciuta conta come attiva. */
export const FAMIGLIE_ATTIVE = ['DI', 'DS', 'DZ', 'DL', 'IC', 'TR', 'TB', 'TM', 'TS', 'SP', 'OS', 'CV', 'TP'];

export type TipoComponente = 'passivo' | 'attivo' | 'altro';
export function tipoComponente(famiglia: string | null | undefined): TipoComponente {
  const f = String(famiglia ?? '').toUpperCase();
  if (FAMIGLIE_PASSIVE.includes(f)) return 'passivo';
  if (!f || FAMIGLIE_ATTIVE.includes(f)) return 'attivo';
  return 'altro';
}

const chiave = (pn: string | null | undefined) => {
  const k = String(pn ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return k || null;
};

export interface RigaDaUnire {
  n: number; pn: string | null; esito: string; clienteFornisce?: boolean; aggiuntaAMano?: boolean;
  qtaScheda: number; designatori: string | null; note: string[];
  righeUnite?: number[];
  prezzoManuale?: number | null; alternativaScelta?: string | null; alternativaProposta?: string | null; alternativaAutomatica?: boolean;
  alternativaRifiutata?: boolean; scartoManuale?: unknown; notaOperatore?: string | null; alternative?: { mpn: string }[];
}

/** Inizio della nota della riga che unisce più righe della BOM. */
export const NOTA_UNITE = 'unisce le righe';

/**
 * Una riga per P/N: le righe da comprare con lo stesso P/N (stesso codice senza spazi e trattini, stesso "fornito dal cliente")
 * si uniscono nella prima. Non si uniscono le righe non montate, quelle senza P/N e quelle aggiunte a mano dall'ufficio.
 * Quantità a scheda sommate, riferimenti uniti, scelte dell'operatore (prezzo a mano, alternativa, scarto, nota) dalla prima che ne ha una.
 */
export function unisciPerPn<T extends RigaDaUnire>(righe: T[], nonMontato = 'NON MONTATO'): T[] {
  const capi = new Map<string, T>();
  const uscita: T[] = [];
  for (const r of righe) {
    const k = chiave(r.pn);
    if (!k || r.esito === nonMontato || r.aggiuntaAMano) { uscita.push(r); continue; }
    const kk = `${k}|${r.clienteFornisce ? 1 : 0}`;
    const capo = capi.get(kk);
    if (!capo) { capi.set(kk, r); uscita.push(r); continue; }
    capo.righeUnite = [...(capo.righeUnite ?? []), r.n, ...(r.righeUnite ?? [])];
    capo.qtaScheda = Math.round((capo.qtaScheda + r.qtaScheda) * 1e6) / 1e6;
    capo.designatori = [capo.designatori, r.designatori].map(x => String(x ?? '').trim()).filter(Boolean).join(', ') || null;
    for (const campo of ['prezzoManuale', 'alternativaScelta', 'alternativaProposta', 'scartoManuale', 'notaOperatore'] as const) {
      if (capo[campo] == null && r[campo] != null) (capo as any)[campo] = r[campo];
    }
    if (r.alternativaScelta && capo.alternativaScelta === r.alternativaScelta) capo.alternativaAutomatica = capo.alternativaAutomatica ?? r.alternativaAutomatica;
    capo.alternativaRifiutata = capo.alternativaRifiutata || r.alternativaRifiutata;
    if (r.alternative?.length) {
      const gia = new Set((capo.alternative ?? []).map(a => chiave(a.mpn)));
      capo.alternative = [...(capo.alternative ?? []), ...r.alternative.filter(a => !gia.has(chiave(a.mpn)))];
    }
    // note della quantità di ogni riga ("quantità contata dai designatori") non servono sulla riga unita
    capo.note = [...new Set([...capo.note, ...r.note.filter(x => !/^quantità /.test(x))])];
  }
  for (const r of uscita) if (r.righeUnite?.length) {
    r.note = [`${NOTA_UNITE} ${[r.n, ...r.righeUnite].sort((a, b) => a - b).join(', ')} della BOM (stesso P/N)`,
      ...r.note.filter(x => !x.startsWith(NOTA_UNITE) && !/^P\/N ripetuto/.test(x))];
  }
  return uscita;
}

/** Tutte le righe della BOM originale contenute in una riga (la riga stessa + quelle unite). */
export const righeOriginali = (r: Pick<RigaDaUnire, 'n' | 'righeUnite'>) => [r.n, ...(r.righeUnite ?? [])];

export interface RigaPerAlternativa {
  esito: string; clienteFornisce?: boolean; pn: string | null; mpnAcquisto?: string | null; prezzoManuale?: number | null;
  alternativaScelta?: string | null; reperibilita?: { livello: string };
  acquisti: { scelta?: { disponibile: boolean } }[];
}

/** La riga ha bisogno di un'alternativa? Componente da comprare senza prezzo, non disponibile o introvabile (critico). */
export function serveAlternativa(r: RigaPerAlternativa, nonMontato = 'NON MONTATO'): boolean {
  if (r.esito === nonMontato || r.clienteFornisce || !(r.pn || r.mpnAcquisto)) return false;
  if (r.alternativaScelta || (r.prezzoManuale != null && r.prezzoManuale >= 0)) return false;
  return r.reperibilita?.livello === 'critico' || r.acquisti.some(x => !x.scelta || !x.scelta.disponibile);
}

export interface AlternativaValutata { mpn: string; identica: boolean | null; offerte: Offerta[]; fonte: string }

/**
 * L'alternativa da comprare SENZA conferma (Adriano 5/11/2026): solo per passivi e componenti non attivi, solo se ha sicuramente
 * le stesse caratteristiche (stesso codice di produzione) ed è disponibile nella quantità; tra queste la più economica.
 * Per gli attivi null: la conferma serve sempre.
 */
export function alternativaAutomatica<A extends AlternativaValutata>(famiglia: string | null | undefined, alternative: A[], qta: number, scritteAMano = 'scritta a mano'): A | null {
  if (tipoComponente(famiglia) === 'attivo') return null;
  const valide = alternative.filter(a => a.identica === true && a.fonte !== scritteAMano && a.offerte.length)
    .map(a => ({ a, s: sceltaMigliore(a.offerte, Math.max(1, qta)) }))
    .filter(x => x.s?.disponibile);
  valide.sort((x, y) => x.s!.acquisto.totale - y.s!.acquisto.totale);
  return valide[0]?.a ?? null;
}
