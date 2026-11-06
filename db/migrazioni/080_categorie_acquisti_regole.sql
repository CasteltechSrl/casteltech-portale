-- Analisi → Costi per categoria (Adriano 6/11/2026): le categorie scelte dall'ufficio per le fatture dei fornitori.
-- tipo 'fornitore' (chiave = nome in maiuscolo: vale per tutte le sue righe), 'documento' (chiave = id di documenti_ricevuti),
-- 'riga' (chiave = id di documenti_ricevuti_righe). Le righe non scritte qui prendono la categoria dalle regole di engine/categorie-acquisti.ts.
CREATE TABLE IF NOT EXISTS categorie_acquisti_regole (
  id serial PRIMARY KEY,
  tipo text NOT NULL CHECK (tipo IN ('fornitore', 'documento', 'riga')),
  chiave text NOT NULL,
  categoria text NOT NULL,
  nota text,
  creato_il timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo, chiave)
);
