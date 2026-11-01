-- DDT segnati "Già fatturato" dall'ufficio (Adriano 1/11/2026): merce fatturata prima con anticipo/proforma o in Fatture in Cloud
-- senza il collegamento. Testo con chi e quando; NULL = da fatturare come prima.
ALTER TABLE documenti ADD COLUMN IF NOT EXISTS fatturato_altrove text;
