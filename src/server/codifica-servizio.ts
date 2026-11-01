/**
 * Codifica dei componenti e preventivo materiali dalla BOM.
 * Per ogni riga (come il programma "Codifica componenti", core/bom.py, più distributori e IA):
 *  1. P/N già nell'archivio componenti → codici esistenti;
 *  2. altrimenti dati dal P/N (decodifica delle serie note), da DigiKey, dalle colonne della BOM e, se manca ancora
 *     qualcosa, dalla lettura con l'IA; regole d'acquisto (resistenze solo 1%); codici calcolati con le regole;
 *     una riga senza P/N che dà un codice di produzione già in archivio riprende i codici esistenti;
 *  3. prezzi e disponibilità dai distributori; per i passivi senza P/N si cerca il più economico con gli stessi dati;
 *  4. quantità da acquistare con lo scarto, fornitore migliore, componenti difficili da trovare;
 *  5. P/N non trovato da nessun distributore: alternative con le stesse caratteristiche (stesso codice di produzione) o varianti
 *     dello stesso P/N, più quelle scritte a mano; le sceglie l'operatore (Adriano, 28/10/2026).
 * L'elaborazione gira in background: la pagina segue l'avanzamento.
 */
import { gunzipSync } from 'node:zlib';
import ExcelJS from 'exceljs';
import { q, q1, transazione } from './db.js';
import { ATTR, ETICHETTE, FAMIGLIE, MAN, OK, VER, calcola, progNum, progStr, type Attributi } from '../engine/codifica/regole.js';
import { daColonneBom, decodificaMpn, famigliaDa } from '../engine/codifica/decoder.js';
import { candidatiPn, differenzeBomCodice, notaDueCodici, quotaPn, scegliCandidato, type CandidatoPn, type ColonnaPn } from '../engine/codifica/candidati-pn.js';
import { daDigikey } from '../engine/codifica/digikey-dati.js';
import { ETICHETTE_RUOLI, NOTA_DA_VALIDARE, completo, pulisciRigheBom, rigaPcb, regolaCondensatori, leggiBomColonneFisse, leggiCsv, nomiColonne, pnKey, quantitaRiga, regolaResistenze, rigaIntestazione, rilevaColonne, type Ruolo } from '../engine/codifica/bom.js';
import { NOMI_FORNITORI, leggiRegoleScarto, pezziScarto, prezzoUnitario, reperibilita, sceltaMigliore, type Fornitore, type Offerta, type Reperibilita, type RegoleScarto } from '../engine/acquisti.js';
import { cercaPn, cercaVarianti, digikeyParametri, digikeySostituti, fornitoriConfigurati, memorizza, mouserParametri, type RisultatoFornitore } from './fornitori.js';
import { iaConfigurata, leggiConIa, proponiCompatibiliIa } from './lettura-ia.js';

export const ESITI = {
  DB: 'IN DATABASE', DB_INC: 'IN DATABASE - DA COMPLETARE', DB_FATTO: 'IN DATABASE - COMPLETATO', DB_PROD: 'IN DATABASE (stesso codice)',
  NUOVO: 'NUOVO', NUOVO_VER: 'NUOVO - DA VERIFICARE', INC: 'DA COMPLETARE', NON_MONTATO: 'NON MONTATO', CLIENTE: 'FORNITO DAL CLIENTE',
} as const;
export type Esito = typeof ESITI[keyof typeof ESITI];

export interface AcquistoRiga {
  schede: number; netta: number; scarto: number; regolaScarto: string; lorda: number;
  scelta?: { fornitore: Fornitore | typeof PREZZO_A_MANO; codice: string; mpn: string; qta: number; prezzo: number; totale: number; nota?: string; disponibile: boolean; url?: string | null };
}
export interface RigaBom {
  n: number; pn: string | null; produttore: string | null; designatori: string | null; valore: string | null; footprint: string | null; descrizioneBom: string | null;
  qtaScheda: number; esito: Esito; famiglia: string | null; attributi: Attributi;
  codiceProduzione: string | null; codiceGestionale: string | null; descrizione: string | null;
  fonti: string[]; note: string[]; dbId?: number | null; prodDb?: string | null;
  mpnAcquisto?: string | null; offerte: Offerta[]; acquisti: AcquistoRiga[]; reperibilita?: Reperibilita; clienteFornisce?: boolean;
  /** distributori collegati che per questo P/N non hanno risposto (errore, limite di richieste) */
  nonControllati?: Fornitore[];
  /** alternative al P/N della BOM e quella scelta dall'operatore (si compra quella al posto del P/N) */
  alternative?: Alternativa[]; alternativaScelta?: string | null;
  /** compatibile scelto dal portale per dare il prezzo quando il P/N non si trova: DA VERIFICARE finché l'operatore non lo conferma (1/11/2026) */
  alternativaProposta?: string | null;
  /** prezzo €/pz scritto dall'operatore: vale al posto di quello dei distributori (Adriano 28/10/2026) */
  prezzoManuale?: number | null;
}

export const PREZZO_A_MANO = 'manuale' as const;
/** Nome da mostrare per chi vende: distributore o prezzo scritto a mano. */
export const nomeFornitore = (f: Fornitore | typeof PREZZO_A_MANO) => f === PREZZO_A_MANO ? 'prezzo a mano' : NOMI_FORNITORI[f];

export const FONTI_ALTERNATIVA = { STESSE: 'stesse caratteristiche', VARIANTE: 'variante dello stesso P/N', MANO: 'scritta a mano',
  SOSTITUTO: 'sostituto indicato da DigiKey', IA: 'proposta dall\'IA (pin-to-pin)' } as const;
export interface Alternativa {
  mpn: string; produttore: string; descrizione: string;
  fonte: typeof FONTI_ALTERNATIVA[keyof typeof FONTI_ALTERNATIVA];
  /** stesse caratteristiche controllate con il codice di produzione: true sì, false no, null da controllare a mano */
  identica: boolean | null;
  offerte: Offerta[];
  /** come è stata trovata, in parole (tipo di sostituto DigiKey, motivo dell'IA) */
  nota?: string;
  /** sostituto DigiKey "diretto" (Direct, Parametric Equivalent, MFG Recommended): compatibile al 100% in teoria */
  diretto?: boolean;
}

// ───────────────────────────── lettura del file ─────────────────────────────
/** Righe di testo da un file xlsx o csv. */
export async function leggiFileBom(nome: string, contenuto: Buffer): Promise<string[][]> {
  const n = nome.toLowerCase();
  if (n.endsWith('.csv') || n.endsWith('.txt')) {
    const testo = contenuto.toString('utf8').replace(/^﻿/, '');
    const fisse = n.endsWith('.txt') ? leggiBomColonneFisse(testo) : null;
    if (fisse) return fisse;
    const sep = (testo.match(/;/g)?.length ?? 0) > (testo.match(/,/g)?.length ?? 0) ? ';' : (testo.includes('\t') && !testo.includes(',') ? '\t' : ',');
    return leggiCsv(testo, sep);
  }
  if (n.endsWith('.xls')) throw new Error('File .xls (Excel 97-2003): salvalo come .xlsx o .csv e ricaricalo.');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(contenuto as any);
  const ws = wb.worksheets.find(w => w.actualRowCount > 0) ?? wb.worksheets[0];
  if (!ws) return [];
  const out: string[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, i) => {
    const celle: string[] = [];
    for (let c = 1; c <= ws.actualColumnCount; c++) celle.push(testoCella(row.getCell(c).value));
    out[i - 1] = celle;
  });
  return Array.from(out, r => r ?? []);
}
function testoCella(v: any): string {
  if (v == null) return '';
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((x: any) => x.text).join('');
    if ('result' in v) return testoCella(v.result);
    if ('text' in v) return String(v.text);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
  }
  return String(v).trim();
}
/** Nuova analisi: intestazione e colonne riconosciute da sole (correggibili dalla pagina). */
export async function creaAnalisi(opz: { nome: string; fileNome: string; righe: string[][]; quantita: number[]; utenteId: number }): Promise<number> {
  const h = rigaIntestazione(opz.righe);
  const colonne = nomiColonne(opz.righe[h] ?? []);
  const tutte = opz.righe.slice(h + 1).map((r, i) => ({ n: h + 2 + i, celle: r })).filter(r => r.celle.some(c => String(c ?? '').trim()));
  // intestazioni ripetute e righe di solo testo non sono componenti (Adriano Croci, 27/10/2026)
  const { tenute: dati } = pulisciRigheBom(opz.righe[h] ?? [], tutte);
  const mappatura = rilevaColonne(colonne, dati.map(r => r.celle.map(c => String(c ?? ''))));
  const r = await q1<{ id: number }>(`INSERT INTO bom_analisi (nome, file_nome, quantita, colonne, mappatura, righe_file, creato_da)
    VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [opz.nome, opz.fileNome, opz.quantita, JSON.stringify(colonne), JSON.stringify(mappatura), JSON.stringify(dati), opz.utenteId]);
  return r!.id;
}

// ───────────────────────────── archivio componenti ─────────────────────────────
interface Componente { id: number; pn: string | null; pn_key: string | null; famiglia: string | null; codice_produzione: string | null; codice_gestionale: string | null;
  descrizione: string | null; attributi: Attributi; fonte: string | null; note: string | null; produttore: string | null; stato: string | null;
  // ultimo acquisto (migrazione 051, ordini a fornitore di FIC)
  prezzo_acquisto?: number | null; prezzo_fornitore?: string | null; prezzo_quantita?: number | null; prezzo_data?: string | null; prezzo_nota?: string | null; prezzo_fonte?: string | null }

const perPn = async (chiavi: string[]) => chiavi.length ? q<Componente>(`SELECT * FROM componenti WHERE pn_key = ANY($1) ORDER BY id`, [chiavi]) : [];
const perProduzione = async (codici: string[]) => codici.length ? q<Componente>(`SELECT * FROM componenti WHERE upper(codice_produzione) = ANY($1) ORDER BY id`, [codici.map(c => c.toUpperCase())]) : [];

/** Primo progressivo libero della radice (anche considerando quelli già assegnati in questa BOM). */
export async function prossimoProgressivo(radice: string, riservati: Set<string> = new Set()): Promise<string> {
  const usati = new Set((await q<{ c: string }>(`SELECT codice_gestionale AS c FROM componenti WHERE codice_gestionale LIKE $1`, [radice.replace(/[%_]/g, '\\$&') + '-___']))
    .map(r => progNum(r.c.slice(-3))));
  for (const p of riservati) usati.add(progNum(p));
  let n = 1;
  while (usati.has(n)) n++;
  return progStr(n);
}

export const conteggiComponenti = async () => (await q1<{ totale: number; gestionale: number; pn: number }>(`SELECT count(*)::int AS totale,
  count(codice_gestionale)::int AS gestionale, count(DISTINCT pn_key)::int AS pn FROM componenti`))!;

export function cercaComponenti(testo: string, limite = 200) {
  const t = `%${testo.trim().toUpperCase()}%`, k = `%${pnKey(testo) ?? '@@'}%`;
  // nei codici trattini e punti non contano: "rs0603" trova RS-0603-2K2-1-100MW
  const c = testo.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return q<Componente & { aggiornato_il: Date }>(`SELECT * FROM componenti WHERE pn_key LIKE $1 OR upper(codice_produzione) LIKE $2
    OR upper(codice_gestionale) LIKE $2 OR upper(descrizione) LIKE $2
    OR ($4 <> '' AND (regexp_replace(upper(codice_produzione), '[^A-Z0-9]', '', 'g') LIKE '%' || $4 || '%'
      OR regexp_replace(upper(codice_gestionale), '[^A-Z0-9]', '', 'g') LIKE '%' || $4 || '%'))
    ORDER BY codice_gestionale NULLS LAST, id LIMIT $3`, [k, t, limite, c]);
}

/** Import dal programma "Codifica componenti" (componenti.db convertito in JSON, gz o no). Salta i P/N/codici già presenti. */
export async function importaComponenti(contenuto: Buffer): Promise<{ importati: number; saltati: number }> {
  const testo = contenuto[0] === 0x1f && contenuto[1] === 0x8b ? gunzipSync(contenuto).toString('utf8') : contenuto.toString('utf8');
  const dati = JSON.parse(testo);
  const righe: any[] = Array.isArray(dati) ? dati : dati.componenti ?? [];
  let importati = 0, saltati = 0;
  await transazione(async c => {
    const esistenti = new Set((await c.query(`SELECT coalesce(pn_key,'') || '|' || coalesce(upper(codice_produzione),'') || '|' || coalesce(codice_gestionale,'') AS k FROM componenti`)).rows.map((r: any) => r.k));
    for (const r of righe) {
      const k = `${pnKey(r.pn) ?? ''}|${String(r.codice_produzione ?? '').toUpperCase()}|${r.codice_gestionale ?? ''}`;
      if (esistenti.has(k) || (!r.pn && !r.codice_produzione)) { saltati++; continue; }
      esistenti.add(k);
      let attributi = r.attributi;
      if (typeof attributi === 'string') { try { attributi = JSON.parse(attributi); } catch { attributi = {}; } }
      await c.query(`INSERT INTO componenti (pn, pn_key, produttore, famiglia, codice_produzione, codice_gestionale, descrizione, attributi, stato, fonte, note)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [r.pn ?? null, pnKey(r.pn), r.produttore ?? null, r.famiglia ?? null, r.codice_produzione ?? null,
        r.codice_gestionale ?? null, r.descrizione ?? null, JSON.stringify(attributi ?? {}), r.stato ?? null, r.fonte ?? 'import', r.note ?? null]);
      importati++;
    }
  });
  return { importati, saltati };
}

// ───────────────────────────── elaborazione ─────────────────────────────
export interface Avanzamento { fase: string; fatti: number; totale: number }
export const avanzamenti = new Map<number, Avanzamento>();

export async function caricaRegoleScarto(): Promise<RegoleScarto> {
  return leggiRegoleScarto((await q1<{ valore: any }>(`SELECT valore FROM impostazioni WHERE chiave = 'regole_scarto'`))?.valore);
}

const NON_MONTARE = /\b(DNP|DNM|DNI|NM|N\.M\.|NOT\s+(MOUNTED|FITTED|POPULATED|PLACED)|NON\s+MONTA(RE|TO))\b/i;
/** Righe che non sono componenti da acquistare (fiducial, fori di fissaggio, loghi). */
const NON_COMPONENTE = /\b(FIDUCIAL|FIDUCIALE|MOUNTING\s*HOLE|FORO\s+DI\s+FISSAGGIO|LOGO)\b|^FID\d|TESTPOINT_PAD/i;
/** Cella di una colonna DNP / "Exclude from BOM" (KiCad) che toglie la riga dagli acquisti. */
const CELLA_ESCLUSA = /^(DNP|DNM|DNI|NM|EXCLUDED FROM BOM|NON MONTARE|NON MONTATO)$/i;
const unico = <T>(xs: T[]) => [...new Set(xs)];

/** Elabora (o rielabora) una BOM in background. */
export function avviaElaborazione(id: number, opz: { forzaPrezzi?: boolean } = {}) {
  if (avanzamenti.has(id)) return;
  avanzamenti.set(id, { fase: 'avvio', fatti: 0, totale: 0 });
  void (async () => {
    try {
      await q(`UPDATE bom_analisi SET stato = 'in_corso', messaggio = NULL, aggiornato_il = now() WHERE id = $1`, [id]);
      const messaggio = await elabora(id, opz);
      await q(`UPDATE bom_analisi SET stato = 'pronta', messaggio = $2, aggiornato_il = now() WHERE id = $1`, [id, messaggio || null]);
    } catch (e: any) {
      console.error('Elaborazione BOM', id, e);
      await q(`UPDATE bom_analisi SET stato = 'errore', messaggio = $2, aggiornato_il = now() WHERE id = $1`, [id, String(e?.message ?? e).slice(0, 500)]).catch(() => {});
    } finally { avanzamenti.delete(id); }
  })();
}

/** Analisi rimaste "in corso" da un riavvio del portale. */
export async function sistemaInterrotte() {
  await q(`UPDATE bom_analisi SET stato = 'errore', messaggio = 'elaborazione interrotta dal riavvio del portale: premi Rielabora' WHERE stato = 'in_corso'`);
}

async function elabora(id: number, opz: { forzaPrezzi?: boolean }): Promise<string> {
  const a = await q1<any>(`SELECT * FROM bom_analisi WHERE id = $1`, [id]);
  if (!a) throw new Error('analisi non trovata');
  const av = avanzamenti.get(id)!;
  const map: Partial<Record<Ruolo, string>> = a.mappatura ?? {};
  const colonne: string[] = a.colonne ?? [];
  const precedenti = new Map<number, RigaBom>((a.righe ?? []).map((r: RigaBom) => [r.n, r]));
  const val = (celle: string[], ruolo: Ruolo) => {
    const c = map[ruolo]; if (!c) return null;
    const v = String(celle[colonne.indexOf(c)] ?? '').trim();
    return v && v.toLowerCase() !== 'nan' ? v : null;
  };
  // 1. righe di base
  const righeFile = a.righe_file as { n: number; celle: string[] }[];
  // senza P/N: il codice si cerca in Valore e Descrizione, prima nella colonna che ne contiene di più (Adriano 29/10/2026)
  const ordinePn = (['descrizione', 'valore'] as ColonnaPn[])
    .map(c => ({ c, q: quotaPn(righeFile.map(r => val(r.celle, c))) })).sort((x, y) => y.q - x.q).map(x => x.c);
  const righe: RigaBom[] = righeFile.map(({ n, celle }) => {
    const qt = quantitaRiga(val(celle, 'quantita'), val(celle, 'designatori'));
    const r: RigaBom = { n, pn: val(celle, 'pn'), produttore: val(celle, 'produttore'), designatori: val(celle, 'designatori'), valore: val(celle, 'valore'),
      footprint: val(celle, 'footprint'), descrizioneBom: val(celle, 'descrizione'), qtaScheda: qt.qta, esito: ESITI.INC, famiglia: null, attributi: {},
      codiceProduzione: null, codiceGestionale: null, descrizione: null, fonti: [], note: qt.nota ? [qt.nota] : [], offerte: [], acquisti: [],
      clienteFornisce: precedenti.get(n)?.clienteFornisce };
    // le alternative scritte a mano e quella scelta restano anche dopo "Rielabora" (se il P/N della riga è lo stesso)
    const candidati = r.pn ? [] : candidatiPn({ valore: r.valore, descrizione: r.descrizioneBom }, ordinePn);
    const prima = precedenti.get(n);
    if (prima && (pnKey(prima.pn) === pnKey(r.pn) || (!r.pn && candidati.some(c => pnKey(c.pn) === pnKey(prima.pn))))) {
      r.alternative = (prima.alternative ?? []).filter(x => x.fonte === FONTI_ALTERNATIVA.MANO || x.mpn === prima.alternativaScelta);
      r.alternativaScelta = prima.alternativaScelta ?? null;
      r.prezzoManuale = prima.prezzoManuale ?? null;
    }
    (r as any)._fam = val(celle, 'famiglia');
    (r as any)._candidati = candidati;
    (r as any)._escluso = celle.some(c => CELLA_ESCLUSA.test(String(c ?? '').trim()));
    return r;
  });
  av.totale = righe.length;
  // 2. archivio
  av.fase = 'archivio componenti';
  const inArchivio = new Map<string, Componente[]>();
  for (const c of await perPn(unico(righe.map(r => pnKey(r.pn)).filter((k): k is string => !!k)))) inArchivio.set(c.pn_key!, [...(inArchivio.get(c.pn_key!) ?? []), c]);
  // 3. distributori (servono anche i dati tecnici DigiKey per la codifica)
  av.fase = 'prezzi e disponibilità dai distributori'; av.fatti = 0;
  const daCercare = righe.filter(r => !(r as any)._escluso && !rigaPcb(r) && !NON_MONTARE.test(`${r.valore ?? ''} ${r.descrizioneBom ?? ''}`))
    .flatMap(r => r.pn ? [r.pn] : ((r as any)._candidati as CandidatoPn[]).map(c => c.pn));
  const ricerca = await cercaPn(unico(daCercare), { forza: opz.forzaPrezzi, avanzamento: f => { av.fatti = Math.min(f, av.totale); } });
  const dist = (pn: string | null) => (pn ? ricerca.perPn.get(pnKey(pn)!) : undefined) ?? {};
  // codici trovati in Valore / Descrizione: si compra quello che i distributori hanno (anche se costa di più)
  const maxSchede = Math.max(1, ...(a.quantita ?? []));
  for (const r of righe) {
    const cand = (r as any)._candidati as CandidatoPn[];
    if (r.pn || !cand.length) continue;
    const s = scegliCandidato(cand, pn => Object.values(dist(pn)).flatMap(x => x?.offerte ?? []), Math.ceil(r.qtaScheda * maxSchede))!;
    r.pn = s.scelto.pn;
    r.fonti.push(`P/N dalla colonna ${s.scelto.da === 'valore' ? 'Valore' : 'Descrizione'}`);
    const nota = notaDueCodici(cand, s.scelto, s);
    if (nota) r.note.push(nota);
  }
  // 4. codifica
  av.fase = 'codifica'; av.fatti = 0;
  const daLeggereIa: RigaBom[] = [];
  for (const r of righe) {
    av.fatti++;
    if ((r as any)._escluso) { r.esito = ESITI.NON_MONTATO; r.note.push('escluso nella BOM (DNP / non in distinta)'); continue; }
    if (NON_MONTARE.test(`${r.valore ?? ''} ${r.descrizioneBom ?? ''} ${r.pn ?? ''}`)) { r.esito = ESITI.NON_MONTATO; r.note.push('componente da non montare'); continue; }
    if (rigaPcb(r)) { r.esito = ESITI.NON_MONTATO; r.note.push('circuito stampato (PCB): non è un componente, si quota a parte'); continue; }
    if (NON_COMPONENTE.test(`${r.valore ?? ''} ${r.descrizioneBom ?? ''} ${r.pn ?? ''} ${r.footprint ?? ''}`) || NON_COMPONENTE.test(r.designatori ?? '')) {
      r.esito = ESITI.NON_MONTATO; r.note.push('non è un componente da acquistare (fiducial, foro, logo)'); continue;
    }
    const [famDec, aDec] = decodificaMpn(r.pn);
    const famColonna = String((r as any)._fam ?? '').toUpperCase() || null;
    // senza colonna valore il valore si cerca nella descrizione (es. "RES 10K 1% 0402")
    const [famBom, aBom] = daColonneBom(famDec ?? famColonna, r.valore ?? r.descrizioneBom, r.footprint, r.descrizioneBom, r.designatori);
    // dati scritti nella BOM diversi da quelli del codice (es. BOM 168K, RC0805FR-07162KL = 162K): da validare
    if (famDec) {
      const diff = differenzeBomCodice(famDec, aBom, aDec);
      const gravi = diff.filter(d => !d.startsWith('tolleranza')), lievi = diff.filter(d => d.startsWith('tolleranza'));
      if (gravi.length) r.note.push(`${NOTA_DA_VALIDARE}: la BOM non corrisponde al codice ${r.pn}: ${gravi.join('; ')}`);
      if (lievi.length) r.note.push(`VERIFICA: ${lievi.join('; ')}`);
    }
    (r as any)._famDebole = !famDec && !famColonna && !famigliaDa(null, r.descrizioneBom ?? r.valore);
    const hits = r.pn ? inArchivio.get(pnKey(r.pn)!) ?? [] : [];
    if (hits.length) {
      const completi = hits.filter(h => h.codice_gestionale);
      const h = completi[0] ?? hits[0];
      Object.assign(r, { dbId: h.id, prodDb: h.codice_produzione, famiglia: h.famiglia, codiceProduzione: h.codice_produzione, codiceGestionale: h.codice_gestionale,
        descrizione: h.descrizione });
      r.fonti.push(`archivio (${h.fonte ?? ''})`);
      if (!r.produttore && h.produttore) r.produttore = h.produttore;
      const gest = unico(completi.map(x => x.codice_gestionale!));
      if (gest.length > 1) r.note.push(`nell'archivio ci sono ${gest.length} codici per questo P/N: ${gest.join(', ')}`);
      if (completi.length) {
        r.esito = ESITI.DB; r.attributi = { ...(h.attributi ?? {}) };
        if (famDec) { const c = calcola(famDec, aDec, r.pn); if (c.root && !h.codice_gestionale!.startsWith(c.root + '-')) r.note.push(`VERIFICA: dal P/N risulta ${c.root} (${c.descr})`); }
      } else {
        r.esito = ESITI.DB_INC; if (h.note) r.note.push(h.note);
        r.attributi = { ...aBom, ...aDec, ...(h.attributi ?? {}) };
        r.famiglia = h.famiglia || famDec || famBom;
      }
      continue;
    }
    // componente nuovo: dati da P/N, DigiKey, colonne
    let famDk: string | null = null, aDk: Attributi = {};
    const dk = dist(r.pn).digikey;
    if (dk?.prodotto && !(famDec && completo(famDec, aDec))) {
      const d = daDigikey(dk.prodotto);
      famDk = d.famiglia; aDk = d.attributi;
      if (!r.produttore && d.produttore) r.produttore = d.produttore;
      if (!famDk) r.note.push(`DigiKey: categoria non riconosciuta (${d.descrizione})`);
    } else if (r.pn && fornitoriConfigurati().digikey && dk && !dk.prodotto && !Object.values(dist(r.pn)).some(x => x?.offerte.length)) r.note.push('non trovato su DigiKey');
    const fam = famDec ?? famDk ?? famBom;
    if (famDk && famDk !== fam) aDk = {};
    r.famiglia = fam;
    r.attributi = { ...aBom, ...aDk, ...aDec };
    { const x = regolaResistenze(r.famiglia, r.attributi); r.attributi = x.attributi; r.note.push(...x.note); }
    if (famDec) r.fonti.push('decodifica P/N');
    if (Object.keys(aDk).length) r.fonti.push('DigiKey');
    if (Object.keys(aBom).length) r.fonti.push('colonne BOM');
    if (!fam || !completo(fam, r.attributi)) daLeggereIa.push(r);
  }
  // 5. lettura con l'IA delle righe ancora incomplete
  let notaIa = '';
  if (daLeggereIa.length && iaConfigurata()) {
    av.fase = `lettura con l'IA (${daLeggereIa.length} righe)`;
    try {
      const letture = await leggiConIa(daLeggereIa.map(r => {
        const off = Object.values(dist(r.pn)).flatMap(x => x?.offerte ?? [])[0];
        return { riga: r.n, dati: { 'P/N': r.pn ?? '', produttore: r.produttore ?? '', designatori: (r.designatori ?? '').slice(0, 60), valore: r.valore ?? '',
          footprint: r.footprint ?? '', descrizione: r.descrizioneBom ?? '', 'descrizione distributore': off?.descrizione ?? '' } };
      }));
      for (const r of daLeggereIa) {
        const l = letture.get(r.n);
        if (!l) continue;
        if (!l.famiglia && l.nota) { r.note.push(`IA: ${l.nota}`); continue; }
        if (!r.famiglia) r.famiglia = l.famiglia;
        if (l.famiglia && l.famiglia !== r.famiglia) {
          // famiglia presa solo dalla lettera del riferimento (D1 = diodo): vale quella dell'IA (es. diodo Schottky)
          if (!(r as any)._famDebole || !r.fonti.every(f => f === 'colonne BOM' || f.startsWith('P/N dalla'))) { r.note.push(`IA: secondo l'IA è ${l.famiglia}`); continue; }
          r.note.push(`famiglia ${l.famiglia} letta dall'IA (dal riferimento sembrava ${r.famiglia})`);
          r.famiglia = l.famiglia;
        }
        const prima = Object.keys(r.attributi).length;
        r.attributi = { ...l.attributi, ...r.attributi };
        if (Object.keys(r.attributi).length > prima || !r.fonti.length) r.fonti.push('lettura IA');
        if (l.nota) r.note.push(`IA: ${l.nota}`);
        const x = regolaResistenze(r.famiglia, r.attributi); r.attributi = x.attributi; r.note = unico([...r.note, ...x.note]);
      }
    } catch (e: any) { notaIa = `Lettura IA non riuscita: ${e.message}`; }
  } else if (daLeggereIa.length) notaIa = `${daLeggereIa.length} righe incomplete: con la chiave ANTHROPIC_API_KEY le leggerebbe l'IA`;
  // condensatori ceramici nuovi: valori standard dove mancano (codice da validare)
  for (const r of righe) {
    if (r.dbId || r.esito !== ESITI.INC) continue;
    const x = regolaCondensatori(r.famiglia, r.attributi); r.attributi = x.attributi; r.note = unico([...r.note, ...x.note]);
  }
  // 6. codici
  await ricalcola(righe);
  // 7. prezzi dei componenti senza P/N (passivi): il più economico con gli stessi dati
  av.fase = 'ricerca dei passivi senza P/N';
  await prezziGenerici(righe, ricerca.perPn);
  // 8. acquisti
  await calcolaAcquisti(righe, a.quantita ?? [], ricerca.perPn);
  // 9. P/N non trovati da nessuna parte: alternative da proporre all'operatore
  av.fase = 'ricerca delle alternative';
  await alternativeRighe(righe, opz.forzaPrezzi);
  await calcolaAcquisti(righe, a.quantita ?? []);
  const errori = Object.entries(ricerca.errori).map(([f, m]) => `${NOMI_FORNITORI[f as Fornitore]}: ${m}`);
  await salvaRighe(id, righe);
  return [notaIa, ...errori].filter(Boolean).join(' · ');
}

/** Codici delle righe non in archivio (dopo le modifiche a mano si richiama da sola). */
export async function ricalcola(righe: RigaBom[]) {
  const riservati = new Map<string, Set<string>>(), visti = new Map<string, RigaBom>();
  // righe senza P/N con lo stesso codice di produzione di un componente in archivio
  const calcoli = new Map<number, ReturnType<typeof calcola>>();
  for (const r of righe) if ([ESITI.INC, ESITI.NUOVO, ESITI.NUOVO_VER, ESITI.DB_INC, ESITI.DB_FATTO, ESITI.DB_PROD].includes(r.esito as any)) calcoli.set(r.n, calcola(r.famiglia, r.attributi, r.pn));
  const perProd = new Map<string, Componente[]>();
  for (const c of await perProduzione(unico([...calcoli.values()].map(c => c.prod).filter((x): x is string => !!x)))) {
    const k = c.codice_produzione!.toUpperCase(); perProd.set(k, [...(perProd.get(k) ?? []), c]);
  }
  for (const r of righe) {
    const c = calcoli.get(r.n);
    if (!c) continue;
    const k = pnKey(r.pn);
    const noteBase = r.note.filter(n => !/^(produzione:|codice di produzione già|P\/N ripetuto|tolleranza non indicata: X|valore arrotondato|tensione mancante|case |dimensione |induttanza in mm)/.test(n) && !c.note.includes(n));
    if (k && visti.has(k)) {
      const p = visti.get(k)!;
      Object.assign(r, { codiceProduzione: p.codiceProduzione, codiceGestionale: p.codiceGestionale, esito: p.esito, descrizione: p.descrizione });
      r.note = [`P/N ripetuto (riga ${p.n})`];
      continue;
    }
    if (k) visti.set(k, r);
    const note = [...noteBase, ...c.note];
    const inArchivio = r.esito === ESITI.DB_INC || r.esito === ESITI.DB_FATTO;
    const prod = inArchivio ? r.prodDb ?? null : c.prod ?? c.prodBozza ?? null;
    // senza P/N: se il codice di produzione è già in archivio si usano i suoi codici
    const stessi = !inArchivio && c.prod ? (perProd.get(c.prod.toUpperCase()) ?? []).filter(x => x.codice_gestionale) : [];
    if (!inArchivio && !r.pn && stessi.length) {
      const h = stessi.find(x => x.pn) ?? stessi[0];
      Object.assign(r, { esito: ESITI.DB_PROD, codiceProduzione: h.codice_produzione, codiceGestionale: h.codice_gestionale, descrizione: h.descrizione ?? c.descr,
        dbId: h.id, mpnAcquisto: h.pn ?? r.mpnAcquisto, attributi: c.attrs ?? r.attributi });
      r.note = unico([...note.filter(n => !n.startsWith('produzione:') && !n.startsWith('già in archivio')), `già in archivio${h.pn ? ` (P/N ${h.pn})` : ''}`]);
      continue;
    }
    let gest: string | null = null;
    if (c.root) {
      const ris = riservati.get(c.root) ?? new Set<string>();
      const p = await prossimoProgressivo(c.root, ris);
      ris.add(p); riservati.set(c.root, ris);
      gest = `${c.root}-${p}`;
    }
    if (!inArchivio && c.prod) {
      const altri = (perProd.get(c.prod.toUpperCase()) ?? []).filter(h => pnKey(h.pn) !== k);
      if (altri.length && r.pn) note.push('codice di produzione già usato da P/N ' + unico(altri.map(h => String(h.pn))).slice(0, 3).join(', '));
    }
    const completoRiga = !!gest && !!prod && (inArchivio || !!c.prod);
    r.esito = inArchivio ? (gest ? ESITI.DB_FATTO : ESITI.DB_INC)
      : completoRiga && c.stato !== MAN ? (c.stato === OK ? ESITI.NUOVO : ESITI.NUOVO_VER) : ESITI.INC;
    if (r.esito === ESITI.NUOVO && note.some(n => n.startsWith(NOTA_DA_VALIDARE))) r.esito = ESITI.NUOVO_VER;
    if (c.attrs) r.attributi = { ...c.attrs, tecnologia: c.T ?? r.attributi.tecnologia };
    r.codiceProduzione = prod; r.codiceGestionale = gest; r.descrizione = c.descr; r.note = unico(note);
  }
}

/** Parole per la ricerca dai distributori di un passivo senza P/N. */
function paroleRicerca(r: RigaBom): string | null {
  const a = r.attributi;
  if (!a.case || !a.valore) return null;
  if (r.famiglia === 'RS') return `RES ${a.valore.replace(/R$/, '').replace(/(\d)K(\d)/, '$1.$2K').replace(/(\d)M(\d)/, '$1.$2M')} OHM ${a.tolleranza ?? 1}% ${a.case}`;
  if (r.famiglia === 'CC') return `CAP CER ${a.valore.replace(/F$/, '').replace(/(\d)([PNU])(\d)/, '$1.$3$2')}F ${a.tensione ?? ''} ${a.dielettrico ?? ''} ${a.case}`.replace(/\s+/g, ' ');
  return null;
}

export async function prezziGenerici(righe: RigaBom[], perPnDist: Map<string, Partial<Record<Fornitore, RisultatoFornitore>>>) {
  const attivi = fornitoriConfigurati();
  for (const r of righe) {
    if (r.pn || r.clienteFornisce || ![ESITI.NUOVO, ESITI.NUOVO_VER, ESITI.DB_PROD].includes(r.esito as any)) continue;
    // in archivio con un P/N: si prezza quello
    if (r.mpnAcquisto) {
      const es = await cercaPn([r.mpnAcquisto]);
      perPnDist.set(pnKey(r.mpnAcquisto)!, es.perPn.get(pnKey(r.mpnAcquisto)!) ?? {});
      continue;
    }
    const parole = paroleRicerca(r);
    const radice = r.codiceGestionale?.slice(0, -4);
    if (!parole || !radice) continue;
    const stessaRadice = (fam: string | null, attr: Attributi, pn: string) => calcola(fam, regolaResistenze(fam, attr).attributi, pn).root === radice;
    try {
      if (attivi.digikey) {
        for (const x of await digikeyParametri(parole)) {
          const d = daDigikey(x.prodotto);
          if (d.famiglia === r.famiglia && stessaRadice(d.famiglia, d.attributi, x.prodotto.ManufacturerProductNumber ?? '') && x.offerte.length) {
            r.mpnAcquisto = x.prodotto.ManufacturerProductNumber!;
            await memorizza('digikey', r.mpnAcquisto, { offerte: x.offerte, prodotto: x.prodotto });
            break;
          }
        }
      }
      if (!r.mpnAcquisto && attivi.mouser) {
        const offerte = await mouserParametri(parole);
        for (const o of offerte) {
          const [fam, attr] = decodificaMpn(o.mpn);
          if (fam === r.famiglia && stessaRadice(fam, attr, o.mpn)) {
            r.mpnAcquisto = o.mpn;
            await memorizza('mouser', o.mpn, { offerte: offerte.filter(x => pnKey(x.mpn) === pnKey(o.mpn)) });
            break;
          }
        }
      }
    } catch (e: any) { r.note.push(`ricerca per parametri non riuscita: ${e.message}`); }
    if (r.mpnAcquisto) {
      r.note.push(`proposto ${r.mpnAcquisto} (il più economico con gli stessi dati)`);
      const es = await cercaPn([r.mpnAcquisto]);
      perPnDist.set(pnKey(r.mpnAcquisto)!, es.perPn.get(pnKey(r.mpnAcquisto)!) ?? {});
    } else if (parole) r.note.push('nessun P/N equivalente trovato dai distributori');
  }
}

// ───────────────────────────── alternative e compatibili ─────────────────────────────
const MAX_ALTERNATIVE = 6, MAX_RIGHE_ALTERNATIVE = 30;
/** Famiglie il cui codice di produzione dice tutte le caratteristiche (senza P/N dentro): lì "stesso codice" = componente identico. */
const SENZA_PN = (fam: string | null) => !!fam && !!FAMIGLIE[fam] && !FAMIGLIE[fam].prod.some(c => c === 'RID' || c === 'PN');

/** Stesso componente nelle caratteristiche? Confronta il codice di produzione calcolato (o la radice del gestionale). */
export function stesseCaratteristiche(r: Pick<RigaBom, 'famiglia' | 'codiceProduzione' | 'codiceGestionale'>, fam: string | null, attr: Attributi, mpn: string): boolean | null {
  if (!fam || !r.famiglia) return null;
  if (fam !== r.famiglia) return false;
  const c = calcola(fam, regolaResistenze(fam, attr).attributi, mpn);
  if (r.codiceProduzione && c.prod) return c.prod.toUpperCase() === r.codiceProduzione.toUpperCase();
  const radice = r.codiceGestionale?.slice(0, -4);
  if (radice && c.root) return c.root === radice;
  return null;
}

/** Parole per cercare dai distributori un componente con le stesse caratteristiche. */
function paroleAlternative(r: RigaBom): string | null {
  const p = paroleRicerca(r);
  if (p) return p;
  if (!SENZA_PN(r.famiglia) || !r.descrizione) return null;
  // la descrizione Casteltech finisce con il P/N: per cercare un equivalente il P/N non serve
  const k = pnKey(r.pn);
  return r.descrizione.split(/\s+/).filter(w => !k || pnKey(w) !== k).join(' ').trim() || null;
}

/** Sostituti DigiKey "al 100%" (in teoria): stesso componente o equivalente nei parametri; "Similar" e "Upgrade" restano solo da controllare. */
export const SOSTITUTO_DIRETTO = /DIRECT|PARAMETRIC EQUIVALENT|MFG RECOMMENDED|MANUFACTURER RECOMMENDED|DROP.?IN/i;

type Candidata = Omit<Alternativa, 'offerte'>;

/**
 * Candidati per una riga il cui P/N non si trova da nessuna parte (Adriano 28/10 e 1/11/2026), senza prezzi:
 *  1. varianti dello stesso P/N (confezione o suffisso diverso, es. -TR, /R7) cercate presso TUTTI i distributori con la ricerca per parola;
 *  2. sostituti indicati da DigiKey (funziona anche con i P/N obsoleti che DigiKey ha ancora in elenco);
 *  3. componenti con le stesse caratteristiche (stesso codice di produzione), cercati per parametri.
 */
async function candidateAlternative(r: RigaBom): Promise<Map<string, Candidata>> {
  const attivi = fornitoriConfigurati();
  const pn = r.pn ?? r.mpnAcquisto;
  const k = pnKey(pn);
  const candidate = new Map<string, Candidata>();
  const aggiungi = (a: Candidata) => {
    const ka = pnKey(a.mpn);
    if (!ka || ka === k || candidate.has(ka) || a.identica === false) return;
    candidate.set(ka, a);
  };
  if (pn && k && k.length >= 6) {
    // 1. varianti
    const v = await cercaVarianti(pn);
    for (const x of v.varianti.values()) aggiungi({ ...x, fonte: FONTI_ALTERNATIVA.VARIANTE, identica: null, nota: 'stesso P/N con confezione o suffisso diverso' });
    if (v.errori.length) r.note.push(`ricerca delle varianti: ${v.errori.join('; ')}`);
    // 2. sostituti DigiKey
    try {
      for (const x of await digikeySostituti(pn)) {
        const diretto = SOSTITUTO_DIRETTO.test(x.tipo);
        aggiungi({ mpn: x.mpn, produttore: x.produttore, descrizione: x.descrizione, fonte: FONTI_ALTERNATIVA.SOSTITUTO, identica: null,
          nota: `DigiKey: ${x.tipo || 'sostituto'}${diretto ? '' : ' (simile, non uguale)'}`, diretto });
      }
    } catch (e: any) { r.note.push(`sostituti DigiKey non letti: ${e.message}`); }
  }
  // 3. stesse caratteristiche (solo dove il codice di produzione le dice tutte)
  const parole = paroleAlternative(r);
  if (parole && (r.codiceProduzione || r.codiceGestionale)) {
    if (attivi.digikey) {
      try {
        for (const x of await digikeyParametri(parole)) {
          const mpn = x.prodotto.ManufacturerProductNumber ?? '';
          if (!x.offerte.length) continue;
          const d = daDigikey(x.prodotto);
          if (stesseCaratteristiche(r, d.famiglia, d.attributi, mpn) !== true) continue;
          aggiungi({ mpn, produttore: x.prodotto.Manufacturer?.Name ?? '', descrizione: x.offerte[0].descrizione, fonte: FONTI_ALTERNATIVA.STESSE, identica: true });
          await memorizza('digikey', mpn, { offerte: x.offerte, prodotto: x.prodotto });
        }
      } catch (e: any) { r.note.push(`ricerca delle alternative su DigiKey non riuscita: ${e.message}`); }
    }
    if (attivi.mouser) {
      try {
        for (const o of await mouserParametri(parole)) {
          const [fam, attr] = decodificaMpn(o.mpn);
          if (stesseCaratteristiche(r, fam, attr, o.mpn) !== true) continue;
          aggiungi({ mpn: o.mpn, produttore: o.produttore, descrizione: o.descrizione, fonte: FONTI_ALTERNATIVA.STESSE, identica: true });
        }
      } catch (e: any) { r.note.push(`ricerca delle alternative su Mouser non riuscita: ${e.message}`); }
    }
  }
  return candidate;
}

/** Candidati → alternative con le offerte di TUTTI i distributori; restano solo quelle che qualcuno vende, le migliori prima. */
function conOfferte(candidate: Map<string, Candidata>, perPn: Map<string, Partial<Record<Fornitore, RisultatoFornitore>>>, qta: number): Alternativa[] {
  const alternative = [...candidate.entries()].map(([ka, a]) => ({ ...a, offerte: Object.values(perPn.get(ka) ?? {}).flatMap(x => x?.offerte ?? []) }))
    .filter(a => a.offerte.length);
  return ordinaAlternative(alternative, qta).slice(0, MAX_ALTERNATIVE);
}

/** Alternative di una riga, già con i prezzi (usata anche dalla pagina della riga). */
export async function cercaAlternative(r: RigaBom, qta: number): Promise<Alternativa[]> {
  const candidate = await candidateAlternative(r);
  if (!candidate.size) return [];
  const es = await cercaPn([...candidate.values()].map(a => a.mpn));
  return conOfferte(candidate, es.perPn, qta);
}

/** Prima quelle con le stesse caratteristiche e disponibili, poi le più economiche per la quantità. */
export function ordinaAlternative(alternative: Alternativa[], qta: number): Alternativa[] {
  const valuta = (a: Alternativa) => { const s = sceltaMigliore(a.offerte, Math.max(1, qta)); return { disp: !!s?.disponibile, tot: s?.acquisto.totale ?? Infinity }; };
  return [...alternative].map(a => ({ a, v: valuta(a) }))
    .sort((x, y) => Number(y.v.disp) - Number(x.v.disp) || Number(y.a.identica === true) - Number(x.a.identica === true) || x.v.tot - y.v.tot)
    .map(x => x.a);
}

/**
 * Il compatibile da usare per il prezzo quando il P/N esatto non si trova (Adriano 1/11/2026: "deve darmi il prezzo di un altro componente
 * compatibile al 100%, almeno in teoria, e deve essere indicato"). Valgono solo quelle "al 100%" in teoria: variante dello stesso P/N,
 * stesso codice di produzione, sostituto diretto DigiKey, proposta dell'IA (pin-to-pin) trovata dai distributori. In quest'ordine,
 * prima quelle disponibili nella quantità, poi la più economica. Mai una con caratteristiche diverse o un sostituto solo "simile".
 */
const ORDINE_FONTE: Record<string, number> = { [FONTI_ALTERNATIVA.VARIANTE]: 0, [FONTI_ALTERNATIVA.STESSE]: 1, [FONTI_ALTERNATIVA.SOSTITUTO]: 2, [FONTI_ALTERNATIVA.IA]: 3 };
export function compatibileProposto(alternative: Alternativa[], qta: number): Alternativa | null {
  const valide = alternative.filter(a => a.identica !== false && a.fonte !== FONTI_ALTERNATIVA.MANO && a.offerte.length
    && (a.fonte !== FONTI_ALTERNATIVA.SOSTITUTO || a.diretto));
  const valuta = (a: Alternativa) => { const s = sceltaMigliore(a.offerte, Math.max(1, qta)); return { disp: !!s?.disponibile, tot: s?.acquisto.totale ?? Infinity }; };
  return valide.map(a => ({ a, v: valuta(a) })).sort((x, y) => Number(y.v.disp) - Number(x.v.disp)
    || (ORDINE_FONTE[x.a.fonte] ?? 9) - (ORDINE_FONTE[y.a.fonte] ?? 9) || x.v.tot - y.v.tot)[0]?.a ?? null;
}

/**
 * Alternative per le righe non trovate (o non disponibili) da nessun distributore; aggiorna i prezzi di quelle già scelte o scritte a mano.
 * Se nessuna regola trova un compatibile, l'IA propone equivalenti pin-to-pin (tutte le righe insieme, una chiamata), che contano solo
 * se un distributore li vende. Il migliore diventa il "compatibile da verificare" che dà il prezzo alla riga.
 */
async function alternativeRighe(righe: RigaBom[], forza?: boolean) {
  if (!Object.values(fornitoriConfigurati()).some(Boolean)) return;
  // quelle già presenti (scritte a mano o scelte): prezzi aggiornati
  const tenute = righe.flatMap(r => r.alternative ?? []);
  if (tenute.length) {
    const es = await cercaPn(unico(tenute.map(a => a.mpn)), { forza });
    for (const a of tenute) a.offerte = Object.values(es.perPn.get(pnKey(a.mpn)!) ?? {}).flatMap(x => x?.offerte ?? []);
  }
  const daCercare: { r: RigaBom; qta: number; candidate: Map<string, Candidata> }[] = [];
  let cercate = 0;
  for (const r of righe) {
    r.alternativaProposta = null;
    if (r.esito === ESITI.NON_MONTATO || r.clienteFornisce || !(r.pn || r.mpnAcquisto)) continue;
    if (r.alternativaScelta || r.reperibilita?.livello !== 'critico') continue;
    if (cercate++ >= MAX_RIGHE_ALTERNATIVE) { r.note.push('alternative non cercate (troppe righe non trovate): scrivila a mano dalla riga'); continue; }
    try { daCercare.push({ r, qta: Math.max(0, ...r.acquisti.map(x => x.lorda)), candidate: await candidateAlternative(r) }); }
    catch (e: any) { r.note.push(`ricerca delle alternative non riuscita: ${e.message}`); }
  }
  // l'IA solo per le righe senza nessun candidato al 100%
  const perIa = daCercare.filter(x => ![...x.candidate.values()].some(c => c.fonte !== FONTI_ALTERNATIVA.SOSTITUTO || c.diretto));
  if (perIa.length && iaConfigurata()) {
    try {
      const proposte = await proponiCompatibiliIa(perIa.map(({ r }) => ({ riga: r.n, pn: (r.pn ?? r.mpnAcquisto)!, produttore: r.produttore ?? '',
        descrizione: r.descrizione ?? r.descrizioneBom ?? '', famiglia: r.famiglia ?? '', case: r.attributi.case ?? '' })));
      for (const x of perIa) for (const p of proposte.get(x.r.n) ?? []) {
        const ka = pnKey(p.mpn);
        if (ka && ka !== pnKey(x.r.pn ?? x.r.mpnAcquisto) && !x.candidate.has(ka))
          x.candidate.set(ka, { mpn: p.mpn, produttore: p.produttore, descrizione: '', fonte: FONTI_ALTERNATIVA.IA, identica: null, nota: p.motivo });
      }
    } catch (e: any) { for (const x of perIa) x.r.note.push(`compatibili dall'IA non letti: ${e.message}`); }
  }
  // prezzi di tutti i candidati in una volta, presso tutti i distributori
  const tutti = unico(daCercare.flatMap(x => [...x.candidate.values()].map(c => c.mpn)));
  const es = tutti.length ? await cercaPn(tutti) : null;
  for (const { r, qta, candidate } of daCercare) {
    const trovate = es ? conOfferte(candidate, es.perPn, qta) : [];
    // le descrizioni delle proposte dell'IA si prendono dai distributori
    for (const a of trovate) if (!a.descrizione) { a.descrizione = a.offerte[0]?.descrizione ?? ''; a.produttore ||= a.offerte[0]?.produttore ?? ''; }
    const giaQui = new Set((r.alternative ?? []).map(a => pnKey(a.mpn)));
    r.alternative = [...trovate.filter(a => !giaQui.has(pnKey(a.mpn))), ...(r.alternative ?? [])];
    const proposta = compatibileProposto(r.alternative, qta);
    r.alternativaProposta = proposta?.mpn ?? null;
    if (proposta) r.note.push(`P/N non trovato: prezzo del compatibile ${proposta.mpn} (${proposta.fonte}), DA VERIFICARE`);
    else if (trovate.length) r.note.push(`${trovate.length === 1 ? '1 alternativa trovata' : `${trovate.length} alternative trovate`} (nessuna sicuramente uguale): scegli dalla riga`);
    else r.note.push('nessuna alternativa trovata dai distributori: puoi scriverne una a mano dalla riga');
  }
}

/** Prezzo €/pz scritto a mano su una riga (null = torna al prezzo dei distributori). Ricalcola gli acquisti. */
export async function impostaPrezzoManuale(id: number, n: number, prezzo: number | null): Promise<string> {
  const a = await q1<any>(`SELECT * FROM bom_analisi WHERE id = $1`, [id]);
  const righe: RigaBom[] = a?.righe ?? [];
  const r = righe.find(x => x.n === n);
  if (!r) return 'Riga non trovata.';
  r.prezzoManuale = prezzo;
  await calcolaAcquisti(righe, a.quantita ?? []);
  await salvaRighe(id, righe);
  return prezzo == null ? 'Prezzo a mano tolto: vale di nuovo quello dei distributori.' : `Prezzo a mano salvato: ${String(prezzo).replace('.', ',')} €/pz.`;
}

/**
 * Scelta dell'operatore sulla riga: usa un'alternativa proposta, ne scrive una a mano (cercata presso tutti i distributori)
 * o torna al P/N della BOM. Ricalcola gli acquisti.
 */
export async function scegliAlternativa(id: number, n: number, dati: { usa?: string; nuova?: string; originale?: boolean; togli?: string }): Promise<string> {
  const a = await q1<any>(`SELECT * FROM bom_analisi WHERE id = $1`, [id]);
  const righe: RigaBom[] = a?.righe ?? [];
  const r = righe.find(x => x.n === n);
  if (!r) return 'Riga non trovata.';
  let messaggio = '';
  const pnRiga = r.pn ?? r.mpnAcquisto;
  if (dati.nuova) {
    const mpn = dati.nuova.trim().toUpperCase();
    const ka = pnKey(mpn);
    if (!ka) return 'Scrivi il P/N dell\'alternativa.';
    if (ka === pnKey(pnRiga)) return 'È lo stesso P/N della BOM.';
    const es = await cercaPn([mpn]);
    const trovati = es.perPn.get(ka) ?? {};
    const offerte = Object.values(trovati).flatMap(x => x?.offerte ?? []);
    const dk = trovati.digikey?.prodotto;
    const d = dk ? daDigikey(dk) : null;
    const [famDec, aDec] = decodificaMpn(mpn);
    const identica = d?.famiglia ? stesseCaratteristiche(r, d.famiglia, d.attributi, mpn) : famDec ? stesseCaratteristiche(r, famDec, aDec, mpn) : null;
    const alt: Alternativa = { mpn: offerte[0]?.mpn || mpn, produttore: offerte[0]?.produttore ?? '', descrizione: offerte[0]?.descrizione ?? '',
      fonte: FONTI_ALTERNATIVA.MANO, identica, offerte };
    r.alternative = [alt, ...(r.alternative ?? []).filter(x => pnKey(x.mpn) !== ka)];
    if (offerte.length) {
      r.alternativaScelta = alt.mpn;
      messaggio = `Alternativa ${alt.mpn} trovata e scelta.` + (identica === false ? ' Attenzione: le caratteristiche risultano diverse da quelle della BOM.' : identica === null ? ' Controlla che abbia le stesse caratteristiche.' : '');
    } else messaggio = `${mpn} non si trova presso nessun distributore: aggiunto all'elenco ma non scelto.` +
      (Object.keys(es.errori).length ? ` (${Object.keys(es.errori).map(f => NOMI_FORNITORI[f as Fornitore]).join(', ')} non ha risposto)` : '');
  } else if (dati.usa) {
    const alt = r.alternative?.find(x => x.mpn === dati.usa);
    if (!alt) return 'Alternativa non trovata.';
    const conferma = r.alternativaProposta === alt.mpn;
    r.alternativaScelta = alt.mpn; r.alternativaProposta = null;
    messaggio = conferma ? `Compatibile ${alt.mpn} verificato: si compra al posto di ${pnRiga ?? 'quello della BOM'}.` : `Si compra ${alt.mpn} al posto di ${pnRiga ?? 'quello della BOM'}.`;
  } else if (dati.togli) {
    r.alternative = (r.alternative ?? []).filter(x => x.mpn !== dati.togli);
    if (r.alternativaScelta === dati.togli) r.alternativaScelta = null;
    if (r.alternativaProposta === dati.togli) r.alternativaProposta = null;
    messaggio = `Alternativa ${dati.togli} tolta.`;
  }
  if (dati.originale) r.alternativaProposta = null; // l'operatore non vuole il compatibile proposto
  if (dati.originale || (!r.alternativaScelta && !r.alternativaProposta && (dati.togli || dati.originale))) {
    r.alternativaScelta = null;
    if (pnRiga) {
      const es = await cercaPn([pnRiga]);
      calcolaAcquistiCon([r], a.quantita ?? [], await caricaRegoleScarto(), es.perPn);
    }
    if (dati.originale) messaggio = `Si torna al P/N della BOM${pnRiga ? ` ${pnRiga}` : ''}.`;
  }
  await calcolaAcquisti(righe, a.quantita ?? []);
  await salvaRighe(id, righe);
  return messaggio;
}

/** Quantità, scarto, fornitore migliore e reperibilità per ogni quantità di schede. */
export async function calcolaAcquisti(righe: RigaBom[], quantita: number[], perPnDist?: Map<string, Partial<Record<Fornitore, RisultatoFornitore>>>) {
  calcolaAcquistiCon(righe, quantita, await caricaRegoleScarto(), perPnDist);
}
export function calcolaAcquistiCon(righe: RigaBom[], quantita: number[], regole: RegoleScarto, perPnDist?: Map<string, Partial<Record<Fornitore, RisultatoFornitore>>>) {
  const attivi = (Object.keys(fornitoriConfigurati()) as Fornitore[]).filter(f => fornitoriConfigurati()[f]);
  for (const r of righe) {
    const pn = r.pn ?? r.mpnAcquisto ?? null;
    const daVerificare = !r.alternativaScelta && !!r.alternativaProposta;
    const alt = r.alternativaScelta ? r.alternative?.find(x => x.mpn === r.alternativaScelta)
      : r.alternativaProposta ? r.alternative?.find(x => x.mpn === r.alternativaProposta) : undefined;
    if (alt) { r.offerte = alt.offerte; r.nonControllati = []; }
    else if (perPnDist && pn) {
      const trovati = perPnDist.get(pnKey(pn)!) ?? {};
      r.offerte = Object.values(trovati).flatMap(x => x?.offerte ?? []);
      r.nonControllati = attivi.filter(f => !trovati[f]);
    }
    r.acquisti = []; r.reperibilita = undefined;
    if (r.esito === ESITI.NON_MONTATO || r.clienteFornisce || !(r.qtaScheda > 0)) continue;
    for (const schede of quantita) {
      const netta = Math.ceil(r.qtaScheda * schede);
      const manuale = r.prezzoManuale != null && r.prezzoManuale >= 0 ? r.prezzoManuale : null;
      const migliore0 = manuale == null ? sceltaMigliore(r.offerte, netta) : null;
      const p0 = manuale ?? (migliore0 ? prezzoUnitario(migliore0.offerta, netta) : null);
      const sc = pezziScarto(r.famiglia, p0, netta, regole);
      const lorda = netta + sc.pezzi;
      if (manuale != null) { // prezzo scritto dall'operatore: vale quello, qualunque cosa propongano i distributori
        r.acquisti.push({ schede, netta, scarto: sc.pezzi, regolaScarto: sc.regola, lorda,
          scelta: { fornitore: PREZZO_A_MANO, codice: '', mpn: r.alternativaScelta ?? pn ?? '', qta: lorda, prezzo: manuale, totale: lorda * manuale,
            nota: 'prezzo scritto a mano', disponibile: true } });
        continue;
      }
      const s = sceltaMigliore(r.offerte, lorda);
      r.acquisti.push({ schede, netta, scarto: sc.pezzi, regolaScarto: sc.regola, lorda,
        scelta: s ? { fornitore: s.offerta.fornitore, codice: s.offerta.codiceFornitore, mpn: s.offerta.mpn, qta: s.acquisto.qta, prezzo: s.acquisto.prezzo,
          totale: s.acquisto.totale, nota: s.acquisto.nota, disponibile: s.disponibile, url: s.offerta.url } : undefined });
    }
    const max = Math.max(0, ...r.acquisti.map(x => x.lorda));
    if (!Object.values(fornitoriConfigurati()).some(Boolean)) continue; // nessun distributore collegato: niente giudizio
    r.reperibilita = r.pn || r.mpnAcquisto || alt ? reperibilita(r.offerte, max, r.nonControllati ?? []) : { livello: 'attenzione', motivi: ['senza P/N: nessun equivalente trovato, prezzo non disponibile'] };
    if (alt && daVerificare) {
      r.reperibilita.motivi.unshift(`${pn ?? 'il P/N della BOM'} non si trova: prezzo del compatibile ${alt.mpn} (${alt.fonte}), DA VERIFICARE`);
      if (r.reperibilita.livello === 'ok') r.reperibilita.livello = 'attenzione';
    } else if (alt) r.reperibilita.motivi.unshift(`si compra l'alternativa ${alt.mpn} al posto di ${pn ?? 'quello della BOM'}`);
    if (r.prezzoManuale != null) r.reperibilita = { livello: 'ok', motivi: [`prezzo scritto a mano: ${r.prezzoManuale} €/pz`, ...r.reperibilita.motivi.filter(m => !m.startsWith('senza P/N'))] };
  }
}

export interface Riepilogo {
  righe: number; nuovi: number; daCompletare: number; inArchivio: number;
  perQuantita: { schede: number; totale: number; aScheda: number; senzaPrezzo: number; nonDisponibili: number }[];
  critici: number; attenzione: number;
}
export function riepilogo(righe: RigaBom[], quantita: number[]): Riepilogo {
  const attive = righe.filter(r => r.esito !== ESITI.NON_MONTATO && !r.clienteFornisce);
  return {
    righe: righe.length,
    nuovi: righe.filter(r => r.esito === ESITI.NUOVO || r.esito === ESITI.NUOVO_VER || r.esito === ESITI.DB_FATTO).length,
    daCompletare: righe.filter(r => r.esito === ESITI.INC || r.esito === ESITI.DB_INC).length,
    inArchivio: righe.filter(r => r.esito === ESITI.DB || r.esito === ESITI.DB_PROD).length,
    perQuantita: quantita.map((schede, i) => {
      const acq = attive.map(r => r.acquisti[i]).filter(Boolean);
      const totale = acq.reduce((t, x) => t + (x.scelta?.totale ?? 0), 0);
      return { schede, totale, aScheda: schede ? totale / schede : 0, senzaPrezzo: attive.length - acq.filter(x => x.scelta).length,
        nonDisponibili: acq.filter(x => x.scelta && !x.scelta.disponibile).length };
    }),
    critici: attive.filter(r => r.reperibilita?.livello === 'critico').length,
    attenzione: attive.filter(r => r.reperibilita?.livello === 'attenzione').length,
  };
}

/** Costo dei materiali della BOM per un numero qualsiasi di schede, con le offerte già lette (non chiama i distributori). */
export function costoMaterialiPer(righe: RigaBom[], schede: number, regole: RegoleScarto) {
  const copia: RigaBom[] = structuredClone(righe);
  calcolaAcquistiCon(copia, [schede], regole);
  return riepilogo(copia, [schede]).perQuantita[0];
}

/**
 * Problemi della BOM quotata da risolvere prima di dare il costo al preventivo (Adriano 28/10/2026): righe da completare
 * o con codice da validare, righe senza prezzo, componenti non disponibili o con reperibilità critica.
 */
export function problemiBom(righe: RigaBom[], costo: { senzaPrezzo: number; nonDisponibili: number }): string[] {
  const attive = righe.filter(r => r.esito !== ESITI.NON_MONTATO && !r.clienteFornisce);
  const daCompletare = attive.filter(r => r.esito === ESITI.INC || r.esito === ESITI.DB_INC).length;
  const daValidare = attive.filter(r => r.esito === ESITI.NUOVO_VER || r.note?.some(n => n.startsWith(NOTA_DA_VALIDARE))).length;
  const critici = attive.filter(r => r.reperibilita?.livello === 'critico').length;
  const compatibili = attive.filter(r => r.alternativaProposta && !r.alternativaScelta).length;
  const n = (x: number, uno: string, piu: string) => x ? `${x} ${x === 1 ? uno : piu}` : '';
  return [
    n(daCompletare, 'riga da completare', 'righe da completare'),
    n(daValidare, 'codice da validare', 'codici da validare'),
    n(costo.senzaPrezzo, 'riga senza prezzo', 'righe senza prezzo'),
    n(costo.nonDisponibili, 'componente non disponibile', 'componenti non disponibili'),
    n(critici, 'componente con reperibilità critica', 'componenti con reperibilità critica'),
    n(compatibili, 'codice compatibile da verificare', 'codici compatibili da verificare'),
  ].filter(Boolean);
}

/** BOM collegata a un preventivo: costo dei componenti a scheda per le schede del preventivo, con i problemi da risolvere. */
export async function costoBomPerPreventivo(id: number, schede: number) {
  const a = await q1<any>(`SELECT id, nome, righe, stato, aggiornato_il FROM bom_analisi WHERE id = $1 AND file_nome IS DISTINCT FROM $2`, [id, FILE_SINGOLA]);
  if (!a) return null;
  const x = costoMaterialiPer(a.righe ?? [], Math.max(1, schede), await caricaRegoleScarto());
  return { id: a.id, nome: a.nome, stato: a.stato, prezziDel: a.aggiornato_il, ...x, problemi: problemiBom(a.righe ?? [], x) };
}

export async function salvaRighe(id: number, righe: RigaBom[]) {
  const a = await q1<{ quantita: number[] }>(`SELECT quantita FROM bom_analisi WHERE id = $1`, [id]);
  await q(`UPDATE bom_analisi SET righe = $2, riepilogo = $3, aggiornato_il = now() WHERE id = $1`,
    [id, JSON.stringify(righe.map(r => { const { _fam, _candidati, _escluso, _famDebole, ...x } = r as any; return x; })), JSON.stringify(riepilogo(righe, a?.quantita ?? []))]);
}

/**
 * Toglie una riga dalla BOM (suggerimento di Adriano Croci: "un elimina righe qualora servisse eliminare una voce che non serve").
 * Sparisce anche dal file letto, così non torna con "Rielabora"; acquisti e totali si ricalcolano.
 */
export async function togliRiga(id: number, n: number): Promise<string> {
  const a = await q1<any>(`SELECT * FROM bom_analisi WHERE id = $1`, [id]);
  if (!a) return 'BOM non trovata.';
  const righe: RigaBom[] = (a.righe ?? []).filter((x: RigaBom) => x.n !== n);
  const righeFile = (a.righe_file ?? []).filter((x: { n: number }) => x.n !== n);
  if (righe.length === (a.righe ?? []).length && righeFile.length === (a.righe_file ?? []).length) return 'Riga non trovata.';
  await q(`UPDATE bom_analisi SET righe_file = $2 WHERE id = $1`, [id, JSON.stringify(righeFile)]);
  await calcolaAcquisti(righe, a.quantita ?? []);
  await salvaRighe(id, righe);
  return `Riga ${n} tolta dalla BOM.`;
}

/** Correzione a mano di una riga: famiglia, attributi, fornito dal cliente. Ricalcola codici e acquisti. */
export async function correggiRiga(id: number, n: number, dati: { famiglia: string | null; attributi: Attributi; clienteFornisce: boolean }) {
  const a = await q1<any>(`SELECT * FROM bom_analisi WHERE id = $1`, [id]);
  const righe: RigaBom[] = a.righe;
  const r = righe.find(x => x.n === n);
  if (!r) return;
  r.clienteFornisce = dati.clienteFornisce;
  if (r.esito !== ESITI.DB && r.esito !== ESITI.NON_MONTATO) {
    r.famiglia = dati.famiglia; r.attributi = dati.attributi;
    if (r.esito === ESITI.DB_PROD) { r.esito = ESITI.INC; r.dbId = null; r.mpnAcquisto = null; }
    if (!r.fonti.includes('modifica a mano')) r.fonti.push('modifica a mano');
    r.note = r.note.filter(x => !x.startsWith(NOTA_DA_VALIDARE)); // controllata a mano: non è più da validare
    await ricalcola(righe);
  }
  await calcolaAcquisti(righe, a.quantita);
  await salvaRighe(id, righe);
}

/** Scrive nell'archivio i componenti nuovi completi e completa quelli già presenti. */
export async function salvaInArchivio(id: number, utente: string): Promise<{ nuovi: number; aggiornati: number }> {
  const a = await q1<any>(`SELECT * FROM bom_analisi WHERE id = $1`, [id]);
  const righe: RigaBom[] = a.righe;
  const fonte = `BOM ${a.nome} (${utente})`;
  let nuovi = 0, aggiornati = 0;
  await transazione(async c => {
    for (const r of righe) {
      if ((r.esito === ESITI.NUOVO || r.esito === ESITI.NUOVO_VER) && r.codiceGestionale) {
        if (r.pn && (await c.query(`SELECT 1 FROM componenti WHERE pn_key = $1`, [pnKey(r.pn)])).rowCount) continue;
        let gest = r.codiceGestionale;
        if ((await c.query(`SELECT 1 FROM componenti WHERE codice_gestionale = $1`, [gest])).rowCount) {
          const radice = gest.slice(0, -4);
          const usati = new Set((await c.query(`SELECT codice_gestionale AS g FROM componenti WHERE codice_gestionale LIKE $1`, [radice + '-___'])).rows.map((x: any) => progNum(x.g.slice(-3))));
          let k = 1; while (usati.has(k)) k++;
          gest = `${radice}-${progStr(k)}`; r.codiceGestionale = gest;
        }
        await c.query(`INSERT INTO componenti (pn, pn_key, produttore, famiglia, codice_produzione, codice_gestionale, descrizione, attributi, stato, fonte, note)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [r.pn, pnKey(r.pn), r.produttore, r.famiglia, r.codiceProduzione, gest, r.descrizione,
          JSON.stringify(Object.fromEntries(Object.entries(r.attributi).filter(([, v]) => v))), r.esito === ESITI.NUOVO ? OK : VER, fonte, r.note.join('; ')]);
        r.esito = ESITI.DB; nuovi++;
      } else if (r.esito === ESITI.DB_FATTO && r.dbId && r.codiceGestionale) {
        await c.query(`UPDATE componenti SET codice_gestionale = $2, famiglia = $3, descrizione = $4, attributi = $5, stato = $6, note = $7, aggiornato_il = now() WHERE id = $1`,
          [r.dbId, r.codiceGestionale, r.famiglia, r.descrizione, JSON.stringify(r.attributi), OK, `completato da ${fonte}`]);
        r.esito = ESITI.DB; aggiornati++;
      }
    }
  });
  await salvaRighe(id, righe);
  return { nuovi, aggiornati };
}

// ───────────────────────────── codifica di un singolo P/N ─────────────────────────────
export const FILE_SINGOLA = '(codifica singola)';
/** Un P/N (o una descrizione) da codificare: è una BOM di una riga, che si apre con la stessa pagina. */
export async function creaCodificaSingola(dati: { pn: string; descrizione: string; famiglia: string; schede: number[]; utenteId: number }): Promise<number> {
  await q(`DELETE FROM bom_analisi WHERE file_nome = $1 AND creato_il < now() - interval '30 days'`, [FILE_SINGOLA]);
  const colonne = ['P/N', 'Descrizione', 'Famiglia', 'Qtà'];
  const r = await q1<{ id: number }>(`INSERT INTO bom_analisi (nome, file_nome, quantita, colonne, mappatura, righe_file, creato_da)
    VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [dati.pn ? `P/N ${dati.pn}` : `Codifica: ${dati.descrizione.slice(0, 60)}`, FILE_SINGOLA, dati.schede,
    JSON.stringify(colonne), JSON.stringify({ pn: 'P/N', descrizione: 'Descrizione', famiglia: 'Famiglia', quantita: 'Qtà' }),
    JSON.stringify([{ n: 1, celle: [dati.pn, dati.descrizione, dati.famiglia, '1'] }]), dati.utenteId]);
  return r!.id;
}

// ───────────────────────────── Excel ─────────────────────────────
const COLORI_ESITO: Record<string, string> = { [ESITI.DB]: 'DDEBF7', [ESITI.DB_PROD]: 'DDEBF7', [ESITI.DB_INC]: 'F8CBAD', [ESITI.DB_FATTO]: 'E2EFDA',
  [ESITI.NUOVO]: 'E2EFDA', [ESITI.NUOVO_VER]: 'FFF2CC', [ESITI.INC]: 'F8CBAD', [ESITI.NON_MONTATO]: 'D9D9D9', [ESITI.CLIENTE]: 'D9D9D9' };
const COLORI_LIVELLO: Record<string, string> = { ok: 'E2EFDA', attenzione: 'FFF2CC', critico: 'F8CBAD' };

export async function excelAnalisi(id: number): Promise<{ nome: string; dati: Buffer }> {
  const a = await q1<any>(`SELECT * FROM bom_analisi WHERE id = $1`, [id]);
  const righe: RigaBom[] = a.righe; const quantita: number[] = a.quantita;
  const wb = new ExcelJS.Workbook();
  const intest = (ws: ExcelJS.Worksheet, colonne: { titolo: string; larghezza: number }[]) => {
    ws.columns = colonne.map(c => ({ header: c.titolo, width: c.larghezza }));
    const h = ws.getRow(1); h.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Arial', size: 10 };
    h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } }; h.alignment = { wrapText: true, vertical: 'middle' };
    ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }];
  };
  const riempi = (c: ExcelJS.Cell, colore?: string) => { if (colore) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + colore } }; };
  // codifica
  const ws = wb.addWorksheet('BOM codificata');
  intest(ws, [{ titolo: 'Riga', larghezza: 6 }, { titolo: 'P/N', larghezza: 24 }, { titolo: 'Produttore', larghezza: 16 }, { titolo: 'Qtà a scheda', larghezza: 8 },
    { titolo: 'Designatori', larghezza: 22 }, { titolo: 'Esito', larghezza: 26 }, { titolo: 'Famiglia', larghezza: 8 }, { titolo: 'Tecnologia', larghezza: 8 },
    ...ATTR.map(k => ({ titolo: ETICHETTE[k], larghezza: 11 })), { titolo: 'Codice produzione', larghezza: 32 }, { titolo: 'Codice gestionale', larghezza: 22 },
    { titolo: 'Descrizione', larghezza: 40 }, { titolo: 'Dati da', larghezza: 22 }, { titolo: 'Note', larghezza: 60 }]);
  for (const r of righe) {
    const row = ws.addRow([r.n, r.pn, r.produttore, r.qtaScheda, r.designatori, r.clienteFornisce ? ESITI.CLIENTE : r.esito, r.famiglia, r.attributi.tecnologia ?? null,
      ...ATTR.map(k => r.attributi[k] ?? null), r.codiceProduzione, r.codiceGestionale, r.descrizione, r.fonti.join(' + '), r.note.join('; ')]);
    riempi(row.getCell(6), COLORI_ESITO[r.clienteFornisce ? ESITI.CLIENTE : r.esito]);
    for (const c of [9 + ATTR.length, 10 + ATTR.length]) row.getCell(c).font = { name: 'Consolas', bold: true, size: 10 };
  }
  ws.autoFilter = { from: 'A1', to: { row: 1, column: ws.columnCount } };
  // acquisti
  const wa = wb.addWorksheet('Acquisti');
  intest(wa, [{ titolo: 'Riga', larghezza: 6 }, { titolo: 'P/N', larghezza: 24 }, { titolo: 'Codice gestionale', larghezza: 22 }, { titolo: 'Qtà a scheda', larghezza: 8 },
    { titolo: 'Reperibilità', larghezza: 12 }, { titolo: 'Motivi', larghezza: 40 },
    ...quantita.flatMap(s => [{ titolo: `${s} schede: netta`, larghezza: 9 }, { titolo: 'scarto', larghezza: 7 }, { titolo: 'da ordinare', larghezza: 9 },
      { titolo: 'fornitore', larghezza: 10 }, { titolo: 'codice fornitore', larghezza: 20 }, { titolo: '€/pz', larghezza: 9 }, { titolo: 'totale €', larghezza: 10 }])]);
  for (const r of righe) {
    if (r.esito === ESITI.NON_MONTATO || r.clienteFornisce) continue;
    const pnExcel = r.alternativaScelta ? `${r.pn ?? r.mpnAcquisto ?? ''} → alternativa ${r.alternativaScelta}` : r.pn ?? (r.mpnAcquisto ? `(${r.mpnAcquisto})` : null);
    const row = wa.addRow([r.n, pnExcel, r.codiceGestionale, r.qtaScheda, r.reperibilita?.livello ?? '', r.reperibilita?.motivi.join('; ') ?? '',
      ...r.acquisti.flatMap(x => [x.netta, x.scarto, x.scelta?.qta ?? x.lorda, x.scelta ? nomeFornitore(x.scelta.fornitore) : '', x.scelta?.codice ?? '', x.scelta?.prezzo ?? null, x.scelta?.totale ?? null])]);
    riempi(row.getCell(5), COLORI_LIVELLO[r.reperibilita?.livello ?? '']);
    for (let i = 0; i < quantita.length; i++) { row.getCell(7 + i * 7 + 5).numFmt = '0.0000'; row.getCell(7 + i * 7 + 6).numFmt = '#,##0.00'; }
  }
  const rp = riepilogo(righe, quantita);
  wa.addRow([]);
  for (const x of rp.perQuantita) wa.addRow(['', `Totale ${x.schede} schede`, `${x.totale.toFixed(2)} €`, `a scheda ${x.aScheda.toFixed(2)} €`, x.senzaPrezzo ? `${x.senzaPrezzo} righe senza prezzo` : '']).font = { bold: true };
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return { nome: `${String(a.nome).replace(/[^\w.-]+/g, '_')}_codificata.xlsx`, dati: buf };
}

export { ETICHETTE_RUOLI, FAMIGLIE, ATTR, ETICHETTE, MAN, VER, OK };
