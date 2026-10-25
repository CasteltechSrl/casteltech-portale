/**
 * Regole dei promemoria per le fasi aperte dal telefono (Adriano, 25/10/2026). Nessun accesso al database.
 *  1. fase aperta da troppo: dopo il DOPPIO del tempo previsto della fase (minimo 30 minuti) un promemoria
 *     all'operatore ("se la fase dura 1h, dopo 2h se non è chiusa");
 *  2. alle 16:30 (lun–ven) un promemoria a tutti quelli che hanno ancora fasi aperte;
 *  3. il giorno lavorativo dopo (venerdì → lunedì) un messaggio per chiudere la fase, con il link diretto.
 * Gli orari si cambiano da Impostazioni → Promemoria.
 */

export interface OrariPromemoria {
  fattore: number;        // promemoria dopo fattore × tempo previsto della fase
  minimoMin: number;      // ...ma mai prima di questi minuti
  fineGiornata: string;   // HH:MM promemoria a tutti
  giornoDopo: string;     // HH:MM messaggio di chiusura per le fasi rimaste aperte dai giorni prima
  fineLavoro: string;     // HH:MM dopo quest'ora il promemoria "durata" non parte (ci pensa quello del giorno dopo)
}

export const ORARI_DEFAULT: OrariPromemoria = { fattore: 2, minimoMin: 30, fineGiornata: '16:30', giornoDopo: '08:00', fineLavoro: '20:00' };

/** Legge gli orari salvati, tenendo i valori di default per quelli mancanti o sbagliati. */
export function leggiOrari(x: any): OrariPromemoria {
  const o = { ...ORARI_DEFAULT };
  const ora = (v: unknown) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : null;
  const n = (v: unknown) => { const k = Number(v); return Number.isFinite(k) && k > 0 ? k : null; };
  if (n(x?.fattore)) o.fattore = n(x.fattore)!;
  if (n(x?.minimoMin)) o.minimoMin = n(x.minimoMin)!;
  for (const k of ['fineGiornata', 'giornoDopo', 'fineLavoro'] as const) if (ora(x?.[k])) o[k] = ora(x[k])!;
  return o;
}

export const minutiDelGiorno = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + (m || 0); };

/** Data, ora e giorno della settimana in Italia (il server di Render lavora in UTC). */
export function partiRoma(d: Date): { data: string; ora: string; minuti: number; feriale: boolean } {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
  }).formatToParts(d).map(x => [x.type, x.value]));
  const ora = `${p.hour}:${p.minute}`;
  return { data: `${p.year}-${p.month}-${p.day}`, ora, minuti: minutiDelGiorno(ora), feriale: !['Sat', 'Sun'].includes(p.weekday) };
}

/** Dopo quanti minuti dall'apertura parte il promemoria. */
export function sogliaMinuti(previstoCicloSec: number, o: OrariPromemoria = ORARI_DEFAULT): number {
  return Math.max(o.minimoMin, Math.round((previstoCicloSec / 60) * o.fattore));
}

/**
 * Quando mandare il promemoria "fase aperta da troppo". null se cadrebbe in un altro giorno, di sabato/domenica
 * o dopo la fine del lavoro: in quel caso basta il messaggio del giorno lavorativo dopo.
 */
export function momentoPromemoria(apertaIl: Date, soglia: number, o: OrariPromemoria = ORARI_DEFAULT): Date | null {
  const t = new Date(apertaIl.getTime() + soglia * 60_000);
  const a = partiRoma(apertaIl), p = partiRoma(t);
  if (p.data !== a.data || !p.feriale || p.minuti > minutiDelGiorno(o.fineLavoro)) return null;
  return t;
}

/** Primo giorno lavorativo (lun–ven) dopo la data. Le festività non sono considerate. */
export function giornoLavorativoDopo(dataIso: string): string {
  const d = new Date(dataIso + 'T12:00:00Z');
  do d.setUTCDate(d.getUTCDate() + 1); while ([0, 6].includes(d.getUTCDay()));
  return d.toISOString().slice(0, 10);
}

/** Va mandato il messaggio di chiusura? Sì dal primo giorno lavorativo dopo quello di apertura. */
export function daChiudereOggi(dataApertura: string, oggi: string): boolean {
  return oggi >= giornoLavorativoDopo(dataApertura);
}

/** "è l'ora" di un promemoria giornaliero: dall'orario indicato per 30 minuti (il controllo gira ogni minuto). */
export function eOra(orario: string, adesso: { minuti: number; feriale: boolean }): boolean {
  const m = minutiDelGiorno(orario);
  return adesso.feriale && adesso.minuti >= m && adesso.minuti < m + 30;
}

export const hhmm = (min: number) => { const t = Math.max(0, Math.round(min)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
