-- ── Ordine dal preventivo (proposta della revisione, Adriano 1/11/2026) ──
-- Quando il cliente conferma, "Crea ordine" dal preventivo: l'ordine ricorda da quale preventivo nasce (origine 'preventivo').
ALTER TABLE ordini ADD COLUMN IF NOT EXISTS preventivo_id int REFERENCES preventivi(id) ON DELETE SET NULL;
ALTER TABLE ordini DROP CONSTRAINT IF EXISTS ordini_origine_check;
ALTER TABLE ordini ADD CONSTRAINT ordini_origine_check CHECK (origine IN ('fic', 'ordine_cliente', 'foglio', 'manuale', 'email', 'preventivo'));
CREATE INDEX IF NOT EXISTS ordini_preventivo_idx ON ordini (preventivo_id) WHERE preventivo_id IS NOT NULL;
