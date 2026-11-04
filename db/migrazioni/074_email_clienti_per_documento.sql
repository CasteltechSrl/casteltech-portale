-- Email del cliente per tipo di documento (Adriano 4/11/2026): oltre a quella per le fatture (email_amministrazione),
-- l'indirizzo (o più indirizzi separati da virgola) a cui mandare i preventivi e i DDT. Proposti per primi nell'invio per email.
ALTER TABLE clienti
  ADD COLUMN IF NOT EXISTS email_preventivi text,
  ADD COLUMN IF NOT EXISTS email_ddt text;
