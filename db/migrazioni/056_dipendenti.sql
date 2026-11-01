-- Sezione Dipendenti (Adriano 1/11/2026): costo del personale, buste paga riservate, nota spese con il rimborso chilometrico.
-- I dati delle persone (nomi, buste paga, auto) stanno SOLO nel database, mai nel repository.

-- permesso di aprire l'area riservata delle buste paga (lo dà l'amministratore; serve comunque la password delle buste paga)
ALTER TABLE utenti ADD COLUMN paghe boolean NOT NULL DEFAULT false;

-- persone: dipendenti, soci, collaboratori, tirocinanti (per la nota spese)
CREATE TABLE dipendenti (
  id         serial PRIMARY KEY,
  nome       text NOT NULL UNIQUE,                 -- MAIUSCOLO, es. "MARIO ROSSI"
  tipo       text NOT NULL DEFAULT 'dipendente' CHECK (tipo IN ('dipendente', 'socio', 'collaboratore', 'tirocinante')),
  qualifica  text,                                 -- operaio, impiegato, apprendista…
  attivo     boolean NOT NULL DEFAULT true,
  note       text,
  creato_il  timestamptz NOT NULL DEFAULT now()
);

-- documenti dello studio paghe: cedolini e riepiloghi (riservati), note contabili, F24
CREATE TABLE paghe_documenti (
  id          serial PRIMARY KEY,
  tipo        text NOT NULL CHECK (tipo IN ('cedolini', 'riepilogo', 'nota_contabile', 'f24')),
  anno        int,
  mese        int CHECK (mese BETWEEN 1 AND 12),   -- mese di competenza (per l'F24: le paghe del mese prima della scadenza)
  scadenza    date,                                -- F24: giorno del versamento
  totale      numeric(12,2),                       -- F24: totale da versare
  nome_file   text NOT NULL,
  contenuto   bytea,
  impronta    text UNIQUE,                         -- sha256: lo stesso file non entra due volte
  origine     text NOT NULL DEFAULT 'caricato' CHECK (origine IN ('drive', 'caricato')),
  drive_id    text UNIQUE,
  stato       text NOT NULL DEFAULT 'nuovo' CHECK (stato IN ('nuovo', 'letto', 'errore')),
  lettura     jsonb,                               -- cosa ha letto l'IA (nota contabile, F24)
  errore      text,
  pagato_il   date,                                -- F24 pagato
  caricato_da int REFERENCES utenti(id) ON DELETE SET NULL,
  creato_il   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX paghe_documenti_periodo ON paghe_documenti (anno, mese);

-- costo del personale per mese e qualifica (dalla nota contabile o dallo storico dell'archivio)
CREATE TABLE costi_personale (
  id           serial PRIMARY KEY,
  anno         int NOT NULL,
  mese         int NOT NULL CHECK (mese BETWEEN 1 AND 12),
  qualifica    text NOT NULL,                      -- OPERAIO, IMPIEGATO, APPRENDISTA, SOCIO… (storico 2019–2021: DIPENDENTI, SOCI E COLLABORATORI, TIROCINANTI)
  lordo        numeric(12,2) NOT NULL DEFAULT 0,   -- retribuzioni lorde
  contributi   numeric(12,2) NOT NULL DEFAULT 0,   -- INPS a carico dell'azienda
  tfr          numeric(12,2) NOT NULL DEFAULT 0,
  altri        numeric(12,2) NOT NULL DEFAULT 0,   -- enti bilaterali, assistenza sanitaria, INAIL
  netto        numeric(12,2),                      -- netto in busta (solo informazione)
  origine      text NOT NULL DEFAULT 'manuale' CHECK (origine IN ('archivio', 'nota_contabile', 'manuale')),
  documento_id int REFERENCES paghe_documenti(id) ON DELETE SET NULL,
  file         text,
  aggiornato_il timestamptz NOT NULL DEFAULT now(),
  UNIQUE (anno, mese, qualifica)
);

-- nota spese: auto di ogni persona con la tariffa al km, destinazioni con i km di andata, note mensili con le righe
CREATE TABLE rimborsi_veicoli (
  id            serial PRIMARY KEY,
  dipendente_id int NOT NULL REFERENCES dipendenti(id) ON DELETE CASCADE,
  marca         text,
  modello       text,
  anno          int,
  tariffa_km    numeric(8,4) NOT NULL,             -- €/km (tabelle ACI)
  attivo        boolean NOT NULL DEFAULT true
);

CREATE TABLE rimborsi_destinazioni (
  id         serial PRIMARY KEY,
  nome       text NOT NULL UNIQUE,                 -- MAIUSCOLO, es. "AEE - SULBIATE"
  km_andata  numeric(8,1) NOT NULL,
  provincia  text
);

CREATE TABLE note_spese (
  id            serial PRIMARY KEY,
  dipendente_id int NOT NULL REFERENCES dipendenti(id),
  veicolo_id    int REFERENCES rimborsi_veicoli(id) ON DELETE SET NULL,
  anno          int NOT NULL,
  mese          int NOT NULL CHECK (mese BETWEEN 1 AND 12),
  tariffa_km    numeric(8,4) NOT NULL DEFAULT 0,   -- copiata dall'auto quando si crea la nota: cambiare la tariffa dopo non cambia le note fatte
  veicolo_testo text,                              -- marca, modello, anno dell'auto al momento della nota
  note          text,
  creato_il     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dipendente_id, anno, mese)
);

CREATE TABLE note_spese_righe (
  id             serial PRIMARY KEY,
  nota_id        int NOT NULL REFERENCES note_spese(id) ON DELETE CASCADE,
  data           date NOT NULL,
  partenza       text NOT NULL DEFAULT 'SEDE',
  destinazione   text,
  km_andata      numeric(8,1) NOT NULL DEFAULT 0,
  andata_ritorno boolean NOT NULL DEFAULT true,
  altre_spese    numeric(10,2) NOT NULL DEFAULT 0, -- pranzo, parcheggio, pedaggi…
  note           text
);
CREATE INDEX note_spese_righe_nota ON note_spese_righe (nota_id);

-- rimborsi pagati alla persona (anche acconti: "PAGATO 2000 + 500" del modulo Excel)
CREATE TABLE note_spese_pagamenti (
  id            serial PRIMARY KEY,
  dipendente_id int NOT NULL REFERENCES dipendenti(id),
  anno          int NOT NULL,                      -- anno delle note a cui si riferisce
  data          date NOT NULL,
  importo       numeric(12,2) NOT NULL CHECK (importo > 0),
  note          text,
  creato_il     timestamptz NOT NULL DEFAULT now()
);
