-- Acquisti → Materiale di consumo (Adriano 13/11/2026): voci della scheda di produzione con costo per unità e prezzo dall'ultimo acquisto,
-- giacenza (inventario scritto a mano + ordini a fornitore − consumi delle commesse) e cruscotto. Regole in src/engine/magazzino-consumo.ts.
-- Articolo → voce: vuoto = quella proposta dal portale, '-' = nessuna voce; contenuto = quanta materia della voce in una unità dell'articolo
-- (vuoto = proposto dalla descrizione, es. "VASETTO 500 G" = 0,5 kg).
ALTER TABLE materiali_consumo ADD COLUMN IF NOT EXISTS voce_consumo text;
ALTER TABLE materiali_consumo ADD COLUMN IF NOT EXISTS contenuto numeric;

-- Inventari (giacenza contata): l'ultimo di ogni voce è il punto di partenza; i vecchi restano come storico.
CREATE TABLE IF NOT EXISTS consumo_inventari (
  id          serial PRIMARY KEY,
  voce        text NOT NULL,
  data        date NOT NULL,
  quantita    numeric NOT NULL CHECK (quantita >= 0),
  dettaglio   jsonb,                   -- pezzi contati per articolo {codice: pezzi, sciolto: quantità}
  nota        text,
  creato_il   timestamptz NOT NULL DEFAULT now(),
  creato_da   int REFERENCES utenti(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS consumo_inventari_voce ON consumo_inventari (voce, creato_il);
