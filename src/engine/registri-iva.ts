/**
 * Registri IVA (Adriano 31/10/2026, al posto di Fatture in Cloud): registro delle fatture emesse (vendite), degli acquisti
 * e delle autofatture (reverse charge TD16–TD19), riepilogo per aliquota/natura e liquidazione indicativa del periodo.
 * Il commercialista resta quello che fa la liquidazione vera: qui si preparano i dati e i controlli.
 * Solo calcoli: niente database e niente rete.
 */
import { arrotonda2, calcolaTotali, numeroCompleto, type Aliquota, type RigaDocumento, type VoceRiepilogo } from './amministrazione.js';

// ───────────────────────────── periodo ─────────────────────────────

export type TipoPeriodo = 'mese' | 'trimestre' | 'anno';
export interface Periodo { codice: string; tipo: TipoPeriodo; anno: number; dal: string; al: string; nome: string }

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const fineMese = (anno: number, mese: number) => new Date(Date.UTC(anno, mese, 0)).getUTCDate();
const dueCifre = (n: number) => String(n).padStart(2, '0');

/**
 * Periodo dal codice: "M01"…"M12" (mese), "T1"…"T4" (trimestre), "A" (anno). Codice sconosciuto = trimestre di `oggi`.
 * La liquidazione IVA è mensile o trimestrale: lo decide il commercialista, il portale li offre tutti e due.
 */
export function periodoDa(anno: number, codice: string | undefined, oggi = new Date().toISOString().slice(0, 10)): Periodo {
  const c = String(codice ?? '').toUpperCase();
  const m = /^M(0?[1-9]|1[0-2])$/.exec(c), t = /^T([1-4])$/.exec(c);
  if (m) {
    const mese = Number(m[1]);
    return { codice: `M${dueCifre(mese)}`, tipo: 'mese', anno, dal: `${anno}-${dueCifre(mese)}-01`, al: `${anno}-${dueCifre(mese)}-${fineMese(anno, mese)}`, nome: `${MESI[mese - 1]} ${anno}` };
  }
  if (c === 'A') return { codice: 'A', tipo: 'anno', anno, dal: `${anno}-01-01`, al: `${anno}-12-31`, nome: `anno ${anno}` };
  const tr = t ? Number(t[1]) : (Number(oggi.slice(0, 4)) === anno ? Math.floor((Number(oggi.slice(5, 7)) - 1) / 3) + 1 : 1);
  const primo = (tr - 1) * 3 + 1, ultimo = primo + 2;
  return { codice: `T${tr}`, tipo: 'trimestre', anno, dal: `${anno}-${dueCifre(primo)}-01`, al: `${anno}-${dueCifre(ultimo)}-${fineMese(anno, ultimo)}`, nome: `${tr}° trimestre ${anno}` };
}

/** Elenco dei periodi per il menu a tendina (trimestri, mesi, anno). */
export const CODICI_PERIODO: [string, string][] = [
  ['T1', '1° trimestre'], ['T2', '2° trimestre'], ['T3', '3° trimestre'], ['T4', '4° trimestre'],
  ...MESI.map((m, i): [string, string] => [`M${dueCifre(i + 1)}`, m[0].toUpperCase() + m.slice(1)]), ['A', 'Anno intero'],
];

// ───────────────────────────── riepilogo IVA del documento ─────────────────────────────

/** Voce del riepilogo IVA di un documento: aliquota (o natura se 0 %), imponibile e imposta. */
export interface VoceIva { codice: string; percentuale: number; natura: string | null; imponibile: number; imposta: number }

const numeroXml = (s: string | undefined) => Number(String(s ?? '').trim()) || 0;
const tag = (blocco: string, nome: string) => new RegExp(`<(?:\\w+:)?${nome}>([^<]*)</(?:\\w+:)?${nome}>`).exec(blocco)?.[1];

/**
 * Riepilogo dal file FatturaPA (blocchi DatiRiepilogo): è quello che conta per l'Agenzia, quindi vince sulle righe.
 * Nel file con più lotti (più FatturaElettronicaBody) si sommano tutti. Vuoto se il file non si legge (es. .p7m binario).
 */
export function riepilogoDaXml(xml: string | null | undefined): VoceIva[] {
  if (!xml) return [];
  const voci = new Map<string, VoceIva>();
  for (const m of String(xml).matchAll(/<(?:\w+:)?DatiRiepilogo>([\s\S]*?)<\/(?:\w+:)?DatiRiepilogo>/g)) {
    const percentuale = numeroXml(tag(m[1], 'AliquotaIVA'));
    const natura = tag(m[1], 'Natura')?.trim() || null;
    const codice = percentuale > 0 ? `${percentuale}%` : (natura ?? '0%');
    const v = voci.get(codice) ?? { codice, percentuale, natura: percentuale > 0 ? null : natura, imponibile: 0, imposta: 0 };
    v.imponibile = arrotonda2(v.imponibile + numeroXml(tag(m[1], 'ImponibileImporto')));
    v.imposta = arrotonda2(v.imposta + numeroXml(tag(m[1], 'Imposta')));
    voci.set(codice, v);
  }
  return [...voci.values()];
}

/** Voce dal riepilogo calcolato sulle righe del portale (aliquote dell'impostazione). */
const daVoceRiepilogo = (v: VoceRiepilogo): VoceIva => ({
  codice: v.percentuale > 0 ? `${v.percentuale}%` : (v.natura ?? '0%'), percentuale: v.percentuale, natura: v.percentuale > 0 ? null : v.natura,
  imponibile: v.imponibile, imposta: v.imposta,
});

/** Aliquota dedotta dai totali (documenti senza righe né file): 22, 10, 5, 4 o 0 se torna al centesimo, altrimenti null ("mista"). */
export function aliquotaDedotta(imponibile: number, imposta: number): number | null {
  if (!imponibile) return imposta ? null : 0;
  if (Math.abs(imposta) < 0.005) return 0;
  for (const p of [22, 10, 5, 4]) if (Math.abs(arrotonda2(imponibile * p / 100) - imposta) <= 0.02) return p;
  return null;
}

export interface DatiDocumentoIva { imponibile: number; imposta: number; xml?: string | null; righe?: RigaDocumento[]; aliquotaPredefinita?: string | null }

/**
 * Riepilogo IVA di un documento: dal file XML se c'è, altrimenti dalle righe (aliquota predefinita del cliente per quelle senza),
 * altrimenti dai totali. Se il riepilogo non torna con i totali salvati vincono i totali (una voce sola) e si segnala.
 */
export function riepilogoDocumento(d: DatiDocumentoIva, aliquote: Aliquota[]): { voci: VoceIva[]; differenza: boolean } {
  const imponibile = Number(d.imponibile) || 0, imposta = Number(d.imposta) || 0;
  let voci = riepilogoDaXml(d.xml);
  if (!voci.length && d.righe?.some(r => !r.solo_descrizione)) {
    const t = calcolaTotali(d.righe, aliquote, d.aliquotaPredefinita || 'IVA22');
    if (!t.errori.length) voci = t.riepilogo.map(daVoceRiepilogo);
  }
  const somma = (k: 'imponibile' | 'imposta') => arrotonda2(voci.reduce((s, v) => s + v[k], 0));
  if (voci.length && Math.abs(somma('imponibile') - imponibile) <= 0.02 && Math.abs(somma('imposta') - imposta) <= 0.02) return { voci, differenza: false };
  const p = aliquotaDedotta(imponibile, imposta);
  const voce: VoceIva = { codice: p == null ? 'mista' : p > 0 ? `${p}%` : '0%', percentuale: p ?? 0, natura: null, imponibile, imposta };
  return { voci: [voce], differenza: voci.length > 0 };
}

// ───────────────────────────── registri ─────────────────────────────

export type Registro = 'vendite' | 'acquisti' | 'autofatture';
export const NOMI_REGISTRO: Record<Registro, string> = { vendite: 'Fatture emesse (vendite)', acquisti: 'Fatture ricevute (acquisti)', autofatture: 'Autofatture (reverse charge)' };

/** Riga del registro: un documento con il suo riepilogo IVA, importi con il segno (note di credito in negativo). */
export interface RigaRegistro {
  id: number; registro: Registro; protocollo: number | null;
  tipo: 'fattura' | 'nota_credito' | 'autofattura'; tipoSdi: string | null;
  numero: string; data: string; nome: string; partitaIva: string; paese: string;
  imponibile: number; imposta: number; totale: number; voci: VoceIva[]; differenza: boolean;
  origine: string; stato?: string | null; link: string;
}

/** Note di credito in negativo nei registri e nei totali. */
export const segno = (tipo: string) => (tipo === 'nota_credito' ? -1 : 1);

/** Stati dei documenti emessi che entrano nel registro: non le bozze, non gli annullati, non gli scartati dallo SdI (da rimandare). */
export const STATI_ESCLUSI = ['bozza', 'annullato', 'scartato'];

/**
 * Protocollo degli acquisti: numero progressivo nell'anno in ordine di data (poi di arrivo nel portale). Il portale non salva un
 * protocollo fisso: è calcolato, quindi una fattura registrata tardi con una data vecchia sposta i numeri dopo di lei.
 */
export function protocolla<T extends { data: string; id: number }>(docs: T[]): (T & { protocollo: number })[] {
  return [...docs].sort((a, b) => a.data.localeCompare(b.data) || a.id - b.id).map((d, i) => ({ ...d, protocollo: i + 1 }));
}

export interface TotaleVoce { codice: string; percentuale: number; natura: string | null; imponibile: number; imposta: number; documenti: number }

/** Riepilogo del registro per aliquota/natura (con il segno delle note di credito), aliquote dalla più alta. */
export function riepilogoRegistro(righe: RigaRegistro[]): { voci: TotaleVoce[]; imponibile: number; imposta: number; totale: number; documenti: number } {
  const voci = new Map<string, TotaleVoce>();
  let totale = 0;
  for (const r of righe) {
    const s = segno(r.tipo);
    totale = arrotonda2(totale + s * r.totale);
    for (const v of r.voci) {
      const t = voci.get(v.codice) ?? { codice: v.codice, percentuale: v.percentuale, natura: v.natura, imponibile: 0, imposta: 0, documenti: 0 };
      t.imponibile = arrotonda2(t.imponibile + s * v.imponibile);
      t.imposta = arrotonda2(t.imposta + s * v.imposta);
      t.documenti++;
      voci.set(v.codice, t);
    }
  }
  const elenco = [...voci.values()].sort((a, b) => b.percentuale - a.percentuale || a.codice.localeCompare(b.codice));
  return {
    voci: elenco, imponibile: arrotonda2(elenco.reduce((s, v) => s + v.imponibile, 0)), imposta: arrotonda2(elenco.reduce((s, v) => s + v.imposta, 0)),
    totale, documenti: righe.length,
  };
}

export interface Liquidazione { debitoVendite: number; debitoAutofatture: number; creditoAcquisti: number; creditoAutofatture: number; debito: number; credito: number; saldo: number }

/**
 * Liquidazione indicativa del periodo. L'IVA delle autofatture va sia a debito sia a credito (si annulla, se detraibile).
 * Saldo positivo = IVA da versare, negativo = a credito. Non tiene conto di credito del periodo prima, acconto di dicembre,
 * IVA indetraibile (auto, telefoni, omaggi), split payment, interessi trimestrali dell'1%: li aggiunge il commercialista.
 */
export function liquidazione(vendite: RigaRegistro[], acquisti: RigaRegistro[], autofatture: RigaRegistro[]): Liquidazione {
  const iva = (rr: RigaRegistro[]) => arrotonda2(rr.reduce((s, r) => s + segno(r.tipo) * r.imposta, 0));
  const debitoVendite = iva(vendite), debitoAutofatture = iva(autofatture), creditoAcquisti = iva(acquisti), creditoAutofatture = debitoAutofatture;
  const debito = arrotonda2(debitoVendite + debitoAutofatture), credito = arrotonda2(creditoAcquisti + creditoAutofatture);
  return { debitoVendite, debitoAutofatture, creditoAcquisti, creditoAutofatture, debito, credito, saldo: arrotonda2(debito - credito) };
}

// ───────────────────────────── controlli ─────────────────────────────

/**
 * Numeri mancanti in una serie (tipo + sezionale) dell'anno, fino all'ultimo numero emesso: nel registro vendite la numerazione
 * deve essere continua. `numeri` = tutti i numeri emessi dell'anno (anche fuori dal periodo, anche annullati).
 */
export function numeriMancanti(numeri: number[], partenza = 1): number[] {
  const presenti = new Set(numeri.filter(n => Number.isInteger(n) && n > 0));
  if (!presenti.size) return [];
  const max = Math.max(...presenti), mancanti: number[] = [];
  for (let n = partenza; n < max; n++) if (!presenti.has(n)) mancanti.push(n);
  return mancanti;
}

/** Segnalazioni del registro da guardare prima di passare i dati al commercialista. */
export function controlliRegistro(r: { vendite: RigaRegistro[]; acquisti: RigaRegistro[]; autofatture: RigaRegistro[];
  mancanti?: { serie: string; numeri: number[] }[]; scartati?: { numero: string; data: string }[]; bozzeNelPeriodo?: number }): string[] {
  const c: string[] = [];
  for (const m of r.mancanti ?? []) if (m.numeri.length) {
    const elenco = m.numeri.length > 12 ? `${m.numeri.slice(0, 12).join(', ')}… (${m.numeri.length})` : m.numeri.join(', ');
    c.push(`${m.serie}: mancano i numeri ${elenco}. La numerazione deve essere continua: controlla se sono documenti di Fatture in Cloud non caricati.`);
  }
  for (const s of r.scartati ?? []) c.push(`Fattura ${s.numero} del ${s.data.split('-').reverse().join('/')} scartata dallo SdI: non è nel registro finché non la correggi e la rimandi.`);
  if (r.bozzeNelPeriodo) c.push(`${r.bozzeNelPeriodo} bozze con data nel periodo: non sono nel registro finché non le emetti.`);
  for (const x of [...r.vendite, ...r.acquisti, ...r.autofatture]) {
    if (x.differenza) c.push(`${NOMI_REGISTRO[x.registro]}: documento ${x.numero} del ${x.data.split('-').reverse().join('/')} (${x.nome}): il riepilogo per aliquota non torna con i totali, usati i totali.`);
    else if (x.voci.some(v => v.codice === 'mista')) c.push(`${NOMI_REGISTRO[x.registro]}: documento ${x.numero} (${x.nome}) con aliquote miste senza file XML: nel riepilogo è in "mista".`);
  }
  for (const x of r.acquisti) if (!x.partitaIva) c.push(`Acquisti: documento ${x.numero} di ${x.nome} senza partita IVA del fornitore.`);
  return c;
}

/** Numero leggibile del documento emesso (con il sezionale: 12/AF). */
export const numeroRegistro = (numero: number | null, sezionale: string | null) => (numero == null ? '' : numeroCompleto(numero, sezionale ?? ''));

/** Nome della voce IVA per le persone: "22%", "N3.5 non imponibile lettera d'intento"… */
export const NOMI_NATURA: Record<string, string> = {
  N1: 'escluse art. 15', N2: 'non soggette', 'N2.1': 'non soggette art. 7 (servizi esteri)', 'N2.2': 'non soggette, altri casi',
  N3: 'non imponibili', 'N3.1': 'non imponibili esportazioni', 'N3.2': 'non imponibili cessioni UE', 'N3.3': 'non imponibili San Marino',
  'N3.4': 'non imponibili assimilate', 'N3.5': 'non imponibili lettera d\'intento', 'N3.6': 'non imponibili, altre', N4: 'esenti',
  N5: 'regime del margine', N6: 'inversione contabile', 'N6.1': 'reverse charge rottami', 'N6.2': 'reverse charge oro', 'N6.3': 'reverse charge subappalto edile',
  'N6.4': 'reverse charge fabbricati', 'N6.5': 'reverse charge cellulari', 'N6.6': 'reverse charge elettronica', 'N6.7': 'reverse charge edilizia',
  'N6.8': 'reverse charge energia', 'N6.9': 'reverse charge altri casi', N7: 'IVA assolta in altro stato UE',
};
export const nomeVoce = (v: { codice: string; natura: string | null }) =>
  v.natura ? `${v.natura} ${NOMI_NATURA[v.natura] ?? ''}`.trim() : v.codice === 'mista' ? 'aliquote miste' : v.codice;
