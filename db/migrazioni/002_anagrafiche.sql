-- ── Anagrafiche ufficiali (clienti e prodotti caricati dall'elenco aziendale) ──
-- Un prodotto può non avere ancora un cliente (elenco senza categoria): si assegna al primo preventivo.
ALTER TABLE prodotti ALTER COLUMN cliente_id DROP NOT NULL;

-- Nomi "vecchi" (come erano scritti nei preventivi) collegati al cliente ufficiale
CREATE TABLE alias_clienti (
  nome       text PRIMARY KEY,                -- in maiuscolo, spazi normalizzati
  cliente_id int NOT NULL REFERENCES clienti(id) ON DELETE CASCADE
);
-- Codici "vecchi" collegati al prodotto ufficiale (per cliente)
CREATE TABLE alias_prodotti (
  cliente_id  int NOT NULL REFERENCES clienti(id) ON DELETE CASCADE,
  codice      text NOT NULL,                  -- solo lettere e numeri, maiuscolo
  prodotto_id int NOT NULL REFERENCES prodotti(id) ON DELETE CASCADE,
  PRIMARY KEY (cliente_id, codice)
);
