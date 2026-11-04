/**
 * Stampa e invio del preventivo per email (Adriano 4/11/2026): la pagina di stampa e il PDF allegato usano gli stessi dati
 * (`datiStampaPreventivo`), l'email parte da preventivi@ (alias di info@, se attivo in Gmail; altrimenti da info@) con Gmail.
 * Resta scritto a chi e quando (preventivi.email_a / email_inviata_il); un preventivo in bozza diventa "inviato".
 */
import { q, q1 } from './db.js';
import { gmailConfigurato, inviaGmail, mittentePer } from './gmail.js';
import { descriviMittente, intestazioneDa } from '../engine/mittenti-email.js';
import { elencoIndirizzi, indirizzoEmail, messaggioEmail } from '../engine/conferme-ordine.js';
import { destinatarioPreventivo, emailPreventivo } from '../engine/preventivo-email.js';
import { calcola, datiDaRiga, leggiPreventivo, nPannelli } from './preventivi-servizio.js';
import { caricaAzienda } from './amministrazione-servizio.js';
import type { Catalogo } from './catalogo-db.js';
import { contenutoStampa, leggiRitocchi, versioneStampa } from '../engine/stampa-preventivo.js';
import { AZIENDA_PREDEFINITA, type ClienteStampa, type OpzioniStampa } from './views/stampa-preventivo.js';
import { nomeFilePdfPreventivo, pdfPreventivo } from './pdf-preventivo.js';

/** Opzioni della stampa dall'indirizzo (?vista=…&condizioni=0&firma=0) o dal modulo dell'email. */
export const opzioniStampa = (x: Record<string, unknown>): OpzioniStampa =>
  ({ versione: versioneStampa(x.vista), condizioni: x.condizioni !== '0', firma: x.firma !== '0' });

/** Tutto quello che serve alla stampa (pagina e PDF): preventivo, calcolo, azienda, cliente, ritocchi. */
export async function datiStampaPreventivo(id: number, opz: OpzioniStampa) {
  const p = await leggiPreventivo(id);
  if (!p) return null;
  const cat: Catalogo = p.catalogo;
  const dati = datiDaRiga(p);
  const v = (cod: string) => dati.parametri[cod] ?? cat.parametri.find(x => x.codice === cod)?.default;
  const doppia = !!v('doppiaFaccia');
  const cliente = p.cliente_id ? await q1<ClienteStampa>(
    `SELECT c.ragione_sociale, c.partita_iva, c.codice_fiscale, c.indirizzo, c.cap, c.comune, c.provincia, c.nazione, c.codice_sdi, c.pec,
            cp.descrizione AS pagamento
       FROM clienti c LEFT JOIN condizioni_pagamento cp ON cp.codice = c.condizione_pagamento WHERE c.id = $1`, [p.cliente_id]) : undefined;
  return {
    p, d: dati, ris: calcola(cat, dati), doppia,
    nLamine: Number(v('nLamine')) > 0 ? Number(v('nLamine')) : (doppia ? 2 : 1),
    nPannelli: nPannelli(dati.nSchede, dati.nSchedeInPCB),
    azienda: await caricaAzienda(), cliente: cliente ?? null, opz, rit: leggiRitocchi(p.stampa),
  };
}

const dataGiorno = (d: unknown) => (d instanceof Date ? d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' }) : String(d ?? '').slice(0, 10));

/** PDF del preventivo, uguale alla stampa con le stesse scelte (versione, condizioni, firma, ritocchi). */
export async function pdfDelPreventivo(id: number, opz: OpzioniStampa): Promise<{ nome: string; dati: Buffer } | null> {
  const x = await datiStampaPreventivo(id, opz);
  if (!x) return null;
  const i = x.p.intestazione ?? {};
  const a = x.azienda, P = AZIENDA_PREDEFINITA;
  const cont = contenutoStampa({ ris: x.ris, nSchede: x.d.nSchede, doppia: x.doppia, nLamine: x.nLamine, versione: opz.versione, rit: x.rit, descrizione: i.descrizione ?? '' });
  const note = [x.rit.noteCliente, x.rit.noteInterne ? x.d.note ?? '' : ''].map(s => s.trim()).filter(Boolean).join('\n\n');
  const dati = await pdfPreventivo({
    numero: x.p.numero, data: dataGiorno(x.p.creato_il),
    azienda: {
      nome: a.ragione_sociale || P.ragione_sociale,
      indirizzo: `${a.indirizzo || P.indirizzo} · ${a.cap || P.cap} ${a.comune || P.comune} (${a.provincia || P.provincia})`,
      piva: a.partita_iva || P.partita_iva, rea: a.rea_ufficio && a.rea_numero ? `${a.rea_ufficio}-${a.rea_numero}` : P.rea,
      tel: a.telefono || P.telefono, email: a.email || P.email, pec: a.pec || P.pec, iban: a.iban || undefined, banca: a.banca || undefined,
    },
    cliente: x.cliente ?? { ragione_sociale: i.cliente ?? '' },
    codice: i.codice ?? '', revisione: i.revisione, nSchede: x.d.nSchede,
    righe: cont.righe, riquadro: cont.riquadro, scontato: cont.scontato, primoLotto: cont.primoLotto, totale: cont.totale,
    note, pagamento: x.cliente?.pagamento, condizioni: opz.condizioni, firma: opz.firma,
  });
  return { nome: nomeFilePdfPreventivo(x.p.numero, i.codice ?? ''), dati };
}

/** Email della richiesta del cliente (pulsante in Gmail) collegata al preventivo, anche dal pacchetto padre delle versioni. */
async function richiestaDelPreventivo(id: number): Promise<{ mittente: string; oggetto: string } | null> {
  const r = await q1<{ email: any }>(`SELECT coalesce(s.email, pa.email) AS email FROM pacchetti_scheda s LEFT JOIN pacchetti_scheda pa ON pa.id = s.padre_id
    WHERE s.preventivo_id = $1 AND coalesce(s.email, pa.email) IS NOT NULL ORDER BY s.id DESC LIMIT 1`, [id]).catch(() => null);
  return r?.email ? { mittente: String(r.email.mittente ?? ''), oggetto: String(r.email.oggetto ?? '') } : null;
}

/** Indirizzo, oggetto e testo proposti nella pagina di stampa. */
export async function propostaEmailPreventivo(id: number) {
  const p = await leggiPreventivo(id);
  if (!p) return null;
  const richiesta = await richiestaDelPreventivo(id);
  const c = p.cliente_id ? await q1<any>(`SELECT c.email_amministrazione,
      (SELECT coalesce(k.email, z.email) FROM crm_aziende z LEFT JOIN crm_contatti k ON k.azienda_id = z.id AND k.email IS NOT NULL
        WHERE z.cliente_id = c.id AND coalesce(k.email, z.email) IS NOT NULL ORDER BY k.id NULLS LAST, z.id LIMIT 1) AS crm,
      (SELECT x.email_a FROM preventivi x WHERE x.cliente_id = c.id AND x.email_a IS NOT NULL AND NOT x.inviato_a_mano AND x.id <> $2
        ORDER BY x.email_inviata_il DESC NULLS LAST LIMIT 1) AS ultimo
    FROM clienti c WHERE c.id = $1`, [p.cliente_id, id]).catch(() => null) : null;
  const a = destinatarioPreventivo({ richiesta: indirizzoEmail(richiesta?.mittente), ultimoPreventivo: c?.ultimo,
    crm: indirizzoEmail(c?.crm), amministrazione: indirizzoEmail(c?.email_amministrazione) });
  const azienda = (await caricaAzienda()).ragione_sociale || 'Casteltech S.r.l.';
  const i = p.intestazione ?? {};
  const testo = emailPreventivo({ numero: p.numero, data: p.creato_il, codice: i.codice, descrizione: i.descrizione, revisione: i.revisione,
    nSchede: Number(p.n_schede) || 0, azienda, oggettoRichiesta: richiesta?.oggetto });
  return { a, ...testo, richiesta, attivo: gmailConfigurato(), mittente: descriviMittente(await mittentePer('preventivo')),
    stato: String(p.stato), email_a: p.email_a as string | null, email_inviata_il: p.email_inviata_il as Date | null };
}

/** Manda il preventivo con il PDF allegato; restituisce gli indirizzi a cui è partito. */
export async function inviaPreventivoEmail(id: number, b: { a?: string; cc?: string; oggetto?: string; testo?: string }, opz: OpzioniStampa): Promise<string> {
  const p = await leggiPreventivo(id);
  if (!p) throw new Error('Preventivo non trovato.');
  if (p.stato === 'da_validare') throw new Error('Il preventivo è ancora "da validare": controllalo e salvalo prima di mandarlo al cliente.');
  const a = elencoIndirizzi(b.a), cc = elencoIndirizzi(b.cc);
  if (!a.indirizzi.length) throw new Error('Scrivi a chi mandarlo.');
  if (a.errati.length || cc.errati.length) throw new Error(`Indirizzi non validi: ${[...a.errati, ...cc.errati].join(', ')}.`);
  const oggetto = String(b.oggetto ?? '').trim(), testo = String(b.testo ?? '').trim();
  if (!oggetto || !testo) throw new Error("Servono l'oggetto e il testo dell'email.");
  const pdf = (await pdfDelPreventivo(id, opz))!;
  const azienda = String((await caricaAzienda()).ragione_sociale || 'Casteltech S.r.l.').replace(/"/g, '');
  const inviato = await inviaGmail(messaggioEmail({ da: intestazioneDa(azienda, (await mittentePer('preventivo')).indirizzo), a: a.indirizzi, cc: cc.indirizzi,
    oggetto, testo, allegato: { nome: pdf.nome, mime: 'application/pdf', dati: pdf.dati } }));
  // niente aggiornato_il: la stampa si ricarica da sola quando cambia, e l'invio non cambia il preventivo
  await q(`UPDATE preventivi SET email_a = $2, email_inviata_il = now(), email_id = $3, inviato_a_mano = false,
      stato = CASE WHEN stato = 'bozza' THEN 'inviato' ELSE stato END WHERE id = $1`,
    [id, [...a.indirizzi, ...cc.indirizzi].join(', '), inviato.id]);
  return a.indirizzi.join(', ');
}

/** "Segna come inviato" (mandato da fuori del portale) o "Togli il segno" messo a mano. */
export async function segnaPreventivoInviato(id: number, a: string, togli: boolean): Promise<void> {
  if (togli) {
    await q(`UPDATE preventivi SET email_a = NULL, email_inviata_il = NULL, inviato_a_mano = false WHERE id = $1 AND inviato_a_mano`, [id]);
    return;
  }
  await q(`UPDATE preventivi SET email_a = $2, email_inviata_il = now(), inviato_a_mano = true,
      stato = CASE WHEN stato = 'bozza' THEN 'inviato' ELSE stato END WHERE id = $1 AND email_inviata_il IS NULL`, [id, a.trim().slice(0, 200) || null]);
}
