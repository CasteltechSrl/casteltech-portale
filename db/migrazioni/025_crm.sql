-- ── CRM: aziende (potenziali clienti e clienti), referenti, attività e prossima azione ──
-- Base iniziale: il file CRM_Database_Clienti di Adriano (import da Impostazioni → CRM, senza le vecchie attività).
-- Le aziende del CRM NON sono l'anagrafica clienti: un'azienda diventa cliente solo collegandola a un cliente
-- già in anagrafica (cliente_id). I clienti dell'anagrafica compaiono nel CRM da soli.

CREATE TABLE crm_aziende (
  id                   serial PRIMARY KEY,
  codice               text UNIQUE,                 -- ID nel file CRM (es. AZ00001): serve per ricaricare senza doppioni
  ragione_sociale      text NOT NULL,               -- in maiuscolo
  cliente_id           int UNIQUE REFERENCES clienti(id) ON DELETE SET NULL,
  stato                text NOT NULL DEFAULT 'da_contattare' CHECK (stato IN
                         ('da_contattare', 'contattato', 'da_ricontattare', 'in_trattativa', 'offerta_inviata', 'cliente', 'non_interessato', 'scartato')),
  priorita             text CHECK (priorita IN ('alta', 'media', 'bassa')),
  responsabile         text,
  settore              text,
  descrizione          text,                        -- cosa fa l'azienda
  indirizzo            text,
  cap                  text,
  citta                text,
  provincia            text,
  regione              text,
  paese                text,
  partita_iva          text,
  telefono             text,
  altri_telefoni       text,
  email                text,
  altre_email          text,
  sito                 text,
  altri_nomi           text,                        -- nomi con cui compare in altri file (per la ricerca)
  ateco                text,                        -- codice e descrizione ATECO
  dipendenti           int,
  fatturato            numeric,
  note                 text,
  da_verificare        text,                        -- motivo del dubbio: l'azienda resta fuori dalle ricerche finché non si conferma
  prossima_azione      text,
  data_prossima_azione date,
  ultimo_contatto      date,
  creato_il            timestamptz NOT NULL DEFAULT now(),
  aggiornato_il        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON crm_aziende (data_prossima_azione) WHERE data_prossima_azione IS NOT NULL;

CREATE TABLE crm_contatti (
  id             serial PRIMARY KEY,
  azienda_id     int NOT NULL REFERENCES crm_aziende(id) ON DELETE CASCADE,
  codice         text UNIQUE,                       -- ID nel file CRM (es. CT00001)
  nome           text NOT NULL,
  ruolo          text,
  telefono       text,
  altri_telefoni text,
  email          text,
  note           text
);
CREATE INDEX ON crm_contatti (azienda_id);

CREATE TABLE crm_attivita (
  id          serial PRIMARY KEY,
  azienda_id  int NOT NULL REFERENCES crm_aziende(id) ON DELETE CASCADE,
  data        date NOT NULL,
  tipo        text NOT NULL CHECK (tipo IN ('telefonata', 'email', 'visita', 'offerta', 'fiera', 'nota')),
  referente   text,
  descrizione text NOT NULL,
  utente_id   int REFERENCES utenti(id),
  creato_il   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON crm_attivita (azienda_id, data DESC);
