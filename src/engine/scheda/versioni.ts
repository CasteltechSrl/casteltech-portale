/**
 * Più versioni della stessa scheda in una richiesta (Adriano 29/10/2026, RFQ M0929-C: "167pz versione HELIOS, 90pz versione CRONOS",
 * stessa PCB, componenti diversi). Dal testo della mail si leggono quantità e versioni; ogni versione diventa un pacchetto a parte
 * con i file comuni (Gerber, forature, lamine…) e solo i file che nel nome portano la sua versione (BOM_HELIOS…, non BOM_CRONOS…).
 */

export interface Richiesta {
  quantita: number; descrizione: string; versione: string | null;
  /** codici diversi nella stessa mail (Elemaster 28/10/2026: 20149766 e 1022303): il codice è anche la "versione" con cui si divide */
  codice?: string;
  /** previsioni scritte dal cliente ("Forecast 2026 --> 318pz (lotto unico)"): solo da leggere */
  forecast?: string[];
  /** cicli di lavorazione elencati sotto il codice ("SALD ONDA THT", "ISP. VISIVA AOI SMT"…): servono alle spunte del preventivo */
  cicli?: string[];
}

const UNITA = '(?:pz\\.?|pezzi|pcs\\.?|pc\\.?|pcba?|schede|nr\\.?|n\\.|qt[aà]\\.?)';

/** Righe tipo "167pz M0929-C versione HELIOS", "M0929-C CRONOS: 90 pz", "n. 500 schede EA1002". Niente righe = nessuna richiesta letta. */
export function richiesteDaTesto(testo: string): Richiesta[] {
  const out: Richiesta[] = [];
  for (const grezza of testo.replace(/\r/g, '').split('\n')) {
    const riga = grezza.replace(/^[\s*•·\-–>]+/, '').replace(/\s+/g, ' ').trim();
    if (!riga || riga.length > 160) continue;
    const prima = new RegExp(`^(?:n\\.?\\s*)?(\\d{1,3}(?:\\.\\d{3})*|\\d+)\\s*${UNITA}\\s+(?:di\\s+|x\\s+)?(.+)$`, 'i').exec(riga);
    const dopo = new RegExp(`^(.+?)\\s*[:=\\-–x]?\\s+(?:n\\.?\\s*)?(\\d{1,3}(?:\\.\\d{3})*|\\d+)\\s*${UNITA}\\.?$`, 'i').exec(riga);
    const [q, d] = prima ? [prima[1], prima[2]] : dopo ? [dopo[2], dopo[1]] : [null, null];
    if (!q || !d) continue;
    const quantita = Number(q.replace(/\./g, ''));
    if (!(quantita > 0) || quantita > 1_000_000) continue;
    const descrizione = d.replace(/[.;,]+$/, '').trim();
    out.push({ quantita, descrizione, versione: versioneDa(descrizione) });
  }
  return out;
}

/**
 * Richieste di una mail: prima il testo, se lì non c'è niente l'oggetto (Adriano 29/10/2026: «Ordine 5 PCB MULTI», 5 pezzi scritti
 * solo nell'oggetto). R:/RE:/I:/FW: davanti all'oggetto non contano.
 */
export function richiesteDaEmail(email: { testo?: string | null; oggetto?: string | null; allegati?: (string | { nome: string })[] | null } | null | undefined): Richiesta[] {
  const dalTesto = richiesteDaTesto(email?.testo ?? '');
  if (versioniDaDividere(dalTesto).length) return dalTesto;
  const perCodice = richiestePerCodice(email?.testo ?? '', [email?.oggetto ?? '', ...(email?.allegati ?? []).map(a => typeof a === 'string' ? a : a.nome)]);
  if (perCodice.length) return perCodice;
  if (dalTesto.length) return dalTesto;
  const oggetto = (email?.oggetto ?? '').replace(/^(?:\s*(?:r|re|i|fw|fwd|inoltro)\s*:\s*)+/i, '').replace(/^(?:ordine|richiesta(?:\s+d[i']\s*offerta)?|offerta|preventivo|rfq)\b[\s:.\-–]*/i, '');
  return richiesteDaTesto(oggetto);
}

const RE_FORECAST = /\b(forecast|previsione|previsto|fabbisogno|annu[oa]l[ei]?)\b/i;
const RE_QTA = new RegExp(`(\\d{1,3}(?:\\.\\d{3})*|\\d+)\\s*${UNITA}(?![a-z])`, 'i');
const RE_RIGA_CODICE = /^([A-Z0-9][A-Z0-9\-_.]{3,24})\s+(\S.{2,})$/i;

/**
 * Più codici nella stessa mail (Adriano 29/10/2026, RDO Elemaster 20149766 / 1022303): ogni codice ha la sua riga
 * ("20149766 PCA EPS442 … LF ADB SAFEGATE BV") con sotto i cicli di lavorazione, e la sua quantità ("Primo odp 43pz") con le
 * previsioni ("Forecast 2027 --> 742pz (lotto medio 106pz)"). Un codice è riconosciuto solo se compare anche nell'oggetto o nel
 * nome di un allegato (così una riga qualunque che comincia con un numero non diventa un codice). Le quantità stanno prima del
 * codice o dopo: lo dice la prima che si incontra. Nessun codice con la sua quantità = nessuna richiesta.
 */
export function richiestePerCodice(testo: string, riferimenti: string[]): Richiesta[] {
  const rif = riferimenti.map(pulito).join(' ');
  type Ev = { tipo: 'q'; quantita: number; forecast: boolean; testo: string } | { tipo: 'c'; codice: string; descrizione: string; cicli: string[] };
  const ev: Ev[] = [];
  let ultimoCodice: Extract<Ev, { tipo: 'c' }> | null = null, inCicli = false;
  for (const grezza of testo.replace(/\r/g, '').split('\n')) {
    const riga = grezza.replace(/^[\s*•·\-–>]+/, '').replace(/\s+/g, ' ').trim();
    if (!riga) { inCicli = false; continue; }
    const q = RE_QTA.exec(riga);
    if (q && riga.length <= 160) {
      const quantita = Number(q[1].replace(/\./g, ''));
      if (quantita > 0 && quantita <= 1_000_000) { ev.push({ tipo: 'q', quantita, forecast: RE_FORECAST.test(riga), testo: riga.replace(/\s*-+>\s*/g, ' ') }); inCicli = false; continue; }
    }
    const c = RE_RIGA_CODICE.exec(riga);
    const codice = c?.[1].toUpperCase();
    if (c && codice && /\d/.test(codice) && pulito(codice).length >= 5 && rif.includes(pulito(codice)) && !ev.some(e => e.tipo === 'c' && e.codice === codice)) {
      ultimoCodice = { tipo: 'c', codice, descrizione: c[2].trim().toUpperCase(), cicli: [] };
      ev.push(ultimoCodice); inCicli = true; continue;
    }
    if (inCicli && ultimoCodice && riga.length <= 120) {
      // riga andata a capo ("…fissaggio dell'induttanza con il / silicone"): si unisce alla precedente
      if (/^[a-zà-ù]/.test(riga) && ultimoCodice.cicli.length) ultimoCodice.cicli[ultimoCodice.cicli.length - 1] += ` ${riga}`;
      else ultimoCodice.cicli.push(riga);
    }
  }
  const codici = ev.filter((e): e is Extract<Ev, { tipo: 'c' }> => e.tipo === 'c');
  if (!codici.length) return [];
  const primaDelCodice = ev[0].tipo === 'q';
  const out: Richiesta[] = [];
  codici.forEach(c => {
    const i = ev.indexOf(c);
    const vicine = (da: number, passo: 1 | -1) => { const qs: Extract<Ev, { tipo: 'q' }>[] = []; for (let j = da; j >= 0 && j < ev.length && ev[j].tipo === 'q'; j += passo) qs.push(ev[j] as any); return passo === -1 ? qs.reverse() : qs; };
    const qs = primaDelCodice ? vicine(i - 1, -1) : vicine(i + 1, 1);
    const lotto = qs.find(x => !x.forecast) ?? null;
    if (!lotto) return;
    out.push({ quantita: lotto.quantita, descrizione: c.descrizione, versione: c.codice, codice: c.codice, forecast: qs.filter(x => x.forecast).map(x => x.testo), cicli: c.cicli });
  });
  return out;
}

/** "M0929-C versione HELIOS" → "HELIOS"; senza la parola versione/variante/ver. resta null. */
export function versioneDa(descrizione: string): string | null {
  const m = /\b(?:versione|vers\.?|ver\.?|version|variante|var\.?|mod\.|modello)\s+([A-Za-z0-9][\w\-]*)/i.exec(descrizione);
  return m ? m[1].toUpperCase() : null;
}

const pulito = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Il file serve alla versione: non porta nel nome il nome di un'ALTRA versione (i file comuni, senza nomi di versione, servono a tutte). */
export function fileDellaVersione(nome: string, versione: string, tutte: string[]): boolean {
  const n = pulito(nome.split(/[\\/]/).pop() ?? nome);
  if (n.includes(pulito(versione))) return true;
  return !tutte.some(v => v !== versione && pulito(v).length >= 3 && n.includes(pulito(v)));
}

/** Le versioni diverse della richiesta (almeno due, altrimenti non c'è niente da dividere). */
export function versioniDaDividere(r: Richiesta[]): Richiesta[] {
  const viste = new Map<string, Richiesta>();
  for (const x of r) if (x.versione && !viste.has(x.versione)) viste.set(x.versione, x);
  return viste.size >= 2 ? [...viste.values()] : [];
}
