-- Controlli delle partite IVA europee sul VIES (Adriano 31/10/2026): ogni controllo resta come prova
-- (numero di consultazione del VIES), l'ultimo per paese + numero dice se la partita IVA è valida.
CREATE TABLE controlli_vies (
  id              serial PRIMARY KEY,
  paese           text NOT NULL,                 -- sigla del VIES (Grecia = EL)
  numero          text NOT NULL,                 -- partita IVA senza il prefisso del paese
  valida          boolean,                       -- null = il VIES non ha risposto (controllo da rifare)
  nome            text,                          -- ragione sociale come la dà il VIES (alcuni paesi non la danno)
  indirizzo       text,
  consultazione   text,                          -- numero di consultazione del VIES: la prova del controllo
  errore          text,
  controllato_il  timestamptz NOT NULL DEFAULT now(),
  controllato_da  int REFERENCES utenti(id) ON DELETE SET NULL
);
CREATE INDEX controlli_vies_partita_idx ON controlli_vies (paese, numero, controllato_il DESC);
COMMENT ON TABLE controlli_vies IS 'Controlli VIES delle partite IVA UE di clienti e fornitori (prova per le fatture non imponibili UE).';
