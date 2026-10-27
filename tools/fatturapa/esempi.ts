/**
 * Documenti di prova (dati inventati) per i test e per tools/verifica-fatturapa.ts, che controlla
 * gli XML generati con lo schema ufficiale dell'Agenzia delle Entrate (FatturaPA 1.2.2).
 */
import type { Aliquota, DatiAzienda } from '../../src/engine/amministrazione.js';
import type { ClienteXml, DocumentoXml } from '../../src/engine/fatturapa.js';

export const AZIENDA: DatiAzienda = {
  ragione_sociale: 'CASTELTECH S.R.L.', partita_iva: '01777320332', codice_fiscale: '01777320332', regime_fiscale: 'RF01',
  indirizzo: 'STRADA FIORENZUOLA, 8', cap: '29014', comune: "CASTELL'ARQUATO", provincia: 'PC', nazione: 'IT',
  rea_ufficio: 'PC', rea_numero: '999999', capitale_sociale: '10.000,00', socio_unico: 'SM', telefono: '', email: 'info@casteltech.net',
  pec: '', banca: 'BPER - FILIALE DI FIORENZUOLA D\'ARDA', iban: 'IT37B0538765310000003092938',
};

export const ALIQUOTE: Aliquota[] = [
  { codice: 'IVA22', percentuale: 22, natura: null, soggetta_bollo: false },
  { codice: 'INTENTO', percentuale: 0, natura: 'N3.5', riferimento_normativo: 'Non imponibile art. 8 c. 1 lett. c D.P.R. 633/72', soggetta_bollo: true },
  { codice: 'UE_BENI', percentuale: 0, natura: 'N3.2', riferimento_normativo: 'Non imponibile art. 41 D.L. 331/93', soggetta_bollo: false },
  { codice: 'EXPORT', percentuale: 0, natura: 'N3.1', riferimento_normativo: 'Non imponibile art. 8 c. 1 lett. a D.P.R. 633/72', soggetta_bollo: true },
];

export const CLIENTE_IT: ClienteXml = { ragione_sociale: 'CLIENTE DI PROVA S.R.L.', partita_iva: '12345678903', indirizzo: 'VIA ROMA, 1',
  cap: '29121', comune: 'PIACENZA', provincia: 'PC', nazione: 'IT', codice_sdi: 'ABC1234' };
export const CLIENTE_PEC: ClienteXml = { ...CLIENTE_IT, codice_sdi: null, pec: 'Amministrazione@Pec.Prova.it' };
export const CLIENTE_UE: ClienteXml = { ragione_sociale: 'CLIENT EXEMPLE S.A.S.', partita_iva: 'FR12345678901', indirizzo: '16 Rue de la Paix',
  cap: '21000', comune: 'Dijon', nazione: 'FR' };

/** Fattura con DDT, sconto, lettera d'intento (bollo) e una riga di testo. */
export const FATTURA: DocumentoXml = {
  id: 1234, tipo: 'fattura', numero: 117, data: '2026-11-05', causale: 'Lavorazione schede – lotto “A” & B €', riferimento_esterno: 'ORD 4924',
  righe: [
    { descrizione: 'DDT n. 195 del 05/10/2026', quantita: 1, prezzo: 0, solo_descrizione: true },
    { codice: 'M2116', descrizione: 'PCBA M2116', quantita: 4, um: 'pz', prezzo: 10, ddt: { numero: '195', data: '2026-10-05' } },
    { descrizione: 'Montaggio SMD', quantita: 204, prezzo: 2.1, aliquota_iva: 'INTENTO', sconto: 5 },
    { descrizione: 'Materiale fornito dal cliente', quantita: 1, prezzo: 0, solo_descrizione: true },
  ],
  scadenze: [{ data: '2026-12-31', importo: 457.78, modalita: 'MP05' }],
  intento: { protocollo: '26021609544759358-000006', data: '2026-02-16' },
};

/** Nota di credito a un cliente UE, con la fattura collegata. */
export const NOTA_UE: DocumentoXml = {
  id: 99, tipo: 'nota_credito', numero: 5, data: '2026-11-06',
  righe: [{ codice: 'SL_0107', descrizione: 'Reso schede', quantita: 2, prezzo: 50.125, aliquota_iva: 'UE_BENI' }],
  scadenze: [{ data: '2026-11-06', importo: 100.25, modalita: 'MP05' }], origine: { numero: '1', data: '2025-01-21' },
};

/** Fattura con RiBa in due rate a un cliente con sola PEC. */
export const FATTURA_RATE: DocumentoXml = {
  id: 5000, tipo: 'fattura', numero: 118, data: '2026-11-07',
  righe: [{ descrizione: 'Assemblaggio', quantita: 10, prezzo: 61 }],
  scadenze: [{ data: '2026-12-31', importo: 372.1, modalita: 'MP12' }, { data: '2027-01-31', importo: 372.1, modalita: 'MP12' }],
};

export const ESEMPI: { nome: string; documento: DocumentoXml; cliente: ClienteXml }[] = [
  { nome: 'fattura-intento-ddt', documento: FATTURA, cliente: CLIENTE_IT },
  { nome: 'nota-credito-ue', documento: NOTA_UE, cliente: CLIENTE_UE },
  { nome: 'fattura-riba-pec', documento: FATTURA_RATE, cliente: CLIENTE_PEC },
];
