/**
 * Revisioni dei documenti inviati (Adriano 11/11/2026; regole in engine/revisioni.ts): prima di un invio si chiede il numero della
 * prossima revisione, dopo l'invio si salva il PDF esatto che è partito. I PDF salvati si scaricano dalla scheda del documento.
 */
import { q, q1 } from './db.js';
import { prossimaRevisione } from '../engine/revisioni.js';

/** Documento a cui si riferisce la revisione: un preventivo o una riga di `documenti`. */
export type RifRevisione = { preventivo: number } | { documento: number };

export interface RevisioneInvio { id: number; revisione: number; inviato_il: Date; inviato_a: string | null; nome_file: string | null }

const colonna = (r: RifRevisione) => ('preventivo' in r ? 'preventivo_id' : 'documento_id');
const valore = (r: RifRevisione) => ('preventivo' in r ? r.preventivo : r.documento);

/** Revisioni già inviate (dalla più recente), senza il PDF. */
export async function elencoRevisioni(r: RifRevisione): Promise<RevisioneInvio[]> {
  return q<RevisioneInvio>(`SELECT id, revisione, inviato_il, inviato_a, nome_file FROM revisioni_invio WHERE ${colonna(r)} = $1
    ORDER BY revisione DESC, id DESC`, [valore(r)]).catch(() => []);
}

/** Numero del prossimo invio e data dell'invio precedente (per la frase "annulla e sostituisce l'invio precedente del …"). */
export async function prossimoInvio(r: RifRevisione): Promise<{ revisione: number; precedente: Date | null }> {
  const t = 'preventivo' in r ? 'preventivi' : 'documenti';
  const x = await q1<{ ultima: number | null; quando: Date | null; inviato: Date | null }>(`SELECT
      (SELECT max(revisione) FROM revisioni_invio WHERE ${colonna(r)} = $1) AS ultima,
      (SELECT max(inviato_il) FROM revisioni_invio WHERE ${colonna(r)} = $1) AS quando,
      (SELECT email_inviata_il FROM ${t} WHERE id = $1) AS inviato`, [valore(r)]);
  const precedente = [x?.quando, x?.inviato].filter((d): d is Date => !!d).sort((a, b) => +b - +a)[0] ?? null;
  return { revisione: prossimaRevisione(x?.ultima, !!x?.inviato), precedente };
}

/** Copia del PDF appena partito. */
export async function salvaRevisione(r: RifRevisione, o: { revisione: number; a: string; oggetto: string; nome: string; pdf: Buffer }): Promise<void> {
  await q(`INSERT INTO revisioni_invio (${colonna(r)}, revisione, inviato_a, oggetto, nome_file, pdf) VALUES ($1, $2, $3, $4, $5, $6)`,
    [valore(r), o.revisione, o.a.slice(0, 500), o.oggetto.slice(0, 500), o.nome, o.pdf]);
}

/** PDF di una revisione: `tipo` = 'preventivo' o 'documento' (così una rotta non apre le revisioni dell'altra). */
export async function pdfRevisione(id: number, tipo: 'preventivo' | 'documento'): Promise<{ nome: string; dati: Buffer; rif: number } | null> {
  const x = await q1<{ nome_file: string | null; pdf: Buffer | null; rif: number | null }>(`SELECT nome_file, pdf, ${tipo === 'preventivo' ? 'preventivo_id' : 'documento_id'} AS rif
    FROM revisioni_invio WHERE id = $1`, [id]);
  return x?.pdf && x.rif ? { nome: x.nome_file || `revisione-${id}.pdf`, dati: x.pdf, rif: x.rif } : null;
}
