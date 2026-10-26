-- ── Stesso file arrivato due volte (es. messo due volte nella cartella Drive) ──
-- L'impronta (SHA-256 del contenuto) riconosce il doppione: il secondo si registra già scartato e non si rilegge.
ALTER TABLE acquisizioni ADD COLUMN IF NOT EXISTS impronta text;
UPDATE acquisizioni SET impronta = encode(sha256(contenuto), 'hex') WHERE contenuto IS NOT NULL AND impronta IS NULL;
CREATE INDEX IF NOT EXISTS acquisizioni_impronta ON acquisizioni (impronta);
