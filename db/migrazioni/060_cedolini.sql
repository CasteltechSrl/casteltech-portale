-- Buste paga come dati (Adriano 1/11/2026: "acquisiscile come dati e valori"): un cedolino per persona, mese e mensilità,
-- letti dal testo dei PDF senza IA (storico dall'archivio 2019–2026 e cedolini nuovi dalla cartella "Da acquisire").
-- Dati delle persone: solo qui nel database, si vedono solo nell'area riservata delle buste paga.
CREATE TABLE cedolini (
  id                    serial PRIMARY KEY,
  chiave                text NOT NULL UNIQUE,              -- codice fiscale (o nome) | anno-mese | mensilità: lo stesso cedolino non entra due volte
  anno                  int NOT NULL,
  mese                  int NOT NULL CHECK (mese BETWEEN 1 AND 12),
  mensilita             text NOT NULL DEFAULT 'ordinaria' CHECK (mensilita IN ('ordinaria', 'tredicesima', 'quattordicesima')),
  modello               text,                              -- upa (studio attuale) / zucchetti (studio fino al 2021)
  matricola             text,
  nome                  text NOT NULL,
  codice_fiscale        text,
  qualifica             text,
  livello               text,
  mansione              text,
  data_assunzione       date,
  data_cessazione       date,
  ore_lavorate          numeric(8,2),
  giorni_lavorati       int,
  paga_oraria           numeric(10,5),
  retribuzione          numeric(12,2),                     -- retribuzione mensile del contratto (base + scatti + premi)
  lordo                 numeric(12,2) NOT NULL DEFAULT 0,  -- totale competenze
  ritenute              numeric(12,2) NOT NULL DEFAULT 0,  -- totale ritenute
  contributi_dipendente numeric(12,2),
  irpef                 numeric(12,2),
  addizionali           numeric(12,2),
  netto                 numeric(12,2) NOT NULL DEFAULT 0,
  voci                  jsonb NOT NULL DEFAULT '[]',       -- [{codice, descrizione, quantita, importo, tipo: competenza|ritenuta}]
  avvisi                jsonb NOT NULL DEFAULT '[]',       -- cosa non torna nella lettura (voci ≠ totali…)
  origine               text NOT NULL DEFAULT 'archivio' CHECK (origine IN ('archivio', 'documento')),
  documento_id          int REFERENCES paghe_documenti(id) ON DELETE SET NULL,
  file                  text,
  aggiornato_il         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cedolini_periodo ON cedolini (anno, mese);
CREATE INDEX cedolini_persona ON cedolini (codice_fiscale);
