/**
 * Registro delle attività (regole in engine/registro.ts): scrive una riga dopo ogni salvataggio riuscito
 * e per accessi / accessi non riusciti. La scrittura non blocca mai la pagina: un errore si scrive solo nel log.
 */
import type { NextFunction, Request, Response } from 'express';
import { q } from './db.js';
import { chiaveRipetizione, daSaltare, voceRegistro, type TipoRegistro, type VoceRegistro } from '../engine/registro.js';

const ultimeVolte = new Map<string, number>();

async function scrivi(v: Partial<VoceRegistro> & { tipo: TipoRegistro }, utenteId: number | null, nome: string | null, indirizzo?: string | null) {
  try {
    await q(`INSERT INTO registro_attivita (utente_id, utente_nome, tipo, sezione, azione, percorso, oggetto, link, indirizzo)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [utenteId, nome, v.tipo, v.sezione ?? null, v.azione ?? null, v.percorso ?? null, v.oggetto ?? null, v.link ?? null, indirizzo ?? null]);
  } catch (e) { console.error('Registro attività non scritto:', e); }
}

/** Middleware: dopo la risposta, se la richiesta ha modificato dati ed è andata bene, una riga nel registro. */
export function registraAttivita(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  res.on('finish', () => {
    const u = req.session?.utente;
    if (!u) return;
    const v = voceRegistro({ metodo: req.method, percorso: req.originalUrl, corpo: req.body, stato: res.statusCode });
    if (!v) return;
    const chiave = chiaveRipetizione(u.id, v);
    const adesso = Date.now();
    if (daSaltare(req.get('x-autosalva') === '1', ultimeVolte.get(chiave), adesso)) return;
    ultimeVolte.set(chiave, adesso);
    if (ultimeVolte.size > 2000) ultimeVolte.clear();
    void scrivi(v, u.id, u.nome, null);
  });
  next();
}

export function registraAccesso(ok: boolean, utente: { id: number; nome: string } | null, email: string, indirizzo: string | undefined) {
  void scrivi({ tipo: ok ? 'accesso' : 'accesso_fallito', sezione: 'Accesso', azione: ok ? 'entrato' : 'email o password sbagliate' },
    utente?.id ?? null, utente?.nome ?? email.slice(0, 120), indirizzo ?? null);
}

/** Chiude subito tutte le sessioni aperte di un utente (tranne, se indicata, quella di chi sta lavorando). */
export async function chiudiSessioniUtente(utenteId: number, tranneSid?: string): Promise<number> {
  const righe = await q(`DELETE FROM sessioni WHERE (sess::jsonb -> 'utente' ->> 'id')::int = $1 AND sid <> coalesce($2, '') RETURNING sid`, [utenteId, tranneSid ?? null]);
  return righe.length;
}
