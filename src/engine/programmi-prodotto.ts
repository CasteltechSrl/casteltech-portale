/**
 * Programmi delle macchine sul prodotto (Adriano 13/11/2026): i nomi dei programmi di serigrafia (HTGD), P&P FOX, P&P iPulse (M1 e M4),
 * AOI… con TOP e BOT stanno sul prodotto (`prodotti.programmi`), così la commessa nuova li trova da sola nel riquadro "Programmi e lamine".
 * Regole: una casella scritta non si sovrascrive mai con un'altra proposta; si riempiono solo le vuote.
 */
export type Programmi = Record<string, { top: string; bot: string }>;

const testo = (v: unknown) => String(v ?? '').trim().slice(0, 300);

/** Programmi letti da un jsonb qualsiasi, solo le chiavi conosciute e solo le caselle scritte. */
export function leggiProgrammi(x: unknown, chiavi: string[]): Programmi {
  const o: any = x && typeof x === 'object' ? x : {};
  const r: Programmi = {};
  for (const k of chiavi) {
    const top = testo(o[k]?.top), bot = testo(o[k]?.bot);
    if (top || bot) r[k] = { top, bot };
  }
  return r;
}

/** Riempie le caselle vuote di `base` con quelle di `proposta`; le caselle già scritte restano. Ritorna anche quante ne ha riempite. */
export function riempiVuote(base: Programmi, proposta: Programmi): { programmi: Programmi; riempite: number } {
  const r: Programmi = {};
  let riempite = 0;
  for (const k of new Set([...Object.keys(base), ...Object.keys(proposta)])) {
    const b = base[k] ?? { top: '', bot: '' }, p = proposta[k] ?? { top: '', bot: '' };
    const top = b.top || p.top, bot = b.bot || p.bot;
    if (!b.top && p.top) riempite++;
    if (!b.bot && p.bot) riempite++;
    r[k] = { top, bot };
  }
  return { programmi: r, riempite };
}

/** Dopo il salvataggio di una commessa: il prodotto prende le caselle scritte nella commessa (vince l'ultima commessa), le altre restano. */
export function aggiornaDaCommessa(prodotto: Programmi, commessa: Programmi): Programmi {
  const r: Programmi = { ...prodotto };
  for (const [k, v] of Object.entries(commessa)) {
    const p = prodotto[k] ?? { top: '', bot: '' };
    r[k] = { top: v.top || p.top, bot: v.bot || p.bot };
  }
  return r;
}
