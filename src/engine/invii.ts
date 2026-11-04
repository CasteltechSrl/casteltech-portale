/**
 * Segno "Inviato" sui documenti del portale (Adriano 4/11/2026): preventivi, conferme d'ordine, DDT, fatture, note di credito,
 * autofatture, ordini a fornitore. Negli elenchi e nella scheda un segno chiaro con data e destinatario; NESSUN segno = ancora da inviare.
 * Le fatture hanno due invii diversi: per email (copia di cortesia) e allo SdI (quello che conta fiscalmente), con due segni separati.
 * Solo regole, niente database: le letture stanno nei servizi delle pagine.
 */

/** Tipi di documento che vanno allo SdI (fatture e simili). */
export const TIPI_SDI = ['fattura', 'nota_credito', 'nota_debito', 'autofattura'];

/** Dati di un documento che servono per il segno (colonne di `documenti` o `preventivi`, più la data dell'invio allo SdI). */
export interface DatiInvio {
  tipo?: string | null;
  origine?: string | null;
  stato?: string | null;
  email_a?: string | null;
  email_inviata_il?: Date | string | null;
  /** segnato inviato a mano dall'ufficio (mandato da fuori del portale: posta, a mano, PEC…) */
  inviato_a_mano?: boolean | null;
  sdi_stato?: string | null;
  sdi_inviato_il?: Date | string | null;
}

export type LivelloInvio = 'ok' | 'attesa' | 'errore';
export interface SegnoInvio {
  canale: 'email' | 'sdi' | 'fic' | 'mano';
  /** testo breve per gli elenchi: "Inviato 04/11/2026" */
  breve: string;
  /** frase per la scheda: "Inviato per email a x@y.it il 04/11/2026 alle 10:15" */
  frase: string;
  livello: LivelloInvio;
}

const quando = (d: Date | string | null | undefined, ora = true): string => {
  if (!d) return '';
  const x = d instanceof Date ? d : new Date(String(d).length === 10 ? `${d}T12:00:00` : String(d));
  if (Number.isNaN(x.getTime())) return '';
  const g = x.toLocaleDateString('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric' });
  return ora ? `${g} alle ${x.toLocaleTimeString('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' })}` : g;
};

/** Stati dello SdI: come si chiamano nel segno e quanto vanno bene. */
const SDI: Record<string, { breve: string; frase: string; livello: LivelloInvio }> = {
  caricato: { breve: 'SdI in coda', frase: 'Inviato allo SdI, in attesa della risposta', livello: 'attesa' },
  Inviato: { breve: 'SdI accettata', frase: 'Accettata dallo SdI, in consegna al cliente', livello: 'ok' },
  Consegnato: { breve: 'SdI consegnata', frase: 'Consegnata al cliente dallo SdI', livello: 'ok' },
  AccettatoDalDestinatario: { breve: 'SdI accettata dal cliente', frase: 'Accettata dal cliente (Pubblica Amministrazione)', livello: 'ok' },
  DecorrenzaTermini: { breve: 'SdI consegnata', frase: 'Consegnata (decorrenza termini)', livello: 'ok' },
  ImpossibilitaDiRecapito: { breve: 'SdI non recapitata', frase: 'Valida ma non recapitata: è nel cassetto fiscale del cliente, avvisalo', livello: 'attesa' },
  NonConsegnato: { breve: 'SdI non consegnata', frase: 'Non ancora consegnata alla Pubblica Amministrazione', livello: 'attesa' },
  AttestazioneTrasmissioneFattura: { breve: 'SdI attestazione', frase: 'Lo SdI attesta la trasmissione ma non la consegna', livello: 'attesa' },
  RifiutatoDalDestinatario: { breve: 'SdI rifiutata', frase: 'Rifiutata dal cliente (Pubblica Amministrazione)', livello: 'errore' },
  Scartato: { breve: 'SdI scartata', frase: 'Scartata dallo SdI: correggila e rimandala', livello: 'errore' },
};

/**
 * Segni da mostrare per un documento. Vuoto = ancora da inviare.
 *  - email del portale (anche ripetuta: vale l'ultima) → "Inviato" con data e indirizzi;
 *  - segnato a mano → "Inviato (a mano)" con data e, se scritto, a chi;
 *  - fatture, NC, autofatture: invio allo SdI a parte, con il suo esito;
 *  - documenti di Fatture in Cloud: gli invii erano fatti da lì (FIC), segno grigio;
 *  - preventivo segnato "inviato"/"accettato"/"rifiutato" senza email registrata: inviato fuori dal portale.
 */
export function segniInvio(d: DatiInvio): SegnoInvio[] {
  const segni: SegnoInvio[] = [];
  const fic = d.origine === 'fic';
  if (fic) segni.push({ canale: 'fic', breve: 'Da FIC', frase: 'Documento di Fatture in Cloud: è stato gestito e inviato da lì', livello: 'ok' });
  if (d.email_inviata_il) {
    const a = String(d.email_a ?? '').trim();
    if (d.inviato_a_mano) segni.push({ canale: 'mano', breve: `Inviato ${quando(d.email_inviata_il, false)}`,
      frase: `Segnato inviato a mano il ${quando(d.email_inviata_il)}${a ? ` (${a})` : ''}`, livello: 'ok' });
    else segni.push({ canale: 'email', breve: `Inviato ${quando(d.email_inviata_il, false)}`,
      frase: `Inviato per email${a ? ` a ${a}` : ''} il ${quando(d.email_inviata_il)}`, livello: 'ok' });
  }
  if (!fic && d.tipo && TIPI_SDI.includes(d.tipo) && d.sdi_stato && d.sdi_stato !== 'errore') {
    const s = SDI[d.sdi_stato] ?? { breve: `SdI ${d.sdi_stato}`, frase: `SdI: ${d.sdi_stato}`, livello: 'attesa' as const };
    const il = quando(d.sdi_inviato_il, false);
    segni.push({ canale: 'sdi', breve: s.breve, frase: `${s.frase}${il ? ` (inviata allo SdI il ${quando(d.sdi_inviato_il)})` : ''}`, livello: s.livello });
  }
  if (!segni.length && d.tipo === 'preventivo' && ['inviato', 'accettato', 'rifiutato'].includes(String(d.stato)))
    segni.push({ canale: 'mano', breve: 'Inviato', frase: 'Segnato "inviato" senza email dal portale (mandato da fuori)', livello: 'ok' });
  return segni;
}

/** true = il documento è ancora da inviare (nessun segno). Le bozze e gli annullati non sono "da inviare". */
export function daInviare(d: DatiInvio): boolean {
  if (['bozza', 'annullato', 'da_validare', 'archiviato'].includes(String(d.stato))) return false;
  return segniInvio(d).length === 0;
}

/** Fattura / NC: manca ancora l'invio allo SdI (emessa dal portale e non partita). */
export function mancaSdi(d: DatiInvio): boolean {
  return !!d.tipo && TIPI_SDI.includes(d.tipo) && d.origine !== 'fic' && d.stato === 'emesso' && (!d.sdi_stato || d.sdi_stato === 'errore');
}

/** Data dell'ultimo invio reale allo SdI del documento `d` (per il segno): da usare nelle SELECT come `${SQL_SDI_INVIATO_IL} AS sdi_inviato_il`. */
export const SQL_SDI_INVIATO_IL = `(SELECT max(si.inviato_il) FROM sdi_invii si WHERE si.documento_id = d.id AND si.ambiente = 'reale' AND si.stato <> 'errore')`;

/** Spiegazione della colonna "Inviato" negli elenchi. */
export const INVIATO_TITOLO = 'Nessun segno = ancora da inviare. ✉ = mandato per email dal portale, ✓ = segnato a mano o da Fatture in Cloud, ⇪ = SdI (solo fatture, NC, autofatture)';
