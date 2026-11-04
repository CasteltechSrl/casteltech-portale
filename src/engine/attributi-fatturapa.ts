/**
 * Attributi avanzati della fattura elettronica (Adriano 4/11/2026, come "Modifica attributi avanzati" di Fatture in Cloud).
 * Nella bozza di fattura, nota di credito e autofattura: elenco ad albero dei campi FatturaPA con il numero delle specifiche
 * tecniche (es. 2.1.9.3 CausaleTrasporto, 2.2.1(2).7 DataInizioPeriodo della riga 2), spunta + valore. I valori scelti si
 * scrivono nell'XML al posto giusto (ordine dello schema) dopo che il portale ha preparato il file: un valore scritto qui
 * vince su quello automatico dello stesso campo.
 *
 * Si offrono solo i campi che non cambiano importi, numeri, date e tipo del documento (quelli li calcola il portale):
 * contatti, ordine/contratto/convenzione/ricezione, SAL, trasporto, fattura principale, periodo e altri dati gestionali
 * delle righe, dati della banca nei pagamenti. Un campo nuovo = una riga in CATALOGO (con il suo posto tra i fratelli).
 *
 * Chiave: numeri separati da punti, con (n) dopo i blocchi che si ripetono: "2.1.2(1).6" = CodiceCUP del primo DatiOrdineAcquisto.
 */
import { testoXml } from './fatturapa.js';

export type TipoValore = 'testo' | 'data' | 'dataora' | 'intero' | 'decimale' | 'scelta';
interface Def {
  nome: string;
  figli?: Def[];
  rip?: boolean;            // il blocco si ripete (nella chiave: (n))
  nuovi?: boolean;          // per i blocchi che si ripetono: si può aggiungerne uno (predefinito sì)
  tipo?: TipoValore;        // foglia modificabile; senza tipo = solo automatica
  min?: number; max?: number; formato?: RegExp; valori?: string[]; maiuscolo?: boolean;
  obbl?: boolean;           // obbligatorio se il blocco che lo contiene viene creato dagli attributi
  mostra?: boolean;         // tra gli attributi impostati in automatico ("Altri attributi")
  aiuto?: string;
}
export interface Nodo extends Def { numero: number; padre: Nodo | null; figliNodi: Nodo[]; modificabili: boolean }

// costruttori brevi
const a = (nome: string, extra: Partial<Def> = {}): Def => ({ nome, ...extra });                       // foglia automatica
const t = (nome: string, max: number, extra: Partial<Def> = {}): Def => ({ nome, tipo: 'testo', max, ...extra });
const d = (nome: string, extra: Partial<Def> = {}): Def => ({ nome, tipo: 'data', ...extra });
const g = (nome: string, figli: Def[], extra: Partial<Def> = {}): Def => ({ nome, figli, ...extra });
const MAIUSC = { maiuscolo: true };
const PAESE = { formato: /^[A-Z]{2}$/, ...MAIUSC };

// documenti correlati (2.1.2 ordine, 2.1.3 contratto, 2.1.4 convenzione, 2.1.5 ricezione, 2.1.6 fatture collegate): stessi campi
const correlati = (nome: string, aiuto: string, extra: Partial<Def> = {}) => g(nome, [
  { nome: 'RiferimentoNumeroLinea', tipo: 'intero', max: 4, rip: true, aiuto: 'Numero della riga a cui si riferisce (vuoto = tutto il documento)', mostra: true },
  t('IdDocumento', 20, { obbl: true, mostra: true, aiuto: 'Numero del documento' }),
  d('Data', { mostra: true }),
  t('NumItem', 20, { mostra: true, aiuto: 'Numero della riga nel documento del cliente' }),
  t('CodiceCommessaConvenzione', 100, { mostra: true }),
  t('CodiceCUP', 15, { ...MAIUSC, mostra: true }),
  t('CodiceCIG', 15, { ...MAIUSC, mostra: true }),
], { rip: true, aiuto, ...extra });

const CATALOGO: Def[] = [
  g('FatturaElettronicaHeader', [
    g('DatiTrasmissione', [
      a('IdTrasmittente'), a('ProgressivoInvio'), a('FormatoTrasmissione', { mostra: true }), a('CodiceDestinatario', { mostra: true }),
      g('ContattiTrasmittente', [t('Telefono', 12, { min: 5 }), t('Email', 256, { min: 7 })]),
      a('PECDestinatario', { mostra: true }),
    ]),
    g('CedentePrestatore', [
      a('DatiAnagrafici'), a('Sede'), a('StabileOrganizzazione'), a('IscrizioneREA'),
      g('Contatti', [t('Telefono', 12, { min: 5 }), t('Fax', 12, { min: 5 }), t('Email', 256, { min: 7 })]),
      t('RiferimentoAmministrazione', 20, { aiuto: 'Riferimento amministrativo del fornitore richiesto dal cliente (es. pubblica amministrazione)' }),
    ]),
    a('RappresentanteFiscale'), a('CessionarioCommittente'), a('TerzoIntermediarioOSoggettoEmittente'), a('SoggettoEmittente'),
  ]),
  g('FatturaElettronicaBody', [
    g('DatiGenerali', [
      g('DatiGeneraliDocumento', [
        a('TipoDocumento', { mostra: true }), a('Divisa'), a('Data'), a('Numero'), a('DatiRitenuta', { rip: true }),
        g('DatiBollo', [a('BolloVirtuale', { mostra: true }), a('ImportoBollo', { mostra: true })]),
        a('DatiCassaPrevidenziale', { rip: true }), a('ScontoMaggiorazione', { rip: true }), a('ImportoTotaleDocumento'), a('Arrotondamento'),
        a('Causale', { rip: true }),
        { nome: 'Art73', tipo: 'scelta', valori: ['SI'], aiuto: 'SI = documento emesso secondo l\'art. 73 DPR 633/72 (più documenti con stesso numero nell\'anno)' },
      ]),
      correlati('DatiOrdineAcquisto', 'Ordine del cliente'),
      correlati('DatiContratto', 'Contratto'),
      correlati('DatiConvenzione', 'Convenzione'),
      correlati('DatiRicezione', 'Ricezione (es. documento di accettazione della merce)'),
      correlati('DatiFattureCollegate', 'Fattura collegata (nota di credito, acconto)'),
      g('DatiSAL', [{ nome: 'RiferimentoFase', tipo: 'intero', max: 3, obbl: true }], { rip: true, aiuto: 'Stato avanzamento lavori' }),
      g('DatiDDT', [a('NumeroDDT', { mostra: true }), a('DataDDT', { mostra: true }), a('RiferimentoNumeroLinea', { rip: true })], { rip: true, nuovi: false }),
      g('DatiTrasporto', [
        g('DatiAnagraficiVettore', [
          g('IdFiscaleIVA', [t('IdPaese', 2, { ...PAESE, obbl: true }), t('IdCodice', 28, { ...MAIUSC, obbl: true })], { obbl: true }),
          t('CodiceFiscale', 16, { min: 11, ...MAIUSC }),
          g('Anagrafica', [t('Denominazione', 80, { obbl: true }), a('Nome'), a('Cognome'), a('Titolo'), a('CodEORI')], { obbl: true }),
          t('NumeroLicenzaGuida', 20),
        ], { aiuto: 'Corriere / vettore' }),
        t('MezzoTrasporto', 80), t('CausaleTrasporto', 100), { nome: 'NumeroColli', tipo: 'intero', max: 4 }, t('Descrizione', 100),
        t('UnitaMisuraPeso', 10), { nome: 'PesoLordo', tipo: 'decimale', max: 4 }, { nome: 'PesoNetto', tipo: 'decimale', max: 4 },
        { nome: 'DataOraRitiro', tipo: 'dataora' }, d('DataInizioTrasporto'),
        t('TipoResa', 3, { formato: /^[A-Z]{3}$/, ...MAIUSC, aiuto: 'Incoterms a 3 lettere (es. EXW, DAP)' }),
        g('IndirizzoResa', [t('Indirizzo', 60, { obbl: true }), t('NumeroCivico', 8), t('CAP', 5, { formato: /^\d{5}$/, obbl: true }),
          t('Comune', 60, { obbl: true }), t('Provincia', 2, PAESE), t('Nazione', 2, { ...PAESE, obbl: true })]),
        { nome: 'DataOraConsegna', tipo: 'dataora' },
      ]),
      g('FatturaPrincipale', [t('NumeroFatturaPrincipale', 20, { obbl: true }), d('DataFatturaPrincipale', { obbl: true })],
        { aiuto: 'Fattura principale (trasporto collegato a una fattura di cessione)' }),
    ]),
    g('DatiBeniServizi', [
      g('DettaglioLinee', [
        a('NumeroLinea'), a('TipoCessionePrestazione'), a('CodiceArticolo', { rip: true }), a('Descrizione'), a('Quantita'), a('UnitaMisura'),
        d('DataInizioPeriodo'), d('DataFinePeriodo'), a('PrezzoUnitario'), a('ScontoMaggiorazione', { rip: true }), a('PrezzoTotale'),
        a('AliquotaIVA'), a('Ritenuta'), a('Natura'), t('RiferimentoAmministrazione', 20),
        g('AltriDatiGestionali', [t('TipoDato', 10, { obbl: true, mostra: true }), t('RiferimentoTesto', 60, { mostra: true }),
          { nome: 'RiferimentoNumero', tipo: 'decimale', max: 11 }, d('RiferimentoData', { mostra: true })], { rip: true }),
      ], { rip: true, nuovi: false }),
      g('DatiRiepilogo', [a('AliquotaIVA'), a('Natura'), a('SpeseAccessorie'), a('Arrotondamento'), a('ImponibileImporto'), a('Imposta'),
        a('EsigibilitaIVA', { mostra: true }), a('RiferimentoNormativo')], { rip: true, nuovi: false }),
    ]),
    a('DatiVeicoli'),
    g('DatiPagamento', [
      a('CondizioniPagamento'),
      g('DettaglioPagamento', [
        t('Beneficiario', 200), a('ModalitaPagamento'), d('DataRiferimentoTerminiPagamento'), { nome: 'GiorniTerminiPagamento', tipo: 'intero', max: 3 },
        a('DataScadenzaPagamento'), a('ImportoPagamento'), a('CodUfficioPostale'), a('CognomeQuietanzante'), a('NomeQuietanzante'),
        a('CFQuietanzante'), a('TitoloQuietanzante'), t('IstitutoFinanziario', 80),
        t('IBAN', 34, { formato: /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/, ...MAIUSC }), t('ABI', 5, { formato: /^\d{5}$/ }), t('CAB', 5, { formato: /^\d{5}$/ }),
        t('BIC', 11, { formato: /^[A-Z]{6}[A-Z2-9][A-NP-Z0-9]([A-Z0-9]{3})?$/, ...MAIUSC }),
        a('ScontoPagamentoAnticipato'), a('DataLimitePagamentoAnticipato'), a('PenalitaPagamentiRitardati'), a('DataDecorrenzaPenale'),
        t('CodicePagamento', 60),
      ], { rip: true, nuovi: false }),
    ], { rip: true, nuovi: false }),
    a('Allegati', { rip: true }),
  ]),
];

function costruisci(defs: Def[], padre: Nodo | null): Nodo[] {
  return defs.map((def, i) => {
    const n: Nodo = { ...def, numero: i + 1, padre, figliNodi: [], modificabili: false };
    n.figliNodi = costruisci(def.figli ?? [], n);
    n.modificabili = !!def.tipo || n.figliNodi.some(f => f.modificabili);
    return n;
  });
}
const RADICI = costruisci(CATALOGO, null);

// ───────────────────────── XML: lettura e scrittura minime (solo per i file fatti dal portale) ─────────────────────────
interface El { nome: string; attr: string; figli: El[]; testo: string | null }

function leggiXml(xml: string): { intestazione: string; radice: El } {
  const intestazione = /^\s*<\?xml[^>]*\?>/.exec(xml)?.[0] ?? '';
  const corpo = xml.slice(intestazione.length);
  const pila: El[] = [];
  let radice: El | null = null;
  const re = /<(\/?)([A-Za-z_][\w:.-]*)([^>]*?)(\/?)>|([^<]+)/g;
  for (let m; (m = re.exec(corpo));) {
    if (m[5] !== undefined) { if (pila.length && m[5].trim()) pila[pila.length - 1].testo = (pila[pila.length - 1].testo ?? '') + m[5]; continue; }
    if (m[1]) { pila.pop(); continue; }
    const el: El = { nome: m[2], attr: m[3], figli: [], testo: null };
    if (pila.length) pila[pila.length - 1].figli.push(el); else radice = el;
    if (!m[4]) pila.push(el);
  }
  if (!radice) throw new Error('XML vuoto');
  return { intestazione, radice };
}
const scriviEl = (e: El): string => `<${e.nome}${e.attr}>${e.figli.length ? e.figli.map(scriviEl).join('') : e.testo ?? ''}</${e.nome}>`;
const decodifica = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

// ───────────────────────── chiavi ─────────────────────────
interface Passo { nodo: Nodo; indice: number }
/** "2.2.1(3).7" → passi nel catalogo; errore se la chiave non esiste. */
export function passiChiave(chiave: string): Passo[] | null {
  const pezzi = String(chiave).trim().split('.');
  const passi: Passo[] = [];
  let livello = RADICI;
  for (const p of pezzi) {
    const m = /^(\d{1,2})(?:\((\d{1,3})\))?$/.exec(p);
    if (!m) return null;
    const nodo = livello[Number(m[1]) - 1];
    if (!nodo) return null;
    if (m[2] && !nodo.rip) return null;
    const indice = m[2] ? Number(m[2]) : 1;
    if (indice < 1) return null;
    passi.push({ nodo, indice });
    livello = nodo.figliNodi;
  }
  return passi.length ? passi : null;
}
const pezzoChiave = (n: Nodo, indice: number) => `${n.numero}${n.rip ? `(${indice})` : ''}`;
/** Numero "da specifiche" del nodo senza indici (es. 2.1.9.3). */
const numeroNodo = (n: Nodo): string => (n.padre ? `${numeroNodo(n.padre)}.` : '') + n.numero;
/** Ordine naturale delle chiavi (2.1.2 prima di 2.1.10, (2) prima di (10)). */
export const confrontaChiavi = (x: string, y: string) => {
  const nx = x.match(/\d+/g)!.map(Number), ny = y.match(/\d+/g)!.map(Number);
  for (let i = 0; i < Math.min(nx.length, ny.length); i++) if (nx[i] !== ny[i]) return nx[i] - ny[i];
  return nx.length - ny.length;
};

// ───────────────────────── valori ─────────────────────────
const dataValida = (s: string) => { const x = new Date(`${s}T00:00:00Z`); return !isNaN(+x) && x.toISOString().slice(0, 10) === s; };
function dataIso(v: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
  const s = m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : v;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && dataValida(s) ? s : null;
}
/** Valore scritto dall'ufficio → valore per l'XML (già protetto), oppure l'errore. */
export function valoreAttributo(n: Nodo, grezzo: string): { valore?: string; errore?: string } {
  let v = String(grezzo ?? '').trim();
  if (!v) return { errore: 'valore vuoto' };
  if (n.maiuscolo) v = v.toUpperCase();
  switch (n.tipo) {
    case 'data': { const x = dataIso(v); return x ? { valore: x } : { errore: `"${v}" non è una data (gg/mm/aaaa)` }; }
    case 'dataora': {
      const m = /^(\S+)[ T](\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?$/.exec(v);
      const x = m ? dataIso(m[1]) : null;
      return x && Number(m![2]) < 24 ? { valore: `${x}T${m![2].padStart(2, '0')}:${m![3]}:${m![4] ?? '00'}` }
        : { errore: `"${v}" non è data e ora (gg/mm/aaaa hh:mm)` };
    }
    case 'intero':
      if (!new RegExp(`^\\d{1,${n.max ?? 4}}$`).test(v)) return { errore: `"${v}" deve essere un numero intero` };
      // lo schema FatturaPA vuole da 1 in su (colli, riga, fase); solo i giorni dei termini di pagamento possono essere 0 (controllo del 4/11/2026)
      if (Number(v) < 1 && n.nome !== 'GiorniTerminiPagamento') return { errore: `"${v}" deve essere almeno 1` };
      return { valore: String(Number(v)) };
    case 'decimale': {
      const s = /,/.test(v) ? v.replace(/\./g, '').replace(',', '.') : v;
      const num = Number(s);
      if (!/^-?\d+(\.\d+)?$/.test(s) || !isFinite(num) || Math.abs(Math.trunc(num)).toString().length > (n.max ?? 4)) return { errore: `"${v}" non è un numero valido` };
      return { valore: num.toFixed(2) };
    }
    case 'scelta': return n.valori?.includes(v.toUpperCase()) ? { valore: v.toUpperCase() } : { errore: `valori ammessi: ${n.valori?.join(', ')}` };
    case 'testo': {
      const pulito = decodifica(testoXml(v, 100000));
      if (n.formato && !n.formato.test(pulito.replace(/\s/g, ''))) return { errore: `"${v}" non ha il formato giusto` };
      if (n.min && pulito.length < n.min) return { errore: `almeno ${n.min} caratteri` };
      if (n.max && pulito.length > n.max) return { errore: `al massimo ${n.max} caratteri (ne ha ${pulito.length})` };
      return { valore: testoXml(n.formato ? pulito.replace(/\s/g, '') : pulito, n.max) };
    }
    default: return { errore: 'campo calcolato dal portale, non modificabile' };
  }
}

/** Attributi arrivati dal modulo: solo chiavi con un valore, al massimo 300 (gli errori si vedono nei controlli della bozza). */
export function attributiDaModulo(b: unknown): Record<string, string> {
  const fuori: Record<string, string> = {};
  if (!b || typeof b !== 'object') return fuori;
  for (const [k, v] of Object.entries(b as Record<string, unknown>)) {
    const chiave = k.trim(), valore = String(Array.isArray(v) ? v[v.length - 1] : v ?? '').trim();
    if (!valore || !/^[\d().]+$/.test(chiave) || chiave.length > 40) continue;
    fuori[chiave] = valore.slice(0, 300);
    if (Object.keys(fuori).length >= 300) break;
  }
  return fuori;
}

// ───────────────────────── scrittura nell'XML ─────────────────────────
/** Mette nell'XML gli attributi scelti. Senza attributi restituisce lo stesso testo. */
export function applicaAttributi(xml: string, attributi: Record<string, string> | null | undefined): { xml: string; errori: string[] } {
  const voci = Object.entries(attributi ?? {}).filter(([, v]) => String(v ?? '').trim()).sort(([x], [y]) => confrontaChiavi(x, y));
  if (!voci.length) return { xml, errori: [] };
  const errori: string[] = [];
  const { intestazione, radice } = leggiXml(xml);
  const creati = new Map<El, { nodo: Nodo; chiave: string }>();
  for (const [chiave, grezzo] of voci) {
    const passi = passiChiave(chiave);
    const foglia = passi?.[passi.length - 1].nodo;
    if (!passi || !foglia?.tipo) { errori.push(`Attributo avanzato ${chiave}: campo non previsto o calcolato dal portale.`); continue; }
    const { valore, errore } = valoreAttributo(foglia, grezzo);
    if (errore) { errori.push(`Attributo avanzato ${chiave} ${foglia.nome}: ${errore}.`); continue; }
    let cur = radice, chiaveCur = '', ok = true;
    for (const { nodo, indice } of passi) {
      chiaveCur += (chiaveCur ? '.' : '') + pezzoChiave(nodo, indice);
      const stessi = cur.figli.filter(f => f.nome === nodo.nome);
      if (indice <= stessi.length) { cur = stessi[indice - 1]; continue; }
      if (indice > stessi.length + 1 || (nodo.rip && nodo.nuovi === false)) {
        errori.push(`Attributo avanzato ${chiave}: ${nodo.nome} (${chiaveCur}) non c'è nel documento.`); ok = false; break;
      }
      const nuovo: El = { nome: nodo.nome, attr: '', figli: [], testo: null };
      inserisci(cur, nuovo, nodo);
      creati.set(nuovo, { nodo, chiave: chiaveCur });
      cur = nuovo;
    }
    if (!ok) continue;
    cur.figli = []; cur.testo = valore!;
  }
  // blocchi creati qui: i campi obbligatori ci devono essere
  for (const [el, { nodo, chiave }] of creati)
    for (const f of nodo.figliNodi.filter(x => x.obbl))
      if (!el.figli.some(x => x.nome === f.nome)) errori.push(`Attributo avanzato ${chiave} ${nodo.nome}: serve anche ${chiave}.${pezzoChiave(f, 1)} ${f.nome}.`);
  return { xml: `${intestazione}${intestazione ? '\n' : ''}${scriviEl(radice)}\n`, errori };
}

/** Inserisce il nuovo elemento rispettando l'ordine dello schema tra i fratelli. */
function inserisci(padre: El, nuovo: El, nodo: Nodo) {
  const ordine = new Map((nodo.padre?.figliNodi ?? RADICI).map(n => [n.nome, n.numero]));
  let pos = 0;
  padre.figli.forEach((f, i) => { if ((ordine.get(f.nome) ?? 0) <= nodo.numero) pos = i + 1; });
  padre.figli.splice(pos, 0, nuovo);
}

/** Percorre l'XML dando a ogni elemento la sua chiave (solo dove il catalogo lo conosce). */
function percorri(xml: string, visita: (el: El, nodo: Nodo, chiave: string) => void) {
  const { radice } = leggiXml(xml);
  const giu = (el: El, nodi: Nodo[], prefisso: string) => {
    const contati = new Map<string, number>();
    for (const f of el.figli) {
      const nodo = nodi.find(n => n.nome === f.nome);
      if (!nodo) continue;
      const i = (contati.get(f.nome) ?? 0) + 1; contati.set(f.nome, i);
      const chiave = (prefisso ? `${prefisso}.` : '') + pezzoChiave(nodo, i);
      visita(f, nodo, chiave);
      if (nodo.figliNodi.length) giu(f, nodo.figliNodi, chiave);
    }
  };
  giu(radice, RADICI, '');
}

export interface AttributoMostrato { chiave: string; nome: string; valore: string }
/** Campi impostati dal portale da soli (tipo documento, DDT, ordine, esigibilità…), come "Altri attributi" di FIC. */
export function attributiAutomatici(xml: string): AttributoMostrato[] {
  const fuori: AttributoMostrato[] = [];
  try {
    percorri(xml, (el, nodo, chiave) => { if (nodo.mostra && el.testo != null) fuori.push({ chiave, nome: nodo.nome, valore: decodifica(el.testo) }); });
  } catch { /* XML non leggibile: niente elenco */ }
  return fuori;
}

export interface RigaAlbero { chiave: string; nome: string; numero: string; livello: number; foglia: boolean; valore: string; automatico: string; aiuto?: string; nota?: string }
/**
 * Albero da mostrare nella bozza: i rami con campi modificabili; i blocchi che si ripetono quante volte ci sono nel documento
 * più uno nuovo (se si possono aggiungere), le righe del documento una per una.
 */
export function alberoAttributi(xmlBase: string, valori: Record<string, string> = {}): RigaAlbero[] {
  const dom = new Map<string, El>();
  try { percorri(xmlBase, (el, _n, chiave) => dom.set(chiave, el)); } catch { /* XML non leggibile: albero senza valori automatici */ }
  const righe: RigaAlbero[] = [];
  // indici già usati negli attributi salvati (per non perdere un blocco aggiunto)
  const salvati = Object.keys(valori);
  const giu = (nodi: Nodo[], prefisso: string, livello: number) => {
    for (const nodo of nodi) {
      if (!nodo.modificabili) continue;
      const base = prefisso ? `${prefisso}.` : '';
      let quanti = 1;
      if (nodo.rip) {
        let esistenti = 0;
        while (dom.has(`${base}${nodo.numero}(${esistenti + 1})`)) esistenti++;
        const daSalvati = Math.max(0, ...salvati.filter(k => k.startsWith(`${base}${nodo.numero}(`))
          .map(k => Number(/^\((\d+)\)/.exec(k.slice(`${base}${nodo.numero}`.length))?.[1] ?? 0)));
        quanti = nodo.nuovi === false ? esistenti : Math.max(esistenti + 1, daSalvati);
      }
      for (let i = 1; i <= quanti; i++) {
        const chiave = base + pezzoChiave(nodo, i);
        const el = dom.get(chiave);
        const nota = nodo.nome === 'DettaglioLinee' && el ? decodifica(el.figli.find(f => f.nome === 'Descrizione')?.testo ?? '').slice(0, 50)
          : nodo.rip && !el && nodo.figliNodi.length ? 'nuovo' : undefined;
        righe.push({ chiave, nome: nodo.nome, numero: numeroNodo(nodo), livello, foglia: !!nodo.tipo, valore: valori[chiave] ?? '',
          automatico: el?.testo != null ? decodifica(el.testo) : '', aiuto: nodo.aiuto, nota });
        if (nodo.figliNodi.length) giu(nodo.figliNodi, chiave, livello + 1);
      }
    }
  };
  giu(RADICI, '', 0);
  return righe;
}

/** Nome del campo di una chiave (per gli elenchi): "2.1.9.3" → "CausaleTrasporto". */
export const nomeAttributo = (chiave: string) => passiChiave(chiave)?.at(-1)?.nodo.nome ?? '';
