-- Programmi delle macchine sul prodotto (Adriano 13/11/2026): serigrafia, P&P FOX e iPulse, AOI… con TOP e BOT, uguali per tutte le revisioni.
-- La commessa li prende per le caselle che la sua revisione lascia vuote; salvando una commessa i programmi scritti tornano qui.
ALTER TABLE prodotti ADD COLUMN IF NOT EXISTS programmi jsonb NOT NULL DEFAULT '{}'::jsonb;
