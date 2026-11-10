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
    .replace(/\b20\d\d\b/g, ' ')
    .replace(/(^|[^a-z])(ft|fatt?|nr?)\.?(\d)/g, '$1$2 $3');          // "FT51" = "FT 51"
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
 *
 * Controllo del 9/11/2026 (Adriano: "in anticipo secondo me mancano dei dati"), con i movimenti veri:
 * - la banca anticipa anche fatture con la data di qualche giorno dopo (FT 91+92 del 17/8 anticipate il 14/8): fattura fino a 20 giorni dopo;
 * - "FT51 +54": numero attaccato a FT;
 * - l'anticipo è l'80 % del totale delle fatture: se le fatture citate non tornano (la banca scrive "FT.14 +20" per la 14 + 18, "ft.4/2026"
 *   per la 64, "ft" senza numero per la 74 + 75) si cercano le fatture del periodo, non ancora anticipate né incassate, che danno
 *   esattamente quell'importo (una sola combinazione possibile, preferita quella con i numeri citati); senza numero ma con il nome del
 *   cliente ("ft cablesteel") vale l'unica fattura di quel cliente ancora libera;
 * - il rientro che cita una fattura senza anticipo e chiude per importo l'anticipo di un'altra ("FT. 05" rientrato come "SELEA N 2"): l'anticipo
 *   passa alla fattura citata nel rientro;
 * - rientri di fatture anticipate prima del primo movimento caricato (dicembre 2025): anticipo "prima dei movimenti";
 * - RiBa con più fatture in un effetto (Trancerie 72 + 82 = 1.159 €) o più effetti in un accredito ("NUM.EFF. 00002": 122 + 125): rate RiBa con la
 *   stessa scadenza che sommate danno l'importo.
 */
export interface FatturaPerAnticipi {
  id: number; numero: string; data: string; cliente?: string | null;
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
  prima?: boolean;              // anticipo fatto prima del primo movimento caricato (si vede solo il rientro)
  numeroBanca?: string;         // la banca ha scritto un altro numero (riconosciuta dall'importo)
}

const piuGiorni = (d: string, n: number) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const numeroBase = (n: string) => String(Number(String(n).replace(/\/.*$/, '')));
/** Giorni di tolleranza: la banca anticipa anche fatture con la data di qualche giorno dopo il movimento. */
export const GIORNI_DOPO = 20;
/** Fatture cercate per importo: emesse fino a 75 giorni prima dell'anticipo. */
const GIORNI_PRIMA = 75;

const PAROLE_VUOTE = new Set(['anticipo', 'documenti', 'fattura', 'fatture', 'rientro', 'finanziamento', 'scadenza', 'accredito', 'bonifico', 'parziale', 'acconto']);
const paroleNome = (s: string) => norm(s).split(/[^a-z]+/).filter(w => w.length >= 5 && !PAROLE_VUOTE.has(w));

/** Combinazioni di fatture (al massimo `max`) il cui valore × quota dà l'importo; si ferma oltre `limite` combinazioni trovate. */
function combinazioni<T>(elementi: { x: T; v: number }[], obiettivo: number, tolleranza: (k: number) => number, max: number, limite = 5): T[][] {
  const ordinati = [...elementi].sort((a, b) => b.v - a.v);
  const trovate: T[][] = [];
  const scelti: { x: T; v: number }[] = [];
  const giro = (da: number, somma: number) => {
    if (trovate.length >= limite) return;
    if (scelti.length && Math.abs(somma - obiettivo) <= tolleranza(scelti.length)) trovate.push(scelti.map(s => s.x));
    if (scelti.length >= max) return;
    for (let i = da; i < ordinati.length; i++) {
      if (somma + ordinati[i].v > obiettivo + tolleranza(scelti.length + 1)) continue;
      scelti.push(ordinati[i]); giro(i + 1, somma + ordinati[i].v); scelti.pop();
    }
  };
  giro(0, 0);
  return trovate;
}

export function anticipiDelleFatture(movimenti: MovimentoAnticipo[], fatture: FatturaPerAnticipi[]): Map<number, AnticipoFattura[]> {
  const esito = new Map<number, AnticipoFattura[]>();
  const aggiungi = (id: number, a: AnticipoFattura) => esito.set(id, [...(esito.get(id) ?? []), a]);
  const togli = (id: number, a: AnticipoFattura) => { const l = (esito.get(id) ?? []).filter(x => x !== a); if (l.length) esito.set(id, l); else esito.delete(id); };
  const perNumero = new Map<string, FatturaPerAnticipi[]>();
  for (const f of fatture) { const n = numeroBase(f.numero); perNumero.set(n, [...(perNumero.get(n) ?? []), f]); }
  const trova = (n: string, giorno: string) => (perNumero.get(n) ?? [])
    .filter(f => f.data <= piuGiorni(giorno, GIORNI_DOPO) && f.data >= piuGiorni(giorno, -365)).sort((a, b) => b.data.localeCompare(a.data))[0];
  const perId = new Map(fatture.map(f => [f.id, f]));

  const totaleFattura = new Map(fatture.map(f => [f.id, r2(f.rate.reduce((t, r) => t + r.importo, 0))]));
  const incassataPrima = (f: FatturaPerAnticipi, giorno: string) => f.rate.length > 0 && f.rate.every(r => r.pagata && r.pagata <= giorno);
  const daIncassareDopo = (f: FatturaPerAnticipi, giorno: string) => f.rate.filter(r => r.scadenza >= giorno).reduce((t, r) => t + r.importo, 0);
  const tolleranza = (k: number) => 0.015 * k + 0.01;
  const ordinati = [...movimenti].sort((a, b) => a.data.localeCompare(b.data));
  const primoGiorno = ordinati[0]?.data ?? '';
  type Gruppo = { totale: number; rientrato: number };   // un movimento di anticipo, anche di più fatture
  const aperti: { fattura: number; a: AnticipoFattura; g: Gruppo }[] = [];
  const apertaOra = (id: number) => aperti.some(x => x.fattura === id && !x.a.rientro);
  for (const m of ordinati) {
    const anticipo = eAnticipo(m.descrizione), rientro = eRientro(m.descrizione);
    if (!anticipo && !rientro) continue;
    const numeri = numeriCitati(m.descrizione);
    const importo = Math.abs(m.importo);
    if (anticipo) {
      let citate = numeri.map(n => trova(n, m.data)).filter((f): f is FatturaPerAnticipi => !!f);
      const quota = (fs: FatturaPerAnticipi[], v: (f: FatturaPerAnticipi) => number) => QUOTA_BONIFICO * fs.reduce((t, f) => t + v(f), 0);
      const tornano = citate.length === numeri.length && citate.length > 0
        && (Math.abs(quota(citate, f => totaleFattura.get(f.id)!) - importo) <= tolleranza(citate.length)
          || Math.abs(quota(citate, f => daIncassareDopo(f, m.data)) - importo) <= tolleranza(citate.length));
      const diverse = new Set<number>();
      if (!tornano) {
        let candidati = fatture.filter(f => f.rate.length && f.data <= piuGiorni(m.data, GIORNI_DOPO) && f.data >= piuGiorni(m.data, -GIORNI_PRIMA)
          && !incassataPrima(f, m.data) && !apertaOra(f.id));
        const nome = paroleNome(m.descrizione.replace(/^.*?anticipo su documenti/i, ''));
        const delCliente = nome.length ? candidati.filter(f => paroleNome(f.cliente ?? '').some(w => nome.includes(w))) : [];
        if (delCliente.length) candidati = delCliente;
        const prove = combinazioni(candidati.map(f => ({ x: f, v: QUOTA_BONIFICO * totaleFattura.get(f.id)! })), importo, tolleranza,
          candidati.length > 30 ? 3 : 5);
        const citateId = new Set(citate.map(f => f.id));
        const comuni = (c: FatturaPerAnticipi[]) => c.filter(f => citateId.has(f.id)).length;
        const migliore = Math.max(-1, ...prove.map(comuni));
        const buone = prove.filter(c => comuni(c) === migliore);
        const lontane = !citate.length || citate.length < numeri.length || citate.every(f => incassataPrima(f, m.data))
          || Math.abs(quota(citate, f => totaleFattura.get(f.id)!) - importo) > importo * 0.2;
        if (buone.length === 1 && (migliore > 0 || lontane)) {
          for (const f of buone[0]) if (!citateId.has(f.id)) diverse.add(f.id);
          citate = buone[0].sort((a, b) => a.data.localeCompare(b.data) || Number(a.numero) - Number(b.numero));
        } else if (!citate.length && delCliente.length) {
          // "ft cablesteel": l'unica fattura del cliente ancora libera (se più d'una, l'unica mai anticipata)
          let libere = delCliente.length === 1 ? delCliente : delCliente.filter(f => !esito.has(f.id));
          if (libere.length > 1) libere = libere.filter(f => f.data <= m.data);
          if (libere.length === 1) { citate = libere; diverse.add(libere[0].id); }
        }
      }
      const g: Gruppo = { totale: importo, rientrato: 0 };
      const numeriFatture = citate.map(f => numeroBase(f.numero));
      for (const f of citate) {
        const n = numeroBase(f.numero);
        const a: AnticipoFattura = { tipo: 'bonifico', data: m.data, importo: citate.length === 1 ? r2(importo) : null,
          insieme: numeriFatture.filter(x => x !== n), rientro: null, scadenza: null, incassata: false };
        if (diverse.has(f.id)) a.numeroBanca = numeri.join(' + ') || '—';
        aggiungi(f.id, a);
        aperti.push({ fattura: f.id, a, g });
      }
      continue;
    }
    const toccati = new Set<Gruppo>();
    for (const n of numeri) {
      const f = trova(n, m.data);
      const ap = f && [...aperti].reverse().find(x => x.fattura === f.id && !x.a.rientro);
      if (ap) { ap.a.rientro = m.data; toccati.add(ap.g); }
    }
    if (!toccati.size) {
      // numero sbagliato o assente ("RIENTRO SU ANT FATTURA IN SCADENZA 30.04.26"): stesso importo dell'anticipo, quanto resta di un anticipo
      // di più fatture (già rientrato in parte, o tolto l'80 % delle altre), o 80 % della fattura
      const unaSola = (x: typeof aperti[number]) => aperti.filter(y => y.g === x.g && !y.a.rientro).length === 1;
      const ap = aperti.find(x => !x.a.rientro && x.a.importo != null && Math.abs(x.a.importo - importo) < 0.005)
        ?? aperti.find(x => !x.a.rientro && x.a.importo == null && unaSola(x) && x.g.rientrato > 0 && Math.abs(x.g.totale - x.g.rientrato - importo) < 0.015)
        ?? aperti.find(x => !x.a.rientro && x.a.importo == null
          && Math.abs(x.g.totale - aperti.filter(y => y.g === x.g && y !== x).reduce((t, y) => t + totaleFattura.get(y.fattura)! * QUOTA_BONIFICO, 0) - importo) < 0.015)
        ?? aperti.find(x => !x.a.rientro && Math.abs(r2(totaleFattura.get(x.fattura)! * QUOTA_BONIFICO) - importo) < 0.015);
      if (ap) {
        ap.a.rientro = m.data; toccati.add(ap.g);
        // l'anticipo era scritto con un numero sbagliato: il rientro cita la fattura giusta, che non ha anticipi
        const giusta = numeri.length === 1 ? trova(numeri[0], m.data) : undefined;
        if (giusta && giusta.id !== ap.fattura && ap.a.importo != null && !esito.has(giusta.id) && giusta.data <= piuGiorni(ap.a.data, GIORNI_DOPO)) {
          togli(ap.fattura, ap.a);
          ap.a.numeroBanca = numeroBase(perId.get(ap.fattura)!.numero);
          ap.fattura = giusta.id;
          aggiungi(giusta.id, ap.a);
        }
      } else {
        // fatture anticipate prima dei movimenti caricati: si vede solo il rientro
        for (const n of numeri) {
          const f = trova(n, m.data);
          if (f && f.data < primoGiorno && !esito.has(f.id))
            aggiungi(f.id, { tipo: 'bonifico', data: primoGiorno, importo: null, insieme: [], rientro: m.data, scadenza: null, incassata: false, prima: true });
        }
      }
    }
    for (const g of toccati) g.rientrato = r2(g.rientrato + importo / toccati.size);
  }
  for (const { fattura, a } of aperti) {
    const f = perId.get(fattura);
    if (!a.rientro && f?.rate.length && f.rate.every(r => r.pagata)) a.incassata = true;
  }

  // RiBa al salvo buon fine: un accredito = una rata, o più rate RiBa con la stessa scadenza (stesso effetto o più effetti nello stesso accredito)
  const prese = new Set<number>();
  const rate = fatture.flatMap(f => f.rate.map(r => ({ ...r, fattura: f.id, dataDoc: f.data })));
  for (const a of ordinati.filter(m => eAccreditoRiba(m.descrizione) && m.importo > 0)) {
    const libere = rate.filter(x => !prese.has(x.id) && x.scadenza >= a.data && x.scadenza <= piuGiorni(a.data, 200) && x.dataDoc <= a.data);
    const r = libere.filter(x => Math.abs(x.importo - a.importo) < 0.005)
      .sort((x, y) => Number(!!y.riba) - Number(!!x.riba) || x.scadenza.localeCompare(y.scadenza))[0];
    let scelte = r ? [r] : [];
    if (!scelte.length) {
      const perScadenza = new Map<string, typeof libere>();
      for (const x of libere.filter(x => x.riba)) perScadenza.set(x.scadenza, [...(perScadenza.get(x.scadenza) ?? []), x]);
      const prove = [...perScadenza.values()].flatMap(gr => combinazioni(gr.map(x => ({ x, v: x.importo })), a.importo, () => 0.005, 4))
        .filter(c => c.length > 1);
      if (prove.length === 1) scelte = prove[0];
    }
    for (const x of scelte) {
      prese.add(x.id);
      const altri = scelte.filter(y => y.fattura !== x.fattura).map(y => numeroBase(perId.get(y.fattura)!.numero));
      aggiungi(x.fattura, { tipo: 'riba', data: a.data, importo: r2(x.importo), insieme: [...new Set(altri)], rientro: null, scadenza: x.scadenza, incassata: false });
    }
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
    : `${x.prima ? `Anticipo con bonifico fatto prima del ${dataIt(x.data)}` : `Anticipo con bonifico del ${dataIt(x.data)}`}${x.numeroBanca === '—' ? ' (la banca non ha scritto il numero: riconosciuta dall\'importo o dal cliente)' : x.numeroBanca ? ` (la banca ha scritto FT ${x.numeroBanca})` : ''}${x.rientro ? `, rientrato il ${dataIt(x.rientro)}` : x.incassata ? ', fattura incassata (rientro non riconosciuto)' : ', ancora aperto'}`).join('; ') };
}

/**
 * Stato dell'incasso di una fattura (Adriano 9/11/2026: "nel momento in cui la fattura è stata incassata, vorrei vedere incassata"),
 * colonna "Incasso" dell'elenco Fatture: incassata (data dell'ultima rata) / in parte / scaduta / da incassare, con il movimento della banca
 * che ha pagato ogni rata (abbinamento di Amministrazione → Banca), altrimenti "segnata nel portale o da Fatture in Cloud".
 */
export interface RataIncasso { scadenza: string; importo: number; pagata: string | null; modo?: string | null; movimento?: { data: string; conto: string } | null }
export interface StatoIncasso { stato: 'incassata' | 'in_parte' | 'scaduta' | 'da_incassare'; testo: string; titolo: string; data: string | null }

const euroIt = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const dataBreve = (d: string) => d.split('-').reverse().join('/');

export function statoIncasso(rate: RataIncasso[], oggi: string): StatoIncasso | null {
  if (!rate.length) return null;
  const pagate = rate.filter(r => r.pagata), aperte = rate.filter(r => !r.pagata);
  const riga = (r: RataIncasso) => r.pagata
    ? `${euroIt(r.importo)} incassati il ${dataBreve(r.pagata)}${r.movimento ? ` (movimento di banca del ${dataBreve(r.movimento.data)}, ${r.movimento.conto})` : r.modo ? ` (${r.modo})` : ' (segnata nel portale o da Fatture in Cloud)'}`
    : `${euroIt(r.importo)} da incassare, scadenza ${dataBreve(r.scadenza)}${r.scadenza < oggi ? ' (scaduta)' : ''}`;
  const titolo = rate.map(riga).join('; ');
  if (!aperte.length) {
    const ultima = pagate.map(r => r.pagata!).sort().at(-1)!;
    return { stato: 'incassata', testo: `incassata ${dataBreve(ultima)}`, titolo, data: ultima };
  }
  if (aperte.some(r => r.scadenza < oggi)) return { stato: 'scaduta', testo: pagate.length ? `in parte, scaduta (restano ${euroIt(aperte.reduce((t, r) => t + r.importo, 0))})` : 'scaduta', titolo, data: null };
  if (pagate.length) {
    const resta = aperte.reduce((t, r) => t + r.importo, 0);
    return { stato: 'in_parte', testo: `in parte, restano ${euroIt(resta)}`, titolo, data: null };
  }
  return { stato: 'da_incassare', testo: 'da incassare', titolo, data: null };
}
