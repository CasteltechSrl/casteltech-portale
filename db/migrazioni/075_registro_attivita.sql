-- Registro delle attività (Adriano: "chi ha cambiato cosa e quando", eliminazioni comprese; lista del 4/11/2026).
-- Una riga per ogni salvataggio riuscito, eliminazione, accesso e accesso non riuscito. Mai i valori dei moduli.
CREATE TABLE IF NOT EXISTS registro_attivita (
  id bigserial PRIMARY KEY,
  il timestamptz NOT NULL DEFAULT now(),
  utente_id integer REFERENCES utenti(id) ON DELETE SET NULL,
  utente_nome text,                 -- nome (o email scritta, per gli accessi non riusciti) al momento dell'azione
  tipo text NOT NULL,               -- modifica | eliminazione | accesso | accesso_fallito
  sezione text,
  azione text,
  percorso text,
  oggetto text,                     -- id delle righe toccate
  link text,                        -- pagina della riga
  indirizzo text                    -- indirizzo IP (accessi)
);
CREATE INDEX IF NOT EXISTS registro_attivita_il ON registro_attivita (il DESC);
CREATE INDEX IF NOT EXISTS registro_attivita_utente ON registro_attivita (utente_id, il DESC);
