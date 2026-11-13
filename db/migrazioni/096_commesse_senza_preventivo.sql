-- ── Schede di produzione senza preventivo (Adriano 13/11/2026) ──
-- Commessa creata "da zero": urgente (poche fasi scelte dall'ufficio) o a consuntivo (tutte le fasi stampate, l'operatore
-- scrive quelle che fa). preventivo_id resta vuoto; qui il modo, TOP/BOT e schede per pannello. Regole in src/engine/schede-libere.ts.
ALTER TABLE commesse ADD COLUMN IF NOT EXISTS senza_preventivo jsonb;
