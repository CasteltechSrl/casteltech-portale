/**
 * Documenti della scheda del cliente (Preventivi → Da documenti): caricamento del pacchetto, lettura dei file,
 * incrocio e disegno del Gerber. Le regole sono in src/engine/scheda/*; qui file, archivi zip e database.
 * I file originali restano sul Drive del cliente (Adriano, 27/10/2026): nel database vanno solo i file che servono
 * a rileggere il pacchetto (BOM, pick and place, Gerber, forature, CAD), compressi, più il risultato.
 */
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { unzipSync } from 'fflate';
import { q, q1 } from './db.js';
import { avviaElaborazione, costoBomPerPreventivo, creaAnalisi, leggiFileBom } from './codifica-servizio.js';
import { caricaCatalogo, caricaTariffe } from './catalogo-db.js';
import { normalizza, salvaPreventivo } from './preventivi-servizio.js';
import { parametriDaAnalisi } from '../engine/scheda/preventivo.js';
import { conAccettate } from '../engine/scheda/accettate.js';
import { analizzaScheda, leggiBomScheda, type AnalisiScheda, type RigaBomScheda, type StratoGerberInfo } from '../engine/scheda/analisi.js';
import { ruoloStrato, tipoFile, type TipoFile } from '../engine/scheda/classifica.js';
import { leggiForatura, type Foratura } from '../engine/scheda/foratura.js';
import { leggiGenCad } from '../engine/scheda/gencad.js';
import { leggiGerber, type Piazzola, type Riquadro } from '../engine/scheda/gerber.js';
import { leggiPickPlace, type LetturaPickPlace } from '../engine/scheda/pick-place.js';
import { propostaProdotto } from '../engine/scheda/prodotto.js';
import { notaRichiesta } from '../engine/gmail.js';
import { leggiEmail } from '../engine/acquisizioni.js';
import { unisciBomDivise } from '../engine/scheda/bom-divise.js';
import { fileDellaVersione, richiesteDaEmail, versioniDaDividere } from '../engine/scheda/versioni.js';
import { rigaIntestazione } from '../engine/codifica/bom.js';
import { CARTELLA_CASTELTECH, CARTELLE_CASTELTECH, CARTELLE_VECCHIE, LAVORATO_CASTELTECH, lavoratoDaCasteltech, MAX_FILE, radiciOdb, scegliFile, sceltaFile, TROPPO_GRANDE, VERSIONI_VECCHIE } from '../engine/scheda/scelta-file.js';
import { BUDGET, conMemoria } from './memoria.js';

/** byte e conservato servono per i file tenuti solo nell'elenco (PDF, 3D, immagini: restano sul Drive del cliente). */
export interface FileCaricato { nome: string; dati: Buffer; byte?: number; conservato?: boolean }
export interface FileElenco { nome: string; tipo: TipoFile; byte: number; usato: boolean; nota?: string }
export interface StratoDisegno extends StratoGerberInfo { defs: string; corpo: string; riquadro: Riquadro | null }
type ConPiazzole = StratoDisegno & { piazzole: Piazzola[] };
export interface Disegno { strati: StratoDisegno[]; riquadro: Riquadro | null; forature: { x: number; y: number; d: number; metallizzato: boolean | null }[] }
export interface Elaborazione { file: FileElenco[]; analisi: AnalisiScheda; disegno: Disegno; fonti: { bom: string | null; bomUnite: string[]; pickPlace: string[]; cad: string | null; forature: string[]; gerber: string[] } }

/** Tipi di file che si conservano nel database (compressi) per poter rifare l'analisi. */
export const TIPI_DA_CONSERVARE: TipoFile[] = ['bom', 'pick-place', 'gerber', 'foratura', 'gencad'];

/**
 * Apre gli zip (anche uno dentro l'altro, un livello) e toglie i file di sistema. Dentro lo zip si estraggono solo i file utili
 * (stessa scelta della cartella, `sceltaFile`): PDF, 3D, immagini, ODB++ e file troppo grandi restano chiusi e compaiono solo
 * con nome e dimensione, così uno STEP da 80 MB dentro lo zip non occupa la memoria del server (29/10/2026).
 */
export function espandiArchivi(file: FileCaricato[]): FileCaricato[] {
  const out: FileCaricato[] = [];
  const aggiungi = (f: FileCaricato, livello: number) => {
    const base = f.nome.split(/[\\/]/).pop()!.toLowerCase();
    if (base === 'desktop.ini' || base === 'thumbs.db' || base.startsWith('._') || f.nome.includes('__MACOSX')) return;
    if (base.endsWith('.zip') && livello < 2 && f.conservato !== false) {
      try {
        const prefisso = f.nome.replace(/\.zip$/i, '');
        const zip = new Uint8Array(f.dati.buffer, f.dati.byteOffset, f.dati.length);
        // prima solo i nomi (non si estrae niente), per riconoscere le cartelle ODB++
        const nomi: string[] = [];
        unzipSync(zip, { filter: x => { nomi.push(`${prefisso}/${x.name}`); return false; } });
        const odb = radiciOdb(nomi);
        const lasciati: FileCaricato[] = [];
        const dentro = unzipSync(zip, { filter: x => {
          if (x.name.endsWith('/')) return false;
          const nome = `${prefisso}/${x.name}`;
          const s = sceltaFile(nome, x.originalSize, odb);
          if (!s.carica && !s.sistema) lasciati.push({ nome, dati: Buffer.alloc(0), byte: x.originalSize, conservato: false });
          return s.carica;
        } });
        for (const [n, d] of Object.entries(dentro)) aggiungi({ nome: `${prefisso}/${n}`, dati: Buffer.from(d.buffer, d.byteOffset, d.length) }, livello + 1);
        for (const l of lasciati) aggiungi(l, livello + 1);
        return;
      } catch { /* zip rovinato: resta come file */ }
    }
    out.push(f);
  };
  for (const f of file) aggiungi(f, 0);
  return out;
}

/** UTF-8 se il file lo è (KiCad scrive "10.0kΩ"), altrimenti Latin-1 (vecchi CAD Windows). */
export const testoDi = (b: Buffer) => { try { return new TextDecoder('utf-8', { fatal: true }).decode(b).replace(/^\uFEFF/, ''); } catch { return b.toString('latin1'); } };
const sembraTesto = (b: Buffer) => { const p = b.subarray(0, 4000); let strani = 0; for (const c of p) if (c === 0 || (c < 9)) strani++; return strani < 5; };

/**
 * Legge tutti i file del pacchetto e fa l'incrocio. Il nome del pacchetto serve a proporre codice e revisione del prodotto.
 * `giaAperti`: gli zip sono già stati aperti con espandiArchivi (si evita di aprirli due volte).
 */
const MAIL_CLIENTE = 'mail del cliente: il testo è in cima alla pagina (quantità e versioni)';
export async function elaboraPacchetto(caricati: FileCaricato[], nomePacchetto = '', giaAperti = false): Promise<Elaborazione> {
  const file = giaAperti ? caricati : espandiArchivi(caricati);
  const elenco: FileElenco[] = [];
  const bomCandidate: { nome: string; righe: RigaBomScheda[]; intestazione: string[][] }[] = [];
  const inizioGerber: string[] = [];
  let inizioGenCad: string | null = null;
  const pickPlace: { nome: string; lettura: LetturaPickPlace }[] = [];
  const forature: { nome: string; foratura: Foratura }[] = [];
  const strati: ConPiazzole[] = [];
  let cad: { nome: string; componenti: ReturnType<typeof leggiGenCad>['componenti'] } | null = null;
  let k = 0;
  // ODB++ scompattato (cartelle matrix/, steps/, fonts/…): una sola riga nell'elenco invece di centinaia di file
  const odb = radiciOdb(file.map(f => f.nome));
  for (const r of odb) {
    const dentro = file.filter(f => f.nome.startsWith(r));
    elenco.push({ nome: r.replace(/[\\/]$/, '') || 'ODB++', tipo: 'odb', byte: dentro.reduce((t, f) => t + (f.byte ?? f.dati.length), 0), usato: false,
      nota: `ODB++ (${dentro.length} file): non ancora letto, si usano Gerber e forature` });
  }
  // lo stesso file due volte (cartella con lo zip e anche il suo contenuto scompattato): si legge una volta sola
  const visti = new Map<string, string>();
  for (const f of file) {
    if (odb.some(r => f.nome.startsWith(r))) continue;
    if (f.conservato !== false && f.dati.length) {
      const impronta = createHash('sha1').update(f.dati).digest('hex');
      const primo = visti.get(impronta);
      if (primo) { elenco.push({ nome: f.nome, tipo: tipoFile(f.nome, null), byte: f.dati.length, usato: false, nota: `copia identica di ${primo.split(/[\\/]/).pop()}: ignorata` }); continue; }
      visti.set(impronta, f.nome);
    }
    if (f.conservato === false) {
      const tipo = tipoFile(f.nome, null);
      // non caricato perché scelto prima dell'invio (PDF, 3D, troppo grande…) o non conservato dopo l'analisi
      const scelta = sceltaFile(f.nome, f.byte ?? 0);
      const nota = !scelta.carica ? scelta.motivo : tipo === 'archivio' ? 'contenuto già estratto' : /\.eml$/i.test(f.nome) ? MAIL_CLIENTE : 'non conservato nel portale (resta sul Drive)';
      elenco.push({ nome: f.nome, tipo, byte: f.byte ?? 0, usato: false, nota });
      continue;
    }
    if (/\.eml$/i.test(f.nome)) { elenco.push({ nome: f.nome, tipo: 'altro', byte: f.dati.length, usato: true, nota: MAIL_CLIENTE }); continue; }
    const testo = sembraTesto(f.dati) ? testoDi(f.dati) : null;
    const tipo = tipoFile(f.nome, testo);
    const voce: FileElenco = { nome: f.nome, tipo, byte: f.dati.length, usato: false };
    elenco.push(voce);
    if (CARTELLE_VECCHIE.test(`/${f.nome}`)) { voce.nota = VERSIONI_VECCHIE; continue; }
    if (CARTELLE_CASTELTECH.test(`/${f.nome}`)) { voce.nota = CARTELLA_CASTELTECH; continue; }
    if (testo && ['bom', 'pick-place'].includes(tipo) && lavoratoDaCasteltech(testo)) { voce.nota = LAVORATO_CASTELTECH; continue; }
    if (f.dati.length > MAX_FILE) { voce.nota = TROPPO_GRANDE; continue; }
    try {
      if (tipo === 'bom') {
        const grezze = await leggiFileBom(f.nome.split(/[\\/]/).pop()!, f.dati);
        const righe = leggiBomScheda(grezze);
        // le righe sopra i titoli delle colonne (progetto, titolo, revisione) servono a proporre il prodotto
        if (righe.righe.length) bomCandidate.push({ nome: f.nome, righe: righe.righe, intestazione: grezze.slice(0, rigaIntestazione(grezze)) });
        else voce.nota = 'nessuna riga riconosciuta';
        if (righe.avvisi.length) voce.nota = righe.avvisi.join(' ');
      } else if (tipo === 'pick-place' && testo != null) {
        pickPlace.push({ nome: f.nome, lettura: leggiPickPlace(f.nome.split(/[\\/]/).pop()!, testo) }); voce.usato = true;
      } else if (tipo === 'foratura' && testo != null) {
        forature.push({ nome: f.nome, foratura: leggiForatura(f.nome.split(/[\\/]/).pop()!, testo) }); voce.usato = true;
      } else if (tipo === 'gencad' && testo != null) {
        cad = { nome: f.nome, componenti: leggiGenCad(testo).componenti }; voce.usato = true; inizioGenCad = testo.slice(0, 5000);
      } else if (tipo === 'gerber' && testo != null) {
        const { ruolo, lato } = ruoloStrato(f.nome, testo);
        const g = leggiGerber(testo, `s${k++}`);
        inizioGerber.push(testo.slice(0, 3000));
        strati.push({ nome: f.nome, ruolo, lato, defs: g.defs, corpo: g.corpo, riquadro: g.riquadro, piazzole: g.piazzole });
        voce.usato = true;
        voce.nota = [ruolo === 'altro' ? 'strato non riconosciuto' : `${ruolo}${lato ? ' ' + lato : ''}`, ...g.avvisi].join(' · ');
      } else if (tipo === 'odb') voce.nota = 'ODB++: non ancora letto (si usano Gerber e forature)';
    } catch (e: any) { voce.nota = `non leggibile: ${e.message}`; }
  }

  // BOM: se sono più d'una si usa quella che si incrocia meglio con il pick and place (o la più lunga)
  const refsPp = new Set(pickPlace.flatMap(p => p.lettura.posizioni.map(x => x.ref)));
  const punteggio = (b: { righe: RigaBomScheda[] }) => { const refs = b.righe.flatMap(r => r.designatori); return refs.filter(r => refsPp.has(r)).length * 1000 + refs.length; };
  bomCandidate.sort((a, b) => punteggio(b) - punteggio(a));
  const prima = bomCandidate[0] ?? null;
  // BOM divisa in più file con riferimenti diversi (es. SMD e PTH): si uniscono (regola in engine/scheda/bom-divise.ts)
  const { unite, scartate } = unisciBomDivise(bomCandidate);
  for (const b of unite.slice(1)) { const v = elenco.find(x => x.nome === b.nome); if (v) { v.usato = true; v.nota = `BOM unita a ${prima!.nome.split(/[\\/]/).pop()} (riferimenti diversi)`; } }
  for (const b of scartate) { const v = elenco.find(x => x.nome === b.nome); if (v) v.nota = 'altra BOM nel pacchetto: non usata (si usa quella che corrisponde al pick and place)'; }
  const bom = prima ? { ...prima, righe: unite.flatMap(b => b.righe) } : null;
  for (const v of elenco) if (v.tipo === 'bom' && bom && v.nome === bom.nome) v.usato = true;

  // contorno della scheda: lo strato del contorno, altrimenti il rame
  const veroContorno = unione(strati.filter(s => s.ruolo === 'contorno').map(s => s.riquadro));
  const contorno = veroContorno ?? riquadroSensato(unione(strati.filter(s => s.ruolo === 'rame').map(s => s.riquadro)), pickPlace);
  // piazzole per lato: dal rame, o dalla pasta se il rame di quel lato manca
  const piazzole: Partial<Record<'TOP' | 'BOT', Piazzola[]>> = {};
  for (const lato of ['TOP', 'BOT'] as const) {
    const di = (ruolo: string) => strati.filter(s => s.ruolo === ruolo && s.lato === lato).flatMap(s => s.piazzole);
    const v = di('rame').length ? di('rame') : di('pasta');
    if (v.length) piazzole[lato] = v;
  }
  const analisi = analizzaScheda({
    bom, pickPlace, cad, forature,
    strati: strati.map(s => ({ nome: s.nome, ruolo: s.ruolo, lato: s.lato })), contorno, contornoStimato: !veroContorno, piazzole,
  });
  // codice, descrizione e revisione proposti dai file (da convalidare in ufficio)
  analisi.prodotto = propostaProdotto({ nomePacchetto, nomiFile: file.map(f => f.nome), bomIntestazione: bom?.intestazione, gerber: inizioGerber, gencad: inizioGenCad });
  const disegno: Disegno = {
    strati: strati.map(({ piazzole: _, ...s }) => s), riquadro: contorno ?? unione(strati.map(s => s.riquadro)),
    forature: forature.flatMap(f => f.foratura.fori).slice(0, 20000),
  };
  return { file: elenco, analisi, disegno, fonti: { bom: bom?.nome ?? null, bomUnite: unite.slice(1).map(b => b.nome), pickPlace: pickPlace.map(p => p.nome), cad: cad?.nome ?? null, forature: forature.map(f => f.nome), gerber: strati.map(s => s.nome) } };
}

function unione(r: (Riquadro | null)[]): Riquadro | null {
  const v = r.filter((x): x is Riquadro => !!x);
  if (!v.length) return null;
  return { x0: Math.min(...v.map(x => x.x0)), y0: Math.min(...v.map(x => x.y0)), x1: Math.max(...v.map(x => x.x1)), y1: Math.max(...v.map(x => x.y1)) };
}
/** Senza contorno: il rame, ma senza oggetti lontani dai componenti (es. segni di riferimento fuori scheda). */
function riquadroSensato(r: Riquadro | null, pp: { lettura: LetturaPickPlace }[]): Riquadro | null {
  const pos = pp.flatMap(p => p.lettura.posizioni);
  if (!r || !pos.length) return r;
  const m = 8, xs = pos.map(p => p.x), ys = pos.map(p => p.y);
  const t = { x0: Math.max(r.x0, Math.min(...xs) - m), y0: Math.max(r.y0, Math.min(...ys) - m), x1: Math.min(r.x1, Math.max(...xs) + m), y1: Math.min(r.y1, Math.max(...ys) + m) };
  // pick and place con un'altra origine (RFQ M0929-C, 29/10/2026: Gerber a 103;205 mm, componenti vicino a 0;0): il taglio resterebbe
  // vuoto o schiacciato e il disegno sparisce. Si taglia solo se resta almeno metà del rame.
  const area = (q: Riquadro) => Math.max(0, q.x1 - q.x0) * Math.max(0, q.y1 - q.y0);
  return area(t) >= area(r) / 2 ? t : r;
}

// ───────────────────────────── database ─────────────────────────────

export const comprimi = (x: unknown) => gzipSync(Buffer.from(JSON.stringify(x)));
export const decomprimi = <T>(b: Buffer | null): T | null => b ? JSON.parse(gunzipSync(b).toString('utf8')) as T : null;

export async function creaPacchetto(opz: { nome: string; clienteId: number | null; utenteId: number | null }): Promise<number> {
  const r = await q1<{ id: number }>(`INSERT INTO pacchetti_scheda (nome, cliente_id, creato_da) VALUES ($1, $2, $3) RETURNING id`, [opz.nome, opz.clienteId, opz.utenteId]);
  return r!.id;
}
/** File che non servono a rileggere il pacchetto: solo il nome nell'elenco (il file resta sul Drive del cliente). */
const SOLO_ELENCO: TipoFile[] = ['pdf', 'disegno-3d', 'immagine'];
export async function aggiungiFile(id: number, nome: string, dati: Buffer) {
  const conserva = !SOLO_ELENCO.includes(tipoFile(nome, null));
  await q(`INSERT INTO pacchetti_scheda_file (pacchetto_id, nome, byte, dati) VALUES ($1, $2, $3, $4)
    ON CONFLICT (pacchetto_id, nome) DO UPDATE SET byte = EXCLUDED.byte, dati = EXCLUDED.dati`, [id, nome, dati.length, conserva ? gzipSync(dati) : Buffer.alloc(0)]);
}
/**
 * Prima del caricamento di una cartella: il browser manda solo nomi e dimensioni, qui si sceglie cosa serve davvero.
 * I file che non servono (PDF, 3D, immagini, troppo grandi…) entrano subito nel pacchetto con il solo nome; si risponde con i file da mandare.
 */
export async function scegliFileDaCaricare(id: number, file: { nome: string; byte: number }[]) {
  const scelta = scegliFile(file);
  for (const f of scelta.soloElenco)
    await q(`INSERT INTO pacchetti_scheda_file (pacchetto_id, nome, byte, dati) VALUES ($1, $2, $3, ''::bytea)
      ON CONFLICT (pacchetto_id, nome) DO UPDATE SET byte = EXCLUDED.byte, dati = EXCLUDED.dati`, [id, f.nome, Math.min(f.byte, 2_147_483_647)]);
  return scelta;
}
/**
 * Rilegge i file del pacchetto e salva il risultato. Nel database restano compressi solo i file utili (BOM, pick and place, Gerber,
 * forature, CAD; quelli dentro gli zip diventano file a parte); degli altri resta solo nome e dimensione.
 */
export async function analizzaPacchetto(id: number): Promise<Elaborazione> {
  // un'analisi alla volta, e niente caricamenti nel frattempo: tiene in memoria tutti i file del pacchetto aperti
  return conMemoria(BUDGET, async () => {
    const righe = await q<{ nome: string; byte: number; dati: Buffer }>(`SELECT nome, byte, dati FROM pacchetti_scheda_file WHERE pacchetto_id = $1 ORDER BY nome`, [id]);
    const caricati: FileCaricato[] = righe.map(r => r.dati.length ? { nome: r.nome, dati: gunzipSync(r.dati) } : { nome: r.nome, dati: Buffer.alloc(0), byte: r.byte, conservato: false });
    const nome = (await q1<{ nome: string }>(`SELECT nome FROM pacchetti_scheda WHERE id = $1`, [id]))?.nome ?? '';
    const file = espandiArchivi(caricati);
    await emailDallaCartella(id, file);
    const el = await elaboraPacchetto(file, nome, true);
    const daTenere = new Set(el.file.filter(f => TIPI_DA_CONSERVARE.includes(f.tipo) && !f.nota?.includes('ignorato') && f.nota !== TROPPO_GRANDE).map(f => f.nome));
    const presenti = new Set(righe.map(r => r.nome));
    // i file utili usciti dagli zip diventano file a parte (lo zip poi non si conserva)
    for (const f of file) if (f.conservato !== false && daTenere.has(f.nome) && !presenti.has(f.nome)) await aggiungiFile(id, f.nome, f.dati);
    await q(`UPDATE pacchetti_scheda_file SET dati = ''::bytea WHERE pacchetto_id = $1 AND NOT (nome = ANY($2::text[]))`, [id, [...daTenere]]);
    await q(`UPDATE pacchetti_scheda SET stato = 'analizzato', errore = NULL, file_elenco = $2, analisi = $3, disegno = $4, fonti = $5, analizzato_il = now() WHERE id = $1`,
      [id, JSON.stringify(el.file), JSON.stringify(el.analisi), comprimi(el.disegno), JSON.stringify(el.fonti)]);
    return el;
  });
}

/**
 * La mail del cliente salvata come .eml nella cartella (Adriano 29/10/2026: «RFQ_26225 … .eml» insieme ai file): il testo vale come
 * quello arrivato dal pulsante di Gmail (quantità, versioni, note del preventivo). Solo se il pacchetto non ha già la sua mail.
 * Gli allegati della mail non si leggono: i file sono già nella cartella.
 */
async function emailDallaCartella(id: number, file: FileCaricato[]) {
  const eml = file.find(f => /\.eml$/i.test(f.nome) && f.dati.length);
  if (!eml) return;
  const e = leggiEmail(eml.dati);
  if (!e.testo && !e.oggetto) return;
  await q(`UPDATE pacchetti_scheda SET email = $2 WHERE id = $1 AND email IS NULL`, [id, JSON.stringify({
    mittente: e.mittente.slice(0, 300), oggetto: e.oggetto.slice(0, 300), data: e.data.slice(0, 40), testo: e.testo.slice(0, 20000), messaggioId: e.messaggioId ?? '' })]);
}

/** Il file della BOM usata, per mandarla alla codifica (sezione Componenti). */
export async function fileBom(id: number): Promise<{ nome: string; dati: Buffer } | null> {
  const p = await q1<{ fonti: any }>(`SELECT fonti FROM pacchetti_scheda WHERE id = $1`, [id]);
  const nome = p?.fonti?.bom;
  if (!nome) return null;
  const f = await q1<{ dati: Buffer }>(`SELECT dati FROM pacchetti_scheda_file WHERE pacchetto_id = $1 AND nome = $2`, [id, nome]);
  return f ? { nome, dati: gunzipSync(f.dati) } : null;
}

/**
 * Preventivo compilato dai documenti (Adriano 28/10/2026): catalogo e tariffe attuali, valori standard come un preventivo nuovo,
 * più i numeri dell'incrocio. Resta "da validare": lo si controlla e salvando diventa una bozza normale.
 * Cliente e prodotto solo dall'anagrafica: il prodotto si trova se il nome del pacchetto contiene il suo codice, o se è uguale al
 * codice letto dai file. Se non c'è, codice, descrizione e revisione letti dai file restano proposti nel preventivo: l'ufficio
 * li controlla e li aggiunge in anagrafica dal preventivo stesso (Adriano 28/10/2026).
 */
export async function creaPreventivoDaPacchetto(id: number, nSchede: number, utenteId: number): Promise<number> {
  const p = await q1<any>(`SELECT p.*, c.ragione_sociale FROM pacchetti_scheda p LEFT JOIN clienti c ON c.id = p.cliente_id WHERE p.id = $1`, [id]);
  if (!p?.analisi) throw new Error('Il pacchetto non è ancora analizzato.');
  const [cat, tariffe] = await Promise.all([caricaCatalogo(), caricaTariffe()]);
  const standard = Object.fromEntries(cat.parametri.filter(x => x.default != null && x.gruppo !== 'GENERALE' && x.gruppo !== 'PRE-PRODUZIONE').map(x => [x.codice, x.default]));
  const { parametri, voci, daControllare } = parametriDaAnalisi(conAccettate(p.analisi, p.accettate));
  const esistenti = new Set(cat.parametri.map(x => x.codice));
  const proposta = (p.analisi as AnalisiScheda).prodotto ?? null;
  const compilati = voci.filter(v => esistenti.has(v.codice));

  // prodotto del cliente il cui codice compare nel nome del pacchetto (il più lungo, se più d'uno)
  const pulito = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  let prodotto: { id: number; codice: string; descrizione: string | null } | undefined;
  if (p.cliente_id) {
    const prodotti = await q<{ id: number; codice: string; descrizione: string | null }>(`SELECT id, codice, descrizione FROM prodotti WHERE cliente_id = $1`, [p.cliente_id]);
    prodotto = prodotti.filter(x => pulito(x.codice).length >= 3 && pulito(p.nome).includes(pulito(x.codice))).sort((a, b) => b.codice.length - a.codice.length)[0];
    if (!prodotto && proposta?.codice) prodotto = prodotti.find(x => pulito(x.codice) === pulito(proposta.codice!));
  }
  const fonte = (campo: 'codice' | 'descrizione' | 'revisione') => proposta?.fonti[campo] ? ` (da ${proposta.fonti[campo]})` : '';
  if (proposta?.revisione) daControllare.unshift(`revisione ${proposta.revisione} letta dai documenti${fonte('revisione')}`);
  else daControllare.unshift('scrivere la revisione (se non è indicata: 0)');
  if (!prodotto && proposta?.codice) daControllare.unshift(`prodotto nuovo: codice ${proposta.codice}${fonte('codice')}`
    + (proposta.descrizione ? `, descrizione ${proposta.descrizione}${fonte('descrizione')}` : ', manca la descrizione')
    + ': controllare e premere «Aggiungi in anagrafica»');
  else if (!prodotto) daControllare.unshift('scegliere il codice prodotto dall\'anagrafica o aggiungerlo con «Nuovo prodotto»');
  if (!p.cliente_id) daControllare.unshift('scegliere il cliente dall\'anagrafica');

  // BOM già codificata: costo componenti a scheda con le offerte lette (la spunta "Componenti" la decide l'ufficio)
  let costo: Record<string, number> = {};
  if (p.bom_id) {
    const b = await costoBomPerPreventivo(p.bom_id, nSchede);
    if (b && b.stato === 'pronta' && b.aScheda > 0) costo = { costoComponentiScheda: Math.round(b.aScheda * 10000) / 10000 };
    daControllare.push('componenti: spuntare "Componenti" se li compriamo noi');
  }

  const note = [`Compilato in automatico dai documenti del cliente «${p.nome}».`,
    p.email ? notaRichiesta(p.email) : '',
    `Valori presi dai documenti: ${compilati.map(v => `${v.codice} = ${String(v.valore).replace('.', ',')}`).join(', ')}.`,
    daControllare.length ? `Da controllare: ${daControllare.join('; ')}.` : ''].filter(Boolean).join('\n');
  const dati = normalizza({
    tariffe, nSchede, nSchedeInPCB: 1, parametri: { ...standard, ...parametri, ...costo },
    clienteId: p.cliente_id, prodottoId: prodotto?.id ?? null, bomId: p.bom_id ?? null,
    cliente: p.ragione_sociale ?? '', codice: prodotto?.codice ?? proposta?.codice ?? '', descrizione: prodotto?.descrizione ?? proposta?.descrizione ?? '',
    revisione: proposta?.revisione ?? '', note,
  }, cat);
  return segnaDaValidare(await salvaPreventivo({ dati, catalogo: cat, utenteId }), id);
}
async function segnaDaValidare(preventivoId: number, pacchettoId: number) {
  await q(`UPDATE preventivi SET stato = 'da_validare' WHERE id = $1`, [preventivoId]);
  await q(`UPDATE pacchetti_scheda SET preventivo_id = $2 WHERE id = $1`, [pacchettoId, preventivoId]);
  return preventivoId;
}

/**
 * BOM del pacchetto nella sezione Componenti (codifica, prezzi e reperibilità dai distributori): si crea una volta sola,
 * poi si riusa. Ritorna l'id della BOM, o null se il pacchetto non ha una BOM.
 */
export async function bomDelPacchetto(id: number, schede: number, utenteId: number): Promise<number | null> {
  const p = await q1<{ nome: string; bom_id: number | null }>(`SELECT nome, bom_id FROM pacchetti_scheda WHERE id = $1`, [id]);
  if (!p) return null;
  if (p.bom_id && await q1(`SELECT 1 FROM bom_analisi WHERE id = $1`, [p.bom_id])) return p.bom_id;
  const f = await fileBom(id);
  if (!f) return null;
  const nomeFile = f.nome.split('/').pop()!;
  const righe = await leggiFileBom(nomeFile, f.dati);
  const bomId = await creaAnalisi({ nome: p.nome, fileNome: nomeFile, righe, quantita: [schede], utenteId });
  await q(`UPDATE pacchetti_scheda SET bom_id = $2 WHERE id = $1`, [id, bomId]);
  avviaElaborazione(bomId);
  return bomId;
}

/** Spunta "Componenti" nel preventivo nato dai documenti: BOM quotata e collegata al preventivo (Adriano 28/10/2026). */
export async function quotaBomPacchetto(preventivoId: number, schede: number, utenteId: number) {
  const p = await q1<{ id: number }>(`SELECT id FROM pacchetti_scheda WHERE preventivo_id = $1`, [preventivoId]);
  if (!p) throw new Error('Il preventivo non viene dai documenti del cliente.');
  const bomId = await bomDelPacchetto(p.id, schede, utenteId);
  if (!bomId) throw new Error('Nei documenti del cliente non c\'è una BOM da quotare.');
  await q(`UPDATE preventivi SET bom_id = $2 WHERE id = $1`, [preventivoId, bomId]);
  const b = await q1<{ nome: string; stato: string; creato_il: string }>(`SELECT nome, stato, creato_il FROM bom_analisi WHERE id = $1`, [bomId]);
  return { bomId, nome: b!.nome, stato: b!.stato, creatoIl: b!.creato_il };
}

// ───────────────────────────── versioni della stessa scheda ─────────────────────────────

/**
 * Divide il pacchetto per versione (quantità e versioni lette dalla mail del cliente): un pacchetto figlio per versione con i file
 * comuni e quelli che nel nome portano la versione, la quantità richiesta e la stessa email. Ritorna gli id dei figli, già analizzati.
 */
export async function dividiPerVersioni(id: number, utenteId: number | null): Promise<number[]> {
  const p = await q1<any>(`SELECT * FROM pacchetti_scheda WHERE id = $1`, [id]);
  if (!p) throw new Error('Pacchetto non trovato.');
  if (await q1(`SELECT 1 FROM pacchetti_scheda WHERE padre_id = $1`, [id])) throw new Error('Il pacchetto è già diviso per versione.');
  const versioni = versioniDaDividere(richiesteDaEmail(p.email));
  if (!versioni.length) throw new Error('Nella mail non ci sono due o più versioni con la loro quantità.');
  const figli: number[] = [];
  for (const v of versioni) {
    const r = await q1<{ id: number }>(`INSERT INTO pacchetti_scheda (nome, cliente_id, creato_da, email, padre_id, versione, quantita)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`, [`${p.nome} – ${v.versione}`.slice(0, 200), p.cliente_id, utenteId, p.email, id, v.versione, v.quantita]);
    figli.push(r!.id);
  }
  await sincronizzaVersioni(id);
  return figli;
}

/** Copia nelle versioni i file del pacchetto padre che mancano (file aggiunti dopo la divisione) e le rianalizza. */
export async function sincronizzaVersioni(padreId: number): Promise<void> {
  const figli = await q<{ id: number; versione: string }>(`SELECT id, versione FROM pacchetti_scheda WHERE padre_id = $1 AND versione IS NOT NULL ORDER BY id`, [padreId]);
  if (!figli.length) return;
  const tutte = figli.map(f => f.versione);
  const nomi = (await q<{ nome: string }>(`SELECT nome FROM pacchetti_scheda_file WHERE pacchetto_id = $1`, [padreId])).map(f => f.nome);
  for (const f of figli) {
    const suoi = nomi.filter(n => fileDellaVersione(n, f.versione, tutte));
    await q(`INSERT INTO pacchetti_scheda_file (pacchetto_id, nome, byte, dati)
      SELECT $1, nome, byte, dati FROM pacchetti_scheda_file WHERE pacchetto_id = $2 AND nome = ANY($3::text[])
      ON CONFLICT (pacchetto_id, nome) DO UPDATE SET byte = EXCLUDED.byte, dati = EXCLUDED.dati`, [f.id, padreId, suoi]);
    await analizzaPacchetto(f.id);
  }
}
