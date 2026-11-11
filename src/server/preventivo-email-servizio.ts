/**
 * Stampa e invio del preventivo per email (Adriano 4/11/2026): la pagina di stampa e il PDF allegato usano gli stessi dati
 * (`datiStampaPreventivo`), l'email parte da preventivi@ (alias di info@, se attivo in Gmail; altrimenti da info@) con Gmail.
 * Resta scritto a chi e quando (preventivi.email_a / email_inviata_il); un preventivo in bozza diventa "inviato".
 */
import { type AlternativaDaConfermare, type ComponenteDaVerificare } from '../engine/alternative-cliente.js';
import { q, q1 } from './db.js';
import { emailConRevisione, nomeFileRevisione } from '../engine/revisioni.js';
import { prossimoInvio, salvaRevisione } from './revisioni-servizio.js';
import { gmailConfigurato, inviaGmail, mittenteGmail, mittentePer } from './gmail.js';
import { descriviMittente, intestazioneDa } from '../engine/mittenti-email.js';
import { elencoIndirizzi, indirizzoEmail, messaggioEmail } from '../engine/conferme-ordine.js';
import { destinatarioPreventivo, emailPreventivo } from '../engine/preventivo-email.js';
import { calcola, datiDaRiga, leggiPreventivo, nPannelli } from './preventivi-servizio.js';
import { caricaAzienda } from './amministrazione-servizio.js';
import type { Catalogo } from './catalogo-db.js';
import { consegnaCompleta, contenutoStampa, leggiRitocchi, materialeVenduto, testoConsegna, validitaOfferta, versioneStampa } from '../engine/stampa-preventivo.js';
import { AZIENDA_PREDEFINITA, type ClienteStampa, type OpzioniStampa } from './views/stampa-preventivo.js';
import { nomeFilePdfPreventivo, pdfPreventivo } from './pdf-preventivo.js';
import { costoBomPerPreventivo } from './codifica-servizio.js';
import { noteDaStampare, righeNonQuotateNelleNote } from '../engine/non-quotati.js';

/** Opzioni della stampa dall'indirizzo (?vista=…&condizioni=0&firma=0&ut=0) o dal modulo dell'email. */
export const opzioniStampa = (x: Record<string, unknown>): OpzioniStampa =>
  ({ versione: versioneStampa(x.vista), condizioni: x.condizioni !== '0', firma: x.firma !== '0', ut: x.ut !== '0', allegato: x.allegato !== '0' });

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
  // componenti non disponibili (Adriano 4/11/2026): dalla BOM collegata se i componenti li compriamo noi (prezzo a mano nella BOM = tolti),
  // altrimenti quelli già scritti nelle note del preventivo
  // componenti in conto lavoro (spunta Componenti tolta): niente righe "non quotato" (controllo del 4/11/2026)
  // codici alternativi alla BOM da far confermare al cliente (Adriano 5/11/2026): solo se i componenti li compriamo noi
  let alternative: AlternativaDaConfermare[] = [];
  let problemiAcquisto: ComponenteDaVerificare[] = [];
  let nonQuotati = v('acquistoComponenti') ? righeNonQuotateNelleNote(dati.note ?? '') : [];
  if (dati.bomId && v('acquistoComponenti')) {
    const b = await costoBomPerPreventivo(dati.bomId, dati.nSchede).catch(() => null);
    if (b && b.stato === 'pronta') { nonQuotati = b.nonQuotati; alternative = b.alternative ?? []; problemiAcquisto = b.problemiAcquisto ?? []; }
  }
  return {
    p, d: dati, ris: calcola(cat, dati), doppia, nonQuotati, alternative, problemiAcquisto,
    nLamine: Number(v('nLamine')) > 0 ? Number(v('nLamine')) : (doppia ? 2 : 1),
    nPannelli: nPannelli(dati.nSchede, dati.nSchedeInPCB),
    azienda: await caricaAzienda(), cliente: cliente ?? null, opz, rit: leggiRitocchi(p.stampa),
    /** materiale comprato da noi (spunta "Componenti"): proposta per i tempi di consegna finché non si sceglie nella stampa */
    acquisto: !!v('acquistoComponenti'),
  };
}

const dataGiorno = (d: unknown) => (d instanceof Date ? d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' }) : String(d ?? '').slice(0, 10));

/** PDF del preventivo, uguale alla stampa con le stesse scelte (versione, condizioni, firma, ritocchi). */
export async function pdfDelPreventivo(id: number, opz: OpzioniStampa, revisione = 0): Promise<{ nome: string; dati: Buffer } | null> {
  const x = await datiStampaPreventivo(id, opz);
  if (!x) return null;
  const i = x.p.intestazione ?? {};
  const a = x.azienda, P = AZIENDA_PREDEFINITA;
  const cont = contenutoStampa({ ris: x.ris, nSchede: x.d.nSchede, doppia: x.doppia, nLamine: x.nLamine, versione: opz.versione, rit: x.rit, descrizione: i.descrizione ?? '', dettaglioUnaTantum: opz.ut });
  const note = noteDaStampare(x.rit.noteCliente, x.rit.noteInterne, x.d.note ?? '', x.nonQuotati);
  const dati = await pdfPreventivo({
    numero: x.p.numero, data: dataGiorno(x.p.creato_il), revisioneInvio: revisione,
    azienda: {
      nome: a.ragione_sociale || P.ragione_sociale,
      indirizzo: `${a.indirizzo || P.indirizzo} · ${a.cap || P.cap} ${a.comune || P.comune} (${a.provincia || P.provincia})`,
      piva: a.partita_iva || P.partita_iva, rea: a.rea_ufficio && a.rea_numero ? `${a.rea_ufficio}-${a.rea_numero}` : P.rea,
      tel: a.telefono || P.telefono, email: a.email || P.email, pec: a.pec || P.pec, iban: a.iban || undefined, banca: a.banca || undefined,
    },
    cliente: x.cliente ?? { ragione_sociale: i.cliente ?? '' },
    codice: i.codice ?? '', revisione: i.revisione, nSchede: x.d.nSchede,
    righe: cont.righe, riquadro: cont.riquadro, scontato: cont.scontato, primoLotto: cont.primoLotto, totale: cont.totale,
    note, pagamento: x.cliente?.pagamento, alternative: opz.allegato === false ? [] : x.alternative, problemiAcquisto: opz.allegato === false ? [] : x.problemiAcquisto,
    validita: validitaOfferta(x.p.creato_il, materialeVenduto(x.ris)), consegna: testoConsegna(x.rit.consegna, x.acquisto), condizioni: opz.condizioni, firma: opz.firma,
  });
  return { nome: nomeFileRevisione(nomeFilePdfPreventivo(x.p.numero, i.codice ?? ''), revisione), dati };
}

/** Email della richiesta del cliente (pulsante in Gmail) collegata al preventivo, anche dal pacchetto padre delle versioni. */
async function richiestaDelPreventivo(id: number): Promise<{ mittente: string; oggetto: string } | null> {
  const r = await q1<{ email: any }>(`SELECT coalesce(s.email, pa.email) AS email FROM pacchetti_scheda s LEFT JOIN pacchetti_scheda pa ON pa.id = s.padre_id
    WHERE s.preventivo_id = $1 AND coalesce(s.email, pa.email) IS NOT NULL ORDER BY s.id DESC LIMIT 1`, [id]).catch(() => null);
  return r?.email ? { mittente: String(r.email.mittente ?? ''), oggetto: String(r.email.oggetto ?? '') } : null;
}

/** Domini delle nostre caselle (info@, alias, email dell'azienda): mai proposti come destinatario. */
async function dominiNostri(): Promise<string[]> {
  const az = await caricaAzienda().catch(() => null as any);
  return [...new Set(['casteltech.net', mittenteGmail(), String(az?.email ?? '')].map(x => x.trim().toLowerCase().replace(/^.*@/, '')).filter(Boolean))];
}

/** Indirizzo, oggetto e testo proposti nella pagina di stampa. */
export async function propostaEmailPreventivo(id: number) {
  const p = await leggiPreventivo(id);
  if (!p) return null;
  const richiesta = await richiestaDelPreventivo(id);
  const c = p.cliente_id ? await q1<any>(`SELECT c.email_amministrazione, c.email_preventivi,
      (SELECT coalesce(k.email, z.email) FROM crm_aziende z LEFT JOIN crm_contatti k ON k.azienda_id = z.id AND k.email IS NOT NULL
        WHERE z.cliente_id = c.id AND coalesce(k.email, z.email) IS NOT NULL ORDER BY k.id NULLS LAST, z.id LIMIT 1) AS crm,
      (SELECT x.email_a FROM preventivi x WHERE x.cliente_id = c.id AND x.email_a IS NOT NULL AND NOT x.inviato_a_mano AND x.id <> $2
        ORDER BY x.email_inviata_il DESC NULLS LAST LIMIT 1) AS ultimo
    FROM clienti c WHERE c.id = $1`, [p.cliente_id, id]).catch(() => null) : null;
  const a = destinatarioPreventivo({ richiesta: indirizzoEmail(richiesta?.mittente), anagrafica: c?.email_preventivi, ultimoPreventivo: c?.ultimo,
    crm: indirizzoEmail(c?.crm), amministrazione: indirizzoEmail(c?.email_amministrazione) }, await dominiNostri());
  const azienda = (await caricaAzienda()).ragione_sociale || 'Casteltech S.r.l.';
  const i = p.intestazione ?? {};
  const prossimo = await prossimoInvio({ preventivo: id });
  const testo = emailConRevisione(emailPreventivo({ numero: p.numero, data: p.creato_il, codice: i.codice, descrizione: i.descrizione, revisione: i.revisione,
    nSchede: Number(p.n_schede) || 0, azienda, oggettoRichiesta: richiesta?.oggetto }), prossimo.revisione, prossimo.precedente);
  return { a, ...testo, revisione: prossimo.revisione, richiesta, attivo: gmailConfigurato(), mittente: descriviMittente(await mittentePer('preventivo')),
    stato: String(p.stato), email_a: p.email_a as string | null, email_inviata_il: p.email_inviata_il as Date | null };
}

/** Manda il preventivo con il PDF allegato; restituisce gli indirizzi a cui è partito. */
export async function inviaPreventivoEmail(id: number, b: { a?: string; cc?: string; oggetto?: string; testo?: string }, opz: OpzioniStampa): Promise<string> {
  const p = await leggiPreventivo(id);
  if (!p) throw new Error('Preventivo non trovato.');
  if (p.stato === 'da_validare') throw new Error('Il preventivo è ancora "da validare": controllalo e salvalo prima di mandarlo al cliente.');
  // tempi di consegna obbligatori prima dell'invio (Adriano 4/11/2026)
  const st = await datiStampaPreventivo(id, opz);
  if (st && !consegnaCompleta(st.rit.consegna, st.acquisto))
    throw new Error('Scegli prima i tempi di consegna (a sinistra, "Tempi di consegna"), premi "Aggiorna la stampa" e poi manda il preventivo.');
  const a = elencoIndirizzi(b.a), cc = elencoIndirizzi(b.cc);
  if (!a.indirizzi.length) throw new Error('Scrivi a chi mandarlo.');
  if (a.errati.length || cc.errati.length) throw new Error(`Indirizzi non validi: ${[...a.errati, ...cc.errati].join(', ')}.`);
  if (!String(b.oggetto ?? '').trim() || !String(b.testo ?? '').trim()) throw new Error("Servono l'oggetto e il testo dell'email.");
  // revisione (Adriano 11/11/2026): dal secondo invio "Rev. N" nel PDF e nell'oggetto, "annulla e sostituisce" nel testo
  const prossimo = await prossimoInvio({ preventivo: id });
  const { oggetto, testo } = emailConRevisione({ oggetto: String(b.oggetto).trim(), testo: String(b.testo).trim() }, prossimo.revisione, prossimo.precedente);
  const pdf = (await pdfDelPreventivo(id, opz, prossimo.revisione))!;
  const azienda = String((await caricaAzienda()).ragione_sociale || 'Casteltech S.r.l.').replace(/"/g, '');
  const inviato = await inviaGmail(messaggioEmail({ da: intestazioneDa(azienda, (await mittentePer('preventivo')).indirizzo), a: a.indirizzi, cc: cc.indirizzi,
    oggetto, testo, allegato: { nome: pdf.nome, mime: 'application/pdf', dati: pdf.dati } }));
  // niente aggiornato_il: la stampa si ricarica da sola quando cambia, e l'invio non cambia il preventivo
  await q(`UPDATE preventivi SET email_a = $2, email_inviata_il = now(), email_id = $3, inviato_a_mano = false,
      stato = CASE WHEN stato = 'bozza' THEN 'inviato' ELSE stato END WHERE id = $1`,
    [id, [...a.indirizzi, ...cc.indirizzi].join(', '), inviato.id]);
  await salvaRevisione({ preventivo: id }, { revisione: prossimo.revisione, a: [...a.indirizzi, ...cc.indirizzi].join(', '), oggetto, nome: pdf.nome, pdf: pdf.dati });
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
