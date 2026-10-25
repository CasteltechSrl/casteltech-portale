-- Codifica componenti e preventivo materiali dalla BOM (Adriano, 25/10/2026).
--  * componenti: archivio dei codici di produzione (armadio Essegi) e gestionali (Moka), come il database del
--    programma "Codifica componenti" (componenti.db), che si importa da Impostazioni → Componenti.
--    Uno stesso codice può avere più righe (più P/N equivalenti o più voci d'armadio): niente vincolo di unicità.
--  * fornitori_cache: risposte di DigiKey, Mouser, Farnell, TME per P/N (prezzi e disponibilità del giorno).
--  * bom_analisi: BOM caricate con il risultato riga per riga (codici, offerte, quantità da acquistare).
CREATE TABLE IF NOT EXISTS componenti (
  id                serial PRIMARY KEY,
  pn                text,
  pn_key            text,              -- P/N normalizzato per il confronto (solo lettere e cifre)
  produttore        text,
  famiglia          text,
  codice_produzione text,
  codice_gestionale text,
  descrizione       text,
  attributi         jsonb NOT NULL DEFAULT '{}'::jsonb,
  stato             text,              -- OK / DA VERIFICARE / MANUALE
  fonte             text,
  note              text,
  creato_il         timestamptz NOT NULL DEFAULT now(),
  aggiornato_il     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS componenti_pn ON componenti (pn_key);
CREATE INDEX IF NOT EXISTS componenti_produzione ON componenti (upper(codice_produzione));
CREATE INDEX IF NOT EXISTS componenti_gestionale ON componenti (codice_gestionale);

CREATE TABLE IF NOT EXISTS fornitori_cache (
  fornitore     text NOT NULL,
  chiave        text NOT NULL,          -- P/N normalizzato o ricerca per parametri
  dati          jsonb NOT NULL,
  aggiornato_il timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fornitore, chiave)
);

CREATE TABLE IF NOT EXISTS bom_analisi (
  id            serial PRIMARY KEY,
  nome          text NOT NULL,
  file_nome     text,
  quantita      int[] NOT NULL DEFAULT '{}',   -- schede da produrre (anche più quantità per il preventivo)
  colonne       jsonb NOT NULL DEFAULT '[]'::jsonb,
  mappatura     jsonb NOT NULL DEFAULT '{}'::jsonb,
  righe_file    jsonb NOT NULL DEFAULT '[]'::jsonb,  -- righe originali della BOM
  righe         jsonb NOT NULL DEFAULT '[]'::jsonb,  -- risultato
  riepilogo     jsonb NOT NULL DEFAULT '{}'::jsonb,
  stato         text NOT NULL DEFAULT 'da_elaborare',
  messaggio     text,
  creato_da     int REFERENCES utenti(id),
  creato_il     timestamptz NOT NULL DEFAULT now(),
  aggiornato_il timestamptz NOT NULL DEFAULT now()
);
