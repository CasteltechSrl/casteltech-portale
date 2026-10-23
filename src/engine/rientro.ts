/**
 * Controlli sul rientro della scheda: l'ufficio vede subito righe non chiuse, tempi dimenticati,
 * tempi fuori misura, sovrapposizioni. Gli "errori" impediscono la conferma, gli "avvisi" no.
 */
import { minutiRiga, tempiRealiPerFase, type Rilevazione } from './consuntivo.js';

export interface Controllo { livello: 'errore' | 'avviso'; testo: string; riga?: number }

export interface FasePrevista { codice: string; numero: string; nome: string; cicloSec: number }

/** Scostamento oltre il quale un tempo è "fuori misura" rispetto al previsto (±50%). */
export const SOGLIA_SCOSTAMENTO = 0.5;

const hhmm = (min: number) => `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, '0')}`;

export function controllaRientro(righe: (Rilevazione & { totaleScrittoMin?: number })[], previste: FasePrevista[],
  nomeFase: (codice: string) => string = c => c): Controllo[] {
  const out: Controllo[] = [];
  const n = (i: number) => `Riga ${i + 1}`;
  righe.forEach((r, i) => {
    if (!r.fase) out.push({ livello: 'errore', riga: i, testo: `${n(i)}: manca la fase` });
    const haOre = !!(r.inizio && r.fine);
    if (r.inizio && !r.fine && !(r.durataMin! > 0)) out.push({ livello: 'errore', riga: i, testo: `${n(i)}: tempo aperto alle ${r.inizio} e mai chiuso` });
    else if (!haOre && !(r.durataMin! > 0)) out.push({ livello: 'errore', riga: i, testo: `${n(i)}: mancano apertura/chiusura o tempo totale` });
    if (haOre && !r.data) out.push({ livello: 'errore', riga: i, testo: `${n(i)}: manca la data` });
    if (r.tipo === 'P' && !(r.causa ?? '').trim()) out.push({ livello: 'errore', riga: i, testo: `${n(i)}: riga P (problema) senza causa nelle note` });
    const min = minutiRiga(r);
    if (min > 12 * 60) out.push({ livello: 'avviso', riga: i, testo: `${n(i)}: ${hhmm(min)} in una sola riga, controllare` });
    if (haOre && r.totaleScrittoMin != null && Math.abs(r.totaleScrittoMin - min) > 5)
      out.push({ livello: 'avviso', riga: i, testo: `${n(i)}: totale scritto ${hhmm(r.totaleScrittoMin)} ma da apertura/chiusura risulta ${hhmm(min)}` });
  });

  // stesso operatore su righe sovrapposte nello stesso giorno
  const conOre = righe.map((r, i) => ({ r, i })).filter(x => x.r.inizio && x.r.fine && x.r.data && (x.r.operatore ?? '').trim());
  for (let a = 0; a < conOre.length; a++) for (let b = a + 1; b < conOre.length; b++) {
    const x = conOre[a], y = conOre[b];
    if (x.r.operatore!.trim().toUpperCase() !== y.r.operatore!.trim().toUpperCase() || x.r.data !== y.r.data) continue;
    if (x.r.inizio! < y.r.fine! && y.r.inizio! < x.r.fine!)
      out.push({ livello: 'avviso', riga: y.i, testo: `${n(x.i)} e ${n(y.i)}: ${x.r.operatore} risulta su due righe nello stesso orario` });
  }

  // confronto con il previsto
  const reali = tempiRealiPerFase(righe.filter(r => r.fase));
  for (const f of previste) {
    const re = reali[f.codice];
    if (!re || re.cicloSec === 0) { out.push({ livello: 'avviso', testo: `${f.numero} ${f.nome}: nessun tempo (previsto ${hhmm(f.cicloSec / 60)}). Dimenticato?` }); continue; }
    if (f.cicloSec > 0) {
      const scost = re.cicloSec / f.cicloSec - 1;
      if (Math.abs(scost) > SOGLIA_SCOSTAMENTO)
        out.push({ livello: 'avviso', testo: `${f.numero} ${f.nome}: ${hhmm(re.cicloSec / 60)} contro ${hhmm(f.cicloSec / 60)} previste (${scost > 0 ? '+' : ''}${Math.round(scost * 100)}%)` });
    }
  }
  const codiciPrevisti = new Set(previste.map(f => f.codice));
  for (const codice of Object.keys(reali)) if (!codiciPrevisti.has(codice))
    out.push({ livello: 'avviso', testo: `${nomeFase(codice)}: fase non prevista dal preventivo` });
  return out;
}
