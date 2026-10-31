-- ── Pulsante "Portale Casteltech" dentro Gmail (Adriano, 29/10/2026) ──
-- Da una mail si mandano al portale testo e allegati: per un preventivo nasce un pacchetto dei documenti del cliente
-- con l'email della richiesta (mittente, oggetto, data, testo); l'analisi parte da sola dopo l'invio.
ALTER TABLE pacchetti_scheda
  ADD COLUMN IF NOT EXISTS email  jsonb,   -- { mittente, oggetto, data, testo, messaggioId } della richiesta del cliente
  ADD COLUMN IF NOT EXISTS errore text;    -- analisi partita da Gmail e non riuscita
