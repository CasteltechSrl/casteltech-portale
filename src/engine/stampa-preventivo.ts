/**
 * Versioni della stampa del preventivo per il cliente (Adriano, 28/10/2026). Usa solo i risultati del calcolo
 * (src/engine/calcolo.ts): raggruppa i prezzi già calcolati, senza cambiare le formule economiche.
 *  - Essenziale: codice, quantità, prezzo a scheda e niente sotto la descrizione (o il dettaglio con i prezzi o niente);
 *    con le una tantum il prezzo a scheda le comprende e sotto c'è solo "Comprensivo dei costi una tantum".
 *  - Essenziale con dettaglio: componenti, PCB, SMD, THT, materiale di consumo, spedizione, ognuno con il prezzo.
 *    Gestione materiale e imballaggio non si vedono: vanno su SMD e THT (vedi `quotaSmd`).
 *  - Macro aree e Dettaglio per fasi: come prima.
 */
import { r2, type Risultato, type RigaFase, type RigaVoce } from './calcolo.js';

export type VersioneStampa = 'essenziale' | 'dettaglio' | 'macro' | 'fasi';

export const VERSIONI_STAMPA: { codice: VersioneStampa; nome: string; spiegazione: string }[] = [
  { codice: 'essenziale', nome: 'Essenziale', spiegazione: 'Codice, quantità e prezzo a scheda, senza dettaglio. Le una tantum sono comprese nel prezzo.' },
  { codice: 'dettaglio', nome: 'Essenziale con dettaglio', spiegazione: 'Componenti, PCB, SMD, THT, consumo e spedizione, ognuno con il suo prezzo.' },
  { codice: 'macro', nome: 'Macro aree', spiegazione: 'Un prezzo per ogni area di lavorazione.' },
  { codice: 'fasi', nome: 'Dettaglio per fasi', spiegazione: 'Tutte le fasi di lavorazione con il prezzo.' },
];

/** Versione chiesta nell'indirizzo (?vista=…); se manca o non esiste: Essenziale con dettaglio. */
export function versioneStampa(x: unknown): VersioneStampa {
  return VERSIONI_STAMPA.some(v => v.codice === x) ? x as VersioneStampa : 'dettaglio';
}

/** Gestione materiale e imballaggio: 70 % su SMD e 30 % su THT (Adriano, 28/10/2026). */
export const QUOTA_SMD = 0.7;

/**
 * Parte (da 0 a 1) dei costi comuni che va su SMD. Il 70/30 è pesato sul valore delle due aree:
 * SMD 100 € e THT 100 € → 70 %; SMD 10 € e THT 90 € → 7 / (7 + 27) = 20,6 %. Senza THT tutto su SMD e viceversa.
 */
export function quotaSmd(smd: number, tht: number, quota = QUOTA_SMD): number {
  const s = quota * Math.max(smd, 0), t = (1 - quota) * Math.max(tht, 0);
  return s + t > 0 ? s / (s + t) : 1;
}

export interface RigaStampa {
  nome: string;
  /** elenco di cosa comprende (es. fasi di completamento) */
  sotto?: string;
  scheda: number;   // € a scheda
  lotto: number;    // € del lotto
}

const somma = (xs: { prezzo: number }[]) => r2(xs.reduce((a, x) => a + x.prezzo, 0));

/** Gruppi del catalogo che diventano una riga della versione con dettaglio. */
const COMUNI = ['GESTIONE MATERIALE', 'IMBALLAGGIO', 'PRE-PRODUZIONE'];   // vanno su SMD e THT
const CONSUMO = ['MATERIALE DI CONSUMO', 'ENERGIA'];

const nomeArea = (g: string) => (g.charAt(0) + g.slice(1).toLowerCase()).replace(/\b(smd|tht|aoi|pcb|bot|top)\b/gi, x => x.toUpperCase());

/**
 * Righe della versione "Essenziale con dettaglio" (solo lotti ricorrenti: le una tantum sono a parte).
 * La somma delle righe è uguale al prezzo a scheda e al totale del lotto del preventivo.
 */
export function righeDettaglio(ris: Risultato): RigaStampa[] {
  const n = ris.totali.nSchede;
  const fasi = ris.fasi.filter(f => !f.unaTantum && f.prezzo > 0);
  const voci = ris.voci.filter(v => !v.unaTantum && v.prezzo > 0);
  const fasiDi = (g: string) => fasi.filter(f => f.gruppo === g);
  const smd = somma(fasiDi('SMD')), tht = somma(fasiDi('THT'));
  const comuni = somma(fasi.filter(f => COMUNI.includes(f.gruppo)));
  const suSmd = r2(comuni * quotaSmd(smd, tht));

  const righe: { nome: string; sotto?: string; lotto: number }[] = [];
  const voce = (cod: string) => voci.find(v => v.codice === cod);
  const comp = voce('valoreAcquistoComponenti'), pcb = voce('valoreAcquistoPCB');
  if (comp) righe.push({ nome: 'Acquisto componenti', lotto: comp.prezzo });
  if (pcb) righe.push({ nome: 'Acquisto PCB', lotto: pcb.prezzo });
  for (const v of voci.filter(v => v.gruppo === 'MATERIALE PER PRODUZIONE' && v !== comp && v !== pcb)) righe.push({ nome: `Acquisto ${v.nome.toLowerCase()}`, lotto: v.prezzo });
  if (smd + tht > 0) {
    if (smd > 0) righe.push({ nome: 'Montaggio SMD', lotto: r2(smd + suSmd) });
    if (tht > 0) righe.push({ nome: 'Montaggio THT', lotto: r2(tht + comuni - suSmd) });
  } else if (comuni > 0) righe.push({ nome: 'Gestione materiale e imballaggio', lotto: comuni });
  // altre aree di lavorazione (completamento e quelle aggiunte dal pannello Impostazioni)
  const note = new Set(['SMD', 'THT', ...COMUNI]);
  for (const g of [...new Set(fasi.map(f => f.gruppo))].filter(g => !note.has(g))) {
    const xs = fasiDi(g);
    righe.push({ nome: g === 'COMPLETAMENTO' ? 'Lavorazioni di completamento' : nomeArea(g), sotto: xs.map(f => f.nome).join(', '), lotto: somma(xs) });
  }
  const consumo = somma(voci.filter(v => CONSUMO.includes(v.gruppo)));
  if (consumo > 0) righe.push({ nome: 'Materiale di consumo', lotto: consumo });
  const sped = somma(voci.filter(v => v.gruppo === 'SPEDIZIONE'));
  if (sped > 0) righe.push({ nome: 'Spedizione', lotto: sped });
  const usati = new Set(['MATERIALE PER PRODUZIONE', 'SPEDIZIONE', ...CONSUMO]);
  for (const g of [...new Set(voci.map(v => v.gruppo))].filter(g => !usati.has(g))) righe.push({ nome: nomeArea(g), lotto: somma(voci.filter(v => v.gruppo === g)) });

  const out: RigaStampa[] = righe.map(x => ({ ...x, scheda: n ? r2(x.lotto / n) : 0 }));
  // i centesimi persi negli arrotondamenti vanno sulla riga più grande, così i totali tornano
  if (out.length) {
    const grande = out.reduce((a, x) => (x.lotto > a.lotto ? x : a));
    grande.lotto = r2(grande.lotto + ris.totali.totaleSecondoLotto - out.reduce((a, x) => a + x.lotto, 0));
    grande.scheda = r2(grande.scheda + ris.totali.prezzoSchedaSecondoLotto - out.reduce((a, x) => a + x.scheda, 0));
  }
  return out;
}

/**
 * Costi una tantum per il cliente: documentazione, programmazione attrezzature (tutte le altre fasi una tantum),
 * lamine, attrezzaggio PCB; con il BOT si dice che sono raddoppiati.
 */
export function righeUnaTantum(ris: Risultato, o: { doppia: boolean; nLamine: number }): { nome: string; prezzo: number }[] {
  const fasiUT: RigaFase[] = ris.fasi.filter(f => f.unaTantum && f.prezzo > 0);
  const doc = fasiUT.filter(f => f.codice === 'prepDocumentazione');
  const altre = fasiUT.filter(f => f.codice !== 'prepDocumentazione');
  const perLato = o.doppia ? ' — TOP e BOT (×2)' : '';
  const nome = (x: RigaVoce) => x.codice === 'laminaSerigrafica'
    ? (o.nLamine > 1 ? `Lamine serigrafiche (${o.nLamine}${o.doppia && o.nLamine === 2 ? ': TOP e BOT' : ''})` : 'Lamina serigrafica')
    : x.codice === 'attrezzaggioPCB' ? 'Attrezzaggio PCB' : x.nome;
  return [
    ...(doc.length ? [{ nome: `Preparazione documentazione${perLato}`, prezzo: somma(doc) }] : []),
    ...(altre.length ? [{ nome: `Programmazione attrezzature di produzione${perLato}`, prezzo: somma(altre) }] : []),
    ...ris.voci.filter(x => x.unaTantum && x.prezzo > 0).map(x => ({ nome: nome(x), prezzo: x.prezzo })),
  ];
}

/** Condizioni generali stampate sotto il preventivo (testi standard di tutela, da rivedere con Adriano). */
export const CONDIZIONI_GENERALI = [
  'Offerta valida 30 giorni dalla data. Prezzi in euro, IVA esclusa, franco nostro stabilimento salvo spedizione indicata.',
  'Componenti e PCB: prezzi e disponibilità sono quelli del giorno dell\'offerta; variazioni del mercato saranno comunicate prima dell\'acquisto.',
  'Lavorazione eseguita secondo la documentazione del cliente (BOM, file di montaggio, Gerber) e lo standard IPC-A-610 classe 2. Errori o mancanze nella documentazione sono a carico del cliente.',
  'Materiale fornito dal cliente: completo, identificato e con la scorta per l\'attrezzaggio delle macchine. Non rispondiamo di componenti difettosi o non conformi forniti dal cliente.',
  'Tempi di consegna indicativi, a partire dal ricevimento del materiale e della documentazione completi.',
  'Collaudo funzionale compreso solo se indicato. Reclami entro 8 giorni dal ricevimento della merce; la garanzia è limitata al rifacimento o alla riparazione della lavorazione, esclusi danni indiretti.',
  'Costi una tantum fatturati con il primo lotto. Per ogni controversia è competente il Foro di Piacenza.',
];
