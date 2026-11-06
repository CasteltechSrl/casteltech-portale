-- Righe delle fatture dei fornitori (Adriano 6/11/2026: "voglio anche lo storico, riga per riga"): una riga per ogni DettaglioLinee
-- dell'XML, dall'archivio di Fatture in Cloud (2019–2026, file righe_fornitori.json.gz preparato fuori dal repository) e dalle fatture
-- che arrivano dallo SdI. Servono alle schede di analisi di componenti e materiali e alla ricerca "dove l'ho comprato e a quanto".
CREATE TABLE documenti_ricevuti_righe (
  id              serial PRIMARY KEY,
  documento_id    int NOT NULL REFERENCES documenti_ricevuti(id) ON DELETE CASCADE,
  posizione       int NOT NULL,
  codice          text,                          -- CodiceArticolo del fornitore; il nostro codice gestionale se la fattura era scritta in FIC
  codice_tipo     text,
  descrizione     text NOT NULL DEFAULT '',
  quantita        numeric,
  um              text,
  prezzo_unitario numeric,                       -- prezzo di listino del fornitore (prima dello sconto)
  sconto          numeric,                       -- % di sconto complessiva della riga
  imponibile      numeric NOT NULL DEFAULT 0,    -- PrezzoTotale della riga, già scontato (positivo anche nelle note di credito: conta il tipo del documento)
  aliquota        numeric,
  natura          text,
  pn              text,                          -- P/N riconosciuto nella riga
  componente_id   int REFERENCES componenti(id) ON DELETE SET NULL,            -- abbinato all'archivio componenti
  materiale_id    int REFERENCES materiali_consumo(id) ON DELETE SET NULL,     -- abbinato ai materiali di consumo
  categoria       text,                          -- categoria di costo della riga (vuota = quella del documento); per il punto di pareggio
  UNIQUE (documento_id, posizione)
);
CREATE INDEX ON documenti_ricevuti_righe (componente_id);
CREATE INDEX ON documenti_ricevuti_righe (materiale_id);
CREATE INDEX ON documenti_ricevuti_righe (upper(pn));
CREATE INDEX ON documenti_ricevuti_righe (upper(codice));
COMMENT ON TABLE documenti_ricevuti_righe IS 'Righe delle fatture dei fornitori lette dall''XML (storico FIC e SdI).';

-- quando le righe del documento sono state lette dall'XML (NULL = mai: fattura solo in PDF o XML non ancora letto)
ALTER TABLE documenti_ricevuti ADD COLUMN IF NOT EXISTS righe_lette_il timestamptz;
