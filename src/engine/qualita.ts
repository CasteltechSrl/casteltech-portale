/**
 * Qualità (Adriano 31/10/2026): le sezioni più importanti della vecchia cartella 5_QUALITA del Drive, portate nel portale.
 * Ogni sezione è un registro con i suoi campi (documenti del sistema, non conformità, tarature, manutenzioni, ESD,
 * formazione, audit, rischi e opportunità, codifica dei difetti). Le righe stanno tutte nella tabella `qualita_voci`
 * (sezione + dati), così una sezione nuova o un campo in più si aggiungono qui senza toccare il database.
 *
 * Qui solo regole e conti, senza database: le pagine li usano e i test li controllano (tests/qualita.test.ts).
 */

export type TipoCampo = 'testo' | 'testo_lungo' | 'data' | 'numero' | 'scelta' | 'mesi' | 'difetto';

export interface CampoQualita {
  chiave: string;
  nome: string;
  tipo: TipoCampo;
  /** per le scelte: valore → testo */
  opzioni?: Record<string, string>;
  obbligatorio?: boolean;
  /** scritto in MAIUSCOLO (codici, macchine) */
  maiuscolo?: boolean;
  /** suggerimento dentro la casella */
  esempio?: string;
}

export interface SezioneQualita {
  chiave: string;
  nome: string;
  /** nome di una riga, per "Nuovo …", "Elimina …" */
  singolare: string;
  femminile?: boolean;
  descrizione: string;
  /** cartella del vecchio Drive da cui viene */
  daCartella: string;
  campi: CampoQualita[];
  /** colonne dell'elenco (chiavi dei campi; 'prossima' = scadenza calcolata) */
  colonne: string[];
  /** campi che identificano la riga: ricaricando il file si aggiorna invece di aggiungere */
  chiaveImport: string[];
  /** ordine dell'elenco: campo e verso */
  ordine: [string, 'asc' | 'desc'];
  /** come si calcola la prossima scadenza (se c'è) */
  scadenza?: 'frequenza_mesi' | 'mesi_previsti' | 'campo';
  /** per scadenza 'campo': il campo con la data */
  campoScadenza?: string;
}

const ESITI = { positivo: 'Positivo', negativo: 'Negativo', da_ripetere: 'Da ripetere' };

export const SEZIONI_QUALITA: SezioneQualita[] = [
  {
    chiave: 'documenti', nome: 'Documenti del sistema', singolare: 'documento', daCartella: 'MANUALE, PROCEDURE E ISTRUZIONI OPERATIVE',
    descrizione: 'Manuale, politica per la qualità, procedure di sistema (EPR-SYS), procedure operative (EPR-OPE), istruzioni operative (EWI-OPE) e moduli (QF), con la revisione in vigore.',
    campi: [
      { chiave: 'codice', nome: 'Codice', tipo: 'testo', obbligatorio: true, maiuscolo: true, esempio: 'EPR-SYS-16' },
      { chiave: 'titolo', nome: 'Titolo', tipo: 'testo', obbligatorio: true, maiuscolo: true },
      { chiave: 'tipo', nome: 'Tipo', tipo: 'scelta', opzioni: { manuale: 'Manuale / politica', sistema: 'Procedura di sistema', operativa: 'Procedura operativa', istruzione: 'Istruzione operativa', modulo: 'Modulo', cliente: 'Documento del cliente' } },
      { chiave: 'revisione', nome: 'Revisione', tipo: 'testo', esempio: '0' },
      { chiave: 'data_revisione', nome: 'Data revisione', tipo: 'data' },
      { chiave: 'stato', nome: 'Stato', tipo: 'scelta', opzioni: { in_vigore: 'In vigore', in_revisione: 'In revisione', bozza: 'Bozza', obsoleto: 'Obsoleto' } },
      { chiave: 'file', nome: 'Dove si trova il file', tipo: 'testo', esempio: 'Drive: 5_QUALITA/PROCEDURE E ISTRUZIONI OPERATIVE/…' },
      { chiave: 'note', nome: 'Note', tipo: 'testo_lungo' },
    ],
    colonne: ['codice', 'titolo', 'tipo', 'revisione', 'stato'], chiaveImport: ['codice'], ordine: ['codice', 'asc'],
  },
  {
    chiave: 'non_conformita', nome: 'Non conformità e reclami', singolare: 'non conformità', femminile: true, daCartella: "NON CONFORMITA', CONFORMITA'",
    descrizione: 'Reclami dei clienti, non conformità interne e dei fornitori: difetto, quantità, trattamento del lotto, causa e azione correttiva fino alla chiusura.',
    campi: [
      { chiave: 'numero', nome: 'Numero', tipo: 'testo', maiuscolo: true, esempio: 'si dà da solo: NC-2026-001' },
      { chiave: 'data', nome: 'Data', tipo: 'data', obbligatorio: true },
      { chiave: 'origine', nome: 'Origine', tipo: 'scelta', opzioni: { cliente: 'Reclamo del cliente', interna: 'Interna (produzione)', fornitore: 'Fornitore', audit: 'Da audit' } },
      { chiave: 'cliente', nome: 'Cliente / fornitore', tipo: 'testo', maiuscolo: true },
      { chiave: 'codice_prodotto', nome: 'Codice prodotto', tipo: 'testo', maiuscolo: true },
      { chiave: 'riferimento', nome: 'Commessa / documento', tipo: 'testo', esempio: 'commessa, DDT o rapporto del cliente' },
      { chiave: 'quantita_difettosa', nome: 'Pezzi difettosi', tipo: 'numero' },
      { chiave: 'quantita_totale', nome: 'Pezzi del lotto', tipo: 'numero' },
      { chiave: 'difetto', nome: 'Codice difetto', tipo: 'difetto' },
      { chiave: 'descrizione', nome: 'Descrizione del difetto', tipo: 'testo_lungo', obbligatorio: true },
      { chiave: 'trattamento', nome: 'Trattamento del lotto', tipo: 'scelta', opzioni: { da_decidere: 'Da decidere', deroga: 'Accettato in deroga', selezione: 'Selezionato al 100%', rilavorato: 'Rilavorato / riparato', reso: 'Reso', nessun_difetto: 'Nessun difetto trovato' } },
      { chiave: 'causa', nome: 'Analisi della causa', tipo: 'testo_lungo' },
      { chiave: 'azione', nome: 'Azione correttiva', tipo: 'testo_lungo' },
      { chiave: 'responsabile', nome: 'Responsabile', tipo: 'testo' },
      { chiave: 'scadenza_azione', nome: 'Azione entro il', tipo: 'data' },
      { chiave: 'stato', nome: 'Stato', tipo: 'scelta', opzioni: { aperta: 'Aperta', in_corso: 'Azione in corso', chiusa: 'Chiusa' } },
      { chiave: 'chiusa_il', nome: 'Chiusa il', tipo: 'data' },
    ],
    colonne: ['numero', 'data', 'origine', 'cliente', 'codice_prodotto', 'descrizione', 'stato', 'prossima'], chiaveImport: ['numero'], ordine: ['data', 'desc'],
    scadenza: 'campo', campoScadenza: 'scadenza_azione',
  },
  {
    chiave: 'difetti', nome: 'Codifica dei difetti', singolare: 'codice difetto', daCartella: 'POST (CODIFICA DIFETTOLOGIA)',
    descrizione: 'I codici dei difetti (10 = componente SMD mancante, 190 = saldatura a rifusione fredda…): si scelgono nelle non conformità, così si contano i difetti più frequenti.',
    campi: [
      { chiave: 'codice', nome: 'Codice', tipo: 'testo', obbligatorio: true, maiuscolo: true, esempio: '10' },
      { chiave: 'descrizione', nome: 'Descrizione', tipo: 'testo', obbligatorio: true, maiuscolo: true },
      { chiave: 'gruppo', nome: 'Gruppo', tipo: 'scelta', opzioni: { smd: 'Componenti SMD', pth: 'Componenti PTH', rifusione: 'Saldatura a rifusione', onda: 'Saldatura a onda / selettiva', pcb: 'Circuito stampato', collaudo: 'Collaudo', altro: 'Altro' } },
    ],
    colonne: ['codice', 'descrizione', 'gruppo'], chiaveImport: ['codice'], ordine: ['codice', 'asc'],
  },
  {
    chiave: 'strumenti', nome: 'Strumenti e tarature', singolare: 'strumento', daCartella: 'STRUMENTI, ANALISI E TARATURE',
    descrizione: 'Saldatori, termoigrometri, termometri, misuratori ESD e analisi dello stagno: ogni quanto si tarano, l\'ultima taratura e la prossima scadenza.',
    campi: [
      { chiave: 'codice', nome: 'Codice', tipo: 'testo', obbligatorio: true, maiuscolo: true, esempio: 'RP017' },
      { chiave: 'descrizione', nome: 'Strumento', tipo: 'testo', obbligatorio: true, maiuscolo: true, esempio: 'CENTRALINA SALDATORE' },
      { chiave: 'posizione', nome: 'Dove si trova', tipo: 'testo', maiuscolo: true },
      { chiave: 'frequenza_mesi', nome: 'Taratura ogni (mesi)', tipo: 'numero', esempio: '12' },
      { chiave: 'ultima', nome: 'Ultima taratura', tipo: 'data' },
      { chiave: 'esito', nome: 'Esito', tipo: 'scelta', opzioni: ESITI },
      { chiave: 'chi', nome: 'Chi la fa', tipo: 'testo', esempio: 'interno o laboratorio esterno' },
      { chiave: 'note', nome: 'Note e misure', tipo: 'testo_lungo' },
    ],
    colonne: ['codice', 'descrizione', 'posizione', 'frequenza_mesi', 'ultima', 'esito', 'prossima'], chiaveImport: ['codice'], ordine: ['codice', 'asc'],
    scadenza: 'frequenza_mesi',
  },
  {
    chiave: 'manutenzioni', nome: 'Piano delle manutenzioni', singolare: 'manutenzione', femminile: true, daCartella: 'MANUTENZIONE',
    descrizione: 'Per ogni macchina (pick and place, forno, onda, serigrafo, AOI…) gli interventi, in quali mesi vanno fatti e quando sono stati fatti l\'ultima volta.',
    campi: [
      { chiave: 'macchina', nome: 'Macchina', tipo: 'testo', obbligatorio: true, maiuscolo: true, esempio: 'FORNO A RIFUSIONE' },
      { chiave: 'identificazione', nome: 'Modello / matricola', tipo: 'testo', maiuscolo: true },
      { chiave: 'intervento', nome: 'Intervento', tipo: 'testo', obbligatorio: true, maiuscolo: true },
      { chiave: 'chi', nome: 'Chi lo fa', tipo: 'testo', esempio: 'interno, iTronik, Iemme…' },
      { chiave: 'mesi', nome: 'Mesi previsti', tipo: 'mesi', esempio: '1, 8 (gennaio e agosto); 1-12 = tutti i mesi' },
      { chiave: 'ultima', nome: 'Ultima volta fatta', tipo: 'data' },
      { chiave: 'note', nome: 'Note', tipo: 'testo_lungo' },
    ],
    colonne: ['macchina', 'identificazione', 'intervento', 'chi', 'mesi', 'ultima', 'prossima'], chiaveImport: ['macchina', 'identificazione', 'intervento'], ordine: ['macchina', 'asc'],
    scadenza: 'mesi_previsti',
  },
  {
    chiave: 'esd', nome: 'Verifiche ESD', singolare: 'verifica ESD', femminile: true, daCartella: 'ESD',
    descrizione: 'Il piano delle verifiche contro le scariche elettrostatiche (bracciali, scarpe, banchi, camici, contenitori, aree EPA) e l\'esito dell\'ultima verifica.',
    campi: [
      { chiave: 'verifica', nome: 'Cosa si verifica', tipo: 'testo', obbligatorio: true, maiuscolo: true, esempio: 'BRACCIALI E SCARPE' },
      { chiave: 'descrizione', nome: 'Come', tipo: 'testo', maiuscolo: true },
      { chiave: 'norma', nome: 'Norma / procedura', tipo: 'testo', maiuscolo: true, esempio: 'IEC 61340-5-1, EPR-OPE-04' },
      { chiave: 'mesi', nome: 'Mesi previsti', tipo: 'mesi', esempio: '2, 8 (semestrale)' },
      { chiave: 'ultima', nome: 'Ultima verifica', tipo: 'data' },
      { chiave: 'esito', nome: 'Esito', tipo: 'scelta', opzioni: ESITI },
      { chiave: 'chi', nome: 'Chi la fa', tipo: 'testo' },
      { chiave: 'note', nome: 'Note e misure', tipo: 'testo_lungo' },
    ],
    colonne: ['verifica', 'descrizione', 'mesi', 'ultima', 'esito', 'prossima'], chiaveImport: ['verifica'], ordine: ['verifica', 'asc'],
    scadenza: 'mesi_previsti',
  },
  {
    chiave: 'formazione', nome: 'Formazione', singolare: 'corso', daCartella: 'SCHEDA DEL PERSONALE / @ TRAINING',
    descrizione: 'I corsi fatti al personale (IPC-A-610, ESD, procedure, non conformità…): data, argomento, docente, ore e partecipanti.',
    campi: [
      { chiave: 'data', nome: 'Data', tipo: 'data', obbligatorio: true },
      { chiave: 'argomento', nome: 'Argomento', tipo: 'testo', obbligatorio: true, maiuscolo: true, esempio: 'IPC-A-610' },
      { chiave: 'docente', nome: 'Docente', tipo: 'testo' },
      { chiave: 'ore', nome: 'Durata (ore)', tipo: 'numero' },
      { chiave: 'partecipanti', nome: 'Partecipanti', tipo: 'testo_lungo', esempio: 'un nome per riga' },
      { chiave: 'verifica', nome: 'Verifica dell\'efficacia', tipo: 'testo_lungo', esempio: 'questionario, prova pratica…' },
    ],
    colonne: ['data', 'argomento', 'docente', 'ore', 'partecipanti'], chiaveImport: ['data', 'argomento'], ordine: ['data', 'desc'],
  },
  {
    chiave: 'audit', nome: 'Audit', singolare: 'audit', daCartella: 'AUDIT, RIESAME DELLA DIREZIONE',
    descrizione: 'Audit dei clienti, interni e dell\'ente di certificazione: chi, quando, esito, rilievi e la data del prossimo.',
    campi: [
      { chiave: 'data', nome: 'Data', tipo: 'data' },
      { chiave: 'tipo', nome: 'Tipo', tipo: 'scelta', opzioni: { cliente: 'Audit del cliente', interno: 'Audit interno', certificazione: 'Ente di certificazione', questionario: 'Questionario di qualifica', riesame: 'Riesame della direzione' } },
      { chiave: 'chi', nome: 'Cliente / ente', tipo: 'testo', obbligatorio: true, maiuscolo: true },
      { chiave: 'esito', nome: 'Esito', tipo: 'scelta', opzioni: { positivo: 'Positivo', con_rilievi: 'Positivo con rilievi', negativo: 'Negativo', da_fare: 'Da fare' } },
      { chiave: 'rilievi', nome: 'Rilievi e azioni', tipo: 'testo_lungo' },
      { chiave: 'prossimo', nome: 'Prossimo audit', tipo: 'data' },
      { chiave: 'file', nome: 'Dove si trova il rapporto', tipo: 'testo' },
    ],
    colonne: ['data', 'tipo', 'chi', 'esito', 'prossima'], chiaveImport: ['chi', 'data'], ordine: ['data', 'desc'],
    scadenza: 'campo', campoScadenza: 'prossimo',
  },
  {
    chiave: 'rischi', nome: 'Rischi e opportunità', singolare: 'rischio', daCartella: 'TABELLE (ANALISI RISCHI OPPORTUNITA)',
    descrizione: 'Per ogni parte interessata (clienti, fornitori, dipendenti, concorrenti) il vantaggio e il danno possibili, con il punteggio (valore × frequenza da 1 a 10) e le azioni.',
    campi: [
      { chiave: 'parte', nome: 'Parte interessata', tipo: 'scelta', opzioni: { cliente: 'Cliente', fornitore: 'Fornitore', dipendenti: 'Dipendenti', concorrenti: 'Concorrenti', azienda: 'Azienda', altro: 'Altro' } },
      { chiave: 'oggetto', nome: 'Oggetto', tipo: 'testo', obbligatorio: true },
      { chiave: 'vantaggio', nome: 'Vantaggio (1-10)', tipo: 'numero' },
      { chiave: 'frequenza_o', nome: 'Frequenza opportunità (1-10)', tipo: 'numero' },
      { chiave: 'danno', nome: 'Danno (1-10)', tipo: 'numero' },
      { chiave: 'frequenza_r', nome: 'Frequenza rischio (1-10)', tipo: 'numero' },
      { chiave: 'analisi', nome: 'Analisi', tipo: 'testo_lungo' },
      { chiave: 'azioni', nome: 'Azioni', tipo: 'testo_lungo' },
      { chiave: 'riesame', nome: 'Da riesaminare il', tipo: 'data' },
    ],
    colonne: ['parte', 'oggetto', 'opportunita', 'rischio', 'prossima'], chiaveImport: ['oggetto'], ordine: ['rischio', 'desc'],
    scadenza: 'campo', campoScadenza: 'riesame',
  },
];

export const sezioneQualita = (chiave: string) => SEZIONI_QUALITA.find(s => s.chiave === chiave);

export type DatiVoce = Record<string, string | number | number[] | null>;

const testo = (v: unknown) => String(v ?? '').replace(/\r\n/g, '\n').trim();
const NOMI_MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

/** "1, 8" / "1-12" / "gen ago" / [1, 8] → [1, 8]; mesi fuori da 1-12 ignorati. */
export function leggiMesi(v: unknown): number[] {
  if (Array.isArray(v)) return [...new Set(v.map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 12))].sort((a, b) => a - b);
  const t = testo(v).toLowerCase();
  if (!t) return [];
  if (/tutti|mensile|ogni mese/.test(t)) return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const mesi: number[] = [];
  for (const pezzo of t.split(/[\s,;/]+/).filter(Boolean)) {
    const intervallo = pezzo.match(/^(\d{1,2})-(\d{1,2})$/);
    if (intervallo) { for (let m = Number(intervallo[1]); m <= Number(intervallo[2]); m++) mesi.push(m); continue; }
    const nome = NOMI_MESI.findIndex(n => pezzo.startsWith(n));
    mesi.push(nome >= 0 ? nome + 1 : Number(pezzo));
  }
  return leggiMesi(mesi);
}
export const scriviMesi = (m: unknown) => {
  const mesi = leggiMesi(m);
  return mesi.length === 12 ? 'tutti i mesi' : mesi.map(n => NOMI_MESI[n - 1]).join(', ');
};

const dataValida = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d));
/** gg/mm/aaaa o aaaa-mm-gg → aaaa-mm-gg */
function leggiData(v: unknown): string | null {
  const t = testo(v);
  if (dataValida(t)) return t;
  const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) { const d = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; if (dataValida(d)) return d; }
  return null;
}
function leggiNumero(v: unknown): number | null {
  const t = testo(v).replace(/\s/g, '').replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Controlla e ripulisce una riga (dal modulo o dal file da caricare): date in aaaa-mm-gg, numeri con la virgola,
 * scelte solo tra quelle ammesse (altrimenti la prima), codici in MAIUSCOLO, mesi come elenco.
 */
export function preparaVoce(sezione: SezioneQualita, campi: Record<string, unknown>): { dati: DatiVoce; errore: string | null } {
  const dati: DatiVoce = {};
  const mancanti: string[] = [];
  for (const c of sezione.campi) {
    const v = campi[c.chiave];
    let valore: DatiVoce[string];
    if (c.tipo === 'data') valore = leggiData(v);
    else if (c.tipo === 'numero') valore = leggiNumero(v);
    else if (c.tipo === 'mesi') { const m = leggiMesi(v); valore = m.length ? m : null; }
    else if (c.tipo === 'scelta') {
      const t = testo(v);
      valore = c.opzioni && t in c.opzioni ? t : (c.opzioni ? Object.keys(c.opzioni)[0] : null);
    } else {
      let t = c.tipo === 'testo_lungo' ? testo(v) : testo(v).replace(/\s+/g, ' ');
      if (c.maiuscolo) t = t.toUpperCase();
      valore = t || null;
    }
    dati[c.chiave] = valore;
    if (c.obbligatorio && (valore === null || valore === '')) mancanti.push(c.nome);
  }
  return { dati, errore: mancanti.length ? `Manca: ${mancanti.join(', ')}.` : null };
}

/** Punteggi dei rischi: opportunità = vantaggio × frequenza, rischio = danno × frequenza (come nella vecchia tabella). */
export function punteggi(d: DatiVoce) {
  const n = (k: string) => (typeof d[k] === 'number' ? d[k] as number : 0);
  return { opportunita: n('vantaggio') * n('frequenza_o'), rischio: n('danno') * n('frequenza_r') };
}
/** Livello del punteggio rischio: da 40 alto (rosso), da 20 medio (giallo). */
export const livelloRischio = (p: number) => (p >= 40 ? 'alto' : p >= 20 ? 'medio' : 'basso');

const aggiungiMesi = (d: string, mesi: number) => {
  const [a, m, g] = d.split('-').map(Number);
  const x = new Date(Date.UTC(a, m - 1 + mesi, 1));
  const ultimo = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate();
  x.setUTCDate(Math.min(g, ultimo));
  return x.toISOString().slice(0, 10);
};

/**
 * Prossima scadenza della riga, o null se non ne ha:
 * - tarature: ultima + ogni quanti mesi (senza ultima taratura: scaduta oggi);
 * - manutenzioni e verifiche ESD: il primo dei mesi previsti dopo il mese dell'ultima volta (senza ultima: il primo mese previsto dell'anno);
 * - non conformità, audit, rischi: la data scritta (le non conformità chiuse non scadono più).
 */
export function prossimaScadenza(sezione: SezioneQualita, d: DatiVoce, oggi: string): string | null {
  if (sezione.scadenza === 'frequenza_mesi') {
    const f = typeof d.frequenza_mesi === 'number' && d.frequenza_mesi > 0 ? d.frequenza_mesi : null;
    if (!f) return null;
    return typeof d.ultima === 'string' ? aggiungiMesi(d.ultima, f) : oggi;
  }
  if (sezione.scadenza === 'mesi_previsti') {
    const mesi = leggiMesi(d.mesi);
    if (!mesi.length) return null;
    const base = typeof d.ultima === 'string' ? d.ultima : null;
    let anno = Number((base ?? oggi).slice(0, 4));
    const meseBase = base ? Number(base.slice(5, 7)) : 0;
    // il primo mese previsto dopo quello dell'ultima volta (stesso anno o il successivo)
    const dopo = mesi.find(m => m > meseBase);
    const mese = dopo ?? mesi[0];
    if (dopo === undefined) anno++;
    return `${anno}-${String(mese).padStart(2, '0')}-01`;
  }
  if (sezione.scadenza === 'campo' && sezione.campoScadenza) {
    if (sezione.chiave === 'non_conformita' && d.stato === 'chiusa') return null;
    const v = d[sezione.campoScadenza];
    return typeof v === 'string' ? v : null;
  }
  return null;
}

export type StatoScadenza = 'scaduta' | 'vicina' | 'ok';
/**
 * Scaduta se la data è passata (per le scadenze a mese: se il mese è passato), vicina se entro 30 giorni
 * (per le scadenze a mese: il mese in corso o il prossimo).
 */
export function statoScadenza(sezione: SezioneQualita, scadenza: string, oggi: string): StatoScadenza {
  if (sezione.scadenza === 'mesi_previsti') {
    const mese = scadenza.slice(0, 7), ora = oggi.slice(0, 7);
    if (mese < ora) return 'scaduta';
    return mese <= aggiungiMesi(`${ora}-01`, 1).slice(0, 7) ? 'vicina' : 'ok';
  }
  if (scadenza < oggi) return 'scaduta';
  return scadenza <= aggiungiMesi(oggi, 1) ? 'vicina' : 'ok';
}

/** Numero della prossima non conformità dell'anno: NC-2026-001, NC-2026-002… dai numeri già usati. */
export function prossimoNumeroNc(usati: (string | null | undefined)[], anno: number) {
  const prefisso = `NC-${anno}-`;
  const max = usati.reduce((m, u) => {
    const n = u?.startsWith(prefisso) ? Number(u.slice(prefisso.length)) : NaN;
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `${prefisso}${String(max + 1).padStart(3, '0')}`;
}

/** Ordine dell'elenco secondo la sezione (vuoti in fondo). */
export function ordinaVoci<T extends { id: number; dati: DatiVoce }>(sezione: SezioneQualita, voci: T[]): T[] {
  const [campo, verso] = sezione.ordine;
  const valore = (v: T) => (campo === 'rischio' || campo === 'opportunita' ? punteggi(v.dati)[campo] : v.dati[campo]);
  return [...voci].sort((a, b) => {
    const x = valore(a), y = valore(b);
    if (x == null || x === '') return y == null || y === '' ? a.id - b.id : 1;
    if (y == null || y === '') return -1;
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'it', { numeric: true });
    return (verso === 'asc' ? c : -c) || a.id - b.id;
  });
}

export interface ScadenzaQualita { sezione: string; id: number; titolo: string; scadenza: string; stato: StatoScadenza }

/** Titolo breve di una riga (per i riepiloghi): i primi due campi testo obbligatori. */
export function titoloVoce(sezione: SezioneQualita, d: DatiVoce) {
  const pezzi = sezione.campi.filter(c => c.obbligatorio && c.tipo !== 'data').slice(0, 2).map(c => d[c.chiave]).filter(Boolean);
  if (sezione.chiave === 'non_conformita') pezzi.unshift(d.numero ?? null);
  return pezzi.filter(Boolean).join(' · ').slice(0, 120) || sezione.singolare;
}

/**
 * Cruscotto della Qualità: quante righe per sezione, le non conformità aperte e tutte le scadenze passate o vicine
 * (tarature, manutenzioni, verifiche ESD, azioni correttive, audit, riesami), dalla più vecchia.
 */
export function riepilogoQualita(voci: { id: number; sezione: string; dati: DatiVoce }[], oggi: string) {
  const conteggi: Record<string, number> = Object.fromEntries(SEZIONI_QUALITA.map(s => [s.chiave, 0]));
  const scadenze: ScadenzaQualita[] = [];
  let ncAperte = 0;
  for (const v of voci) {
    const s = sezioneQualita(v.sezione);
    if (!s) continue;
    conteggi[s.chiave]++;
    if (s.chiave === 'non_conformita' && v.dati.stato !== 'chiusa') ncAperte++;
    const sc = prossimaScadenza(s, v.dati, oggi);
    if (!sc) continue;
    const stato = statoScadenza(s, sc, oggi);
    if (stato !== 'ok') scadenze.push({ sezione: s.chiave, id: v.id, titolo: titoloVoce(s, v.dati), scadenza: sc, stato });
  }
  scadenze.sort((a, b) => a.scadenza.localeCompare(b.scadenza) || a.id - b.id);
  return { conteggi, ncAperte, scadute: scadenze.filter(x => x.stato === 'scaduta'), vicine: scadenze.filter(x => x.stato === 'vicina') };
}

/** I difetti più frequenti nelle non conformità (codice → quante volte e pezzi), dal più frequente. */
export function difettiFrequenti(nc: DatiVoce[]) {
  const conti = new Map<string, { volte: number; pezzi: number }>();
  for (const d of nc) {
    const k = typeof d.difetto === 'string' ? d.difetto : '';
    if (!k) continue;
    const c = conti.get(k) ?? { volte: 0, pezzi: 0 };
    c.volte++; c.pezzi += typeof d.quantita_difettosa === 'number' ? d.quantita_difettosa : 0;
    conti.set(k, c);
  }
  return [...conti].map(([codice, c]) => ({ codice, ...c })).sort((a, b) => b.volte - a.volte || b.pezzi - a.pezzi || a.codice.localeCompare(b.codice, 'it', { numeric: true }));
}

/** Chiave di una riga per il caricamento del file: stesse chiavi = stessa riga (si aggiorna). Senza chiave: il contenuto intero. */
export function chiaveImport(sezione: SezioneQualita, d: DatiVoce) {
  const valori = sezione.chiaveImport.map(k => d[k] ?? '');
  return valori.every(v => v === '') ? JSON.stringify(d) : valori.map(v => String(v).toUpperCase()).join('|');
}

export interface FileQualita { sezioni: Record<string, Record<string, unknown>[]> }

/** Controlla il file da caricare: { sezioni: { documenti: [...], strumenti: [...] } }, solo sezioni conosciute. */
export function controllaFileQualita(f: unknown): FileQualita {
  const sezioni = (f as FileQualita)?.sezioni;
  if (!sezioni || typeof sezioni !== 'object') throw new Error('serve "sezioni" con le righe di ogni sezione');
  const sconosciute = Object.keys(sezioni).filter(k => !sezioneQualita(k));
  if (sconosciute.length) throw new Error(`sezioni sconosciute: ${sconosciute.join(', ')}`);
  for (const [k, righe] of Object.entries(sezioni)) if (!Array.isArray(righe)) throw new Error(`"${k}" deve essere un elenco`);
  return { sezioni };
}
