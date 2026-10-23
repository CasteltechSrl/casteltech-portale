-- Commesse e scheda di produzione (prima pagina come la MASTERspec di Casteltech).
-- La scheda tecnica (programmi armadio/serigrafia/P&P/forno/AOI, lamine, paste, note di montaggio) vive sulla
-- revisione del prodotto (prodotti_revisioni.scheda_tecnica) e si ripropone ai lotti successivi; la commessa ne
-- conserva una copia, così la ristampa di una commessa vecchia resta uguale a quella usata in produzione.
ALTER TABLE commesse ADD COLUMN IF NOT EXISTS referente_cliente text;
ALTER TABLE commesse ADD COLUMN IF NOT EXISTS segnalazioni text;          -- segnalazioni per questa commessa
ALTER TABLE commesse ADD COLUMN IF NOT EXISTS scheda_tecnica jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE commesse ADD COLUMN IF NOT EXISTS intestazione jsonb NOT NULL DEFAULT '{}'::jsonb; -- cliente, codice, rev., descrizione
ALTER TABLE commesse ADD COLUMN IF NOT EXISTS creato_da int REFERENCES utenti(id);
ALTER TABLE commesse ADD COLUMN IF NOT EXISTS aggiornato_il timestamptz NOT NULL DEFAULT now();
CREATE SEQUENCE IF NOT EXISTS numerazione_commesse;
CREATE INDEX IF NOT EXISTS commesse_revisione ON commesse (revisione_id);
