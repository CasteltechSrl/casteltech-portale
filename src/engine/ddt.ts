/**
 * DDT emessi dal portale (Adriano, 28/10/2026: dopo il 10/11 Fatture in Cloud non c'è più). Regole senza database:
 * dati del trasporto scritti nel modulo, controlli prima dell'emissione, righe proposte da un ordine.
 * Valori come nei DDT di FIC 2026: causale quasi sempre RESO LAVORATO (conto lavorazione) o VENDITA,
 * trasporto a cura del MITTENTE, del DESTINATARIO o di un corriere (BRT, FEDEX), colli, peso, destinazione se diversa dalla sede.
 */

export const CAUSALI_DDT = ['RESO LAVORATO', 'VENDITA', 'RESO NON LAVORATO', 'RESO DA RIPARAZIONE IN GARANZIA', 'CONTO VISIONE', 'RIPARAZIONE'] as const;
export const TRASPORTO_A_CURA = ['MITTENTE', 'DESTINATARIO', 'VETTORE'] as const;
export const PORTI = ['FRANCO', 'ASSEGNATO'] as const;
/**
 * DDT dello storico di FIC più vecchi di questa data: non si propongono "da fatturare" (Adriano 31/10/2026, storico dal 2019:
 * i DDT non fatturati di quegli anni sono resi, conto visione, conto lavorazione già chiusi in FIC). Restano nell'elenco DDT.
 */
export const INIZIO_DDT_DA_FATTURARE = '2025-01-01';

/**
 * Causali dei DDT che di regola NON si fatturano (revisione del 1/11/2026: nello storico FIC 2025-26 erano 133 i DDT senza fattura,
 * ma solo una quarantina di vendita o reso lavorato; il resto sono resi di materiale non lavorato, riparazioni in garanzia,
 * conto visione, materiale mandato in conto lavorazione, campioni gratuiti, prestiti d'uso). Stessa espressione per JavaScript e
 * per PostgreSQL (sintassi POSIX semplice), applicata alla causale in MAIUSCOLO.
 */
export const CAUSALI_NON_DA_FATTURARE =
  'NON LAVORAT|UNWORKED|GARANZIA|WARRANTY|VISIONE|CONTO LAVOR|C/LAVOR|CONTO PROVA|CAMPION|PRESTITO|SOSTITUZIONE|C/RIPARAZ|RIPARAT|RESO RIPARAZ|COMPLETAMENTO';
const espressioneNonDaFatturare = new RegExp(CAUSALI_NON_DA_FATTURARE);
/** true se un DDT con questa causale va proposto da fatturare (vendita, reso lavorato, causale vuota o sconosciuta). */
export const causaleDaFatturare = (causale: string | null | undefined) => !espressioneNonDaFatturare.test((causale ?? '').toUpperCase());
/** Condizione SQL equivalente, da usare nelle query con l'alias `d` sulla tabella documenti. */
export const SQL_CAUSALE_DA_FATTURARE = `upper(coalesce(d.dati_trasporto->>'causale', '')) !~ '${CAUSALI_NON_DA_FATTURARE}'`;

/**
 * DDT da proporre "da fatturare" (Adriano 1/11/2026, controllo dei 64 DDT 2025-26 dello storico FIC: quasi tutti fatturati prima con
 * anticipo/proforma, oppure riparazioni): causale da fatturare (sopra, con "riparato" e "completamento fornitura" fuori), non segnato
 * "Già fatturato" dall'ufficio (`documenti.fatturato_altrove`) e, se viene dallo storico FIC, con un valore (i DDT FIC a valore zero
 * accompagnavano merce già fatturata). I DDT del portale a valore zero restano: il prezzo si scrive in fattura.
 */
export function ddtDaFatturareRegola(d: { causale?: string | null; origine: string; valore: number; fatturatoAltrove?: string | null }): boolean {
  if (d.fatturatoAltrove) return false;
  if (!causaleDaFatturare(d.causale)) return false;
  return !(d.origine === 'fic' && Math.abs(d.valore) < 0.005);
}
/** Condizione SQL equivalente a `ddtDaFatturareRegola` (alias `d` sulla tabella documenti). */
export const SQL_DDT_DA_FATTURARE = `(${SQL_CAUSALE_DA_FATTURARE} AND d.fatturato_altrove IS NULL
  AND NOT (d.origine = 'fic' AND NOT EXISTS (SELECT 1 FROM documenti_righe zz WHERE zz.documento_id = d.id AND abs(coalesce(zz.quantita, 0) * coalesce(zz.prezzo, 0)) >= 0.005)))`;

/** Dati del trasporto salvati in documenti.dati_trasporto (stesse chiavi dello storico di FIC: causale, colli, peso, trasportatore, destinazione). */
export interface DatiTrasporto {
  causale?: string; a_cura?: string; trasportatore?: string; porto?: string; colli?: string; peso?: string; aspetto?: string;
  destinazione?: string; inizio?: string;   // inizio del trasporto: "aaaa-mm-ggThh:mm"
}

const pulito = (v: unknown, max = 200) => String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);

/** Dati del trasporto dal modulo: MAIUSCOLO come il resto dei documenti, campi vuoti tolti. */
export function trasportoDaModulo(b: Record<string, unknown>): DatiTrasporto {
  const t: DatiTrasporto = {
    causale: pulito(b.causale_trasporto).toUpperCase(), a_cura: pulito(b.a_cura).toUpperCase(), trasportatore: pulito(b.trasportatore).toUpperCase(),
    porto: pulito(b.porto).toUpperCase(), colli: pulito(b.colli, 40).toUpperCase(), peso: pulito(b.peso, 40).toUpperCase(),
    aspetto: pulito(b.aspetto, 80).toUpperCase(), destinazione: pulito(b.destinazione, 400).toUpperCase(),
    inizio: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(pulito(b.inizio)) ? pulito(b.inizio) : '',
  };
  // un corriere scritto in "trasporto a cura" (es. BRT) è il vettore
  if (t.a_cura && !(TRASPORTO_A_CURA as readonly string[]).includes(t.a_cura)) { t.trasportatore ||= t.a_cura; t.a_cura = 'VETTORE'; }
  return Object.fromEntries(Object.entries(t).filter(([, v]) => v)) as DatiTrasporto;
}

/** Errori che bloccano l'emissione (il numero non si consuma) e avvisi che no. */
export function controlliDdt(d: { cliente_id: number | null; data: string; trasporto: DatiTrasporto },
  righe: { solo_descrizione: boolean; descrizione: string; quantita: number }[]): { errori: string[]; avvisi: string[] } {
  const errori: string[] = [], avvisi: string[] = [];
  const t = d.trasporto;
  if (!d.cliente_id) errori.push('Manca il destinatario (cliente dell\'anagrafica).');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.data)) errori.push('Data non valida.');
  const merce = righe.filter(r => !r.solo_descrizione);
  if (!merce.length) errori.push('Il DDT non ha righe di merce.');
  merce.forEach((r, i) => { if (!(r.quantita > 0)) errori.push(`Riga ${i + 1} (${r.descrizione || 'senza descrizione'}): la quantità deve essere maggiore di 0.`); });
  if (!t.causale) errori.push('Manca la causale del trasporto (es. RESO LAVORATO, VENDITA).');
  if (!t.a_cura) errori.push('Manca "trasporto a cura del" (mittente, destinatario o vettore).');
  if (t.a_cura === 'VETTORE' && !t.trasportatore) errori.push('Trasporto a cura del vettore: scrivi il corriere (es. BRT).');
  if (!t.colli) avvisi.push('Numero di colli non indicato.');
  if (t.inizio && t.inizio.slice(0, 10) < d.data) avvisi.push('L\'inizio del trasporto è prima della data del DDT.');
  return { errori, avvisi };
}

/** Righe d'ordine ancora da spedire → righe del DDT (solo schede con quantità residua; i servizi non si spediscono). */
export function righeDdtDaOrdine(righe: { id: number; tipo: string; codice: string | null; descrizione: string | null; prodottoId: number | null;
  prezzo: number; residuoQuantita: number; stato: string }[]) {
  return righe.filter(r => r.tipo === 'scheda' && r.residuoQuantita > 0 && r.stato !== 'evaso' && r.stato !== 'annullato')
    .map((r, i) => ({ posizione: i + 1, codice: r.codice?.toUpperCase() ?? null, descrizione: (r.descrizione ?? '').toUpperCase(), quantita: r.residuoQuantita,
      um: 'PZ', prezzo: r.prezzo, prodotto_id: r.prodottoId, riga_ordine_id: r.id }));
}

/**
 * DDT dalla commessa (filiera commessa → DDT → fattura, proposta della revisione scelta da Adriano 1/11/2026).
 * Quante schede: quelle scritte nelle spedizioni del rientro (somma delle quantità), altrimenti tutta la commessa;
 * meno quelle già partite con DDT del portale collegati alla commessa (così il secondo DDT propone il resto).
 * Prezzo: quello della riga d'ordine se c'è, altrimenti il prezzo venduto della commessa.
 */
export function rigaDdtDaCommessa(c: { quantita: number; spedizioni?: { qta?: string | number | null }[] | null; prezzo_venduto?: number | null;
  prodotto_id: number | null; codice: string; descrizione: string | null }, giaSpedite: number,
  rigaOrdine?: { id: number; prezzo: number | null; residuoQuantita: number } | null) {
  const dichiarate = (c.spedizioni ?? []).reduce((t, s) => t + (Number(String(s?.qta ?? '').replace(',', '.')) || 0), 0);
  const quantita = Math.max(0, (dichiarate > 0 ? dichiarate : Number(c.quantita) || 0) - giaSpedite);
  const prezzo = rigaOrdine?.prezzo != null && Number(rigaOrdine.prezzo) > 0 ? Number(rigaOrdine.prezzo) : Number(c.prezzo_venduto) || 0;
  return { posizione: 1, codice: c.codice.toUpperCase(), descrizione: (c.descrizione ?? '').toUpperCase(), quantita, um: 'PZ', prezzo,
    prodotto_id: c.prodotto_id, riga_ordine_id: rigaOrdine?.id ?? null, daSpedizioni: dichiarate > 0 };
}

/**
 * Quale riga d'ordine spedisce la commessa: prima quella che la cita (commessa_id), poi le righe aperte dello stesso prodotto
 * nell'ordine con il riferimento scritto sulla commessa, poi qualsiasi riga aperta dello stesso prodotto (ordine più vecchio prima).
 */
export function rigaOrdinePerCommessa<R extends { id: number; prodottoId: number | null; commessaId: number | null; rifCliente: string | null;
  tipo: string; stato: string; residuoQuantita: number; dataOrdine?: unknown }>(righe: R[], c: { id: number; prodotto_id: number | null; ordine_cliente?: string | null }): R | undefined {
  const citata = righe.find(r => r.commessaId === c.id);
  if (citata) return citata;
  if (!c.prodotto_id) return undefined;
  const aperte = righe.filter(r => r.prodottoId === c.prodotto_id && r.tipo === 'scheda' && r.residuoQuantita > 0 && r.stato !== 'evaso' && r.stato !== 'annullato');
  const rif = (c.ordine_cliente ?? '').trim().toUpperCase();
  const pulito = (x: string) => x.replace(/[^A-Z0-9]/g, '');
  const rifPulito = pulito(rif);
  return (rifPulito ? aperte.find(r => pulito((r.rifCliente ?? '').toUpperCase()).includes(rifPulito)) : undefined) ?? aperte[0];
}

/** Indirizzo della sede del cliente su più righe (per la stampa e come destinazione proposta). */
export function indirizzoSu(c: { indirizzo?: string | null; cap?: string | null; comune?: string | null; provincia?: string | null; nazione?: string | null }): string {
  const citta = [c.cap, c.comune, c.provincia ? `(${c.provincia})` : ''].filter(Boolean).join(' ');
  return [c.indirizzo, citta, c.nazione && c.nazione !== 'IT' ? c.nazione : ''].filter(Boolean).join('\n');
}
