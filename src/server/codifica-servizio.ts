/**
 * Codifica dei componenti e preventivo materiali dalla BOM.
 * Per ogni riga (come il programma "Codifica componenti", core/bom.py, più distributori e IA):
 *  1. P/N già nell'archivio componenti → codici esistenti;
 *  2. altrimenti dati dal P/N (decodifica delle serie note), da DigiKey, dalle colonne della BOM e, se manca ancora
 *     qualcosa, dalla lettura con l'IA; regole d'acquisto (resistenze solo 1%); codici calcolati con le regole;
 *     una riga senza P/N che dà un codice di produzione già in archivio riprende i codici esistenti;
 *  3. prezzi e disponibilità dai distributori; per i passivi senza P/N si cerca il più economico con gli stessi dati;
 *  4. quantità da acquistare con lo scarto, fornitore migliore, componenti difficili da trovare.
 * L'elaborazione gira in background: la pagina segue l'avanzamento.
 */
import { gunzipSync } from 'node:zlib';
import ExcelJS from 'exceljs';
import { q, q1, transazione } from './db.js';
import { ATTR, ETICHETTE, FAMIGLIE, MAN, OK, VER, calcola, progNum, progStr, type Attributi } from '../engine/codifica/regole.js';
import { daColonneBom, decodificaMpn } from '../engine/codifica/decoder.js';
import { daDigikey } from '../engine/codifica/digikey-dati.js';
import { ETICHETTE_RUOLI, NOTA_DA_VALIDARE, completo, regolaCondensatori, leggiCsv, nomiColonne, pnKey, quantitaRiga, regolaResistenze, rigaIntestazione, rilevaColonne, type Ruolo } from '../engine/codifica/bom.js';
import { NOMI_FORNITORI, leggiRegoleScarto, pezziScarto, prezzoUnitario, reperibilita, sceltaMigliore, type Fornitore, type Offerta, type Reperibilita, type RegoleScarto } from '../engine/acquisti.js';
import { cercaPn, digikeyParametri, fornitoriConfigurati, memorizza, mouserParametri, type RisultatoFornitore } from './fornitori.js';
import { iaConfigurata, leggiConIa } from './lettura-ia.js';

export const ESITI = {
  DB: 'IN DATABASE', DB_INC: 'IN DATABASE - DA COMPLETARE', DB_FATTO: 'IN DATABASE - COMPLETATO', DB_PROD: 'IN DATABASE (stesso codice)',
  NUOVO: 'NUOVO', NUOVO_VER: 'NUOVO - DA VERIFICARE', INC: 'DA COMPLETARE', NON_MONTATO: 'NON MONTATO', CLIENTE: 'FORNITO DAL CLIENTE',
} as const;
export type Esito = typeof ESITI[keyof typeof ESITI];

export interface AcquistoRiga {
  schede: number; netta: number; scarto: number; regolaScarto: string; lorda: number;
  scelta?: { fornitore: Fornitore; codice: string; mpn: string; qta: number; prezzo: number; totale: number; nota?: string; disponibile: boolean; url?: string | null };
}
export interface RigaBom {
  n: number; pn: string | null; produttore: string | null; designatori: string | null; valore: string | null; footprint: string | null; descrizioneBom: string | null;
  qtaScheda: number; esito: Esito; famiglia: string | null; attributi: Attributi;
  codiceProduzione: string | null; codiceGestionale: string | null; descrizione: string | null;
  fonti: string[]; note: string[]; dbId?: number | null; prodDb?: string | null;
  mpnAcquisto?: string | null; offerte: Offerta[]; acquisti: AcquistoRiga[]; reperibilita?: Reperibilita; clienteFornisce?: boolean;
}

// ───────────────────────────── lettura del file ─────────────────────────────
/** Righe di testo da un file xlsx o csv. */
export async function leggiFileBom(nome: string, contenuto: Buffer): Promise<string[][]> {
  const n = nome.toLowerCase();
  if (n.endsWith('.csv') || n.endsWith('.txt')) {
    const testo = contenuto.toString('utf8').replace(/^﻿/, '');
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
  const dati = opz.righe.slice(h + 1).map((r, i) => ({ n: h + 2 + i, celle: r })).filter(r => r.celle.some(c => String(c ?? '').trim()));
  const mappatura = rilevaColonne(colonne, dati.map(r => r.celle.map(c => String(c ?? ''))));
  const r = await q1<{ id: number }>(`INSERT INTO bom_analisi (nome, file_nome, quantita, colonne, mappatura, righe_file, creato_da)
    VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [opz.nome, opz.fileNome, opz.quantita, JSON.stringify(colonne), JSON.stringify(mappatura), JSON.stringify(dati), opz.utenteId]);
  return r!.id;
}

// ───────────────────────────── archivio componenti ─────────────────────────────
interface Componente { id: number; pn: string | null; pn_key: string | null; famiglia: string | null; codice_produzione: string | null; codice_gestionale: string | null;
  descrizione: string | null; attributi: Attributi; fonte: string | null; note: string | null; produttore: string | null; stato: string | null }

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
  return q<Componente & { aggiornato_il: Date }>(`SELECT * FROM componenti WHERE pn_key LIKE $1 OR upper(codice_produzione) LIKE $2
    OR upper(codice_gestionale) LIKE $2 OR upper(descrizione) LIKE $2 ORDER BY codice_gestionale NULLS LAST, id LIMIT $3`, [k, t, limite]);
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
const NON_COMPONENTE = /\b(FIDUCIAL|FIDUCIALE|MOUNTING\s*HOLE|FORO\s+DI\s+FISSAGGIO|LOGO)\b|^FID\d/i;
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
  const righe: RigaBom[] = (a.righe_file as { n: number; celle: string[] }[]).map(({ n, celle }) => {
    const qt = quantitaRiga(val(celle, 'quantita'), val(celle, 'designatori'));
    const r: RigaBom = { n, pn: val(celle, 'pn'), produttore: val(celle, 'produttore'), designatori: val(celle, 'designatori'), valore: val(celle, 'valore'),
      footprint: val(celle, 'footprint'), descrizioneBom: val(celle, 'descrizione'), qtaScheda: qt.qta, esito: ESITI.INC, famiglia: null, attributi: {},
      codiceProduzione: null, codiceGestionale: null, descrizione: null, fonti: [], note: qt.nota ? [qt.nota] : [], offerte: [], acquisti: [],
      clienteFornisce: precedenti.get(n)?.clienteFornisce };
    (r as any)._fam = val(celle, 'famiglia');
    return r;
  });
  av.totale = righe.length;
  // 2. archivio
  av.fase = 'archivio componenti';
  const inArchivio = new Map<string, Componente[]>();
  for (const c of await perPn(unico(righe.map(r => pnKey(r.pn)).filter((k): k is string => !!k)))) inArchivio.set(c.pn_key!, [...(inArchivio.get(c.pn_key!) ?? []), c]);
  // 3. distributori (servono anche i dati tecnici DigiKey per la codifica)
  av.fase = 'prezzi e disponibilità dai distributori'; av.fatti = 0;
  const conPn = righe.filter(r => r.pn && !NON_MONTARE.test(`${r.valore ?? ''} ${r.descrizioneBom ?? ''}`));
  const ricerca = await cercaPn(unico(conPn.map(r => r.pn!)), { forza: opz.forzaPrezzi, avanzamento: f => { av.fatti = Math.min(f, av.totale); } });
  const dist = (pn: string | null) => (pn ? ricerca.perPn.get(pnKey(pn)!) : undefined) ?? {};
  // 4. codifica
  av.fase = 'codifica'; av.fatti = 0;
  const daLeggereIa: RigaBom[] = [];
  for (const r of righe) {
    av.fatti++;
    if (NON_MONTARE.test(`${r.valore ?? ''} ${r.descrizioneBom ?? ''} ${r.pn ?? ''}`)) { r.esito = ESITI.NON_MONTATO; r.note.push('componente da non montare'); continue; }
    if (NON_COMPONENTE.test(`${r.valore ?? ''} ${r.descrizioneBom ?? ''} ${r.pn ?? ''} ${r.footprint ?? ''}`) || NON_COMPONENTE.test(r.designatori ?? '')) {
      r.esito = ESITI.NON_MONTATO; r.note.push('non è un componente da acquistare (fiducial, foro, logo)'); continue;
    }
    const [famDec, aDec] = decodificaMpn(r.pn);
    const famColonna = String((r as any)._fam ?? '').toUpperCase() || null;
    // senza colonna valore il valore si cerca nella descrizione (es. "RES 10K 1% 0402")
    const [famBom, aBom] = daColonneBom(famDec ?? famColonna, r.valore ?? r.descrizioneBom, r.footprint, r.descrizioneBom, r.designatori);
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
    } else if (r.pn && fornitoriConfigurati().digikey && dk && !dk.prodotto) r.note.push('non trovato su DigiKey');
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
        if (l.famiglia && l.famiglia !== r.famiglia) { r.note.push(`IA: secondo l'IA è ${l.famiglia}`); continue; }
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

/** Quantità, scarto, fornitore migliore e reperibilità per ogni quantità di schede. */
export async function calcolaAcquisti(righe: RigaBom[], quantita: number[], perPnDist?: Map<string, Partial<Record<Fornitore, RisultatoFornitore>>>) {
  const regole = await caricaRegoleScarto();
  for (const r of righe) {
    const pn = r.pn ?? r.mpnAcquisto ?? null;
    if (perPnDist && pn) r.offerte = Object.values(perPnDist.get(pnKey(pn)!) ?? {}).flatMap(x => x?.offerte ?? []);
    r.acquisti = []; r.reperibilita = undefined;
    if (r.esito === ESITI.NON_MONTATO || r.clienteFornisce || !(r.qtaScheda > 0)) continue;
    for (const schede of quantita) {
      const netta = Math.ceil(r.qtaScheda * schede);
      const migliore0 = sceltaMigliore(r.offerte, netta);
      const p0 = migliore0 ? prezzoUnitario(migliore0.offerta, netta) : null;
      const sc = pezziScarto(r.famiglia, p0, netta, regole);
      const lorda = netta + sc.pezzi;
      const s = sceltaMigliore(r.offerte, lorda);
      r.acquisti.push({ schede, netta, scarto: sc.pezzi, regolaScarto: sc.regola, lorda,
        scelta: s ? { fornitore: s.offerta.fornitore, codice: s.offerta.codiceFornitore, mpn: s.offerta.mpn, qta: s.acquisto.qta, prezzo: s.acquisto.prezzo,
          totale: s.acquisto.totale, nota: s.acquisto.nota, disponibile: s.disponibile, url: s.offerta.url } : undefined });
    }
    const max = Math.max(0, ...r.acquisti.map(x => x.lorda));
    if (!Object.values(fornitoriConfigurati()).some(Boolean)) continue; // nessun distributore collegato: niente giudizio
    r.reperibilita = r.pn || r.mpnAcquisto ? reperibilita(r.offerte, max) : { livello: 'attenzione', motivi: ['senza P/N: nessun equivalente trovato, prezzo non disponibile'] };
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

export async function salvaRighe(id: number, righe: RigaBom[]) {
  const a = await q1<{ quantita: number[] }>(`SELECT quantita FROM bom_analisi WHERE id = $1`, [id]);
  await q(`UPDATE bom_analisi SET righe = $2, riepilogo = $3, aggiornato_il = now() WHERE id = $1`,
    [id, JSON.stringify(righe.map(r => { const { _fam, ...x } = r as any; return x; })), JSON.stringify(riepilogo(righe, a?.quantita ?? []))]);
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
    const row = wa.addRow([r.n, r.pn ?? (r.mpnAcquisto ? `(${r.mpnAcquisto})` : null), r.codiceGestionale, r.qtaScheda, r.reperibilita?.livello ?? '', r.reperibilita?.motivi.join('; ') ?? '',
      ...r.acquisti.flatMap(x => [x.netta, x.scarto, x.scelta?.qta ?? x.lorda, x.scelta ? NOMI_FORNITORI[x.scelta.fornitore] : '', x.scelta?.codice ?? '', x.scelta?.prezzo ?? null, x.scelta?.totale ?? null])]);
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
