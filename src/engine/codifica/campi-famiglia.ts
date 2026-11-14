/**
 * Campi da compilare per famiglia (Adriano 4/11/2026: "nel momento in cui scelgo la famiglia e la tecnologia, fammi vedere solo i campi
 * che devo inserire, magari con degli esempi"). I campi sono quelli che entrano nel codice di produzione (`FAMIGLIE[fam].prod`) più il
 * case/formato, che serve al codice gestionale di quasi tutte le famiglie (connettori, terminali, batterie e antenne usano il tipo).
 * Qui solo le regole: la pagina della riga BOM nasconde gli altri campi con `public/campi-famiglia.js`.
 */
import { ATTR, COLORI, CNT, FAMIGLIE, type Attr } from './regole.js';
import { TIPI_ANTENNE, TIPI_BATTERIE } from './aggiunte.js';

/** Famiglie il cui codice gestionale non usa il case (lo prende dal tipo). */
const SENZA_CASE = new Set(['CN', 'TI', 'BT', 'AN']);

/** Campi da compilare per la famiglia, nell'ordine dei campi della pagina. Famiglia sconosciuta = tutti. */
export function campiFamiglia(famiglia: string | null | undefined): Attr[] {
  const fam = String(famiglia ?? '').toUpperCase().trim();
  const spec = FAMIGLIE[fam];
  if (!spec) return [...ATTR];
  const servono = new Set<Attr>(spec.prod.filter((k): k is Attr => k !== 'RID' && k !== 'PN'));
  if (!SENZA_CASE.has(fam)) servono.add('case');
  return ATTR.filter(k => servono.has(k));
}

const tipi = (t: Record<string, string>, quanti = 3) => Object.keys(t).slice(0, quanti).join(', ');

/** Esempi per famiglia e campo; `caseTht` = esempio del case quando la tecnologia è T (THT). */
const ESEMPI: Record<string, Partial<Record<Attr, string>> & { caseTht?: string }> = {
  RS: { case: '0603', valore: '10K', tolleranza: '1', potenza: '100MW' },
  RR: { case: '4X0603', valore: '10K', tolleranza: '5', potenza: '63MW' },
  CC: { case: '0603', valore: '100NF', tolleranza: '10', dielettrico: 'X7R', tensione: '50V' },
  CE: { case: 'D6.3X5.4', caseTht: 'D8X11.5', valore: '100UF', tolleranza: '20', tensione: '25V' },
  CT: { case: '3528', valore: '10UF', tolleranza: '10', tensione: '16V' },
  CF: { case: '1206', caseTht: 'P150 (passo 15 mm)', valore: '100NF', tolleranza: '10', tensione: '63V' },
  ID: { case: '0805', valore: '10UH', corrente: '1A', dcr: '0R2' },
  FR: { case: '0603', valore: '600R', tolleranza: '25', corrente: '500MA', dcr: '0R3' },
  FS: { case: '1206', caseTht: '5X20 (clip: CLIP5X20)', corrente: '500MA', tensione: '32V' },
  DI: { case: 'SOD-123', caseTht: 'DO-41', corrente: '1A', tensione: '100V' },
  DS: { case: 'SMA', caseTht: 'DO-41', corrente: '1A', tensione: '40V' },
  DZ: { case: 'SOD-323', potenza: '200MW', valore: '5V1' },
  DL: { case: '0805', caseTht: 'THT', corrente: '20MA', tensione: '2V', colore: 'GIALLO' },
  IC: { case: 'SOIC-8', caseTht: 'DIP-8' },
  TR: { case: 'SOT-23', caseTht: 'TO-92', corrente: '100MA', potenza: '250MW', tensione: '45V' },
  TB: { case: 'SOT-23', caseTht: 'TO-92', corrente: '500MA', tensione: '50V', tipo: 'NPN' },
  TM: { case: 'SOT-23', caseTht: 'TO-220', corrente: '3A', tensione: '30V', tipo: 'N' },
  TS: { case: 'SOT-223', caseTht: 'TO-220', corrente: '8A', tensione: '600V' },
  SP: { case: 'SMB', corrente: '10A', potenza: '600W', tensione: '15V' },
  VR: { case: '0603', tensione: '14V' },
  QZ: { case: '3225', valore: '16MHZ', tolleranza: '20PPM' },
  OS: { case: '3225', valore: '25MHZ', tensione: '3V3' },
  RI: { valore: '8MHZ' },
  CN: { tipo: 'RJ45, ' + tipi(CNT), passo: '2.54', poli: '10' },
  TI: { tipo: tipi(CNT), passo: '2.54', poli: '2' },
  IT: { tensione: '12V' },
  DW: { corrente: '25MA', tensione: '24V' },
  PO: { valore: '10K' },
  NT: { case: '0603', valore: '10K', tolleranza: '1' },
  BT: { tipo: tipi(TIPI_BATTERIE) },
  AN: { tipo: tipi(TIPI_ANTENNE, 4) },
};

/**
 * Consiglio sotto i campi (Adriano 4/11/2026, RJ45 HR911105A in MI: "non riesce a trovare il codice gestionale"): in MI il gestionale vuole un case
 * in tabella, che per un connettore THT non c'è; i connettori vanno in CN con Tipo, Passo e Poli.
 */
export const CONSIGLI: Record<string, string> = {
  MI: 'Se è un connettore (RJ45, USB, morsetto, strip, presa, coassiale…) scegli la famiglia CN · Connettori: Tipo (es. RJ45, COASSIALE), Passo in mm e Poli se li ha.',
  CN: 'Passo e Poli solo se il connettore li ha: un coassiale (U.FL, SMA), un portascheda o un jack si codificano con il solo Tipo e il P/N.',
  IC: 'Per un integrato THT scrivi la custodia nel Case/Formato (es. DIP-8), non solo "THT".',
};

/** Esempio da mostrare nella casella (vuoto se non c'è un esempio sicuro). */
export function esempioCampo(famiglia: string | null | undefined, campo: Attr, tecnologia?: string | null): string {
  const fam = String(famiglia ?? '').toUpperCase().trim();
  const e = ESEMPI[fam];
  if (!e) return '';
  if (campo === 'colore' && fam === 'DL') return Object.keys(COLORI).slice(0, 4).join(', ');
  if (campo === 'case' && String(tecnologia ?? '').toUpperCase() === 'T' && e.caseTht) return e.caseTht;
  return e[campo] ?? '';
}

/** Tutto quello che serve alla pagina: per famiglia i campi e gli esempi (SMD e THT), in un oggetto da mettere in data-campi. */
export function mappaCampiFamiglie(): Record<string, { campi: Attr[]; esempi: Record<string, string>; esempiTht: Record<string, string>; consiglio?: string }> {
  const out: Record<string, { campi: Attr[]; esempi: Record<string, string>; esempiTht: Record<string, string>; consiglio?: string }> = {};
  for (const fam of Object.keys(FAMIGLIE)) {
    const campi = campiFamiglia(fam);
    const esempi: Record<string, string> = {}, esempiTht: Record<string, string> = {};
    for (const k of campi) {
      const s = esempioCampo(fam, k, 'S'), t = esempioCampo(fam, k, 'T');
      if (s) esempi[k] = s;
      if (t) esempiTht[k] = t;
    }
    out[fam] = CONSIGLI[fam] ? { campi, esempi, esempiTht, consiglio: CONSIGLI[fam] } : { campi, esempi, esempiTht };
  }
  return out;
}
