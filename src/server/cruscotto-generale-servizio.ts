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
import { caricoGiornaliero, consegneInRitardo, daEvadere as daEvadereSchede } from '../engine/ordini.js';
import { SQL_DATA_DA_INCASSARE, SQL_IMPORTO_DA_INCASSARE, imponibilePerMese, riepilogoScadenze, variazione } from '../engine/cruscotto-amministrazione.js';
import { numeroCompleto } from '../engine/amministrazione.js';
import { SQL_DDT_DIFFERITA } from '../engine/ddt.js';
import { caricoSettimane, cosaDaFare, giorniTra, piuGiorni, scadenzeFiscali } from '../engine/cruscotto-generale.js';
import { contaDifferite } from '../engine/fatture-differite.js';
import { bolloPerTrimestre } from '../engine/fiscale.js';
import { ordinaRiprendi, type VoceRiprendi } from '../engine/riprendi.js';
import { limiteConfronto } from '../engine/anno-riferimento.js';
import { fatturatoClienti } from './anno-riferimento.js';
import { SQL_IMPONIBILE_COSTO, SQL_NON_DOPPIONE } from '../engine/costo-fornitori.js';

const MOSTRATE = 4;   // righe per elenco in ogni riquadro
const somma = (v: number[]) => Math.round(v.reduce((s, x) => s + x, 0) * 100) / 100;

export async function datiCruscottoGenerale(oggi: string, annoScelto = Number(oggi.slice(0, 4))) {
  const anno = Number(oggi.slice(0, 4));
  // anno di riferimento (Adriano 10/11/2026): i numeri "dell'anno" seguono l'anno scelto, il resto è la situazione di oggi
  const ar = annoScelto, inCorso = ar === anno, limitePrima = limiteConfronto(ar, oggi);
  const fra14 = piuGiorni(oggi, 14);
  const [
    righe, preventivi, preventiviUltimi, commesse, commesseAperte, tempiAperti, acquisizioni, crm, crmProssime,
    emessi, incassi, pagamenti, ddt, bozze, sdi, sdiUltimi, ricevutiSdi, ordiniFornitore, suggerimenti,
    clienti, preventiviAnno, ordiniAnno, commesseAnno, ricevutiAnno, personale,
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
      FROM crm_aziende WHERE da_verificare IS NULL AND stato NOT IN ('non_interessato', 'scartato')`, [oggi]),
    q<{ id: number; ragione_sociale: string; prossima_azione: string | null; data_prossima_azione: string }>(`SELECT id, ragione_sociale, prossima_azione, data_prossima_azione
      FROM crm_aziende WHERE da_verificare IS NULL AND stato NOT IN ('non_interessato', 'scartato') AND data_prossima_azione <= $1::date + 7 ORDER BY data_prossima_azione, id LIMIT ${MOSTRATE}`, [oggi]),
    q<{ tipo: string; data: string; imponibile: number }>(`SELECT tipo, data, imponibile FROM documenti
      WHERE tipo IN ('fattura', 'nota_credito') AND stato NOT IN ('bozza', 'annullato', 'scartato') AND anno IN ($1::int, $1::int - 1)`, [ar]),
    q<{ data: string; importo: number; documento_id: number; numero_doc: number; sezionale: string; anno: number; nome: string }>(`
      SELECT (${SQL_DATA_DA_INCASSARE})::text AS data, (${SQL_IMPORTO_DA_INCASSARE})::float AS importo, d.id AS documento_id, d.numero AS numero_doc, d.sezionale, d.anno,
        coalesce(c.ragione_sociale, d.intestatario->>'ragione_sociale', d.intestatario->>'nome', '') AS nome
      FROM documenti_scadenze s JOIN documenti d ON d.id = s.documento_id LEFT JOIN clienti c ON c.id = d.cliente_id
      WHERE s.pagata_il IS NULL AND d.tipo IN ('fattura', 'nota_credito') AND d.stato NOT IN ('bozza', 'annullato', 'scartato') ORDER BY 1, d.numero`),
    q<{ data: string; importo: number }>(`SELECT s.data, s.importo FROM documenti_ricevuti_scadenze s JOIN documenti_ricevuti d ON d.id = s.documento_id
      WHERE s.pagata_il IS NULL AND d.tipo = 'fattura'`),
    q<{ data: string }>(`SELECT d.data::text AS data FROM documenti d WHERE ${SQL_DDT_DIFFERITA}`),   // stessi DDT della pagina Fatture differite
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
    // ── numeri dell'anno di riferimento ──
    fatturatoClienti(ar, oggi),
    q<{ quanti: number; accettati: number; valore: number }>(`SELECT count(*)::int AS quanti, count(*) FILTER (WHERE stato = 'accettato')::int AS accettati,
        coalesce(sum(totale_primo_lotto) FILTER (WHERE stato = 'accettato'), 0)::float AS valore
      FROM preventivi WHERE extract(year FROM creato_il AT TIME ZONE 'Europe/Rome')::int = $1`, [ar]),
    q<{ anno: number; quanti: number; valore: number }>(`SELECT extract(year FROM o.data)::int AS anno, count(DISTINCT o.id)::int AS quanti,
        coalesce(sum(r.quantita * r.prezzo), 0)::float AS valore
      FROM (SELECT id, coalesce(data_ordine, creato_il::date) AS data FROM ordini WHERE origine <> 'postumo') o LEFT JOIN ordini_righe r ON r.ordine_id = o.id
      WHERE extract(year FROM o.data)::int IN ($1::int, $1::int - 1) AND ($2::date IS NULL OR o.data <= $2::date OR extract(year FROM o.data)::int = $1) GROUP BY 1`, [ar, limitePrima]),
    q<{ quanti: number; schede: number }>(`SELECT count(*)::int AS quanti, coalesce(sum(quantita), 0)::int AS schede FROM commesse
      WHERE extract(year FROM creato_il AT TIME ZONE 'Europe/Rome')::int = $1`, [ar]),
    q<{ tipo: string; data: string; imponibile: number }>(`SELECT d.tipo, to_char(d.data, 'YYYY-MM-DD') AS data, ${SQL_IMPONIBILE_COSTO}::float AS imponibile FROM documenti_ricevuti d
      WHERE extract(year FROM d.data)::int IN ($1::int, $1::int - 1) AND ${SQL_NON_DOPPIONE}`, [ar]),
    q<{ anno: number; mese: number; costo: number }>(`SELECT anno, mese, sum(lordo + contributi + tfr + altri)::float AS costo FROM costi_personale
      WHERE anno IN ($1::int, $1::int - 1) GROUP BY 1, 2`, [ar]),
  ]);

  // ── Ordini clienti ──
  const aperte = righe.filter(x => ['da_evadere', 'parziale'].includes(x.stato));
  const daEvadere = somma(aperte.map(x => x.residuoValore));   // valore ancora da fatturare: anche le righe di costo (una tantum, lamine…)
  // righe da evadere = solo schede (Adriano 6/11/2026): le righe di costo non sono prodotti da produrre o spedire
  const schedeAperte = daEvadereSchede(aperte).filter(x => x.residuoQuantita > 0);
  const inRitardo = consegneInRitardo(schedeAperte, oggi);   // stessa regola della scheda Ordini → In ritardo
  const prossime = schedeAperte.filter(x => x.consegna && x.consegna <= fra14).sort((a, b) => a.consegna!.localeCompare(b.consegna!));
  const pian = await pianificaProduzione(oggi, righe);
  const settimane = caricoSettimane(caricoGiornaliero(pian.barre), oggi, pian.oreGiorno);

  // ── Amministrazione ──
  const fatturato = somma(imponibilePerMese(emessi, ar)), fatturatoPrima = somma(imponibilePerMese(emessi, ar - 1, limitePrima ?? undefined));
  const meseCorrente = Number(oggi.slice(5, 7));
  const fatturatoMese = inCorso ? imponibilePerMese(emessi, anno)[meseCorrente - 1] : null;
  const acquistiAnno = somma(imponibilePerMese(ricevutiAnno, ar)), acquistiPrima = somma(imponibilePerMese(ricevutiAnno, ar - 1, limitePrima ?? undefined));
  const ordAnno = ordiniAnno.find(x => x.anno === ar), ordPrima = ordiniAnno.find(x => x.anno === ar - 1);
  // costo del personale: mesi caricati dell'anno scelto, confronto con gli stessi mesi dell'anno prima
  const mesiPers = personale.filter(x => x.anno === ar);
  const costoPersonale = somma(mesiPers.map(x => Number(x.costo)));
  const primaPers = mesiPers.map(x => personale.find(y => y.anno === ar - 1 && y.mese === x.mese));
  const costoPersonalePrima = mesiPers.length && primaPers.every(Boolean) ? somma(primaPers.map(y => Number(y!.costo))) : 0;
  const fatturatoMesiPers = somma(imponibilePerMese(emessi, ar).filter((_, i) => mesiPers.some(x => x.mese === i + 1)));
  const inc = riepilogoScadenze(incassi, oggi), pag = riepilogoScadenze(pagamenti, oggi);
  const incassiScaduti = incassi.filter(s => s.data < oggi && s.importo > 0).slice(0, 3)
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
      daEvadere, righeDaEvadere: schedeAperte.length, consegne14: prossime.length,
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
    ordini: { daEvadere: schedeAperte.length, inRitardo: inRitardo.length, valore: daEvadere, prossime: prossime.slice(0, MOSTRATE), altreProssime: Math.max(0, prossime.length - MOSTRATE), ordiniDaAcquisire },
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
    anno: {
      anno: ar, inCorso, clienti,
      preventivi: preventiviAnno[0] ?? { quanti: 0, accettati: 0, valore: 0 },
      ordini: { quanti: ordAnno?.quanti ?? 0, valore: ordAnno?.valore ?? 0, prima: ordPrima?.valore ?? 0, variazione: variazione(ordAnno?.valore ?? 0, ordPrima?.valore ?? 0) },
      commesse: commesseAnno[0] ?? { quanti: 0, schede: 0 },
      acquisti: { totale: acquistiAnno, prima: acquistiPrima, variazione: variazione(acquistiAnno, acquistiPrima) },
      personale: { totale: costoPersonale, mesi: mesiPers.length, variazione: variazione(costoPersonale, costoPersonalePrima),
        peso: fatturatoMesiPers > 0 ? Math.round(costoPersonale / fatturatoMesiPers * 1000) / 10 : null },
    },
    sistema: {
      scadenze: scadenzeFiscali(oggi, 35, await trimestriBollo(oggi)), backup: elencoBackup()[0] ?? null, servizi: avvisoServizi(), suggerimenti: suggerimenti[0]?.quanti ?? 0,
    },
  };
}

export type DatiCruscottoGenerale = Awaited<ReturnType<typeof datiCruscottoGenerale>>;

/**
 * "Riprendi da dove eri" (1/11/2026): le ultime cose toccate negli ultimi 14 giorni e ancora aperte, prima quelle dell'utente.
 * Una lettura sola, già filtrata per stato: bozze di fattura/NC/DDT/conferma/ordine a fornitore, preventivi bozza o da validare,
 * commesse aperte o in produzione, pacchetti di documenti del cliente non ancora diventati preventivo.
 */
export async function cosePerRiprendere(utenteId: number | null, quante = 8): Promise<VoceRiprendi[]> {
  const voci = await q<VoceRiprendi>(`
    SELECT * FROM (
      SELECT CASE d.tipo WHEN 'ddt' THEN 'DDT' WHEN 'nota_credito' THEN 'Nota di credito' WHEN 'conferma_ordine' THEN 'Conferma d''ordine'
               WHEN 'ordine_fornitore' THEN 'Ordine a fornitore' WHEN 'autofattura' THEN 'Autofattura' ELSE 'Fattura' END AS tipo,
             'bozza · ' || coalesce(c.ragione_sociale, fa.ragione_sociale, d.intestatario->>'ragione_sociale', d.intestatario->>'nome', 'senza intestatario') AS titolo,
             NULL AS dettaglio,
             CASE WHEN d.tipo = 'ordine_fornitore' THEN '/ordini/fornitori/' || d.id WHEN d.tipo = 'conferma_ordine' THEN '/ordini/' || d.ordine_id || '/conferme/' || d.id
                  ELSE '/amministrazione/documenti/' || d.id END AS href,
             to_char(d.aggiornato_il AT TIME ZONE 'Europe/Rome', 'YYYY-MM-DD"T"HH24:MI') AS quando, d.creato_da AS "utenteId"
      FROM documenti d LEFT JOIN clienti c ON c.id = d.cliente_id LEFT JOIN fornitori_anagrafica fa ON fa.id = d.fornitore_id
      WHERE d.stato = 'bozza' AND d.aggiornato_il > now() - interval '14 days'
      UNION ALL
      SELECT 'Preventivo', coalesce(p.numero, 'P' || p.id) || ' · ' || coalesce(p.intestazione->>'cliente', '') AS titolo,
             nullif(coalesce(p.intestazione->>'codice', '') || CASE WHEN p.stato = 'da_validare' THEN ' · da validare' ELSE ' · bozza' END, '') AS dettaglio,
             '/preventivi/' || p.id, to_char(p.aggiornato_il AT TIME ZONE 'Europe/Rome', 'YYYY-MM-DD"T"HH24:MI'), p.creato_da
      FROM preventivi p WHERE p.stato IN ('bozza', 'da_validare') AND p.aggiornato_il > now() - interval '14 days'
      UNION ALL
      SELECT 'Commessa', k.numero || ' · ' || coalesce(k.intestazione->>'cliente', ''), coalesce(k.intestazione->>'codice', '') || ' · ' || replace(k.stato, '_', ' '),
             '/commesse/' || k.id, to_char(k.aggiornato_il AT TIME ZONE 'Europe/Rome', 'YYYY-MM-DD"T"HH24:MI'), k.creato_da
      FROM commesse k WHERE k.stato IN ('aperta', 'in_produzione') AND k.aggiornato_il > now() - interval '14 days'
      UNION ALL
      SELECT 'Documenti del cliente', coalesce(s.nome, 'pacchetto ' || s.id), 'da analizzare o da trasformare in preventivo',
             '/preventivi/documenti/' || s.id, to_char(s.creato_il AT TIME ZONE 'Europe/Rome', 'YYYY-MM-DD"T"HH24:MI'), s.creato_da
      FROM pacchetti_scheda s WHERE s.creato_il > now() - interval '14 days' AND s.padre_id IS NULL AND s.preventivo_id IS NULL
    ) x ORDER BY quando DESC LIMIT 60`).catch(() => [] as VoceRiprendi[]);
  return ordinaRiprendi(voci, utenteId, quante);
}

/** Bollo virtuale dell'anno in corso e dell'anno prima (il 4° trimestre si versa a febbraio), per le scadenze del cruscotto. */
async function trimestriBollo(oggi: string) {
  const anno = Number(oggi.slice(0, 4));
  const doc = await q<{ data: string; bollo: number }>(`SELECT to_char(data, 'YYYY-MM-DD') AS data, bollo::float AS bollo FROM documenti
    WHERE tipo IN ('fattura', 'nota_credito') AND stato NOT IN ('bozza', 'annullato', 'scartato') AND numero IS NOT NULL AND bollo > 0
      AND extract(year FROM data)::int >= $1`, [anno - 1]);
  return [anno - 1, anno].flatMap(a => bolloPerTrimestre(a, doc, oggi).map(t => ({ ...t, anno: a })));
}
