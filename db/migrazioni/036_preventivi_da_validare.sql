-- Preventivo compilato dai documenti del cliente (Adriano 28/10/2026): resta "da validare" finché l'ufficio non lo controlla e lo salva.
ALTER TABLE preventivi DROP CONSTRAINT IF EXISTS preventivi_stato_check;
ALTER TABLE preventivi ADD CONSTRAINT preventivi_stato_check
  CHECK (stato IN ('da_validare', 'bozza', 'inviato', 'accettato', 'rifiutato', 'archiviato'));
ALTER TABLE pacchetti_scheda ADD COLUMN IF NOT EXISTS preventivo_id int REFERENCES preventivi(id) ON DELETE SET NULL;
-- Zone da proteggere prima della saldatura a onda (fori e aree segnate dall'ufficio sul disegno; Adriano 28/10/2026)
ALTER TABLE pacchetti_scheda ADD COLUMN IF NOT EXISTS protezioni jsonb;
