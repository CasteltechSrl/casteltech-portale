-- Invio allo SdI tramite Invoicetronic (Adriano, 28/10/2026: passaggio dal portale lunedì 2/11).
-- Ogni invio è una riga: si possono avere più invii per documento (prove dalle bozze con la chiave di prova,
-- nuovo invio dopo uno scarto). Lo stato del documento (documenti.stato) segue solo gli invii reali.

CREATE TABLE sdi_invii (
  id                serial PRIMARY KEY,
  documento_id      int NOT NULL REFERENCES documenti(id) ON DELETE CASCADE,
  ambiente          text NOT NULL CHECK (ambiente IN ('prova', 'reale')),   -- chiave ik_test_ (sandbox) o ik_live_
  invoicetronic_id  int,                       -- id dell'invio in Invoicetronic (Send.id)
  nome_file         text,                      -- nome del file dato da Invoicetronic
  identificativo    text,                      -- identificativo SdI
  stato             text NOT NULL DEFAULT 'caricato',  -- caricato, poi gli stati dello SdI (Inviato, Consegnato, Scartato…)
  messaggio         text,                      -- spiegazione per l'ufficio (es. motivo dello scarto)
  errori            jsonb,                     -- errori dello SdI [{codice, descrizione, suggerimento}]
  inviato_il        timestamptz NOT NULL DEFAULT now(),
  aggiornato_il     timestamptz NOT NULL DEFAULT now(),
  creato_da         int REFERENCES utenti(id) ON DELETE SET NULL
);
CREATE INDEX ON sdi_invii (documento_id);
CREATE UNIQUE INDEX ON sdi_invii (ambiente, invoicetronic_id);

-- Eventi già ricevuti dal webhook di Invoicetronic (arrivano "almeno una volta": si scartano i doppioni).
CREATE TABLE sdi_eventi (
  id            bigint NOT NULL,               -- Id dell'evento in Invoicetronic
  ambiente      text NOT NULL,
  tipo          text NOT NULL,                 -- send, update, receive…
  risorsa_id    int,
  ricevuto_il   timestamptz NOT NULL DEFAULT now(),
  esito         text,                          -- cosa ne ha fatto il portale (o l'errore)
  PRIMARY KEY (ambiente, id)
);
