/**
 * DDT in ingresso (Adriano 6/11/2026): i DDT che arrivano dai FORNITORI (merce ordinata con un ordine a fornitore) e dai CLIENTI
 * (materiale in conto lavoro, schede da rilavorare) si scansionano e si mettono in Da acquisire o nella cartella Drive.
 * L'IA li legge, qui si incrociano le righe con gli ordini e si segnalano le anomalie; l'ufficio controlla e conferma.
 * Solo calcoli: niente database e niente rete.
 */
import { dataDa, numeroDa } from './acquisizioni.js';
import { chiaveCodice } from './componenti-clienti.js';

export type Mittente = 'fornitore' | 'cliente';
export const NOMI_MITTENTE: Record<Mittente, string> = { fornitore: 'fornitore', cliente: 'cliente' };

export interface RigaRicevuta { codice: string; descrizione: string; quantita: number }
export interface DdtRicevutoLetto {
  mittente: string;          // ragione sociale di chi ha emesso il DDT, come scritta
  partitaIva: string;        // P.IVA del mittente se scritta (serve a trovarlo in anagrafica)
  numero: string;            // numero del DDT come scritto (anche "2026/00123")
  data: string | null;
  rifOrdine: string;         // ordine citato: il nostro ordine a fornitore, oppure l'ordine del cliente
  righe: RigaRicevuta[];
  note: string;
}

export interface Anomalia { livello: 'errore' | 'avviso'; testo: string }

const maiuscolo = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim().toUpperCase();

/** Pulisce il DDT ricevuto letto dall'IA: maiuscolo, numeri, righe senza quantità tolte. */
export function normalizzaDdtRicevuto(x: any): DdtRicevutoLetto {
  return {
    mittente: maiuscolo(x?.mittente ?? x?.fornitore ?? x?.cliente), partitaIva: maiuscolo(x?.partita_iva ?? x?.partitaIva).replace(/[^A-Z0-9]/g, ''),
    numero: maiuscolo(x?.numero).slice(0, 40), data: dataDa(x?.data), rifOrdine: maiuscolo(x?.rif_ordine ?? x?.rifOrdine).slice(0, 120),
    note: String(x?.note ?? '').trim().slice(0, 500),
    righe: (Array.isArray(x?.righe) ? x.righe : []).map((r: any) => ({ codice: maiuscolo(r?.codice), descrizione: maiuscolo(r?.descrizione), quantita: numeroDa(r?.quantita) ?? 0 }))
      .filter((r: RigaRicevuta) => (r.codice || r.descrizione) && r.quantita > 0),
  };
}

/**
 * Numero (e anno) dell'ordine citato sul DDT: "ordine n. 205 del 30/10/2026", "205/2026", "2026/205", "Vs. ord. 205".
 * Le date (30/10/2026) non si confondono con il numero. null se non c'è un numero.
 */
export function ordineCitato(rif: string | null | undefined): { numero: number; anno: number | null } | null {
  const t = String(rif ?? '').toUpperCase();
  if (!t.trim()) return null;
  // le date tolte prima, così "205 DEL 30/10/2026" non legge 30/10
  const senzaDate = t.replace(/\b\d{1,2}[/.-]\d{1,2}[/.-](\d{2,4})\b/g, ' ANNO$1 ');
  let m = /\b(\d{1,5})\s*[/-]\s*(20\d{2})\b/.exec(senzaDate);
  if (m) return { numero: Number(m[1]), anno: Number(m[2]) };
  m = /\b(20\d{2})\s*[/-]\s*(\d{1,5})\b/.exec(senzaDate);
  if (m) return { numero: Number(m[2]), anno: Number(m[1]) };
  const numeri = [...senzaDate.matchAll(/(?<![A-Z0-9])(\d{1,5})(?![A-Z0-9])/g)].map(k => Number(k[1])).filter(n => n > 0);
  if (!numeri.length) return null;
  const anno = /ANNO(\d{2,4})/.exec(senzaDate)?.[1];
  return { numero: numeri[0], anno: anno ? (anno.length === 2 ? 2000 + Number(anno) : Number(anno)) : null };
}

// ───────────────────────────── DDT dei fornitori: incrocio con gli ordini a fornitore ─────────────────────────────

/** Riga di un ordine a fornitore emesso (anche già arrivata tutta: serve a dire "era già arrivato"). */
export interface RigaOrdineFornitoreAperta {
  ordineId: number; ordine: string; fornitoreId: number | null; posizione: number;
  codice: string | null; descrizione: string; quantita: number; arrivati: number;
}
/** Riga del DDT dopo l'incrocio: a quale riga d'ordine va (ordineId + posizione), quanti pezzi restavano da ricevere, l'anomalia se c'è. */
export interface RigaFornitoreAbbinata extends RigaRicevuta { ordineId: number | null; posizione: number | null; ordine: string | null; attesi: number | null; anomalia: string | null }

const pulisci = (s: string | null | undefined) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * Parole con cui si riconosce lo stesso articolo: il codice (del distributore o del produttore) e le parole della descrizione
 * che sembrano codici (almeno 4 caratteri con una cifra), senza trattini e punti (296-23466-1-ND = 29623466 1ND).
 */
export function chiaviArticolo(codice: string | null | undefined, descrizione: string | null | undefined): string[] {
  const out = new Set<string>();
  const c = pulisci(codice);
  if (c.length >= 3) out.add(c);
  for (const p of String(descrizione ?? '').toUpperCase().split(/[\s,;()]+/)) {
    const k = pulisci(p);
    if (k.length >= 4 && /\d/.test(k)) out.add(k);
  }
  return [...out];
}
/** Stesso articolo: una chiave uguale, oppure una che finisce con l'altra (595-TPS54302DDCR di Mouser = TPS54302DDCR), con almeno 6 caratteri. */
export function stessoArticolo(a: string[], b: string[]): boolean {
  return a.some(x => b.some(y => x === y || (x.length >= 6 && y.length >= 6 && (x.endsWith(y) || y.endsWith(x)))));
}

const it = (n: number) => n.toLocaleString('it-IT', { useGrouping: true, maximumFractionDigits: 3 });

/**
 * Per ogni riga del DDT del fornitore propone la riga dell'ordine a fornitore: stesso articolo, prima le righe dell'ordine citato
 * sul DDT, poi quelle con pezzi ancora da ricevere, poi l'ordine più vecchio. Una riga d'ordine riempita passa alla successiva.
 * Anomalie: mittente non in anagrafica, nessun ordine emesso al fornitore, ordine citato non trovato o di un altro fornitore,
 * righe arrivate senza ordine, pezzi in più di quelli attesi, righe dell'ordine citato che mancano ancora (consegna parziale).
 */
export function abbinaDdtFornitore(d: { righe: RigaRicevuta[]; rifOrdine: string }, ctx: {
  fornitoreId: number | null; aperte: RigaOrdineFornitoreAperta[];
  /** ordini emessi ad ALTRI fornitori (solo numero e nome), per dire che l'ordine citato è di un altro */
  altri?: { ordineId: number; numero: number | null; anno: number; fornitore: string | null }[];
  /** righe già abbinate dall'ufficio: indice della riga del DDT → ordineId e posizione (null = nessun ordine, voluto) */
  scelte?: (({ ordineId: number; posizione: number } | null) | undefined)[];
}): { righe: RigaFornitoreAbbinata[]; anomalie: Anomalia[] } {
  const anomalie: Anomalia[] = [];
  const { aperte } = ctx;
  if (!ctx.fornitoreId) anomalie.push({ livello: 'errore', testo: "Mittente non trovato nell'anagrafica fornitori: scegli il fornitore (o aggiungilo in Anagrafiche → Fornitori)." });
  else if (!aperte.length) anomalie.push({ livello: 'errore', testo: 'Nessun ordine a fornitore emesso a questo fornitore: merce arrivata senza ordine.' });
  const citato = ordineCitato(d.rifOrdine);
  const chiaveOrdine = (o: { numero: number | null; anno: number }) => !!citato && o.numero === citato.numero && (citato.anno == null || citato.anno === o.anno);
  const ordiniCitati = new Set<number>();
  for (const r of aperte) {
    const [numero, anno] = r.ordine.split('/');
    if (chiaveOrdine({ numero: Number(numero), anno: Number(anno) })) ordiniCitati.add(r.ordineId);
  }
  if (citato && !ordiniCitati.size) {
    const altro = (ctx.altri ?? []).find(chiaveOrdine);
    anomalie.push(altro
      ? { livello: 'errore', testo: `Il DDT cita l'ordine ${citato.numero}${citato.anno ? `/${citato.anno}` : ''}, che è stato emesso a un altro fornitore (${altro.fornitore ?? '?'}).` }
      : { livello: 'avviso', testo: `Il DDT cita l'ordine ${citato.numero}${citato.anno ? `/${citato.anno}` : ''}, che non è tra gli ordini emessi a questo fornitore nel portale.` });
  }
  const resta = new Map<string, number>(aperte.map(r => [`${r.ordineId}:${r.posizione}`, r.quantita - r.arrivati]));
  const chiaviDi = new Map(aperte.map(r => [`${r.ordineId}:${r.posizione}`, chiaviArticolo(r.codice, r.descrizione)]));
  const righe: RigaFornitoreAbbinata[] = d.righe.map((r, i) => {
    const scelta = ctx.scelte?.[i];
    let riga: RigaOrdineFornitoreAperta | undefined;
    if (scelta === null) return { ...r, ordineId: null, posizione: null, ordine: null, attesi: null, anomalia: null };
    if (scelta) riga = aperte.find(a => a.ordineId === scelta.ordineId && a.posizione === scelta.posizione);
    if (!riga) {
      const mie = chiaviArticolo(r.codice, r.descrizione);
      const candidate = aperte.filter(a => stessoArticolo(mie, chiaviDi.get(`${a.ordineId}:${a.posizione}`)!))
        .sort((a, b) => Number(ordiniCitati.has(b.ordineId)) - Number(ordiniCitati.has(a.ordineId))
          || Number((resta.get(`${b.ordineId}:${b.posizione}`) ?? 0) > 0) - Number((resta.get(`${a.ordineId}:${a.posizione}`) ?? 0) > 0)
          || a.ordineId - b.ordineId || a.posizione - b.posizione);
      riga = candidate[0];
    }
    if (!riga) return { ...r, ordineId: null, posizione: null, ordine: null, attesi: null,
      anomalia: aperte.length ? 'non corrisponde a nessuna riga degli ordini emessi a questo fornitore' : 'nessun ordine' };
    const k = `${riga.ordineId}:${riga.posizione}`;
    const attesi = Math.max(0, resta.get(k) ?? 0);
    resta.set(k, (resta.get(k) ?? 0) - r.quantita);
    let anomalia: string | null = null;
    if (attesi <= 0) anomalia = `la riga dell'ordine ${riga.ordine} risulta già arrivata tutta (${it(riga.arrivati)} su ${it(riga.quantita)})`;
    else if (r.quantita > attesi) anomalia = `arrivati ${it(r.quantita)} pezzi, ne restavano da ricevere ${it(attesi)} sull'ordine ${riga.ordine}`;
    else if (citato && ordiniCitati.size && !ordiniCitati.has(riga.ordineId)) anomalia = `abbinata all'ordine ${riga.ordine}, non a quello citato sul DDT`;
    return { ...r, ordineId: riga.ordineId, posizione: riga.posizione, ordine: riga.ordine, attesi, anomalia };
  });
  const senzaOrdine = righe.filter(r => !r.ordineId && r.anomalia);
  if (senzaOrdine.length && ctx.fornitoreId && aperte.length)
    anomalie.push({ livello: 'errore', testo: `${senzaOrdine.length === 1 ? '1 riga del DDT non corrisponde' : `${senzaOrdine.length} righe del DDT non corrispondono`} a nessuna riga ordinata: ${senzaOrdine.map(r => r.codice || r.descrizione.slice(0, 30)).join(', ')}.` });
  const inPiu = righe.filter(r => r.ordineId && r.anomalia);
  for (const r of inPiu) anomalie.push({ livello: 'avviso', testo: `${r.codice || r.descrizione.slice(0, 30)}: ${r.anomalia}.` });
  // consegna parziale: righe dell'ordine citato che non sono su questo DDT e restano da ricevere
  if (ordiniCitati.size) {
    const mancano = aperte.filter(a => ordiniCitati.has(a.ordineId) && (resta.get(`${a.ordineId}:${a.posizione}`) ?? 0) > 0
      && !righe.some(r => r.ordineId === a.ordineId && r.posizione === a.posizione));
    if (mancano.length) anomalie.push({ livello: 'avviso', testo: `Consegna parziale: dell'ordine ${mancano[0].ordine} restano da ricevere ${mancano.map(a =>
      `${a.codice || a.descrizione.slice(0, 30)} (${it(resta.get(`${a.ordineId}:${a.posizione}`) ?? 0)})`).join(', ')}.` });
  }
  return { righe, anomalie };
}

// ───────────────────────────── DDT dei clienti: materiale in arrivo per gli ordini ─────────────────────────────

export interface ContestoCliente {
  clienteId: number | null;
  componenti: { id: number; codice: string; descrizione: string | null }[];       // componenti del cliente (conto lavoro)
  prodotti: { id: number; codice: string; descrizione: string | null }[];         // prodotti del cliente (schede che tornano)
  ordini: { id: number; numero: number; anno: number; rifCliente: string | null;
    righe: { id: number; codice: string | null; codiceCliente: string | null; descrizione: string | null; prodottoId: number | null; residuo: number }[] }[];   // ordini aperti del cliente
  /** scelte già fatte dall'ufficio per riga: 'c:ID' componente, 'p:ID' prodotto, '' nessuno; undefined = da proporre */
  scelte?: (string | undefined)[];
  ordineScelto?: number | null;   // ordine scelto dall'ufficio (undefined = da proporre)
}
export interface RigaClienteAbbinata extends RigaRicevuta { componenteClienteId: number | null; prodottoId: number | null; rigaOrdineId: number | null; anomalia: string | null }

/**
 * DDT di un cliente che ci manda materiale: ogni riga si cerca tra i componenti del cliente (codici suoi, conto lavoro) e tra i suoi
 * prodotti (schede che tornano per rilavorazione); l'ordine del cliente è quello citato sul DDT (suo riferimento o numero nostro),
 * altrimenti l'unico aperto; le schede si legano alla riga d'ordine dello stesso codice. Anomalie: cliente non in anagrafica,
 * codici sconosciuti (da aggiungere ai componenti del cliente), nessun ordine aperto, ordine citato non trovato, più ordini aperti.
 */
export function abbinaDdtCliente(d: { righe: RigaRicevuta[]; rifOrdine: string }, ctx: ContestoCliente):
  { righe: RigaClienteAbbinata[]; ordineId: number | null; anomalie: Anomalia[] } {
  const anomalie: Anomalia[] = [];
  if (!ctx.clienteId) anomalie.push({ livello: 'errore', testo: "Mittente non trovato nell'anagrafica clienti: scegli il cliente." });
  const rif = pulisci(d.rifOrdine);
  const citato = ordineCitato(d.rifOrdine);
  let ordine = ctx.ordineScelto !== undefined ? ctx.ordini.find(o => o.id === ctx.ordineScelto) ?? null : null;
  if (ctx.ordineScelto === undefined) {
    // riferimento del cliente scritto sul DDT (anche dentro un testo più lungo), poi il nostro numero
    ordine = (rif ? ctx.ordini.find(o => pulisci(o.rifCliente) && (pulisci(o.rifCliente) === rif || rif.includes(pulisci(o.rifCliente)))) : undefined)
      ?? (citato ? ctx.ordini.find(o => o.numero === citato.numero && (citato.anno == null || citato.anno === o.anno)) : undefined) ?? null;
    if (!ordine && d.rifOrdine && ctx.clienteId && ctx.ordini.length) anomalie.push({ livello: 'avviso', testo: `Il DDT cita l'ordine «${d.rifOrdine}», che non si trova tra gli ordini aperti del cliente.` });
    if (!ordine && ctx.ordini.length === 1) ordine = ctx.ordini[0];
    if (!ordine && ctx.ordini.length > 1 && ctx.clienteId) anomalie.push({ livello: 'avviso', testo: `Il cliente ha ${ctx.ordini.length} ordini aperti e il DDT non ne cita uno: scegli a quale ordine serve il materiale.` });
  }
  if (ctx.clienteId && !ctx.ordini.length) anomalie.push({ livello: 'errore', testo: 'Il cliente non ha ordini aperti nel portale: materiale arrivato senza un ordine da evadere.' });
  const perCodice = <T extends { codice: string }>(elenco: T[], codice: string, descrizione: string): T | undefined => {
    const k = chiaveCodice(codice);
    if (k) { const x = elenco.find(e => chiaveCodice(e.codice) === k); if (x) return x; }
    // codice del cliente scritto dentro la descrizione ("PCB WPA CODICE SEL-PCB-WPA"): parola per parola, senza trattini
    const parole = String(descrizione ?? '').split(/[\s,;()]+/).map(p => chiaveCodice(p)).filter(p => p.length >= 4);
    return elenco.find(e => { const c = chiaveCodice(e.codice); return c.length >= 4 && parole.includes(c); });
  };
  const resta = new Map<number, number>(ctx.ordini.flatMap(o => o.righe.map(r => [r.id, r.residuo] as [number, number])));
  const righe: RigaClienteAbbinata[] = d.righe.map((r, i) => {
    const scelta = ctx.scelte?.[i];
    let componente = scelta?.startsWith('c:') ? ctx.componenti.find(c => c.id === Number(scelta.slice(2))) : undefined;
    let prodotto = scelta?.startsWith('p:') ? ctx.prodotti.find(p => p.id === Number(scelta.slice(2))) : undefined;
    if (scelta === undefined) {
      componente = perCodice(ctx.componenti, r.codice, r.descrizione);
      if (!componente) prodotto = perCodice(ctx.prodotti, r.codice, r.descrizione);
    }
    let rigaOrdineId: number | null = null;
    if (prodotto) {
      const k = chiaveCodice(prodotto.codice);
      const candidate = (ordine ? [ordine, ...ctx.ordini.filter(o => o !== ordine)] : ctx.ordini)
        .flatMap(o => o.righe.filter(x => x.prodottoId === prodotto!.id || chiaveCodice(x.codice) === k || chiaveCodice(x.codiceCliente) === k))
        .sort((a, b) => Number((resta.get(b.id) ?? 0) > 0) - Number((resta.get(a.id) ?? 0) > 0));
      if (candidate[0]) { rigaOrdineId = candidate[0].id; resta.set(rigaOrdineId, (resta.get(rigaOrdineId) ?? 0) - r.quantita); }
    }
    const anomalia = scelta === '' ? null : !componente && !prodotto
      ? "codice non in anagrafica del cliente (né tra i suoi componenti né tra i suoi prodotti)" : null;
    return { ...r, componenteClienteId: componente?.id ?? null, prodottoId: prodotto?.id ?? null, rigaOrdineId, anomalia };
  });
  const sconosciuti = righe.filter(r => r.anomalia);
  if (sconosciuti.length && ctx.clienteId)
    anomalie.push({ livello: 'avviso', testo: `${sconosciuti.length === 1 ? '1 codice non è' : `${sconosciuti.length} codici non sono`} nell'anagrafica del cliente: ${sconosciuti.map(r => r.codice || r.descrizione.slice(0, 30)).join(', ')} (aggiungili in Anagrafiche → Componenti clienti se è materiale in conto lavoro).` });
  return { righe, ordineId: ordine?.id ?? null, anomalie };
}

/** Testo breve delle anomalie per gli elenchi: "2 anomalie (1 da sistemare)". */
export function riassuntoAnomalie(anomalie: Anomalia[]): string {
  if (!anomalie.length) return '';
  const errori = anomalie.filter(a => a.livello === 'errore').length;
  return `${anomalie.length === 1 ? '1 anomalia' : `${anomalie.length} anomalie`}${errori ? ` (${errori} da sistemare)` : ''}`;
}
