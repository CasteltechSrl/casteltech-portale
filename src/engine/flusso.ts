/**
 * Flusso di produzione nel cruscotto (Adriano 6/11/2026): cinque finestre in cima alla pagina iniziale,
 * ognuna un elenco di cose da fare in ordine di priorità:
 *  1. Da acquistare: schede ordinate con qualcosa da comprare (componenti, PCB, lamine, altro), spunte quando è fatto;
 *  2. Da preparare per produzione: per ogni fase prevista (SMD, THT, montaggio meccanico, conformal coating, etichettatura)
 *     chi verifica che c'è tutto il materiale mette la spunta; tutte le spunte → la riga passa in produzione;
 *  3. In produzione: le fasi del ciclo (estrazione componenti, SMD, THT, meccanico, collaudo, coating, etichettatura) si spuntano
 *     da sole dai tempi del reparto (telefono o schede scansionate) o a mano; "fine lavorazione" (anche parziale) con le schede finite;
 *  4. Da spedire: le schede finite; con il DDT fatto sono "in attesa di corriere"; quando il corriere passa l'ufficio preme "Spedito";
 *  5. Spedite nel mese: le spedizioni partite negli ultimi 30 giorni.
 * Priorità automatica dalla consegna richiesta (poi data dell'ordine), modificabile a mano con un numero.
 * Qui solo regole (test in tests/flusso.test.ts); le letture dal database in server/flusso-servizio.ts.
 */
import { eServizio } from './ordini.js';

export type Finestra = 'acquistare' | 'preparare' | 'produzione' | 'spedire' | 'spedite';
export const FINESTRE: { chiave: Finestra; numero: number; nome: string; breve: string }[] = [
  { chiave: 'acquistare', numero: 1, nome: 'Da acquistare', breve: 'schede con cose da comprare' },
  { chiave: 'preparare', numero: 2, nome: 'Da preparare per produzione', breve: 'materiale da verificare per fase' },
  { chiave: 'produzione', numero: 3, nome: 'In produzione', breve: 'fasi del ciclo e fine lavorazione' },
  { chiave: 'spedire', numero: 4, nome: 'Da spedire', breve: 'schede finite, DDT e corriere' },
  { chiave: 'spedite', numero: 5, nome: 'Spedite nel mese', breve: 'partite negli ultimi 30 giorni' },
];
export const GIORNI_SPEDITE = 30;
export const finestraValida = (x: unknown): Finestra | null => (FINESTRE.some(f => f.chiave === x) ? x as Finestra : null);

export interface Firma { da: string; il: string }

/** Quello che si salva per ogni riga d'ordine (`flusso_righe`). */
export interface StatoFlusso {
  priorita: number | null;                 // scritta a mano (1 = prima); null = automatica
  acquisti: Record<string, Firma>;         // cose comprate
  materiale: Record<string, Firma>;        // materiale verificato per fase
  produzione: Record<string, Firma>;       // fasi segnate fatte a mano
  inProduzione: Firma | null;              // passaggio in produzione dato a mano
}

const firme = (v: unknown): Record<string, Firma> => {
  const out: Record<string, Firma> = {};
  if (v && typeof v === 'object') for (const [k, f] of Object.entries(v as Record<string, any>)) if (f && typeof f === 'object' && f.da) out[k] = { da: String(f.da), il: String(f.il ?? '') };
  return out;
};
const firma = (v: unknown): Firma | null => (v && typeof v === 'object' && (v as any).da ? { da: String((v as any).da), il: String((v as any).il ?? '') } : null);

export function leggiStatoFlusso(x: unknown): StatoFlusso {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const p = Number(o.priorita);
  return { priorita: Number.isInteger(p) && p > 0 ? p : null, acquisti: firme(o.acquisti), materiale: firme(o.materiale), produzione: firme(o.produzione), inProduzione: firma(o.in_produzione ?? o.inProduzione) };
}

// ───────────────────────────── cosa c'è da comprare ─────────────────────────────

export interface VoceAcquisto { chiave: string; nome: string; fonte: 'preventivo' | 'ordine' }

const si = (p: Record<string, unknown> | null | undefined, k: string) => Number(p?.[k] ?? 0) > 0;

/**
 * Cose da acquistare per una scheda: dalle spunte del preventivo (Componenti, PCB, Lamina) e dalle righe di costo dello stesso
 * ordine che parlano di acquisti (acquisto PCB, componenti, lamina/stencil, materiale). Stessa cosa citata due volte = una voce.
 */
export function cosaAcquistare(parametri: Record<string, unknown> | null | undefined, righeOrdine: { codice?: string | null; descrizione?: string | null }[]): VoceAcquisto[] {
  const out = new Map<string, VoceAcquisto>();
  const metti = (chiave: string, nome: string, fonte: VoceAcquisto['fonte']) => { if (!out.has(chiave)) out.set(chiave, { chiave, nome, fonte }); };
  if (si(parametri, 'acquistoComponenti')) metti('componenti', 'Componenti', 'preventivo');
  if (si(parametri, 'acquistoPcb')) metti('pcb', 'PCB', 'preventivo');
  if (si(parametri, 'acquistoLamina') || si(parametri, 'laminaTrattamenti')) metti('lamina', si(parametri, 'doppiaFaccia') ? 'Lamine TOP+BOT' : 'Lamina', 'preventivo');
  for (const r of righeOrdine) {
    if (!eServizio(r.codice, r.descrizione)) continue;
    const t = `${r.codice ?? ''} ${r.descrizione ?? ''}`.toUpperCase();
    if (/\bCOMPONENTI\b/.test(t) && /ACQUIST/.test(t)) metti('componenti', 'Componenti', 'ordine');
    else if (/\bPCB\b/.test(t) && /ACQUIST|FORNITUR/.test(t)) metti('pcb', 'PCB', 'ordine');
    else if (/LAMIN|STENCIL/.test(t)) metti('lamina', 'Lamina', 'ordine');
    else if (/ACQUISTO/.test(t)) metti('altro:' + t.replace(/[^A-Z0-9]+/g, '-').slice(0, 40), String(r.descrizione ?? r.codice ?? 'Altro').trim(), 'ordine');
  }
  return [...out.values()];
}

// ───────────────────────────── fasi del ciclo ─────────────────────────────

export type FaseMacro = 'estrazione' | 'smd_top' | 'smd_bot' | 'tht' | 'meccanico' | 'collaudo' | 'coating' | 'etichettatura';
export const NOMI_FASE: Record<FaseMacro, string> = {
  estrazione: 'Estrazione / preparazione componenti', smd_top: 'SMD TOP', smd_bot: 'SMD BOT', tht: 'THT', meccanico: 'Montaggio meccanico',
  collaudo: 'Collaudo', coating: 'Conformal coating', etichettatura: 'Etichettatura',
};
const ORDINE_FASI: FaseMacro[] = ['estrazione', 'smd_top', 'smd_bot', 'tht', 'meccanico', 'collaudo', 'coating', 'etichettatura'];

/** Fase del catalogo (codice + gruppo) → fase del flusso; null = non conta (pre-produzione, lavaggio, imballaggio…). */
export function faseMacroDi(codice: string, gruppo: string | null | undefined): FaseMacro | null {
  const g = String(gruppo ?? '').toUpperCase();
  if (g === 'GESTIONE MATERIALE') return 'estrazione';
  if (g === 'SMD') return /bot$/i.test(codice) ? 'smd_bot' : 'smd_top';
  if (g === 'THT') return 'tht';
  const per: Record<string, FaseMacro> = { montaggioMeccanico: 'meccanico', conformalCoating: 'coating', test: 'collaudo', etichettatura: 'etichettatura' };
  return per[codice] ?? null;
}

/**
 * Fasi previste per la scheda: dalle fasi della commessa (quelle con un tempo previsto), altrimenti dalle spunte e dai tempi del preventivo.
 * Le fasi SMD "di servizio" (AOI, riparazione) contano come SMD TOP.
 */
export function fasiPreviste(fasiCommessa: { codice: string; gruppo?: string | null; cicloSec?: number }[] | null | undefined, parametri: Record<string, unknown> | null | undefined): FaseMacro[] {
  const trovate = new Set<FaseMacro>();
  if (fasiCommessa?.length) {
    for (const f of fasiCommessa) { if (!(Number(f.cicloSec ?? 1) > 0)) continue; const m = faseMacroDi(f.codice, f.gruppo); if (m) trovate.add(m); }
    if (!si(parametri, 'doppiaFaccia')) trovate.delete('smd_bot');
  } else if (parametri) {
    trovate.add('estrazione');
    if (Number(parametri.qtSmd ?? 0) > 0 || si(parametri, 'doppiaFaccia')) trovate.add('smd_top');
    if (si(parametri, 'doppiaFaccia')) trovate.add('smd_bot');
    if (si(parametri, 'usaOnda') || si(parametri, 'presenteTht') || Number(parametri.qtTht ?? 0) > 0) trovate.add('tht');
    if (si(parametri, 'componentiMeccanici')) trovate.add('meccanico');
    if (si(parametri, 'collaudo')) trovate.add('collaudo');
    if (si(parametri, 'tropicalizzazione')) trovate.add('coating');
    if (si(parametri, 'etichette')) trovate.add('etichettatura');
  }
  return ORDINE_FASI.filter(f => trovate.has(f));
}

// ───────────────────────────── valutazione di una riga ─────────────────────────────

export interface FineLavorazione { quantita: number; da: string; il: string; origine?: string; nota?: string }
export interface DdtRiga { id: number; numero: number | null; sezionale?: string | null; data: string; quantita: number; partitoIl: string | null; stato: string }

export interface RigaFlusso {
  id: number;
  quantita: number;            // schede ordinate
  quantitaSpedita: number;     // partite con DDT (tutti: anche in attesa di corriere)
  residuoQuantita: number;
  stato: string;               // stato della riga d'ordine
  consegnaRichiesta?: string | null;
  dataOrdine?: string | null;
  parametri?: Record<string, unknown> | null;
  righeOrdine?: { codice?: string | null; descrizione?: string | null }[];   // le altre righe dello stesso ordine (per gli acquisti)
  commessa?: { id: number; numero: string; stato: string; quantita: number; fineLavorazione: FineLavorazione[]; fasi: { codice: string; gruppo?: string | null; cicloSec?: number }[]; fasiConTempi: string[] } | null;
  ddt?: DdtRiga[];             // DDT del portale di questa riga o della sua commessa (emessi, non annullati)
  giaPartiti?: { documento: string; quantita: number }[];   // DDT già contati nelle partite (anche storico FIC abbinato per codice): si mostrano in "Da spedire"
  flusso: StatoFlusso;
}

export interface VoceMateriale { fase: FaseMacro; nome: string; nota: string; manca: boolean; firma: Firma | null }
export interface VoceProduzione { fase: FaseMacro; nome: string; firma: Firma | null; auto: boolean }

export interface Valutazione {
  acquisti: { voce: VoceAcquisto; firma: Firma | null }[];
  acquistiFatti: boolean;
  materiale: VoceMateriale[];
  materialePronto: boolean;
  produzione: VoceProduzione[];
  inProduzione: boolean;
  finite: number;              // schede dichiarate finite (fine lavorazione), al massimo la quantità
  inAttesaCorriere: number;    // schede su DDT emessi non ancora partiti
  partite: number;             // schede partite davvero
  pronte: number;              // finite e non ancora su un DDT
  finestre: Finestra[];
}

const somma = (v: number[]) => v.reduce((a, x) => a + x, 0);
const dentro = (v: number, max: number) => Math.max(0, Math.min(v, max));

export function valutaRiga(r: RigaFlusso): Valutazione {
  const f = r.flusso;
  const voci = cosaAcquistare(r.parametri, r.righeOrdine ?? []);
  const acquisti = voci.map(voce => ({ voce, firma: f.acquisti[voce.chiave] ?? null }));
  const acquistiFatti = acquisti.every(a => a.firma);
  const comprato = (k: string) => !voci.some(v => v.chiave === k) || !!f.acquisti[k];
  const nostri = { componenti: voci.some(v => v.chiave === 'componenti'), pcb: voci.some(v => v.chiave === 'pcb'), lamina: voci.some(v => v.chiave === 'lamina') };
  const fonte = (k: 'componenti' | 'pcb' | 'lamina', nome: string) => (nostri[k] ? `${nome} ${comprato(k) ? 'acquistati' : 'da acquistare'}` : `${nome} dal cliente`);

  const fasi = fasiPreviste(r.commessa?.fasi, r.parametri);
  const materiale: VoceMateriale[] = fasi.filter(x => x !== 'estrazione' && x !== 'collaudo' && x !== 'smd_bot').map(fase => {
    const nome = fase === 'smd_top' ? (fasi.includes('smd_bot') ? 'SMD TOP+BOT' : 'SMD') : NOMI_FASE[fase];
    const nota = fase === 'smd_top' ? [fonte('componenti', 'componenti'), fonte('pcb', 'PCB'), nostri.lamina ? fonte('lamina', 'lamine') : ''].filter(Boolean).join(', ')
      : fase === 'tht' ? [fonte('componenti', 'componenti THT'), nostri.componenti ? '' : ''].filter(Boolean).join(', ')
      : fase === 'meccanico' ? 'altro materiale (viti, dissipatori, parti meccaniche)'
      : fase === 'coating' ? 'resina / vernice protettiva'
      : fase === 'etichettatura' ? (si(r.parametri, 'costoEtichetta') ? 'etichette nostre' : 'etichette (del cliente o nostre)') : '';
    const manca = (fase === 'smd_top' && (!comprato('componenti') || !comprato('pcb') || !comprato('lamina'))) || (fase === 'tht' && !comprato('componenti'));
    return { fase, nome, nota, manca, firma: f.materiale[fase] ?? null };
  });
  const materialePronto = materiale.length > 0 && materiale.every(m => m.firma);

  const conTempi = new Set((r.commessa?.fasiConTempi ?? []).map(c => faseMacroDi(c, r.commessa?.fasi.find(x => x.codice === c)?.gruppo)));
  const produzione: VoceProduzione[] = fasi.map(fase => ({ fase, nome: NOMI_FASE[fase], firma: f.produzione[fase] ?? null, auto: conTempi.has(fase) }));

  const commessaChiusa = !!r.commessa && ['rientrata', 'analizzata', 'chiusa'].includes(r.commessa.stato);
  const inProduzione = !!f.inProduzione || materialePronto || r.commessa?.stato === 'in_produzione' || commessaChiusa || (r.commessa?.fasiConTempi.length ?? 0) > 0;
  const dichiarate = somma((r.commessa?.fineLavorazione ?? []).map(x => Number(x.quantita) || 0));
  const finite = dentro(commessaChiusa && !dichiarate ? r.quantita : dichiarate, r.quantita);
  const inAttesaCorriere = somma((r.ddt ?? []).filter(d => !d.partitoIl && d.stato !== 'annullato').map(d => d.quantita));
  const partite = Math.max(0, r.quantitaSpedita - inAttesaCorriere);
  const pronte = Math.max(0, finite - r.quantitaSpedita);
  const aperta = r.stato === 'da_evadere' || r.stato === 'parziale';

  const finestre: Finestra[] = [];
  if (aperta && acquisti.length && !acquistiFatti) finestre.push('acquistare');
  if (aperta && !inProduzione) finestre.push('preparare');
  if (aperta && inProduzione && finite < r.quantita - 0.01) finestre.push('produzione');
  if (pronte > 0 || inAttesaCorriere > 0) finestre.push('spedire');
  return { acquisti, acquistiFatti, materiale, materialePronto, produzione, inProduzione, finite, inAttesaCorriere, partite, pronte, finestre };
}

// ───────────────────────────── priorità ─────────────────────────────

export interface PerPriorita { id: number; consegna?: string | null; dataOrdine?: string | null; numero?: number; priorita?: number | null }

/**
 * Ordine di priorità: automatico dalla consegna richiesta (le righe senza data in fondo), poi data dell'ordine e numero;
 * le righe con un numero scritto a mano si mettono in quella posizione (1 = prima), nell'ordine dei numeri.
 */
export function ordinaPerPriorita<T extends PerPriorita>(righe: T[]): (T & { posizione: number })[] {
  const auto = [...righe].sort((a, b) => (a.consegna ?? '9999').localeCompare(b.consegna ?? '9999') || (a.dataOrdine ?? '9999').localeCompare(b.dataOrdine ?? '9999') || (a.numero ?? 0) - (b.numero ?? 0) || a.id - b.id);
  const manuali = auto.filter(r => r.priorita != null).sort((a, b) => a.priorita! - b.priorita! || a.id - b.id);
  const out = auto.filter(r => r.priorita == null);
  for (const m of manuali) out.splice(Math.min(out.length, m.priorita! - 1), 0, m);
  return out.map((r, i) => ({ ...r, posizione: i + 1 }));
}

/** Nuova priorità scritta a mano dopo "su" / "giù" / un numero / "auto" (null). */
export function nuovaPriorita(azione: string, posizione: number, numero?: unknown, totale = Infinity): number | null {
  if (azione === 'auto') return null;
  if (azione === 'su') return Math.max(1, posizione - 1);
  if (azione === 'giu') return Math.min(totale, posizione + 1);
  const n = Number(numero);
  return Number.isInteger(n) && n > 0 ? n : posizione;
}

// ───────────────────────────── fine lavorazione ─────────────────────────────

/** Aggiunge una dichiarazione di fine lavorazione; "totale" = tutte le schede che mancano. Errore se la quantità non è valida. */
export function aggiungiFineLavorazione(prec: FineLavorazione[], quantitaScritta: unknown, totale: boolean, quantitaCommessa: number, chi: string, adesso: string, origine: string, nota = ''): { righe: FineLavorazione[]; errore?: string } {
  const gia = somma(prec.map(x => Number(x.quantita) || 0));
  const resto = Math.max(0, quantitaCommessa - gia);
  const n = totale ? resto : Math.floor(Number(String(quantitaScritta ?? '').replace(',', '.')));
  if (!(n > 0)) return { righe: prec, errore: totale ? 'Tutte le schede della commessa sono già dichiarate finite.' : 'Scrivi quante schede sono finite (un numero maggiore di zero).' };
  if (n > resto) return { righe: prec, errore: `Ne restano ${resto} da finire (${gia} già dichiarate su ${quantitaCommessa}).` };
  return { righe: [...prec, { quantita: n, da: chi, il: adesso, origine, nota }] };
}

export const leggiFineLavorazione = (x: unknown): FineLavorazione[] =>
  (Array.isArray(x) ? x : []).filter(v => v && typeof v === 'object' && Number(v.quantita) > 0)
    .map(v => ({ quantita: Number(v.quantita), da: String(v.da ?? ''), il: String(v.il ?? ''), origine: v.origine ? String(v.origine) : undefined, nota: v.nota ? String(v.nota) : undefined }));

/** Letto dalla scheda scansionata: "schede" scritte nel riquadro FINE LAVORAZIONE (o la casella TOTALE), senza doppioni. */
export function fineLavorazioneDaScansione(letto: { schede?: unknown; totale?: unknown; data?: unknown } | null | undefined, prec: FineLavorazione[], quantitaCommessa: number, adesso: string): { righe: FineLavorazione[]; aggiunta: number } {
  if (!letto) return { righe: prec, aggiunta: 0 };
  const totale = letto.totale === true || /^(s[iì]|x|v|totale|true)$/i.test(String(letto.totale ?? '').trim());
  const n = Number(String(letto.schede ?? '').replace(/[^\d]/g, ''));
  if (!totale && !(n > 0)) return { righe: prec, aggiunta: 0 };
  const nota = letto.data ? `scheda del ${String(letto.data)}` : 'scheda scansionata';
  if (prec.some(p => p.origine === 'scansione' && p.nota === nota && (totale || p.quantita === n))) return { righe: prec, aggiunta: 0 };
  const esito = aggiungiFineLavorazione(prec, n, totale, quantitaCommessa, 'scheda scansionata', adesso, 'scansione', nota);
  return esito.errore ? { righe: prec, aggiunta: 0 } : { righe: esito.righe, aggiunta: esito.righe[esito.righe.length - 1].quantita };
}

/** Data e ora leggibili per le firme ("6/11/2026 14:30"). */
export const quandoFirma = (f: Firma | null | undefined) => {
  if (!f) return '';
  const d = new Date(f.il);
  const quando = Number.isNaN(d.getTime()) ? f.il : d.toLocaleString('it-IT', { timeZone: 'Europe/Rome', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
  return `${f.da} ${quando}`;
};
