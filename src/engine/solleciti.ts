/**
 * Sollecito degli incassi (proposta della revisione, Adriano 1/11/2026): dalle rate scadute delle fatture emesse,
 * un'email per cliente con l'elenco delle fatture scadute, gli importi e l'IBAN. L'ufficio la controlla e la manda
 * (con Gmail quando la delega è attiva, altrimenti con la propria posta). Il tono sale con i giorni di ritardo.
 */
export interface RataScaduta {
  documentoId: number; numero: string; dataFattura: string; scadenza: string; importo: number;
  clienteId: number; cliente: string; email: string | null;
}
export type LivelloSollecito = 'primo' | 'secondo' | 'ultimo';
export interface GruppoSollecito { clienteId: number; cliente: string; email: string | null; rate: RataScaduta[]; totale: number; giorniMax: number; livello: LivelloSollecito }

const r2 = (x: number) => Math.round(x * 100) / 100;
const giorno = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00Z`).getTime();
export const giorniRitardo = (scadenza: string, oggi: string) => Math.max(0, Math.round((giorno(oggi) - giorno(scadenza)) / 86400000));
export const dataIt = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
/** "1.234,56 €" senza dipendere dalle lingue installate in Node. */
export function euroIt(n: number): string {
  const [intero, dec] = Math.abs(n).toFixed(2).split('.');
  return `${n < 0 ? '-' : ''}${intero.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec} €`;
}

/** Primo sollecito sotto i 30 giorni, secondo fino a 60, poi ultimo avviso. */
export function livelloSollecito(giorniMax: number): LivelloSollecito {
  return giorniMax < 30 ? 'primo' : giorniMax < 60 ? 'secondo' : 'ultimo';
}
export const NOMI_LIVELLO: Record<LivelloSollecito, string> = { primo: 'primo sollecito', secondo: 'secondo sollecito', ultimo: 'ultimo avviso' };

/** Rate scadute e non pagate raggruppate per cliente, dal totale più alto. */
export function raggruppaScaduti(rate: RataScaduta[], oggi: string): GruppoSollecito[] {
  const gruppi = new Map<number, GruppoSollecito>();
  for (const r of rate) {
    if (r.scadenza >= oggi || r.importo <= 0) continue;
    const g = gruppi.get(r.clienteId) ?? { clienteId: r.clienteId, cliente: r.cliente, email: r.email, rate: [], totale: 0, giorniMax: 0, livello: 'primo' as LivelloSollecito };
    g.rate.push(r);
    g.totale = r2(g.totale + r.importo);
    g.giorniMax = Math.max(g.giorniMax, giorniRitardo(r.scadenza, oggi));
    gruppi.set(r.clienteId, g);
  }
  return [...gruppi.values()].map(g => ({ ...g, rate: g.rate.sort((a, b) => a.scadenza.localeCompare(b.scadenza)), livello: livelloSollecito(g.giorniMax) }))
    .sort((a, b) => b.totale - a.totale);
}

export function oggettoSollecito(g: GruppoSollecito, azienda: string): string {
  const quante = g.rate.length === 1 ? `fattura n. ${g.rate[0].numero}` : `${g.rate.length} fatture scadute`;
  return g.livello === 'ultimo' ? `Ultimo avviso: ${quante} - ${azienda}` : `${g.livello === 'secondo' ? 'Secondo sollecito' : 'Sollecito di pagamento'}: ${quante} - ${azienda}`;
}

/** Testo dell'email proposto: elenco delle fatture, totale, IBAN; l'ufficio lo può cambiare prima di inviare. */
export function testoSollecito(g: GruppoSollecito, o: { azienda: string; iban?: string | null; banca?: string | null; oggi: string; telefono?: string | null }): string {
  const righe = g.rate.map(r => `- fattura n. ${r.numero} del ${dataIt(r.dataFattura)}, scaduta il ${dataIt(r.scadenza)}: ${euroIt(r.importo)} (${giorniRitardo(r.scadenza, o.oggi)} giorni di ritardo)`);
  const apertura = g.livello === 'primo'
    ? `dai nostri registri risultano ancora da incassare ${g.rate.length === 1 ? 'la seguente fattura' : 'le seguenti fatture'}:`
    : g.livello === 'secondo'
      ? `nonostante il nostro precedente sollecito, risultano ancora da incassare ${g.rate.length === 1 ? 'la seguente fattura' : 'le seguenti fatture'}:`
      : `vi scriviamo come ultimo avviso prima di sospendere le consegne in corso: risultano ancora da incassare ${g.rate.length === 1 ? 'la seguente fattura' : 'le seguenti fatture'}:`;
  const chiusura = g.livello === 'ultimo'
    ? 'Vi chiediamo di saldare entro 5 giorni dal ricevimento di questa email, o di contattarci subito per concordare il pagamento.'
    : 'Vi chiediamo di provvedere al pagamento nei prossimi giorni, o di contattarci se avete già disposto il bonifico o se c\'è qualcosa da chiarire sulle fatture.';
  const banca = o.iban ? `\n\nCoordinate per il bonifico: IBAN ${o.iban}${o.banca ? ` (${o.banca})` : ''}, intestato a ${o.azienda.replace(/\.+$/, '')}.` : '';
  return `Spett.le ${g.cliente},\n\n${apertura}\n${righe.join('\n')}\n\nTotale scaduto: ${euroIt(g.totale)}.\n\n${chiusura}${banca}`
    + `\n\nSe il pagamento è già stato fatto, vi preghiamo di non tenere conto di questo messaggio.\n\nCordiali saluti\n\n${o.azienda}${o.telefono ? `\nTel. ${o.telefono}` : ''}`;
}

/** Collegamento mailto: per chi manda dalla propria posta (quando Gmail non è attivo). */
export function mailtoSollecito(a: string | null, oggetto: string, testo: string): string {
  return `mailto:${encodeURIComponent(a ?? '')}?subject=${encodeURIComponent(oggetto)}&body=${encodeURIComponent(testo)}`;
}
