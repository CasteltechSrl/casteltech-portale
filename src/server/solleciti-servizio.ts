/**
 * Sollecito degli incassi (proposta della revisione, Adriano 1/11/2026): rate scadute delle fatture emesse per cliente,
 * email proposta (testo in engine/solleciti.ts), invio con Gmail quando la delega è attiva; il sollecito mandato dal
 * portale resta nel CRM del cliente come attività "email".
 */
import { q, q1 } from './db.js';
import { caricaAzienda } from './amministrazione-servizio.js';
import { AZIENDA_PREDEFINITA } from './views/stampa-preventivo.js';
import { gmailConfigurato, inviaGmail, mittenteGmail } from './gmail.js';
import { elencoIndirizzi, indirizzoEmail, messaggioEmail } from '../engine/conferme-ordine.js';
import { numeroCompleto } from '../engine/amministrazione.js';
import { euroIt, mailtoSollecito, oggettoSollecito, raggruppaScaduti, testoSollecito, type GruppoSollecito, type RataScaduta } from '../engine/solleciti.js';

export async function rateScadute(oggi: string, clienteId?: number): Promise<RataScaduta[]> {
  const righe = await q<any>(`SELECT s.documento_id, d.numero, d.sezionale, d.data::text AS data_fattura, s.data::text AS scadenza, s.importo::float AS importo,
      d.cliente_id, coalesce(c.ragione_sociale, d.intestatario->>'ragione_sociale', d.intestatario->>'nome', '') AS cliente, c.email_amministrazione, c.pec
    FROM documenti_scadenze s JOIN documenti d ON d.id = s.documento_id LEFT JOIN clienti c ON c.id = d.cliente_id
    WHERE s.pagata_il IS NULL AND d.tipo = 'fattura' AND d.stato NOT IN ('bozza', 'annullato', 'scartato') AND s.data < $1 AND d.cliente_id IS NOT NULL
      AND ($2::int IS NULL OR d.cliente_id = $2) ORDER BY s.data`, [oggi, clienteId ?? null]);
  return righe.map(r => ({
    documentoId: r.documento_id, numero: `${numeroCompleto(r.numero, r.sezionale)}/${r.data_fattura.slice(0, 4)}`, dataFattura: r.data_fattura, scadenza: r.scadenza,
    importo: Number(r.importo), clienteId: r.cliente_id, cliente: r.cliente, email: indirizzoEmail(r.email_amministrazione) || indirizzoEmail(r.pec) || null,
  }));
}

export const gruppiSolleciti = async (oggi: string) => raggruppaScaduti(await rateScadute(oggi), oggi);

export interface PropostaSollecito { gruppo: GruppoSollecito; a: string; oggetto: string; testo: string; attivo: boolean; mittente: string; mailto: string; ultimo: { data: string; descrizione: string } | null }

export async function propostaSollecito(clienteId: number, oggi: string): Promise<PropostaSollecito | null> {
  const g = raggruppaScaduti(await rateScadute(oggi, clienteId), oggi)[0];
  if (!g) return null;
  const a = await caricaAzienda();
  const azienda = a.ragione_sociale || AZIENDA_PREDEFINITA.ragione_sociale;
  const oggetto = oggettoSollecito(g, azienda);
  const testo = testoSollecito(g, { azienda, iban: a.iban, banca: a.banca, oggi, telefono: a.telefono || AZIENDA_PREDEFINITA.telefono });
  const ultimo = await q1<{ data: string; descrizione: string }>(`SELECT t.data::text AS data, t.descrizione FROM crm_attivita t JOIN crm_aziende z ON z.id = t.azienda_id
    WHERE z.cliente_id = $1 AND t.tipo = 'email' AND t.descrizione ILIKE 'Sollecito%' ORDER BY t.data DESC, t.id DESC LIMIT 1`, [clienteId]);
  return { gruppo: g, a: g.email ?? '', oggetto, testo, attivo: gmailConfigurato(), mittente: mittenteGmail(), mailto: mailtoSollecito(g.email, oggetto, testo), ultimo: ultimo ?? null };
}

/** Invia con Gmail e registra l'attività nel CRM (se il cliente è collegato a un'azienda del CRM). */
export async function inviaSollecito(clienteId: number, b: { a?: string; cc?: string; oggetto?: string; testo?: string }, utenteId: number | null, oggi: string): Promise<string> {
  const p = await propostaSollecito(clienteId, oggi);
  if (!p) throw new Error('Il cliente non ha rate scadute.');
  const a = elencoIndirizzi(b.a), cc = elencoIndirizzi(b.cc);
  if (!a.indirizzi.length) throw new Error('Scrivi a chi mandarlo.');
  if (a.errati.length || cc.errati.length) throw new Error(`Indirizzi non validi: ${[...a.errati, ...cc.errati].join(', ')}.`);
  const oggetto = String(b.oggetto ?? '').trim(), testo = String(b.testo ?? '').trim();
  if (!oggetto || !testo) throw new Error("Servono l'oggetto e il testo dell'email.");
  const azienda = (await caricaAzienda()).ragione_sociale || AZIENDA_PREDEFINITA.ragione_sociale;
  await inviaGmail(messaggioEmail({ da: `"${azienda.replace(/"/g, '')}" <${mittenteGmail()}>`, a: a.indirizzi, cc: cc.indirizzi, oggetto, testo }));
  await registraSollecito(clienteId, p.gruppo, a.indirizzi.join(', '), utenteId, oggi);
  return a.indirizzi.join(', ');
}

/** Attività "email" nel CRM: "Sollecito incassi (primo sollecito) a …: fatture …, totale …". */
export async function registraSollecito(clienteId: number, g: GruppoSollecito, a: string, utenteId: number | null, oggi: string): Promise<boolean> {
  const az = await q1<{ id: number }>(`SELECT id FROM crm_aziende WHERE cliente_id = $1 ORDER BY id LIMIT 1`, [clienteId]);
  if (!az) return false;
  const descrizione = `Sollecito incassi (${g.livello === 'ultimo' ? 'ultimo avviso' : g.livello === 'secondo' ? 'secondo sollecito' : 'primo sollecito'}) a ${a}: fatture ${g.rate.map(r => r.numero).join(', ')}, totale ${euroIt(g.totale)}`;
  await q(`INSERT INTO crm_attivita (azienda_id, data, tipo, descrizione, utente_id) VALUES ($1, $2, 'email', $3, $4)`, [az.id, oggi, descrizione, utenteId]);
  return true;
}
