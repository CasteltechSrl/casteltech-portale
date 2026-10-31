/**
 * Analisi dell'andamento (Adriano 31/10/2026: "bilancio, trend e analisi analitica e critica/di aiuto").
 * Dai documenti che il portale ha già (anche lo storico di Fatture in Cloud): fatturato e acquisti per mese confrontati con
 * lo stesso periodo dell'anno prima, clienti (peso, crescita, calo, giorni di incasso), prodotti (schede, prezzo medio,
 * margine stimato dal preventivo), acquisti per categoria; in fondo i commenti in parole semplici con cosa conviene fare.
 * Non è il bilancio: mancano personale, ammortamenti, banca (arrivano con prima nota e partita doppia).
 * Solo calcoli: niente database e niente rete.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;
const segno = (tipo: string) => (tipo === 'nota_credito' ? -1 : 1);
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

/** Una fattura o nota di credito emessa (imponibile del documento). */
export interface FatturaAnalisi { cliente: string; tipo: string; data: string; imponibile: number }
/** Una riga di fattura con codice prodotto. */
export interface RigaAnalisi { codice: string; descrizione: string; cliente: string; tipo: string; data: string; quantita: number; importo: number }
/** Una fattura del fornitore. */
export interface AcquistoAnalisi { fornitore: string; categoria: string | null; tipo: string; data: string; imponibile: number }
/** Una rata incassata: data della fattura, scadenza e incasso. */
export interface IncassoAnalisi { cliente: string; dataDocumento: string; scadenza: string; incassata: string; importo: number }
/** Prezzo e margine del preventivo più recente del prodotto (lotti successivi). */
export interface PreventivoProdotto { codice: string; prezzoScheda: number; marginePct: number | null }

export interface Periodo { anno: number; finoA: string | null }

/** Dentro il periodo (anno, fino allo stesso giorno dell'anno se `finoA`) o dentro lo stesso periodo dell'anno prima. */
function nelPeriodo(data: string, anno: number, finoA: string | null) {
  return Number(data.slice(0, 4)) === anno && (!finoA || data.slice(5, 10) <= finoA.slice(5, 10));
}

export const variazionePct = (attuale: number, prima: number): number | null => (prima > 0 ? Math.round(((attuale - prima) / prima) * 100) : null);

/** Somma per mese (12 valori) dell'anno indicato, note di credito in negativo. */
export function perMese<T extends { tipo: string; data: string }>(xs: T[], valore: (x: T) => number, anno: number, finoA: string | null = null): number[] {
  const mesi = Array(12).fill(0) as number[];
  for (const x of xs) if (nelPeriodo(x.data, anno, finoA)) mesi[Number(x.data.slice(5, 7)) - 1] += segno(x.tipo) * valore(x);
  return mesi.map(r2);
}

const somma = (v: number[]) => r2(v.reduce((s, x) => s + x, 0));

// ───────────────────────────── clienti ─────────────────────────────

export interface RigaCliente {
  cliente: string; fatturato: number; primaStessoPeriodo: number; primaAnnoIntero: number; variazione: number | null; quota: number;
  margineStimato: number | null; copertura: number; giorniIncasso: number | null; ritardoMedio: number | null;
}

export function analisiClienti(p: Periodo, fatture: FatturaAnalisi[], righe: RigaAnalisi[], preventivi: Map<string, PreventivoProdotto>, incassi: IncassoAnalisi[]): RigaCliente[] {
  const mappa = new Map<string, RigaCliente>();
  const prendi = (c: string) => {
    let r = mappa.get(c);
    if (!r) mappa.set(c, r = { cliente: c, fatturato: 0, primaStessoPeriodo: 0, primaAnnoIntero: 0, variazione: null, quota: 0, margineStimato: null, copertura: 0, giorniIncasso: null, ritardoMedio: null });
    return r;
  };
  for (const f of fatture) {
    const v = segno(f.tipo) * f.imponibile;
    if (nelPeriodo(f.data, p.anno, p.finoA)) prendi(f.cliente).fatturato += v;
    if (nelPeriodo(f.data, p.anno - 1, p.finoA)) prendi(f.cliente).primaStessoPeriodo += v;
    if (nelPeriodo(f.data, p.anno - 1, null)) prendi(f.cliente).primaAnnoIntero += v;
  }
  // margine stimato: righe dell'anno con un preventivo che ha il margine
  const margini = new Map<string, { margine: number; coperto: number }>();
  for (const r of righe) {
    if (!nelPeriodo(r.data, p.anno, p.finoA)) continue;
    const pr = preventivi.get(r.codice);
    if (pr?.marginePct == null) continue;
    const m = margini.get(r.cliente) ?? { margine: 0, coperto: 0 };
    m.margine += segno(r.tipo) * r.importo * pr.marginePct / 100;
    m.coperto += segno(r.tipo) * r.importo;
    margini.set(r.cliente, m);
  }
  // giorni di incasso: media pesata sull'importo (data fattura → incasso) e ritardo sulla scadenza
  const tempi = new Map<string, { giorni: number; ritardo: number; peso: number }>();
  const giorniTra = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
  for (const i of incassi) {
    const t = tempi.get(i.cliente) ?? { giorni: 0, ritardo: 0, peso: 0 };
    t.giorni += giorniTra(i.dataDocumento, i.incassata) * i.importo;
    t.ritardo += Math.max(0, giorniTra(i.scadenza, i.incassata)) * i.importo;
    t.peso += i.importo;
    tempi.set(i.cliente, t);
  }
  const elenco = [...mappa.values()].filter(r => Math.abs(r.fatturato) >= 0.01 || Math.abs(r.primaStessoPeriodo) >= 0.01 || Math.abs(r.primaAnnoIntero) >= 0.01);
  const totale = somma(elenco.map(r => Math.max(0, r.fatturato)));
  for (const r of elenco) {
    r.fatturato = r2(r.fatturato); r.primaStessoPeriodo = r2(r.primaStessoPeriodo); r.primaAnnoIntero = r2(r.primaAnnoIntero);
    r.variazione = variazionePct(r.fatturato, r.primaStessoPeriodo);
    r.quota = totale ? Math.round((Math.max(0, r.fatturato) / totale) * 1000) / 10 : 0;
    const m = margini.get(r.cliente);
    if (m && m.coperto > 0) { r.margineStimato = r2(m.margine); r.copertura = r.fatturato > 0 ? Math.min(100, Math.round((m.coperto / r.fatturato) * 100)) : 0; }
    const t = tempi.get(r.cliente);
    if (t && t.peso > 0) { r.giorniIncasso = Math.round(t.giorni / t.peso); r.ritardoMedio = Math.round(t.ritardo / t.peso); }
  }
  return elenco.sort((a, b) => b.fatturato - a.fatturato || b.primaStessoPeriodo - a.primaStessoPeriodo);
}

/** Quanto pesano i primi N clienti sul fatturato (percentuale). */
export function quotaPrimi(clienti: RigaCliente[], n: number): number {
  return Math.round(clienti.slice(0, n).reduce((s, c) => s + c.quota, 0) * 10) / 10;
}

// ───────────────────────────── prodotti ─────────────────────────────

export interface RigaProdotto {
  codice: string; descrizione: string; cliente: string; schede: number; fatturato: number; prezzoMedio: number | null;
  schedePrima: number; fatturatoPrima: number; prezzoPreventivo: number | null; marginePct: number | null; scartoPrezzo: number | null;
}

export function analisiProdotti(p: Periodo, righe: RigaAnalisi[], preventivi: Map<string, PreventivoProdotto>): RigaProdotto[] {
  const mappa = new Map<string, RigaProdotto>();
  for (const r of righe) {
    const ora = nelPeriodo(r.data, p.anno, p.finoA), prima = nelPeriodo(r.data, p.anno - 1, p.finoA);
    if (!ora && !prima) continue;
    let x = mappa.get(r.codice);
    if (!x) mappa.set(r.codice, x = { codice: r.codice, descrizione: r.descrizione, cliente: r.cliente, schede: 0, fatturato: 0, prezzoMedio: null,
      schedePrima: 0, fatturatoPrima: 0, prezzoPreventivo: null, marginePct: null, scartoPrezzo: null });
    const s = segno(r.tipo);
    if (ora) { x.schede += s * r.quantita; x.fatturato += s * r.importo; }
    else { x.schedePrima += s * r.quantita; x.fatturatoPrima += s * r.importo; }
  }
  const elenco = [...mappa.values()];
  for (const x of elenco) {
    x.fatturato = r2(x.fatturato); x.fatturatoPrima = r2(x.fatturatoPrima);
    x.prezzoMedio = x.schede > 0 ? r2(x.fatturato / x.schede) : null;
    const pr = preventivi.get(x.codice);
    if (pr) {
      x.prezzoPreventivo = pr.prezzoScheda > 0 ? r2(pr.prezzoScheda) : null;
      x.marginePct = pr.marginePct;
      if (x.prezzoMedio != null && x.prezzoPreventivo) x.scartoPrezzo = Math.round(((x.prezzoMedio - x.prezzoPreventivo) / x.prezzoPreventivo) * 100);
    }
  }
  return elenco.filter(x => x.fatturato || x.fatturatoPrima).sort((a, b) => b.fatturato - a.fatturato || b.fatturatoPrima - a.fatturatoPrima);
}

/** Margine percentuale del preventivo (lotti successivi): guadagno ÷ prezzo del lotto. */
export function marginePreventivo(totali: { guadagnoLotto?: number; totaleSecondoLotto?: number } | null | undefined): number | null {
  const g = Number(totali?.guadagnoLotto), t = Number(totali?.totaleSecondoLotto);
  return Number.isFinite(g) && Number.isFinite(t) && t > 0 ? Math.round((g / t) * 1000) / 10 : null;
}

// ───────────────────────────── acquisti ─────────────────────────────

export interface RigaGruppo { nome: string; importo: number; prima: number; variazione: number | null; quota: number }

/** Acquisti raggruppati (per categoria di costo o per fornitore), stesso periodo dell'anno prima a confronto. */
export function raggruppaAcquisti(p: Periodo, acquisti: AcquistoAnalisi[], chiave: (a: AcquistoAnalisi) => string): RigaGruppo[] {
  const m = new Map<string, RigaGruppo>();
  for (const a of acquisti) {
    const ora = nelPeriodo(a.data, p.anno, p.finoA), prima = nelPeriodo(a.data, p.anno - 1, p.finoA);
    if (!ora && !prima) continue;
    const k = chiave(a);
    const g = m.get(k) ?? { nome: k, importo: 0, prima: 0, variazione: null, quota: 0 };
    if (ora) g.importo += segno(a.tipo) * a.imponibile; else g.prima += segno(a.tipo) * a.imponibile;
    m.set(k, g);
  }
  const elenco = [...m.values()];
  const totale = somma(elenco.map(g => Math.max(0, g.importo)));
  for (const g of elenco) {
    g.importo = r2(g.importo); g.prima = r2(g.prima); g.variazione = variazionePct(g.importo, g.prima);
    g.quota = totale ? Math.round((Math.max(0, g.importo) / totale) * 1000) / 10 : 0;
  }
  return elenco.sort((a, b) => b.importo - a.importo);
}

/** Nome leggibile della categoria di FIC: "B6_Materie prime c/acquisti" → "Materie prime c/acquisti". */
export const nomeCategoria = (c: string | null) => (c ? c.replace(/^[A-Z]\d+[a-z]?_/, '').trim() || c : 'Senza categoria');

// ───────────────────────────── commenti ─────────────────────────────

export type Livello = 'bene' | 'attenzione' | 'critico';
export interface Commento { livello: Livello; testo: string; consiglio?: string }

export interface DatiCommenti {
  periodo: Periodo; fatturato: number; fatturatoPrima: number; acquisti: number; acquistiPrima: number;
  mesiChiusi: number; fatturatoMesiChiusi: number; fatturatoAnnoPrima: number;
  clienti: RigaCliente[]; prodotti: RigaProdotto[]; scaduto: number; scadutoOltre60: { cliente: string; importo: number }[];
}

const euro = (n: number) => `${Math.round(n).toLocaleString('it-IT')} €`;
const elenca = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`);

/**
 * Commenti in parole semplici, dal più importante: cosa va bene, cosa peggiora e un consiglio pratico.
 * Sono indicazioni calcolate sui numeri: le scelte restano dell'azienda e del commercialista.
 */
export function commentiAnalisi(d: DatiCommenti): Commento[] {
  const c: Commento[] = [];
  const periodo = d.periodo.finoA ? `rispetto allo stesso periodo del ${d.periodo.anno - 1}` : `rispetto al ${d.periodo.anno - 1}`;
  const vf = variazionePct(d.fatturato, d.fatturatoPrima);
  if (vf != null && vf <= -10) {
    const calo = d.clienti.filter(x => x.primaStessoPeriodo - x.fatturato > 0).sort((a, b) => (b.primaStessoPeriodo - b.fatturato) - (a.primaStessoPeriodo - a.fatturato)).slice(0, 3);
    c.push({ livello: 'critico', testo: `Fatturato in calo del ${-vf}% ${periodo} (${euro(d.fatturato)} contro ${euro(d.fatturatoPrima)}).${calo.length ? ` Il calo viene soprattutto da ${elenca(calo.map(x => `${x.cliente} (−${euro(x.primaStessoPeriodo - x.fatturato)})`))}.` : ''}`,
      consiglio: 'Chiama i clienti in calo per capire se hanno spostato il lavoro altrove o se è un rallentamento loro; guarda i preventivi ancora aperti e le aziende "Da contattare" nel CRM.' });
  } else if (vf != null && vf >= 10) {
    c.push({ livello: 'bene', testo: `Fatturato in crescita del ${vf}% ${periodo} (${euro(d.fatturato)} contro ${euro(d.fatturatoPrima)}).` });
  } else if (vf != null) {
    c.push({ livello: 'bene', testo: `Fatturato stabile ${periodo} (${vf >= 0 ? '+' : ''}${vf}%, ${euro(d.fatturato)}).` });
  }
  // previsione dell'anno dai mesi chiusi
  if (d.periodo.finoA && d.mesiChiusi >= 3 && d.fatturatoAnnoPrima > 0) {
    const previsione = (d.fatturatoMesiChiusi / d.mesiChiusi) * 12, v = variazionePct(previsione, d.fatturatoAnnoPrima)!;
    c.push({ livello: v <= -10 ? 'attenzione' : 'bene', testo: `Con la media dei ${d.mesiChiusi} mesi chiusi l'anno finirebbe intorno a ${euro(previsione)} (${v >= 0 ? '+' : ''}${v}% sul ${d.periodo.anno - 1}, che ha fatto ${euro(d.fatturatoAnnoPrima)}).`,
      consiglio: v <= -10 ? 'Per recuperare servono circa ' + euro(Math.max(0, d.fatturatoAnnoPrima - previsione) / Math.max(1, 12 - d.mesiChiusi)) + ' in più al mese nei mesi che restano: guarda gli ordini da evadere e i preventivi aperti.' : undefined });
  }
  // margine dopo gli acquisti
  if (d.fatturato > 0 && d.fatturatoPrima > 0) {
    const ora = Math.round(((d.fatturato - d.acquisti) / d.fatturato) * 100), prima = Math.round(((d.fatturatoPrima - d.acquistiPrima) / d.fatturatoPrima) * 100);
    if (ora <= prima - 5) c.push({ livello: 'attenzione', testo: `Dopo gli acquisti resta il ${ora}% del fatturato, contro il ${prima}% dell'anno prima: gli acquisti pesano di più.`,
      consiglio: 'Controlla se i componenti acquistati sono stati rifatturati con il ricarico giusto (BOM quotata nel preventivo) e confronta i prezzi con "Miglior prezzo".' });
    else if (ora >= prima + 5) c.push({ livello: 'bene', testo: `Dopo gli acquisti resta il ${ora}% del fatturato, contro il ${prima}% dell'anno prima.` });
  }
  // dipendenza da pochi clienti
  const primi3 = quotaPrimi(d.clienti, 3), primo = d.clienti[0];
  if (primo && primo.quota >= 30) c.push({ livello: 'critico', testo: `${primo.cliente} vale da solo il ${primo.quota}% del fatturato: se rallenta, rallenta tutta l'azienda.`,
    consiglio: 'Allarga il giro: cerca clienti simili nel CRM e proponi il servizio a chi ha già chiesto preventivi.' });
  else if (primi3 >= 50) c.push({ livello: 'attenzione', testo: `I primi 3 clienti fanno il ${primi3}% del fatturato.`,
    consiglio: 'Va bene finché restano, ma conviene far crescere i clienti medi: offerte mirate a chi ha comprato poco quest\'anno.' });
  // clienti fermi e clienti nuovi
  const fermi = d.clienti.filter(x => x.primaStessoPeriodo >= 5000 && x.fatturato <= 0).slice(0, 5);
  if (fermi.length) c.push({ livello: 'attenzione', testo: `Quest'anno non hanno ancora comprato: ${elenca(fermi.map(x => `${x.cliente} (${euro(x.primaStessoPeriodo)} nello stesso periodo dell'anno prima)`))}.`,
    consiglio: 'Una telefonata per sapere se hanno progetti in arrivo; segnala la prossima azione nel CRM.' });
  const nuovi = d.clienti.filter(x => x.fatturato >= 1000 && x.primaAnnoIntero <= 0);
  if (nuovi.length) c.push({ livello: 'bene', testo: `Clienti nuovi quest'anno: ${elenca(nuovi.slice(0, 5).map(x => `${x.cliente} (${euro(x.fatturato)})`))}${nuovi.length > 5 ? ` e altri ${nuovi.length - 5}` : ''}.` });
  // incassi
  const lenti = d.clienti.filter(x => (x.ritardoMedio ?? 0) >= 30 && x.fatturato >= 2000).sort((a, b) => (b.ritardoMedio ?? 0) - (a.ritardoMedio ?? 0)).slice(0, 3);
  if (lenti.length) c.push({ livello: 'attenzione', testo: `Pagano in media oltre 30 giorni dopo la scadenza: ${elenca(lenti.map(x => `${x.cliente} (${x.ritardoMedio} giorni)`))}.`,
    consiglio: 'Sollecita prima della scadenza, chiedi un anticipo sui lotti grandi o accorcia le condizioni di pagamento alla prossima offerta.' });
  if (d.scadutoOltre60.length) c.push({ livello: 'critico', testo: `Fatture scadute da oltre 60 giorni: ${elenca(d.scadutoOltre60.slice(0, 4).map(x => `${x.cliente} ${euro(x.importo)}`))} (scaduto totale ${euro(d.scaduto)}).`,
    consiglio: 'Sollecito scritto subito; se non pagano, sospendi le consegne nuove finché non si mettono in regola.' });
  // prezzi e margini dei prodotti
  const sotto = d.prodotti.filter(x => (x.scartoPrezzo ?? 0) <= -5 && x.fatturato >= 1000).slice(0, 4);
  if (sotto.length) c.push({ livello: 'attenzione', testo: `Venduti sotto il prezzo del preventivo: ${elenca(sotto.map(x => `${x.codice} (${x.scartoPrezzo}%)`))}.`,
    consiglio: 'Controlla se lo sconto era voluto; al prossimo ordine riproponi il prezzo del preventivo o rifallo con i tempi veri delle commesse.' });
  const magri = d.prodotti.filter(x => x.marginePct != null && x.marginePct < 10 && x.fatturato >= 1000).slice(0, 4);
  if (magri.length) c.push({ livello: 'attenzione', testo: `Margine del preventivo sotto il 10%: ${elenca(magri.map(x => `${x.codice} (${x.marginePct}%)`))}.`,
    consiglio: 'Rifai il prezzo al lotto successivo: guarda nel preventivo quali fasi pesano di più.' });
  const ordine: Record<Livello, number> = { critico: 0, attenzione: 1, bene: 2 };
  return c.sort((a, b) => ordine[a.livello] - ordine[b.livello]);
}

export const nomeMese = (m: number) => MESI[m - 1];
