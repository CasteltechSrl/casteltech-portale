-- Abbinamento della banca con l'IA (Adriano 14/11/2026, "far girare un motore AI per capire cosa sono e abbinarli"):
-- per i movimenti che le regole non sanno abbinare, la proposta dell'IA (fatture o categoria, motivo, se è sicura).
-- Solo una proposta: diventa abbinamento o registrazione quando l'ufficio conferma.
ALTER TABLE banca_movimenti ADD COLUMN IF NOT EXISTS proposta_ia jsonb;
