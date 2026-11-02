/**
 * Componenti in comune tra le BOM di un cliente (suggerimento di Adriano Croci, 29/10/2026, "Macchine per Selea":
 * avere gli stessi componenti su FOX e iPulse per evitare i cambi macchina tra una produzione e l'altra).
 * Per ogni componente montato si conta in quante BOM del cliente compare: quelli usati da più schede sono i candidati
 * a restare fissi sui feeder. Stesso componente = stesso codice di produzione, altrimenti stesso P/N (lettere e cifre).
 * Solo lettura: niente cambia nelle BOM, nell'archivio o nei preventivi.
 */

export interface RigaPerComuni {
  pn: string | null; codiceProduzione: string | null; descrizione: string | null; valore?: string | null; footprint?: string | null;
  qtaScheda: number; nonMontato?: boolean;
}
export interface BomPerComuni { id: number; nome: string; righe: RigaPerComuni[] }

export interface ComponenteComune {
  chiave: string; codiceProduzione: string | null; pn: string[]; descrizione: string | null;
  /** BOM che lo usano, con i pezzi a scheda */
  bom: { id: number; nome: string; qtaScheda: number }[];
  pezziTotali: number;
}

const soloLettereCifre = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Chiave del componente: codice di produzione (armadio) se c'è, altrimenti P/N; null = non confrontabile. */
export function chiaveComponente(r: Pick<RigaPerComuni, 'pn' | 'codiceProduzione'>): string | null {
  const cod = r.codiceProduzione?.trim();
  if (cod) return 'C:' + cod.toUpperCase();
  const pn = r.pn ? soloLettereCifre(r.pn) : '';
  return pn ? 'P:' + pn : null;
}

/**
 * Elenco dei componenti in ordine: prima quelli presenti in più BOM, poi con più pezzi a scheda in totale.
 * `minimoBom` = in quante BOM deve comparire almeno (2 = solo quelli davvero in comune).
 */
export function componentiInComune(boms: BomPerComuni[], minimoBom = 2): ComponenteComune[] {
  const mappa = new Map<string, ComponenteComune>();
  for (const b of boms) {
    for (const r of b.righe) {
      if (r.nonMontato) continue;
      const chiave = chiaveComponente(r);
      if (!chiave) continue;
      let c = mappa.get(chiave);
      if (!c) {
        c = { chiave, codiceProduzione: r.codiceProduzione?.trim() || null, pn: [], descrizione: r.descrizione ?? ([r.valore, r.footprint].filter(Boolean).join(' ') || null), bom: [], pezziTotali: 0 };
        mappa.set(chiave, c);
      }
      const pn = r.pn?.trim().toUpperCase();
      if (pn && !c.pn.includes(pn)) c.pn.push(pn);
      if (!c.descrizione && r.descrizione) c.descrizione = r.descrizione;
      const q = Number.isFinite(r.qtaScheda) ? r.qtaScheda : 0;
      const gia = c.bom.find(x => x.id === b.id);
      if (gia) gia.qtaScheda += q; else c.bom.push({ id: b.id, nome: b.nome, qtaScheda: q });
      c.pezziTotali += q;
    }
  }
  return [...mappa.values()]
    .filter(c => c.bom.length >= Math.max(1, minimoBom))
    .sort((a, b) => b.bom.length - a.bom.length || b.pezziTotali - a.pezziTotali || a.chiave.localeCompare(b.chiave));
}

/** Feeder fissi: i primi N componenti dell'elenco (N scritto dall'ufficio; vuoto o non valido = nessuno segnato). */
export function feederFissi(elenco: ComponenteComune[], n: unknown): Set<string> {
  const k = Math.floor(Number(String(n ?? '').replace(',', '.')));
  return new Set(Number.isFinite(k) && k > 0 ? elenco.slice(0, k).map(c => c.chiave) : []);
}
