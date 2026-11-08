/**
 * Fatture anticipate dalla banca (Adriano 7/11/2026): "le RiBa sono anticipate al 100%, i bonifici all'80%,
 * così sappiamo quello che ci viene anticipato e quello che ci arriva quando incassiamo".
 *
 * Si ricavano dai movimenti dei conti tecnici di anticipo (BPER):
 * - bonifico (anticipo Italia / estero): "ANTICIPO SU DOCUMENTI FT. 108 + 98" apre l'anticipo delle fatture citate,
 *   "RIENTRO ANTICIPO/FINANZIAMENTO ... N 81/2026" o "FT. 80 + 74" lo chiude. Quota anticipata = 80 % di quanto resta da incassare.
 *   Quando il cliente paga, sul conto arriva il 100 % e la banca riprende la quota anticipata: resta il 20 %.
 * - RiBa al salvo buon fine: "ACCREDITO RIBA AL SBF" sul conto anticipo RiBa, un accredito per effetto con il suo importo.
 *   La rata è già stata accreditata al 100 %: alla scadenza non arriva altro (salvo insoluto).
 */

export interface MovimentoAnticipo { data: string; importo: number; descrizione: string; conto: string }
export interface RataDaIncassare { id: number; numero: string; dataDoc: string; scadenza: string; importo: number; riba?: boolean }

/** Quota anticipata dalla banca sui bonifici (Adriano 7/11/2026). */
export const QUOTA_BONIFICO = 0.8;

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Numeri di fattura citati: "FT. 108 + 98", "ft. 95/2026", "FT.155 DEL 30.12.25", "N 81/2026", "FATT. 119", "fatture 41 e 42". */
export function numeriCitati(descrizione: string): string[] {
  let d = norm(descrizione)
    .replace(/\bdel\s*\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/g, ' ')    // date
    .replace(/\d{1,2}[./]\d{1,2}[./]\d{2,4}/g, ' ')
    .replace(/(\d+)\s*\/\s*20\d\d/g, '$1 ')                     // 95/2026 → 95
    .replace(/\b20\d\d\b/g, ' ');
  // solo la parte dopo la parola chiave (anticipo su documenti / rientro anticipo/finanziamento)
  d = d.replace(/^.*?(anticipo su documenti|rientro anticipo\/finanziamento)/, '');
  const numeri = [...d.matchAll(/(?:^|[^a-z0-9])(\d{1,4})(?:\.?bis)?(?=[^0-9]|$)/g)].map(x => String(Number(x[1])));
  return [...new Set(numeri.filter(n => n !== '0'))];
}

export const eAnticipo = (descrizione: string) => /anticipo su documenti/.test(norm(descrizione));
export const eRientro = (descrizione: string) => /rientro anticipo/.test(norm(descrizione));
export const eAccreditoRiba = (descrizione: string) => /accredito riba al sbf/.test(norm(descrizione));

export interface Anticipata {
  numero: string;
  tipo: 'bonifico' | 'riba';
  data: string;                 // data dell'anticipo (o dell'accredito RiBa)
  rate: { id: number; scadenza: string; importo: number; anticipato: number }[];
  anticipato: number;           // quota anticipata ancora aperta (che la banca riprende all'incasso)
  pagata: boolean;              // fattura già incassata ma anticipo non ancora rientrato
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Fatture oggi anticipate. `movimenti` = movimenti dei conti tecnici di anticipo; `rate` = rate ancora da incassare.
 * Bonifico: ultima citazione della fattura = anticipo → anticipata (80 % del residuo; se la fattura non ha più rate aperte, l'anticipo
 * è ancora da rientrare: la banca lo riprenderà). RiBa: rate RiBa aperte con lo stesso importo di un "ACCREDITO RIBA AL SBF" arrivato prima della scadenza.
 */
export function fattureAnticipate(movimenti: MovimentoAnticipo[], rate: RataDaIncassare[], oggi: string): { anticipate: Anticipata[]; daRientrare: { numero: string; data: string; importo: number }[] } {
  const ordinati = [...movimenti].sort((a, b) => a.data.localeCompare(b.data));
  // bonifico: ultimo evento per numero di fattura
  const ultimo = new Map<string, { tipo: 'anticipo' | 'rientro'; data: string; importo: number; quante: number }>();
  for (const m of ordinati) {
    const anticipo = eAnticipo(m.descrizione), rientro = eRientro(m.descrizione);
    if (!anticipo && !rientro) continue;
    const numeri = numeriCitati(m.descrizione);
    for (const n of numeri) ultimo.set(n, { tipo: anticipo ? 'anticipo' : 'rientro', data: m.data, importo: Math.abs(m.importo), quante: numeri.length });
    // la banca a volte scrive nel rientro un numero sbagliato (es. "N 2" per l'anticipo della FT 5): un rientro con lo stesso importo
    // di un anticipo di una sola fattura ancora aperto lo chiude
    if (rientro) for (const [n, e] of ultimo)
      if (e.tipo === 'anticipo' && e.quante === 1 && !numeri.includes(n) && Math.abs(e.importo - Math.abs(m.importo)) < 0.005) { ultimo.set(n, { ...e, tipo: 'rientro', data: m.data }); break; }
  }
  const perNumero = new Map<string, RataDaIncassare[]>();
  for (const r of rate) {
    const n = String(Number(String(r.numero).replace(/\/.*$/, '')));
    // stesso numero in anni diversi: vale la fattura più recente
    const gia = perNumero.get(n);
    if (gia && gia[0].dataDoc > r.dataDoc) continue;
    perNumero.set(n, gia && gia[0].dataDoc === r.dataDoc ? [...gia, r] : [r]);
  }
  const anticipate: Anticipata[] = [];
  const daRientrare: { numero: string; data: string; importo: number }[] = [];
  for (const [n, e] of ultimo) {
    if (e.tipo !== 'anticipo') continue;
    const aperte = (perNumero.get(n) ?? []).filter(r => r.dataDoc <= e.data);
    if (!aperte.length) {
      // fattura già incassata (o non trovata) e anticipo non rientrato: se l'anticipo era di una sola fattura si sa l'importo
      if (e.quante === 1) daRientrare.push({ numero: n, data: e.data, importo: r2(e.importo) });
      continue;
    }
    const rateA = aperte.map(r => ({ id: r.id, scadenza: r.scadenza, importo: r.importo, anticipato: r2(r.importo * QUOTA_BONIFICO) }));
    anticipate.push({ numero: n, tipo: 'bonifico', data: e.data, rate: rateA, anticipato: r2(rateA.reduce((s, r) => s + r.anticipato, 0)), pagata: false });
  }
  // RiBa al salvo buon fine: ogni accredito è un effetto
  const accrediti = ordinati.filter(m => eAccreditoRiba(m.descrizione) && m.importo > 0);
  const prese = new Set<number>();
  for (const a of accrediti) {
    // prima le rate RiBa, poi le altre con lo stesso importo (in anagrafica il pagamento a volte non dice RiBa)
    const r = rate.filter(x => !prese.has(x.id) && Math.abs(x.importo - a.importo) < 0.005 && x.scadenza >= a.data && x.dataDoc <= a.data)
      .sort((x, y) => Number(!!y.riba) - Number(!!x.riba) || x.scadenza.localeCompare(y.scadenza))[0];
    if (!r) continue;
    prese.add(r.id);
    anticipate.push({ numero: String(r.numero), tipo: 'riba', data: a.data, rate: [{ id: r.id, scadenza: r.scadenza, importo: r.importo, anticipato: r.importo }],
      anticipato: r.importo, pagata: false });
  }
  void oggi;
  return { anticipate: anticipate.sort((a, b) => a.data.localeCompare(b.data)), daRientrare };
}

/**
 * Storico degli anticipi fattura per fattura (Adriano 8/11/2026, "guardando le fatture voglio capire quelle anticipate con bonifico o RiBa"):
 * anche le fatture già incassate. Bonifico: ogni "ANTICIPO SU DOCUMENTI" apre un anticipo per le fatture citate (stesso numero, data della
 * fattura entro l'anno prima dell'anticipo, la più recente), il "RIENTRO ANTICIPO" che le cita lo chiude (numero sbagliato della banca:
 * chiude l'anticipo aperto di una sola fattura con lo stesso importo). RiBa: ogni "ACCREDITO RIBA AL SBF" = una rata con lo stesso importo,
 * fattura emessa prima, scadenza dopo l'accredito (entro 200 giorni), prima le rate RiBa.
 */
export interface FatturaPerAnticipi {
  id: number; numero: string; data: string;
  rate: { id: number; scadenza: string; importo: number; riba?: boolean; pagata?: string | null }[];
}
export interface AnticipoFattura {
  tipo: 'bonifico' | 'riba';
  data: string;                 // giorno dell'anticipo (o dell'accredito RiBa)
  importo: number | null;       // anticipato dalla banca (bonifico con più fatture insieme: non si sa per ognuna)
  insieme: string[];            // altre fatture dello stesso anticipo
  rientro: string | null;       // bonifico: giorno in cui la banca l'ha ripreso
  scadenza: string | null;      // RiBa: scadenza della rata anticipata
  incassata: boolean;           // bonifico non rientrato ma fattura già tutta incassata: il rientro non si riconosce nei movimenti
}

const piuGiorni = (d: string, n: number) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const numeroBase = (n: string) => String(Number(String(n).replace(/\/.*$/, '')));

export function anticipiDelleFatture(movimenti: MovimentoAnticipo[], fatture: FatturaPerAnticipi[]): Map<number, AnticipoFattura[]> {
  const esito = new Map<number, AnticipoFattura[]>();
  const aggiungi = (id: number, a: AnticipoFattura) => esito.set(id, [...(esito.get(id) ?? []), a]);
  const perNumero = new Map<string, FatturaPerAnticipi[]>();
  for (const f of fatture) { const n = numeroBase(f.numero); perNumero.set(n, [...(perNumero.get(n) ?? []), f]); }
  const trova = (n: string, giorno: string) => (perNumero.get(n) ?? [])
    .filter(f => f.data <= giorno && f.data >= piuGiorni(giorno, -365)).sort((a, b) => b.data.localeCompare(a.data))[0];

  const totaleFattura = new Map(fatture.map(f => [f.id, f.rate.reduce((t, r) => t + r.importo, 0)]));
  const ordinati = [...movimenti].sort((a, b) => a.data.localeCompare(b.data));
  type Gruppo = { totale: number; rientrato: number };   // un movimento di anticipo, anche di più fatture
  const aperti: { fattura: number; a: AnticipoFattura; g: Gruppo }[] = [];
  for (const m of ordinati) {
    const anticipo = eAnticipo(m.descrizione), rientro = eRientro(m.descrizione);
    if (!anticipo && !rientro) continue;
    const numeri = numeriCitati(m.descrizione);
    if (anticipo) {
      const g: Gruppo = { totale: Math.abs(m.importo), rientrato: 0 };
      for (const n of numeri) {
        const f = trova(n, m.data);
        if (!f) continue;
        const a: AnticipoFattura = { tipo: 'bonifico', data: m.data, importo: numeri.length === 1 ? r2(Math.abs(m.importo)) : null,
          insieme: numeri.filter(x => x !== n), rientro: null, scadenza: null, incassata: false };
        aggiungi(f.id, a);
        aperti.push({ fattura: f.id, a, g });
      }
      continue;
    }
    const importo = Math.abs(m.importo);
    const toccati = new Set<Gruppo>();
    for (const n of numeri) {
      const f = trova(n, m.data);
      const ap = f && [...aperti].reverse().find(x => x.fattura === f.id && !x.a.rientro);
      if (ap) { ap.a.rientro = m.data; toccati.add(ap.g); }
    }
    if (!toccati.size) {
      // numero sbagliato o assente ("RIENTRO SU ANT FATTURA IN SCADENZA 30.04.26", "GALILEO … N 18" per la FT 20 anticipata con la 14):
      // stesso importo dell'anticipo, quanto resta di un anticipo di più fatture (già rientrato in parte, o tolto l'80 % delle altre), o 80 % della fattura
      const unaSola = (x: typeof aperti[number]) => aperti.filter(y => y.g === x.g && !y.a.rientro).length === 1;
      const ap = aperti.find(x => !x.a.rientro && x.a.importo != null && Math.abs(x.a.importo - importo) < 0.005)
        ?? aperti.find(x => !x.a.rientro && x.a.importo == null && unaSola(x) && x.g.rientrato > 0 && Math.abs(x.g.totale - x.g.rientrato - importo) < 0.015)
        ?? aperti.find(x => !x.a.rientro && x.a.importo == null
          && Math.abs(x.g.totale - aperti.filter(y => y.g === x.g && y !== x).reduce((t, y) => t + totaleFattura.get(y.fattura)! * QUOTA_BONIFICO, 0) - importo) < 0.015)
        ?? aperti.find(x => !x.a.rientro && Math.abs(r2(totaleFattura.get(x.fattura)! * QUOTA_BONIFICO) - importo) < 0.015);
      if (ap) { ap.a.rientro = m.data; toccati.add(ap.g); }
    }
    for (const g of toccati) g.rientrato = r2(g.rientrato + importo / toccati.size);
  }
  for (const { fattura, a } of aperti) {
    const f = fatture.find(x => x.id === fattura);
    if (!a.rientro && f?.rate.length && f.rate.every(r => r.pagata)) a.incassata = true;
  }

  const prese = new Set<number>();
  const rate = fatture.flatMap(f => f.rate.map(r => ({ ...r, fattura: f.id, dataDoc: f.data })));
  for (const a of ordinati.filter(m => eAccreditoRiba(m.descrizione) && m.importo > 0)) {
    const r = rate.filter(x => !prese.has(x.id) && Math.abs(x.importo - a.importo) < 0.005 && x.scadenza >= a.data
        && x.scadenza <= piuGiorni(a.data, 200) && x.dataDoc <= a.data)
      .sort((x, y) => Number(!!y.riba) - Number(!!x.riba) || x.scadenza.localeCompare(y.scadenza))[0];
    if (!r) continue;
    prese.add(r.id);
    aggiungi(r.fattura, { tipo: 'riba', data: a.data, importo: r2(a.importo), insieme: [], rientro: null, scadenza: r.scadenza, incassata: false });
  }
  return esito;
}

/** Testo breve per l'elenco: "RiBa", "bonifico", "bonifico (rientrato)". */
export function segnoAnticipo(a: AnticipoFattura[] | undefined): { testo: string; titolo: string } | null {
  if (!a?.length) return null;
  const tipi = [...new Set(a.map(x => x.tipo === 'riba' ? 'RiBa' : 'bonifico'))];
  const dataIt = (d: string) => d.split('-').reverse().join('/');
  return { testo: tipi.join(' + '), titolo: a.map(x => x.tipo === 'riba'
    ? `RiBa anticipata il ${dataIt(x.data)}${x.importo != null ? ` (${x.importo.toFixed(2).replace('.', ',')} €)` : ''}, scadenza ${x.scadenza ? dataIt(x.scadenza) : ''}`
    : `Anticipo con bonifico del ${dataIt(x.data)}${x.rientro ? `, rientrato il ${dataIt(x.rientro)}` : x.incassata ? ', fattura incassata (rientro non riconosciuto)' : ', ancora aperto'}`).join('; ') };
}
