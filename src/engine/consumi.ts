/** Materiale di consumo previsto, stampato sulla scheda di produzione (nessun accesso al database). */
// ───────────────────────────── materiale di consumo sulla scheda ─────────────────────────────
/**
 * Riga "Materiale di consumo" della scheda: l'operatore scrive il consumo reale a scheda, accanto c'è quello
 * previsto dal preventivo (quantità per scheda; conformal coating = bombolette sul lotto, riportate alla quantità).
 */
export function consumiPrevisti(prev: any, quantita: number): { nome: string; previsto: string }[] {
  const cat: { parametri?: { codice: string; default?: number | null }[] } | undefined = prev?.catalogo;
  const v: Record<string, number> = {};
  for (const p of cat?.parametri ?? []) if (p.default != null) v[p.codice] = Number(p.default);
  for (const [k, x] of Object.entries(prev?.parametri ?? {})) v[k] = Number(x);
  const n = (x: number) => new Intl.NumberFormat('it-IT', { maximumFractionDigits: 3 }).format(x);
  const q = (cod: string, unita: string) => (v[cod] > 0 ? `${n(v[cod])} ${unita}` : '');
  const kapton = [q('kaptonInNastro', 'cm'), q('bolliniKapton', 'bollini')].filter(Boolean).join(' + ');
  const bombolette = v.tropicalizzante > 0 && prev?.n_schede > 0 ? `${n(v.tropicalizzante * quantita / prev.n_schede)} bomb. sul lotto` : '';
  return [
    { nome: 'Pasta saldante', previsto: q('crema', 'gr') },
    { nome: 'Stagno saldatrice', previsto: q('stagnoPerSaldature', 'gr') },
    { nome: 'Flussante liquido / gel', previsto: '' },
    { nome: 'Filo di saldatura', previsto: q('stagnoInFilo', 'gr') },
    { nome: 'Viteria', previsto: q('viteria', '€') },
    { nome: 'Kapton', previsto: kapton },
    { nome: 'Pasta termocon.', previsto: q('pastaTermoconduttiva', 'gr') },
    { nome: 'Conformal coating', previsto: bombolette },
  ];
}
