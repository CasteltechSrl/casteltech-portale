/**
 * Regole AGGIUNTE alla codifica dopo il programma "Codifica componenti" (Adriano 1/11/2026: "se ci sono famiglie nuove aggiungile,
 * l'importante è che ne tieni traccia e che ci sia una logica rispetto a quello che già c'è").
 * Qui c'è il REGISTRO di tutto quello che è stato aggiunto (si vede in Impostazioni → Componenti) e le tabelle dei case nuovi.
 * Logica seguita:
 *  - i componenti già in archivio NON cambiano codice (l'archivio si legge prima delle regole);
 *  - una famiglia nuova solo per componenti che prima restavano "da completare" (nessuna famiglia), con codici costruiti
 *    come quelli delle famiglie vicine (es. film come i ceramici, termistori come le resistenze);
 *  - un case sinonimo esatto di uno già in tabella prende lo stesso codice (OK); un case solo simile prende il codice del
 *    più vicino ma resta "DA VERIFICARE" con la nota; un case nuovo prende un codice nuovo di 4 caratteri nello stesso stile.
 * Nessun accesso al database.
 */

export interface VoceRegistro { data: string; tipo: 'famiglia' | 'case' | 'categoria' | 'parole BOM' | 'ricerca prezzi'; cosa: string; perche: string }

/** Case nuovi o sinonimi: chiave = case senza spazi e trattini, in maiuscolo → [codice, tecnologia, OK/VER, nota]. */
export const CASE_AGGIUNTI: Record<string, [string, 'S' | 'T', 'OK' | 'VER', string]> = {
  // sinonimi esatti di case già in tabella
  TO252: ['DPAK', 'S', 'OK', ''], TO2523: ['DPAK', 'S', 'OK', ''], SC703: ['T323', 'S', 'OK', ''], SC74A: ['T235', 'S', 'OK', ''],
  SC74: ['T236', 'S', 'OK', ''], SC88A: ['T353', 'S', 'OK', ''], SC88: ['T363', 'S', 'OK', ''], SOT253: ['T235', 'S', 'OK', ''],
  TO236: ['T023', 'S', 'OK', ''], SOT3236: ['T363', 'S', 'OK', ''], SOT3235: ['T353', 'S', 'OK', ''],
  // simili a un case già in tabella: da verificare
  TSOT235: ['T235', 'S', 'VER', 'TSOT-23-5: stessa impronta del SOT-23-5 (più basso)'],
  TSOT233: ['T023', 'S', 'VER', 'TSOT-23-3: stessa impronta del SOT-23 (più basso)'],
  TSOT23: ['T023', 'S', 'VER', 'TSOT-23: stessa impronta del SOT-23 (più basso)'],
  TSOT238: ['T238', 'S', 'VER', 'TSOT-23-8: stessa impronta del SOT-23-8 (più basso)'],
  SOD123FL: ['D12F', 'S', 'VER', 'SOD-123FL trattato come SOD-123F'],
  // case nuovi (codice nuovo nello stesso stile: lettera della famiglia + numero)
  SOT563: ['T563', 'S', 'OK', ''], SOT5636: ['T563', 'S', 'OK', ''], SOT963: ['T963', 'S', 'OK', ''], SOT883: ['T883', 'S', 'OK', ''],
  SOD123W: ['D12W', 'S', 'OK', ''], TO277: ['T277', 'S', 'OK', ''], TO277A: ['T277', 'S', 'OK', ''],
  POWERDI123: ['PD12', 'S', 'OK', ''], POWERDI5: ['PD05', 'S', 'OK', ''],
  POWERPAKSO8: ['PP08', 'S', 'VER', 'PowerPAK SO-8: impronta diversa dal SO-8 normale'],
  LFPAK56: ['LF56', 'S', 'OK', ''], LFPAK33: ['LF33', 'S', 'OK', ''],
  TO247: ['T247', 'T', 'OK', ''], TO2473: ['T247', 'T', 'OK', ''], TO126: ['T126', 'T', 'OK', ''],
  TO220F: ['T22F', 'T', 'OK', ''], TO220FP: ['T22F', 'T', 'OK', ''], ITO220: ['T22F', 'T', 'OK', ''], TO3P: ['T03P', 'T', 'OK', ''],
  DO201AD: ['D201', 'T', 'OK', ''], DO201: ['D201', 'T', 'OK', ''], DO15: ['DO15', 'T', 'OK', ''], DO35: ['DO35', 'T', 'OK', ''],
};

/**
 * Famiglie di package di integrati aggiunte (nnFAMIGLIA, es. 8WSON): codice = sigla + numero di piedini come le altre (QN32, SO08).
 * Tutte "DA VERIFICARE" perché accorpate a una famiglia di forma simile.
 */
export const IC_FAM_AGGIUNTE: Record<string, [string, string]> = {
  WSON: ['DN', 'WSON trattato come DFN (piedini su due lati, senza terminali)'], VSON: ['DN', 'VSON trattato come DFN'],
  SON: ['DN', 'SON trattato come DFN'], USON: ['DN', 'USON trattato come DFN'], X2SON: ['DN', 'X2SON trattato come DFN'],
  TDSON: ['DN', 'TDSON trattato come DFN'], HSOIC: ['SO', 'HSOIC (con piazzola sotto) trattato come SOIC'],
  HSOP: ['SO', 'HSOP (con piazzola sotto) trattato come SOIC'], HVSSOP: ['MS', 'HVSSOP trattato come MSOP'],
  HTQFP: ['TQ', 'HTQFP (con piazzola sotto) trattato come TQFP'], HLQFP: ['LQ', 'HLQFP trattato come LQFP'],
  HVQFN: ['QN', 'HVQFN trattato come QFN'], PQFN: ['QN', 'PQFN trattato come QFN'], WLCSP: ['WL', 'WLCSP: famiglia WL'],
  DSBGA: ['BG', 'DSBGA trattato come BGA'], UFBGA: ['BG', 'UFBGA trattato come BGA'], TFBGA: ['BG', 'TFBGA trattato come BGA'],
  LFBGA: ['BG', 'LFBGA trattato come BGA'], FBGA: ['BG', 'FBGA trattato come BGA'], VFBGA: ['BG', 'VFBGA trattato come BGA'],
  CABGA: ['BG', 'CABGA trattato come BGA'],
};
/** Integrati THT in DIP: DPnn come il 6DIP già in tabella (DP06). */
export const DIP_THT = ['DIP', 'PDIP', 'CDIP'];

/** Tipi di batterie/portabatterie e antenne per il codice gestionale (4 caratteri, come i tipi dei connettori). */
export const TIPI_BATTERIE: Record<string, string> = { PORTABATTERIA: 'PBAT', BATTERIA: 'BATT', CONTATTO: 'CBAT' };
export const TIPI_ANTENNE: Record<string, string> = { CHIP: 'ANTC', PCB: 'ANTP', FILO: 'ANTF', ESTERNA: 'ANTE' };

/** Tutto quello che è stato aggiunto, con la data e il motivo (pagina Impostazioni → Componenti). */
export const REGISTRO_AGGIUNTE: VoceRegistro[] = [
  { data: '01/11/2026', tipo: 'famiglia', cosa: 'CF Condensatori film (MKP/MKT, poliestere, polipropilene)',
    perche: 'prima restavano senza famiglia; codici come i ceramici: CF-case-valore-tolleranza-tensione, case THT = passo (P150 = 15 mm)' },
  { data: '01/11/2026', tipo: 'famiglia', cosa: 'NT Termistori NTC/PTC',
    perche: 'prima finivano in Miscellaneus senza valore; codici come le resistenze: NT-case-valore-tolleranza' },
  { data: '01/11/2026', tipo: 'famiglia', cosa: 'BT Batterie e portabatterie',
    perche: 'prima restavano senza famiglia; codici come i relè: BT-tipo-P/N; tipo PORTABATTERIA / BATTERIA / CONTATTO' },
  { data: '01/11/2026', tipo: 'famiglia', cosa: 'AN Antenne',
    perche: 'prima restavano senza famiglia; codici come i relè: AN-tipo-P/N; tipo CHIP / PCB / FILO / ESTERNA' },
  { data: '01/11/2026', tipo: 'categoria', cosa: 'Categorie DigiKey lette dalla più specifica',
    perche: 'gli oscillatori finivano tra i quarzi, i varistori tra i TVS e i trimmer tra le resistenze (la categoria madre li contiene tutti)' },
  { data: '01/11/2026', tipo: 'categoria', cosa: 'Fotoaccoppiatori e isolatori → IC; convertitori DC-DC → CV; choke di modo comune → FE; trasformatori → TF; supercondensatori → CE',
    perche: 'categorie DigiKey che prima non davano famiglia; si usano le famiglie già esistenti (in archivio ci sono SO-4 e DIP-6 dei fotoaccoppiatori)' },
  { data: '01/11/2026', tipo: 'case', cosa: `${Object.keys(CASE_AGGIUNTI).length} case nuovi o sinonimi (TO-252, SC-70-3, TSOT-23-5, SOT-563, TO-247, DO-201AD…)`,
    perche: 'prima davano "case non in tabella"; i sinonimi esatti prendono lo stesso codice, quelli solo simili restano da verificare' },
  { data: '01/11/2026', tipo: 'case', cosa: `Package di integrati: ${Object.keys(IC_FAM_AGGIUNTE).join(', ')}, ${DIP_THT.join('/')}`,
    perche: 'accorpati alla famiglia di forma più vicina (es. WSON come DFN), da verificare' },
  { data: '01/11/2026', tipo: 'parole BOM', cosa: 'Parole e riferimenti: NTC/termistore (RT, TH), batteria (BT), antenna (ANT), trimmer/potenziometro, fotoaccoppiatore (OK, ISO), film/MKP/MKT',
    perche: 'righe senza P/N riconosciute dalla descrizione o dal riferimento' },
];
