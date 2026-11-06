/**
 * Analisi per prodotto e visione d'insieme dei clienti (Adriano 5/11/2026): dallo storico delle fatture e dei DDT
 * (anche quello di Fatture in Cloud dal 2019) per ogni codice prodotto pezzi, fatturato, prezzo medio, lotti, ultima consegna
 * e il peso sul cliente e sull'azienda, anno per anno; per i clienti classifica, chi sale e chi scende, concentrazione,
 * clienti fermi, nuovi e persi. Solo conti: le letture stanno in server/analisi-prodotti-servizio.ts, le pagine in
 * rotte/analisi.ts (Amministrazione → Analisi → Prodotti / Clienti).
 *
 * Regole:
 *  - pezzi e fatturato di un prodotto = righe delle fatture con quel codice (note di credito in negativo), prezzo medio = fatturato ÷ pezzi;
 *  - lotti = consegne: DDT con causale di vendita o reso lavorato (`causaleDaFatturare`) + fatture senza DDT, come i "codici per anno"
 *    della scheda del cliente; lotto medio = pezzi consegnati ÷ lotti;
 *  - fuori i servizi (lamine, programmazione, trasporto…: `eServizio`), salvo righe collegate a un prodotto dell'anagrafica;
 *  - lo stesso codice per due clienti diversi sono due prodotti (regola codice-cliente);
 *  - "fermo" = nessuna consegna né fattura da più di `MESI_FERMO` mesi (6, come per i clienti).
 */
import { eServizio } from './ordini.js';
import { causaleDaFatturare } from './ddt.js';
import { variazionePct } from './analisi.js';

export const MESI_FERMO = 6;
const r2 = (n: number) => Math.round(n * 100) / 100;
const segno = (tipo: string) => (tipo === 'nota_credito' ? -1 : 1);

/** Una riga di fattura, nota di credito o DDT con il codice prodotto. */
export interface RigaVenditaProdotto {
  tipo: string;                      // 'fattura' | 'nota_credito' | 'ddt'
  documentoId: number;
  anno: number;
  data: string;                      // AAAA-MM-GG
  clienteChiave: string;             // 'c<id>' se il cliente è in anagrafica, altrimenti 'n:<nome>'
  clienteId?: number | null;
  cliente: string;
  codice: string | null;
  descrizione: string | null;
  descrizioneAnagrafica?: string | null;
  prodottoId?: number | null;
  quantita: number;
  importo: number;                   // riga netta di sconto (solo fatture e note di credito)
  causale?: string | null;           // DDT: causale del trasporto
  ddtId?: number | null;             // riga di fattura nata da un DDT del portale
  citaDdt?: boolean;                 // la fattura cita "DDT n. X del" (storico FIC): le schede sono già nel DDT
}

export interface StatAnnoProdotto {
  anno: number; pezzi: number; fatturato: number; prezzoMedio: number | null;
  lotti: number; pezziConsegnati: number; lottoMedio: number | null; ultimaData: string | null;
}
export interface ProdottoAnalisi {
  chiave: string; codice: string; descrizione: string; clienteChiave: string; clienteId: number | null; cliente: string; prodottoId: number | null;
  perAnno: Record<number, StatAnnoProdotto>; ultimaData: string | null; primaData: string | null;
}

export const chiaveProdotto = (clienteChiave: string, codice: string) => `${clienteChiave}|${codice.trim().toUpperCase()}`;

/** La riga conta come consegna (lotto)? DDT di vendita/reso lavorato, oppure fattura senza DDT. */
export function eConsegna(r: Pick<RigaVenditaProdotto, 'tipo' | 'causale' | 'ddtId' | 'citaDdt'>): boolean {
  if (r.tipo === 'ddt') return causaleDaFatturare(r.causale);
  if (r.tipo === 'fattura') return !r.ddtId && !r.citaDdt;
  return false;
}

/** Tutti i prodotti venduti con le statistiche per anno (chiave = cliente + codice). */
export function riepilogoProdotti(righe: RigaVenditaProdotto[]): Map<string, ProdottoAnalisi> {
  const out = new Map<string, ProdottoAnalisi>();
  const lotti = new Map<string, Set<number>>();            // chiave|anno → documenti di consegna
  for (const r of righe) {
    const codice = String(r.codice ?? '').trim().toUpperCase();
    if (!codice) continue;
    const primaRiga = String(r.descrizione ?? '').split('\n')[0].trim();
    if (!r.prodottoId && eServizio(codice, primaRiga)) continue;
    const chiave = chiaveProdotto(r.clienteChiave, codice);
    let p = out.get(chiave);
    if (!p) {
      p = { chiave, codice, descrizione: primaRiga, clienteChiave: r.clienteChiave, clienteId: r.clienteId ?? null, cliente: r.cliente,
        prodottoId: r.prodottoId ?? null, perAnno: {}, ultimaData: null, primaData: null };
      out.set(chiave, p);
    }
    if (r.descrizioneAnagrafica) p.descrizione = r.descrizioneAnagrafica;
    else if (!p.descrizione && primaRiga) p.descrizione = primaRiga;
    if (r.prodottoId && !p.prodottoId) p.prodottoId = r.prodottoId;
    const s = (p.perAnno[r.anno] ??= { anno: r.anno, pezzi: 0, fatturato: 0, prezzoMedio: null, lotti: 0, pezziConsegnati: 0, lottoMedio: null, ultimaData: null });
    const q = Number(r.quantita) || 0;
    if (r.tipo === 'fattura' || r.tipo === 'nota_credito') { s.pezzi += segno(r.tipo) * q; s.fatturato += segno(r.tipo) * (Number(r.importo) || 0); }
    if (eConsegna(r) && q > 0) {
      s.pezziConsegnati += q;
      const k = `${chiave}|${r.anno}`;
      (lotti.get(k) ?? lotti.set(k, new Set()).get(k)!).add(r.documentoId);
    }
    const conta = r.tipo === 'nota_credito' ? false : (r.tipo === 'ddt' ? eConsegna(r) : true);
    if (conta && q > 0) {
      const d = r.data.slice(0, 10);
      if (!s.ultimaData || d > s.ultimaData) s.ultimaData = d;
      if (!p.ultimaData || d > p.ultimaData) p.ultimaData = d;
      if (!p.primaData || d < p.primaData) p.primaData = d;
    }
  }
  for (const p of out.values()) for (const s of Object.values(p.perAnno)) {
    s.lotti = lotti.get(`${p.chiave}|${s.anno}`)?.size ?? 0;
    s.fatturato = r2(s.fatturato);
    s.prezzoMedio = s.pezzi > 0 ? r2(s.fatturato / s.pezzi) : null;
    s.lottoMedio = s.lotti > 0 ? Math.round(s.pezziConsegnati / s.lotti) : null;
  }
  return out;
}

/** Fatturato (imponibile, note di credito in negativo) per cliente e per anno, e totale dell'azienda per anno. */
export interface FatturaCliente { clienteChiave: string; cliente: string; tipo: string; anno: number; data: string; imponibile: number }
export interface TotaliFatturato { perCliente: Map<string, Record<number, number>>; totale: Record<number, number> }
export function totaliFatturato(fatture: FatturaCliente[]): TotaliFatturato {
  const perCliente = new Map<string, Record<number, number>>();
  const totale: Record<number, number> = {};
  for (const f of fatture) {
    if (!['fattura', 'nota_credito'].includes(f.tipo)) continue;
    const v = segno(f.tipo) * (Number(f.imponibile) || 0);
    const c = perCliente.get(f.clienteChiave) ?? {};
    c[f.anno] = r2((c[f.anno] ?? 0) + v);
    perCliente.set(f.clienteChiave, c);
    totale[f.anno] = r2((totale[f.anno] ?? 0) + v);
  }
  return { perCliente, totale };
}

const pesoPct = (parte: number, tutto: number | undefined) => (tutto && tutto > 0 && parte > 0 ? Math.round((parte / tutto) * 1000) / 10 : null);

/** Mesi interi passati da `data` a `oggi` (0 se nel futuro). */
export function mesiDa(data: string | null, oggi: string): number | null {
  if (!data) return null;
  const [a, m, g] = data.slice(0, 10).split('-').map(Number), [oa, om, og] = oggi.slice(0, 10).split('-').map(Number);
  let mesi = (oa - a) * 12 + (om - m);
  if (og < g) mesi--;
  return Math.max(0, mesi);
}
export const eFermo = (ultimaData: string | null, oggi: string) => { const m = mesiDa(ultimaData, oggi); return m != null && m >= MESI_FERMO; };

export interface RigaClassificaProdotto extends StatAnnoProdotto {
  chiave: string; codice: string; descrizione: string; cliente: string; clienteChiave: string; clienteId: number | null; prodottoId: number | null;
  pezziPrima: number; fatturatoPrima: number; variazione: number | null; pesoCliente: number | null; pesoTotale: number | null;
  ultimaConsegna: string | null; mesiFermo: number | null; fermo: boolean;
}

/**
 * Classifica dei prodotti di un anno (in ordine di fatturato), con il confronto sull'anno prima, il peso sul fatturato del cliente
 * e sul totale dell'azienda; `cliente` restringe a un cliente. Entrano i prodotti con pezzi o fatturato nell'anno o nell'anno prima.
 */
export function classificaProdotti(prodotti: Iterable<ProdottoAnalisi>, totali: TotaliFatturato, anno: number, oggi: string, cliente?: string | null): RigaClassificaProdotto[] {
  const out: RigaClassificaProdotto[] = [];
  for (const p of prodotti) {
    if (cliente && p.clienteChiave !== cliente) continue;
    const s = p.perAnno[anno], prima = p.perAnno[anno - 1];
    if (!s && !prima) continue;
    const st: StatAnnoProdotto = s ?? { anno, pezzi: 0, fatturato: 0, prezzoMedio: null, lotti: 0, pezziConsegnati: 0, lottoMedio: null, ultimaData: null };
    if (!(st.fatturato || st.pezzi || st.lotti || prima?.fatturato || prima?.pezzi)) continue;
    const mesi = mesiDa(p.ultimaData, oggi);
    out.push({ ...st, chiave: p.chiave, codice: p.codice, descrizione: p.descrizione, cliente: p.cliente, clienteChiave: p.clienteChiave, clienteId: p.clienteId,
      prodottoId: p.prodottoId, pezziPrima: prima?.pezzi ?? 0, fatturatoPrima: prima?.fatturato ?? 0, variazione: variazionePct(st.fatturato, prima?.fatturato ?? 0),
      pesoCliente: pesoPct(st.fatturato, totali.perCliente.get(p.clienteChiave)?.[anno]), pesoTotale: pesoPct(st.fatturato, totali.totale[anno]),
      ultimaConsegna: p.ultimaData, mesiFermo: mesi, fermo: mesi != null && mesi >= MESI_FERMO });
  }
  return out.sort((a, b) => b.fatturato - a.fatturato || b.fatturatoPrima - a.fatturatoPrima || a.codice.localeCompare(b.codice));
}

/** I tre riquadri in cima alla classifica (Adriano 6/11/2026: "fossero dei pulsanti... sotto devi vedere l'elenco corrispondente"). */
export type RiquadroClassifica = 'venduti' | 'calo' | 'fermi';
export const RIQUADRI_CLASSIFICA: RiquadroClassifica[] = ['venduti', 'calo', 'fermi'];
export const riquadroClassifica = (v: unknown): RiquadroClassifica | null => (RIQUADRI_CLASSIFICA as string[]).includes(String(v ?? '')) ? (v as RiquadroClassifica) : null;
/** Regole dei riquadri: venduti = fatturato nell'anno; in calo forte = −30 % o più su almeno 1.000 € dell'anno prima; fermi = nessuna consegna da MESI_FERMO mesi. */
export const RIQUADRI_REGOLE: Record<RiquadroClassifica, (p: RigaClassificaProdotto) => boolean> = {
  venduti: p => p.fatturato > 0,
  calo: p => p.variazione != null && p.variazione <= -30 && p.fatturatoPrima >= 1000,
  fermi: p => p.fermo && (p.fatturato > 0 || p.fatturatoPrima > 0),
};
/** Quanti prodotti in ogni riquadro, contati su tutta la classifica (il filtro scelto non cambia i numeri). */
export const contaRiquadri = (classifica: RigaClassificaProdotto[]): Record<RiquadroClassifica, number> =>
  Object.fromEntries(RIQUADRI_CLASSIFICA.map(r => [r, classifica.filter(RIQUADRI_REGOLE[r]).length])) as Record<RiquadroClassifica, number>;
/** La classifica filtrata dal riquadro scelto (nessuno = tutta). */
export const filtraRiquadro = (classifica: RigaClassificaProdotto[], riquadro: RiquadroClassifica | null): RigaClassificaProdotto[] =>
  riquadro ? classifica.filter(RIQUADRI_REGOLE[riquadro]) : classifica;

export interface RigaAnnoScheda extends StatAnnoProdotto {
  variazione: number | null; variazionePezzi: number | null; pesoCliente: number | null; pesoTotale: number | null; ordini: number | null;
}
/** Scheda del prodotto: una riga per anno (dal primo all'ultimo con dati), con variazioni e pesi; `ordini` = ordini nel portale per anno, se ci sono. */
export function schedaProdotto(p: ProdottoAnalisi, totali: TotaliFatturato, oggi: string, ordiniPerAnno: Record<number, number> = {}) {
  const anniConDati = Object.keys(p.perAnno).map(Number).concat(Object.keys(ordiniPerAnno).map(Number));
  const anni: number[] = [];
  if (anniConDati.length) for (let a = Math.min(...anniConDati); a <= Math.max(...anniConDati); a++) anni.push(a);
  const righe: RigaAnnoScheda[] = anni.map(anno => {
    const s = p.perAnno[anno] ?? { anno, pezzi: 0, fatturato: 0, prezzoMedio: null, lotti: 0, pezziConsegnati: 0, lottoMedio: null, ultimaData: null };
    const prima = p.perAnno[anno - 1];
    return { ...s, variazione: variazionePct(s.fatturato, prima?.fatturato ?? 0), variazionePezzi: variazionePct(s.pezzi, prima?.pezzi ?? 0),
      pesoCliente: pesoPct(s.fatturato, totali.perCliente.get(p.clienteChiave)?.[anno]), pesoTotale: pesoPct(s.fatturato, totali.totale[anno]),
      ordini: ordiniPerAnno[anno] ?? null };
  });
  const tot = righe.reduce((t, r) => ({ pezzi: t.pezzi + r.pezzi, fatturato: r2(t.fatturato + r.fatturato), lotti: t.lotti + r.lotti, consegnati: t.consegnati + r.pezziConsegnati }),
    { pezzi: 0, fatturato: 0, lotti: 0, consegnati: 0 });
  const mesi = mesiDa(p.ultimaData, oggi);
  return {
    righe, totale: { ...tot, prezzoMedio: tot.pezzi > 0 ? r2(tot.fatturato / tot.pezzi) : null, lottoMedio: tot.lotti > 0 ? Math.round(tot.consegnati / tot.lotti) : null },
    ultimaData: p.ultimaData, primaData: p.primaData, mesiFermo: mesi, fermo: mesi != null && mesi >= MESI_FERMO,
  };
}

// ───────────────────────────── margine preventivo / consuntivo ─────────────────────────────

export interface FaseConsuntivoLotto { codice: string; cicloPrevSec: number; uomoPrevSec: number; tariffa?: string | null }
export interface TariffeConsuntivo { costoAziendaH: number; costoOperatoreProduzioneH: number; costoOperatoreUfficioH: number }

/**
 * Consuntivo di una commessa dai tempi scritti sulla scheda (stessa formula del preventivo: ore ciclo × costo azienda + ore uomo × costo operatore).
 * Le fasi senza tempi registrati restano al previsto (si vede dalla copertura `fasiConTempi`/`fasiTotali`); `costoVoci` (materiali, consumo,
 * spedizione) è quello del preventivo per la quantità della commessa. Margine = prezzo del lotto − costo fasi − costo voci.
 */
export function consuntivoLotto(opz: { prezzoLotto: number; costoVoci: number; fasi: FaseConsuntivoLotto[]; reali: Record<string, { cicloSec: number; uomoSec: number }>; tariffe: TariffeConsuntivo }) {
  const t = opz.tariffe;
  const costo = (cicloSec: number, uomoSec: number, tariffa?: string | null) =>
    (cicloSec / 3600) * t.costoAziendaH + (uomoSec / 3600) * (tariffa === 'ufficio' ? t.costoOperatoreUfficioH : t.costoOperatoreProduzioneH);
  let previsto = 0, reale = 0, conTempi = 0, cicloPrev = 0, cicloReale = 0;
  for (const f of opz.fasi) {
    const cp = costo(f.cicloPrevSec, f.uomoPrevSec, f.tariffa);
    previsto += cp; cicloPrev += f.cicloPrevSec;
    const r = opz.reali[f.codice];
    if (r && (r.cicloSec > 0 || r.uomoSec > 0)) { reale += costo(r.cicloSec, r.uomoSec, f.tariffa); cicloReale += r.cicloSec; conTempi++; }
    else { reale += cp; cicloReale += f.cicloPrevSec; }
  }
  // fasi fatte ma non previste dal preventivo: costo reale in più
  for (const [codice, r] of Object.entries(opz.reali)) {
    if (opz.fasi.some(f => f.codice === codice)) continue;
    reale += costo(r.cicloSec, r.uomoSec); cicloReale += r.cicloSec;
  }
  const marginePrevisto = r2(opz.prezzoLotto - previsto - opz.costoVoci), margineReale = r2(opz.prezzoLotto - reale - opz.costoVoci);
  const pct = (m: number) => (opz.prezzoLotto > 0 ? Math.round((m / opz.prezzoLotto) * 1000) / 10 : null);
  return {
    costoFasiPrevisto: r2(previsto), costoFasiReale: r2(reale), costoVoci: r2(opz.costoVoci), prezzoLotto: r2(opz.prezzoLotto),
    marginePrevisto, margineReale, marginePrevistoPct: pct(marginePrevisto), margineRealePct: pct(margineReale),
    scostamentoFasiPct: previsto > 0 ? Math.round(((reale - previsto) / previsto) * 100) : null,
    oreCicloPreviste: r2(cicloPrev / 3600), oreCicloReali: r2(cicloReale / 3600),
    fasiConTempi: conTempi, fasiTotali: opz.fasi.length,
  };
}
export type ConsuntivoLotto = ReturnType<typeof consuntivoLotto>;

/** Margine medio (percentuale pesata sul prezzo) dei consuntivi che hanno almeno una fase con i tempi. */
export function margineMedioConsuntivi(cons: ConsuntivoLotto[]): { previstoPct: number | null; realePct: number | null; commesse: number } {
  const utili = cons.filter(c => c.fasiConTempi > 0 && c.prezzoLotto > 0);
  const prezzo = utili.reduce((t, c) => t + c.prezzoLotto, 0);
  if (!prezzo) return { previstoPct: null, realePct: null, commesse: 0 };
  const pct = (m: number) => Math.round((m / prezzo) * 1000) / 10;
  return { previstoPct: pct(utili.reduce((t, c) => t + c.marginePrevisto, 0)), realePct: pct(utili.reduce((t, c) => t + c.margineReale, 0)), commesse: utili.length };
}

// ───────────────────────────── visione d'insieme dei clienti ─────────────────────────────

export interface DatiExtraCliente { margineStimato?: number | null; copertura?: number; giorniIncasso?: number | null; ritardoMedio?: number | null; scaduto?: number; esposizione?: number }
export type SegnaleCliente = 'calo forte' | 'in calo' | 'in crescita' | 'nuovo' | 'perso' | 'fermo' | null;
export interface RigaVisioneCliente {
  clienteChiave: string; clienteId: number | null; cliente: string;
  fatturato: number; prima: number; primaAnnoIntero: number; variazione: number | null; quota: number | null;
  ultimaVendita: string | null; mesiFermo: number | null; fermo: boolean; nuovo: boolean; perso: boolean; segnale: SegnaleCliente;
  marginePct: number | null; copertura: number; giorniIncasso: number | null; ritardoMedio: number | null; scaduto: number; esposizione: number;
}
export interface VisioneClienti {
  anno: number; finoA: string | null; clienti: RigaVisioneCliente[]; totale: number; totalePrima: number; variazione: number | null;
  primi3: number; primi5: number; fermi: RigaVisioneCliente[]; nuovi: RigaVisioneCliente[]; persi: RigaVisioneCliente[]; inCaloForte: RigaVisioneCliente[];
}

/** Dentro il periodo: anno e, se `finoA`, fino allo stesso giorno (confronto "dal 1° gennaio a oggi"). */
const nelPeriodo = (data: string, anno: number, finoA: string | null) => Number(data.slice(0, 4)) === anno && (!finoA || data.slice(5, 10) <= finoA.slice(5, 10));

/** Soglia per segnalare un calo forte (almeno il 30 % in meno, su un cliente che valeva almeno 2.000 €). */
export const CALO_FORTE_PCT = -30;
const MINIMO_CALO = 2000;

/**
 * Visione d'insieme dei clienti per un anno: classifica per fatturato con il peso, confronto con lo stesso periodo dell'anno prima
 * (anno intero per gli anni passati), concentrazione dei primi 3 e 5, fermi (nessuna vendita da più di 6 mesi), nuovi (prima vendita
 * nell'anno) e persi (compravano l'anno prima, niente quest'anno). `consegne` (facoltative) sono date di DDT di vendita, che valgono come
 * "ultimo ordine" insieme alle fatture. `extra` porta margine, giorni di incasso e crediti per nome del cliente.
 */
export function visioneClienti(fatture: FatturaCliente[], anno: number, oggi: string, opz: { finoA?: string | null; consegne?: { clienteChiave: string; data: string }[]; extra?: Map<string, DatiExtraCliente> } = {}): VisioneClienti {
  const finoA = opz.finoA ?? null;
  const per = new Map<string, RigaVisioneCliente & { primaVendita: string | null }>();
  const prendi = (chiave: string, nome: string, id: number | null) => {
    let c = per.get(chiave);
    if (!c) {
      c = { clienteChiave: chiave, clienteId: id, cliente: nome, fatturato: 0, prima: 0, primaAnnoIntero: 0, variazione: null, quota: null, ultimaVendita: null, mesiFermo: null,
        fermo: false, nuovo: false, perso: false, segnale: null, marginePct: null, copertura: 0, giorniIncasso: null, ritardoMedio: null, scaduto: 0, esposizione: 0, primaVendita: null };
      per.set(chiave, c);
    }
    return c;
  };
  const idDaChiave = (k: string) => (k.startsWith('c') && /^c\d+$/.test(k) ? Number(k.slice(1)) : null);
  for (const f of fatture) {
    if (!['fattura', 'nota_credito'].includes(f.tipo)) continue;
    const c = prendi(f.clienteChiave, f.cliente, idDaChiave(f.clienteChiave));
    const v = segno(f.tipo) * (Number(f.imponibile) || 0);
    if (nelPeriodo(f.data, anno, finoA)) c.fatturato += v;
    if (nelPeriodo(f.data, anno - 1, finoA)) c.prima += v;
    if (nelPeriodo(f.data, anno - 1, null)) c.primaAnnoIntero += v;
    if (f.tipo === 'fattura' && v > 0) {
      const d = f.data.slice(0, 10);
      if (d <= oggi && (!c.ultimaVendita || d > c.ultimaVendita)) c.ultimaVendita = d;
      if (!c.primaVendita || d < c.primaVendita) c.primaVendita = d;
    }
  }
  for (const k of opz.consegne ?? []) {
    const c = per.get(k.clienteChiave);
    if (!c) continue;
    const d = k.data.slice(0, 10);
    if (d <= oggi && (!c.ultimaVendita || d > c.ultimaVendita)) c.ultimaVendita = d;
  }
  const clienti = [...per.values()].filter(c => Math.abs(c.fatturato) >= 0.01 || Math.abs(c.prima) >= 0.01 || Math.abs(c.primaAnnoIntero) >= 0.01);
  const totale = r2(clienti.reduce((t, c) => t + Math.max(0, c.fatturato), 0)), totalePrima = r2(clienti.reduce((t, c) => t + Math.max(0, c.prima), 0));
  const annoCorrente = Number(oggi.slice(0, 4)) === anno;
  for (const c of clienti) {
    c.fatturato = r2(c.fatturato); c.prima = r2(c.prima); c.primaAnnoIntero = r2(c.primaAnnoIntero);
    c.variazione = variazionePct(c.fatturato, c.prima);
    c.quota = pesoPct(c.fatturato, totale);
    c.mesiFermo = mesiDa(c.ultimaVendita, oggi);
    c.fermo = annoCorrente && c.mesiFermo != null && c.mesiFermo >= MESI_FERMO && (c.fatturato > 0 || c.prima > 0 || c.primaAnnoIntero > 0);
    c.nuovo = c.fatturato > 0 && !!c.primaVendita && Number(c.primaVendita.slice(0, 4)) === anno;
    c.perso = c.primaAnnoIntero >= 1 && c.fatturato <= 0;
    const e = opz.extra?.get(c.cliente);
    if (e) {
      if (e.margineStimato != null && e.copertura && c.fatturato > 0) { c.marginePct = Math.round((e.margineStimato / (c.fatturato * e.copertura / 100)) * 1000) / 10; c.copertura = e.copertura; }
      c.giorniIncasso = e.giorniIncasso ?? null; c.ritardoMedio = e.ritardoMedio ?? null; c.scaduto = e.scaduto ?? 0; c.esposizione = e.esposizione ?? 0;
    }
    c.segnale = c.nuovo ? 'nuovo' : c.perso ? 'perso' : c.variazione != null && c.variazione <= CALO_FORTE_PCT && c.prima >= MINIMO_CALO ? 'calo forte'
      : c.fermo ? 'fermo' : c.variazione != null && c.variazione <= -10 ? 'in calo' : c.variazione != null && c.variazione >= 10 ? 'in crescita' : null;
  }
  const ordinati = clienti.map(({ primaVendita: _p, ...c }) => c).sort((a, b) => b.fatturato - a.fatturato || b.prima - a.prima || a.cliente.localeCompare(b.cliente));
  const quota = (n: number) => Math.round(ordinati.slice(0, n).reduce((t, c) => t + (c.quota ?? 0), 0) * 10) / 10;
  return {
    anno, finoA, clienti: ordinati, totale, totalePrima, variazione: variazionePct(totale, totalePrima), primi3: quota(3), primi5: quota(5),
    fermi: ordinati.filter(c => c.fermo).sort((a, b) => (b.mesiFermo ?? 0) - (a.mesiFermo ?? 0) || b.primaAnnoIntero - a.primaAnnoIntero),
    nuovi: ordinati.filter(c => c.nuovo), persi: ordinati.filter(c => c.perso).sort((a, b) => b.primaAnnoIntero - a.primaAnnoIntero),
    inCaloForte: ordinati.filter(c => c.segnale === 'calo forte'),
  };
}
