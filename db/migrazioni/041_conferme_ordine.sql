-- ── Conferme d'ordine dagli Ordini (Adriano, 28/10/2026) ──
-- La conferma è un documento (tipo 'conferma_ordine', numerazione propria) collegato all'ordine del cliente:
-- righe e date di consegna si copiano dall'ordine e si possono modificare; il PDF emesso resta salvato nel documento
-- e si può mandare con Gmail in risposta all'email dell'ordine.

-- data di consegna della riga (la conferma riporta una data per ogni riga o consegna a programma)
ALTER TABLE documenti_righe ADD COLUMN IF NOT EXISTS consegna date;

ALTER TABLE documenti
  ADD COLUMN IF NOT EXISTS data_riferimento date,          -- data dell'ordine del cliente (riferimento_esterno = suo numero)
  ADD COLUMN IF NOT EXISTS pdf bytea,                      -- PDF emesso (conferme d'ordine)
  ADD COLUMN IF NOT EXISTS email_a text,                   -- a chi è stato mandato per email
  ADD COLUMN IF NOT EXISTS email_inviata_il timestamptz,
  ADD COLUMN IF NOT EXISTS email_id text;                  -- identificativo del messaggio in Gmail
