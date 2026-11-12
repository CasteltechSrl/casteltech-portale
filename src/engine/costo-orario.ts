/**
 * Costo orario dell'azienda e del personale (Adriano 12/11/2026: "mi faccio pagare a tempo, ore uomo + ore azienda: calcolami i costi
 * in base alle ore lavorate, come se fosse una persona che abbia lavorato sempre, con il mio stipendio e tutte le spese di gestione;
 * visibile nel portale, mese per mese e media annua").
 *
 * Le stesse due tariffe del preventivo (`calcolo.ts`: costo fase = ore ciclo × costo azienda + ore ciclo × persone × costo operatore):
 * - costo operatore (produzione / ufficio) = costo dei dipendenti ÷ ore lavorate dei cedolini. Costo = lordo + contributi + altri enti
 *   + TFR maturato (lordo ÷ 13,5); il TFR LIQUIDATO a chi esce NON conta (è maturato negli anni prima: Cristina e Loretta nel 2026).
 *   Operai, apprendisti e tirocinanti = produzione; impiegati = ufficio.
 * - costo azienda = tutte le spese di gestione del mese (servizi, affitti e leasing, compenso del socio amministratore con l'INPS,
 *   ammortamenti, imposte e oneri, oneri finanziari: i costi fissi del Punto di pareggio tranne i dipendenti) ÷ ore lavorate di TUTTI i dipendenti.
 *   Materie prime e di consumo restano fuori: nel preventivo sono voci a parte.
 * Ogni mese ha il suo valore; la media annua è la somma dei costi ÷ la somma delle ore (così un mese con la tredicesima o con poche ore
 * non pesa più degli altri). Mesi senza ore nei cedolini: valore vuoto e fuori dalle medie.
 */
import { chiaveMese, type CodiceFamiglia } from './pareggio.js';

/** Una riga della nota contabile dello studio paghe (tabella costi_personale): il TFR è quello liquidato. */
export interface RigaCostoPersonale { anno: number; mese: number; qualifica: string; lordo: number; contributi: number; tfr: number; altri: number }
/** Un cedolino (tabella cedolini). */
export interface RigaOre { anno: number; mese: number; qualifica: string | null; mensilita: string; ore: number | null; giorni: number | null; lordo?: number }
/** Spese di gestione del mese per famiglia del Punto di pareggio. */
export interface GestioneMese { anno: number; mese: number; famiglie: Partial<Record<CodiceFamiglia, number>>; fonte: string }

export type Reparto = 'produzione' | 'ufficio' | 'socio';

/** TFR che matura ogni mese: un tredicesimo e mezzo della retribuzione (art. 2120 c.c.). */
export const DIVISORE_TFR = 13.5;
/** Famiglie del Punto di pareggio che fanno il costo azienda (i dipendenti no: sono il costo operatore). */
export const FAMIGLIE_GESTIONE: CodiceFamiglia[] = ['servizi', 'godimento', 'compensi', 'ammortamenti', 'oneri', 'finanziari', 'senza_categoria'];
/**
 * Categorie delle fatture dei fornitori che NON sono spese di gestione (Adriano 12/11/2026: "gli acquisti di materiale che poi rivendo e similari
 * non devono andare nel calcolo"): il materiale rivenduto e di consumo è già fuori (famiglia materie); qui le lavorazioni comprate per un lavoro
 * e rivendute (montaggi fatti fuori, progettazione, ricerca e sviluppo). Le consulenze tecniche restano: sono un costo fisso del mese.
 */
export const CATEGORIE_ESCLUSE = ['montaggi_esterni', 'progettazione', 'ricerca_sviluppo'];
/** Ore di una giornata, per i cedolini con i giorni ma senza le ore. */
export const ORE_GIORNO = 8;
/** Ore di un mese pieno (22 giorni × 8): tetto delle ore stimate di un cedolino e stima quando nel mese nessuno ha le ore (cedolini Zucchetti 2019–2021). */
export const ORE_MESE_PIENO = 176;

export function reparto(qualifica: string | null | undefined): Reparto {
  const q = (qualifica ?? '').toUpperCase();
  if (/SOCI|AMMINISTRATOR|COLLABORATOR/.test(q)) return 'socio';
  if (/IMPIEGAT|QUADRO|DIRIGENT/.test(q)) return 'ufficio';
  return 'produzione';   // operai, apprendisti, tirocinanti, "dipendenti" delle note vecchie
}

/** Costo azienda di una riga della nota contabile senza il TFR liquidato e con il TFR maturato (tirocinanti: niente TFR). */
export function costoRiga(r: RigaCostoPersonale): number {
  const tfrMaturato = /TIROCIN/i.test(r.qualifica) ? 0 : r.lordo / DIVISORE_TFR;
  return r.lordo + r.contributi + (r.altri || 0) + tfrMaturato;
}

/** Ore di un cedolino: le ore lavorate, altrimenti i giorni × 8; la tredicesima non ha ore. */
export function oreCedolino(c: RigaOre): number | null {
  if (c.mensilita !== 'ordinaria') return 0;
  if (c.ore != null && c.ore > 0) return c.ore;
  if (c.giorni != null && c.giorni > 0) return c.giorni * ORE_GIORNO;
  return null;
}

export interface Valore { costo: number; ore: number; orario: number | null }
export interface MeseCostoOrario {
  chiave: string; anno: number; mese: number;
  produzione: Valore; ufficio: Valore;
  /** costo azienda: spese di gestione ÷ ore di tutti i dipendenti */
  azienda: Valore & { famiglie: Partial<Record<CodiceFamiglia, number>>; fonte: string };
  tfrLiquidato: number;
  /** lordo dei dipendenti nei cedolini e nella nota contabile: se non tornano mancano cedolini o note (vedi `attendibile`) */
  lordoCedolini: number; lordoNota: number;
  /** cedolini di soci e collaboratori nel mese: più di uno = soci che lavoravano anche in produzione (fino al 2023) */
  soci: number;
  /** cedolini senza ore: le loro ore sono stimate */
  cedoliniSenzaOre: number; cedolini: number;
  /** il mese entra nelle medie (ha ore) */
  valido: boolean;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const valore = (costo: number, ore: number): Valore => ({ costo: r2(costo), ore: r2(ore), orario: ore > 0 ? r2(costo / ore) : null });

export function costoOrarioMesi(opz: { mesi: { anno: number; mese: number }[]; personale: RigaCostoPersonale[]; ore: RigaOre[]; gestione: GestioneMese[] }): MeseCostoOrario[] {
  return opz.mesi.map(({ anno, mese }) => {
    const chiave = chiaveMese(anno, mese);
    const stesso = <T extends { anno: number; mese: number }>(x: T) => x.anno === anno && x.mese === mese;
    const costo = { produzione: 0, ufficio: 0 }, ore = { produzione: 0, ufficio: 0 };
    let tfrLiquidato = 0, cedoliniSenzaOre = 0, lordoCedolini = 0, lordoNota = 0, soci = 0, cedolini = 0;
    const tfrReparto = { produzione: 0, ufficio: 0 };
    for (const p of opz.personale.filter(stesso)) {
      const rep = reparto(p.qualifica);
      tfrLiquidato += p.tfr || 0;
      if (rep !== 'socio') tfrReparto[rep] += p.tfr || 0;
      if (rep !== 'socio') { costo[rep] += costoRiga(p); lordoNota += p.lordo + (p.tfr || 0); }
    }
    // cedolini senza ore: stimate dal lordo con le ore per euro dei colleghi dello stesso reparto e mese (mai oltre un mese pieno),
    // senza colleghi con le ore = un mese pieno; il mese lo dice nelle note
    const senza: { rep: 'produzione' | 'ufficio'; lordo: number }[] = [];
    const conOre = { produzione: { ore: 0, lordo: 0 }, ufficio: { ore: 0, lordo: 0 } };
    for (const c of opz.ore.filter(stesso)) {
      const rep = reparto(c.qualifica);
      if (rep === 'socio') { if (c.mensilita === 'ordinaria') soci++; continue; }
      lordoCedolini += c.lordo ?? 0;
      if (c.mensilita === 'ordinaria') cedolini++;
      const h = oreCedolino(c);
      if (h == null) { cedoliniSenzaOre++; senza.push({ rep, lordo: c.lordo ?? 0 }); continue; }
      ore[rep] += h;
      if (h > 0 && c.lordo) { conOre[rep].ore += h; conOre[rep].lordo += c.lordo; }
    }
    // il cedolino della liquidazione di solito non ha le ore e il suo lordo comprende il TFR liquidato: per la stima si toglie
    for (const s of senza) {
      const via = Math.min(s.lordo, tfrReparto[s.rep]);
      s.lordo -= via; tfrReparto[s.rep] -= via;
      const perEuro = conOre[s.rep].lordo > 0 ? conOre[s.rep].ore / conOre[s.rep].lordo : 0;
      ore[s.rep] += perEuro ? Math.min(ORE_MESE_PIENO, s.lordo * perEuro) : (s.lordo > 0 ? ORE_MESE_PIENO : 0);
    }
    const g = opz.gestione.find(stesso);
    const famiglie: Partial<Record<CodiceFamiglia, number>> = {};
    let gestione = 0;
    for (const f of FAMIGLIE_GESTIONE) { const v = g?.famiglie[f] ?? 0; if (v) { famiglie[f] = r2(v); gestione += v; } }
    const oreTutte = ore.produzione + ore.ufficio;
    return {
      chiave, anno, mese,
      produzione: valore(costo.produzione, ore.produzione), ufficio: valore(costo.ufficio, ore.ufficio),
      azienda: { ...valore(gestione, oreTutte), famiglie, fonte: g?.fonte ?? '' },
      tfrLiquidato: r2(tfrLiquidato), lordoCedolini: r2(lordoCedolini), lordoNota: r2(lordoNota), soci, cedoliniSenzaOre, cedolini, valido: oreTutte > 0,
    };
  });
}

export interface MediaCostoOrario { mesi: number; produzione: Valore; ufficio: Valore; azienda: Valore; daA: string; attendibile: boolean; scarto: number | null; sociAlLavoro: boolean; oreStimate: number }

/** Scarto massimo tra il lordo dei cedolini e quello delle note contabili perché il periodo sia attendibile (mancano cedolini o note, soci al lavoro in produzione…). */
export const SCARTO_MAX = 0.1;
/** Soci con il cedolino che non lavorano in produzione: solo l'amministratore. */
export const SOCI_AMMINISTRATORI = 1;
/** Quota massima di cedolini con le ore stimate perché il periodo sia attendibile. */
export const STIMATE_MAX = 0.25;

/** Media di più mesi: somma dei costi ÷ somma delle ore, solo i mesi con le ore. */
export function media(mesi: MeseCostoOrario[]): MediaCostoOrario {
  const validi = mesi.filter(m => m.valido);
  const somma = (k: 'produzione' | 'ufficio' | 'azienda') =>
    valore(validi.reduce((s, m) => s + m[k].costo, 0), validi.reduce((s, m) => s + m[k].ore, 0));
  const lc = validi.reduce((s, m) => s + m.lordoCedolini, 0), ln = validi.reduce((s, m) => s + m.lordoNota, 0);
  const scarto = ln > 0 ? r2((lc - ln) / ln) : null;
  const sociAlLavoro = validi.some(m => m.soci > SOCI_AMMINISTRATORI);
  const nCed = validi.reduce((s, m) => s + m.cedolini, 0);
  const oreStimate = nCed > 0 ? r2(validi.reduce((s, m) => s + m.cedoliniSenzaOre, 0) / nCed) : 0;
  return { mesi: validi.length, produzione: somma('produzione'), ufficio: somma('ufficio'), azienda: somma('azienda'),
    daA: validi.length ? `${validi[0].chiave} – ${validi[validi.length - 1].chiave}` : '', scarto, sociAlLavoro, oreStimate, attendibile: !sociAlLavoro && oreStimate <= STIMATE_MAX && scarto != null && Math.abs(scarto) <= SCARTO_MAX };
}

/** Media degli ultimi 12 mesi con le ore fino al mese dato compreso (la "media annua" da usare nei preventivi). */
export function mediaDodiciMesi(mesi: MeseCostoOrario[], finoA: string): MediaCostoOrario {
  const prima = mesi.filter(m => m.valido && m.chiave <= finoA);
  return media(prima.slice(-12));
}

/** Una media per anno solare (Adriano 11/11/2026: tutto diviso per anno). */
export function mediePerAnno(mesi: MeseCostoOrario[]): { anno: number; media: MediaCostoOrario }[] {
  const anni = [...new Set(mesi.map(m => m.anno))].sort((a, b) => b - a);
  return anni.map(anno => ({ anno, media: media(mesi.filter(m => m.anno === anno)) })).filter(a => a.media.mesi > 0);
}

/** Tariffe proposte dalla media dei 12 mesi, arrotondate al mezzo euro come quelle scritte a mano in Impostazioni → Tariffe. */
export function tariffeProposte(m: MediaCostoOrario): { costoAziendaH: number | null; costoOperatoreProduzioneH: number | null; costoOperatoreUfficioH: number | null } {
  const mezzo = (n: number | null) => (n == null ? null : Math.round(n * 2) / 2);
  return { costoAziendaH: mezzo(m.azienda.orario), costoOperatoreProduzioneH: mezzo(m.produzione.orario), costoOperatoreUfficioH: mezzo(m.ufficio.orario) };
}
