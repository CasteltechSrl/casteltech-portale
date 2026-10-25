-- ── Acquisizione di ordini e aggiornamenti (cartella Google Drive o caricamento dal portale) ──
-- Ogni file arrivato (PDF d'ordine, email, export di Fatture in Cloud) diventa una riga qui.
-- Gli ordini letti dall'IA restano "da confermare" finché l'ufficio non li conferma: solo allora nasce l'ordine.

CREATE TABLE acquisizioni (
  id            serial PRIMARY KEY,
  origine       text NOT NULL DEFAULT 'caricato' CHECK (origine IN ('drive', 'caricato')),
  drive_id      text UNIQUE,                    -- identificativo del file su Google Drive (per non leggerlo due volte)
  nome_file     text NOT NULL,
  tipo          text NOT NULL CHECK (tipo IN ('ordine', 'email', 'export_ordini', 'export_ddt', 'export_fatture', 'altro')),
  mime          text,
  contenuto     bytea,                          -- il file (PDF ed email sono piccoli): resta per rivederlo dall'ordine; si svuota se scartato
  stato         text NOT NULL DEFAULT 'nuovo' CHECK (stato IN ('nuovo', 'da_confermare', 'confermato', 'scartato', 'errore')),
  proposta      jsonb,                          -- cosa ha letto l'IA (cliente, rif. ordine, righe…), modificabile prima della conferma
  errore        text,
  ordine_id     int REFERENCES ordini(id) ON DELETE SET NULL,
  creato_il     timestamptz NOT NULL DEFAULT now(),
  elaborato_il  timestamptz,
  confermato_da int REFERENCES utenti(id)
);
CREATE INDEX ON acquisizioni (stato);
