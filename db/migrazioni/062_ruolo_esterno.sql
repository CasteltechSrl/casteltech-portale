-- Profilo "esterno" (Adriano 2/11/2026): chi viene da fuori vede tutto il portale in sola lettura (niente Impostazioni né buste paga).
ALTER TABLE utenti DROP CONSTRAINT IF EXISTS utenti_ruolo_check;
ALTER TABLE utenti ADD CONSTRAINT utenti_ruolo_check CHECK (ruolo IN ('ufficio', 'produzione', 'contabilita', 'esterno'));
