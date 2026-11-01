-- ── Qualità (Adriano, 31/10/2026) ──
-- Le sezioni principali della vecchia cartella 5_QUALITA del Drive: documenti del sistema, non conformità e reclami,
-- codifica dei difetti, strumenti e tarature, piano delle manutenzioni, verifiche ESD, formazione, audit, rischi e opportunità.
-- Una sola tabella: `sezione` dice il registro, `dati` i campi (elenco dei campi per sezione in src/engine/qualita.ts),
-- così una sezione nuova o un campo in più non richiedono una migrazione. Le righe non sono collegate ad altro: si eliminano sempre.
CREATE TABLE qualita_voci (
  id            serial PRIMARY KEY,
  sezione       text NOT NULL,
  dati          jsonb NOT NULL DEFAULT '{}',
  origine       text NOT NULL DEFAULT 'portale' CHECK (origine IN ('portale', 'file')),  -- 'file' = dal caricamento dei dati del Drive
  creato_da     int REFERENCES utenti(id) ON DELETE SET NULL,
  creato_il     timestamptz NOT NULL DEFAULT now(),
  aggiornato_il timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX qualita_voci_sezione ON qualita_voci (sezione);
