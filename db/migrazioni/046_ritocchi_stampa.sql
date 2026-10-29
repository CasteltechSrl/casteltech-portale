-- Ritocchi della stampa del preventivo per il cliente (Adriano, 29/10/2026): note per il cliente, sconto, righe in più.
-- Valgono solo nella stampa: il calcolo del preventivo non cambia. Vedi leggiRitocchi in src/engine/stampa-preventivo.ts.
ALTER TABLE preventivi ADD COLUMN IF NOT EXISTS stampa jsonb NOT NULL DEFAULT '{}'::jsonb;
