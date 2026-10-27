-- Storico dei documenti da Fatture in Cloud (Adriano, 27/10/2026: FIC scade il 10/11/2026).
-- Fatture, note di credito, autofatture e DDT emessi vanno nella tabella documenti (origine 'fic');
-- i documenti ricevuti dai fornitori (fatture d'acquisto, note di credito) in una tabella nuova,
-- che servirà anche per le fatture passive lette dallo SdI (Invoicetronic).

ALTER TABLE documenti
  ADD COLUMN origine text NOT NULL DEFAULT 'portale' CHECK (origine IN ('portale', 'fic')),
  ADD COLUMN fic_id bigint UNIQUE,                             -- id del documento in Fatture in Cloud (ricaricare non duplica)
  ADD COLUMN fattura_id int REFERENCES documenti(id) ON DELETE SET NULL,  -- DDT → fattura in cui è stato fatturato
  ADD COLUMN dati_trasporto jsonb;                             -- DDT: causale, colli, peso, destinazione, trasportatore
CREATE INDEX ON documenti (fattura_id);
CREATE INDEX ON documenti (tipo, data);

-- conto su cui è stato incassato/pagato (Bper, Carta di Credito, PayPal, Compensazione con fattura…): serve per la banca
ALTER TABLE documenti_scadenze ADD COLUMN conto text;

CREATE TABLE documenti_ricevuti (
  id              serial PRIMARY KEY,
  tipo            text NOT NULL CHECK (tipo IN ('fattura', 'nota_credito')),
  tipo_sdi        text,                          -- TD01, TD04… quando arriva dallo SdI
  numero          text NOT NULL DEFAULT '',      -- numero del fornitore (anche con lettere: "FPR 9/26")
  data            date NOT NULL,
  fornitore_id    int REFERENCES fornitori_anagrafica(id) ON DELETE SET NULL,
  intestatario    jsonb NOT NULL,                -- nome, P.IVA, codice fiscale, indirizzo, paese del fornitore come sul documento
  descrizione     text,
  categoria       text,                          -- categoria di costo (es. B6_Materie prime c/acquisti)
  imponibile      numeric NOT NULL DEFAULT 0,
  imposta         numeric NOT NULL DEFAULT 0,
  totale          numeric NOT NULL DEFAULT 0,
  elettronica     boolean NOT NULL DEFAULT true, -- false: ricevute d'affitto, polizze… non passate dallo SdI
  origine         text NOT NULL DEFAULT 'sdi' CHECK (origine IN ('sdi', 'fic', 'manuale')),
  fic_id          bigint UNIQUE,
  sdi_id          text,
  xml             text,
  creato_il       timestamptz NOT NULL DEFAULT now(),
  aggiornato_il   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON documenti_ricevuti (data);
CREATE INDEX ON documenti_ricevuti (fornitore_id);
COMMENT ON TABLE documenti_ricevuti IS 'Fatture e note di credito dei fornitori (storico FIC, poi dallo SdI).';

CREATE TABLE documenti_ricevuti_scadenze (
  id            serial PRIMARY KEY,
  documento_id  int NOT NULL REFERENCES documenti_ricevuti(id) ON DELETE CASCADE,
  data          date NOT NULL,
  importo       numeric NOT NULL,
  pagata_il     date,
  conto         text
);
CREATE INDEX ON documenti_ricevuti_scadenze (data) WHERE pagata_il IS NULL;
