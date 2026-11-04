/**
 * Invio del DDT per email dal portale (Adriano 2/11/2026): PDF del DDT (pdf-ddt.ts) allegato, parte da info@ con Gmail
 * (stessa delega di Google Workspace di conferme d'ordine, ordini a fornitore e solleciti). Si manda solo un DDT emesso
 * e non annullato; resta scritto a chi e quando (documenti.email_a / email_inviata_il), lo stato del DDT non cambia.
 */
import { q, q1 } from './db.js';
import { gmailConfigurato, inviaGmail, mittentePer } from './gmail.js';
import { descriviMittente, intestazioneDa } from '../engine/mittenti-email.js';
import { pdfDdt } from './pdf-ddt.js';
import { elencoIndirizzi, indirizzoEmail, messaggioEmail } from '../engine/conferme-ordine.js';
import { destinatarioDdt, emailDdt, nomeFilePdfDdt } from '../engine/ddt.js';
import { numeroCompleto } from '../engine/amministrazione.js';

/** Dati della stampa del DDT: documento, righe, azienda e destinatario (fotografia dell'emissione, in bozza l'anagrafica attuale). */
export async function datiStampaDdt(id: number) {
  const d = await q1<any>(`SELECT d.*, c.ragione_sociale AS c_ragione_sociale, c.partita_iva AS c_partita_iva, c.indirizzo AS c_indirizzo, c.cap AS c_cap,
      c.comune AS c_comune, c.provincia AS c_provincia, c.nazione AS c_nazione
    FROM documenti d LEFT JOIN clienti c ON c.id = d.cliente_id WHERE d.id = $1 AND d.tipo = 'ddt'`, [id]);
  if (!d) return null;
  const righe = await q<any>(`SELECT * FROM documenti_righe WHERE documento_id = $1 ORDER BY posizione`, [id]);
  const azienda = (await q1<any>(`SELECT valore FROM impostazioni WHERE chiave = 'azienda'`))?.valore ?? {};
  const destinatario = d.intestatario && d.numero != null ? d.intestatario
    : Object.fromEntries(Object.entries(d).filter(([k]) => k.startsWith('c_')).map(([k, v]) => [k.slice(2), v]));
  return { d, righe, azienda, destinatario };
}

export async function pdfDelDdt(id: number): Promise<{ nome: string; dati: Buffer } | null> {
  const x = await datiStampaDdt(id);
  if (!x) return null;
  const numero = x.d.numero == null ? null : numeroCompleto(x.d.numero, x.d.sezionale);
  return { nome: nomeFilePdfDdt(numero, x.d.anno ?? Number(String(x.d.data).slice(0, 4)), x.destinatario.ragione_sociale ?? ''),
    dati: await pdfDdt(x.d, x.righe, x.azienda, x.destinatario) };
}

/** Indirizzo, oggetto e testo proposti nella pagina del DDT. */
export async function propostaEmailDdt(id: number) {
  const x = await datiStampaDdt(id);
  if (!x || x.d.numero == null) return null;
  const c = x.d.cliente_id ? await q1<any>(`SELECT c.email_amministrazione, c.pec, c.email_ddt,
      (SELECT z.email FROM crm_aziende z WHERE z.cliente_id = c.id AND z.email IS NOT NULL ORDER BY z.id LIMIT 1) AS crm,
      (SELECT d.email_a FROM documenti d WHERE d.tipo = 'ddt' AND d.cliente_id = c.id AND d.email_a IS NOT NULL AND d.id <> $2
        ORDER BY d.email_inviata_il DESC NULLS LAST LIMIT 1) AS ultimo
    FROM clienti c WHERE c.id = $1`, [x.d.cliente_id, id]).catch(() => null) : null;
  const a = destinatarioDdt({ anagrafica: c?.email_ddt, ultimoDdt: c?.ultimo, amministrazione: indirizzoEmail(c?.email_amministrazione), crm: indirizzoEmail(c?.crm), pec: indirizzoEmail(c?.pec) });
  const azienda = x.azienda.ragione_sociale || 'Casteltech S.r.l.';
  const t = x.d.dati_trasporto ?? {};
  const testo = emailDdt({ numero: `${numeroCompleto(x.d.numero, x.d.sezionale)}`, data: x.d.data, azienda, riferimento: x.d.riferimento_esterno,
    trasportatore: t.trasportatore, colli: t.colli });
  return { a, ...testo, attivo: gmailConfigurato(), mittente: descriviMittente(await mittentePer('ddt')) };
}

/** Manda il DDT con il PDF allegato; restituisce gli indirizzi a cui è partito. */
export async function inviaDdtEmail(id: number, b: { a?: string; cc?: string; oggetto?: string; testo?: string }): Promise<string> {
  const x = await datiStampaDdt(id);
  if (!x) throw new Error('DDT non trovato.');
  if (x.d.numero == null || x.d.stato === 'annullato') throw new Error('Si manda solo un DDT emesso (e non annullato).');
  const a = elencoIndirizzi(b.a), cc = elencoIndirizzi(b.cc);
  if (!a.indirizzi.length) throw new Error('Scrivi a chi mandarlo.');
  if (a.errati.length || cc.errati.length) throw new Error(`Indirizzi non validi: ${[...a.errati, ...cc.errati].join(', ')}.`);
  const oggetto = String(b.oggetto ?? '').trim(), testo = String(b.testo ?? '').trim();
  if (!oggetto || !testo) throw new Error("Servono l'oggetto e il testo dell'email.");
  const pdf = (await pdfDelDdt(id))!;
  const azienda = String(x.azienda.ragione_sociale || 'Casteltech S.r.l.').replace(/"/g, '');
  const inviato = await inviaGmail(messaggioEmail({ da: intestazioneDa(azienda, (await mittentePer('ddt')).indirizzo), a: a.indirizzi, cc: cc.indirizzi, oggetto, testo,
    allegato: { nome: pdf.nome, mime: 'application/pdf', dati: pdf.dati } }));
  await q(`UPDATE documenti SET email_a = $2, email_inviata_il = now(), email_id = $3, inviato_a_mano = false, aggiornato_il = now() WHERE id = $1`,
    [id, [...a.indirizzi, ...cc.indirizzi].join(', '), inviato.id]);
  return a.indirizzi.join(', ');
}
