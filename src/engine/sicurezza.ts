/**
 * Sicurezza (Adriano 12/11/2026): "carica le schede di sicurezza di tutti i prodotti che utilizziamo; ogni volta che si fa un ordine
 * o arriva un DDT, per le sostanze speciali verifica se ho la scheda di sicurezza, altrimenti cercala su internet e mettila a disposizione;
 * aggiungi le cose che dovrei avere sotto controllo in azienda".
 *
 * Due parti:
 * 1. Schede di sicurezza (SDS, Reg. CE 1907/2006 REACH art. 31 e Reg. UE 2020/878): tabella `sicurezza_schede` con il PDF, i pericoli
 *    (frasi H della sezione 2) e le parole con cui si riconosce il prodotto nelle righe di ordini e DDT.
 * 2. Scadenzario del D.Lgs. 81/2008 (documenti e valutazioni, formazione, visite mediche, DPI, antincendio ed emergenza, impianti,
 *    organigramma, infortuni): stessi registri della Qualità (tabella `qualita_voci`, sezioni con il prefisso sic_).
 *
 * Qui solo regole, senza database (test in tests/sicurezza.test.ts).
 */
import type { SezioneQualita } from './qualita.js';

// ─────────────────────────────── Sostanze nelle righe di ordini e DDT ───────────────────────────────

export const CATEGORIE_SOSTANZE = {
  pasta: 'Pasta saldante',
  filo: 'Filo di stagno',
  barre: 'Barre di stagno',
  flussante: 'Flussanti',
  pulizia: 'Pulizia, solventi e detergenti',
  coating: 'Coating, vernici e diluenti',
  colle: 'Colle, siliconi e grassi',
  altro: 'Altro',
} as const;
export type CategoriaSostanza = keyof typeof CATEGORIE_SOSTANZE;
export const eCategoriaSostanza = (x: unknown): x is CategoriaSostanza => typeof x === 'string' && x in CATEGORIE_SOSTANZE;

/** Categorie dei materiali di consumo (Anagrafiche → Materiali) che sono sostanze con scheda di sicurezza. */
export const CATEGORIA_DA_MATERIALE: Record<string, CategoriaSostanza> = { PAS: 'pasta', FIL: 'filo', BAR: 'barre', FLU: 'flussante', PUL: 'pulizia', COA: 'coating' };

/** Articoli che contengono parole da sostanza ma non lo sono (accessori, attrezzi). */
const NON_SOSTANZE = /SPRUZZATOR|\bPANN[IO]\b|TRECCIA|\bPUNT[AE]\b|FILTR[IO]|TAPPETIN|GUANT|BRACCIAL|ETICHETT|NASTRO|KAPTON|SALDATOR[EI]|STAZIONE|DOSATOR|FLACONE VUOTO|BARATTOLO VUOTO|PENNELL|\bLAMIN[AE]\b|STENCIL/;

const REGOLE_SOSTANZE: [CategoriaSostanza, RegExp][] = [
  ['pasta', /PASTA SALDANT|SOLDER ?PASTE|CREMA SALDANT|PASTA (DI )?STAGNO/],
  ['filo', /FILO (DI )?STAGNO|STAGNO (A |IN )?FILO|SOLDER WIRE|FILO SALDANT|FILO SN|\bSN ?\d{2,3}.*\bFILO\b/],
  ['barre', /BARR[EA] (DI )?STAGNO|STAGNO IN BARR|SOLDER BAR|LINGOTT/],
  ['flussante', /FLUSSANT|GEL ?FLUX|\bFLUX\b(?! ?REMOVER)|FONDENTE|\bEO-[BGF]/],
  ['pulizia', /ALCOO?L|ISOPROPIL|\bIPA\b|SOLVENT|DILUENT|THINNER|DETERGENT|FLUX ?REMOVER|CLEANER|SGRASSANT|ACETON|ZESTRON|DECONEX|KYZEN|ETIMOL|VIGON|CYBERSOLV/],
  ['coating', /COATING|VERNIC|LACQUER|\bLACCA\b|TROPICALIZZ|CONFORMAL|ELPEGUARD|\bRESIN[AE]\b|MASCHERATURA|PELABIL|SPELLICOL|PROTETTIV.*SPRAY/],
  ['colle', /\bCOLL[AE]\b|ADESIV|ADHESIVE|SILICON|DOWSIL|GRASSO|GREASE|LUBRIFIC|EPOSSID|EPOXY|SIGILLANT|PASTA TERMIC|THERMAL (PASTE|COMPOUND)|LOCTITE/],
  ['filo', /\bSTAGNO\b|\bSOLDER\b/],
];

const normaleTesto = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ');

/**
 * La riga (codice + descrizione) è una sostanza che vuole la scheda di sicurezza? Restituisce la categoria o null.
 * Prima il codice del materiale di consumo (MC-PAS-…, MC-FLU-…), poi le parole della descrizione.
 */
export function categoriaSostanza(codice: string | null | undefined, descrizione: string | null | undefined): CategoriaSostanza | null {
  const c = normaleTesto(codice ?? '');
  const mc = /^MC-([A-Z]{3})-\d+/.exec(c);
  const t = normaleTesto(`${descrizione ?? ''}`);
  if (mc) {
    const cat = CATEGORIA_DA_MATERIALE[mc[1]];
    if (!cat) return null;               // lamine, kapton, imballaggio, ESD…: niente scheda
    if (NON_SOSTANZE.test(t)) return null;  // spruzzatore, panni, treccia dissaldante tra la pulizia
    return cat;
  }
  if (!t.trim() || NON_SOSTANZE.test(t)) return null;
  for (const [cat, re] of REGOLE_SOSTANZE) if (re.test(t)) return cat;
  return null;
}

/** Solo lettere e cifre in maiuscolo: "OM-338 PT" = "OM338PT", "MF 210" = "MF210". */
export const normalizzaChiave = (t: string) => normaleTesto(t).replace(/[^A-Z0-9]/g, '');

/** Una chiave serve per riconoscere un prodotto solo se è abbastanza specifica: almeno 4 caratteri con una cifra, o 6 lettere. */
export const chiaveValida = (k: string) => (k.length >= 4 && /\d/.test(k)) || k.length >= 6;

export interface SchedaPerAbbinare { id: number; prodotto: string; parole: string | null; tipo?: string; attiva?: boolean }

/** Le chiavi di una scheda: le "parole" scritte dall'ufficio (una per riga o separate da ;) e il nome del prodotto. */
export function chiaviScheda(s: SchedaPerAbbinare): string[] {
  const pezzi = String(s.parole ?? '').split(/[;\n]+/).map(x => normalizzaChiave(x)).filter(chiaveValida);
  const nome = normalizzaChiave(s.prodotto);
  return [...new Set([...pezzi, ...(chiaveValida(nome) ? [nome] : [])])];
}

/**
 * La scheda giusta per una riga: quella con la chiave più lunga contenuta in codice + descrizione (senza spazi e segni).
 * Le schede tecniche (tipo 'tds') non bastano: si cerca prima tra le schede di sicurezza.
 */
export function trovaScheda<T extends SchedaPerAbbinare>(codice: string | null | undefined, descrizione: string | null | undefined, schede: T[]): T | undefined {
  const testo = normalizzaChiave(`${codice ?? ''} ${descrizione ?? ''}`);
  if (!testo) return undefined;
  let migliore: { s: T; lung: number; sds: boolean } | undefined;
  for (const s of schede) {
    if (s.attiva === false) continue;
    for (const k of chiaviScheda(s)) {
      if (!testo.includes(k)) continue;
      const sds = (s.tipo ?? 'sds') === 'sds';
      if (!migliore || (sds && !migliore.sds) || (sds === migliore.sds && k.length > migliore.lung)) migliore = { s, lung: k.length, sds };
    }
  }
  return migliore?.s;
}

/** Parole utili di una descrizione per riconoscere lo stesso prodotto la prossima volta (codici con cifre, nomi commerciali). */
export function paroleDaDescrizione(descrizione: string): string[] {
  const vuote = new Set(['PASTA', 'SALDANTE', 'FILO', 'STAGNO', 'BARRE', 'FLUSSANTE', 'TANICA', 'FLACONE', 'VASETTO', 'BOBINA', 'SPRAY', 'LATTA', 'LEAD', 'FREE', 'CLEAN', 'TIPO', 'SIRINGA', 'BARATTOLO', 'BOTTIGLIA', 'CONFORMAL', 'COATING', 'DILUENTE', 'PER', 'CON', 'DEL', 'DELLA']);
  const senzaFornitore = normaleTesto(descrizione).replace(/\([^)]*\)/g, ' ');   // il codice del fornitore tra parentesi non è il prodotto
  return [...new Set(senzaFornitore.split(/[\s,/]+/).map(x => x.replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, ''))
    .filter(x => !vuote.has(x) && /\d/.test(x) && /[A-Z]/.test(x) && normalizzaChiave(x).length >= 4 && !/^\d+(G|KG|ML|L|MM|PZ)$/.test(x)))].slice(0, 6);
}

// ─────────────────────────────── Pericoli (frasi H) ───────────────────────────────

/** Frasi H più frequenti nei prodotti della saldatura e della pulizia, in parole semplici. */
export const FRASI_H: Record<string, string> = {
  H220: 'gas altamente infiammabile', H222: 'aerosol altamente infiammabile', H223: 'aerosol infiammabile', H224: 'liquido e vapori estremamente infiammabili',
  H225: 'liquido e vapori facilmente infiammabili', H226: 'liquido e vapori infiammabili', H228: 'solido infiammabile', H229: 'recipiente sotto pressione: può scoppiare se riscaldato',
  H280: 'gas sotto pressione', H290: 'può essere corrosivo per i metalli',
  H300: 'letale se ingerito', H301: 'tossico se ingerito', H302: 'nocivo se ingerito', H304: 'può essere letale se ingerito e penetra nelle vie respiratorie',
  H310: 'letale a contatto con la pelle', H311: 'tossico a contatto con la pelle', H312: 'nocivo a contatto con la pelle', H314: 'provoca gravi ustioni cutanee e gravi lesioni oculari',
  H315: 'provoca irritazione cutanea', H317: 'può provocare una reazione allergica cutanea', H318: 'provoca gravi lesioni oculari', H319: 'provoca grave irritazione oculare',
  H330: 'letale se inalato', H331: 'tossico se inalato', H332: 'nocivo se inalato', H334: 'può provocare allergie, asma o difficoltà respiratorie se inalato',
  H335: 'può irritare le vie respiratorie', H336: 'può provocare sonnolenza o vertigini',
  H340: 'può provocare alterazioni genetiche', H341: 'sospettato di provocare alterazioni genetiche', H350: 'può provocare il cancro', H351: 'sospettato di provocare il cancro',
  H360: 'può nuocere alla fertilità o al feto', H361: 'sospettato di nuocere alla fertilità o al feto', H362: 'può essere nocivo per i lattanti allattati al seno',
  H370: 'provoca danni agli organi', H371: 'può provocare danni agli organi', H372: 'provoca danni agli organi in caso di esposizione prolungata', H373: 'può provocare danni agli organi in caso di esposizione prolungata',
  H400: 'molto tossico per gli organismi acquatici', H410: 'molto tossico per gli organismi acquatici con effetti di lunga durata', H411: 'tossico per gli organismi acquatici con effetti di lunga durata',
  H412: 'nocivo per gli organismi acquatici con effetti di lunga durata', H413: 'può essere nocivo per gli organismi acquatici con effetti di lunga durata',
  EUH066: "l'esposizione ripetuta può provocare secchezza o screpolature della pelle", EUH071: 'corrosivo per le vie respiratorie',
  EUH205: 'contiene componenti epossidici: può provocare una reazione allergica', EUH208: 'contiene una sostanza sensibilizzante: può provocare una reazione allergica',
};
/** La frase H di base: H360FD → H360, H361d → H361. */
export const baseH = (h: string) => h.toUpperCase().replace(/^(EUH\d{3}|H\d{3}).*$/, '$1');
export const descriviH = (h: string) => FRASI_H[baseH(h)] ?? '';

/** Pittogrammi GHS ricavati dalle frasi H (nome breve per l'etichetta nella pagina). */
const PITTOGRAMMI: [string, string, RegExp][] = [
  ['GHS02', 'Infiammabile', /^H(22[0-9]|24[12]|25[0-2])$/],
  ['GHS05', 'Corrosivo', /^(H290|H314|H318|EUH071)$/],
  ['GHS06', 'Tossico', /^H(300|301|310|311|330|331)$/],
  ['GHS08', 'Pericolo per la salute', /^H(304|334|34[01]|35[01]|36[0-2]|37[0-3])$/],
  ['GHS07', 'Nocivo o irritante', /^H(302|312|315|317|319|332|335|336)$/],
  ['GHS09', 'Ambiente', /^H(400|410|411)$/],
  ['GHS04', 'Gas sotto pressione', /^H28[01]$/],
];
export function pittogrammi(pericoli: string[]): { codice: string; nome: string }[] {
  const basi = pericoli.map(baseH);
  return PITTOGRAMMI.filter(([, , re]) => basi.some(h => re.test(h))).map(([codice, nome]) => ({ codice, nome }));
}

/** Avvisi per il DVR e la sorveglianza sanitaria: cancerogeni/mutageni/tossici per la riproduzione e sensibilizzanti. */
export function avvisiPericoli(pericoli: string[]): string[] {
  const basi = new Set(pericoli.map(baseH));
  const a: string[] = [];
  if (['H340', 'H341', 'H350', 'H351', 'H360', 'H361', 'H362'].some(h => basi.has(h)))
    a.push('Cancerogeno, mutageno o tossico per la riproduzione (CMR): va nella valutazione del rischio chimico, con sorveglianza sanitaria e attenzione per le lavoratrici in gravidanza o allattamento.');
  if (['H317', 'H334', 'EUH208', 'EUH205'].some(h => basi.has(h)))
    a.push('Sensibilizzante (allergie della pelle o respiratorie): guanti adatti e, per i fumi, aspirazione; da segnalare al medico competente.');
  return a;
}

/** Codici H della sezione 2 della scheda (classificazione della miscela), non quelli dei componenti della sezione 3. */
export function pericoliDaTesto(testo: string): string[] {
  const m = /(SEZIONE|SECTION|ABSCHNITT|RUBRIQUE)\s*2\b([\s\S]*?)(SEZIONE|SECTION|ABSCHNITT|RUBRIQUE)\s*3\b/i.exec(testo);
  const pezzo = m ? m[2] : '';
  const codici = pezzo.match(/\b(?:EUH\d{3}|H\d{3}(?:[A-Za-z]{1,2})?)\b/g) ?? [];
  return [...new Set(codici.map(c => c.replace(/^h/, 'H')))].sort();
}

/** È davvero una scheda di sicurezza (e non una scheda tecnica o un catalogo)? */
export const eSchedaSicurezza = (testo: string) =>
  /scheda (di )?(dati di )?sicurezza|safety data sheet|sicherheitsdatenblatt|fiche de donn[ée]es de s[ée]curit[ée]|1907\/2006/i.test(testo)
  && /(SEZIONE|SECTION|ABSCHNITT|RUBRIQUE)\s*2\b/i.test(testo);

/** Data di revisione scritta nella scheda (gg/mm/aaaa, gg.mm.aaaa o aaaa-mm-gg) → aaaa-mm-gg. */
export function dataRevisioneDaTesto(testo: string): string | null {
  const zona = /(data di revisione|data revisione|revision date|date of revision|revisione|überarbeitet am|data ultima edizione|data di compilazione|versione)[^\n]{0,80}/gi;
  for (const m of testo.matchAll(zona)) {
    const d = /(\d{1,2})[./-](\d{1,2})[./-](\d{4})/.exec(m[0]) ?? null;
    if (d) { const x = `${d[3]}-${d[2].padStart(2, '0')}-${d[1].padStart(2, '0')}`; if (!isNaN(Date.parse(x)) && Number(d[2]) <= 12) return x; }
    const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(m[0]);
    if (iso) return iso[0];
  }
  return null;
}

// ─────────────────────────────── Stato di una scheda ───────────────────────────────

export interface SchedaStato { tipo: string; data_revisione: string | null; ha_file: boolean; url?: string | null }
/**
 * Cosa manca a una scheda: solo scheda tecnica (serve quella di sicurezza), senza file, senza data, troppo vecchia.
 * Vecchia = revisione prima del 2021 (formato precedente al Reg. UE 2020/878, obbligatorio dal 2023) o di oltre 5 anni: si chiede la versione nuova al fornitore.
 */
export function statoScheda(s: SchedaStato, oggi: string): { livello: 'ok' | 'attenzione' | 'manca'; testo: string } {
  if (s.tipo !== 'sds') return { livello: 'manca', testo: s.tipo === 'tds' ? 'è solo la scheda tecnica: serve la scheda di sicurezza' : 'non è una scheda di sicurezza' };
  if (!s.ha_file) return { livello: 'attenzione', testo: s.url ? 'solo il link: scarica il PDF e caricalo' : 'manca il PDF' };
  if (!s.data_revisione) return { livello: 'attenzione', testo: 'data di revisione da scrivere' };
  const cinqueAnniFa = `${Number(oggi.slice(0, 4)) - 5}${oggi.slice(4)}`;
  if (s.data_revisione < '2021-01-01' || s.data_revisione < cinqueAnniFa)
    return { livello: 'attenzione', testo: 'revisione vecchia: chiedi al fornitore la versione aggiornata (Reg. UE 2020/878)' };
  return { livello: 'ok', testo: 'in regola' };
}

// ─────────────────────────────── Scadenzario del D.Lgs. 81/2008 ───────────────────────────────

const ESITI = { positivo: 'Positivo', negativo: 'Negativo', da_ripetere: 'Da ripetere' };

/** Corsi di sicurezza e ogni quanto si aggiornano (Accordo Stato-Regioni; primo soccorso DM 388/2003; antincendio DM 2/9/2021). */
export const CORSI_SICUREZZA: Record<string, { nome: string; mesi: number | null }> = {
  lavoratori_generale: { nome: 'Lavoratori: formazione generale (4 h)', mesi: null },
  lavoratori_specifica: { nome: 'Lavoratori: formazione specifica', mesi: 60 },
  lavoratori_aggiornamento: { nome: 'Lavoratori: aggiornamento (6 h)', mesi: 60 },
  preposto: { nome: 'Preposto', mesi: 24 },
  dirigente: { nome: 'Dirigente', mesi: 60 },
  datore: { nome: 'Datore di lavoro / RSPP datore di lavoro', mesi: 60 },
  rspp: { nome: 'RSPP / ASPP', mesi: 60 },
  rls: { nome: 'RLS', mesi: 12 },
  primo_soccorso: { nome: 'Addetto primo soccorso', mesi: 36 },
  antincendio: { nome: 'Addetto antincendio', mesi: 60 },
  carrelli: { nome: 'Carrelli elevatori', mesi: 60 },
  altro: { nome: 'Altro', mesi: null },
};

export const SEZIONI_SICUREZZA: SezioneQualita[] = [
  {
    chiave: 'sic_adempimenti', nome: 'Documenti e valutazioni', singolare: 'adempimento', daCartella: '8_AZIENDA/Sicurezza in azienda',
    descrizione: 'Il DVR e le valutazioni dei rischi (chimico, rumore, incendio, stress…), il piano di emergenza, la riunione periodica, i rifiuti: quando sono stati fatti e quando vanno rivisti. '
      + 'Le valutazioni vanno rifatte comunque quando cambiano macchine, prodotti o organizzazione e dopo un infortunio importante.',
    campi: [
      { chiave: 'adempimento', nome: 'Adempimento', tipo: 'testo', obbligatorio: true, esempio: 'DVR – documento di valutazione dei rischi' },
      { chiave: 'riferimento', nome: 'Norma', tipo: 'testo', esempio: 'D.Lgs. 81/08 art. 28' },
      { chiave: 'responsabile', nome: 'Chi lo fa', tipo: 'testo', esempio: 'datore di lavoro con l\'RSPP' },
      { chiave: 'ultima', nome: 'Ultima volta (data del documento)', tipo: 'data' },
      { chiave: 'frequenza_mesi', nome: 'Da rivedere ogni (mesi)', tipo: 'numero' },
      { chiave: 'file', nome: 'Dove si trova il documento', tipo: 'testo', esempio: 'Drive: 8_AZIENDA/Sicurezza in azienda/…' },
      { chiave: 'note', nome: 'Note', tipo: 'testo_lungo' },
    ],
    colonne: ['adempimento', 'riferimento', 'ultima', 'frequenza_mesi', 'prossima'], chiaveImport: ['adempimento'], ordine: ['adempimento', 'asc'],
    scadenza: 'frequenza_mesi',
  },
  {
    chiave: 'sic_formazione', nome: 'Formazione sicurezza', singolare: 'corso', daCartella: '8_AZIENDA/Sicurezza in azienda, Rspp',
    descrizione: 'Una riga per persona e corso (lavoratori, preposti, RLS, primo soccorso, antincendio…): quando la persona lo rifà si cambia la data (o spunta + "Fatto oggi"). '
      + 'Se "ogni quanti mesi" è vuoto vale l\'aggiornamento di legge del corso.',
    campi: [
      { chiave: 'persona', nome: 'Persona', tipo: 'testo', obbligatorio: true, maiuscolo: true },
      { chiave: 'corso', nome: 'Corso', tipo: 'scelta', opzioni: Object.fromEntries(Object.entries(CORSI_SICUREZZA).map(([k, c]) => [k, c.nome])) },
      { chiave: 'ore', nome: 'Ore', tipo: 'numero' },
      { chiave: 'ultima', nome: 'Data del corso', tipo: 'data' },
      { chiave: 'frequenza_mesi', nome: 'Aggiornamento ogni (mesi)', tipo: 'numero', esempio: 'vuoto = di legge' },
      { chiave: 'ente', nome: 'Ente / docente', tipo: 'testo' },
      { chiave: 'attestato', nome: 'Dove si trova l\'attestato', tipo: 'testo' },
      { chiave: 'note', nome: 'Note', tipo: 'testo_lungo' },
    ],
    colonne: ['persona', 'corso', 'ultima', 'frequenza_mesi', 'prossima'], chiaveImport: ['persona', 'corso'], ordine: ['persona', 'asc'],
    scadenza: 'frequenza_mesi',
    frequenzaPredefinita: { campo: 'corso', mesi: Object.fromEntries(Object.entries(CORSI_SICUREZZA).filter(([, c]) => c.mesi).map(([k, c]) => [k, c.mesi!])) },
  },
  {
    chiave: 'sic_visite', nome: 'Visite mediche', singolare: 'visita', femminile: true, daCartella: '8_AZIENDA/TECO visite mediche, Medico',
    descrizione: 'Sorveglianza sanitaria (art. 41): per ogni persona l\'ultima visita, ogni quanto la vuole il medico competente e il giudizio di idoneità. '
      + 'Solo il giudizio: la cartella sanitaria resta al medico.',
    campi: [
      { chiave: 'persona', nome: 'Persona', tipo: 'testo', obbligatorio: true, maiuscolo: true },
      { chiave: 'mansione', nome: 'Mansione', tipo: 'testo', maiuscolo: true, esempio: 'OPERATORE SMT' },
      { chiave: 'ultima', nome: 'Ultima visita', tipo: 'data' },
      { chiave: 'frequenza_mesi', nome: 'Prossima visita dopo (mesi)', tipo: 'numero', esempio: '12 o 24, lo decide il medico' },
      { chiave: 'giudizio', nome: 'Giudizio', tipo: 'scelta', opzioni: { idoneo: 'Idoneo', prescrizioni: 'Idoneo con prescrizioni', limitazioni: 'Idoneo con limitazioni', temporaneo: 'Non idoneo temporaneo', non_idoneo: 'Non idoneo', da_fare: 'Visita da fare' } },
      { chiave: 'medico', nome: 'Medico competente', tipo: 'testo' },
      { chiave: 'note', nome: 'Note (prescrizioni, DPI)', tipo: 'testo_lungo' },
    ],
    colonne: ['persona', 'mansione', 'ultima', 'giudizio', 'prossima'], chiaveImport: ['persona'], ordine: ['persona', 'asc'],
    scadenza: 'frequenza_mesi',
  },
  {
    chiave: 'sic_dpi', nome: 'DPI consegnati', singolare: 'consegna di DPI', femminile: true, daCartella: '8_AZIENDA/Sicurezza in azienda (Consegna dispositivi di protezione individuale)',
    descrizione: 'Dispositivi di protezione individuale consegnati (art. 77): scarpe ESD/antinfortunistiche, occhiali, guanti, mascherine, camici. Data, firma per ricevuta e quando sostituirli.',
    campi: [
      { chiave: 'persona', nome: 'Persona', tipo: 'testo', obbligatorio: true, maiuscolo: true },
      { chiave: 'dpi', nome: 'DPI', tipo: 'testo', obbligatorio: true, maiuscolo: true, esempio: 'SCARPE ESD S1P' },
      { chiave: 'ultima', nome: 'Consegnato il', tipo: 'data' },
      { chiave: 'frequenza_mesi', nome: 'Sostituire ogni (mesi)', tipo: 'numero' },
      { chiave: 'firma', nome: 'Ricevuta firmata', tipo: 'scelta', opzioni: { no: 'No', si: 'Sì' } },
      { chiave: 'note', nome: 'Note (taglia, modello)', tipo: 'testo_lungo' },
    ],
    colonne: ['persona', 'dpi', 'ultima', 'firma', 'prossima'], chiaveImport: ['persona', 'dpi'], ordine: ['persona', 'asc'],
    scadenza: 'frequenza_mesi',
  },
  {
    chiave: 'sic_emergenza', nome: 'Antincendio ed emergenza', singolare: 'presidio', daCartella: '8_AZIENDA/Anticendio',
    descrizione: 'Estintori e luci di emergenza (controllo ogni 6 mesi), porte e uscite, cassetta di primo soccorso, prova di evacuazione (una volta l\'anno): ultimo controllo e prossimo.',
    campi: [
      { chiave: 'presidio', nome: 'Presidio', tipo: 'scelta', opzioni: { estintori: 'Estintori', luci: 'Luci di emergenza', porte: 'Porte e uscite di emergenza', allarme: 'Allarme / rilevazione', primo_soccorso: 'Cassetta di primo soccorso', evacuazione: 'Prova di evacuazione', segnaletica: 'Planimetrie e segnaletica', altro: 'Altro' } },
      { chiave: 'identificazione', nome: 'Quali / dove', tipo: 'testo', maiuscolo: true, esempio: 'TUTTI (N. 6) / REPARTO SMT' },
      { chiave: 'ultima', nome: 'Ultimo controllo', tipo: 'data' },
      { chiave: 'frequenza_mesi', nome: 'Ogni (mesi)', tipo: 'numero', esempio: '6' },
      { chiave: 'ditta', nome: 'Ditta', tipo: 'testo', esempio: 'Eisto / Safety Pro' },
      { chiave: 'esito', nome: 'Esito', tipo: 'scelta', opzioni: ESITI },
      { chiave: 'note', nome: 'Note', tipo: 'testo_lungo' },
    ],
    colonne: ['presidio', 'identificazione', 'ultima', 'ditta', 'esito', 'prossima'], chiaveImport: ['presidio', 'identificazione'], ordine: ['presidio', 'asc'],
    scadenza: 'frequenza_mesi',
  },
  {
    chiave: 'sic_impianti', nome: 'Impianti, macchine e ambiente', singolare: 'verifica', femminile: true, daCartella: '8_AZIENDA (Verifica messa a terra, Libretto CRITER, Emissioni in atmosfera)',
    descrizione: 'Verifiche periodiche: impianto di terra (DPR 462/01, ogni 5 anni), caldaia (libretto CRITER), aspirazione dei fumi di saldatura, compressore, scaffalature, autorizzazione alle emissioni.',
    campi: [
      { chiave: 'impianto', nome: 'Impianto / macchina', tipo: 'testo', obbligatorio: true, maiuscolo: true, esempio: 'IMPIANTO DI TERRA' },
      { chiave: 'verifica', nome: 'Verifica', tipo: 'testo', obbligatorio: true, esempio: 'verifica periodica DPR 462/01' },
      { chiave: 'riferimento', nome: 'Norma', tipo: 'testo' },
      { chiave: 'ultima', nome: 'Ultima verifica', tipo: 'data' },
      { chiave: 'frequenza_mesi', nome: 'Ogni (mesi)', tipo: 'numero' },
      { chiave: 'chi', nome: 'Chi la fa', tipo: 'testo' },
      { chiave: 'esito', nome: 'Esito', tipo: 'scelta', opzioni: ESITI },
      { chiave: 'note', nome: 'Note', tipo: 'testo_lungo' },
    ],
    colonne: ['impianto', 'verifica', 'ultima', 'esito', 'prossima'], chiaveImport: ['impianto', 'verifica'], ordine: ['impianto', 'asc'],
    scadenza: 'frequenza_mesi',
  },
  {
    chiave: 'sic_figure', nome: 'Organigramma della sicurezza', singolare: 'incarico', daCartella: '8_AZIENDA/Sicurezza in azienda (Organigramma Sicurezza)',
    descrizione: 'Chi fa cosa: datore di lavoro, RSPP, medico competente, RLS, preposti, addetti antincendio e primo soccorso, con la data della nomina. I corsi sono nella Formazione sicurezza.',
    campi: [
      { chiave: 'ruolo', nome: 'Ruolo', tipo: 'scelta', opzioni: { datore: 'Datore di lavoro', rspp: 'RSPP', medico: 'Medico competente', rls: 'RLS / RLST', preposto: 'Preposto', antincendio: 'Addetto antincendio', primo_soccorso: 'Addetto primo soccorso', altro: 'Altro' } },
      { chiave: 'persona', nome: 'Persona / società', tipo: 'testo', maiuscolo: true, esempio: 'da scrivere' },
      { chiave: 'nominato_il', nome: 'Nomina del', tipo: 'data' },
      { chiave: 'file', nome: 'Dove si trova la nomina', tipo: 'testo' },
      { chiave: 'note', nome: 'Note (recapiti)', tipo: 'testo_lungo' },
    ],
    colonne: ['ruolo', 'persona', 'nominato_il', 'file'], chiaveImport: ['ruolo', 'persona'], ordine: ['ruolo', 'asc'],
  },
  {
    chiave: 'sic_infortuni', nome: 'Infortuni e quasi infortuni', singolare: 'infortunio', daCartella: '—',
    descrizione: 'Infortuni (denuncia all\'INAIL entro 2 giorni se l\'assenza supera 3 giorni oltre a quello dell\'evento) e quasi infortuni: cosa è successo e cosa si è fatto perché non ricapiti.',
    campi: [
      { chiave: 'data', nome: 'Data', tipo: 'data', obbligatorio: true },
      { chiave: 'tipo', nome: 'Tipo', tipo: 'scelta', opzioni: { quasi: 'Quasi infortunio', infortunio: 'Infortunio', malattia: 'Malattia professionale' } },
      { chiave: 'persona', nome: 'Persona', tipo: 'testo', maiuscolo: true },
      { chiave: 'descrizione', nome: 'Cosa è successo', tipo: 'testo_lungo', obbligatorio: true },
      { chiave: 'giorni', nome: 'Giorni di assenza', tipo: 'numero' },
      { chiave: 'inail', nome: 'Denuncia INAIL', tipo: 'scelta', opzioni: { non_serve: 'Non serve', da_fare: 'Da fare', fatta: 'Fatta' } },
      { chiave: 'azioni', nome: 'Azioni per evitarlo', tipo: 'testo_lungo' },
      { chiave: 'stato', nome: 'Stato', tipo: 'scelta', opzioni: { aperto: 'Aperto', chiuso: 'Chiuso' } },
    ],
    colonne: ['data', 'tipo', 'persona', 'descrizione', 'inail', 'stato'], chiaveImport: ['data', 'descrizione'], ordine: ['data', 'desc'],
  },
];

export const sezioneSicurezza = (chiave: string) => SEZIONI_SICUREZZA.find(s => s.chiave === chiave);

/** Righe del registro ancora da compilare: con la frequenza ma senza la data dell'ultima volta. */
export const daCompilare = (d: Record<string, unknown>) => d.frequenza_mesi != null && !d.ultima;

/**
 * Cosa deve avere sotto controllo un'azienda come Casteltech (assemblaggio elettronico, D.Lgs. 81/2008): l'elenco del cruscotto con
 * il registro dove si segue ogni punto. Non è consulenza: il DVR e le scadenze precise li conferma l'RSPP.
 */
export const OBBLIGHI_SICUREZZA: { titolo: string; testo: string; sezione: string }[] = [
  { titolo: 'DVR e valutazioni dei rischi', testo: 'Documento di valutazione dei rischi con data certa (art. 17, 28, 29), rischio chimico (Titolo IX: paste, flussanti, solventi, fumi di saldatura), rumore e vibrazioni (ogni 4 anni), incendio, stress lavoro-correlato, movimentazione dei carichi e videoterminali; si rifà quando cambiano macchine, prodotti o organizzazione.', sezione: 'sic_adempimenti' },
  { titolo: 'Schede di sicurezza dei prodotti chimici', testo: 'Una scheda aggiornata per ogni sostanza usata (REACH art. 31), a disposizione dei lavoratori e usata per la valutazione del rischio chimico; il portale controlla ordini e DDT.', sezione: 'schede' },
  { titolo: 'Organigramma e nomine', testo: 'RSPP designato, medico competente nominato (se c\'è sorveglianza sanitaria), RLS eletto o territoriale, preposti individuati, addetti antincendio e primo soccorso designati.', sezione: 'sic_figure' },
  { titolo: 'Formazione', testo: 'Lavoratori (generale + specifica, aggiornamento 6 ore ogni 5 anni), preposti (ogni 2 anni), datore di lavoro, RLS (ogni anno), primo soccorso (ogni 3 anni), antincendio (ogni 5 anni); informazione e addestramento a ogni nuovo assunto.', sezione: 'sic_formazione' },
  { titolo: 'Sorveglianza sanitaria', testo: 'Visite del medico competente secondo il protocollo (preventiva, periodica, cambio mansione), giudizi di idoneità consegnati, relazione annuale e sopralluogo del medico.', sezione: 'sic_visite' },
  { titolo: 'DPI', testo: 'Scelti in base al DVR, consegnati con firma, sostituiti quando consumati: scarpe, occhiali, guanti per solventi e flussanti, mascherine.', sezione: 'sic_dpi' },
  { titolo: 'Antincendio ed emergenza', testo: 'Estintori e luci di emergenza controllati ogni 6 mesi, uscite libere, planimetrie e segnaletica, cassetta di primo soccorso completa, prova di evacuazione una volta l\'anno.', sezione: 'sic_emergenza' },
  { titolo: 'Impianti, macchine e ambiente', testo: 'Verifica dell\'impianto di terra ogni 5 anni (DPR 462/01), manutenzione di macchine, aspiratori fumi e compressore, caldaia (libretto), autorizzazione alle emissioni, rifiuti pericolosi (scorie di stagno, solventi, stracci): registro, RENTRI e MUD entro il 30 aprile.', sezione: 'sic_impianti' },
  { titolo: 'Infortuni', testo: 'Denuncia all\'INAIL entro 2 giorni per assenze oltre 3 giorni; registrare anche i quasi infortuni e cosa si è fatto.', sezione: 'sic_infortuni' },
];
