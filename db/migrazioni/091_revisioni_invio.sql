-- Adriano 11/11/2026: revisioni dei documenti inviati. Ogni invio per email dal portale di preventivo, conferma d'ordine, DDT e ordine
-- a fornitore lascia qui una copia del PDF esatto che è partito, con il numero di revisione (0 = primo invio, poi 1, 2…).
-- Il documento nel portale resta uno solo (l'ultima versione, quella su cui si lavora); qui c'è lo storico di cosa ha ricevuto il cliente.
-- Fatture e note di credito NO: dopo lo SdI si correggono con la nota di credito, non con una revisione.
CREATE TABLE IF NOT EXISTS revisioni_invio (
  id            serial PRIMARY KEY,
  preventivo_id int REFERENCES preventivi(id) ON DELETE CASCADE,
  documento_id  int REFERENCES documenti(id) ON DELETE CASCADE,
  revisione     int NOT NULL,
  inviato_il    timestamptz NOT NULL DEFAULT now(),
  inviato_a     text,
  oggetto       text,
  nome_file     text,
  pdf           bytea,
  CHECK ((preventivo_id IS NULL) <> (documento_id IS NULL))
);
CREATE INDEX IF NOT EXISTS revisioni_invio_preventivo ON revisioni_invio (preventivo_id) WHERE preventivo_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS revisioni_invio_documento ON revisioni_invio (documento_id) WHERE documento_id IS NOT NULL;
