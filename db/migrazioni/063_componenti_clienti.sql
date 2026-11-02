-- Componenti dei clienti (Adriano 2/11/2026): il materiale in conto lavoro che i clienti (es. Selea, Idea automazione)
-- ci mandano con i LORO codici. Ogni codice ha il suo cliente; tutto in MAIUSCOLO. Servono nei DDT (reso del materiale non montato).
CREATE TABLE IF NOT EXISTS componenti_clienti (
  id            serial PRIMARY KEY,
  cliente_id    int NOT NULL REFERENCES clienti(id) ON DELETE CASCADE,
  codice        text NOT NULL,
  descrizione   text,
  famiglia      text,
  gruppo        text,
  note          text,
  creato_il     timestamptz NOT NULL DEFAULT now(),
  aggiornato_il timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cliente_id, codice)
);

-- Righe dei documenti: da quale anagrafica viene il codice (DDT: prodotto, componente nostro, componente del cliente, libero)
ALTER TABLE documenti_righe
  ADD COLUMN IF NOT EXISTS fonte text,
  ADD COLUMN IF NOT EXISTS componente_id int REFERENCES componenti(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS componente_cliente_id int REFERENCES componenti_clienti(id) ON DELETE SET NULL;
