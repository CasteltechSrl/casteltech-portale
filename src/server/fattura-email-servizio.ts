/**
 * Fattura e nota di credito di cortesia per email (Adriano 4/11/2026, "come per i preventivi"): PDF di cortesia (pdf-fattura.ts)
 * allegato, parte da amministrazione@ (alias di info@, se attivo in Gmail; altrimenti da info@) con Gmail. Resta scritto a chi e quando
 * (documenti.email_a / email_inviata_il) e si vede il segno "Inviato" (✉) accanto a quello dello SdI. Lo stato del documento non cambia.
 */
import { importoDaIncassare } from '../engine/tipi-fattura.js';
import { q, q1 } from './db.js';
import { gmailConfigurato, inviaGmail, mittentePer } from './gmail.js';
import { descriviMittente, intestazioneDa } from '../engine/mittenti-email.js';
import { elencoIndirizzi, indirizzoEmail, messaggioEmail } from '../engine/conferme-ordine.js';
import { addebitaBollo, calcolaTotali, siglaNazione } from '../engine/amministrazione.js';
import { bloccoInvioCortesia, destinatarioFattura, emailFattura, nomeFilePdfFattura } from '../engine/fattura-email.js';
import { caricaAliquote } from './amministrazione-servizio.js';
import { pdfFattura } from './pdf-fattura.js';
import { MODALITA } from './views/stampa-documento.js';

/** Tutto quello che serve alla copia di cortesia (pagina di stampa e PDF): cliente come all'emissione, totali, scadenze, lettera d'intento. */
export async function datiStampaFattura(id: number) {
  const d = await q1<any>(`SELECT * FROM documenti WHERE id = $1 AND tipo IN ('fattura', 'nota_credito')`, [id]);
  if (!d) return null;
  const righe = await q<any>(`SELECT * FROM documenti_righe WHERE documento_id = $1 ORDER BY posizione`, [id]);
  const azienda = (await q1<any>(`SELECT valore FROM impostazioni WHERE chiave = 'azienda'`))?.valore ?? {};
  // cliente come all'emissione (fotografia), in bozza i dati attuali; totali dalle righe con l'IVA predefinita del cliente
  const attuale = d.cliente_id ? await q1<any>(`SELECT * FROM clienti WHERE id = $1`, [d.cliente_id]) : null;
  const fotografia = d.intestatario && d.numero != null ? d.intestatario : attuale ?? {};
  const righeIva = righe.map(r => ({ ...r, aliquota_iva: r.solo_descrizione ? null : r.aliquota_iva || attuale?.aliquota_iva || 'IVA22' }));
  const totali = calcolaTotali(righeIva, await caricaAliquote(), 'IVA22', { addebita: addebitaBollo(d.tipo) });
  // bollo addebitato: riga in fondo, come nell'XML
  if (totali.rigaBollo) righeIva.push(totali.rigaBollo);
  const scadenze = await q<any>(`SELECT * FROM documenti_scadenze WHERE documento_id = $1 ORDER BY data`, [id]);
  const pagamento = d.condizione_pagamento ? await q1<any>(`SELECT * FROM condizioni_pagamento WHERE codice = $1`, [d.condizione_pagamento]) : null;
  const intento = totali.riepilogo.some(g => g.natura === 'N3.5') ? await q1<any>(d.dichiarazione_intento_id
    ? `SELECT * FROM dichiarazioni_intento WHERE id = $1` : `SELECT * FROM dichiarazioni_intento WHERE cliente_id = $1 ORDER BY data_protocollo DESC LIMIT 1`,
    [d.dichiarazione_intento_id ?? d.cliente_id]) : null;
  // documento emesso: split payment come all'emissione (la fotografia non salva i "false": senza la voce non era in split).
  // Prima si ricadeva sui dati attuali del cliente e una vecchia fattura poteva diventare split payment nella stampa (controllo del 4/11/2026).
  const cliente = { ...fotografia, split_payment: d.intestatario && d.numero != null ? !!fotografia.split_payment : !!attuale?.split_payment };
  return { d, righe: righeIva, azienda, cliente, totali, scadenze, intento, pagamento };
}

/**
 * Dati dell'autofattura impaginata (Adriano 12/11/2026): fornitore estero come all'emissione (fotografia), in bozza dall'anagrafica;
 * fattura del fornitore collegata (numero, data, valuta, cambio); totali dalle righe, senza bollo.
 */
export async function datiStampaAutofattura(id: number) {
  const d = await q1<any>(`SELECT * FROM documenti WHERE id = $1 AND tipo = 'autofattura'`, [id]);
  if (!d) return null;
  const righe = await q<any>(`SELECT * FROM documenti_righe WHERE documento_id = $1 ORDER BY posizione`, [id]);
  const azienda = (await q1<any>(`SELECT valore FROM impostazioni WHERE chiave = 'azienda'`))?.valore ?? {};
  const f = d.fornitore_id ? await q1<any>(`SELECT * FROM fornitori_anagrafica WHERE id = $1`, [d.fornitore_id]) : null;
  const fornitore = d.intestatario && d.numero != null ? d.intestatario : f ? { ...f, nazione: siglaNazione(f.paese) ?? '' } : {};
  const fattura = d.ricevuto_id ? await q1<any>(`SELECT numero, data::text AS data, valuta, cambio::float AS cambio FROM documenti_ricevuti WHERE id = $1`, [d.ricevuto_id]) : null;
  const righeIva = righe.map(r => ({ ...r, aliquota_iva: r.solo_descrizione ? null : r.aliquota_iva || 'IVA22' }));
  const totali = calcolaTotali(righeIva, await caricaAliquote(), 'IVA22', { addebita: false });
  return { d, righe: righeIva, azienda, fornitore, totali, fattura };
}

export async function pdfDellaFattura(id: number): Promise<{ nome: string; dati: Buffer } | null> {
  const x = await datiStampaFattura(id);
  if (!x) return null;
  const anno = x.d.anno ?? Number(String(x.d.data instanceof Date ? x.d.data.toISOString() : x.d.data).slice(0, 4));
  const numero = x.d.numero == null ? null : (x.d.sezionale ? `${x.d.numero}/${x.d.sezionale}` : x.d.numero);
  return {
    nome: nomeFilePdfFattura(x.d.tipo, x.d.tipo_sdi, numero, anno, x.cliente.ragione_sociale ?? ''),
    dati: await pdfFattura({ ...x, modalita: x.pagamento ? MODALITA[x.pagamento.modalita] : undefined }),
  };
}

/** Indirizzo, oggetto e testo proposti nella pagina della fattura; null se non si può mandare. */
export async function propostaEmailFattura(id: number) {
  const x = await datiStampaFattura(id);
  if (!x || bloccoInvioCortesia(x.d)) return null;
  const c = x.d.cliente_id ? await q1<any>(`SELECT c.email_amministrazione,
      (SELECT z.email FROM crm_aziende z WHERE z.cliente_id = c.id AND z.email IS NOT NULL ORDER BY z.id LIMIT 1) AS crm,
      (SELECT d.email_a FROM documenti d WHERE d.tipo IN ('fattura', 'nota_credito') AND d.cliente_id = c.id AND d.email_a IS NOT NULL
        AND NOT coalesce(d.inviato_a_mano, false) AND d.id <> $2 ORDER BY d.email_inviata_il DESC NULLS LAST LIMIT 1) AS ultima
    FROM clienti c WHERE c.id = $1`, [x.d.cliente_id, id]).catch(() => null) : null;
  const a = destinatarioFattura({ amministrazione: c?.email_amministrazione, ultimaFattura: c?.ultima, crm: indirizzoEmail(c?.crm) });
  const azienda = x.azienda.ragione_sociale || 'Casteltech S.r.l.';
  const aperte = x.scadenze.filter((s: any) => !s.pagata_il).map((s: any) => ({ data: s.data, importo: Number(s.importo) }));
  const bonifico = !x.pagamento || x.pagamento.modalita === 'MP05';
  const testo = emailFattura({ tipo: x.d.tipo, tipoSdi: x.d.tipo_sdi, numero: x.d.numero, sezionale: x.d.sezionale, data: x.d.data, azienda,
    totale: Number(x.d.totale) || x.totali.totale, scadenze: aperte, iban: bonifico ? x.azienda.iban : null,
    nettoDaPagare: x.cliente.split_payment ? importoDaIncassare(x.totali, true) : null });
  return { a, ...testo, attivo: gmailConfigurato(), mittente: descriviMittente(await mittentePer(x.d.tipo)) };
}

/** Manda la copia di cortesia con il PDF allegato; restituisce gli indirizzi a cui è partita. */
export async function inviaFatturaEmail(id: number, b: { a?: string; cc?: string; oggetto?: string; testo?: string }): Promise<string> {
  const x = await datiStampaFattura(id);
  if (!x) throw new Error('Documento non trovato.');
  const blocco = bloccoInvioCortesia(x.d);
  if (blocco) throw new Error(blocco);
  const a = elencoIndirizzi(b.a), cc = elencoIndirizzi(b.cc);
  if (!a.indirizzi.length) throw new Error('Scrivi a chi mandarla.');
  if (a.errati.length || cc.errati.length) throw new Error(`Indirizzi non validi: ${[...a.errati, ...cc.errati].join(', ')}.`);
  const oggetto = String(b.oggetto ?? '').trim(), testo = String(b.testo ?? '').trim();
  if (!oggetto || !testo) throw new Error("Servono l'oggetto e il testo dell'email.");
  const pdf = (await pdfDellaFattura(id))!;
  const azienda = String(x.azienda.ragione_sociale || 'Casteltech S.r.l.').replace(/"/g, '');
  const inviato = await inviaGmail(messaggioEmail({ da: intestazioneDa(azienda, (await mittentePer(x.d.tipo)).indirizzo), a: a.indirizzi, cc: cc.indirizzi, oggetto, testo,
    allegato: { nome: pdf.nome, mime: 'application/pdf', dati: pdf.dati } }));
  await q(`UPDATE documenti SET email_a = $2, email_inviata_il = now(), email_id = $3, inviato_a_mano = false WHERE id = $1`,
    [id, [...a.indirizzi, ...cc.indirizzi].join(', '), inviato.id]);
  return a.indirizzi.join(', ');
}
