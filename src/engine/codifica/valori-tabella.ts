/**
 * Pagina della riga BOM (Adriano 4/11/2026: "se punta ad una tabella, scrivendo qualcosa o con un menu a tendina, dovrei vedere cosa c'è in
 * tabella, non posso ricordarmele tutte" e "aggiungi anche dei suggerimenti nel momento in cui c'è un problema").
 * - `valoriTabella`: i valori che le tabelle della codifica accettano per un campo (case, tipo, colore, tolleranza);
 * - `suggerimentiRiga`: consigli in parole semplici per le note della riga (case non in tabella, campi mancanti…), con i valori simili
 *   della tabella e quelli già usati nell'archivio per la stessa famiglia.
 * Qui solo regole, senza database: i valori dell'archivio li passa chi chiama.
 */
import { CASE_FIX, CASE_VER, CNT, COLORI, COLORI_NUOVI, ETICHETTE, IC_FAM, THT_CASE, TOL, type Attr, type Attributi } from './regole.js';
import { CASE_AGGIUNTI, DIP_THT, IC_FAM_AGGIUNTE, TIPI_ANTENNE, TIPI_BATTERIE } from './aggiunte.js';
import { esempioCampo } from './campi-famiglia.js';

/** Valori dell'archivio per campo: valore → quante volte (i più usati prima). */
export type ValoriArchivio = Partial<Record<Attr, { valore: string; volte: number }[]>>;

const unici = (xs: string[]) => [...new Set(xs.filter(Boolean))];

/** Tutti i case che il codice gestionale conosce (scritti senza spazi e trattini, come li confronta la tabella). */
export function caseInTabella(): string[] {
  const ic = [...Object.keys(IC_FAM), ...Object.keys(IC_FAM_AGGIUNTE)].filter(f => !/\d/.test(f)).map(f => `${f}8`); // es. SOIC8 (i piedini veri al posto di 8)
  return unici([...Object.keys(CASE_FIX), ...Object.keys(CASE_VER), ...Object.keys(THT_CASE), ...Object.keys(CASE_AGGIUNTI), ...ic, ...DIP_THT.map(f => `${f}8`)])
    .sort((a, b) => a.localeCompare(b, 'it', { numeric: true }));
}

/** Valori accettati dalla tabella per il campo (vuoto = campo libero). */
export function valoriTabella(campo: Attr, famiglia: string | null | undefined): string[] {
  const fam = String(famiglia ?? '').toUpperCase();
  if (campo === 'case') return ['CN', 'TI', 'BT', 'AN'].includes(fam) ? [] : caseInTabella();
  if (campo === 'tipo') {
    if (fam === 'CN' || fam === 'TI') return Object.keys(CNT).sort();
    if (fam === 'BT') return Object.keys(TIPI_BATTERIE);
    if (fam === 'AN') return Object.keys(TIPI_ANTENNE);
    return [];
  }
  if (campo === 'colore') return [...Object.keys(COLORI), ...Object.keys(COLORI_NUOVI)];
  if (campo === 'tolleranza' && ['RS', 'RR', 'PO', 'NT'].includes(fam)) return unici(Object.keys(TOL).filter(k => k !== '025'));
  return [];
}

const pulito = (s: string) => s.replace(/[\s\-_.]/g, '').toUpperCase();

/** Valori simili a quello scritto: stessa sigla senza segni, stesse cifre, uno contiene l'altro. */
export function simili(scritto: string, elenco: string[], quanti = 6): string[] {
  const x = pulito(scritto);
  if (!x) return [];
  const cifre = x.replace(/\D/g, ''), lettere = x.replace(/\d/g, '');
  const punti = (v: string) => {
    const y = pulito(v);
    if (y === x) return 100;
    let p = 0;
    if (y.includes(x) || x.includes(y)) p += 40;
    if (cifre && y.replace(/\D/g, '') === cifre) p += 30;
    if (lettere.length >= 2 && y.includes(lettere)) p += 20;
    if (cifre && y.includes(cifre)) p += 10;
    return p;
  };
  return elenco.map(v => ({ v, p: punti(v) })).filter(x => x.p >= 20).sort((a, b) => b.p - a.p).slice(0, quanti).map(x => x.v);
}

const elenca = (xs: string[]) => xs.join(', ');
const piuUsati = (archivio: ValoriArchivio, campo: Attr, quanti = 6) =>
  (archivio[campo] ?? []).slice(0, quanti).map(x => `${x.valore} (${x.volte})`);

/** Suggerimenti per le note della riga e per i campi che mancano. */
export function suggerimentiRiga(r: { famiglia: string | null; attributi: Attributi; note: string[] }, archivio: ValoriArchivio = {}): string[] {
  const fam = String(r.famiglia ?? '').toUpperCase();
  const out: string[] = [];
  const consiglioCase = (scritto: string | null) => {
    const tab = valoriTabella('case', fam);
    const vicini = scritto ? simili(scritto, unici([...(archivio.case ?? []).map(x => x.valore), ...tab])) : [];
    const usati = piuUsati(archivio, 'case');
    const parti = [scritto ? `Il case "${scritto}" non è in tabella.` : 'Manca il case/formato.'];
    if (vicini.length) parti.push(`Simili: ${elenca(vicini)}.`);
    if (usati.length) parti.push(`Già usati in archivio per ${fam}: ${elenca(usati)}.`);
    parti.push('Se il componente non ha un case standard (pulsanti, moduli, induttanze grandi) scrivi le misure in mm come LLWW, es. 6035 per 6×3,5 mm: resta "da verificare".');
    parti.push('Apri la casella per vedere tutti i case della tabella.');
    out.push(parti.join(' '));
  };
  for (const n of r.note) {
    const c = n.match(/case "([^"]*)" non in tabella/i) ?? n.match(/formato\/case "([^"]*)"/i);
    if (c) { consiglioCase(c[1]); continue; }
    if (/^case non indicato|formato\/case non indicato|case mancante/i.test(n)) { consiglioCase(null); continue; }
    if (/componente THT: indicare il formato/i.test(n)) { out.push('Componente THT: nel case scrivi il formato o il passo (es. TO-92, DO-41, D8X11.5 per un elettrolitico, P150 = passo 15 mm per un film).'); continue; }
    const t = n.match(/tipo connettore "([^"]*)" non in tabella/i) ?? n.match(/tipo "([^"]*)" non in tabella/i);
    if (t) {
      const tab = valoriTabella('tipo', fam);
      const vicini = simili(t[1], tab);
      out.push(`Il tipo "${t[1]}" non è in tabella.${vicini.length ? ` Simili: ${elenca(vicini)}.` : ''} Tipi accettati: ${elenca(tab)}.`);
      continue;
    }
    if (/colore mancante o non in tabella/i.test(n)) { out.push(`Colori accettati: ${elenca(valoriTabella('colore', fam))}.`); continue; }
    if (/passo mancante/i.test(n)) { out.push('Scrivi il passo tra i piedini in mm (es. 2.54, 1.27, 5.08; RJ45 1.02). Lo trovi nel datasheet o nella descrizione DigiKey ("Pitch").'); continue; }
    if (/numero poli mancante/i.test(n)) { out.push('Scrivi quanti contatti ha il connettore (es. 2, 10, 40): è il numero "Positions" di DigiKey.'); continue; }
    if (/tolleranza non indicata/i.test(n)) { out.push(`Tolleranza in % (es. 1, 5): valori della tabella ${elenca(valoriTabella('tolleranza', fam) )}.`); continue; }
    const m = n.match(/produzione: manca (.+)$/i);
    if (m) {
      for (const nome of m[1].split(/,\s*/)) {
        const campo = (Object.keys(ETICHETTE) as Attr[]).find(k => ETICHETTE[k].toLowerCase() === nome.trim().toLowerCase());
        if (!campo) continue;
        const es = esempioCampo(fam, campo, r.attributi.tecnologia);
        const usati = piuUsati(archivio, campo, 4);
        out.push(`Per il codice di produzione manca ${ETICHETTE[campo]}${es ? ` (es. ${es})` : ''}.${usati.length ? ` In archivio per ${fam}: ${elenca(usati)}.` : ''}`);
      }
    }
  }
  return unici(out);
}
