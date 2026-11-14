/**
 * Collegamento con la banca (Adriano 7/11/2026, "scarica tutte le operazioni e le associa a spese e entrate e carica le fatture da anticipare
 * (bonifico o RiBa) o mi genera il file da caricare"). Scelta di Adriano: prima i file della banca (BPER), poi l'open banking PSD2.
 *
 * - Estratto conto: file CBI "RH" (rendicontazione movimenti, righe da 120 caratteri) oppure Excel/CSV scaricato dall'home banking
 *   (`leggiCbi`, `movimentiDaTabella`). Ogni movimento ha una chiave (`chiaviMovimenti`): ricaricando un periodo già caricato non si raddoppia.
 * - Abbinamento (`proponiAbbinamento`): entrate → rate aperte delle fatture emesse, uscite → rate aperte delle fatture dei fornitori;
 *   importo uguale (al centesimo), poi numero della fattura e nome della controparte nella descrizione, poi la data più vicina.
 *   Più rate della stessa controparte che fanno l'importo (bonifico che paga più fatture) e distinta RiBa intera (accredito unico).
 *   Movimenti senza fattura: categoria proposta (`categoriaProposta`: commissioni, F24, stipendi…), modificabile.
 * - RiBa (`generaRiba`): file CBI standard "Ri.Ba. da azienda a banca" (record IB, 14, 20, 30, 40, 50, 51, 70, EF) con le rate scelte,
 *   da caricare nell'home banking. Serve il codice SIA dell'azienda (lo dà la banca) e ABI/CAB della banca del cliente (dall'IBAN in Dati fiscali).
 */

// ───────────────────────────── movimenti ─────────────────────────────

export interface Movimento {
  data: string;            // data contabile AAAA-MM-GG
  valuta: string | null;   // data valuta
  importo: number;         // + entrata, − uscita
  descrizione: string;
  causale: string | null;  // causale ABI/CBI (2 caratteri) o causale interna della banca (BPER: 4 caratteri) se il file la dà
  rapporto?: string | null; // conto del movimento quando il file ne ha più d'uno (CSV di BPER: colonna Rapporto = IBAN)
}

const pulisci = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** Data da gg/mm/aaaa, gg/mm/aa, gg.mm.aaaa, aaaa-mm-gg o ggmmaa (CBI). Null se non è una data valida. */
export function dataDa(v: unknown): string | null {
  const s = pulisci(v);
  let g: number, m: number, a: number;
  let x = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (x) { a = +x[1]; m = +x[2]; g = +x[3]; }
  else if ((x = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})$/))) { g = +x[1]; m = +x[2]; a = +x[3]; }
  else if ((x = s.match(/^(\d{2})(\d{2})(\d{2})$/))) { g = +x[1]; m = +x[2]; a = +x[3]; }
  else return null;
  if (a < 100) a += 2000;
  if (m < 1 || m > 12 || g < 1 || g > 31) return null;
  const d = new Date(Date.UTC(a, m - 1, g));
  if (d.getUTCDate() !== g) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Importo da testo. `italiano` = il punto separa le migliaia (CSV dell'home banking: "1.234,56", "-50,00");
 * altrimenti numero di Excel ("1234.56"). Anche "€", spazi, segno in fondo ("50,00-") e parentesi. Null se non è un numero.
 */
export function importoDa(v: unknown, italiano = true): number | null {
  let s = pulisci(v).replace(/[€\s]|EUR/gi, '');
  if (!s) return null;
  let segno = 1;
  if (/^\(.*\)$/.test(s)) { segno = -1; s = s.slice(1, -1); }
  if (s.endsWith('-')) { segno = -segno; s = s.slice(0, -1); }
  if (s.startsWith('+')) s = s.slice(1);
  if (s.startsWith('-')) { segno = -segno; s = s.slice(1); }
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (s.includes(',')) s = s.replace(',', '.');
  else if (italiano && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return Math.round(segno * Number(s) * 100) / 100;
}

/**
 * File CBI "RH" (rendicontazione di conto corrente, tracciato standard delle banche italiane): righe da 120 caratteri.
 * 62 = movimento (data valuta, data contabile, segno D/C, importo, causale ABI, descrizione), 63 = descrizione che continua.
 * Righe più corte o con i ritorni a capo tolti vanno bene lo stesso (si tagliano a 120).
 */
export function leggiCbi(testo: string): Movimento[] | null {
  let righe = testo.split(/\r?\n/).filter(r => r.trim());
  // file senza ritorni a capo: tutto in una riga lunga multipla di 120
  if (righe.length === 1 && righe[0].length > 240) righe = righe[0].match(/.{1,120}/g) ?? [];
  if (!righe.some(r => /^ ?RH/.test(r)) || !righe.some(r => /^ ?62/.test(r))) return null;
  const fuori: Movimento[] = [];
  for (const grezza of righe) {
    const r = (grezza.startsWith(' ') ? grezza : ' ' + grezza).padEnd(120);
    const tipo = r.slice(1, 3);
    if (tipo === '62') {
      const valuta = dataDa(r.slice(13, 19));
      const data = dataDa(r.slice(19, 25)) ?? valuta;
      const segno = r.slice(25, 26).toUpperCase() === 'D' ? -1 : 1;
      const campo = r.slice(26, 41).trim();
      const importo = campo.includes(',') ? importoDa(campo) : (/^\d+$/.test(campo) ? Number(campo) / 100 : null);
      if (!data || importo == null) continue;
      fuori.push({ data, valuta, importo: Math.round(segno * Math.abs(importo) * 100) / 100,
        causale: r.slice(41, 43).trim() || null, descrizione: pulisci(r.slice(88, 120)) });
    } else if (tipo === '63' && fuori.length) {
      const ultimo = fuori[fuori.length - 1];
      ultimo.descrizione = pulisci(`${ultimo.descrizione} ${r.slice(13, 120)}`);
    }
  }
  return fuori;
}

const norm = (s: unknown) => pulisci(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Movimenti da una tabella (Excel o CSV dell'home banking): cerca la riga di intestazione e le colonne da sole.
 * Colonne riconosciute: data (contabile/operazione), valuta, importo unico oppure dare/avere (addebiti/accrediti, uscite/entrate),
 * descrizione (anche causale e descrizione estesa, unite). `italiano` = i numeri sono testo all'italiana (CSV).
 */
export function movimentiDaTabella(righe: string[][], italiano = true): { movimenti: Movimento[]; errore?: string } {
  const trova = (intest: string[], re: RegExp, escludi?: RegExp) => intest.findIndex(h => re.test(h) && !(escludi && escludi.test(h)));
  for (let i = 0; i < Math.min(righe.length, 40); i++) {
    const intest = (righe[i] ?? []).map(norm);
    const cData = (() => {
      // BPER "Tutti i movimenti" → CSV: colonne Contabile e Valuta (Adriano 7/11/2026)
      const preferita = trova(intest, /^data\b.*(contab|operaz|registr|movim)|^data$|^contabile$/, /valuta/);
      return preferita >= 0 ? preferita : trova(intest, /^data|^date$/, /valuta/);
    })();
    if (cData < 0) continue;
    const cValuta = trova(intest, /valuta/);
    const cImporto = trova(intest, /^importo|^ammontare|^amount/);
    const cDare = trova(intest, /dare|addebit|uscit|^debit/);
    const cAvere = trova(intest, /avere|accredit|entrat|^credit/);
    const cSegno = trova(intest, /^segno$|^d\/c$|^dare\/avere$/);
    const cCausale = trova(intest, /^cau(\.|s\.?)?$|^causale abi$|^cod(ice)?\.? ?causale/);
    const cRapporto = trova(intest, /^rapporto$|^iban$|^conto$|^conto corrente$|^numero conto$/);
    const cDescr = intest.map((h, k) => (/descriz|causale|dettagli|operazione|beneficiario|ordinante|riferiment/.test(h) && k !== cData && k !== cValuta && k !== cCausale ? k : -1)).filter(k => k >= 0);
    if (cImporto < 0 && (cDare < 0 || cAvere < 0)) continue;
    const movimenti: Movimento[] = [];
    for (const r of righe.slice(i + 1)) {
      if (!r || r.every(c => !pulisci(c))) continue;
      const data = dataDa(r[cData]);
      if (!data) continue;   // righe di saldo, totali, note in fondo
      let importo: number | null;
      if (cImporto >= 0 && cImporto !== cSegno && pulisci(r[cImporto])) {
        importo = importoDa(r[cImporto], italiano);
        if (importo != null && cSegno >= 0 && /^(d|dare|-)$/i.test(pulisci(r[cSegno]))) importo = -Math.abs(importo);
      } else {
        const dare = cDare >= 0 ? importoDa(r[cDare], italiano) : null;
        const avere = cAvere >= 0 ? importoDa(r[cAvere], italiano) : null;
        importo = avere ? Math.abs(avere) : dare ? -Math.abs(dare) : null;
      }
      if (importo == null || importo === 0) continue;
      movimenti.push({ data, valuta: cValuta >= 0 ? dataDa(r[cValuta]) : null, importo,
        descrizione: pulisci(cDescr.map(k => r[k]).filter(v => pulisci(v)).join(' · ')), causale: cCausale >= 0 ? pulisci(r[cCausale]) || null : null,
        ...(cRapporto >= 0 && pulisci(r[cRapporto]) ? { rapporto: numeroConto(r[cRapporto]) } : {}) });
    }
    return { movimenti };
  }
  return { movimenti: [], errore: 'Non trovo le colonne del file: servono almeno Data e Importo (oppure Dare e Avere). Mandami il file e lo aggiungo.' };
}

/**
 * Chiave di ogni movimento: data, importo e descrizione (+ quante volte lo stesso movimento compare prima nello stesso file).
 * Ricaricando un file che si sovrappone a uno già caricato, i movimenti già presenti hanno la stessa chiave e non si ripetono.
 */
export function chiaviMovimenti(movimenti: Movimento[], conto: string): string[] {
  const visti = new Map<string, number>();
  return movimenti.map(m => {
    const base = `${(m.rapporto ?? conto).toUpperCase()}|${m.data}|${m.importo.toFixed(2)}|${norm(m.descrizione).replace(/[^a-z0-9]/g, '').slice(0, 60)}`;
    const n = visti.get(base) ?? 0;
    visti.set(base, n + 1);
    return `${base}|${n}`;
  });
}

// ───────────────────────────── conti ─────────────────────────────

/** Numero del conto senza zeri davanti: da IBAN ("IT37B0538765310000003092938" → "3092938") o da numero ("000003092938"). */
export function numeroConto(v: unknown): string {
  const s = String(v ?? '').toUpperCase().replace(/[\s-]/g, '');
  const iban = s.match(/^IT\d{2}[A-Z]\d{10}([A-Z0-9]{12})$/);
  return (iban ? iban[1] : s).replace(/^0+(?=.)/, '');
}

/**
 * Conti della banca (impostazioni 'banca'.conti): nome, tipo (ordinario = c/c dove passano incassi e pagamenti; anticipo = conto tecnico
 * dell'anticipo fatture/RiBa), saldo di riferimento a una data (dall'estratto conto) e affidamento. Saldo di oggi = riferimento + movimenti dopo quella data.
 */
/** Tipo del conto: corrente, tecnico d'anticipo, carta di credito o PayPal (Adriano 14/11/2026: carta e PayPal dal collegamento automatico). */
export type TipoConto = 'ordinario' | 'anticipo' | 'carta' | 'paypal';
export const TIPI_CONTO: [TipoConto, string][] = [['ordinario', 'conto corrente'], ['anticipo', 'anticipo (tecnico)'], ['carta', 'carta di credito'], ['paypal', 'PayPal']];
export const tipoConto = (v: unknown): TipoConto => (TIPI_CONTO.find(([k]) => k === v)?.[0] ?? 'ordinario');
export interface ContoBanca { numero: string; nome: string; tipo: TipoConto; saldoData: string | null; saldo: number | null; fido: number | null }

export function nomeConto(numero: string, conti: ContoBanca[]): string {
  return conti.find(c => c.numero === numero)?.nome ?? numero;
}

/** Conto nuovo visto in un file: ordinario se è l'IBAN dell'azienda, altrimenti conto tecnico d'anticipo. */
export function contoNuovo(numero: string, ibanAzienda: string): ContoBanca {
  const ordinario = !!ibanAzienda && numeroConto(ibanAzienda) === numero;
  return { numero, nome: ordinario ? `BPER c/c ${numero}` : `BPER anticipo ${numero}`, tipo: ordinario ? 'ordinario' : 'anticipo', saldoData: null, saldo: null, fido: null };
}

/** Saldo di oggi del conto: saldo di riferimento + movimenti con data successiva. Null senza riferimento. */
export function saldoConto(c: ContoBanca, movimenti: { data: string; importo: number }[]): number | null {
  if (c.saldo == null || !c.saldoData) return null;
  return Math.round((c.saldo + movimenti.filter(m => m.data > c.saldoData!).reduce((s, m) => s + m.importo, 0)) * 100) / 100;
}

// ───────────────────────────── abbinamento ─────────────────────────────

export interface RataAperta {
  id: number;
  tipo: 'emessa' | 'ricevuta';     // rata di una fattura emessa (incasso) o di una fattura del fornitore (pagamento)
  documentoId: number;
  numero: string;                  // numero della fattura come si scrive (es. "127" o "FT 2026/45")
  dataDoc: string;
  scadenza: string;
  importo: number;                 // da incassare / da pagare (positivo)
  controparte: string;
  partitaIva?: string | null;
  riba?: boolean;                  // rata da pagare con RiBa
  distintaId?: number | null;      // distinta RiBa in cui è stata presentata
  gia?: boolean;                   // rata già segnata pagata (storico FIC o a mano) e non ancora collegata a un movimento
  pagataIl?: string | null;        // data in cui è stata segnata pagata (solo con `gia`)
}

export interface Proposta { rate: RataAperta[]; punteggio: number; motivo: string }

const PAROLE_VUOTE = new Set(['srl', 'spa', 'snc', 'sas', 'srls', 'via', 'del', 'per', 'ltd', 'inc', 'gmbh', 'bonifico', 'fattura', 'fatt', 'societa', 'soc', 'coop', 'group', 'italia', 'italy', 'the', 'and', 'con', 'unipersonale',
  'electronics', 'elettronica', 'sistemi', 'systems', 'technology', 'tecnologie', 'service', 'servizi', 'industrie', 'industries', 'international']);

/** Parole che distinguono la controparte (almeno 3 lettere, niente forme societarie). */
export function paroleNome(nome: string): string[] {
  return [...new Set(norm(nome).replace(/[^a-z0-9 ]/g, ' ').split(' ').filter(p => p.length >= 3 && !PAROLE_VUOTE.has(p)))];
}

/** Quanto la descrizione del movimento somiglia alla controparte: 0 nessuna parola, 1 tutte. */
export function somiglianzaNome(descrizione: string, nome: string): number {
  const parole = paroleNome(nome);
  if (!parole.length) return 0;
  const d = ' ' + norm(descrizione).replace(/[^a-z0-9]/g, ' ') + ' ';
  return parole.filter(p => d.includes(` ${p} `) || (p.length >= 6 && d.includes(p))).length / parole.length;
}

/** Il numero della fattura compare nella descrizione ("FT 127", "FATT. N. 127/2026", "FATTURA 127 DEL", "NR 127")? */
export function citaNumero(descrizione: string, numero: string): boolean {
  const n = pulisci(numero).replace(/^0+/, '');
  if (!n) return false;
  const d = norm(descrizione);
  const esc = n.toLowerCase().replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
  // numero "breve" (solo cifre): serve una parola di fattura vicina, così 127 non si confonde con un importo o un CAP
  if (/^\d{1,4}$/.test(n)) return new RegExp(`(fatt|fattura|fatture|ft|fat|fa|doc|nr|n)[^a-z0-9]{0,4}(n[^a-z0-9]{0,3})?0*${esc}(?![0-9])`).test(d);
  return new RegExp(`(^|[^a-z0-9])${esc}(?![a-z0-9])`).test(d);
}

const giorni = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;
const ugualeAlCentesimo = (a: number, b: number) => Math.abs(a - b) < 0.005;

function punteggioRata(m: Movimento, r: RataAperta): { punti: number; perche: string[] } {
  const perche: string[] = [];
  let punti = 50;
  if (citaNumero(m.descrizione, r.numero)) { punti += 30; perche.push(`cita la fattura ${r.numero}`); }
  const s = somiglianzaNome(m.descrizione, r.controparte);
  if (s > 0) { punti += Math.round(25 * s); perche.push(`nome ${r.controparte}`); }
  if (r.partitaIva && norm(m.descrizione).includes(r.partitaIva.toLowerCase())) { punti += 15; perche.push('partita IVA'); }
  if (r.gia && r.pagataIl) {
    // rata già segnata pagata: conta il giorno in cui è stata segnata, non la scadenza (Adriano 14/11/2026, Selea FT 111, Cetani FPR 10/26)
    const g = giorni(m.data, r.pagataIl);
    if (g <= 3) { punti += 15; perche.push(`già segnata pagata il ${r.pagataIl.split('-').reverse().join('/')}`); }
    else punti -= Math.min(30, Math.floor(g / 3));
    return { punti, perche };
  }
  punti += Math.max(0, 10 - Math.floor(giorni(m.data, r.scadenza) / 10));
  return { punti, perche };
}

/** Sottoinsieme di rate (al massimo `max`, dalle più vecchie) che fa esattamente `totale`. */
function sommaEsatta(rate: RataAperta[], totale: number, max = 10): RataAperta[] | null {
  const elenco = [...rate].sort((a, b) => a.scadenza.localeCompare(b.scadenza)).slice(0, max);
  const obiettivo = Math.round(totale * 100);
  const valori = elenco.map(r => Math.round(r.importo * 100));
  let migliore: number[] | null = null;
  const prova = (i: number, somma: number, scelte: number[]) => {
    if (migliore) return;
    if (somma === obiettivo && scelte.length >= 2) { migliore = [...scelte]; return; }
    if (i >= elenco.length || somma > obiettivo) return;
    scelte.push(i); prova(i + 1, somma + valori[i], scelte); scelte.pop();
    prova(i + 1, somma, scelte);
  };
  prova(0, 0, []);
  return migliore ? (migliore as number[]).map(i => elenco[i]) : null;
}

/**
 * Movimenti che non sono mai l'incasso o il pagamento di una fattura, anche se l'importo torna: l'anticipo della banca
 * ("ANTICIPO SU DOCUMENTI FT 45" = proprio l'importo della fattura 45), il rientro dell'anticipo, competenze, bolli, commissioni.
 * L'incasso vero è il bonifico del cliente ("BONIFICO o/c: SELEA ... FT 53").
 */
export const MAI_FATTURA = /anticipo su documenti|rientro anticipo|^competenze|giroconto competenze|imposta di bollo|^commissioni|interessi a debito|emolument|pagamento carta di credito|delega unificata|\bf24\b/;

/** Soglia da cui la proposta è "sicura" (spuntata già nella pagina). */
export const SOGLIA_SICURA = 75;

/**
 * Fattura emessa senza rate (8/11/2026: FT 52/2026 di Plantbit arrivata da FIC senza scadenze, il bonifico non trovava nulla da abbinare):
 * una sola rata = totale della fattura alla data del documento, bonifico. Nessuna rata se la fattura ne ha già o non è emessa.
 */
export function rataMancante(f: { tipo: string; stato: string; numero: number | null; data: string; totale: number | null; rate: number }):
  { data: string; importo: number; modalita: string } | null {
  if (f.tipo !== 'fattura' || f.numero == null || ['bozza', 'annullato', 'scartato'].includes(f.stato) || f.rate > 0 || !f.totale || f.totale <= 0) return null;
  return { data: f.data, importo: Math.round(f.totale * 100) / 100, modalita: 'MP05' };
}

/**
 * Proposta di abbinamento di un movimento con le rate aperte. Entrate → rate emesse, uscite → rate ricevute.
 * 1) distinta RiBa intera con lo stesso totale; 2) una rata con lo stesso importo (la migliore per numero, nome, data);
 * 3) più rate della stessa controparte (citata nella descrizione) che fanno l'importo. Null se nessuna rata torna con l'importo.
 */
export function proponiAbbinamento(m: Movimento, rate: RataAperta[], opz: { contoTecnico?: boolean } = {}): Proposta | null {
  // conti tecnici (anticipo RiBa / Italia / estero) e movimenti della banca: mai una fattura (Adriano 7/11/2026)
  if (opz.contoTecnico || MAI_FATTURA.test(norm(m.descrizione))) return null;
  const soloDistinta = /^giroconto/.test(norm(m.descrizione));
  const tipo = m.importo > 0 ? 'emessa' : 'ricevuta';
  const importo = Math.abs(m.importo);
  const candidate = rate.filter(r => r.tipo === tipo && r.importo > 0);
  // 1) distinta RiBa: la banca accredita il totale della distinta in un colpo solo
  if (tipo === 'emessa') {
    const perDistinta = new Map<number, RataAperta[]>();
    for (const r of candidate) if (r.distintaId) perDistinta.set(r.distintaId, [...(perDistinta.get(r.distintaId) ?? []), r]);
    for (const [id, gruppo] of perDistinta) {
      if (gruppo.length > 1 && ugualeAlCentesimo(gruppo.reduce((s, r) => s + r.importo, 0), importo))
        return { rate: gruppo, punteggio: /riba|ri\.ba|effett|sbf|s\.b\.f|portafoglio/i.test(m.descrizione) ? 95 : 85, motivo: `totale della distinta RiBa n. ${id}` };
    }
  }
  if (soloDistinta) return null;   // giroconto dal conto anticipo RiBa: solo una distinta intera
  // 2) una rata con lo stesso importo
  const stesse = candidate.filter(r => ugualeAlCentesimo(r.importo, importo))
    .map(r => ({ r, ...punteggioRata(m, r) })).sort((a, b) => b.punti - a.punti || a.r.scadenza.localeCompare(b.r.scadenza));
  if (stesse.length) {
    const [p, secondo] = stesse;
    // due rate uguali e niente che le distingua: proposta da controllare
    const incerta = secondo && secondo.punti === p.punti;
    return { rate: [p.r], punteggio: incerta ? Math.min(p.punti, SOGLIA_SICURA - 1) : p.punti,
      motivo: ['stesso importo', ...p.perche, incerta ? `ci sono ${stesse.filter(x => x.punti === p.punti).length} rate uguali: controlla` : ''].filter(Boolean).join(', ') };
  }
  // 3) più rate della stessa controparte (nome nella descrizione)
  const perControparte = new Map<string, RataAperta[]>();
  for (const r of candidate) perControparte.set(r.controparte, [...(perControparte.get(r.controparte) ?? []), r]);
  let migliore: Proposta | null = null;
  for (const [nome, gruppo] of perControparte) {
    const s = somiglianzaNome(m.descrizione, nome);
    if (s <= 0 || gruppo.length < 2) continue;
    const scelte = sommaEsatta(gruppo, importo);
    if (!scelte) continue;
    const citate = scelte.filter(r => citaNumero(m.descrizione, r.numero)).length;
    const punti = 60 + Math.round(20 * s) + (citate === scelte.length ? 15 : 0);
    if (!migliore || punti > migliore.punteggio) migliore = { rate: scelte, punteggio: punti, motivo: `${scelte.length} fatture di ${nome} che fanno l'importo` };
  }
  if (migliore) return migliore;
  // 4) distinta di bonifici ai fornitori senza i nomi ("DISPOSIZIONE ... Num. Distinta"): fatture dei fornitori in scadenza vicino
  //    alla data che fanno esattamente il totale (Adriano 14/11/2026: "bonifici aggregati dove non si vede il dettaglio")
  if (tipo === 'ricevuta' && /distinta/.test(norm(m.descrizione)) && !/emolument|stipend|retribuz/.test(norm(m.descrizione))) {
    const vicine = candidate.filter(r => !r.gia && giorni(m.data, r.scadenza) <= 20)
      .sort((a, b) => giorni(m.data, a.scadenza) - giorni(m.data, b.scadenza)).slice(0, 14);
    const scelte = sommaEsatta(vicine, importo, 14);
    if (scelte) return { rate: scelte, punteggio: 70, motivo: `distinta: ${scelte.length} fatture di fornitori in scadenza che fanno il totale (controlla)` };
  }
  return null;
}

// ───────────────────────────── categorie dei movimenti senza fattura ─────────────────────────────

export const CATEGORIE_MOVIMENTO = ['Incasso fattura', 'Pagamento fattura', 'Commissioni e spese bancarie', 'Interessi', 'Imposte e rate Agenzia Entrate',
  'Contributi dipendenti (F24)', 'Stipendi', 'Carta di credito', 'Carta / POS', 'Pedaggi e carburante', 'Leasing e noleggi', 'Finanziamenti e mutui',
  'Anticipo fatture', 'Rientro anticipo', 'Giroconto', 'Utenze', 'Assicurazioni', 'Contributi pubblici', 'Rimborsi', 'Altre entrate', 'Altre uscite'] as const;

/** Categorie usate prima del 14/11/2026: restano sui movimenti già registrati, non si propongono più. */
export const CATEGORIE_VECCHIE = ['Imposte e contributi (F24)', 'Anticipo fatture / RiBa'];

/**
 * F24 (Adriano 14/11/2026): di solito sono le rate dell'Agenzia delle Entrate, tranne quello pagato intorno al 16 del mese
 * (dal 10 al 20) che sono i contributi dei dipendenti (si paga dopo gli stipendi del 10).
 */
export function categoriaF24(data: string): string {
  const g = Number(data.slice(8, 10));
  return g >= 10 && g <= 20 ? 'Contributi dipendenti (F24)' : 'Imposte e rate Agenzia Entrate';
}

// in ordine: vince la prima regola. `sicura` = registrata da sola senza chiedere (Adriano 14/11/2026: "dove c'è scritto commissioni sono
// automaticamente commissioni bancarie; emolumenti sono stipendi; F24…; anticipi e rientri"). Provate sui movimenti BPER 2026.
// "DISPOSIZIONE EMOLUMENTI ... Spese: 0,07" è lo stipendio (le spese del bonifico sono un movimento a parte "COMMISSIONI BONIFICI").
const REGOLE_CATEGORIA: [RegExp, string, boolean][] = [
  [/^commission/, 'Commissioni e spese bancarie', true],
  [/emolument|stipend|retribuz|\bpaghe\b|cedolin|busta paga/, 'Stipendi', true],
  [/anticipo su documenti|anticipo fatt|anticipo s\.?b\.?f/, 'Anticipo fatture', true],
  [/rientro anticipo/, 'Rientro anticipo', true],
  [/pagamento carta di credito|addebito e\/c.*carta|carta di credito addebito/, 'Carta di credito', true],
  [/interessi a debito|interessi creditori|interessi passivi/, 'Interessi', true],
  [/giroconto|giro conto|trasferimento tra/, 'Giroconto', false],
  [/\bsbf\b|s\.b\.f|presentazione effett|ri\.?ba\b|effetti/, 'Anticipo fatture', false],
  [/sabatini|\bmimit\b|\bmise\b|contributo in conto|credito d.imposta|\bgse\b/, 'Contributi pubblici', false],
  [/mutuo|finanziament|rata prest|prestito/, 'Finanziamenti e mutui', false],
  [/\bf24\b|delega unificata|pagam\. delega/, 'F24', true],
  [/agenzia.?entrate|agenzia delle entrate|riscossione|\binps\b|\binail\b|tribut/, 'Imposte e rate Agenzia Entrate', false],
  [/rimborso|storno|restituz/, 'Rimborsi', false],
  [/interess/, 'Interessi', false],
  [/imposta di bollo|\bbollo\b|canone|spese tenuta|oneri|competenze/, 'Commissioni e spese bancarie', true],
  [/viacard|telepass|autostrad|carburant|benzina|gasolio/, 'Pedaggi e carburante', false],
  [/leasing|noleggio|locazione finanz/, 'Leasing e noleggi', false],
  [/assicuraz|polizza|unipol|generali|allianz|\baxa\b|reale mutua|zurich/, 'Assicurazioni', false],
  [/\bpos\b|carta|bancomat|pagobancomat|visa|mastercard/, 'Carta / POS', false],
  [/enel|\bhera\b|\biren\b|\ba2a\b|\bgas\b|energia|telecom|\btim\b|vodafone|fastweb|wind|acqua/, 'Utenze', false],
  [/commission|spese/, 'Commissioni e spese bancarie', false],
];

/**
 * Bonifico a un professionista per la sua fattura (Adriano 14/11/2026: "Federico Cetani sembra uno stipendio ma è il pagamento della fattura,
 * è un libero professionista"): "DISPOSIZIONE a favore di NOME ... nr. FPR 10/26" = pagamento di una fattura del fornitore.
 */
const DISPOSIZIONE_FATTURA = /disposizione a favore di .*\b(fpr|fatt|fattura|ft|parcella|nr\.?)\s*\.?\s*\d/;

/** Categoria proposta per un movimento senza fattura, dalle parole della descrizione (e dalla data per gli F24). */
export function categoriaProposta(m: Pick<Movimento, 'descrizione' | 'importo'> & { data?: string }): string {
  return categoriaMovimento(m).categoria;
}

/** Categoria e se è sicura (si registra da sola). */
export function categoriaMovimento(m: Pick<Movimento, 'descrizione' | 'importo'> & { data?: string }): { categoria: string; sicura: boolean } {
  const d = norm(m.descrizione);
  if (m.importo < 0 && DISPOSIZIONE_FATTURA.test(d)) return { categoria: 'Pagamento fattura', sicura: false };
  for (const [re, cat, sicura] of REGOLE_CATEGORIA) if (re.test(d)) {
    if (cat === 'F24') return { categoria: categoriaF24(m.data ?? ''), sicura };
    if (cat === 'Rimborsi' && m.importo < 0) continue;
    return { categoria: cat, sicura };
  }
  return { categoria: m.importo > 0 ? 'Altre entrate' : 'Altre uscite', sicura: false };
}

// ───────────────────────────── RiBa CBI ─────────────────────────────

/** ABI, CAB e conto da un IBAN italiano (IT + 2 controllo + CIN + ABI 5 + CAB 5 + conto 12). Null se non è un IBAN italiano valido. */
export function abiCabDaIban(iban: unknown): { abi: string; cab: string; conto: string } | null {
  const s = String(iban ?? '').toUpperCase().replace(/[\s-]/g, '');
  const x = s.match(/IT\d{2}[A-Z](\d{5})(\d{5})([A-Z0-9]{12})/);
  if (!x || !ibanValido(x[0])) return null;
  return { abi: x[1], cab: x[2], conto: x[3] };
}

/** Controllo dell'IBAN (modulo 97). */
export function ibanValido(iban: string): boolean {
  const s = iban.toUpperCase().replace(/\s/g, '');
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  const numeri = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55));
  let resto = 0;
  for (const c of numeri) resto = (resto * 10 + Number(c)) % 97;
  return resto === 1;
}

/** Testo per i campi CBI: maiuscolo, senza accenti, solo caratteri ammessi. */
export function testoCbi(v: unknown): string {
  return String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 .,'\-\/&()+]/g, ' ').replace(/\s+/g, ' ').trim();
}

const alfa = (v: unknown, n: number) => testoCbi(v).slice(0, n).padEnd(n);
const num = (v: number | string, n: number) => String(v).replace(/\D/g, '').slice(-n).padStart(n, '0');
const ddmmyy = (iso: string) => `${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(2, 4)}`;

export interface CreditoreRiba {
  sia: string;              // codice SIA dell'azienda (5 caratteri, lo dà la banca)
  ragioneSociale: string; indirizzo: string; cap: string; comune: string; provincia: string;
  partitaIva: string;
  iban: string;             // conto su cui accreditare (ABI, CAB e conto ricavati da qui)
}

export interface EffettoRiba {
  rataId: number;
  scadenza: string;         // AAAA-MM-GG
  importo: number;
  numeroFattura: string; dataFattura: string;
  debitore: { nome: string; codiceFiscale: string; indirizzo: string; cap: string; comune: string; provincia: string; iban?: string | null; banca?: string | null };
}

/** Errori che impediscono di mettere l'effetto nel file (la banca lo scarterebbe). */
export function controlliEffetto(e: EffettoRiba, oggi: string): string[] {
  const err: string[] = [];
  if (!abiCabDaIban(e.debitore.iban)) err.push('manca l\'IBAN (o ABI e CAB) della banca del cliente: scrivilo in Anagrafiche → Clienti → Dati fiscali, campo "Banca d\'appoggio"');
  if (!pulisci(e.debitore.codiceFiscale)) err.push('manca la partita IVA o il codice fiscale del cliente');
  if (!pulisci(e.debitore.indirizzo) || !pulisci(e.debitore.comune)) err.push('manca l\'indirizzo del cliente');
  if (!(e.importo > 0)) err.push('importo non valido');
  if (e.scadenza < oggi) err.push('scadenza già passata');
  return err;
}

/** Errori dei dati dell'azienda per il file RiBa. */
export function controlliCreditore(c: CreditoreRiba): string[] {
  const err: string[] = [];
  if (!/^[A-Z0-9]{5}$/i.test(c.sia.trim())) err.push('manca il codice SIA dell\'azienda (5 caratteri, lo dà BPER): scrivilo qui sotto');
  if (!abiCabDaIban(c.iban)) err.push('IBAN dell\'azienda non valido: correggilo in Impostazioni → Amministrazione');
  return err;
}

/**
 * File RiBa CBI (tracciato standard "Ri.Ba. – disposizioni di incasso", righe da 120 caratteri, CRLF):
 * IB (testa), per ogni effetto 14 (importo, scadenza, banche), 20 (creditore), 30 (debitore), 40 (indirizzo del debitore),
 * 50 (riferimento della fattura), 51 (numero ricevuta), 70 (chiusura), EF (coda con totali e numero di record).
 */
export function generaRiba(c: CreditoreRiba, effetti: EffettoRiba[], dataCreazione: string, nomeSupporto: string): string {
  const banca = abiCabDaIban(c.iban)!;
  const sia = alfa(c.sia, 5);
  const data = ddmmyy(dataCreazione);
  const supporto = alfa(nomeSupporto, 20);
  const righe: string[] = [` IB${sia}${banca.abi}${data}${supporto}${' '.repeat(6)}${' '.repeat(59)}${' '.repeat(7)}${' '.repeat(2)}E${' '.repeat(6)}`];
  let totale = 0;
  effetti.forEach((e, i) => {
    const n = num(i + 1, 7);
    const cent = Math.round(e.importo * 100);
    totale += cent;
    const deb = abiCabDaIban(e.debitore.iban)!;
    const cf = testoCbi(e.debitore.codiceFiscale).replace(/^IT(?=\d{11}$)/, '').replace(/\s/g, '');
    righe.push(` 14${n}${' '.repeat(12)}${ddmmyy(e.scadenza)}30000${num(cent, 13)}-${banca.abi}${banca.cab}${alfa(banca.conto, 12)}${deb.abi}${deb.cab}${' '.repeat(12)}${sia}4${alfa(cf, 16)}${' '.repeat(6)}E`);
    righe.push(` 20${n}${alfa(c.ragioneSociale, 24)}${alfa(c.indirizzo, 24)}${alfa(`${c.cap} ${c.comune} ${c.provincia}`, 24)}${alfa(c.partitaIva, 24)}${' '.repeat(14)}`);
    righe.push(` 30${n}${alfa(e.debitore.nome, 60)}${alfa(cf, 16)}${' '.repeat(34)}`);
    righe.push(` 40${n}${alfa(e.debitore.indirizzo, 30)}${num(e.debitore.cap || '0', 5)}${alfa(e.debitore.comune, 23)}${alfa(e.debitore.provincia, 2)}${alfa(e.debitore.banca ?? '', 50)}`);
    const rif = `PER LA FATTURA N. ${e.numeroFattura} DEL ${e.dataFattura.slice(8, 10)}/${e.dataFattura.slice(5, 7)}/${e.dataFattura.slice(0, 4)} IMP ${(cent / 100).toFixed(2).replace('.', ',')}`;
    righe.push(` 50${n}${alfa(rif, 80)}${' '.repeat(10)}${alfa(c.partitaIva, 16)}${' '.repeat(4)}`);
    righe.push(` 51${n}${num(e.rataId, 10)}${alfa(c.ragioneSociale, 20)}${' '.repeat(80)}`);
    righe.push(` 70${n}${' '.repeat(110)}`);
  });
  const quanti = effetti.length;
  righe.push(` EF${sia}${banca.abi}${data}${supporto}${' '.repeat(6)}${num(quanti, 7)}${num(totale, 15)}${'0'.repeat(15)}${num(quanti * 7 + 2, 7)}${' '.repeat(24)}E${' '.repeat(6)}`);
  return righe.join('\r\n') + '\r\n';
}

// Codice SIA dell'azienda (CBI): 5 caratteri, lettere e numeri (es. CHJ6R)
export const codiceSiaValido = (sia: string): boolean => /^[A-Z0-9]{5}$/.test(String(sia ?? '').toUpperCase().replace(/\s/g, ''));
