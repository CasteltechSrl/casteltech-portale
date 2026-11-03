-- Servizi una tantum (Adriano 3/11/2026): lamina serigrafica, documentazione, programmazione attrezzature, attrezzaggio PCB.
-- Codici Casteltech (UT-…) validi per TUTTI i clienti: si scelgono nel menu Codice di ordini, conferme, DDT e fatture
-- e servono a contare il venduto per codice. Eccezione voluta alla regola codice-cliente: per questo non stanno in "prodotti".
CREATE TABLE IF NOT EXISTS servizi_una_tantum (
  id            serial PRIMARY KEY,
  codice        text NOT NULL UNIQUE,
  descrizione   text NOT NULL,
  prezzo        numeric,
  attivo        boolean NOT NULL DEFAULT true,
  creato_il     timestamptz NOT NULL DEFAULT now(),
  aggiornato_il timestamptz NOT NULL DEFAULT now()
);

INSERT INTO servizi_una_tantum (codice, descrizione, prezzo) VALUES
  ('UT-LAMINA', 'LAMINA SERIGRAFICA', 110),
  ('UT-DOCUMENTAZIONE', 'PREPARAZIONE DOCUMENTAZIONE DI PRODUZIONE', NULL),
  ('UT-PROGRAMMAZIONE', 'PROGRAMMAZIONE ATTREZZATURE', NULL),
  ('UT-ATTREZZAGGIO-PCB', 'ATTREZZAGGIO PCB', NULL)
ON CONFLICT (codice) DO NOTHING;
