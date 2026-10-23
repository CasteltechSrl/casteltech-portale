/**
 * Motore di calcolo del preventivo.
 *
 * Le fasi e le voci di costo NON sono scritte nel codice: arrivano dal catalogo
 * (database), ognuna con la sua formula. Questo file applica solo le regole economiche:
 *
 *   tempo ciclo (impegno linea)  = formula della fase, in secondi, per l'intero lotto
 *   tempo uomo                   = tempo ciclo × n. persone
 *   costo fase                   = ore ciclo × costo orario azienda
 *                                + ore ciclo × n. persone × costo orario operatore (produzione o ufficio)
 *   prezzo fase                  = costo fase × ricarico
 *
 * Voci di costo (materiali, lamine, spedizione, …): prezzo = costo × ricarico.
 * Fasi e voci "una tantum" entrano solo nel primo lotto.
 *
 * Gli arrotondamenti al centesimo sono gli stessi del vecchio portale, così i totali
 * coincidono al centesimo (verificato su tutti i preventivi storici: tools/verifica-legacy.ts).
 */
import { calcolaFormula } from './espressioni.js';

export type Tariffa = 'produzione' | 'ufficio';

export interface FaseDef {
  codice: string;
  nome: string;
  gruppo: string;            // macrofase: PRE-PRODUZIONE, SMD, THT, COMPLETAMENTO, …
  formulaSecondi: string;    // tempo ciclo dell'intero lotto, in secondi
  persone: number;           // persone previste di default (es. 2 su P&P, forno, onda)
  tariffa: Tariffa;
  unaTantum: boolean;        // true = solo primo lotto (programmazioni, documentazione…)
}

export interface VoceDef {
  codice: string;
  nome: string;
  gruppo: string;
  formulaEuro: string;       // costo in euro per l'intero lotto
  unaTantum: boolean;
}

export interface Tariffe {
  costoAziendaH: number;           // es. 25 €/h, per ora di impegno fase
  costoOperatoreProduzioneH: number; // es. 15 €/h per persona
  costoOperatoreUfficioH: number;    // es. 35 €/h per persona
  ricarico: number;                  // es. 1,25
}

export interface RigaFase {
  codice: string; nome: string; gruppo: string; unaTantum: boolean;
  persone: number;
  secondiCiclo: number;      // impegno linea, lotto intero
  secondiUomo: number;       // = ciclo × persone
  secondiCicloScheda: number;
  costo: number;             // €, arrotondato al centesimo
  prezzo: number;            // €, arrotondato al centesimo
  prezzoScheda: number;
}

export interface RigaVoce {
  codice: string; nome: string; gruppo: string; unaTantum: boolean;
  costo: number; prezzo: number; prezzoScheda: number; guadagno: number;
}

export interface Risultato {
  fasi: RigaFase[];
  voci: RigaVoce[];
  totali: {
    nSchede: number;
    secondiCicloPrimoLotto: number;
    secondiCicloSecondoLotto: number;
    secondiUomoPrimoLotto: number;
    secondiUomoSecondoLotto: number;
    costoFasiSecondoLotto: number;
    prezzoFasiSecondoLotto: number;
    prezzoFasiPrimoLotto: number;
    costoVociPrimoLotto: number;
    prezzoVociPrimoLotto: number;
    prezzoVociSecondoLotto: number;
    totalePrimoLotto: number;
    totaleSecondoLotto: number;
    costiUnaTantum: number;
    prezzoSchedaPrimoLotto: number;
    prezzoSchedaSecondoLotto: number;
    prezzoOrarioMedio: number;   // € fatturati per ora di ciclo (come "costo orario" del vecchio portale)
    guadagnoLotto: number;       // margine sul lotto ripetuto (dal secondo lotto)
  };
}

/** Arrotondamento identico a Number.toFixed(2) usato dal vecchio portale. */
export const r2 = (x: number) => Number((Number.isFinite(x) ? x : 0).toFixed(2));

export interface InputPreventivo {
  nSchede: number;
  parametri: Record<string, number | null | undefined>;
  /** persone per fase scelte nel preventivo (se diverse dal default del catalogo) */
  personeFase?: Record<string, number>;
  /** correzione dei tempi per fase (1 = come da formula; 1,2 = +20%), usata per il "prezzo corretto" */
  fattoreFase?: Record<string, number>;
}

export function calcolaPreventivo(
  fasiDef: FaseDef[], vociDef: VoceDef[], tariffe: Tariffe, input: InputPreventivo,
): Risultato {
  const nSchede = input.nSchede || 0;
  const vars = { ...input.parametri, nSchede };
  const ric = tariffe.ricarico;
  const perScheda = (x: number) => (nSchede ? x / nSchede : 0);

  const fasi: RigaFase[] = [];
  let costoRawRic = 0;      // Σ costi grezzi fasi ricorrenti
  let prezzoRawRic = 0;     // Σ ricarico × costo arrotondato, ricorrenti
  let prezzoRawUT = 0;      // idem, una tantum
  let minArrotondatiRic = 0;
  let secCicloRic = 0, secCicloUT = 0, secUomoRic = 0, secUomoUT = 0;

  for (const f of fasiDef) {
    const sec = Math.max(0, calcolaFormula(f.formulaSecondi, vars)) * (input.fattoreFase?.[f.codice] ?? 1);
    const persone = input.personeFase?.[f.codice] ?? f.persone;
    const opH = f.tariffa === 'ufficio' ? tariffe.costoOperatoreUfficioH : tariffe.costoOperatoreProduzioneH;
    const min = sec / 60;
    // stessa sequenza di operazioni del vecchio portale (minuti/1440×24) per avere gli stessi centesimi
    const raw = min / 1440 * tariffe.costoAziendaH * 24 + (opH * persone) * min / 1440 * 24;
    const costo = r2(raw);
    const prezzo = r2(ric * costo);
    fasi.push({
      codice: f.codice, nome: f.nome, gruppo: f.gruppo, unaTantum: f.unaTantum, persone,
      secondiCiclo: sec, secondiUomo: sec * persone, secondiCicloScheda: perScheda(sec),
      costo, prezzo, prezzoScheda: r2(perScheda(prezzo)),
    });
    if (f.unaTantum) {
      prezzoRawUT += ric * costo;
      secCicloUT += sec; secUomoUT += sec * persone;
    } else {
      costoRawRic += raw;
      prezzoRawRic += ric * costo;
      minArrotondatiRic += Math.round(min);
      secCicloRic += sec; secUomoRic += sec * persone;
    }
  }

  const voci: RigaVoce[] = [];
  let prezzoVociTot = 0, prezzoVociRic = 0, costoVociTot = 0, guadagnoVociRic = 0;
  for (const v of vociDef) {
    const costo = calcolaFormula(v.formulaEuro, vars);
    const prezzo = r2(costo * ric);
    const guadagno = r2(prezzo - costo);
    voci.push({
      codice: v.codice, nome: v.nome, gruppo: v.gruppo, unaTantum: v.unaTantum,
      costo, prezzo, prezzoScheda: r2(perScheda(prezzo)), guadagno,
    });
    costoVociTot += costo;
    prezzoVociTot += prezzo;
    if (!v.unaTantum) { prezzoVociRic += prezzo; guadagnoVociRic += guadagno; }
  }

  const costoFasiSecondoLotto = r2(costoRawRic);
  const prezzoFasiSecondoLotto = r2(prezzoRawRic);
  const prezzoFasiPrimoLotto = r2(prezzoRawRic + prezzoRawUT);
  const prezzoVociPrimoLotto = r2(prezzoVociTot);
  const prezzoVociSecondoLotto = r2(prezzoVociRic);
  const totalePrimoLotto = r2(prezzoFasiPrimoLotto + prezzoVociPrimoLotto);
  const totaleSecondoLotto = r2(prezzoFasiSecondoLotto + prezzoVociSecondoLotto);
  const costoRicaricato = r2(costoFasiSecondoLotto * ric);

  return {
    fasi, voci,
    totali: {
      nSchede,
      secondiCicloPrimoLotto: secCicloRic + secCicloUT,
      secondiCicloSecondoLotto: secCicloRic,
      secondiUomoPrimoLotto: secUomoRic + secUomoUT,
      secondiUomoSecondoLotto: secUomoRic,
      costoFasiSecondoLotto,
      prezzoFasiSecondoLotto,
      prezzoFasiPrimoLotto,
      costoVociPrimoLotto: r2(costoVociTot),
      prezzoVociPrimoLotto,
      prezzoVociSecondoLotto,
      totalePrimoLotto,
      totaleSecondoLotto,
      costiUnaTantum: r2(totalePrimoLotto - totaleSecondoLotto),
      prezzoSchedaPrimoLotto: r2(perScheda(totalePrimoLotto)),
      prezzoSchedaSecondoLotto: r2(perScheda(totaleSecondoLotto)),
      prezzoOrarioMedio: minArrotondatiRic ? r2(costoFasiSecondoLotto * ric / (minArrotondatiRic / 1440 * 24)) : 0,
      guadagnoLotto: r2(r2(costoRicaricato - costoFasiSecondoLotto) + r2(guadagnoVociRic)),
    },
  };
}
