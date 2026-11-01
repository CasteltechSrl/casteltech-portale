/**
 * Lettura delle buste paga (cedolini) come dati (Adriano 1/11/2026: "acquisiscile come dati e valori").
 * Solo lettura del testo del PDF, SENZA IA: i cedolini hanno i dati delle singole persone e restano nell'area riservata.
 *
 * Due modelli:
 * - U.P.A. Federimpresa Piacenza (dal 2022, software OSRA): una pagina per persona, "PERIODO PAGA 08/2026 - Agosto",
 *   "TOTALE RITENUTE / TOTALE COMPETENZE", "NETTO IN BUSTA";
 * - studio precedente (2019–2021, modello Zucchetti): "TipoCosto : Maggio 2021", "TOTALE COMPETENZE", "TOTALE TRATTENUTE",
 *   "NETTO DEL MESE 1.001,00 €" (nel testo del PDF gli spazi delle intestazioni a volte diventano "s": "TOTALEsCOMPETENZE").
 *
 * Il testo arriva da `pdftotext -layout` (o dalla ricostruzione con le stesse colonne): righe con le colonne allineate,
 * pagine separate da "\f". Le voci (codice, descrizione, importo) vanno tra le competenze o tra le ritenute secondo la colonna.
 */
import { numeroIt } from './dipendenti.js';

export type Mensilita = 'ordinaria' | 'tredicesima' | 'quattordicesima';
export const NOMI_MENSILITA: Record<Mensilita, string> = { ordinaria: '', tredicesima: 'tredicesima', quattordicesima: 'quattordicesima' };

export interface VoceCedolino {
  codice: string;
  descrizione: string;
  /** ore, giorni o percentuale scritti nella riga (se ci sono) */
  quantita?: number;
  importo: number;
  /** competenza (si somma al lordo) o ritenuta (si toglie); 'info' = imponibili e righe solo informative */
  tipo: 'competenza' | 'ritenuta' | 'info';
}

export interface CedolinoLetto {
  modello: 'upa' | 'zucchetti';
  anno: number;
  mese: number;
  mensilita: Mensilita;
  matricola: string | null;
  nome: string;
  codice_fiscale: string | null;
  qualifica: string | null;
  livello: string | null;
  mansione: string | null;
  data_assunzione: string | null;
  data_cessazione: string | null;
  ore_lavorate: number | null;
  giorni_lavorati: number | null;
  paga_oraria: number | null;
  /** retribuzione mensile contrattuale (base + scatti + premi) */
  retribuzione: number | null;
  /** totale competenze (lordo del cedolino) */
  lordo: number;
  /** totale ritenute (contributi del dipendente, IRPEF, addizionali, altre trattenute) */
  ritenute: number;
  contributi_dipendente: number | null;
  irpef: number | null;
  addizionali: number | null;
  netto: number;
  voci: VoceCedolino[];
  avvisi: string[];
}

const SOLDI = /-?\d{1,3}(?:\.\d{3})*,\d{2,5}-?/g;
const CF = /\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b/;
const MESI = ['GENNAIO', 'FEBBRAIO', 'MARZO', 'APRILE', 'MAGGIO', 'GIUGNO', 'LUGLIO', 'AGOSTO', 'SETTEMBRE', 'OTTOBRE', 'NOVEMBRE', 'DICEMBRE'];
const tondo = (n: number) => Math.round(n * 100) / 100;
const spazi = (s: string) => s.replace(/\s+/g, ' ').trim();
/** "1/07/2023" o "01-07-2023" → "2023-07-01" */
function dataIso(s: string | undefined): string | null {
  const m = s ? /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s) : null;
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}
const soldi = (s: string) => s.match(SOLDI) ?? [];
const ultimoImporto = (s: string) => { const v = soldi(s); return v.length ? numeroIt(v[v.length - 1]) : null; };

/** Mensilità dal nome del file ("13.TREDICESIMA", "13_13.ME", "13ME 2024") o dal testo del periodo. */
export function mensilitaDa(testo: string): Mensilita {
  const t = testo.toUpperCase();
  if (/QUATTORDICESIMA|(?:^|[^0-9])14[._ ]?MA\b/.test(t)) return 'quattordicesima';
  if (/TREDICESIMA|(?:^|[^0-9])13[._ ]?(?:ME|MA)\b/.test(t)) return 'tredicesima';
  return 'ordinaria';
}

/** Prima riga non vuota dopo quella che contiene l'intestazione. */
function rigaDopo(righe: string[], intestazione: RegExp, salto = 1): string | null {
  const i = righe.findIndex(r => intestazione.test(r));
  if (i < 0) return null;
  let visti = 0;
  for (let j = i + 1; j < Math.min(righe.length, i + 8); j++) {
    // le scritte verticali del margine (es. "ITWorking S.r.l.", "www.itworking.it") finiscono in righe a sé: si saltano
    if (righe[j].trim() && !/^\s*(www\.)?itworking\b/i.test(righe[j])) { visti++; if (visti === salto) return righe[j]; }
  }
  return null;
}

/** Colonne delle ritenute e delle competenze dalla riga d'intestazione delle voci (posizione dove finisce la parola). */
function colonne(intestazione: string, ritenute: RegExp, competenze: RegExp) {
  const r = ritenute.exec(intestazione), c = competenze.exec(intestazione);
  return r && c ? { ritenute: r.index + r[0].length, competenze: c.index + c[0].length } : null;
}

/**
 * Una riga della zona delle voci: l'ultimo importo della riga (non tra parentesi: quelle sono solo informazioni) e la colonna
 * in cui finisce dicono se è una competenza o una ritenuta. Le righe senza codice contano lo stesso ("Esonero 7%",
 * "Rit.Fis. conguaglio", "Tratt.Int.Cong.Cred.", addizionali).
 */
function voceDaRiga(riga: string, col: { ritenute: number; competenze: number } | null, codice: RegExp): VoceCedolino | null {
  if (!col) return null;
  const importi = [...riga.matchAll(SOLDI)];
  if (!importi.length) return null;
  const ultimo = importi[importi.length - 1];
  const fine = ultimo.index! + ultimo[0].length;
  if (/^\s*\)/.test(riga.slice(fine))) return null;
  const meta = (col.ritenute + col.competenze) / 2;
  const tipo: VoceCedolino['tipo'] = fine > meta ? 'competenza' : fine > col.ritenute - 10 ? 'ritenuta' : 'info';
  if (tipo === 'info') return null;
  const t = spazi(riga.slice(0, ultimo.index!)).replace(/^(\*\s*)+/, '');
  const cm = codice.exec(t);
  const resto = cm ? t.slice(cm[0].length) : t;
  const primoNumero = resto.search(/\s(\(?-?\d)/);
  const descrizione = spazi(primoNumero >= 0 ? resto.slice(0, primoNumero) : resto).replace(/\s*\(?Cod\.:.*$/, '');
  // ore / giorni / %: il primo numero con due decimali (il "dato base" ne ha cinque: 14,50678)
  const quantita = primoNumero >= 0 ? soldi(resto.slice(primoNumero)).find(x => /,\d{2}-?$/.test(x)) : undefined;
  return { codice: cm ? cm[1] : '', descrizione, quantita: quantita ? numeroIt(quantita) : undefined, importo: numeroIt(ultimo[0]), tipo };
}

/** Le voci lette devono dare i totali del cedolino: se non tornano lo si dice (i totali restano quelli stampati). */
function controllaVoci(voci: VoceCedolino[], lordo: number, ritenute: number, avvisi: string[]) {
  const somma = (t: VoceCedolino['tipo']) => tondo(voci.filter(v => v.tipo === t).reduce((s, v) => s + v.importo, 0));
  if (Math.abs(somma('competenza') - lordo) > 0.05) avvisi.push(`voci di competenza ${somma('competenza').toFixed(2)} ≠ totale competenze ${lordo.toFixed(2)}`);
  if (Math.abs(somma('ritenuta') - ritenute) > 0.05) avvisi.push(`voci di ritenuta ${somma('ritenuta').toFixed(2)} ≠ totale ritenute ${ritenute.toFixed(2)}`);
}

function leggiPaginaUpa(pagina: string, nomeFile: string): CedolinoLetto | null {
  const righe = pagina.split('\n');
  const persona = rigaDopo(righe, /MATRICOLA \/ COD\. MECC\./);
  const periodo = rigaDopo(righe, /DATA EMISSIONE\s+PERIODO PAGA/);
  if (!persona || !periodo) return null;
  const avvisi: string[] = [];
  // "0000000012\ 12 CROCI ADRIANO"
  const pm = /^\s*(\d*)\s*\\?\s*(\d*)\s+(.+?)\s*$/.exec(persona);
  const nome = spazi(pm ? pm[3] : persona).toUpperCase();
  const matricola = pm ? (pm[2] || (pm[1] ? String(Number(pm[1])) : null)) : null;
  // "IMPIEGATO - IMP. ADD.GEST.ACQ - D2 3 - 95520582/82 …"
  const qual = rigaDopo(righe, /QUALIFICA\s+MANSIONE - LIVELLO/);
  let qualifica: string | null = null, mansione: string | null = null, livello: string | null = null;
  if (qual) {
    const parti = spazi(qual).split(' - ');
    qualifica = parti[0] || null;
    mansione = parti[1] || null;
    livello = parti[2] ? parti[2].split(' ')[0] : null;
  }
  // "22/09/1992 1/07/2023 03 02 CRCDRN92P22D611Z 01 - Operai …": nascita, assunzione, (cessazione)
  const anag = rigaDopo(righe, /DATA NASCITA\s+DATA ASSUNZIONE/) ?? '';
  const cf = CF.exec(anag)?.[0] ?? null;
  const date = (cf ? anag.slice(0, anag.indexOf(cf)) : anag).match(/\d{1,2}\/\d{2}\/\d{4}/g) ?? [];
  // "9/09/2026 08/2026 - Agosto 160,00 20 26 5 63"
  const per = /(\d{2})\/(\d{4})\s*-\s*([A-Za-zÀ-ú]+)\s*(.*)$/.exec(spazi(periodo));
  if (!per) return null;
  const mese = Number(per[1]), anno = Number(per[2]);
  const mensilita = mensilitaDa(per[3]) !== 'ordinaria' ? mensilitaDa(per[3]) : mensilitaDa(nomeFile);
  const dopo = per[4].split(' ');
  const ore = /^\d+,\d{2}$/.test(dopo[0] ?? '') ? numeroIt(dopo[0]) : null;
  const giorni = ore != null && /^\d+$/.test(dopo[1] ?? '') ? Number(dopo[1]) : null;

  const testo = spazi(pagina);
  const pagaOraria = /Paga oraria\s*:\s*([\d.,]+)/.exec(testo);
  const totaleRetr = /Paga giorn\.\s*:\s*[\d.,]+\s+Totale\s*:\s*([\d.,]+)/.exec(testo);
  // totali: ognuno sotto la sua intestazione (un tirocinante non ha ritenute: c'è solo il totale delle competenze)
  const iT = righe.findIndex(r => /TOTALE RITENUTE\s+TOTALE COMPETENZE/.test(r));
  const tot = rigaDopo(righe, /TOTALE RITENUTE\s+TOTALE COMPETENZE/);
  let ritenute = 0, lordo = 0;
  if (iT >= 0 && tot) {
    const fineRit = righe[iT].indexOf('TOTALE RITENUTE') + 'TOTALE RITENUTE'.length;
    for (const m of tot.matchAll(SOLDI)) {
      if (m.index! + m[0].length <= fineRit + 4) ritenute = numeroIt(m[0]); else lordo = numeroIt(m[0]);
    }
  }
  if (!tot || !soldi(tot).length) avvisi.push('totali non letti');

  // netto: l'importo dopo "NETTO IN BUSTA" più vicino a competenze − ritenute (gli arrotondamenti spostano di qualche centesimo)
  // netto: l'importo stampato sotto "NETTO IN BUSTA", nella colonna di destra (a sinistra ci sono gli arrotondamenti, che
  // possono essere grandi quando si recupera un netto negativo del mese prima)
  const iN = righe.findIndex(r => /NETTO IN BUSTA/.test(r));
  let netto = tondo(lordo - ritenute);
  if (iN >= 0) {
    const inizio = righe[iN].indexOf('NETTO IN BUSTA');
    const aDestra = righe.slice(iN + 1, iN + 5).flatMap(r => [...r.matchAll(SOLDI)].filter(m => m.index! + m[0].length > inizio).map(m => numeroIt(m[0])));
    const vicini = righe.slice(iN + 1, iN + 6).flatMap(soldi).map(numeroIt).filter(v => Math.abs(v - (lordo - ritenute)) <= 1.5);
    if (aDestra.length) netto = aDestra[0];
    else if (vicini.length) netto = vicini.sort((a, b) => Math.abs(a - (lordo - ritenute)) - Math.abs(b - (lordo - ritenute)))[0];
    else if (lordo > 0) avvisi.push('netto calcolato (competenze − ritenute)');
  }

  // voci: dalla riga "COD. DESCRIZIONE … RITENUTE COMPETENZE" alla riga "Firma e data"
  const iV = righe.findIndex(r => /COD\.\s+D\s?E\s?S\s?C\s?R\s?I\s?Z\s?I\s?O\s?N\s?E/.test(r));
  const col = iV >= 0 ? colonne(righe[iV], /RITENUTE/, /COMPETENZE/) : null;
  const voci: VoceCedolino[] = [];
  let contributi: number | null = null, irpef: number | null = null, addizionali = 0, haAdd = false;
  for (let j = iV + 1; iV >= 0 && j < righe.length; j++) {
    const r = righe[j];
    if (/TOTALE RITENUTE/.test(r)) break;
    const t = spazi(r);
    if (/^Tot\. rit\. sociali/.test(t)) { contributi = ultimoImporto(t); continue; }
    const v = voceDaRiga(r, col, /^(\d{1,4})\s+/);
    if (!v || v.codice === '999') continue;
    if (v.tipo === 'ritenuta' && /^Rit\.? ?Fis/i.test(v.descrizione)) irpef = tondo((irpef ?? 0) + v.importo);
    if (v.tipo === 'ritenuta' && /^(Add\.|Acconto Add)/i.test(v.descrizione)) { addizionali += v.importo; haAdd = true; }
    voci.push(v);
  }
  controllaVoci(voci, lordo, ritenute, avvisi);
  return {
    modello: 'upa', anno, mese, mensilita, matricola, nome, codice_fiscale: cf, qualifica, livello, mansione,
    data_assunzione: dataIso(date[1]), data_cessazione: dataIso(date[2]), ore_lavorate: ore, giorni_lavorati: giorni,
    paga_oraria: pagaOraria ? numeroIt(pagaOraria[1]) : null, retribuzione: totaleRetr ? numeroIt(totaleRetr[1]) : null,
    lordo, ritenute, contributi_dipendente: contributi, irpef, addizionali: haAdd ? tondo(addizionali) : null, netto, voci, avvisi,
  };
}

/**
 * Qualifica scritta dallo studio precedente ("OPE 5' Livello", "AOP Gr.2 Appr.Prof.…", "Co.Co.Co", "Tir./Stag.") con le stesse
 * parole dello studio attuale (OPERAIO, IMPIEGATO, APPRENDISTA…), così le persone si confrontano negli anni.
 */
export function qualificaZucchetti(t: string | null): string | null {
  if (!t) return null;
  if (/^AOP|Appr|Ap\.?Pr|Ap\.profes/i.test(t)) return 'APPRENDISTA';
  if (/^OPE\b/i.test(t)) return 'OPERAIO';
  if (/^IMP\b/i.test(t)) return 'IMPIEGATO';
  if (/Co\.?\s?Co\.?\s?Co/i.test(t)) return 'COLLABORATORE';
  if (/Tir\.|Stag\./i.test(t)) return 'TIROCINANTE';
  if (/Compensi erogati/i.test(t)) return 'AMMINISTRATORE';
  return null;
}
const livelloZucchetti = (t: string | null) => (t ? /(\d)'\s*Livello|Liv\.?\s?(\d)/i.exec(t)?.slice(1).find(Boolean) ?? null : null);

/** Le intestazioni del modello Zucchetti hanno a volte "s" al posto degli spazi: "TOTALEsCOMPETENZE". */
const zz = (parole: string) => new RegExp(parole.split(' ').join('\\s?s?\\s?'), 'i');

function leggiPaginaZucchetti(pagina: string, nomeFile: string): CedolinoLetto | null {
  const righe = pagina.split('\n');
  const persona = rigaDopo(righe, zz('Codice dipendente'));
  if (!persona) return null;
  const avvisi: string[] = [];
  const cf = CF.exec(persona)?.[0] ?? null;
  const prima = cf ? persona.slice(0, persona.indexOf(cf)) : persona;
  // "0000006 FILIPPI ANTONELLA" oppure (2019–2020) "BINDIA01002BINICI DIANA" con il codice attaccato al nome
  const pm = /^\s*(\d+)\s+(.+?)\s*$/.exec(prima) ?? /^\s*([A-Z]{6}\d{5})(.+?)\s*$/.exec(prima);
  if (!pm) return null;
  const nome = spazi(pm[2]).toUpperCase();
  const matricola = /^\d+$/.test(pm[1]) ? String(Number(pm[1])) : pm[1];
  // periodo: "TipoCosto : Maggio 2021" (o "Dicembre 2019 AGG.")
  const testo = spazi(pagina);
  const per = new RegExp(`(?:TipoCosto|PERIODO)[^]{0,200}?\\b(${MESI.join('|')})\\s+(\\d{4})`, 'i').exec(testo)
    ?? new RegExp(`\\b(${MESI.join('|')})\\s+(\\d{4})\\b`, 'i').exec(testo);
  if (!per) return null;
  const mese = MESI.indexOf(per[1].toUpperCase()) + 1, anno = Number(per[2]);
  const mensilita = mensilitaDa(nomeFile) !== 'ordinaria' ? mensilitaDa(nomeFile)
    : /Tredicesima/i.test(testo) && !/Retribuzione\s/.test(testo) ? 'tredicesima' : 'ordinaria';
  // qualifica e date: righe dopo "Data di Nascita Data Assunzione Data Cessazione"
  const iD = righe.findIndex(r => zz('Data di Nascita').test(r));
  let qualifica: string | null = null, date: string[] = [];
  for (let j = iD + 1; iD >= 0 && j < Math.min(righe.length, iD + 6); j++) {
    const t = spazi(righe[j]);
    if (!t) continue;
    const d = t.match(/\d{2}-\d{2}-\d{4}/g)
      ?? (/^\d{8}(\d{8}){0,2}$/.test(t) ? t.match(/\d{8}/g)!.map(x => `${x.slice(0, 2)}-${x.slice(2, 4)}-${x.slice(4)}`) : null);
    if (d) { date = d; break; }
    if (!qualifica) qualifica = t;
  }
  // ore: riga sotto "Settimane Giorni Ore … Ore ordinarie Ore straordinarie"
  let ore: number | null = null, giorni: number | null = null;
  const iO = righe.findIndex(r => /Ore ordinarie/.test(r));
  if (iO >= 0) {
    const r = righe[iO + 1] ?? '';
    const h = righe[iO];
    const posOre = h.indexOf('Ore ordinarie');
    const valori = [...r.matchAll(/\S+/g)];
    const vOre = valori.find(v => /^\d+,\d{2}$/.test(v[0]) && Math.abs(v.index! - posOre) < 14);
    if (vOre) ore = numeroIt(vOre[0]);
    const posGiorni = [...h.matchAll(/Giorni/g)].map(m => m.index!);
    const vG = posGiorni.length >= 3 ? valori.find(v => /^\d+$/.test(v[0]) && Math.abs(v.index! - posGiorni[2]) < 8) : undefined;
    if (vG) giorni = Number(vG[0]);
  }
  const totComp = new RegExp(`${zz('TOTALE COMPETENZE').source}\\s+(${SOLDI.source})`, 'i').exec(testo);
  const totRit = new RegExp(`${zz('TOTALE TRATTENUTE').source}\\s+(${SOLDI.source})`, 'i').exec(testo);
  const lordo = totComp ? numeroIt(totComp[1]) : 0;
  const ritenute = totRit ? numeroIt(totRit[1]) : 0;
  if (!totComp && !totRit) avvisi.push('totali non letti');
  // netto: dopo "NETTO DEL MESE" (o "N E T T O DEL M E S E"), l'importo più vicino a competenze − trattenute
  const iN = /N\s?E\s?T\s?T\s?O\s?s?\s?DEL\s?s?\s?M\s?E\s?S\s?E/i.exec(testo);
  const vicini = iN ? (testo.slice(iN.index, iN.index + 500).match(/-?\d{1,3}(?:\.\d{3})*,\d{2}(?![\d])/g) ?? []).map(numeroIt)
    .filter(v => Math.abs(v - (lordo - ritenute)) <= 1.5) : [];
  const netto = vicini.length ? vicini.sort((a, b) => Math.abs(a - (lordo - ritenute)) - Math.abs(b - (lordo - ritenute)))[0] : tondo(lordo - ritenute);
  if (!vicini.length && lordo > 0) avvisi.push('netto calcolato (competenze − trattenute)');
  const pagaOraria = (() => {
    const i = righe.findIndex(r => /PROSSIMO\s?s?SCATTO/.test(r));
    return i >= 0 ? ultimoImporto(righe.slice(i, i + 3).join(' ')) : null;
  })();
  // voci: dalla riga "VOCI VARIABILI DEL MESE … TRATTENUTE COMPETENZE" a "CONGUAGLIO"
  const iV = righe.findIndex(r => zz('VOCI VARIABILI').test(r));
  const col = iV >= 0 ? colonne(righe[iV], /TRATTENUTE/i, /COMPETENZE/i) : null;
  const voci: VoceCedolino[] = [];
  let contributi = 0, haContr = false, irpef: number | null = null, addizionali = 0, haAdd = false;
  for (let j = iV + 1; iV >= 0 && j < righe.length; j++) {
    const r = righe[j];
    if (/^\s*CONGUAGLIO|^\s*PROGRESSIVI/.test(r)) break;
    const v = voceDaRiga(r, col, /^([A-Z0-9]{4,6})\s+/);
    if (!v) continue;
    if (v.tipo === 'ritenuta' && /Contributo IVS|FSBA|Contrib.*(INPS|dip)|Cassa integr|C\.?I\.?G/i.test(v.descrizione)) { contributi += v.importo; haContr = true; }
    if (/Ritenute IRPEF|IRPEF.*(conguaglio|trattenuta)/i.test(v.descrizione) && v.tipo === 'ritenuta') irpef = tondo((irpef ?? 0) + v.importo);
    if (/Addizionale|Acconto addiz/i.test(v.descrizione) && v.tipo === 'ritenuta') { addizionali += v.importo; haAdd = true; }
    voci.push(v);
  }
  controllaVoci(voci, lordo, ritenute, avvisi);
  return {
    modello: 'zucchetti', anno, mese, mensilita, matricola, nome, codice_fiscale: cf, qualifica: qualificaZucchetti(qualifica), livello: livelloZucchetti(qualifica), mansione: null,
    data_assunzione: dataIso(date[1]), data_cessazione: dataIso(date[2]), ore_lavorate: ore, giorni_lavorati: giorni,
    paga_oraria: pagaOraria, retribuzione: null, lordo, ritenute, contributi_dipendente: haContr ? tondo(contributi) : null, irpef,
    addizionali: haAdd ? tondo(addizionali) : null, netto, voci, avvisi,
  };
}

const somma = (a: number | null, b: number | null) => (a == null && b == null ? null : tondo((a ?? 0) + (b ?? 0)));

/** Tutti i cedolini di un file (una pagina per persona; le pagine senza cedolino, es. riepiloghi, si saltano). */
export function leggiCedolini(testo: string, nomeFile = ''): CedolinoLetto[] {
  const upa = /Elaborato da\s*:\s*U\.P\.A\.|PERIODO PAGA/.test(testo);
  const fuori: CedolinoLetto[] = [];
  for (const pagina of testo.split('\f')) {
    if (!pagina.trim()) continue;
    const c = upa ? leggiPaginaUpa(pagina, nomeFile) : leggiPaginaZucchetti(pagina, nomeFile);
    if (!c) continue;
    // cedolino lungo ("Continua su foglio numero …"): la pagina dopo, della stessa persona e periodo, ha il resto delle voci e
    // i totali finali; i totali della prima pagina sono parziali
    const prima = fuori.find(x => x.nome === c.nome && x.anno === c.anno && x.mese === c.mese && x.mensilita === c.mensilita);
    if (prima) {
      const voci = [...prima.voci, ...c.voci];
      const avvisi = c.avvisi.filter(a => !/^voci di/.test(a));
      controllaVoci(voci, c.lordo, c.ritenute, avvisi);
      const unito = { ...prima, ...c, voci, avvisi,
        irpef: somma(prima.irpef, c.irpef), addizionali: somma(prima.addizionali, c.addizionali),
        contributi_dipendente: c.contributi_dipendente ?? prima.contributi_dipendente };
      fuori[fuori.indexOf(prima)] = unito;
      continue;
    }
    fuori.push(c);
  }
  return fuori;
}

/** Chiave di un cedolino: persona (codice fiscale, altrimenti nome) + periodo + mensilità. */
export const chiaveCedolino = (c: Pick<CedolinoLetto, 'codice_fiscale' | 'nome' | 'anno' | 'mese' | 'mensilita'>) =>
  `${c.codice_fiscale ?? c.nome}|${c.anno}-${String(c.mese).padStart(2, '0')}|${c.mensilita}`;

/**
 * Più file con lo stesso cedolino (rifatti, corretti, "da sostituire", cedolino separato): vale quello del file più recente.
 * `file` in ordine dal più vecchio al più nuovo.
 */
export function unisciCedolini(file: { nome: string; cedolini: CedolinoLetto[] }[]): (CedolinoLetto & { file: string })[] {
  const per = new Map<string, CedolinoLetto & { file: string }>();
  for (const f of file) for (const c of f.cedolini) per.set(chiaveCedolino(c), { ...c, file: f.nome });
  return [...per.values()].sort((a, b) => a.anno - b.anno || a.mese - b.mese || a.mensilita.localeCompare(b.mensilita) || a.nome.localeCompare(b.nome));
}

/** Cedolini di un file dello storico (cedolini.json.gz): solo righe con persona, periodo e importi validi. */
export function cedoliniValidi(x: unknown): CedolinoLetto[] {
  const elenco = (x as any)?.cedolini;
  if ((x as any)?.tipo !== 'cedolini' || !Array.isArray(elenco)) return [];
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const t = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : null);
  const d = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  return elenco.flatMap((c: any): CedolinoLetto[] => {
    const anno = n(c?.anno), mese = n(c?.mese), nome = t(c?.nome);
    if (!anno || anno < 2000 || anno > 2100 || !mese || mese < 1 || mese > 12 || !nome) return [];
    const mensilita: Mensilita = ['tredicesima', 'quattordicesima'].includes(c.mensilita) ? c.mensilita : 'ordinaria';
    const voci: VoceCedolino[] = Array.isArray(c.voci) ? c.voci.flatMap((v: any) => n(v?.importo) != null && ['competenza', 'ritenuta'].includes(v?.tipo)
      ? [{ codice: String(v.codice ?? '').slice(0, 20), descrizione: String(v.descrizione ?? '').slice(0, 200), quantita: n(v.quantita) ?? undefined, importo: n(v.importo)!, tipo: v.tipo }] : []) : [];
    return [{
      modello: c.modello === 'zucchetti' ? 'zucchetti' : 'upa', anno, mese, mensilita, matricola: t(c.matricola), nome: nome.toUpperCase(),
      codice_fiscale: t(c.codice_fiscale)?.toUpperCase() ?? null, qualifica: t(c.qualifica), livello: t(c.livello), mansione: t(c.mansione),
      data_assunzione: d(c.data_assunzione), data_cessazione: d(c.data_cessazione), ore_lavorate: n(c.ore_lavorate), giorni_lavorati: n(c.giorni_lavorati),
      paga_oraria: n(c.paga_oraria), retribuzione: n(c.retribuzione), lordo: n(c.lordo) ?? 0, ritenute: n(c.ritenute) ?? 0,
      contributi_dipendente: n(c.contributi_dipendente), irpef: n(c.irpef), addizionali: n(c.addizionali), netto: n(c.netto) ?? 0, voci,
      avvisi: Array.isArray(c.avvisi) ? c.avvisi.filter((a: unknown) => typeof a === 'string').slice(0, 10) : [],
      ...(typeof c.file === 'string' ? { file: c.file.slice(0, 300) } : {}),
    } as CedolinoLetto];
  });
}

/** Totali di un insieme di cedolini (per persona nell'anno, o per mese). */
export function totaliCedolini(cc: Pick<CedolinoLetto, 'lordo' | 'ritenute' | 'netto' | 'ore_lavorate' | 'contributi_dipendente' | 'irpef' | 'addizionali'>[]) {
  const s = (f: (c: typeof cc[number]) => number | null) => tondo(cc.reduce((a, c) => a + (f(c) ?? 0), 0));
  return { cedolini: cc.length, lordo: s(c => c.lordo), ritenute: s(c => c.ritenute), netto: s(c => c.netto), ore: s(c => c.ore_lavorate),
    contributi: s(c => c.contributi_dipendente), irpef: s(c => c.irpef), addizionali: s(c => c.addizionali) };
}
