/**
 * Materiale di consumo della scheda di produzione (nessun accesso al database).
 * L'operatore scrive sul foglio tempi il materiale impiegato; in rientro l'ufficio (o la lettura automatica)
 * inserisce il TOTALE DEL LOTTO per voce; il sistema stampa sulla scheda il consumo reale a scheda accanto
 * a quello previsto dal preventivo. Il conformal coating si conta in bombolette sul lotto.
 */

export interface VoceConsumo {
  codice: string;
  colonna: string;           // intestazione della colonna sulla scheda (kapton: nastro e bollini nella stessa colonna)
  nome: string;
  unita: string;
  perLotto: boolean;         // true = si confronta il totale del lotto, non il consumo a scheda
  previsto: number | null;   // a scheda (o sul lotto se perLotto), nella stessa unità del reale
  previstoTesto: string;     // come stamparlo (per la viteria il preventivo è in €)
}

const nf = (x: number) => new Intl.NumberFormat('it-IT', { maximumFractionDigits: 3 }).format(x);

export function vociConsumo(prev: any, quantita: number): VoceConsumo[] {
  const cat: { parametri?: { codice: string; default?: number | null }[] } | undefined = prev?.catalogo;
  const v: Record<string, number> = {};
  for (const p of cat?.parametri ?? []) if (p.default != null) v[p.codice] = Number(p.default);
  for (const [k, x] of Object.entries(prev?.parametri ?? {})) v[k] = Number(x);
  const pos = (cod: string) => (v[cod] > 0 ? v[cod] : null);
  const voce = (codice: string, colonna: string, nome: string, unita: string, previsto: number | null, perLotto = false, previstoTesto?: string): VoceConsumo =>
    ({ codice, colonna, nome, unita, perLotto, previsto, previstoTesto: previstoTesto ?? (previsto != null ? `${nf(previsto)} ${unita}` : '') });
  const bombolette = v.tropicalizzante > 0 && prev?.n_schede > 0 ? v.tropicalizzante * quantita / prev.n_schede : null;
  return [
    voce('pastaSaldante', 'Pasta saldante', 'Pasta saldante', 'gr', pos('crema')),
    voce('stagnoSaldatrice', 'Stagno saldatrice', 'Stagno saldatrice', 'gr', pos('stagnoPerSaldature')),
    voce('flussante', 'Flussante liquido / gel', 'Flussante liquido / gel', 'ml', null),
    voce('filo', 'Filo di saldatura', 'Filo di saldatura', 'gr', pos('stagnoInFilo')),
    voce('viteria', 'Viteria', 'Viteria', 'pz', null, false, pos('viteria') != null ? `${nf(v.viteria)} €` : ''),
    voce('kaptonNastro', 'Kapton', 'Kapton nastro', 'cm', pos('kaptonInNastro')),
    voce('kaptonBollini', 'Kapton', 'Kapton bollini', 'pz', pos('bolliniKapton')),
    voce('pastaTermo', 'Pasta termocon.', 'Pasta termoconduttiva', 'gr', pos('pastaTermoconduttiva')),
    voce('conformal', 'Conformal coating', 'Conformal coating', 'bomb.', bombolette, true, bombolette != null ? `${nf(bombolette)} bomb. sul lotto` : ''),
  ];
}

/** Consumo reale da stampare: a scheda (totale ÷ schede) o sul lotto. */
export function consumoReale(voce: VoceConsumo, totaleLotto: number | null | undefined, quantita: number): number | null {
  if (totaleLotto == null || !Number.isFinite(totaleLotto)) return null;
  return voce.perLotto || !(quantita > 0) ? totaleLotto : totaleLotto / quantita;
}

export const formatoQuantita = nf;
