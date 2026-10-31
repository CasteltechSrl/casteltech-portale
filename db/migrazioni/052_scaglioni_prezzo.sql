-- Prezzi a scaglioni di quantità (Adriano 31/10/2026): "da 1 a 5 pz 10 €, da 6 a 20 pz 8 €". Facoltativi: senza scaglioni vale
-- prodotti.prezzo_vendita per tutte le quantità. a NULL = "e oltre". In fattura / nota di credito / DDT il prezzo si sceglie dalla quantità.
CREATE TABLE IF NOT EXISTS prodotti_scaglioni (
  id          serial PRIMARY KEY,
  prodotto_id int NOT NULL REFERENCES prodotti(id) ON DELETE CASCADE,
  da          int NOT NULL CHECK (da >= 1),
  a           int CHECK (a IS NULL OR a >= da),
  prezzo      numeric(14,5) NOT NULL CHECK (prezzo >= 0)
);
CREATE INDEX IF NOT EXISTS prodotti_scaglioni_prodotto ON prodotti_scaglioni (prodotto_id, da);
