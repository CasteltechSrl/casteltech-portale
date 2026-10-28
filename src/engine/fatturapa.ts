/**
 * File XML della fattura elettronica (FatturaPA 1.2.2, formato FPR12 tra privati) per fatture e note di credito.
 * Niente database qui: riceve documento, cliente, dati dell'azienda e aliquote e restituisce l'XML con l'elenco
 * degli errori che lo SdI scarterebbe (se ce ne sono, il documento non si emette).
 *
 * Regole principali:
 * - righe con natura N3.5 (lettera d'intento): AltriDatiGestionali "INTENTO" con protocollo e data della lettera;
 * - bollo virtuale da 2 € (DatiBollo) se dovuto, compreso nel totale del documento;
 * - nota di credito (TD04): fattura collegata obbligatoria (DatiFattureCollegate);
 * - DDT fatturati: DatiDDT con le righe che vengono da ciascun DDT; le righe di solo testo "DDT n. … del …" non si ripetono;
 * - cliente estero: codice destinatario XXXXXXX, P.IVA con il prefisso del paese, CAP 00000 se non italiano;
 * - testi solo con caratteri ammessi dallo SdI (latino di base e Latin-1): "€" → "EUR", apostrofi e trattini tipografici semplificati.
 */
import { arrotonda2, calcolaTotali, numeroCompleto, preparaAzienda, type Aliquota, type DatiAzienda, type Totali } from './amministrazione.js';

export interface RigaXml {
  codice?: string | null; descrizione: string; quantita: number; um?: string | null; prezzo: number; sconto?: number;
  aliquota_iva?: string | null; solo_descrizione?: boolean; ddt?: { numero: string; data: string } | null;
}
export interface DocumentoXml {
  id: number; tipo: 'fattura' | 'nota_credito'; numero: number | null; sezionale?: string; data: string;
  causale?: string | null; riferimento_esterno?: string | null; righe: RigaXml[];
  scadenze: { data: string; importo: number; modalita: string }[];
  origine?: { numero: string; data: string } | null;          // fattura stornata dalla nota di credito
  intento?: { protocollo: string; data: string } | null;       // lettera d'intento del cliente
  aliquota_predefinita?: string;
}
export interface ClienteXml {
  ragione_sociale: string; partita_iva?: string | null; codice_fiscale?: string | null; indirizzo?: string | null; cap?: string | null;
  comune?: string | null; provincia?: string | null; nazione?: string | null; codice_sdi?: string | null; pec?: string | null;
  pubblica_amministrazione?: boolean;
}

const SOSTITUZIONI: [RegExp, string][] = [[/€/g, 'EUR'], [/[‘’‚′]/g, "'"], [/[“”„″]/g, '"'], [/[–—−]/g, '-'], [/…/g, '...'], [/[•·]/g, '-']];

/** Testo con i soli caratteri ammessi (latino di base + Latin-1), spazi uniformi, protetto per l'XML, al massimo `max` caratteri. */
export function testoXml(v: unknown, max = 1000): string {
  return proteggi(pulisci(v).slice(0, max));
}
/** Testo con i soli caratteri ammessi, senza protezione per l'XML. */
function pulisci(v: unknown): string {
  let s = String(v ?? '');
  for (const [da, a] of SOSTITUZIONI) s = s.replace(da, a);
  return s.normalize('NFC').replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '').replace(/\s+/g, ' ').trim();
}
const proteggi = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** Importo con due decimali e il punto (formato della fattura elettronica). */
export const importoXml = (n: number) => arrotonda2(n).toFixed(2);
/** Prezzo unitario / quantità: almeno 2 decimali, fino a 8, senza zeri inutili oltre il secondo. */
export function decimaleXml(n: number): string {
  const s = Number(n).toFixed(8).replace(/0+$/, '');
  const [i, d = ''] = s.split('.');
  return `${i}.${d.padEnd(2, '0')}`;
}

const el = (nome: string, valore: string | number | null | undefined) =>
  valore === null || valore === undefined || valore === '' ? '' : `<${nome}>${valore}</${nome}>`;

/** P.IVA scritta con o senza prefisso del paese → { paese, codice }. */
function idFiscale(piva: string, nazione: string): { paese: string; codice: string } {
  const p = piva.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const m = /^([A-Z]{2})(.+)$/.exec(p);
  if (m && !/^\d{11}$/.test(p)) return { paese: m[1] === 'EL' ? 'GR' : m[1], codice: m[2] };
  return { paese: nazione || 'IT', codice: p };
}

/** Progressivo d'invio (massimo 5 caratteri nel nome del file): l'id del documento in base 36. */
export const progressivoInvio = (id: number) => id.toString(36).toUpperCase().padStart(5, '0').slice(-5);

export interface EsitoXml { xml: string; nomeFile: string; totali: Totali; errori: string[] }

export function generaFatturaXml(doc: DocumentoXml, cliente: ClienteXml, aziendaInput: DatiAzienda, aliquote: Aliquota[]): EsitoXml {
  const errori: string[] = [];
  const { azienda, errori: erroriAzienda } = preparaAzienda(aziendaInput);
  erroriAzienda.forEach(e => errori.push(`Dati dell'azienda: ${e}`));
  const predefinita = doc.aliquota_predefinita || 'IVA22';
  const perCodice = new Map(aliquote.map(a => [a.codice, a]));

  // righe: il testo "DDT n. … del …" diventa DatiDDT, non una riga
  const righe = doc.righe.filter(r => !(r.solo_descrizione && /^\s*DDT\b/i.test(r.descrizione)));
  const vere = righe.filter(r => !r.solo_descrizione);
  if (!vere.length) errori.push('Il documento non ha righe con un importo.');
  // le righe di solo testo prendono l'aliquota della prima riga vera (importo 0)
  const aliquotaTesto = vere[0]?.aliquota_iva || predefinita;
  const totali = calcolaTotali(righe, aliquote, predefinita);
  errori.push(...totali.errori);
  if (doc.tipo === 'nota_credito' && !doc.origine) errori.push('La nota di credito deve indicare la fattura che corregge.');
  if (doc.numero == null) errori.push('Il documento non ha ancora un numero.');
  const usaIntento = totali.riepilogo.some(g => g.natura === 'N3.5');
  if (usaIntento && !doc.intento) errori.push('Righe con lettera d\'intento ma il cliente non ha una lettera d\'intento per l\'anno del documento.');
  if (Math.abs(arrotonda2(doc.scadenze.reduce((s, x) => s + x.importo, 0)) - totali.totale) > 0.005 && doc.scadenze.length)
    errori.push(`Le scadenze (${importoXml(doc.scadenze.reduce((s, x) => s + x.importo, 0))}) non tornano con il totale (${importoXml(totali.totale)}).`);

  // cliente
  const nazione = (cliente.nazione || 'IT').toUpperCase();
  const italiano = nazione === 'IT';
  const piva = (cliente.partita_iva ?? '').trim();
  const cf = (cliente.codice_fiscale ?? '').trim().toUpperCase();
  if (!cliente.ragione_sociale) errori.push('Cliente senza ragione sociale.');
  if (!cliente.indirizzo || !cliente.comune) errori.push(`Cliente ${cliente.ragione_sociale}: mancano indirizzo o comune.`);
  if (italiano && !/^\d{5}$/.test(cliente.cap ?? '')) errori.push(`Cliente ${cliente.ragione_sociale}: CAP mancante o non valido.`);
  if (italiano && !piva && !cf) errori.push(`Cliente ${cliente.ragione_sociale}: servono partita IVA o codice fiscale.`);
  if (italiano && piva && !/^(IT)?\d{11}$/i.test(piva.replace(/\s/g, ''))) errori.push(`Cliente ${cliente.ragione_sociale}: partita IVA "${piva}" non valida.`);
  if (cliente.pubblica_amministrazione) errori.push('Fatture alla pubblica amministrazione (FPA12, split payment) non ancora previste dal portale.');
  const sdi = (cliente.codice_sdi ?? '').toUpperCase().trim();
  if (sdi && !/^[A-Z0-9]{7}$/.test(sdi)) errori.push(`Cliente ${cliente.ragione_sociale}: codice destinatario "${sdi}" non valido (7 caratteri).`);
  const codiceDestinatario = !italiano ? 'XXXXXXX' : sdi || '0000000';
  const pecDestinatario = italiano && !sdi && cliente.pec ? cliente.pec.trim().toLowerCase() : '';

  const numero = doc.numero == null ? '' : numeroCompleto(doc.numero, doc.sezionale);
  const tipoSdi = doc.tipo === 'nota_credito' ? 'TD04' : 'TD01';

  const anagraficaCliente = (() => {
    let s = '';
    if (piva) { const f = idFiscale(piva, nazione); s += `<IdFiscaleIVA><IdPaese>${f.paese}</IdPaese><IdCodice>${testoXml(f.codice, 28)}</IdCodice></IdFiscaleIVA>`; }
    if (italiano && cf) s += el('CodiceFiscale', testoXml(cf, 16));
    if (!piva && !italiano) s += `<IdFiscaleIVA><IdPaese>${nazione}</IdPaese><IdCodice>99999999999</IdCodice></IdFiscaleIVA>`;
    return s + `<Anagrafica><Denominazione>${testoXml(cliente.ragione_sociale, 80)}</Denominazione></Anagrafica>`;
  })();
  const sede = (indirizzo: unknown, cap: unknown, comune: unknown, provincia: unknown, paese: string) =>
    `<Sede>${el('Indirizzo', testoXml(indirizzo, 60))}${el('CAP', paese === 'IT' ? testoXml(cap, 5) : '00000')}${el('Comune', testoXml(comune, 60))}`
    + `${paese === 'IT' ? el('Provincia', /^[A-Z]{2}$/.test(String(provincia ?? '').toUpperCase()) ? String(provincia).toUpperCase() : '') : ''}${el('Nazione', paese)}</Sede>`;

  const rea = azienda.rea_ufficio && azienda.rea_numero
    ? `<IscrizioneREA>${el('Ufficio', azienda.rea_ufficio)}${el('NumeroREA', testoXml(azienda.rea_numero, 20))}`
      + `${azienda.capitale_sociale ? el('CapitaleSociale', importoXml(Number(azienda.capitale_sociale.replace(/\./g, '').replace(',', '.')))) : ''}`
      + `${el('SocioUnico', azienda.socio_unico)}<StatoLiquidazione>LN</StatoLiquidazione></IscrizioneREA>` : '';
  const contatti = azienda.telefono || azienda.email
    ? `<Contatti>${el('Telefono', testoXml(azienda.telefono, 12))}${el('Email', testoXml(azienda.email, 256))}</Contatti>` : '';

  // DDT citati: numero/data → linee che ne fanno parte
  const ddt = new Map<string, { numero: string; data: string; linee: number[] }>();
  const linee = righe.map((r, i) => {
    const n = i + 1;
    const codice = r.solo_descrizione ? aliquotaTesto : (r.aliquota_iva || predefinita);
    const a = perCodice.get(codice);
    if (r.ddt) {
      const k = `${r.ddt.numero}|${r.ddt.data}`;
      if (!ddt.has(k)) ddt.set(k, { ...r.ddt, linee: [] });
      ddt.get(k)!.linee.push(n);
    }
    const prezzo = r.solo_descrizione ? 0 : Number(r.prezzo) || 0;
    const quantita = Number(r.quantita) || 0;
    const sconto = r.solo_descrizione ? 0 : Number(r.sconto) || 0;
    const totale = r.solo_descrizione ? 0 : arrotonda2(quantita * prezzo * (1 - sconto / 100));
    return `<DettaglioLinee><NumeroLinea>${n}</NumeroLinea>`
      + (r.codice && !r.solo_descrizione ? `<CodiceArticolo><CodiceTipo>INTERNO</CodiceTipo><CodiceValore>${testoXml(r.codice, 35)}</CodiceValore></CodiceArticolo>` : '')
      + `<Descrizione>${testoXml(r.descrizione || '-', 1000)}</Descrizione>`
      + (r.solo_descrizione ? '' : `<Quantita>${decimaleXml(quantita)}</Quantita>${el('UnitaMisura', testoXml(r.um, 10))}`)
      + `<PrezzoUnitario>${decimaleXml(prezzo)}</PrezzoUnitario>`
      + (sconto ? `<ScontoMaggiorazione><Tipo>SC</Tipo><Percentuale>${importoXml(sconto)}</Percentuale></ScontoMaggiorazione>` : '')
      + `<PrezzoTotale>${importoXml(totale)}</PrezzoTotale>`
      + `<AliquotaIVA>${importoXml(a?.percentuale ?? 0)}</AliquotaIVA>${a?.natura ? el('Natura', a.natura) : ''}`
      + (a?.natura === 'N3.5' && doc.intento && !r.solo_descrizione
        ? `<AltriDatiGestionali><TipoDato>INTENTO</TipoDato><RiferimentoTesto>${testoXml(doc.intento.protocollo, 60)}</RiferimentoTesto>`
          + `<RiferimentoData>${doc.intento.data}</RiferimentoData></AltriDatiGestionali>` : '')
      + `</DettaglioLinee>`;
  }).join('');

  // DDT scritti solo come testo ("DDT n. 86 del 27/04/2026") senza righe collegate: DatiDDT senza linee
  for (const r of doc.righe) {
    const m = /DDT\s+n\.?\s*(\S+)\s+del\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i.exec(r.solo_descrizione ? r.descrizione : '');
    if (!m) continue;
    const data = `${m[4]}-${m[3].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
    if (![...ddt.values()].some(d => d.numero === m[1] && d.data === data)) ddt.set(`${m[1]}|${data}`, { numero: m[1], data, linee: [] });
  }

  const riepilogo = totali.riepilogo.map(g =>
    `<DatiRiepilogo><AliquotaIVA>${importoXml(g.percentuale)}</AliquotaIVA>${el('Natura', g.natura)}`
    + `<ImponibileImporto>${importoXml(g.imponibile)}</ImponibileImporto><Imposta>${importoXml(g.imposta)}</Imposta>`
    + (g.natura ? el('RiferimentoNormativo', testoXml(g.riferimento_normativo, 100)) : '<EsigibilitaIVA>I</EsigibilitaIVA>')
    + `</DatiRiepilogo>`).join('');
  // un'aliquota usata solo da righe di testo deve comparire nel riepilogo (con importo 0)
  const aTesto = perCodice.get(aliquotaTesto);
  const testoSenzaRiepilogo = righe.some(r => r.solo_descrizione) && aTesto && !totali.riepilogo.some(g => g.aliquota === aliquotaTesto)
    ? `<DatiRiepilogo><AliquotaIVA>${importoXml(aTesto.percentuale)}</AliquotaIVA>${el('Natura', aTesto.natura)}<ImponibileImporto>0.00</ImponibileImporto><Imposta>0.00</Imposta>`
      + (aTesto.natura ? el('RiferimentoNormativo', testoXml(aTesto.riferimento_normativo, 100)) : '<EsigibilitaIVA>I</EsigibilitaIVA>') + `</DatiRiepilogo>` : '';

  const causali = (pulisci(doc.causale).slice(0, 2000).match(/[\s\S]{1,200}/g) ?? []).map(c => `<Causale>${proteggi(c)}</Causale>`).join('');
  const pagamenti = doc.scadenze.length
    ? `<DatiPagamento><CondizioniPagamento>${doc.scadenze.length > 1 ? 'TP01' : 'TP02'}</CondizioniPagamento>`
      + doc.scadenze.map(s => `<DettaglioPagamento><ModalitaPagamento>${s.modalita}</ModalitaPagamento>`
        + `<DataScadenzaPagamento>${s.data}</DataScadenzaPagamento><ImportoPagamento>${importoXml(s.importo)}</ImportoPagamento>`
        + (s.modalita === 'MP05' && azienda.iban ? `${el('IstitutoFinanziario', testoXml(azienda.banca, 80))}<IBAN>${azienda.iban}</IBAN>` : '')
        + `</DettaglioPagamento>`).join('') + `</DatiPagamento>` : '';

  const progressivo = progressivoInvio(doc.id);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n`
    + `<p:FatturaElettronica versione="FPR12" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" `
    + `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2 `
    + `http://www.fatturapa.gov.it/export/fatturazione/sdi/fatturapa/v1.2/Schema_del_file_xml_FatturaPA_versione_1.2.xsd">`
    + `<FatturaElettronicaHeader>`
    + `<DatiTrasmissione><IdTrasmittente><IdPaese>IT</IdPaese><IdCodice>${azienda.codice_fiscale || azienda.partita_iva}</IdCodice></IdTrasmittente>`
    + `<ProgressivoInvio>${progressivo}</ProgressivoInvio><FormatoTrasmissione>FPR12</FormatoTrasmissione>`
    + `<CodiceDestinatario>${codiceDestinatario}</CodiceDestinatario>${el('PECDestinatario', testoXml(pecDestinatario, 256))}</DatiTrasmissione>`
    + `<CedentePrestatore><DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${azienda.partita_iva}</IdCodice></IdFiscaleIVA>`
    + `${el('CodiceFiscale', azienda.codice_fiscale)}<Anagrafica><Denominazione>${testoXml(azienda.ragione_sociale, 80)}</Denominazione></Anagrafica>`
    + `<RegimeFiscale>${azienda.regime_fiscale}</RegimeFiscale></DatiAnagrafici>`
    + sede(azienda.indirizzo, azienda.cap, azienda.comune, azienda.provincia, 'IT') + rea + contatti + `</CedentePrestatore>`
    + `<CessionarioCommittente><DatiAnagrafici>${anagraficaCliente}</DatiAnagrafici>`
    + sede(cliente.indirizzo, cliente.cap, cliente.comune, cliente.provincia, nazione) + `</CessionarioCommittente>`
    + `</FatturaElettronicaHeader>`
    + `<FatturaElettronicaBody><DatiGenerali><DatiGeneraliDocumento><TipoDocumento>${tipoSdi}</TipoDocumento><Divisa>EUR</Divisa>`
    + `<Data>${doc.data}</Data><Numero>${testoXml(numero, 20)}</Numero>`
    + (totali.bollo ? `<DatiBollo><BolloVirtuale>SI</BolloVirtuale><ImportoBollo>${importoXml(totali.bollo)}</ImportoBollo></DatiBollo>` : '')
    + `<ImportoTotaleDocumento>${importoXml(totali.totale)}</ImportoTotaleDocumento>${causali}</DatiGeneraliDocumento>`
    + (doc.riferimento_esterno ? `<DatiOrdineAcquisto><IdDocumento>${testoXml(doc.riferimento_esterno, 20)}</IdDocumento></DatiOrdineAcquisto>` : '')
    + (doc.origine ? `<DatiFattureCollegate><IdDocumento>${testoXml(doc.origine.numero, 20)}</IdDocumento><Data>${doc.origine.data}</Data></DatiFattureCollegate>` : '')
    + [...ddt.values()].map(d => `<DatiDDT><NumeroDDT>${testoXml(d.numero, 20)}</NumeroDDT><DataDDT>${d.data}</DataDDT>`
      + d.linee.map(l => `<RiferimentoNumeroLinea>${l}</RiferimentoNumeroLinea>`).join('') + `</DatiDDT>`).join('')
    + `</DatiGenerali><DatiBeniServizi>${linee}${riepilogo}${testoSenzaRiepilogo}</DatiBeniServizi>${pagamenti}`
    + `</FatturaElettronicaBody></p:FatturaElettronica>\n`;
  return { xml, nomeFile: `IT${azienda.partita_iva}_${progressivo}.xml`, totali, errori };
}

// ───────────────────────────── autofatture TD17 / TD18 / TD19 ─────────────────────────────
// Integrazione dell'IVA sulla fattura di un fornitore estero: cedente = fornitore estero, cessionario = Casteltech.
// Regole: regime fiscale del cedente RF18 (altro), CAP 00000 per la sede estera, fattura del fornitore in DatiFattureCollegate,
// righe con l'IVA italiana (di solito 22 %), niente pagamenti né bollo. Lo SdI la recapita a Casteltech stessa (codice 0000000:
// arriva all'indirizzo registrato all'Agenzia).

export interface AutofatturaXml {
  id: number; tipo_sdi: string; numero: number | null; sezionale?: string; data: string; causale?: string | null;
  righe: RigaXml[]; fattura: { numero: string; data: string } | null;
}
export interface FornitoreXml {
  ragione_sociale: string; partita_iva?: string | null; codice_fiscale?: string | null; indirizzo?: string | null; cap?: string | null;
  comune?: string | null; provincia?: string | null; nazione: string;   // sigla ISO dell'indirizzo
}
const UE_XML = new Set(['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU', 'IE', 'LT', 'LU', 'LV', 'MT', 'NL',
  'PL', 'PT', 'RO', 'SE', 'SI', 'SK']);

export function generaAutofatturaXml(doc: AutofatturaXml, fornitore: FornitoreXml, aziendaInput: DatiAzienda, aliquote: Aliquota[]): EsitoXml {
  const errori: string[] = [];
  const { azienda, errori: erroriAzienda } = preparaAzienda(aziendaInput);
  erroriAzienda.forEach(e => errori.push(`Dati dell'azienda: ${e}`));
  if (!['TD17', 'TD18', 'TD19'].includes(doc.tipo_sdi)) errori.push('Tipo di autofattura non valido (TD17, TD18 o TD19).');
  if (doc.numero == null) errori.push('Il documento non ha ancora un numero.');
  if (!doc.fattura?.numero || !doc.fattura?.data) errori.push('Manca la fattura del fornitore (numero e data) a cui si riferisce l\'autofattura.');
  const perCodice = new Map(aliquote.map(a => [a.codice, a]));
  const righe = doc.righe.filter(r => !r.solo_descrizione);
  if (!righe.length) errori.push('Il documento non ha righe con un importo.');
  const totali = calcolaTotali(righe, aliquote, 'IVA22');
  errori.push(...totali.errori);

  // fornitore estero
  const nazione = (fornitore.nazione || '').toUpperCase();
  const piva = (fornitore.partita_iva ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!fornitore.ragione_sociale) errori.push('Fornitore senza ragione sociale.');
  if (!/^[A-Z]{2}$/.test(nazione)) errori.push(`Fornitore ${fornitore.ragione_sociale}: manca il paese.`);
  if (nazione === 'IT') errori.push(`Fornitore ${fornitore.ragione_sociale}: è italiano, l'autofattura TD17/18/19 è per i fornitori esteri.`);
  if (!piva) errori.push(`Fornitore ${fornitore.ragione_sociale}: manca la partita IVA (o il codice fiscale estero).`);
  if (!fornitore.indirizzo || !fornitore.comune) errori.push(`Fornitore ${fornitore.ragione_sociale}: mancano indirizzo o città.`);
  // il prefisso vale solo se è di un paese con P.IVA europea (un codice cinese può iniziare con due lettere)
  const prefisso = /^([A-Z]{2})/.exec(piva)?.[1].replace('EL', 'GR') ?? '';
  const id = UE_XML.has(prefisso) || ['GB', 'CH', 'NO'].includes(prefisso) ? idFiscale(piva, nazione) : { paese: nazione, codice: piva };
  if (doc.tipo_sdi === 'TD18' && !UE_XML.has(id.paese)) errori.push('TD18 è solo per fornitori con P.IVA dell\'Unione europea.');

  const numero = doc.numero == null ? '' : numeroCompleto(doc.numero, doc.sezionale);
  const linee = righe.map((r, i) => {
    const a = perCodice.get(r.aliquota_iva || 'IVA22');
    const quantita = Number(r.quantita) || 0, prezzo = Number(r.prezzo) || 0, sconto = Number(r.sconto) || 0;
    return `<DettaglioLinee><NumeroLinea>${i + 1}</NumeroLinea>`
      + (r.codice ? `<CodiceArticolo><CodiceTipo>FORNITORE</CodiceTipo><CodiceValore>${testoXml(r.codice, 35)}</CodiceValore></CodiceArticolo>` : '')
      + `<Descrizione>${testoXml(r.descrizione || r.codice || '-', 1000)}</Descrizione><Quantita>${decimaleXml(quantita)}</Quantita>`
      + `${el('UnitaMisura', testoXml(r.um, 10))}<PrezzoUnitario>${decimaleXml(prezzo)}</PrezzoUnitario>`
      + (sconto ? `<ScontoMaggiorazione><Tipo>SC</Tipo><Percentuale>${importoXml(sconto)}</Percentuale></ScontoMaggiorazione>` : '')
      + `<PrezzoTotale>${importoXml(quantita * prezzo * (1 - sconto / 100))}</PrezzoTotale>`
      + `<AliquotaIVA>${importoXml(a?.percentuale ?? 0)}</AliquotaIVA>${a?.natura ? el('Natura', a.natura) : ''}</DettaglioLinee>`;
  }).join('');
  const riepilogo = totali.riepilogo.map(g =>
    `<DatiRiepilogo><AliquotaIVA>${importoXml(g.percentuale)}</AliquotaIVA>${el('Natura', g.natura)}`
    + `<ImponibileImporto>${importoXml(g.imponibile)}</ImponibileImporto><Imposta>${importoXml(g.imposta)}</Imposta>`
    + (g.natura ? el('RiferimentoNormativo', testoXml(g.riferimento_normativo, 100)) : '<EsigibilitaIVA>I</EsigibilitaIVA>') + `</DatiRiepilogo>`).join('');
  const causali = (pulisci(doc.causale).slice(0, 2000).match(/[\s\S]{1,200}/g) ?? []).map(c => `<Causale>${proteggi(c)}</Causale>`).join('');
  // per l'autofattura non c'è bollo: si usa il totale senza
  const totale = arrotonda2(totali.imponibile + totali.imposta);

  const progressivo = progressivoInvio(doc.id);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n`
    + `<p:FatturaElettronica versione="FPR12" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" `
    + `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2 `
    + `http://www.fatturapa.gov.it/export/fatturazione/sdi/fatturapa/v1.2/Schema_del_file_xml_FatturaPA_versione_1.2.xsd">`
    + `<FatturaElettronicaHeader>`
    + `<DatiTrasmissione><IdTrasmittente><IdPaese>IT</IdPaese><IdCodice>${azienda.codice_fiscale || azienda.partita_iva}</IdCodice></IdTrasmittente>`
    + `<ProgressivoInvio>${progressivo}</ProgressivoInvio><FormatoTrasmissione>FPR12</FormatoTrasmissione>`
    + `<CodiceDestinatario>0000000</CodiceDestinatario></DatiTrasmissione>`
    + `<CedentePrestatore><DatiAnagrafici><IdFiscaleIVA><IdPaese>${id.paese}</IdPaese><IdCodice>${testoXml(id.codice, 28)}</IdCodice></IdFiscaleIVA>`
    + `<Anagrafica><Denominazione>${testoXml(fornitore.ragione_sociale, 80)}</Denominazione></Anagrafica><RegimeFiscale>RF18</RegimeFiscale></DatiAnagrafici>`
    + `<Sede>${el('Indirizzo', testoXml(fornitore.indirizzo, 60))}<CAP>00000</CAP>${el('Comune', testoXml(fornitore.comune, 60))}${el('Nazione', nazione)}</Sede>`
    + `</CedentePrestatore>`
    + `<CessionarioCommittente><DatiAnagrafici><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${azienda.partita_iva}</IdCodice></IdFiscaleIVA>`
    + `${el('CodiceFiscale', azienda.codice_fiscale)}<Anagrafica><Denominazione>${testoXml(azienda.ragione_sociale, 80)}</Denominazione></Anagrafica></DatiAnagrafici>`
    + `<Sede>${el('Indirizzo', testoXml(azienda.indirizzo, 60))}${el('CAP', azienda.cap)}${el('Comune', testoXml(azienda.comune, 60))}`
    + `${el('Provincia', azienda.provincia)}<Nazione>IT</Nazione></Sede></CessionarioCommittente>`
    + `</FatturaElettronicaHeader>`
    + `<FatturaElettronicaBody><DatiGenerali><DatiGeneraliDocumento><TipoDocumento>${doc.tipo_sdi}</TipoDocumento><Divisa>EUR</Divisa>`
    + `<Data>${doc.data}</Data><Numero>${testoXml(numero, 20)}</Numero><ImportoTotaleDocumento>${importoXml(totale)}</ImportoTotaleDocumento>${causali}</DatiGeneraliDocumento>`
    + (doc.fattura ? `<DatiFattureCollegate><IdDocumento>${testoXml(doc.fattura.numero, 20)}</IdDocumento><Data>${doc.fattura.data}</Data></DatiFattureCollegate>` : '')
    + `</DatiGenerali><DatiBeniServizi>${linee}${riepilogo}</DatiBeniServizi></FatturaElettronicaBody></p:FatturaElettronica>\n`;
  return { xml, nomeFile: `IT${azienda.partita_iva}_${progressivo}.xml`, totali: { ...totali, bollo: 0, totale }, errori };
}
