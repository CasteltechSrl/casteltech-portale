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
 *  - `classificaVendite` + `confrontoRivendita`: comprato (fatture dei fornitori e autofatture dei fornitori esteri, categorie di rivendita)
 *    contro il fatturato vero delle vendite con materiale nostro, e lamine vendute;
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
  /** quantità della riga (null = fattura intera) */
  quantita?: number | null;
}

export interface RegolaCategoria { tipo: 'fornitore' | 'riga' | 'documento'; chiave: string; categoria: string }

export type Come = 'regola' | 'parola' | 'fornitore' | 'fic' | 'storico' | 'nessuna';
export interface RigaClassificata extends RigaCosto { anno: number; categoria: string; macro: Macro; come: Come; accessoria: boolean;
  /** parte della riga del fornitore (For-Tek: 0,1 PCB e 0,9 progettazione), se la riga è divisa */
  parte?: number }

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
  return dividiPcbConsulenza(out);
}

/**
 * For-Tek di Laura Nardi (Adriano 11/11/2026): "non mi fattura la consulenza ma mi ricarica molto di più i PCB. A spanne è 90 % consulenza e 10 % PCB".
 * Una riga di PCB di For-Tek (non scritta a mano dall'ufficio) si divide: `QUOTA_PCB_FORTEK` resta PCB, il resto va in Progettazione.
 */
export const QUOTA_PCB_FORTEK = 0.1;
const FORTEK = /for-?tek|laura nardi|nardi laura/i;
function dividiPcbConsulenza(righe: RigaClassificata[]): RigaClassificata[] {
  return righe.flatMap(r => {
    if (r.categoria !== 'pcb' || r.come === 'regola' || !FORTEK.test(r.fornitore)) return [r];
    const pcb = Math.round(r.importo * QUOTA_PCB_FORTEK * 100) / 100;
    return [{ ...r, importo: pcb, parte: QUOTA_PCB_FORTEK },
      { ...r, importo: Math.round((r.importo - pcb) * 100) / 100, categoria: 'progettazione', macro: categoria('progettazione').macro, quantita: null, parte: 1 - QUOTA_PCB_FORTEK }];
  });
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

/**
 * Comprato e rivenduto sulle FATTURE VERE (Adriano 11/11/2026: "i preventivi non c'entrano molto con la realtà: controlla gli acquisti fatti
 * e le fatture che prevedono anche la vendita di componenti e PCB"). Prima il rivenduto era pezzi × materiale del preventivo: restavano fuori
 * le righe senza codice (es. Nasometer di Arilan) e i prodotti senza preventivo, e il conto in pezzi faceva sembrare coperto quasi tutto.
 * Ora ogni riga venduta (fatture e note di credito) va in uno di questi gruppi:
 *  - 'nostro': vendita con il materiale comprato da Casteltech (chiavi in mano) o materiale rivenduto a parte (righe "Componenti…",
 *    "Acquisto componenti / PCB", "PCB purchase");
 *  - 'conto_lavoro': il materiale lo manda il cliente, si fattura solo il montaggio;
 *  - 'servizio': lamine, avvio produzione, progettazione, trasporto, riparazioni… (non c'entrano con il materiale);
 *  - 'acconto': anticipi (si scalano dal saldo: contarli sarebbe contare due volte);
 *  - 'non_so': il portale non ha indizi; i clienti sono elencati perché l'ufficio li possa guardare.
 * Indizi, in ordine: la riga stessa (materiale scritto, servizio, anticipo), il preventivo del prodotto (componenti o PCB venduti > 0 = nostro,
 * = 0 = conto lavoro: si usa SOLO il "sì/no", non i prezzi), un PCB comprato con lo stesso nome del prodotto, poi il cliente (stessi indizi sulle
 * sue altre righe; cliente con componenti in conto lavoro in anagrafica = conto lavoro).
 * Il confronto vero è: materiale comprato contro fatturato delle vendite con materiale nostro. Senza magazzino gli anni non si chiudono
 * pari (materiale comprato a fine anno e fatturato l'anno dopo, avanzi): il peso del materiale va letto su più anni, non come "perdita".
 */
export const CATEGORIE_RIVENDITA_SCHEDE = ['componenti', 'pcb', 'meccanica'];

export type TipoVendita = 'nostro' | 'conto_lavoro' | 'servizio' | 'acconto' | 'non_so';
export interface RigaVendita { anno: number; clienteId: number | null; cliente: string; codice: string; descrizione: string; importo: number; acconto: boolean;
  /** pezzi della riga (NC in negativo): servono a dare al PCB comprato il suo peso sulla scheda venduta */
  quantita?: number }
/** Dal preventivo più recente del prodotto conta solo se vendiamo componenti o PCB (sì/no). */
export interface MaterialePreventivo { codice: string; clienteId: number | null; conMateriale: boolean;
  /** parte del prezzo a scheda che è vendita di componenti e di PCB (0–1), per dividere il fatturato vero delle schede chiavi in mano */
  quotaComponenti?: number; quotaPcb?: number }

/** Prezzo di vendita di una lamina dentro i costi una tantum (Adriano 11/11/2026: "normalmente è il prezzo di vendita"). */
export const PREZZO_LAMINA = 110;

/**
 * Componenti e PCB venduti (Adriano 11/11/2026, "componenti acquistati, componenti venduti, PCB acquistate e PCB vendute"): sulle fatture vere con materiale nostro.
 * Riga che fattura il materiale ("acquisto componenti", "PCB") = tutto quello; scheda chiavi in mano = importo vero × la parte di componenti e PCB del suo preventivo;
 * scheda senza preventivo = la parte media delle schede con preventivo (pesata sull'importo).
 * PCB comprato con lo stesso nome del prodotto (Adriano 11/11/2026, "il PCB acquistato si nasconde nel totale fattura"; `costiPcb` = `costiPcbComprati`), se il preventivo
 * non ha già un prezzo del PCB: prezzo a pezzo fino al doppio del costo del PCB = la riga È il PCB (Bitrabi, Plantbit); sopra, il PCB è venduto almeno al suo costo a pezzo.
 */
export function materialeVenduto(vendite: (RigaVendita & { tipo: TipoVendita })[], preventivi: MaterialePreventivo[], costiPcb: Map<string, number> = new Map()): { componenti: number; pcb: number }[] {
  const prev = new Map(preventivi.filter(p => p.quotaComponenti != null || p.quotaPcb != null).map(p => [chiavePrev(p.codice, p.clienteId), p]));
  const quote = vendite.map(r => {
    if (r.tipo !== 'nostro') return { componenti: 0, pcb: 0, nota: true };
    if (MATERIALE_SCRITTO.test(r.descrizione)) return /\bpcb\b|circuit/i.test(r.descrizione) && !/componenti|materiale/i.test(r.descrizione) ? { componenti: 0, pcb: 1, nota: true } : { componenti: 1, pcb: 0, nota: true };
    const p = r.codice ? prev.get(chiavePrev(r.codice, r.clienteId)) : undefined;
    return p ? { componenti: p.quotaComponenti ?? 0, pcb: p.quotaPcb ?? 0, nota: true } : null;
  });
  // media pesata delle schede con preventivo
  let base = 0, c = 0, b = 0;
  vendite.forEach((r, i) => { const q = quote[i]; if (r.tipo === 'nostro' && q && !MATERIALE_SCRITTO.test(r.descrizione) && r.importo > 0) { base += r.importo; c += r.importo * q.componenti; b += r.importo * q.pcb; } });
  const media = base > 0 ? { componenti: c / base, pcb: b / base } : { componenti: 0, pcb: 0 };
  return vendite.map((r, i) => {
    let q = quote[i] ?? media;
    const costo = r.tipo === 'nostro' && !MATERIALE_SCRITTO.test(r.descrizione) && !(quote[i]?.pcb) ? costoPcbDelProdotto(r, costiPcb) : null;
    const pezzi = Math.abs(r.quantita ?? 0);
    if (costo && pezzi >= 1 && r.importo) {
      const prezzoPezzo = Math.abs(r.importo) / pezzi;
      q = prezzoPezzo <= 2 * costo ? { componenti: 0, pcb: 1 } : { componenti: q.componenti, pcb: Math.min(1 - q.componenti, Math.max(q.pcb, costo / prezzoPezzo)) };
    }
    return { componenti: r.importo * q.componenti, pcb: r.importo * q.pcb };
  });
}
/** Lamine fatturate ai clienti in un anno: a parte (riga della lamina) e dentro i costi una tantum (riga "Avvio produzione - Programmazione - Lamina serigrafica"). */
export interface LamineVendute { anno: number; pezzi: number; importo: number; pezziUnaTantum: number; importoUnaTantum: number }
/** Riga di fattura (o NC, importo e quantità con il segno) che cita una lamina. */
export interface RigaLamina { anno: number; data?: string; codice: string; descrizione: string; quantita: number; importo: number;
  /** lamine segnate a mano sulla riga (documenti_righe.lamine): vincono sulla descrizione, 0 = nessuna */
  lamine?: number | null }

const LAMINA = /\b(lamin[ae]|stencil)\b/i;
/** Altre voci nella stessa riga: la lamina è dentro un forfait (costi una tantum, campionatura, materiale). */
const ALTRE_VOCI = /programmaz|avvio|attrezz|documentaz|una tantum|campionatur|componenti|\bpcb\b|forfait|codifica|setup/i;

/** Pezzi di lamina in una riga: numero scritto davanti ("2 Lamine", "4 lamine"), altrimenti la quantità della riga (lamine distinte per prodotto), altrimenti 1. */
export function pezziLamina(descrizione: string, quantita: number): number {
  const n = descrizione.match(/\b(\d{1,2})\s*(?:x\s*)?(?:lamin[ae]|stencil)/i);
  if (n) return Number(n[1]);
  const q = Math.abs(quantita);
  return q >= 1 && q <= 20 && Number.isInteger(q) ? q : 1;
}

/** Lamine fatturate in una riga (con il segno: NC in negativo) e se la riga è la sola lamina o un forfait che la contiene. */
export function lamineDellaRiga(r: RigaLamina): { pezzi: number; aParte: boolean } {
  const d = r.descrizione.trim(), d1 = d.split('\n')[0];
  const aMano = r.lamine != null;
  if (!aMano && !/^UT-LAMINA$/i.test(r.codice.trim()) && !LAMINA.test(d)) return { pezzi: 0, aParte: false };
  if (!r.importo || r.lamine === 0) return { pezzi: 0, aParte: false };   // lamina riconsegnata a 0 € (JOX FT 60/2026): già fatturata prima
  const segno = r.importo < 0 || r.quantita < 0 ? -1 : 1;
  return { pezzi: segno * (aMano ? r.lamine! : pezziLamina(d, r.quantita)), aParte: /^UT-LAMINA$/i.test(r.codice.trim()) || (LAMINA.test(d1) && !ALTRE_VOCI.test(d)) };
}

/** Lamine fatturate per anno (Adriano 11/11/2026: "per ogni lamina acquistata c'è una lamina venduta", spesso dentro i costi una tantum). */
export function lamineDaVendite(righe: RigaLamina[], anni: number[]): LamineVendute[] {
  return anni.map(anno => {
    const l: LamineVendute = { anno, pezzi: 0, importo: 0, pezziUnaTantum: 0, importoUnaTantum: 0 };
    for (const r of righe.filter(r => r.anno === anno)) {
      const f = lamineDellaRiga(r);
      if (!f.pezzi) continue;
      if (f.aParte) { l.pezzi += f.pezzi; l.importo += r.importo; } else { l.pezziUnaTantum += f.pezzi; l.importoUnaTantum += r.importo; }
    }
    return { anno, pezzi: l.pezzi, importo: r2(l.importo), pezziUnaTantum: l.pezziUnaTantum, importoUnaTantum: r2(l.importoUnaTantum) };
  });
}
/** Lamine comprate (pezzi): righe di lamina della categoria lamine (non trasporti, sconti, PCB dello stesso fornitore). */
export const LAMINA_COMPRATA = /\b(lamin[ae]|stencil|zelflex)\b|\bla\d{2}-\d/i;

const MATERIALE_SCRITTO = /acquisto (dei )?(componenti|pcb|materiale)|^(componenti|materiale|components?)\b|\bpcb purchase\b|^componenti extra\b|^materiale (acquistato|x|per)\b/im;
const ANTICIPO = /^\W*(anticipo|acconto|advance payment)\b|\bacconto \d+ ?%/im;
const SERVIZIO = /\b(usat[oa]|loader|unloader|trasporto|spedizione|logistic|avvio produzione|attrezzaggio|programmazione (attrezzature|macchine)|progettazione|sviluppo|development|engineering|lamina|stencil|riparazione|supporto tecnico|consulenza|analisi del progetto|an[aá]lisis|smontaggio|recupero componenti|collaudo|sconto|campionatura|prototip)/i;
/** Riga che fattura solo il lavoro ("Montaggio PTH scheda…", "Ripresa PTH"): conto lavoro, se nient'altro dice il contrario. */
const SOLO_LAVORAZIONE = /^(montaggio|assemblaggio|ripresa|rilavorazione|lavorazione|saldatura|modifica|installazione)\b/i;
/** Progettazione e sviluppo scritti anche nelle righe sotto ("Project SOLO V3 / -engineering…", "Dispositivo MOD-M / - Sviluppo hardware…"), e macchine usate vendute ("completa e funzionante"). */
const PROGETTO = /\b(engineering|development|sviluppo (hardware|firmware|software)|progettazione|funzionante)\b/i;
const compatta = (t: string) => t.toUpperCase().replace(/[^A-Z0-9]/g, '');
const RUMORE = new Set(['PCB', 'CODICE', 'PRINTED', 'CIRCUIT', 'BOARD', 'TARIFF', 'NUMBER', 'MODULI', 'SCHEDA', 'SCHEDE', 'PCBA', 'FR4']);

/**
 * Nomi dei PCB comprati (righe in categoria PCB): "DELAS-SQR/T" → "DELASSQR". Servono a riconoscere il prodotto venduto.
 * Da una descrizione di più parole valgono solo le sigle con un numero ("PCB codice JR_RELE LABELPACK" non deve far scattare "PRODUZIONE");
 * una descrizione di una parola sola (HTS: "NASOMETER_BUZZER") è il nome del prodotto.
 */
export function nomiPcbComprati(righe: Pick<RigaClassificata, 'categoria' | 'descrizione' | 'codici'>[]): string[] {
  const nomi = new Set<string>();
  for (const r of righe.filter(r => r.categoria === 'pcb')) for (const n of nomiDellaRiga(r)) nomi.add(n);
  return [...nomi];
}
function nomiDellaRiga(r: Pick<RigaClassificata, 'descrizione' | 'codici'>): string[] {
  const nomi: string[] = [];
  const parole = r.descrizione.trim().split(/[\s"',;()]+/).filter(Boolean);
  for (const t of [...parole, ...r.codici]) {
    const c = compatta(t.replace(/[/-]T$/i, ''));
    if (c.length < 5 || RUMORE.has(c) || /^CS\d{6}$/.test(c)) continue;
    if (/\d/.test(c) || (parole.length === 1 && c.length >= 8)) nomi.push(c);
  }
  return nomi;
}
/**
 * Costo a pezzo dei PCB comprati, per nome: l'acquisto più recente di almeno 2 pezzi (fuori attrezzature "/T", forfait e campioni).
 * Serve a `materialeVenduto` per trovare il PCB nascosto nel prezzo della scheda venduta.
 */
export function costiPcbComprati(righe: Pick<RigaClassificata, 'categoria' | 'descrizione' | 'codici' | 'data' | 'importo' | 'quantita'>[]): Map<string, number> {
  const costi = new Map<string, number>();
  for (const r of righe.filter(r => r.categoria === 'pcb' && r.importo > 0 && (r.quantita ?? 0) >= 2 && !/[/-]T\s*$/i.test(r.descrizione.split('\n')[0].trim()))
    .sort((a, b) => a.data.localeCompare(b.data))) {
    for (const n of nomiDellaRiga(r)) costi.set(n, r.importo / r.quantita!);
  }
  return costi;
}
/** Stesso nome: uguale, oppure uno contiene l'altro e il più corto è una sigla con un numero (6+) o un nome lungo (8+). */
const stessoNome = (a: string, b: string) => {
  if (a === b) return true;
  const [corto, lungo] = a.length <= b.length ? [a, b] : [b, a];
  return lungo.includes(corto) && ((corto.length >= 6 && /\d/.test(corto)) || corto.length >= 8);
};
const paroleProdotto = (r: RigaVendita) => [r.codice, ...r.descrizione.split('\n')[0].split(/\s+/)].map(compatta).filter(p => p.length >= 5 && !RUMORE.has(p));
const pcbDelProdotto = (r: RigaVendita, nomi: string[]) => {
  const parole = paroleProdotto(r);
  return parole.some(p => nomi.some(n => stessoNome(p, n)));
};
/** Costo a pezzo del PCB comprato con lo stesso nome del prodotto venduto (il più alto se ne trova più d'uno), o null. */
function costoPcbDelProdotto(r: RigaVendita, costi: Map<string, number>): number | null {
  if (!costi.size) return null;
  let max: number | null = null;
  for (const p of paroleProdotto(r)) for (const [n, c] of costi) if (stessoNome(p, n) && (max == null || c > max)) max = c;
  return max;
}

const chiavePrev = (codice: string, clienteId: number | null) => `${codice.toUpperCase().trim()}|${clienteId ?? ''}`;
const chiaveCliente = (r: Pick<RigaVendita, 'clienteId' | 'cliente'>) => r.clienteId != null ? `c${r.clienteId}` : `n:${r.cliente.toUpperCase().trim()}`;

/** Scelta dell'ufficio per un cliente (Adriano 11/11/2026: JOX e Tree chiavi in mano, Control Systems conto lavoro). */
export type SceltaMateriale = 'nostro' | 'conto_lavoro';
export const chiaveClienteVendita = (r: Pick<RigaVendita, 'clienteId' | 'cliente'>) => chiaveCliente(r);

/** Il gruppo di ogni riga venduta (stesso ordine dell'elenco). `contoLavoro` = clienti con componenti in conto lavoro in anagrafica (chiave c<id>).
 *  `scelte` = clienti segnati a mano dall'ufficio: decidono tutte le righe del cliente tranne anticipi, materiale scritto nella riga e servizi. */
export function classificaVendite(righe: RigaVendita[], preventivi: MaterialePreventivo[], nomiPcb: string[], contoLavoro: Set<string> = new Set(),
  scelte: Map<string, SceltaMateriale> = new Map()): TipoVendita[] {
  const prev = new Map(preventivi.map(p => [chiavePrev(p.codice, p.clienteId), p.conMateriale]));
  // 1. indizi della riga e del prodotto
  const primo: (TipoVendita | null)[] = righe.map(r => {
    const d = r.descrizione.trim(), d1 = d.split('\n')[0];
    if (r.acconto || ANTICIPO.test(d)) return 'acconto';
    if (MATERIALE_SCRITTO.test(d)) return 'nostro';
    if (/^UT-/i.test(r.codice)) return 'servizio';
    const scelta = scelte.get(chiaveCliente(r));
    if (scelta && !(SERVIZIO.test(d1) || PROGETTO.test(d))) return scelta;
    const p = r.codice ? prev.get(chiavePrev(r.codice, r.clienteId)) : undefined;
    if (p != null) return p ? 'nostro' : 'conto_lavoro';
    if (SERVIZIO.test(d1) || PROGETTO.test(d)) return 'servizio';
    if (pcbDelProdotto(r, nomiPcb)) return 'nostro';
    return null;
  });
  // 2. il cliente: chiavi in mano se ha almeno un prodotto con materiale nostro (preventivo o PCB comprato), conto lavoro se ha solo prodotti in conto lavoro
  const perCliente = new Map<string, { nostro: boolean; cl: boolean }>();
  righe.forEach((r, i) => {
    const k = chiaveCliente(r), x = perCliente.get(k) ?? { nostro: false, cl: contoLavoro.has(k) };
    const scritto = MATERIALE_SCRITTO.test(r.descrizione);
    if (primo[i] === 'nostro' && !scritto) x.nostro = true;
    if (primo[i] === 'conto_lavoro') x.cl = true;
    perCliente.set(k, x);
  });
  return righe.map((r, i) => {
    if (primo[i]) return primo[i]!;
    // la riga che fattura solo il lavoro è conto lavoro, ma non decide per le altre righe del cliente (Tree: "Lavorazione frontalini")
    if (SOLO_LAVORAZIONE.test(r.descrizione.trim())) return 'conto_lavoro';
    const c = perCliente.get(chiaveCliente(r))!;
    return c.nostro && !c.cl ? 'nostro' : c.cl && !c.nostro ? 'conto_lavoro' : c.nostro ? 'nostro' : 'non_so';
  });
}

export interface RivenditaAnno {
  anno: number;
  /** comprato per rivendere: fatture dei fornitori italiani + autofatture dei fornitori esteri (Mouser, DigiKey…) */
  compratoComponenti: number; compratoPcb: number; compratoMeccanica: number; compratoLamine: number; comprato: number; compratoSchede: number;
  /** di cui dai fornitori esteri (autofatture) */
  compratoEstero: number;
  /** fatturato vero, diviso per gruppo (servizi e acconti esclusi dal confronto) */
  vendutoNostro: number; vendutoContoLavoro: number; vendutoNonSo: number; vendutoServizi: number;
  /** clienti con fatturato "non so" (i più grandi), per guardarli */
  clientiNonSo: { chiave: string; cliente: string; importo: number }[];
  /** clienti chiavi in mano (i più grandi) */
  clientiNostro: { chiave: string; cliente: string; importo: number }[];
  /** clienti in conto lavoro (i più grandi) */
  clientiContoLavoro: { chiave: string; cliente: string; importo: number }[];
  /** peso del materiale comprato sul fatturato con materiale nostro (%), e su nostro + non so (il caso peggiore e il migliore) */
  pesoMateriale: number | null; pesoMaterialeMin: number | null;
  /** lamine comprate (pezzi), fatturate a parte (pezzi, €) e dentro i costi una tantum (pezzi, € delle righe intere) */
  lamineCompratePezzi: number; lamineVendutePezzi: number; lamineVendute: number; lamineUnaTantumPezzi: number; lamineUnaTantumRighe: number;
  /** guadagno stimato: fatturate a parte + quelle nei costi una tantum a PREZZO_LAMINA − comprate */
  margineLamine: number;
  /** lamine vendute in tutto (a parte + dentro le una tantum a PREZZO_LAMINA): pezzi ed euro */
  lamineVendutePezziTot: number; lamineVenduteTot: number;
  /** componenti (con meccanica) e PCB venduti sulle fatture vere (`materialeVenduto`) e guadagno = venduto − comprato */
  vendutoComponenti: number; vendutoPcb: number; guadagnoComponenti: number; guadagnoPcb: number;
}

const primi = (m: Map<string, { cliente: string; importo: number }>, n = 6) => [...m.entries()].filter(e => Math.abs(e[1].importo) >= 1)
  .sort((a, b) => b[1].importo - a[1].importo).slice(0, n).map(([chiave, x]) => ({ chiave, cliente: x.cliente, importo: r2(x.importo) }));

/** Comprato contro fatturato vero, anno per anno. `vendite` = righe delle fatture già classificate (`classificaVendite`). */
export function confrontoRivendita(x: { righe: RigaClassificata[]; vendite: (RigaVendita & { tipo: TipoVendita })[]; lamine: LamineVendute[]; anni: number[]; preventivi?: MaterialePreventivo[] }): RivenditaAnno[] {
  const materiale = materialeVenduto(x.vendite, x.preventivi ?? [], costiPcbComprati(x.righe));
  return x.anni.map(anno => {
    const vendutoComponenti = r2(x.vendite.reduce((s, r, i) => s + (r.anno === anno ? materiale[i].componenti : 0), 0));
    const vendutoPcb = r2(x.vendite.reduce((s, r, i) => s + (r.anno === anno ? materiale[i].pcb : 0), 0));
    const delAnno = x.righe.filter(r => r.anno === anno);
    const comprato = (cat: string) => r2(delAnno.filter(r => r.categoria === cat).reduce((s, r) => s + r.importo, 0));
    const compratoComponenti = comprato('componenti'), compratoPcb = comprato('pcb'), compratoMeccanica = comprato('meccanica'), compratoLamine = comprato('lamine');
    const compratoSchede = r2(compratoComponenti + compratoPcb + compratoMeccanica);
    const compratoEstero = r2(delAnno.filter(r => CATEGORIE_RIVENDITA_SCHEDE.includes(r.categoria) && r.rigaId != null && r.rigaId < 0).reduce((s, r) => s + r.importo, 0));
    const v = x.vendite.filter(r => r.anno === anno);
    const somma = (t: TipoVendita) => r2(v.filter(r => r.tipo === t).reduce((s, r) => s + r.importo, 0));
    const perCliente = (t: TipoVendita) => { const m = new Map<string, { cliente: string; importo: number }>();
      for (const r of v.filter(r => r.tipo === t)) { const k = chiaveCliente(r), y = m.get(k) ?? { cliente: r.cliente, importo: 0 }; y.importo += r.importo; m.set(k, y); }
      return m; };
    const vendutoNostro = somma('nostro'), vendutoNonSo = somma('non_so');
    const l = x.lamine.find(l => l.anno === anno) ?? { anno, pezzi: 0, importo: 0, pezziUnaTantum: 0, importoUnaTantum: 0 };
    const lamineCompratePezzi = delAnno.filter(r => r.categoria === 'lamine' && LAMINA_COMPRATA.test(r.descrizione) && r.importo > 0).reduce((s, r) => s + Math.max(1, Math.abs(r.quantita ?? 1)), 0);
    return {
      anno, compratoComponenti, compratoPcb, compratoMeccanica, compratoLamine, comprato: r2(compratoSchede + compratoLamine), compratoSchede, compratoEstero,
      vendutoNostro, vendutoContoLavoro: somma('conto_lavoro'), vendutoNonSo, vendutoServizi: somma('servizio'),
      clientiNonSo: primi(perCliente('non_so')), clientiNostro: primi(perCliente('nostro')), clientiContoLavoro: primi(perCliente('conto_lavoro')),
      pesoMateriale: vendutoNostro > 0 ? r2((compratoSchede / vendutoNostro) * 100) : null,
      pesoMaterialeMin: vendutoNostro + vendutoNonSo > 0 ? r2((compratoSchede / (vendutoNostro + vendutoNonSo)) * 100) : null,
      lamineCompratePezzi, lamineVendutePezzi: l.pezzi, lamineVendute: r2(l.importo), lamineUnaTantumPezzi: l.pezziUnaTantum, lamineUnaTantumRighe: r2(l.importoUnaTantum),
      margineLamine: r2(l.importo + l.pezziUnaTantum * PREZZO_LAMINA - compratoLamine),
      lamineVendutePezziTot: l.pezzi + l.pezziUnaTantum, lamineVenduteTot: r2(l.importo + l.pezziUnaTantum * PREZZO_LAMINA),
      vendutoComponenti, vendutoPcb, guadagnoComponenti: r2(vendutoComponenti - compratoComponenti - compratoMeccanica), guadagnoPcb: r2(vendutoPcb - compratoPcb),
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

  // 3. la rivendita, sulle fatture vere
  const riv = x.rivendita.find(r => r.anno === anno);
  if (riv && riv.comprato) {
    // tre coppie comprato / venduto, come le vuole Adriano (11/11/2026): "devo capire se guadagno o se perdo"
    const coppia = (nome: string, f: string, comprato: number, venduto: number, guadagno: number) => {
      if (!comprato && !venduto) return;
      frasi.push({ livello: guadagno < 0 ? 'critico' : 'bene', testo: `${nome}: comprat${f} ${euro(comprato)}, vendut${f} ${euro(venduto)}: ${guadagno >= 0 ? 'guadagno' : 'perdita'} di ${euro(Math.abs(guadagno))}.` });
    };
    coppia('Componenti', 'i', r2(riv.compratoComponenti + riv.compratoMeccanica), riv.vendutoComponenti, riv.guadagnoComponenti);
    coppia('PCB', 'i', riv.compratoPcb, riv.vendutoPcb, riv.guadagnoPcb);
    coppia('Lamine', 'e', riv.compratoLamine, riv.lamineVenduteTot, riv.margineLamine);
    if (riv.guadagnoComponenti < 0 || riv.guadagnoPcb < 0) proposte.push('Componenti o PCB venduti per meno di quanto si comprano: per i clienti principali confrontare il prezzo a scheda con il costo vero della BOM (Quotazioni → BOM quotata → "Aggiorna prezzi") e addebitare avanzi e minimi d\'ordine. Senza magazzino un anno può pesare materiale comprato per le consegne dell\'anno dopo.');
    if (riv.compratoLamine || riv.lamineVendute) {
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
    if (riv && riv.pesoMateriale != null) opinione += riv.pesoMateriale >= 85 ? ` Sulle schede chiavi in mano il materiale vale il ${pct(riv.pesoMateriale)} del fatturato: resta troppo poco per il montaggio.`
      : riv.pesoMateriale >= 70 ? ` Sulle schede chiavi in mano il materiale vale il ${pct(riv.pesoMateriale)} del fatturato: il margine è stretto, il ricarico sul materiale va controllato cliente per cliente.`
      : ` Sulle schede chiavi in mano il materiale vale il ${pct(riv.pesoMateriale)} del fatturato: il resto paga montaggio e margine.`;
  }
  if (!proposte.length) proposte.push('Nessun segnale forte: continuare a controllare ogni mese le categorie che salgono.');
  return { frasi, opinione, proposte };
}
