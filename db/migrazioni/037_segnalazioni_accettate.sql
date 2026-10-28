-- Segnalazioni dei documenti del cliente controllate dall'ufficio ("Va bene", Adriano 28/10/2026):
-- chiave "livello|testo" → chi e quando. Restano valide dopo "Rianalizza" finché la segnalazione è la stessa.
ALTER TABLE pacchetti_scheda ADD COLUMN IF NOT EXISTS accettate jsonb NOT NULL DEFAULT '{}'::jsonb;
