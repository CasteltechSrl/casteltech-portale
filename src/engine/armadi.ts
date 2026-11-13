/**
 * Stoccaggio componenti: contenuto degli armadi (Adriano 13/11/2026, "intanto che aspettiamo le API").
 *
 * Due file del programma degli armadi:
 *  - ItemList_armadi.txt: anagrafica dei codici, a tabulazioni, senza intestazione (27 colonne). Servono: 0 codice, 1 descrizione,
 *    5 "fornitore" (= di chi sono i componenti), 7 pezzi totali, 8 seconda descrizione, 17 prezzo. I codici a 0 pezzi non contano.
 *  - reel_archive.csv: le bobine, una per riga, con il codice univoco della bobina. Contano solo quelle NON congelate (Frozen = N)
 *    e con pezzi: la loro somma torna con i pezzi dell'anagrafica. La colonna Supplier dice quasi sempre il cliente.
 *
 * Di chi è una bobina: la sigla della bobina (regola 'bobina', predefinita) o quella del codice (regola 'articolo').
 * "CAST/LPS", "CASTELTECH/AGE" = del cliente dopo la barra (comprata e già fatturata da Casteltech). Le altre sigle diventano Casteltech o un cliente
 * con la tabella delle sigle (SIGLE_CLIENTI, poi le scelte dell'ufficio in impostazioni 'armadi').
 * Valore: pezzi × prezzo (a mano > ultimo acquisto > distributori online > prezzo scritto negli armadi).
 * Componenti dei clienti: valore a parte, per cliente, con la % di riconoscimento (modificabile).
 * Test in tests/armadi.test.ts.
 */
import { FAMIGLIE } from './codifica/regole.js';
import { pnKey } from './codifica/bom.js';
import { prezzoUnitario, type Offerta } from './acquisti.js';
import { leggiCsv } from './codifica/bom.js';

export interface ArticoloLetto {
  codice: string;
  descrizione: string | null;
  descrizioneAlt: string | null;
  proprietario: string;
  quantita: number;
  prezzo: number | null;
}

export interface BobinaLetta {
  bobina: string;
  codice: string;
  quantita: number;
  formato: string | null;
  posizione: string | null;
  produttore: string | null;
  pn: string | null;
  sigla: string;
  msl: string | null;
  ultimoUso: string | null;
  sessione: string | null;
}

const pulito = (s: string | undefined | null) => (s ?? '').replace(/\s+/g, ' ').trim();
const numero = (s: string | undefined) => { const n = Number(String(s ?? '').trim().replace(',', '.')); return Number.isFinite(n) ? n : 0; };

/** Separatore tra i due file quando il browser li manda insieme. */
export const SEPARATORE_FILE = '\n#=====ARCHIVIO BOBINE=====\n';

/** Anagrafica degli armadi (ItemList): solo i codici con pezzi. */
export function leggiAnagraficaArmadi(testo: string): ArticoloLetto[] {
  const out = new Map<string, ArticoloLetto>();
  let righeValide = 0;
  for (const riga of testo.split(/\r?\n/)) {
    const c = riga.split('\t');
    if (c.length < 18) continue;
    righeValide++;
    const codice = pulito(c[0]).toUpperCase();
    const quantita = Math.round(numero(c[7]));
    if (!codice || quantita <= 0) continue;
    const prezzo = numero(c[17]);
    const prima = out.get(codice);
    if (prima) { prima.quantita += quantita; continue; }
    out.set(codice, {
      codice, quantita, prezzo: prezzo > 0 ? prezzo : null,
      descrizione: pulito(c[1]) || null, descrizioneAlt: pulito(c[8]) || null, proprietario: pulito(c[5]).toUpperCase(),
    });
  }
  if (!righeValide) throw new Error('il file dell\'anagrafica degli armadi non è quello giusto (servono le righe a tabulazioni di ItemList)');
  return [...out.values()];
}

/** Archivio delle bobine (reel_archive.csv): solo le bobine attive (non congelate, con pezzi). */
export function leggiArchivioBobine(testo: string): BobinaLetta[] {
  const righe = testo.split(/\r?\n/);
  const intestazione = righe.find(r => /^#?\s*ReelCode\s*,/i.test(r));
  if (!intestazione) throw new Error('il file delle bobine non è quello giusto (manca la riga "ReelCode,ItemCode,Quantity,…")');
  const nomi = intestazione.replace(/^#/, '').split(',').map(x => x.trim().toLowerCase());
  const col = (n: string) => nomi.indexOf(n.toLowerCase());
  const i = {
    bobina: col('ReelCode'), codice: col('ItemCode'), qta: col('Quantity'), formato: col('ReelFormat'), ultimo: col('LastUse'), congelata: col('Frozen'),
    produttore: col('Manufacturer'), sessione: col('SessionCode'), posizione: col('Position'), msl: col('MSL'), sigla: col('Supplier'), pn: col('MPN'),
  };
  if (i.bobina < 0 || i.codice < 0 || i.qta < 0) throw new Error('nel file delle bobine mancano le colonne ReelCode, ItemCode o Quantity');
  const dati = leggiCsv(righe.filter(r => r.trim() && !r.startsWith('#')).join('\n') + '\n', ',');
  const out: BobinaLetta[] = [];
  for (const c of dati) {
    const quantita = Math.round(numero(c[i.qta]));
    const congelata = i.congelata >= 0 && pulito(c[i.congelata]).toUpperCase() === 'Y';
    const codice = pulito(c[i.codice]).toUpperCase();
    if (!codice || quantita <= 0 || congelata) continue;
    const v = (k: number) => (k >= 0 ? pulito(c[k]) || null : null);
    out.push({
      bobina: pulito(c[i.bobina]), codice, quantita, formato: v(i.formato)?.toUpperCase() ?? null, posizione: v(i.posizione), produttore: v(i.produttore)?.toUpperCase() ?? null,
      pn: v(i.pn)?.toUpperCase() ?? null, sigla: (v(i.sigla) ?? '').toUpperCase(), msl: v(i.msl), ultimoUso: v(i.ultimo), sessione: v(i.sessione),
    });
  }
  return out;
}

// ── Proprietari ──────────────────────────────────────────────────────────────

/** Sigla letta. "CAST/LPS", "CASTELTECH/AGE" = del cliente dopo la barra, comprata e già fatturata da Casteltech (Adriano 13/11/2026:
 *  "fa fede la bobina: se è riportato il nome del cliente è del cliente"); solo "CASTELTECH" da sola è di Casteltech. */
export interface SiglaLetta { sigla: string; casteltech: boolean; perConto: string | null }

const CASTELTECH = /^(CASTELTECH|CASTELETCH|CASTELTCH|CASTELTEC|CAST|CAS)$/;
export function leggiSigla(s: string | null | undefined): SiglaLetta {
  const t = pulito(s).toUpperCase().replace(/\s*\/\s*/g, '/');
  if (!t || /^\d+$/.test(t)) return { sigla: '', casteltech: false, perConto: null };          // vuota o numero finito nella colonna sbagliata
  const diviso = /^([A-Z]+)\/(.+)$/.exec(t);
  if (diviso && CASTELTECH.test(diviso[1])) {
    const cliente = leggiSigla(diviso[2]);
    return cliente.sigla ? { ...cliente, perConto: 'comprato da Casteltech' } : { sigla: 'CASTELTECH', casteltech: true, perConto: null };
  }
  if (CASTELTECH.test(t)) return { sigla: 'CASTELTECH', casteltech: true, perConto: null };
  return { sigla: t, casteltech: false, perConto: null };
}

/** Sigle degli armadi → cliente in anagrafica (inizio della ragione sociale) o 'casteltech'. Quelle non in elenco restano "da chiarire".
 *  Adriano 13/11/2026: SANDRA = Arilan, REBIX = NIT, SOLOKEYS = solo Inc.; INFN, CERN, LOSI, SELTA = avanzi di commesse vecchie, di Casteltech. */
export const SIGLE_CLIENTI: Record<string, RegExp | 'casteltech'> = {
  SANDRA: /^ARILAN/, 'SANDRA KAHN': /^ARILAN/, REBIX: /^N\.I\.T\./, INFN: 'casteltech', CERN: 'casteltech', LOSI: 'casteltech', SELTA: 'casteltech',
  CNR: /\bCNR$/, NRC: /\bCNR$/, NCR: /\bCNR$/, CRN: /\bCNR$/, EUROAUTOM: /^EUROAUTOMATIONS/, RB: /^R\.B\. SERVICE/, ATHENATEK: /^ATHENATEK/,
  IDEA: /^IDEA AUTOMAZIONE/, SELEA: /^SELEA\b/, KAIROS: /^KAIROS/, NIT: /^N\.I\.T\./, SILIBIT: /^SILIBIT/, JOX: /JOX/,
  'TREE SOLUTION': /^TREE SOLUTIONS/, TREESOL: /^TREE SOLUTIONS/, TR: /^TREE SOLUTIONS/, IVORY7: /^IVORY7/, NAND: /^N-AND/, UNIVAC: /^UNIVAC/,
  EURO: /^EUROAUTOMATIONS/, 'EUR.AUT.': /^EUROAUTOMATIONS/, EUROAUTOMATIONS: /^EUROAUTOMATIONS/, EUROAUTOMATION: /^EUROAUTOMATIONS/, EA: /^EUROAUTOMATIONS/,
  CABLESTEEL: /^CABLESTEEL/, CHIAROSCURO: /^CHIAROSCURO/, IADR: /IADR/, BOTISUM: /^BOTISUM/, BOT: /^BOTISUM/,
  'TRAN.EM.': /^TRANCERIE EMILIANE/, 'TRAN.EMI': /^TRANCERIE EMILIANE/, LABELPACK: /^LABELPACK/, LPS: /^LPS ELECTRONICS/,
  'GANDONLAB/STUDIMAGNETICI': /^GANDONLAB/, 'GANDONLAB/STUDI MAGNETICI': /^GANDONLAB/, GANDON: /^GANDONLAB/, GANDONLAB: /^GANDONLAB/, GST: /^GANDONLAB/,
  'STUDI MAGNETICI': /^STUDI MAGNETICI/, FORTEK: /^FOR-TEK/, FORTECK: /^FOR-TEK/, K4ENERGY: /^KEY 4 ENERGY/, K4E: /^KEY 4 ENERGY/,
  SISAS: /^SISAS/, VT100: /^VT100/, ELEMASTER: /^ELEMASTER/, AGE: /^A\.G\.E\./, STARTEC: /^STARTEC/, 'RB-SERVICE': /^R\.B\. SERVICE/,
  THS: /^THS\b/, ARTEL: /^ARTEL/, UNAOHM: /^UNAOHM/, 'BE-SOFTWARE': /^BE-SOFTWARE/, DVG: /^DVG AUTOMATION/, DIGIFLY: /^DIGIFLY/,
  OPAL: /^OPAL ELECTRONICS/, WOOLIWEISS: /^WOOLIWEISS/, SOLOKEYS: /^SOLOKEYS, INC/,
};

/** Valore della tabella delle sigle: 'casteltech', 'c<id cliente>' o '' (da chiarire). */
export type ScelteSigle = Record<string, string>;

/** Tabella delle sigle: quella proposta (SIGLE_CLIENTI sui clienti in anagrafica) con sopra le scelte dell'ufficio. */
export function tabellaSigle(sigle: string[], clienti: { id: number; ragione_sociale: string }[], scelte: ScelteSigle = {}): ScelteSigle {
  const out: ScelteSigle = {};
  for (const s of sigle) {
    if (s in scelte) { out[s] = scelte[s]; continue; }
    const re = SIGLE_CLIENTI[s];
    if (re === 'casteltech') { out[s] = 'casteltech'; continue; }
    const c = re ? clienti.find(x => re.test(x.ragione_sociale.toUpperCase())) : undefined;
    out[s] = c ? `c${c.id}` : '';
  }
  return out;
}

/**
 * Cliente di ogni sigla (Adriano 13/11/2026: "Eur.aut., Euro, Euroautom… sono tutte Euroautomations"): scelta salvata > "Di chi è" = un cliente >
 * cliente proposto da SIGLE_CLIENTI. Il cliente serve solo a raggruppare le sigle; di chi è il materiale lo dice sempre "Di chi è"
 * (es. Euroautomations: materiale di Casteltech). '' = nessun cliente.
 */
export function clientiDelleSigle(sigle: string[], clienti: { id: number; ragione_sociale: string }[], tabella: ScelteSigle, scelte: ScelteSigle = {}): ScelteSigle {
  const out: ScelteSigle = {};
  for (const s of sigle) {
    if (s in scelte) { out[s] = scelte[s]; continue; }
    if (/^c\d+$/.test(tabella[s] ?? '')) { out[s] = tabella[s]; continue; }
    const re = SIGLE_CLIENTI[s];
    const c = re && re !== 'casteltech' ? clienti.find(x => re.test(x.ragione_sociale.toUpperCase())) : undefined;
    out[s] = c ? `c${c.id}` : '';
  }
  return out;
}

export interface GruppoSigle { sigle: string[]; cliente: string; diChi: string; diversi: boolean; pezzi: number }

/** Righe della tabella "Di chi sono": le sigle con lo stesso cliente in una riga sola (prima i gruppi per nome del cliente, poi le sigle sole). */
export function gruppiSigle(sigle: string[], tabella: ScelteSigle, clientiSigle: ScelteSigle, pezzi: Map<string, number>, nomi: Map<string, string> = new Map()): GruppoSigle[] {
  const perCliente = new Map<string, string[]>();
  const sole: GruppoSigle[] = [];
  for (const s of sigle) {
    const k = clientiSigle[s] ?? '';
    if (k) perCliente.set(k, [...(perCliente.get(k) ?? []), s]);
    else sole.push({ sigle: [s], cliente: '', diChi: tabella[s] ?? '', diversi: false, pezzi: pezzi.get(s) ?? 0 });
  }
  const gruppi: GruppoSigle[] = [...perCliente].map(([cliente, ss]) => {
    const valori = ss.map(s => tabella[s] ?? '');
    const conta = new Map<string, number>();
    for (const v of valori) conta.set(v, (conta.get(v) ?? 0) + 1);
    const diChi = [...conta].sort((a, b) => b[1] - a[1] || (a[0] ? -1 : 1))[0][0];
    return { sigle: ss, cliente, diChi, diversi: conta.size > 1, pezzi: ss.reduce((t, s) => t + (pezzi.get(s) ?? 0), 0) };
  });
  gruppi.sort((a, b) => (nomi.get(a.cliente) ?? a.cliente).localeCompare(nomi.get(b.cliente) ?? b.cliente));
  return [...gruppi, ...sole];
}

/** Separatore delle sigle di una riga raggruppata nei nomi dei campi del modulo. */
export const SEPARATORE_SIGLE = '|';

export type Regola = 'bobina' | 'articolo';
export interface Proprietario { tipo: 'casteltech' | 'cliente' | 'da_chiarire'; clienteId: number | null; sigla: string; perConto: string | null }

/** Di chi è la bobina (o il codice, se non ha bobine). */
export function proprietario(siglaBobina: string | null, siglaArticolo: string | null, tabella: ScelteSigle, regola: Regola = 'bobina'): Proprietario {
  const b = leggiSigla(siglaBobina), a = leggiSigla(siglaArticolo);
  const s = regola === 'bobina' ? (b.sigla ? b : a) : (a.sigla ? a : b);
  if (s.casteltech) return { tipo: 'casteltech', clienteId: null, sigla: s.sigla, perConto: s.perConto };
  if (!s.sigla) return { tipo: 'da_chiarire', clienteId: null, sigla: '', perConto: null };
  const v = tabella[s.sigla] ?? '';
  if (v === 'casteltech') return { tipo: 'casteltech', clienteId: null, sigla: s.sigla, perConto: null };
  const id = /^c(\d+)$/.exec(v);
  if (id) return { tipo: 'cliente', clienteId: Number(id[1]), sigla: s.sigla, perConto: s.perConto };
  return { tipo: 'da_chiarire', clienteId: null, sigla: s.sigla, perConto: null };
}

// ── Descrizione ──────────────────────────────────────────────────────────────

/** Descrizioni che non dicono nulla: "NEW", vuote, solo la famiglia del programma degli armadi ("SMD_RESISTENZA"). */
export const descrizioneGenerica = (s: string | null | undefined) => { const t = pulito(s).toUpperCase(); return !t || t === 'NEW' || /^(SMD|THT|PTH)_[A-Z ]+$/.test(t); };

/** Suffisso del cliente sui codici Casteltech ("RS-0603-510R-1-100MW_KI" = Kairos): si toglie per cercare nell'archivio. */
export const senzaSuffisso = (codice: string) => codice.toUpperCase().replace(/_[A-Z0-9]{1,4}$/, '').replace(/\.$/, '');

/** Codice di produzione Casteltech ("RS-0402-75R-1-63MW") → "RES 0402 75R 1 63MW". */
export function descrizioneDaCodice(codice: string): string | null {
  const m = /^([A-Z]{2})-(.+)$/.exec(senzaSuffisso(codice));
  const fam = m ? FAMIGLIE[m[1]] : undefined;
  if (!m || !fam) return null;
  return `${fam.breve} ${m[2].replace(/-+/g, ' ').trim()}`;
}

/** Codici Selea di resistenze e condensatori (RST10KF0402, CSC100NX50VN, CSM10UD6V3M, CSE470UM25VN): ultima lettera = case
 *  (M 0402, N 0603, P 0805, R 1206, S 1210), come nell'elenco dei codici Selea. */
const CASE_SELEA: Record<string, string> = { M: '0402', N: '0603', P: '0805', R: '1206', S: '1210' };
const TOLLERANZE_SELEA: Record<string, string> = { F: '1%', J: '5%', B: '0,1%', D: '0,5%', G: '2%' };
export function leggiCodiceSelea(codice: string): { famiglia: 'RS' | 'CC' | 'CE'; case: string; descrizione: string } | null {
  const c = codice.toUpperCase();
  let m = /^RST(\d+[RKM]?\d*)([FJBDG])(\d{4})$/.exec(c);
  if (m) return { famiglia: 'RS', case: m[3], descrizione: `R SMD ${m[1]} ${TOLLERANZE_SELEA[m[2]]} ${m[3]}` };
  m = /^CS([CM])(\d+[PNU]\d*)[A-Z0-9](\d+K?V?\d*)([MNPRS])$/.exec(c);
  if (m) return { famiglia: 'CC', case: CASE_SELEA[m[4]], descrizione: `C SMD ${m[1] === 'M' ? 'MULT ' : ''}CER ${m[2]}F ${m[3].includes('V') ? m[3] : m[3] + 'V'} ${CASE_SELEA[m[4]]}` };
  m = /^CSE(\d+[PNU]\d*)M(\d+V\d*)([A-Z])$/.exec(c);
  if (m) return { famiglia: 'CE', case: m[3], descrizione: `C SMD ELETTROLITICO ${m[1]}F ${m[2]} CASE ${m[3]}` };
  return null;
}

/** "SMD_CONDENSATORE CERAMICO" → "CONDENSATORE CERAMICO SMD". */
const daFamigliaArmadi = (s: string | null) => { const m = /^(SMD|THT|PTH)_(.+)$/.exec(pulito(s).toUpperCase()); return m ? `${m[2]} ${m[1]}` : null; };

export interface DatiDescrizione {
  componente?: { descrizione: string | null; codice_produzione: string | null; pn: string | null; produttore: string | null } | null;
  componenteCliente?: { descrizione: string | null } | null;
  pn?: string | null;
  produttore?: string | null;
}

/** Descrizione completata (spesso negli armadi si è persa) e da dove viene. */
export function descrizioneArticolo(a: Pick<ArticoloLetto, 'codice' | 'descrizione' | 'descrizioneAlt'>, d: DatiDescrizione): { testo: string | null; fonte: string | null } {
  const conPn = (base: string) => {
    const pn = d.componente?.pn ?? d.pn, prod = d.componente?.produttore ?? d.produttore;
    const extra = [prod, pn].filter(x => x && !base.toUpperCase().includes(String(x).toUpperCase())).join(' ');
    return extra ? `${base} (${extra})` : base;
  };
  if (!descrizioneGenerica(a.descrizione)) return { testo: pulito(a.descrizione).toUpperCase(), fonte: 'armadi' };
  if (!descrizioneGenerica(a.descrizioneAlt)) return { testo: pulito(a.descrizioneAlt).toUpperCase(), fonte: 'armadi' };
  if (d.componenteCliente?.descrizione) return { testo: d.componenteCliente.descrizione.toUpperCase(), fonte: 'componenti del cliente' };
  if (d.componente?.descrizione) return { testo: conPn(d.componente.descrizione.toUpperCase()), fonte: 'archivio componenti' };
  const daCodice = descrizioneDaCodice(d.componente?.codice_produzione ?? a.codice);
  if (daCodice) return { testo: conPn(daCodice), fonte: d.componente ? 'archivio componenti' : 'codice Casteltech' };
  const selea = leggiCodiceSelea(a.codice);
  if (selea) return { testo: conPn(selea.descrizione), fonte: 'codice Selea' };
  const famiglia = daFamigliaArmadi(a.descrizione) ?? daFamigliaArmadi(a.descrizioneAlt);
  if (d.pn) return { testo: conPn(famiglia ?? 'COMPONENTE'), fonte: 'bobina' };
  return famiglia ? { testo: famiglia, fonte: 'armadi' } : { testo: null, fonte: null };
}

/** Sembra il P/N di un produttore: lettere e cifre, almeno 5 caratteri, non un valore ("1K8", "100NF", "16V") né un case ("0402"). */
export function sembraPn(t: string): boolean {
  const x = t.toUpperCase().replace(/[.,;:]+$/, '');
  if (/^\d[\d-]{7,}$/.test(x) && (x.includes('-') || x.length >= 9)) return true;     // Molex 39-28-1063, Würth 742792141
  if (x.length < 5 || !/\d/.test(x) || !/[A-Z]/.test(x)) return false;
  if (/POLI|VIE$|PPM|PIN$|^CR\d{4}$|^P\d/.test(x)) return false;
  if (/^\d+([.,]\d+)?[KMRUNPGF]?(\d+)?(F|H|V|W|HZ|MHZ|KHZ|OHM|MA|A|MW|NF|PF|UF|UH|NH|MM)?$/.test(x)) return false;
  if (/^(SMD|THT|SOT|SOD|SOIC|QFN|TSSOP|LQFP|DO|TO)[-\d]*$/.test(x)) return false;
  return true;
}

/** P/N da cercare: un solo codice (in "KAM11206100 - RMC1/8K1003FTP" l'ultimo), senza il prefisso del barcode. */
export function pnPulito(s: string | null | undefined): string | null {
  const parole = pulito(s).toUpperCase().split(/\s+/).filter(p => p !== '-' && sembraPn(p));
  return parole.length ? parole[parole.length - 1].replace(/[.,;:]+$/, '') : null;
}

/** P/N del produttore nella descrizione: prima tra parentesi ("… 0402 (YAG CC0402KRX7R7BB154)"), poi una parola che sembra un P/N
 *  ("C.I. LM317MDCY SMD" → LM317MDCY). */
export function pnDaDescrizione(s: string | null | undefined): string | null {
  const t = pulito(s);
  const m = /\(([^()]*)\)\s*$/.exec(t) ?? /\(([^()]*)\)/.exec(t);
  if (m) {
    const parole = m[1].replace(/\bo equivalente\b/i, '').trim().split(/\s+/).filter(Boolean);
    const pn = [...parole].reverse().find(p => sembraPn(p) && p.length >= 6);
    if (pn) return pn.toUpperCase();
  }
  const fuori = t.replace(/\([^()]*\)/g, ' ').split(/\s+/).filter(p => sembraPn(p) && p.length >= 6);
  return fuori.length ? fuori[0].toUpperCase().replace(/[.,;:]+$/, '') : null;
}

/**
 * P/N da chiedere ai distributori per un codice (Adriano 13/11/2026, codici Selea e Idea senza prezzo): il P/N salvato, ripulito dai prefissi
 * delle etichette ("1P", "P", "3N1", "30P") e dei distributori ("771-", "863-", "576-"), poi ogni P/N scritto nelle descrizioni (prima tra parentesi).
 * Al massimo `max`, senza doppioni.
 */
export function candidatiPn(pn: string | null | undefined, descrizioni: (string | null | undefined)[], max = 6, codice?: string | null): string[] {
  const out: string[] = [];
  const testi = descrizioni.map(d => pulito(d).toUpperCase()).join(' ');
  const metti = (x: string | null | undefined) => {
    const v = (x ?? '').toUpperCase().replace(/[.,;:?)]+$/, '').replace(/^\(+/, '');
    if (v.length >= 5 && sembraPn(v) && !/[%,=+]|MM$|^H\.|^RS-?\d{3}|MBPS$|-CRI$|_SPEZZ|^P?CB_|^(AEC|C0G|NP0|X[5-8]R)|^\d*X?(SOD|SOT|SSOP|TSSOP|MSOP|DFN|XFDFN|QFN)\d*[A-Z]?$/.test(v) && !out.includes(v)) out.push(v);
  };
  /** "LM2575HVS-ADJ/NOPB-ND" → "LM2575HVS-ADJ/NOPB", "BAS16:3000:09316" → "BAS16" */
  const varianti = (x: string) => {
    const nd = /^(.{5,})-ND$/i.exec(x); if (nd) metti(nd[1]);
    if (x.includes(':')) metti(x.split(':')[0]);
  };
  if (pn) {
    const p = pn.toUpperCase();
    // prefissi delle etichette: tolti solo se il resto è scritto nella descrizione, oppure "1P" (identificativo del P/N fornitore)
    for (const pre of ['1P', '3N1', '30P', 'P']) {
      if (p.startsWith(pre) && p.length > pre.length + 4) { const r = p.slice(pre.length); if (pre === '1P' || testi.replace(/[^A-Z0-9]/g, '').includes(r.replace(/[^A-Z0-9]/g, ''))) metti(r); }
    }
    const dist = /^\d{2,3}-(.+)$/.exec(p); if (dist && /[A-Z]/.test(dist[1])) metti(dist[1]);
    metti(p);
    if (p.startsWith('P') && p.length > 8) metti(p.slice(1));   // "P" delle etichette Vishay/Panasonic, anche se la descrizione non lo ripete
  }
  for (const d of descrizioni) {
    const t = pulito(d).toUpperCase();
    const dentro = [...t.matchAll(/\(([^()]*)\)/g)].flatMap(m => m[1].split(/\s+/));
    const fuori = t.replace(/\([^()]*\)/g, ' ').split(/\s+/);
    for (const w of [...dentro, ...fuori]) {
      const x = w.replace(/[.,;:?]+$/, '');
      // "1P" davanti = il resto è il P/N (etichette Würth, Yageo…), anche nelle descrizioni (Adriano 13/11/2026)
      if (/^1P./.test(x) && x.length > 6) metti(x.slice(2));
      if (x.length >= 6) { metti(x); varianti(x); const dd = /^\d{2,3}-(.+)$/.exec(x); if (dd && /[A-Z]/.test(dd[1])) metti(dd[1]); }
    }
  }
  if (pn) varianti(pn.toUpperCase());
  // il codice dell'armadio (Adriano 13/11/2026: "alcuni P/N sono nella descrizione o nel codice"): codice intero se sembra un P/N
  // (2041119-1, AD8009JRTZR2), altrimenti l'ultimo pezzo dei codici a famiglia (TI-MORSETTO-350-6-1984659 → 1984659)
  const c = (codice ?? '').toUpperCase().replace(/_[A-Z]{1,4}$/, '').replace(/[._]+$/, '');
  if (c) {
    if (/^[A-Z]{2}-/.test(c)) { const u = c.split('-').pop()!; if (u.length >= 6 && /\d{3}/.test(u)) metti(u); }
    else if (!/\s/.test(c) && !/^PCB/.test(c)) metti(c);
  }
  return out.slice(0, max);
}

// ── Prezzi ───────────────────────────────────────────────────────────────────

export type FontePrezzo = 'manuale' | 'acquisto' | 'online' | 'armadio' | 'stima';
export const NOMI_FONTI: Record<FontePrezzo, string> = { manuale: 'scritto a mano', acquisto: 'ultimo acquisto', online: 'distributori online', armadio: 'prezzo degli armadi', stima: 'stima da acquisti simili' };
export interface PrezzoCandidato { fonte: FontePrezzo; prezzo: number; data?: string | null; nota?: string | null }

/** Prezzo da usare: a mano > ultimo acquisto > distributori online > prezzo scritto negli armadi > stima da acquisti simili. */
export function scegliPrezzo(candidati: (PrezzoCandidato | null | undefined)[]): PrezzoCandidato | null {
  const ordine: FontePrezzo[] = ['manuale', 'acquisto', 'online', 'armadio', 'stima'];
  const validi = candidati.filter((c): c is PrezzoCandidato => !!c && c.prezzo > 0 && Number.isFinite(c.prezzo));
  for (const f of ordine) { const c = validi.find(x => x.fonte === f); if (c) return c; }
  return null;
}

/** Prezzo online: lo scaglione per i pezzi che abbiamo, il più basso tra i distributori in euro. */
export function prezzoOnline(offerte: Offerta[], quantita: number): { prezzo: number; nota: string } | null {
  let best: { prezzo: number; nota: string } | null = null;
  for (const o of offerte) {
    if (o.valuta && o.valuta !== 'EUR') continue;
    const p = prezzoUnitario(o, Math.max(1, quantita));
    if (p == null || !(p > 0)) continue;
    if (!best || p < best.prezzo) best = { prezzo: p, nota: `${o.fornitore} ${o.mpn}${o.produttore ? ' ' + o.produttore : ''}, prezzo per ${quantita} pz` };
  }
  return best;
}

/** Passivi "da catalogo" (resistenze, condensatori…) senza P/N: prezzo stimato con gli acquisti dello stesso tipo e case. */
const FAMIGLIE_STIMA = new Set(['RS', 'RR', 'CC', 'CE', 'CT', 'CF', 'FR', 'ID', 'NT', 'DZ', 'DI', 'DS', 'DL']);
/** "RS-0402-75R-1-63MW" → "RS-0402" (famiglia + case): null per le famiglie che non si stimano. */
export function gruppoStima(codice: string | null | undefined): string | null {
  const selea = leggiCodiceSelea(codice ?? '');
  if (selea && selea.famiglia !== 'CE') return `${selea.famiglia}-${selea.case}`;
  const m = /^([A-Z]{2})-([A-Z0-9]+)-/.exec(senzaSuffisso(codice ?? ''));
  return m && FAMIGLIE_STIMA.has(m[1]) && !/^(THT|ASS|RAD)$/.test(m[2]) ? `${m[1]}-${m[2]}` : null;
}
/** Gruppo di stima dalla descrizione ("RESISTORE SMD 0603 330OHM" → RS-0603), per i codici dei clienti. */
export function gruppoDaDescrizione(descrizione: string | null | undefined): string | null {
  const d = pulito(descrizione).toUpperCase();
  const c = /\b(0201|0402|0603|0805|1206|1210|2010|2512)\b/.exec(d)?.[1];
  if (!c) return null;
  if (/^(R |R SMD|RES)/.test(d)) return `RS-${c}`;
  if (/^(C |C SMD|CAP|COND)/.test(d) && !/ELETTR|TANT|FILM/.test(d)) return `CC-${c}`;
  return null;
}

/** Mediana dei prezzi d'acquisto per gruppo (almeno 3 prezzi). */
export function stimePerGruppo(prezzi: { codice: string | null; prezzo: number | null }[]): Map<string, { prezzo: number; quanti: number }> {
  const g = new Map<string, number[]>();
  for (const x of prezzi) { const k = gruppoStima(x.codice); if (k && x.prezzo && x.prezzo > 0) g.set(k, [...(g.get(k) ?? []), x.prezzo]); }
  const out = new Map<string, { prezzo: number; quanti: number }>();
  for (const [k, v] of g) {
    if (v.length < 3) continue;
    const o = [...v].sort((a, b) => a - b);
    const m = o.length % 2 ? o[(o.length - 1) / 2] : (o[o.length / 2 - 1] + o[o.length / 2]) / 2;
    out.set(k, { prezzo: Math.round(m * 10000) / 10000, quanti: v.length });
  }
  return out;
}

/** Chiavi con cui cercare il codice negli acquisti e presso i distributori. */
export function chiaviArticolo(codice: string, pns: (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const x of [codice, senzaSuffisso(codice), ...pns]) {
    const k = pnKey(x);
    if (k && k.length >= 4 && /\d/.test(k)) out.add(k);
  }
  return [...out];
}

// ── Riepilogo ────────────────────────────────────────────────────────────────

export interface ArticoloValutato { codice: string; quantita: number; prezzo: number | null; proprietario_file: string | null }
export interface BobinaValutata { codice: string; quantita: number; sigla: string }
export interface Riconoscimento { predefinita: number; clienti: Record<string, number> }

export const riconoscimentoDi = (r: Riconoscimento, clienteId: number) => r.clienti[`c${clienteId}`] ?? r.predefinita;

export interface Quota { codice: string; quantita: number; valore: number; proprietario: Proprietario; conPrezzo: boolean }

/** Pezzi e valore di ogni codice divisi per proprietario (bobina per bobina; senza bobine = proprietario del codice). */
export function quote(articoli: ArticoloValutato[], bobine: BobinaValutata[], tabella: ScelteSigle, regola: Regola): Quota[] {
  const perCodice = new Map<string, BobinaValutata[]>();
  for (const b of bobine) { const l = perCodice.get(b.codice); if (l) l.push(b); else perCodice.set(b.codice, [b]); }
  const out: Quota[] = [];
  for (const a of articoli) {
    const prezzo = a.prezzo ?? 0;
    const bs = perCodice.get(a.codice) ?? [];
    const gruppi = new Map<string, Quota>();
    const somma = (p: Proprietario, q: number) => {
      const k = `${p.tipo}|${p.clienteId ?? ''}|${p.sigla}`;
      const g = gruppi.get(k);
      if (g) { g.quantita += q; g.valore += q * prezzo; } else gruppi.set(k, { codice: a.codice, quantita: q, valore: q * prezzo, proprietario: p, conPrezzo: a.prezzo != null });
    };
    let nelleBobine = 0;
    for (const b of bs) { somma(proprietario(b.sigla, a.proprietario_file, tabella, regola), b.quantita); nelleBobine += b.quantita; }
    // pezzi dell'anagrafica non coperti dalle bobine (o codici senza bobine): al proprietario del codice
    if (a.quantita > nelleBobine) somma(proprietario(null, a.proprietario_file, tabella, regola), a.quantita - nelleBobine);
    out.push(...gruppi.values());
  }
  return out;
}

export interface TotaleCliente { clienteId: number; codici: number; pezzi: number; valore: number; senzaPrezzo: number; percentuale: number; riconosciuto: number }
export interface RiepilogoArmadi {
  casteltech: { codici: number; pezzi: number; valore: number; senzaPrezzo: number };
  clienti: TotaleCliente[];
  daChiarire: { sigla: string; codici: number; pezzi: number; valore: number }[];
  totaleClienti: { valore: number; riconosciuto: number };
}

export function riepilogo(q: Quota[], r: Riconoscimento): RiepilogoArmadi {
  const tondo = (n: number) => Math.round(n * 100) / 100;
  const cast = { codici: new Set<string>(), pezzi: 0, valore: 0, senzaPrezzo: new Set<string>() };
  const cli = new Map<number, { codici: Set<string>; pezzi: number; valore: number; senzaPrezzo: Set<string> }>();
  const dubbi = new Map<string, { codici: Set<string>; pezzi: number; valore: number }>();
  for (const x of q) {
    if (x.proprietario.tipo === 'casteltech') {
      cast.codici.add(x.codice); cast.pezzi += x.quantita; cast.valore += x.valore; if (!x.conPrezzo) cast.senzaPrezzo.add(x.codice);
    } else if (x.proprietario.tipo === 'cliente') {
      const id = x.proprietario.clienteId!;
      const g = cli.get(id) ?? { codici: new Set<string>(), pezzi: 0, valore: 0, senzaPrezzo: new Set<string>() };
      g.codici.add(x.codice); g.pezzi += x.quantita; g.valore += x.valore; if (!x.conPrezzo) g.senzaPrezzo.add(x.codice);
      cli.set(id, g);
    } else {
      const s = x.proprietario.sigla || '(senza sigla)';
      const g = dubbi.get(s) ?? { codici: new Set<string>(), pezzi: 0, valore: 0 };
      g.codici.add(x.codice); g.pezzi += x.quantita; g.valore += x.valore; dubbi.set(s, g);
    }
  }
  const clienti = [...cli.entries()].map(([clienteId, g]) => {
    const percentuale = riconoscimentoDi(r, clienteId);
    return { clienteId, codici: g.codici.size, pezzi: g.pezzi, valore: tondo(g.valore), senzaPrezzo: g.senzaPrezzo.size, percentuale, riconosciuto: tondo(g.valore * percentuale / 100) };
  }).sort((a, b) => b.valore - a.valore);
  return {
    casteltech: { codici: cast.codici.size, pezzi: cast.pezzi, valore: tondo(cast.valore), senzaPrezzo: cast.senzaPrezzo.size },
    clienti,
    daChiarire: [...dubbi.entries()].map(([sigla, g]) => ({ sigla, codici: g.codici.size, pezzi: g.pezzi, valore: tondo(g.valore) })).sort((a, b) => b.pezzi - a.pezzi),
    totaleClienti: { valore: tondo(clienti.reduce((s, c) => s + c.valore, 0)), riconosciuto: tondo(clienti.reduce((s, c) => s + c.riconosciuto, 0)) },
  };
}

/** % scritta dall'ufficio: 0–100, virgola o punto. */
export function percentualeValida(s: unknown): number | null {
  const t = String(s ?? '').trim().replace('%', '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

/** % dei codici con un prezzo (Adriano 13/11/2026: "percentuale tra codici a magazzino e quelli con il prezzo"); null se non ci sono codici. */
export function percentualeConPrezzo(codici: number, senzaPrezzo: number): number | null {
  if (!codici) return null;
  return Math.round(((codici - senzaPrezzo) / codici) * 1000) / 10;
}
