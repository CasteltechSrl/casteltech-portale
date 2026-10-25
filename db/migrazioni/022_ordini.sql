-- ── Ordini dei clienti, DDT e fatture (schedulazione della produzione e cruscotto) ──
-- Gli ordini arrivano da Fatture in Cloud e dagli ordini ufficiali dei clienti (import da Impostazioni → Ordini).
-- Cliente e prodotto si collegano all'anagrafica quando ci sono (cliente_id, prodotto_id):
-- i nomi scritti come nel documento restano in cliente_nome / codice / descrizione.

CREATE TABLE ordini (
  id                  serial PRIMARY KEY,
  anno                int NOT NULL,
  numero              int NOT NULL,              -- numero dell'ordine cliente in Fatture in Cloud (o interno)
  data_ordine         date,
  cliente_id          int REFERENCES clienti(id),
  cliente_nome        text NOT NULL,             -- in maiuscolo, come nel documento
  rif_cliente         text,                      -- numero dell'ordine del cliente (es. 26-366)
  data_ordine_cliente date,
  origine             text NOT NULL DEFAULT 'manuale' CHECK (origine IN ('fic', 'ordine_cliente', 'foglio', 'manuale', 'email')),
  file                text,                      -- nome del PDF dell'ordine del cliente
  note                text,
  creato_il           timestamptz NOT NULL DEFAULT now(),
  aggiornato_il       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (anno, numero)
);

CREATE TABLE ordini_righe (
  id                  serial PRIMARY KEY,
  ordine_id           int NOT NULL REFERENCES ordini(id) ON DELETE CASCADE,
  chiave              text NOT NULL,             -- identificativo della riga nell'import (es. O44-1): serve per ricaricare senza doppioni
  posizione           int NOT NULL DEFAULT 0,
  prodotto_id         int REFERENCES prodotti(id),
  codice              text,
  descrizione         text,
  codice_cliente      text,                      -- codice e descrizione come li scrive il cliente nel suo ordine
  descrizione_cliente text,
  tipo                text NOT NULL DEFAULT 'scheda' CHECK (tipo IN ('scheda', 'servizio')),
  quantita            numeric NOT NULL DEFAULT 0,
  prezzo              numeric NOT NULL DEFAULT 0,
  consegna_richiesta  date,
  -- regole del foglio "Schedulazione produzione": lavorazione = arrivo materiale + 3 gg,
  -- consegna prevista = lavorazione + 5 gg + ritardi di produzione (le date scritte a mano vincono)
  arrivo_materiale    date,
  data_lavorazione    date,
  ritardi_produzione  int NOT NULL DEFAULT 0,
  consegna_prevista   date,
  quantita_spedita    numeric NOT NULL DEFAULT 0, -- dai DDT (e fatture accompagnatorie)
  importo_fatturato   numeric NOT NULL DEFAULT 0,
  stato_manuale       text CHECK (stato_manuale IN ('evaso', 'da_evadere', 'annullato')),
  commessa_id         int REFERENCES commesse(id) ON DELETE SET NULL,
  note                text,
  UNIQUE (ordine_id, chiave)
);
CREATE INDEX ON ordini_righe (prodotto_id);

-- Consegne a programma (es. un ordine annuale diviso in consegne mensili)
CREATE TABLE ordini_consegne (
  id        serial PRIMARY KEY,
  riga_id   int NOT NULL REFERENCES ordini_righe(id) ON DELETE CASCADE,
  data      date NOT NULL,
  quantita  numeric NOT NULL
);
CREATE INDEX ON ordini_consegne (riga_id);

-- Righe dei DDT e delle fatture emesse (copia dagli export di Fatture in Cloud, si ricaricano per anno)
CREATE TABLE ddt_righe (
  id          serial PRIMARY KEY,
  anno        int NOT NULL,
  numero      int NOT NULL,
  data        date NOT NULL,
  cliente_id  int REFERENCES clienti(id),
  cliente_nome text NOT NULL,
  codice      text,
  descrizione text,
  quantita    numeric NOT NULL DEFAULT 0,
  imponibile  numeric NOT NULL DEFAULT 0,
  riga_id     int REFERENCES ordini_righe(id) ON DELETE SET NULL
);
CREATE INDEX ON ddt_righe (anno, numero);

CREATE TABLE fatture_righe (
  id          serial PRIMARY KEY,
  anno        int NOT NULL,
  numero      int NOT NULL,
  data        date NOT NULL,
  cliente_id  int REFERENCES clienti(id),
  cliente_nome text NOT NULL,
  codice      text,
  descrizione text,
  quantita    numeric NOT NULL DEFAULT 0,
  imponibile  numeric NOT NULL DEFAULT 0,
  ddt_numero  int,                               -- DDT citato nella fattura ("DDT n. X del ...")
  intestazione boolean NOT NULL DEFAULT false,   -- riga descrittiva (es. "DDT n. 195 del 05/10/2026"): non è fatturato
  riga_id     int REFERENCES ordini_righe(id) ON DELETE SET NULL
);
CREATE INDEX ON fatture_righe (anno, numero);
CREATE INDEX ON fatture_righe (data);
