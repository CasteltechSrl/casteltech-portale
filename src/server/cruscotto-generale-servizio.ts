/**
 * Letture del cruscotto generale (pagina iniziale dell'ufficio, Adriano 31/10/2026).
 * Tutto si legge UNA volta all'apertura della pagina, con le richieste lanciate insieme: niente aggiornamenti automatici,
 * così il database su Neon (piano gratuito) può spegnersi quando nessuno lavora. I conti stanno in engine/cruscotto-generale.ts.
 */
import { q } from './db.js';
import { pianificaProduzione, righeOrdini } from './ordini-servizio.js';
import { elencoOrdiniFornitore } from './ordini-fornitore-servizio.js';
import { elencoBackup } from './backup.js';
import { avvisoServizi } from './stato-servizi.js';
import { caricoGiornaliero } from '../engine/ordini.js';
import { imponibilePerMese, riepilogoScadenze, variazione } from '../engine/cruscotto-amministrazione.js';
import { numeroCompleto } from '../engine/amministrazione.js';
import { INIZIO_DDT_DA_FATTURARE, SQL_CAUSALE_DA_FATTURARE } from '../engine/ddt.js';
import { caricoSettimane, cosaDaFare, giorniTra, piuGiorni, scadenzeFiscali } from '../engine/cruscotto-generale.js';
import { contaDifferite } from '../engine/fatture-differite.js';

const MOSTRATE = 4;   // righe per elenco in ogni riquadro
const somma = (v: number[]) => Math.round(v.reduce((s, x) => s + x, 0) * 100) / 100;

export async function datiCruscottoGenerale(oggi: string) {
  const anno = Number(oggi.slice(0, 4));
  const fra14 = piuGiorni(oggi, 14);
  const [
    righe, preventivi, preventiviUltimi, commesse, commesseAperte, tempiAperti, acquisizioni, crm, crmProssime,
    emessi, incassi, pagamenti, ddt, bozze, sdi, sdiUltimi, ricevutiSdi, ordiniFornitore, suggerimenti,
  ] = await Promise.all([
    righeOrdini(),
    q<{ stato: string; quanti: number; valore: number }>(`SELECT stato, count(*)::int AS quanti, coalesce(sum(totale_primo_lotto), 0) AS valore
      FROM preventivi WHERE stato IN ('da_validare', 'bozza', 'inviato') GROUP BY stato`),
    q<{ id: number; numero: string | null; stato: string; intestazione: any; creato_il: Date | string }>(`SELECT id, numero, stato, intestazione, creato_il FROM preventivi
      WHERE stato IN ('da_validare', 'bozza', 'inviato') ORDER BY (stato = 'da_validare') DESC, creato_il DESC LIMIT ${MOSTRATE}`),
    q<{ stato: string; quanti: number; in_ritardo: number }>(`SELECT stato, count(*)::int AS quanti, count(*) FILTER (WHERE data_consegna < $1)::int AS in_ritardo
      FROM commesse WHERE stato IN ('aperta', 'in_produzione') GROUP BY stato`, [oggi]),
    q<{ id: number; numero: string; stato: string; intestazione: any; data_consegna: string | null; quantita: number; ultimo_tempo: string | null }>(`
      SELECT c.id, c.numero, c.stato, c.intestazione, c.data_consegna, c.quantita,
        (SELECT max(coalesce(r.data::text, r.creato_il::date::text)) FROM rilevazioni r WHERE r.commessa_id = c.id) AS ultimo_tempo
      FROM commesse c WHERE c.stato IN ('aperta', 'in_produzione')
      ORDER BY (c.stato = 'in_produzione') DESC, c.data_consegna NULLS LAST, c.id LIMIT ${MOSTRATE}`),
    q<{ quanti: number }>(`SELECT count(*)::int AS quanti FROM rilevazioni WHERE aperta_il IS NOT NULL AND chiusa_il IS NULL`),
    q<{ tipo: string; stato: string; quanti: number }>(`SELECT tipo, stato, count(*)::int AS quanti FROM acquisizioni
      WHERE stato IN ('nuovo', 'da_confermare', 'errore') GROUP BY tipo, stato`),
    q<{ scadute: number; settimana: number }>(`SELECT count(*) FILTER (WHERE data_prossima_azione < $1)::int AS scadute,
        count(*) FILTER (WHERE data_prossima_azione >= $1 AND data_prossima_azione <= $1::date + 7)::int AS settimana
      FROM crm_aziende WHERE da_verificare IS NULL`, [oggi]),
    q<{ id: number; ragione_sociale: string; prossima_azione: string | null; data_prossima_azione: string }>(`SELECT id, ragione_sociale, prossima_azione, data_prossima_azione
      FROM crm_aziende WHERE da_verificare IS NULL AND data_prossima_azione <= $1::date + 7 ORDER BY data_prossima_azione, id LIMIT ${MOSTRATE}`, [oggi]),
    q<{ tipo: string; data: string; imponibile: number }>(`SELECT tipo, data, imponibile FROM documenti
      WHERE tipo IN ('fattura', 'nota_credito') AND stato NOT IN ('bozza', 'annullato', 'scartato') AND anno IN ($1::int, $1::int - 1)`, [anno]),
    q<{ data: string; importo: number; documento_id: number; numero_doc: number; sezionale: string; anno: number; nome: string }>(`
      SELECT s.data, s.importo, d.id AS documento_id, d.numero AS numero_doc, d.sezionale, d.anno,
        coalesce(c.ragione_sociale, d.intestatario->>'ragione_sociale', d.intestatario->>'nome', '') AS nome
      FROM documenti_scadenze s JOIN documenti d ON d.id = s.documento_id LEFT JOIN clienti c ON c.id = d.cliente_id
      WHERE s.pagata_il IS NULL AND d.tipo = 'fattura' AND d.stato NOT IN ('bozza', 'annullato', 'scartato') ORDER BY s.data, d.numero`),
    q<{ data: string; importo: number }>(`SELECT s.data, s.importo FROM documenti_ricevuti_scadenze s JOIN documenti_ricevuti d ON d.id = s.documento_id
      WHERE s.pagata_il IS NULL AND d.tipo = 'fattura'`),
    q<{ data: string }>(`SELECT d.data::text AS data FROM documenti d
      WHERE d.tipo = 'ddt' AND d.fattura_id IS NULL AND d.stato NOT IN ('bozza', 'annullato', 'scartato') AND (d.origine <> 'fic' OR d.data >= '${INIZIO_DDT_DA_FATTURARE}')
        AND ${SQL_CAUSALE_DA_FATTURARE}`),
    q<{ quanti: number }>(`SELECT count(*)::int AS quanti FROM documenti WHERE stato = 'bozza' AND tipo IN ('fattura', 'nota_credito', 'autofattura', 'ddt')`),
    q<{ stato: string; quanti: number; ultimo: number }>(`SELECT stato, count(*)::int AS quanti, max(id) AS ultimo FROM documenti
      WHERE stato IN ('scartato', 'non_consegnato', 'inviato') AND tipo IN ('fattura', 'nota_credito', 'autofattura') GROUP BY stato`),
    q<{ id: number; tipo: string; numero: number; sezionale: string; anno: number; stato: string; sdi_messaggio: string | null; nome: string }>(`
      SELECT d.id, d.tipo, d.numero, d.sezionale, d.anno, d.stato, d.sdi_messaggio,
        coalesce(c.ragione_sociale, d.intestatario->>'ragione_sociale', d.intestatario->>'nome', '') AS nome
      FROM documenti d LEFT JOIN clienti c ON c.id = d.cliente_id
      WHERE d.stato IN ('scartato', 'non_consegnato', 'inviato') AND d.tipo IN ('fattura', 'nota_credito', 'autofattura')
      ORDER BY (d.stato = 'scartato') DESC, (d.stato = 'non_consegnato') DESC, d.inviato_il DESC NULLS LAST LIMIT 3`),
    q<{ quanti: number }>(`SELECT count(*)::int AS quanti FROM documenti_ricevuti WHERE origine = 'sdi' AND creato_il >= now() - interval '7 days'`),
    elencoOrdiniFornitore(),
    q<{ quanti: number }>(`SELECT count(*)::int AS quanti FROM suggerimenti WHERE stato = 'da_valutare'`),
  ]);

  // ── Ordini clienti ──
  const aperte = righe.filter(x => ['da_evadere', 'parziale'].includes(x.stato));
  const daEvadere = somma(aperte.map(x => x.residuoValore));
  const schedeAperte = aperte.filter(x => x.tipo === 'scheda' && x.residuoQuantita > 0);
  const inRitardo = schedeAperte.filter(x => x.consegna && x.consegna < oggi);
  const prossime = schedeAperte.filter(x => x.consegna && x.consegna <= fra14).sort((a, b) => a.consegna!.localeCompare(b.consegna!));
  const pian = await pianificaProduzione(oggi, righe);
  const settimane = caricoSettimane(caricoGiornaliero(pian.barre), oggi, pian.oreGiorno);

  // ── Amministrazione ──
  const fatturato = somma(imponibilePerMese(emessi, anno)), fatturatoPrima = somma(imponibilePerMese(emessi, anno - 1, oggi));
  const meseCorrente = Number(oggi.slice(5, 7));
  const fatturatoMese = imponibilePerMese(emessi, anno)[meseCorrente - 1];
  const inc = riepilogoScadenze(incassi, oggi), pag = riepilogoScadenze(pagamenti, oggi);
  const incassiScaduti = incassi.filter(s => s.data < oggi).slice(0, 3)
    .map(s => ({ ...s, numero: numeroCompleto(s.numero_doc, s.sezionale) + (s.anno === anno ? '' : `/${s.anno}`), giorni: giorniTra(s.data, oggi) }));
  const sdiConto = (stato: string) => sdi.find(x => x.stato === stato)?.quanti ?? 0;
  const sdiUltimo = (stato: string) => sdi.find(x => x.stato === stato)?.ultimo;

  // ── Commerciale ──
  const prev = (stato: string) => preventivi.find(x => x.stato === stato);
  const acq = (filtro: (a: { tipo: string; stato: string }) => boolean) => acquisizioni.filter(filtro).reduce((s, a) => s + a.quanti, 0);
  const ordiniDaAcquisire = acq(a => a.tipo !== 'scheda_produzione' && a.stato !== 'errore');
  const schedeScansionate = acq(a => a.tipo === 'scheda_produzione' && a.stato === 'da_confermare');
  const comm = (stato: string) => commesse.find(x => x.stato === stato);

  // ── Acquisti ──
  const ofAperti = ordiniFornitore.filter(o => !['bozza', 'annullato'].includes(o.stato) && o.arrivo !== 'arrivato');

  const differite = contaDifferite(ddt, oggi);
  const daFare = cosaDaFare({
    sdiScartate: sdiConto('scartato'), sdiNonConsegnate: sdiConto('non_consegnato'), consegneInRitardo: inRitardo.length,
    preventiviDaValidare: prev('da_validare')?.quanti ?? 0, ordiniDaAcquisire, acquisizioniInErrore: acq(a => a.stato === 'errore'),
    ddtDaFatturare: ddt.length, schedeScansionate, tempiAperti: tempiAperti[0]?.quanti ?? 0, crmScadute: crm[0]?.scadute ?? 0,
    incassiScaduti: inc.fasce.scaduta.quante, pagamentiScaduti: pag.fasce.scaduta.quante, bozzeDocumenti: bozze[0]?.quanti ?? 0,
    differiteScadute: differite.scaduti, differiteInScadenza: differite.inScadenza,
  }, {
    'sdi-scartate': sdiUltimo('scartato') ? `/amministrazione/documenti/${sdiUltimo('scartato')}` : undefined,
    'sdi-non-consegnate': sdiUltimo('non_consegnato') ? `/amministrazione/documenti/${sdiUltimo('non_consegnato')}` : undefined,
    'preventivi-da-validare': preventiviUltimi[0]?.stato === 'da_validare' ? `/preventivi/${preventiviUltimi[0].id}` : undefined,
  });

  return {
    daFare,
    cifre: {
      fatturato, variazioneFatturato: variazione(fatturato, fatturatoPrima), fatturatoPrima,
      daEvadere, righeDaEvadere: aperte.length, consegne14: prossime.length,
      preventiviAperti: (prev('bozza')?.quanti ?? 0) + (prev('inviato')?.quanti ?? 0) + (prev('da_validare')?.quanti ?? 0),
      preventiviInviati: prev('inviato')?.quanti ?? 0, valoreInviati: prev('inviato')?.valore ?? 0,
      commesseAperte: (comm('aperta')?.quanti ?? 0) + (comm('in_produzione')?.quanti ?? 0),
      commesseInRitardo: (comm('aperta')?.in_ritardo ?? 0) + (comm('in_produzione')?.in_ritardo ?? 0),
      daIncassare: inc.totale, incassiScaduti: inc.fasce.scaduta.totale,
      daPagare: pag.totale, pagamentiScaduti: pag.fasce.scaduta.totale, pagamenti7: pag.fasce.settimana.totale,
    },
    commerciale: {
      daValidare: prev('da_validare')?.quanti ?? 0, bozze: prev('bozza')?.quanti ?? 0, inviati: prev('inviato')?.quanti ?? 0,
      ultimi: preventiviUltimi, crmScadute: crm[0]?.scadute ?? 0, crmSettimana: crm[0]?.settimana ?? 0, crmProssime,
    },
    ordini: { daEvadere: aperte.length, inRitardo: inRitardo.length, valore: daEvadere, prossime: prossime.slice(0, MOSTRATE), altreProssime: Math.max(0, prossime.length - MOSTRATE), ordiniDaAcquisire },
    produzione: {
      aperte: comm('aperta')?.quanti ?? 0, inProduzione: comm('in_produzione')?.quanti ?? 0, tempiAperti: tempiAperti[0]?.quanti ?? 0,
      schedeScansionate, settimane, oreGiorno: pian.oreGiorno, commesse: commesseAperte,
    },
    acquisti: {
      aperti: ofAperti.length, parziali: ofAperti.filter(o => o.arrivo === 'parziale').length,
      bozze: ordiniFornitore.filter(o => o.stato === 'bozza').length, elenco: ofAperti.slice(0, MOSTRATE),
    },
    amministrazione: {
      fatturatoMese, scadutoClienti: inc.fasce.scaduta.totale, ddtDaFatturare: ddt.length, differite,
      sdi: sdiUltimi, sdiInAttesa: sdiConto('inviato'), ricevutiSdi: ricevutiSdi[0]?.quanti ?? 0, incassiScaduti,
    },
    sistema: {
      scadenze: scadenzeFiscali(oggi), backup: elencoBackup()[0] ?? null, servizi: avvisoServizi(), suggerimenti: suggerimenti[0]?.quanti ?? 0,
    },
  };
}

export type DatiCruscottoGenerale = Awaited<ReturnType<typeof datiCruscottoGenerale>>;
