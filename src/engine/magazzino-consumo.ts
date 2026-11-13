/**
 * Acquisti → Materiale di consumo (Adriano 13/11/2026): le voci del riquadro "Materiale di consumo" della scheda di produzione
 * (pasta saldante, stagno della saldatrice, flussante, filo, viteria, Kapton nastro e bollini, pasta termoconduttiva, conformal coating)
 * con il costo per unità di misura (€/kg, €/m…) e il prezzo della confezione presi dall'ULTIMO acquisto, la giacenza e un cruscotto.
 *
 * Regole:
 * - ogni voce raccoglie gli articoli MC-… di Anagrafiche → Materiali di consumo (`voceProposta`, la scelta dell'ufficio vince) e sa quanta
 *   materia c'è in una unità dell'articolo (`contenutoProposto`: "VASETTO 500 G" = 0,5 kg, "33 M" = 33 m; l'ufficio lo corregge);
 * - prezzo = l'acquisto più recente tra ordini a fornitore emessi, righe delle fatture dei fornitori abbinate e ultimo acquisto dell'anagrafica;
 *   costo per unità = prezzo ÷ contenuto. Un acquisto nuovo aggiorna da solo prezzo e costo (calcolati in lettura);
 * - giacenza = ultimo inventario (scritto a mano) + ordini a fornitore emessi DOPO l'inventario ("si carica quando ordiniamo")
 *   − consumi delle commesse rientrate dopo l'inventario (quelli scritti al rientro; se mancano, il previsto dal preventivo, "stimato");
 * - giacenza media = media nel tempo della giacenza, dall'inventario a oggi (al massimo gli ultimi 12 mesi).
 * Solo calcoli: niente database.
 */
import { vociConsumo } from './consumi.js';

export type Dimensione = 'massa' | 'volume' | 'lunghezza' | 'pezzi' | 'bombolette';
/** Unità di gestione della voce e fattore per passare dall'unità della scheda (g, ml, cm) a quella della voce. */
export interface VoceMagazzino { codice: string; nome: string; unita: string; dimensione: Dimensione; dallaScheda: number }

const UNITA_VOCE: Record<string, { unita: string; dimensione: Dimensione; dallaScheda: number }> = {
  pastaSaldante: { unita: 'kg', dimensione: 'massa', dallaScheda: 0.001 },
  stagnoSaldatrice: { unita: 'kg', dimensione: 'massa', dallaScheda: 0.001 },
  flussante: { unita: 'l', dimensione: 'volume', dallaScheda: 0.001 },
  filo: { unita: 'kg', dimensione: 'massa', dallaScheda: 0.001 },
  viteria: { unita: 'pz', dimensione: 'pezzi', dallaScheda: 1 },
  kaptonNastro: { unita: 'm', dimensione: 'lunghezza', dallaScheda: 0.01 },
  kaptonBollini: { unita: 'pz', dimensione: 'pezzi', dallaScheda: 1 },
  pastaTermo: { unita: 'g', dimensione: 'massa', dallaScheda: 1 },
  conformal: { unita: 'bomb.', dimensione: 'bombolette', dallaScheda: 1 },
};

/** Le voci della scheda di produzione, nello stesso ordine del riquadro della commessa. */
export const VOCI_MAGAZZINO: VoceMagazzino[] = vociConsumo(null, 0).map(v => ({ codice: v.codice, nome: v.nome, ...UNITA_VOCE[v.codice] }));
export const voceMagazzino = (codice: string) => VOCI_MAGAZZINO.find(v => v.codice === codice);

/** Quanto vale una unità di misura scritta (KG, G, L, ML, M, CM) nella base della sua dimensione (g, ml, cm). */
const UNITA_BASE: Record<string, { dimensione: Dimensione; base: number }> = {
  KG: { dimensione: 'massa', base: 1000 }, G: { dimensione: 'massa', base: 1 }, GR: { dimensione: 'massa', base: 1 },
  L: { dimensione: 'volume', base: 1000 }, LT: { dimensione: 'volume', base: 1000 }, ML: { dimensione: 'volume', base: 1 },
  M: { dimensione: 'lunghezza', base: 100 }, MT: { dimensione: 'lunghezza', base: 100 }, CM: { dimensione: 'lunghezza', base: 1 },
};
/** Base (g, ml, cm) di una unità della voce. */
const baseVoce = (v: VoceMagazzino) => (v.dimensione === 'massa' ? (v.unita === 'kg' ? 1000 : 1) : v.dimensione === 'volume' ? (v.unita === 'l' ? 1000 : 1) : v.dimensione === 'lunghezza' ? (v.unita === 'm' ? 100 : 1) : 1);

interface ArticoloBase { categoria: string; descrizione: string; um: string | null }

/** Voce della scheda proposta per un materiale dell'anagrafica (null = non è materiale della scheda: lamine, punte, pulizia…). */
export function voceProposta(m: ArticoloBase): string | null {
  const d = m.descrizione.toUpperCase();
  if (/\bVIT[EI]\b|\bDAD[OI]\b|RONDELL|DISTANZIAL/.test(d)) return 'viteria';
  switch (m.categoria) {
    case 'PAS': return 'pastaSaldante';
    case 'BAR': return 'stagnoSaldatrice';
    case 'FIL': return 'filo';
    case 'FLU': return 'flussante';
    case 'KAP': return /BOLLIN/.test(d) ? 'kaptonBollini' : 'kaptonNastro';
    case 'COA':
      if (/DILUENT|SPELLICOL/.test(d)) return null;
      if (/CONFORMAL|COATING|TROPICALIZ/.test(d)) return 'conformal';
      if (/TERMOCOND|THERMAL|SIL GREASE|PASTA SILICONICA/.test(d)) return 'pastaTermo';
      return null;
    default: return /TERMOCOND|THERMAL/.test(d) ? 'pastaTermo' : null;
  }
}

/**
 * Quanta materia della voce c'è in UNA unità dell'articolo (nella unità della voce): articolo venduto a KG per una voce in kg = 1,
 * "VASETTO 500 G" = 0,5 kg, "NASTRO 4 MM X 33 M" = 33 m, "CF. 1000" = 1000 pz, spray per il conformal = 1 bombola.
 * null = non si capisce dalla descrizione (lo scrive l'ufficio).
 */
export function contenutoProposto(m: ArticoloBase, voce: VoceMagazzino): number | null {
  const d = m.descrizione.toUpperCase(), um = (m.um ?? '').toUpperCase().replace(/\.$/, '');
  if (voce.dimensione === 'bombolette') return /SPRAY|BOMBOL/.test(d) ? 1 : null;
  if (voce.dimensione === 'pezzi') {
    const cf = /\bCF\.?\s*(\d+)/.exec(d);
    if (cf) return Number(cf[1]);
    return um === 'PZ' || um === '' ? 1 : null;
  }
  const u = UNITA_BASE[um];
  if (u && u.dimensione === voce.dimensione) return u.base / baseVoce(voce);
  let trovato: number | null = null;
  for (const x of d.matchAll(/(\d+(?:[.,]\d+)?)\s*(KG|GR|G|LT|L|ML|MT|M|CM)\b/g)) {
    const ub = UNITA_BASE[x[2]];
    if (ub?.dimensione === voce.dimensione) trovato = Number(x[1].replace(',', '.')) * ub.base / baseVoce(voce);
  }
  return trovato != null && trovato > 0 ? Math.round(trovato * 1e6) / 1e6 : null;
}

/** Un acquisto di un articolo (riga di un ordine a fornitore, di una fattura o l'ultimo acquisto dell'anagrafica).
 *  prezzo = per unità della riga (`um`); costo = per unità della voce (null se la quantità non si può portare nella unità della voce). */
export interface AcquistoArticolo {
  articoloId: number; codice: string; data: string; quantita: number | null; um: string | null; prezzo: number; costo: number | null; fornitore: string | null;
  fonte: 'ordine' | 'fattura' | 'anagrafica'; documento: string | null; href: string | null;
}

const normUm = (x: string | null | undefined) => String(x ?? '').toUpperCase().replace(/[.\s]/g, '');

/**
 * Costo per unità della voce di una riga d'acquisto. La riga nella stessa unità dell'articolo (o senza unità, a pezzi o confezioni) usa il
 * contenuto dell'articolo; una riga scritta in una misura (kg, g, l, m…) della stessa natura della voce si converte; una misura di natura
 * diversa (es. flussante fatturato a grammi) non dà il costo.
 */
export function costoInVoce(importo: number, quantita: number | null, umRiga: string | null, articolo: { um: string | null; contenuto: number | null }, voce: VoceMagazzino): number | null {
  if (!(quantita && quantita > 0) || !(importo > 0)) return null;
  const ur = normUm(umRiga), ua = normUm(articolo.um);
  const misura = UNITA_BASE[ur];
  let inVoce: number | null = null;
  if (!ur || ur === ua || !misura) inVoce = articolo.contenuto ? quantita * articolo.contenuto : null;
  else if (misura.dimensione === voce.dimensione) inVoce = quantita * misura.base / baseVoce(voce);
  return inVoce && inVoce > 0 ? importo / inVoce : null;
}
const PRIORITA_FONTE = { ordine: 0, fattura: 1, anagrafica: 2 } as const;

/** L'acquisto più recente con un prezzo (a parità di data: ordine, poi fattura, poi anagrafica): prima tra quelli che danno il costo per unità. */
export function ultimoAcquisto<T extends Pick<AcquistoArticolo, 'data' | 'prezzo' | 'fonte'> & { costo?: number | null }>(acquisti: T[]): T | null {
  const validi = acquisti.filter(a => a.prezzo > 0 && a.data)
    .sort((a, b) => b.data.localeCompare(a.data) || PRIORITA_FONTE[a.fonte] - PRIORITA_FONTE[b.fonte]);
  return validi.find(a => a.costo != null && a.costo > 0) ?? validi[0] ?? null;
}

/** Movimento della giacenza di una voce, nella unità della voce. `quando` (data e ora) mette in ordine i movimenti dello stesso giorno. */
export interface MovimentoConsumo {
  tipo: 'inventario' | 'carico' | 'consumo'; data: string; quando: string; quantita: number; stimato?: boolean;
  testo: string; href?: string | null; inventarioId?: number;
}

export interface SituazioneGiacenza {
  inventario: MovimentoConsumo | null;     // ultimo inventario (null = giacenza mai caricata)
  giacenza: number | null;                 // null senza inventario
  caricato: number; consumato: number; consumatoStimato: number;   // dopo l'inventario
  movimenti: (MovimentoConsumo & { saldo: number })[];             // dall'ultimo inventario, con il saldo progressivo
  media: number | null;                    // giacenza media nel tempo (dall'inventario, max 12 mesi)
  giorniMedia: number;
}

const giorno = 86400000;
const giorniTra = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / giorno);
const tondo = (x: number) => Math.round(x * 1e6) / 1e6;

/** Giacenza di una voce: ultimo inventario + carichi − consumi venuti dopo, e la giacenza media dal giorno dell'inventario a oggi. */
export function situazioneGiacenza(movimenti: MovimentoConsumo[], oggi: string): SituazioneGiacenza {
  const ordinati = [...movimenti].sort((a, b) => a.quando.localeCompare(b.quando));
  const inventario = [...ordinati].reverse().find(m => m.tipo === 'inventario') ?? null;
  if (!inventario) return { inventario: null, giacenza: null, caricato: 0, consumato: 0, consumatoStimato: 0, movimenti: [], media: null, giorniMedia: 0 };
  const dopo = ordinati.filter(m => m.tipo !== 'inventario' && m.quando > inventario.quando);
  let saldo = inventario.quantita, caricato = 0, consumato = 0, consumatoStimato = 0;
  const conSaldo: SituazioneGiacenza['movimenti'] = [{ ...inventario, saldo }];
  for (const m of dopo) {
    if (m.tipo === 'carico') { saldo += m.quantita; caricato += m.quantita; }
    else { saldo -= m.quantita; consumato += m.quantita; if (m.stimato) consumatoStimato += m.quantita; }
    conSaldo.push({ ...m, saldo: tondo(saldo) });
  }
  // giacenza media: ogni saldo pesa per i giorni in cui è rimasto (dall'inventario, al massimo gli ultimi 365 giorni)
  const inizioFinestra = new Date(Date.parse(oggi) - 365 * giorno).toISOString().slice(0, 10);
  const inizio = inventario.data > inizioFinestra ? inventario.data : inizioFinestra;
  const totaleGiorni = Math.max(0, giorniTra(inizio, oggi));
  let media: number | null = saldo;
  if (totaleGiorni > 0) {
    let somma = 0;
    for (let i = 0; i < conSaldo.length; i++) {
      const da = conSaldo[i].data < inizio ? inizio : conSaldo[i].data;
      const a = i + 1 < conSaldo.length ? (conSaldo[i + 1].data < inizio ? inizio : conSaldo[i + 1].data) : oggi;
      somma += Math.max(0, conSaldo[i].saldo) * Math.max(0, giorniTra(da, a));
    }
    media = somma / totaleGiorni;
  }
  return { inventario, giacenza: tondo(saldo), caricato: tondo(caricato), consumato: tondo(consumato), consumatoStimato: tondo(consumatoStimato),
    movimenti: conSaldo, media: media == null ? null : tondo(media), giorniMedia: totaleGiorni };
}

/**
 * Consumo medio al mese: consumi degli ultimi 12 mesi divisi per i mesi coperti (dal primo consumo, almeno 1 mese).
 * null se non c'è nessun consumo.
 */
export function consumoMensile(consumi: Pick<MovimentoConsumo, 'data' | 'quantita'>[], oggi: string): number | null {
  const inizioFinestra = new Date(Date.parse(oggi) - 365 * giorno).toISOString().slice(0, 10);
  const nella = consumi.filter(c => c.data >= inizioFinestra && c.data <= oggi);
  if (!nella.length) return null;
  const primo = nella.reduce((m, c) => (c.data < m ? c.data : m), oggi);
  const mesi = Math.max(1, giorniTra(primo, oggi) / 30.4375);
  return tondo(nella.reduce((s, c) => s + c.quantita, 0) / Math.min(12, mesi));
}

/** Indicatori di una voce per la tabella e il cruscotto (valori in € con il costo per unità dell'ultimo acquisto). */
export interface IndicatoriVoce {
  giacenza: number | null; valore: number | null; media: number | null; valoreMedio: number | null;
  consumoMese: number | null; copertura: number | null; rotazione: number | null; sottoScorta: boolean;
}
export function indicatoriVoce(s: SituazioneGiacenza, costo: number | null, consumoMese: number | null, scorta: number | null): IndicatoriVoce {
  const valore = s.giacenza != null && costo != null ? s.giacenza * costo : null;
  const valoreMedio = s.media != null && costo != null ? s.media * costo : null;
  return {
    giacenza: s.giacenza, valore, media: s.media, valoreMedio, consumoMese,
    copertura: s.giacenza != null && consumoMese ? s.giacenza / consumoMese : null,
    rotazione: s.media && consumoMese ? (consumoMese * 12) / s.media : null,
    sottoScorta: scorta != null && scorta > 0 && s.giacenza != null && s.giacenza < scorta,
  };
}

/** Totali del cruscotto. */
export interface CruscottoConsumo {
  valore: number; valoreMedio: number; acquistato12: number; consumato12: number | null; copertura: number | null; rotazione: number | null;
  vociConGiacenza: number; vociSenzaInventario: number; vociSenzaPrezzo: number; sottoScorta: number; stimati: boolean;
}
export function cruscottoConsumo(voci: { ind: IndicatoriVoce; costo: number | null; acquistato12: number; stimato: boolean }[]): CruscottoConsumo {
  const valore = voci.reduce((s, v) => s + (v.ind.valore ?? 0), 0);
  const valoreMedio = voci.reduce((s, v) => s + (v.ind.valoreMedio ?? 0), 0);
  const conConsumo = voci.filter(v => v.ind.consumoMese != null && v.costo != null);
  const consumoMeseEuro = conConsumo.length ? conConsumo.reduce((s, v) => s + v.ind.consumoMese! * v.costo!, 0) : null;
  return {
    valore, valoreMedio, acquistato12: voci.reduce((s, v) => s + v.acquistato12, 0),
    consumato12: consumoMeseEuro == null ? null : consumoMeseEuro * 12,
    copertura: consumoMeseEuro && voci.some(v => v.ind.giacenza != null) ? valore / consumoMeseEuro : null,
    rotazione: consumoMeseEuro && valoreMedio ? (consumoMeseEuro * 12) / valoreMedio : null,
    vociConGiacenza: voci.filter(v => v.ind.giacenza != null).length,
    vociSenzaInventario: voci.filter(v => v.ind.giacenza == null).length,
    vociSenzaPrezzo: voci.filter(v => v.costo == null).length,
    sottoScorta: voci.filter(v => v.ind.sottoScorta).length,
    stimati: voci.some(v => v.stimato),
  };
}

/** Numero scritto dall'ufficio ("1,5", "1.500", "0,25"): null se vuoto o non valido. */
export function numeroScritto(x: unknown): number | null {
  let s = String(x ?? '').trim().replace(/\s/g, '');
  if (!s) return null;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '');   // punto delle migliaia
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
}
