/**
 * Lavori pesanti in memoria uno alla volta (29/10/2026: Render ha riavviato il portale per memoria esaurita, il piano ha 512 MB).
 * Caricamento dei documenti del cliente e analisi del pacchetto tengono in memoria file grandi (zip fino a 60 MB, aperti e compressi):
 * con 4 file mandati insieme dal browser, o due analisi nello stesso momento, si superava il limite.
 * Ogni lavoro prenota una parte di BUDGET (in byte); se non c'è posto aspetta che un altro finisca. Un lavoro solo passa sempre,
 * anche se da solo supera il budget. Nessun accesso al database.
 */
import type { NextFunction, Request, Response } from 'express';

/** Memoria che i lavori pesanti possono usare insieme (il resto serve al portale: pagine, sessioni, codice). */
export const BUDGET = 160 * 1024 * 1024;

let inUso = 0;
let attese: (() => void)[] = [];

/** Prenota `byte` di memoria (al massimo tutto il budget); ritorna la funzione che la libera (chiamarla più volte non fa danni). */
export async function prenota(byte: number): Promise<() => void> {
  const b = Math.max(1, Math.min(BUDGET, Math.round(byte)));
  while (inUso > 0 && inUso + b > BUDGET) await new Promise<void>(r => attese.push(r));
  inUso += b;
  let liberata = false;
  return () => {
    if (liberata) return;
    liberata = true;
    inUso -= b;
    const da = attese; attese = [];
    for (const r of da) r();
  };
}

/** Esegue `lavoro` dopo aver prenotato `byte`, e libera alla fine (anche in caso di errore). */
export async function conMemoria<T>(byte: number, lavoro: () => Promise<T>): Promise<T> {
  const libera = await prenota(byte);
  try { return await lavoro(); } finally { libera(); }
}

/** Memoria prenotata adesso (per i test). */
export const memoriaInUso = () => inUso;

/**
 * Da mettere PRIMA di express.raw: il file non si legge finché non c'è posto. Un file caricato occupa circa 3 volte
 * la sua dimensione (il file, la copia compressa, il lavoro di compressione).
 */
export const caricamentoLimitato = (req: Request, res: Response, next: NextFunction) => {
  const byte = Number(req.headers['content-length']) || 1024 * 1024;
  prenota(byte * 3).then(libera => {
    res.on('finish', libera);
    res.on('close', libera);
    next();
  }, next);
};
