-- Collegamento con la banca (Adriano 7/11/2026; scelta: prima i file della banca BPER, poi l'open banking PSD2).
-- Movimenti dell'estratto conto caricati da file (CBI o Excel/CSV), abbinati alle rate delle fatture emesse e ricevute
-- o messi in una categoria (commissioni, F24, stipendi…). Regole in src/engine/banca.ts.
CREATE TABLE banca_movimenti (
  id             serial PRIMARY KEY,
  conto          text NOT NULL DEFAULT 'BPER',
  data           date NOT NULL,                 -- data contabile
  valuta         date,
  importo        numeric NOT NULL,              -- + entrata, − uscita
  descrizione    text NOT NULL DEFAULT '',
  causale        text,                          -- causale ABI del file CBI
  chiave         text NOT NULL UNIQUE,          -- data|importo|descrizione|n: ricaricando lo stesso periodo non si raddoppia
  file           text,
  caricato_il    timestamptz NOT NULL DEFAULT now(),
  stato          text NOT NULL DEFAULT 'da_abbinare' CHECK (stato IN ('da_abbinare', 'abbinato', 'registrato')),
  categoria      text,
  rate           jsonb NOT NULL DEFAULT '[]',   -- rate segnate pagate da questo movimento: [{"tipo":"emessa"|"ricevuta","id":N}]
  confermato_il  timestamptz,
  confermato_da  text
);
CREATE INDEX ON banca_movimenti (data);
CREATE INDEX ON banca_movimenti (stato);

-- Distinte RiBa generate dal portale (file CBI da caricare nell'home banking)
CREATE TABLE riba_distinte (
  id             serial PRIMARY KEY,
  creata_il      timestamptz NOT NULL DEFAULT now(),
  creata_da      text,
  nome_supporto  text NOT NULL,
  quante         int NOT NULL,
  totale         numeric NOT NULL,
  file           text NOT NULL,
  annullata      boolean NOT NULL DEFAULT false
);
ALTER TABLE documenti_scadenze ADD COLUMN IF NOT EXISTS riba_distinta_id int REFERENCES riba_distinte(id) ON DELETE SET NULL;
