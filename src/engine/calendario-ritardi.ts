/**
 * Calendario dei ritardi (suggerimento di Federico del 27/10/2026, fatto l'1/11/2026): nel calendario Google di info@
 * compaiono in anticipo i promemoria delle lavorazioni che stanno andando in ritardo rispetto ai tempi del preventivo,
 * alla capacità produttiva (Gantt) e alla scadenza di consegna.
 * Google Calendar si abbona a un indirizzo .ics del portale (Altri calendari → Da URL): niente delega di Google Workspace.
 * Qui solo i conti e il testo del file .ics, senza database: i test li controllano.
 */
import { lavorativo, piuGiorni, piuLavorativi, type Barra } from './ordini.js';

export interface CommessaAperta {
  id: number; numero: string; cliente: string; codice: string | null; stato: string;
  consegna: string | null; uomoPrevistoSec: number; uomoFattoSec: number;
}

export type TipoEvento = 'consegna_scaduta' | 'fine_superata' | 'doveva_partire' | 'parte_presto' | 'sovraccarico' | 'commessa_scaduta' | 'oltre_preventivo';

export interface EventoCalendario {
  uid: string; tipo: TipoEvento; data: string; titolo: string; descrizione: string; link: string;
}

/** Quanti giorni lavorativi prima dell'inizio arriva il promemoria "parte fra poco". */
export const ANTICIPO_GIORNI = 2;
/** Fin dove si guarda avanti (giorni di calendario). */
export const ORIZZONTE_GIORNI = 60;
/** Commessa oltre il preventivo: ore lavorate oltre il 100 % di quelle previste (uomo). */
export const SOGLIA_PREVENTIVO = 1;

const it = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const ore = (n: number) => `${Math.round(n * 10) / 10}`.replace('.', ',') + ' h';
const chiave = (s: string) => s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

export function eventiRitardi(dati: {
  oggi: string; barre: Barra[]; carico: Record<string, number>; oreGiorno: number; commesse: CommessaAperta[];
}): EventoCalendario[] {
  const { oggi, barre, carico, oreGiorno, commesse } = dati;
  const limite = piuGiorni(oggi, ORIZZONTE_GIORNI);
  const out: EventoCalendario[] = [];
  const oggiLavorativo = lavorativo(oggi) ? oggi : piuLavorativi(oggi, 1);

  for (const b of barre) {
    const id = `${chiave(b.etichetta)}-${b.consegna ?? 'X'}`;
    const durata = b.ore == null ? 'durata stimata 1 giorno (manca il preventivo del prodotto)' : `${ore(b.ore)} di lavoro in ${b.giorni} giorn${b.giorni === 1 ? 'o' : 'i'}`;
    if (b.consegna && b.consegna < oggi) {
      out.push({ uid: `consegna-${id}`, tipo: 'consegna_scaduta', data: oggiLavorativo, link: '/ordini',
        titolo: `⚠ Consegna scaduta: ${b.etichetta}`,
        descrizione: `La consegna era il ${it(b.consegna)} e ci sono ancora schede da spedire. Aggiorna la data con il cliente o spedisci.` });
    } else if (b.fine < oggi) {
      out.push({ uid: `fine-${id}`, tipo: 'fine_superata', data: oggiLavorativo, link: '/ordini/gantt',
        titolo: `⚠ Lavorazione oltre la fine prevista: ${b.etichetta}`,
        descrizione: `Secondo il Gantt doveva finire il ${it(b.fine)}; consegna il ${it(b.consegna!)}. ${durata}.` });
    } else if (b.inizio < oggi) {
      out.push({ uid: `partire-${id}`, tipo: 'doveva_partire', data: oggiLavorativo, link: '/ordini/gantt',
        titolo: `Doveva partire il ${it(b.inizio)}: ${b.etichetta}`,
        descrizione: `Per consegnare il ${it(b.consegna!)} la lavorazione doveva iniziare il ${it(b.inizio)} (${durata}). Se è già in produzione, ignora.` });
    } else if (b.inizio <= limite) {
      const avviso = piuLavorativi(b.inizio, -ANTICIPO_GIORNI);
      out.push({ uid: `parte-${id}`, tipo: 'parte_presto', data: avviso < oggi ? oggiLavorativo : avviso, link: '/ordini/gantt',
        titolo: `Parte il ${it(b.inizio)}: ${b.etichetta}`,
        descrizione: `Per consegnare il ${it(b.consegna!)} la lavorazione deve iniziare il ${it(b.inizio)} (${durata}). Materiale, programmi e lamine pronti?` });
    }
  }

  for (const [d, h] of Object.entries(carico).sort(([a], [b]) => a.localeCompare(b))) {
    if (d < oggi || d > limite || h <= oreGiorno + 1e-9) continue;
    out.push({ uid: `carico-${d}`, tipo: 'sovraccarico', data: d, link: '/ordini/gantt',
      titolo: `Sovraccarico: ${ore(h)} di lavoro su ${ore(oreGiorno)}`,
      descrizione: `Il ${it(d)} il Gantt chiede ${ore(h)} di produzione con ${ore(oreGiorno)} disponibili: anticipa qualcosa, aggiungi ore o sposta una consegna.` });
  }

  for (const c of commesse) {
    const nome = `${c.numero} ${c.cliente}${c.codice ? ` · ${c.codice}` : ''}`;
    if (c.consegna && c.consegna < oggi) {
      out.push({ uid: `commessa-scaduta-${c.id}`, tipo: 'commessa_scaduta', data: oggiLavorativo, link: `/commesse/${c.id}`,
        titolo: `⚠ Commessa oltre la consegna: ${nome}`,
        descrizione: `Consegna prevista il ${it(c.consegna)}, la commessa è ancora ${c.stato === 'aperta' ? 'aperta' : 'in produzione'}.` });
    }
    if (c.uomoPrevistoSec > 0 && c.uomoFattoSec > c.uomoPrevistoSec * SOGLIA_PREVENTIVO) {
      const perc = Math.round(c.uomoFattoSec / c.uomoPrevistoSec * 100);
      out.push({ uid: `commessa-tempi-${c.id}`, tipo: 'oltre_preventivo', data: oggiLavorativo, link: `/commesse/${c.id}`,
        titolo: `Tempi oltre il preventivo: ${nome}`,
        descrizione: `Ore lavorate ${ore(c.uomoFattoSec / 3600)} su ${ore(c.uomoPrevistoSec / 3600)} previste (${perc} %) e la commessa non è ancora rientrata.${c.consegna ? ` Consegna il ${it(c.consegna)}.` : ''}` });
    }
  }
  return out.sort((a, b) => a.data.localeCompare(b.data) || a.uid.localeCompare(b.uid));
}

// ───────────── file .ics (RFC 5545) ─────────────

const testoIcs = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const dataIcs = (d: string) => d.replace(/-/g, '');

/** Righe lunghe piegate a 75 byte (le continuazioni iniziano con uno spazio), senza spezzare i caratteri accentati. */
export function piega(riga: string): string {
  const pezzi: string[] = [];
  let corrente = '', byte = 0;
  for (const ch of riga) {
    const n = Buffer.byteLength(ch);
    if (byte + n > (pezzi.length ? 74 : 75)) { pezzi.push(corrente); corrente = ''; byte = 0; }
    corrente += ch; byte += n;
  }
  pezzi.push(corrente);
  return pezzi.join('\r\n ');
}

export function calendarioIcs(eventi: EventoCalendario[], opz: { adesso: Date; indirizzo: string }): string {
  const stamp = opz.adesso.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const righe = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Casteltech//Portale//IT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:Portale Casteltech · ritardi', 'X-WR-TIMEZONE:Europe/Rome',
    'X-WR-CALDESC:Consegne e lavorazioni in ritardo o a rischio (Gantt\\, commesse\\, capacità)',
    'REFRESH-INTERVAL;VALUE=DURATION:PT2H', 'X-PUBLISHED-TTL:PT2H'];
  for (const e of eventi) {
    const url = opz.indirizzo.replace(/\/$/, '') + e.link;
    righe.push('BEGIN:VEVENT', `UID:${e.uid}@portale.casteltech`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${dataIcs(e.data)}`, `DTEND;VALUE=DATE:${dataIcs(piuGiorni(e.data, 1))}`,
      `SUMMARY:${testoIcs(e.titolo)}`, `DESCRIPTION:${testoIcs(`${e.descrizione}\n${url}`)}`, `URL:${url}`, 'TRANSP:TRANSPARENT', 'END:VEVENT');
  }
  righe.push('END:VCALENDAR');
  return righe.map(piega).join('\r\n') + '\r\n';
}

/**
 * Quando ricalcolare (Neon gratuito: niente risvegli inutili del database). Google legge il calendario ogni qualche ora,
 * anche di notte: fuori dall'orario di lavoro (lun–ven 7–20) si risponde con l'ultima copia; in orario si ricalcola
 * al massimo una volta all'ora. Senza copia (dopo un riavvio) si calcola sempre.
 */
export function daRicalcolare(ultimo: Date | null, adesso: Date): boolean {
  if (!ultimo) return true;
  const roma = new Date(adesso.toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
  const g = roma.getDay(), h = roma.getHours();
  const inOrario = g >= 1 && g <= 5 && h >= 7 && h < 20;
  return inOrario && adesso.getTime() - ultimo.getTime() >= 60 * 60_000;
}
