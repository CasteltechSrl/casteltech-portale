-- ── Più versioni della stessa scheda in una richiesta (Adriano, 29/10/2026: "167pz versione HELIOS, 90pz versione CRONOS") ──
-- Ogni versione è un pacchetto dei documenti a parte, figlio di quello caricato: file comuni + i file con il nome della versione.
ALTER TABLE pacchetti_scheda
  ADD COLUMN IF NOT EXISTS padre_id int REFERENCES pacchetti_scheda(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS versione text,      -- es. HELIOS
  ADD COLUMN IF NOT EXISTS quantita int;       -- schede richieste dal cliente per questa versione (proposte nel preventivo)
CREATE INDEX IF NOT EXISTS pacchetti_scheda_padre ON pacchetti_scheda (padre_id) WHERE padre_id IS NOT NULL;
