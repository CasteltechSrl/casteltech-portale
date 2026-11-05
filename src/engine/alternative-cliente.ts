/**
 * Codici alternativi da far confermare al cliente (Adriano 5/11/2026): "nel momento in cui prospettiamo delle alternative, sulla stampa
 * del preventivo deve comparire che rispetto alla BOM sono state individuate delle alternative da confermare", con l'elenco in un
 * foglio a parte in coda al preventivo.
 * Dalla BOM quotata collegata si prendono le righe in cui si compra un codice diverso da quello della BOM: alternativa scelta
 * dall'ufficio (`alternativaScelta`) o proposta dal portale per dare il prezzo (`alternativaProposta`). Per il cliente sono tutte
 * da confermare, anche quelle che l'ufficio ha già accettato. Stessa coppia P/N della BOM → alternativa su più righe = una riga sola
 * con tutti i riferimenti (le BOM ripetono lo stesso codice).
 */
export interface RigaPerAlternativa {
  pn: string | null; produttore?: string | null; designatori: string | null; valore?: string | null; descrizioneBom?: string | null;
  descrizione?: string | null; qtaScheda?: number; esito?: string; clienteFornisce?: boolean;
  alternativaScelta?: string | null; alternativaProposta?: string | null;
  alternative?: { mpn: string; produttore?: string; descrizione?: string }[];
}

export interface AlternativaDaConfermare {
  pnBom: string; produttoreBom: string; alternativa: string; produttoreAlternativa: string; descrizione: string;
  riferimenti: string; qtaScheda: number;
}

const pulito = (s: unknown) => String(s ?? '').trim();
const chiave = (s: string) => s.toUpperCase().replace(/[\s\-_.]/g, '');

export function alternativeDaConfermare(righe: RigaPerAlternativa[], nonMontato = 'NON MONTATO'): AlternativaDaConfermare[] {
  const perCoppia = new Map<string, AlternativaDaConfermare & { rif: string[] }>();
  for (const r of righe ?? []) {
    if (r.esito === nonMontato || r.clienteFornisce) continue;
    const alt = pulito(r.alternativaScelta || r.alternativaProposta);
    const pn = pulito(r.pn);
    if (!alt || (pn && chiave(pn) === chiave(alt))) continue;
    const dati = r.alternative?.find(x => chiave(x.mpn) === chiave(alt));
    const k = `${chiave(pn || pulito(r.valore) || pulito(r.descrizioneBom))}|${chiave(alt)}`;
    const rif = pulito(r.designatori).split(/[\s,;]+/).filter(Boolean);
    const gia = perCoppia.get(k);
    if (gia) {
      for (const x of rif) if (!gia.rif.includes(x)) gia.rif.push(x);
      gia.qtaScheda += Number(r.qtaScheda) || 0;
      continue;
    }
    perCoppia.set(k, {
      pnBom: pn || pulito(r.valore) || pulito(r.descrizioneBom) || 'senza P/N', produttoreBom: pulito(r.produttore),
      alternativa: alt, produttoreAlternativa: pulito(dati?.produttore),
      descrizione: pulito(dati?.descrizione) || pulito(r.descrizione) || pulito(r.descrizioneBom),
      riferimenti: '', qtaScheda: Number(r.qtaScheda) || 0, rif,
    });
  }
  return [...perCoppia.values()].map(({ rif, ...x }) => ({ ...x, riferimenti: rif.join(', ') }));
}

/** Frase stampata sotto le righe del preventivo quando ci sono alternative da confermare. */
export function fraseAlternative(n: number): string {
  if (!n) return '';
  return `Rispetto alla BOM ${n === 1 ? 'è stato individuato 1 codice alternativo' : `sono stati individuati ${n} codici alternativi`} da confermare: `
    + `${n === 1 ? 'è elencato' : 'sono elencati'} nel foglio "Codici alternativi da confermare" in fondo al preventivo. Li acquistiamo solo dopo la vostra conferma.`;
}
