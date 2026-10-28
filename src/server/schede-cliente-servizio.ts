/**
 * Documenti della scheda del cliente (Preventivi → Da documenti): caricamento del pacchetto, lettura dei file,
 * incrocio e disegno del Gerber. Le regole sono in src/engine/scheda/*; qui file, archivi zip e database.
 * I file originali restano sul Drive del cliente (Adriano, 27/10/2026): nel database vanno solo i file che servono
 * a rileggere il pacchetto (BOM, pick and place, Gerber, forature, CAD), compressi, più il risultato.
 */
import { gzipSync, gunzipSync } from 'node:zlib';
import { unzipSync } from 'fflate';
import { q, q1 } from './db.js';
import { costoBomPerPreventivo, leggiFileBom } from './codifica-servizio.js';
import { caricaCatalogo, caricaTariffe } from './catalogo-db.js';
import { normalizza, salvaPreventivo } from './preventivi-servizio.js';
import { parametriDaAnalisi } from '../engine/scheda/preventivo.js';
import { analizzaScheda, leggiBomScheda, type AnalisiScheda, type RigaBomScheda, type StratoGerberInfo } from '../engine/scheda/analisi.js';
import { ruoloStrato, tipoFile, type TipoFile } from '../engine/scheda/classifica.js';
import { leggiForatura, type Foratura } from '../engine/scheda/foratura.js';
import { leggiGenCad } from '../engine/scheda/gencad.js';
import { leggiGerber, type Piazzola, type Riquadro } from '../engine/scheda/gerber.js';
import { leggiPickPlace, type LetturaPickPlace } from '../engine/scheda/pick-place.js';

/** byte e conservato servono per i file tenuti solo nell'elenco (PDF, 3D, immagini: restano sul Drive del cliente). */
export interface FileCaricato { nome: string; dati: Buffer; byte?: number; conservato?: boolean }
export interface FileElenco { nome: string; tipo: TipoFile; byte: number; usato: boolean; nota?: string }
export interface StratoDisegno extends StratoGerberInfo { defs: string; corpo: string; riquadro: Riquadro | null }
type ConPiazzole = StratoDisegno & { piazzole: Piazzola[] };
export interface Disegno { strati: StratoDisegno[]; riquadro: Riquadro | null; forature: { x: number; y: number; d: number; metallizzato: boolean | null }[] }
export interface Elaborazione { file: FileElenco[]; analisi: AnalisiScheda; disegno: Disegno; fonti: { bom: string | null; pickPlace: string[]; cad: string | null; forature: string[]; gerber: string[] } }

/** Tipi di file che si conservano nel database (compressi) per poter rifare l'analisi. */
export const TIPI_DA_CONSERVARE: TipoFile[] = ['bom', 'pick-place', 'gerber', 'foratura', 'gencad'];
const MAX_FILE = 25 * 1024 * 1024;
const CARTELLE_VECCHIE = /(^|[\\/])(OLD|VECCHI|VECCHIO|OBSOLET[EIO]|ARCHIVIO|BACKUP)([\\/])/i;

/** Apre gli zip (anche uno dentro l'altro, un livello) e toglie i file di sistema. */
export function espandiArchivi(file: FileCaricato[]): FileCaricato[] {
  const out: FileCaricato[] = [];
  const aggiungi = (f: FileCaricato, livello: number) => {
    const base = f.nome.split(/[\\/]/).pop()!.toLowerCase();
    if (base === 'desktop.ini' || base === 'thumbs.db' || base.startsWith('._') || f.nome.includes('__MACOSX')) return;
    if (base.endsWith('.zip') && livello < 2 && f.conservato !== false) {
      try {
        const dentro = unzipSync(new Uint8Array(f.dati));
        const prefisso = f.nome.replace(/\.zip$/i, '');
        for (const [n, d] of Object.entries(dentro)) if (!n.endsWith('/')) aggiungi({ nome: `${prefisso}/${n}`, dati: Buffer.from(d) }, livello + 1);
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

/** Legge tutti i file del pacchetto e fa l'incrocio. */
export async function elaboraPacchetto(caricati: FileCaricato[]): Promise<Elaborazione> {
  const file = espandiArchivi(caricati);
  const elenco: FileElenco[] = [];
  const bomCandidate: { nome: string; righe: RigaBomScheda[] }[] = [];
  const pickPlace: { nome: string; lettura: LetturaPickPlace }[] = [];
  const forature: { nome: string; foratura: Foratura }[] = [];
  const strati: ConPiazzole[] = [];
  let cad: { nome: string; componenti: ReturnType<typeof leggiGenCad>['componenti'] } | null = null;
  let k = 0;
  // ODB++ scompattato (cartelle matrix/, steps/, fonts/…): una sola riga nell'elenco invece di centinaia di file
  const radiciOdb = [...new Set(file.map(f => /^(.*?[\\/]|)matrix[\\/]matrix$/i.exec(f.nome)?.[1]).filter((x): x is string => x != null))];
  for (const r of radiciOdb) {
    const dentro = file.filter(f => f.nome.startsWith(r));
    elenco.push({ nome: r.replace(/[\\/]$/, '') || 'ODB++', tipo: 'odb', byte: dentro.reduce((t, f) => t + f.dati.length, 0), usato: false,
      nota: `ODB++ (${dentro.length} file): non ancora letto, si usano Gerber e forature` });
  }
  for (const f of file) {
    if (radiciOdb.some(r => f.nome.startsWith(r))) continue;
    if (f.conservato === false) {
      const tipo = tipoFile(f.nome, null);
      elenco.push({ nome: f.nome, tipo, byte: f.byte ?? 0, usato: false, nota: tipo === 'archivio' ? 'contenuto già estratto' : 'non conservato nel portale (resta sul Drive)' });
      continue;
    }
    const testo = sembraTesto(f.dati) ? testoDi(f.dati) : null;
    const tipo = tipoFile(f.nome, testo);
    const voce: FileElenco = { nome: f.nome, tipo, byte: f.dati.length, usato: false };
    elenco.push(voce);
    if (CARTELLE_VECCHIE.test(`/${f.nome}`)) { voce.nota = 'in una cartella di versioni vecchie: ignorato'; continue; }
    if (f.dati.length > MAX_FILE) { voce.nota = 'troppo grande'; continue; }
    try {
      if (tipo === 'bom') {
        const righe = leggiBomScheda(await leggiFileBom(f.nome.split(/[\\/]/).pop()!, f.dati));
        if (righe.righe.length) bomCandidate.push({ nome: f.nome, righe: righe.righe });
        else voce.nota = 'nessuna riga riconosciuta';
        if (righe.avvisi.length) voce.nota = righe.avvisi.join(' ');
      } else if (tipo === 'pick-place' && testo != null) {
        pickPlace.push({ nome: f.nome, lettura: leggiPickPlace(f.nome.split(/[\\/]/).pop()!, testo) }); voce.usato = true;
      } else if (tipo === 'foratura' && testo != null) {
        forature.push({ nome: f.nome, foratura: leggiForatura(f.nome.split(/[\\/]/).pop()!, testo) }); voce.usato = true;
      } else if (tipo === 'gencad' && testo != null) {
        cad = { nome: f.nome, componenti: leggiGenCad(testo).componenti }; voce.usato = true;
      } else if (tipo === 'gerber' && testo != null) {
        const { ruolo, lato } = ruoloStrato(f.nome, testo);
        const g = leggiGerber(testo, `s${k++}`);
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
  const bom = bomCandidate[0] ?? null;
  for (const v of elenco) if (v.tipo === 'bom' && bom && v.nome === bom.nome) v.usato = true;
  for (const b of bomCandidate.slice(1)) { const v = elenco.find(x => x.nome === b.nome); if (v) v.nota = 'altra BOM nel pacchetto: non usata (si usa quella che corrisponde al pick and place)'; }

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
  const disegno: Disegno = {
    strati: strati.map(({ piazzole: _, ...s }) => s), riquadro: contorno ?? unione(strati.map(s => s.riquadro)),
    forature: forature.flatMap(f => f.foratura.fori).slice(0, 20000),
  };
  return { file: elenco, analisi, disegno, fonti: { bom: bom?.nome ?? null, pickPlace: pickPlace.map(p => p.nome), cad: cad?.nome ?? null, forature: forature.map(f => f.nome), gerber: strati.map(s => s.nome) } };
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
  return { x0: Math.max(r.x0, Math.min(...xs) - m), y0: Math.max(r.y0, Math.min(...ys) - m), x1: Math.min(r.x1, Math.max(...xs) + m), y1: Math.min(r.y1, Math.max(...ys) + m) };
}

// ───────────────────────────── database ─────────────────────────────

export const comprimi = (x: unknown) => gzipSync(Buffer.from(JSON.stringify(x)));
export const decomprimi = <T>(b: Buffer | null): T | null => b ? JSON.parse(gunzipSync(b).toString('utf8')) as T : null;

export async function creaPacchetto(opz: { nome: string; clienteId: number | null; utenteId: number }): Promise<number> {
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
 * Rilegge i file del pacchetto e salva il risultato. Nel database restano compressi solo i file utili (BOM, pick and place, Gerber,
 * forature, CAD; quelli dentro gli zip diventano file a parte); degli altri resta solo nome e dimensione.
 */
export async function analizzaPacchetto(id: number): Promise<Elaborazione> {
  const righe = await q<{ nome: string; byte: number; dati: Buffer }>(`SELECT nome, byte, dati FROM pacchetti_scheda_file WHERE pacchetto_id = $1 ORDER BY nome`, [id]);
  const caricati: FileCaricato[] = righe.map(r => r.dati.length ? { nome: r.nome, dati: gunzipSync(r.dati) } : { nome: r.nome, dati: Buffer.alloc(0), byte: r.byte, conservato: false });
  const el = await elaboraPacchetto(caricati);
  const daTenere = new Set(el.file.filter(f => TIPI_DA_CONSERVARE.includes(f.tipo) && !f.nota?.includes('ignorato') && f.nota !== 'troppo grande').map(f => f.nome));
  const presenti = new Set(righe.map(r => r.nome));
  for (const f of espandiArchivi(caricati.filter(r => r.conservato !== false && /\.zip$/i.test(r.nome))))
    if (daTenere.has(f.nome) && !presenti.has(f.nome)) await aggiungiFile(id, f.nome, f.dati);
  await q(`UPDATE pacchetti_scheda_file SET dati = ''::bytea WHERE pacchetto_id = $1 AND NOT (nome = ANY($2::text[]))`, [id, [...daTenere]]);
  await q(`UPDATE pacchetti_scheda SET stato = 'analizzato', file_elenco = $2, analisi = $3, disegno = $4, fonti = $5, analizzato_il = now() WHERE id = $1`,
    [id, JSON.stringify(el.file), JSON.stringify(el.analisi), comprimi(el.disegno), JSON.stringify(el.fonti)]);
  return el;
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
 * Cliente e prodotto solo dall'anagrafica: il prodotto si trova se il nome del pacchetto contiene il suo codice.
 */
export async function creaPreventivoDaPacchetto(id: number, nSchede: number, utenteId: number): Promise<number> {
  const p = await q1<any>(`SELECT p.*, c.ragione_sociale FROM pacchetti_scheda p LEFT JOIN clienti c ON c.id = p.cliente_id WHERE p.id = $1`, [id]);
  if (!p?.analisi) throw new Error('Il pacchetto non è ancora analizzato.');
  const [cat, tariffe] = await Promise.all([caricaCatalogo(), caricaTariffe()]);
  const standard = Object.fromEntries(cat.parametri.filter(x => x.default != null && x.gruppo !== 'GENERALE' && x.gruppo !== 'PRE-PRODUZIONE').map(x => [x.codice, x.default]));
  const { parametri, voci, daControllare } = parametriDaAnalisi(p.analisi);
  const esistenti = new Set(cat.parametri.map(x => x.codice));
  const compilati = voci.filter(v => esistenti.has(v.codice));

  // prodotto del cliente il cui codice compare nel nome del pacchetto (il più lungo, se più d'uno)
  const pulito = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  let prodotto: { id: number; codice: string; descrizione: string | null } | undefined;
  if (p.cliente_id) {
    const prodotti = await q<{ id: number; codice: string; descrizione: string | null }>(`SELECT id, codice, descrizione FROM prodotti WHERE cliente_id = $1`, [p.cliente_id]);
    prodotto = prodotti.filter(x => pulito(x.codice).length >= 3 && pulito(p.nome).includes(pulito(x.codice))).sort((a, b) => b.codice.length - a.codice.length)[0];
  }
  if (!p.cliente_id) daControllare.unshift('scegliere il cliente dall\'anagrafica');
  if (!prodotto) daControllare.unshift('scegliere il codice prodotto dall\'anagrafica');

  // BOM già codificata: costo componenti a scheda con le offerte lette (la spunta "Componenti" la decide l'ufficio)
  let costo: Record<string, number> = {};
  if (p.bom_id) {
    const b = await costoBomPerPreventivo(p.bom_id, nSchede);
    if (b && b.stato === 'pronta' && b.aScheda > 0) costo = { costoComponentiScheda: Math.round(b.aScheda * 10000) / 10000 };
    daControllare.push('componenti: spuntare "Componenti" se li compriamo noi');
  }

  const note = [`Compilato in automatico dai documenti del cliente «${p.nome}».`,
    `Valori presi dai documenti: ${compilati.map(v => `${v.codice} = ${String(v.valore).replace('.', ',')}`).join(', ')}.`,
    daControllare.length ? `Da controllare: ${daControllare.join('; ')}.` : ''].filter(Boolean).join('\n');
  const dati = normalizza({
    tariffe, nSchede, nSchedeInPCB: 1, parametri: { ...standard, ...parametri, ...costo },
    clienteId: p.cliente_id, prodottoId: prodotto?.id ?? null, bomId: p.bom_id ?? null,
    cliente: p.ragione_sociale ?? '', codice: prodotto?.codice ?? '', descrizione: prodotto?.descrizione ?? '', revisione: '', note,
  }, cat);
  return segnaDaValidare(await salvaPreventivo({ dati, catalogo: cat, utenteId }), id);
}
async function segnaDaValidare(preventivoId: number, pacchettoId: number) {
  await q(`UPDATE preventivi SET stato = 'da_validare' WHERE id = $1`, [preventivoId]);
  await q(`UPDATE pacchetti_scheda SET preventivo_id = $2 WHERE id = $1`, [pacchettoId, preventivoId]);
  return preventivoId;
}
