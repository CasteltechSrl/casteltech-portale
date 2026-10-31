/**
 * Prezzo del prodotto a scaglioni di quantità (Adriano 31/10/2026): "da 1 a 5 pz costa 10 €, da 6 a 20 pz 8 €…".
 * Gli scaglioni sono facoltativi: se non ci sono vale il prezzo unico per tutte le quantità.
 * Quando in una fattura, nota di credito o DDT si scrivono codice e quantità, il portale prende da solo il prezzo giusto.
 * Nessun accesso al database.
 */

export interface Scaglione { da: number; a: number | null; prezzo: number }

const numero = (s: string) => Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
const nf = (n: number) => new Intl.NumberFormat('it-IT', { maximumFractionDigits: 5 }).format(n);

/**
 * Legge gli scaglioni scritti in una casella: "1-5=10; 6-20=8; 21+=7" (anche con "€", "pz", a capo o "oltre 20").
 * Restituisce gli scaglioni in ordine e gli errori in parole semplici.
 */
export function leggiScaglioni(testo: unknown): { scaglioni: Scaglione[]; errori: string[] } {
  const errori: string[] = [];
  const scaglioni: Scaglione[] = [];
  const pezzi = String(testo ?? '').split(/[;\n]+/).map(s => s.trim()).filter(Boolean);
  for (const p of pezzi) {
    let t = p.toLowerCase().replace(/€|euro|pz\.?|pezzi|cad\.?/g, ' ').replace(/\s+/g, ' ').trim();
    // "oltre 20 = 7" = "21+ = 7"
    t = t.replace(/^oltre\s*(\d+)/, (_x, n) => `${Number(n) + 1}+`);
    const m = /^(?:da\s*)?(\d+)\s*(?:(?:-|–|a)\s*(\d+)|(\+|e oltre|oltre))?\s*[=:]\s*([\d.,]+)$/.exec(t);
    if (!m) { errori.push(`"${p}" non si capisce: scrivi ad esempio 1-5=10; 6-20=8; 21+=7.`); continue; }
    const da = Number(m[1]), a = m[2] ? Number(m[2]) : null, prezzo = numero(m[4]);
    if (!(da >= 1)) errori.push(`"${p}": la quantità parte da 1.`);
    if (a != null && a < da) errori.push(`"${p}": la quantità finale è più piccola di quella iniziale.`);
    if (!Number.isFinite(prezzo) || prezzo < 0) errori.push(`"${p}": prezzo non valido.`);
    if (a == null && !m[3]) { scaglioni.push({ da, a: da, prezzo }); continue; }   // "10=7": solo quella quantità
    scaglioni.push({ da, a, prezzo });
  }
  scaglioni.sort((x, y) => x.da - y.da);
  for (let i = 1; i < scaglioni.length; i++) {
    const prima = scaglioni[i - 1], ora = scaglioni[i];
    if (prima.a == null || prima.a >= ora.da) errori.push(`Gli scaglioni ${scrivi([prima])} e ${scrivi([ora])} si sovrappongono.`);
  }
  return { scaglioni, errori };
}

/** Scaglioni riscritti nella forma della casella: "1-5=10; 6-20=8; 21+=7". */
export function scrivi(scaglioni: Scaglione[]): string {
  return scaglioni.map(s => `${s.da}${s.a == null ? '+' : s.a === s.da ? '' : `-${s.a}`}=${nf(s.prezzo)}`).join('; ');
}

/**
 * Prezzo per una quantità: lo scaglione che la contiene; tra uno scaglione e l'altro (es. 1-5 e 10-20, quantità 7) vale
 * l'ultimo scaglione che parte prima; sotto il primo scaglione o senza scaglioni vale il prezzo unico (se c'è, altrimenti il primo).
 */
export function prezzoPerQuantita(prezzoUnico: number | null, scaglioni: Scaglione[], quantita: number): { prezzo: number | null; scaglione: Scaglione | null } {
  const ordinati = [...scaglioni].sort((x, y) => x.da - y.da);
  const q = Number(quantita) > 0 ? Number(quantita) : 1;
  const dentro = ordinati.find(s => q >= s.da && (s.a == null || q <= s.a));
  if (dentro) return { prezzo: dentro.prezzo, scaglione: dentro };
  const prima = ordinati.filter(s => s.da <= q).pop();
  if (prima) return { prezzo: prima.prezzo, scaglione: prima };
  if (prezzoUnico != null) return { prezzo: prezzoUnico, scaglione: null };
  return ordinati.length ? { prezzo: ordinati[0].prezzo, scaglione: ordinati[0] } : { prezzo: null, scaglione: null };
}
