/**
 * Documenti di prova (dati inventati) per i test e per tools/verifica-fatturapa.ts, che controlla
 * gli XML generati con lo schema ufficiale dell'Agenzia delle Entrate (FatturaPA 1.2.2).
 */
import type { Aliquota, DatiAzienda } from '../../src/engine/amministrazione.js';
import type { AutofatturaXml, ClienteXml, DocumentoXml, FornitoreXml } from '../../src/engine/fatturapa.js';

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

/** Ente pubblico inventato (come l'INFN): solo codice fiscale, codice ufficio di 6 caratteri, split payment. */
export const CLIENTE_PA: ClienteXml = { ragione_sociale: 'ISTITUTO PUBBLICO DI PROVA - SEZIONE DI ROMA', codice_fiscale: '84001850589',
  indirizzo: 'VIA DELLA RICERCA SCIENTIFICA, 1', cap: '00133', comune: 'ROMA', provincia: 'RM', nazione: 'IT', codice_sdi: 'E9YBYU',
  pubblica_amministrazione: true, split_payment: true };
/** Fattura alla PA: numero e data dell'ordine, CIG; si incassa solo l'imponibile (1.000 €), l'IVA (220 €) la versa l'ente. */
export const FATTURA_PA: DocumentoXml = {
  id: 6000, tipo: 'fattura', numero: 119, data: '2026-11-10', riferimento_esterno: '4924', data_ordine: '2025-10-23', cig: 'B8C295DE7C',
  righe: [{ codice: 'SCH-01', descrizione: 'Assemblaggio schede', quantita: 100, um: 'pz', prezzo: 10 }],
  scadenze: [{ data: '2026-12-10', importo: 1000, modalita: 'MP05' }],
};
/** Fattura d'acconto (TD02) e saldo che la scala con una riga negativa. */
export const ACCONTO: DocumentoXml = {
  id: 6001, tipo: 'fattura', tipo_sdi: 'TD02', numero: 120, data: '2026-11-10', riferimento_esterno: 'ORD 77',
  righe: [{ descrizione: 'Acconto sul vostro ordine n. ORD 77', quantita: 1, prezzo: 300 }],
  scadenze: [{ data: '2026-11-10', importo: 366, modalita: 'MP05' }],
};
export const SALDO: DocumentoXml = {
  id: 6002, tipo: 'fattura', numero: 125, data: '2026-11-20', riferimento_esterno: 'ORD 77',
  righe: [{ descrizione: 'Assemblaggio schede', quantita: 100, prezzo: 10 },
    { descrizione: 'Storno acconto fattura n. 120 del 10/11/2026', quantita: 1, prezzo: -300, aliquota_iva: 'IVA22' }],
  scadenze: [{ data: '2026-12-31', importo: 854, modalita: 'MP05' }], acconti: [{ numero: '120', data: '2026-11-10' }],
};
/** Nota di debito (TD05) su una fattura emessa. */
export const NOTA_DEBITO: DocumentoXml = {
  id: 6003, tipo: 'fattura', tipo_sdi: 'TD05', numero: 126, data: '2026-11-21', origine: { numero: '119', data: '2026-11-10' },
  righe: [{ descrizione: 'Spese di trasporto non addebitate', quantita: 1, prezzo: 50 }],
  scadenze: [{ data: '2026-12-21', importo: 61, modalita: 'MP05' }],
};

export const ESEMPI: { nome: string; documento: DocumentoXml; cliente: ClienteXml }[] = [
  { nome: 'fattura-intento-ddt', documento: FATTURA, cliente: CLIENTE_IT },
  { nome: 'nota-credito-ue', documento: NOTA_UE, cliente: CLIENTE_UE },
  { nome: 'fattura-riba-pec', documento: FATTURA_RATE, cliente: CLIENTE_PEC },
  { nome: 'fattura-pa-split', documento: FATTURA_PA, cliente: CLIENTE_PA },
  { nome: 'fattura-acconto', documento: ACCONTO, cliente: CLIENTE_IT },
  { nome: 'fattura-saldo', documento: SALDO, cliente: CLIENTE_IT },
  { nome: 'nota-debito', documento: NOTA_DEBITO, cliente: CLIENTE_IT },
];

// autofatture: fornitori esteri inventati
export const FORNITORE_UE: FornitoreXml = { ragione_sociale: 'COMPONENTI ESEMPIO INC.', partita_iva: 'FR 12345678901', indirizzo: '100 MAIN STREET',
  comune: 'DALLAS', nazione: 'US' };
export const FORNITORE_CINA: FornitoreXml = { ragione_sociale: 'SHENZHEN ESEMPIO CO. LTD', partita_iva: 'MA91440300X', indirizzo: 'NANSHAN ROAD 1',
  comune: 'SHENZHEN', nazione: 'CN' };
export const AUTOFATTURA_UE: AutofatturaXml = {
  id: 2001, tipo_sdi: 'TD18', numero: 93, sezionale: 'AF', data: '2026-10-28', causale: 'Relativo a fattura n. 93174181 del 21/10/2026',
  fattura: { numero: '93174181', data: '2026-10-21' },
  righe: [
    { codice: 'HFBR-14E4Z', descrizione: 'HFBR-14E4Z', quantita: 50, prezzo: 22.86167, aliquota_iva: 'IVA22' },
    { codice: '', descrizione: 'Spese di trasporto', quantita: 1, prezzo: 20, aliquota_iva: 'IVA22' },
  ],
};
export const AUTOFATTURA_SERVIZI: AutofatturaXml = {
  id: 2002, tipo_sdi: 'TD17', numero: 94, sezionale: 'AF', data: '2026-10-28', causale: 'Relativo a fattura n. Y4JSRS7A-0002 del 30/09/2026',
  fattura: { numero: 'Y4JSRS7A-0002', data: '2026-09-30' }, righe: [{ descrizione: 'Abbonamento software', quantita: 1, prezzo: 18 }],
};
export const AUTOFATTURA_CINA: AutofatturaXml = {
  id: 2003, tipo_sdi: 'TD19', numero: 95, sezionale: 'AF', data: '2026-10-28', causale: 'Relativo a fattura n. 778 del 25/10/2026',
  fattura: { numero: '778', data: '2026-10-25' }, righe: [{ descrizione: 'Cavi di prova', quantita: 10, prezzo: 2.4581 }],
};
export const ESEMPI_AUTOFATTURE: { nome: string; documento: AutofatturaXml; fornitore: FornitoreXml }[] = [
  { nome: 'autofattura-td18', documento: AUTOFATTURA_UE, fornitore: FORNITORE_UE },
  { nome: 'autofattura-td17', documento: AUTOFATTURA_SERVIZI, fornitore: { ...FORNITORE_UE, partita_iva: 'IE4276970QH' } },
  { nome: 'autofattura-td19', documento: AUTOFATTURA_CINA, fornitore: FORNITORE_CINA },
];
