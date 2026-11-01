/**
 * Sezione Dipendenti (Adriano 1/11/2026): costo del personale, buste paga riservate, nota spese con il rimborso chilometrico.
 * Solo calcoli e letture di testo: niente database e niente rete (le pagine stanno in `server/rotte/dipendenti.ts`).
 *
 * Documenti dello studio paghe (U.P.A. Federimpresa Piacenza, prima un altro studio con il "bilancino"):
 * - cedolini (buste paga, una pagina per persona): RISERVATI, si vedono solo con la password delle buste paga, mai all'IA;
 * - riepilogo dei cedolini: riservato;
 * - nota contabile: totali del mese per qualifica (operai, impiegati, apprendisti, soci): da qui il costo del personale;
 * - F24: versamenti di ritenute e contributi (scadenza il 16 del mese dopo).
 */

export type TipoPaghe = 'cedolini' | 'riepilogo' | 'nota_contabile' | 'f24';
export const TIPI_PAGHE: Record<TipoPaghe, string> = {
  cedolini: 'Cedolini (buste paga)', riepilogo: 'Riepilogo cedolini', nota_contabile: 'Nota contabile', f24: 'F24',
};
/** Documenti che si aprono solo con la password delle buste paga (dati delle singole persone). */
export const TIPI_RISERVATI: TipoPaghe[] = ['cedolini', 'riepilogo'];

/**
 * Riconosce dal nome i documenti dello studio paghe arrivati nella cartella "Da acquisire" o caricati a mano:
 * "Casteltech - ced 05-2026 definitivi.pdf", "Casteltech - riepilogo 08-2026.pdf", "Casteltech - nc 08-2026.pdf",
 * "NOTA CONTABILE 09-26.pdf", "Casteltech - f24 del 16-09-26.pdf". Un "NC" da solo è una nota contabile solo se il nome
 * cita Casteltech o un mese/anno (una nota di credito di un cliente si chiama di solito "Nota di credito …").
 */
export function tipoDocumentoPaghe(nome: string): TipoPaghe | null {
  const n = nome.toLowerCase().replace(/[_]+/g, ' ');
  if (!/\.pdf$/.test(n)) return null;
  if (/nota (di )?credito|credit note/.test(n)) return null;
  if (/\bf ?24\b/.test(n)) return 'f24';
  if (/\bced(olin[io])?\b\.?|buste? paga|\bcedolin/.test(n)) return 'cedolini';
  if (/riepilogo/.test(n) && /castel|\d{2}[-. ]\d{2,4}/.test(n)) return 'riepilogo';
  if (/nota contabile/.test(n)) return 'nota_contabile';
  if (/(^|[\s-])nc[\s.-]/.test(n) && /castel|\d{2}[-. ]\d{2,4}/.test(n)) return 'nota_contabile';
  return null;
}

const anno4 = (a: string) => (a.length === 2 ? 2000 + Number(a) : Number(a));

/**
 * Mese di competenza dal nome ("08-2026", "09-26", "03.2019"). Per gli F24 la data del nome è quella del pagamento
 * ("del 16-09-26"): la competenza è il mese prima (le paghe di agosto si versano il 16 settembre).
 */
export function periodoDaNome(nome: string, tipo: TipoPaghe): { anno: number; mese: number; scadenza?: string } | null {
  const n = nome.replace(/_/g, ' ');
  if (tipo === 'f24') {
    const m = /(\d{1,2})[-. ](\d{1,2})[-. ](\d{2,4})/.exec(n);
    if (!m) return null;
    const g = Number(m[1]), me = Number(m[2]), a = anno4(m[3]);
    if (me < 1 || me > 12 || g < 1 || g > 31) return null;
    const scadenza = `${a}-${String(me).padStart(2, '0')}-${String(g).padStart(2, '0')}`;
    return me === 1 ? { anno: a - 1, mese: 12, scadenza } : { anno: a, mese: me - 1, scadenza };
  }
  const m = /(?:^|\D)(\d{1,2})[-. ](\d{4}|\d{2})(?!\d)/.exec(n);
  if (!m) return null;
  const me = Number(m[1]), a = anno4(m[2]);
  return me >= 1 && me <= 12 && a >= 2000 ? { anno: a, mese: me } : null;
}

/** Importo scritto all'italiana: "4.961,41", "-101,92", "249,62-". */
export function numeroIt(s: string): number {
  const t = s.trim();
  const negativo = /^-|-$/.test(t);
  const n = Number(t.replace(/^-|-$/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? (negativo ? -n : n) : 0;
}

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
export const nomeMese = (m: number) => MESI[m - 1] ?? '';
const NOMI_MESE = MESI.map(m => m[0].toUpperCase() + m.slice(1));
export const nomeMeseMaiuscolo = (m: number) => NOMI_MESE[m - 1] ?? '';

/** Costi del mese per una qualifica (operai, impiegati, soci…): quello che si salva in `costi_personale`. */
export interface CostoQualifica {
  qualifica: string;
  /** retribuzioni lorde (competenze a carico della ditta) */
  lordo: number;
  /** contributi INPS a carico dell'azienda */
  contributi: number;
  /** trattamento di fine rapporto indicato nella nota (versato ai fondi o accantonato) */
  tfr: number;
  /** enti bilaterali, assistenza sanitaria (EBNA, SAN.ARTI, Metasalute), INAIL */
  altri: number;
  /** netto in busta (solo informazione: non entra nel costo) */
  netto: number | null;
}
export interface NotaLetta { anno: number; mese: number; qualifiche: CostoQualifica[]; avvisi: string[] }

/** Costo per l'azienda: lordo + contributi a carico azienda + TFR + altri contributi. */
export const costoAzienda = (c: Pick<CostoQualifica, 'lordo' | 'contributi' | 'tfr' | 'altri'>) =>
  Math.round(((c.lordo || 0) + (c.contributi || 0) + (c.tfr || 0) + (c.altri || 0)) * 100) / 100;

const IMPORTO = String.raw`-?\s*\d{1,3}(?:\.\d{3})*,\d{2}-?`;
/** Primo importo dopo l'etichetta, sulla stessa riga. */
function importoDopo(riga: string, etichetta: RegExp): number | null {
  const m = new RegExp(etichetta.source + String.raw`[^\d-]*(${IMPORTO})`, 'i').exec(riga);
  return m ? numeroIt(m[1].replace(/\s+/g, '')) : null;
}

/**
 * Nota contabile dello studio paghe attuale (dal 2022, testo del PDF): una sezione per qualifica, più "TUTTE" con i totali.
 * Le sezioni di una stessa qualifica ripetute a cambio pagina si sommano; "TUTTE" serve solo da controllo.
 */
export function leggiNotaContabile(testo: string): NotaLetta | null {
  if (!/N\s*O\s*T\s*A\s+C\s*O\s*N\s*T\s*A\s*B\s*I\s*L\s*E/.test(testo)) return null;
  const periodo = /Periodo competenza\s*:\s*\S*\s+(\d{2})\/(\d{4})/.exec(testo);
  if (!periodo) return null;
  const per = new Map<string, CostoQualifica>();
  let tutte: CostoQualifica | null = null;
  const avvisi: string[] = [];
  for (const sezione of testo.split(/N\s*O\s*T\s*A\s+C\s*O\s*N\s*T\s*A\s*B\s*I\s*L\s*E/).slice(1)) {
    const q = /Qualifica\s*:\s*([A-ZÀ-Ü .'/-]+?)\s{2,}/.exec(sezione)?.[1]?.trim() ?? /Qualifica\s*:\s*(\S+)/.exec(sezione)?.[1];
    if (!q) continue;
    const c: CostoQualifica = { qualifica: q.toUpperCase(), lordo: 0, contributi: 0, tfr: 0, altri: 0, netto: null };
    let aggiuntivi: number | null = null, enti = 0, metasalute = 0;
    const righe = sezione.split(/\r?\n/);
    for (const [i, r] of righe.entries()) {
      let v: number | null;
      if ((v = importoDopo(r, /TOTALE RETRIBUZIONI LORDE/)) != null) c.lordo += v;
      else if ((v = importoDopo(r, /DI CUI A CARICO AZIENDA/)) != null) c.contributi += v;
      else if ((v = importoDopo(r, /Tratt\. fine rapporto(?! netto)/)) != null && !/netto/i.test(r)) c.tfr += v;
      else if ((v = importoDopo(r, /TOTALI NETTI IN BUSTA/)) != null) c.netto = (c.netto ?? 0) + v;
      else if ((v = importoDopo(r, /TOTALE VERSAMENTI AGGIUNTIVI/)) != null) aggiuntivi = (aggiuntivi ?? 0) + v;
      else if ((v = importoDopo(r, /TOTALE VERSAMENTO\s+\S+/)) != null) enti += v;
      else if (/^\s*METASALUTE\s*$/i.test(r)) {
        const dopo = righe.slice(i + 1, i + 3).map(x => new RegExp(IMPORTO).exec(x)?.[0]).find(Boolean);
        if (dopo) metasalute += numeroIt(dopo.replace(/\s+/g, ''));
      }
    }
    c.altri = Math.round(((aggiuntivi ?? enti) + metasalute) * 100) / 100;
    if (c.qualifica === 'TUTTE') { tutte = c; continue; }
    const g = per.get(c.qualifica);
    if (g) {
      g.lordo += c.lordo; g.contributi += c.contributi; g.tfr += c.tfr; g.altri += c.altri;
      g.netto = c.netto == null ? g.netto : (g.netto ?? 0) + c.netto;
    } else per.set(c.qualifica, c);
  }
  const qualifiche = [...per.values()].filter(c => c.lordo || c.contributi || c.tfr || c.altri)
    .map(c => ({ ...c, lordo: arr(c.lordo), contributi: arr(c.contributi), tfr: arr(c.tfr), altri: arr(c.altri), netto: c.netto == null ? null : arr(c.netto) }));
  if (tutte?.lordo && qualifiche.length) {
    const somma = qualifiche.reduce((s, c) => s + c.lordo, 0);
    if (Math.abs(somma - tutte.lordo) > 0.05) avvisi.push(`il lordo delle qualifiche (${somma.toFixed(2)}) non torna con il totale della nota (${tutte.lordo.toFixed(2)})`);
  }
  if (!qualifiche.length && tutte?.lordo) qualifiche.push({ ...tutte, qualifica: 'TUTTE' });
  return { anno: Number(periodo[2]), mese: Number(periodo[1]), qualifiche, avvisi };
}

/**
 * Conti di costo del "bilancino di verifica" del vecchio studio paghe (2019–2021): conto → gruppo e voce.
 * 55101 salari, 55413 compensi dei collaboratori (soci), 55414 tirocinanti, 56201/55417 contributi INPS,
 * 54241 TFR, 56239/56253… enti bilaterali e assistenza sanitaria. Gli altri conti 5xxxx vanno tra gli "altri" del gruppo dipendenti.
 */
const CONTI_BILANCINO: Record<string, { qualifica: string; voce: 'lordo' | 'contributi' | 'tfr' | 'altri' }> = {
  '55101': { qualifica: 'DIPENDENTI', voce: 'lordo' },
  '56201': { qualifica: 'DIPENDENTI', voce: 'contributi' },
  '54241': { qualifica: 'DIPENDENTI', voce: 'tfr' },
  '55413': { qualifica: 'SOCI E COLLABORATORI', voce: 'lordo' },
  '55417': { qualifica: 'SOCI E COLLABORATORI', voce: 'contributi' },
  '55414': { qualifica: 'TIROCINANTI', voce: 'lordo' },
};

/** Bilancino di verifica (2019–2021): somma dei conti di costo 5xxxx del mese, per gruppo. */
export function leggiBilancino(testo: string): NotaLetta | null {
  if (!/BILANCINO DI VERIFICA|Bilancino di verifica/.test(testo)) return null;
  const p = /BILANCINO DI VERIFICA MESE\s+(\p{L}+)\s+(\d{4})/u.exec(testo) ?? /Periodo di elaborazione:\s*(\p{L}+)\s+(\d{4})/u.exec(testo);
  const mese = p ? MESI.indexOf(p[1].toLowerCase()) + 1 : 0;
  if (!p || !mese) return null;
  const per = new Map<string, CostoQualifica>();
  const avvisi: string[] = [];
  const righe = testo.split(/\r?\n/);
  let conto: string | null = null;
  for (const r of righe) {
    const c = /^\s*(\d{5})\s{2,}\S/.exec(r);
    if (c) { conto = c[1]; continue; }
    if (conto && /TOTALI CONTO/.test(r)) {
      const importi = r.match(new RegExp(IMPORTO, 'g')) ?? [];
      if (conto.startsWith('5') && importi.length) {
        const v = numeroIt(importi[importi.length - 1].replace(/\s+/g, ''));
        const dove = CONTI_BILANCINO[conto] ?? { qualifica: 'DIPENDENTI', voce: 'altri' as const };
        const x = per.get(dove.qualifica) ?? { qualifica: dove.qualifica, lordo: 0, contributi: 0, tfr: 0, altri: 0, netto: null };
        x[dove.voce] = arr(x[dove.voce] + v);
        per.set(dove.qualifica, x);
      }
      conto = null;
    }
  }
  const qualifiche = [...per.values()];
  if (!qualifiche.length) avvisi.push('nessun conto di costo trovato');
  return { anno: Number(p[2]), mese, qualifiche, avvisi };
}

/** Prova i due formati (nota contabile attuale, bilancino del vecchio studio). */
export const leggiCostiPaghe = (testo: string): NotaLetta | null => leggiNotaContabile(testo) ?? leggiBilancino(testo);

const arr = (n: number) => Math.round(n * 100) / 100;

/** Pulisce la lettura dell'IA di una nota contabile (stessa forma di `leggiNotaContabile`). */
export function normalizzaNotaIa(x: any): NotaLetta | null {
  const anno = Number(x?.anno), mese = Number(x?.mese);
  if (!(anno >= 2000 && anno <= 2100 && mese >= 1 && mese <= 12)) return null;
  const n = (v: unknown) => { const t = typeof v === 'number' ? v : numeroIt(String(v ?? '0')); return Number.isFinite(t) ? arr(t) : 0; };
  const qualifiche: CostoQualifica[] = (Array.isArray(x?.qualifiche) ? x.qualifiche : [])
    .map((q: any) => ({ qualifica: String(q?.qualifica ?? '').trim().toUpperCase() || 'TUTTE', lordo: n(q?.lordo), contributi: n(q?.contributi),
      tfr: n(q?.tfr), altri: n(q?.altri), netto: q?.netto == null || q?.netto === '' ? null : n(q.netto) }))
    .filter((q: CostoQualifica) => q.lordo || q.contributi || q.tfr || q.altri);
  // se l'IA ha messo anche "TUTTE" insieme alle qualifiche, il totale non si somma due volte
  const senzaTutte = qualifiche.filter(q => q.qualifica !== 'TUTTE');
  return { anno, mese, qualifiche: senzaTutte.length ? senzaTutte : qualifiche, avvisi: [] };
}

/** F24 letto (dall'IA): scadenza, totale e righe per sezione (Erario, INPS, Regioni, IMU e altri tributi locali, INAIL). */
export interface F24Letto { scadenza: string | null; totale: number; righe: { sezione: string; codice: string; periodo: string; importo: number }[] }
export function normalizzaF24Ia(x: any): F24Letto {
  const data = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? String(v) : null;
  const n = (v: unknown) => { const t = typeof v === 'number' ? v : numeroIt(String(v ?? '0')); return Number.isFinite(t) ? arr(t) : 0; };
  const righe = (Array.isArray(x?.righe) ? x.righe : []).map((r: any) => ({ sezione: String(r?.sezione ?? '').slice(0, 30), codice: String(r?.codice ?? '').slice(0, 20),
    periodo: String(r?.periodo ?? '').slice(0, 20), importo: n(r?.importo) })).filter((r: any) => r.importo);
  const totale = n(x?.totale) || arr(righe.reduce((s: number, r: any) => s + r.importo, 0));
  return { scadenza: data(x?.scadenza), totale, righe };
}

// ───────────────────────────── area riservata ─────────────────────────────

/** Dopo la password delle buste paga l'area resta aperta 15 minuti dall'ultima pagina vista. */
export const MINUTI_SBLOCCO = 15;
export const sbloccoValido = (sbloccataIl: number | undefined, ora: number) => !!sbloccataIl && ora - sbloccataIl < MINUTI_SBLOCCO * 60_000;

/**
 * Chi può aprire l'area riservata: l'amministratore (l'utente con l'email di ADMIN_EMAIL su Render, cioè Adriano) e gli utenti
 * a cui lui ha dato il permesso. Tutti devono comunque scrivere la password delle buste paga.
 */
export const puoAprireRiservata = (u: { email?: string | null; paghe?: boolean | null }, emailAmministratore: string | undefined) =>
  !!u.paghe || (!!emailAmministratore && !!u.email && u.email.toLowerCase() === emailAmministratore.toLowerCase());

/** Password delle buste paga: almeno 8 caratteri, con almeno una cifra. */
export function controllaPasswordPaghe(p: string): string | null {
  if (p.length < 8) return 'la password deve avere almeno 8 caratteri';
  if (!/\d/.test(p) || !/\p{L}/u.test(p)) return 'la password deve avere lettere e numeri';
  return null;
}

// ───────────────────────────── nota spese (rimborso chilometrico) ─────────────────────────────

/**
 * Riga della nota spese, come il "Modulo rimborso km" in Excel: data, partenza, destinazione, km di andata
 * (dall'elenco delle destinazioni), altre spese (pranzo, parcheggio, pedaggi…). Il viaggio è di andata e ritorno:
 * km totali = andata × 2 (si può togliere la spunta per un viaggio di sola andata).
 */
export interface RigaNotaSpese { data: string; partenza: string; destinazione: string; kmAndata: number; andataRitorno: boolean; altreSpese: number; note: string }
export const kmRiga = (r: Pick<RigaNotaSpese, 'kmAndata' | 'andataRitorno'>) => arr((r.kmAndata || 0) * (r.andataRitorno ? 2 : 1));
export const rimborsoRiga = (r: Pick<RigaNotaSpese, 'kmAndata' | 'andataRitorno' | 'altreSpese'>, tariffa: number) =>
  arr(kmRiga(r) * (tariffa || 0) + (r.altreSpese || 0));

export function totaliNotaSpese(righe: Pick<RigaNotaSpese, 'kmAndata' | 'andataRitorno' | 'altreSpese'>[], tariffa: number) {
  const km = arr(righe.reduce((s, r) => s + kmRiga(r), 0));
  const altre = arr(righe.reduce((s, r) => s + (r.altreSpese || 0), 0));
  return { km, rimborsoKm: arr(km * (tariffa || 0)), altre, totale: arr(km * (tariffa || 0) + altre) };
}

/** Riga scritta nel modulo della nota spese; null se è vuota. Km dall'elenco delle destinazioni se non scritti. */
export function rigaNotaDaModulo(x: Record<string, unknown>, kmDestinazione: (nome: string) => number | null): { riga: RigaNotaSpese | null; errore?: string } {
  const testo = (v: unknown) => String(v ?? '').trim();
  const destinazione = testo(x.destinazione).toUpperCase(), partenza = testo(x.partenza) || 'SEDE';
  const data = testo(x.data);
  const numero = (v: unknown) => { const t = testo(v).replace(/\s|€/g, ''); return t ? numeroIt(t.includes(',') ? t : t.replace('.', ',')) : null; };
  const altre = numero(x.altre_spese) ?? 0;
  let km = numero(x.km_andata);
  if (!destinazione && !altre && !km) return { riga: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { riga: null, errore: 'manca la data' };
  if (km == null && destinazione) km = kmDestinazione(destinazione);
  if (km == null) km = 0;
  if (km < 0 || altre < 0) return { riga: null, errore: 'km e spese non possono essere negativi' };
  return { riga: { data, partenza: partenza.toUpperCase(), destinazione, kmAndata: km, andataRitorno: x.andata_ritorno !== undefined ? !!x.andata_ritorno && x.andata_ritorno !== '0' : true,
    altreSpese: altre, note: testo(x.note).slice(0, 300) } };
}

/** Riepilogo dell'anno di una persona (come il foglio RIEPILOGO del modulo): totale per mese, pagato, da pagare. */
export function riepilogoAnno(note: { mese: number; totale: number; pagato: number }[]) {
  const mesi = Array.from({ length: 12 }, (_, i) => ({ mese: i + 1, totale: 0, pagato: 0 }));
  for (const n of note) { const m = mesi[n.mese - 1]; if (m) { m.totale = arr(m.totale + n.totale); m.pagato = arr(m.pagato + n.pagato); } }
  const totale = arr(mesi.reduce((s, m) => s + m.totale, 0)), pagato = arr(mesi.reduce((s, m) => s + m.pagato, 0));
  return { mesi, totale, pagato, daPagare: arr(totale - pagato) };
}

// ───────────────────────────── costo del personale ─────────────────────────────

export interface MeseCosto { anno: number; mese: number; costo: number }
/**
 * Tabella anni × mesi del costo del personale (dipendenti e soci) con il totale dell'anno, la media dei mesi caricati
 * e la differenza con l'anno prima sugli stessi mesi (così un anno in corso si confronta con lo stesso periodo).
 */
export function tabellaCosti(righe: MeseCosto[]) {
  const anni = [...new Set(righe.map(r => r.anno))].sort((a, b) => b - a);
  const valore = new Map(righe.map(r => [`${r.anno}-${r.mese}`, r.costo]));
  return anni.map(anno => {
    const mesi = Array.from({ length: 12 }, (_, i) => valore.get(`${anno}-${i + 1}`) ?? null);
    const presenti = mesi.map((v, i) => (v == null ? -1 : i)).filter(i => i >= 0);
    const totale = arr(mesi.reduce<number>((s, v) => s + (v ?? 0), 0));
    const prima = presenti.map(i => valore.get(`${anno - 1}-${i + 1}`));
    const confronto = prima.every(v => v != null) && presenti.length ? arr(prima.reduce<number>((s, v) => s + (v ?? 0), 0)) : null;
    return { anno, mesi, totale, mesiCaricati: presenti.length, media: presenti.length ? arr(totale / presenti.length) : 0,
      annoPrima: confronto, variazione: confronto ? arr((totale - confronto) / confronto * 100) : null };
  });
}

/** Righe di un file di costi (storico dall'archivio): controllo e pulizia. */
export interface RigaCostoFile { anno: number; mese: number; qualifica: string; lordo: number; contributi: number; tfr: number; altri: number; netto?: number | null; file?: string }
export function righeCostiValide(x: unknown): RigaCostoFile[] {
  const righe = Array.isArray((x as any)?.costi) ? (x as any).costi : [];
  return righe.map((r: any) => ({ anno: Number(r.anno), mese: Number(r.mese), qualifica: String(r.qualifica ?? '').trim().toUpperCase(),
    lordo: Number(r.lordo) || 0, contributi: Number(r.contributi) || 0, tfr: Number(r.tfr) || 0, altri: Number(r.altri) || 0,
    netto: r.netto == null ? null : Number(r.netto), file: r.file ? String(r.file).slice(0, 250) : undefined }))
    .filter((r: RigaCostoFile) => r.anno >= 2000 && r.anno <= 2100 && r.mese >= 1 && r.mese <= 12 && r.qualifica);
}
