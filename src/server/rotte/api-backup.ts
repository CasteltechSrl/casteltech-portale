/**
 * Copie dei backup prese dal PC dell'ufficio (Adriano 1/11/2026: cartella Google Drive 16_Backup\Portale_Render).
 * Niente sessione: il programma installato sul PC (Impostazioni → Backup → "Installa sul PC") si presenta con la sua chiave
 * (impostazioni 'backup_pc') nell'intestazione x-chiave-portale. Legge solo i file già sul disco di Render: il database
 * si tocca solo per la chiave (una volta, poi resta in memoria) e per segnare l'ultima copia presa.
 *
 *   POST /api/backup/piano      { locali: [nomi dei file nella cartella] } → { scarica: [{ nome, byte }], togli: [nomi] }
 *   GET  /api/backup/file/:nome → il file .json.gz
 */
import { Router, type NextFunction, type Request, type Response } from 'express';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { q, q1 } from '../db.js';
import { chiaveGiusta } from '../../engine/gmail.js';
import { NOME_BACKUP, pianoCopiePc } from '../../engine/backup-pc.js';
import { elencoBackup } from '../backup.js';
import { chiaveDallaRichiesta } from './api-claude.js';

export interface StatoBackupPc { chiave?: string; creata_il?: string; ultima_copia?: string; ultima_copia_il?: string; ultimo_contatto_il?: string }

let statoInMemoria: StatoBackupPc | null | undefined;

export async function leggiStatoBackupPc(): Promise<StatoBackupPc | null> {
  if (statoInMemoria !== undefined) return statoInMemoria;
  const r = await q1<{ valore: StatoBackupPc }>(`SELECT valore FROM impostazioni WHERE chiave = 'backup_pc'`);
  statoInMemoria = r?.valore ?? null;
  return statoInMemoria;
}

async function salvaStato(stato: StatoBackupPc) {
  await q(`INSERT INTO impostazioni (chiave, valore) VALUES ('backup_pc', $1)
    ON CONFLICT (chiave) DO UPDATE SET valore = $1, aggiornato_il = now()`, [JSON.stringify(stato)]);
  statoInMemoria = stato;
}

/** Chiave nuova (quella vecchia smette di funzionare: il PC va reinstallato con il file nuovo). */
export async function nuovaChiaveBackupPc(): Promise<string> {
  const chiave = randomBytes(24).toString('base64url');
  await salvaStato({ chiave, creata_il: new Date().toISOString() });
  return chiave;
}

export function rotteApiBackup() {
  const r = Router();

  r.use(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const stato = await leggiStatoBackupPc();
      if (!chiaveGiusta(chiaveDallaRichiesta(req), stato?.chiave))
        return res.status(401).json({ errore: stato?.chiave ? 'Chiave non valida: reinstalla dal portale (Impostazioni → Backup).' : 'Copia sul PC non ancora installata: Impostazioni → Backup.' });
      next();
    } catch (e) { next(e); }
  });

  r.post('/piano', async (req, res) => {
    const locali = ([] as unknown[]).concat(req.body?.locali ?? []).filter((n): n is string => typeof n === 'string');
    const copie = elencoBackup().map(c => ({ nome: c.nome, byte: c.byte }));
    const piano = pianoCopiePc(copie, locali);
    // ultimo contatto: si scrive al massimo una volta all'ora (Neon)
    const stato = (await leggiStatoBackupPc())!;
    if (!stato.ultimo_contatto_il || Date.now() - Date.parse(stato.ultimo_contatto_il) > 3600_000)
      await salvaStato({ ...stato, ultimo_contatto_il: new Date().toISOString() });
    res.json(piano);
  });

  r.get('/file/:nome', (req, res) => {
    const nome = String(req.params.nome);
    const cartella = process.env.BACKUP_DIR;
    if (!cartella || !NOME_BACKUP.test(nome) || !elencoBackup().some(c => c.nome === nome)) return res.status(404).json({ errore: 'Copia non trovata.' });
    res.download(join(cartella, nome), nome, async err => {
      if (err) { console.error('backup sul PC: invio non riuscito', err); return; }
      try {
        const stato = (await leggiStatoBackupPc())!;
        await salvaStato({ ...stato, ultima_copia: nome, ultima_copia_il: new Date().toISOString() });
      } catch (e) { console.error('backup sul PC: stato non salvato', e); }
    });
  });

  return r;
}
