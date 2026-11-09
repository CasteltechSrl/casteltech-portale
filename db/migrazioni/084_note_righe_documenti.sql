-- Note per riga dei documenti (Adriano 9/11/2026, DDT 222): informazioni del singolo lotto (es. matricole, versione, "senza connettore")
-- scritte nella riga del DDT. Non toccano l'anagrafica del prodotto, passano alla fattura fatta dal DDT e si stampano sotto la descrizione.
ALTER TABLE documenti_righe ADD COLUMN IF NOT EXISTS note text;
