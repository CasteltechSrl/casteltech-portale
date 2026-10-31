-- Profilo "contabilita" (Adriano 31/10/2026): il commercialista e Sonia di HTS vedono l'Amministrazione in sola lettura.
ALTER TABLE utenti DROP CONSTRAINT IF EXISTS utenti_ruolo_check;
ALTER TABLE utenti ADD CONSTRAINT utenti_ruolo_check CHECK (ruolo IN ('ufficio', 'produzione', 'contabilita'));
