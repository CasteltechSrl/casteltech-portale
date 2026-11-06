-- Documentazione dei prodotti (Adriano 6/11/2026): per ogni codice prodotto le revisioni dei documenti del cliente
-- (BOM, pick and place, Gerber) come RIASSUNTO, mai i file: i file restano su Google Drive e non pesano su Neon.
-- Una riga per revisione; il confronto tra due revisioni si fa sui riassunti (engine/documenti-prodotto.ts).
CREATE TABLE prodotti_documenti (
  id            serial PRIMARY KEY,
  prodotto_id   int NOT NULL REFERENCES prodotti(id) ON DELETE CASCADE,
  revisione     text NOT NULL,                      -- letta dai file (BOM, Gerber, GenCAD, nomi); "0" se non c'è
  revisione_da  text,                               -- da dove viene la revisione (es. "intestazione della BOM", "nome della cartella", "non trovata")
  caricato_il   timestamptz NOT NULL DEFAULT now(),
  caricato_da   text,                               -- nome dell'utente, o "Claude" per l'acquisizione dal Drive
  origine       text NOT NULL DEFAULT 'portale',    -- 'drive' = acquisizione dalle cartelle del Drive; 'portale' = caricata dalla pagina del prodotto
  cartella      text,                               -- cartella sul Drive da cui vengono i file
  pacchetto_id  int REFERENCES pacchetti_scheda(id) ON DELETE SET NULL, -- pacchetto dei Documenti dei clienti, se caricata dal portale
  riassunto     jsonb NOT NULL,                     -- RiassuntoDocumenti: file, componenti (ref, P/N, valore, case, lato), conteggi, strati Gerber, misure
  note          text
);
CREATE INDEX ON prodotti_documenti (prodotto_id, caricato_il);
