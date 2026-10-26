-- ── Anagrafica fornitori ──
-- Base: elenco fornitori di Fatture in Cloud (26/10/2026), ripulito fuori dal repository: solo righe con P.IVA valida,
-- senza doppioni, tutto in MAIUSCOLO (email e PEC in minuscolo). Si carica da Impostazioni → Fornitori.
-- Un nuovo caricamento aggiunge i nuovi e aggiorna gli esistenti (stessa P.IVA); non toglie niente.
CREATE TABLE fornitori_anagrafica (
  id              serial PRIMARY KEY,
  ragione_sociale text NOT NULL,
  partita_iva     text NOT NULL UNIQUE,            -- italiana senza "IT"; estera con il prefisso del paese (DE…, FR…)
  codice_fiscale  text,
  indirizzo       text,
  cap             text,
  comune          text,
  provincia       text,
  paese           text,
  email           text,
  pec             text,
  telefono        text,
  referente       text,
  iban            text,
  codice_sdi      text,
  note            text,
  creato_il       timestamptz NOT NULL DEFAULT now(),
  aggiornato_il   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON fornitori_anagrafica (upper(ragione_sociale));
COMMENT ON TABLE fornitori_anagrafica IS 'Fornitori (anagrafica). Diverso da fornitori_cache, che sono le offerte dei distributori di componenti.';
