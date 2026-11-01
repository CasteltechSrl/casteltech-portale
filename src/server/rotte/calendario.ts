/**
 * Calendario dei ritardi per Google Calendar (suggerimento di Federico, fatto l'1/11/2026; conti in engine/calendario-ritardi.ts).
 * Indirizzo: /calendario/<chiave>/ritardi.ics, senza sessione (Google non sa entrare nel portale): la chiave lunga e casuale
 * sta nell'indirizzo, si crea e si cambia da Impostazioni → Promemoria (impostazioni 'calendario_ritardi').
 * Neon gratuito: copia in memoria, ricalcolata solo in orario di lavoro e al massimo una volta all'ora (daRicalcolare).
 */
import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { q, q1 } from '../db.js';
import { chiaveGiusta } from '../../engine/gmail.js';
import { calendarioIcs, daRicalcolare, eventiRitardi, type CommessaAperta } from '../../engine/calendario-ritardi.js';
import { caricoGiornaliero } from '../../engine/ordini.js';
import { pianificaProduzione } from '../ordini-servizio.js';
import { indirizzoPortale } from '../promemoria.js';

let chiaveInMemoria: string | null | undefined;
let copia: { testo: string; quando: Date } | null = null;

export async function leggiChiaveCalendario(): Promise<string | null> {
  if (chiaveInMemoria !== undefined) return chiaveInMemoria;
  const r = await q1<{ valore: { chiave?: string } }>(`SELECT valore FROM impostazioni WHERE chiave = 'calendario_ritardi'`);
  chiaveInMemoria = r?.valore?.chiave ?? null;
  return chiaveInMemoria;
}

export async function nuovaChiaveCalendario(): Promise<string> {
  const chiave = randomBytes(24).toString('base64url');
  await q(`INSERT INTO impostazioni (chiave, valore) VALUES ('calendario_ritardi', $1)
    ON CONFLICT (chiave) DO UPDATE SET valore = $1, aggiornato_il = now()`, [JSON.stringify({ chiave })]);
  chiaveInMemoria = chiave;
  return chiave;
}

export const indirizzoCalendario = (chiave: string) => `${indirizzoPortale()}/calendario/${chiave}/ritardi.ics`;

/** Commesse aperte o in produzione con ore previste (uomo, dal preventivo) e ore già lavorate. */
async function commesseAperte(): Promise<CommessaAperta[]> {
  const righe = await q(`
    SELECT c.id, c.numero, coalesce(cl.ragione_sociale, '') AS cliente, p.codice, c.stato, to_char(c.data_consegna, 'YYYY-MM-DD') AS consegna,
      coalesce((SELECT sum(f.uomo_previsto_sec) FROM commesse_fasi f WHERE f.commessa_id = c.id), 0) AS previsto,
      coalesce((SELECT sum(coalesce(r.durata_min, extract(epoch FROM (r.ora_fine - r.ora_inizio)) / 60) * r.persone * 60)
        FROM rilevazioni r WHERE r.commessa_id = c.id), 0) AS fatto
    FROM commesse c
      LEFT JOIN clienti cl ON cl.id = c.cliente_id
      LEFT JOIN prodotti_revisioni pr ON pr.id = c.revisione_id
      LEFT JOIN prodotti p ON p.id = pr.prodotto_id
    WHERE c.stato IN ('aperta', 'in_produzione')`);
  return righe.map(r => ({ id: r.id, numero: String(r.numero ?? r.id), cliente: r.cliente, codice: r.codice ?? null, stato: r.stato,
    consegna: r.consegna ?? null, uomoPrevistoSec: Number(r.previsto) || 0, uomoFattoSec: Math.max(0, Number(r.fatto) || 0) }));
}

export async function calcolaEventiRitardi(oggi: string) {
  const [pian, commesse] = await Promise.all([pianificaProduzione(oggi), commesseAperte()]);
  return eventiRitardi({ oggi, barre: pian.barre, carico: caricoGiornaliero(pian.barre), oreGiorno: pian.oreGiorno, commesse });
}

export function rotteCalendario() {
  const r = Router();
  r.get('/:chiave/ritardi.ics', async (req, res, next) => {
    try {
      const attesa = await leggiChiaveCalendario();
      if (!chiaveGiusta(req.params.chiave, attesa ?? undefined)) return res.status(404).send('Calendario non trovato');
      const adesso = new Date();
      if (daRicalcolare(copia?.quando ?? null, adesso)) {
        const oggi = adesso.toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
        copia = { testo: calendarioIcs(await calcolaEventiRitardi(oggi), { adesso, indirizzo: indirizzoPortale() }), quando: adesso };
      }
      res.type('text/calendar; charset=utf-8').set('Cache-Control', 'no-cache').send(copia!.testo);
    } catch (e) { next(e); }
  });
  return r;
}

/** Dopo il cambio di chiave la copia vecchia non serve più. */
export const dimenticaCopiaCalendario = () => { copia = null; };
