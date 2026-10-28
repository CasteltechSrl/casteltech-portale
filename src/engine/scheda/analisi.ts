/**
 * Incrocio dei documenti di una scheda (BOM, pick and place, CAD, forature, Gerber) e segnalazioni per il preventivo e la produzione.
 * Regole di Adriano (27/10/2026):
 *  - SMD su tutti e due i lati → THT saldati a mano; altrimenti a onda (i casi particolari per ora li decide l'ufficio).
 *  - Stagno: onda 0,016 g a foro + 20% di scorie; filo per saldatura a mano 0,125 g a piedino; pasta 1,5 g ogni 400–500 componenti.
 *  - Il codice del componente: quello del cliente se è nella BOM, altrimenti la codifica Casteltech (sezione Componenti).
 * Nessun accesso al database.
 */
import { elencoDesignatori, nomiColonne, pnKey, rigaIntestazione, rilevaColonne } from '../codifica/bom.js';
import type { ComponenteCad } from './gencad.js';
import { contaRefori, type Foratura } from './foratura.js';
import type { Lato, LetturaPickPlace, Posizione } from './pick-place.js';
import type { Piazzola } from './gerber.js';
import { controllaPiazzole } from './piazzole.js';

export const CONSUMI = {
  ondaGrammiForo: 0.016,
  ondaScorie: 0.20,
  filoGrammiPiedino: 0.125,
  pastaGrammi: 1.5,
  pastaOgniComponenti: 450, // "ogni 400–500 componenti": si usa il valore di mezzo
} as const;

export type Livello = 'errore' | 'avviso' | 'info';
export interface Segnalazione { livello: Livello; testo: string; refs?: string[] }

export interface RigaBomScheda {
  riga: number;              // numero di riga nel file (da 1)
  designatori: string[];
  quantita: number | null;
  pn: string; produttore: string; valore: string; footprint: string; descrizione: string;
  montaggio: 'SMD' | 'THT' | null;   // come lo scrive il cliente
  montato: boolean;                  // false = DNP / non montare
  note: string;
}

export interface Componente {
  ref: string;
  lato: Lato | null;
  tipo: 'SMD' | 'THT';
  tipoDa: 'CAD' | 'pick and place' | 'BOM' | 'impronta' | 'predefinito';
  montato: boolean;
  piediniTht: number | null;
  bom?: { riga: number; pn: string; produttore: string; valore: string; footprint: string; descrizione: string; note: string };
  pp?: { valore: string; footprint: string; x: number; y: number; rot: number; codice?: string };
  codiceCliente: string;     // P/N della BOM, o codice scritto dal cliente nel pick and place
  segnalazioni: string[];
  pin1?: { x: number; y: number }; // piedino 1 dal file CAD (verso di montaggio)
}

export interface StratoGerberInfo { nome: string; ruolo: RuoloStrato; lato: Lato | null }
export type RuoloStrato = 'rame' | 'maschera' | 'pasta' | 'serigrafia' | 'contorno' | 'interno' | 'foratura' | 'altro';

export interface AnalisiScheda {
  componenti: Componente[];
  conteggi: {
    smdTop: number; smdBot: number; tht: number; nonMontati: number;
    feederTop: number; feederBot: number; codiciTht: number; item: number;
    refori: number | null; reforiDa: 'CAD' | 'foratura' | null; vias: number | null; foriNonMetallizzati: number | null;
    fiducialTop: number; fiducialBot: number;
  };
  lavorazione: {
    latiSmd: 0 | 1 | 2;
    latoSmdUnico: Lato | null;         // se gli SMD sono su un lato solo: quello (per il preventivo è "solo TOP")
    latoCorpiTht: Lato | null;
    saldaturaTht: 'onda' | 'mano' | null;
    motivo: string;
  };
  consumi: { pastaGrammi: number; stagnoOndaGrammi: number; filoGrammi: number };
  dimensioni: { larghezza: number; altezza: number; stima: boolean } | null;
  noteCliente: { refs: string[]; nota: string }[];
  segnalazioni: Segnalazione[];
  piazzole?: { controllati: number; misurati: number; diversi: number };
}

// ───────────────────────────── BOM ─────────────────────────────

const RE_SMD = /^(SMD|SMT|SM|SURFACE ?MOUNT)$/i;
const RE_THT = /^(THT|PTH|TH|THROUGH ?HOLE|TRADIZIONALE)$/i;
const RE_NON_MONTATO = /^(NO|N|NM|DNP|DNF|DNI|NON MONTARE|NON MONTATO|NOT MOUNTED|NOT FITTED|NO MOUNT|NOPOP|FALSE|0)$/i;
const RE_VALORE_DNP = /^(DNP|DNF|DNI|NM|N\.M\.|NON MONTARE|NOT ?MOUNTED|NOT ?FITTED|NO ?POP)$/i;

/** Righe della BOM con le colonne riconosciute (anche quelle che servono qui: montaggio SMD/THT, montato sì/no, note). */
export function leggiBomScheda(righe: string[][]): { righe: RigaBomScheda[]; colonne: Record<string, string>; avvisi: string[] } {
  const avvisi: string[] = [];
  const h = rigaIntestazione(righe);
  const colonne = nomiColonne(righe[h] ?? []);
  const dati = righe.slice(h + 1).filter(r => r.some(c => String(c ?? '').trim()));
  const mappa = rilevaColonne(colonne, dati) as Record<string, string>;
  const idx = (nome?: string) => nome ? colonne.indexOf(nome) : -1;
  const usate = new Set(Object.values(mappa));
  const norm = (c: string) => c.toUpperCase().replace(/\s+/g, ' ').trim();
  const celle = (i: number) => dati.map(r => String(r[i] ?? '').trim()).filter(Boolean);
  // montaggio SMD/THT: titolo o contenuto
  let iMont = colonne.findIndex(c => !usate.has(c) && /MOUNT(ING)?[ _]?TYPE|M\.? ?TYPE|MONTAGGIO|TECNOLOGIA|AS\. ?METHOD|ASSEMBLY TYPE|TIPO MONTAGGIO/.test(norm(c)));
  if (iMont < 0) iMont = colonne.findIndex((c, i) => !usate.has(c) && celle(i).length >= 3 && celle(i).filter(v => RE_SMD.test(v) || RE_THT.test(v)).length / celle(i).length >= 0.6);
  // montato sì/no
  const iMontato = colonne.findIndex((c, i) => i !== iMont && !usate.has(c) && /^(MOUNTED|MONTATO|MONTARE|FITTED|POPULATED?|POPULATE|DNP|ASSEMBLED|FIT)$/.test(norm(c)));
  const iNote = colonne.findIndex(c => !usate.has(c) && /^(NOTE|NOTES|NOTA|ASS\.?Y NOTE|NOTE DI MONTAGGIO|ASSEMBLY NOTE|COMMENTI?)$/.test(norm(c)));
  const iNote2 = colonne.findIndex((c, i) => i !== iNote && !usate.has(c) && /ASS\.?Y NOTE|ASSEMBLY NOTE/.test(norm(c)));
  if (!mappa.designatori) avvisi.push('Nella BOM non trovo la colonna dei riferimenti (R1, C2…): non si può incrociare con il pick and place.');
  const out: RigaBomScheda[] = [];
  dati.forEach((r) => {
    const cella = (i: number) => i >= 0 ? String(r[i] ?? '').trim() : '';
    const designatori = elencoDesignatori(cella(idx(mappa.designatori))).filter(d => /^[A-Z]{1,8}_?\d+[A-Z]?$/.test(d));
    if (!designatori.length && !cella(idx(mappa.pn))) return;
    const montaggioTesto = cella(iMont);
    const montatoTesto = cella(iMontato);
    const valore = cella(idx(mappa.valore));
    const q = Number(cella(idx(mappa.quantita)).replace(',', '.'));
    out.push({
      riga: righe.indexOf(r) + 1, designatori,
      quantita: cella(idx(mappa.quantita)) && Number.isFinite(q) ? q : null,
      pn: cella(idx(mappa.pn)), produttore: cella(idx(mappa.produttore)), valore, footprint: cella(idx(mappa.footprint)), descrizione: cella(idx(mappa.descrizione)),
      montaggio: RE_SMD.test(montaggioTesto) ? 'SMD' : RE_THT.test(montaggioTesto) ? 'THT' : null,
      montato: !(montatoTesto && RE_NON_MONTATO.test(montatoTesto)) && !RE_VALORE_DNP.test(valore),
      note: [cella(iNote), cella(iNote2)].filter(Boolean).join(' · '),
    });
  });
  return { righe: out, colonne: { ...mappa, ...(iMont >= 0 ? { montaggio: colonne[iMont] } : {}), ...(iMontato >= 0 ? { montato: colonne[iMontato] } : {}), ...(iNote >= 0 ? { note: colonne[iNote] } : {}) }, avvisi };
}

// ───────────────────────────── confronti ─────────────────────────────

const RE_IMPRONTA_THT = /(^|[_\-\s])(THT|PTH|TH|DIP\d*|SIP\d*|RADIAL|AXIAL|TO-?220|TO-?92|TO-?247|HC-?49|FASTON|PINHEADER|HEADER|JACK|RJ45|PHOENIX|MORSETT|TERMINAL|SUPERCAP)([_\-\s]|$)|_P\d+(\.\d+)?MM|SIP\d{3}|CONN_USB_DUAL/i;
const RE_CASE = /(?:^|[^0-9])(01005|0201|0402|0603|0805|1206|1210|1812|2010|2512)(?:[^0-9]|$)/;
const caseDi = (s: string) => RE_CASE.exec(s.toUpperCase().replace(/EIA/g, ' '))?.[1] ?? null;
const pulisci = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
const pezzi = (s: string) => s.toUpperCase().split(/[\s_\-/,;()]+/).filter(Boolean);

/** Valore di un passivo in numero (100n = 1e-7, 4K7 = 4700, 0R = 0), null se non è un valore. */
export function numeroPassivo(s: string): number | null {
  const t = s.trim().toUpperCase().replace(',', '.').replace(/Ω|OHMS?$/i, '').replace(/µ/g, 'U');
  const m = /^(\d+(?:\.\d+)?)([PNUMKGR]?)(\d*)(F|H)?$/.exec(t);
  if (!m) return null;
  const mult: Record<string, number> = { P: 1e-12, N: 1e-9, U: 1e-6, M: 1e-3, K: 1e3, G: 1e9, R: 1, '': 1 };
  const base = m[3] ? Number(`${m[1]}.${m[3]}`) : Number(m[1]);
  return base * (m[2] === 'M' && !m[4] && /^\d+M\d*$/.test(t) ? 1e6 : mult[m[2]]);
}

/** BOM e pick and place parlano dello stesso componente? Basta che uno contenga il P/N o il valore dell'altro. */
export function stessoComponente(bom: { pn: string; valore: string }, testoPp: string): boolean {
  const pp = pulisci(testoPp);
  if (!pp) return true; // il pick and place non dice il valore (es. Allegro): niente da confrontare
  if (/EXPOSED ?PAD|THERMAL ?PAD/i.test(testoPp)) return true; // piazzola del corpo (es. connettori Corticale DB-04): non è un valore
  const pn = pulisci(bom.pn);
  if (pn.length >= 4 && (pp.includes(pn) || pn.includes(pp))) return true;
  // il pick and place scrive un altro codice produttore (es. LED LTST-S270KRKT contro LTST-C191KRKT in BOM): componente diverso
  const sembraPn = (t: string) => t.length >= 6 && /\d/.test(t) && /[A-Z]/.test(t) && numeroPassivo(t) == null && !/^\d+(MM|MIL|V|VAC|VDC|W|MW|PPM|TOL)$/.test(t);
  if (pn.length >= 6 && /\d/.test(pn) && /[A-Z]/.test(pn) && pezzi(testoPp).some(sembraPn)) return false;
  const val = pulisci(bom.valore);
  if (val.length >= 3 && (pp.includes(val) || val.includes(pp))) return true;
  const primo = pezzi(bom.valore)[0] ?? '';
  const tokPp = pezzi(testoPp);
  if (primo.length >= 2 && tokPp.includes(primo)) return true;
  const nb = numeroPassivo(primo), np = numeroPassivo(tokPp.find(t => numeroPassivo(t) != null) ?? '');
  if (nb != null && np != null) return Math.abs(nb - np) <= Math.abs(nb) * 1e-6;
  // parole del P/N (es. "KEYELCO 1287-ST" e "…KEYSTONE_1287-ST")
  const tokPn = pezzi(bom.pn).filter(t => t.length >= 4 && /\d/.test(t));
  return tokPn.some(t => tokPp.includes(t));
}

const tipoDaImpronta = (s: string) => RE_IMPRONTA_THT.test(s) ? 'THT' as const : null;
const arrot = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

export interface IngressoAnalisi {
  bom?: { nome: string; righe: RigaBomScheda[] } | null;
  pickPlace?: { nome: string; lettura: LetturaPickPlace }[];
  cad?: { nome: string; componenti: ComponenteCad[] } | null;
  forature?: { nome: string; foratura: Foratura }[];
  strati?: StratoGerberInfo[];
  contorno?: { x0: number; y0: number; x1: number; y1: number } | null;
  contornoStimato?: boolean; // true = non c'è lo strato del contorno: misure prese dal rame
  piazzole?: Partial<Record<Lato, Piazzola[]>>; // piazzole del rame (o della pasta) per lato, per il controllo del case
}

export function analizzaScheda(ing: IngressoAnalisi): AnalisiScheda {
  const seg: Segnalazione[] = [];
  const S = (livello: Livello, testo: string, refs?: string[]) => seg.push({ livello, testo, ...(refs?.length ? { refs } : {}) });

  // ── pick and place (più file: si uniscono; file doppi uguali si ignorano) ──
  const pp = new Map<string, Posizione>();
  const fiducial: LetturaPickPlace['fiducial'] = [];
  for (const f of ing.pickPlace ?? []) {
    const nuovi = f.lettura.posizioni.filter(p => !pp.has(p.ref));
    const giaVisti = f.lettura.posizioni.filter(p => pp.has(p.ref));
    const diversi = giaVisti.filter(p => { const q = pp.get(p.ref)!; return Math.hypot(p.x - q.x, p.y - q.y) > 0.05 || p.lato !== q.lato; });
    if (giaVisti.length && !nuovi.length && !diversi.length) { S('info', `${f.nome}: stesso contenuto di un altro pick and place, ignorato.`); continue; }
    if (diversi.length) S('errore', `${f.nome}: ${diversi.length} componenti hanno posizione o lato diversi da un altro pick and place del pacchetto.`, diversi.map(p => p.ref));
    for (const p of nuovi) pp.set(p.ref, p);
    for (const fd of f.lettura.fiducial) if (!fiducial.some(g => g.lato === fd.lato && Math.hypot(g.x - fd.x, g.y - fd.y) < 0.05)) fiducial.push(fd);
    for (const a of f.lettura.avvisi) S('avviso', `${f.nome}: ${a}`);
  }
  const haPp = (ing.pickPlace ?? []).length > 0;

  // ── BOM: riferimento → riga ──
  const bomPerRef = new Map<string, RigaBomScheda>();
  const ripetuti = new Set<string>();
  for (const r of ing.bom?.righe ?? []) {
    if (r.quantita != null && r.designatori.length && r.quantita !== r.designatori.length && r.montato)
      S('avviso', `BOM riga ${r.riga}: quantità ${r.quantita} ma ${r.designatori.length} riferimenti.`, r.designatori);
    for (const d of r.designatori) {
      const prima = bomPerRef.get(d);
      if (prima) { ripetuti.add(d); if (!prima.pn && r.pn) bomPerRef.set(d, r); }
      else bomPerRef.set(d, r);
    }
  }
  if (ripetuti.size) S('avviso', `${ripetuti.size} riferimenti compaiono in più righe della BOM (alternative o doppioni): uso la riga con il codice produttore.`, [...ripetuti]);
  const haBom = !!ing.bom && ing.bom.righe.length > 0;

  const cad = new Map((ing.cad?.componenti ?? []).map(c => [c.ref, c]));

  // ── elenco unico dei riferimenti ──
  const tutti = new Set<string>([...bomPerRef.keys(), ...pp.keys(), ...cad.keys()]);
  const componenti: Componente[] = [];
  for (const ref of [...tutti].sort(ordinaRef)) {
    const b = bomPerRef.get(ref), p = pp.get(ref), c = cad.get(ref);
    const note: string[] = [];
    const montato = b ? b.montato : true;
    // tipo SMD/THT: CAD > pick and place "_TH_" > BOM > impronta > SMD
    let tipo: 'SMD' | 'THT', tipoDa: Componente['tipoDa'];
    const daImpronta = tipoDaImpronta(`${p?.footprint ?? ''} ${p?.valore ?? ''} ${b?.footprint ?? ''} ${c?.impronta ?? ''}`);
    if (c) { tipo = c.tht ? 'THT' : 'SMD'; tipoDa = 'CAD'; }
    else if (p?.tht) { tipo = 'THT'; tipoDa = 'pick and place'; }
    else if (b?.montaggio) { tipo = b.montaggio; tipoDa = 'BOM'; }
    else if (daImpronta) { tipo = daImpronta; tipoDa = 'impronta'; }
    else { tipo = 'SMD'; tipoDa = 'predefinito'; }
    const dichiarato = b?.montaggio ?? (c?.montaggioDichiarato ? (RE_SMD.test(c.montaggioDichiarato) ? 'SMD' : RE_THT.test(c.montaggioDichiarato) ? 'THT' : null) : null);
    if (c && dichiarato && dichiarato !== tipo) note.push(`${b?.montaggio ? 'la BOM' : 'il CAD'} dice ${dichiarato}, ma l'impronta ${tipo === 'THT' ? `ha ${c.piediniTht} fori passanti` : 'non ha fori'}: è ${tipo}`);
    if (b && p && montato && !stessoComponente(b, `${p.valore} ${p.codice ?? ''}`)) note.push(`BOM: ${[b.valore, b.pn].filter(Boolean).join(' / ')} — pick and place: ${p.valore}`);
    const caseB = b ? caseDi(`${b.footprint} ${b.valore}`) : null, caseP = p ? caseDi(`${p.footprint} ${p.valore}`) : null;
    if (caseB && caseP && caseB !== caseP && montato) note.push(`case diverso: BOM ${caseB}, pick and place ${caseP}`);
    if (b && !montato && p) note.push('non montato (BOM) ma presente nel pick and place');
    if (c && p && (c.lato !== p.lato)) note.push(`lato diverso: CAD ${c.lato}, pick and place ${p.lato}`);
    componenti.push({
      ref, lato: p?.lato ?? c?.lato ?? (tipo === 'THT' ? 'TOP' : null), tipo, tipoDa, montato,
      piediniTht: tipo === 'THT' ? (c?.piediniTht ?? null) : null,
      ...(b ? { bom: { riga: b.riga, pn: b.pn, produttore: b.produttore, valore: b.valore, footprint: b.footprint, descrizione: b.descrizione, note: b.note } } : {}),
      ...(p ? { pp: { valore: p.valore, footprint: p.footprint, x: arrot(p.x, 3), y: arrot(p.y, 3), rot: p.rot, ...(p.codice ? { codice: p.codice } : {}) } } : {}),
      codiceCliente: b?.pn || p?.codice || '',
      segnalazioni: note,
      ...(c?.pin1 ? { pin1: { x: arrot(c.pin1.x, 3), y: arrot(c.pin1.y, 3) } } : {}),
    });
  }

  // ── segnalazioni sui riferimenti ──
  const montati = componenti.filter(c => c.montato);
  if (haBom && haPp) {
    const senzaPp = montati.filter(c => c.bom && !c.pp);
    const smdSenzaPp = senzaPp.filter(c => c.tipo === 'SMD').map(c => c.ref), thtSenzaPp = senzaPp.filter(c => c.tipo === 'THT').map(c => c.ref);
    if (smdSenzaPp.length) S('errore', `${smdSenzaPp.length} componenti SMD della BOM non sono nel pick and place.`, smdSenzaPp);
    if (thtSenzaPp.length) S('info', `${thtSenzaPp.length} THT della BOM non sono nel pick and place (normale se si montano a mano).`, thtSenzaPp);
    const senzaBom = componenti.filter(c => c.pp && !c.bom);
    const meccanici = senzaBom.filter(c => /^(MH|H|HOLE|MP|TP|LOGO|FM|MARK|MTG|PAD|EP)\d*$/.test(c.ref.replace(/\d+$/, '')) || /^(MH|H|TP|MP)\d/.test(c.ref) || /EXPOSED ?PAD|MOUNTING ?HOLE|TEST ?POINT/i.test(`${c.pp?.valore ?? ''} ${c.pp?.footprint ?? ''}`));
    const veri = senzaBom.filter(c => !meccanici.includes(c));
    if (veri.length) S('errore', `${veri.length} componenti del pick and place non sono nella BOM.`, veri.map(c => c.ref));
    if (meccanici.length) S('info', `${meccanici.length} riferimenti del pick and place senza riga di BOM sembrano fori, punti di test o parti meccaniche.`, meccanici.map(c => c.ref));
  }
  if (ing.cad && haPp) {
    const soloCad = componenti.filter(c => cad.has(c.ref) && !pp.has(c.ref) && c.montato).map(c => c.ref);
    if (soloCad.length) S('avviso', `${soloCad.length} componenti del CAD non sono nel pick and place.`, soloCad);
  }
  const diversi = montati.filter(c => c.segnalazioni.some(s => s.startsWith('BOM:')));
  if (diversi.length) S('errore', `${diversi.length} componenti hanno un valore diverso tra BOM e pick and place: controllare la revisione dei file.`, diversi.map(c => c.ref));
  const tipoSbagliato = montati.filter(c => c.segnalazioni.some(s => s.includes('fori passanti') || s.includes('non ha fori')));
  if (tipoSbagliato.length) S('errore', `${tipoSbagliato.length} componenti sono dichiarati con il montaggio sbagliato (SMD/THT) rispetto all'impronta.`, tipoSbagliato.map(c => c.ref));
  const caseDiversi = montati.filter(c => c.segnalazioni.some(s => s.startsWith('case diverso')));
  if (caseDiversi.length) S('avviso', `${caseDiversi.length} componenti hanno un case diverso tra BOM e pick and place.`, caseDiversi.map(c => c.ref));
  const latiDiversi = montati.filter(c => c.segnalazioni.some(s => s.startsWith('lato diverso')));
  if (latiDiversi.length) S('errore', `${latiDiversi.length} componenti hanno il lato diverso tra CAD e pick and place.`, latiDiversi.map(c => c.ref));
  // piazzole del Gerber contro il case della BOM (IPC-7351)
  let controlloPiazzole: AnalisiScheda['piazzole'];
  if (ing.piazzole && Object.values(ing.piazzole).some(v => v?.length)) {
    const chip = montati.filter(c => c.tipo === 'SMD' && c.pp && c.lato).map(c => ({
      ref: c.ref, lato: c.lato!, x: c.pp!.x, y: c.pp!.y,
      caseAtteso: (c.bom ? caseDi(`${c.bom.footprint} ${c.bom.valore} ${c.bom.descrizione}`) : null) ?? caseDi(`${c.pp!.footprint} ${c.pp!.valore}`) ?? '',
    })).filter(c => c.caseAtteso);
    const esiti = controllaPiazzole(chip, ing.piazzole);
    const misurati = esiti.filter(e => e.misura), diversi = esiti.filter(e => e.ok === false);
    controlloPiazzole = { controllati: esiti.length, misurati: misurati.length, diversi: diversi.length };
    for (const e of diversi) {
      const k = componenti.find(c => c.ref === e.ref)!;
      k.segnalazioni.push(`piazzole da ${e.caseSimile} (passo ${arrot(e.misura!.passo, 2)} mm, larghezza ${arrot(e.misura!.larghezza, 2)} mm), case in BOM ${e.caseAtteso}`);
    }
    if (diversi.length) S('errore', `${diversi.length} componenti hanno le piazzole del Gerber di un altro case rispetto alla BOM (norma IPC-7351): controllare prima di andare in macchina.`, diversi.map(e => e.ref));
    if (esiti.length >= 5 && misurati.length < esiti.length * 0.3)
      S('info', `Controllo piazzole: trovate solo per ${misurati.length} componenti chip su ${esiti.length} (origine delle coordinate diversa o piazzole disegnate a tratti).`);
  }

  // due componenti nello stesso punto dello stesso lato
  const conPos = montati.filter(c => c.pp && c.tipo === 'SMD');
  const sovrapposti = new Set<string>();
  for (let i = 0; i < conPos.length; i++) for (let j = i + 1; j < conPos.length; j++) {
    const a = conPos[i], b = conPos[j];
    if (a.lato === b.lato && Math.hypot(a.pp!.x - b.pp!.x, a.pp!.y - b.pp!.y) < 0.2) { sovrapposti.add(a.ref); sovrapposti.add(b.ref); }
  }
  if (sovrapposti.size) S('errore', `${sovrapposti.size} componenti SMD hanno la stessa posizione di un altro sullo stesso lato.`, [...sovrapposti]);
  if (ing.contorno && !ing.contornoStimato) {
    const { x0, y0, x1, y1 } = ing.contorno;
    const fuori = montati.filter(c => c.pp && (c.pp.x < x0 - 0.5 || c.pp.x > x1 + 0.5 || c.pp.y < y0 - 0.5 || c.pp.y > y1 + 0.5)).map(c => c.ref);
    if (fuori.length) S('avviso', `${fuori.length} componenti cadono fuori dal contorno della scheda nel Gerber: controllare l'origine delle coordinate.`, fuori);
  }

  // ── conteggi ──
  const smd = montati.filter(c => c.tipo === 'SMD'), tht = montati.filter(c => c.tipo === 'THT');
  const smdTop = smd.filter(c => c.lato !== 'BOT'), smdBot = smd.filter(c => c.lato === 'BOT');
  const chiave = chiaveCodice;
  const codici = (l: Componente[]) => new Set(l.map(chiave)).size;
  const feederTop = codici(smdTop), feederBot = codici(smdBot), codiciTht = codici(tht);
  const item = new Set(smd.map(chiave)).size + codiciTht + 1; // + il PCB
  const daCad = tht.every(c => c.piediniTht != null) && tht.length > 0;
  const forature = (ing.forature ?? []).map(f => f.foratura);
  const fori = forature.length ? contaRefori(forature) : null;
  let refori: number | null = null, reforiDa: AnalisiScheda['conteggi']['reforiDa'] = null;
  if (daCad) { refori = tht.reduce((s, c) => s + (c.piediniTht ?? 0), 0); reforiDa = 'CAD'; }
  else if (fori) { refori = fori.refori; reforiDa = 'foratura'; }
  if (daCad && fori && Math.abs(fori.refori - refori!) > Math.max(4, refori! * 0.1))
    S('avviso', `Refori: ${refori} dai piedini THT del CAD, ${fori.refori} fori metallizzati da almeno 0,7 mm nella foratura (la differenza può essere di fori di fissaggio o componenti non montati).`);
  if (tht.length && refori == null) S('avviso', 'Mancano CAD e foratura: non posso contare i refori per lo stagno.');
  const fidTop = fiducial.filter(f => f.lato !== 'BOT').length, fidBot = fiducial.filter(f => f.lato === 'BOT').length;
  if (haPp && !fiducial.length) S('avviso', 'Il pick and place non ha fiducial: vanno cercati sul Gerber o sul disegno.');

  // ── lato e saldatura ──
  const latiSmd = ((smdTop.length ? 1 : 0) + (smdBot.length ? 1 : 0)) as 0 | 1 | 2;
  const latoSmdUnico: Lato | null = latiSmd === 1 ? (smdTop.length ? 'TOP' : 'BOT') : null;
  const latiTht = new Set(tht.map(c => c.lato ?? 'TOP'));
  const latoCorpiTht: Lato | null = latiTht.size === 1 ? [...latiTht][0] : latiTht.size ? 'TOP' : null;
  if (latiTht.size > 1) S('avviso', 'Ci sono THT su tutti e due i lati: la saldatura va decisa a mano.', tht.filter(c => c.lato === 'BOT').map(c => c.ref));
  let saldaturaTht: 'onda' | 'mano' | null = null, motivo = '';
  if (!tht.length) motivo = 'Nessun componente THT.';
  else if (latiSmd === 2) { saldaturaTht = 'mano'; motivo = 'SMD su tutti e due i lati: i THT si saldano a mano.'; }
  else {
    saldaturaTht = 'onda';
    motivo = latiSmd === 0 ? 'Solo THT: saldatura a onda.' : 'SMD su un lato solo: THT a onda.';
    if (latoSmdUnico && latoCorpiTht && latoSmdUnico !== latoCorpiTht) {
      motivo += ' Attenzione: gli SMD sono sul lato di saldatura dei THT (servono colla o telaio, altrimenti a mano): caso particolare da valutare.';
      S('avviso', 'Gli SMD sono sul lato che passa sull\'onda: caso particolare da valutare (colla, telaio selettivo o saldatura a mano).');
    }
  }
  if (latoSmdUnico === 'BOT') S('info', 'Gli SMD sono tutti sul lato che il cliente chiama BOTTOM: per noi è una scheda a lato unico ("solo TOP" nel preventivo).');

  // ── strati del Gerber: la pasta deve esserci sui lati con SMD ──
  const strati = ing.strati ?? [];
  const pasta = new Set(strati.filter(s => s.ruolo === 'pasta').map(s => s.lato));
  if (pasta.size) {
    for (const l of ['TOP', 'BOT'] as Lato[]) {
      const conSmd = l === 'TOP' ? smdTop.length > 0 : smdBot.length > 0;
      if (conSmd && !pasta.has(l)) S('avviso', `Ci sono SMD sul lato ${l} ma il Gerber della pasta (lamina) di quel lato manca.`);
      if (!conSmd && pasta.has(l) && haPp) S('avviso', `C'è il Gerber della pasta sul lato ${l} ma nessun SMD in quel lato nel pick and place.`);
    }
  }

  // ── consumi a scheda ──
  const consumi = {
    pastaGrammi: arrot(smd.length * CONSUMI.pastaGrammi / CONSUMI.pastaOgniComponenti, 3),
    stagnoOndaGrammi: saldaturaTht === 'onda' && refori != null ? arrot(refori * CONSUMI.ondaGrammiForo * (1 + CONSUMI.ondaScorie), 3) : 0,
    filoGrammi: saldaturaTht === 'mano' && refori != null ? arrot(refori * CONSUMI.filoGrammiPiedino, 3) : 0,
  };

  // ── note del cliente sulla BOM (es. "MONTARE FUSIBILE T10A 250V") ──
  const notePer = new Map<string, string[]>();
  for (const r of ing.bom?.righe ?? []) if (r.note) notePer.set(r.note, [...(notePer.get(r.note) ?? []), ...r.designatori]);
  const noteCliente = [...notePer].map(([nota, refs]) => ({ nota, refs }));

  const nonMontati = componenti.filter(c => !c.montato).length;
  if (nonMontati) S('info', `${nonMontati} componenti non montati (DNP) esclusi dai conteggi.`, componenti.filter(c => !c.montato).map(c => c.ref));
  if (!haBom) S('avviso', 'Manca la BOM: codici e valori non si possono controllare.');
  if (!haPp) S('avviso', 'Manca il pick and place: lati e posizioni dei componenti non si conoscono.');

  const dimensioni = ing.contorno ? { larghezza: arrot(ing.contorno.x1 - ing.contorno.x0, 1), altezza: arrot(ing.contorno.y1 - ing.contorno.y0, 1), stima: !!ing.contornoStimato } : null;
  const ordine: Record<Livello, number> = { errore: 0, avviso: 1, info: 2 };
  return {
    componenti,
    conteggi: { smdTop: smdTop.length, smdBot: smdBot.length, tht: tht.length, nonMontati, feederTop, feederBot, codiciTht, item, refori, reforiDa,
      vias: fori?.vias ?? null, foriNonMetallizzati: fori?.nonMetallizzati ?? null, fiducialTop: fidTop, fiducialBot: fidBot },
    lavorazione: { latiSmd, latoSmdUnico, latoCorpiTht, saldaturaTht, motivo },
    consumi, dimensioni, noteCliente,
    segnalazioni: seg.sort((a, b) => ordine[a.livello] - ordine[b.livello]),
    ...(controlloPiazzole ? { piazzole: controlloPiazzole } : {}),
  };
}

/** R2 prima di R10; prima le lettere. */
/** Stesso codice = stesso componente da montare (stesso feeder, stessa riga di BOM di montaggio, stesso colore nei disegni THT). */
export const chiaveCodice = (c: Componente) => pnKey(c.codiceCliente) ?? pulisci(`${c.bom?.valore ?? c.pp?.valore ?? ''}|${c.bom?.footprint ?? c.pp?.footprint ?? ''}`);

export function ordinaRef(a: string, b: string): number {
  const ma = /^([A-Z_]*)(\d*)(.*)$/.exec(a)!, mb = /^([A-Z_]*)(\d*)(.*)$/.exec(b)!;
  return ma[1].localeCompare(mb[1]) || (Number(ma[2]) - Number(mb[2])) || ma[3].localeCompare(mb[3]);
}
