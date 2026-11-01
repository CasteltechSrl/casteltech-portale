/**
 * Cruscotto generale = pagina iniziale dell'ufficio (Adriano 31/10/2026): in alto "Da fare oggi" (cose che aspettano qualcuno),
 * sei numeri chiave, poi un riquadro per area (Commerciale, Ordini clienti, Produzione, Acquisti, Amministrazione, Promemoria e sistema).
 * Qui solo i conti (senza database): le letture stanno in server/cruscotto-generale-servizio.ts, una volta sola all'apertura della pagina.
 */

export type Livello = 'urgente' | 'controllare' | 'normale';

/** Un pulsante della fila "Da fare oggi": compare solo se c'è almeno una cosa da fare. */
export interface DaFare { chiave: string; quanti: number; testo: string; link: string; livello: Livello }

/** Conteggi letti dal database per la fila "Da fare oggi". */
export interface ContiDaFare {
  sdiScartate: number; sdiNonConsegnate: number; consegneInRitardo: number; preventiviDaValidare: number; ordiniDaAcquisire: number;
  acquisizioniInErrore: number; ddtDaFatturare: number; schedeScansionate: number; tempiAperti: number; crmScadute: number;
  incassiScaduti: number; pagamentiScaduti: number; bozzeDocumenti: number;
  /** fatture differite (1/11/2026): DDT dei mesi prima non fatturati, con il termine del 15 superato o nel mese in corso */
  differiteScadute?: number; differiteInScadenza?: number;
}

const plurale = (n: number, uno: string, tanti: string) => (n === 1 ? uno : tanti);

/**
 * Fila "Da fare oggi": prima le urgenti (rosse), poi da controllare (gialle), poi il resto; senza le voci a zero.
 * `diretti`: per una voce con una sola cosa da fare, l'indirizzo di quella cosa (es. la fattura scartata) al posto dell'elenco.
 */
export function cosaDaFare(c: ContiDaFare, diretti: Partial<Record<string, string>> = {}): DaFare[] {
  const voci: DaFare[] = [
    { chiave: 'sdi-scartate', quanti: c.sdiScartate, livello: 'urgente', link: '/amministrazione/documenti',
      testo: plurale(c.sdiScartate, 'fattura scartata dallo SdI', 'fatture scartate dallo SdI') },
    { chiave: 'sdi-non-consegnate', quanti: c.sdiNonConsegnate, livello: 'controllare', link: '/amministrazione/documenti',
      testo: plurale(c.sdiNonConsegnate, 'fattura non recapitata (avvisare il cliente)', 'fatture non recapitate (avvisare i clienti)') },
    { chiave: 'consegne-ritardo', quanti: c.consegneInRitardo, livello: 'urgente', link: '/ordini',
      testo: plurale(c.consegneInRitardo, 'consegna in ritardo', 'consegne in ritardo') },
    { chiave: 'differite-scadute', quanti: c.differiteScadute ?? 0, livello: 'urgente', link: '/amministrazione/differite',
      testo: plurale(c.differiteScadute ?? 0, 'DDT da fatturare oltre il 15 (fattura differita in ritardo)', 'DDT da fatturare oltre il 15 (fatture differite in ritardo)') },
    { chiave: 'incassi-scaduti', quanti: c.incassiScaduti, livello: 'urgente', link: '/amministrazione',
      testo: plurale(c.incassiScaduti, 'incasso scaduto', 'incassi scaduti') },
    { chiave: 'pagamenti-scaduti', quanti: c.pagamentiScaduti, livello: 'controllare', link: '/amministrazione/ricevuti?da_pagare=1',
      testo: plurale(c.pagamentiScaduti, 'pagamento scaduto', 'pagamenti scaduti') },
    { chiave: 'differite-in-scadenza', quanti: c.differiteInScadenza ?? 0, livello: 'controllare', link: '/amministrazione/differite',
      testo: plurale(c.differiteInScadenza ?? 0, 'DDT del mese scorso da fatturare entro il 15', 'DDT del mese scorso da fatturare entro il 15') },
    { chiave: 'preventivi-da-validare', quanti: c.preventiviDaValidare, livello: 'controllare', link: '/preventivi',
      testo: plurale(c.preventiviDaValidare, 'preventivo da validare', 'preventivi da validare') },
    { chiave: 'da-acquisire', quanti: c.ordiniDaAcquisire, livello: 'controllare', link: '/ordini/acquisire',
      testo: plurale(c.ordiniDaAcquisire, 'documento da acquisire', 'documenti da acquisire') },
    { chiave: 'acquisizioni-errore', quanti: c.acquisizioniInErrore, livello: 'controllare', link: '/ordini/acquisire',
      testo: plurale(c.acquisizioniInErrore, 'documento non letto (errore)', 'documenti non letti (errore)') },
    { chiave: 'ddt-da-fatturare', quanti: c.ddtDaFatturare, livello: 'normale', link: '/amministrazione',
      testo: plurale(c.ddtDaFatturare, 'DDT da fatturare', 'DDT da fatturare') },
    { chiave: 'bozze', quanti: c.bozzeDocumenti, livello: 'normale', link: '/amministrazione',
      testo: plurale(c.bozzeDocumenti, 'bozza di fattura o DDT da finire', 'bozze di fatture e DDT da finire') },
    { chiave: 'schede-scansionate', quanti: c.schedeScansionate, livello: 'normale', link: '/commesse',
      testo: plurale(c.schedeScansionate, 'scheda scansionata da portare nel rientro', 'schede scansionate da portare nel rientro') },
    { chiave: 'tempi-aperti', quanti: c.tempiAperti, livello: 'normale', link: '/commesse',
      testo: plurale(c.tempiAperti, 'tempo aperto dal reparto', 'tempi aperti dal reparto') },
    { chiave: 'crm-scadute', quanti: c.crmScadute, livello: 'normale', link: '/crm?azioni=1',
      testo: plurale(c.crmScadute, 'azione CRM scaduta', 'azioni CRM scadute') },
  ];
  const ordine: Record<Livello, number> = { urgente: 0, controllare: 1, normale: 2 };
  return voci.filter(v => v.quanti > 0).map(v => (v.quanti === 1 && diretti[v.chiave] ? { ...v, link: diretti[v.chiave]! } : v)).sort((a, b) => ordine[a.livello] - ordine[b.livello]);
}

// ── date (aaaa-mm-gg, senza fusi orari) ──
const comeData = (d: string) => new Date(`${d}T12:00:00Z`);
const testo = (d: Date) => d.toISOString().slice(0, 10);
export const piuGiorni = (d: string, n: number) => { const x = comeData(d); x.setUTCDate(x.getUTCDate() + n); return testo(x); };
export const giorniTra = (da: string, a: string) => Math.round((comeData(a).getTime() - comeData(da).getTime()) / 86_400_000);
/** Lunedì della settimana della data. */
export const lunedi = (d: string) => piuGiorni(d, -((comeData(d).getUTCDay() + 6) % 7));

/** Numero della settimana ISO (la settimana con il primo giovedì dell'anno è la 1). */
export function settimanaIso(d: string): number {
  const x = comeData(d);
  x.setUTCDate(x.getUTCDate() + 3 - ((x.getUTCDay() + 6) % 7));   // giovedì della stessa settimana
  const primoGiovedi = new Date(Date.UTC(x.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((x.getTime() - primoGiovedi.getTime()) / 86_400_000 - 3 + ((primoGiovedi.getUTCDay() + 6) % 7)) / 7);
}

export interface Settimana { numero: number; lunedi: string; ore: number; disponibili: number; piena: boolean }

/**
 * Carico delle prossime settimane dal Gantt: ore ciclo per giorno (caricoGiornaliero di engine/ordini.ts) sommate da lunedì a venerdì,
 * contro le ore disponibili (ore al giorno × 5). Le ore dei giorni già passati della settimana corrente non contano.
 */
export function caricoSettimane(carico: Record<string, number>, oggi: string, oreGiorno: number, quante = 4): Settimana[] {
  const out: Settimana[] = [];
  for (let i = 0; i < quante; i++) {
    const lun = piuGiorni(lunedi(oggi), 7 * i);
    let ore = 0;
    for (let g = 0; g < 5; g++) { const d = piuGiorni(lun, g); if (d >= oggi) ore += carico[d] ?? 0; }
    ore = Math.round(ore * 10) / 10;
    const disponibili = Math.round(oreGiorno * 5 * 10) / 10;
    out.push({ numero: settimanaIso(lun), lunedi: lun, ore, disponibili, piena: ore > disponibili });
  }
  return out;
}

export interface ScadenzaFiscale { data: string; testo: string }

/**
 * Scadenze fisse del mese che riguardano il portale, nei prossimi `giorni` giorni (sabato e domenica → lunedì dopo):
 * il 15 fatture differite (TD24) e autofatture TD17/18/19 del mese prima, il 16 versamenti F24 (IVA, ritenute dei fornitori).
 */
export function scadenzeFiscali(oggi: string, giorni = 35): ScadenzaFiscale[] {
  const out: ScadenzaFiscale[] = [];
  const fino = piuGiorni(oggi, giorni);
  const lavorativo = (d: string) => { const g = comeData(d).getUTCDay(); return g === 6 ? piuGiorni(d, 2) : g === 0 ? piuGiorni(d, 1) : d; };
  for (let m = 0; m < 3; m++) {
    const base = comeData(`${oggi.slice(0, 7)}-01`);
    base.setUTCMonth(base.getUTCMonth() + m);
    const mese = testo(base).slice(0, 7);
    for (const [giorno, t] of [['15', 'Fatture differite e autofatture del mese prima'], ['16', 'F24: IVA e ritenute d\'acconto']] as const) {
      const d = lavorativo(`${mese}-${giorno}`);
      if (d >= oggi && d <= fino) out.push({ data: d, testo: t });
    }
  }
  return out.sort((a, b) => a.data.localeCompare(b.data));
}

/** Saluto secondo l'ora italiana. */
export const saluto = (ora: number) => (ora < 13 ? 'Buongiorno' : ora < 18 ? 'Buon pomeriggio' : 'Buonasera');

/** Cifra compatta per i riquadri: 142.300 → "142 k€", 1.520.000 → "1,52 M€". */
export function euroBreve(v: number): string {
  const a = Math.abs(v);
  const f = (x: number, dec: number) => x.toLocaleString('it-IT', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  if (a >= 1_000_000) return `${f(v / 1_000_000, 2)} M€`;
  if (a >= 10_000) return `${f(v / 1000, 0)} k€`;
  if (a >= 1000) return `${f(v / 1000, 1)} k€`;
  return `${f(v, 0)} €`;
}
