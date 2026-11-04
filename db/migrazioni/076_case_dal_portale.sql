-- Formati (case) aggiunti alla tabella della codifica dalla pagina della riga BOM (Adriano 4/11/2026: "vorrei poter aggiungere un formato nuovo da qui").
-- chiave = case scritto senza spazi e trattini, in maiuscolo (come lo confronta la tabella); codice = 4 caratteri del codice gestionale.
CREATE TABLE codifica_case (
  chiave     text PRIMARY KEY,
  scritto    text NOT NULL,              -- come l'ha scritto l'ufficio, es. "2SMD"
  codice     text NOT NULL CHECK (codice ~ '^[A-Z0-9]{4}$'),
  tecnologia text NOT NULL CHECK (tecnologia IN ('S', 'T')),
  nota       text,
  creato_da  text,
  creato_il  timestamptz NOT NULL DEFAULT now()
);
