/**
 * Fogli tempi della scheda di produzione letti dalla scansione (IA): pulizia di quanto letto e trasformazione
 * nelle righe del rientro. Solo calcoli: niente database e niente rete.
 * Sul foglio: FASE e OPERATORE hanno un "+" prestampato ("1+2" = fasi 1 e 2 insieme, "MH+NG" = due operatori),
 * la DATA è solo gg/mm (l'anno si ricava dalla data della scansione).
 */

/** Riga come la restituisce l'IA (tutto testo, come scritto a mano). */
export interface RigaLetta {
  fase?: unknown; operatore?: unknown; data?: unknown; apertura?: unknown; chiusura?: unknown; totale?: unknown;
  persone?: unknown; pezzi?: unknown; sp?: unknown; resp?: unknown; note?: unknown; incerta?: unknown;
}
export interface FoglioLetto { commessa?: unknown; foglio?: unknown; righe?: RigaLetta[] }

/** Riga pronta per il rientro (stessi campi del modulo Rientro). */
export interface RigaScansione {
  fase: string; operatore: string; data?: string; inizio?: string; fine?: string; durataMin?: number; totaleScrittoMin?: number;
  persone?: number; pezzi?: number; tipo: 'S' | 'P'; causa: string; note: string; resp: string; materiale: string;
  /** testo della fase come scritto (es. "13+15"), per il controllo dell'ufficio */
  faseScritta: string; incerta: boolean;
}

const testo = (x: unknown) => String(x ?? '').replace(/\s+/g, ' ').trim();

/** "8", "8:00", "8.30", "830", "16,45" → "08:00"…; altrimenti null. */
export function oraDa(x: unknown): string | null {
  const s = testo(x).replace(/[.,]/g, ':');
  let m = /^(\d{1,2}):(\d{2})$/.exec(s) ?? /^(\d{1,2})(\d{2})$/.exec(s);
  if (!m && /^\d{1,2}$/.test(s)) m = [s, s, '00'] as unknown as RegExpExecArray;
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  return h <= 23 && min <= 59 ? `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}` : null;
}

/** Durata scritta ("1:30", "1,5", "90'") in minuti. */
export function minutiDa(x: unknown): number | null {
  const s = testo(x);
  if (!s) return null;
  let m = /^(\d{1,2})[:.](\d{2})$/.exec(s);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = /^(\d+)\s*('|min)$/i.exec(s);
  if (m) return Number(m[1]);
  const ore = Number(s.replace(',', '.').replace(/\s*h$/i, ''));
  return Number.isFinite(ore) && ore > 0 ? Math.round(ore * 60) : null;
}

/**
 * Data gg/mm del foglio con l'anno della scansione; se così cadrebbe più di 7 giorni dopo la scansione
 * (es. foglio di dicembre scansionato a gennaio) è dell'anno prima.
 */
export function dataDaGiornoMese(x: unknown, riferimento: string): string | null {
  const s = testo(x);
  const m = /^(\d{1,2})\s*[/.\-]\s*(\d{1,2})(?:\s*[/.\-]\s*(\d{2,4}))?$/.exec(s);
  if (!m) return null;
  const gg = Number(m[1]), mm = Number(m[2]);
  if (mm < 1 || mm > 12 || gg < 1 || gg > 31) return null;
  const due = (n: number) => String(n).padStart(2, '0');
  if (m[3]) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${due(mm)}-${due(gg)}`;
  let anno = Number(riferimento.slice(0, 4));
  const limite = new Date(`${riferimento}T00:00:00Z`).getTime() + 7 * 86_400_000;
  if (new Date(`${anno}-${due(mm)}-${due(gg)}T00:00:00Z`).getTime() > limite) anno--;
  return `${anno}-${due(mm)}-${due(gg)}`;
}

/** Numeri delle fasi scritte nella colonna FASE: "13+15" → ["13", "15"], "3+" → ["3"], "m1" → ["M1"]. */
export const numeriFase = (x: unknown) => testo(x).toUpperCase().split(/[+,;&\s]+/).map(s => s.replace(/[^A-Z0-9]/g, '')).filter(Boolean);
/** Sigle degli operatori: "MH+NG" → "MH+NG", "ag +" → "AG". */
export const operatoriDa = (x: unknown) => testo(x).toUpperCase().split(/[+,;&\s/]+/).map(s => s.replace(/[^A-Z0-9]/g, '')).filter(Boolean).join('+');

/**
 * Righe lette → righe del rientro. La fase si trova dal numero stampato sulla scheda (mappa numero → codice);
 * con più fasi insieme ("1+2") il tempo va sulla prima e nelle note si scrive quali erano: poi il Rientro lo divide
 * tra le fasi in proporzione al preventivo (`ripartisciFasiInsieme`).
 */
export function righeDaFoglio(fogli: FoglioLetto[], fasePerNumero: Map<string, string>, riferimento: string): RigaScansione[] {
  const out: RigaScansione[] = [];
  for (const f of fogli) for (const r of f.righe ?? []) {
    const numeri = numeriFase(r.fase);
    const inizio = oraDa(r.apertura) ?? undefined, fine = oraDa(r.chiusura) ?? undefined;
    const totale = minutiDa(r.totale) ?? undefined;
    const operatore = operatoriDa(r.operatore);
    if (!numeri.length && !inizio && !fine && totale == null && !operatore) continue;   // riga vuota
    const codice = numeri.map(n => fasePerNumero.get(n)).find(Boolean) ?? '';
    const tipo: 'S' | 'P' = /^P/i.test(testo(r.sp)) ? 'P' : 'S';
    const insieme = numeri.length > 1 ? `FASI ${numeri.join('+')} INSIEME` : '';
    const note = [insieme, testo(r.note)].filter(Boolean).join(' · ');
    const pers = Number(testo(r.persone).replace(',', '.')), pz = Number(testo(r.pezzi));
    out.push({
      fase: codice, faseScritta: testo(r.fase), operatore, data: dataDaGiornoMese(r.data, riferimento) ?? undefined, inizio, fine,
      durataMin: inizio && fine ? undefined : totale, totaleScrittoMin: inizio && fine ? totale : undefined,
      persone: testo(r.persone) && pers > 0 ? pers : undefined, pezzi: testo(r.pezzi) && Number.isFinite(pz) ? pz : undefined,
      tipo, causa: tipo === 'P' ? note : '', note: tipo === 'P' ? '' : note, resp: testo(r.resp).toUpperCase(), materiale: '',
      incerta: r.incerta === true || !codice,
    });
  }
  return out;
}

/** Toglie le righe lette già presenti nel rientro (stessa fase, operatore, giorno e apertura): es. inserite dal telefono. */
export function soloNuove<T extends { fase: string; operatore?: string; data?: string; inizio?: string; durataMin?: number }>(lette: T[], presenti: T[]): T[] {
  const k = (r: T) => [r.fase, (r.operatore ?? '').toUpperCase(), r.data ?? '', r.inizio ?? '', r.inizio ? '' : r.durataMin ?? ''].join('|');
  const gia = new Set(presenti.map(k));
  return lette.filter(r => !gia.has(k(r)));
}

/** Riga del foglio tempi quanto basta per ripartirla (righe lette, righe del rientro). */
interface RigaDaRipartire {
  fase: string; inizio?: string; fine?: string; durataMin?: number; totaleScrittoMin?: number; tipo: 'S' | 'P'; note?: string; causa?: string;
}
export interface FasePerRipartire { codice: string; numero: string; cicloSec: number }

const SEGNO_INSIEME = /FASI ([A-Z0-9+]+) INSIEME/;
const GIA_RIPARTITA = /RIPARTIT/;

/** Divide `totale` minuti interi secondo i pesi (resti più grandi): la somma resta uguale al totale. */
export function dividiMinuti(totale: number, pesi: number[]): number[] {
  const somma = pesi.reduce((a, p) => a + p, 0);
  const esatti = pesi.map(p => (totale * p) / somma);
  const out = esatti.map(Math.floor);
  let resto = Math.round(totale - out.reduce((a, m) => a + m, 0));
  for (const k of esatti.map((x, k) => ({ k, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r).map(x => x.k)) {
    if (resto <= 0) break;
    out[k]++; resto--;
  }
  return out;
}

const oraPiu = (hhmm: string, min: number) => {
  const [h, m] = hhmm.split(':').map(Number);
  const t = (((h * 60 + m + min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
const durata = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}'` : ''}` : `${min}'`);

/**
 * Fasi fatte insieme su un'unica riga ("FASI 5+6 INSIEME" nelle note): il tempo si divide tra le fasi in proporzione
 * al tempo ciclo previsto dal preventivo (ricalcolato sulla quantità della commessa). Con apertura e chiusura la riga
 * diventa tante righe una dopo l'altra (5: 8:00–8:20, 6: 8:20–9:00), con il solo totale si divide il totale.
 * Se una delle fasi non ha un tempo previsto si divide in parti uguali. Le righe già ripartite non si toccano.
 * `numeriFasi`: numero stampato sulla scheda → codice (prima le fasi della commessa, poi le altre del catalogo).
 */
export function ripartisciFasiInsieme<T extends RigaDaRipartire>(righe: T[], fasi: FasePerRipartire[], numeriFasi: Map<string, string>):
  { righe: T[]; ripartite: { riga: number; fasi: string }[] } {
  const previsto = new Map(fasi.map(f => [f.codice, f.cicloSec]));
  const out: T[] = [], ripartite: { riga: number; fasi: string }[] = [];
  righe.forEach(r => {
    const campo = r.tipo === 'P' ? 'causa' : 'note';
    const testoNote = String(r[campo] ?? '');
    const m = SEGNO_INSIEME.exec(testoNote.toUpperCase());
    const codici = m && !GIA_RIPARTITA.test(testoNote.toUpperCase())
      ? [...new Set(m[1].split('+').filter(Boolean).map(n => numeriFasi.get(n)))] : [];
    const haOre = !!(r.inizio && r.fine);
    const totale = haOre ? minutiTra(r.inizio!, r.fine!) : Math.round(r.durataMin ?? 0);
    if (codici.length < 2 || codici.some(c => !c) || !codici.includes(r.fase) || !(totale > 0)) { out.push(r); return; }
    // la fase scelta sulla riga resta la prima, le altre nell'ordine scritto
    const ordine = [r.fase, ...codici.filter(c => c !== r.fase)] as string[];
    const pesi = ordine.map(c => previsto.get(c) ?? 0);
    const proporzione = pesi.every(p => p > 0);
    const minuti = dividiMinuti(totale, proporzione ? pesi : pesi.map(() => 1));
    const scritti = r.totaleScrittoMin != null ? dividiMinuti(Math.round(r.totaleScrittoMin), proporzione ? pesi : pesi.map(() => 1)) : undefined;
    const nota = testoNote.replace(/FASI ([A-Z0-9+]+) INSIEME/i, x =>
      `${x}: ${durata(totale)} RIPARTITI ${proporzione ? 'COME DA PREVENTIVO' : 'IN PARTI UGUALI'}`);
    ripartite.push({ riga: out.length, fasi: m![1] });
    let da = r.inizio;
    ordine.forEach((codice, k) => {
      const riga = { ...r, fase: codice, [campo]: nota } as T;
      if (haOre) { riga.inizio = da; riga.fine = k === ordine.length - 1 ? r.fine : oraPiu(da!, minuti[k]); da = riga.fine; }
      else riga.durataMin = minuti[k];
      if (scritti) riga.totaleScrittoMin = scritti[k];
      out.push(riga);
    });
  });
  return { righe: out, ripartite };
}

const minutiTra = (da: string, a: string) => {
  const t = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  const d = t(a) - t(da);
  return d < 0 ? d + 1440 : d;
};
