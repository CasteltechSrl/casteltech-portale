/**
 * Consumi e limiti dei servizi esterni del portale (Adriano 29/10/2026): IA Anthropic, Render (memoria), Neon (database),
 * distributori di componenti, Google Drive e Gmail, Invoicetronic. Nessun accesso al database: qui solo i conti e le parole.
 * Impostazioni → Servizi mostra il riquadro; le righe "attenzione" e "critico" diventano l'avviso in cima alle pagine dell'ufficio.
 */

export type StatoServizio = 'ok' | 'attenzione' | 'critico' | 'spento' | 'sconosciuto';

// ───────────────────────────── IA: prezzi e costo ─────────────────────────────

/** Prezzi Anthropic in dollari per milione di token (ingresso, uscita), listino di ottobre 2026. Il più lungo prefisso vince. */
export const PREZZI_IA: [prefisso: string, ingresso: number, uscita: number][] = [
  ['claude-fable', 10, 50], ['claude-mythos', 10, 50],
  ['claude-opus-5-5', 4, 20], ['claude-opus', 5, 25],
  ['claude-sonnet-5', 2, 10], ['claude-sonnet', 3, 15],
  ['claude-haiku-5-5', 0.10, 0.50], ['claude-haiku', 1, 5],
];

export interface UsoIa { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number }

export function prezzoModello(modello: string): { ingresso: number; uscita: number } {
  const m = [...PREZZI_IA].sort((a, b) => b[0].length - a[0].length).find(([p]) => modello.startsWith(p));
  // modello sconosciuto: si conta come Opus, per non sottostimare la spesa
  return m ? { ingresso: m[1], uscita: m[2] } : { ingresso: 5, uscita: 25 };
}

/** Costo di una risposta in dollari: scrittura in cache 1,25 volte l'ingresso, lettura dalla cache 0,1 volte. */
export function costoIa(modello: string, u: UsoIa): number {
  const p = prezzoModello(modello);
  const n = (x?: number) => Number(x) || 0;
  return (n(u.input_tokens) * p.ingresso + n(u.cache_creation_input_tokens) * p.ingresso * 1.25
    + n(u.cache_read_input_tokens) * p.ingresso * 0.1 + n(u.output_tokens) * p.uscita) / 1_000_000;
}

// ───────────────────────────── IA: errori in parole chiare ─────────────────────────────

export type TipoErroreIa = 'credito' | 'tetto' | 'chiave' | 'permessi' | 'limite' | 'sovraccarico' | 'troppo_grande' | 'tempo' | 'altro';
export interface ErroreIaChiaro { tipo: TipoErroreIa; messaggio: string }

/** Tipi di errore che non si risolvono riprovando: serve un intervento (credito, tetto di spesa, chiave). */
export const ERRORI_BLOCCANTI: TipoErroreIa[] = ['credito', 'tetto', 'chiave', 'permessi'];

/** Traduce la risposta di errore dell'API Anthropic in un messaggio che dice cosa è successo e cosa fare. */
export function erroreIa(status: number, corpo: any): ErroreIaChiaro {
  const tipoApi = String(corpo?.error?.type ?? '');
  const testo = String(corpo?.error?.message ?? '');
  if (status === 402 || tipoApi === 'billing_error' || /credit balance/i.test(testo))
    return { tipo: 'credito', messaggio: "Credito dell'IA (Anthropic) esaurito: il documento non è stato letto. Ricarica il credito su console.anthropic.com → Billing, poi premi «Rileggi con l'IA»." };
  if (/usage limit|spend limit|spending limit/i.test(testo))
    return { tipo: 'tetto', messaggio: `Raggiunto il tetto di spesa mensile impostato su Anthropic: il documento non è stato letto. Alza il limite su console.anthropic.com → Limits (o aspetta il mese nuovo), poi premi «Rileggi con l'IA».${testo ? ` (${testo})` : ''}` };
  if (status === 401 || tipoApi === 'authentication_error')
    return { tipo: 'chiave', messaggio: "La chiave dell'IA non è valida o è stata revocata: controlla ANTHROPIC_API_KEY su Render (servizio casteltech-portale → Environment)." };
  if (status === 403 || tipoApi === 'permission_error')
    return { tipo: 'permessi', messaggio: `La chiave dell'IA non ha il permesso per questa richiesta (o per il modello scelto): controlla su console.anthropic.com.${testo ? ` (${testo})` : ''}` };
  if (status === 429 || tipoApi === 'rate_limit_error')
    return { tipo: 'limite', messaggio: "Troppe richieste all'IA in questo minuto (limite del piano Anthropic): riprova fra un minuto." };
  if (status === 529 || status === 503 || tipoApi === 'overloaded_error')
    return { tipo: 'sovraccarico', messaggio: "L'IA di Anthropic è momentaneamente sovraccarica: riprova fra qualche minuto." };
  if (status === 413 || tipoApi === 'request_too_large')
    return { tipo: 'troppo_grande', messaggio: "Documento troppo grande per l'IA (oltre 32 MB o 600 pagine): dividilo in più file." };
  return { tipo: 'altro', messaggio: `L'IA ha risposto con un errore (${status})${testo ? `: ${testo}` : ''}` };
}

// ───────────────────────────── soglie ─────────────────────────────

/** Avviso all'80%, critico al 95% (il limite è già vicino: conviene decidere prima). */
export function statoSoglia(usato: number | null | undefined, limite: number | null | undefined, attenzione = 0.8, critico = 0.95): StatoServizio {
  if (usato == null || !limite || limite <= 0) return 'sconosciuto';
  const p = usato / limite;
  return p >= critico ? 'critico' : p >= attenzione ? 'attenzione' : 'ok';
}

const PESO: Record<StatoServizio, number> = { critico: 4, attenzione: 3, sconosciuto: 1, ok: 0, spento: 0 };
const peggiore = (...s: StatoServizio[]) => s.reduce((a, b) => (PESO[b] > PESO[a] ? b : a), 'ok' as StatoServizio);

// ───────────────────────────── dati del riquadro ─────────────────────────────

export interface ErroreRecente { tipo: string; messaggio: string; il: string }
export interface Conteggio { chiamate: number; errori: number; tokenIngresso?: number; tokenUscita?: number; costoUsd?: number }

export interface DatiServizi {
  ia?: {
    configurata: boolean;
    modello: string;
    oggi: Conteggio;
    mese: Conteggio;
    /** credito caricato su Anthropic (scritto dall'ufficio in Impostazioni → Servizi) e speso da quel giorno, in dollari */
    credito?: { importo: number; dal: string; speso: number } | null;
    /** tetto di spesa mensile impostato su Anthropic (facoltativo), in dollari */
    tettoMese?: number | null;
    /** spesa del mese dal resoconto ufficiale di Anthropic (solo con ANTHROPIC_ADMIN_KEY) */
    spesaUfficialeMese?: number | null;
    ultimoErrore?: ErroreRecente | null;
    ultimaRiuscita?: string | null;
    /** dalle intestazioni dell'ultima risposta: limite al minuto del piano */
    limiteMinuto?: { richieste?: number; richiesteRimaste?: number; token?: number; tokenRimasti?: number } | null;
    perVoce?: { voce: string; chiamate: number; costoUsd: number }[];
  };
  memoria?: {
    usataMb: number; piccoMb: number; limiteMb: number; lavoriMb: number; budgetLavoriMb: number;
    avviatoIl: string; riavviiInattesi: string[];
  };
  database?: { spazioMb: number | null; limiteMb: number; tabelle: { nome: string; mb: number }[]; ore: { usate: number; limite: number } | null; neonCollegato: boolean; erroreNeon?: string | null };
  distributori?: { nome: string; configurato: boolean; oggi: Conteggio; limiteGiorno: number | null; ultimoErrore?: ErroreRecente | null }[];
  drive?: { configurato: boolean; ultimoControllo?: string | null; fileOggi: number; ultimoErrore?: ErroreRecente | null };
  gmail?: { configurato: boolean; inviatiOggi: number; limiteGiorno: number; ultimoErrore?: ErroreRecente | null };
  invoicetronic?: { configurato: boolean; prova: boolean };
}

export interface RigaServizio {
  chiave: string;
  servizio: string;
  cosa: string;
  uso: string;
  limite: string;
  percentuale: number | null;
  stato: StatoServizio;
  nota: string;
  /** frase breve per l'avviso in cima alle pagine (solo righe attenzione/critico) */
  avviso?: string;
}

const nf = (x: number, dec = 0) => new Intl.NumberFormat('it-IT', { maximumFractionDigits: dec, minimumFractionDigits: dec }).format(x);
const usd = (x: number) => `${nf(x, 2)} $`;
const pct = (u: number, l: number) => Math.round((u / l) * 100);
/** Giorno AAAA-MM-GG nel fuso italiano. */
export const giornoRoma = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
const quando = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(+d) ? iso : d.toLocaleString('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

/** Le righe del riquadro, nell'ordine: IA, Render, Neon, distributori, Google, Invoicetronic. */
export function righeServizi(d: DatiServizi, adesso = new Date()): RigaServizio[] {
  const out: RigaServizio[] = [];

  if (d.ia) {
    const ia = d.ia;
    if (!ia.configurata) out.push({ chiave: 'ia', servizio: 'IA (Anthropic)', cosa: 'Lettura di ordini, DDT, fatture estere, fogli tempi, righe di BOM; guida',
      uso: '—', limite: '—', percentuale: null, stato: 'spento', nota: 'Chiave ANTHROPIC_API_KEY non impostata su Render: i documenti si registrano ma non si leggono.' });
    else {
      // errore bloccante più recente dell'ultima risposta riuscita: il servizio è fermo adesso
      const bloccato = ia.ultimoErrore && (ERRORI_BLOCCANTI as string[]).includes(ia.ultimoErrore.tipo)
        && (!ia.ultimaRiuscita || ia.ultimoErrore.il > ia.ultimaRiuscita) ? ia.ultimoErrore : null;
      const spesaMese = ia.spesaUfficialeMese ?? ia.mese.costoUsd ?? 0;
      let stato: StatoServizio = 'ok';
      let limite = 'credito prepagato';
      let percentuale: number | null = null;
      let avviso: string | undefined;
      const note: string[] = [];
      if (ia.credito && ia.credito.importo > 0) {
        const resta = ia.credito.importo - ia.credito.speso;
        limite = `credito ${usd(ia.credito.importo)} dal ${ia.credito.dal.split('-').reverse().join('/')}: restano circa ${usd(Math.max(0, resta))}`;
        percentuale = pct(ia.credito.speso, ia.credito.importo);
        stato = statoSoglia(ia.credito.speso, ia.credito.importo);
        if (stato !== 'ok') avviso = `credito dell'IA quasi finito (restano circa ${usd(Math.max(0, resta))})`;
      } else note.push('Scrivi qui sotto il credito caricato su Anthropic per sapere quanto ne resta.');
      if (ia.tettoMese && ia.tettoMese > 0) {
        const s = statoSoglia(spesaMese, ia.tettoMese);
        limite += ` · tetto mensile ${usd(ia.tettoMese)} (usato ${pct(spesaMese, ia.tettoMese)}%)`;
        if (PESO[s] > PESO[stato]) { stato = s; avviso = `spesa dell'IA del mese vicina al tetto (${usd(spesaMese)} su ${usd(ia.tettoMese)})`; }
        percentuale ??= pct(spesaMese, ia.tettoMese);
      }
      if (bloccato) { stato = 'critico'; avviso = bloccato.messaggio; note.unshift(`Ultimo errore ${quando(bloccato.il)}: ${bloccato.messaggio}`); }
      else if (ia.ultimoErrore) note.push(`Ultimo errore ${quando(ia.ultimoErrore.il)}: ${ia.ultimoErrore.messaggio}`);
      const lm = ia.limiteMinuto;
      if (lm?.token && lm.tokenRimasti != null) note.push(`Limite del piano: ${nf(lm.token)} token al minuto${lm.richieste ? `, ${nf(lm.richieste)} richieste al minuto` : ''}.`);
      out.push({ chiave: 'ia', servizio: 'IA (Anthropic)', cosa: `Lettura di ordini, DDT, fatture estere, fogli tempi, righe di BOM; guida (modello ${ia.modello})`,
        uso: `oggi ${nf(ia.oggi.chiamate)} letture, ${usd(ia.oggi.costoUsd ?? 0)} · mese ${nf(ia.mese.chiamate)} letture, `
          + `${nf((ia.mese.tokenIngresso ?? 0) / 1000)} mila token letti e ${nf((ia.mese.tokenUscita ?? 0) / 1000)} mila scritti, `
          + `${usd(spesaMese)}${ia.spesaUfficialeMese != null ? ' (resoconto Anthropic)' : ' (stima del portale)'}`,
        limite, percentuale, stato, nota: note.join(' '), avviso: stato === 'ok' ? undefined : avviso ?? 'IA: controlla i consumi' });
    }
  }

  if (d.memoria) {
    const m = d.memoria;
    const recenti = m.riavviiInattesi.filter(t => +adesso - +new Date(t) < 24 * 3600_000);
    let stato = statoSoglia(m.piccoMb, m.limiteMb, 0.75, 0.9);
    let avviso: string | undefined = stato !== 'ok' ? `memoria del server vicina al limite (picco ${nf(m.piccoMb)} MB su ${nf(m.limiteMb)} MB)` : undefined;
    if (recenti.length) { stato = peggiore(stato, 'attenzione'); avviso = `il portale si è riavviato da solo ${recenti.length === 1 ? 'una volta' : `${recenti.length} volte`} nelle ultime 24 ore (probabile memoria esaurita)`; }
    out.push({ chiave: 'render', servizio: 'Render (server)', cosa: 'Il portale: pagine, caricamento e analisi dei documenti',
      uso: `memoria adesso ${nf(m.usataMb)} MB, picco ${nf(m.piccoMb)} MB dall'avvio (${quando(m.avviatoIl)}); lavori pesanti ${nf(m.lavoriMb)} di ${nf(m.budgetLavoriMb)} MB`,
      limite: `${nf(m.limiteMb)} MB di memoria`, percentuale: pct(m.piccoMb, m.limiteMb), stato,
      nota: (m.riavviiInattesi.length ? `Riavvii non dovuti a una pubblicazione negli ultimi 7 giorni: ${m.riavviiInattesi.map(quando).join(', ')}. ` : '')
        + 'Oltre il limite Render riavvia il portale e il lavoro in corso si perde: se succede spesso conviene il piano con più memoria.',
      avviso });
  }

  if (d.database) {
    const db = d.database;
    const sSpazio = statoSoglia(db.spazioMb, db.limiteMb);
    const sOre = db.ore ? statoSoglia(db.ore.usate, db.ore.limite) : 'ok';
    const stato = peggiore(sSpazio, sOre, db.spazioMb == null ? 'sconosciuto' : 'ok');
    const grandi = db.tabelle.slice(0, 4).map(t => `${t.nome} ${nf(t.mb, 1)} MB`).join(', ');
    out.push({ chiave: 'neon', servizio: 'Neon (database)', cosa: 'Tutti i dati del portale',
      uso: `${db.spazioMb == null ? 'spazio non letto' : `spazio ${nf(db.spazioMb, 1)} MB`}`
        + (db.ore ? ` · calcolo ${nf(db.ore.usate, 1)} ore nel mese` : ''),
      limite: `${nf(db.limiteMb)} MB${db.ore ? ` · ${nf(db.ore.limite)} ore di calcolo al mese` : ''}`,
      percentuale: db.spazioMb == null ? null : Math.max(pct(db.spazioMb, db.limiteMb), db.ore ? pct(db.ore.usate, db.ore.limite) : 0),
      stato,
      nota: (grandi ? `Tabelle più grandi: ${grandi}. ` : '')
        + (db.neonCollegato ? (db.erroreNeon ? `Ore di calcolo non lette: ${db.erroreNeon}` : '')
          : 'Le ore di calcolo si leggono solo con NEON_API_KEY e NEON_PROJECT_ID su Render (vedi la guida).'),
      avviso: stato === 'attenzione' || stato === 'critico'
        ? (PESO[sOre] >= PESO[sSpazio] && db.ore ? `ore di calcolo del database vicine al limite (${nf(db.ore.usate, 1)} su ${nf(db.ore.limite)})` : `spazio del database vicino al limite (${nf(db.spazioMb ?? 0)} MB su ${nf(db.limiteMb)} MB)`)
        : undefined });
  }

  for (const f of d.distributori ?? []) {
    if (!f.configurato) { out.push({ chiave: `dist-${f.nome}`, servizio: f.nome, cosa: 'Prezzi e disponibilità dei componenti', uso: '—', limite: '—', percentuale: null, stato: 'spento', nota: 'Chiavi non impostate su Render.' }); continue; }
    const limiteOggi = f.ultimoErrore?.tipo === 'limite' && giornoRoma(new Date(f.ultimoErrore.il)) === giornoRoma(adesso);
    const stato = peggiore(f.limiteGiorno ? statoSoglia(f.oggi.chiamate, f.limiteGiorno) : 'ok', limiteOggi ? 'attenzione' : 'ok');
    out.push({ chiave: `dist-${f.nome}`, servizio: f.nome, cosa: 'Prezzi e disponibilità dei componenti (le risposte restano 24 ore in memoria)',
      uso: `oggi ${nf(f.oggi.chiamate)} richieste${f.oggi.errori ? `, ${nf(f.oggi.errori)} non riuscite` : ''}`,
      limite: f.limiteGiorno ? `${nf(f.limiteGiorno)} richieste al giorno` : 'nessun limite giornaliero noto',
      percentuale: f.limiteGiorno ? pct(f.oggi.chiamate, f.limiteGiorno) : null, stato,
      nota: f.ultimoErrore ? `Ultimo errore ${quando(f.ultimoErrore.il)}: ${f.ultimoErrore.messaggio}` : '',
      avviso: stato === 'ok' ? undefined : limiteOggi ? `${f.nome}: oggi è stato raggiunto il limite di richieste`
        : `${f.nome}: richieste di oggi vicine al limite (${nf(f.oggi.chiamate)} su ${nf(f.limiteGiorno ?? 0)})` });
  }

  if (d.drive) {
    const g = d.drive;
    out.push({ chiave: 'drive', servizio: 'Google Drive', cosa: 'Cartella degli ordini "Da acquisire" (ogni 15 minuti, lun–ven 8–20)',
      uso: g.configurato ? `oggi ${nf(g.fileOggi)} file acquisiti${g.ultimoControllo ? ` · ultimo controllo ${quando(g.ultimoControllo)}` : ''}` : '—',
      limite: g.configurato ? 'nessun limite pratico (quota gratuita di Google molto alta)' : '—', percentuale: null,
      stato: g.configurato ? 'ok' : 'spento',
      nota: !g.configurato ? 'Chiave GOOGLE_SERVICE_ACCOUNT non impostata su Render.' : g.ultimoErrore ? `Ultimo errore ${quando(g.ultimoErrore.il)}: ${g.ultimoErrore.messaggio}` : '' });
  }
  if (d.gmail) {
    const g = d.gmail;
    const stato = g.configurato ? statoSoglia(g.inviatiOggi, g.limiteGiorno) : 'spento';
    out.push({ chiave: 'gmail', servizio: 'Gmail (info@)', cosa: "Invio delle conferme d'ordine",
      uso: g.configurato ? `oggi ${nf(g.inviatiOggi)} email inviate` : '—', limite: g.configurato ? `${nf(g.limiteGiorno)} email al giorno (Google Workspace)` : '—',
      percentuale: g.configurato ? pct(g.inviatiOggi, g.limiteGiorno) : null, stato,
      nota: !g.configurato ? 'Servono GMAIL_MITTENTE e la delega di dominio di Google Workspace.' : g.ultimoErrore ? `Ultimo errore ${quando(g.ultimoErrore.il)}: ${g.ultimoErrore.messaggio}` : '',
      avviso: stato === 'attenzione' || stato === 'critico' ? `email inviate oggi vicine al limite di Gmail (${nf(g.inviatiOggi)} su ${nf(g.limiteGiorno)})` : undefined });
  }
  if (d.invoicetronic) {
    const t = d.invoicetronic;
    out.push({ chiave: 'invoicetronic', servizio: 'Invoicetronic (SdI)', cosa: 'Invio e ricezione delle fatture elettroniche',
      uso: '—', limite: '—', percentuale: null, stato: t.configurato ? 'ok' : 'spento',
      nota: !t.configurato ? 'Chiave INVOICETRONIC_API_KEY non impostata su Render.'
        : `Chiave ${t.prova ? 'di prova (sandbox)' : 'vera'} impostata. I consumi si conteranno quando l'invio allo SdI sarà nel portale.` });
  }
  return out;
}

/** Le righe da segnalare a tutti gli utenti dell'ufficio (prima le critiche). */
export function avvisiServizi(righe: RigaServizio[]): RigaServizio[] {
  return righe.filter(r => r.stato === 'attenzione' || r.stato === 'critico').sort((a, b) => PESO[b.stato] - PESO[a.stato]);
}

/** Un riavvio è "inatteso" se il portale ripartito è la stessa versione di prima (non è stata una pubblicazione). */
export function riavvioInatteso(versionePrima: string | null | undefined, versioneOra: string | null | undefined): boolean {
  return !!versionePrima && !!versioneOra && versionePrima === versioneOra;
}
