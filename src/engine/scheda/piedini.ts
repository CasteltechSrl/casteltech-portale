/**
 * Punti di saldatura THT (Adriano 4/11/2026): "contare i pin di ogni componente o dal Gerber vedere quanti fori ci sono,
 * verificando la corrispondenza BOM–Gerber perché ci possono essere fori senza componente".
 *  - Piedini di ogni THT montato: dal file CAD (GenCAD) se c'è, altrimenti dall'impronta o dalla descrizione (DIP8, TO-220,
 *    PinHeader 2x05, MORSETTO 3 POLI, assiale/radiale = 2…).
 *  - Fori metallizzati del file di foratura (da 0,7 mm, senza i fori di fissaggio da 3 mm in su) confrontati con i piedini:
 *    quelli che avanzano sono fori senza componente (non montati, fissaggi, test point) e NON sono punti di saldatura.
 *  - Il numero dei punti va in "Punti di saldatura a mano" (THT a mano) e diventa stagno in filo o stagno della saldatrice.
 * Nessun accesso al database.
 */
import type { Componente } from './analisi.js';

/**
 * Grammi di stagno a punto: filo 0,125 g a piedino (Adriano 27/10/2026); saldatrice 0,02 g a reoforo (Adriano 4/11/2026, "tieni 0.02":
 * è il valore di Impostazioni → materiale "Stagno saldatrice (a reoforo)", che nel preventivo vale al posto di questo).
 */
export const STAGNO_A_PUNTO = { saldatrice: 0.02, filo: 0.125 } as const;
/** Fori metallizzati da qui in su: fissaggio (viti, distanziali), non piedini. */
export const DIAMETRO_FISSAGGIO = 3.0;
/** THT di cui non si sa niente: si contano 2 piedini (resistenze, condensatori, diodi: il caso più comune). */
export const PIEDINI_STIMATI = 2;

const TO_3 = /\bTO[-_ ]?(220|247|218|126|251|262|264|92|39|18|5|3P|3PF|202|225)(?:[-_ ]?([2-9]|1[0-5])(?![0-9]))?\b/;
const CONNETTORE = /CONN|HEADER|HDR|PIN ?HEAD|PINHEAD|STRIP|MORSETT|TERMINAL|TERM\b|MOLEX|JST|PHOENIX|WAGO|SOCKET|ZOCCOL|PIN|POLI|WAY|POS\b|BOX/;

/**
 * Piedini di un componente THT dai testi di impronta, descrizione e valore (il primo che si capisce).
 * null = non si capisce: il componente va contato a mano o con i fori.
 */
export function piediniDaTesto(...testi: (string | null | undefined)[]): number | null {
  for (const grezzo of testi) {
    const t = String(grezzo ?? '').toUpperCase();
    if (!t.trim()) continue;
    let m = t.match(/\b(?:P|C)?(?:DIP|DIL|SIP|SIL|PDIP)[-_ ]?(\d{1,2})\b/);
    if (m && +m[1] >= 2) return +m[1];
    m = t.match(TO_3);
    if (m) return m[2] ? +m[2] : 3;
    // file KiCad e simili: PinHeader_2x05, Conn_01x04, 1X10 (non "5x20" dei fusibili: il primo numero è al massimo 4)
    m = t.match(/(?:^|[^0-9.])0?([1-4])\s?[X×]\s?0?(\d{1,2})(?![0-9.]|\s?MM)/);
    if (m && CONNETTORE.test(t)) return +m[1] * +m[2];
    m = t.match(/\b(\d{1,3})\s?(?:POS|PIN|PINS|POLI|POLES|VIE|WAY|WAYS|CONTATTI|CONTACTS|CIRCUITS?)\b/);
    if (m && +m[1] > 0) return +m[1];
    m = t.match(/[_\- ](\d{1,2})P\b/);
    if (m && CONNETTORE.test(t) && +m[1] > 0) return +m[1];
    m = t.match(/\bB(\d{1,2})B-/); // JST B4B-XH-A
    if (m) return +m[1];
    if (/AXIAL|RADIAL|ASSIALE|RADIALE|\bDO[-_ ]?(?:15|35|41|201|204)|\bCP_?RADIAL|C_?DISC|HC[-_ ]?49|ELETTROLITIC|\bLED[-_ ]?(?:3|5)\s?MM/.test(t)) return 2;
  }
  return null;
}

/** Piedini di un componente dell'analisi: CAD > impronta e descrizione della BOM > impronta e valore del pick and place. */
export function piediniComponente(c: Pick<Componente, 'piediniTht' | 'bom' | 'pp'>): { piedini: number | null; da: 'CAD' | 'impronta' | null } {
  if (c.piediniTht != null && c.piediniTht > 0) return { piedini: c.piediniTht, da: 'CAD' };
  const n = piediniDaTesto(c.bom?.footprint, c.pp?.footprint, c.bom?.descrizione, c.bom?.valore, c.pp?.valore);
  return { piedini: n, da: n != null ? 'impronta' : null };
}

export interface PuntiSaldatura {
  /** punti di saldatura a scheda = piedini dei THT montati (null: non si possono contare) */
  punti: number | null;
  /** da dove vengono: piedini del CAD, piedini dei componenti (CAD + impronte), fori del Gerber, o stima */
  fonte: 'CAD' | 'componenti' | 'foratura' | 'stima' | null;
  thtMontati: number;
  /** THT montati di cui non si capiscono i piedini */
  senzaPiedini: string[];
  /** THT non montati: i loro fori restano vuoti */
  nonMontati: { refs: string[]; piedini: number };
  /** confronto con il file di foratura */
  fori: { metallizzati: number; fissaggio: number; senzaComponente: number } | null;
  /** spiegazione in parole per la pagina */
  testo: string;
}

/**
 * Conta i punti di saldatura THT a scheda e li confronta con i fori del Gerber.
 * `fori` = fori metallizzati da almeno 0,7 mm del file di foratura (`contaRefori().refori`) e quanti di questi sono da fissaggio.
 */
export function contaPuntiSaldatura(componenti: Componente[], fori?: { refori: number; fissaggio: number } | null): PuntiSaldatura {
  const tht = componenti.filter(c => c.tipo === 'THT');
  const montati = tht.filter(c => c.montato), dnp = tht.filter(c => !c.montato);
  let noti = 0, daCad = 0;
  const senzaPiedini: string[] = [];
  for (const c of montati) {
    const p = piediniComponente(c);
    if (p.piedini == null) senzaPiedini.push(c.ref);
    else { noti += p.piedini; if (p.da === 'CAD') daCad++; }
  }
  let piediniDnp = 0;
  for (const c of dnp) piediniDnp += piediniComponente(c).piedini ?? 0;
  const nonMontati = { refs: dnp.map(c => c.ref), piedini: piediniDnp };
  const foriPin = fori ? Math.max(0, fori.refori - fori.fissaggio) : null;

  let punti: number | null, fonte: PuntiSaldatura['fonte'];
  if (!montati.length) { punti = 0; fonte = null; }
  else if (!senzaPiedini.length) { punti = noti; fonte = daCad === montati.length ? 'CAD' : 'componenti'; }
  else if (foriPin != null && foriPin - piediniDnp >= noti + senzaPiedini.length) {
    // i THT senza piedini prendono i fori che restano (togliendo quelli dei non montati)
    punti = foriPin - piediniDnp; fonte = 'foratura';
  } else { punti = noti + senzaPiedini.length * PIEDINI_STIMATI; fonte = 'stima'; }

  const senzaComponente = foriPin != null && punti != null ? Math.max(0, foriPin - punti - piediniDnp) : 0;
  const parti: string[] = [];
  if (montati.length) {
    parti.push(fonte === 'CAD' ? `${punti} piedini dei ${montati.length} THT montati (dal file CAD)`
      : fonte === 'componenti' ? `${punti} piedini dei ${montati.length} THT montati (dal CAD e dalle impronte)`
      : fonte === 'foratura' ? `${punti} fori del Gerber per i ${montati.length} THT montati (di ${senzaPiedini.length} non si leggono i piedini: ${senzaPiedini.join(', ')})`
      : `${punti} piedini stimati: ${PIEDINI_STIMATI} per ciascuno dei THT senza dati (${senzaPiedini.join(', ')}) — da controllare`);
  } else parti.push('nessun THT montato');
  if (dnp.length) parti.push(`${dnp.length} THT non montati${piediniDnp ? ` (${piediniDnp} fori vuoti)` : ''}: ${dnp.map(c => c.ref).join(', ')}`);
  if (fori) {
    parti.push(`fori metallizzati nel Gerber ${fori.refori}${fori.fissaggio ? ` (${fori.fissaggio} di fissaggio da ${DIAMETRO_FISSAGGIO} mm in su)` : ''}`);
    if (senzaComponente) parti.push(`${senzaComponente} fori senza componente: non contano come punti di saldatura`);
  }
  return {
    punti, fonte, thtMontati: montati.length, senzaPiedini, nonMontati,
    fori: fori ? { metallizzati: fori.refori, fissaggio: fori.fissaggio, senzaComponente } : null,
    testo: parti.join('; ') + '.',
  };
}

/** Una riga della BOM quotata (Quotazioni) vista per i piedini: tecnologia, case, poli e testi. */
export interface RigaPerPiedini {
  designatori: string | null; qtaScheda: number; montata: boolean;
  tecnologia: string | null; testi: (string | null | undefined)[]; poli?: string | null;
}

/**
 * Punti di saldatura dalla BOM collegata al preventivo (senza documenti del cliente): righe THT (tecnologia T) montate,
 * piedini dal case o dai poli o dalla descrizione, × quantità a scheda. Righe senza piedini: stima di 2 a pezzo.
 */
export function puntiDaBom(righe: RigaPerPiedini[]): PuntiSaldatura {
  const tht = righe.filter(r => String(r.tecnologia ?? '').toUpperCase() === 'T');
  const montate = tht.filter(r => r.montata && r.qtaScheda > 0);
  let punti = 0, pezzi = 0;
  const senzaPiedini: string[] = [];
  for (const r of montate) {
    const poli = Number(String(r.poli ?? '').replace(',', '.'));
    const n = Number.isFinite(poli) && poli > 0 ? poli : piediniDaTesto(...r.testi);
    pezzi += r.qtaScheda;
    if (n == null) { senzaPiedini.push(r.designatori || r.testi.find(Boolean) || '?'); punti += PIEDINI_STIMATI * r.qtaScheda; }
    else punti += n * r.qtaScheda;
  }
  const fonte: PuntiSaldatura['fonte'] = !montate.length ? null : senzaPiedini.length ? 'stima' : 'componenti';
  const testo = !montate.length ? 'Nella BOM collegata non ci sono componenti THT (tecnologia T).'
    : `${punti} piedini di ${pezzi} THT a scheda` + (senzaPiedini.length ? ` (stimati ${PIEDINI_STIMATI} a pezzo per: ${senzaPiedini.join(', ')} — da controllare)` : '') + '.';
  return { punti, fonte, thtMontati: pezzi, senzaPiedini, nonMontati: { refs: [], piedini: 0 }, fori: null, testo };
}

/**
 * Campi del preventivo da compilare con i punti: a mano = punti + filo; saldatrice = punti nel campo "Stagno saldatrice (reofori)",
 * i grammi a reoforo li prende il calcolo da Impostazioni (con le scorie), lo stagno in grammi si azzera.
 */
export function campiStagno(punti: number, saldatura: 'mano' | 'onda'): Record<string, number> {
  const g = (n: number) => Math.round(n * 1000) / 1000;
  return saldatura === 'mano'
    ? { qntPuntiSaldaturaMano: punti, stagnoInFilo: g(punti * STAGNO_A_PUNTO.filo) }
    : { stagno: punti, stagnoPerSaldature: 0 };
}
