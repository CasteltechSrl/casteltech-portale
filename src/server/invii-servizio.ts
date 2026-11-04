/**
 * Segno "Inviato" messo a mano dall'ufficio (Adriano 4/11/2026; regole in engine/invii.ts): per un documento mandato
 * da fuori del portale (posta, PEC, consegnato a mano) resta scritto quando e, se indicato, a chi. Un invio vero
 * dal portale (DDT, conferma, ordine a fornitore) lo sostituisce. Il segno a mano si può togliere; quello di un'email partita no.
 */
import { q } from './db.js';

export async function segnaDocumentoInviato(id: number, a: string, togli: boolean): Promise<void> {
  if (togli) {
    await q(`UPDATE documenti SET email_a = NULL, email_inviata_il = NULL, inviato_a_mano = false, aggiornato_il = now(),
      stato = CASE WHEN tipo IN ('conferma_ordine', 'ordine_fornitore') AND stato = 'inviato' THEN 'emesso' ELSE stato END WHERE id = $1 AND inviato_a_mano`, [id]);
    return;
  }
  // conferme e ordini a fornitore emessi passano a "inviato" come con l'email
  await q(`UPDATE documenti SET email_a = $2, email_inviata_il = now(), inviato_a_mano = true, aggiornato_il = now(),
      stato = CASE WHEN tipo IN ('conferma_ordine', 'ordine_fornitore') AND stato = 'emesso' THEN 'inviato' ELSE stato END
    WHERE id = $1 AND email_inviata_il IS NULL AND numero IS NOT NULL AND stato NOT IN ('bozza', 'annullato')`, [id, a.trim().slice(0, 200) || null]);
}
