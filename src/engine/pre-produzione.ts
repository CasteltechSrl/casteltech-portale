/**
 * Scheda di pre-produzione della commessa (Adriano 5/11/2026): prima del via libera alla produzione l'ufficio rifà l'analisi
 * completa del prodotto in UNA pagina, senza cercare le informazioni in tre o quattro posti: cliente e preventivo, file del
 * cliente, segnalazioni della preanalisi e del preventivo, BOM con le offerte usate, situazione del materiale, cosa fare e
 * cosa non fare, checklist finale con il nome di chi conferma e la data.
 * Qui le regole pure (testate in `tests/pre-produzione.test.ts`); le letture dal database in `server/pre-produzione-servizio.ts`.
 */
import type { EsitoManca } from './cosa-manca.js';

export interface Firma { da: string; il: string }

/** Quello che si salva sulla commessa (`commesse.pre_produzione`). */
export interface PreProduzione {
  /** voci della checklist confermate: chiave → chi e quando */
  checklist: Record<string, Firma>;
  fare: string;
  nonFare: string;
  /** righe della BOM segnate "già in casa" dall'ufficio (chiave della riga, vedi `chiaveRigaMateriale`) */
  inCasa: Record<string, Firma>;
  viaLibera: Firma | null;
  aggiornata: Firma | null;
}

export function leggiPreProduzione(x: unknown): PreProduzione {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const firme = (v: unknown): Record<string, Firma> => {
    const out: Record<string, Firma> = {};
    if (v && typeof v === 'object') for (const [k, f] of Object.entries(v as Record<string, any>)) if (f && typeof f === 'object' && f.da) out[k] = { da: String(f.da), il: String(f.il ?? '') };
    return out;
  };
  const firma = (v: unknown): Firma | null => (v && typeof v === 'object' && (v as any).da ? { da: String((v as any).da), il: String((v as any).il ?? '') } : null);
  return { checklist: firme(o.checklist), fare: String(o.fare ?? ''), nonFare: String(o.nonFare ?? ''), inCasa: firme(o.inCasa), viaLibera: firma(o.viaLibera), aggiornata: firma(o.aggiornata) };
}

// ───────────────────────────── cosa sappiamo della commessa (per checklist e proposte) ─────────────────────────────

export interface ContestoPreProduzione {
  primoLotto: boolean;
  doppiaFaccia: boolean;
  onda: boolean;            // THT con saldatrice a onda
  thtMano: boolean;         // THT saldati a mano
  tht: boolean;             // ci sono componenti THT (onda o mano)
  lavaggio: boolean;
  puliziaSaldature: boolean;
  etichette: boolean;
  aoi: boolean;
  controlloVisivo: boolean;
  componentiNostri: boolean; // compriamo noi i componenti (spunta Componenti)
  pcbNostro: boolean;        // compriamo noi i PCB
  lamineNostre: boolean;
  smdAMano: boolean;
  haDocumenti: boolean;      // c'è un pacchetto di documenti del cliente
  haBom: boolean;            // c'è una BOM quotata collegata
  segnalazioniAperte: number; // segnalazioni della preanalisi non ancora "Va bene"
  alternativeDaConfermare: number;
  materialeDalCliente: boolean; // conto lavoro: qualcosa arriva dal cliente
  protezioniOnda: number | null; // fori/zone segnate per l'onda (null = non si applica)
}

/** Spunte del preventivo (parametri si_no) → contesto. */
export function contestoDaParametri(p: Record<string, unknown> | null | undefined, extra: Partial<ContestoPreProduzione> = {}): ContestoPreProduzione {
  const si = (k: string) => Number(p?.[k] ?? 0) > 0;
  const onda = si('usaOnda'), thtMano = si('presenteTht');
  return {
    primoLotto: false, doppiaFaccia: si('doppiaFaccia'), onda, thtMano, tht: onda || thtMano,
    lavaggio: si('lavaggioSchede'), puliziaSaldature: si('puliziaSaldature'), etichette: si('etichette'),
    aoi: si('aoiTop') || si('aoiBot'), controlloVisivo: si('controlloVisivo'),
    componentiNostri: si('acquistoComponenti'), pcbNostro: si('acquistoPcb'), lamineNostre: si('acquistoLamina') || si('laminaTrattamenti'),
    smdAMano: si('smdAMano'), haDocumenti: false, haBom: false, segnalazioniAperte: 0, alternativeDaConfermare: 0, materialeDalCliente: false, protezioniOnda: null,
    ...extra,
  };
}

// ───────────────────────────── checklist finale ─────────────────────────────

export interface VoceChecklist { chiave: string; testo: string; nota?: string; quando?: (c: ContestoPreProduzione) => boolean }

/** Le voci da confermare prima del via libera; `quando` dice se la voce vale per questa commessa. */
export const VOCI_CHECKLIST: VoceChecklist[] = [
  { chiave: 'ordine', testo: 'Quantità, codice, revisione e data di consegna uguali all\'ordine del cliente (e alla conferma d\'ordine)' },
  { chiave: 'documenti', testo: 'Documentazione tecnica controllata: Gerber, BOM e pick and place dell\'ultima revisione', nota: 'Se i file sono cambiati rispetto al preventivo, ricaricarli nei Documenti del cliente e rianalizzare.' },
  { chiave: 'segnalazioni', testo: 'Tutte le segnalazioni della preanalisi chiarite con il cliente o segnate "Va bene"', quando: c => c.haDocumenti },
  { chiave: 'bom', testo: 'BOM quotata controllata: codici Casteltech, alternative confermate dal cliente, nessuna riga "da verificare"', quando: c => c.haBom },
  { chiave: 'materiale', testo: 'Componenti: tutto ordinato o arrivato, con arrivo entro la data di inizio lavorazione', quando: c => c.componentiNostri || c.haBom },
  { chiave: 'materiale-cliente', testo: 'Materiale del cliente (conto lavoro) arrivato, contato e controllato con la BOM', quando: c => c.materialeDalCliente || !c.componentiNostri },
  { chiave: 'pcb', testo: 'PCB arrivati (o in arrivo con data certa), revisione e pannellizzazione giuste', quando: c => c.pcbNostro },
  { chiave: 'pcb-cliente', testo: 'PCB del cliente arrivati, revisione e pannellizzazione controllate', quando: c => !c.pcbNostro },
  { chiave: 'lamine', testo: 'Lamine pronte (una per lato SMD) e controllate con i Gerber della pasta', quando: c => !c.smdAMano },
  { chiave: 'programmi', testo: 'Programmi macchina pronti: armadio, serigrafia, pick and place, AOI, profilo forno (scheda tecnica compilata)', quando: c => !c.smdAMano },
  { chiave: 'aoi', testo: 'Programma AOI pronto per i lati da ispezionare', quando: c => c.aoi && !c.smdAMano },
  { chiave: 'onda', testo: 'Saldatrice a onda: programma, carrello e protezioni segnate sul disegno', quando: c => c.onda },
  { chiave: 'tht-mano', testo: 'Saldatura a mano: punti, filo e sequenza di montaggio chiari agli operatori', quando: c => c.thtMano },
  { chiave: 'lavaggio', testo: 'Lavaggio o pulizia delle saldature: prodotto e ciclo definiti', quando: c => c.lavaggio || c.puliziaSaldature },
  { chiave: 'etichette', testo: 'Etichette: formato, dati e chi le fornisce', quando: c => c.etichette },
  { chiave: 'istruzioni', testo: '"Cosa fare" e "cosa non fare" scritti e spiegati a chi lavora la commessa' },
  { chiave: 'scheda', testo: 'Scheda di produzione stampata con i fogli tempi e il QR' },
];

export const vociPerCommessa = (c: ContestoPreProduzione) => VOCI_CHECKLIST.filter(v => !v.quando || v.quando(c));

export interface StatoChecklist { voci: { voce: VoceChecklist; firma: Firma | null }[]; fatte: number; totale: number; mancanti: VoceChecklist[]; completa: boolean }

export function statoChecklist(pp: PreProduzione, voci: VoceChecklist[]): StatoChecklist {
  const righe = voci.map(voce => ({ voce, firma: pp.checklist[voce.chiave] ?? null }));
  const mancanti = righe.filter(r => !r.firma).map(r => r.voce);
  return { voci: righe, fatte: righe.length - mancanti.length, totale: righe.length, mancanti, completa: !mancanti.length };
}

export interface ModuloPreProduzione {
  spunte: string[];      // chiavi della checklist spuntate
  fare: string; nonFare: string;
  inCasa: string[];      // chiavi delle righe della BOM "già in casa"
  azione: 'salva' | 'via-libera' | 'togli-via-libera';
}

/** Legge il modulo della pagina (valori grezzi del POST). */
export function moduloDaForm(b: Record<string, unknown>): ModuloPreProduzione {
  const elenco = (v: unknown) => [v ?? []].flat().map(x => String(x).trim()).filter(Boolean);
  const testo = (v: unknown) => String(v ?? '').trim().slice(0, 4000);
  const az = String(b.azione ?? 'salva');
  return { spunte: elenco(b.spunte), fare: testo(b.fare), nonFare: testo(b.nonFare), inCasa: elenco(b.inCasa),
    azione: az === 'via-libera' || az === 'togli-via-libera' ? az : 'salva' };
}

/**
 * Nuovo stato dopo il salvataggio: le voci già confermate tengono la loro firma, le nuove prendono chi salva e quando,
 * quelle tolte spariscono. Il via libera si dà solo con tutta la checklist confermata; toglierlo è sempre possibile
 * (la commessa torna "da confermare"). Restituisce anche un messaggio per l'ufficio.
 */
export function aggiornaPreProduzione(prec: PreProduzione, m: ModuloPreProduzione, voci: VoceChecklist[], utente: string, adesso: string): { dati: PreProduzione; errore?: string; messaggio: string } {
  const firma: Firma = { da: utente, il: adesso };
  const chiavi = new Set(voci.map(v => v.chiave));
  const checklist: Record<string, Firma> = {};
  for (const k of m.spunte) if (chiavi.has(k)) checklist[k] = prec.checklist[k] ?? firma;
  const inCasa: Record<string, Firma> = {};
  for (const k of m.inCasa) inCasa[k] = prec.inCasa[k] ?? firma;
  const dati: PreProduzione = { checklist, fare: m.fare, nonFare: m.nonFare, inCasa, viaLibera: prec.viaLibera, aggiornata: firma };
  const stato = statoChecklist(dati, voci);
  if (m.azione === 'togli-via-libera') {
    dati.viaLibera = null;
    return { dati, messaggio: 'Via libera tolto: la commessa torna da confermare.' };
  }
  if (m.azione === 'via-libera') {
    if (!stato.completa) return { dati, errore: `Via libera non dato: mancano ${stato.mancanti.length} voci della checklist (${stato.mancanti.map(v => v.testo.split(':')[0]).join('; ')}). Le altre modifiche sono salvate.`, messaggio: '' };
    dati.viaLibera = firma;
    return { dati, messaggio: `Via libera alla produzione dato da ${utente}.` };
  }
  // le voci tolte dopo il via libera lo fanno decadere: la produzione non deve partire con una verifica aperta
  if (dati.viaLibera && !stato.completa) { dati.viaLibera = null; return { dati, messaggio: 'Salvato. Una voce della checklist è stata tolta: il via libera decade finché non è di nuovo tutto confermato.' }; }
  return { dati, messaggio: `Salvato: ${stato.fatte} voci su ${stato.totale} confermate.` };
}

// ───────────────────────────── cosa fare / cosa non fare proposti dal portale ─────────────────────────────

export interface FontiProposta {
  contesto: ContestoPreProduzione;
  saldaturaMotivo?: string | null;
  noteMontaggio?: string | null;        // scheda tecnica della revisione
  noteCliente?: { refs: string[]; nota: string }[];
  segnalazioniProdotto?: { testo: string; numero?: string | null }[];   // storico delle commesse precedenti
  segnalazioniPreanalisi?: { livello: string; testo: string; accettata?: unknown }[];
  componentiCritici?: string[];         // righe della BOM non quotate / non disponibili
  notePreventivo?: string | null;
}

/** Elenchi proposti ("dal portale"): l'ufficio li legge e scrive i suoi nelle caselle. */
export function propostaCosaFare(f: FontiProposta): { fare: string[]; nonFare: string[] } {
  const c = f.contesto;
  const fare: string[] = [], nonFare: string[] = [];
  if (c.doppiaFaccia) fare.push('SMD su tutti e due i lati: prima il lato con i componenti più piccoli, poi l\'altro (colla o secondo passaggio in forno secondo la scheda tecnica).');
  if (c.smdAMano) fare.push('SMD montati a mano in giostra (campionatura): niente programmi pick and place.');
  if (c.onda) fare.push(`THT con saldatrice a onda${f.saldaturaMotivo ? ` (${f.saldaturaMotivo})` : ''}: proteggere i fori e le zone segnate sul disegno prima del passaggio.`);
  if (c.thtMano) fare.push(`THT saldati a mano${f.saldaturaMotivo && !c.onda ? ` (${f.saldaturaMotivo})` : ''}: filo e punti come da preventivo, controllare il verso dei polarizzati.`);
  if (c.aoi) fare.push('Ispezione AOI dei lati con SMD prima del THT.');
  if (c.controlloVisivo) fare.push('Controllo visivo al posto dell\'AOI: 100% delle schede.');
  if (c.lavaggio) fare.push('Lavaggio delle schede a fine montaggio.');
  if (c.puliziaSaldature) fare.push('Pulizia dei punti di saldatura dopo il THT.');
  if (c.etichette) fare.push('Etichettare le schede (formato e posizione come da ordine).');
  if (c.primoLotto) fare.push('Primo lotto: programmazioni, prova di stampa e prima scheda controllata dall\'ufficio prima di continuare.');
  if (!c.componentiNostri) fare.push('Componenti del cliente: contare il materiale all\'arrivo e segnare sulla BOM quello che manca.');
  for (const n of f.noteCliente ?? []) fare.push(`Nota del cliente su ${n.refs.join(', ')}: ${n.nota}`);
  for (const s of f.segnalazioniProdotto ?? []) fare.push(`Dalle commesse precedenti${s.numero ? ` (${s.numero})` : ''}: ${s.testo}`);
  if (f.noteMontaggio?.trim()) fare.push(`Note di montaggio: ${f.noteMontaggio.trim()}`);
  for (const s of f.segnalazioniPreanalisi ?? []) if (!s.accettata && s.livello !== 'info') nonFare.push(`Non partire finché non è chiarito: ${s.testo}`);
  for (const k of f.componentiCritici ?? []) nonFare.push(`Non montare senza il materiale confermato: ${k}`);
  if (c.onda) nonFare.push('Non passare in onda schede con componenti sensibili non protetti (vedi protezioni sul disegno).');
  if (!c.lavaggio && !c.puliziaSaldature) nonFare.push('Non lavare le schede: il cliente non lo ha chiesto (flussante no-clean).');
  if (c.tht) nonFare.push('Non tagliare i reofori sotto la misura della scheda tecnica; non usare stagno diverso da quello indicato.');
  const nonQuotati = (f.notePreventivo ?? '').split('\n').map(x => x.trim()).filter(x => /non quotat|non disponib/i.test(x));
  for (const r of nonQuotati) nonFare.push(`Dal preventivo: ${r}`);
  return { fare, nonFare };
}

// ───────────────────────────── situazione del materiale ─────────────────────────────

export type StatoMateriale = 'cliente' | 'in_casa' | 'arrivato' | 'parziale' | 'ordinato' | 'da_ordinare' | 'senza_prezzo' | 'non_montato';
export const NOMI_STATO_MATERIALE: Record<StatoMateriale, string> = {
  cliente: 'dal cliente', in_casa: 'già in casa', arrivato: 'arrivato', parziale: 'arrivato in parte', ordinato: 'ordinato, da ricevere',
  da_ordinare: 'da ordinare', senza_prezzo: 'senza prezzo / da decidere', non_montato: 'non montato',
};

export interface RigaMateriale {
  n: number; pn: string | null; produttore: string | null; designatori: string | null; descrizione: string | null; codiceProduzione: string | null;
  qtaScheda: number; esito?: string; clienteFornisce?: boolean; alternativaScelta?: string | null; alternativaProposta?: string | null;
  reperibilita?: { livello: string; motivi?: string[] } | null; prezzoManuale?: number | null;
  acquisti?: { schede: number; lorda: number; scelta?: { fornitore: string; codice: string; mpn: string; qta: number; prezzo: number; totale: number; disponibile: boolean } }[];
}

export interface SituazioneRiga {
  riga: RigaMateriale; chiave: string; stato: StatoMateriale; mpn: string; lotto: number | null;
  scelta: NonNullable<RigaMateriale['acquisti']>[number]['scelta'] | null; ordinata: number; arrivata: number; ordini: string[]; inCasa: Firma | null;
}

/** Chiave stabile di una riga della BOM per segnarla "già in casa" (il P/N comprato, altrimenti il numero di riga). */
export const chiaveRigaMateriale = (r: Pick<RigaMateriale, 'n' | 'pn' | 'alternativaScelta'>) => (r.alternativaScelta || r.pn || '').trim().toUpperCase() || `riga-${r.n}`;

const pulisci = (s: string | null | undefined) => String(s ?? '').trim().toUpperCase();

/**
 * Per ogni riga della BOM: cosa arriva dal cliente, cosa è già in casa (segnato dall'ufficio), cosa è arrivato / ordinato /
 * da ordinare secondo gli ordini a fornitore (`cosaManca`), cosa non ha prezzo. `codiciCliente` = codici in Anagrafiche →
 * Componenti clienti di quel cliente: una riga con quel P/N o codice è materiale in conto lavoro.
 */
export function situazioneMateriale(righe: RigaMateriale[], schede: number | null, esiti: EsitoManca[], codiciCliente: string[], inCasa: Record<string, Firma>): { righe: SituazioneRiga[]; conta: Record<StatoMateriale, number> } {
  const perChiave = new Map<string, EsitoManca>();
  for (const e of esiti) {
    if (e.riga.codice) perChiave.set(`C:${pulisci(e.riga.codice)}`, e);
    const pn = pulisci(e.riga.descrizione).split(' ')[0];
    if (pn && !perChiave.has(`P:${pn}`)) perChiave.set(`P:${pn}`, e);
  }
  const cliente = new Set(codiciCliente.map(pulisci).filter(Boolean));
  const out: SituazioneRiga[] = righe.map(r => {
    const a = schede != null ? (r.acquisti ?? []).find(x => x.schede === schede) : undefined;
    const scelta = a?.scelta ?? null;
    const mpn = scelta?.mpn || r.alternativaScelta || r.pn || '';
    const chiave = chiaveRigaMateriale(r);
    const e = (scelta?.codice && perChiave.get(`C:${pulisci(scelta.codice)}`)) || perChiave.get(`P:${pulisci(mpn)}`) || null;
    const dalCliente = r.esito === 'FORNITO DAL CLIENTE' || !!r.clienteFornisce || cliente.has(pulisci(r.pn)) || cliente.has(pulisci(r.codiceProduzione));
    let stato: StatoMateriale;
    if (r.esito === 'NON MONTATO') stato = 'non_montato';
    else if (dalCliente) stato = 'cliente';
    else if (inCasa[chiave]) stato = 'in_casa';
    else if (e) stato = e.stato === 'arrivato' ? 'arrivato' : e.stato === 'parziale' ? 'parziale' : e.stato === 'ordinato' ? 'ordinato' : 'da_ordinare';
    else if (!scelta || !(scelta.qta > 0)) stato = 'senza_prezzo';
    else stato = 'da_ordinare';
    return { riga: r, chiave, stato, mpn, lotto: a?.lorda ?? null, scelta, ordinata: e?.ordinata ?? 0, arrivata: e?.arrivata ?? 0, ordini: e?.ordini ?? [], inCasa: inCasa[chiave] ?? null };
  });
  const conta = Object.fromEntries(Object.keys(NOMI_STATO_MATERIALE).map(k => [k, 0])) as Record<StatoMateriale, number>;
  for (const x of out) conta[x.stato]++;
  return { righe: out, conta };
}

/** Il materiale è a posto per partire? (niente da ordinare, niente ordinato ma non arrivato, niente senza prezzo) */
export const materialePronto = (conta: Record<StatoMateriale, number>) => !conta.da_ordinare && !conta.ordinato && !conta.parziale && !conta.senza_prezzo;

/** Data e ora in italiano per le firme ("5/11/2026 14:30"), da un ISO. */
export const firmaLeggibile = (f: Firma | null | undefined) => {
  if (!f) return '';
  const d = new Date(f.il);
  const quando = Number.isNaN(d.getTime()) ? f.il : d.toLocaleString('it-IT', { timeZone: 'Europe/Rome', day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return `${f.da}, ${quando}`;
};
