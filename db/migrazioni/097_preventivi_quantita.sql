-- ── Una quotazione per più quantità (Adriano 13/11/2026, Digifly DGFAM V3: 25, 50, 100 pz) ──
-- I preventivi della stessa quotazione (uno per quantità, stessi dati, stessa BOM) hanno lo stesso gruppo = id del primo.
-- Fasce di velocità P&P e ricarico in impostazioni 'fasce_quantita'. Regole in src/engine/fasce-quantita.ts.
ALTER TABLE preventivi ADD COLUMN IF NOT EXISTS gruppo_quantita int;
CREATE INDEX IF NOT EXISTS preventivi_gruppo_quantita ON preventivi (gruppo_quantita) WHERE gruppo_quantita IS NOT NULL;
