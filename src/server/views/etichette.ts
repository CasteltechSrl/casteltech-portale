/**
 * Etichette corte dei campi del preventivo (Adriano, 24/10/2026): "Montaggio meccanico per scheda" + "s"
 * diventa "Montaggio meccanico (sec. a scheda)". Il testo completo (e il suggerimento) va nel "title",
 * che compare passando sopra con il mouse.
 */
const UNITA: Record<string, string> = { s: 'sec.', min: 'min', h: 'h:mm', pz: 'nr.', reofori: 'nr. reofori', 'sì/no': '' };
const PER = /\s+per (scheda|pannello|feeder|componente|punto|item|tipologia|lato|spedizione)$/i;

export function etichettaBreve(p: { etichetta: string; unita?: string; tipo?: string }): string {
  let testo = p.etichetta.trim();
  let a = '';
  // parentesi: "(per lato)" → "a lato", "(totali)" → "totali", "(a lotto)" / "(fisso a lotto)" → "a lotto"; le altre si tolgono
  testo = testo.replace(/\s*\(([^)]*)\)/g, (_, dentro: string) => {
    const d = dentro.trim().toLowerCase();
    if (d === 'per lato') a = ' a lato';
    else if (d === 'totali') a = ' totali';
    else if (/a lotto$/.test(d)) a = ' a lotto';
    return '';
  });
  const m = testo.match(PER);
  if (m) { a = ` a ${m[1].toLowerCase()}`; testo = testo.slice(0, m.index); }
  const u = p.tipo === 'durata' ? 'h:mm' : (UNITA[p.unita ?? ''] ?? p.unita ?? '');
  const tra = `${u}${a}`.trim();
  return tra ? `${testo} (${tra})` : testo;
}

/** Testo completo per il passaggio del mouse. */
export const etichettaCompleta = (p: { etichetta: string; suggerimento?: string }) =>
  p.suggerimento ? `${p.etichetta} — ${p.suggerimento}` : p.etichetta;
