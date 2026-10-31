/**
 * Tipi di fattura elettronica oltre alla fattura normale e regole della pubblica amministrazione (Adriano, 31/10/2026).
 * Niente database qui: le usano fatturapa.ts (XML), documenti-servizio.ts (scadenze, acconti) e le pagine.
 *
 * - TD01 fattura immediata; TD24 fattura differita: la si sceglie da sola quando la fattura cita DDT con data precedente
 *   (merce già partita con il DDT, fattura entro il 15 del mese dopo);
 * - TD02 acconto/anticipo su fattura: si incassa una parte prima della consegna; sulla fattura di saldo l'acconto si scala
 *   con una riga negativa per aliquota e la fattura d'acconto va in DatiFattureCollegate;
 * - TD26 cessione di beni ammortizzabili (vendita di un macchinario usato dell'azienda);
 * - TD05 nota di debito: aumenta l'importo di una fattura già emessa (la fattura corretta in DatiFattureCollegate);
 * - TD04 nota di credito (già prima).
 * Pubblica amministrazione: formato FPA12, codice ufficio di 6 caratteri, CIG (e CUP se c'è) dall'ordine;
 * split payment: IVA con esigibilità "S", il cliente paga solo imponibile + bollo, l'IVA la versa lui all'Erario.
 */

export const TIPI_SDI_FATTURA: Record<string, { nome: string; spiegazione: string }> = {
  TD01: { nome: 'Fattura', spiegazione: 'Fattura normale (diventa TD24 differita da sola se cita DDT con data precedente).' },
  TD24: { nome: 'Fattura differita', spiegazione: 'Merce partita prima con DDT: fattura entro il 15 del mese dopo.' },
  TD02: { nome: 'Fattura d\'acconto', spiegazione: 'Anticipo su un ordine: si scala poi sulla fattura di saldo.' },
  TD26: { nome: 'Cessione di beni ammortizzabili', spiegazione: 'Vendita di un bene strumentale dell\'azienda (macchinario, attrezzatura).' },
  TD05: { nome: 'Nota di debito', spiegazione: 'Aumenta l\'importo di una fattura già emessa (es. costi dimenticati).' },
  TD04: { nome: 'Nota di credito', spiegazione: 'Storna in tutto o in parte una fattura emessa.' },
};
/** Tipi che si scelgono a mano su una fattura (TD24 è automatico, TD04 è la nota di credito). */
export const TIPI_SCEGLIBILI = ['TD01', 'TD02', 'TD26', 'TD05'] as const;

/** Nome del documento per le pagine e le stampe ("Fattura differita", "Nota di debito"…). */
export function nomeTipoSdi(tipo: string, tipoSdi?: string | null): string | null {
  if (tipo !== 'fattura' || !tipoSdi || tipoSdi === 'TD01') return null;
  return TIPI_SDI_FATTURA[tipoSdi]?.nome ?? null;
}

/**
 * Tipo SdI con cui si emette: nota di credito TD04; TD02/TD26/TD05 se scelti; altrimenti TD24 se c'è almeno un DDT con data
 * precedente alla fattura (date "aaaa-mm-gg"), altrimenti TD01.
 */
export function tipoSdiEffettivo(tipo: string, scelto: string | null | undefined, dataDocumento: string, dateDdt: string[]): string {
  if (tipo === 'nota_credito') return 'TD04';
  if (scelto && ['TD02', 'TD26', 'TD05'].includes(scelto)) return scelto;
  return dateDdt.some(d => d && d < dataDocumento) ? 'TD24' : 'TD01';
}

/** Termine della fattura differita: il 15 del mese dopo quello del DDT più vecchio ("aaaa-mm-gg"). */
export function termineDifferita(dateDdt: string[]): string | null {
  const prima = dateDdt.filter(Boolean).sort()[0];
  if (!prima) return null;
  const [a, m] = prima.split('-').map(Number);
  const anno = m === 12 ? a + 1 : a, mese = m === 12 ? 1 : m + 1;
  return `${anno}-${String(mese).padStart(2, '0')}-15`;
}

/** Quanto paga il cliente: con lo split payment solo il totale meno l'IVA (imponibile + bollo). */
export const importoDaIncassare = (t: { totale: number; imposta: number }, splitPayment: boolean) =>
  Math.round((splitPayment ? t.totale - t.imposta : t.totale) * 100) / 100;

/** Controlli dei dati d'ordine e della pubblica amministrazione (errori che bloccano l'emissione). */
export function controlliOrdinePa(dati: {
  pubblica_amministrazione?: boolean; codice_sdi?: string | null; riferimento_esterno?: string | null;
  cig?: string | null; cup?: string | null; data_ordine?: string | null; nome?: string;
}): string[] {
  const errori: string[] = [];
  const chi = dati.nome ? `Cliente ${dati.nome}: ` : '';
  const cig = (dati.cig ?? '').trim().toUpperCase(), cup = (dati.cup ?? '').trim().toUpperCase();
  if (cig && !/^[A-Z0-9]{10}$/.test(cig)) errori.push(`CIG "${cig}" non valido: sono 10 caratteri, lettere e numeri.`);
  if (cup && !/^[A-Z0-9]{15}$/.test(cup)) errori.push(`CUP "${cup}" non valido: sono 15 caratteri, lettere e numeri.`);
  if ((cig || cup || dati.data_ordine) && !String(dati.riferimento_esterno ?? '').trim())
    errori.push('Con CIG, CUP o data dell\'ordine serve anche il numero dell\'ordine del cliente.');
  if (dati.pubblica_amministrazione) {
    const sdi = (dati.codice_sdi ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(sdi)) errori.push(`${chi}pubblica amministrazione: serve il codice univoco dell'ufficio (6 caratteri, dall'ordine o da indicepa.gov.it).`);
    if (!cig) errori.push('Fattura alla pubblica amministrazione: manca il CIG dell\'ordine (senza, la PA la rifiuta).');
    if (!String(dati.riferimento_esterno ?? '').trim()) errori.push('Fattura alla pubblica amministrazione: manca il numero dell\'ordine.');
  }
  return errori;
}

/** Riga negativa che scala una fattura d'acconto sul saldo: una per aliquota usata nell'acconto. */
export function righeStornoAcconto(acconto: { id: number; numero: string; data: string; riepilogo: { aliquota: string; imponibile: number }[] }) {
  const data = acconto.data.split('-').reverse().join('/');
  return acconto.riepilogo.filter(g => g.imponibile).map(g => ({
    descrizione: `Storno acconto fattura n. ${acconto.numero} del ${data}`, quantita: 1, prezzo: -Math.round(g.imponibile * 100) / 100,
    aliquota_iva: g.aliquota, acconto_id: acconto.id,
  }));
}

/** Ritenuta da versare con F24: entro il 16 del mese dopo quello del pagamento ("aaaa-mm-gg"). */
export function scadenzaF24(dataPagamento: string): string {
  const [a, m] = dataPagamento.split('-').map(Number);
  const anno = m === 12 ? a + 1 : a, mese = m === 12 ? 1 : m + 1;
  return `${anno}-${String(mese).padStart(2, '0')}-16`;
}

/** Dati fiscali del cliente scritti nella scheda Anagrafiche → Clienti → Dati fiscali: pulizia e controlli. */
export interface DatiFiscaliCliente {
  partita_iva: string | null; codice_fiscale: string | null; indirizzo: string | null; cap: string | null; comune: string | null;
  provincia: string | null; nazione: string; codice_sdi: string | null; pec: string | null; email_amministrazione: string | null;
  pubblica_amministrazione: boolean; split_payment: boolean; aliquota_iva: string | null; condizione_pagamento: string | null;
}
export function datiFiscaliDaModulo(b: Record<string, unknown>): { dati: DatiFiscaliCliente; errori: string[] } {
  const su = (k: string) => String(b[k] ?? '').replace(/\s+/g, ' ').trim().toUpperCase() || null;
  const giu = (k: string) => String(b[k] ?? '').trim().toLowerCase() || null;
  const spunta = (k: string) => b[k] === 'on' || b[k] === '1' || b[k] === true;
  const dati: DatiFiscaliCliente = {
    partita_iva: su('partita_iva')?.replace(/\s/g, '') ?? null, codice_fiscale: su('codice_fiscale')?.replace(/\s/g, '') ?? null,
    indirizzo: su('indirizzo'), cap: su('cap'), comune: su('comune'), provincia: su('provincia'), nazione: su('nazione') || 'IT',
    codice_sdi: su('codice_sdi'), pec: giu('pec'), email_amministrazione: giu('email_amministrazione'),
    pubblica_amministrazione: spunta('pubblica_amministrazione'), split_payment: spunta('split_payment'),
    aliquota_iva: String(b.aliquota_iva ?? '').trim() || null, condizione_pagamento: String(b.condizione_pagamento ?? '').trim() || null,
  };
  const errori: string[] = [];
  if (!/^[A-Z]{2}$/.test(dati.nazione)) errori.push('Nazione: sigla di 2 lettere (IT, DE, FR…).');
  const italiano = dati.nazione === 'IT';
  if (italiano && dati.partita_iva && !/^(IT)?\d{11}$/.test(dati.partita_iva)) errori.push('Partita IVA italiana: 11 cifre.');
  if (italiano && dati.codice_fiscale && !/^(\d{11}|[A-Z0-9]{16})$/.test(dati.codice_fiscale)) errori.push('Codice fiscale: 11 cifre (enti, società) o 16 caratteri.');
  if (italiano && dati.cap && !/^\d{5}$/.test(dati.cap)) errori.push('CAP: 5 cifre.');
  if (italiano && dati.provincia && !/^[A-Z]{2}$/.test(dati.provincia)) errori.push('Provincia: sigla di 2 lettere.');
  if (dati.pubblica_amministrazione) {
    if (!dati.codice_sdi || !/^[A-Z0-9]{6}$/.test(dati.codice_sdi)) errori.push('Pubblica amministrazione: il codice univoco dell\'ufficio ha 6 caratteri (sull\'ordine o su indicepa.gov.it).');
    if (!dati.codice_fiscale && !dati.partita_iva) errori.push('Pubblica amministrazione: serve il codice fiscale dell\'ente.');
  } else if (dati.codice_sdi && !/^[A-Z0-9]{7}$/.test(dati.codice_sdi)) errori.push('Codice destinatario SDI: 7 caratteri (6 solo per la pubblica amministrazione).');
  if (dati.pec && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(dati.pec)) errori.push('PEC non valida.');
  return { dati, errori };
}
