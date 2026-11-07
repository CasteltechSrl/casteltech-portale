/**
 * Previsione di cassa a 30, 60 e 90 giorni (Adriano 3/11/2026, "in Amministrazione → Analisi, per avere un quadro completo").
 * Nata dal file Excel "cash-flow-snapshot" fatto con i dati di Fatture in Cloud; nel portale usa in più F24, stipendi e IVA.
 *
 * Regole:
 * - incasso atteso = scadenza della rata + ritardo medio del cliente (giorni dopo la scadenza, pesati sull'importo, rate incassate
 *   negli ultimi 12 mesi) se il cliente ha almeno `minimoPagamenti` incassi, altrimenti il ritardo medio di tutti; mai prima di oggi.
 *   Le note di credito aperte arrivano in negativo e tolgono (stessa regola dei crediti).
 * - pagamenti ai fornitori alla scadenza; quelli già scaduti e non segnati pagati vanno a oggi (o sono da pagare o manca la registrazione).
 * - uscite fisse: ogni mese nel giorno indicato (stipendi, F24, IVA, altre). Un'uscita "vera" (F24 letto, IVA calcolata dai registri)
 *   nello stesso mese prende il posto della stima con la stessa chiave.
 * - banda ± solo sugli incassi: deviazione del ritardo ÷ giorni medi dalla fattura all'incasso, massimo 50 % (30 % senza storico).
 * Solo calcoli: niente database e niente rete (letture in rotte/analisi.ts).
 */
import { scadenzaVersamentoIva } from './registri-iva.js';

export interface RataAperta { id?: number; cliente: string; numero: string; scadenza: string; importo: number }
/** Rate anticipate dalla banca (engine/anticipi.ts): RiBa = già accreditate al 100 %, bonifico = all'incasso la banca riprende la quota anticipata. */
export interface AnticipiCassa { perRata: Map<number, { tipo: 'bonifico' | 'riba'; anticipato: number }>; daRientrare: { numero: string; data: string; importo: number }[] }
export interface IncassoStorico { cliente: string; dataFattura: string; scadenza: string; incassata: string; importo: number }
export interface PagamentoAperto { fornitore: string; numero: string; scadenza: string; importo: number }
/** Uscita di ogni mese. `chiave` (stipendi, f24, iva, altro) serve a non contarla due volte con un'uscita vera dello stesso mese. */
export interface UscitaFissa { chiave: string; voce: string; importo: number; giorno: number; stima?: boolean }
/** Uscita con data precisa (F24 letto dall'IA, IVA dai registri). */
export interface UscitaPuntuale { chiave: string; voce: string; data: string; importo: number }
export interface Saldo { importo: number; data: string }

export type CodiceFinestra = 'f30' | 'f60' | 'f90' | 'oltre';
export const NOMI_FINESTRE: Record<CodiceFinestra, string> = { f30: '0–30 giorni', f60: '31–60 giorni', f90: '61–90 giorni', oltre: 'oltre 90 giorni' };

export interface Movimento {
  data: string; finestra: CodiceFinestra; tipo: 'incasso' | 'pagamento' | 'uscita';
  nome: string; riferimento: string; importo: number;        // con segno: + entra, − esce
  scadenza?: string; ritardo?: number; scaduta?: boolean; stima?: boolean;
}
export interface Finestra {
  codice: CodiceFinestra; nome: string; fino: string;
  incassi: number; pagamenti: number; uscite: number; netto: number; basso: number; alto: number;
  cassaFine: number | null; cassaFineBassa: number | null;
}
export interface RitardoCliente { cliente: string; pagamenti: number; ritardo: number | null; ritardoMax: number | null; usato: number; daStorico: boolean; aperto: number }
export interface Rischio { livello: 'critico' | 'attenzione' | 'nota'; testo: string; link?: [string, string] }
export interface Previsione {
  oggi: string; saldo: Saldo | null; banda: number; ritardoGenerale: number; giorniMediIncasso: number | null;
  finestre: Finestra[]; movimenti: Movimento[]; clienti: RitardoCliente[];
  puntoMinimo: { data: string; cassa: number } | null; puntoMinimoBasso: { data: string; cassa: number } | null;
  rischi: Rischio[];
  /** rate RiBa già accreditate (non entrano più) e quote dei bonifici che la banca riprende all'incasso */
  anticipi: { riba: number; bonifico: number; daRientrare: number };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const ms = (d: string) => Date.parse(`${d.slice(0, 10)}T00:00:00Z`);
export const giorniTra = (a: string, b: string) => Math.round((ms(b) - ms(a)) / 86_400_000);
export const piuGiorni = (d: string, n: number) => new Date(ms(d) + n * 86_400_000).toISOString().slice(0, 10);
const due = (n: number) => String(n).padStart(2, '0');
/** Euro senza decimali con il punto delle migliaia sempre (toLocaleString in italiano non lo mette sotto 10.000). */
export const euro = (n: number) => `${n < 0 ? '-' : ''}${String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} €`;
const dataIt = (d: string) => d.slice(0, 10).split('-').reverse().join('/');

/** Finestra di una data rispetto a oggi: fino a 30 giorni compresi, 31–60, 61–90, oltre. */
export function finestraDi(data: string, oggi: string): CodiceFinestra {
  const g = giorniTra(oggi, data);
  return g <= 30 ? 'f30' : g <= 60 ? 'f60' : g <= 90 ? 'f90' : 'oltre';
}

/** Ritardo (giorni dopo la scadenza) di ogni cliente e di tutti, pesato sull'importo. Negativo = paga prima. */
export function ritardiIncasso(storico: IncassoStorico[]) {
  const perCliente = new Map<string, { somma: number; peso: number; n: number; max: number }>();
  let somma = 0, peso = 0, giorni = 0;
  for (const s of storico) {
    if (!(s.importo > 0)) continue;
    const r = giorniTra(s.scadenza, s.incassata);
    const c = perCliente.get(s.cliente) ?? { somma: 0, peso: 0, n: 0, max: -Infinity };
    c.somma += r * s.importo; c.peso += s.importo; c.n++; c.max = Math.max(c.max, r);
    perCliente.set(s.cliente, c);
    somma += r * s.importo; peso += s.importo; giorni += giorniTra(s.dataFattura, s.incassata) * s.importo;
  }
  const media = peso ? somma / peso : 0;
  let varianza = 0;
  for (const s of storico) if (s.importo > 0) varianza += s.importo * (giorniTra(s.scadenza, s.incassata) - media) ** 2;
  return {
    perCliente, media, peso,
    deviazione: peso ? Math.sqrt(varianza / peso) : 0,
    giorniMedi: peso ? giorni / peso : null,
  };
}

/** Banda ± sugli incassi: deviazione del ritardo ÷ giorni medi fattura → incasso, tra 0 e 50 %; 30 % senza storico. */
export function bandaIncassi(deviazione: number, giorniMedi: number | null): number {
  if (!giorniMedi || giorniMedi <= 0) return 0.3;
  return Math.min(0.5, Math.max(0, deviazione / giorniMedi));
}

/** Date delle uscite fisse da oggi (compreso) a oggi + `giorni`: il giorno oltre la fine del mese diventa l'ultimo del mese. IVA: scadenza di legge. */
export function dateUscita(u: Pick<UscitaFissa, 'chiave' | 'giorno'>, oggi: string, giorni = 90): string[] {
  const fine = piuGiorni(oggi, giorni), date: string[] = [];
  let anno = Number(oggi.slice(0, 4)), mese = Number(oggi.slice(5, 7));
  for (let i = 0; i < 5; i++) {
    let d: string;
    if (u.chiave === 'iva') {
      // versamento del mese prima: 16 del mese (20 agosto), primo giorno lavorativo
      const mPrima = mese === 1 ? 12 : mese - 1, aPrima = mese === 1 ? anno - 1 : anno;
      d = scadenzaVersamentoIva(aPrima, mPrima);
    } else {
      const ultimo = new Date(Date.UTC(anno, mese, 0)).getUTCDate();
      d = `${anno}-${due(mese)}-${due(Math.min(Math.max(1, Math.round(u.giorno) || 1), ultimo))}`;
    }
    if (d >= oggi && d <= fine) date.push(d);
    mese++; if (mese > 12) { mese = 1; anno++; }
  }
  return date;
}

export function previsioneCassa(x: {
  oggi: string; saldo: Saldo | null; rate: RataAperta[]; storico: IncassoStorico[]; pagamenti: PagamentoAperto[];
  fisse: UscitaFissa[]; puntuali: UscitaPuntuale[]; minimoPagamenti?: number; anticipi?: AnticipiCassa;
}): Previsione {
  const { oggi } = x, minimo = x.minimoPagamenti ?? 3;
  const st = ritardiIncasso(x.storico);
  const banda = bandaIncassi(st.deviazione, st.giorniMedi);
  const movimenti: Movimento[] = [];

  // ── incassi ──
  const aperto = new Map<string, number>();
  const ritardoUsato = (cliente: string) => {
    const c = st.perCliente.get(cliente);
    return c && c.n >= minimo ? c.somma / c.peso : st.media;
  };
  const anticipi = { riba: 0, bonifico: 0, daRientrare: 0 };
  for (const r of x.rate) {
    const a = r.id != null ? x.anticipi?.perRata.get(r.id) : undefined;
    // RiBa al salvo buon fine: la banca l'ha già accreditata, alla scadenza non entra altro (Adriano 7/11/2026)
    if (a?.tipo === 'riba') { anticipi.riba += r.importo; continue; }
    const rit = ritardoUsato(r.cliente);
    const prevista = piuGiorni(r.scadenza, Math.round(rit));
    const data = prevista < oggi ? oggi : prevista;
    movimenti.push({ data, finestra: finestraDi(data, oggi), tipo: 'incasso', nome: r.cliente, riferimento: r.numero, importo: r2(r.importo),
      scadenza: r.scadenza, ritardo: Math.round(rit), scaduta: r.scadenza < oggi });
    // bonifico anticipato (80 %): quando il cliente paga la banca riprende l'anticipo, resta il 20 %
    if (a?.tipo === 'bonifico' && a.anticipato > 0) {
      anticipi.bonifico += a.anticipato;
      movimenti.push({ data, finestra: finestraDi(data, oggi), tipo: 'uscita', nome: `Rientro anticipo fattura ${r.numero} (${r.cliente})`, riferimento: r.numero,
        importo: -r2(a.anticipato), scadenza: r.scadenza });
    }
    aperto.set(r.cliente, (aperto.get(r.cliente) ?? 0) + r.importo);
  }
  // anticipi di fatture già incassate che la banca non ha ancora ripreso
  for (const d of x.anticipi?.daRientrare ?? []) {
    anticipi.daRientrare += d.importo;
    movimenti.push({ data: oggi, finestra: finestraDi(oggi, oggi), tipo: 'uscita', nome: `Rientro anticipo fattura ${d.numero} (già incassata, anticipo del ${dataIt(d.data)} ancora aperto)`,
      riferimento: d.numero, importo: -r2(d.importo) });
  }
  // ── fornitori ──
  for (const p of x.pagamenti) {
    const data = p.scadenza < oggi ? oggi : p.scadenza;
    movimenti.push({ data, finestra: finestraDi(data, oggi), tipo: 'pagamento', nome: p.fornitore, riferimento: p.numero, importo: -r2(p.importo),
      scadenza: p.scadenza, scaduta: p.scadenza < oggi });
  }
  // ── uscite: prima quelle vere, poi le stime nei mesi che non le hanno ──
  const fine90 = piuGiorni(oggi, 90);
  const vere = new Set<string>();
  for (const u of x.puntuali) {
    if (u.data < oggi || u.data > fine90 || !(u.importo > 0)) continue;
    vere.add(`${u.chiave}|${u.data.slice(0, 7)}`);
    movimenti.push({ data: u.data, finestra: finestraDi(u.data, oggi), tipo: 'uscita', nome: u.voce, riferimento: '', importo: -r2(u.importo) });
  }
  for (const f of x.fisse) {
    if (!(f.importo > 0)) continue;
    for (const d of dateUscita(f, oggi)) {
      if (vere.has(`${f.chiave}|${d.slice(0, 7)}`)) continue;
      movimenti.push({ data: d, finestra: finestraDi(d, oggi), tipo: 'uscita', nome: f.voce, riferimento: '', importo: -r2(f.importo), stima: f.stima });
    }
  }
  movimenti.sort((a, b) => a.data.localeCompare(b.data) || b.importo - a.importo);

  // ── finestre ──
  const codici: CodiceFinestra[] = ['f30', 'f60', 'f90'];
  let cassa = x.saldo?.importo ?? null, cassaBassa = x.saldo?.importo ?? null;
  const finestre: Finestra[] = codici.map((codice, i) => {
    const mv = movimenti.filter(m => m.finestra === codice);
    const incassi = r2(mv.filter(m => m.tipo === 'incasso').reduce((s, m) => s + m.importo, 0));
    const pagamenti = r2(mv.filter(m => m.tipo === 'pagamento').reduce((s, m) => s + m.importo, 0));
    const uscite = r2(mv.filter(m => m.tipo === 'uscita').reduce((s, m) => s + m.importo, 0));
    const netto = r2(incassi + pagamenti + uscite);
    const basso = r2(incassi * (1 - banda) + pagamenti + uscite), alto = r2(incassi * (1 + banda) + pagamenti + uscite);
    if (cassa != null) cassa = r2(cassa + netto);
    if (cassaBassa != null) cassaBassa = r2(cassaBassa + basso);
    return { codice, nome: NOMI_FINESTRE[codice], fino: piuGiorni(oggi, 30 * (i + 1)), incassi, pagamenti, uscite, netto, basso, alto, cassaFine: cassa, cassaFineBassa: cassaBassa };
  });

  // ── punto più basso della cassa giorno per giorno (atteso e scenario basso) ──
  const minimoCassa = (fattore: number) => {
    if (!x.saldo) return null;
    let c = x.saldo.importo, min = { data: oggi, cassa: r2(c) };
    for (const m of movimenti) {
      if (m.finestra === 'oltre') break;
      c += m.tipo === 'incasso' ? m.importo * fattore : m.importo;
      if (c < min.cassa) min = { data: m.data, cassa: r2(c) };
    }
    return min;
  };
  const puntoMinimo = minimoCassa(1), puntoMinimoBasso = minimoCassa(1 - banda);

  // ── ritardi per cliente (solo chi ha qualcosa da incassare) ──
  const clienti: RitardoCliente[] = [...aperto.entries()].map(([cliente, imp]) => {
    const c = st.perCliente.get(cliente);
    return { cliente, aperto: r2(imp), pagamenti: c?.n ?? 0, ritardo: c ? Math.round(c.somma / c.peso) : null, ritardoMax: c ? c.max : null,
      usato: Math.round(ritardoUsato(cliente)), daStorico: !!c && c.n >= minimo };
  }).sort((a, b) => b.aperto - a.aperto);

  const previsione: Previsione = { oggi, saldo: x.saldo, banda, ritardoGenerale: Math.round(st.media * 10) / 10,
    giorniMediIncasso: st.giorniMedi == null ? null : Math.round(st.giorniMedi), finestre, movimenti, clienti, puntoMinimo, puntoMinimoBasso, rischi: [],
    anticipi: { riba: r2(anticipi.riba), bonifico: r2(anticipi.bonifico), daRientrare: r2(anticipi.daRientrare) } };
  previsione.rischi = rischiCassa(previsione, x.fisse, minimo);
  return previsione;
}

/** I prossimi 90 giorni comprendono il 15 dicembre (quando di solito si paga la tredicesima)? */
export function comprendeDicembre(oggi: string): boolean {
  for (const anno of [Number(oggi.slice(0, 4)) - 1, Number(oggi.slice(0, 4))]) {
    const g = giorniTra(oggi, `${anno}-12-15`);
    if (g >= 0 && g <= 90) return true;
  }
  return false;
}

/** Cose da sapere, in ordine di gravità: prima i soldi che possono mancare, poi i dati che mancano. */
export function rischiCassa(p: Previsione, fisse: UscitaFissa[], minimo = 3): Rischio[] {
  const r: Rischio[] = [];
  const entro90 = p.movimenti.filter(m => m.finestra !== 'oltre');
  if (!p.saldo) r.push({ livello: 'attenzione', testo: 'Manca il saldo della banca: la previsione mostra solo quanto entra ed esce, non quanta cassa resta. Scrivilo qui sotto.' });
  else {
    const vecchio = giorniTra(p.saldo.data, p.oggi);
    if (vecchio > 7) r.push({ livello: 'attenzione', testo: `Il saldo della banca è del ${dataIt(p.saldo.data)} (${vecchio} giorni fa): aggiornalo, i movimenti di questi giorni non ci sono.` });
    if (p.puntoMinimo && p.puntoMinimo.cassa < 0)
      r.push({ livello: 'critico', testo: `Cassa sotto zero il ${dataIt(p.puntoMinimo.data)}: ${euro(p.puntoMinimo.cassa)} anche se i clienti pagano come al solito. Servono incassi prima o pagamenti spostati.` });
    else if (p.puntoMinimoBasso && p.puntoMinimoBasso.cassa < 0)
      r.push({ livello: 'attenzione', testo: `Se i clienti pagano più lenti del solito la cassa scende sotto zero il ${dataIt(p.puntoMinimoBasso.data)} (${euro(p.puntoMinimoBasso.cassa)}).` });
  }
  if (!fisse.some(f => f.chiave === 'stipendi' && f.importo > 0))
    r.push({ livello: 'attenzione', testo: 'Stipendi non indicati: la previsione è ottimista. Scrivi il netto mensile nelle uscite fisse.' });
  if (comprendeDicembre(p.oggi) && !fisse.some(f => /tredicesim/i.test(f.voce)))
    r.push({ livello: 'nota', testo: 'A dicembre si paga anche la tredicesima: non è nelle uscite fisse. Aggiungila come "Tredicesima" se vuoi vederla.' });

  // incassi
  const incassi = entro90.filter(m => m.tipo === 'incasso');
  const totaleIncassi = incassi.reduce((s, m) => s + Math.max(0, m.importo), 0);
  const scaduti = incassi.filter(m => m.scaduta);
  if (scaduti.length) {
    const tot = scaduti.reduce((s, m) => s + m.importo, 0);
    r.push({ livello: 'attenzione', testo: `${euro(tot)} di rate dei clienti sono già scadute: le conto come incassate oggi, ma finché non arrivano la previsione è ottimista.`,
      link: ['/amministrazione/solleciti', 'Solleciti incassi'] });
  }
  const perCliente = new Map<string, number>();
  for (const m of incassi) perCliente.set(m.nome, (perCliente.get(m.nome) ?? 0) + m.importo);
  for (const [cliente, imp] of [...perCliente.entries()].sort((a, b) => b[1] - a[1]))
    if (totaleIncassi > 0 && imp >= 5000 && imp / totaleIncassi >= 0.25)
      r.push({ livello: 'attenzione', testo: `${cliente} vale ${Math.round((imp / totaleIncassi) * 100)} % degli incassi attesi entro 90 giorni (${euro(imp)}): un suo ritardo sposta molta cassa.` });
  for (const c of p.clienti) if (c.daStorico && c.usato >= 10 && c.aperto > 0)
    r.push({ livello: 'nota', testo: `${c.cliente} paga in media ${c.usato} giorni dopo la scadenza (al massimo ${c.ritardoMax}): i suoi ${euro(c.aperto)} sono spostati più avanti.` });
  const senza = p.clienti.filter(c => !c.daStorico && c.aperto > 0);
  if (senza.length)
    r.push({ livello: 'nota', testo: `Pochi incassi (meno di ${minimo}) per ${senza.map(c => c.cliente).join(', ')}: uso il ritardo medio di tutti (${Math.round(p.ritardoGenerale)} giorni).` });

  // fornitori
  const pagScaduti = entro90.filter(m => m.tipo === 'pagamento' && m.scaduta);
  if (pagScaduti.length) {
    const tot = -pagScaduti.reduce((s, m) => s + m.importo, 0);
    const una = pagScaduti.length === 1;
    r.push({ livello: 'attenzione', testo: `${una ? '1 rata' : `${pagScaduti.length} rate`} di fornitori (${euro(tot)}) ${una ? 'ha' : 'hanno'} la scadenza passata e non ${una ? 'è segnata pagata' : 'sono segnate pagate'}: la conto in uscita oggi. Se è già pagata, segnala come pagata.`,
      link: ['/amministrazione/ricevuti?da_pagare=1', 'Fatture fornitori'] });
  }
  if (fisse.some(f => f.stima && f.importo > 0))
    r.push({ livello: 'nota', testo: 'Le uscite segnate "stima" sono calcolate dai mesi passati (media): quando arriva l\'F24 vero o si chiude il mese IVA prende il posto della stima.' });
  const ordine = { critico: 0, attenzione: 1, nota: 2 };
  return r.sort((a, b) => ordine[a.livello] - ordine[b.livello]);
}

// ───────────────────────────── impostazioni della pagina ─────────────────────────────

/** Impostazioni salvate (chiave 'previsione_cassa'): saldo della banca, uscite fisse scritte dall'ufficio. Null = automatico. */
export interface ImpostazioniCassa {
  saldo: number | null; dataSaldo: string | null;
  stipendi: number | null; giornoStipendi: number;
  f24: number | null; giornoF24: number;
  iva: number | null;
  altre: { voce: string; importo: number; giorno: number }[];
  minimoPagamenti: number;
}
export const IMPOSTAZIONI_CASSA_INIZIALI: ImpostazioniCassa = {
  saldo: null, dataSaldo: null, stipendi: null, giornoStipendi: 10, f24: null, giornoF24: 16, iva: null, altre: [], minimoPagamenti: 3,
};

/** Numero scritto all'italiana: "12.500,50" → 12500.5; vuoto → null. */
export function numeroScritto(s: unknown): number | null {
  const t = String(s ?? '').trim().replace(/\s|€/g, '');
  if (!t) return null;
  const n = Number(/,/.test(t) ? t.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t);
  return Number.isFinite(n) ? n : null;
}
const giornoValido = (g: unknown, predefinito: number) => {
  const n = Math.round(Number(g));
  return n >= 1 && n <= 31 ? n : predefinito;
};

/** Legge le impostazioni salvate (o il modulo) con i valori iniziali per quello che manca. */
export function leggiImpostazioniCassa(v: any): ImpostazioniCassa {
  const b = IMPOSTAZIONI_CASSA_INIZIALI;
  const data = typeof v?.dataSaldo === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.dataSaldo) ? v.dataSaldo : null;
  const altre = (Array.isArray(v?.altre) ? v.altre : [])
    .map((a: any) => ({ voce: String(a?.voce ?? '').trim().slice(0, 60), importo: numeroScritto(a?.importo) ?? 0, giorno: giornoValido(a?.giorno, 1) }))
    .filter((a: { voce: string; importo: number }) => a.voce && a.importo > 0).slice(0, 10);
  const pos = (n: unknown) => { const x = numeroScritto(n); return x == null ? null : Math.max(0, x); };
  return {
    saldo: numeroScritto(v?.saldo), dataSaldo: data,
    stipendi: pos(v?.stipendi), giornoStipendi: giornoValido(v?.giornoStipendi, b.giornoStipendi),
    f24: pos(v?.f24), giornoF24: giornoValido(v?.giornoF24, b.giornoF24),
    iva: pos(v?.iva),
    altre, minimoPagamenti: Math.min(12, Math.max(1, Math.round(Number(v?.minimoPagamenti)) || b.minimoPagamenti)),
  };
}

/** Valori proposti dai dati del portale (quando l'ufficio non ha scritto nulla). */
export interface ValoriAutomatici { stipendi: number | null; stipendiDa: string | null; f24: number | null; f24Da: string | null; iva: number | null; ivaDa: string | null }

/** Uscite fisse da usare: quelle scritte dall'ufficio, altrimenti quelle proposte dai dati (segnate "stima"). */
export function usciteFisse(i: ImpostazioniCassa, auto: ValoriAutomatici): UscitaFissa[] {
  const u: UscitaFissa[] = [];
  const stip = i.stipendi ?? auto.stipendi;
  if (stip) u.push({ chiave: 'stipendi', voce: 'Stipendi netti', importo: stip, giorno: i.giornoStipendi, stima: i.stipendi == null });
  const f24 = i.f24 ?? auto.f24;
  if (f24) u.push({ chiave: 'f24', voce: 'F24 paghe (contributi e ritenute)', importo: f24, giorno: i.giornoF24, stima: i.f24 == null });
  const iva = i.iva ?? auto.iva;
  if (iva) u.push({ chiave: 'iva', voce: 'IVA da versare', importo: iva, giorno: 16, stima: i.iva == null });
  for (const a of i.altre) u.push({ chiave: 'altro', voce: a.voce, importo: a.importo, giorno: a.giorno });
  return u;
}

/** Media degli ultimi `n` valori positivi (null se non ce ne sono). */
export function mediaUltimi(valori: number[], n = 3): number | null {
  const v = valori.filter(x => x > 0).slice(-n);
  return v.length ? r2(v.reduce((s, x) => s + x, 0) / v.length) : null;
}

export const meseAnno = (anno: number, mese: number) => `${due(mese)}/${anno}`;
