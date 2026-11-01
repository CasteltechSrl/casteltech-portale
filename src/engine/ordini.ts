/**
 * Ordini dei clienti: stato delle righe (da evadere / parziale / evaso), date secondo le regole del foglio
 * "Schedulazione produzione", cruscotto (fatturato, ordini da evadere, previsione) e pianificazione per il Gantt.
 * Solo calcoli: niente database. Le date sono testo AAAA-MM-GG.
 */

export type StatoRiga = 'da_evadere' | 'parziale' | 'evaso' | 'annullato';
export const STATI_ORDINE: Record<StatoRiga, string> = { da_evadere: 'da evadere', parziale: 'parziale', evaso: 'evaso', annullato: 'annullato' };

/** Regole del foglio: lavorazione = arrivo materiale + 3 giorni, consegna prevista = lavorazione + 5 giorni + ritardi. */
export const GIORNI_ARRIVO_LAVORAZIONE = 3;
export const GIORNI_LAVORAZIONE_CONSEGNA = 5;

export interface RigaOrdine {
  id: number;
  ordineId: number;
  tipo: 'scheda' | 'servizio';
  quantita: number;
  prezzo: number;
  quantitaSpedita: number;
  importoFatturato: number;
  statoManuale?: 'evaso' | 'da_evadere' | 'annullato' | null;
  consegnaRichiesta?: string | null;
  arrivoMateriale?: string | null;
  dataLavorazione?: string | null;     // scritta a mano: vince sulla regola
  ritardiProduzione?: number | null;
  consegnaPrevista?: string | null;    // scritta a mano: vince sulla regola
  consegne?: { data: string; quantita: number }[];   // consegne a programma
}

// ───────────────────────────── date ─────────────────────────────
const giorno = (iso: string) => new Date(iso + 'T12:00:00Z');
const iso = (d: Date) => d.toISOString().slice(0, 10);
export const piuGiorni = (d: string, n: number) => { const x = giorno(d); x.setUTCDate(x.getUTCDate() + n); return iso(x); };
export const differenzaGiorni = (a: string, b: string) => Math.round((giorno(a).getTime() - giorno(b).getTime()) / 86400000);
export const lavorativo = (d: string) => { const g = giorno(d).getUTCDay(); return g !== 0 && g !== 6; };
/** Sposta di n giorni lavorativi (lun–ven); n negativo va indietro. */
export function piuLavorativi(d: string, n: number): string {
  let x = d; const passo = n < 0 ? -1 : 1;
  for (let i = 0; i < Math.abs(n);) { x = piuGiorni(x, passo); if (lavorativo(x)) i++; }
  return x;
}
/** Il giorno stesso se lavorativo, altrimenti il primo lavorativo prima (indietro) o dopo (avanti). */
export const lavorativoVicino = (d: string, indietro = false) => { let x = d; while (!lavorativo(x)) x = piuGiorni(x, indietro ? -1 : 1); return x; };
export const meseDi = (d: string) => d.slice(0, 7);

/** Date della riga come nel foglio: le date scritte a mano vincono su quelle calcolate. */
export function dateRiga(r: Pick<RigaOrdine, 'arrivoMateriale' | 'dataLavorazione' | 'ritardiProduzione' | 'consegnaPrevista' | 'consegnaRichiesta'>) {
  const lavorazione = r.dataLavorazione || (r.arrivoMateriale ? piuGiorni(r.arrivoMateriale, GIORNI_ARRIVO_LAVORAZIONE) : null);
  const prevista = r.consegnaPrevista || (lavorazione ? piuGiorni(lavorazione, GIORNI_LAVORAZIONE_CONSEGNA + (Number(r.ritardiProduzione) || 0)) : null);
  const ritardo = prevista && r.consegnaRichiesta ? differenzaGiorni(prevista, r.consegnaRichiesta) : null;
  return { lavorazione, prevista, ritardo, consegna: prevista || r.consegnaRichiesta || null };
}

// ───────────────────────────── stato ─────────────────────────────
/**
 * Righe che sono servizi e non schede da produrre (Adriano, 28/10/2026: "programmazione attrezzature" è un servizio
 * necessario per produrre, non un prodotto): lamine, programmazione attrezzature, attrezzaggio, costi una tantum / avvio
 * produzione, trasporto e spedizione, sconti, acconti, prototipazione, progettazione, scansioni, caricamento firmware.
 * "Coating + ispezione + test" resta una scheda: è una lavorazione sulla scheda.
 */
const PAROLE_SERVIZIO = /\b(LAMIN[AE]|PROGRAMMAZION[EI] (ATTREZZATUR|MACCHIN)|ATTREZZAGGIO|ATTREZZATURE|UNA TANTUM|AVVIO (DI )?PRODUZIONE|INITIAL PRODUCTION|SET ?UP|TRASPORTO|SPEDIZION[EI]|SPESE DI|SCONTO|ACCONTO|ANTICIPO|ADVANCE PAYMENT|PROTOTIPAZIONE|PROGETTAZIONE|SCANSIONE|UPLOAD FIRMWARE)\b/;
export function eServizio(codice: string | null | undefined, descrizione: string | null | undefined): boolean {
  return PAROLE_SERVIZIO.test(`${codice ?? ''} ${descrizione ?? ''}`.toUpperCase().replace(/[-_]/g, ' '));
}

/**
 * Stato di una riga. Schede: evasa quando la quantità spedita arriva a quella ordinata, parziale se in parte.
 * Servizi (attrezzaggio, lamine, programmazioni…) non sono da evadere da soli: evasi se fatturati, o se l'ordine non ha
 * più schede da spedire (anche un ordine di soli servizi). Lo stato scritto a mano dall'ufficio vince.
 */
export function statoRiga(r: RigaOrdine, righeOrdine: RigaOrdine[]): StatoRiga {
  if (r.statoManuale) return r.statoManuale;
  if (r.tipo === 'servizio') {
    if (r.importoFatturato > 0) return 'evaso';
    const schede = righeOrdine.filter(x => x.ordineId === r.ordineId && x.tipo === 'scheda');
    return schede.every(x => ['evaso', 'annullato'].includes(statoRiga(x, righeOrdine))) ? 'evaso' : 'da_evadere';
  }
  if (r.quantita <= 0) return r.importoFatturato > 0 ? 'evaso' : 'da_evadere';
  if (r.quantitaSpedita >= r.quantita - 0.01) return 'evaso';
  return r.quantitaSpedita > 0 ? 'parziale' : 'da_evadere';
}

/** Stato dell'ordine intero: evaso se tutte le righe sono evase (o annullate), parziale se qualcosa è partito. */
export function statoOrdine(stati: StatoRiga[]): StatoRiga {
  const vive = stati.filter(s => s !== 'annullato');
  if (!vive.length) return stati.length ? 'annullato' : 'da_evadere';
  if (vive.every(s => s === 'evaso')) return 'evaso';
  return vive.some(s => s === 'evaso' || s === 'parziale') ? 'parziale' : 'da_evadere';
}

/** Quantità e valore ancora da consegnare. */
export function residuo(r: RigaOrdine, stato: StatoRiga) {
  if (stato === 'evaso' || stato === 'annullato') return { quantita: 0, valore: 0 };
  const quantita = r.tipo === 'scheda' ? Math.max(0, r.quantita - r.quantitaSpedita) : r.quantita;
  return { quantita, valore: arrotonda(quantita * r.prezzo) };
}

/**
 * Consegne ancora da fare: con un programma di consegne, la quantità già spedita copre le prime consegne;
 * altrimenti un'unica consegna alla data prevista (o richiesta). Data null = consegna da definire.
 */
export function consegneDaFare(r: RigaOrdine, stato: StatoRiga): { data: string | null; quantita: number; valore: number }[] {
  const res = residuo(r, stato);
  if (res.quantita <= 0) return [];
  const piano = [...(r.consegne ?? [])].sort((a, b) => a.data.localeCompare(b.data));
  if (r.tipo === 'scheda' && piano.length) {
    let giaSpedite = r.quantitaSpedita;
    const out: { data: string | null; quantita: number; valore: number }[] = [];
    for (const c of piano) {
      const coperta = Math.min(c.quantita, giaSpedite);
      giaSpedite -= coperta;
      const q = c.quantita - coperta;
      if (q > 0) out.push({ data: c.data, quantita: q, valore: arrotonda(q * r.prezzo) });
    }
    // programma più corto dell'ordine: il resto alla data della riga
    const nelPiano = out.reduce((a, c) => a + c.quantita, 0);
    if (res.quantita - nelPiano > 0.01) out.push({ data: dateRiga(r).consegna, quantita: res.quantita - nelPiano, valore: arrotonda((res.quantita - nelPiano) * r.prezzo) });
    return out;
  }
  return [{ data: dateRiga(r).consegna, ...res }];
}

// ───────────────────────────── evasione dai documenti ─────────────────────────────
/** Riga d'ordine ancora aperta a cui si possono abbinare DDT e fatture. */
export interface RigaAperta {
  id: number;
  clienteId: number | null;
  dataOrdine: string | null;
  codici: (string | null | undefined)[];   // codice nostro, codice del cliente
  descrizione: string | null;
  daSpedire: number;                        // quantità ordinata − già spedita
}
/** Riga di un DDT del portale. rigaOrdineId: abbinata a mano, vale quella. */
export interface RigaSpedita {
  chiave: string;
  documento: string;                        // es. "DDT 215 del 26/10/2026"
  clienteId: number | null;
  data: string;
  codice: string | null;
  descrizione: string | null;
  quantita: number;
  rigaOrdineId?: number | null;
}
export interface Abbinamento { rigaId: number; chiave: string; documento: string; data: string; codice: string | null; quantita: number }

const normale = (s: string | null | undefined) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
/** Codici troppo corti o solo numeri brevi (001, 007: servizi di Fatture in Cloud) non bastano per abbinare. */
const codiceBuono = (s: string) => s.length >= 4 && !/^\d{1,4}$/.test(s);

/**
 * Evasione dai DDT del portale (dallo storico di Fatture in Cloud e poi emessi dal portale; le fatture no: possono essere anticipi):
 * ogni riga spedita va alla riga d'ordine aperta dello stesso cliente con lo stesso codice (o la stessa descrizione),
 * ordinata prima della spedizione; prima gli ordini più vecchi, senza superare la quantità ordinata.
 * Quello che non trova posto resta fuori (spedizioni senza ordine o già contate).
 */
export function abbinaSpedizioni(aperte: RigaAperta[], spedite: RigaSpedita[]): Abbinamento[] {
  const resto = new Map(aperte.map(r => [r.id, r.daSpedire]));
  const ordinate = [...aperte].sort((a, b) => (a.dataOrdine ?? '').localeCompare(b.dataOrdine ?? '') || a.id - b.id);
  const out: Abbinamento[] = [];
  for (const s of [...spedite].sort((a, b) => a.data.localeCompare(b.data) || a.chiave.localeCompare(b.chiave))) {
    if (!(s.quantita > 0)) continue;
    const c = normale(s.codice), d = normale(s.descrizione);
    const candidate = s.rigaOrdineId
      ? ordinate.filter(r => r.id === s.rigaOrdineId)
      : ordinate.filter(r => r.clienteId != null && r.clienteId === s.clienteId && (!r.dataOrdine || r.dataOrdine <= s.data) && (() => {
        const codici = r.codici.map(normale).filter(codiceBuono);
        const descr = normale(r.descrizione);
        return (codiceBuono(c) && (codici.includes(c) || c === descr))
          || (codiceBuono(d) && (codici.includes(d) || (d.length >= 6 && d === descr)));
      })());
    let q = s.quantita;
    for (const r of candidate) {
      const libero = s.rigaOrdineId ? q : Math.min(q, resto.get(r.id) ?? 0);
      if (libero <= 0) continue;
      out.push({ rigaId: r.id, chiave: s.chiave, documento: s.documento, data: s.data, codice: s.codice || s.descrizione, quantita: libero });
      resto.set(r.id, (resto.get(r.id) ?? 0) - libero);
      q -= libero;
      if (q <= 0) break;
    }
  }
  return out;
}

// ───────────────────────────── cruscotto ─────────────────────────────
export interface RigaFattura { data: string; imponibile: number; intestazione?: boolean }

/**
 * Cruscotto: fatturato dell'anno (totale, per mese, media dei mesi chiusi), ordini da evadere (totale e per mese
 * di consegna; le consegne già scadute vanno nel mese corrente) e previsione di fatturato per i mesi futuri e per l'anno.
 */
export function cruscotto(fatture: RigaFattura[], righe: RigaOrdine[], oggi: string, anno = Number(oggi.slice(0, 4))) {
  const meseCorrente = meseDi(oggi);
  const fatturatoMese: Record<string, number> = {};
  for (const f of fatture) {
    if (f.intestazione || !f.data.startsWith(String(anno))) continue;
    fatturatoMese[meseDi(f.data)] = (fatturatoMese[meseDi(f.data)] ?? 0) + f.imponibile;
  }
  const fatturato = somma(Object.values(fatturatoMese));
  const mesiChiusi = Object.keys(fatturatoMese).filter(m => m < meseCorrente);
  const fatturatoChiuso = somma(mesiChiusi.map(m => fatturatoMese[m]));
  // media sui mesi chiusi dell'anno da gennaio (anche quelli senza fatture contano)
  const nMesiChiusi = meseCorrente.startsWith(String(anno)) ? Number(meseCorrente.slice(5)) - 1 : (String(anno) < meseCorrente ? 12 : 0);

  const daEvadereMese: Record<string, number> = {};
  let scaduto = 0, senzaData = 0;
  for (const r of righe) {
    for (const c of consegneDaFare(r, statoRiga(r, righe))) {
      if (!c.data) { senzaData += c.valore; continue; }
      let m = meseDi(c.data);
      if (m < meseCorrente) { scaduto += c.valore; m = meseCorrente; }
      daEvadereMese[m] = (daEvadereMese[m] ?? 0) + c.valore;
    }
  }
  const daEvadere = somma(Object.values(daEvadereMese)) + senzaData;
  const restoAnno = somma(Object.entries(daEvadereMese).filter(([m]) => m.startsWith(String(anno))).map(([, v]) => v));
  const mesi = [...new Set([...Object.keys(fatturatoMese), ...Object.keys(daEvadereMese)])].sort();
  return {
    anno,
    fatturato: arrotonda(fatturato),
    mediaMensile: nMesiChiusi ? arrotonda(fatturatoChiuso / nMesiChiusi) : 0,
    nMesiChiusi,
    daEvadere: arrotonda(daEvadere),
    scaduto: arrotonda(scaduto),
    senzaData: arrotonda(senzaData),
    // previsione dell'anno: fatturato + ordini da evadere con consegna entro l'anno (quelle senza data escluse)
    previsioneAnno: arrotonda(fatturato + restoAnno),
    mesi: mesi.map(m => ({ mese: m, fatturato: arrotonda(fatturatoMese[m] ?? 0), daEvadere: arrotonda(daEvadereMese[m] ?? 0) })),
  };
}

// ───────────────────────────── Gantt ─────────────────────────────
export interface DaPianificare {
  id: number;
  etichetta: string;
  quantita: number;            // ancora da produrre
  consegna: string | null;
  lavorazione?: string | null; // data di inizio dal foglio (arrivo materiale + 3), se c'è
  secondiPerScheda?: number | null; // tempo ciclo per scheda dal preventivo
}
export interface Barra {
  id: number; etichetta: string; inizio: string; fine: string; giorni: number; ore: number | null;
  stimata: boolean;            // nessun preventivo: durata di un giorno
  inRitardo: boolean;          // l'inizio calcolato è già passato, o la lavorazione finisce dopo la consegna
  oltreConsegna: boolean;      // la lavorazione finisce dopo la consegna richiesta (Adriano 1/11/2026: anche questa è in ritardo)
  consegna: string | null;
}

/**
 * Pianificazione all'indietro: la lavorazione finisce il giorno lavorativo prima della consegna e dura
 * ore ciclo (preventivo × quantità) ÷ ore al giorno, in giorni lavorativi. Se c'è già la data di lavorazione
 * (arrivo materiale + 3) si parte da quella. Senza consegna la riga non entra nel Gantt.
 */
export function pianifica(righe: DaPianificare[], oggi: string, oreGiorno = 8): Barra[] {
  const out: Barra[] = [];
  for (const r of righe) {
    if (!r.consegna || r.quantita <= 0) continue;
    const ore = r.secondiPerScheda && r.secondiPerScheda > 0 ? r.secondiPerScheda * r.quantita / 3600 : null;
    const giorni = ore == null ? 1 : Math.max(1, Math.ceil(ore / Math.max(0.5, oreGiorno) - 1e-9));
    let inizio: string, fine: string;
    if (r.lavorazione) {
      inizio = lavorativoVicino(r.lavorazione);
      fine = piuLavorativi(inizio, giorni - 1);
    } else {
      fine = piuLavorativi(lavorativoVicino(r.consegna, true), r.consegna && lavorativo(r.consegna) ? -1 : 0);
      inizio = piuLavorativi(fine, -(giorni - 1));
    }
    const oltreConsegna = fine > r.consegna;
    out.push({ id: r.id, etichetta: r.etichetta, inizio, fine, giorni, ore: ore == null ? null : arrotonda(ore), stimata: ore == null,
      inRitardo: inizio < oggi || oltreConsegna, oltreConsegna, consegna: r.consegna });
  }
  return out.sort((a, b) => a.inizio.localeCompare(b.inizio) || a.fine.localeCompare(b.fine));
}

/** Ore di lavoro per giorno (le ore di ogni barra divise sui suoi giorni lavorativi). */
export function caricoGiornaliero(barre: Barra[]): Record<string, number> {
  const carico: Record<string, number> = {};
  for (const b of barre) {
    if (b.ore == null) continue;
    for (let d = b.inizio, i = 0; i < b.giorni; d = piuLavorativi(d, 1), i++) carico[d] = arrotonda((carico[d] ?? 0) + b.ore / b.giorni);
  }
  return carico;
}

// Periodo del Gantt (Adriano 28/10/2026): scala a giorni, 1 mese è lo standard, in alternativa una settimana o 3 mesi, nient'altro.
// Il periodo parte sempre dal lunedì: "1 mese" = 5 settimane, "3 mesi" = 13 settimane; avanti/indietro di un periodo intero.
export const VISTE_GANTT = { settimana: { nome: 'Settimana', giorni: 7 }, mese: { nome: '1 mese', giorni: 35 }, trimestre: { nome: '3 mesi', giorni: 91 } } as const;
export type VistaGantt = keyof typeof VISTE_GANTT;
export const lunediDi = (d: string) => piuGiorni(d, -((giorno(d).getUTCDay() + 6) % 7));

export function periodoGantt(vista: unknown, oggi: string, da?: unknown) {
  const v: VistaGantt = typeof vista === 'string' && vista in VISTE_GANTT ? vista as VistaGantt : 'mese';
  const giorni = VISTE_GANTT[v].giorni;
  const inizio = lunediDi(typeof da === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(da) && !isNaN(giorno(da).getTime()) ? da : oggi);
  return { vista: v, da: inizio, a: piuGiorni(inizio, giorni - 1), giorni, precedente: piuGiorni(inizio, -giorni), successivo: piuGiorni(inizio, giorni),
    contieneOggi: oggi >= inizio && oggi <= piuGiorni(inizio, giorni - 1) };
}

/** Barre da mostrare nel periodo: quelle che lo toccano, più quelle in ritardo già finite prima (si vedono attaccate al bordo sinistro). */
export function barreNelPeriodo(barre: Barra[], p: { da: string; a: string; contieneOggi: boolean }): Barra[] {
  return barre.filter(b => b.inizio <= p.a && (b.fine >= p.da || (p.contieneOggi && b.inRitardo)));
}

const somma = (v: number[]) => v.reduce((a, x) => a + x, 0);
const arrotonda = (n: number) => Math.round(n * 100) / 100;
