-- Invio dei documenti (Adriano 4/11/2026): preventivi per email dalla stampa (da preventivi@) e segno "Inviato" su tutti i documenti.
-- Preventivi: a chi e quando è partita l'email (come documenti.email_a / email_inviata_il delle conferme e dei DDT).
ALTER TABLE preventivi
  ADD COLUMN IF NOT EXISTS email_a text,
  ADD COLUMN IF NOT EXISTS email_inviata_il timestamptz,
  ADD COLUMN IF NOT EXISTS email_id text,
  ADD COLUMN IF NOT EXISTS inviato_a_mano boolean NOT NULL DEFAULT false;
-- Documento mandato da fuori del portale (posta, PEC, a mano): l'ufficio lo segna inviato, email_a = a chi / come.
ALTER TABLE documenti ADD COLUMN IF NOT EXISTS inviato_a_mano boolean NOT NULL DEFAULT false;
