/**
 * Consuntivo di una commessa: dai tempi scritti sulla scheda di produzione al confronto col preventivo.
 *
 * Ogni riga della scheda (una "rilevazione") ha: fase, operatore, data, ora inizio, ora fine,
 * n. persone, pezzi, tipo (S = tempo standard, P = problema contingente, con causa).
 *
 *   tempo uomo  = Σ (durata riga × persone della riga)
 *   tempo ciclo = tempo in cui la fase è stata "aperta": unione degli intervalli (se due persone
 *                 scrivono due righe sovrapposte sulla stessa fase, il ciclo non raddoppia)
 *
 * Costo reale fase = ore ciclo × costo azienda + ore uomo × costo operatore (stessa regola del preventivo).
 *
 * Per il prezzo corretto contano solo le righe S (le P sono problemi contingenti, confermati dall'ufficio).
 * Se in produzione si è lavorato con un numero di persone diverso dal preventivo, il tempo viene
 * riportato alle persone del preventivo usando il tempo uomo: ciclo equivalente = tempo uomo ÷ persone previste.
 */
import { calcolaPreventivo, r2, type FaseDef, type VoceDef, type Tariffe, type InputPreventivo, type Risultato } from './calcolo.js';

export interface Rilevazione {
  fase: string;                 // codice fase
  data: string;                 // AAAA-MM-GG
  inizio: string;               // HH:MM
  fine: string;                 // HH:MM (se < inizio si intende il giorno dopo)
  persone?: number;             // default 1
  pezzi?: number;
  tipo: 'S' | 'P';
  causa?: string;               // per le righe P
  operatore?: string;
  note?: string;
}

interface Intervallo { da: number; a: number }

const minuti = (data: string, hhmm: string) => {
  const [h, m] = hhmm.split(/[:.]/).map(Number);
  return Date.parse(data + 'T00:00:00Z') / 60000 + h * 60 + (m || 0);
};

function intervallo(r: Rilevazione): Intervallo {
  const da = minuti(r.data, r.inizio);
  let a = minuti(r.data, r.fine);
  if (a < da) a += 24 * 60;
  return { da, a };
}

/** minuti coperti dall'unione degli intervalli */
function unione(iv: Intervallo[]): number {
  const s = [...iv].sort((x, y) => x.da - y.da);
  let tot = 0, cur: Intervallo | null = null;
  for (const i of s) {
    if (!cur || i.da > cur.a) { if (cur) tot += cur.a - cur.da; cur = { ...i }; }
    else cur.a = Math.max(cur.a, i.a);
  }
  if (cur) tot += cur.a - cur.da;
  return tot;
}

export interface FaseConsuntivo {
  codice: string;
  nome: string;
  previstoCicloSec: number;
  previstoUomoSec: number;
  personePreviste: number;
  realeCicloSec: number;        // tutte le righe
  realeUomoSec: number;
  standardCicloSec: number;     // solo righe S
  standardUomoSec: number;
  problemaUomoSec: number;      // righe P
  personeMedieReali: number;    // uomo ÷ ciclo
  costoPrevisto: number;
  costoReale: number;
  scostamentoStandardPct: number; // tempo standard (riportato alle persone previste) vs previsto
  cause: string[];
}

export interface Consuntivo {
  fasi: FaseConsuntivo[];
  fasiNonPreventivate: string[];
  prezzoVenduto: number;
  costoPrevisto: number;          // fasi + voci, come da preventivo
  costoReale: number;             // fasi reali + voci come da preventivo
  margineReale: number;
  marginePrevisto: number;
  costoProblemi: number;          // quanto sono costati i problemi contingenti
  fattoriCorrezione: Record<string, number>; // per fase: tempo standard riportato alle persone del preventivo
  /** scenario alternativo: come si è lavorato davvero (persone reali, ciclo reale standard) */
  scenarioReale: { fattori: Record<string, number>; persone: Record<string, number> };
}

export function calcolaConsuntivo(opz: {
  fasi: FaseDef[]; voci: VoceDef[]; tariffe: Tariffe; input: InputPreventivo;
  rilevazioni: Rilevazione[];
  primoLotto: boolean;            // la commessa paga i costi una tantum?
  prezzoVenduto?: number;         // se diverso dal preventivo (sconto, trattativa)
}): Consuntivo {
  const prev = calcolaPreventivo(opz.fasi, opz.voci, opz.tariffe, opz.input);
  const t = opz.tariffe;
  const perFase = new Map<string, Rilevazione[]>();
  for (const r of opz.rilevazioni) perFase.set(r.fase, [...(perFase.get(r.fase) ?? []), r]);

  const fasi: FaseConsuntivo[] = [];
  const fattori: Record<string, number> = {};
  const fattoriReali: Record<string, number> = {}, personeReali: Record<string, number> = {};
  let costoFasiReale = 0, costoProblemi = 0;

  for (const f of opz.fasi) {
    const pf = prev.fasi.find(x => x.codice === f.codice)!;
    if (f.unaTantum && !opz.primoLotto) continue;
    const righe = perFase.get(f.codice) ?? [];
    if (!righe.length && pf.secondiCiclo === 0) continue;
    const opH = f.tariffa === 'ufficio' ? t.costoOperatoreUfficioH : t.costoOperatoreProduzioneH;
    const costo = (cicloSec: number, uomoSec: number) => cicloSec / 3600 * t.costoAziendaH + uomoSec / 3600 * opH;

    const uomo = (rs: Rilevazione[]) => rs.reduce((a, r) => { const i = intervallo(r); return a + (i.a - i.da) * 60 * (r.persone ?? 1); }, 0);
    const ciclo = (rs: Rilevazione[]) => unione(rs.map(intervallo)) * 60;
    const S = righe.filter(r => r.tipo !== 'P'), P = righe.filter(r => r.tipo === 'P');
    const realeCiclo = ciclo(righe), realeUomo = uomo(righe);
    const stdCiclo = ciclo(S), stdUomo = uomo(S);
    const probUomo = uomo(P), probCiclo = realeCiclo - stdCiclo;

    const costoReale = righe.length ? costo(realeCiclo, realeUomo) : 0;
    costoFasiReale += costoReale;
    costoProblemi += P.length ? costo(probCiclo, probUomo) : 0;

    // tempo standard riportato alle persone del preventivo
    const stdEquivalente = pf.persone > 0 ? stdUomo / pf.persone : stdCiclo;
    const scost = pf.secondiCiclo ? stdEquivalente / pf.secondiCiclo - 1 : 0;
    if (S.length && pf.secondiCiclo) {
      fattori[f.codice] = Number((stdEquivalente / pf.secondiCiclo).toFixed(3));
      fattoriReali[f.codice] = Number((stdCiclo / pf.secondiCiclo).toFixed(3));
      personeReali[f.codice] = stdCiclo ? Number((stdUomo / stdCiclo).toFixed(2)) : pf.persone;
    }

    fasi.push({
      codice: f.codice, nome: f.nome,
      previstoCicloSec: pf.secondiCiclo, previstoUomoSec: pf.secondiUomo, personePreviste: pf.persone,
      realeCicloSec: realeCiclo, realeUomoSec: realeUomo, standardCicloSec: stdCiclo, standardUomoSec: stdUomo,
      problemaUomoSec: probUomo,
      personeMedieReali: realeCiclo ? Number((realeUomo / realeCiclo).toFixed(2)) : 0,
      costoPrevisto: pf.costo, costoReale: r2(costoReale),
      scostamentoStandardPct: Number((scost * 100).toFixed(1)),
      cause: P.map(r => r.causa ?? '').filter(Boolean),
    });
  }

  const codici = new Set(opz.fasi.map(f => f.codice));
  const tot = prev.totali;
  const prezzoVenduto = opz.prezzoVenduto ?? (opz.primoLotto ? tot.totalePrimoLotto : tot.totaleSecondoLotto);
  const costoVoci = prev.voci.filter(v => opz.primoLotto || !v.unaTantum).reduce((a, v) => a + v.costo, 0);
  const costoFasiPrev = prev.fasi.filter(f => opz.primoLotto || !f.unaTantum).reduce((a, f) => a + f.costo, 0);
  return {
    fasi,
    fasiNonPreventivate: [...perFase.keys()].filter(k => !codici.has(k)),
    prezzoVenduto,
    costoPrevisto: r2(costoFasiPrev + costoVoci),
    costoReale: r2(costoFasiReale + costoVoci),
    marginePrevisto: r2(prezzoVenduto - costoFasiPrev - costoVoci),
    margineReale: r2(prezzoVenduto - costoFasiReale - costoVoci),
    costoProblemi: r2(costoProblemi),
    fattoriCorrezione: fattori,
    scenarioReale: { fattori: fattoriReali, persone: personeReali },
  };
}

/**
 * Prezzo corretto per la prossima produzione: stesso preventivo, tempi delle fasi corretti
 * con i tempi standard reali, eventualmente per una quantità diversa.
 * Le fasi fisse (attrezzaggi) restano fisse, quelle per scheda/pannello scalano con la quantità:
 * questo avviene da solo perché il fattore si applica alla formula, che contiene già nSchede/nPCB.
 */
export function prezzoCorretto(opz: {
  fasi: FaseDef[]; voci: VoceDef[]; tariffe: Tariffe; input: InputPreventivo;
  fattori: Record<string, number>;
  persone?: Record<string, number>;  // per lo scenario "come si è lavorato davvero"
  nuovaQuantita?: { nSchede: number; nPCB: number };
}): Risultato {
  const input: InputPreventivo = {
    ...opz.input,
    nSchede: opz.nuovaQuantita?.nSchede ?? opz.input.nSchede,
    parametri: { ...opz.input.parametri, ...(opz.nuovaQuantita ? { nPCB: opz.nuovaQuantita.nPCB } : {}) },
    fattoreFase: { ...opz.input.fattoreFase, ...opz.fattori },
    personeFase: { ...opz.input.personeFase, ...opz.persone },
  };
  return calcolaPreventivo(opz.fasi, opz.voci, opz.tariffe, input);
}

// ───────────────────────────── tempi "ultima produzione" per la scheda ─────────────────────────────

/**
 * Tempo ciclo standard (solo righe S) per fase, dalle rilevazioni di una commessa: unione degli intervalli,
 * riportato alle persone previste quando sono indicate (tempo uomo ÷ persone previste), come nel consuntivo.
 */
export function cicloStandardPerFase(rilevazioni: Rilevazione[], personePreviste: Record<string, number> = {}): Record<string, number> {
  const perFase = new Map<string, Rilevazione[]>();
  for (const r of rilevazioni) if (r.tipo !== 'P') perFase.set(r.fase, [...(perFase.get(r.fase) ?? []), r]);
  const out: Record<string, number> = {};
  for (const [fase, righe] of perFase) {
    const pers = personePreviste[fase];
    if (pers > 0) out[fase] = righe.reduce((a, r) => { const i = intervallo(r); return a + (i.a - i.da) * 60 * (r.persone ?? 1); }, 0) / pers;
    else out[fase] = unione(righe.map(intervallo)) * 60;
  }
  return out;
}

/** Riporta un tempo a un'altra quantità secondo la scala della fase (fisso / per scheda / per pannello). */
export function riportaAQuantita(sec: number, scala: 'fisso' | 'scheda' | 'pannello',
  da: { schede: number; pannelli: number }, a: { schede: number; pannelli: number }): number {
  if (scala === 'scheda') return da.schede > 0 ? sec * a.schede / da.schede : sec;
  if (scala === 'pannello') return da.pannelli > 0 ? sec * a.pannelli / da.pannelli : sec;
  return sec;
}
