-- Codifica BOM senza prezzi (Adriano 4/11/2026, Anagrafiche → Componenti → Codifica una BOM): la BOM si codifica
-- (codice di produzione e gestionale, archivio, IA) senza chiedere prezzi e disponibilità ai distributori.
-- "Cerca anche i prezzi" la passa a Quotazioni (solo_codifica = false) e la rielabora come una BOM normale.
ALTER TABLE bom_analisi ADD COLUMN IF NOT EXISTS solo_codifica boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN bom_analisi.solo_codifica IS 'BOM codificata senza prezzi dei distributori (Anagrafiche → Componenti → Codifica una BOM).';
