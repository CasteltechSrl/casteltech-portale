/**
 * Famiglia corretta da sola (Adriano 4/11/2026, "gli si può dare qualche skill in più per bypassare questo problema in futuro?"):
 * un connettore finito in MI (o senza famiglia, o in IC) non ha il codice gestionale, perché in MI serve un case in tabella.
 * Se la riga parla chiaramente di un connettore (RJ45, USB, header, morsetto, "Connector_…" di KiCad…) il portale prova la famiglia
 * CN · Connettori con tipo, passo e poli letti da impronta e descrizione; la proposta vale solo se così il codice gestionale si calcola,
 * e la riga resta "da validare" con il motivo nelle note. Qui solo le regole, senza database.
 */
import { calcola, type Attributi } from './regole.js';
import { daColonneBom } from './decoder.js';

/** Famiglie da cui si può passare a CN: quelle dove un connettore finisce per sbaglio. */
const DA_CORREGGERE = new Set(['', 'MI', 'IC']);
const PAROLE_CONNETTORE = /CONNECTOR|\bCONN\b|\bCONN[._\s]|RJ45|RJ11|ETHERNET|\bUSB|PIN\s?HEADER|\bHEADER\b|TERMINAL\s?BLOCK|MORSETT|\bSOCKET\b|RECEPTACLE|\bHDMI\b|MICRO\s?SD/;
/** Valori standard dei connettori modulari quando impronta e descrizione non li dicono (8P8C e 6P6C: passo 1,02 mm). */
/** USB-A e USB-B (4/11/2026, presa 5787834-1): 4 contatti a passo 2,5 mm. */
export const STANDARD: Record<string, { passo: string; poli: string }> = {
  RJ45: { passo: '1.02', poli: '8' }, RJ11: { passo: '1.02', poli: '6' }, USBA: { passo: '2.5', poli: '4' }, USBB: { passo: '2.5', poli: '4' } };

/** Connettore già in CN a cui mancano passo o poli: valori standard del tipo (solo quelli che mancano), con il motivo per la nota. */
export function connettoreStandard(fam: string | null, a: Attributi): { attributi: Attributi; motivo: string } | null {
  if (String(fam ?? '').toUpperCase() !== 'CN') return null;
  const tipo = String(a.tipo ?? '').replace(/\s/g, '').toUpperCase(), std = STANDARD[tipo];
  if (!std || (a.passo && a.poli)) return null;
  const nuovi: Attributi = { ...a }, detti: string[] = [];
  if (!a.passo) { nuovi.passo = std.passo; detti.push(`passo ${std.passo} mm`); }
  if (!a.poli) { nuovi.poli = std.poli; detti.push(`${std.poli} poli`); }
  return { attributi: nuovi, motivo: `valori standard ${tipo}: ${detti.join(', ')}: controlla sul datasheet` };
}

export interface DatiRiga {
  famiglia: string | null; attributi: Attributi; pn: string | null;
  footprint?: string | null; descrizioneBom?: string | null; valore?: string | null; descrizione?: string | null;
}

export function famigliaProposta(r: DatiRiga): { famiglia: 'CN'; attributi: Attributi; motivo: string } | null {
  const fam = String(r.famiglia ?? '').toUpperCase();
  if (!DA_CORREGGERE.has(fam)) return null;
  const testo = [r.footprint, r.descrizioneBom, r.valore, r.descrizione, r.attributi.tipo].filter(Boolean).join(' ').toUpperCase();
  const parola = testo.match(PAROLE_CONNETTORE);
  if (!parola) return null;
  const [, letti] = daColonneBom('CN', r.valore, r.footprint, [r.descrizioneBom, r.descrizione, r.attributi.tipo].filter(Boolean).join(' '));
  const a: Attributi = { ...letti };
  if (!a.tipo && /ETHERNET/.test(testo)) a.tipo = 'RJ45';
  const std = a.tipo ? STANDARD[a.tipo] : undefined;
  const standard: string[] = [];
  if (std && !a.passo) { a.passo = std.passo; standard.push(`passo ${std.passo} mm`); }
  if (std && !a.poli) { a.poli = std.poli; standard.push(`${std.poli} poli`); }
  a.tecnologia = a.tecnologia ?? r.attributi.tecnologia ?? (/\bTHT\b/.test(testo) ? 'T' : null);
  const c = calcola('CN', a, r.pn);
  if (!c.root) return null;
  const da = fam ? `da ${fam} a CN` : 'CN';
  return { famiglia: 'CN', attributi: a,
    motivo: `famiglia ${da} (connettore riconosciuto da "${parola[0].trim()}")${standard.length ? `, valori standard ${a.tipo}: ${standard.join(', ')}` : ''}: controlla tipo, passo e poli` };
}
