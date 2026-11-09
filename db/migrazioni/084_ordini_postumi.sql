-- ── Ordini postumi (Adriano 9/11/2026) ──
-- Ordine "fittizio" creato dopo, per coprire una fattura che non aveva un ordine registrato: origine 'postumo',
-- collegato alla fattura che copre (fattura_id), numerato dall'8001 nell'anno, già evaso.
ALTER TABLE ordini ADD COLUMN IF NOT EXISTS fattura_id int REFERENCES documenti(id) ON DELETE SET NULL;
ALTER TABLE ordini DROP CONSTRAINT IF EXISTS ordini_origine_check;
ALTER TABLE ordini ADD CONSTRAINT ordini_origine_check CHECK (origine IN ('fic', 'ordine_cliente', 'foglio', 'manuale', 'email', 'preventivo', 'postumo'));
CREATE INDEX IF NOT EXISTS ordini_fattura_idx ON ordini (fattura_id) WHERE fattura_id IS NOT NULL;
