/**
 * Amministrazione → Analisi → Costi per categoria (Adriano 6/11/2026, punto 3 della sua risposta sul punto di pareggio):
 * "un'analisi dettagliata delle fatture andando a leggere ogni singola fattura e attribuendo di conseguenza la categoria", con le SUE
 * categorie (materiale comprato e rivenduto, consumo, lavorazioni esterne, spese di gestione per tipo), il confronto tra quello che si
 * compra per rivendere e quello che si rivende, e un riassunto con opinione e proposte.
 *
 * Qui solo regole e conti (niente database):
 *  - `classificaCosti`: ogni riga (o fattura senza righe) prende la categoria con le regole di `categorie-acquisti.ts`;
 *    le regole scritte dall'ufficio (fornitore → categoria, riga → categoria, fattura → categoria) vincono sempre;
 *  - `costiPerAnno`: totali per macro e categoria, anno per anno, con il peso e la variazione;
 *  - `confrontoRivendita`: comprato (fatture dei fornitori, categorie di rivendita) contro rivenduto (pezzi fatturati × valore
 *    del materiale nel preventivo più recente del prodotto) e lamine vendute;
 *  - `riassuntoCosti`: le frasi del riassunto, l'opinione e le proposte, dai numeri.
 */
import { categoria, classificaRiga, CATEGORIE, NOMI_MACRO, rigaDaIgnorare, type Macro } from './categorie-acquisti.js';
import type { CodiceFamiglia } from './pareggio.js';

export interface RigaCosto {
  /** id della riga (documenti_ricevuti_righe) oppure null se è la fattura intera (senza righe lette) */
  rigaId: number | null;
  documentoId: number;
  data: string;            // AAAA-MM-GG
  fornitore: string;
  fornitoreChiave: string; // f<id> o n:NOME
  descrizione: string;
  codici: string[];
  /** imponibile con il segno: note di credito negative */
  importo: number;
  /** categoria di Fatture in Cloud della fattura (aiuta le fatture senza righe) */
  categoriaFic?: string | null;
}

export interface RegolaCategoria { tipo: 'fornitore' | 'riga' | 'documento'; chiave: string; categoria: string }

export type Come = 'regola' | 'parola' | 'fornitore' | 'fic' | 'storico' | 'nessuna';
export interface RigaClassificata extends RigaCosto { anno: number; categoria: string; macro: Macro; come: Come; accessoria: boolean }

/** La chiave del fornitore nelle regole: il nome in maiuscolo senza spazi doppi (vale anche per chi non è in anagrafica). */
export const chiaveFornitore = (nome: string) => nome.toUpperCase().replace(/\s+/g, ' ').trim();

/** Il nome della categoria FIC senza il prefisso del conto ("B7_Consulenze" → "Consulenze"): le sue parole aiutano a classificare. */
const nomeFic = (c: string | null | undefined) => (c ?? '').replace(/^[A-Z]\d+[a-z]?_/, '').trim();

/** Per le fatture senza righe: quando né parole né fornitore decidono, la categoria di Fatture in Cloud dà un'indicazione. */
const DA_FIC: [RegExp, string][] = [
  [/consulenz/i, 'consulenze_amministrative'], [/carburant|pedagg|autostrad|autovettur|automezz/i, 'auto'], [/materie prime/i, 'componenti'], [/materie di consumo/i, 'chimici'],
  [/imballagg/i, 'imballaggio'], [/manutenzion/i, 'manutenzioni'], [/cancelleria|stampati/i, 'ufficio'], [/energia|elettric/i, 'energia'], [/gas\b|acqua/i, 'gas_acqua'],
  [/telefon/i, 'telefonia'], [/assicuraz/i, 'assicurazioni'], [/trasport|spedizion/i, 'trasporti'], [/software|licenz/i, 'software'], [/pulizi/i, 'pulizie'],
  [/leasing/i, 'leasing'], [/locazion|affitt/i, 'affitto'], [/boll[io]\b|imposte|tasse|tributi/i, 'imposte'], [/bancari|interessi/i, 'banca'], [/rappresentanz|pubblicit|fier/i, 'commerciale'],
  [/dogan/i, 'dogane'], [/lavorazion|conto terzi/i, 'montaggi_esterni'], [/formazion|sicurezz|medic/i, 'sicurezza'], [/mensa|buoni pasto/i, 'mensa'], [/attrezzatur|macchin|beni strumentali/i, 'attrezzature'],
];
export const categoriaDaFic = (c: string | null | undefined): string | null => DA_FIC.find(([re]) => re.test(nomeFic(c)))?.[1] ?? null;

/**
 * Ogni riga prende la sua categoria: prima le regole scritte dall'ufficio, poi parole e fornitore (`classificaRiga`), poi la categoria di
 * Fatture in Cloud della fattura, infine lo STORICO del fornitore (Adriano 6/11/2026: "in base al tipo di fattura, allo storico e a che cosa
 * è stato acquistato"): una riga che nessuna regola riconosce prende la categoria in cui va la maggior parte (in euro) delle altre righe
 * dello stesso fornitore. Resta "nessuna" solo quando del fornitore non si sa proprio niente.
 */
export function classificaCosti(righe: RigaCosto[], regole: RegolaCategoria[]): RigaClassificata[] {
  const out = classificaConRegole(righe, regole);
  // storico del fornitore: la categoria che pesa di più tra le righe già riconosciute (regole, parole, fornitore, FIC)
  const storico = new Map<string, Map<string, number>>();
  for (const r of out) {
    if (r.come === 'nessuna') continue;
    const m = storico.get(r.fornitoreChiave) ?? new Map<string, number>();
    m.set(r.categoria, (m.get(r.categoria) ?? 0) + Math.abs(r.importo));
    storico.set(r.fornitoreChiave, m);
  }
  for (const r of out) {
    if (r.come !== 'nessuna') continue;
    const m = storico.get(r.fornitoreChiave);
    if (!m?.size) continue;
    const [cat] = [...m].sort((a, b) => b[1] - a[1])[0];
    r.categoria = cat; r.macro = categoria(cat).macro; r.come = 'storico'; r.accessoria = false;
  }
  return out;
}

function classificaConRegole(righe: RigaCosto[], regole: RegolaCategoria[]): RigaClassificata[] {
  const perFornitore = new Map<string, string>(), perRiga = new Map<string, string>(), perDocumento = new Map<string, string>();
  for (const r of regole) (r.tipo === 'fornitore' ? perFornitore : r.tipo === 'riga' ? perRiga : perDocumento).set(r.tipo === 'fornitore' ? chiaveFornitore(r.chiave) : r.chiave, r.categoria);
  const out: RigaClassificata[] = [];
  for (const r of righe) {
    if (rigaDaIgnorare({ fornitore: r.fornitore, descrizione: r.descrizione, importo: r.importo })) continue;
    const anno = Number(r.data.slice(0, 4));
    const scritta = (r.rigaId != null ? perRiga.get(String(r.rigaId)) : undefined) ?? perDocumento.get(String(r.documentoId)) ?? perFornitore.get(chiaveFornitore(r.fornitore));
    if (scritta) { out.push({ ...r, anno, categoria: scritta, macro: categoria(scritta).macro, come: 'regola', accessoria: false }); continue; }
    // fattura senza righe: la descrizione del documento più la categoria di FIC (le sue parole contano come la descrizione)
    const descrizione = r.rigaId == null ? `${r.descrizione} ${nomeFic(r.categoriaFic)}`.trim() : r.descrizione;
    const e = classificaRiga({ fornitore: r.fornitore, descrizione, codici: r.codici, importo: r.importo });
    const fic = e.come === 'nessuna' ? categoriaDaFic(r.categoriaFic) : null;   // anche per una riga: il tipo della fattura aiuta
    if (fic) { out.push({ ...r, anno, categoria: fic, macro: categoria(fic).macro, come: 'fic', accessoria: false }); continue; }
    out.push({ ...r, anno, categoria: e.categoria, macro: e.macro, come: e.come, accessoria: !!e.accessoria });
  }
  return out;
}

/**
 * La famiglia del Punto di pareggio di una categoria di Casteltech (così anche i mesi presi dal portale usano le categorie di Adriano,
 * niente più "fatture senza categoria"): rivendita e consumo = materie (variabili); lavorazioni e spese di gestione = servizi;
 * affitto e leasing = godimento; banca = oneri finanziari; bolli e imposte = oneri; attrezzature e macchine = investimenti, che nel
 * conto economico entrano come ammortamenti (stimati dal bilancino), non come costo del mese.
 */
export function famigliaDiCategoriaCasteltech(codice: string): CodiceFamiglia {
  const c = categoria(codice);
  if (c.macro === 'rivendita' || c.macro === 'consumo') return 'materie';
  if (c.codice === 'affitto' || c.codice === 'leasing') return 'godimento';
  if (c.codice === 'banca') return 'finanziari';
  if (c.codice === 'imposte') return 'oneri';
  if (c.codice === 'attrezzature') return 'ammortamenti';
  return 'servizi';
}

const r2 = (n: number) => Math.round(n * 100) / 100;
export const variazionePct = (ora: number, prima: number): number | null => (prima ? r2(((ora - prima) / Math.abs(prima)) * 100) : null);

export interface VoceAnno { importo: number; righe: number; quota: number }
export interface CategoriaAnni { codice: string; nome: string; macro: Macro; perAnno: Record<number, VoceAnno>; variazione: number | null; fornitori: { nome: string; chiave: string; importo: number }[] }
export interface MacroAnni { macro: Macro; nome: string; perAnno: Record<number, VoceAnno>; variazione: number | null; categorie: CategoriaAnni[] }
export interface CostiPerAnno { anni: number[]; totale: Record<number, number>; macro: MacroAnni[]; daVerificare: Record<number, number> }

/**
 * Totali per macro e categoria negli anni chiesti (il primo è l'anno "principale": peso, fornitori e variazione contro l'anno prima sono su quello).
 * Le righe "nessuna" (nessuna regola le ha riconosciute) stanno in "Altre spese" e si contano a parte in `daVerificare`.
 */
export function costiPerAnno(righe: RigaClassificata[], anni: number[]): CostiPerAnno {
  const [anno, annoPrima] = [anni[0], anni[0] - 1];
  const vuota = (): VoceAnno => ({ importo: 0, righe: 0, quota: 0 });
  const totale: Record<number, number> = Object.fromEntries(anni.map(a => [a, 0]));
  const daVerificare: Record<number, number> = Object.fromEntries(anni.map(a => [a, 0]));
  const perCat = new Map<string, Record<number, VoceAnno>>();
  const fornitoriCat = new Map<string, Map<string, { nome: string; chiave: string; importo: number }>>();
  for (const r of righe) {
    if (!anni.includes(r.anno)) continue;
    totale[r.anno] = r2(totale[r.anno] + r.importo);
    if (r.come === 'nessuna') daVerificare[r.anno] = r2(daVerificare[r.anno] + r.importo);
    const v = perCat.get(r.categoria) ?? Object.fromEntries(anni.map(a => [a, vuota()]));
    v[r.anno].importo = r2(v[r.anno].importo + r.importo); v[r.anno].righe++;
    perCat.set(r.categoria, v);
    if (r.anno === anno) {
      const f = fornitoriCat.get(r.categoria) ?? new Map();
      const x = f.get(r.fornitoreChiave) ?? { nome: r.fornitore, chiave: r.fornitoreChiave, importo: 0 };
      x.importo = r2(x.importo + r.importo); f.set(r.fornitoreChiave, x); fornitoriCat.set(r.categoria, f);
    }
  }
  const macro: MacroAnni[] = (Object.keys(NOMI_MACRO) as Macro[]).map(m => {
    const categorie = CATEGORIE.filter(c => c.macro === m && perCat.has(c.codice)).map(c => {
      const perAnno = perCat.get(c.codice)!;
      for (const a of anni) perAnno[a].quota = totale[a] ? r2((perAnno[a].importo / totale[a]) * 100) : 0;
      const fornitori = [...(fornitoriCat.get(c.codice)?.values() ?? [])].sort((x, y) => Math.abs(y.importo) - Math.abs(x.importo)).slice(0, 5);
      return { codice: c.codice, nome: c.nome, macro: m, perAnno, variazione: variazionePct(perAnno[anno].importo, perAnno[annoPrima]?.importo ?? 0), fornitori };
    }).sort((x, y) => Math.abs(y.perAnno[anno].importo) - Math.abs(x.perAnno[anno].importo));
    const perAnno: Record<number, VoceAnno> = Object.fromEntries(anni.map(a => [a, vuota()]));
    for (const c of categorie) for (const a of anni) { perAnno[a].importo = r2(perAnno[a].importo + c.perAnno[a].importo); perAnno[a].righe += c.perAnno[a].righe; }
    for (const a of anni) perAnno[a].quota = totale[a] ? r2((perAnno[a].importo / totale[a]) * 100) : 0;
    return { macro: m, nome: NOMI_MACRO[m], perAnno, variazione: variazionePct(perAnno[anno].importo, perAnno[annoPrima]?.importo ?? 0), categorie };
  });
  return { anni, totale, macro, daVerificare };
}

export interface FornitoreDaControllare { chiave: string; nome: string; importo: number; righe: number; esempi: string[] }
/** Fornitori con righe che nessuna regola ha riconosciuto (in "Altre spese"): l'ufficio sceglie la categoria e vale per tutte le loro righe. */
export function fornitoriDaControllare(righe: RigaClassificata[], max = 40): FornitoreDaControllare[] {
  const m = new Map<string, FornitoreDaControllare>();
  for (const r of righe) {
    if (r.come !== 'nessuna') continue;
    const x = m.get(r.fornitoreChiave) ?? { chiave: r.fornitoreChiave, nome: r.fornitore, importo: 0, righe: 0, esempi: [] };
    x.importo = r2(x.importo + r.importo); x.righe++;
    const d = r.descrizione.trim().slice(0, 60);
    if (d && x.esempi.length < 3 && !x.esempi.includes(d)) x.esempi.push(d);
    m.set(r.fornitoreChiave, x);
  }
  return [...m.values()].sort((a, b) => Math.abs(b.importo) - Math.abs(a.importo)).slice(0, max);
}

/* ---------------------------------------------------------------- comprato e rivenduto ---------------------------------------------------------------- */

/** Le categorie di rivendita che si confrontano con il venduto: componenti e PCB stanno nel prezzo delle schede, le lamine si fatturano a parte. */
export const CATEGORIE_RIVENDITA_SCHEDE = ['componenti', 'pcb', 'meccanica'];

export interface VenditaProdotto { codice: string; cliente: string; anno: number; pezzi: number; importo: number }
/** Il valore del materiale nel preventivo più recente del prodotto (riepilogo del preventivo, a scheda). */
export interface MaterialePreventivo { codice: string; cliente: string; venditaComponenti: number; venditaPcb: number; costoAcquisto: number }
export interface LamineVendute { anno: number; pezzi: number; importo: number }

export interface RivenditaAnno {
  anno: number;
  /** comprato per rivendere: dalle fatture dei fornitori */
  compratoComponenti: number; compratoPcb: number; compratoMeccanica: number; compratoLamine: number; comprato: number;
  /** rivenduto secondo i preventivi: pezzi fatturati × valore del materiale a scheda nel preventivo più recente */
  rivendutoComponenti: number; rivendutoPcb: number; rivenduto: number;
  /** quanto quel materiale doveva costare secondo i preventivi (voci MATERIALE PER PRODUZIONE) */
  costoPrevisto: number;
  /** lamine fatturate ai clienti (UT-LAMINA e righe "lamina/stencil") */
  lamineVendutePezzi: number; lamineVendute: number;
  /** quanti pezzi fatturati hanno un preventivo (copertura della stima) e quanti no */
  pezziConPreventivo: number; pezziSenzaPreventivo: number; prodottiSenzaPreventivo: string[];
  /** margine della rivendita: rivenduto − comprato (schede) e lamine vendute − lamine comprate */
  margineSchede: number; margineSchedePct: number | null; margineLamine: number;
  /** comprato − costo previsto: materiale pagato in più rispetto ai preventivi (avanzi, prezzi saliti, prodotti senza preventivo) */
  materialeOltrePreventivo: number;
}

const chiaveProdotto = (codice: string, cliente: string) => `${codice.toUpperCase().trim()}|${cliente.toUpperCase().trim()}`;

/** Comprato contro rivenduto, anno per anno. Le stime valgono solo per i pezzi con un preventivo: la copertura è scritta. */
export function confrontoRivendita(x: { righe: RigaClassificata[]; vendite: VenditaProdotto[]; preventivi: MaterialePreventivo[]; lamine: LamineVendute[]; anni: number[] }): RivenditaAnno[] {
  const prev = new Map(x.preventivi.map(p => [chiaveProdotto(p.codice, p.cliente), p]));
  return x.anni.map(anno => {
    const comprato = (cat: string) => r2(x.righe.filter(r => r.anno === anno && r.categoria === cat).reduce((s, r) => s + r.importo, 0));
    const compratoComponenti = comprato('componenti'), compratoPcb = comprato('pcb'), compratoMeccanica = comprato('meccanica'), compratoLamine = comprato('lamine');
    let rivendutoComponenti = 0, rivendutoPcb = 0, costoPrevisto = 0, pezziCon = 0, pezziSenza = 0;
    const senza = new Map<string, number>();
    for (const v of x.vendite.filter(v => v.anno === anno)) {
      const p = prev.get(chiaveProdotto(v.codice, v.cliente));
      if (!p) { pezziSenza += v.pezzi; senza.set(v.codice, (senza.get(v.codice) ?? 0) + v.pezzi); continue; }
      pezziCon += v.pezzi;
      rivendutoComponenti += v.pezzi * p.venditaComponenti; rivendutoPcb += v.pezzi * p.venditaPcb; costoPrevisto += v.pezzi * p.costoAcquisto;
    }
    const l = x.lamine.find(l => l.anno === anno) ?? { anno, pezzi: 0, importo: 0 };
    const compratoSchede = r2(compratoComponenti + compratoPcb + compratoMeccanica);
    const rivenduto = r2(rivendutoComponenti + rivendutoPcb);
    return {
      anno, compratoComponenti, compratoPcb, compratoMeccanica, compratoLamine, comprato: r2(compratoSchede + compratoLamine),
      rivendutoComponenti: r2(rivendutoComponenti), rivendutoPcb: r2(rivendutoPcb), rivenduto, costoPrevisto: r2(costoPrevisto),
      lamineVendutePezzi: l.pezzi, lamineVendute: r2(l.importo),
      pezziConPreventivo: pezziCon, pezziSenzaPreventivo: pezziSenza,
      prodottiSenzaPreventivo: [...senza.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(e => e[0]),
      margineSchede: r2(rivenduto - compratoSchede), margineSchedePct: rivenduto ? r2(((rivenduto - compratoSchede) / rivenduto) * 100) : null,
      margineLamine: r2(l.importo - compratoLamine),
      materialeOltrePreventivo: r2(compratoSchede - costoPrevisto),
    };
  });
}

/* ---------------------------------------------------------------- riassunto, opinione e proposte ---------------------------------------------------------------- */

export type Livello = 'critico' | 'attenzione' | 'bene' | 'nota';
export interface Frase { livello: Livello; testo: string }
export interface Riassunto { frasi: Frase[]; opinione: string; proposte: string[] }

const euro = (n: number) => `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} €`;
const pct = (n: number) => `${n.toLocaleString('it-IT', { maximumFractionDigits: 1 })}%`;

/**
 * Riassunto, opinione e proposte dai numeri dell'anno principale (il primo di `anni`): dove vanno i soldi, cosa è salito, come va la
 * rivendita, cosa tagliare o rafforzare. `ricavi` = fatturato dell'anno (per i pesi) e dell'anno prima; `mesi` = mesi coperti dall'anno
 * (per un anno in corso i confronti con l'anno prima sono sugli stessi mesi, già fatti da chi chiama).
 */
export function riassuntoCosti(x: { costi: CostiPerAnno; rivendita: RivenditaAnno[]; ricavi: Record<number, number>; mesi: number }): Riassunto {
  const { costi } = x;
  const anno = costi.anni[0], prima = anno - 1;
  const frasi: Frase[] = [], proposte: string[] = [];
  const tot = costi.totale[anno] ?? 0, totPrima = costi.totale[prima] ?? 0;
  const ricavi = x.ricavi[anno] ?? 0, ricaviPrima = x.ricavi[prima] ?? 0;
  const m = (k: Macro) => costi.macro.find(z => z.macro === k)!;
  const per = (k: Macro) => m(k).perAnno[anno]?.importo ?? 0;
  const perPrima = (k: Macro) => m(k).perAnno[prima]?.importo ?? 0;
  const quotaRicavi = (v: number) => (ricavi ? r2((v / ricavi) * 100) : null);
  if (!tot) return { frasi: [{ livello: 'nota', testo: `Nessuna fattura dei fornitori nel ${anno}.` }], opinione: '', proposte: [] };

  // 1. dove vanno i soldi
  frasi.push({ livello: 'nota', testo: `Nel ${anno} le fatture dei fornitori valgono ${euro(tot)}${ricavi ? `, il ${pct(quotaRicavi(tot)!)} del fatturato (${euro(ricavi)})` : ''}: `
    + `materiale da rivendere ${euro(per('rivendita'))} (${pct(m('rivendita').perAnno[anno].quota)}), consumo ${euro(per('consumo'))} (${pct(m('consumo').perAnno[anno].quota)}), `
    + `lavorazioni esterne ${euro(per('lavorazioni'))} (${pct(m('lavorazioni').perAnno[anno].quota)}), gestione ${euro(per('gestione'))} (${pct(m('gestione').perAnno[anno].quota)}).` });
  const gestione = m('gestione').categorie.slice(0, 5);
  if (gestione.length)
    frasi.push({ livello: 'nota', testo: `Le spese di gestione più grosse: ${gestione.map(c => `${c.nome.toLowerCase()} ${euro(c.perAnno[anno].importo)}`).join(', ')}.` });

  // 2. cosa è salito o sceso rispetto all'anno prima
  if (totPrima) {
    const v = variazionePct(tot, totPrima)!, vr = ricaviPrima ? variazionePct(ricavi, ricaviPrima) : null;
    if (vr != null && v > vr + 10) frasi.push({ livello: 'critico', testo: `I costi salgono più del fatturato: fornitori ${v > 0 ? '+' : ''}${pct(v)} contro fatturato ${vr > 0 ? '+' : ''}${pct(vr)} rispetto al ${prima}.` });
    else if (vr != null && v < vr - 5) frasi.push({ livello: 'bene', testo: `I costi dei fornitori crescono meno del fatturato (${v > 0 ? '+' : ''}${pct(v)} contro ${vr > 0 ? '+' : ''}${pct(vr)}): il margine migliora.` });
    const salite = costi.macro.flatMap(z => z.categorie).filter(c => c.variazione != null && c.variazione >= 25 && c.perAnno[anno].importo >= 3000 && (c.perAnno[anno].importo - (c.perAnno[prima]?.importo ?? 0)) >= 2000)
      .sort((a, b) => (b.perAnno[anno].importo - (b.perAnno[prima]?.importo ?? 0)) - (a.perAnno[anno].importo - (a.perAnno[prima]?.importo ?? 0))).slice(0, 4);
    for (const c of salite) frasi.push({ livello: 'attenzione', testo: `${c.nome}: ${euro(c.perAnno[anno].importo)} nel ${anno} contro ${euro(c.perAnno[prima]?.importo ?? 0)} nel ${prima} (+${pct(c.variazione!)})${c.macro === 'gestione' ? ': da capire se serve davvero' : c.macro === 'rivendita' ? ': va bene solo se è cresciuto anche il venduto' : ''}.` });
    const scese = costi.macro.flatMap(z => z.categorie).filter(c => c.variazione != null && c.variazione <= -30 && (c.perAnno[prima]?.importo ?? 0) >= 5000).slice(0, 3);
    for (const c of scese) frasi.push({ livello: 'bene', testo: `${c.nome}: ${euro(c.perAnno[anno].importo)} contro ${euro(c.perAnno[prima]?.importo ?? 0)} nel ${prima} (${pct(c.variazione!)}).` });
  }

  // 3. la rivendita
  const riv = x.rivendita.find(r => r.anno === anno);
  if (riv && riv.comprato) {
    const copertura = riv.pezziConPreventivo + riv.pezziSenzaPreventivo ? r2((riv.pezziConPreventivo / (riv.pezziConPreventivo + riv.pezziSenzaPreventivo)) * 100) : 0;
    if (riv.rivenduto > 0) {
      const liv: Livello = riv.margineSchede < 0 ? 'critico' : riv.margineSchedePct != null && riv.margineSchedePct < 10 ? 'attenzione' : 'bene';
      frasi.push({ livello: liv, testo: `Rivendita di componenti e PCB: comprati ${euro(riv.compratoComponenti + riv.compratoPcb + riv.compratoMeccanica)}, rivenduti secondo i preventivi ${euro(riv.rivenduto)}: `
        + `${riv.margineSchede >= 0 ? 'guadagno' : 'perdita'} di ${euro(Math.abs(riv.margineSchede))}${riv.margineSchedePct != null ? ` (${pct(riv.margineSchedePct)} del rivenduto)` : ''}. `
        + `La stima copre il ${pct(copertura)} dei pezzi fatturati (gli altri non hanno un preventivo nel portale).` });
      if (riv.materialeOltrePreventivo > 0 && riv.costoPrevisto > 0 && riv.materialeOltrePreventivo / riv.costoPrevisto > 0.15)
        frasi.push({ livello: 'attenzione', testo: `Il materiale comprato (${euro(riv.compratoComponenti + riv.compratoPcb + riv.compratoMeccanica)}) supera di ${euro(riv.materialeOltrePreventivo)} quello che i preventivi prevedevano (${euro(riv.costoPrevisto)}): `
          + 'avanzi non addebitati, prezzi saliti dopo il preventivo, scarti o prodotti senza preventivo. Senza magazzino quella differenza è un costo.' });
      if (riv.margineSchede < 0) proposte.push('Nella rivendita si perde: controllare i prezzi dei componenti e dei PCB nei preventivi contro le fatture dei fornitori (Quotazioni → BOM quotata → "Aggiorna prezzi" prima di ogni ordine) e addebitare gli avanzi al cliente.');
      else if (riv.margineSchedePct != null && riv.margineSchedePct < 10) proposte.push('Il ricarico sulla rivendita è basso: alzare il ricarico sui componenti e sui PCB nei preventivi, o far comprare il materiale al cliente dove non si guadagna.');
    } else if (riv.pezziSenzaPreventivo) {
      frasi.push({ livello: 'nota', testo: `Rivendita: comprati ${euro(riv.comprato)} di materiale, ma nessun pezzo fatturato nel ${anno} ha un preventivo nel portale: il confronto comprato/rivenduto si potrà fare quando i preventivi saranno nel portale (prodotti senza preventivo: ${riv.prodottiSenzaPreventivo.slice(0, 5).join(', ')}).` });
    }
    if (riv.compratoLamine || riv.lamineVendute) {
      const liv: Livello = riv.margineLamine < 0 ? 'attenzione' : 'bene';
      frasi.push({ livello: liv, testo: `Lamine: comprate ${euro(riv.compratoLamine)}, fatturate ai clienti ${euro(riv.lamineVendute)}${riv.lamineVendutePezzi ? ` (${riv.lamineVendutePezzi})` : ''}: ${riv.margineLamine >= 0 ? 'guadagno' : 'perdita'} di ${euro(Math.abs(riv.margineLamine))}.` });
      if (riv.margineLamine < 0) proposte.push('Le lamine costano più di quanto si fattura: addebitare sempre la lamina (UT-LAMINA) nel primo lotto, anche quando il cliente la discute.');
    }
  }

  // 4. consumo e lavorazioni sul fatturato
  const qc = quotaRicavi(per('consumo')), ql = quotaRicavi(per('lavorazioni'));
  if (qc != null && qc > 6) { frasi.push({ livello: 'attenzione', testo: `Il materiale di consumo (stagno, chimici, ricambi…) pesa il ${pct(qc)} del fatturato: sopra il 5 % è tanto per un conto terzi.` }); proposte.push('Consumo: confrontare i prezzi di stagno e chimici tra fornitori (Analisi → Fornitori) e mettere il consumo reale nei preventivi (rientro delle commesse).'); }
  if (ql != null && ql > 8) { frasi.push({ livello: 'attenzione', testo: `Le lavorazioni esterne (montaggi, progettazione, consulenze tecniche) pesano il ${pct(ql)} del fatturato.` }); proposte.push('Lavorazioni esterne: verificare se conviene portarle dentro o rifatturarle al cliente con un ricarico.'); }

  // 5. gestione: le voci che si possono tagliare
  const qg = quotaRicavi(per('gestione'));
  if (qg != null && qg > 25) frasi.push({ livello: 'attenzione', testo: `Le spese di gestione pesano il ${pct(qg)} del fatturato (senza personale): sono il primo posto dove tagliare.` });
  const tagliabili = m('gestione').categorie.filter(c => ['consulenze_amministrative', 'software', 'telefonia', 'auto', 'commerciale', 'ufficio', 'assicurazioni', 'banca'].includes(c.codice) && c.perAnno[anno].importo >= 3000);
  if (tagliabili.length) proposte.push(`Spese di gestione da rivedere una per una (contratti, abbonamenti, fornitori alternativi): ${tagliabili.map(c => `${c.nome.toLowerCase()} ${euro(c.perAnno[anno].importo)}`).join(', ')}.`);
  if (costi.daVerificare[anno] && tot && Math.abs(costi.daVerificare[anno]) / Math.abs(tot) > 0.03)
    frasi.push({ livello: 'nota', testo: `${euro(costi.daVerificare[anno])} di fatture non hanno ancora una categoria sicura (in "Altre spese"): sceglierla nel riquadro "Da controllare" rende più preciso tutto il resto.` });

  // opinione
  const quotaFornitori = quotaRicavi(tot);
  let opinione = '';
  if (quotaFornitori != null) {
    if (quotaFornitori > 70) opinione = `Più di due terzi del fatturato (${pct(quotaFornitori)}) tornano ai fornitori: con il personale sopra resta poco. Il margine si fa comprando meglio e ricaricando il materiale, non solo lavorando di più.`;
    else if (quotaFornitori > 50) opinione = `Metà del fatturato (${pct(quotaFornitori)}) va ai fornitori: il materiale rivenduto è la leva più grossa, va comprato e ricaricato con attenzione; le spese di gestione vanno tenute ferme.`;
    else opinione = `I fornitori pesano il ${pct(quotaFornitori)} del fatturato: il peso è sostenibile, il margine dipende soprattutto dal personale e dalle ore vendute.`;
    if (riv && riv.rivenduto > 0 && riv.margineSchede < 0) opinione += ' Il dubbio che la rivendita non renda è confermato dai numeri: oggi il materiale si rivende sotto costo.';
    else if (riv && riv.rivenduto > 0 && riv.margineSchedePct != null) opinione += ` La rivendita rende circa il ${pct(riv.margineSchedePct)}: ${riv.margineSchedePct >= 15 ? 'in linea con un ricarico sano' : 'poco per il rischio e il capitale anticipato'}.`;
  }
  if (!proposte.length) proposte.push('Nessun segnale forte: continuare a controllare ogni mese le categorie che salgono.');
  return { frasi, opinione, proposte };
}
